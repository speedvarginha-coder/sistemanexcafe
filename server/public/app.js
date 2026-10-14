const $ = selector => document.querySelector(selector);
const html = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
// Textos antigos gravados sem acento (servidor e agente) e IDs internos de maquina: exibe corrigido.
const PT_FIX = [["Impressao", "Impressão"], ["impressao", "impressão"], ["Maquina", "Máquina"], ["maquina", "máquina"], ["pag", "pág"], ["Sessao", "Sessão"], ["sessao", "sessão"], ["Restauracao", "Restauração"], ["restauracao", "restauração"], ["Padrao", "Padrão"], ["padrao", "padrão"], ["Liberacao", "Liberação"], ["vinculacao", "vinculação"], ["Vinculacao", "Vinculação"], ["confirmacao", "confirmação"], ["apos", "após"], ["Nao", "Não"], ["nao", "não"], ["Estacao", "Estação"], ["estacao", "estação"], ["Reinicio", "Reinício"], ["manutencao", "manutenção"], ["Manutencao", "Manutenção"], ["atencao", "atenção"], ["Conexao", "Conexão"], ["conexao", "conexão"], ["Protecao", "Proteção"], ["protecao", "proteção"], ["servico", "serviço"], ["Servico", "Serviço"], ["historico", "histórico"], ["usuario", "usuário"], ["Usuario", "Usuário"]].map(([from, to]) => [new RegExp(String.raw`(?<!\p{L})${from}(?!\p{L})`, "gu"), to]);
function pt(value) {
  let text = String(value ?? "");
  for (const m of (typeof state !== "undefined" && state.machines) || []) {
    if (m.id && m.name && m.id !== m.name && text.includes(m.id)) text = text.replace(new RegExp(String.raw`(?<![\w-])${m.id.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}(?![\w-])`, "g"), m.name);
  }
  for (const [re, to] of PT_FIX) text = text.replace(re, to);
  return text;
}
const txt = value => html(pt(value));
const machineLabel = id => (state.machines || []).find(m => m.id === id)?.name || id;
const currency = cents => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
const dateTime = iso => iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
const timeOnly = iso => iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "-";
const options = ["cash", "pix", "debit", "credit"];
const methodName = { cash: "Dinheiro", pix: "Pix", card: "Cartão", debit: "Cartão Débito", credit: "Cartão Crédito" };

let state = null;
let currentView = "machines";
let modalSubmit = null;
let loading = false;
let report = null;
let pollDelay = 3000;
let pollTimer = null;
let lastPrintJobId = null;
let serverOffset = 0;
let warnedSessions = new Set();

// Estado dos Filtros Enterprise
let stationFilter = "all";
let stationSearchTerm = "";
let viewMode = localStorage.getItem("lhm_view_mode") || "grid";
let audioEnabled = localStorage.getItem("lhm_audio") !== "false";

// Sintetizador de Áudio Nativo Corporativo (Web Audio API)
function playChime(type = "success") {
  if (!audioEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (type === "success") {
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.12);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.36);
    } else if (type === "alert") {
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.46);
    }
  } catch {}
}

async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result.error || `Erro HTTP ${response.status}`);
  return result;
}

// Um "Receber" da máquina gera um pagamento por pendência, todos com o mesmo receiptId.
// Pagamentos antigos (sem receiptId): mesmo meio, operador e caixa em até 5 s formam um recebimento só.
const samePaymentGroup = (a, b) => (a.receiptId || b.receiptId)
  ? a.receiptId === b.receiptId
  : a.method === b.method && a.operator === b.operator && a.shiftId === b.shiftId && Math.abs(Date.parse(a.at) - Date.parse(b.at)) <= 5000;

function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 3500);
}

function showAuth(setup = false, pendingLocalSetup = false) {
  $("#workspace").hidden = true; $("#authScreen").hidden = false;
  $("#authSubtitle").textContent = setup ? "Crie o administrador mestre neste computador" : pendingLocalSetup ? "Abra este painel no computador servidor para criar o administrador" : "Acesso Seguro à Central Operacional";
  $("#authSubmit").textContent = setup ? "Criar Administrador" : "Entrar no Sistema";
  $("#authForm").dataset.setup = setup ? "true" : "false";
  $("#authError").hidden = true;
  if (setup) $("#authForm").elements.name.value = "admin";
}

function showWorkspace(user) {
  $("#authScreen").hidden = true; $("#workspace").hidden = false;
  $("#operatorName").textContent = user.name;
  for (const el of document.querySelectorAll('[data-view="settings"],[data-view="users"]')) el.hidden = user.role !== "admin";
  $("#addMachineButton").hidden = user.role !== "admin";
  $("#downloadInstallerButton").hidden = user.role !== "admin";
  $("#addProductButton").hidden = user.role !== "admin";
}

async function init() {
  try {
    const boot = await api("/api/bootstrap");
    if (!boot.initialized) { showAuth(boot.canSetup, !boot.canSetup); return; }
    const me = await api("/api/me");
    showWorkspace(me.user);
    updateSoundButton();
    await loadState();
  } catch { showAuth(false); }
}

$("#authForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.name.value.trim();
  const password = form.elements.password.value;
  try {
    if (form.dataset.setup === "true") await api("/api/setup", { name, password });
    const result = await api("/api/login", { name, password });
    form.elements.password.value = "";
    showWorkspace(result.user);
    await loadState();
  } catch (cause) { $("#authError").textContent = cause.message; $("#authError").hidden = false; }
});

$("#logoutButton").addEventListener("click", async () => {
  try { await api("/api/logout", {}); }
  finally { state = null; showAuth(false); }
});

function updateSoundButton() {
  const btn = $("#soundToggleBtn");
  if (!btn) return;
  btn.classList.toggle("muted", !audioEnabled);
  btn.title = audioEnabled ? "Alertas Sonoros: Ativados (Clique para silenciar)" : "Alertas Sonoros: Silencioso (Clique para ativar)";
  btn.innerHTML = audioEnabled 
    ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="soundIcon"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`
    : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="soundIcon"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
}

$("#soundToggleBtn")?.addEventListener("click", () => {
  audioEnabled = !audioEnabled;
  localStorage.setItem("lhm_audio", String(audioEnabled));
  updateSoundButton();
  if (audioEnabled) playChime("success");
  toast(audioEnabled ? "Alertas sonoros ativados." : "Alertas sonoros silenciados.");
});

let lastClientEndId = null;
async function loadState() {
  if (loading) return;
  loading = true;
  try {
    state = await api("/api/state");
    pollDelay = 3000;
    serverOffset = Date.parse(state.serverTime) - Date.now();
    const latestPrint = state.printJobs && state.printJobs[0];
    if (latestPrint && latestPrint.id !== lastPrintJobId) {
      lastPrintJobId = latestPrint.id;
      if (latestPrint.state === "pending") {
        playChime("alert");
        toast(`Nova impressão: ${latestPrint.pages} pág ${latestPrint.color ? "colorida" : "P&B"} — aguardando cliente`);
      } else if (latestPrint.state === "confirmed") {
        toast(`Enviada à impressora: ${latestPrint.pages} pág ${latestPrint.color ? "colorida" : "P&B"}`);
      }
    }
    
    const lastClientEnd = (state.events || []).find(e => e.title === "Cliente encerrou o acesso");
    if (lastClientEnd && lastClientEnd.id !== lastClientEndId) {
      if (lastClientEndId !== null && Date.now() - Date.parse(lastClientEnd.at) < 5 * 60000) {
        const machine = state.machines.find(m => m.id === lastClientEnd.machineId);
        playChime("alert");
        toast(`${machine ? machine.name : "Estação"}: cliente encerrou o acesso. ${lastClientEnd.detail}`);
      }
      lastClientEndId = lastClientEnd.id;
    }
    $("#serverStatus").textContent = `Conectado · ${dateTime(state.serverTime)}`;
    
    const shiftBadge = $("#shiftBadge");
    if (shiftBadge) {
      shiftBadge.classList.toggle("open", !!state.cashShift);
      shiftBadge.title = state.cashShift ? "Caixa aberto · Clique para ver extrato" : "Caixa fechado · Clique para abrir o turno";
      shiftBadge.querySelector("span").textContent = state.cashShift ? `Caixa Aberto · ${currency(state.cashSummary?.expectedCashCents || 0)}` : "Caixa Fechado";
      shiftBadge.title = state.cashShift ? (currentView === "cash" ? "Clique para fechar o caixa" : "Clique para ir ao caixa") : "Clique para abrir o caixa";
    }

    const pendingPrints = (state.printJobs || []).filter(j => j.state === "pending" || j.state === "printing");
    const printPill = $("#printAlertPill");
    if (printPill) {
      printPill.hidden = !pendingPrints.length;
      if (pendingPrints.length) {
        $("#printAlertText").textContent = `${pendingPrints.length} impressão(ões) no caixa`;
      }
    }

    render();
    if (!printRouteLoaded) loadPrintRoute();
  } catch (cause) {
    pollDelay = Math.min(30000, pollDelay * 2);
    $("#serverStatus").textContent = /fetch|network|Failed/i.test(cause.message) ? "Sem conexão com o servidor. Tentando de novo..." : cause.message;
    if (/Entre com|expirada/.test(cause.message)) showAuth(false);
  } finally { loading = false; schedulePoll(); }
}

function schedulePoll() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(loadState, pollDelay);
}

function metric(value, label, tone = "") {
  return `<div class="metric ${tone}"><strong>${html(value)}</strong><span>${html(label)}</span></div>`;
}

function empty(message) {
  return `<div class="empty">${html(message)}</div>`;
}

function table(columns, rows, message = "Nenhum registro.") {
  if (!rows.length) return empty(message);
  return `<table class="dataTable"><thead><tr>${columns.map(column => `<th>${html(column)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

function sessionClock(machine, now = Date.now() + serverOffset) {
  const session = machine.session;
  if (!session) return clock(0);
  return session.open ? clock(Math.max(0, now - Date.parse(session.startedAt))) : clock(Math.max(0, Date.parse(session.endsAt) - now));
}

function tickClocks() {
  if (!state || !state.machines) return;
  const now = Date.now() + serverOffset;
  for (const machine of state.machines) {
    if (!machine.session) continue;
    const clockEl = document.querySelector(`.machineClock[data-id="${machine.id}"]`);
    const barEl = document.querySelector(`.progressBarFill[data-progress-id="${machine.id}"]`);
    if (clockEl) {
      clockEl.textContent = sessionClock(machine, now);
      if (!machine.session.open) {
        const remaining = Date.parse(machine.session.endsAt) - now;
        const isWarn = remaining > 0 && remaining <= 10 * 60000;
        const isExpired = remaining <= 0;
        clockEl.classList.toggle("warn", isWarn);
        clockEl.classList.toggle("expired", isExpired);
        if (barEl) {
          const totalMs = Math.max(1, (machine.session.plannedMinutes || 1) * 60000);
          const percent = Math.min(100, Math.max(0, (remaining / totalMs) * 100));
          barEl.style.width = `${percent}%`;
          barEl.classList.toggle("warn", isWarn);
          barEl.classList.toggle("expired", isExpired);
        }
        if (isExpired && !warnedSessions.has(machine.session.id)) {
          warnedSessions.add(machine.session.id);
          playChime("alert");
          toast(`Tempo esgotado: ${machine.name}!`);
        }
      }
    }
  }
}

function formatCredit(seconds) {
  seconds = Math.max(0, seconds || 0);
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2,"0")}min` : `${m}min`;
}

// Guarda o ultimo estado de cada maquina para destacar o cartao quando ele muda (cliente encerrou, tempo acabou).
const machineToneSeen = {}, machineToneChanged = {};
function machineCard(machine, compact = false) {
  const session = machine.session;
  const restoring = machine.restoreSeq > (machine.appliedRestoreSeq || 0);
  const active = !!session;
  const available = !active && !restoring && machine.status !== "offline" && machine.status !== "maintenance";
  const mode = session?.open ? "Tempo livre" : { prepaid: "Pago antes", postpaid: "Pagar ao sair", credit: "Saldo do cliente" }[session?.billingMode] || "";
  const phase = machine.status === "offline" ? (active ? "Uso sem conexão" : machine.rejectedAt && Date.now() - Date.parse(machine.rejectedAt) < 60000 ? "Vínculo antigo" : "Desligada") : machine.maintenance ? "Manutenção" : restoring ? "Preparando" : active && machine.locked ? "Pausada" : active && machine.openedSessionId !== session.id ? "Liberando" : active ? "Em uso" : "Disponível";
  const tone = machine.status === "offline" ? "offline" : machine.maintenance || restoring ? "maintenance" : active ? "in_use" : "free";
  const customerName = html(session?.customer || state.clients.find(c => c.id === session?.clientId)?.name || "Cliente Avulso");
  const info = active ? `${customerName} · ${mode}` : "";
  const idleTitle = machine.status === "offline" ? "Desligada" : machine.maintenance ? "Em manutenção" : restoring ? "Restaurando ambiente" : "Pronta para atendimento";
  const rejectedRecently = machine.rejectedAt && Date.now() - Date.parse(machine.rejectedAt) < 60000;
  const idleDetail = machine.status === "offline" ? (rejectedRecently ? "PC ativo com credencial antiga: use Vincular." : machine.mac ? `WOL disponível (${machine.mac}).` : "Aguardando agente cliente.") : machine.maintenance ? "Sessões suspensas pelo operador." : restoring ? "Executando script de limpeza..." : "1 clique nos botões rápidos para liberar.";

  const monitorIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;

  let progressPercent = 100;
  let warnProgress = "";
  if (active) {
    if (session.open) {
      progressPercent = 100;
    } else {
      const totalMs = Math.max(1, (session.plannedMinutes || 1) * 60000);
      const remainingMs = Math.max(0, Date.parse(session.endsAt) - (Date.now() + serverOffset));
      progressPercent = Math.min(100, Math.max(0, (remainingMs / totalMs) * 100));
      if (remainingMs <= 0) warnProgress = "expired";
      else if (remainingMs <= 10 * 60000) warnProgress = "warn";
    }
  }

  // Telemetria Técnica Enterprise
  const telemetryInfo = machine.ip ? `${machine.ip} · ${machine.windowsUser || "PC"}` : machine.id;

  // Contas desta maquina ainda nao pagas (ultimas 12 h): aparecem no cartao para cobrar na hora.
  const dueCharges = active ? [] : (state.openCharges || []).filter(c => c.machineId === machine.id && Date.now() - Date.parse(c.at) < 12 * 3600000);
  const dueCents = dueCharges.reduce((sum, c) => sum + c.amountCents - c.paidCents, 0);
  const dueHtml = dueCents ? `<div class="machineDue"><div><span>A receber</span><strong>${currency(dueCents)}</strong><small>${txt(dueCharges.map(c => chargeLabel(c).replace(/^Uso [^:]+: /, "tempo ")).join(" + "))}</small></div><button type="button" class="primary" data-action="receiveMachine" data-id="${html(machine.id)}">Receber</button></div>` : "";
  let actionHtml = "";
  if (active) {
    actionHtml = `
      <div class="machineActions">
        <button class="primary btnEndSession" data-action="end" data-id="${html(machine.id)}" title="Finalizar tempo e receber">Encerrar &amp; Receber</button>
        ${session.open ? "" : `<button data-action="addTime" data-id="${html(machine.id)}" title="Adicionar mais minutos">+ Tempo</button>`}
        <button data-action="consume" data-id="${html(machine.id)}" title="Lançar produto ou serviço na conta">+ Consumo</button>
      </div>`;
  } else if (machine.status === "offline") {
    actionHtml = machine.mac
      ? `<div class="machineActions"><button class="secondaryBtn" data-action="power" data-id="${html(machine.id)}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg><span>Ligar</span></button></div>`
      : `<span class="machineSetupNote">Aguardando instalação</span>`;
  } else {
    actionHtml = `
      <div class="quickReleaseBlock">
        <div class="quickReleaseChips">
          <button type="button" data-action="quickStart" data-minutes="15" data-id="${html(machine.id)}" title="Liberar 15 min agora (1 clique)">15m</button>
          <button type="button" data-action="quickStart" data-minutes="30" data-id="${html(machine.id)}" title="Liberar 30 min agora (1 clique)">30m</button>
          <button type="button" data-action="quickStart" data-minutes="60" data-id="${html(machine.id)}" title="Liberar 1 hora agora (1 clique)">1h</button>
          <button type="button" data-action="quickStart" data-mode="open" data-id="${html(machine.id)}" title="Liberar tempo livre agora (1 clique)">Livre</button>
        </div>
        <button type="button" class="detailedReleaseBtn secondaryBtn" data-action="start" data-id="${html(machine.id)}" ${available ? "" : "disabled"}>Mais opções</button>
      </div>`;
  }

  const lastTone = machineToneSeen[machine.id];
  if (lastTone && lastTone !== tone) machineToneChanged[machine.id] = Date.now();
  machineToneSeen[machine.id] = tone;
  const justChanged = Date.now() - (machineToneChanged[machine.id] || 0) < 1500;
  // Máquina esquecida aberta: sessão ativa e ninguém mexe no mouse/teclado há mais que o limite (Metas e taxas; 0 desliga).
  const idleLimitMin = state.settings?.idleAlertMinutes ?? 15;
  const idleFresh = machine.idleAt && Date.now() + serverOffset - Date.parse(machine.idleAt) < 90000;
  const idleAlert = active && !machine.locked && machine.status !== "offline" && idleLimitMin > 0 && idleFresh && machine.idleSeconds >= idleLimitMin * 60;
  const idleAlertHtml = idleAlert ? `<div class="machineIdleAlert" title="Ninguém mexe no mouse ou teclado desta máquina">Sem uso há ${Math.floor(machine.idleSeconds / 60)} min · o cliente ainda está aí?</div>` : "";
  return `
    <article class="machine ${tone}${compact ? " compact" : ""}${justChanged ? " stateChanged" : ""}${idleAlert ? " idleAlert" : ""}" data-machine="${html(machine.id)}">
      <div class="machineTop">
        <div class="machineHeaderInfo">
          <h3>${html(machine.name)}</h3>
          <span class="telemetryBadge">${html(telemetryInfo)}</span>
        </div>
        <span class="status ${tone}">${phase}</span>
      </div>

      ${compact ? "" : active ? `
        <div class="machineMiddle">
          <div class="machineClock ${warnProgress}" data-id="${html(machine.id)}">${sessionClock(machine)}</div>
          <div class="machineValue${session.billingMode === "credit" ? " fromCredit" : ""}" title="${session.billingMode === "credit" ? "Valor já usado do saldo do cliente (não é cobrado no caixa)" : "Valor da sessão até agora"}">${session.billingMode === "credit" ? `<small>do saldo</small> ` : ""}${currency(machine.valueCents || 0)}</div>
        </div>
        <div class="progressBarTrack">
          <div class="progressBarFill ${warnProgress}" data-progress-id="${html(machine.id)}" style="width: ${progressPercent}%"></div>
        </div>
        <div class="machineInfo" title="${info}">${info}</div>
      ` : `
        <div class="machineIdle">
          <span class="machineIdleIcon">${monitorIcon}</span>
          <div class="machineIdleDetails">
            <strong>${idleTitle}</strong>
            <span>${idleDetail}</span>
          </div>
        </div>
      `}

      ${idleAlertHtml}
      ${dueHtml}
      ${actionHtml}

      <details class="machineMore">
        <summary>Comandos</summary>
        <div class="machineMoreActions">
          ${active ? `
            <button data-action="${machine.locked ? "unlock" : "lock"}" data-id="${html(machine.id)}">${machine.locked ? "Retomar" : "Pausar"}</button>
            <button data-action="summary" data-id="${html(machine.id)}">Resumo</button>
            <button data-action="move" data-id="${html(machine.id)}">Mover</button>
            <button data-action="restart" data-id="${html(machine.id)}">Reiniciar</button>
            ${machine.session.billingMode !== "credit" ? `<button data-action="setClient" data-id="${html(machine.id)}">Cliente</button>` : ""}
          ` : ""}
          <button data-action="monitor" data-id="${html(machine.id)}" ${machine.status === "offline" ? "disabled" : ""}>Monitorar</button>
          ${active ? "" : `
            <button data-action="reboot" data-id="${html(machine.id)}" ${machine.status === "offline" ? 'disabled title="Sem conexão: reinicie no próprio PC"' : ""}>Reiniciar</button>
          `}
          <button data-action="shutdown" data-id="${html(machine.id)}" ${machine.status === "offline" ? "disabled" : ""}>Desligar</button>
          <button data-action="maintenance" data-id="${html(machine.id)}" ${active ? "disabled" : ""}>${machine.maintenance ? "Fim Manut." : "Manutenção"}</button>
          ${state.user.role === "admin" ? `
            <button data-action="rename" data-id="${html(machine.id)}">Renomear</button>
            <button data-action="pair" data-id="${html(machine.id)}">Vincular</button>
            <button data-action="remove" data-id="${html(machine.id)}" class="danger">Remover</button>
          ` : ""}
        </div>
      </details>
    </article>`;
}

function summaryHtml(machine) {
  const s = machine.summary;
  if (!s) return '<p class="muted">Sem sessão ativa nesta estação.</p>';
  const rows = [];
  rows.push(`<div class="summaryRow"><span>Cliente</span><strong>${html(s.customer)}</strong></div>`);
  rows.push(s.open ? `<div class="summaryRow"><span>Modalidade</span><strong>Tempo livre</strong></div>` : `<div class="summaryRow"><span>Contratado</span><strong>${s.plannedMinutes} min</strong></div>`);
  rows.push(`<div class="summaryRow"><span>Tempo usado</span><strong>${s.usedMinutes} min</strong></div>`);
  rows.push(`<div class="summaryRow"><span>${s.billingMode === "credit" ? "Consumido do saldo" : "Valor do tempo"}</span><strong>${currency(s.timeCents)}</strong></div>`);
  if (s.billingMode === "credit") {
    const client = state.clients.find(c => c.id === machine.session?.clientId);
    if (client) rows.push(`<div class="summaryRow"><span>Saldo que fica para o cliente</span><strong>${formatCredit(Math.max(0, (client.creditSeconds || 0) - (s.usedMinutes || 0) * 60))}</strong></div>`);
  }
  const bw = (s.prints || []).filter(p => !p.color);
  const color = (s.prints || []).filter(p => p.color);
  const bwPages = bw.reduce((sum, p) => sum + p.pages, 0), colorPages = color.reduce((sum, p) => sum + p.pages, 0);
  const bwCents = bw.reduce((sum, p) => sum + p.amountCents, 0), colorCents = color.reduce((sum, p) => sum + p.amountCents, 0);
  if (bwPages) rows.push(`<div class="summaryRow"><span>Impressões P&B (${bwPages} pág)</span><strong>${currency(bwCents)}</strong></div>`);
  if (colorPages) rows.push(`<div class="summaryRow"><span>Impressões coloridas (${colorPages} pág)</span><strong>${currency(colorCents)}</strong></div>`);
  for (const extra of s.extras || []) rows.push(`<div class="summaryRow"><span>${html(extra.quantity)} × ${html(extra.name)}</span><strong>${currency(extra.amountCents)}</strong></div>`);
  if (!bwPages && !colorPages) rows.push(`<div class="summaryRow"><span>Impressões</span><strong>${currency(0)}</strong></div>`);
  rows.push(`<div class="summaryRow total"><span>Total da sessão</span><strong>${currency(s.totalCents)}</strong></div>`);
  return `<div class="summaryList">${rows.join("")}</div>`;
}

// Emissor de Comprovante de Atendimento (Recibo Térmico 80mm)
function showReceipt(data) {
  const paper = $("#receiptPaper");
  if (!paper) return;
  paper.innerHTML = receiptHtml(data);
  $("#receiptDialog").showModal();
}

function receiptHtml(data) {
  const nowStr = new Date(data.at || Date.now()).toLocaleString("pt-BR");
  let itemsHtml = "";
  if (data.items && data.items.length) {
    itemsHtml = data.items.map(it => `
      <div class="receiptRow">
        <span>${it.quantity ? `${html(it.quantity)}x ` : ""}${html(it.name)}</span>
        <span>${currency(it.totalCents)}</span>
      </div>
    `).join("");
  } else if (data.session) {
    const s = data.session;
    itemsHtml += `<div class="receiptRow"><span>Tempo (${s.usedMinutes || s.plannedMinutes || 0} min)</span><span>${currency(s.timeCents || 0)}</span></div>`;
    if (s.printCents) itemsHtml += `<div class="receiptRow"><span>Impressões</span><span>${currency(s.printCents)}</span></div>`;
    for (const ex of s.extras || []) itemsHtml += `<div class="receiptRow"><span>${ex.quantity}x ${html(ex.name)}</span><span>${currency(ex.amountCents)}</span></div>`;
  }

  const [company, ...companyLines] = (state.settings?.receiptHeader || "").split("\n").map(line => line.trim()).filter(Boolean);
  return `
    <div class="receiptHeader">
      <h3>${html(company || "NEXCAFÉ")}</h3>
      ${companyLines.map(line => `<p>${html(line)}</p>`).join("")}
      <p>Data: ${nowStr} · Operador: ${html(data.operator || state.user?.name || "admin")}</p>
    </div>
    <div class="receiptSection">
      ${data.machineName ? `<div class="receiptRow"><span>Terminal:</span><strong>${html(data.machineName)}</strong></div>` : ""}
      ${data.customer ? `<div class="receiptRow"><span>Cliente:</span><strong>${html(data.customer)}</strong></div>` : ""}
    </div>
    <div class="receiptDivider"></div>
    <div class="receiptSection">
      ${itemsHtml || '<div class="receiptRow"><span>Atendimento de Balcão</span><span>-</span></div>'}
    </div>
    ${data.discountCents ? `<div class="receiptRow"><span>Desconto</span><span>-${currency(data.discountCents)}</span></div>` : ""}
    <div class="receiptDivider"></div>
    <div class="receiptTotalRow">
      <span>TOTAL PAGO:</span>
      <span>${currency(data.totalCents || 0)}</span>
    </div>
    <div class="receiptRow" style="margin-top: 4px; font-size: 11px;">
      <span>Forma de Pagamento:</span>
      <span>${html(methodName[data.paymentMethod] || data.paymentMethod || "Dinheiro")}</span>
    </div>
    ${data.changeCents ? `
      <div class="receiptRow" style="font-size: 11px;">
        <span>Troco Devolvido:</span>
        <span>${currency(data.changeCents)}</span>
      </div>
    ` : ""}
    <div class="receiptFooter">
      <p>AUTENTICAÇÃO: ${Math.random().toString(36).slice(2, 10).toUpperCase()}-${Date.now().toString().slice(-4)}</p>
      <p>Documento sem valor fiscal</p>
      <p>Obrigado pela preferência · Volte sempre!</p>
    </div>
  `;
}

$("#receiptCloseBtn")?.addEventListener("click", () => $("#receiptDialog").close());
$("#receiptDoneBtn")?.addEventListener("click", () => $("#receiptDialog").close());
$("#receiptPrintBtn")?.addEventListener("click", () => printReceiptHtml($("#receiptPaper").innerHTML));

// Recibo de um recebimento já registrado (linha de "Recebimentos do turno"): vai direto para a impressão.
function printPaymentReceipt(paymentId) {
  const pay = state.payments.find(p => p.id === paymentId); if (!pay) return;
  const group = state.payments.filter(p => samePaymentGroup(pay, p));
  const charges = [...new Map(group.map(p => [p.chargeId, state.charges.find(c => c.id === p.chargeId)])).values()].filter(Boolean);
  const items = [
    ...charges.filter(c => c.items?.length).flatMap(c => c.items.map(it => ({ quantity: it.quantity, name: it.name, totalCents: it.totalCents }))),
    ...groupPrintLines(charges.filter(c => !c.items?.length), c => c.originalTotalCents || c.amountCents).map(line => ({ name: line.label, totalCents: line.cents }))
  ];
  const machineIds = [...new Set(charges.map(c => c.machineId).filter(Boolean))];
  const clientId = charges.find(c => c.clientId)?.clientId;
  printReceiptHtml(receiptHtml({
    at: pay.at, operator: pay.operator, items,
    machineName: machineIds.length === 1 ? state.machines.find(m => m.id === machineIds[0])?.name || machineIds[0] : "",
    customer: state.clients.find(c => c.id === clientId)?.name || "",
    discountCents: charges.reduce((sum, c) => sum + (c.discountCents || 0), 0),
    totalCents: group.reduce((sum, p) => sum + p.amountCents, 0),
    paymentMethod: [...new Set(group.map(p => p.method))].map(m => `${methodName[m] || m}${new Set(group.map(p => p.method)).size > 1 ? ` ${currency(group.filter(p => p.method === m).reduce((sum, p) => sum + p.amountCents, 0))}` : ""}`).join(" + ")
  }));
}

// Imprime o recibo num documento próprio: imprimir a página do painel cortava o recibo e gastava várias folhas.
function printReceiptHtml(body) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo</title><style>
    @page { size: 80mm auto; margin: 4mm; }
    body { margin: 0; width: 72mm; font: 12px/1.45 Arial, sans-serif; color: #000; }
    .receiptHeader { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
    .receiptHeader h3 { margin: 0; font-size: 15px; }
    .receiptHeader p { margin: 1px 0 0; font-size: 11px; }
    .receiptSection { margin: 6px 0; }
    .receiptRow { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
    .receiptDivider { border-top: 1px dashed #000; margin: 8px 0; }
    .receiptTotalRow { display: flex; justify-content: space-between; font-size: 14px; font-weight: 800; margin-top: 4px; }
    .receiptFooter { text-align: center; font-size: 10px; margin-top: 10px; border-top: 1px dashed #000; padding-top: 8px; }
    .receiptFooter p { margin: 1px 0; }
  </style></head><body>${body}</body></html>`);
  doc.close();
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(() => frame.remove(), 1000);
}

let monitorTimer = null, monitorId = null, monitorMeta = { width: 0, height: 0 }, monitorLastMove = 0, monitorUrl = null, monitorLastAt = 0;
function stopMonitor() {
  clearInterval(monitorTimer); monitorTimer = null;
  if (monitorId) api(`/api/machines/${encodeURIComponent(monitorId)}/monitor`, { stop: true }).catch(() => {});
  monitorId = null;
}
async function sendMonitorInput(event) {
  const id = monitorId;
  if (!id) return;
  try { await api(`/api/machines/${encodeURIComponent(id)}/input`, { event }); }
  catch (cause) { if (event.type !== "move") toast(`Comando remoto não enviado: ${cause.message}`); }
}

async function monitorLoop(id) {
  while (monitorId === id) {
    try {
      const response = await fetch(`/api/machines/${encodeURIComponent(id)}/screen.jpg?t=${Date.now()}`, { cache: "no-store" });
      if (monitorId !== id) return;
      if (response.status === 200) {
        const at = Number(response.headers.get("x-screen-at")) || Date.now();
        if (at !== monitorLastAt) {
          monitorLastAt = at;
          monitorMeta = { width: Number(response.headers.get("x-screen-width")), height: Number(response.headers.get("x-screen-height")) };
          const url = URL.createObjectURL(await response.blob());
          $("#monitorImage").src = url;
          $("#monitorImage").hidden = false;
          if (monitorUrl) URL.revokeObjectURL(monitorUrl);
          monitorUrl = url;
        }
        const age = Math.round((Date.now() - at) / 1000);
        const interval = Number(response.headers.get("x-screen-interval")) || 0;
        const speed = interval ? ` · ${(1000 / interval).toFixed(1).replace(".", ",")} quadros/s` : "";
        $("#monitorStatus").textContent = age <= 2 ? `ao vivo${speed}` : `última imagem há ${age}s`;
      } else if (response.status === 204) {
        $("#monitorStatus").textContent = "aguardando a estação enviar a tela...";
      } else {
        $("#monitorStatus").textContent = `erro ${response.status}`;
      }
    } catch (cause) { $("#monitorStatus").textContent = "sem conexão com o servidor"; }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

// Tela cheia: tenta no proprio Monitorar; se o navegador recusar, coloca a pagina inteira em tela cheia
// (o Monitorar ja ocupa a pagina toda, entao o resultado na tela e o mesmo).
function enterMonitorFullscreen() {
  const dialog = $("#monitorDialog");
  const fallback = () => document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => toast("O navegador bloqueou a tela cheia: aperte F11."));
  try {
    const request = dialog.requestFullscreen ? dialog.requestFullscreen({ navigationUI: "hide" }) : null;
    if (request) request.catch(fallback); else fallback();
  } catch { fallback(); }
}
async function openMonitor(machine) {
  monitorId = machine.id; monitorLastAt = 0;
  $("#monitorTitle").textContent = `Monitor · ${machine.name}`;
  $("#monitorStatus").textContent = "iniciando...";
  $("#monitorImage").removeAttribute("src");
  $("#monitorImage").hidden = true; // so aparece quando chegar o primeiro quadro
  $("#monitorDialog").showModal();
  // Tela cheia (esconde abas e barras do navegador); precisa acontecer no mesmo clique que abriu o Monitorar.
  enterMonitorFullscreen();
  const renew = () => api(`/api/machines/${encodeURIComponent(machine.id)}/monitor`, {}).catch(cause => { $("#monitorStatus").textContent = cause.message; });
  await renew();
  clearInterval(monitorTimer);
  monitorTimer = setInterval(() => { if (monitorId === machine.id) renew(); }, 30000);
  monitorLoop(machine.id);
}

function monitorCoords(event) {
  const img = $("#monitorImage");
  if (!img.naturalWidth || !monitorMeta.width) return null;
  const rect = img.getBoundingClientRect();
  const elementAspect = rect.width / rect.height;
  const imageAspect = img.naturalWidth / img.naturalHeight;
  let contentW, contentH, offsetX = 0, offsetY = 0;
  if (imageAspect > elementAspect) { contentW = rect.width; contentH = rect.width / imageAspect; offsetY = (rect.height - contentH) / 2; }
  else { contentH = rect.height; contentW = rect.height * imageAspect; offsetX = (rect.width - contentW) / 2; }
  const relX = (event.clientX - rect.left - offsetX) / contentW;
  const relY = (event.clientY - rect.top - offsetY) / contentH;
  if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;
  return { x: Math.round(relX * monitorMeta.width), y: Math.round(relY * monitorMeta.height) };
}

// Filtros e Alternância de Visualização
document.querySelectorAll(".fleetFilterBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".fleetFilterBtn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    stationFilter = btn.dataset.filter;
    renderMachines();
  });
});

$("#stationSearch")?.addEventListener("input", event => {
  stationSearchTerm = event.currentTarget.value.trim().toLocaleLowerCase("pt-BR");
  renderMachines();
});

$("#viewModeGrid")?.addEventListener("click", () => {
  viewMode = "grid";
  localStorage.setItem("lhm_view_mode", "grid");
  $("#viewModeGrid").classList.add("active");
  $("#viewModeTable").classList.remove("active");
  renderMachines();
});

$("#viewModeTable")?.addEventListener("click", () => {
  viewMode = "table";
  localStorage.setItem("lhm_view_mode", "table");
  $("#viewModeTable").classList.add("active");
  $("#viewModeGrid").classList.remove("active");
  renderMachines();
});

function renderMachines() {
  const counts = { free: 0, in_use: 0, offline: 0, preparing: 0 };
  for (const item of state.machines) {
    if (item.session) counts.in_use++;
    if (item.status === "offline") counts.offline++;
    else if (item.session) continue;
    else if (item.maintenance || item.restoreSeq > (item.appliedRestoreSeq || 0)) counts.preparing++;
    else counts.free++;
  }

  // Atualizar crachás dos filtros
  const fAll = $("#fCountAll"); if (fAll) fAll.textContent = state.machines.length;
  const fAct = $("#fCountActive"); if (fAct) fAct.textContent = counts.in_use;
  const fFre = $("#fCountFree"); if (fFre) fFre.textContent = counts.free;
  const fOff = $("#fCountOffline"); if (fOff) fOff.textContent = counts.offline;

  const totalOnline = counts.free + counts.in_use + counts.preparing;
  const occupancyPercent = totalOnline > 0 ? Math.round((counts.in_use / totalOnline) * 100) : 0;
  const shiftVal = state.cashShift ? currency(state.cashSummary?.expectedCashCents || 0) : "Fechado";
  const shiftSub = state.cashShift ? "Dinheiro esperado no caixa" : "Caixa fechado";
  const waitCount = (state.waitList || []).length;
  const printCount = (state.printJobs || []).filter(j => j.state === "pending" || j.state === "printing").length;

  $("#machineMetrics").innerHTML = 
    metric(counts.free, "Máquinas livres", "free") + 
    metric(counts.in_use, `Em uso (${occupancyPercent}% da loja)`, "in_use") + 
    metric(shiftVal, shiftSub, state.cashShift ? "free" : "offline") + 
    metric(waitCount, `Na espera · ${printCount} impressão(ões) no caixa`, (waitCount > 0 || printCount > 0) ? "warn" : "offline");

  const allOffline = state.machines.length > 0 && counts.offline === state.machines.length;
  $("#fleetNotice").hidden = !allOffline;
  if (allOffline) $("#fleetNotice").innerHTML = `<strong>Nenhuma máquina conectada.</strong> <span>As ${counts.offline} máquinas cadastradas estão sem contato com o servidor. Confira se estão ligadas e na rede.</span>`;
  
  $("#powerAllButton").disabled = !state.machines.some(machine => machine.status === "offline" && machine.mac);
  $("#shutdownAllButton").disabled = !state.machines.some(machine => machine.status !== "offline");

  const expanded = [...document.querySelectorAll(".machineMore[open]")].map(item => item.closest("[data-machine]")?.dataset.machine);
  
  // Ordenar e filtrar estações
  let sortedMachines = state.machines.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));

  if (stationSearchTerm) {
    sortedMachines = sortedMachines.filter(m => 
      m.name.toLocaleLowerCase("pt-BR").includes(stationSearchTerm) ||
      m.id.toLocaleLowerCase("pt-BR").includes(stationSearchTerm) ||
      (m.ip && m.ip.includes(stationSearchTerm)) ||
      (m.session && (m.session.customer || "").toLocaleLowerCase("pt-BR").includes(stationSearchTerm))
    );
  }

  if (stationFilter === "active") sortedMachines = sortedMachines.filter(m => m.session);
  else if (stationFilter === "free") sortedMachines = sortedMachines.filter(m => !m.session && m.status !== "offline" && !m.maintenance && m.restoreSeq <= (m.appliedRestoreSeq || 0));
  else if (stationFilter === "offline") sortedMachines = sortedMachines.filter(m => m.status === "offline" && !m.session);

  const onlineMachines = sortedMachines.filter(machine => machine.status !== "offline" || machine.session);
  const offlineMachines = sortedMachines.filter(machine => machine.status === "offline" && !machine.session);

  const gridEl = $("#machines");
  const tableEl = $("#machinesTableWrap");

  if (viewMode === "table") {
    gridEl.hidden = true;
    tableEl.hidden = false;
    tableEl.innerHTML = renderMachinesTable(sortedMachines);
    $("#offlineSection").hidden = true;
  } else {
    gridEl.hidden = false;
    tableEl.hidden = true;
    if (stationFilter === "offline") {
      gridEl.innerHTML = !sortedMachines.length ? empty("Nenhuma estação desligada.") : sortedMachines.map(machine => machineCard(machine, true)).join("");
      $("#offlineSection").hidden = true;
    } else {
      gridEl.innerHTML = !sortedMachines.length ? empty("Nenhuma máquina encontrada com esses filtros.") : onlineMachines.length ? onlineMachines.map(machine => machineCard(machine)).join("") : empty("Nenhuma máquina conectada no momento.");
      $("#offlineSection").hidden = !offlineMachines.length || stationFilter === "active" || stationFilter === "free";
      $("#offlineCount").textContent = offlineMachines.length;
      $("#offlineMachines").innerHTML = offlineMachines.map(machine => machineCard(machine, true)).join("");
    }
  }

  for (const id of expanded) {
    const card = [...document.querySelectorAll("#machines [data-machine]")].find(item => item.dataset.machine === id);
    if (card) {
      const more = card.querySelector(".machineMore");
      if (more) more.open = true;
    }
  }

  const inUse = state.machines.filter(item => item.session).slice().sort((a, b) => a.remainingMs - b.remainingMs);
  $("#etaSection").hidden = inUse.length === 0;
  $("#etaList").innerHTML = table(["Máquina", "Cliente", "Termina em", "Total"], inUse.map(m => `<tr><td>${html(m.name)}</td><td>${html(m.summary ? m.summary.customer : "-")}</td><td>${m.session.open ? `livre · ${sessionClock(m)} usado` : clock(m.remainingMs)}</td><td class="money">${currency(m.valueCents || 0)}</td></tr>`), "Nenhuma máquina em uso.");

  const wait = state.waitList || [];
  $("#waitList").innerHTML = table(["Cliente", "Aguardando desde", "Ação"], wait.map(w => `<tr><td>${html(w.name)}</td><td>${dateTime(w.at)}</td><td class="actionsCell"><button class="primary" data-action="waitServe" data-id="${html(w.id)}" ${counts.free ? "" : "disabled"}>Atender</button><button data-action="waitRemove" data-id="${html(w.id)}">Remover</button></td></tr>`), "Ninguém na lista de espera.");

  $("#printQueue").innerHTML = table(["Máquina", "Impressão", "Situação", "Valor", ""], (state.printJobs || []).slice().sort((a, b) => ((state.openCharges || []).some(c => c.printJobId === b.id) - (state.openCharges || []).some(c => c.printJobId === a.id))).slice(0, 8).map(job => {
    const charge = (state.openCharges || []).find(row => row.printJobId === job.id);
    const label = { pending: "Aguardando cliente", printing: "Imprimindo no caixa", failed: "Falhou", confirmed: "Enviada à impressora", cancelled: "Cancelada" }[job.state] || job.state;
    return `<tr><td>${html(machineLabel(job.machineId))}</td><td>${job.pages} pág · ${job.color ? "Colorida" : "P&B"}</td><td>${label}</td><td class="money">${currency(job.amountCents)}</td><td>${charge ? `<button class="primary" data-action="pay" data-id="${html(charge.id)}" ${state.cashShift ? "" : "disabled"}>Receber</button>` : "-"}</td></tr>`;
  }), "Nenhuma impressão recente.");

  $("#events").innerHTML = state.events.length ? state.events.slice(0, 20).map(item => `<div class="activity"><time>${dateTime(item.at)}</time><span class="source">${html(machineLabel(item.machineId))}</span><span><strong>${txt(item.title)}</strong>${item.detail ? ` · ${txt(item.detail)}` : ""}</span></div>`).join("") : empty("Nenhuma atividade recente.");
}

// Renderizador da Matriz de Frota em Tabela Executiva
function renderMachinesTable(machines) {
  if (!machines.length) return empty("Nenhuma estação encontrada com os filtros selecionados.");
  const rows = machines.map(m => {
    const s = m.session;
    const isAct = !!s;
    const isOff = m.status === "offline" && !isAct;
    const statusLabel = isOff ? "Desligada" : m.maintenance ? "Manutenção" : isAct ? "Em Atendimento" : "Disponível";
    const statusTone = isOff ? "offline" : m.maintenance ? "maintenance" : isAct ? "in_use" : "free";
    const timerText = isAct ? sessionClock(m) : "-";
    const valText = isAct ? currency(m.valueCents || 0) : "-";
    const clientText = isAct ? (s.customer || "Avulso") : "-";

    const actions = isAct
      ? `<button class="primary" data-action="end" data-id="${html(m.id)}">Encerrar</button><button data-action="addTime" data-id="${html(m.id)}">+Tempo</button><button data-action="consume" data-id="${html(m.id)}">+Consumo</button>`
      : isOff
      ? (m.mac ? `<button data-action="power" data-id="${html(m.id)}">Ligar</button>` : `<span class="muted">Sem WOL</span>`)
      : `<button class="primary" data-action="quickStart" data-minutes="30" data-id="${html(m.id)}">30m</button><button class="primary" data-action="quickStart" data-minutes="60" data-id="${html(m.id)}">1h</button><button class="secondaryBtn" data-action="start" data-id="${html(m.id)}">Opções...</button>`;

    return `
      <tr>
        <td><strong>${html(m.name)}</strong><br><small class="muted">${html(m.ip || m.id)}</small></td>
        <td><span class="status ${statusTone}">${statusLabel}</span></td>
        <td>${html(clientText)}</td>
        <td class="money">${timerText}</td>
        <td class="money">${valText}</td>
        <td class="actionsCell">${actions}</td>
      </tr>
    `;
  }).join("");

  return `
    <table class="stationMatrixTable">
      <thead>
        <tr>
          <th>Terminal</th>
          <th>Estado</th>
          <th>Cliente</th>
          <th>Cronômetro</th>
          <th>Valor</th>
          <th>Ações Rápidas</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// Consumo/venda antigos diziam so "2 item(ns)": mostra os itens para conferir.
function chargeLabel(c) {
  if (!c?.items?.length || !/item\(ns\)$/.test(c.description || "")) return c?.description || "";
  return c.description.replace(/\d+ item\(ns\)$/, c.items.map(it => `${it.quantity}x ${it.name}`).join(", "));
}

// Junta as impressões de uma conta numa linha por tipo (P&B / colorida), em vez de uma linha por trabalho.
function groupPrintLines(charges, centsOf) {
  const lines = [], prints = {};
  for (const c of charges) {
    if (c.kind !== "print") { lines.push({ label: chargeLabel(c), cents: centsOf(c) }); continue; }
    const type = c.color ? "coloridas" : "P&B";
    if (!prints[type]) lines.push(prints[type] = { type, pages: 0, cents: 0 });
    prints[type].pages += c.quantity || Number(/(\d+) pag/.exec(c.description || "")?.[1]) || 0;
    prints[type].cents += centsOf(c);
  }
  for (const line of lines) if (line.type) line.label = `Impressões ${line.type}: ${line.pages} pág`;
  return lines;
}

function renderCash() {
  const due = state.openCharges || [];
  const shift = state.cashShift;
  const summary = state.cashSummary || {};
  $("#cashMetrics").innerHTML = metric(shift ? "Aberto" : "Fechado", "Situação do caixa") + metric(currency(summary.expectedCashCents), "Dinheiro na gaveta") + metric(currency(summary.receivedCents), "Recebido no turno") + metric(currency(summary.pendingCents), "A receber");
  $("#shiftDetail").textContent = shift ? `Turno iniciado por ${shift.openedBy} em ${dateTime(shift.openedAt)}` : "Abra o caixa para habilitar vendas e recebimentos";
  $("#cashToggleButton").textContent = shift ? "Fechar caixa" : "Abrir caixa";
  $("#cashToggleButton").disabled = !!shift && state.user.role !== "admin";
  $("#cashAdjustButton").disabled = !shift; $("#printSaleButton").disabled = !shift;
  $("#dueList").innerHTML = table(["Data", "Descrição", "Máquina", "Valor", "Pago", "Ação"], due.map(item => `<tr><td>${dateTime(item.at)}</td><td>${txt(chargeLabel(item))}</td><td>${html(state.machines.find(m => m.id === item.machineId)?.name || item.machineId || "-")}</td><td class="money">${currency(item.amountCents)}</td><td class="money">${currency(item.paidCents)}</td><td class="actionsCell"><button class="primary" data-action="pay" data-id="${item.id}" ${!shift ? "disabled" : ""}>Receber</button>${state.user.role === "admin" ? `<button data-action="cancelCharge" data-id="${item.id}">Cancelar</button>` : ""}</td></tr>`), "Sem pendências.");
  const canEditPay = item => state.user.role === "admin" || (shift && item.shiftId === shift.id);
  const payGroups = [];
  for (const pay of state.payments) {
    const last = payGroups[payGroups.length - 1];
    if (last && samePaymentGroup(last[0], pay)) last.push(pay); else payGroups.push([pay]);
  }
  $("#paymentList").innerHTML = table(["Data", "Descrição", "Valor", "Meio", "Operador", ""], payGroups.slice(0, 40).map(group => {
    const item = group[0];
    const charges = group.map(p => state.charges.find(c => c.id === p.chargeId));
    const labels = charges.map(c => chargeLabel(c) || "Pagamento");
    const machineIds = [...new Set(charges.map(c => c?.machineId).filter(Boolean))];
    const machineName = machineIds.length === 1 ? state.machines.find(m => m.id === machineIds[0])?.name || machineIds[0] : "";
    const description = group.length === 1 ? html(labels[0]) : `<span title="${html(labels.join("\n"))}">Recebimento${machineName ? ` ${html(machineName)}` : ""} · ${group.length} itens</span>`;
    const edited = group.some(p => p.methodHistory?.length);
    const methods = [...new Set(group.map(p => p.method))].map(m => methodName[m] || m).join(" + ");
    return `<tr><td>${dateTime(item.at)}</td><td>${description}</td><td class="money">${currency(group.reduce((sum, p) => sum + p.amountCents, 0))}</td><td>${methods}${edited ? ' <small class="muted" title="Forma de pagamento alterada">(alterado)</small>' : ""}</td><td>${html(item.operator)}</td><td class="actionsCell"><button type="button" class="primary" data-action="printPayReceipt" data-id="${html(item.id)}" title="Imprimir recibo deste recebimento">Recibo</button>${canEditPay(item) ? `<button type="button" data-action="changePayMethod" data-id="${html(item.id)}">Alterar</button>` : ""}</td></tr>`;
  }), "Nenhum recebimento registrado.");
  $("#shiftList").innerHTML = table(["Abertura", "Fechamento", "Operador", "Esperado", "Contado", "Diferença", ""], state.cashShifts.filter(item => item.closedAt).map(item => { const diff = item.closingCountedCents - item.closingExpectedCents; return `<tr><td>${dateTime(item.openedAt)}</td><td>${dateTime(item.closedAt)}</td><td>${html(item.closedBy)}</td><td class="money">${currency(item.closingExpectedCents)}</td><td class="money">${currency(item.closingCountedCents)}</td><td class="money ${diff < 0 ? "bad" : ""}">${diff ? currency(diff) : "-"}</td><td class="actionsCell"><button type="button" data-shift-summary="${html(item.id)}">Resumo</button></td></tr>`; }), "Nenhum caixa fechado.");

  renderPOS();
}

// ==========================================
// PDV UNIFICADO ENTERPRISE (SPEED CRM / POS)
// ==========================================
let posCart = new Map();
let posCategory = "top";
let posSearchTerm = "";
let posCustomer = { id: null, name: "Consumidor Final" };
let posDestination = "counter";
let posActiveMethod = "cash";
let posWantReceipt = false, lastReceiptData = null; // recibo so quando pedir (Ctrl+Enter ou botao)
let posAuditTab = "due";

const CROSS_SELL_RULES = [
  {
    test: (items) => items.some(it => /detran|crlv|ipva|multa|veícul|cnh/i.test(it.name)),
    title: "Oportunidade: Proteção & Débitos Veiculares",
    desc: "Ofereça parcelamento de IPVA/multas no cartão em até 12x ou cotação de seguro/rastreador veicular."
  },
  {
    test: (items) => items.some(it => /inss|cnis|aposent|benefício|extrato inss/i.test(it.name)),
    title: "Oportunidade: Crédito Consignado & Cartão Benefício",
    desc: "Cliente aposentado/pensionista? Ofereça desbloqueio de empréstimo ou portabilidade com saque em dinheiro."
  },
  {
    test: (items) => items.some(it => /mei|das mei|abertura de mei|empresa/i.test(it.name)),
    title: "Oportunidade: Gestão Empresarial & Regularização PJ",
    desc: "Lembre o empreendedor da Declaração Anual (DASN) e emissão de Certidão Negativa de Débitos."
  },
  {
    test: (items) => items.some(it => /curr[ií]culo/i.test(it.name)),
    title: "Kit Entrevista Profissional Completo",
    desc: "Sugira adicionar cópias extras coloridas, envelope pardo A4 e fotos 3x4 profissionais."
  },
  {
    test: (items) => items.some(it => /impress[aã]o|xerox|c[oó]pia/i.test(it.name)) && !items.some(it => /plastifica|encaderna/i.test(it.name)),
    title: "Acabamento & Durabilidade de Documentos",
    desc: "Ofereça plastificação rígida ou encadernação em espiral para proteger certidões e contratos."
  },
  {
    test: (items) => items.some(it => it.type === "machine_time" && (it.minutes >= 60 || it.open)),
    title: "Combo Conveniência Lan House",
    desc: "Cliente com sessão longa: ofereça água mineral, refrigerante gelado ou snacks bomboniere."
  }
];

const OFFICIAL_CATEGORIES = {
  "Gráfica Rápida": { name: "Gráfica Rápida", color: "#0284c7", badgeClass: "badgeCatGrafica", short: "Gráfica" },
  "Serviços Públicos": { name: "Serviços Públicos", color: "#059669", badgeClass: "badgeCatPublicos", short: "Públicos" },
  "Lan House & Serviços Digitais": { name: "Lan House & Serviços Digitais", color: "#d4a000", badgeClass: "badgeCatLan", short: "Lan/Digital" },
  "Informática & Celular": { name: "Informática & Celular", color: "#2563eb", badgeClass: "badgeCatInfo", short: "Info/Cel" },
  "Eletrônicos & Acessórios": { name: "Eletrônicos & Acessórios", color: "#ea580c", badgeClass: "badgeCatEletro", short: "Eletrônicos" },
  "Bomboniere & Bebidas": { name: "Bomboniere & Bebidas", color: "#e11d48", badgeClass: "badgeCatFood", short: "Bomboniere" },
  "Serviços Financeiros": { name: "Serviços Financeiros", color: "#0b8a45", badgeClass: "badgeCatFinance", short: "Financeiro" }
};

function getCategoryInfo(category) {
  if (category && OFFICIAL_CATEGORIES[category]) return OFFICIAL_CATEGORIES[category];
  if (/impress|gráfica|xerox|cópia|plastific|encadern/i.test(category)) return OFFICIAL_CATEGORIES["Gráfica Rápida"];
  if (/públic|detran|inss|gov|receita|cpf|mei|certid/i.test(category)) return OFFICIAL_CATEGORIES["Serviços Públicos"];
  if (/lan|curric|curríc|tempo|máquina|sessão|digita/i.test(category)) return OFFICIAL_CATEGORIES["Lan House & Serviços Digitais"];
  if (/informática|celular|manuten|backup|formata/i.test(category)) return OFFICIAL_CATEGORIES["Informática & Celular"];
  if (/acessór|cabo|carreg|eletr/i.test(category)) return OFFICIAL_CATEGORIES["Eletrônicos & Acessórios"];
  if (/bebida|bombon|doce|água|snack|refrig/i.test(category)) return OFFICIAL_CATEGORIES["Bomboniere & Bebidas"];
  if (/financ|spc|serasa|boleto|gps/i.test(category)) return OFFICIAL_CATEGORIES["Serviços Financeiros"];
  return { name: category || "Serviço Avulso", color: "#0284c7", badgeClass: "badgeCatGrafica", short: category || "Avulso" };
}

const QUICK_SHORTCUTS = {
  xerox_pb: { name: "Xerox (#342)", category: "Gráfica Rápida", priceCents: 50, code: "342" },
  print_pb: { name: "Impressão P/B (#1.1)", category: "Gráfica Rápida", priceCents: 100, code: "1.1" },
  print_bw_eco: { name: "Impressão P/B (#190)", category: "Gráfica Rápida", priceCents: 50, code: "190" },
  print_color: { name: "Impressão Colorida (#2-B)", category: "Gráfica Rápida", priceCents: 200, code: "2-B" },
  acesso_net: { name: "Acesso a Internet (#3)", category: "Lan House & Serviços Digitais", priceCents: 0, code: "3" },
  recebimento: { name: "Recebimento Whats (#20)", category: "Lan House & Serviços Digitais", priceCents: 100, code: "20" },
  envelope: { name: "Envelope Pardo (#152)", category: "Gráfica Rápida", priceCents: 200, code: "152" },
  scanner: { name: "Scanner (#286)", category: "Gráfica Rápida", priceCents: 150, code: "286" }
};

let posDiscountRaw = "";
let posSplitMode = false;
let posSplitPayments = [];

function getPOSTotals() {
  let subtotalCents = 0;
  let totalQty = 0;
  for (const [_, entry] of posCart) {
    subtotalCents += entry.priceCents * entry.quantity;
    totalQty += entry.quantity;
  }
  let discountCents = 0;
  if (posDiscountRaw) {
    if (posDiscountRaw.endsWith("%")) {
      const pct = parseFloat(posDiscountRaw.replace("%", "").trim()) || 0;
      discountCents = Math.round(subtotalCents * (Math.min(100, Math.max(0, pct)) / 100));
    } else {
      const val = parseFloat(posDiscountRaw.replace(",", ".").trim()) || 0;
      discountCents = Math.round(Math.min(subtotalCents, Math.max(0, val * 100)));
    }
  }
  const totalCents = Math.max(0, subtotalCents - discountCents);
  return { subtotalCents, discountCents, totalCents, totalQty };
}

function getCategoryItems(cat, term) {
  let list = [];
  const cleanTerm = (term || "").trim().toLocaleLowerCase("pt-BR");

  if (cat === "top") {
    const topKeywords = [
      "xerox", "impressão p/b", "impressão colorida", "scanner", "foto 3x4", 
      "plastificação", "encadernação", "currículo", "detran crlv", "meu inss", 
      "coca-cola", "água sem gás", "paçoquinha", "fone de ouvido"
    ];
    list = state.products.filter(p => p.active && topKeywords.some(kw => p.name.toLocaleLowerCase("pt-BR").includes(kw)));
    if (list.length < 8) list = state.products.filter(p => p.active).slice(0, 16);
  } else if (cat === "all") {
    list = state.products.filter(p => p.active);
  } else if (cat === "machines") {
    list = [
      { id: "time_15", type: "machine_time", name: "Tempo 15 Minutos", minutes: 15, priceCents: 300, icon: "", tag: "15 min" },
      { id: "time_30", type: "machine_time", name: "Tempo 30 Minutos", minutes: 30, priceCents: 370, icon: "", tag: "30 min" },
      { id: "time_60", type: "machine_time", name: "Tempo 1 Hora (60 min)", minutes: 60, priceCents: 500, icon: "", tag: "60 min" },
      { id: "time_120", type: "machine_time", name: "Tempo 2 Horas (120 min)", minutes: 120, priceCents: 1000, icon: "", tag: "120 min" },
      { id: "time_open", type: "machine_time", name: "Tempo Livre (Paga ao Sair)", open: true, priceCents: 300, icon: "⏱️", tag: "Livre" }
    ];
  } else {
    list = state.products.filter(p => p.active && (p.category === cat || getCategoryInfo(p.category).name === cat));
  }

  if (cleanTerm) {
    list = state.products.filter(p => 
      p.active && (
        p.name.toLocaleLowerCase("pt-BR").includes(cleanTerm) ||
        (p.code && p.code.toLocaleLowerCase("pt-BR").includes(cleanTerm)) ||
        (p.category && p.category.toLocaleLowerCase("pt-BR").includes(cleanTerm))
      )
    );
  }

  return list;
}

function renderPosMachineDue() {
  const el = $("#posMachineDue"); if (!el) return;
  const byMachine = {};
  for (const c of state.openCharges || []) if (c.machineId && state.machines.some(m => m.id === c.machineId && !m.session) && Date.now() - Date.parse(c.at) < 12 * 3600000) (byMachine[c.machineId] ||= 0), byMachine[c.machineId] += c.amountCents - c.paidCents;
  const rows = Object.entries(byMachine).filter(([, v]) => v > 0);
  el.hidden = !rows.length;
  el.innerHTML = rows.length ? `<span>Máquinas a receber:</span>${rows.map(([id, v]) => `<button type="button" data-action="receiveMachine" data-id="${html(id)}"><b>${html(state.machines.find(m => m.id === id)?.name || id)}</b> ${currency(v)} · Receber</button>`).join("")}` : "";
}
// Venda atual sempre cabe na janela (a lista rola por dentro): total e Receber nunca ficam escondidos.
function fitPosTicket() {
  const card = document.querySelector(".posTicketCard");
  if (!card || currentView !== "cash" || innerWidth <= 900) { if (card) card.style.maxHeight = ""; return; }
  card.style.maxHeight = `${Math.max(360, innerHeight - Math.max(76, card.getBoundingClientRect().top) - 12)}px`;
}
addEventListener("scroll", fitPosTicket, { passive: true });
addEventListener("resize", fitPosTicket);

function renderPOS() {
  requestAnimationFrame(fitPosTicket);
  renderPosMachineDue();
  if (!document.querySelector("[data-fav-product]")) loadPosFavorites(); // F5 direto no caixa: atalhos so depois do estado carregar
  const shift = state.cashShift;
  const summary = state.cashSummary || {};
  const settings = state.settings || {};

  // 1. Barra de KPIs Executivos
  const shiftBadge = $("#posShiftBadge");
  const shiftSub = $("#posShiftSubText");
  if (shiftBadge) {
    shiftBadge.className = `posStatusPill ${shift ? "open" : "closed"}`;
    shiftBadge.textContent = shift ? "CAIXA ABERTO" : "CAIXA FECHADO";
  }
  if (shiftSub) {
    shiftSub.textContent = shift 
      ? `Turno iniciado por ${shift.openedBy || "admin"} · ${timeOnly(shift.openedAt)}`
      : "Turno fechado · Abra o caixa para operar";
  }

  const cashSalesVal = $("#posCashSalesVal");
  if (cashSalesVal) cashSalesVal.textContent = currency(summary.expectedCashCents || 0);

  const cashFundSub = $("#posCashFundSub");
  if (cashFundSub) {
    const openingCents = shift?.openingCents || 10000;
    cashFundSub.textContent = `Troco inicial: ${currency(openingCents)}`;
  }

  const sessionRevenueVal = $("#posSessionRevenueVal");
  if (sessionRevenueVal) sessionRevenueVal.textContent = currency(summary.receivedCents || 0);

  const sessionSalesCount = $("#posSessionSalesCount");
  if (sessionSalesCount) {
    const payCount = (state.payments || []).filter(p => state.cashShift && p.shiftId === state.cashShift.id).length;
    sessionSalesCount.textContent = `${payCount} ${payCount === 1 ? "recebimento" : "recebimentos"}`;
  }

  // Faturamento do dia (tudo recebido hoje, em qualquer turno) contra a meta diaria
  const goalCents = summary.dailyGoalCents || settings.dailyGoalCents || 50000;
  const receivedCents = summary.todaySalesCents || 0;
  const goalPct = Math.min(100, Math.round((receivedCents / goalCents) * 100));

  const goalBadge = $("#posGoalPercentBadge");
  if (goalBadge) goalBadge.textContent = `${goalPct}%`;

  const goalTarget = $("#posGoalTargetVal");
  if (goalTarget) goalTarget.textContent = currency(receivedCents);

  const goalBar = $("#posGoalProgressBar");
  if (goalBar) goalBar.style.width = `${goalPct}%`;

  const goalRem = $("#posGoalRemainingText");
  if (goalRem) {
    if (receivedCents >= goalCents) {
      goalRem.innerHTML = `<strong style="color: #22c55e;">Meta diária superada! (+${currency(receivedCents - goalCents)})</strong>`;
    } else {
      goalRem.textContent = `Meta ${currency(goalCents)} · faltam ${currency(goalCents - receivedCents)}`;
    }
  }

  // 2. Overlay de caixa fechado
  const closedOverlay = $("#posClosedShiftOverlay");
  if (closedOverlay) closedOverlay.hidden = !!shift;

  // 3. Abas de categoria
  document.querySelectorAll(".posTabBtn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.cat === posCategory);
  });

  // 4. Seletor de terminal para tempo de máquina
  const machineBar = $("#posMachineBar");
  const machineSelect = $("#posMachineSelect");
  const freeMachines = state.machines.filter(m => !m.session && m.status !== "offline" && !m.maintenance && m.restoreSeq <= (m.appliedRestoreSeq || 0));
  
  if (machineBar && machineSelect) {
    machineBar.hidden = posCategory !== "machines";
    const currentVal = machineSelect.value;
    machineSelect.innerHTML = `<option value="">Selecione a estação livre...</option>${freeMachines.map(m => `<option value="${html(m.id)}">${html(m.name)} (Disponível)</option>`).join("")}`;
    if (freeMachines.some(m => m.id === currentVal)) machineSelect.value = currentVal;
    else if (freeMachines.length === 1) machineSelect.value = freeMachines[0].id;
  }

  // 5. Destino de consumo (Balcão ou Estação Ativa)
  // Campanha e origem da venda (marketing): lista atualizada a cada ciclo sem perder a escolha.
  const campSelect = $("#posCampaign");
  if (campSelect) {
    const cur = campSelect.value, list = state.campaigns || [];
    const sig = list.map(c => c.code).join("|");
    if (campSelect.dataset.sig !== sig) { campSelect.innerHTML = `<option value="">Nenhuma</option>${list.map(c => `<option value="${html(c.code)}">${html(c.code)} · ${html(c.name)}</option>`).join("")}`; campSelect.dataset.sig = sig; campSelect.value = list.some(c => c.code === cur) ? cur : ""; }
    campSelect.closest(".posMarketingRow").hidden = !list.length; // sem campanha ativa a linha some
  }
  const destSelect = $("#posDestinationSelect");
  if (destSelect) {
    const curDest = posDestination;
    const activeSessions = state.machines.filter(m => m.session);
    destSelect.innerHTML = `<option value="counter">Balcão (cobrar agora)</option>${activeSessions.map(m => `<option value="${html(m.id)}">Lançar na ${html(m.name)} · ${html(m.session.customer || "Em uso")}</option>`).join("")}`;
    if (activeSessions.some(m => m.id === curDest)) destSelect.value = curDest;
    else destSelect.value = "counter";
    posDestination = destSelect.value;
  }

  // 6. Grade de itens
  const grid = $("#posGrid");
  if (grid) {
    const items = getCategoryItems(posCategory, posSearchTerm);
    if (!items.length) {
      grid.innerHTML = `<div class="posEmptyGrid"><p>Nenhum item localizado com o filtro "<strong>${html(posSearchTerm || posCategory)}</strong>".</p></div>`;
    } else {
      grid.innerHTML = items.map(it => {
        if (it.type === "machine_time") {
          return `
            <div class="posItemCard posTimeCard" data-pos-add-time="${html(it.id)}">
              <div class="posItemHead">
                <span class="posItemIcon">${it.icon || "⏱️"}</span>
                <span class="posItemBadge timeBadge">${html(it.tag || "Tempo")}</span>
              </div>
              <strong class="posItemName">${html(it.name)}</strong>
              <div class="posItemFoot">
                <span class="posItemPrice">${currency(it.priceCents)}</span>
                <button type="button" class="posAddBtn" title="Adicionar ao ticket">+</button>
              </div>
            </div>`;
        }
        const inCartCount = (posCart.get(it.id)?.quantity) || 0;
        const isStock = it.type === "stock";
        const outOfStock = isStock && it.stock <= 0;
        const noMoreStock = false;
        const catInfo = getCategoryInfo(it.category);
        const stockLow = isStock && it.stock <= (it.minStock || 5);
        const badgeClass = isStock ? (stockLow ? "stockBadge low" : "stockBadge") : catInfo.badgeClass;
        const badgeText = isStock ? `${it.stock} un.` : catInfo.short;
        const codeDisplay = it.code ? `#${html(it.code)}` : "";

        return `
          <div class="posItemCard ${outOfStock ? "outOfStock" : ""}" data-pos-add-product="${html(it.id)}" ${noMoreStock ? 'data-max="1"' : ""}>
            <div class="posItemHead">
              <span class="posItemCode">${codeDisplay}</span>
              <span class="posItemBadge ${badgeClass}">${html(badgeText)}</span>
            </div>
            <strong class="posItemName" title="${html(it.name)}">${html(it.name)}</strong>
            <div class="posItemFoot">
              <span class="posItemPrice">${currency(it.priceCents)}</span>
              ${inCartCount ? `<span class="posInCartCount">${inCartCount} un</span>` : ""}
              <button type="button" class="posAddBtn" ${noMoreStock ? "disabled" : ""} title="Adicionar ao ticket">+</button>
            </div>
          </div>`;
      }).join("");
    }
  }

  // 7. Cupom da Venda (Carrinho)
  renderPOSTicket();

  // 8. Gaveta de auditoria inferior
  const dueCountBadge = $("#posDueCountBadge");
  if (dueCountBadge) dueCountBadge.textContent = (state.openCharges || []).length;
}

// Venda cruzada: serviço da loja que indica perfil para a Speed Financeira.
const FIN_HINT = /inss|benef[ií]cio|aposent|extrato de pagamento|consignad|empr[eé]stimo|fgts|detran|crlv|ipva|ve[ií]culo|spc|serasa|boa vista|limpa nome|contrato|holerite|contracheque|carteira de trabalho|ctps/i;
function finHintItem() { return [...posCart.values()].find(item => FIN_HINT.test(item.name || "")); }
function suggestedFinProduct(name) {
  if (/fgts|carteira de trabalho|ctps/i.test(name)) return "Antecipação FGTS";
  if (/detran|crlv|ipva|ve[ií]culo/i.test(name)) return "Financiamento de veículos";
  if (/holerite|contracheque/i.test(name)) return "Consignado CLT";
  return "Consignado INSS";
}
function renderPOSTicket() {
  const hint = finHintItem(); if ($("#posFinHint")) $("#posFinHint").hidden = !hint;
  const emptyCart = $("#posEmptyCart");
  const ticketTable = $("#posTicketTable");
  const rowsEl = $("#posTicketRows");
  const totalQtyEl = $("#posTotalQty");
  const subtotalValEl = $("#posSubtotalVal");
  const discountValEl = $("#posDiscountVal");
  const totalValEl = $("#posTotalVal");
  const crossBanner = $("#posCrossSellBanner");
  const submitBtn = $("#posSubmitTicketBtn");

  if (!posCart.size) {
    if (emptyCart) emptyCart.hidden = false;
    if (ticketTable) ticketTable.hidden = true;
    if (rowsEl) rowsEl.innerHTML = "";
    if (totalQtyEl) totalQtyEl.textContent = "0 volumes (0 itens)";
    if (subtotalValEl) subtotalValEl.textContent = currency(0);
    if (discountValEl) discountValEl.textContent = "- R$ 0,00";
    if (totalValEl) totalValEl.textContent = currency(0);
    if (crossBanner) crossBanner.hidden = true;
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  if (emptyCart) emptyCart.hidden = true;
  if (ticketTable) ticketTable.hidden = false;

  const totals = getPOSTotals();
  const rowsHtml = [];
  const cartItemList = [];
  let seq = 1;

  for (const [key, entry] of posCart) {
    const itemTotal = entry.priceCents * entry.quantity;
    cartItemList.push(entry);
    const catInfo = getCategoryInfo(entry.category);

    rowsHtml.push(`
      <tr data-cart-key="${html(key)}">
        <td class="cartSeq">${seq++}</td>
        <td>
          <div class="cartItemCell">
            <span class="cartItemName">${html(entry.name)}</span>
            <span class="cartItemBadge ${catInfo.badgeClass}">${html(catInfo.name)}</span>
          </div>
        </td>
        <td class="centerCol">
          <div class="posQtyCounter">
            <button type="button" class="posQtyBtn" data-cart-action="dec" data-key="${html(key)}">−</button>
            <input class="posQtyNum posQtyInput" type="number" min="0" max="9999" inputmode="numeric" value="${entry.quantity}" data-cart-qty="${html(key)}" aria-label="Quantidade de ${html(entry.name)}" title="Clique e digite a quantidade">
            <button type="button" class="posQtyBtn" data-cart-action="inc" data-key="${html(key)}" ${entry.maxStock && entry.quantity >= entry.maxStock ? "disabled" : ""}>+</button>
          </div>
        </td>
        <td class="money">${currency(entry.priceCents)}</td>
        <td class="money"><strong>${currency(itemTotal)}</strong></td>
        <td class="actionCol">
          <button type="button" class="posRemoveBtn" data-cart-action="del" data-key="${html(key)}" title="Remover item (Del)">×</button>
        </td>
      </tr>
    `);
  }

  if (rowsEl) rowsEl.innerHTML = rowsHtml.join("");
  if (totalQtyEl) totalQtyEl.textContent = `${totals.totalQty} volume(s) (${posCart.size} itens)`;
  if (subtotalValEl) subtotalValEl.textContent = currency(totals.subtotalCents);
  if (discountValEl) discountValEl.textContent = `- ${currency(totals.discountCents)}`;
  if (totalValEl) totalValEl.textContent = currency(totals.totalCents);
  if (submitBtn) submitBtn.disabled = !state.cashShift && posDestination === "counter";

  // Verificação de Oportunidades Comerciais (Cross-Sell)
  if (crossBanner) {
    const matchedRule = CROSS_SELL_RULES.find(rule => rule.test(cartItemList));
    if (matchedRule) {
      crossBanner.hidden = false;
      const titleEl = $("#posCrossSellTitle");
      const descEl = $("#posCrossSellDesc");
      if (titleEl) titleEl.textContent = matchedRule.title;
      if (descEl) descEl.textContent = matchedRule.desc;
    } else {
      crossBanner.hidden = true;
    }
  }
}

// Quantidade digitada antes do clique: "20" na busca + clique no item = 20 unidades (a busca limpa sozinha).
function takePendingQty() {
  const input = $("#posSearchInput");
  const match = String(input?.value || "").match(/^\s*(\d{1,4})\s*[*xX]?\s*$/);
  if (!match) return null;
  input.value = "";
  const box = $("#posSearchSuggestions"); if (box) box.hidden = true;
  return Math.max(1, Number(match[1]));
}
// Atalhos automaticos do caixa: os 10 mais vendidos (30 dias) e as vendas que mais se repetem (60 dias).
let posFavorites = null, posFavoritesAt = 0;
async function loadPosFavorites(force = false) {
  if (!force && posFavorites && Date.now() - posFavoritesAt < 600000) return renderPosFavorites();
  try { posFavorites = await api("/api/pos/favorites"); posFavoritesAt = Date.now(); renderPosFavorites(); } catch { }
}
function renderPosFavorites() {
  if (!posFavorites || !state?.products) return;
  const byId = new Map(state.products.filter(p => p.active).map(p => [p.id, p]));
  const short = name => name.replace(/^Impressão /, "Imp. ").replace(/ Balcão$/, " Balc.").replace(/^Recebimento de Arquivos$/, "Receb. arquivo");
  const baskets = (posFavorites.baskets || []).map(b => ({ ...b, items: b.items.filter(i => byId.has(i.productId)) })).filter(b => b.items.length);
  const box = $("#posFavBaskets");
  if (box) {
    box.hidden = !baskets.length;
    box.innerHTML = baskets.length ? `<span class="posFavTitle">Vendas frequentes</span>` + baskets.map((b, i) => {
      const total = b.items.reduce((s, it) => s + it.quantity * byId.get(it.productId).priceCents, 0);
      return `<button type="button" class="posFavBasket" data-fav-basket="${i}" title="Vendida ${b.count} vezes nos últimos 60 dias">${b.items.map(it => `${it.quantity}× ${html(short(byId.get(it.productId).name))}`).join(" + ")}<strong>${currency(total)}</strong></button>`;
    }).join("") : "";
    box._baskets = baskets;
  }
  // Botoes rapidos: troca os fixos pelos mais vendidos (mantem Acesso a internet e Lancar PDF).
  const grid = document.querySelector(".posQuickShortcuts");
  const top = (posFavorites.products || []).map(p => byId.get(p.productId)).filter(Boolean).filter(p => !/acesso a internet/i.test(p.name)).slice(0, 8);
  if (grid && top.length) {
    grid.querySelectorAll("[data-quick-action]:not([data-quick-action='acesso_net'])").forEach(b => { b.hidden = true; });
    grid.querySelectorAll("[data-fav-product]").forEach(b => b.remove());
    const anchor = grid.querySelector("[data-quick-action='acesso_net']");
    top.forEach(p => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "quickShortcutBtn"; btn.dataset.favProduct = p.id;
      btn.innerHTML = `<span class="quickName">${html(short(p.name))}${p.code ? ` (#${html(p.code)})` : ""}</span><span class="quickPrice">${currency(p.priceCents)}</span>`;
      grid.insertBefore(btn, anchor);
    });
  }
}
document.addEventListener("click", event => {
  const fav = event.target.closest("[data-fav-product]");
  if (fav) { addPosProduct(fav.dataset.favProduct); return; }
  const basketBtn = event.target.closest("[data-fav-basket]");
  if (!basketBtn) return;
  const basket = $("#posFavBaskets")?._baskets?.[Number(basketBtn.dataset.favBasket)]; if (!basket) return;
  for (const it of basket.items) addPosProduct(it.productId, it.quantity);
  $("#posSearchInput")?.focus();
});
// Pop-up de quantidade para servicos (impressao, xerox, scanner...): botoes prontos ou digitar + Enter.
function askPosQty(name, unitCents, onPick) {
  const presets = [1, 2, 3, 5, 10, 20, 50];
  openModal(`Quantidade · ${name}`,
    `<label class="qtyStepper"><span>Quantidade</span><div><button type="button" data-qty-step="-1" aria-label="Diminuir">−</button><input name="qty" type="number" value="1" min="1" max="9999" inputmode="numeric" required><button type="button" data-qty-step="1" aria-label="Aumentar">+</button></div></label>` +
    `<div class="qtyPresets">${presets.map(n => `<button type="button" data-qty-preset="${n}">${n}</button>`).join("")}</div>` +
    `<label class="qtyPrice"><span>Preço unitário (R$)</span><input name="price" type="text" inputmode="decimal" value="${(unitCents / 100).toFixed(2).replace(".", ",")}" title="Mude só se esta venda tiver outro preço"></label>` +
    `<p class="quoteBox qtyTotalLine" id="qtyTotal">${currency(unitCents)} cada · total <strong>${currency(unitCents)}</strong></p>`,
    values => { onPick(Math.max(1, Math.min(9999, parseInt(values.qty, 10) || 1)), priceOf()); setTimeout(() => $("#posSearchInput")?.focus(), 50); return Promise.resolve(); }, "Confirmar");
  $("#formDialog").classList.remove("wide");
  const form = $("#modalForm"), qty = form.elements.qty, price = form.elements.price;
  qty.select();
  // Preco desta venda (padrao: o do cadastro). Valor invalido volta para o do cadastro.
  const priceOf = () => { const v = Math.round(Number(String(price.value).replace(/\./g, "").replace(",", ".")) * 100); return v >= 1 ? v : unitCents; };
  const showTotal = () => { const n = Math.max(0, parseInt(qty.value, 10) || 0), u = priceOf(); setHtml("#qtyTotal", `${currency(u)} cada${u !== unitCents ? ` <small>(cadastro ${currency(unitCents)})</small>` : ""} · total <strong>${currency(u * n)}</strong>`); };
  qty.addEventListener("input", showTotal);
  price.addEventListener("input", showTotal);
  price.addEventListener("focus", () => price.select());
  form.querySelectorAll("[data-qty-step]").forEach(b => b.addEventListener("click", () => { qty.value = Math.max(1, (parseInt(qty.value, 10) || 0) + Number(b.dataset.qtyStep)); showTotal(); qty.focus(); qty.select(); }));
  form.querySelectorAll("[data-qty-preset]").forEach(b => b.addEventListener("click", () => { qty.value = b.dataset.qtyPreset; form.requestSubmit(); }));
}
function addPosProduct(id, quantity, priceCents) {
  const p = state.products.find(item => item.id === id);
  if (!p) return;
  const edited = Number.isInteger(priceCents) && priceCents !== p.priceCents;
  if (quantity === undefined) {
    const pending = takePendingQty();
    // Como no sistema anterior: escolher o item abre o pop-up de quantidade (Enter confirma 1).
    if (pending) quantity = pending;
    else return askPosQty(p.name, p.priceCents, (q, price) => addPosProduct(id, q, price));
  }
  const key = edited ? `${id}@${priceCents}` : id; // preco diferente vira outra linha no carrinho
  const current = posCart.get(key);
  const qtyToAdd = Math.max(1, parseInt(quantity, 10) || 1);
  if (current) {
    current.quantity += qtyToAdd;
  } else {
    posCart.set(key, {
      id: p.id,
      type: p.type,
      name: p.name,
      code: p.code,
      category: p.category,
      priceCents: edited ? priceCents : p.priceCents,
      priceEdited: edited,
      quantity: qtyToAdd,
      maxStock: null
    });
  }
  playChime("success");
  renderPOSTicket();
}

function addPosMachineTime(timeId) {
  const presets = {
    time_15: { name: "Tempo Máquina (15 min)", minutes: 15, priceCents: 300, tag: "15 min" },
    time_30: { name: "Tempo Máquina (30 min)", minutes: 30, priceCents: 370, tag: "30 min" },
    time_60: { name: "Tempo Máquina (1 hora)", minutes: 60, priceCents: 500, tag: "1 hora" },
    time_120: { name: "Tempo Máquina (2 horas)", minutes: 120, priceCents: 1000, tag: "2 horas" },
    time_open: { name: "Tempo Máquina (Livre)", open: true, priceCents: 300, tag: "Livre" }
  };
  const preset = presets[timeId];
  if (!preset) return;

  const current = posCart.get(timeId);
  if (current) {
    current.quantity++;
  } else {
    posCart.set(timeId, {
      id: timeId,
      type: "machine_time",
      name: preset.name,
      minutes: preset.minutes,
      open: preset.open,
      category: "Lan House & Serviços Digitais",
      tag: preset.tag,
      priceCents: preset.priceCents,
      quantity: 1
    });
  }
  playChime("success");
  renderPOSTicket();
}

function updatePOSPaymentMethodUI() {
  const isCash = posActiveMethod === "cash";
  const isPix = posActiveMethod === "pix";
  const isFiado = posActiveMethod === "fiado";
  const cashBox = $("#posCashCalcBox");
  const pixBox = $("#posPixInfoBox");
  const fiadoBox = $("#posFiadoInfoBox");
  const fiadoNotice = $("#posFiadoNotice");

  if (cashBox) cashBox.hidden = !isCash || posSplitMode;
  if (pixBox) pixBox.hidden = !isPix || posSplitMode;
  if (fiadoBox) {
    fiadoBox.hidden = !isFiado || posSplitMode;
    if (isFiado && fiadoNotice) {
      if (!posCustomer.id) {
        fiadoNotice.innerHTML = `<span style="color:#b91c1c; font-weight:800;">Atenção:</span> Para vender a prazo / fiado, selecione um cliente cadastrado no cupom (não é permitido para Consumidor Final). Clique em "Alterar" no cupom para vincular o cliente.`;
      } else {
        fiadoNotice.innerHTML = `<strong>Venda a Prazo / Fiado:</strong> O valor será registrado como pendência na conta do cliente <strong>${html(posCustomer.name)}</strong> no Contas a Receber.`;
      }
    }
  }

  const confirmBtn = $("#posPaymentConfirmBtn");
  if (confirmBtn) {
    if (isFiado && !posCustomer.id) {
      confirmBtn.disabled = true;
    } else if (posSplitMode) {
      const totals = getPOSTotals();
      const paid = posSplitPayments.reduce((s, p) => s + p.amountCents, 0);
      confirmBtn.disabled = paid < totals.totalCents || !posSplitPayments.length;
    } else {
      confirmBtn.disabled = false;
    }
  }

  if (isCash && !posSplitMode) {
    calcPOSChange();
    $("#posPaidGivenInput")?.focus();
  }
}

function calcPOSChange() {
  const givenInput = $("#posPaidGivenInput");
  const changeDisplay = $("#posChangeDisplay");
  if (!givenInput || !changeDisplay) return;

  const totals = getPOSTotals();
  const total = totals.totalCents / 100;
  const given = Number(givenInput.value) || 0;

  if (given < total && given > 0) {
    changeDisplay.innerHTML = cashShortHtml(Math.round((total - given) * 100));
  } else {
    const change = Math.max(0, given - total);
    changeDisplay.textContent = `Troco: ${currency(Math.round(change * 100))}`;
  }
}

// Pagou parte em dinheiro: mostra quanto falta e um clique fecha com o restante em outra forma.
function cashShortHtml(missingCents) {
  return `<span style="color: var(--danger-accent);">Faltam ${currency(missingCents)}</span>
    <span class="posRestButtons">Restante em: <button type="button" data-pay-rest="pix">PIX</button><button type="button" data-pay-rest="debit">Débito</button><button type="button" data-pay-rest="credit">Crédito</button></span>`;
}

$("#posChangeDisplay")?.addEventListener("click", event => {
  const button = event.target.closest("[data-pay-rest]");
  if (!button) return;
  const totalCents = getPOSTotals().totalCents;
  const cashCents = Math.round((Number($("#posPaidGivenInput")?.value) || 0) * 100);
  if (cashCents < 1 || cashCents >= totalCents) return;
  posSplitMode = true;
  posSplitPayments = [{ method: "cash", amountCents: cashCents }, { method: button.dataset.payRest, amountCents: totalCents - cashCents }];
  posWantReceipt = false;
  submitPOSSale();
});

function renderPOSSplitPayments() {
  const listEl = $("#posSplitList");
  const paidValEl = $("#posSplitPaidVal");
  const remValEl = $("#posSplitRemainingVal");
  const totals = getPOSTotals();

  let paidCents = 0;
  for (const p of posSplitPayments) paidCents += p.amountCents;
  const remCents = Math.max(0, totals.totalCents - paidCents);

  if (listEl) {
    if (!posSplitPayments.length) {
      listEl.innerHTML = `<small class="muted" style="text-align:center; padding:4px;">Nenhuma parcela adicionada ainda.</small>`;
    } else {
      const methodLabels = { cash: "Dinheiro", pix: "PIX", debit: "Débito", credit: "Crédito" };
      listEl.innerHTML = posSplitPayments.map((p, idx) => `
        <div class="posSplitItem">
          <span><strong>${methodLabels[p.method] || p.method}</strong>: ${currency(p.amountCents)}</span>
          <button type="button" data-del-split="${idx}" title="Remover parcela">×</button>
        </div>
      `).join("");
    }
  }

  if (paidValEl) paidValEl.textContent = currency(paidCents);
  if (remValEl) {
    remValEl.textContent = currency(remCents);
    remValEl.className = `posRemainingVal ${remCents === 0 ? "zero" : ""}`;
  }

  const confirmBtn = $("#posPaymentConfirmBtn");
  if (confirmBtn && posSplitMode) {
    confirmBtn.disabled = remCents > 0 || !posSplitPayments.length;
  }
}

function openPOSPaymentDialog() {
  const totals = getPOSTotals();

  const totalDisplay = $("#posPaymentTotalDisplay");
  if (totalDisplay) totalDisplay.textContent = currency(totals.totalCents);

  const destDisplay = $("#posPaymentDestDisplay");
  if (destDisplay) destDisplay.textContent = `Destino: Balcão · Cliente: ${posCustomer.name || "Consumidor Final"}`;

  const errEl = $("#posPaymentError");
  if (errEl) errEl.hidden = true;

  posActiveMethod = "cash";
  posSplitMode = false;
  posSplitPayments = [];
  const splitBox = $("#posSplitBox");
  if (splitBox) splitBox.hidden = true;
  const splitToggle = $("#posSplitToggleBtn");
  if (splitToggle) splitToggle.classList.remove("active");

  document.querySelectorAll(".posMethodBtn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.posMethod === "cash");
  });

  const givenInput = $("#posPaidGivenInput");
  if (givenInput) givenInput.value = "";
  updatePOSPaymentMethodUI();

  $("#posPaymentDialog").showModal();
}

function openCustomerSelectModal() {
  const clients = state.clients.filter(item => item.active).slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const fields = 
    field("customerName", "Nome do Cliente (Avulso / Rápido)", "text", posCustomer.id ? "" : (posCustomer.name !== "Consumidor Final" ? posCustomer.name : ""), 'placeholder="Ex.: Carlos Silva"') +
    field("custSearch", "Localizar cliente cadastrado", "search", "", 'placeholder="Digite o nome ou telefone..." autocomplete="off"') +
    select("clientSelectId", "Cliente Selecionado", [["", "Consumidor Final (sem cadastro)"], ...clients.map(c => [c.id, `${c.name} · ${c.phone || "sem tel"}`])], posCustomer.id || "");

  openModal("Identificar Cliente no PDV", fields, async values => {
    if (values.clientSelectId) {
      const c = clients.find(item => item.id === values.clientSelectId);
      posCustomer = { id: c.id, name: c.name };
    } else if (values.customerName && values.customerName.trim()) {
      posCustomer = { id: null, name: values.customerName.trim() };
    } else {
      posCustomer = { id: null, name: "Consumidor Final" };
    }
    const display = $("#posCustomerDisplay");
    if (display) display.textContent = posCustomer.name.toUpperCase();
    toast(`Cliente definido: ${posCustomer.name}`);
    updatePOSPaymentMethodUI();
  }, "Confirmar Cliente");

  const form = $("#modalForm");
  const searchInput = form?.elements.custSearch;
  const selectEl = form?.elements.clientSelectId;
  const nameInput = form?.elements.customerName;

  if (searchInput && selectEl) {
    searchInput.addEventListener("input", () => {
      const term = searchInput.value.trim().toLocaleLowerCase("pt-BR");
      const filtered = clients.filter(c => !term || `${c.name} ${c.phone || ""}`.toLocaleLowerCase("pt-BR").includes(term));
      selectEl.innerHTML = `<option value="">Consumidor Final (sem cadastro)</option>${filtered.map(c => `<option value="${html(c.id)}">${html(c.name)} · ${html(c.phone || "sem tel")}</option>`).join("")}`;
      if (filtered.length === 1 && term) {
        selectEl.value = filtered[0].id;
        if (nameInput) nameInput.value = "";
      }
    });
    selectEl.addEventListener("change", () => {
      if (selectEl.value && nameInput) nameInput.value = "";
    });
  }
}

async function submitPOSSale() {
  const confirmBtn = $("#posPaymentConfirmBtn");
  const errEl = $("#posPaymentError");
  if (errEl) errEl.hidden = true;

  const totals = getPOSTotals();
  const regularItems = [];
  const receiptItems = [];
  let machineTimeItem = null;

  for (const [_, entry] of posCart) {
    const sub = entry.priceCents * entry.quantity;
    receiptItems.push({ name: entry.name, quantity: entry.quantity, totalCents: sub });

    if (entry.type === "machine_time") {
      machineTimeItem = entry;
    } else if (entry.type === "custom") {
      regularItems.push({
        productId: null,
        name: entry.name,
        category: entry.category,
        quantity: entry.quantity,
        unitPriceCents: entry.priceCents
      });
    } else {
      regularItems.push({ productId: entry.id, quantity: entry.quantity, ...(entry.priceEdited ? { unitPriceCents: entry.priceCents } : {}) });
    }
  }

  // Validação de Fiado
  if (posActiveMethod === "fiado" && !posCustomer.id) {
    if (errEl) {
      errEl.textContent = "Selecione um cliente cadastrado para registrar venda a prazo / fiado.";
      errEl.hidden = false;
    } else toast("Selecione um cliente cadastrado para vender fiado.");
    return;
  }

  confirmBtn.disabled = true;

  try {
    // Pagamento dividido com tempo de máquina: o tempo sai de uma parcela que o cubra inteiro
    // (a liberação aceita uma forma só) e o restante das parcelas paga os outros itens.
    let salePayments = posSplitMode && posSplitPayments.length ? posSplitPayments.map(p => ({ ...p })) : null;
    let machineMethod = posActiveMethod;
    const machineCents = machineTimeItem ? machineTimeItem.priceCents * machineTimeItem.quantity : 0;
    if (salePayments && machineCents) {
      const cover = salePayments.find(p => p.amountCents >= machineCents);
      if (!cover) throw new Error(`No pagamento dividido, uma das parcelas precisa cobrir o tempo de máquina inteiro (${currency(machineCents)}).`);
      machineMethod = cover.method;
      cover.amountCents -= machineCents;
      salePayments = salePayments.filter(p => p.amountCents > 0);
    }

    // 1. Se tem tempo de máquina, libera estação
    if (machineTimeItem) {
      let targetId = $("#posMachineSelect")?.value;
      if (!targetId) {
        const free = state.machines.find(m => !m.session && m.status !== "offline" && !m.maintenance && m.restoreSeq <= (m.appliedRestoreSeq || 0));
        if (free) targetId = free.id;
        else throw new Error("Nenhum terminal livre para liberar o tempo contratado.");
      }
      const pMethod = ["pix", "debit", "credit"].includes(machineMethod) ? machineMethod : "cash";
      await api(`/api/machines/${encodeURIComponent(targetId)}/start`, {
        minutes: machineTimeItem.open ? undefined : machineTimeItem.minutes,
        billingMode: machineTimeItem.open ? "open" : "prepaid",
        paymentMethod: pMethod,
        customer: posCustomer.name !== "Consumidor Final" ? posCustomer.name : undefined,
        clientId: posCustomer.id || undefined
      });
    }

    // 2. Registra venda dos produtos/serviços
    if (regularItems.length) {
      const ref = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const payload = {
        items: regularItems,
        discountCents: totals.discountCents,
        ref,
        clientId: posCustomer.id || null,
        campaign: $("#posCampaign")?.value || undefined
      };

      if (salePayments) {
        payload.payments = salePayments;
      } else {
        payload.paymentMethod = posActiveMethod;
      }

      await api("/api/sales", payload);
    }

    // 3. Emite comprovante térmico
    const givenVal = Number($("#posPaidGivenInput")?.value) || 0;
    const changeCents = Math.round(Math.max(0, givenVal - (totals.totalCents / 100)) * 100);

    playChime("success");
    toast("Venda finalizada com sucesso!");
    $("#posPaymentDialog").close();

    lastReceiptData = {
      customer: posCustomer.name || "Consumidor Final",
      items: receiptItems,
      totalCents: totals.totalCents,
      paymentMethod: posSplitMode ? "Misto" : posActiveMethod,
      changeCents: (!posSplitMode && posActiveMethod === "cash") ? changeCents : 0
    };
    if ($("#posLastReceiptBtn")) $("#posLastReceiptBtn").hidden = false;
    if (posWantReceipt) showReceipt(lastReceiptData);
    else if (lastReceiptData.changeCents) toast(`Venda finalizada. Troco: ${currency(lastReceiptData.changeCents)}`);

    posCart.clear();
    posDiscountRaw = "";
    const discInput = $("#posDiscountInput");
    if (discInput) discInput.value = "";
    renderPOSTicket();
    await loadState();
    $("#posSearchInput")?.focus();
  } catch (cause) {
    if (errEl) {
      errEl.textContent = cause.message;
      errEl.hidden = false;
    } else {
      toast(cause.message);
    }
  } finally {
    confirmBtn.disabled = false;
  }
}

async function launchItemsToMachine(machineId) {
  const machine = state.machines.find(m => m.id === machineId);
  if (!machine || !machine.session) {
    toast("A estação selecionada não está mais em atendimento.");
    return;
  }
  const regularItems = [];

  for (const [_, entry] of posCart) {
    if (entry.type === "machine_time") {
      toast("Para adicionar tempo à sessão, utilize a ação '+Tempo' no card da estação.");
      return;
    }
    if (entry.type === "custom") {
      regularItems.push({
        productId: null,
        name: entry.name,
        category: entry.category,
        quantity: entry.quantity,
        unitPriceCents: entry.priceCents
      });
    } else {
      regularItems.push({ productId: entry.id, quantity: entry.quantity, ...(entry.priceEdited ? { unitPriceCents: entry.priceCents } : {}) });
    }
  }

  const submitBtn = $("#posSubmitTicketBtn");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const ref = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await api(`/api/machines/${encodeURIComponent(machineId)}/items`, {
      items: regularItems,
      ref
    });
    playChime("success");
    toast(`Consumo lançado na conta de ${machine.name}!`);
    posCart.clear();
    posDiscountRaw = "";
    const discInput = $("#posDiscountInput");
    if (discInput) discInput.value = "";
    renderPOSTicket();
    await loadState();
  } catch (err) {
    toast(err.message);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// Acesso a internet: o atendente digita o valor que apareceu na maquina do cliente.
function openInternetValueDialog() {
  openModal("Acesso à internet",
    `<p class="quoteBox">Digite o valor que apareceu na máquina do cliente. Se a estação está aberta no sistema, prefira <strong>Encerrar e receber</strong> no cartão dela, para não cobrar duas vezes.</p>` +
    field("amount", "Valor (R$)", "number", "", 'min="0.01" max="10000" step="0.01" required inputmode="decimal"') +
    field("station", "Estação (opcional)", "text", "", 'maxlength="20" placeholder="Ex.: 12"'),
    values => {
      const cents = Math.round(Number(String(values.amount).replace(",", ".")) * 100);
      if (!Number.isInteger(cents) || cents < 1) throw new Error("Informe o valor do acesso.");
      const station = String(values.station || "").trim();
      const key = `net_${Date.now()}`;
      posCart.set(key, { id: key, type: "custom", name: station ? `Acesso à internet · Máquina ${station}` : "Acesso à internet", code: "3", category: "Lan House & Serviços Digitais", priceCents: cents, quantity: 1, maxStock: null });
      renderPOSTicket();
      return Promise.resolve();
    }, "Adicionar à venda");
  setTimeout(() => $("#modalForm")?.elements.amount?.focus(), 50);
}

function openPosCustomItemDialog() {
  const dialog = $("#posCustomItemDialog");
  if (!dialog) return;
  const nameInput = $("#posCustomName");
  const priceInput = $("#posCustomPrice");
  const qtyInput = $("#posCustomQty");
  if (nameInput) nameInput.value = "";
  if (priceInput) priceInput.value = "";
  if (qtyInput) qtyInput.value = "1";
  dialog.showModal();
  setTimeout(() => nameInput?.focus(), 50);
}

function setupPOSListeners() {
  // Abas de categorias
  document.querySelectorAll(".posTabBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      posCategory = btn.dataset.cat;
      renderPOS();
    });
  });

  // Grade de balcão (Atalhos rápidos de 1 clique)
  document.querySelectorAll("[data-quick-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.quickAction;
      if (action === "acesso_net") { openInternetValueDialog(); return; }
      const def = QUICK_SHORTCUTS[action];
      if (!def) return;
      const prod = state.products.find(p => p.active && (p.code === def.code || p.name.toLowerCase().includes(def.name.toLowerCase())));
      // Atalhos do balcao sempre perguntam a quantidade (ou usam a digitada antes do clique).
      const pending = takePendingQty();
      if (prod) {
        if (pending) addPosProduct(prod.id, pending);
        else askPosQty(prod.name, prod.priceCents, q => addPosProduct(prod.id, q));
      } else if (!pending) {
        askPosQty(def.name, def.priceCents, (q, price) => { const k = price !== def.priceCents ? `quick_${action}@${price}` : `quick_${action}`; const c = posCart.get(k); if (c) c.quantity += q; else posCart.set(k, { id: k, type: "custom", name: def.name, code: def.code, category: def.category, priceCents: price, quantity: q, maxStock: null }); playChime("success"); renderPOSTicket(); });
      } else {
        const key = `quick_${action}`;
        const current = posCart.get(key);
        const qty = pending;
        if (current) current.quantity += qty;
        else posCart.set(key, {
          id: key,
          type: "custom",
          name: def.name,
          code: def.code,
          category: def.category,
          priceCents: def.priceCents,
          quantity: qty,
          maxStock: null
        });
        playChime("success");
        renderPOSTicket();
      }
    });
  });

  // Busca e leitor de código de barras com multiplicador (ex: 5*104 ou 10*1.1)
  const searchInput = $("#posSearchInput");
  const suggestionsBox = $("#posSearchSuggestions");
  let selectedSuggestIndex = -1;

  function parseInputMultiplier(raw) {
    let qty = 1;
    let lookup = (raw || "").trim();
    if (lookup.includes("*")) {
      const parts = lookup.split("*").map(s => s.trim());
      if (parts.length === 2) {
        if (!isNaN(parts[0]) && isNaN(parts[1])) {
          qty = parseInt(parts[0], 10) || 1;
          lookup = parts[1];
        } else if (isNaN(parts[0]) && !isNaN(parts[1])) {
          lookup = parts[0];
          qty = parseInt(parts[1], 10) || 1;
        } else {
          // Ambos são números: ex 5*104 ou 104*5. Verificar qual é código de produto
          const p0 = state.products.find(p => p.active && p.code && p.code.toLowerCase() === parts[0].toLowerCase());
          const p1 = state.products.find(p => p.active && p.code && p.code.toLowerCase() === parts[1].toLowerCase());
          if (p1 && !p0) {
            qty = parseInt(parts[0], 10) || 1;
            lookup = parts[1];
          } else {
            qty = parseInt(parts[0], 10) || 1;
            lookup = parts[1];
          }
        }
      }
    } else if (lookup.toLowerCase().includes("x") && /^\d+x.+$/i.test(lookup)) {
      const idx = lookup.toLowerCase().indexOf("x");
      qty = parseInt(lookup.slice(0, idx), 10) || 1;
      lookup = lookup.slice(idx + 1).trim();
    }
    return { qty: Math.max(1, qty), lookup };
  }

  function renderSearchSuggestions(term) {
    if (!suggestionsBox) return;
    const clean = (term || "").trim().toLowerCase();
    if (!clean) {
      suggestionsBox.hidden = true;
      suggestionsBox.innerHTML = "";
      selectedSuggestIndex = -1;
      return;
    }

    const { lookup } = parseInputMultiplier(clean);
    if (!lookup) {
      suggestionsBox.hidden = true;
      suggestionsBox.innerHTML = "";
      selectedSuggestIndex = -1;
      return;
    }

    const matches = state.products
      .filter(p => p.active && ((p.code && p.code.toLowerCase().includes(lookup)) || (p.barcode && p.barcode.toLowerCase().includes(lookup)) || p.name.toLowerCase().includes(lookup)))
      .sort((a, b) => {
        const aExactCode = a.code && a.code.toLowerCase() === lookup ? -30 : 0;
        const bExactCode = b.code && b.code.toLowerCase() === lookup ? -30 : 0;
        const aExactBarcode = a.barcode && a.barcode.toLowerCase() === lookup ? -25 : 0;
        const bExactBarcode = b.barcode && b.barcode.toLowerCase() === lookup ? -25 : 0;
        const aStartCode = a.code && a.code.toLowerCase().startsWith(lookup) ? -20 : 0;
        const bStartCode = b.code && b.code.toLowerCase().startsWith(lookup) ? -20 : 0;
        const aExactName = a.name.toLowerCase() === lookup ? -15 : 0;
        const bExactName = b.name.toLowerCase() === lookup ? -15 : 0;
        const aStartName = a.name.toLowerCase().startsWith(lookup) ? -10 : 0;
        const bStartName = b.name.toLowerCase().startsWith(lookup) ? -10 : 0;
        return (aExactCode + aExactBarcode + aStartCode + aExactName + aStartName) - (bExactCode + bExactBarcode + bStartCode + bExactName + bStartName);
      })
      .slice(0, 8);

    if (!matches.length) {
      suggestionsBox.hidden = true;
      suggestionsBox.innerHTML = "";
      selectedSuggestIndex = -1;
      return;
    }

    selectedSuggestIndex = 0;
    suggestionsBox.hidden = false;
    suggestionsBox.innerHTML = matches.map((m, idx) => {
      const cat = getCategoryInfo(m.category);
      return `
        <div class="posSearchItem ${idx === 0 ? "active" : ""}" data-suggest-id="${html(m.id)}" data-index="${idx}">
          <div class="itemLeft">
            <span class="catDot" style="background:${cat.color};"></span>
            ${m.code ? `<strong>#${html(m.code)}</strong>` : ""}
            <span>${html(m.name)}</span>
          </div>
          <span class="itemPrice">${currency(m.priceCents)}</span>
        </div>`;
    }).join("");
  }

  suggestionsBox?.addEventListener("click", event => {
    const item = event.target.closest("[data-suggest-id]");
    if (!item) return;
    const raw = searchInput?.value || "";
    const { qty } = parseInputMultiplier(raw);
    const prod = state.products.find(p => p.id === item.dataset.suggestId);
    // Com multiplicador (20*342) lanca direto; sem, abre o pop-up de quantidade.
    if (raw.includes("*")) { addPosProduct(item.dataset.suggestId, qty); if (prod) toast(`${qty}× ${prod.name} adicionado ao cupom!`); }
    else addPosProduct(item.dataset.suggestId);
    if (searchInput) {
      searchInput.value = "";
      posSearchTerm = "";
      suggestionsBox.hidden = true;
      searchInput.focus();
    }
    renderPOS();
  });

  searchInput?.addEventListener("input", event => {
    posSearchTerm = event.currentTarget.value;
    renderSearchSuggestions(posSearchTerm);
    renderPOS();
  });

  searchInput?.addEventListener("keydown", event => {
    const items = suggestionsBox ? suggestionsBox.querySelectorAll(".posSearchItem") : [];

    if (event.key === "Escape") {
      if (suggestionsBox) suggestionsBox.hidden = true;
      searchInput.value = "";
      posSearchTerm = "";
      renderPOS();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (items.length > 0) {
        selectedSuggestIndex = (selectedSuggestIndex + 1) % items.length;
        items.forEach((it, idx) => it.classList.toggle("active", idx === selectedSuggestIndex));
        items[selectedSuggestIndex]?.scrollIntoView({ block: "nearest" });
      }
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length > 0) {
        selectedSuggestIndex = (selectedSuggestIndex - 1 + items.length) % items.length;
        items.forEach((it, idx) => it.classList.toggle("active", idx === selectedSuggestIndex));
        items[selectedSuggestIndex]?.scrollIntoView({ block: "nearest" });
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const raw = event.currentTarget.value.trim();
      if (!raw) return;

      const { qty, lookup } = parseInputMultiplier(raw);

      // Precedência de Busca de Alta Velocidade:
      // 1. Código exato do produto (#104, #1.1, #2, #3, etc.)
      const exactCode = state.products.find(p => p.active && p.code && p.code.toLowerCase() === lookup.toLowerCase());
      // 2. Código de barras exato
      const exactBarcode = !exactCode && state.products.find(p => p.active && p.barcode && p.barcode.toLowerCase() === lookup.toLowerCase());
      // 3. Nome exato
      const exactName = !exactCode && !exactBarcode && state.products.find(p => p.active && p.name.toLowerCase() === lookup.toLowerCase());
      // 4. Código começa com o termo digitado
      const startsCode = !exactCode && !exactBarcode && !exactName && state.products.find(p => p.active && p.code && p.code.toLowerCase().startsWith(lookup.toLowerCase()));
      // 5. Sugestão selecionada na lista suspensa
      const selectedItemEl = items[selectedSuggestIndex];
      const selectedSuggestProd = selectedItemEl ? state.products.find(p => p.id === selectedItemEl.dataset.suggestId) : null;
      // 6. Nome ou código contém o termo
      const firstSuggest = !exactCode && !exactBarcode && !exactName && !startsCode && !selectedSuggestProd && state.products.find(p => p.active && (p.code?.toLowerCase().includes(lookup.toLowerCase()) || p.name.toLowerCase().includes(lookup.toLowerCase())));

      const target = exactCode || exactBarcode || exactName || startsCode || selectedSuggestProd || firstSuggest;
      if (target) {
        // Leitor de codigo de barras e multiplicador (20*342) lancam direto; codigo ou nome abrem o pop-up de quantidade.
        const direct = raw.includes("*") || target === exactBarcode;
        event.currentTarget.value = "";
        posSearchTerm = "";
        if (suggestionsBox) suggestionsBox.hidden = true;
        if (direct) { addPosProduct(target.id, qty); toast(`${qty}× ${target.name} adicionado ao cupom!`); }
        else addPosProduct(target.id);
        renderPOS();
        if (direct) event.currentTarget.focus();
      } else {
        toast(`Nenhum item localizado para "${lookup}".`);
      }
    }
  });

  // Diálogo Rápido de Lançamento de Impressão / PDF (#posPrintLaunchDialog)
  $("#posLaunchPdfBtn")?.addEventListener("click", () => {
    const dialog = $("#posPrintLaunchDialog");
    if (!dialog) return;
    const bwInput = $("#posPdfPagesBW");
    const colorInput = $("#posPdfPagesColor");
    if (bwInput) bwInput.value = "1";
    if (colorInput) colorInput.value = "0";
    dialog.showModal();
    setTimeout(() => { if (bwInput) { bwInput.focus(); bwInput.select(); } }, 50);
  });

  $("#posPrintLaunchClose")?.addEventListener("click", () => $("#posPrintLaunchDialog")?.close());
  $("#posPrintLaunchCancel")?.addEventListener("click", () => $("#posPrintLaunchDialog")?.close());

  $("#posPrintLaunchForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const bw = parseInt($("#posPdfPagesBW")?.value, 10) || 0;
    const color = parseInt($("#posPdfPagesColor")?.value, 10) || 0;
    if (bw <= 0 && color <= 0) {
      toast("Informe ao menos 1 página para lançar.");
      return;
    }

    if (bw > 0) {
      const prodBW = state.products.find(p => p.active && p.code === "1.1") || state.products.find(p => p.active && p.name.toLowerCase().includes("impressão p/b"));
      if (prodBW) {
        addPosProduct(prodBW.id, bw);
      } else {
        const id = "custom_print_bw";
        const cur = posCart.get(id);
        if (cur) cur.quantity += bw;
        else posCart.set(id, { id, type: "custom", name: "Impressão P&B (#1.1)", code: "1.1", category: "Gráfica Rápida", priceCents: 100, quantity: bw, maxStock: null });
        playChime("success");
      }
    }

    if (color > 0) {
      const prodColor = state.products.find(p => p.active && p.code === "2-B") || state.products.find(p => p.active && p.name.toLowerCase() === "impressão colorida");
      if (prodColor) {
        addPosProduct(prodColor.id, color);
      } else {
        const id = "custom_print_color";
        const cur = posCart.get(id);
        if (cur) cur.quantity += color;
        else posCart.set(id, { id, type: "custom", name: "Impressão Colorida (#2-B)", code: "2-B", category: "Gráfica Rápida", priceCents: 200, quantity: color, maxStock: null });
        playChime("success");
      }
    }

    $("#posPrintLaunchDialog")?.close();
    playChime("success");
    toast(`${bw + color} página(s) de impressão lançada(s) com sucesso!`);
    renderPOSTicket();
    $("#posSearchInput")?.focus();
  });

  // Modal de item avulso
  $("#posCustomItemBtn")?.addEventListener("click", openPosCustomItemDialog);
  $("#posCustomItemCloseBtn")?.addEventListener("click", () => $("#posCustomItemDialog")?.close());
  $("#posCustomItemCancelBtn")?.addEventListener("click", () => $("#posCustomItemDialog")?.close());

  $("#posCustomItemForm")?.addEventListener("submit", event => {
    event.preventDefault();
    const name = $("#posCustomName")?.value.trim();
    const price = parseFloat($("#posCustomPrice")?.value) || 0;
    const qty = parseInt($("#posCustomQty")?.value, 10) || 1;
    const category = $("#posCustomCategory")?.value || "Gráfica Rápida";

    if (!name) { toast("Informe a descrição do item avulso."); return; }
    if (price <= 0) { toast("Informe um valor unitário válido."); return; }

    const customId = `avulso_${Date.now()}`;
    posCart.set(customId, {
      id: customId,
      type: "custom",
      name,
      code: "AVULSO",
      category,
      priceCents: Math.round(price * 100),
      quantity: qty,
      maxStock: null
    });

    playChime("success");
    toast(`Item avulso "${name}" adicionado!`);
    $("#posCustomItemDialog")?.close();
    renderPOSTicket();
    $("#posSearchInput")?.focus();
  });

  // Desconto
  $("#posDiscountInput")?.addEventListener("input", event => {
    posDiscountRaw = event.currentTarget.value.trim();
    renderPOSTicket();
  });

  // Grade de catálogo
  $("#posGrid")?.addEventListener("click", event => {
    const prodCard = event.target.closest("[data-pos-add-product]");
    const timeCard = event.target.closest("[data-pos-add-time]");
    if (prodCard) {
      addPosProduct(prodCard.dataset.posAddProduct);
    } else if (timeCard) {
      addPosMachineTime(timeCard.dataset.posAddTime);
    }
  });

  // Quantidade digitada no carrinho (0 remove o item). Enter confirma e volta para a busca.
  $("#posTicketRows")?.addEventListener("change", event => {
    const input = event.target.closest("[data-cart-qty]"); if (!input) return;
    const item = posCart.get(input.dataset.cartQty); if (!item) return;
    const qty = Math.max(0, Math.min(9999, parseInt(input.value, 10) || 0));
    if (qty === 0) posCart.delete(input.dataset.cartQty); else item.quantity = qty;
    renderPOSTicket();
  });
  $("#posTicketRows")?.addEventListener("keydown", event => {
    if (event.key === "Enter" && event.target.closest("[data-cart-qty]")) { event.preventDefault(); event.target.blur(); $("#posSearchInput")?.focus(); }
  });

  // Ações na tabela do cupom
  $("#posTicketRows")?.addEventListener("click", event => {
    if (event.target.closest("[data-cart-qty]")) { event.target.select?.(); return; }
    const btn = event.target.closest("[data-cart-action]");
    if (!btn) return;
    const action = btn.dataset.cartAction;
    const key = btn.dataset.key;
    const item = posCart.get(key);
    if (!item) return;
    if (action === "inc") {
      if (item.maxStock && item.quantity >= item.maxStock) {
        toast("Estoque máximo atingido para este item.");
        return;
      }
      item.quantity++;
      renderPOSTicket();
    } else if (action === "dec") {
      if (item.quantity <= 1) posCart.delete(key);
      else item.quantity--;
      renderPOSTicket();
    } else if (action === "del") {
      posCart.delete(key);
      renderPOSTicket();
    }
  });

  // Limpar cupom (F4 / F8)
  $("#posClearTicketBtn")?.addEventListener("click", () => {
    if (!posCart.size) return;
    posCart.clear();
    posDiscountRaw = "";
    const discInput = $("#posDiscountInput");
    if (discInput) discInput.value = "";
    renderPOSTicket();
    toast("Cupom cancelado e zerado.");
    $("#posSearchInput")?.focus();
  });

  // Finalizar venda (F2 / F10)
  $("#posSubmitTicketBtn")?.addEventListener("click", () => {
    if (!posCart.size) {
      toast("Adicione ao menos um item ao cupom.");
      return;
    }
    if (posDestination !== "counter") {
      launchItemsToMachine(posDestination);
      return;
    }
    if (!state.cashShift) {
      toast("Abra o caixa antes de receber vendas presenciais.");
      return;
    }
    openPOSPaymentDialog();
  });

  $("#posQuickOpenBtn")?.addEventListener("click", async () => {
    try {
      await api("/api/cash/open", { opening: "100.00" });
      playChime("success");
      toast("Caixa aberto com fundo inicial de R$ 100,00.");
      await loadState();
    } catch (err) { toast(err.message); }
  });

  $("#posCustomOpenBtn")?.addEventListener("click", () => {
    $("#cashToggleButton")?.click();
  });

  $("#posDestinationSelect")?.addEventListener("change", event => {
    posDestination = event.currentTarget.value;
    const submitBtn = $("#posSubmitTicketBtn");
    if (submitBtn) {
      if (posDestination === "counter") {
        submitBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg><span>Finalizar Venda (F2)</span>`;
      } else {
        const machine = state.machines.find(m => m.id === posDestination);
        submitBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg><span>Lançar em ${html(machine?.name || "Estação")}</span>`;
      }
    }
  });

  $("#posSelectCustomerBtn")?.addEventListener("click", openCustomerSelectModal);

  $("#posPaymentCloseBtn")?.addEventListener("click", () => $("#posPaymentDialog").close());
  $("#posPaymentCancelBtn")?.addEventListener("click", () => $("#posPaymentDialog").close());

  // Formas de pagamento
  document.querySelectorAll(".posMethodBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".posMethodBtn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      posActiveMethod = btn.dataset.posMethod;
      posSplitMode = false;
      const splitBox = $("#posSplitBox");
      if (splitBox) splitBox.hidden = true;
      const splitToggle = $("#posSplitToggleBtn");
      if (splitToggle) splitToggle.classList.remove("active");
      updatePOSPaymentMethodUI();
    });
  });

  // Pagamento misto / dividido
  $("#posSplitToggleBtn")?.addEventListener("click", () => {
    posSplitMode = !posSplitMode;
    const splitBox = $("#posSplitBox");
    const splitToggle = $("#posSplitToggleBtn");
    if (splitBox) splitBox.hidden = !posSplitMode;
    if (splitToggle) splitToggle.classList.toggle("active", posSplitMode);

    if (posSplitMode) {
      document.querySelectorAll(".posMethodBtn").forEach(b => b.classList.remove("active"));
      const totals = getPOSTotals();
      const currentPaid = posSplitPayments.reduce((s, p) => s + p.amountCents, 0);
      const remaining = Math.max(0, totals.totalCents - currentPaid);
      const amtInput = $("#posSplitAmountInput");
      if (amtInput) amtInput.value = (remaining / 100).toFixed(2);
      renderPOSSplitPayments();
    }
    updatePOSPaymentMethodUI();
  });

  $("#posSplitAddBtn")?.addEventListener("click", () => {
    const methodSelect = $("#posSplitMethodSelect");
    const amountInput = $("#posSplitAmountInput");
    const method = methodSelect?.value || "cash";
    const amount = parseFloat(amountInput?.value) || 0;
    const amountCents = Math.round(amount * 100);

    if (amountCents <= 0) {
      toast("Informe um valor de parcela válido.");
      return;
    }

    const totals = getPOSTotals();
    const currentPaid = posSplitPayments.reduce((s, p) => s + p.amountCents, 0);
    const maxRemaining = totals.totalCents - currentPaid;

    if (amountCents > maxRemaining) {
      toast(`O valor da parcela excede o saldo restante (${currency(maxRemaining)}).`);
      return;
    }

    posSplitPayments.push({ method, amountCents });
    if (amountInput) {
      const nextRemaining = maxRemaining - amountCents;
      amountInput.value = nextRemaining > 0 ? (nextRemaining / 100).toFixed(2) : "";
    }
    renderPOSSplitPayments();
    updatePOSPaymentMethodUI();
  });

  $("#posSplitList")?.addEventListener("click", event => {
    const btn = event.target.closest("[data-del-split]");
    if (!btn) return;
    const idx = parseInt(btn.dataset.delSplit, 10);
    if (!isNaN(idx)) {
      posSplitPayments.splice(idx, 1);
      renderPOSSplitPayments();
      updatePOSPaymentMethodUI();
    }
  });

  // Calculadora de troco dinheiro
  $("#posPaidGivenInput")?.addEventListener("input", calcPOSChange);

  document.querySelectorAll("[data-pos-cash-val]").forEach(btn => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.posCashVal;
      const totals = getPOSTotals();
      const total = totals.totalCents / 100;
      let given = total;
      if (val === "exact") given = total;
      else given = Number(val);
      const input = $("#posPaidGivenInput");
      if (input) input.value = given.toFixed(2);
      calcPOSChange();
    });
  });

  $("#posPaymentConfirmBtn")?.addEventListener("click", () => { posWantReceipt = false; submitPOSSale(); });
  $("#posPaymentReceiptBtn")?.addEventListener("click", () => { posWantReceipt = true; submitPOSSale(); });
  $("#posLastReceiptBtn")?.addEventListener("click", () => { if (lastReceiptData) showReceipt(lastReceiptData); });
  // Pagamento pelo teclado (como no sistema anterior): F1 dinheiro, F2 Pix, F3 debito, F4 credito, F8 fiado,
  // Enter confirma, Ctrl+Enter confirma e abre o recibo. Fase de captura: vem antes dos outros atalhos da tela.
  window.addEventListener("keydown", event => {
    const dialog = $("#posPaymentDialog");
    if (!dialog?.open) return;
    const method = { F1: "cash", F2: "pix", F3: "debit", F4: "credit", F8: "fiado" }[event.key];
    if (method) {
      event.preventDefault(); event.stopPropagation();
      dialog.querySelector(`[data-pos-method="${method}"]`)?.click();
      return;
    }
    if (event.key === "Enter" && !event.target.closest?.("#posSplitBox")) {
      event.preventDefault(); event.stopPropagation();
      const btn = event.ctrlKey ? $("#posPaymentReceiptBtn") : $("#posPaymentConfirmBtn");
      if (btn && !btn.disabled && !$("#posPaymentConfirmBtn").disabled) btn.click();
    }
  }, true);

  document.querySelectorAll(".posAuditTab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".posAuditTab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      posAuditTab = btn.dataset.auditTab;
      const tabDue = $("#auditTabDue");
      const tabPay = $("#auditTabPayments");
      const tabShf = $("#auditTabShifts");
      if (tabDue) tabDue.hidden = posAuditTab !== "due";
      if (tabPay) tabPay.hidden = posAuditTab !== "payments";
      if (tabShf) tabShf.hidden = posAuditTab !== "shifts";
    });
  });

  // Atalhos Globais de Teclado (Hotkeys)
  window.addEventListener("keydown", event => {
    const tag = event.target.tagName;
    const isInput = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";

    if (event.key === "Escape") {
      const payDialog = $("#posPaymentDialog");
      const customDialog = $("#posCustomItemDialog");
      if (payDialog?.open) payDialog.close();
      if (customDialog?.open) customDialog.close();
      const suggestions = $("#posSearchSuggestions");
      if (suggestions) suggestions.hidden = true;
      $("#posSearchInput")?.focus();
      return;
    }
    // Atalhos do caixa so valem na tela do caixa e sem outra janela aberta.
    if (currentView !== "cash" || document.querySelector("dialog[open]")) return;

    if (event.key === "F1" || (event.key === "/" && !isInput)) {
      event.preventDefault();
      const sInput = $("#posSearchInput");
      if (sInput) {
        sInput.focus();
        sInput.select();
      }
      return;
    }

    if (event.key === "F2") {
      event.preventDefault();
      if (posCart.size > 0) {
        $("#posSubmitTicketBtn")?.click();
      } else {
        toast("Adicione ao menos um item ao cupom antes de finalizar.");
      }
      return;
    }

    if (event.key === "F8") {
      event.preventDefault();
      $("#posClearTicketBtn")?.click();
      return;
    }

    if (event.key === "F9") {
      event.preventDefault();
      openPosCustomItemDialog();
      return;
    }

    if (event.key === "Enter" && event.target.id === "posPaidGivenInput") {
      event.preventDefault();
      const confirmBtn = $("#posPaymentConfirmBtn");
      if (confirmBtn && !confirmBtn.disabled) confirmBtn.click();
    }
  });
}
setupPOSListeners();
setupReportListeners();

function renderClients() {
  const term = $("#clientSearch").value.trim().toLowerCase();
  const items = state.clients.filter(item => !term || `${item.name} ${item.phone} ${item.login || ""}`.toLowerCase().includes(term));
  const dueOf = id => (state.openCharges || []).filter(c => c.clientId === id).reduce((s, c) => s + c.amountCents - c.paidCents, 0);
  // Saldo aparece sempre; sem login o cliente usa o saldo pelo balcao (modalidade "Usar saldo").
  $("#clientList").innerHTML = table(["Nome", "Login da estação", "Saldo de tempo", "Deve", "Telefone", "Status", "Ação"], items.map(item => { const due = dueOf(item.id); return `<tr><td>${html(item.name)}</td><td>${item.login ? html(item.login) : '<span class="muted">sem login</span>'}</td><td>${item.creditSeconds ? `<strong>${formatCredit(item.creditSeconds)}</strong>` : '<span class="muted">0min</span>'}${item.creditSeconds && !item.login ? '<br><small class="muted">crie o login em Editar para usar na estação</small>' : ""}</td><td>${due ? `<strong class="bad">${currency(due)}</strong>` : '<span class="muted">-</span>'}</td><td>${html(item.phone || "-")}</td><td>${item.active ? "Ativo" : "Inativo"}</td><td class="actionsCell"><button data-action="editClient" data-id="${item.id}">Editar</button><button data-action="rechargeClient" data-id="${item.id}">Recarregar</button><button data-action="debtClient" data-id="${item.id}">Fiado</button>${due ? `<button data-action="debtsView" data-id="${item.id}">Ver dívidas</button>` : ""}</td></tr>`; }), "Nenhum cliente cadastrado.");
}

// ---- Fiado / dividas de clientes, com print da conversa como prova ----
async function uploadProofs(chargeId, files) {
  for (const file of files) {
    if (file.size > 15 * 1024 * 1024) { toast(`${file.name}: arquivo muito grande`); continue; }
    const type = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "image/jpeg");
    const response = await fetch(`/api/charges/${encodeURIComponent(chargeId)}/proof`, { method: "POST", headers: { "content-type": type }, body: await file.arrayBuffer() });
    if (!response.ok) toast(`${file.name}: ${(await response.json().catch(() => ({}))).error || "não foi possível anexar"}`);
  }
}
function openDebtModal(clientId = "") {
  const clients = state.clients.filter(c => c.active).slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  openModal("Registrar dívida (fiado)",
    select("clientId", "Cliente", [["", "Cliente novo (preencher abaixo)"], ...clients.map(c => [c.id, c.name])], clientId) +
    field("newName", "Nome do cliente novo", "text", "", 'maxlength="80"') +
    field("newPhone", "Telefone do cliente novo", "tel", "", 'maxlength="30"') +
    field("description", "O que ele deve", "text", "", 'maxlength="120" placeholder="Ex.: impressões, recarga, xerox" required') +
    field("amount", "Valor (R$)", "number", "", 'min="0.01" step="0.01" required') +
    field("date", "Data da dívida", "date", new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }), "required") +
    select("old", "Tipo", [["false", "Venda de agora (entra nas vendas do dia)"], ["true", "Dívida antiga (anterior ao sistema)"]], "false") +
    field("note", "Observação", "text", "", 'maxlength="300"') +
    '<label><span>Prova (print da conversa, foto ou PDF)</span><input type="file" id="debtProofInput" accept="image/*,application/pdf" multiple></label>',
    async values => {
      let id = values.clientId;
      if (!id) {
        if (!values.newName.trim()) throw new Error("Escolha o cliente ou informe o nome do cliente novo.");
        id = (await api("/api/clients", { name: values.newName, phone: values.newPhone })).client.id;
      }
      const files = [...($("#debtProofInput")?.files || [])];
      const result = await api(`/api/clients/${encodeURIComponent(id)}/debt`, { description: values.description, amount: values.amount, date: values.date, old: values.old === "true", note: values.note });
      if (files.length) await uploadProofs(result.charge.id, files);
      toast("Dívida registrada.");
    }, "Registrar dívida");
}
// Link do WhatsApp com a mensagem de cobranca pronta e chave Pix.
function whatsappLink(phone, name, cents, details = "") {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 11) digits = "55" + digits;
  const pixKey = state?.settings?.pixKey || "3530675017";
  const firstName = String(name || "").split(" ")[0] || "Cliente";
  const desc = details ? ` referente a ${details}` : "";
  const text = `Olá, ${firstName}! Tudo bem? Passando para lembrar da sua pendência de ${currency(cents)}${desc} na Speed Lan House. Se preferir pagar no Pix para facilitar, nossa chave é: ${pixKey}. Qualquer dúvida estamos à disposição!`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
function openDebtsView(clientId) {
  const client = state.clients.find(c => c.id === clientId); if (!client) return;
  const debts = (state.openCharges || []).filter(c => c.clientId === clientId);
  const total = debts.reduce((s, c) => s + c.amountCents - c.paidCents, 0);
  const rows = debts.map(c => `<tr><td>${new Date(c.at).toLocaleDateString("pt-BR")}</td><td>${txt(c.description)}${c.note ? `<br><small class="muted">${html(c.note)}</small>` : ""}</td><td class="money">${currency(c.amountCents)}</td><td class="money">${c.paidCents ? currency(c.paidCents) : "-"}</td><td class="money"><strong>${currency(c.amountCents - c.paidCents)}</strong></td><td><button type="button" class="primary" data-action="pay" data-id="${html(c.id)}" ${state.cashShift ? "" : 'disabled title="Abra o caixa para receber"'}>Receber</button></td><td>${(c.proofs || []).map((p, i) => `<a href="/api/charges/${encodeURIComponent(c.id)}/proof/${p.id}" target="_blank" rel="noopener">${p.ext === ".pdf" ? "PDF" : `<img src="/api/charges/${encodeURIComponent(c.id)}/proof/${p.id}" alt="Prova ${i + 1}" class="proofThumb">`}</a>`).join(" ") || '<span class="muted">sem prova</span>'}<br><label class="proofAdd">+ anexar<input type="file" accept="image/*,application/pdf" multiple data-proof-for="${c.id}" hidden></label></td></tr>`).join("");
  $("#formDialog").classList.add("wide");
  openModal(`Dívidas de ${client.name}`, `<p class="quoteBox">Total em aberto: <strong>${currency(total)}</strong>${client.phone ? ` · telefone ${html(client.phone)}` : ""}. Se o cliente pagar só uma parte, clique em <strong>Receber</strong> e digite o valor pago: o restante continua em aberto.${whatsappLink(client.phone, client.name, total) ? ` <a class="waButton" href="${whatsappLink(client.phone, client.name, total)}" target="_blank" rel="noopener">Cobrar no WhatsApp</a>` : " Cadastre o telefone para cobrar pelo WhatsApp."}</p><div class="tableWrap"><table class="dataTable"><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Já pago</th><th>Falta</th><th></th><th>Provas</th></tr></thead><tbody>${rows}</tbody></table></div>`, () => Promise.resolve(), "Fechar");
}
document.addEventListener("change", async event => {
  const input = event.target.closest("[data-proof-for]"); if (!input) return;
  await uploadProofs(input.dataset.proofFor, [...input.files]);
  toast("Prova anexada.");
  await loadState();
  const charge = (state.openCharges || []).find(c => c.id === input.dataset.proofFor);
  if (charge) openDebtsView(charge.clientId);
});

function renderProducts() {
  const term = $("#productSearch").value.trim().toLowerCase();
  const category = $("#productCategory").value, status = $("#productStatus").value;
  const categories = [...new Set(state.products.map(item => item.category).filter(Boolean))].sort((x, y) => x.localeCompare(y, "pt-BR"));
  const catSelect = $("#productCategory");
  if (catSelect.options.length - 1 !== categories.length) catSelect.innerHTML = `<option value="">Todas as categorias</option>${categories.map(c => `<option${c === category ? " selected" : ""}>${html(c)}</option>`).join("")}`;
  const byStatus = { active: item => item.active, all: () => true, inactive: item => !item.active, nocost: item => item.active && !Number.isInteger(item.costCents), low: item => item.active && item.type === "stock" && item.stock <= 0 }[status] || (() => true);
  const items = state.products.filter(item => byStatus(item) && (!category || item.category === category) && (!term || `${item.name} ${item.code} ${item.barcode || ""}`.toLowerCase().includes(term)));
  $("#productCount").textContent = `${items.length} de ${state.products.length} itens`;
  $("#productList").innerHTML = pagedTable("productList", ["Descrição", "Código", "Categoria", "Preço", "Custo", "Margem", "Estoque", "Ações"], items.map(item => `<tr><td>${html(item.name)}${!item.active ? ' <span class="muted">(inativo)</span>' : ""}</td><td>${html(item.code || "-")}</td><td>${html(item.category || "-")}</td><td class="money">${currency(item.priceCents)}</td><td class="money">${Number.isInteger(item.costCents) ? currency(item.costCents) : '<span class="muted">sem custo</span>'}</td><td>${Number.isInteger(item.costCents) && item.priceCents > 0 ? Math.round((item.priceCents - item.costCents) / item.priceCents * 100) + "%" : "-"}</td><td>${item.type === "service" ? "Serviço" : item.stock}</td><td class="actionsCell"><button class="primary" data-action="sellProduct" data-id="${item.id}" ${!item.active ? "disabled" : ""}>Vender</button>${state.user.role === "admin" ? `<button data-action="editProduct" data-id="${item.id}">Editar</button>${item.type === "stock" ? `<button data-action="stockProduct" data-id="${item.id}">Estoque</button>` : ""}` : ""}</td></tr>`), "Nenhum item encontrado com esses filtros.", 50);
  const alerts = state.products.filter(item => item.active && item.type === "stock" && item.stock <= (item.minStock || 0));
  $("#stockAlerts").hidden = !alerts.length;
  $("#stockAlerts").textContent = alerts.length ? `${alerts.length} ${alerts.length === 1 ? "item precisa" : "itens precisam"} de reposição, como ${alerts.slice(0, 3).map(item => item.name).join(", ")}. Para ver todos, escolha "Estoque zerado ou negativo" no filtro.` : "";
}

function renderSettings() {
  if (state.user.role !== "admin") return;
  const form = $("#settingsForm"); if (form.contains(document.activeElement)) return;
  form.elements.hourPrice.value = (state.settings.rateCentsHour / 100).toFixed(2);
  form.elements.defaultMinutes.value = state.settings.defaultMinutes;
  form.elements.printBW.value = (state.settings.printBWCents / 100).toFixed(2);
  form.elements.printColor.value = (state.settings.printColorCents / 100).toFixed(2);
  form.elements.autoRestoreOnTimeEnd.checked = state.settings.autoRestoreOnTimeEnd;
  if (form.elements.timeTable) form.elements.timeTable.value = (state.settings.timeTable || []).map(row => `${row.minutes}=${(row.cents / 100).toFixed(2)}`).join("; ");
  if (form.elements.timeRound) form.elements.timeRound.value = String(Number.isInteger(state.settings.timeRoundCents) ? state.settings.timeRoundCents : 50);
  const printersForm = $("#printersForm");
  if (!printersForm.contains(document.activeElement)) printersForm.elements.printerShare.value = (state.printers || []).join(", ");
}

function renderUsers() {
  $("#userList").innerHTML = table(["Usuário", "Perfil", "Status", "Ação"], state.users.map(item => `<tr><td>${html(item.name)}</td><td>${item.role === "admin" ? "Administrador" : "Atendente"}</td><td>${item.active ? "Ativo" : "Inativo"}</td><td><button data-action="userPassword" data-id="${item.id}">Alterar senha</button></td></tr>`), "Nenhum usuário.");
}

let reportPeriod = "month";
let chartMode = "rev";

// ================= Relatorios gerenciais =================
const pctText = (part, total) => total > 0 ? `${(part / total * 100).toFixed(1).replace(".", ",")}%` : "-";
const setHtml = (selector, value) => { const el = $(selector); if (el) el.innerHTML = value; };
const setTextSafe = (selector, value) => { const el = $(selector); if (el) el.textContent = value; };
const dayLabel = day => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const monthLabel = month => new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
const kpi = (label, value, sub = "", tone = "") => `<div class="rpKpi ${tone}"><span>${html(label)}</span><strong>${value}</strong><small>${sub}</small></div>`;
const bar = (value, max, color = "var(--primary)") => `<div class="rpBar"><i style="width:${Math.max(1.5, max ? value / max * 100 : 0)}%;background:${color}"></i></div>`;
// Meta da Speed Financeira (valor dos contratos fechados no mês), separada da meta de vendas da loja.
function finGoalHtml(g) {
  if (!g.finGoalCents) return "";
  const pct = Math.round(g.finContractsCents / g.finGoalCents * 100);
  return `<div class="rpGoalLine" style="margin-top: 12px;"><span><b>Speed Financeira</b> · contratos fechados no mês (${g.finContracts || 0})</span><b class="${g.finContractsCents >= g.finGoalCents ? "good" : ""}">${currency(g.finContractsCents)} de ${currency(g.finGoalCents)} (${pct}%)</b></div>
    ${bar(Math.min(g.finContractsCents, g.finGoalCents), g.finGoalCents, g.finContractsCents >= g.finGoalCents ? "var(--primary)" : "var(--accent)")}
    <div class="rpGoalLine"><span>Projeção do mês</span><b class="${g.finProjectionCents >= g.finGoalCents ? "good" : "bad"}">${currency(g.finProjectionCents)}</b></div>`;
}
const EXPENSE_CATEGORIES = ["Aluguel", "Energia", "Água", "Internet", "Salários", "Impostos", "Contabilidade", "Tarifas bancárias", "Cartão de crédito", "Sistemas e assinaturas", "Compras de mercadoria", "Insumos gráficos", "Manutenção", "Marketing e anúncios", "Transporte e combustível", "Alimentação", "Retirada do dono", "Outros"];
const STRATEGIES = ["", "Porta de entrada", "Alta margem", "Alto ticket", "Recorrente", "Venda casada", "Rever preço", "Baixa rentabilidade", "Candidato a eliminar"];
let abcFilter = "";

// Grafico de barras verticais simples (SVG), com destaque do maior valor.
function barChart(items, { value, label, title, color = "var(--primary)", peakColor = "var(--accent)", height = 220, average = true, width = 820 }) {
  if (!items.length) return `<p class="muted">Sem dados no período.</p>`;
  const left = 8, bottom = 28, top = 22;
  const chartH = height - top - bottom, step = (width - left * 2) / items.length;
  const max = Math.max(1, ...items.map(value)) * 1.12;
  const peak = items.reduce((best, item) => value(item) > value(best) ? item : best, items[0]);
  const labelEvery = Math.ceil(items.length / 14);
  const avg = items.reduce((sum, item) => sum + value(item), 0) / items.length;
  const avgY = top + chartH - avg / max * chartH;
  const bars = items.map((item, i) => {
    const h = Math.max(2, value(item) / max * chartH), w = Math.max(3, Math.min(46, step - 4));
    const x = left + i * step + (step - w) / 2, y = top + chartH - h;
    return `<g><title>${html(title(item))}</title><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${item === peak ? peakColor : color}"/>${i % labelEvery === 0 ? `<text x="${x + w / 2}" y="${height - 9}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${html(label(item))}</text>` : ""}</g>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" class="rpSvg" role="img">${average ? `<line x1="${left}" x2="${width - left}" y1="${avgY}" y2="${avgY}" stroke="var(--text-subtle)" stroke-dasharray="4 4"/><text x="${width - left}" y="${avgY - 4}" text-anchor="end" font-size="10" fill="var(--text-muted)">média</text>` : ""}${bars}</svg>`;
}

// Receita x custos por mes: barras lado a lado e resultado em texto.
function monthlyChart(rows) {
  const width = 820, height = 240, top = 16, bottom = 30, left = 8;
  const chartH = height - top - bottom, step = (width - left * 2) / rows.length;
  const max = Math.max(1, ...rows.map(r => Math.max(r.salesCents, r.expensesCents + r.cmvCents + r.feesCents))) * 1.1;
  const bars = rows.map((r, i) => {
    const w = Math.max(4, Math.min(24, step / 2 - 4)), x = left + i * step + step / 2 - w;
    const hs = r.salesCents / max * chartH, hc = (r.expensesCents + r.cmvCents + r.feesCents) / max * chartH;
    return `<g><title>${monthLabel(r.month)}: vendas ${currency(r.salesCents)}, custos e despesas ${currency(r.expensesCents + r.cmvCents + r.feesCents)}, resultado ${currency(r.resultCents)}</title>
      <rect x="${x}" y="${top + chartH - hs}" width="${w}" height="${Math.max(1, hs)}" rx="2" fill="var(--primary)"/>
      <rect x="${x + w + 2}" y="${top + chartH - hc}" width="${w}" height="${Math.max(1, hc)}" rx="2" fill="var(--danger-accent)"/>
      <text x="${x + w}" y="${height - 10}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${monthLabel(r.month)}</text></g>`;
  }).join("");
  const minR = Math.min(0, ...rows.map(r => r.resultCents));
  const y = v => top + chartH - (v - minR) / (max - minR) * chartH;
  const line = rows.map((r, i) => `${(left + i * step + step / 2).toFixed(1)},${y(r.resultCents).toFixed(1)}`).join(" ");
  const dots = rows.map((r, i) => r.salesCents || r.expensesCents ? `<circle cx="${(left + i * step + step / 2).toFixed(1)}" cy="${y(r.resultCents).toFixed(1)}" r="3.5" fill="#2563eb"><title>Resultado ${monthLabel(r.month)}: ${currency(r.resultCents)}</title></circle>` : "").join("");
  return `<div class="rpLegend"><span><i style="background:var(--primary)"></i>Vendas</span><span><i style="background:var(--danger-accent)"></i>Custos, taxas e despesas</span><span><i style="background:#2563eb"></i>Resultado</span></div><svg viewBox="0 0 ${width} ${height}" class="rpSvg" role="img">${bars}<polyline points="${line}" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linejoin="round"/>${dots}</svg>`;
}

// Mini grafico de linha para os cartoes.
function sparkline(values, color = "var(--primary)") {
  if (values.length < 2) return "";
  const w = 120, h = 34, max = Math.max(...values, 1), min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${(i / (values.length - 1) * w).toFixed(1)},${(h - 3 - (v - min) / (max - min || 1) * (h - 6)).toFixed(1)}`).join(" ");
  return `<svg class="rpSpark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// Velocimetro circular da meta.
function gauge(percent) {
  const p = Math.max(0, Math.min(100, percent)), r = 52, c = 2 * Math.PI * r;
  const color = p >= 100 ? "var(--primary)" : p >= 70 ? "#1fae5b" : "var(--accent)";
  return `<svg viewBox="0 0 130 130" class="rpGauge"><circle cx="65" cy="65" r="${r}" fill="none" stroke="var(--border-subtle)" stroke-width="12"/><circle cx="65" cy="65" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 65 65)"/><text x="65" y="63" text-anchor="middle" font-size="24" font-weight="800" fill="var(--text-main)">${String(Math.round(percent * 10) / 10).replace(".", ",")}%</text><text x="65" y="83" text-anchor="middle" font-size="11" fill="var(--text-muted)">da meta</text></svg>`;
}

// Rosca simples para participacao (formas de pagamento).
function donut(parts) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  if (!total) return "";
  const r = 46, c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = parts.filter(p => p.value).map(p => { const len = c * p.value / total; const arc = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${p.color}" stroke-width="18" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 60 60)"><title>${html(p.label)}: ${pctText(p.value, total)}</title></circle>`; offset += len; return arc; }).join("");
  return `<svg viewBox="0 0 120 120" class="rpDonut">${arcs}</svg>`;
}

const delta = (cur, prev, inverse = false) => {
  if (!prev) return `<span class="muted">-</span>`;
  const d = Math.round((cur - prev) / prev * 100);
  const good = inverse ? d <= 0 : d >= 0;
  return `<span class="rpDelta ${d === 0 ? "" : good ? "up" : "down"}">${d > 0 ? "▲" : d < 0 ? "▼" : "="} ${Math.abs(d)}%</span>`;
};

function renderOverview() {
  const r = report, dre = r.dre || {};
  const periodName = { today: "hoje", month: "no mês", "7d": "em 7 dias", "15d": "em 15 dias", "30d": "em 30 dias", "60d": "em 60 dias", "90d": "em 90 dias", all: "desde o início" }[r.period] || "";
  const days = r.byDay || [];
  const uncostedShare = (dre.uncostedRevenueCents || 0) + (dre.legacyCents || 0);
  const cmp = r.compare;
  const salesChange = cmp && cmp.previous.salesCents ? Math.round((cmp.current.salesCents - cmp.previous.salesCents) / cmp.previous.salesCents * 100) : null;
  const countChange = cmp && cmp.previous.count ? Math.round((cmp.current.count - cmp.previous.count) / cmp.previous.count * 100) : null;
  const ticketChange = cmp && cmp.previous.ticketCents ? Math.round((cmp.current.ticketCents - cmp.previous.ticketCents) / cmp.previous.ticketCents * 100) : null;
  const profitChange = cmp && cmp.previous.profitCents ? Math.round((cmp.current.profitCents - cmp.previous.profitCents) / Math.abs(cmp.previous.profitCents) * 100) : null;

  const trendBadge = (diff, inverse = false) => {
    if (diff === null || diff === undefined) return "";
    const isUp = diff >= 0;
    const isGood = inverse ? !isUp : isUp;
    const cls = isGood ? "up" : "down";
    const arrow = isUp ? "▲" : "▼";
    return `<span class="rpKpiDelta ${cls}">${arrow} ${isUp ? "+" : ""}${diff}%</span>`;
  };

  setHtml("#rpKpis",
    `<div class="rpKpi"><span>Vendas ${periodName}</span><strong>${currency(r.salesCents)}${trendBadge(salesChange)}</strong><small>${r.salesCount} vendas${trendBadge(countChange)} · ticket ${currency(r.averageTicketCents)}${trendBadge(ticketChange)}${r.unitsPerSale ? ` · ${String(r.unitsPerSale).replace(".", ",")} itens/venda` : ""}</small>${sparkline(days.map(d => d.salesCents))}</div>` +
    `<div class="rpKpi ${salesChange === null ? "" : salesChange >= 0 ? "good" : "bad"}"><span>Contra o período anterior</span><strong>${salesChange === null ? "-" : `${salesChange >= 0 ? "+" : ""}${salesChange}%`}</strong><small>${cmp ? `antes: ${currency(cmp.previous.salesCents)}` : "sem período anterior"}</small>${sparkline((r.prevByDay || []).map(d => d.salesCents), "var(--text-subtle)")}</div>` +
    `<div class="rpKpi ${dre.profitCents >= 0 ? "good" : "bad"}"><span>Resultado Real (DRE)</span><strong>${currency(dre.profitCents)}${trendBadge(profitChange)}</strong><small>${uncostedShare > r.salesCents * 0.2 ? `custo não cadastrado em ${pctText(uncostedShare, r.salesCents)}` : "100% auditado: vendas - CMV - taxas - despesas"}</small></div>` +
    `<div class="rpKpi ${r.dueCents ? "warn" : ""}"><span>A receber</span><strong>${currency(r.dueCents)}</strong><small>${(r.openCharges || []).length} pendência(s)${(r.agingBuckets || []).slice(2).some(b => b.dueCents) ? " · há atrasadas" : ""}</small></div>`);

  const g = r.goal || {};
  setHtml("#rpGoal", g.monthGoalCents ? `<div class="rpGoalBox">${gauge(g.percent)}<div class="rpGoalInfo"><strong>${currency(g.monthSalesCents)}</strong><span>de ${currency(g.monthGoalCents)}</span>
      <div class="rpGoalLine"><span>Ritmo por dia</span><b>${currency(g.paceCents)}</b></div>
      <div class="rpGoalLine"><span>Projeção do mês</span><b class="${g.projectionCents >= g.monthGoalCents ? "good" : "bad"}">${currency(g.projectionCents)}</b></div>
      <div class="rpGoalLine"><span>Precisa por dia</span><b>${currency(g.neededPerDayCents)}</b></div>
      <div class="rpGoalLine"><span>Dias úteis restantes</span><b>${g.remainingDays}</b></div></div></div>
      <div class="rpToday"><span>Hoje</span><strong>${currency(r.todayCents)}</strong>${g.dailyGoalCents ? `${bar(r.todayCents, g.dailyGoalCents, r.todayCents >= g.dailyGoalCents ? "var(--primary)" : "var(--accent)")}<small>meta do dia ${currency(g.dailyGoalCents)}</small>` : ""}</div>` + finGoalHtml(g)
    : `<p class="muted">Defina a meta em <strong>Metas e taxas</strong>.</p>` + finGoalHtml(g));

  setHtml("#rpCompare", cmp ? `<table class="rpCompare"><thead><tr><th></th><th>Agora</th><th>Antes</th><th></th></tr></thead><tbody>${[
    ["Vendas", cmp.current.salesCents, cmp.previous.salesCents, currency],
    ["Nº de vendas", cmp.current.count, cmp.previous.count, v => String(v)],
    ["Ticket médio", cmp.current.ticketCents, cmp.previous.ticketCents, currency],
    ["Resultado Líquido (DRE)", cmp.current.profitCents, cmp.previous.profitCents, currency],
    ["Recebido", cmp.current.receivedCents, cmp.previous.receivedCents, currency],
    ["Tempo de máquina", cmp.current.timeCents, cmp.previous.timeCents, currency],
    ["Impressões das estações", cmp.current.printCents, cmp.previous.printCents, currency],
    ["Despesas", cmp.current.expensesCents, cmp.previous.expensesCents, currency, true]
  ].map(([label, cur, prev, fmt, inverse]) => `<tr><td>${label}</td><td><strong>${fmt(cur)}</strong></td><td class="muted">${fmt(prev)}</td><td>${delta(cur, prev, inverse)}</td></tr>`).join("")}</tbody></table><p class="muted rpNote">Anterior: ${dayLabel(r.range.prevStart)} a ${dayLabel(r.range.prevEnd)}</p>` : `<p class="muted">Escolha um período (hoje, 7, 15, 30 dias ou mês) para comparar.</p>`);

  setHtml("#rpAlerts", (r.alerts || []).length ? r.alerts.map(a => `<div class="rpAlert ${a.level}"><strong>${html(a.title)}</strong><span>${html(a.text)}</span></div>`).join("") : `<div class="rpAlert ok"><strong>Tudo em ordem</strong><span>Nenhum alerta no período.</span></div>`);
  renderPlan();
  renderPrintAudit();
  renderHourlyPeak();
  renderHeat();
  renderYearly();
}

// Plano de acao: cada item traz o impacto calculado com os numeros reais do periodo.
function renderPlan() {
  const r = report, g = r.goal || {}, items = [];
  const periodDays = Math.max(1, (r.byDay || []).length);
  const salesPerDay = r.salesCount / periodDays;
  const workDaysMonth = (g.workedDays || 0) + (g.remainingDays || 0) || 26;
  const monthlySales = Math.round(salesPerDay * workDaysMonth);
  if (g.monthGoalCents && g.remainingDays && g.projectionCents < g.monthGoalCents && r.averageTicketCents) {
    const neededSales = Math.ceil(g.neededPerDayCents / r.averageTicketCents);
    items.push({ tone: "warn", title: "Meta do mês", value: `${currency(g.neededPerDayCents)}/dia`, text: `Faltam ${currency(g.monthGoalCents - g.monthSalesCents)}. No ticket atual (${currency(r.averageTicketCents)}) são cerca de ${neededSales} vendas por dia; hoje a média é ${Math.round(salesPerDay)}. Se a meta estiver alta demais para o mês, ajuste em Metas e taxas para acompanhar o ritmo real.` });
  }
  if (r.salesCount && monthlySales) items.push({ tone: "ok", title: "Aumentar o ticket médio", value: `+${currency(monthlySales * 100)}/mês`, text: `Cada R$ 1,00 a mais por atendimento rende cerca de ${currency(monthlySales * 100)} por mês (${monthlySales} vendas/mês). Ofereça junto: envelope, plastificação, cópia extra, bebida.` });
  const hours = (r.byHour || []).filter(h => h.hour >= 8 && h.hour <= 19 && h.count);
  if (hours.length >= 3) {
    const peak = hours.reduce((a, b) => b.count > a.count ? b : a), weak = hours.reduce((a, b) => b.count < a.count ? b : a);
    items.push({ tone: "info", title: "Horários", value: `pico às ${String(peak.hour).padStart(2, "0")}h`, text: `Às ${String(peak.hour).padStart(2, "0")}h saem ${peak.count} vendas no período; às ${String(weak.hour).padStart(2, "0")}h só ${weak.count}. Reforce troco e atendimento no pico e use o horário fraco para serviços demorados (currículos, cadastros, digitalizações).` });
  }
  const week = (r.byWeekday || []).filter(d => d.days);
  if (week.length >= 3) {
    const avg = d => d.salesCents / d.days;
    const best = week.reduce((a, b) => avg(b) > avg(a) ? b : a), worst = week.reduce((a, b) => avg(b) < avg(a) ? b : a);
    items.push({ tone: "info", title: "Dias da semana", value: `${best.name}: ${currency(Math.round(avg(best)))}`, text: `${best.name} é o melhor dia (média ${currency(Math.round(avg(best)))}); ${worst.name} o mais fraco (${currency(Math.round(avg(worst)))}). Programe promoções e divulgação para ${worst.name}.` });
  }
  const bm = r.byMethod || {}, received = Object.values(bm).reduce((a, b) => a + b, 0);
  const cardCents = (bm.debit || 0) + (bm.credit || 0) + (bm.card || 0);
  if (received && r.dre?.feesCents) items.push({ tone: "info", title: "Custo das maquininhas", value: `${currency(r.dre.feesCents)}`, text: `Taxas pagas no período sobre ${currency(cardCents)} em cartão (${pctText(cardCents, received)} do recebido). Incentivar Pix ou dinheiro nos valores pequenos reduz esse custo.` });
  else if (received && cardCents) items.push({ tone: "info", title: "Custo das maquininhas", value: pctText(cardCents, received), text: `${currency(cardCents)} entraram no cartão. Cadastre as taxas em Metas e taxas para ver quanto isso custa no DRE.` });
  const late = (r.agingBuckets || []).slice(1).reduce((sum, b) => sum + b.dueCents, 0);
  if (late) items.push({ tone: "danger", title: "Cobrar pendências", value: currency(late), text: "Valores em aberto há mais de 7 dias. Veja a lista em Clientes e fiado e cobre pelo WhatsApp." });
  const abc = r.abc || [];
  if (abc.length >= 5) {
    const top3 = abc.slice(0, 3).reduce((sum, row) => sum + row.amountCents, 0), total = abc.reduce((sum, row) => sum + row.amountCents, 0);
    items.push({ tone: "info", title: "Concentração", value: pctText(top3, total), text: `${abc.slice(0, 3).map(row => row.name).join(", ")} fazem ${pctText(top3, total)} das vendas com itens. Esses itens nunca podem faltar nem atrasar.` });
  }
  const st = r.stock || {};
  if (st.withoutCostProducts) items.push({ tone: "warn", title: "Cadastrar custos", value: `${st.withoutCostProducts} itens`, text: "Sem o preço de custo o lucro real não aparece. Comece pelos que mais vendem: impressões, xerox, envelope e bebidas." });
  if (!r.expensesCents && !(r.payables || []).length) items.push({ tone: "warn", title: "Lançar despesas", value: "DRE", text: "Envie os PDFs das contas do mês (energia, água, internet, aluguel) na aba DRE e contas para o resultado ficar real." });
  setHtml("#rpPlan", items.length ? items.map(i => `<div class="rpPlanItem ${i.tone}"><span>${html(i.title)}</span><strong>${html(i.value)}</strong><p>${html(i.text)}</p></div>`).join("") : `<p class="muted">Sem dados suficientes no período.</p>`);
}

// Mapa de calor: dias da semana x horas (8h as 20h).
function renderHeat() {
  const heat = report.heat || [];
  const order = [1, 2, 3, 4, 5, 6, 0], names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const hours = Array.from({ length: 13 }, (_, i) => i + 8);
  const max = Math.max(1, ...order.flatMap(d => hours.map(h => heat[d]?.[h] || 0)));
  const total = order.reduce((sum, d) => sum + hours.reduce((s, h) => s + (heat[d]?.[h] || 0), 0), 0);
  if (!total) { setHtml("#rpHeat", `<p class="muted">Sem vendas no período.</p>`); return; }
  setHtml("#rpHeat", `<table class="rpHeat"><thead><tr><th></th>${hours.map(h => `<th>${h}h</th>`).join("")}</tr></thead><tbody>${order.map(d => `<tr><th>${names[d]}</th>${hours.map(h => { const v = heat[d]?.[h] || 0; const a = v ? 0.12 + 0.88 * v / max : 0; return `<td style="background:${v ? `rgba(11,138,69,${a.toFixed(2)})` : "var(--bg-card-subtle)"};color:${a > 0.55 ? "#fff" : "var(--text-secondary)"}" title="${names[d]} ${h}h: ${v} vendas">${v || ""}</td>`; }).join("")}</tr>`).join("")}</tbody></table>`);
}

function renderExecChart() {
  if (!report) return;
  const days = (report.byDay || []).slice(-62), prev = report.prevByDay || [];
  const value = d => chartMode === "rev" ? d.salesCents : d.count;
  const total = days.reduce((sum, d) => sum + d.salesCents, 0), count = days.reduce((sum, d) => sum + d.count, 0);
  const peak = days.reduce((best, d) => !best || value(d) > value(best) ? d : best, null);
  setHtml("#rpDailyStats", days.length ? `<div><span>Total</span><strong>${currency(total)}</strong></div><div><span>Média por dia</span><strong>${currency(Math.round(total / days.length))}</strong></div><div><span>Vendas por dia</span><strong>${Math.round(count / days.length)}</strong></div><div><span>Melhor dia</span><strong>${dayLabel(peak.date)} · ${chartMode === "rev" ? currency(peak.salesCents) : `${peak.count} vendas`}</strong></div>` : "");
  let chart = barChart(days, { value, label: d => dayLabel(d.date), title: d => `${dayLabel(d.date)}: ${currency(d.salesCents)} em ${d.count} vendas` });
  // Linha do periodo anterior, dia a dia na mesma posicao.
  if (days.length > 1 && prev.length > 1 && report.period !== "all") {
    const width = 820, height = 220, left = 8, top = 22, chartH = height - top - 28, step = (width - left * 2) / days.length;
    const max = Math.max(1, ...days.map(value)) * 1.12;
    const prevMap = new Map(prev.map(d => [d.date, d]));
    const DAY = 86400000, start = Date.parse(report.range.start), prevStart = Date.parse(report.range.prevStart);
    // Mesmo dia do periodo anterior (1o com 1o, 2o com 2o...), sem vendas = zero.
    const pts = days.map((d, i) => { const p = prevMap.get(new Date(prevStart + Math.round((Date.parse(d.date) - start) / DAY) * DAY).toISOString().slice(0, 10)); return `${(left + i * step + step / 2).toFixed(1)},${(top + chartH - Math.min(p ? value(p) : 0, max) / max * chartH).toFixed(1)}`; }).join(" ");
    chart = chart.replace("</svg>", `<polyline points="${pts}" fill="none" stroke="#475569" stroke-width="2" stroke-dasharray="5 4" opacity=".75"/></svg>`);
    chart = `<div class="rpLegend"><span><i style="background:var(--primary)"></i>Período atual</span><span><i style="background:#475569"></i>Período anterior</span><span><i style="background:var(--accent)"></i>Melhor dia</span></div>` + chart;
  }
  setHtml("#execDailyChart", chart);
}

function renderCategoryBars() {
  if (!report) return;
  const all = Object.entries(report.byCategory || {}).filter(([, d]) => d.revenueCents);
  const legacy = all.find(([name]) => name === "Sistema anterior");
  const entries = all.filter(([name]) => name !== "Sistema anterior").sort((a, b) => b[1].revenueCents - a[1].revenueCents);
  const total = entries.reduce((sum, [, d]) => sum + d.revenueCents, 0);
  const max = entries[0]?.[1].revenueCents || 1;
  const donutHtml = entries.length > 1 ? `<div class="rpCatDonut">${donut(entries.map(([name, d]) => ({ label: name, value: d.revenueCents, color: d.color || "#64748b" })))}<div><strong>${currency(total)}</strong><span>${entries.length} categorias</span></div></div>` : "";
  setHtml("#execCategoryBars", donutHtml + (entries.length ? entries.map(([name, d]) => `<div class="rpRow"><div class="rpRowHead"><strong>${html(name)}</strong><span>${currency(d.revenueCents)} (${pctText(d.revenueCents, total)})</span></div>${bar(d.revenueCents, max, d.color || "var(--primary)")}</div>`).join("") : `<p class="muted">Sem vendas com categoria no período.</p>`) +
    (legacy ? `<p class="muted rpNote">${currency(legacy[1].revenueCents)} vieram do sistema anterior, que não informa a categoria. As categorias acima são das vendas feitas no sistema novo.</p>` : ""));
}

function renderPaymentMethods() {
  if (!report) return;
  const bm = report.byMethod || {}, fee = report.dre?.byFee || {};
  const methods = [["Dinheiro", "cash", "#15803d"], ["Pix", "pix", "#14b8a6"], ["Débito", "debit", "#2563eb"], ["Crédito", "credit", "#7c3aed"], ["Cartão (sem tipo)", "card", "#64748b"]].filter(([, key]) => bm[key] || key !== "card");
  const total = methods.reduce((sum, [, key]) => sum + (bm[key] || 0), 0);
  setHtml("#execPaymentMethods", total ? `<div class="rpPay">${donut(methods.map(([label, key, color]) => ({ label, value: bm[key] || 0, color })))}<div class="rpPayList">${methods.map(([name, key, color]) => `<div><i style="background:${color}"></i><span>${name}</span><strong>${currency(bm[key] || 0)}</strong><small>${pctText(bm[key] || 0, total)}${fee[key] ? ` · taxa ${currency(fee[key])}` : ""}</small></div>`).join("")}</div></div>` : `<p class="muted">Sem recebimentos no período.</p>`);
}

// ---- Ano a ano: 12 meses de cada ano lado a lado ----
let yearMode = "salesCents";
const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const YEAR_COLORS = ["var(--primary)", "#f2b705", "#64748b", "#2563eb", "#9333ea"];
function renderYearly() {
  const yearly = report?.yearly || {};
  const years = Object.keys(yearly).sort().reverse().slice(0, 5); // ano atual primeiro
  if (!years.length) { setHtml("#rpYearChart", `<p class="muted">Sem movimento.</p>`); return; }
  const fmt = v => yearMode === "count" ? String(v) : currency(v);
  const value = (y, m) => yearly[y][m][yearMode];
  const refDate = report.date || new Date().toISOString().slice(0, 10);
  const refYear = refDate.slice(0, 4), refMonth = Number(refDate.slice(5, 7)) - 1;
  const [cur, prev] = [years.find(y => y === refYear) || years[0], years.find(y => y < (years.find(z => z === refYear) || years[0]))];
  if (!prev) return renderLast12(yearly, refYear, refMonth, fmt);
  setTextSafe("#rpYearTitle", "Ano a ano: como a loja está indo mês a mês");
  // Acumulado do ano ate o mes de referencia, comparado com o mesmo periodo do ano anterior.
  const ytd = y => y ? yearly[y].slice(0, refMonth + 1).reduce((s, r) => s + r[yearMode], 0) : null;
  const yearTotal = y => yearly[y].reduce((s, r) => s + r[yearMode], 0);
  const best = MONTH_NAMES.map((name, m) => ({ name, v: value(cur, m) })).reduce((a, b) => b.v > a.v ? b : a);
  const monthsWith = yearly[cur].filter(r => r.salesCents || r.expensesCents).length || 1;
  setHtml("#rpYearSummary",
    kpi(`${cur} até ${MONTH_NAMES[refMonth]}`, fmt(ytd(cur)), prev ? `mesmo período de ${prev}: ${fmt(ytd(prev))}` : "primeiro ano com dados no sistema") +
    kpi(prev ? `Contra ${prev}` : "Comparação", prev && ytd(prev) ? `${ytd(cur) >= ytd(prev) ? "+" : ""}${Math.round((ytd(cur) - ytd(prev)) / Math.abs(ytd(prev)) * 100)}%` : "-", prev ? "no acumulado do ano" : "o ano anterior aparece aqui quando houver dados", prev && ytd(prev) ? (ytd(cur) >= ytd(prev) ? "good" : "bad") : "") +
    kpi("Média por mês", fmt(Math.round(yearTotal(cur) / monthsWith)), `${monthsWith} mês(es) com movimento em ${cur}`) +
    kpi("Melhor mês do ano", best.v ? best.name : "-", best.v ? fmt(best.v) : ""));

  // Barras agrupadas por mes: um ano em cada cor.
  const width = 900, height = 260, top = 18, bottom = 30, left = 10;
  const chartH = height - top - bottom, step = (width - left * 2) / 12;
  const shown = years.slice(0, 3);
  const all = shown.flatMap(y => yearly[y].map(r => r[yearMode]));
  const max = Math.max(1, ...all), min = Math.min(0, ...all);
  const y0 = top + chartH - (0 - min) / (max - min) * chartH;
  const bw = Math.min(26, (step - 8) / shown.length);
  let bars = "";
  MONTH_NAMES.forEach((name, m) => {
    shown.forEach((y, k) => {
      const v = value(y, m), h = Math.abs(v) / (max - min) * chartH;
      const x = left + m * step + (step - bw * shown.length) / 2 + k * bw;
      bars += `<rect x="${x.toFixed(1)}" y="${(v >= 0 ? y0 - h : y0).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${Math.max(v ? 1.5 : 0, h).toFixed(1)}" rx="2" fill="${YEAR_COLORS[k]}"${m > refMonth && y === refYear ? ' opacity=".25"' : ""}><title>${name}/${y}: ${fmt(v)}</title></rect>`;
    });
    bars += `<text x="${(left + m * step + step / 2).toFixed(1)}" y="${height - 10}" text-anchor="middle" font-size="12" fill="${m === refMonth ? "var(--text-main)" : "var(--text-muted)"}" font-weight="${m === refMonth ? 800 : 400}">${name}</text>`;
  });
  setHtml("#rpYearChart", `<div class="rpLegend">${shown.map((y, k) => `<span><i style="background:${YEAR_COLORS[k]}"></i>${y}</span>`).join("")}</div><svg viewBox="0 0 ${width} ${height}" class="rpSvg" role="img"><line x1="${left}" x2="${width - left}" y1="${y0}" y2="${y0}" stroke="var(--border)"/>${bars}</svg>`);

  // Tabela: mes x ano, com variacao contra o ano anterior.
  const head = ["Mês", ...years, ...(years.length > 1 ? [`${years[0]} x ${years[1]}`] : [])];
  const rows = MONTH_NAMES.map((name, m) => {
    const cells = years.map(y => `<td class="money">${value(y, m) ? fmt(value(y, m)) : '<span class="muted">-</span>'}</td>`).join("");
    const a = value(years[0], m), b = years[1] ? value(years[1], m) : 0;
    const diff = years.length > 1 ? `<td>${a && b ? delta(a, b, yearMode === "expensesCents") : '<span class="muted">-</span>'}</td>` : "";
    return `<tr class="${m === refMonth ? "rpCurrentRow" : ""}"><td><strong>${name}</strong></td>${cells}${diff}</tr>`;
  });
  rows.push(`<tr class="rpTotalRow"><td><strong>Total</strong></td>${years.map(y => `<td class="money"><strong>${fmt(yearTotal(y))}</strong></td>`).join("")}${years.length > 1 ? `<td>${delta(yearTotal(years[0]), yearTotal(years[1]), yearMode === "expensesCents")}</td>` : ""}</tr>`);
  setHtml("#rpYearTable", table(head, rows));
}
// Enquanto só existe um ano de dados, o comparativo anual não informa nada: mostra os últimos 12 meses.
function renderLast12(yearly, refYear, refMonth, fmt) {
  setTextSafe("#rpYearTitle", "Últimos 12 meses");
  const months = Array.from({ length: 12 }, (_, i) => {
    const back = 11 - i, m = (refMonth - back + 120) % 12, y = String(Number(refYear) - (refMonth - back < 0 ? 1 : 0));
    return { label: `${MONTH_NAMES[m]}/${y.slice(2)}`, v: yearly[y]?.[m]?.[yearMode] || 0, current: back === 0 };
  });
  const withData = months.filter(r => r.v);
  const total = months.reduce((s, r) => s + r.v, 0);
  const best = months.reduce((a, b) => b.v > a.v ? b : a);
  const last = months[11], before = months[10];
  setHtml("#rpYearSummary",
    kpi("Total em 12 meses", fmt(total), `${withData.length} ${withData.length === 1 ? "mês" : "meses"} com movimento`) +
    kpi("Média por mês", fmt(Math.round(total / (withData.length || 1))), "considerando só os meses com movimento") +
    kpi("Mês atual", fmt(last.v), before.v ? `mês anterior: ${fmt(before.v)}` : "sem dados do mês anterior", before.v ? (last.v >= before.v ? "good" : "bad") : "") +
    kpi("Melhor mês", best.v ? best.label : "-", best.v ? fmt(best.v) : ""));
  const width = 900, height = 240, top = 18, bottom = 30, left = 10, chartH = height - top - bottom, step = (width - left * 2) / 12;
  const max = Math.max(1, ...months.map(r => r.v)), min = Math.min(0, ...months.map(r => r.v));
  const y0 = top + chartH - (0 - min) / (max - min) * chartH, bw = Math.min(44, step - 14);
  const bars = months.map((r, i) => {
    const h = Math.abs(r.v) / (max - min) * chartH, x = left + i * step + (step - bw) / 2;
    return `<rect x="${x.toFixed(1)}" y="${(r.v >= 0 ? y0 - h : y0).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(r.v ? 1.5 : 0, h).toFixed(1)}" rx="3" fill="${r.current ? "#f2b705" : "var(--primary)"}"><title>${r.label}: ${fmt(r.v)}</title></rect>` +
      `<text x="${(left + i * step + step / 2).toFixed(1)}" y="${height - 10}" text-anchor="middle" font-size="12" fill="${r.current ? "var(--text-main)" : "var(--text-muted)"}" font-weight="${r.current ? 700 : 400}">${r.label}</text>`;
  }).join("");
  setHtml("#rpYearChart", `<svg viewBox="0 0 ${width} ${height}" class="rpSvg" role="img" aria-label="Últimos 12 meses"><line x1="${left}" x2="${width - left}" y1="${y0}" y2="${y0}" stroke="var(--border)"/>${bars}</svg><p class="muted rpNote">O comparativo ano a ano aparece quando houver dados de dois anos.</p>`);
  const rows = months.slice().reverse().map((r, i, arr) => `<tr class="${r.current ? "rpCurrentRow" : ""}"><td><strong>${r.label}</strong></td><td class="money">${r.v ? fmt(r.v) : '<span class="muted">-</span>'}</td><td>${r.v && arr[i + 1]?.v ? delta(r.v, arr[i + 1].v, yearMode === "expensesCents") : '<span class="muted">-</span>'}</td></tr>`);
  setHtml("#rpYearTable", table(["Mês", "Valor", "Contra o mês anterior"], rows));
}
document.addEventListener("click", event => {
  const btn = event.target.closest("#rpYearMode [data-ym]"); if (!btn) return;
  yearMode = btn.dataset.ym;
  document.querySelectorAll("#rpYearMode [data-ym]").forEach(b => b.classList.toggle("active", b === btn));
  renderYearly();
});

// Tabela paginada: 25 linhas por vez com botao "mostrar mais".
const pagedState = {};
function pagedTable(key, columns, rows, empty, size = 25, note = "") {
  const prev = pagedState[key];
  pagedState[key] = { columns, rows, empty, size, note, shown: prev && prev.rows.length === rows.length ? prev.shown : size };
  return renderPaged(key);
}
function renderPaged(key) {
  const s = pagedState[key], rest = s.rows.length - s.shown;
  return table(s.columns, s.rows.slice(0, s.shown), s.empty) +
    (rest > 0 ? `<div class="rpMoreRow"><button type="button" class="rpMore" data-more="${key}">Mostrar mais ${Math.min(rest, 50)}</button><span class="muted">${s.shown} de ${s.rows.length}</span></div>` : "") +
    (s.note ? `<p class="muted rpNote">${html(s.note)}</p>` : "");
}
document.addEventListener("click", event => {
  const key = event.target.closest("[data-more]")?.dataset.more; if (!key || !pagedState[key]) return;
  pagedState[key].shown += 50;
  setHtml(`#${key}`, renderPaged(key));
});

function renderReport() {
  if (!report) return;
  const r = report, dre = r.dre || {};
  const periodName = { today: "hoje", month: "no mês", "7d": "nos últimos 7 dias", "15d": "nos últimos 15 dias", "30d": "nos últimos 30 dias", "60d": "nos últimos 60 dias", "90d": "nos últimos 90 dias", all: "desde o início" }[r.period] || "";
  const rangeText = r.period === "all" ? "Todo o histórico" : r.range?.start === r.range?.end ? dayLabel(r.range.start) : `${dayLabel(r.range.start)} a ${dayLabel(r.range.end)}`;
  setTextSafe("#reportRangeLabel", `Período: ${rangeText} · números reais das vendas, despesas, caixa e estoque`);

  // ---- Visao geral ----
  renderOverview();
  renderExecChart();
  renderCategoryBars();
  renderPaymentMethods();
  renderDRE();
  renderPrintAudit();
  renderHourlyPeak();
  renderSecurityAudit();

  // ---- Vendas e Curva ABC ----
  const abc = r.abc || [];
  const classSum = cls => abc.filter(row => row.abcClass === cls).reduce((sum, row) => sum + row.amountCents, 0);
  const abcTotal = abc.reduce((sum, row) => sum + row.amountCents, 0);
  setHtml("#rpAbcSummary", ["A", "B", "C"].map(cls => kpi(`Classe ${cls}`, `${abc.filter(row => row.abcClass === cls).length} itens`, `${currency(classSum(cls))} (${pctText(classSum(cls), abcTotal)} do faturamento)`, cls === "A" ? "good" : cls === "B" ? "warn" : "")).join(""));
  renderAbc();
  const maxHour = Math.max(1, ...(r.byHour || []).map(row => row.count));
  const busiest = (r.byHour || []).filter(row => row.count).sort((a, b) => b.count - a.count)[0];
  setHtml("#reportHours", (busiest ? `<p class="muted">Maior movimento às <strong>${String(busiest.hour).padStart(2, "0")}h</strong>: reforce troco e atendimento nesse horário.</p>` : "") +
    barChart((r.byHour || []).filter(row => row.hour >= 7 && row.hour <= 21), { value: row => row.count, label: row => `${String(row.hour).padStart(2, "0")}h`, title: row => `${row.hour}h: ${row.count} vendas, ${currency(row.salesCents)}`, height: 230, average: false, width: 480 }));
  setHtml("#reportWeekdays", table(["Dia", "Vendas", "Faturamento", "Média por dia", ""], (r.byWeekday || []).map(row => `<tr><td>${row.name}</td><td>${row.count}</td><td class="money">${currency(row.salesCents)}</td><td class="money">${row.days ? currency(Math.round(row.salesCents / row.days)) : "-"}</td><td style="width:30%">${bar(row.days ? row.salesCents / row.days : 0, Math.max(1, ...(r.byWeekday || []).map(x => x.days ? x.salesCents / x.days : 0)))}</td></tr>`), "Sem vendas."));
  const maxBand = Math.max(1, ...(r.ticketBands || []).map(b => b.count));
  const totalBand = (r.ticketBands || []).reduce((sum, b) => sum + b.count, 0);
  setHtml("#rpTicket", (r.ticketBands || []).map(b => `<div class="rpRow"><div class="rpRowHead"><strong>${b.max === null ? `Acima de ${currency(b.min)}` : `${currency(b.min)} a ${currency(b.max)}`}</strong><span>${b.count} vendas (${pctText(b.count, totalBand)}) · ${currency(b.salesCents)}</span></div>${bar(b.count, maxBand, "var(--accent)")}</div>`).join("") +
    (totalBand ? `<p class="muted">Ticket médio: <strong>${currency(r.averageTicketCents)}</strong>. Vender um item a mais por atendimento (envelope, plastificação, bebida) é o jeito mais rápido de subir o faturamento.</p>` : ""));
  setHtml("#rpLegacy", pagedTable("rpLegacy", ["Serviço", "Unidades", "Valor estimado"], (r.legacyUnits || []).map(row => `<tr><td>${html(row.name)} <span class="muted">#${html(row.code || "")}</span></td><td>${row.units}</td><td class="money">${currency(row.estimatedCents)}</td></tr>`), "Sem histórico."));

  // ---- Caixa ----
  setHtml("#reportMetrics", kpi("Vendas", currency(r.salesCents)) + kpi("Recebido", currency(r.receivedCents)) + kpi("Sessões encerradas", String(r.sessions)) + kpi("Tempo de máquina usado", `${Math.round((r.minutes || 0) / 60)} h`, `${r.minutes || 0} min`));
  const cash = r.cash || {};
  setHtml("#rpCash", kpi("Sangrias", currency(cash.withdrawalsCents)) + kpi("Suprimentos", currency(cash.suppliesCents)) + kpi("Faltas no caixa", currency(-cash.shortCents || 0), "", cash.shortCents ? "bad" : "") + kpi("Sobras no caixa", currency(cash.overCents), "", cash.overCents ? "warn" : ""));
  const shiftsHtml = table(["Abertura", "Fechamento", "Operador", "Esperado", "Contado", "Diferença"], (state?.cashShifts || []).map(s => {
    const expected = s.closingExpectedCents ?? s.expectedCashCents ?? null, counted = s.closingCountedCents ?? s.countedCashCents ?? null;
    const diff = expected !== null && counted !== null ? counted - expected : null;
    return `<tr><td>${dateTime(s.openedAt)}</td><td>${s.closedAt ? dateTime(s.closedAt) : '<span class="statusBadge active">Aberto</span>'}</td><td>${html(s.closedBy || s.openedBy || "-")}</td><td class="money">${expected !== null ? currency(expected) : "-"}</td><td class="money">${counted !== null ? currency(counted) : "-"}</td><td class="money ${diff < 0 ? "bad" : diff > 0 ? "warn" : ""}">${diff === null ? "-" : diff === 0 ? "Exato" : currency(diff)}</td></tr>`;
  }), "Nenhum caixa registrado.");
  setHtml("#reportCashShiftsWrap", shiftsHtml);
  setHtml("#reportAdjustments", pagedTable("reportAdjustments", ["Data", "Tipo", "Motivo", "Valor", "Operador"], (state?.cashAdjustments || []).map(a => `<tr><td>${dateTime(a.at)}</td><td>${a.direction === "in" ? "Suprimento" : "Sangria"}</td><td>${html(a.reason || "-")}</td><td class="money">${currency(a.amountCents)}</td><td>${html(a.operator || "-")}</td></tr>`), "Nenhuma sangria ou suprimento."));
  const chargeTerm = ($("#rpChargeSearch")?.value || "").trim().toLowerCase();
  const chargeRows = (r.charges || []).filter(item => !chargeTerm || String(item.description).toLowerCase().includes(chargeTerm));
  setHtml("#reportCharges", pagedTable("reportCharges", ["Data", "Descrição", "Valor", "Pago"], chargeRows.map(item => `<tr><td>${dateTime(item.at)}</td><td>${txt(item.description)}</td><td class="money">${currency(item.amountCents)}</td><td class="money">${currency(item.paidCents)}</td></tr>`), "Nenhum lançamento encontrado.", 25, r.salesCount > (r.charges || []).length ? `Mostrando as ${(r.charges || []).length} vendas mais recentes de ${r.salesCount}; os totais consideram todas.` : ""));

  // ---- Clientes e fiado ----
  setHtml("#rpAging", (r.agingBuckets || []).map((b, i) => kpi(b.label, currency(b.dueCents), `${b.count} pendência(s)`, b.dueCents && i >= 2 ? "bad" : b.dueCents && i === 1 ? "warn" : "")).join(""));
  setHtml("#reportOpenCharges", pagedTable("reportOpenCharges", ["Data", "Descrição", "Cliente", "Dias", "Falta receber", "Ação"], (r.openCharges || []).map(row => {
    const c = row.clientId && state?.clients?.find(x => x.id === row.clientId);
    const link = c?.phone ? whatsappLink(c.phone, c.name, row.dueCents, row.description) : "";
    return `<tr><td>${dateTime(row.at)}</td><td>${txt(row.description)}</td><td>${html(row.clientName || "-")}</td><td>${Math.floor((Date.now() - Date.parse(row.at)) / 86400000)}</td><td class="money">${currency(row.dueCents)}</td><td>${link ? `<a class="waButton small" href="${link}" target="_blank" rel="noopener">Cobrar WhatsApp</a>` : '<span class="muted">Sem tel.</span>'}</td></tr>`;
  }), "Nenhuma pendência."));
  setHtml("#rpClients", table(["Cliente", "Compras", "Total comprado", "Deve", "Última compra"], (r.clients || []).map(c => `<tr><td>${html(c.name)}</td><td>${c.count}</td><td class="money">${currency(c.salesCents)}</td><td class="money ${c.dueCents ? "bad" : ""}">${currency(c.dueCents)}</td><td>${dateTime(c.lastAt)}</td></tr>`), "Nenhuma venda com cliente identificado. Selecione o cliente no caixa para acompanhar quem mais compra."));

  // ---- Estoque ----
  const st = r.stock || {};
  setHtml("#rpStock", kpi("Mercadoria em estoque (custo)", st.valueCents ? currency(st.valueCents) : "sem custo", st.withoutCost ? `${st.withoutCost} item(ns) com estoque ainda sem preço de custo` : "pelo preço de custo cadastrado", st.valueCents ? "" : "warn") + kpi("Mesmo estoque a preço de venda", currency(st.saleValueCents), "quanto entra se vender tudo") + kpi("Para repor", String(r.lowStockCount || 0), `${st.negative || 0} negativos · ${(r.lowStock || []).filter(x => x.stock === 0).length} zerados`, r.lowStockCount ? "warn" : "") + kpi("Produtos sem preço de custo", String(st.withoutCostProducts || 0), "cadastre em Catálogo ou pela nota fiscal", st.withoutCostProducts ? "warn" : ""));
  const situation = row => row.stock < 0 ? '<span class="rpTag bad">Negativo</span>' : row.stock === 0 ? '<span class="rpTag warn">Zerado</span>' : '<span class="rpTag">Abaixo do mínimo</span>';
  // Sugestao: voltar ao dobro do minimo (minimo 5 quando nao cadastrado); negativo indica venda sem entrada de nota.
  const suggestion = row => Math.max(0, Math.max(row.minStock || 5, 5) * 2 - Math.max(row.stock, 0));
  setHtml("#reportLowStock", pagedTable("reportLowStock", ["Código", "Produto", "Situação", "Estoque", "Mínimo", "Comprar"], (r.lowStock || []).map(row => `<tr><td>${html(row.code || "-")}</td><td>${html(row.name)}</td><td>${situation(row)}</td><td class="${row.stock < 0 ? "bad" : ""}"><strong>${row.stock}</strong></td><td>${row.minStock}</td><td><strong>${suggestion(row)}</strong></td></tr>`), "Nenhum produto para repor.", 25, "Estoque negativo quase sempre é mercadoria que entrou sem nota: dê entrada pela nota fiscal em Catálogo & Estoque."));
  setHtml("#rpStale", pagedTable("rpStale", ["Código", "Produto", "Estoque", "Valor parado (custo)"], (st.stale || []).map(row => `<tr><td>${html(row.code || "-")}</td><td>${html(row.name)}</td><td>${row.stock}</td><td class="money">${row.valueCents === null ? '<span class="muted">sem custo</span>' : currency(row.valueCents)}</td></tr>`), "Nenhuma mercadoria parada."));

  // ---- Maquinas e equipe ----
  setHtml("#reportMachines", table(["Estação", "Sessões", "Horas de uso", "Faturamento de tempo", "Por hora de uso"], (r.byMachine || []).map(m => `<tr><td>${html(m.name || m.machineId)}</td><td>${m.count}</td><td>${(m.minutes / 60).toFixed(1).replace(".", ",")}</td><td class="money">${currency(m.revenueCents || 0)}</td><td class="money">${m.minutes ? currency(Math.round((m.revenueCents || 0) / (m.minutes / 60))) : "-"}</td></tr>`), "Sem uso de máquinas no período."));
  setHtml("#reportOperators", table(["Atendente", "Recebimentos", "Valor"], (r.byOperator || []).map(item => `<tr><td>${html(item.name)}</td><td>${item.payments}</td><td class="money">${currency(item.receivedCents)}</td></tr>`), "Sem recebimentos no período."));
}

function renderPrintAudit() {
  if (!report) return;
  const p = report.printAudit || {};
  const reamsText = p.paperReamsEst > 0 ? `~${String(p.paperReamsEst).replace(".", ",")} resma(s)` : "menos de 1 resma";

  setHtml("#rpPrintAuditGrid",
    kpi("Páginas P&B (Impressão + Cópia)", `${p.bwPages || 0} págs`, currency(p.bwRevenueCents || 0), "good") +
    kpi("Páginas Coloridas", `${p.colorPages || 0} págs`, currency(p.colorRevenueCents || 0), p.colorPages ? "warn" : "") +
    kpi("Total de Folhas Impressas", `${p.totalPages || 0} folhas`, reamsText, "good") +
    kpi("Faturamento Gráfico", currency(p.totalGraphicRevenueCents || 0), `${p.xeroxCount || 0} cópias/xerox · ${p.scanCount || 0} scans · ${p.laminationCount || 0} plastif.`)
  );

  const startEl = $("#reconPrinterStart");
  const endEl = $("#reconPrinterEnd");
  if (startEl && !startEl.value && localStorage.getItem("reconPrinterStart")) startEl.value = localStorage.getItem("reconPrinterStart");
  if (endEl && !endEl.value && localStorage.getItem("reconPrinterEnd")) endEl.value = localStorage.getItem("reconPrinterEnd");
  updatePrinterRecon();
}

function updatePrinterRecon() {
  const p = report?.printAudit || {};
  const startVal = $("#reconPrinterStart")?.value;
  const endVal = $("#reconPrinterEnd")?.value;
  const start = Number(startVal);
  const end = Number(endVal);
  const diffEl = $("#reconDiffDisplay");
  const badgeEl = $("#reconAuditBadge");
  const noteEl = $("#reconNoteText");

  if (!startVal || !endVal || isNaN(start) || isNaN(end) || end < start) {
    if (diffEl) diffEl.textContent = "-";
    if (badgeEl) {
      badgeEl.textContent = "Aguardando contadores";
      badgeEl.className = "rpBadge";
    }
    if (noteEl) noteEl.textContent = "Digite o número inicial e final do visor da impressora física (ex: ao abrir e fechar a loja).";
    return;
  }

  const machineDiff = end - start;
  const systemPages = p.totalPages || 0;
  const divergence = machineDiff - systemPages;

  if (diffEl) diffEl.textContent = `${machineDiff} folhas`;

  if (divergence === 0) {
    if (badgeEl) {
      badgeEl.textContent = "100% Conciliado";
      badgeEl.className = "rpBadge good";
    }
    if (noteEl) noteEl.innerHTML = `<strong>Perfeito:</strong> As ${machineDiff} folhas impressas na máquina física batem <strong>exatamente</strong> com as ${systemPages} folhas registradas no sistema!`;
  } else if (divergence > 0) {
    if (badgeEl) {
      badgeEl.textContent = `Divergência: +${divergence} folhas na máquina`;
      badgeEl.className = "rpBadge bad";
    }
    if (noteEl) noteEl.innerHTML = `<strong class="bad">Atenção para conferir:</strong> Saíram <strong>${machineDiff}</strong> folhas na impressora, mas o caixa registrou <strong>${systemPages}</strong> folhas. Há <strong>${divergence} folha(s)</strong> impressas sem cobrança registrada!`;
  } else {
    if (badgeEl) {
      badgeEl.textContent = `ℹ️ ${Math.abs(divergence)} folhas a menos no visor`;
      badgeEl.className = "rpBadge warn";
    }
    if (noteEl) noteEl.innerHTML = `O visor marcou ${machineDiff} folhas contra ${systemPages} registradas no caixa (possível cancelamento ou teste de impressão).`;
  }
}

function renderHourlyPeak() {
  if (!report) return;
  const hp = report.hourlyPeak || {};
  const peak = hp.peakHour;
  const slow = hp.slowHour;
  const dayparts = hp.dayparts || [];
  const maxPart = Math.max(1, ...dayparts.map(d => d.salesCents));

  const peakBadge = $("#rpHourlyPeakBadge");
  if (peakBadge) {
    peakBadge.textContent = peak ? `Pico: ${peak.label}` : "Sem dados";
    peakBadge.className = "rpBadge good";
  }

  setHtml("#rpHourlyDayparts", dayparts.map(dp => `
    <div class="rpHourlyDaypartCard">
      <div class="rpHourlyDaypartHead"><span>${dp.icon} ${html(dp.name)}</span><span>${dp.range}</span></div>
      <strong>${currency(dp.salesCents)}</strong>
      <small>${dp.count} venda(s) realizada(s)</small>
      ${bar(dp.salesCents, maxPart, "var(--primary)")}
    </div>
  `).join(""));

  const peakInfo = peak ? `
    <div class="peakBadge">Horário de Pico: ${peak.label}</div>
    <span>Maior concentração de faturamento do período: <strong>${currency(peak.salesCents)}</strong> em <strong>${peak.count} vendas</strong>. Reforce troco, papel na impressora e atendimento rápido neste horário.</span>
    ${slow ? `<span class="muted" style="margin-left:auto">Horário mais calmo: <strong>${slow.label}</strong> (${slow.count} vendas). Ideal para serviços longos e manutenções.</span>` : ""}
  ` : `<span class="muted">Sem movimentação no período para definir horários de pico.</span>`;
  setHtml("#rpHourlyPeakInfo", peakInfo);
}

function renderSecurityAudit() {
  if (!report) return;
  const sec = report.securityAudit || {};

  setHtml("#rpSecurityKpis",
    kpi("Descontos Concedidos", currency(sec.totalDiscountCents || 0), `${sec.discountCount || 0} venda(s) com desconto`, sec.totalDiscountCents ? "warn" : "") +
    kpi("Quebra de Caixa (Faltas)", currency(Math.abs(sec.totalShortCents || 0)), "diferença negativa em fechamentos", sec.totalShortCents ? "bad" : "good") +
    kpi("Sobra de Caixa", currency(sec.totalOverCents || 0), "diferença positiva em fechamentos", sec.totalOverCents ? "warn" : "") +
    kpi("Cancelamentos", currency(sec.totalCancelledCents || 0), `${(sec.cancelledCharges || []).length} cobrança(s) canceladas`, sec.totalCancelledCents ? "bad" : "")
  );

  // Tabela de operadores: diferencas e quebras
  const opShifts = sec.shiftsByOperator || [];
  setHtml("#rpOperatorSecurityTable", table(
    ["Atendente", "Turnos", "Exatos", "Faltas", "Sobras", "Saldo Líquido"],
    opShifts.map(op => {
      const netCls = op.netDiffCents < 0 ? "bad" : op.netDiffCents > 0 ? "warn" : "good";
      return `<tr>
        <td><strong>${html(op.operator)}</strong></td>
        <td>${op.shiftsCount}</td>
        <td>${op.exactCount}</td>
        <td class="money ${op.shortCents < 0 ? "bad" : ""}">${currency(Math.abs(op.shortCents))}</td>
        <td class="money ${op.overCents > 0 ? "warn" : ""}">${currency(op.overCents)}</td>
        <td class="money ${netCls}"><strong>${op.netDiffCents === 0 ? "Exato" : currency(op.netDiffCents)}</strong></td>
      </tr>`;
    }),
    "Nenhum fechamento registrado por atendente no período."
  ));

  // Tabela de descontos por operador
  const opDiscounts = sec.discountsByOperator || [];
  setHtml("#rpOperatorDiscountsTable", table(
    ["Atendente", "Vendas c/ Desconto", "Total Descontado", "Volume Vendas"],
    opDiscounts.map(op => `<tr>
      <td><strong>${html(op.operator)}</strong></td>
      <td>${op.count}</td>
      <td class="money bad"><strong>${currency(op.totalDiscountCents)}</strong></td>
      <td class="money">${currency(op.totalSalesCents)}</td>
    </tr>`),
    "Nenhum desconto concedido no período."
  ));

  // Cobrancas canceladas
  const cancellations = sec.cancelledCharges || [];
  setHtml("#rpCancelledChargesTable", table(
    ["Data Cancelamento", "Atendente", "Descrição", "Motivo", "Valor Cancelado"],
    cancellations.map(c => `<tr>
      <td>${dateTime(c.at)}</td>
      <td><strong>${html(c.cancelledBy)}</strong></td>
      <td>${txt(c.description)}</td>
      <td><span class="muted">${html(c.cancelReason)}</span></td>
      <td class="money bad"><strong>${currency(c.cancelledCents)}</strong></td>
    </tr>`),
    "Nenhum cancelamento de pendência ou venda no período."
  ));
}

let abcSearchTerm = "";
function renderAbc() {
  if (!report) return;
  const s = report.abcSummary || {};
  const abc = report.abc || [];

  setHtml("#rpAbcAdvice", `
    <div class="rpAbcAdviceBox A">
      <strong>Classe A (80% da receita) · ${s.A?.count || 0} itens</strong>
      ${s.A?.tip || "Itens vitais. Nunca podem faltar estoque ou manutenção."}
    </div>
    <div class="rpAbcAdviceBox B">
      <strong>Classe B (15% da receita) · ${s.B?.count || 0} itens</strong>
      ${s.B?.tip || "Itens de giro intermediário. Mantenha compras regulares equilibradas."}
    </div>
    <div class="rpAbcAdviceBox C">
      <strong>Classe C (5% da receita) · ${s.C?.count || 0} itens</strong>
      ${s.C?.tip || "Itens da cauda longa. Evite manter capital parado."}
    </div>
  `);

  const term = abcSearchTerm.trim().toLowerCase();
  const rows = abc.filter(row => (!abcFilter || row.abcClass === abcFilter) && (!term || String(row.name).toLowerCase().includes(term) || String(row.productId || "").toLowerCase().includes(term)));
  const productById = new Map((state?.products || []).map(p => [p.id, p]));
  const admin = state?.user?.role === "admin";
  setHtml("#rpAbc", pagedTable("rpAbc", ["Classe", "Produto / serviço", "Qtd", "Faturamento", "% acumulado", "Custo", "Lucro", "Margem", "Estratégia"], rows.map(row => {
    const product = productById.get(row.productId);
    const margin = row.profitCents !== null && row.amountCents ? Math.round(row.profitCents / row.amountCents * 100) : null;
    const strategy = !product ? '<span class="muted">-</span>' : `<select data-strategy="${html(product.id)}" ${admin ? "" : "disabled"}>${STRATEGIES.map(s => `<option value="${html(s)}" ${s === (product.strategy || "") ? "selected" : ""}>${s || "Definir..."}</option>`).join("")}</select>`;
    return `<tr><td><span class="rpClass ${row.abcClass}">Classe ${row.abcClass}</span></td><td><strong>${html(row.name)}</strong>${product?.code ? ` <span class="muted">#${html(product.code)}</span>` : ""}</td><td>${row.quantity}</td><td class="money">${currency(row.amountCents)}</td><td>${String(row.cumulative).replace(".", ",")}%</td><td class="money">${row.costCents === null ? '<span class="muted">sem custo</span>' : currency(row.costCents)}</td><td class="money">${row.profitCents === null ? "-" : currency(row.profitCents)}</td><td class="${margin !== null && margin < 20 ? "bad" : ""}">${margin === null ? "-" : `${margin}%`}</td><td>${strategy}</td></tr>`;
  }), "Nenhum produto encontrado nesta classe ou busca."));
}

function renderDRE() {
  if (!report) return;
  const r = report, dre = r.dre || {};
  const net = dre.netCents || 0, sales = r.salesCents || 0;
  const line = (label, value, cls = "", note = "") => `<tr class="${cls}"><td>${label}${note ? `<small>${note}</small>` : ""}</td><td class="money">${currency(value)}</td><td class="pct">${pctText(Math.abs(value), dre.grossCents || sales)}</td></tr>`;
  const uncosted = (dre.uncostedRevenueCents || 0) + (dre.legacyCents || 0);
  const cmvNote = dre.printCmvCents ? `R$ ${(dre.printCmvCents / 100).toFixed(2)} papel/tinta + R$ ${(dre.productCmvCents / 100).toFixed(2)} mercadorias` : `custo cadastrado cobre ${pctText(dre.costedRevenueCents || 0, sales)} das vendas`;

  setHtml("#rpDre", `<table class="rpDre"><tbody>
    ${line("(+) Receita bruta", dre.grossCents, "strong", "vendas pelo preço de tabela")}
    ${line("(-) Descontos concedidos", -(dre.discountCents || 0), "neg")}
    ${line("(-) Taxas de cartão e Pix", -(dre.feesCents || 0), "neg", (state?.settings?.feeDebitPct || state?.settings?.feeCreditPct) ? "pelas taxas cadastradas" : "cadastre as taxas em Metas e taxas")}
    ${line("(=) Receita líquida operacional", net, "sub")}
    ${line("(-) Custo das mercadorias e papel (CMV)", -(dre.cmvCents || 0), "neg", cmvNote)}
    ${line("(=) Lucro bruto operacional", dre.grossProfitCents, "sub", `Margem bruta: ${dre.grossMarginPct || 0}%`)}
    ${dre.incomesCents ? line("(+) Comissões e outras receitas", dre.incomesCents, "", "Speed Financeira e receitas fora do caixa") : ""}
    ${line("(-) Despesas operacionais do período", -(dre.expensesCents || 0), "neg", "aluguel, energia, internet, salários...")}
    ${line("(=) Resultado líquido do período", dre.profitCents, `total ${dre.profitCents >= 0 ? "good" : "bad"}`, `Margem líquida real: ${dre.netMarginPct || 0}%`)}
    ${dre.ownerDrawCents ? line("(-) Retiradas do dono", -dre.ownerDrawCents, "neg", "sua parte do lucro (Pix para a conta pessoal)") + line("(=) Sobra na loja após retiradas", dre.profitCents - dre.ownerDrawCents, `sub ${dre.profitCents - dre.ownerDrawCents >= 0 ? "good" : "bad"}`, "o que fica para reserva e investimento") : ""}
  </tbody></table>`);

  const covPct = dre.coveragePct || 0;
  setHtml("#rpCmvCoverage", `
    <div class="rpCmvCoverageHead">
      <span>Auditabilidade dos Custos</span>
      <strong class="${covPct >= 80 ? "good" : covPct >= 50 ? "warn" : "bad"}">${covPct}% do faturamento com custo real auditado</strong>
    </div>
    ${bar(dre.costedRevenueCents || 0, sales || 1, covPct >= 80 ? "var(--primary)" : "var(--accent)")}
  `);

  setHtml("#rpIncomes", (r.incomes || []).length ? table(["Data", "Descrição", "Valor", ""], r.incomes.map(i => `<tr><td>${new Date(i.at).toLocaleDateString("pt-BR")}</td><td>${html(i.description)} <span class="muted">${html(i.category)}</span></td><td class="money">${currency(i.amountCents)}</td><td>${state?.user?.role === "admin" ? `<button data-income-del="${i.id}">Excluir</button>` : ""}</td></tr>`)) : "");
  const banks = r.bankPerformance || [];
  setHtml("#rpBankPerformance", banks.length ? table(["Banco Parceiro / Operação", "Contratos / Lançamentos", "Comissão Total", "Ticket Médio"], banks.map(b => `<tr><td><strong>${html(b.name)}</strong></td><td>${b.count}</td><td class="money good"><strong>${currency(b.totalCents)}</strong></td><td class="money">${currency(b.avgTicketCents)}</td></tr>`)) : '<p class="muted">Nenhuma comissão de banco parceiro registrada no período.</p>');
  setTextSafe("#rpMktSpendDisplay", currency(dre.marketingSpendCents || 0));
  setTextSafe("#rpMktCommissionDisplay", currency(dre.marketingCommissionCents || 0));
  setTextSafe("#dreNote", uncosted ? `${currency(uncosted)} das vendas não têm custo conhecido (${currency(dre.legacyCents || 0)} do sistema anterior, sem itens, e ${currency(dre.uncostedRevenueCents || 0)} de produtos sem preço de custo). Nelas o custo entra como zero, então o resultado real é menor.` : "Custos 100% integrados aos produtos e configurações.");
  const badge = $("#dreHealthBadge");
  if (badge) {
    const incomplete = sales > 0 && uncosted > sales * 0.2;
    badge.textContent = incomplete ? "Custo incompleto" : dre.profitCents >= 0 ? "Resultado positivo" : "Resultado negativo";
    badge.className = `rpBadge ${incomplete ? "warn" : dre.profitCents >= 0 ? "good" : "bad"}`;
  }

  const be = r.breakEven || {};
  setHtml("#rpBreakEven", `<div class="rpGoalGrid">
    <div><span>Despesas médias por mês</span><strong>${be.avgExpensesCents ? currency(be.avgExpensesCents) : "-"}</strong></div>
    <div><span>Margem de contribuição</span><strong>${be.contributionPct === null ? "-" : `${String(be.contributionPct).replace(".", ",")}%`}</strong></div>
    <div><span>Ponto de equilíbrio</span><strong>${be.breakEvenCents ? currency(be.breakEvenCents) : "-"}</strong></div>
  </div><p class="muted">${be.breakEvenCents ? (be.reliable ? "Quanto a loja precisa vender por mês para pagar custos e despesas." : "Estimativa: poucos produtos com custo cadastrado. Use o simulador abaixo com a sua margem real.") : "Lance as despesas e cadastre o custo dos produtos para calcular. Use o simulador abaixo enquanto isso."}</p>`);
  const expRange = $("#simExpensesRange"), marginRange = $("#simMarginRange");
  if (expRange && be.avgExpensesCents && !expRange.dataset.touched) expRange.value = Math.min(15000, Math.max(500, Math.round(be.avgExpensesCents / 100)));
  if (marginRange && be.contributionPct > 0 && !marginRange.dataset.touched) marginRange.value = Math.min(90, Math.max(5, Math.round(be.contributionPct)));
  updateBreakEven();

  const monthly = r.monthly || [];
  const active = monthly.filter(m => m.salesCents || m.expensesCents);
  const sumOf = key => active.reduce((s, m) => s + m[key], 0);
  const best = active.reduce((a, m) => !a || m.resultCents > a.resultCents ? m : a, null);
  setHtml("#rpMonthlySummary", active.length ? kpi("Receitas (12 meses)", currency(sumOf("salesCents")), `média ${currency(Math.round(sumOf("salesCents") / active.length))}/mês`) +
    kpi("Custos e despesas", currency(sumOf("cmvCents") + sumOf("feesCents") + sumOf("expensesCents")), `média ${currency(Math.round((sumOf("cmvCents") + sumOf("feesCents") + sumOf("expensesCents")) / active.length))}/mês`, "bad") +
    kpi("Resultado", currency(sumOf("resultCents")), `margem ${pctText(sumOf("resultCents"), sumOf("salesCents"))}`, sumOf("resultCents") >= 0 ? "good" : "bad") +
    kpi("Melhor mês", best ? monthLabel(best.month) : "-", best ? `resultado ${currency(best.resultCents)}` : "") : "");
  setHtml("#rpMonthlyChart", monthlyChart(monthly));
  setHtml("#rpMonthly", table(["Mês", "Vendas", "Custo (CMV)", "Taxas", "Despesas", "Resultado", "Margem"], monthly.filter(m => m.salesCents || m.expensesCents).map(m => `<tr><td>${monthLabel(m.month)}</td><td class="money">${currency(m.salesCents)}</td><td class="money">${currency(m.cmvCents)}</td><td class="money">${currency(m.feesCents)}</td><td class="money">${currency(m.expensesCents)}</td><td class="money ${m.resultCents < 0 ? "bad" : "good"}"><strong>${currency(m.resultCents)}</strong></td><td>${pctText(m.resultCents, m.salesCents)}</td></tr>`), "Sem movimento nos últimos 12 meses."));

  const admin = state?.user?.role === "admin";
  const fileLink = item => item.fileId ? `<a href="/api/expenses/${encodeURIComponent(item.id)}/file" target="_blank" rel="noopener">PDF</a>` : "";
  setHtml("#rpPayables", table(["Vencimento", "Categoria", "Descrição", "Valor", "", ""], (r.payables || []).map(item => {
    const late = new Date(item.at) < new Date(new Date().toDateString());
    return `<tr><td class="${late ? "bad" : ""}">${new Date(item.at).toLocaleDateString("pt-BR")}${late ? " (vencida)" : ""}</td><td>${html(item.category)}</td><td>${html(item.description)}</td><td class="money">${currency(item.amountCents)}</td><td>${fileLink(item)}</td><td>${admin ? `<button data-expense-pay="${item.id}">Marcar paga</button>` : ""}</td></tr>`;
  }), "Nenhuma conta a pagar."));
  const cats = Object.entries(r.byExpenseCategory || {}).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] || 1;
  setHtml("#rpExpenseCats", cats.length ? cats.map(([name, value]) => `<div class="rpRow"><div class="rpRowHead"><strong>${html(name)}</strong><span>${currency(value)} (${pctText(value, r.expensesCents)})</span></div>${bar(value, maxCat, "var(--danger-accent)")}</div>`).join("") : `<p class="muted">Nenhuma despesa no período.</p>`);
  setHtml("#expenseList", table(["Data", "Categoria", "Descrição", "Valor", "Situação", ""], (r.expenses || []).map(item => `<tr><td>${new Date(item.at).toLocaleDateString("pt-BR")}</td><td>${html(item.category)}</td><td>${html(item.description)} ${fileLink(item)}</td><td class="money">${currency(item.amountCents)}</td><td>${item.paid === false ? '<span class="bad">A pagar</span>' : "Paga"}</td><td>${admin && !item.legacy ? `<button data-expense-delete="${item.id}">Excluir</button>` : ""}</td></tr>`), "Nenhuma despesa lançada no período."));
}

function updateBreakEven() {
  const exp = Number($("#simExpensesRange")?.value) || 0, margin = Number($("#simMarginRange")?.value) || 1;
  setTextSafe("#simExpensesDisplay", currency(exp * 100));
  setTextSafe("#simMarginDisplay", `${margin}%`);
  setTextSafe("#simBreakEvenResult", currency(Math.round(exp / (margin / 100)) * 100));
}

function expenseFields(values = {}) {
  return select("category", "Categoria", EXPENSE_CATEGORIES.map(name => [name, name]), values.category || "Aluguel") +
    field("description", "Descrição", "text", values.description || "", 'maxlength="120"') +
    field("amount", "Valor (R$)", "number", values.amountCents ? (values.amountCents / 100).toFixed(2) : "", 'min="0.01" step="0.01" required') +
    field("date", "Data do vencimento", "date", values.dueDate || expToday(), "required") +
    select("paid", "Situação", [["false", "A pagar"], ["true", "Já paga"]], values.paid === true ? "true" : "false") +
    expensePaymentField(values) +
    (values.fileId ? `<input type="hidden" name="fileId" value="${html(values.fileId)}">` : "");
}
function saveExpense(values) { return api("/api/expenses", { ...values, paid: values.paid === "true" }).then(() => loadReport()); }

function openFinanceSettings() {
  const s = state?.settings || {};
  const pct = v => String(v ?? 0);
  openModal("Metas e taxas",
    field("monthGoal", "Meta de vendas do mês (R$)", "number", ((s.monthGoalCents || 0) / 100).toFixed(2), 'min="0" step="0.01" required') +
    field("finContractGoal", "Meta da Speed Financeira: valor dos contratos fechados no mês (R$)", "number", ((s.finContractGoalCents || 0) / 100).toFixed(2), 'min="0" step="0.01"') +
    field("dailyGoal", "Meta de vendas por dia (R$)", "number", ((s.dailyGoalCents || 0) / 100).toFixed(2), 'min="0" step="0.01" required') +
    select("workDays", "Dias de funcionamento por semana", [["6", "6 (fecha domingo)"], ["7", "7 (todos os dias)"], ["5", "5 (fecha sábado e domingo)"]], String(s.workDays || 6)) +
    field("feeDebit", "Taxa do débito (%)", "number", pct(s.feeDebitPct), 'min="0" max="20" step="0.01"') +
    field("feeCredit", "Taxa do crédito (%)", "number", pct(s.feeCreditPct), 'min="0" max="20" step="0.01"') +
    field("feeCard", "Taxa de cartão sem tipo (%)", "number", pct(s.feeCardPct), 'min="0" max="20" step="0.01"') +
    field("feePix", "Taxa do Pix (%)", "number", pct(s.feePixPct), 'min="0" max="20" step="0.01"') +
    field("printBWCost", "Custo de papel e tinta por página P&B (R$)", "number", ((s.printBWCostCents || 0) / 100).toFixed(2), 'min="0" step="0.01"') +
    field("printColorCost", "Custo de papel e tinta por página colorida (R$)", "number", ((s.printColorCostCents || 0) / 100).toFixed(2), 'min="0" step="0.01"') +
    field("pixKey", "Chave Pix (para cobranças por WhatsApp)", "text", s.pixKey || "", 'maxlength="100" placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"') +
    field("idleAlertMinutes", "Avisar máquina em uso sem mouse/teclado após (min, 0 desliga)", "number", String(s.idleAlertMinutes ?? 15), 'min="0" max="600" step="1"') +
    `<label>Dados da empresa no recibo (uma informação por linha; a primeira sai em destaque)<textarea name="receiptHeader" rows="5" maxlength="500" placeholder="Speed Lan House&#10;CNPJ 00.000.000/0001-00&#10;Rua Exemplo, 123 - Centro - Varginha/MG&#10;WhatsApp (35) 99999-9999">${html(s.receiptHeader || "")}</textarea></label>` +
    select("panelOnlyHere", "Onde o painel pode ser aberto", [["false", "Em qualquer computador da loja (com senha)"], ["true", "Só neste computador (caixa)"]], String(Boolean(s.panelOnlyHere))),
    values => api("/api/settings/finance", values).then(() => loadReport()));
}


function exportReportCsv() {
  if (!report) { toast("Nenhum dado para exportar."); return; }
  const r = report, rows = [];
  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const money = c => ((c || 0) / 100).toFixed(2).replace(".", ",");
  rows.push(["DRE", "Valor"], ["Receita bruta", money(r.dre.grossCents)], ["Descontos", money(r.dre.discountCents)], ["Taxas", money(r.dre.feesCents)], ["Receita liquida", money(r.dre.netCents)], ["CMV", money(r.dre.cmvCents)], ["Lucro bruto", money(r.dre.grossProfitCents)], ["Despesas", money(r.dre.expensesCents)], ["Resultado", money(r.dre.profitCents)], []);
  rows.push(["Curva ABC", "Classe", "Quantidade", "Faturamento", "Custo", "Lucro"]);
  for (const a of r.abc || []) rows.push([a.name, a.abcClass, a.quantity, money(a.amountCents), a.costCents === null ? "" : money(a.costCents), a.profitCents === null ? "" : money(a.profitCents)]);
  rows.push([], ["Mes", "Vendas", "CMV", "Taxas", "Despesas", "Resultado"]);
  for (const m of r.monthly || []) rows.push([m.month, money(m.salesCents), money(m.cmvCents), money(m.feesCents), money(m.expensesCents), money(m.resultCents)]);
  rows.push([], ["Data", "Descricao", "Valor", "Pago"]);
  for (const c of r.charges || []) rows.push([new Date(c.at).toLocaleString("pt-BR"), c.description, money(c.amountCents), money(c.paidCents)]);
  const blob = new Blob(["﻿" + rows.map(row => row.map(cell).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `relatorio_${r.period}_${r.date}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}

function copyReportToWhatsapp() {
  if (!report) return;
  const r = report, dre = r.dre || {};
  const rangeText = r.period === "all" ? "Todo o histórico" : (r.range?.start === r.range?.end ? dayLabel(r.range.start) : `${dayLabel(r.range.start)} a ${dayLabel(r.range.end)}`);
  const lines = [
    `*FECHAMENTO • SPEED LAN HOUSE & GRÁFICA*`,
    `*Período:* ${rangeText}`,
    `───────────────────────`,
    `*Vendas Totais:* ${currency(r.salesCents || 0)} (${r.salesCount || 0} atendimentos)`,
    `*Ticket Médio:* ${currency(r.averageTicketCents || 0)}`,
    ``,
    `*Recebimentos por Forma:*`,
    `  • Dinheiro: ${currency(r.byMethod?.cash || 0)}`,
    `  • Pix: ${currency(r.byMethod?.pix || 0)}`,
    `  • Cartão Débito: ${currency(r.byMethod?.debit || 0)}`,
    `  • Cartão Crédito: ${currency(r.byMethod?.credit || 0)}`,
    `  • Fiado / A receber: ${currency(r.dueCents || 0)}`,
    ``,
    `*Volume Gráfico:* ${r.printAudit?.totalPages || 0} páginas (${r.printAudit?.bwPages || 0} P&B, ${r.printAudit?.colorPages || 0} Color, ${r.printAudit?.xeroxCount || 0} Cópias)`,
    ``,
    `*Demonstrativo de Resultado (DRE):*`,
    `  • (-) CMV (Insumos/Produtos): ${currency(dre.cmvCents || 0)}`,
    `  • (-) Taxas de Cartão/Pix: ${currency(dre.feesCents || 0)}`,
    `  • (-) Despesas Operacionais: ${currency(dre.expensesCents || 0)}`,
    `  • (+) Comissões Speed Financeira: ${currency(dre.incomesCents || 0)}`,
    `  ⭐ *LUCRO LÍQUIDO:* ${currency(dre.profitCents || 0)} (Margem: ${dre.netMarginPct || 0}%)`,
    `───────────────────────`,
    `_Central Matriz • Gerado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}_`
  ];
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      toast("Resumo executivo copiado para o WhatsApp!");
    }).catch(() => toast("Não foi possível copiar para a área de transferência."));
  } else {
    toast("Área de transferência não disponível neste navegador.");
  }
}

function setupReportListeners() {
  document.querySelectorAll(".reportPeriodBtn").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".reportPeriodBtn").forEach(b => b.classList.toggle("active", b === btn));
    const p = btn.dataset.period || "month";
    const customGroup = $("#rpCustomRangeGroup");
    const dateInput = $("#reportDate");
    if (p === "custom") {
      if (customGroup) customGroup.hidden = false;
      if (dateInput) dateInput.hidden = true;
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      if ($("#rpCustomStart") && !$("#rpCustomStart").value) $("#rpCustomStart").value = today;
      if ($("#rpCustomEnd") && !$("#rpCustomEnd").value) $("#rpCustomEnd").value = today;
    } else {
      if (customGroup) customGroup.hidden = true;
      if (dateInput) dateInput.hidden = false;
      loadReport(p);
    }
  }));
  $("#rpCustomApplyBtn")?.addEventListener("click", () => {
    const start = $("#rpCustomStart")?.value;
    const end = $("#rpCustomEnd")?.value;
    if (!start || !end) { toast("Selecione a data inicial e final."); return; }
    loadReport("custom", start, end);
  });
  const applyCustomOnEnter = event => {
    if (event.key !== "Enter") return;
    const start = $("#rpCustomStart")?.value;
    const end = $("#rpCustomEnd")?.value;
    if (start && end) loadReport("custom", start, end);
  };
  $("#rpCustomStart")?.addEventListener("keydown", applyCustomOnEnter);
  $("#rpCustomEnd")?.addEventListener("keydown", applyCustomOnEnter);
  $("#reportCopyWaBtn")?.addEventListener("click", copyReportToWhatsapp);
  document.querySelectorAll(".reportTabBtn").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".reportTabBtn").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".reportTabContent").forEach(content => { content.hidden = content.id !== `tab-report-${btn.dataset.reportTab}`; });
  }));
  $("#reportDate")?.addEventListener("change", () => loadReport());
  $("#rpChargeSearch")?.addEventListener("input", () => renderReport());
  $("#btnChartRev")?.addEventListener("click", () => { chartMode = "rev"; $("#btnChartRev").classList.add("active"); $("#btnChartVol").classList.remove("active"); renderExecChart(); });
  $("#btnChartVol")?.addEventListener("click", () => { chartMode = "vol"; $("#btnChartVol").classList.add("active"); $("#btnChartRev").classList.remove("active"); renderExecChart(); });
  $("#reconPrinterStart")?.addEventListener("input", () => {
    localStorage.setItem("reconPrinterStart", $("#reconPrinterStart")?.value || "");
    updatePrinterRecon();
  });
  $("#reconPrinterEnd")?.addEventListener("input", () => {
    localStorage.setItem("reconPrinterEnd", $("#reconPrinterEnd")?.value || "");
    updatePrinterRecon();
  });
  $("#rpAbcSearch")?.addEventListener("input", event => {
    abcSearchTerm = event.target.value;
    renderAbc();
  });
  for (const id of ["#simExpensesRange", "#simMarginRange"]) $(id)?.addEventListener("input", event => { event.target.dataset.touched = "1"; updateBreakEven(); });
  $("#rpAbcFilter")?.addEventListener("click", event => {
    const btn = event.target.closest("[data-abc]"); if (!btn) return;
    abcFilter = btn.dataset.abc;
    document.querySelectorAll("#rpAbcFilter [data-abc]").forEach(b => b.classList.toggle("active", b === btn));
    renderAbc();
  });
  $("#rpAbc")?.addEventListener("change", event => {
    const sel = event.target.closest("[data-strategy]"); if (!sel) return;
    api(`/api/products/${encodeURIComponent(sel.dataset.strategy)}/strategy`, { strategy: sel.value }).then(() => { const p = state.products.find(x => x.id === sel.dataset.strategy); if (p) p.strategy = sel.value; toast("Estratégia salva."); }).catch(cause => toast(cause.message));
  });
  $("#reportPrintBtn")?.addEventListener("click", () => window.print());
  $("#reportExportBtn")?.addEventListener("click", exportReportCsv);
  $("#financeSettingsButton")?.addEventListener("click", openFinanceSettings);
  $("#addExpenseButton")?.addEventListener("click", () => openModal("Lançar despesa", expenseFields({ paid: true }), saveExpense));
  $("#uploadBillButton")?.addEventListener("click", () => $("#billFileInput")?.click());
  $("#billFileInput")?.addEventListener("change", event => { const file = event.target.files[0]; event.target.value = ""; importExpenseFiles([file]); });
  $("#view-reports")?.addEventListener("click", event => {
    const payId = event.target.closest("[data-expense-pay]")?.dataset.expensePay;
    if (payId) { openExpensePayment(payId, () => loadReport()); return; }
    const delId = event.target.closest("[data-expense-delete]")?.dataset.expenseDelete;
    if (delId && confirm("Excluir esta despesa?")) api(`/api/expenses/${encodeURIComponent(delId)}/delete`, {}).then(() => loadReport()).catch(cause => toast(cause.message));
  });
  // Arrastar o PDF da conta para a aba DRE tambem envia.
  $("#tab-report-dre")?.addEventListener("dragover", event => event.preventDefault());
  $("#tab-report-dre")?.addEventListener("drop", event => { event.preventDefault(); importExpenseFiles([...event.dataTransfer.files]); });
}

// ================= Despesas =================
let expenseData = { expenses: [], categories: [] }, expenseMonthSales = null;
const expMonthValue = () => $("#expMonth")?.value || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
const expDay = item => new Date(item.at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const expToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const expSourceLabel = item => item.legacy ? "sistema anterior" : item.groupId && item.source !== "manual" ? (item.source || "importado") : item.fileId ? "conta enviada" : item.groupId ? "fixa mensal" : "manual";

async function loadExpenses() {
  if (!$("#expMonth").value) $("#expMonth").value = expMonthValue();
  try {
    expenseData = await api("/api/expenses");
    const month = expMonthValue();
    const rep = await api(`/api/reports?date=${month}-01&period=month`).catch(() => null);
    expenseMonthSales = rep ? rep.salesCents : null;
    const select = $("#expFilterCategory"), current = select.value;
    select.innerHTML = `<option value="">Todas as categorias</option>` + expenseData.categories.map(c => `<option ${c === current ? "selected" : ""}>${html(c)}</option>`).join("");
    renderExpenses();
  } catch (cause) { toast(cause.message); }
}

function renderExpenses() {
  const month = expMonthValue(), today = expToday();
  const all = expenseData.expenses || [];
  const inMonth = all.filter(e => expDay(e).startsWith(month));
  const prevMonth = new Date(`${month}-15T12:00:00`); prevMonth.setMonth(prevMonth.getMonth() - 1);
  const prevKey = prevMonth.toISOString().slice(0, 7);
  const sum = list => list.reduce((s, e) => s + e.amountCents, 0);
  const total = sum(inMonth), prevTotal = sum(all.filter(e => expDay(e).startsWith(prevKey)));
  const open = all.filter(e => e.paid === false);
  const late = open.filter(e => expDay(e) < today);
  const week = open.filter(e => expDay(e) >= today && expDay(e) <= new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
  setHtml("#expKpis",
    kpi("Despesas do mês", currency(total), prevTotal ? `mês anterior ${currency(prevTotal)} (${total >= prevTotal ? "+" : ""}${Math.round((total - prevTotal) / prevTotal * 100)}%)` : `${inMonth.length} lançamento(s)`) +
    kpi("Peso sobre as vendas", expenseMonthSales ? pctText(total, expenseMonthSales) : "-", expenseMonthSales ? `vendas do mês ${currency(expenseMonthSales)}` : "sem vendas no mês", expenseMonthSales && total > expenseMonthSales * 0.5 ? "bad" : "") +
    kpi("A pagar", currency(sum(open)), `${open.length} conta(s) · ${week.length} vencem em 7 dias`, open.length ? "warn" : "") +
    kpi("Vencidas", currency(sum(late)), `${late.length} conta(s)`, late.length ? "bad" : "good"));

  const byCat = {};
  for (const e of inMonth) byCat[e.category] = (byCat[e.category] || 0) + e.amountCents;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  setHtml("#expByCategory", cats.length ? cats.map(([name, value]) => `<div class="rpRow"><div class="rpRowHead"><strong>${html(name)}</strong><span>${currency(value)} (${pctText(value, total)})</span></div>${bar(value, cats[0][1], "var(--danger-accent)")}</div>`).join("") : `<p class="muted">Nenhuma despesa neste mês. Importe as contas ou lance à mão.</p>`);

  const months = [];
  for (let i = 11; i >= 0; i--) { const d = new Date(`${month}-15T12:00:00`); d.setMonth(d.getMonth() - i); months.push(d.toISOString().slice(0, 7)); }
  const trend = months.map(m => ({ month: m, total: sum(all.filter(e => expDay(e).startsWith(m))) }));
  setHtml("#expTrend", barChart(trend, { value: r => r.total, label: r => monthLabel(r.month), title: r => `${monthLabel(r.month)}: ${currency(r.total)}`, color: "var(--danger-accent)", peakColor: "#9f1239", height: 240, width: 520 }));

  const admin = state?.user?.role === "admin";
  const fileLink = e => e.fileId ? `<a href="/api/expenses/${encodeURIComponent(e.id)}/file" target="_blank" rel="noopener">ver</a>` : "";
  setHtml("#expPayables", table(["Vencimento", "Descrição", "Valor", ""], open.slice().sort((a, b) => a.at.localeCompare(b.at)).map(e => `<tr><td class="${expDay(e) < today ? "bad" : ""}">${new Date(e.at).toLocaleDateString("pt-BR")}${expDay(e) < today ? " (vencida)" : ""}</td><td>${html(e.description)} <span class="muted">${html(e.category)}</span> ${fileLink(e)}</td><td class="money">${currency(e.amountCents)}</td><td>${admin ? `<button data-exp-pay="${e.id}">Paga</button>` : ""}</td></tr>`), "Nenhuma conta a pagar."));

  const bySupplier = {};
  for (const e of inMonth) { const key = e.description.replace(/\s+\d+\/\d+$/, "").trim(); bySupplier[key] = (bySupplier[key] || 0) + e.amountCents; }
  const sup = Object.entries(bySupplier).sort((a, b) => b[1] - a[1]).slice(0, 8);
  setHtml("#expSuppliers", sup.length ? sup.map(([name, value]) => `<div class="rpRow"><div class="rpRowHead"><strong>${html(name)}</strong><span>${currency(value)} (${pctText(value, total)})</span></div>${bar(value, sup[0][1], "var(--accent)")}</div>`).join("") : `<p class="muted">Sem lançamentos no mês.</p>`);

  const cat = $("#expFilterCategory").value, status = $("#expFilterStatus").value, term = $("#expSearch").value.trim().toLowerCase();
  const rows = inMonth.filter(e => (!cat || e.category === cat) && (!term || e.description.toLowerCase().includes(term)) &&
    (!status || (status === "open" && e.paid === false) || (status === "paid" && e.paid !== false) || (status === "late" && e.paid === false && expDay(e) < today)))
    .sort((a, b) => b.at.localeCompare(a.at));
  setHtml("#expTable", pagedTable("expTable", ["Vencimento", "Pagamento", "Categoria", "Descrição", "Valor", "Situação", "Origem", ""], rows.map(e => `<tr>
    <td>${new Date(e.at).toLocaleDateString("pt-BR")}</td>
    <td>${e.paid !== false && e.paidAt ? new Date(e.paidAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</td>
    <td>${admin && !e.legacy ? `<select data-exp-cat="${e.id}">${expenseData.categories.concat(expenseData.categories.includes(e.category) ? [] : [e.category]).map(c => `<option ${c === e.category ? "selected" : ""}>${html(c)}</option>`).join("")}</select>` : html(e.category)}</td>
    <td>${html(e.description)} ${fileLink(e)}</td>
    <td class="money">${currency(e.amountCents)}</td>
    <td>${e.paid === false ? `<span class="${expDay(e) < today ? "bad" : "warn"}">${expDay(e) < today ? "Vencida" : "A pagar"}</span>` : "Paga"}</td>
    <td class="muted">${html(expSourceLabel(e))}</td>
    <td class="actionsCell">${admin && !e.legacy ? `${e.paid === false ? `<button data-exp-pay="${e.id}">Paga</button>` : ""}<button data-exp-edit="${e.id}">Editar</button><button data-exp-del="${e.id}">Excluir</button>` : ""}</td></tr>`), "Nenhum lançamento com esses filtros."));
}

function expenseForm(values = {}, fixed = false) {
  const cats = (expenseData.categories.length ? expenseData.categories : EXPENSE_CATEGORIES);
  return select("category", "Categoria", cats.map(c => [c, c]), values.category && cats.includes(values.category) ? values.category : (values.category ? "Outros" : "Aluguel")) +
    field("description", "Descrição / fornecedor", "text", values.description || "", 'maxlength="120" required') +
    field("amount", "Valor (R$)", "number", values.amountCents ? (values.amountCents / 100).toFixed(2) : "", 'min="0.01" step="0.01" required') +
    field("date", fixed ? "Primeiro vencimento" : "Data do vencimento", "date", values.dueDate || values.date || expToday(), "required") +
    (fixed ? field("repeatMonths", "Repetir por quantos meses", "number", "12", 'min="2" max="24" required') : select("paid", "Situação", [["false", "A pagar"], ["true", "Já paga"]], values.paid === true ? "true" : "false")) +
    (fixed ? "" : expensePaymentField(values)) +
    (values.fileId ? `<input type="hidden" name="fileId" value="${html(values.fileId)}"><input type="hidden" name="source" value="conta enviada">` : "");
}
function expensePaymentField(values = {}) {
  return field("paidDate", "Data do pagamento", "date", values.paidAt ? expDay({ at: values.paidAt }) : expToday(), "required");
}
function syncExpensePaymentField() {
  const form = $("#modalForm"), input = form.elements.paidDate;
  if (!input || !form.elements.paid) return;
  const paid = form.elements.paid.value === "true";
  input.closest("label").hidden = !paid;
  input.disabled = !paid;
}
$("#modalForm").addEventListener("change", event => {
  if (event.target.name === "paid") syncExpensePaymentField();
});
function openExpensePayment(id, afterSave) {
  openModal("Registrar pagamento da despesa", expensePaymentField(),
    values => api(`/api/expenses/${encodeURIComponent(id)}/pay`, { paidDate: values.paidDate }).then(afterSave), "Confirmar pagamento");
}
const afterExpenseSave = () => Promise.all([loadExpenses(), currentView === "reports" ? loadReport() : null]);

async function importExpenseFile(file, statement = false) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { toast(`${file.name}: arquivo muito grande (máximo 20 MB).`); return; }
  const type = /\.csv$/i.test(file.name) ? "text/csv" : file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : /\.png$/i.test(file.name) ? "image/png" : "image/jpeg");
  toast(`Lendo ${file.name}...`);
  const response = await fetch(statement ? "/api/expenses/read?as=extrato" : "/api/expenses/read", { method: "POST", headers: { "content-type": type }, body: await file.arrayBuffer() });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(`${file.name}: ${result.error || "não foi possível ler"}`);
  const s = result.suggestion || {};
  if (result.kind === "card" && result.items.length) return openCardReview(result, file.name);
  if (result.kind === "statement") {
    if (!result.items.length) throw new Error(`${file.name}: não encontrei lançamentos no extrato. Envie o PDF original do banco (não a foto) ou me avise qual banco é.`);
    return openStatementReview(result, file.name);
  }
  const note = result.empty ? "Não foi possível ler o texto. Preencha conferindo a conta (o arquivo fica anexado)." : `Lido ${result.ocr ? "pela foto (OCR)" : "do PDF"}${s.fromBarcode ? ", valor e vencimento pela linha digitável" : ""}. Confira antes de salvar.`;
  openModal(`Conta: ${file.name}`, `<p class="quoteBox">${html(note)}</p>` + expenseForm({ ...s, fileId: result.fileId }), values => api("/api/expenses", { ...values, paid: values.paid === "true" }).then(afterExpenseSave), "Salvar conta");
}

// Fatura do cartao: uma linha por compra, com categoria sugerida; o dono marca o que lancar.
function openCardReview(result, name) {
  const cats = expenseData.categories.length ? expenseData.categories : EXPENSE_CATEGORIES;
  const items = result.items;
  const rows = items.map((it, i) => `<tr><td><input type="checkbox" name="inc_${i}" checked></td><td><input type="date" name="date_${i}" value="${it.date}"></td><td><input name="desc_${i}" value="${html(it.description)}" maxlength="120"></td><td><select name="cat_${i}">${cats.map(c => `<option ${c === it.category ? "selected" : ""}>${html(c)}</option>`).join("")}</select></td><td><input type="number" name="amt_${i}" value="${(it.amountCents / 100).toFixed(2)}" step="0.01" min="0.01"></td></tr>`).join("");
  const total = items.reduce((s, it) => s + it.amountCents, 0);
  $("#formDialog").classList.add("wide");
  openModal(`Fatura do cartão: ${name}`,
    `<p class="quoteBox">${items.length} compra(s) encontradas, somando ${currency(total)}${result.suggestion.amountCents ? ` (total da fatura: ${currency(result.suggestion.amountCents)})` : ""}. Pagamentos e estornos já ficaram de fora. Confira as categorias e desmarque o que não é da loja.</p>` +
    select("mode", "Lançar como", [["items", "Cada compra na sua categoria (recomendado)"], ["total", "Um lançamento só com o total"]], "items") +
    select("paid", "Situação", [["false", "Fatura a pagar"], ["true", "Fatura já paga"]], "false") +
    `<div class="tableWrap expReview"><table class="dataTable"><thead><tr><th></th><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    values => {
      const chosen = items.map((_, i) => values[`inc_${i}`] ? { date: values[`date_${i}`], description: values[`desc_${i}`], category: values[`cat_${i}`], amount: values[`amt_${i}`] } : null).filter(Boolean);
      if (!chosen.length) throw new Error("Marque ao menos uma compra.");
      const paid = values.paid === "true";
      const request = values.mode === "total"
        ? api("/api/expenses", { category: "Cartão de crédito", description: result.suggestion.description || "Fatura do cartão", amount: chosen.reduce((s, c) => s + Number(c.amount), 0).toFixed(2), date: result.suggestion.dueDate || expToday(), paid, fileId: result.fileId, source: "fatura" })
        : api("/api/expenses/bulk", { items: chosen, fileId: result.fileId, source: result.suggestion.description || "fatura", paid });
      return request.then(() => { toast(`${chosen.length} lançamento(s) da fatura salvos.`); afterExpenseSave(); });
    }, "Lançar despesas");
}

// Extrato PJ: cada linha vira despesa (saida) ou receita (entrada). Vendas da loja e o que ja foi lancado vem desmarcados.
function openStatementReview(result, name) {
  const outCats = expenseData.categories.length ? expenseData.categories : EXPENSE_CATEGORIES;
  const inCats = ["Comissão Speed Financeira", "Outra receita", "Vendas (já no caixa)", "Movimentação entre contas"];
  const items = result.items;
  const sum = type => items.filter(it => it.type === type).reduce((s, it) => s + it.amountCents, 0);
  const sales = items.filter(it => it.category === "Vendas (já no caixa)");
  const old = items.filter(it => it.old && it.category !== "Vendas (já no caixa)");
  const since = result.since ? new Date(`${result.since}T12:00:00`).toLocaleDateString("pt-BR") : "";
  const rows = items.map((it, i) => {
    if (it.category === "Vendas (já no caixa)") return "";
    const cats = it.type === "in" ? inCats : [...outCats, "Movimentação entre contas"];
    const note = it.match ? `<small class="muted">${it.match.pending ? "Conta a pagar" : "Já lançado"}: ${html(it.match.description)} (${new Date(it.match.at).toLocaleDateString("pt-BR")})${it.match.pending ? " · será marcada como paga" : ""}</small>` : "";
    return `<tr class="${it.type === "in" ? "stIn" : "stOut"}" ${it.old ? "data-st-old hidden" : ""}><td><input type="checkbox" name="inc_${i}" ${it.include ? "checked" : ""}></td><td><input type="date" name="date_${i}" value="${it.date}"></td><td><input name="desc_${i}" value="${html(it.description)}" maxlength="120">${note}</td><td><select name="cat_${i}" ${it.match?.pending ? "disabled" : ""}>${cats.map(c => `<option ${c === it.category ? "selected" : ""}>${html(c)}</option>`).join("")}</select></td><td class="money"><b>${it.type === "in" ? "+" : "-"}</b> <input type="number" name="amt_${i}" value="${(it.amountCents / 100).toFixed(2)}" step="0.01" min="0.01"></td></tr>`;
  }).join("");
  $("#formDialog").classList.add("wide");
  openModal(`Extrato: ${name}`,
    `<p class="quoteBox">${items.length} lançamento(s): entradas ${currency(sum("in"))}, saídas ${currency(sum("out"))}. ${sales.length} venda(s) da loja (maquininha e Pix de cliente, ${currency(sales.reduce((s, it) => s + it.amountCents, 0))}) já estão no caixa e ficaram de fora. Pix para a sua conta pessoal entram como Retirada do dono (no DRE saem depois do lucro). O que já foi lançado e movimentações entre contas vêm desmarcados. Contas a pagar encontradas no extrato serão marcadas como pagas. Confira e salve.</p>` +
    (old.length ? `<label class="checkLine"><input type="checkbox" id="stShowOld"> Mostrar ${old.length} lançamento(s) antes de ${since} (início das vendas no sistema; vêm desmarcados para o resultado desses meses não ficar só com despesa)</label>` : "") +
    `<div class="tableWrap expReview"><table class="dataTable"><thead><tr><th></th><th>Data</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    values => {
      const chosen = items.map((it, i) => {
        if (!values[`inc_${i}`]) return null;
        const category = values[`cat_${i}`] || it.category;
        if (category === "Movimentação entre contas" || category === "Vendas (já no caixa)") return null;
        return { type: it.type, date: values[`date_${i}`], description: values[`desc_${i}`], category, amount: values[`amt_${i}`], matchId: it.match?.pending ? it.match.id : null, bankRef: it.bankRef || null };
      }).filter(Boolean);
      if (!chosen.length) throw new Error("Marque ao menos um lançamento (vendas e movimentação entre contas não são lançadas).");
      return api("/api/statement/import", { rows: chosen, fileId: result.fileId, source: result.suggestion.description || "extrato" })
        .then(r => { toast(`Extrato: ${r.expenses} despesa(s), ${r.incomes} receita(s), ${r.paid} conta(s) marcada(s) como paga(s).`); afterExpenseSave(); });
    }, "Lançar extrato");
  $("#stShowOld")?.addEventListener("change", event => document.querySelectorAll("[data-st-old]").forEach(row => { row.hidden = !event.target.checked; }));
}

async function importExpenseFiles(files, statement = false) {
  for (const file of files) {
    try { await importExpenseFile(file, statement); await new Promise(r => { const d = $("#formDialog"); if (!d.open) return r(); d.addEventListener("close", r, { once: true }); }); }
    catch (cause) { toast(cause.message); }
  }
}

function setupExpenseListeners() {
  $("#formDialog").addEventListener("close", () => $("#formDialog").classList.remove("wide"));
  $("#expMonth")?.addEventListener("change", loadExpenses);
  for (const id of ["#expFilterCategory", "#expFilterStatus"]) $(id)?.addEventListener("change", renderExpenses);
  $("#expSearch")?.addEventListener("input", renderExpenses);
  $("#expImportBtn")?.addEventListener("click", () => $("#expFileInput").click());
  $("#expStatementBtn")?.addEventListener("click", () => $("#expStatementInput").click());
  $("#expStatementInput")?.addEventListener("change", event => { const files = [...event.target.files]; event.target.value = ""; importExpenseFiles(files, true); });
  $("#expFileInput")?.addEventListener("change", event => { const files = [...event.target.files]; event.target.value = ""; importExpenseFiles(files); });
  $("#expAddBtn")?.addEventListener("click", () => openModal("Lançar despesa", expenseForm({ paid: true }), values => api("/api/expenses", { ...values, paid: values.paid === "true", source: "manual" }).then(afterExpenseSave)));
  $("#expFixedBtn")?.addEventListener("click", () => openModal("Despesa fixa mensal", `<p class="quoteBox">Cria o lançamento a pagar em todos os meses (aluguel, internet, salário, contador...). Cada mês você marca como paga.</p>` + expenseForm({}, true), values => api("/api/expenses", { ...values, paid: false, source: "fixa mensal" }).then(afterExpenseSave)));
  const drop = $("#expDrop");
  drop?.addEventListener("click", () => $("#expFileInput").click());
  drop?.addEventListener("dragover", event => { event.preventDefault(); drop.classList.add("over"); });
  drop?.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop?.addEventListener("drop", event => { event.preventDefault(); drop.classList.remove("over"); importExpenseFiles([...event.dataTransfer.files]); });
  $("#view-expenses")?.addEventListener("click", event => {
    const pay = event.target.closest("[data-exp-pay]")?.dataset.expPay;
    if (pay) { openExpensePayment(pay, afterExpenseSave); return; }
    const del = event.target.closest("[data-exp-del]")?.dataset.expDel;
    if (del && confirm("Excluir esta despesa?")) return api(`/api/expenses/${encodeURIComponent(del)}/delete`, {}).then(afterExpenseSave).catch(cause => toast(cause.message));
    const edit = event.target.closest("[data-exp-edit]")?.dataset.expEdit;
    if (edit) {
      const e = expenseData.expenses.find(x => x.id === edit); if (!e) return;
      openModal("Editar despesa", expenseForm({ ...e, date: expDay(e), paid: e.paid !== false }), values => api(`/api/expenses/${encodeURIComponent(edit)}/update`, { ...values, paid: values.paid === "true" }).then(afterExpenseSave));
    }
  });
  $("#view-expenses")?.addEventListener("change", event => {
    const sel = event.target.closest("[data-exp-cat]"); if (!sel) return;
    api(`/api/expenses/${encodeURIComponent(sel.dataset.expCat)}/update`, { category: sel.value }).then(() => { const e = expenseData.expenses.find(x => x.id === sel.dataset.expCat); if (e) e.category = sel.value; renderExpenses(); toast("Categoria atualizada."); }).catch(cause => toast(cause.message));
  });
}
setupExpenseListeners();
// ---- Cofre de logins bancarios ----
let vault = { masterMode: false, unlocked: false, items: [], banks: [] }, vaultKind = "banco", vaultPromoter = "", vaultProduct = "", vaultBank = "";
const VAULT_PRODUCTS = ["INSS", "CLT", "FGTS", "SIAPE", "Bolsa Família", "Cartão benefício", "Crédito pessoal", "Veículo", "Seguro", "Conta digital"];
const PRODUCT_HINT = { INSS: "Aposentados", CLT: "Consignado", FGTS: "Saque-Aniversário", SIAPE: "Servidor federal" };
const PROMOTER_COLORS = ["#7c3aed", "#0d9488", "#db2777", "#2563eb", "#ea580c", "#0891b2", "#65a30d", "#9333ea"];
const ICON = {
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z"/><path d="M9 13h6M9 17h4"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/></svg>'
};
const promoterColor = name => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PROMOTER_COLORS[h % PROMOTER_COLORS.length]; };
const promoterTag = name => name ? `<span class="cvTag" style="--c:${promoterColor(name)}">${html(name)}</span>` : "";
const siteUrl = url => /^https?:\/\//i.test(url) ? url : "https://" + url;

async function loadVault() {
  try { vault = await api("/api/vault"); } catch (cause) { toast(cause.message); return; }
  renderVault();
}
function vaultCall(path, data) {
  return api(path, data).catch(cause => { if (/bloqueado/i.test(cause.message)) { vault.unlocked = false; vault.items = []; renderVault(); } throw cause; });
}
function copyText(text) {
  // Na rede local (http) o navegador nao libera o clipboard moderno: usa o metodo antigo.
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => toast("Copiado."));
  const area = document.createElement("textarea"); area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
  document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove(); toast("Copiado.");
  return Promise.resolve();
}
const vaultPromoterNames = () => [...new Set(vault.items.filter(i => i.kind === "promotora").map(i => i.name).concat(vault.items.map(i => i.promoter)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
const vaultBankNames = () => [...new Set((vault.banks || []).map(b => b.name).concat(vault.items.filter(i => i.kind === "banco").map(i => i.name)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

function credRow(i, label, value, secret) {
  if (!value) return `<div class="cvCred"><span>${label}:</span><code class="muted">-</code><i></i><i></i></div>`;
  return `<div class="cvCred"><span>${label}:</span><code ${secret ? `data-secret="${i.id}"` : ""}>${secret ? "••••••••" : html(value)}</code>${secret ? `<button type="button" class="cvIcon" data-show="${i.id}" title="Mostrar">${ICON.eye}</button>` : "<i></i>"}<button type="button" class="cvIcon" data-${secret ? "copy-pass" : "copy-login"}="${i.id}" title="Copiar">${ICON.copy}</button></div>`;
}
function bankCard(i) {
  return `<article class="cvCard ${i.active === false ? "off" : ""}">
    <div class="cvCardHead"><div><strong>${html(i.name)}</strong> <span class="cvStatus ${i.active === false ? "off" : ""}">${i.active === false ? "inativo" : "ativo"}</span><div>${promoterTag(i.promoter)}</div></div>
      <div class="cvCardActions"><button type="button" class="cvIcon" data-vault-edit="${i.id}" title="Editar">${ICON.edit}</button><button type="button" class="cvIcon" data-vault-del="${i.id}" title="Excluir">${ICON.trash}</button></div></div>
    <div class="cvCredBox">${credRow(i, "Usuário", i.login, false)}${credRow(i, "Senha", i.password, true)}</div>
    ${(i.products || []).length ? `<div class="cvProducts">${i.products.map(p => `<span class="cvProd p-${html(p.replace(/\W/g, ""))}">${html(p)}</span>`).join("")}</div>` : ""}
    ${i.notes ? `<div class="cvNote">${ICON.note}<span>${html(i.notes)}</span></div>` : ""}
    <div class="cvFoot"><span>${ICON.cal}Atualizado em ${new Date(i.updatedAt).toLocaleDateString("pt-BR")}</span>${i.url ? `<a href="${html(siteUrl(i.url))}" target="_blank" rel="noopener noreferrer">Abrir site ${ICON.ext}</a>` : ""}</div>
  </article>`;
}
function portalCard(i) {
  const boxed = (label, value, secret) => `<div class="cvPortalField"><div><span>${label}</span><code ${secret ? `data-secret="${i.id}"` : ""}>${value ? (secret ? "••••••••" : html(value)) : "-"}</code></div>${value ? `${secret ? `<button type="button" class="cvIcon boxed" data-show="${i.id}" title="Mostrar">${ICON.eye}</button>` : ""}<button type="button" class="cvIcon boxed" data-${secret ? "copy-pass" : "copy-login"}="${i.id}" title="Copiar">${ICON.copy}</button>` : ""}</div>`;
  return `<article class="cvCard portal ${i.active === false ? "off" : ""}">
    <div class="cvCardHead"><span class="cvTag big" style="--c:${promoterColor(i.name)}">${html(i.name)}</span>
      <div class="cvCardActions"><button type="button" class="cvIcon" data-vault-edit="${i.id}" title="Editar">${ICON.edit}</button><button type="button" class="cvIcon" data-vault-del="${i.id}" title="Excluir">${ICON.trash}</button></div></div>
    ${boxed("Usuário", i.login, false)}${boxed("Senha", i.password, true)}
    ${i.notes ? `<div class="cvNote">${ICON.note}<span>${html(i.notes)}</span></div>` : ""}
    ${i.url ? `<a class="cvPortalBtn" href="${html(siteUrl(i.url))}" target="_blank" rel="noopener noreferrer">Portal de acesso ${ICON.ext}</a>` : `<button type="button" class="cvPortalBtn empty" data-vault-edit="${i.id}">Cadastrar link do portal</button>`}
  </article>`;
}

function renderVault() {
  $("#vaultLocked").hidden = vault.unlocked; $("#vaultOpen").hidden = !vault.unlocked;
  if (!vault.unlocked) return;
  $("#vaultMasterButton span").textContent = vault.masterMode ? "Bloquear cofre" : "Ativar senha mestre";
  const items = vault.items, promoters = vaultPromoterNames();
  const countFor = p => items.filter(i => i.kind === "banco" && i.promoter === p).length;
  setTextSafe("#vaultPromoterCount", `(${promoters.length})`);
  setHtml("#vaultPromoters", `<button type="button" class="cvPromoter ${!vaultPromoter ? "active" : ""}" data-promoter=""><span>Todas as promotoras</span><b>${items.filter(i => i.kind === "banco").length}</b></button>` +
    promoters.map(p => `<button type="button" class="cvPromoter ${p === vaultPromoter ? "active" : ""}" data-promoter="${html(p)}"><span><i style="background:${promoterColor(p)}"></i>${html(p)}</span>${countFor(p) ? `<b>${countFor(p)}</b>` : ""}</button>`).join(""));
  document.querySelectorAll("#vaultKinds [data-kind]").forEach(b => b.classList.toggle("active", b.dataset.kind === vaultKind));
  const bankMode = vaultKind === "banco";
  $("#vaultBankTools").hidden = !bankMode; $("#vaultPortalHead").hidden = bankMode;
  if (!bankMode) {
    setTextSafe("#vaultPortalTitle", vaultKind === "promotora" ? "Portais e credenciais master das promotoras" : "Sistemas da Speed Financeira");
    setTextSafe("#vaultPortalText", vaultKind === "promotora" ? "Acesso master e links dos portais das promotoras parceiras." : "Acessos aos sistemas próprios da Speed (CRM, site, e-mail, simuladores...).");
    setTextSafe("#vaultPortalNew", vaultKind === "promotora" ? "+ Promotora" : "+ Sistema");
  }
  const banksLogins = items.filter(i => i.kind === "banco" && (!vaultPromoter || i.promoter === vaultPromoter));
  const products = VAULT_PRODUCTS.filter(p => banksLogins.some(i => (i.products || []).includes(p)));
  setHtml("#vaultProducts", ["", ...(products.length ? products : ["INSS", "CLT", "FGTS"])].map(p => `<button type="button" class="${p === vaultProduct ? "active" : ""}" data-product="${html(p)}">${p || "Todos"}</button>`).join(""));
  const bankCount = name => banksLogins.filter(i => i.name === name).length;
  setHtml("#vaultBanks", `<button type="button" class="cvChip ${!vaultBank ? "active" : ""}" data-bank="">Todos</button>` +
    vaultBankNames().filter(b => (vault.banks || []).find(x => x.name === b)?.active !== false || bankCount(b)).map(b => `<button type="button" class="cvChip ${b === vaultBank ? "active" : ""}" data-bank="${html(b)}">${html(b)}${bankCount(b) ? ` <b>${bankCount(b)}</b>` : ""}</button>`).join(""));
  const term = ($("#vaultSearch").value || "").toLowerCase().trim();
  let list;
  if (bankMode) list = banksLogins.filter(i => (!vaultProduct || (i.products || []).includes(vaultProduct)) && (!vaultBank || i.name === vaultBank) && (!term || [i.name, i.promoter, i.login, i.notes, i.url].join(" ").toLowerCase().includes(term)));
  else list = items.filter(i => i.kind === vaultKind && (!vaultPromoter || vaultKind !== "promotora" || i.name === vaultPromoter));
  list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const empty = bankMode
    ? (items.some(i => i.kind === "banco") ? "Nenhum login com esses filtros." : "Nenhum login de banco ainda. Clique em <strong>+ Novo login</strong> ou importe sua lista.")
    : `Nenhum ${vaultKind === "promotora" ? "portal de promotora" : "sistema"} cadastrado ainda.`;
  setHtml("#vaultCards", list.length ? list.map(bankMode ? bankCard : portalCard).join("") : `<div class="cvEmpty"><p>${empty}</p>${items.length ? "" : `<div><button type="button" class="cvBtn primary" data-empty="new">+ Novo login</button><button type="button" class="cvBtn" data-empty="import">Importar lista</button></div>`}</div>`);
  const stat = (label, value, sub) => `<div class="cvStat"><span>${label}</span><strong>${value}</strong><small>${sub}</small></div>`;
  setHtml("#vaultSummary", stat("Total de logins", items.filter(i => i.kind === "banco").length, "logins de bancos") + stat("Bancos ativos", vaultBankNames().filter(b => (vault.banks || []).find(x => x.name === b)?.active !== false).length, "na lista de bancos") + stat("Promotoras", promoters.length, "parceiras") + stat("Segurança", vault.masterMode ? "Senha mestre" : "Criptografado", vault.masterMode ? "fecha em 15 min sem uso" : "senha mestre desativada"));
}

function openVaultForm(item = {}) {
  const kind = item.kind || vaultKind || "banco";
  const isBank = kind === "banco";
  const banks = vaultBankNames(), promoters = vaultPromoterNames();
  const products = item.products || [];
  const titles = { banco: item.id ? "Editar login do banco" : "Cadastrar novo login", promotora: item.id ? "Editar promotora" : "Nova promotora", sistema: item.id ? "Editar sistema" : "Novo sistema da Speed" };
  const opts = (list, current, placeholder) => `<option value="">${placeholder}</option>` + [...new Set([...list, current].filter(Boolean))].map(v => `<option ${v === current ? "selected" : ""}>${html(v)}</option>`).join("");
  $("#formDialog").classList.add("cvDialog");
  openModal(titles[kind],
    `<input type="hidden" name="kind" value="${kind}">` +
    (isBank
      ? `<label><span class="cvLabelRow">Banco / instituição financeira <button type="button" class="cvLink" data-form-banks>+ Gerenciar bancos</button></span><select name="name" required>${opts(banks, item.name, "Selecione o banco")}</select></label>
         <label><span class="cvLabelRow">Promotora vinculada <button type="button" class="cvLink" data-form-promoter>+ Nova promotora</button></span><select name="promoter">${opts(promoters, item.promoter || vaultPromoter, "Sem promotora (direto no banco)")}</select></label>
         <div class="cvField"><span>Produtos autorizados (selecione um ou mais)</span><div class="cvProductPick">${VAULT_PRODUCTS.map(p => `<label class="cvPick"><input type="checkbox" name="prod_${html(p)}" ${products.includes(p) ? "checked" : ""}><span>${html(p)}${PRODUCT_HINT[p] ? `<small>${PRODUCT_HINT[p]}</small>` : ""}</span></label>`).join("")}</div></div>`
      : field("name", kind === "promotora" ? "Nome da promotora" : "Nome do sistema", "text", item.name || "", 'maxlength="80" required')) +
    field("url", isBank ? "Site do banco (link de acesso, opcional)" : "Link do portal", "text", item.url || "", 'maxlength="300" placeholder="Exemplo: https://portal.banco.com.br"') +
    `<div class="cvTwo">${field("login", "Login / usuário", "text", item.login || "", 'maxlength="200" autocomplete="off" placeholder="Ex.: joao.corban ou 123456"')}<label><span>Senha</span><div class="cvPassWrap"><input name="password" type="password" value="${html(item.password || "")}" maxlength="200" autocomplete="new-password" placeholder="Senha de acesso"><button type="button" class="cvIcon" data-toggle-pass title="Mostrar">${ICON.eye}</button></div></label></div>` +
    `<label><span>Observações / informações adicionais (opcional)</span><textarea name="notes" rows="3" maxlength="1000" placeholder="Ex.: token necessário, trocar senha a cada 30 dias, telefone do suporte...">${html(item.notes || "")}</textarea></label>` +
    select("active", "Situação", [["true", "Ativo"], ["false", "Inativo"]], String(item.active !== false)),
    values => {
      if (!values.name) throw new Error(isBank ? "Selecione o banco." : "Informe o nome.");
      return vaultCall("/api/vault/items", { ...values, id: item.id, active: values.active === "true", products: isBank ? VAULT_PRODUCTS.filter(p => values[`prod_${p}`]) : [] }).then(result => { vault.items = result.items; renderVault(); toast("Salvo."); });
    }, item.id ? "Salvar alterações" : "Salvar login");
}
function openBanksManager(afterSave) {
  const rows = (vault.banks || []).map((b, k) => `<tr><td><input name="bn_${k}" value="${html(b.name)}" maxlength="60"></td><td><input name="bu_${k}" value="${html(b.url || "")}" maxlength="300" placeholder="https://"></td><td><select name="ba_${k}"><option value="true" ${b.active !== false ? "selected" : ""}>Ativo</option><option value="false" ${b.active === false ? "selected" : ""}>Inativo</option></select></td></tr>`).join("");
  const n = (vault.banks || []).length;
  $("#formDialog").classList.add("wide");
  openModal("Configurar bancos", `<p class="quoteBox">Lista de bancos que aparecem no cadastro de logins. Para remover, apague o nome. Para adicionar vários, escreva um por linha no campo abaixo.</p>
    <div class="tableWrap expReview"><table class="dataTable"><thead><tr><th>Banco</th><th>Site</th><th>Situação</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="muted">Nenhum banco na lista.</td></tr>'}</tbody></table></div>
    <label><span>Adicionar bancos (um por linha)</span><textarea name="newBanks" rows="4" placeholder="C6&#10;Facta&#10;Mercantil"></textarea></label>`,
    values => {
      const banks = [];
      for (let k = 0; k < n; k++) if (values[`bn_${k}`]?.trim()) banks.push({ name: values[`bn_${k}`].trim(), url: values[`bu_${k}`] || "", active: values[`ba_${k}`] !== "false" });
      for (const line of String(values.newBanks || "").split(/\r?\n/)) if (line.trim()) banks.push({ name: line.trim(), url: "", active: true });
      return vaultCall("/api/vault/banks", { banks }).then(result => { vault.banks = result.banks; renderVault(); toast("Lista de bancos salva."); if (afterSave) setTimeout(afterSave, 50); });
    }, "Salvar bancos");
}
function exportVaultPdf() {
  const promoters = vault.items.filter(i => i.kind === "promotora"), logins = vault.items.filter(i => i.kind === "banco"), systems = vault.items.filter(i => i.kind === "sistema");
  const block = (title, list, withPromoter) => list.length ? `<h2>${title} (${list.length})</h2>${list.map(i => `<div class="it"><b>${html(i.name)}</b>${withPromoter && i.promoter ? ` · ${html(i.promoter)}` : ""}${(i.products || []).length ? ` · ${html(i.products.join(", "))}` : ""}<br>Usuário: <code>${html(i.login || "-")}</code> &nbsp; Senha: <code>${html(i.password || "-")}</code>${i.url ? `<br>Site: ${html(i.url)}` : ""}${i.notes ? `<br><i>${html(i.notes)}</i>` : ""}</div>`).join("")}` : "";
  const w = window.open("", "_blank");
  if (!w) { toast("Libere janelas pop-up para exportar."); return; }
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cofre Speed - logins</title><style>body{font-family:Segoe UI,Arial;margin:28px;color:#111}h1{font-size:20px;margin:0}h2{font-size:15px;border-bottom:2px solid #0b8a45;padding-bottom:4px;margin-top:22px}.it{padding:8px 0;border-bottom:1px solid #ddd;font-size:13px;line-height:1.5}code{background:#f1f5f2;padding:1px 5px;border-radius:4px}p{color:#666;font-size:12px}</style></head><body>
    <h1>Speed Financeira · relatório de logins</h1><p>Gerado em ${new Date().toLocaleString("pt-BR")} · documento confidencial: guarde em local seguro e não compartilhe.</p>
    ${block("Logins dos bancos", logins, true)}${block("Portais das promotoras", promoters)}${block("Sistemas da Speed", systems)}
    ${(vault.banks || []).length ? `<h2>Bancos cadastrados (${vault.banks.length})</h2><p style="color:#111;font-size:13px">${vault.banks.map(b => html(b.name) + (b.active === false ? " (inativo)" : "")).join(" · ")}</p>` : ""}
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}
function exportVaultJson() {
  if (!confirm("O backup em .json contém todas as senhas em texto aberto. Guarde o arquivo num lugar seguro. Continuar?")) return;
  const blob = new Blob([JSON.stringify({ tipo: "cofre-speed", geradoEm: new Date().toISOString(), bancos: vault.banks, acessos: vault.items.map(({ id, ...rest }) => rest) }, null, 2)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `cofre-speed-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}

$("#vaultUnlockForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  $("#vaultError").hidden = true;
  try { await api("/api/vault/unlock", { master: $("#vaultMaster").value }); $("#vaultMaster").value = ""; await loadVault(); }
  catch (cause) { $("#vaultError").textContent = cause.message; $("#vaultError").hidden = false; }
});
$("#vaultMasterButton")?.addEventListener("click", () => {
  if (vault.masterMode) return api("/api/vault/lock", {}).then(loadVault);
  openModal("Ativar senha mestre", `<p class="quoteBox">Opcional. Com a senha mestre, o cofre pede essa senha para abrir e fecha sozinho após 15 minutos sem uso. <strong>Se esquecer a senha mestre, os logins não podem ser recuperados.</strong></p>` +
    field("master", "Senha mestre (mínimo 8 caracteres)", "password", "", 'minlength="8" required autocomplete="new-password"') + field("confirm", "Repita a senha mestre", "password", "", 'required autocomplete="new-password"'),
    values => { if (values.master !== values.confirm) throw new Error("As duas senhas não conferem."); return api("/api/vault/setup", { master: values.master }).then(loadVault); }, "Ativar");
});
$("#vaultNewButton")?.addEventListener("click", () => openVaultForm({ kind: vaultKind }));
$("#vaultPortalNew")?.addEventListener("click", () => openVaultForm({ kind: vaultKind }));
$("#vaultNewPromoter")?.addEventListener("click", () => openVaultForm({ kind: "promotora" }));
$("#vaultNewSystem")?.addEventListener("click", () => openVaultForm({ kind: "sistema" }));
$("#vaultBanksButton")?.addEventListener("click", () => openBanksManager());
$("#vaultPdfButton")?.addEventListener("click", exportVaultPdf);
$("#vaultExportJson")?.addEventListener("click", exportVaultJson);
$("#vaultSearch")?.addEventListener("input", renderVault);
$("#formDialog").addEventListener("close", () => $("#formDialog").classList.remove("cvDialog"));
// Atalhos dentro do formulario: gerenciar bancos / nova promotora (salvam e voltam ao cadastro do login).
document.addEventListener("click", event => {
  if (event.target.closest("[data-toggle-pass]")) { const input = event.target.closest(".cvPassWrap").querySelector("input"); input.type = input.type === "password" ? "text" : "password"; return; }
  if (event.target.closest("[data-form-banks]")) { $("#formDialog").close(); openBanksManager(() => openVaultForm({ kind: "banco" })); return; }
  if (event.target.closest("[data-form-promoter]")) { $("#formDialog").close(); openVaultForm({ kind: "promotora" }); }
});
$("#vaultKinds")?.addEventListener("click", event => {
  const btn = event.target.closest("[data-kind]"); if (!btn) return;
  vaultKind = btn.dataset.kind; renderVault();
});
$("#view-vault")?.addEventListener("click", event => {
  const t = event.target, find = id => vault.items.find(i => i.id === id);
  const empty = t.closest("[data-empty]")?.dataset.empty; if (empty === "new") return openVaultForm({ kind: vaultKind }); if (empty === "import") return $("#vaultImportButton").click();
  const promoterBtn = t.closest("[data-promoter]"); if (promoterBtn) { vaultPromoter = promoterBtn.dataset.promoter; renderVault(); return; }
  const productBtn = t.closest("[data-product]"); if (productBtn) { vaultProduct = productBtn.dataset.product; renderVault(); return; }
  const bankBtn = t.closest("[data-bank]"); if (bankBtn) { vaultBank = bankBtn.dataset.bank; renderVault(); return; }
  const btn = t.closest("button[data-copy-login],button[data-copy-pass],button[data-show],button[data-vault-edit],button[data-vault-del]"); if (!btn) return;
  const d = btn.dataset;
  if (d.copyLogin) return copyText(find(d.copyLogin)?.login || "");
  if (d.copyPass) return copyText(find(d.copyPass)?.password || "");
  if (d.show) {
    const code = btn.closest("article").querySelector(`[data-secret="${d.show}"]`);
    code.textContent = code.textContent === "••••••••" ? find(d.show)?.password || "" : "••••••••";
    return;
  }
  if (d.vaultEdit) return openVaultForm(find(d.vaultEdit));
  if (d.vaultDel && confirm("Excluir este acesso?")) vaultCall(`/api/vault/items/${encodeURIComponent(d.vaultDel)}/delete`, {}).then(result => { vault.items = result.items; renderVault(); });
});

// Importa o relatorio de logins em texto (formato do "Cofre Corban"): bancos, promotoras e lista de bancos.
function parseVaultReport(text) {
  const title = s => s.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\bDe\b|\bDa\b|\bDo\b/g, w => w.toLowerCase());
  const clean = v => { const s = String(v || "").trim(); return /^\(?n[aã]o informado\)?$/i.test(s) ? "" : s; };
  const items = [], banks = [];
  let current = null;
  // Backup .json do proprio cofre.
  try { const data = JSON.parse(text); if (data && Array.isArray(data.acessos)) return { items: data.acessos, banks: data.bancos || [] }; } catch { }
  const productsOf = v => String(v || "").split(/[,;/]/).map(s => s.trim()).filter(Boolean).map(p => (VAULT_PRODUCTS.find(x => x.toLowerCase() === p.toLowerCase()) || p.toUpperCase()));
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^\[\d+\]\s*(BANCO|PROMOTORA|SISTEMA)\s*:\s*(.+)$/i))) {
      const kind = m[1].toLowerCase() === "banco" ? "banco" : m[1].toLowerCase() === "promotora" ? "promotora" : "sistema";
      let name = title(m[2].trim());
      if (kind === "banco") name = name.replace(/^Banco\s+/i, "");
      current = { kind, name, promoter: "", products: [], login: "", password: "", url: "", notes: "", active: true };
      items.push(current);
      continue;
    }
    if (current && (m = line.match(/^-\s*([^:]+?)\s*:\s*(.*)$/))) {
      const key = m[1].toLowerCase(), value = m[2].trim();
      if (/promotora/.test(key)) current.promoter = title(value);
      else if (/produto/.test(key)) current.products = productsOf(value);
      else if (/usu[aá]rio|login/.test(key)) current.login = clean(value);
      else if (/senha/.test(key)) current.password = clean(value);
      else if (/portal|link|site/.test(key)) current.url = clean(value);
      else if (/observa/.test(key)) current.notes = value;
      continue;
    }
    if ((m = line.match(/^\d+\.\s*(.+?)\s*\|\s*Status:\s*(\w+)\s*\|\s*Portal:\s*(.*)$/i))) {
      current = null;
      banks.push({ name: m[1].trim(), url: clean(m[3]), active: !/inativo/i.test(m[2]) });
      continue;
    }
    if (/^-{5,}|^={5,}/.test(line)) current = null;
  }
  // Login de banco usa o mesmo nome da lista de bancos ("Banco Pan" -> "Pan").
  const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const it of items) if (it.kind === "banco") { const b = banks.find(x => norm(it.name).includes(norm(x.name)) || norm(x.name).includes(norm(it.name))); if (b) { it.name = b.name; if (!b.url && it.url) b.url = it.url; } }
  return { items, banks };
}
$("#vaultImportButton")?.addEventListener("click", () => {
  $("#formDialog").classList.add("wide");
  openModal("Importar lista de logins",
    `<p class="quoteBox">Cole o relatório de logins (bancos, promotoras e lista de bancos) ou o conteúdo de um backup .json do cofre. O sistema mostra quantos itens encontrou antes de gravar; os que já existem com o mesmo nome e tipo são atualizados.</p><label><span>Texto</span><textarea name="report" rows="14" class="vaultImportText" required placeholder="[01] BANCO: BANCO PAN&#10;     - Promotora Vinculada : X3 Promotora&#10;     - Usuário / Login     : ..."></textarea></label><p id="vaultImportPreview" class="muted"></p>`,
    async values => {
      const { items, banks } = parseVaultReport(values.report || "");
      if (!items.length && !banks.length) throw new Error("Não encontrei logins nesse texto.");
      if (banks.length) {
        const merged = [...(vault.banks || [])];
        for (const b of banks) { const cur = merged.find(x => x.name.toLowerCase() === b.name.toLowerCase()); if (cur) { cur.url = cur.url || b.url; } else merged.push(b); }
        for (const it of items) if (it.kind === "banco" && !merged.some(x => x.name.toLowerCase() === it.name.toLowerCase())) merged.push({ name: it.name, url: it.url || "", active: true });
        vault.banks = (await vaultCall("/api/vault/banks", { banks: merged })).banks;
      }
      const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
      let result;
      for (const item of items) {
        const existing = vault.items.find(i => i.kind === item.kind && norm(i.name) === norm(item.name) && norm(i.promoter || "") === norm(item.promoter || ""));
        result = await vaultCall("/api/vault/items", { ...item, id: existing?.id, login: item.login || existing?.login || "", password: item.password || existing?.password || "", url: item.url || existing?.url || "", notes: item.notes || existing?.notes || "", products: item.products.length ? item.products : existing?.products || [] });
        vault.items = result.items;
      }
      renderVault();
      toast(`${items.length} acesso(s) e ${banks.length} banco(s) importados.`);
    }, "Importar");
  const area = document.querySelector("#modalFields textarea[name=report]");
  area?.addEventListener("input", () => {
    const { items, banks } = parseVaultReport(area.value);
    const count = kind => items.filter(i => i.kind === kind).length;
    setTextSafe("#vaultImportPreview", items.length || banks.length ? `Encontrados: ${count("banco")} login(s) de banco, ${count("promotora")} promotora(s), ${count("sistema")} sistema(s) e ${banks.length} banco(s) para a lista.` : "");
  });
});

// ---- Entrada/cadastro de produtos por nota fiscal (XML), Excel, CSV, PDF ou foto ----
function productFileType(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xml")) return "application/xml";
  if (name.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (name.endsWith(".csv")) return "text/csv";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (/\.(jpe?g|jfif)$/.test(name)) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  return file.type || "application/octet-stream";
}
async function importProductsFile(file) {
  if (!file) return;
  toast(`Lendo ${file.name}...`);
  try {
    const response = await fetch("/api/products/import-read", { method: "POST", headers: { "content-type": productFileType(file) }, body: await file.arrayBuffer() });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || "Não foi possível ler o arquivo");
    if (result.empty) throw new Error(result.kind === "danfe" ? "Não encontrei itens neste PDF/foto. Se tiver, envie o XML da nota (vem no e-mail do fornecedor): ele traz tudo certinho." : "Nenhum item encontrado no arquivo.");
    openProductImportReview(result, file.name);
  } catch (cause) { toast(cause.message); }
}
function openProductImportReview(result, name) {
  const categories = [...new Set(state.products.map(p => p.category).filter(Boolean))].sort();
  const markupDefault = 100;
  const newPrice = cost => cost ? (cost * (1 + markupDefault / 100) / 100).toFixed(2) : "";
  const rows = result.items.map((it, i) => {
    const existing = it.productId ? state.products.find(p => p.id === it.productId) : null;
    const qty = Math.max(0, Math.round(it.quantity || 0));
    return `<tr data-row="${i}">
      <td><input type="checkbox" name="inc_${i}" checked></td>
      <td><strong>${html(it.name)}</strong><br><small class="muted">${html([it.code && `cód. ${it.code}`, it.ean && `EAN ${it.ean}`, it.unit].filter(Boolean).join(" · "))}</small></td>
      <td><select name="act_${i}">${existing ? `<option value="existing" selected>Entrada em: ${html(existing.name)}</option>` : ""}<option value="new" ${existing ? "" : "selected"}>Cadastrar novo</option></select></td>
      <td><input type="number" name="qty_${i}" value="${qty}" min="0" step="1"></td>
      <td><input type="number" name="cost_${i}" value="${it.unitCostCents ? (it.unitCostCents / 100).toFixed(2) : ""}" min="0" step="0.01" data-cost="${i}"></td>
      <td><input type="number" name="price_${i}" value="${existing ? "" : (it.priceCents ? (it.priceCents / 100).toFixed(2) : newPrice(it.unitCostCents))}" min="0" step="0.01" placeholder="${existing ? `atual ${(existing.priceCents / 100).toFixed(2)}` : ""}" data-price="${i}" ${existing ? 'data-existing="1"' : ""}></td>
      <td><select name="cat_${i}">${[it.category, ...categories].filter((c, k, a) => c && a.indexOf(c) === k).map(c => `<option ${c === (existing?.category || it.category) ? "selected" : ""}>${html(c)}</option>`).join("")}</select></td>
    </tr>`;
  }).join("");
  const matched = result.items.filter(it => it.productId).length;
  const header = result.kind === "nfe" ? `Nota ${html(result.number || "")} de ${html(result.supplier || "fornecedor")}${result.totalCents ? ` · total ${currency(result.totalCents)}` : ""}.` : result.kind === "danfe" ? `DANFE lida ${result.supplier ? `(${html(result.supplier)}) ` : ""}por texto: confira quantidades e valores.` : "Planilha lida.";
  $("#formDialog").classList.add("wide");
  openModal(`Importar produtos: ${name}`,
    `<p class="quoteBox">${header} ${result.items.length} item(ns): ${matched} já cadastrado(s) (entra no estoque e atualiza o custo) e ${result.items.length - matched} novo(s). Confira antes de gravar.</p>
     <div class="importBar"><label>Margem para preço dos novos (%) <input type="number" id="importMarkup" value="${markupDefault}" min="0" step="1"></label><button type="button" class="secondaryBtn" id="importApplyMarkup">Aplicar margem</button><span class="muted">Preço vazio num produto existente mantém o preço atual.</span></div>
     <div class="tableWrap expReview"><table class="dataTable"><thead><tr><th></th><th>Item no arquivo</th><th>Ação</th><th>Qtd entrada</th><th>Custo un. (R$)</th><th>Preço venda (R$)</th><th>Categoria</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    values => {
      const items = result.items.map((it, i) => {
        if (!values[`inc_${i}`]) return null;
        const existing = values[`act_${i}`] === "existing";
        const cost = Math.round(Number(values[`cost_${i}`] || 0) * 100), price = values[`price_${i}`] === "" ? null : Math.round(Number(values[`price_${i}`]) * 100);
        return { productId: existing ? it.productId : null, name: it.name, code: it.code, ean: it.ean, category: values[`cat_${i}`], quantity: Number(values[`qty_${i}`] || 0), unitCostCents: cost || null, priceCents: price };
      }).filter(Boolean);
      if (!items.length) throw new Error("Marque ao menos um item.");
      return api("/api/products/import-apply", { items, source: result.kind === "nfe" ? `NF ${result.number || ""} ${result.supplier || ""}`.trim() : name }).then(r => toast(`${r.updated} atualizado(s), ${r.created} novo(s), +${r.units} unidade(s) no estoque.`));
    }, "Gravar produtos");
  $("#importApplyMarkup")?.addEventListener("click", () => {
    const pct = Number($("#importMarkup").value) || 0;
    document.querySelectorAll("#modalFields [data-price]").forEach(input => {
      if (input.dataset.existing) return;
      const cost = Number(document.querySelector(`#modalFields [data-cost="${input.dataset.price}"]`)?.value || 0);
      if (cost) input.value = (cost * (1 + pct / 100)).toFixed(2);
    });
  });
}
$("#importProductsButton")?.addEventListener("click", () => $("#importProductsInput").click());
$("#importProductsInput")?.addEventListener("change", event => { const file = event.target.files[0]; event.target.value = ""; importProductsFile(file); });

$("#addDebtButton")?.addEventListener("click", () => openDebtModal());
document.addEventListener("click", event => { const go = event.target.closest("[data-view-go]")?.dataset.viewGo; if (go) view(go); });
$("#addIncomeButton")?.addEventListener("click", () => openModal("Lançar comissão ou outra receita",
  select("category", "Tipo", [["Comissão Speed Financeira", "Comissão Speed Financeira"], ["Outra receita", "Outra receita"]], "Comissão Speed Financeira") +
  field("description", "Descrição", "text", "", 'maxlength="120" placeholder="Ex.: consignado INSS - cliente Maria" required') +
  field("amount", "Valor (R$)", "number", "", 'min="0.01" step="0.01" required') +
  field("date", "Data", "date", new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }), "required"),
  values => api("/api/incomes", values).then(() => loadReport())));
document.addEventListener("click", event => { const id = event.target.closest("[data-income-del]")?.dataset.incomeDel; if (id && confirm("Excluir esta receita?")) api(`/api/incomes/${encodeURIComponent(id)}/delete`, {}).then(() => loadReport()); });
$("#marketingTabs")?.addEventListener("click", event => {
  const btn = event.target.closest("[data-mk]"); if (!btn) return;
  document.querySelectorAll("#marketingTabs [data-mk]").forEach(b => b.classList.toggle("active", b === btn));
  const results = btn.dataset.mk === "results";
  $("#marketingResults").hidden = !results; $("#marketingFrame").hidden = results;
  if (results) return loadMarketingResults();
  $("#marketingFrame").setAttribute("src", btn.dataset.mk);
  $("#marketingOpenTab").setAttribute("href", btn.dataset.mk);
});

// ---- Resultado real do marketing: vendas por campanha e por origem do cliente ----
async function loadMarketingResults() {
  const days = Number($("#mkPeriod")?.value || 30);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const start = new Date(Date.now() - (days - 1) * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  let r;
  try { r = await api(`/api/marketing/results?start=${start}&end=${today}`); }
  catch (cause) { setHtml("#mkCampaigns", `<p class="muted">${html(cause.message)}</p>`); return; }
  const active = r.campaigns.filter(c => c.active).length;
  setHtml("#mkKpis",
    metric(currency(r.totalCents), `Vendas no período (${days} dias)`) +
    metric(currency(r.trackedCents), `Vieram de campanha (${r.totalCents ? Math.round(r.trackedCents / r.totalCents * 100) : 0}%)`, r.trackedCents ? "free" : "") +
    metric(currency(r.originCents), `Com origem conhecida (${r.totalCents ? Math.round(r.originCents / r.totalCents * 100) : 0}%)`) +
    metric(String(active), active === 1 ? "Campanha ativa" : "Campanhas ativas"));
  const f = r.financeira || { leads: 0, won: 0, commissionCents: 0, fromStore: 0, fromStoreWon: 0, byProduct: {} };
  setHtml("#mkFin", `<div class="mkFinKpis">
      <div><span>Contatos</span><strong>${f.leads}</strong><small>${f.fromStore} vieram de serviço da loja</small></div>
      <div><span>Contratos</span><strong>${f.won}</strong><small>${f.leads ? Math.round(f.won / f.leads * 100) : 0}% dos contatos</small></div>
      <div><span>Comissão</span><strong>${currency(f.commissionCents)}</strong><small>${f.fromStoreWon} contrato(s) vindos da loja</small></div>
    </div>` + (Object.keys(f.byProduct).length ? table(["Produto", "Contatos", "Contratos", "Comissão"], Object.entries(f.byProduct).sort((a, b) => b[1].commissionCents - a[1].commissionCents).map(([k, v]) => `<tr><td>${html(k)}</td><td>${v.leads}</td><td>${v.won}</td><td class="money">${currency(v.commissionCents)}</td></tr>`)) : `<p class="muted">Nenhum contato da financeira no período. Registre em Financeira ou pelo aviso do caixa nos serviços de INSS, Detran e SPC.</p>`));
  setHtml("#mkCampaigns", r.campaigns.length ? table(["Campanha", "Negócio", "Código", "Resultado", "Valor", "Investimento", "Retorno", ""], r.campaigns.map(c => { const isFin = c.business === "financeira"; return `<tr class="${c.active ? "" : "mutedRow"}"><td><strong>${html(c.name)}</strong>${c.channel ? `<br><small class="muted">${html(c.channel)}</small>` : ""}</td><td>${isFin ? "Financeira" : "Loja"}</td><td><code>${html(c.code)}</code></td><td>${isFin ? `${c.leads} contatos · ${c.won} contratos` : `${c.count} vendas · ${c.newClients} clientes novos`}</td><td class="money">${currency(c.salesCents + c.commissionCents)}</td><td class="money">${c.costCents ? currency(c.costCents) : "-"}</td><td>${c.roi === null ? "-" : `${String(c.roi).replace(".", ",")}x`}</td><td class="actionsCell"><button type="button" data-mk-toggle="${html(c.code)}">${c.active ? "Encerrar" : "Reativar"}</button></td></tr>`; })) :
    `<p class="muted">Nenhuma campanha ainda. Crie uma (ex.: código SABADO para a promoção de sábado) e escolha o código no caixa ao lançar a venda.</p>`);
  setHtml("#mkOrigins", r.origins.length ? table(["Origem", "Vendas", "Valor", "Clientes novos"], r.origins.map(o => `<tr><td>${html(o.origin)}</td><td>${o.count}</td><td class="money">${currency(o.salesCents)}</td><td>${o.newClients}</td></tr>`)) :
    `<p class="muted">Ainda sem origem registrada. Pergunte "como conheceu a loja?" ao cadastrar o cliente ou ao vender para quem vem pela primeira vez.</p>`);
  mkCampaignCache = r.campaigns;
}
let mkCampaignCache = [];
$("#mkPeriod")?.addEventListener("change", loadMarketingResults);
$("#mkNewCampaign")?.addEventListener("click", () => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  openModal("Nova campanha", field("name", "Nome da campanha", "text", "", 'required placeholder="Ex.: Sábado da Lan"') +
    select("business", "Negócio", [["loja", "Loja (lan house e gráfica)"], ["financeira", "Speed Financeira"]], "loja") +
    field("code", "Código para o caixa (3 a 20 letras, sem espaço)", "text", "", 'required pattern="[A-Za-z0-9]{3,20}" placeholder="SABADO"') +
    select("channel", "Onde será divulgada", ["WhatsApp", "Instagram", "Facebook", "Google Meu Negócio", "Placa na loja", "Panfleto", "Indicação", "Outro"].map(v => [v, v]), "WhatsApp") +
    field("start", "Início", "date", today) + field("end", "Fim (opcional)", "date") + field("cost", "Investimento (R$, opcional)", "number", "", 'min="0" step="0.01"'),
    async values => { await api("/api/campaigns", values); toast("Campanha criada. Ela já aparece no caixa."); await loadMarketingResults(); }, "Criar campanha");
});
document.addEventListener("click", async event => {
  const code = event.target.closest("[data-mk-toggle]")?.dataset.mkToggle; if (!code) return;
  const camp = (await api("/api/campaigns")).campaigns.find(c => c.code === code); if (!camp) return;
  try { await api(`/api/campaigns/${camp.id}`, { active: !camp.active }); await loadMarketingResults(); await loadState(); } catch (cause) { toast(cause.message); }
});

function renderBillsBanner() {
  const el = $("#billsDueBanner"); if (!el) return;
  const bills = state.billsDue || [];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const late = bills.filter(b => new Date(b.at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) < today);
  el.hidden = !bills.length;
  if (bills.length) el.innerHTML = `<strong>${late.length ? `${late.length} conta(s) vencida(s)` : "Contas vencendo"}:</strong> ${bills.slice(0, 4).map(b => `${html(b.description)} ${currency(b.amountCents)} (${new Date(b.at).toLocaleDateString("pt-BR")})`).join(" · ")}${bills.length > 4 ? ` e mais ${bills.length - 4}` : ""} <button type="button" data-view-go="expenses">Ver despesas</button>`;
}
function renderDashboardCockpit() {
  if (!state) return;
  const cs = state.cashSummary || {};
  const dailyGoalCents = cs.dailyGoalCents || 50000;
  const todaySalesCents = cs.todaySalesCents || 0;
  const expectedCashCents = cs.expectedCashCents || 0;
  const pct = dailyGoalCents > 0 ? Math.min(100, Math.round((todaySalesCents / dailyGoalCents) * 100)) : 100;

  setTextSafe("#dashGoalTarget", currency(dailyGoalCents));
  setTextSafe("#dashGoalActual", currency(todaySalesCents));
  const remainingCents = Math.max(0, dailyGoalCents - todaySalesCents);
  const remainingEl = $("#dashGoalRemaining");
  if (remainingEl) {
    if (remainingCents === 0 && todaySalesCents >= dailyGoalCents) {
      remainingEl.textContent = "Meta do Dia Atingida!";
      remainingEl.style.color = "#15803d";
    } else {
      remainingEl.textContent = `(Faltam ${currency(remainingCents)})`;
      remainingEl.style.color = "";
    }
  }
  const barEl = $("#dashGoalBar");
  if (barEl) {
    barEl.style.width = `${pct}%`;
    barEl.classList.toggle("completed", pct >= 100);
  }
  setTextSafe("#dashGoalPct", `${pct}% da meta atingida`);
  setTextSafe("#dashDrawerCash", `Dinheiro na gaveta: ${currency(expectedCashCents)}`);

  // Meta mensal
  const monthGoalCents = cs.monthGoalCents || 0;
  const monthSalesCents = cs.monthSalesCents || 0;
  const monthPct = monthGoalCents > 0 ? Math.min(100, Math.round((monthSalesCents / monthGoalCents) * 100)) : 0;
  const monthBarEl = $("#dashMonthGoalBar");
  if (monthBarEl) {
    monthBarEl.style.width = `${monthPct}%`;
    monthBarEl.classList.toggle("completed", monthPct >= 100);
  }
  setTextSafe("#dashMonthActual", currency(monthSalesCents));
  setTextSafe("#dashMonthTarget", currency(monthGoalCents));
  setTextSafe("#dashMonthPct", monthGoalCents > 0 ? `${monthPct}% da meta mensal` : "Meta mensal não configurada");

  // Central de Alertas Rápidos (HUD)
  const hudEl = $("#dashAlertsHud");
  if (hudEl) {
    const alerts = [];
    const ha = state.hudAlerts || {};
    if (ha.overdueBillsCount > 0) {
      alerts.push(`<div class="dashHudAlert danger"><span><strong>${ha.overdueBillsCount} ${ha.overdueBillsCount === 1 ? "conta atrasada" : "contas atrasadas"}</strong> (${currency(ha.overdueBillsCents || 0)})</span><button type="button" data-view-go="expenses">Ver despesas</button></div>`);
    }
    if (ha.zeroStockCount > 0) {
      alerts.push(`<div class="dashHudAlert warn"><span><strong>${ha.zeroStockCount} produtos com estoque zerado ou negativo</strong></span><button type="button" data-view-go="products">Repor estoque</button></div>`);
    }
    if (ha.lateDebtsCount > 0) {
      alerts.push(`<div class="dashHudAlert warn"><span><strong>${ha.lateDebtsCount} ${ha.lateDebtsCount === 1 ? "fiado aberto" : "fiados abertos"} há mais de 30 dias</strong> (${currency(ha.lateDebtsCents || 0)})</span><button type="button" data-view-go="clients">Cobrar fiados</button></div>`);
    }
    hudEl.hidden = !alerts.length;
    hudEl.innerHTML = alerts.join("");
  }
}

function render() {
  if (!state) return;
  renderBillsBanner();
  renderDashboardCockpit();
  renderPosMachineDue();
  document.querySelectorAll("[data-admin-only]").forEach(el => { el.hidden = state.user.role !== "admin"; });
  renderMachines();
  renderCash();
  renderClients();
  renderProducts();
  renderSettings();
  renderUsers();
  renderReport();
}

// ---- Financeira: funil de contatos da Speed Financeira ----
let leadData = null;
async function loadLeads() {
  try { leadData = await api("/api/leads"); renderLeads(); } catch (cause) { setHtml("#leadBoard", `<p class="muted">${html(cause.message)}</p>`); }
}
function renderLeads() {
  if (!leadData) return;
  const sel = $("#leadProductFilter");
  if (sel && sel.options.length <= 1) sel.innerHTML = `<option value="">Todos os produtos</option>${leadData.products.map(p => `<option>${html(p)}</option>`).join("")}`;
  const product = sel?.value || "";
  const leads = leadData.leads.filter(l => !product || l.product === product);
  const month = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  const inMonth = leads.filter(l => (l.createdAt || "").slice(0, 7) === month);
  const wonMonth = leads.filter(l => l.stage === "won" && (l.closedAt || "").slice(0, 7) === month);
  const closed = leads.filter(l => l.stage === "won" || l.stage === "lost");
  const conv = closed.length ? Math.round(closed.filter(l => l.stage === "won").length / closed.length * 100) : 0;
  const fromStore = inMonth.filter(l => l.source === "Serviço da loja").length;
  setHtml("#leadKpis",
    metric(String(inMonth.length), `Contatos no mês (${fromStore} vieram da loja)`) +
    metric(String(leads.filter(l => !["won", "lost"].includes(l.stage)).length), "Em andamento") +
    metric(String(wonMonth.length), `Contratos no mês · conversão ${conv}%`, wonMonth.length ? "free" : "") +
    metric(currency(wonMonth.reduce((s, l) => s + (l.commissionCents || 0), 0)), "Comissão no mês", wonMonth.length ? "free" : ""));
  const daysAgo = at => Math.max(0, Math.floor((Date.now() - Date.parse(at)) / 86400000));
  const wa = phone => { const d = String(phone || "").replace(/\D/g, ""); return d ? `https://wa.me/${d.length <= 11 ? "55" + d : d}` : ""; };
  setHtml("#leadBoard", leadData.stages.map(stage => {
    const cards = leads.filter(l => l.stage === stage.key);
    const total = cards.reduce((s, l) => s + (l.commissionCents || 0), 0);
    return `<div class="leadCol ${stage.key}">
      <div class="leadColHead"><strong>${html(stage.label)}</strong><span>${cards.length}${stage.key === "won" && total ? ` · ${currency(total)}` : ""}</span></div>
      ${cards.map(l => `<article class="leadCard">
        <div class="leadCardTop"><strong>${html(l.name)}</strong><span class="planTag">${html(l.product)}</span></div>
        <div class="leadMeta">${html(l.source)}${l.sourceDetail ? ` · ${html(l.sourceDetail)}` : ""}${l.campaign ? ` · <code>${html(l.campaign)}</code>` : ""}</div>
        <div class="leadMeta">${wa(l.phone) ? `<a href="${wa(l.phone)}" target="_blank" rel="noopener">${html(l.phone)}</a>` : html(l.phone)} · ${daysAgo(l.stageAt || l.createdAt)} dia(s) nesta etapa</div>
        ${l.notes ? `<div class="leadNotes">${html(l.notes)}</div>` : ""}
        ${l.stage === "won" ? `<div class="leadWon">Comissão ${currency(l.commissionCents)}${l.contractCents ? ` · contrato ${currency(l.contractCents)}` : ""}</div>` : ""}
        ${l.stage === "lost" && l.lostReason ? `<div class="leadMeta">Motivo: ${html(l.lostReason)}</div>` : ""}
        <select data-lead-stage="${html(l.id)}" aria-label="Etapa">${leadData.stages.map(s => `<option value="${s.key}" ${s.key === l.stage ? "selected" : ""}>${html(s.label)}</option>`).join("")}</select>
      </article>`).join("") || `<p class="muted leadEmpty">Nenhum contato.</p>`}
    </div>`;
  }).join(""));
}
function openLeadModal(prefill = {}) {
  const products = leadData?.products || ["Consignado INSS", "Antecipação FGTS", "Consignado CLT", "Portabilidade", "Refinanciamento", "Financiamento de veículos"];
  const sources = leadData?.sources || ["Serviço da loja", "Indicação", "Campanha", "Passou na frente", "WhatsApp", "Instagram", "Facebook", "Google", "Cliente antigo", "Outro"];
  const camps = (state.campaigns || []);
  openModal("Novo contato da financeira",
    field("name", "Nome", "text", prefill.name || "", "required") + field("phone", "Telefone / WhatsApp", "tel", prefill.phone || "", "required") +
    select("product", "Interesse", products.map(p => [p, p]), prefill.product || products[0]) +
    select("source", "De onde veio", sources.map(s => [s, s]), prefill.source || "Passou na frente") +
    field("sourceDetail", "Detalhe (ex.: serviço feito na loja, quem indicou)", "text", prefill.sourceDetail || "") +
    (camps.length ? select("campaign", "Campanha", [["", "Nenhuma"], ...camps.map(c => [c.code, `${c.code} · ${c.name}`])], "") : "") +
    field("notes", "Observações (benefício, margem, banco atual)", "text", ""),
    async values => { await api("/api/leads", { ...values, clientId: prefill.clientId }); toast("Contato registrado na financeira."); if (currentView === "leads") await loadLeads(); }, "Registrar");
}
$("#leadAddButton")?.addEventListener("click", () => openLeadModal());
$("#leadProductFilter")?.addEventListener("change", renderLeads);
$("#posFinLeadBtn")?.addEventListener("click", async () => {
  if (!leadData) { try { leadData = await api("/api/leads"); } catch { } }
  const item = finHintItem();
  const client = posCustomer.id ? state.clients.find(c => c.id === posCustomer.id) : null;
  openLeadModal({ name: client?.name || (posCustomer.name !== "Consumidor Final" ? posCustomer.name : ""), phone: client?.phone || "", clientId: client?.id, source: "Serviço da loja", sourceDetail: item?.name || "", product: suggestedFinProduct(item?.name || "") });
});
document.addEventListener("change", async event => {
  const sel = event.target.closest("[data-lead-stage]"); if (!sel) return;
  const id = sel.dataset.leadStage, stage = sel.value;
  const lead = leadData.leads.find(l => l.id === id);
  if (stage === "won") {
    renderLeads();
    openModal(`Contrato fechado · ${lead.name}`, `<p class="quoteBox">${html(lead.product)}. A comissão entra como receita da Speed Financeira nos relatórios.</p>` +
      field("commission", "Comissão recebida (R$)", "number", lead.commissionCents ? (lead.commissionCents / 100).toFixed(2) : "", 'min="0.01" step="0.01" required') +
      field("contract", "Valor do contrato (R$, conta na meta da financeira)", "number", lead.contractCents ? (lead.contractCents / 100).toFixed(2) : "", 'min="0.01" step="0.01" required'),
      async values => { await api(`/api/leads/${id}`, { stage: "won", commission: values.commission, contract: values.contract }); playChime("success"); toast("Contrato registrado."); await loadLeads(); }, "Confirmar contrato");
    return;
  }
  if (stage === "lost") {
    renderLeads();
    openModal(`Não fechou · ${lead.name}`, select("lostReason", "Motivo", ["Sem margem", "Taxa alta", "Desistiu", "Fechou em outro lugar", "Não atende aos requisitos", "Sem retorno do cliente", "Outro"].map(v => [v, v]), "Sem margem"),
      async values => { await api(`/api/leads/${id}`, { stage: "lost", lostReason: values.lostReason }); await loadLeads(); }, "Salvar");
    return;
  }
  try { await api(`/api/leads/${id}`, { stage }); await loadLeads(); } catch (cause) { toast(cause.message); }
});

// ---- Plano de ação: sugestões calculadas pelo servidor + ações acompanhadas ----
let planData = null, planFilter = "open";
const PLAN_STATUS = { todo: "A fazer", doing: "Fazendo", done: "Concluída" };
const PLAN_PRIORITY = { alta: "Prioridade alta", media: "Prioridade média", baixa: "Prioridade baixa" };
async function loadPlan() {
  try { planData = await api("/api/actions"); renderPlan(); }
  catch (cause) { setHtml("#planList", `<p class="muted">${html(cause.message)}</p>`); }
}
function planStepsHtml(a) {
  const steps = a.steps || []; if (!steps.length) return "";
  const done = steps.filter(s => s.done).length;
  return `<div class="planSteps"><div class="planStepsHead"><span>${done} de ${steps.length} passos</span><div class="planStepsBar"><i style="width:${Math.round(done / steps.length * 100)}%"></i></div></div>
    ${steps.map((s, i) => `<label class="planStep ${s.done ? "done" : ""}"><input type="checkbox" data-plan-step="${html(a.id)}" data-index="${i}" ${s.done ? "checked" : ""}><span>${html(s.text)}</span></label>`).join("")}</div>`;
}
function planEffectHtml(a) {
  const e = a.effect;
  if (!a.metric) return "";
  const m = (planData.metrics || {})[a.metric] || {};
  if (!e) return `<p class="planEffect muted" title="Ao concluir, o sistema compara os 14 dias antes com os 14 dias depois.">Resultado medido por: ${html(m.label || "")}</p>`;
  const fmt = v => v === null || v === undefined ? "-" : e.money ? currency(v) : `${String(v).replace(".", ",")}${e.unit ? " " + e.unit : ""}`;
  const change = e.changePct === null ? "" : `${e.changePct > 0 ? "+" : ""}${String(e.changePct).replace(".", ",")}%`;
  return `<p class="planEffect ${e.better === null ? "" : e.better ? "good" : "bad"}"><strong>${html(e.label)}:</strong> antes ${fmt(e.before)} · depois ${fmt(e.after)}${change ? ` (${change})` : ""}${e.complete ? "" : ` · medindo, ${e.daysMeasured} de 14 dias`}</p>`;
}
document.addEventListener("change", async event => {
  const box = event.target.closest("[data-plan-step]"); if (!box) return;
  const action = (planData?.actions || []).find(a => a.id === box.dataset.planStep); if (!action) return;
  const steps = (action.steps || []).map((s, i) => ({ text: s.text, done: i === Number(box.dataset.index) ? box.checked : s.done }));
  try { await api(`/api/actions/${encodeURIComponent(action.id)}`, { steps }); await loadPlan(); } catch (cause) { toast(cause.message); }
});
$("#planTemplateButton")?.addEventListener("click", async () => {
  try { const r = await api("/api/actions/template", { key: "outubro-2026" }); toast(`Plano de outubro importado: ${r.added} ações novas e 4 metas semanais.`); await loadPlan(); } catch (cause) { toast(cause.message); }
});
function renderPlan() {
  if (!planData) return;
  const k = planData.kpis, actions = planData.actions || [];
  const perDay = k.workedDays ? Math.round(k.salesCount / k.workedDays) : 0;
  const goalPct = k.monthGoalCents ? Math.round(k.projectionCents / k.monthGoalCents * 100) : 0;
  setHtml("#planKpis",
    metric(currency(k.salesCents), "Vendas no mês") +
    metric(currency(k.projectionCents), `Projeção do mês (${goalPct}% da meta de ${currency(k.monthGoalCents)})`, goalPct >= 100 ? "free" : "warn") +
    metric(currency(k.averageTicketCents), "Ticket médio por venda") +
    metric(String(perDay), "Vendas por dia"));
  const done = actions.filter(a => a.status === "done").length;
  setTextSafe("#planProgress", actions.length ? `${done} de ${actions.length} concluídas` : "");
  const tpl = (planData.templates || []).find(t => t.key === "outubro-2026");
  const tplBtn = $("#planTemplateButton"); if (tplBtn) tplBtn.hidden = !tpl || tpl.imported;
  const GOAL_STATUS = { ahead: ["No ritmo", "good"], behind: ["Abaixo do ritmo", "bad"], hit: ["Meta batida", "good"], missed: ["Não bateu", "bad"], future: ["Ainda não começou", ""] };
  setHtml("#planGoals", (planData.goals || []).map(g => {
    const [statusText, tone] = GOAL_STATUS[g.status] || ["", ""];
    const fmtDay = d => d.slice(8, 10) + "/" + d.slice(5, 7);
    return `<div class="planGoal ${tone}">
      <div class="planGoalHead"><strong>${html(g.label)}</strong><span>${fmtDay(g.start)} a ${fmtDay(g.end)}</span></div>
      <div class="planGoalValue"><strong>${currency(g.soldCents)}</strong><span>de ${currency(g.targetCents)}</span></div>
      <div class="planGoalBar"><i style="width:${Math.min(100, g.percent)}%"></i>${g.status === "ahead" || g.status === "behind" ? `<b style="left:${Math.min(100, Math.round(g.expectedCents / g.targetCents * 100))}%" title="Esperado até hoje: ${currency(g.expectedCents)}"></b>` : ""}</div>
      <small>${statusText}${g.status === "behind" ? ` · faltam ${currency(g.expectedCents - g.soldCents)} para o ritmo` : g.status === "ahead" ? ` · ${g.percent}% da meta` : ""}</small>
    </div>`;
  }).join(""));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const order = { doing: 0, todo: 1, done: 2 };
  const shown = actions.filter(a => planFilter === "all" || (planFilter === "done" ? a.status === "done" : a.status !== "done"))
    .sort((a, b) => order[a.status] - order[b.status] || String(a.due).localeCompare(String(b.due)));
  setHtml("#planList", shown.length ? shown.map(a => {
    const late = a.status !== "done" && a.due && a.due < today;
    return `<article class="planItem ${a.status}${late ? " late" : ""}">
      <div class="planItemMain">
        <div class="planTags"><span class="planTag ${a.priority}">${PLAN_PRIORITY[a.priority] || ""}</span><span class="planTag">${html(a.area || "Geral")}</span>${late ? '<span class="planTag lateTag">Atrasada</span>' : ""}</div>
        <h3>${html(a.title)}</h3>
        ${planStepsHtml(a)}
        ${planEffectHtml(a)}
        ${a.why || a.how ? `<details><summary>Por que e como fazer</summary>${a.why ? `<p><strong>Por quê:</strong> ${html(a.why)}</p>` : ""}${a.how ? `<p><strong>Como:</strong> ${html(a.how)}</p>` : ""}${a.impact ? `<p><strong>Resultado esperado:</strong> ${html(a.impact)}</p>` : ""}</details>` : ""}
      </div>
      <div class="planItemSide">
        <label><span>Situação</span><select data-plan-field="status" data-id="${html(a.id)}">${Object.entries(PLAN_STATUS).map(([v, t]) => `<option value="${v}" ${v === a.status ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label><span>Prazo</span><input type="date" data-plan-field="due" data-id="${html(a.id)}" value="${html(a.due || "")}"></label>
        <label><span>Responsável</span><input data-plan-field="owner" data-id="${html(a.id)}" value="${html(a.owner || "")}" placeholder="Quem faz"></label>
        <label><span>Medir pelo indicador</span><select data-plan-field="metric" data-id="${html(a.id)}"><option value="">Não medir</option>${Object.entries(planData.metrics || {}).map(([k, m]) => `<option value="${k}" ${k === a.metric ? "selected" : ""}>${html(m.label)}</option>`).join("")}</select></label>
        <button type="button" class="linkDanger" data-plan-delete="${html(a.id)}">Remover</button>
      </div>
    </article>`;
  }).join("") : `<p class="muted">${planFilter === "done" ? "Nenhuma ação concluída ainda." : "Nenhuma ação em aberto. Adicione uma sugestão abaixo ou crie uma nova ação."}</p>`);
  const inPlan = new Set(actions.map(a => a.key).filter(Boolean));
  const pending = (planData.suggestions || []).filter(s => !inPlan.has(s.key));
  const already = (planData.suggestions || []).length - pending.length;
  setHtml("#planSuggestions", (already ? `<p class="muted planAlready">${already} ${already === 1 ? "sugestão já está" : "sugestões já estão"} no seu plano.</p>` : "") + pending.map(s => `<article class="planSuggestion">
    <div class="planTags"><span class="planTag ${s.priority}">${PLAN_PRIORITY[s.priority] || ""}</span><span class="planTag">${html(s.area)}</span></div>
    <h3>${html(s.title)}</h3>
    <p>${html(s.why)}</p>
    <p class="muted"><strong>Como:</strong> ${html(s.how)}</p>
    ${s.impact ? `<p class="planImpact">${html(s.impact)}</p>` : ""}
    <div>${inPlan.has(s.key) ? '<span class="planInPlan">No plano</span>' : `<button type="button" class="secondaryBtn" data-plan-add="${html(s.key)}">Adicionar ao plano</button>`}</div>
  </article>`).join("") + (pending.length ? "" : `<p class="muted">Nenhuma sugestão nova agora.</p>`));
}
document.addEventListener("change", async event => {
  const el = event.target.closest("[data-plan-field]"); if (!el) return;
  try { await api(`/api/actions/${encodeURIComponent(el.dataset.id)}`, { [el.dataset.planField]: el.value }); await loadPlan(); if (el.value === "done") toast("Ação concluída."); }
  catch (cause) { toast(cause.message); }
});
document.addEventListener("click", async event => {
  const filter = event.target.closest("[data-plan-filter]");
  if (filter) { planFilter = filter.dataset.planFilter; document.querySelectorAll("[data-plan-filter]").forEach(b => b.classList.toggle("active", b === filter)); return renderPlan(); }
  const addKey = event.target.closest("[data-plan-add]")?.dataset.planAdd;
  if (addKey) {
    const s = (planData?.suggestions || []).find(row => row.key === addKey); if (!s) return;
    try { await api("/api/actions", s); toast("Ação adicionada ao plano."); await loadPlan(); } catch (cause) { toast(cause.message); }
    return;
  }
  const del = event.target.closest("[data-plan-delete]")?.dataset.planDelete;
  if (del && confirm("Remover esta ação do plano?")) {
    try { await api(`/api/actions/${encodeURIComponent(del)}/delete`, {}); await loadPlan(); } catch (cause) { toast(cause.message); }
  }
});
$("#planAddButton")?.addEventListener("click", () => {
  const due = new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  openModal("Nova ação", field("title", "O que fazer", "text", "", 'required maxlength="140"') +
    select("area", "Área", ["Vendas", "Preços", "Marketing", "Lan house", "Custos", "Estoque", "Caixa", "Equipe", "Geral"].map(v => [v, v]), "Vendas") +
    select("priority", "Prioridade", [["alta", "Alta"], ["media", "Média"], ["baixa", "Baixa"]], "media") +
    field("due", "Prazo", "date", due) + field("owner", "Responsável") + field("how", "Como fazer (opcional)"),
    async values => { await api("/api/actions", values); await loadPlan(); }, "Adicionar");
});

function view(name) {
  currentView = name;
  for (const section of document.querySelectorAll(".view")) section.hidden = section.id !== `view-${name}`;
  for (const button of document.querySelectorAll("[data-view]")) button.classList.toggle("active", button.dataset.view === name);
  const titles = { machines: "Atendimento", cash: "Caixa e vendas", clients: "Clientes", products: "Catálogo e estoque", settings: "Configurações", reports: "Relatórios", users: "Operadores", expenses: "Despesas", marketing: "Speed Marketing", vault: "Logins bancários", plan: "Plano de ação", leads: "Financeira" };
  const label = titles[name] || "Painel";
  $("#pageTitle").textContent = label;
  document.title = `${label} · Nexcafé`;
  if (name === "plan") loadPlan();
  if (name === "cash") loadPosFavorites();
  if (name === "leads") loadLeads();
  if (name === "vault") loadVault();
  if (name === "expenses") loadExpenses();
  if (name === "marketing" && !$("#marketingResults").hidden) loadMarketingResults();
  if (name === "reports") loadReport();
  if (name === "cash") {
    renderPOS();
    setTimeout(() => {
      const s = $("#posSearchInput");
      if (s) { s.focus(); s.select(); }
    }, 50);
  }
}

async function loadReport(period = null, customStart = null, customEnd = null) {
  if (period) reportPeriod = period;
  try {
    const dateInput = $("#reportDate")?.value || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    let url = `/api/reports?date=${encodeURIComponent(dateInput)}&period=${encodeURIComponent(reportPeriod)}`;
    if (reportPeriod === "custom") {
      const cStart = customStart || $("#rpCustomStart")?.value;
      const cEnd = customEnd || $("#rpCustomEnd")?.value;
      if (cStart && cEnd) {
        url += `&start=${encodeURIComponent(cStart)}&end=${encodeURIComponent(cEnd)}`;
      }
    }
    report = await api(url);
    renderReport();
  } catch (cause) { toast(cause.message); }
}

document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => view(button.dataset.view)));
$("#refreshButton").addEventListener("click", loadState);

$("#powerAllButton").addEventListener("click", async () => {
  if (!confirm("Enviar sinal Wake-on-LAN para TODAS as estações cadastradas?")) return;
  try {
    const result = await api("/api/machines/power-all", {});
    toast(`Wake-on-LAN enviado para ${result.count} estação(ões).`);
    await loadState();
  } catch (cause) { toast(cause.message); }
});

$("#shutdownAllButton").addEventListener("click", async () => {
  const busy = state.machines.filter(m => m.session).map(m => m.name);
  if (!confirm(`Desligar as máquinas livres?${busy.length ? `\n\nFicam ligadas as que estão em uso: ${busy.join(", ")}.` : ""}`)) return;
  try {
    const result = await api("/api/machines/shutdown-all", {});
    toast(`Desligando ${result.count} máquina(s) livre(s).${result.inUse?.length ? ` Em uso, continuam ligadas: ${result.inUse.join(", ")}.` : ""}`);
    await loadState();
  } catch (cause) { toast(cause.message); }
});

$("#clientSearch").addEventListener("input", renderClients);
$("#productSearch").addEventListener("input", renderProducts);
$("#productCategory").addEventListener("change", renderProducts);
$("#productStatus").addEventListener("change", renderProducts);
$("#reportDate").value = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
$("#reportDate").addEventListener("change", loadReport);

function field(name, title, type = "text", value = "", attrs = "") {
  return `<label><span>${title}</span><input name="${name}" type="${type}" value="${html(value)}" ${attrs}></label>`;
}

function select(name, title, values, selected) {
  return `<label><span>${title}</span><select name="${name}">${values.map(([value, text]) => `<option value="${html(value)}" ${value === selected ? "selected" : ""}>${html(text)}</option>`).join("")}</select></label>`;
}

function paymentField() {
  return select("paymentMethod", "Meio de Pagamento", options.map(value => [value, methodName[value]]), "cash");
}

document.addEventListener("click", event => {
  const btn = event.target.closest("[data-shift-summary]"); if (!btn) return;
  const id = btn.dataset.shiftSummary || state?.cashShift?.id;
  if (!id) return toast("Nenhum caixa aberto.");
  openShiftSummary(id).catch(cause => toast(cause.message));
});
// Resumo do turno: aparece ao fechar o caixa e no botão "Resumo" de cada caixa fechado.
const METHOD_LABELS = { cash: "Dinheiro", pix: "Pix", debit: "Débito", credit: "Crédito", card: "Cartão" };
async function openShiftSummary(shiftId) {
  const r = await api(`/api/cash/shifts/${encodeURIComponent(shiftId)}/summary`);
  const when = `${dateTime(r.shift.openedAt)} até ${r.shift.closedAt ? dateTime(r.shift.closedAt) : "agora (caixa aberto)"}`;
  const methods = Object.entries(r.byMethod).sort((a, b) => b[1] - a[1]).map(([k, v]) => [METHOD_LABELS[k] || k, v]);
  const kinds = Object.entries(r.byKind).sort((a, b) => b[1] - a[1]);
  const adjIn = r.adjustments.filter(a => a.direction === "in"), adjOut = r.adjustments.filter(a => a.direction === "out");
  const sum = list => list.reduce((s, a) => s + a.amountCents, 0);
  const diff = r.differenceCents;
  const diffText = diff === null ? "caixa ainda aberto" : diff === 0 ? "sem diferença" : diff > 0 ? `sobra de ${currency(diff)}` : `falta de ${currency(-diff)}`;
  const rows = (list) => list.map(([k, v]) => `<tr><td>${html(k)}</td><td class="money">${currency(v)}</td></tr>`).join("") || `<tr><td colspan="2" class="muted">Nada no turno.</td></tr>`;
  const text = [
    `*Fechamento de caixa · Nexcafé*`, when, ``,
    `*Recebido no turno:* ${currency(r.receivedCents)} (${r.paymentsCount} ${r.paymentsCount === 1 ? "recebimento" : "recebimentos"})`,
    ...methods.map(([k, v]) => `  ${k}: ${currency(v)}`), ``,
    `*Por tipo de venda*`, ...kinds.map(([k, v]) => `  ${k}: ${currency(v)}`), ``,
    `*Gaveta*`, `  Troco inicial: ${currency(r.shift.openingCents)}`,
    ...(adjIn.length ? [`  Suprimentos: ${currency(sum(adjIn))}`] : []), ...(adjOut.length ? [`  Sangrias: ${currency(sum(adjOut))}`] : []),
    `  Esperado: ${currency(r.expectedCents)}`, ...(r.countedCents !== null ? [`  Contado: ${currency(r.countedCents)} (${diffText})`, `  Depósito: ${currency(Math.max(0, r.countedCents - r.shift.openingCents))} (ficam ${currency(Math.min(r.countedCents, r.shift.openingCents))} de troco)`] : []), ``,
    `*A receber*`, `  Deixado em aberto neste turno: ${currency(r.newDueCents)} (${r.newDueCount})`, `  Total em aberto na loja: ${currency(r.pendingCents)} (${r.pendingCount})`,
    ...(r.cancelledCount ? [`  Cancelado no turno: ${currency(r.cancelledCents)} (${r.cancelledCount})`] : [])
  ].join("\n");
  const body = `<div class="shiftSummary">
    <p class="muted">${html(when)} · aberto por ${html(r.shift.openedBy || "-")}${r.shift.closedBy ? ` · fechado por ${html(r.shift.closedBy)}` : ""}</p>
    <div class="shiftKpis">
      <div><span>Recebido</span><strong>${currency(r.receivedCents)}</strong><small>${r.paymentsCount} ${r.paymentsCount === 1 ? "recebimento" : "recebimentos"}</small></div>
      <div><span>Gaveta esperada</span><strong>${currency(r.expectedCents)}</strong><small>troco inicial ${currency(r.shift.openingCents)}</small></div>
      <div class="${diff ? (diff > 0 ? "good" : "bad") : ""}"><span>Contado</span><strong>${r.countedCents === null ? "-" : currency(r.countedCents)}</strong><small>${html(diffText)}${r.countedCents === null ? "" : ` · depósito ${currency(Math.max(0, r.countedCents - r.shift.openingCents))}`}</small></div>
      <div class="${r.newDueCents ? "bad" : ""}"><span>Ficou a receber</span><strong>${currency(r.newDueCents)}</strong><small>total na loja ${currency(r.pendingCents)}</small></div>
    </div>
    <div class="shiftCols">
      <table class="dataTable"><thead><tr><th>Forma de pagamento</th><th>Valor</th></tr></thead><tbody>${rows(methods)}</tbody></table>
      <table class="dataTable"><thead><tr><th>Tipo de venda</th><th>Valor</th></tr></thead><tbody>${rows(kinds)}</tbody></table>
    </div>
    ${r.adjustments.length ? `<table class="dataTable"><thead><tr><th>Sangria / suprimento</th><th>Motivo</th><th>Valor</th></tr></thead><tbody>${r.adjustments.map(a => `<tr><td>${a.direction === "in" ? "Suprimento" : "Sangria"} · ${dateTime(a.at)}</td><td>${html(a.reason || "-")}</td><td class="money">${a.direction === "in" ? "" : "-"}${currency(a.amountCents)}</td></tr>`).join("")}</tbody></table>` : ""}
    <div class="shiftActions">
      <button type="button" class="secondaryBtn" id="shiftPrint">Imprimir</button>
      <a class="waButton" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">Enviar no WhatsApp</a>
    </div>
  </div>`;
  $("#formDialog").classList.add("wide");
  openModal(r.shift.closedAt ? "Resumo do caixa fechado" : "Resumo do caixa (parcial)", body, () => Promise.resolve(), "Fechar");
  $("#shiftPrint").addEventListener("click", () => {
    const w = window.open("", "_blank", "width=420,height=700"); if (!w) return toast("Libere as janelas pop-up para imprimir.");
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Fechamento de caixa</title><style>body{font-family:Segoe UI,Arial;font-size:13px;margin:16px;color:#111}pre{white-space:pre-wrap;font-family:inherit}</style></head><body><pre>${html(text.replaceAll("*", ""))}</pre></body></html>`);
    w.document.close(); w.focus(); w.print();
  });
}

function openModal(title, fields, onSubmit, submitText = "Salvar") {
  $("#modalTitle").textContent = title;
  $("#modalFields").innerHTML = fields;
  syncExpensePaymentField();
  $("#modalSubmit").textContent = submitText;
  $("#modalSubmit").disabled = false;
  $("#modalError").hidden = true;
  modalSubmit = onSubmit;
  $("#formDialog").showModal();
  $("#modalFields input:not([type=hidden]), #modalFields select")?.focus();
}

// Enter confirma a janela mesmo com o foco numa lista (ex.: "Encerrar & Receber" com Dinheiro selecionado).
$("#modalForm").addEventListener("keydown", event => {
  if (event.key === "Enter" && event.target.tagName === "SELECT") { event.preventDefault(); $("#modalForm").requestSubmit(); }
});
$("#modalClose").addEventListener("click", () => $("#formDialog").close());
$("#modalCancel").addEventListener("click", () => $("#formDialog").close());

$("#modalForm").addEventListener("submit", async event => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const submit = $("#modalSubmit");
  submit.disabled = true;
  try {
    await modalSubmit(values);
    $("#formDialog").close();
    await loadState();
  } catch (cause) {
    $("#modalError").textContent = cause.message;
    $("#modalError").hidden = false;
  } finally { submit.disabled = false; }
});

function openStartModal(machine, wait = null) {
  const clients = state.clients.filter(item => item.active).slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const free = state.machines.filter(item => !item.session && item.status !== "offline" && !item.maintenance && item.restoreSeq <= (item.appliedRestoreSeq || 0));
  const target = wait ? select("targetMachineId", "Terminal", free.map(item => [item.id, item.name]), machine.id) : "";
  const fields = target + 
    field("clientSearch", "Localizar cliente cadastrado", "search", "", 'placeholder="Digite o nome ou login" autocomplete="off"') + 
    select("clientId", "Cliente selecionado", [["", "Cliente Avulso (sem cadastro)"], ...clients.map(item => [item.id, `${item.name}${item.creditSeconds ? ` · saldo ${formatCredit(item.creditSeconds)}` : ""}`])], "") + 
    field("customer", "Nome do cliente avulso (opcional)", "text", wait?.name || "") + 
    '<div class="presetRow" aria-label="Durações rápidas"><button type="button" data-preset="15">15 min</button><button type="button" data-preset="30">30 min</button><button type="button" data-preset="60">1 hora</button></div>' + 
    field("minutes", "Duração contratada (minutos)", "number", state.settings.defaultMinutes, 'min="1" max="1440" required') + 
    select("billingMode", "Modalidade de Cobrança", [["open", "Tempo livre (paga o que usar ao sair)"], ["postpaid", "Tempo fixo (paga ao sair)"], ["prepaid", "Tempo fixo (paga antecipado agora)"], ["credit", "Usar saldo de tempo do cliente"]], "open") + 
    paymentField() + 
    '<p id="startQuote" class="quoteBox" role="status">Calculando valor previsto...</p>';

  openModal(`Liberar ${machine.name}`, fields, values => api(`/api/machines/${encodeURIComponent(values.targetMachineId || machine.id)}/start`, { ...values, minutes: Number(values.minutes), waitId: wait?.id || null }), "Liberar Terminal");
  
  const form = $("#modalForm"), clientSelect = form.elements.clientId, search = form.elements.clientSearch, mode = form.elements.billingMode, minutes = form.elements.minutes;
  let quoteRun = 0;

  search.addEventListener("input", () => {
    const term = search.value.trim().toLocaleLowerCase("pt-BR");
    const selected = clientSelect.value;
    const visible = clients.filter(item => !term || `${item.name} ${item.login || ""}`.toLocaleLowerCase("pt-BR").includes(term));
    clientSelect.innerHTML = `<option value="">Cliente Avulso (sem cadastro)</option>${visible.map(item => `<option value="${html(item.id)}">${html(item.name)}${item.creditSeconds ? ` · saldo ${formatCredit(item.creditSeconds)}` : ""}</option>`).join("")}`;
    if (visible.some(item => item.id === selected)) clientSelect.value = selected;
    else if (term && visible.length === 1) clientSelect.value = visible[0].id;
    if (clientSelect.value !== selected) applyClientMode();
    update();
  });
  // Cliente com saldo de tempo: a liberação usa o saldo sozinha (liberar em "tempo livre" cobrava de novo).
  function applyClientMode() {
    const client = clients.find(item => item.id === clientSelect.value);
    if (client && (client.creditSeconds || 0) >= 60) { mode.value = "credit"; minutes.value = Math.floor(client.creditSeconds / 60); }
    else if (mode.value === "credit") mode.value = "open";
  }
  clientSelect.addEventListener("change", applyClientMode);

  async function update() {
    const credit = mode.value === "credit";
    const prepaid = mode.value === "prepaid";
    const open = mode.value === "open";
    minutes.closest("label").hidden = open;
    minutes.disabled = open;
    form.querySelector(".presetRow").hidden = open;
    form.elements.paymentMethod.closest("label").hidden = !prepaid;
    form.elements.paymentMethod.disabled = !prepaid;
    form.elements.customer.closest("label").hidden = credit || !!clientSelect.value;
    const client = clients.find(item => item.id === clientSelect.value);
    if (credit && client && Number(minutes.value) > Math.floor(client.creditSeconds / 60)) minutes.value = Math.floor(client.creditSeconds / 60) || 1;
    const run = ++quoteRun;
    const count = Number(minutes.value);
    $("#modalSubmit").disabled = (credit && (!client || client.creditSeconds < count * 60)) || (prepaid && !state.cashShift);
    if (open) {
      const first = (state.settings.timeTable || []).slice().sort((a, b) => a.minutes - b.minutes)[0];
      $("#startQuote").textContent = `Tempo livre: o relógio começa do zero e o cliente paga o que usar ao sair${first ? ` (mínimo ${currency(first.cents)} até ${first.minutes} min)` : ""}.`;
      return;
    }
    if (!Number.isInteger(count) || count < 1 || count > 1440) { $("#startQuote").textContent = "Informe de 1 a 1440 minutos."; return; }
    if (credit) { $("#startQuote").textContent = client ? `Saldo disponível: ${formatCredit(client.creditSeconds)}. Serão reservados ${count} min.` : "Selecione um cliente com saldo."; return; }
    if (prepaid && !state.cashShift) { $("#startQuote").textContent = "Abra o caixa antes de receber e liberar."; return; }
    try {
      const quote = await api(`/api/quote?minutes=${count}`);
      if (run === quoteRun) $("#startQuote").textContent = `${prepaid ? "Receber agora" : "Valor previsto"}: ${currency(quote.amountCents)} por ${count} min.`;
    } catch { if (run === quoteRun) $("#startQuote").textContent = "Valor indisponível. Confira a tarifa."; }
  }

  form.querySelectorAll("[data-preset]").forEach(button => button.addEventListener("click", () => { minutes.value = button.dataset.preset; update(); }));
  clientSelect.addEventListener("change", update);
  mode.addEventListener("change", update);
  minutes.addEventListener("input", update);
  update();
}

function openEndModal(machine, restart = false) {
  const session = machine.session;
  if (!session) return;
  const printDue = (state.openCharges || []).filter(row => row.sessionId === session.id).reduce((sum, row) => sum + row.amountCents - row.paidCents, 0);
  const estimated = printDue + (session.billingMode === "postpaid" ? machine.summary?.timeCents || 0 : 0);
  const methods = [["", "Deixar pendente"], ...options.map(value => [value, methodName[value]])];
  
  let changeCalculatorHtml = "";
  if (estimated && state.cashShift) {
    changeCalculatorHtml = `
      <div id="endCashCalculator" class="saleCashCalculator">
        <div class="cashCalcRow">
          <span>Troco:</span>
          <input type="number" id="endGivenInput" min="0" step="0.01" placeholder="Valor entregue (R$)" style="width: 140px; padding: 5px 8px; font-size: 12px;">
          <div class="cashChips">
            <button type="button" data-end-val="exact">Exato</button>
            <button type="button" data-end-val="10">R$ 10</button>
            <button type="button" data-end-val="20">R$ 20</button>
            <button type="button" data-end-val="50">R$ 50</button>
            <button type="button" data-end-val="100">R$ 100</button>
          </div>
        </div>
        <div id="endChangeDisplay" class="changeDisplay">Troco: R$ 0,00</div>
        <input type="hidden" name="cashCents" value="0">
      </div>
    `;
  }

  const fields = summaryHtml(machine) + 
    `<p class="quoteBox" style="font-size: 15px;">Total a Receber: <strong id="endTotal" style="font-size: 18px; color: var(--primary);">${currency(estimated)}</strong>${session.billingMode === "postpaid" ? " · valor final atualizado no encerramento" : ""}</p>` +
    (estimated ? `<label>Desconto (R$)<input type="number" name="discount" id="endDiscount" min="0" max="${(estimated / 100).toFixed(2)}" step="0.01" placeholder="0,00"></label>` : "") +
    (estimated && state.cashShift ? select("paymentMethod", "Meio de Recebimento", methods, "cash") : "") +
    (estimated && !state.cashShift ? `<p class="formNotice">O caixa está fechado. Ao encerrar, ${currency(estimated)} ficam em <strong>A receber</strong> (Caixa e vendas); receba depois de abrir o caixa.</p>` : "") +
    (state.cashShift ? changeCalculatorHtml : "");

  openModal(
    `${restart ? "Encerrar e reiniciar" : "Encerrar Atendimento"} · ${machine.name}`, 
    fields, 
    async values => {
      const discountCents = estimated - due();
      const cashCents = Number(values.cashCents) || 0;
      await api(`/api/machines/${encodeURIComponent(machine.id)}/end`, { restart, paymentMethod: values.paymentMethod || "", discountCents, cashCents });
      playChime("success");
      toast(`Terminal ${machine.name} encerrado com sucesso.`);
      
      // Recibo so quando pedir: fica no botao "Recibo da ultima venda" do caixa.
      const givenVal = Number($("#endGivenInput")?.value) || 0;
      const changeVal = Math.max(0, givenVal - (due() / 100));
      lastReceiptData = {
        machineName: machine.name,
        customer: machine.summary?.customer || session.customer || "Avulso",
        session: machine.summary,
        totalCents: due(),
        paymentMethod: cashCents ? `Dinheiro ${currency(cashCents)} + ${methodName[values.paymentMethod]}` : values.paymentMethod || "cash",
        changeCents: Math.round(changeVal * 100)
      };
      if ($("#posLastReceiptBtn")) $("#posLastReceiptBtn").hidden = false;
      if (lastReceiptData.changeCents) toast(`Troco: ${currency(lastReceiptData.changeCents)}`);
    },
    estimated && state.cashShift ? "Encerrar e Receber" : estimated ? "Encerrar (receber depois)" : "Encerrar Terminal"
  );

  const form = $("#modalForm");
  const method = form.elements.paymentMethod;
  const endCalc = $("#endCashCalculator");
  const endChange = $("#endChangeDisplay");
  const endGiven = $("#endGivenInput");
  const endDiscount = $("#endDiscount");
  function due() {
    const discount = Math.round((Number(endDiscount?.value) || 0) * 100);
    return estimated - Math.min(estimated, Math.max(0, discount));
  }
  if (endDiscount) endDiscount.addEventListener("input", () => {
    $("#endTotal").textContent = currency(due());
    calcEndChange(Number(endGiven?.value) || 0);
  });

  function calcEndChange(given) {
    const total = due() / 100;
    const change = Math.max(0, given - total);
    if (endChange) {
      if (given < total && given > 0) {
        endChange.innerHTML = cashShortHtml(Math.round((total - given) * 100));
      } else {
        endChange.textContent = `Troco: ${currency(Math.round(change * 100))}`;
      }
    }
  }
  // "Restante em PIX/Débito/Crédito": a parte em dinheiro vai em cashCents e o resto na forma escolhida.
  endChange?.addEventListener("click", event => {
    const button = event.target.closest("[data-pay-rest]");
    if (!button) return;
    form.elements.cashCents.value = Math.round((Number(endGiven?.value) || 0) * 100);
    method.value = button.dataset.payRest;
    form.requestSubmit();
  });

  if (method) {
    method.addEventListener("change", () => {
      $("#modalSubmit").textContent = method.value ? "Encerrar e Receber" : "Encerrar Terminal";
      if (endCalc) endCalc.hidden = method.value !== "cash";
    });
  }

  if (endGiven) {
    endGiven.addEventListener("input", () => calcEndChange(Number(endGiven.value) || 0));
  }

  if (endCalc) {
    endCalc.querySelectorAll("[data-end-val]").forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.endVal;
        const total = due() / 100;
        let given = total;
        if (val === "exact") given = total;
        else given = Number(val);
        if (endGiven) endGiven.value = given.toFixed(2);
        calcEndChange(given);
      });
    });
  }
}

let saleCart = new Map();
let saleRef = "";
let saleMachine = null;
const salePrintPages = () => ({
  bw: Math.max(0, Math.floor(Number($("#salePrintBW").value) || 0)),
  color: Math.max(0, Math.floor(Number($("#salePrintColor").value) || 0))
});

function renderSale() {
  const term = $("#saleSearch").value.trim().toLocaleLowerCase("pt-BR");
  const products = state.products.filter(item => item.active && (!term || `${item.name} ${item.code || ""}`.toLocaleLowerCase("pt-BR").includes(term))).slice(0, 8);
  
  $("#saleMatches").innerHTML = products.length ? products.map(item => `
    <button type="button" data-sale-add="${html(item.id)}">
      <span>
        <strong>${html(item.name)}</strong>
        <small>${html(item.code || item.category || "Item")}${item.type === "stock" ? ` · ${item.stock <= 0 ? `<span class="bad">estoque ${item.stock}</span>` : `${item.stock} em estoque`}` : ""}</small>
      </span>
      <span class="money">${currency(item.priceCents)}</span>
    </button>`).join("") : '<p class="muted">Nenhum produto correspondente.</p>';

  let total = 0;
  $("#saleCart").innerHTML = saleCart.size ? [...saleCart].map(([id, quantity]) => {
    const product = state.products.find(item => item.id === id);
    if (!product) return "";
    total += product.priceCents * quantity;
    return `
      <div class="cartRow">
        <span>
          <strong>${html(product.name)}</strong>
          <small><input type="number" class="cartQty" data-sale-qty="${html(id)}" min="1" max="999" step="1" value="${quantity}" aria-label="Quantidade de ${html(product.name)}" style="width: 56px; padding: 2px 6px; font-size: 13px;"> × ${currency(product.priceCents)}</small>
        </span>
        <strong class="money">${currency(product.priceCents * quantity)}</strong>
        <button type="button" data-sale-remove="${html(id)}" aria-label="Remover uma unidade de ${html(product.name)}">−</button>
      </div>`;
  }).join("") : '<p class="muted">Nenhum item adicionado ao carrinho.</p>';

  const pages = saleMachine ? salePrintPages() : { bw: 0, color: 0 };
  total += pages.bw * state.settings.printBWCents + pages.color * state.settings.printColorCents;
  $("#saleTotal").textContent = currency(total);
  $("#saleSubmit").disabled = saleMachine ? !(saleCart.size || pages.bw || pages.color) : !saleCart.size || !state.cashShift;
  $("#saleError").hidden = true;

  const cashCalc = $("#saleCashCalculator");
  if (cashCalc) {
    cashCalc.hidden = $("#salePayment").value !== "cash" || !!saleMachine;
    calcSaleChange();
  }
}

function calcSaleChange() {
  const givenInput = $("#saleGivenInput");
  const changeDisplay = $("#saleChangeDisplay");
  if (!givenInput || !changeDisplay) return;

  let totalCents = 0;
  for (const [id, qty] of saleCart) {
    const p = state.products.find(item => item.id === id);
    if (p) totalCents += p.priceCents * qty;
  }
  const total = totalCents / 100;
  const given = Number(givenInput.value) || 0;
  if (given < total && given > 0) {
    changeDisplay.innerHTML = `<span style="color: var(--danger-accent);">Faltam ${currency(Math.round((total - given) * 100))}</span>`;
  } else {
    changeDisplay.textContent = `Troco: ${currency(Math.round(Math.max(0, given - total) * 100))}`;
  }
}

function openSale(productId = null, machine = null) {
  saleCart = new Map();
  saleRef = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  saleMachine = machine;
  
  $("#saleSearch").value = "";
  $("#salePrintBW").value = "0";
  $("#salePrintColor").value = "0";
  const givenInput = $("#saleGivenInput");
  if (givenInput) givenInput.value = "";

  $("#saleTitle").textContent = machine ? `Consumo · ${machine.name}` : "Nova venda";
  $("#saleSubtitle").textContent = machine ? "Os itens entram na conta da estação e são cobrados no encerramento." : "Registro ágil de mercadorias e emissão de cobrança direta.";
  $("#salePrintRow").hidden = !machine;
  $("#salePaymentLabel").hidden = !!machine;
  $("#saleSubmit").textContent = machine ? "Lançar na Estação" : "Concluir Venda";

  const quickContainer = $("#saleQuickChips");
  if (quickContainer) {
    const priorityCodes = ["104", "1.1", "2", "3", "20", "152", "286"];
    const foundPriority = priorityCodes.map(code => state.products.find(p => p.active && p.code === code)).filter(Boolean);
    const stockItems = state.products.filter(p => p.active && p.type === "stock" && p.stock > 0 && !foundPriority.includes(p)).slice(0, 3);
    const serviceItems = state.products.filter(p => p.active && p.type === "service" && !foundPriority.includes(p) && !stockItems.includes(p)).slice(0, 2);
    const allQuick = [...foundPriority, ...stockItems, ...serviceItems].slice(0, 8);
    if (allQuick.length) {
      quickContainer.innerHTML = allQuick.map(p => 
        `<button type="button" class="saleQuickChip" data-sale-add="${html(p.id)}">+ ${html(p.name)} (${currency(p.priceCents)})</button>`
      ).join("");
    } else {
      quickContainer.innerHTML = "";
    }
  }

  if (productId) saleCart.set(productId, 1);
  $("#saleDialog").showModal();
  renderSale();
  $("#saleSearch").focus();
  if (!machine && !state.cashShift) {
    $("#saleError").textContent = "Abra o caixa para habilitar vendas.";
    $("#saleError").hidden = false;
  }
}

$("#quickSaleButton").addEventListener("click", () => {
  view("cash");
  const s = $("#posSearchInput");
  if (s) { s.focus(); s.select(); }
});
$("#saleClose").addEventListener("click", () => $("#saleDialog").close());
$("#saleCancel").addEventListener("click", () => $("#saleDialog").close());
$("#saleSearch").addEventListener("input", renderSale);
$("#salePrintBW").addEventListener("input", renderSale);
$("#salePrintColor").addEventListener("input", renderSale);
$("#salePayment").addEventListener("change", renderSale);
$("#saleGivenInput")?.addEventListener("input", calcSaleChange);

$("#saleSearch").addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const raw = event.currentTarget.value.trim();
  if (!raw) return;

  const { qty, lookup } = parseInputMultiplier(raw);
  const exactCode = state.products.find(item => item.active && item.code && item.code.toLowerCase() === lookup.toLowerCase());
  const exactBarcode = !exactCode && state.products.find(item => item.active && item.barcode && item.barcode.toLowerCase() === lookup.toLowerCase());
  const exactName = !exactCode && !exactBarcode && state.products.find(item => item.active && item.name.toLowerCase() === lookup.toLowerCase());
  const startsCode = !exactCode && !exactBarcode && !exactName && state.products.find(item => item.active && item.code && item.code.toLowerCase().startsWith(lookup.toLowerCase()));
  const first = exactCode || exactBarcode || exactName || startsCode || state.products.find(item => item.active && (item.code?.toLowerCase().includes(lookup.toLowerCase()) || item.name.toLocaleLowerCase("pt-BR").includes(lookup.toLocaleLowerCase("pt-BR"))));

  if (first) {
    saleCart.set(first.id, (saleCart.get(first.id) || 0) + qty);
    event.currentTarget.value = "";
    renderSale();
  } else {
    toast(`Item "${lookup}" não localizado.`);
  }
});

// Quantidade digitada direto no carrinho; 0 ou vazio remove o item.
$("#saleDialog").addEventListener("change", event => {
  const input = event.target.closest("[data-sale-qty]");
  if (!input) return;
  const qty = Math.min(999, Math.floor(Number(input.value) || 0));
  if (qty < 1) saleCart.delete(input.dataset.saleQty);
  else saleCart.set(input.dataset.saleQty, qty);
  renderSale();
});
$("#saleDialog").addEventListener("keydown", event => {
  if (event.key === "Enter" && event.target.matches("[data-sale-qty]")) { event.preventDefault(); event.target.blur(); $("#saleSearch").focus(); }
});

$("#saleDialog").addEventListener("click", event => {
  const add = event.target.closest("[data-sale-add]");
  const remove = event.target.closest("[data-sale-remove]");
  const cashValBtn = event.target.closest("[data-cash-val]");

  if (add) {
    const id = add.dataset.saleAdd;
    saleCart.set(id, (saleCart.get(id) || 0) + 1);
    $("#saleSearch").value = "";
    renderSale();
    $("#saleSearch").focus();
  }
  if (remove) {
    const id = remove.dataset.saleRemove, count = saleCart.get(id) || 0;
    if (count <= 1) saleCart.delete(id);
    else saleCart.set(id, count - 1);
    renderSale();
  }
  if (cashValBtn) {
    const val = cashValBtn.dataset.cashVal;
    let totalCents = 0;
    for (const [id, qty] of saleCart) {
      const p = state.products.find(item => item.id === id);
      if (p) totalCents += p.priceCents * qty;
    }
    const total = totalCents / 100;
    let given = total;
    if (val === "exact") given = total;
    else given = Number(val);
    const givenInput = $("#saleGivenInput");
    if (givenInput) givenInput.value = given.toFixed(2);
    calcSaleChange();
  }
});

$("#saleForm").addEventListener("submit", async event => {
  event.preventDefault();
  const submit = $("#saleSubmit");
  if (saleMachine) {
    const pages = salePrintPages();
    if (!saleCart.size && !pages.bw && !pages.color) return;
    submit.disabled = true;
    try {
      await api(`/api/machines/${encodeURIComponent(saleMachine.id)}/items`, {
        items: [...saleCart].map(([productId, quantity]) => ({ productId, quantity })),
        printBW: pages.bw,
        printColor: pages.color,
        ref: saleRef
      });
      playChime("success");
      $("#saleDialog").close();
      await loadState();
      toast(`Consumo lançado em ${saleMachine.name}.`);
    } catch (cause) {
      $("#saleError").textContent = cause.message;
      $("#saleError").hidden = false;
      submit.disabled = false;
    }
    return;
  }
  if (!saleCart.size || !state.cashShift) return;
  submit.disabled = true;
  try {
    const method = $("#salePayment").value;
    const cartItems = [...saleCart].map(([productId, quantity]) => {
      const p = state.products.find(x => x.id === productId);
      return { productId, name: p?.name || "Item", quantity, totalCents: (p?.priceCents || 0) * quantity };
    });
    const totalCents = cartItems.reduce((acc, it) => acc + it.totalCents, 0);

    await api("/api/sales", {
      items: cartItems.map(it => ({ productId: it.productId, quantity: it.quantity })),
      paymentMethod: method,
      ref: saleRef
    });
    playChime("success");
    $("#saleDialog").close();
    await loadState();
    toast("Venda registrada com sucesso.");

    // Recibo térmico
    const givenVal = Number($("#saleGivenInput")?.value) || 0;
    const changeVal = Math.max(0, givenVal - (totalCents / 100));
    showReceipt({
      customer: "Balcão Presencial",
      items: cartItems,
      totalCents,
      paymentMethod: method,
      changeCents: Math.round(changeVal * 100)
    });
  } catch (cause) {
    $("#saleError").textContent = cause.message;
    $("#saleError").hidden = false;
    submit.disabled = false;
  }
});

function showPair(code) {
  $("#pairCode").textContent = code;
  $("#pairDialog").showModal();
}
$("#pairClose").addEventListener("click", () => $("#pairDialog").close());

$("#addMachineButton").addEventListener("click", () => openModal("Adicionar Terminal Manualmente", field("id", "ID da Estação", "text", "", 'placeholder="pc-01" required pattern="[A-Za-z0-9_-]{2,32}"') + field("name", "Nome exibido", "text", "", 'placeholder="PC 01"'), async values => { const result = await api("/api/machines/register", values); showPair(result.pairingCode); }, "Homologar"));
const originField = (selected = "") => select("origin", "Como conheceu a loja", [["", "Não informado"], ...(state.origins || []).map(o => [o, o])], selected);
$("#addClientButton").addEventListener("click", () => openModal("Novo cliente", field("name", "Nome completo", "text", "", "required") + field("phone", "Telefone / WhatsApp", "tel") + originField() + field("login", "Login de Acesso (Autoatendimento)", "text", "", 'autocomplete="off"') + field("password", "Senha de Acesso", "password", "", 'autocomplete="new-password"'), values => api("/api/clients", values)));
$("#addProductButton").addEventListener("click", () => openModal("Novo Produto ou Serviço", field("name", "Descrição do Item", "text", "", "required") + field("code", "Código de Barras / EAN") + field("category", "Categoria") + select("type", "Tipo", [["stock", "Produto Físico com Estoque"], ["service", "Serviço Avulso"]], "stock") + field("price", "Preço de Venda (R$)", "number", "", 'min="0" step="0.01" required') + field("cost", "Preço de Custo (R$) — deixe vazio se não souber", "number", "", 'min="0" step="0.01"') + field("stock", "Estoque Inicial", "number", "0", 'min="0" required') + field("minStock", "Alerta de Estoque Mínimo", "number", "0", 'min="0" required'), values => api("/api/products", values)));
$("#addUserButton").addEventListener("click", () => openModal("Novo Operador", field("name", "Usuário de Acesso", "text", "", "required") + field("password", "Senha Inicial", "password", "", 'minlength="10" required') + select("role", "Perfil Operacional", [["attendant", "Atendente de Balcão"], ["admin", "Administrador Geral"]], "attendant"), values => api("/api/users", values)));

$("#settingsForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  values.autoRestoreOnTimeEnd = form.elements.autoRestoreOnTimeEnd.checked;
  try {
    await api("/api/settings", values);
    toast("Tarifas e parâmetros atualizados.");
    await loadState();
  } catch (cause) { toast(cause.message); }
});

$("#printersForm").addEventListener("submit", async event => {
  event.preventDefault();
  const value = event.currentTarget.elements.printerShare.value.trim();
  const printers = value ? value.split(/[,;]/).map(item => item.trim()).filter(Boolean) : [];
  try {
    await api("/api/settings/printers", { printers });
    toast("Configuração de rede salva.");
    await loadState();
  } catch (cause) { toast(cause.message); }
});

$("#regenerateKeyButton").addEventListener("click", async () => {
  if (!confirm("AVISO: Regenerar chave de homologação? Pacotes de instalação anteriores deixarão de funcionar.")) return;
  try {
    await api("/api/installer-config/regenerate", {});
    toast("Chave de homologação regenerada.");
  } catch (cause) { toast(cause.message); }
});

$("#waitAddButton").addEventListener("click", async () => {
  const name = $("#waitName").value.trim();
  if (!name) return;
  try {
    await api("/api/waitlist", { name });
    $("#waitName").value = "";
    await loadState();
  } catch (cause) { toast(cause.message); }
});

$("#waitName").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    $("#waitAddButton").click();
  }
});

$("#monitorClose").addEventListener("click", () => { stopMonitor(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); $("#monitorDialog").close(); });
$("#monitorDialog").addEventListener("close", () => { stopMonitor(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); });
$("#monitorFullscreen")?.addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else enterMonitorFullscreen();
});
$("#monitorDialog").addEventListener("close", stopMonitor);
// Teclado fisico do caixa vai direto para a estacao enquanto o Monitorar esta aberto.
// Letras sao agrupadas (envia a cada 150 ms) para nao mandar um pedido por tecla.
let monitorTypeBuffer = "", monitorTypeTimer = null;
const MONITOR_KEYS = { Enter: "enter", Tab: "tab", Escape: "esc", Backspace: "backspace", Delete: "delete", ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Home: "home", End: "end", PageUp: "pageup", PageDown: "pagedown", F5: "f5" };
function flushMonitorText() { if (monitorTypeBuffer) { sendMonitorInput({ type: "text", value: monitorTypeBuffer }); monitorTypeBuffer = ""; } }
document.addEventListener("keydown", event => {
  if (!$("#monitorDialog")?.open || !monitorId) return;
  if (event.target.closest("input, textarea, select")) return;
  const combo = event.ctrlKey && !event.altKey && /^[acvxzsyp]$/i.test(event.key) ? `ctrl+${event.key.toLowerCase()}` : null;
  if (combo) { event.preventDefault(); flushMonitorText(); sendMonitorInput({ type: "key", value: combo }); return; }
  if (MONITOR_KEYS[event.key]) {
    if (event.key === "Escape") return; // Esc fecha o Monitorar; use o botao Esc da barra para a estacao
    event.preventDefault(); flushMonitorText(); sendMonitorInput({ type: "key", value: MONITOR_KEYS[event.key] }); return;
  }
  if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
    event.preventDefault();
    monitorTypeBuffer += event.key;
    clearTimeout(monitorTypeTimer);
    monitorTypeTimer = setTimeout(flushMonitorText, 150);
  }
});

// Clique simples espera 250 ms: se vier o segundo clique, envia um clique duplo real (abre icones e pastas).
let monitorClickTimer = null;
$("#monitorImage").addEventListener("click", event => {
  const c = monitorCoords(event); if (!c) return;
  clearTimeout(monitorClickTimer);
  monitorClickTimer = setTimeout(() => sendMonitorInput({ type: "click", x: c.x, y: c.y }), 250);
});
$("#monitorImage").addEventListener("dblclick", event => {
  event.preventDefault();
  clearTimeout(monitorClickTimer);
  const c = monitorCoords(event); if (c) sendMonitorInput({ type: "dblclick", x: c.x, y: c.y });
});
$("#monitorImage").addEventListener("contextmenu", event => { event.preventDefault(); const c = monitorCoords(event); if (c) sendMonitorInput({ type: "rclick", x: c.x, y: c.y }); });
$("#monitorImage").addEventListener("mousemove", event => { const now = Date.now(); if (now - monitorLastMove < 120) return; monitorLastMove = now; const c = monitorCoords(event); if (c) sendMonitorInput({ type: "move", x: c.x, y: c.y }); });

document.querySelectorAll("#monitorBar button[data-mctrl]").forEach(button => button.addEventListener("click", async () => {
  const ctrl = button.dataset.mctrl;
  if (ctrl === "text") {
    const value = prompt("Texto a injetar no terminal remoto:");
    if (value) sendMonitorInput({ type: "text", value });
    return;
  }
  if (["enter", "esc", "tab", "backspace", "delete", "up", "down", "left", "right", "f5"].includes(ctrl)) {
    sendMonitorInput({ type: "key", value: ctrl });
    return;
  }
  try {
    if (ctrl === "restart") { await api(`/api/machines/${encodeURIComponent(monitorId)}/end`, { restart: true }); toast("Reiniciando terminal..."); }
    else if (ctrl === "shutdown") { await api(`/api/machines/${encodeURIComponent(monitorId)}/shutdown`, {}); toast("Desligando terminal..."); }
    else if (ctrl === "unlock") { await api(`/api/machines/${encodeURIComponent(monitorId)}/unlock`, {}); toast("Desbloqueando tela..."); }
    await loadState();
  } catch (cause) { toast(cause.message); }
}));

$("#downloadInstallerButton").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/installer-package");
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Falha ao compilar o pacote");
    const blob = await response.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "LanHouseManager-Estacoes.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Pacote corporativo baixado com sucesso.");
  } catch (cause) { toast(cause.message); }
});

$("#cashToggleButton").addEventListener("click", () => {
  if (!state.cashShift) {
    openModal("Abertura de Caixa do Turno", field("opening", "Fundo Inicial de Troco em Dinheiro (R$)", "number", "0.00", 'min="0" step="0.01" required'), values => api("/api/cash/open", values), "Abrir Caixa");
  } else {
    // O troco do dia (normalmente R$ 100) fica na gaveta para a proxima abertura; so o excedente vai para deposito.
    const expectedCash = state.cashSummary?.expectedCashCents || 0;
    const fund = state.cashShift.openingCents ?? 10000;
    const depositText = counted => counted >= fund ? `Retirar para depósito: <strong>${currency(counted - fund)}</strong> · ficam ${currency(fund)} de troco na gaveta` : `Faltam ${currency(fund - counted)} para completar o troco de ${currency(fund)}`;
    openModal("Fechamento & Conciliação de Caixa", `<p class="quoteBox">Dinheiro Esperado em Gaveta: <strong>${currency(expectedCash)}</strong><br><small>${currency(fund)} de troco ficam na gaveta + ${currency(Math.max(0, expectedCash - fund))} para depósito</small></p>` + field("counted", `Total contado na gaveta, com os ${currency(fund)} de troco (R$)`, "number", "", 'min="0" step="0.01" required') + '<p id="cashDifference" class="muted">Conte todo o dinheiro da gaveta, antes de separar o depósito.</p>' + '<label class="checkLine" id="extraWrap" hidden><input type="checkbox" name="extraAsSale" checked> Lançar a sobra como <b>venda não lançada</b> (vendas da correria ou resto de outro dia), para o relatório bater com o depósito</label>', async values => { const result = await api("/api/cash/close", { counted: values.counted, extraAsSale: !!values.extraAsSale }); setTimeout(() => openShiftSummary(result.shift.id).catch(cause => toast(cause.message)), 350); }, "Fechar caixa");
    $("#modalForm").elements.counted.addEventListener("input", event => {
      const value = Number(event.currentTarget.value);
      const diff = Math.round(value * 100) - expectedCash;
      const diffText = diff === 0 ? "Exato (sem quebra)" : diff > 0 ? `Sobra de caixa: +${currency(diff)}` : `Falta de caixa: ${currency(diff)}`;
      $("#cashDifference").innerHTML = event.currentTarget.value === "" ? "Conte todo o dinheiro da gaveta, antes de separar o depósito." : `<strong>${diffText}</strong><br>${depositText(Math.round(value * 100))}`;
      $("#extraWrap").hidden = !(event.currentTarget.value !== "" && diff > 0);
    });
  }
});

// Selo do caixa: no Caixa e vendas ja abre o fechamento; em outra tela leva ao caixa.
$("#shiftBadge").addEventListener("click", () => state?.cashShift && currentView !== "cash" ? view("cash") : $("#cashToggleButton").click());
// Saida da gaveta: sangria (guardar/depositar) ou despesa da loja paga em dinheiro (vai tambem para Despesas/DRE).
$("#cashAdjustButton").addEventListener("click", () => {
  const cats = expenseData.categories.length ? expenseData.categories : EXPENSE_CATEGORIES;
  openModal("Movimentar dinheiro da gaveta",
    select("op", "Operação", [["expense", "Despesa da loja paga com dinheiro do caixa"], ["out", "Sangria (guardar ou depositar)"], ["in", "Suprimento (entrada de troco)"]], "expense") +
    `<div id="adjCatWrap">${select("expenseCategory", "Categoria da despesa", cats.map(c => [c, c]), "Alimentação")}</div>` +
    field("amount", "Valor (R$)", "number", "", 'min="0.01" step="0.01" required') +
    field("reason", "Descrição", "text", "", 'required placeholder="Ex.: Almoço, Galão de água, Fita adesiva"'),
    values => api("/api/cash/adjust", { amount: values.amount, reason: values.reason, direction: values.op === "in" ? "in" : "out", expenseCategory: values.op === "expense" ? values.expenseCategory : undefined })
      .then(() => { if (values.op === "expense") { toast(`Despesa lançada: ${values.reason}.`); loadExpenses().catch(() => {}); } }));
  const form = $("#modalForm"), op = form.elements.op, wrap = $("#adjCatWrap");
  const sync = () => { wrap.hidden = op.value !== "expense"; };
  op.addEventListener("change", sync); sync();
  // Descricao comum ja escolhe a categoria
  form.elements.reason.addEventListener("input", e => { const t = e.target.value.toLowerCase();
    const guess = /almo|lanche|caf[eé]|refei|marmit|janta/.test(t) ? "Alimentação" : /gal[aã]o|[aá]gua mineral|limpeza|fita|papel|caneta/.test(t) ? "Insumos gráficos" : /uber|99|[oô]nibus|gasolina|combust/.test(t) ? "Transporte e combustível" : /conserto|manuten|pe[cç]a/.test(t) ? "Manutenção" : null;
    if (guess && cats.includes(guess)) form.elements.expenseCategory.value = guess; });
});
$("#printSaleButton").addEventListener("click", () => openModal("Registrar Impressão Avulsa de Balcão", field("pages", "Quantidade de Páginas", "number", "1", 'min="1" required') + select("color", "Tipo de Impressão", [["false", "Preto & Branco"], ["true", "Colorida"]], "false") + paymentField(), values => api("/api/print/sale", { ...values, color: values.color === "true" }), "Registrar e Receber"));

document.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button || !state) return;
  const action = button.dataset.action, id = button.dataset.id;
  const machine = state.machines.find(item => item.id === id);

  try {
    if (action === "quickStart" && machine) {
      const minutes = button.dataset.minutes ? Number(button.dataset.minutes) : null;
      const open = button.dataset.mode === "open";
      try {
        await api(`/api/machines/${encodeURIComponent(id)}/start`, {
          billingMode: open ? "open" : "postpaid",
          minutes: open ? undefined : minutes
        });
        playChime("success");
        toast(`${machine.name} liberada por ${open ? "tempo livre" : minutes + " min"}!`);
        await loadState();
      } catch (err) {
        toast(err.message);
      }
    } else if (action === "start" && machine) {
      openStartModal(machine);
    } else if (action === "consume" && machine) {
      openSale(null, machine);
    } else if (action === "addTime" && machine) {
      const presetsHtml = `
        <div class="presetRow" style="margin-bottom: 10px;">
          <button type="button" data-add-preset="15">+15 min</button>
          <button type="button" data-add-preset="30">+30 min</button>
          <button type="button" data-add-preset="60">+1 hora</button>
        </div>
      `;
      openModal(
        `Adicionar Tempo · ${machine.name}`, 
        presetsHtml + field("minutes", "Minutos Adicionais", "number", "15", 'min="1" max="1440" required') + (machine.session?.billingMode === "prepaid" ? paymentField() : ""), 
        values => api(`/api/machines/${encodeURIComponent(id)}/add-time`, { ...values, minutes: Number(values.minutes) }), 
        "Adicionar Tempo"
      );
      const form = $("#modalForm");
      form.querySelectorAll("[data-add-preset]").forEach(btn => {
        btn.addEventListener("click", () => {
          form.elements.minutes.value = btn.dataset.addPreset;
          form.elements.minutes.focus();
        });
      });
    } else if (action === "reboot" && machine) {
      if (!confirm(`Reiniciar o terminal ${machine.name}?`)) return;
      await api(`/api/machines/${encodeURIComponent(id)}/reboot`, {});
      await loadState(); toast("Comando de reinicialização enviado.");
    } else if (action === "shutdown" && machine) {
      if (!confirm(`Desligar o terminal ${machine.name}?`)) return;
      await api(`/api/machines/${encodeURIComponent(id)}/shutdown`, {});
      await loadState(); toast("Comando de desligamento enviado.");
    } else if (action === "power" && machine) {
      await api(`/api/machines/${encodeURIComponent(id)}/power`, {});
      await loadState(); toast("Sinal Wake-on-LAN transmitido via rede.");
    } else if (action === "waitRemove") {
      try { await api("/api/waitlist/remove", { id }); await loadState(); } catch (cause) { toast(cause.message); }
    } else if (action === "waitServe") {
      const wait = state.waitList.find(item => item.id === id);
      const free = state.machines.find(item => !item.session && item.status !== "offline" && !item.maintenance && item.restoreSeq <= (item.appliedRestoreSeq || 0));
      if (wait && free) openStartModal(free, wait);
    } else if (action === "move" && machine) {
      const free = state.machines.filter(m => m.id !== machine.id && !m.session && m.status !== "offline" && m.status !== "maintenance");
      if (!free.length) { toast("Nenhum terminal livre para receber a transferência."); return; }
      openModal(`Transferir Sessão · ${machine.name}`, select("targetId", "Terminal de Destino", free.map(m => [m.id, `${m.name} · ${m.id}`]), free[0].id), values => api(`/api/machines/${encodeURIComponent(id)}/move`, { targetId: values.targetId }), "Transferir");
    } else if (action === "setClient" && machine?.session) {
      const clients = state.clients.filter(c => c.active).slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      openModal(`Cliente da sessão · ${machine.name}`,
        select("clientId", "Cliente", [["", "Avulso"], ...clients.map(c => [c.id, c.name])], machine.session.clientId || ""),
        values => api(`/api/machines/${encodeURIComponent(id)}/client`, { clientId: values.clientId }).then(() => toast("Cliente da sessão atualizado.")), "Salvar");
    } else if (action === "maintenance" && machine) {
      await api(`/api/machines/${encodeURIComponent(id)}/maintenance`, {});
      await loadState(); toast(machine.maintenance ? "Manutenção finalizada." : "Terminal colocado em manutenção.");
    } else if (action === "monitor" && machine) {
      openMonitor(machine);
    } else if (action === "summary" && machine) {
      openModal(`Extrato Operacional · ${machine.name}`, summaryHtml(machine), () => {}, "Concluir");
    } else if (action === "end" && machine) {
      openEndModal(machine);
    } else if (["lock", "unlock", "restart"].includes(action) && machine) {
      if (action === "restart") { openEndModal(machine, true); return; }
      await api(`/api/machines/${encodeURIComponent(id)}/${action === "restart" ? "end" : action}`, action === "restart" ? { restart: true } : {});
      await loadState(); toast("Comando transmitido com sucesso.");
    } else if (action === "rename" && machine) {
      openModal(`Renomear Terminal · ${machine.name}`, field("name", "Nome Exibido", "text", machine.name, "required") + field("id", "Identificador Interno (opcional)", "text", machine.id, 'pattern="[A-Za-z0-9_-]{2,32}"'), values => api(`/api/machines/${encodeURIComponent(id)}/rename`, { name: values.name, id: values.id }), "Salvar");
    } else if (action === "remove" && machine) {
      if (!confirm(`Remover definitivamente o terminal ${machine.name}?`)) return;
      await api(`/api/machines/${encodeURIComponent(id)}/remove`, {}); await loadState(); toast("Terminal removido.");
    } else if (action === "pair" && machine) {
      const result = await api(`/api/machines/${encodeURIComponent(id)}/pair`, {});
      showPair(result.pairingCode);
    } else if (action === "printPayReceipt") {
      printPaymentReceipt(id);
    } else if (action === "changePayMethod") {
      const pay = state.payments.find(p => p.id === id); if (!pay) return;
      const group = state.payments.filter(p => samePaymentGroup(pay, p));
      const groupCents = group.reduce((sum, p) => sum + p.amountCents, 0);
      // Recebimento dividido (ex.: dinheiro + Pix): dá para trocar só uma das partes.
      const parts = [...new Set(group.map(p => p.method))].map(m => [m, group.filter(p => p.method === m)]);
      const scopes = parts.length > 1
        ? parts.map(([m, list]) => [`m:${m}`, `Só a parte em ${methodName[m] || m} (${currency(list.reduce((sum, p) => sum + p.amountCents, 0))})`])
        : [["group", `Todo o recebimento: ${group.length} lançamentos, ${currency(groupCents)}`], ["one", `Só este lançamento (${currency(pay.amountCents)})`]];
      const methodsNow = parts.map(([m]) => methodName[m] || m).join(" + ");
      openModal(`Alterar forma de pagamento · ${currency(groupCents)}`,
        `<p class="quoteBox">${html(chargeLabel(state.charges.find(c => c.id === pay.chargeId)) || "Pagamento")}<br>Hoje está como <strong>${methodsNow}</strong>.</p>` + select("method", "Nova forma de pagamento", options.map(m => [m, methodName[m]]), pay.method === "cash" ? "pix" : "cash") +
        (group.length > 1 ? select("scope", "Aplicar a", scopes, scopes[0][0]) : ""),
        async values => {
          const scope = values.scope || "one";
          const targets = scope === "group" ? group : scope.startsWith("m:") ? group.filter(p => p.method === scope.slice(2)) : [pay];
          for (const p of targets) await api(`/api/payments/${encodeURIComponent(p.id)}/method`, { method: values.method });
          const cents = targets.reduce((sum, p) => sum + p.amountCents, 0);
          toast(`Forma de pagamento alterada para ${methodName[values.method]}${targets.length > 1 ? ` em ${targets.length} lançamentos` : ""} (${currency(cents)}).`);
        }, "Salvar");
    } else if (action === "receiveMachine") {
      const machine = state.machines.find(m => m.id === id);
      const due = (state.openCharges || []).filter(c => c.machineId === id && Date.now() - Date.parse(c.at) < 12 * 3600000);
      const total = due.reduce((sum, c) => sum + c.amountCents - c.paidCents, 0);
      if (!total) return;
      if (!state.cashShift) { toast("Abra o caixa antes de receber."); return; }
      openModal(`Receber · ${machine ? machine.name : id}`,
        `<div class="dueList">${groupPrintLines(due, c => c.amountCents - c.paidCents).map(line => `<div><span>${txt(line.label)}</span><strong>${currency(line.cents)}</strong></div>`).join("")}<div class="dueTotal"><span>Total</span><strong id="dueTotalValue">${currency(total)}</strong></div></div>` +
        `<label>Desconto (R$)<input type="number" name="discount" id="dueDiscount" min="0" max="${(total / 100).toFixed(2)}" step="0.01" placeholder="0,00"></label>` + paymentField() +
        `<label>Valor entregue em dinheiro (R$)<input type="number" id="dueGiven" min="0" step="0.01" placeholder="Opcional: calcula o troco"></label><div id="dueChange" class="changeDisplay" hidden></div><input type="hidden" name="cashCents" value="0">`,
        async values => {
          const discountCents = Math.min(total, Math.max(0, Math.round((Number(values.discount) || 0) * 100)));
          const result = await api("/api/charges/receive", { ids: due.map(c => c.id), discountCents, method: values.paymentMethod, cashCents: Number(values.cashCents) || 0 });
          playChime("success"); toast(`Recebido ${currency(result.receivedCents)}${result.discountCents ? ` (desconto ${currency(result.discountCents)})` : ""}.${changeCents() ? ` Troco: ${currency(changeCents())}` : ""}`);
        },
        `Receber ${currency(total)}`);
      const form = $("#modalForm");
      const left = () => total - Math.min(total, Math.max(0, Math.round((Number($("#dueDiscount").value) || 0) * 100)));
      const given = () => Math.round((Number($("#dueGiven").value) || 0) * 100);
      const changeCents = () => Math.max(0, given() - left());
      const refresh = () => {
        $("#dueTotalValue").textContent = currency(left());
        $("#modalSubmit").textContent = `Receber ${currency(left())}`;
        $("#dueChange").hidden = !given();
        $("#dueChange").innerHTML = given() && given() < left() ? cashShortHtml(left() - given()) : `Troco: ${currency(changeCents())}`;
      };
      $("#dueDiscount").addEventListener("input", refresh);
      $("#dueGiven").addEventListener("input", refresh);
      // "Restante em PIX/Débito/Crédito": a parte em dinheiro vai em cashCents e o resto na forma escolhida.
      $("#dueChange").addEventListener("click", event => {
        const button = event.target.closest("[data-pay-rest]");
        if (!button) return;
        form.elements.cashCents.value = given();
        form.elements.paymentMethod.value = button.dataset.payRest;
        form.requestSubmit();
      });
    } else if (action === "pay") {
      const charge = (state.openCharges || []).find(item => item.id === id);
      if (!charge) return;
      const openCents = charge.amountCents - charge.paidCents;
      openModal(`Receber · ${pt(charge.description)}`,
        `<p class="quoteBox">Em aberto: <strong>${currency(openCents)}</strong>${charge.paidCents ? ` (já pago ${currency(charge.paidCents)} de ${currency(charge.amountCents)})` : ""}. Se o cliente pagar só uma parte, digite o valor pago agora: o restante continua em aberto.</p>` +
        field("amount", "Valor recebido agora (R$)", "number", (openCents / 100).toFixed(2), `min="0.01" max="${(openCents / 100).toFixed(2)}" step="0.01" required`) + paymentField(),
        async values => {
          await api(`/api/charges/${id}/pay`, { amount: values.amount, method: values.paymentMethod });
          const rest = openCents - Math.round(Number(String(values.amount).replace(",", ".")) * 100);
          toast(rest > 0 ? `Recebido. Ainda faltam ${currency(rest)}.` : "Recebido. Pendência quitada.");
        }, "Confirmar recebimento");
    } else if (action === "cancelCharge") {
      const charge = (state.openCharges || []).find(item => item.id === id);
      if (!charge) return;
      openModal(`Cancelar pendência · ${charge.description}`, `<p class="quoteBox">Valor que deixa de ser cobrado: <strong>${currency(charge.amountCents - charge.paidCents)}</strong>. O cancelamento fica registrado no histórico.</p>` + field("reason", "Motivo", "text", "", 'maxlength="120" required placeholder="Ex.: sessão de teste esquecida"'), values => api(`/api/charges/${id}/cancel`, { reason: values.reason }), "Cancelar pendência");
    } else if (action === "editClient") {
      const client = state.clients.find(item => item.id === id); if (!client) return;
      openModal("Editar cliente", field("name", "Nome completo", "text", client.name, "required") + field("phone", "Telefone / WhatsApp", "tel", client.phone) + originField(client.origin || "") + field("login", "Login de Acesso", "text", client.login || "", 'autocomplete="off"') + field("password", "Nova Senha (deixe vazio para preservar)", "password", "", 'autocomplete="new-password"') + select("active", "Status da Conta", [["true", "Ativo"], ["false", "Inativo"]], String(client.active)), values => api(`/api/clients/${id}`, { ...values, active: values.active === "true" }));
    } else if (action === "debtClient") {
      openDebtModal(id);
    } else if (action === "debtsView") {
      openDebtsView(id);
    } else if (action === "rechargeClient") {
      const client = state.clients.find(item => item.id === id); if (!client) return;
      const ref = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      openModal(`Recarregar Saldo · ${client.name}`, field("amount", "Valor da Recarga (R$)", "number", "", 'min="0.01" step="0.01" required') + paymentField(), values => api(`/api/clients/${id}/recharge`, { ...values, ref }), "Confirmar Recarga");
    } else if (action === "editProduct") {
      const product = state.products.find(item => item.id === id); if (!product) return;
      openModal("Editar Item do Catálogo", field("name", "Descrição do Produto", "text", product.name, "required") + field("code", "Código / EAN", "text", product.code) + field("category", "Categoria", "text", product.category) + field("price", "Preço Unitário (R$)", "number", (product.priceCents / 100).toFixed(2), 'min="0" step="0.01" required') + field("cost", "Preço de Custo (R$) — vazio = não cadastrado", "number", Number.isInteger(product.costCents) ? (product.costCents / 100).toFixed(2) : "", 'min="0" step="0.01"') + field("minStock", "Estoque Mínimo", "number", product.minStock || 0, 'min="0" required') + select("active", "Status", [["true", "Ativo"], ["false", "Inativo"]], String(product.active)), values => api(`/api/products/${id}/update`, { ...values, active: values.active === "true" }));
    } else if (action === "stockProduct") {
      openModal("Ajuste Manual de Estoque", field("delta", "Quantidade (+ entrada / - saída)", "number", "", "required") + field("reason", "Motivo da Movimentação", "text", "", "required"), values => api(`/api/products/${id}/stock`, values));
    } else if (action === "sellProduct") {
      const product = state.products.find(item => item.id === id); if (!product) return;
      openSale(product.id);
    } else if (action === "userPassword") {
      openModal("Alterar Senha de Operador", field("password", "Nova Chave de Acesso", "password", "", 'minlength="10" required'), values => api(`/api/users/${id}/password`, values), "Salvar Senha");
    }
  } catch (cause) { toast(cause.message); }
});

// Atalhos de Teclado Globais (Enterprise Shortcuts)
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    document.querySelectorAll("dialog[open]").forEach(d => d.close());
    return;
  }
  // F2 fora do caixa: abre o caixa (nova venda). Dentro do caixa o F2 e "Receber" (atalhos do caixa).
  if ((event.key === "F2" && currentView !== "cash") || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
    event.preventDefault();
    view("cash");
    const s = $("#posSearchInput");
    if (s) { s.focus(); s.select(); }
    return;
  }
  if (event.key === "F10" && currentView === "cash" && !document.querySelector("dialog[open]")) {
    event.preventDefault();
    $("#posSubmitTicketBtn")?.click();
    return;
  }
  if (event.key === "F3") {
    event.preventDefault();
    $("#shiftBadge")?.click();
    return;
  }
  if (event.key === "F4") {
    if (currentView === "machines") {
      event.preventDefault();
      const s = $("#stationSearch");
      if (s) { s.focus(); s.select(); }
      return;
    }
  }
});

let printRouteLoaded = false;
async function loadPrintRoute(refresh = false) {
  printRouteLoaded = true;
  try {
    const result = await api(`/api/printers/local${refresh ? "?refresh=1" : ""}`);
    const fill = (select, current) => {
      const names = result.printers.includes(current) || !current ? result.printers : [current, ...result.printers];
      select.innerHTML = `<option value="">Escolha a impressora padrão</option>${names.map(name => `<option value="${html(name)}" ${name === current ? "selected" : ""}>${html(name)}${name === current && !result.printers.includes(name) ? " (fila não detectada)" : ""}</option>`).join("")}`;
    };
    fill($("#printBlack"), result.black);
    fill($("#printColor"), result.color);
    if ($("#printColorQuality")) $("#printColorQuality").value = result.colorQuality || "High";
    $("#printBlackPrice").value = ((result.blackCents || 0) / 100).toFixed(2);
    $("#printColorPrice").value = ((result.colorCents || 0) / 100).toFixed(2);
    const isAdmin = state && state.user.role === "admin";
    for (const id of ["#printBlackPrice", "#printColorPrice"]) {
      $(id).disabled = !isAdmin;
      $(id).title = isAdmin ? "" : "Somente o administrador altera preços";
    }
  } catch (cause) {
    for (const id of ["#printBlack", "#printColor"]) $(id).innerHTML = `<option value="">${html(cause.message)}</option>`;
  }
}

$("#openDriverPrefsBtn")?.addEventListener("click", async () => {
  const printer = $("#printColor")?.value;
  if (!printer) { toast("Selecione a impressora colorida antes."); return; }
  try {
    await api("/api/printers/open-driver-prefs", { printer });
    toast(`Abrindo preferências de ${printer} no Windows...`);
  } catch (cause) { toast(cause.message); }
});

$("#printRouteRefresh").addEventListener("click", () => loadPrintRoute(true));
$("#printRoute").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const payload = {
      black: $("#printBlack").value,
      color: $("#printColor").value,
      colorQuality: $("#printColorQuality")?.value || "High"
    };
    if (state && state.user.role === "admin") {
      payload.blackPrice = $("#printBlackPrice").value;
      payload.colorPrice = $("#printColorPrice").value;
    }
    const result = await api("/api/settings/print-route", payload);
    const qLabels = { High: "Alta qualidade (300 DPI)", Standard: "Padrão", Draft: "Rascunho" };
    toast(`Impressoras atualizadas · P&B: ${result.black} (${currency(result.blackCents)}/pág) · Colorida: ${result.color} [${qLabels[result.colorQuality] || result.colorQuality}] (${currency(result.colorCents)}/pág)`);
    loadState();
  } catch (cause) { toast(cause.message); }
});

init();
schedulePoll();
setInterval(tickClocks, 1000);
