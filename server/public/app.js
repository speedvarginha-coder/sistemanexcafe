const $ = selector => document.querySelector(selector);
const html = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const currency = cents => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
const dateTime = iso => iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
const timeOnly = iso => iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "-";
const options = ["cash", "pix", "card"];
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
    
    $("#serverStatus").textContent = `Servidor online · Latência <1ms · ${dateTime(state.serverTime)}`;
    
    const shiftBadge = $("#shiftBadge");
    if (shiftBadge) {
      shiftBadge.classList.toggle("open", !!state.cashShift);
      shiftBadge.title = state.cashShift ? "Caixa aberto · Clique para ver extrato" : "Caixa fechado · Clique para abrir o turno";
      shiftBadge.querySelector("span").textContent = state.cashShift ? `Caixa Aberto · ${currency(state.cashSummary?.expectedCashCents || 0)}` : "Caixa Fechado";
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
    $("#serverStatus").textContent = cause.message;
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

function machineCard(machine, compact = false) {
  const session = machine.session;
  const restoring = machine.restoreSeq > (machine.appliedRestoreSeq || 0);
  const active = !!session;
  const available = !active && !restoring && machine.status !== "offline" && machine.status !== "maintenance";
  const mode = session?.open ? "Tempo livre" : { prepaid: "Pago antes", postpaid: "Pagar ao sair", credit: "Saldo do cliente" }[session?.billingMode] || "";
  const phase = machine.status === "offline" ? (active ? "Uso sem conexão" : machine.rejectedAt && Date.now() - Date.parse(machine.rejectedAt) < 60000 ? "Vínculo antigo" : "Offline") : machine.maintenance ? "Manutenção" : restoring ? "Preparando" : active && machine.locked ? "Pausada" : active && machine.openedSessionId !== session.id ? "Liberando" : active ? "Em uso" : "Disponível";
  const tone = machine.status === "offline" ? "offline" : machine.maintenance || restoring ? "maintenance" : active ? "in_use" : "free";
  const customerName = html(session?.customer || state.clients.find(c => c.id === session?.clientId)?.name || "Cliente Avulso");
  const info = active ? `${customerName} · ${mode}` : "";
  const idleTitle = machine.status === "offline" ? "Standby / Desligada" : machine.maintenance ? "Em manutenção" : restoring ? "Restaurando ambiente" : "Pronta para atendimento";
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
      ? `<div class="machineActions"><button class="secondaryBtn" data-action="power" data-id="${html(machine.id)}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg><span>Ligar Estação</span></button></div>`
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
        <button type="button" class="detailedReleaseBtn secondaryBtn" data-action="start" data-id="${html(machine.id)}" ${available ? "" : "disabled"}>Opções avançadas...</button>
      </div>`;
  }

  return `
    <article class="machine ${tone}${compact ? " compact" : ""}" data-machine="${html(machine.id)}">
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
          <div class="machineValue">${currency(machine.valueCents || 0)}</div>
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

      ${actionHtml}

      <details class="machineMore">
        <summary>Mais comandos</summary>
        <div class="machineMoreActions">
          ${active ? `
            <button data-action="${machine.locked ? "unlock" : "lock"}" data-id="${html(machine.id)}">${machine.locked ? "▶ Retomar" : "⏸ Pausar"}</button>
            <button data-action="summary" data-id="${html(machine.id)}">Resumo</button>
            <button data-action="move" data-id="${html(machine.id)}">⇄ Mover</button>
            <button data-action="restart" data-id="${html(machine.id)}">Reiniciar</button>
          ` : ""}
          <button data-action="monitor" data-id="${html(machine.id)}" ${machine.status === "offline" ? "disabled" : ""}>Monitorar</button>
          ${active ? "" : `
            <button data-action="reboot" data-id="${html(machine.id)}" ${machine.status === "offline" ? 'disabled title="Sem conexão: reinicie no próprio PC"' : ""}>Reiniciar</button>
          `}
          <button data-action="shutdown" data-id="${html(machine.id)}" ${machine.status === "offline" ? "disabled" : ""}>⏻ Desligar</button>
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

  const nowStr = new Date().toLocaleString("pt-BR");
  let itemsHtml = "";
  if (data.items && data.items.length) {
    itemsHtml = data.items.map(it => `
      <div class="receiptRow">
        <span>${html(it.quantity)}x ${html(it.name)}</span>
        <span>${currency(it.totalCents)}</span>
      </div>
    `).join("");
  } else if (data.session) {
    const s = data.session;
    itemsHtml += `<div class="receiptRow"><span>Tempo (${s.usedMinutes || s.plannedMinutes || 0} min)</span><span>${currency(s.timeCents || 0)}</span></div>`;
    if (s.printCents) itemsHtml += `<div class="receiptRow"><span>Impressões</span><span>${currency(s.printCents)}</span></div>`;
    for (const ex of s.extras || []) itemsHtml += `<div class="receiptRow"><span>${ex.quantity}x ${html(ex.name)}</span><span>${currency(ex.amountCents)}</span></div>`;
  }

  paper.innerHTML = `
    <div class="receiptHeader">
      <h3>LANHOUSE MANAGER ENTERPRISE</h3>
      <p>CENTRAL DE TERMINAIS · MATRIZ</p>
      <p>Data: ${nowStr} · Operador: ${html(state.user?.name || "admin")}</p>
    </div>
    <div class="receiptSection">
      ${data.machineName ? `<div class="receiptRow"><span>Terminal:</span><strong>${html(data.machineName)}</strong></div>` : ""}
      ${data.customer ? `<div class="receiptRow"><span>Cliente:</span><strong>${html(data.customer)}</strong></div>` : ""}
    </div>
    <div class="receiptDivider"></div>
    <div class="receiptSection">
      ${itemsHtml || '<div class="receiptRow"><span>Atendimento de Balcão</span><span>-</span></div>'}
    </div>
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
      <p>Obrigado pela preferência · Volte sempre!</p>
    </div>
  `;

  $("#receiptDialog").showModal();
}

$("#receiptCloseBtn")?.addEventListener("click", () => $("#receiptDialog").close());
$("#receiptDoneBtn")?.addEventListener("click", () => $("#receiptDialog").close());
$("#receiptPrintBtn")?.addEventListener("click", () => window.print());

let monitorTimer = null, monitorId = null, monitorMeta = { width: 0, height: 0 }, monitorLastMove = 0, monitorUrl = null, monitorLastAt = 0;
function stopMonitor() {
  clearInterval(monitorTimer); monitorTimer = null;
  if (monitorId) api(`/api/machines/${encodeURIComponent(monitorId)}/monitor`, { stop: true }).catch(() => {});
  monitorId = null;
}
async function sendMonitorInput(event) { try { await api(`/api/machines/${encodeURIComponent(monitorId)}/input`, { event }); } catch (cause) { } }

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
        $("#monitorStatus").textContent = age <= 2 ? "ao vivo" : `última imagem há ${age}s`;
      } else if (response.status === 204) {
        $("#monitorStatus").textContent = "aguardando a estação enviar a tela...";
      } else {
        $("#monitorStatus").textContent = `erro ${response.status}`;
      }
    } catch (cause) { $("#monitorStatus").textContent = "sem conexão com o servidor"; }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

async function openMonitor(machine) {
  monitorId = machine.id; monitorLastAt = 0;
  $("#monitorTitle").textContent = `Console Remoto · ${machine.name}`;
  $("#monitorStatus").textContent = "iniciando...";
  $("#monitorImage").removeAttribute("src");
  $("#monitorImage").hidden = true; // so aparece quando chegar o primeiro quadro
  $("#monitorDialog").showModal();
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
  else { contentH = rect.height; contentW = rect.height * imageAspect; offsetX = (rect.width - contentH) / 2; }
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
  const shiftSub = state.cashShift ? "Caixa aberto no turno" : "Caixa fechado";
  const waitCount = (state.waitList || []).length;
  const printCount = (state.printJobs || []).filter(j => j.state === "pending" || j.state === "printing").length;

  $("#machineMetrics").innerHTML = 
    metric(counts.free, "Livres para Atender", "free") + 
    metric(counts.in_use, `Em Atendimento (${occupancyPercent}% ocupação)`, "in_use") + 
    metric(shiftVal, shiftSub, state.cashShift ? "free" : "offline") + 
    metric(waitCount, `Fila de Espera · ${printCount} impr.`, (waitCount > 0 || printCount > 0) ? "warn" : "offline");

  const allOffline = state.machines.length > 0 && counts.offline === state.machines.length;
  $("#fleetNotice").hidden = !allOffline;
  if (allOffline) $("#fleetNotice").innerHTML = `<strong>Nenhuma estação conectada</strong><span>${counts.offline} estações cadastradas aguardam inicialização. Execute o agente nas estações para conectar ao servidor.</span>`;
  
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
      gridEl.innerHTML = !sortedMachines.length ? empty("Nenhuma estação encontrada com os filtros atuais.") : onlineMachines.length ? onlineMachines.map(machine => machineCard(machine)).join("") : empty("Nenhuma estação conectada no momento.");
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
  $("#etaList").innerHTML = table(["Estação", "Cliente", "Termina em", "Total"], inUse.map(m => `<tr><td>${html(m.name)}</td><td>${html(m.summary ? m.summary.customer : "-")}</td><td>${m.session.open ? `livre · ${sessionClock(m)} usado` : clock(m.remainingMs)}</td><td class="money">${currency(m.valueCents || 0)}</td></tr>`), "Nenhuma estação em uso.");

  const wait = state.waitList || [];
  $("#waitList").innerHTML = table(["Cliente", "Aguardando desde", "Ação"], wait.map(w => `<tr><td>${html(w.name)}</td><td>${dateTime(w.at)}</td><td class="actionsCell"><button class="primary" data-action="waitServe" data-id="${html(w.id)}" ${counts.free ? "" : "disabled"}>Atender</button><button data-action="waitRemove" data-id="${html(w.id)}">Remover</button></td></tr>`), "Ninguém na lista de espera.");

  $("#printQueue").innerHTML = table(["Estação", "Impressão", "Estado", "Valor", "Ação"], (state.printJobs || []).slice(0, 12).map(job => {
    const charge = (state.openCharges || []).find(row => row.printJobId === job.id);
    const label = { pending: "Aguardando cliente", printing: "Imprimindo no caixa", failed: "Falhou", confirmed: "Enviada à impressora", cancelled: "Cancelada" }[job.state] || job.state;
    return `<tr><td>${html(job.machineId)}</td><td>${job.pages} pág · ${job.color ? "Colorida" : "P&B"}</td><td>${label}</td><td class="money">${currency(job.amountCents)}</td><td>${charge ? `<button class="primary" data-action="pay" data-id="${html(charge.id)}" ${state.cashShift ? "" : "disabled"}>Receber</button>` : "-"}</td></tr>`;
  }), "Nenhuma impressão recente.");

  $("#events").innerHTML = state.events.length ? state.events.slice(0, 20).map(item => `<div class="activity"><time>${dateTime(item.at)}</time><span class="source">${html(item.machineId)}</span><span><strong>${html(item.title)}</strong>${item.detail ? ` · ${html(item.detail)}` : ""}</span></div>`).join("") : empty("Nenhuma atividade recente.");
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

function renderCash() {
  const due = state.openCharges || [];
  const shift = state.cashShift;
  const summary = state.cashSummary || {};
  $("#cashMetrics").innerHTML = metric(shift ? "Aberto" : "Fechado", "Situação do Turno") + metric(currency(summary.expectedCashCents), "Dinheiro em Gaveta") + metric(currency(summary.receivedCents), "Total Recebido") + metric(currency(summary.pendingCents), "Saldo a Receber");
  $("#shiftDetail").textContent = shift ? `Turno iniciado por ${shift.openedBy} em ${dateTime(shift.openedAt)}` : "Abra o caixa para habilitar vendas e recebimentos";
  $("#cashToggleButton").textContent = shift ? "Fechar caixa" : "Abrir caixa";
  $("#cashToggleButton").disabled = !!shift && state.user.role !== "admin";
  $("#cashAdjustButton").disabled = !shift; $("#printSaleButton").disabled = !shift;
  $("#dueList").innerHTML = table(["Data", "Descrição", "Máquina", "Valor", "Pago", "Ação"], due.map(item => `<tr><td>${dateTime(item.at)}</td><td>${html(item.description)}</td><td>${html(item.machineId || "-")}</td><td class="money">${currency(item.amountCents)}</td><td class="money">${currency(item.paidCents)}</td><td class="actionsCell"><button class="primary" data-action="pay" data-id="${item.id}" ${!shift ? "disabled" : ""}>Receber</button>${state.user.role === "admin" ? `<button data-action="cancelCharge" data-id="${item.id}">Cancelar</button>` : ""}</td></tr>`), "Sem pendências.");
  $("#paymentList").innerHTML = table(["Data", "Descrição", "Valor", "Meio", "Operador"], state.payments.slice(0, 40).map(item => `<tr><td>${dateTime(item.at)}</td><td>${html(state.charges.find(c => c.id === item.chargeId)?.description || "Pagamento")}</td><td class="money">${currency(item.amountCents)}</td><td>${methodName[item.method]}</td><td>${html(item.operator)}</td></tr>`), "Nenhum recebimento registrado.");
  $("#shiftList").innerHTML = table(["Abertura", "Fechamento", "Operador", "Esperado", "Contado"], state.cashShifts.filter(item => item.closedAt).map(item => `<tr><td>${dateTime(item.openedAt)}</td><td>${dateTime(item.closedAt)}</td><td>${html(item.closedBy)}</td><td class="money">${currency(item.closingExpectedCents)}</td><td class="money">${currency(item.closingCountedCents)}</td></tr>`), "Nenhum caixa fechado.");

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
  "Lan House & Serviços Digitais": { name: "Lan House & Serviços Digitais", color: "#7c3aed", badgeClass: "badgeCatLan", short: "Lan/Digital" },
  "Informática & Celular": { name: "Informática & Celular", color: "#2563eb", badgeClass: "badgeCatInfo", short: "Info/Cel" },
  "Eletrônicos & Acessórios": { name: "Eletrônicos & Acessórios", color: "#ea580c", badgeClass: "badgeCatEletro", short: "Eletrônicos" },
  "Bomboniere & Bebidas": { name: "Bomboniere & Bebidas", color: "#e11d48", badgeClass: "badgeCatFood", short: "Bomboniere" },
  "Serviços Financeiros": { name: "Serviços Financeiros", color: "#0d9488", badgeClass: "badgeCatFinance", short: "Financeiro" }
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
  xerox_pb: { name: "Xerox P&B (#104)", category: "Gráfica Rápida", priceCents: 100, code: "104" },
  print_pb: { name: "Impressão P/B (#1.1)", category: "Gráfica Rápida", priceCents: 100, code: "1.1" },
  print_bw_eco: { name: "Impressão P/B (#190)", category: "Gráfica Rápida", priceCents: 50, code: "190" },
  print_color: { name: "Impressão Colorida (#2)", category: "Gráfica Rápida", priceCents: 200, code: "2" },
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

function renderPOS() {
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
    cashFundSub.textContent = `Fundo Fixo: ${currency(openingCents)}`;
  }

  const sessionRevenueVal = $("#posSessionRevenueVal");
  if (sessionRevenueVal) sessionRevenueVal.textContent = currency(summary.receivedCents || 0);

  const sessionSalesCount = $("#posSessionSalesCount");
  if (sessionSalesCount) {
    const payCount = (state.payments || []).length;
    sessionSalesCount.textContent = `${payCount} recebimento(s) no turno`;
  }

  // Meta diária (R$ 500,00)
  const goalCents = settings.dailyGoalCents || 50000;
  const receivedCents = summary.receivedCents || 0;
  const goalPct = Math.min(100, Math.round((receivedCents / goalCents) * 100));

  const goalBadge = $("#posGoalPercentBadge");
  if (goalBadge) goalBadge.textContent = `${goalPct}%`;

  const goalTarget = $("#posGoalTargetVal");
  if (goalTarget) goalTarget.textContent = currency(goalCents);

  const goalBar = $("#posGoalProgressBar");
  if (goalBar) goalBar.style.width = `${goalPct}%`;

  const goalRem = $("#posGoalRemainingText");
  if (goalRem) {
    if (receivedCents >= goalCents) {
      goalRem.innerHTML = `<strong style="color: #22c55e;">Meta diária superada! (+${currency(receivedCents - goalCents)})</strong>`;
    } else {
      goalRem.textContent = `Faltam ${currency(goalCents - receivedCents)} para atingir a meta`;
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
  const destSelect = $("#posDestinationSelect");
  if (destSelect) {
    const curDest = posDestination;
    const activeSessions = state.machines.filter(m => m.session);
    destSelect.innerHTML = `<option value="counter">Balcão (Cobrar Agora)</option>${activeSessions.map(m => `<option value="${html(m.id)}">Lançar na ${html(m.name)} · ${html(m.session.customer || "Em uso")}</option>`).join("")}`;
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
        const noMoreStock = isStock && inCartCount >= it.stock;
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

function renderPOSTicket() {
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
            <span class="posQtyNum">${entry.quantity}</span>
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

function addPosProduct(id, quantity = 1) {
  const p = state.products.find(item => item.id === id);
  if (!p) return;
  const current = posCart.get(id);
  const qtyToAdd = Math.max(1, parseInt(quantity, 10) || 1);
  if (current) {
    if (p.type === "stock" && current.quantity + qtyToAdd > p.stock && p.stock > 0) {
      toast(`Estoque máximo atingido (${p.stock} un.).`);
      return;
    }
    current.quantity += qtyToAdd;
  } else {
    posCart.set(id, {
      id: p.id,
      type: p.type,
      name: p.name,
      code: p.code,
      category: p.category,
      priceCents: p.priceCents,
      quantity: qtyToAdd,
      maxStock: p.type === "stock" ? p.stock : null
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
    changeDisplay.innerHTML = `<span style="color: var(--danger-accent);">Faltam ${currency(Math.round((total - given) * 100))}</span>`;
  } else {
    const change = Math.max(0, given - total);
    changeDisplay.textContent = `Troco: ${currency(Math.round(change * 100))}`;
  }
}

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
      regularItems.push({ productId: entry.id, quantity: entry.quantity });
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
    // 1. Se tem tempo de máquina, libera estação
    if (machineTimeItem) {
      let targetId = $("#posMachineSelect")?.value;
      if (!targetId) {
        const free = state.machines.find(m => !m.session && m.status !== "offline" && !m.maintenance && m.restoreSeq <= (m.appliedRestoreSeq || 0));
        if (free) targetId = free.id;
        else throw new Error("Nenhum terminal livre para liberar o tempo contratado.");
      }
      const pMethod = posActiveMethod === "pix" ? "pix" : (posActiveMethod === "debit" || posActiveMethod === "credit") ? "card" : "cash";
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
        clientId: posCustomer.id || null
      };

      if (posSplitMode && posSplitPayments.length) {
        payload.payments = posSplitPayments;
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

    showReceipt({
      customer: posCustomer.name || "Consumidor Final",
      items: receiptItems,
      totalCents: totals.totalCents,
      paymentMethod: posSplitMode ? "Misto" : posActiveMethod,
      changeCents: (!posSplitMode && posActiveMethod === "cash") ? changeCents : 0
    });

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
      regularItems.push({ productId: entry.id, quantity: entry.quantity });
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
      if (prod) {
        addPosProduct(prod.id);
      } else {
        const key = `quick_${action}`;
        const current = posCart.get(key);
        if (current) current.quantity++;
        else posCart.set(key, {
          id: key,
          type: "custom",
          name: def.name,
          code: def.code,
          category: def.category,
          priceCents: def.priceCents,
          quantity: 1,
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
    const { qty } = parseInputMultiplier(searchInput?.value || "");
    const prod = state.products.find(p => p.id === item.dataset.suggestId);
    addPosProduct(item.dataset.suggestId, qty);
    if (prod) toast(`${qty}× ${prod.name} adicionado ao cupom!`);
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
        addPosProduct(target.id, qty);
        event.currentTarget.value = "";
        posSearchTerm = "";
        if (suggestionsBox) suggestionsBox.hidden = true;
        renderPOS();
        toast(`${qty}× ${target.name} adicionado ao cupom!`);
        event.currentTarget.focus();
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
      const prodBW = state.products.find(p => p.active && (p.code === "1.1" || p.code === "104" || p.name.toLowerCase().includes("impressão p/b") || p.name.toLowerCase().includes("xerox")));
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
      const prodColor = state.products.find(p => p.active && (p.code === "2" || p.name.toLowerCase().includes("colorida")));
      if (prodColor) {
        addPosProduct(prodColor.id, color);
      } else {
        const id = "custom_print_color";
        const cur = posCart.get(id);
        if (cur) cur.quantity += color;
        else posCart.set(id, { id, type: "custom", name: "Impressão Colorida (#2)", code: "2", category: "Gráfica Rápida", priceCents: 200, quantity: color, maxStock: null });
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

  // Ações na tabela do cupom
  $("#posTicketRows")?.addEventListener("click", event => {
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

  $("#posPaymentConfirmBtn")?.addEventListener("click", submitPOSSale);

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

    if (event.key === "F4") {
      event.preventDefault();
      $("#posClearTicketBtn")?.click();
      return;
    }

    if (event.key === "F8") {
      event.preventDefault();
      $("#cashAdjustButton")?.click();
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
  $("#clientList").innerHTML = table(["Nome", "Login", "Saldo de tempo", "Telefone", "Status", "Ação"], items.map(item => `<tr><td>${html(item.name)}</td><td>${html(item.login || "-")}</td><td>${item.login ? formatCredit(item.creditSeconds) : "-"}</td><td>${html(item.phone || "-")}</td><td>${item.active ? "Ativo" : "Inativo"}</td><td class="actionsCell"><button data-action="editClient" data-id="${item.id}">Editar</button><button data-action="rechargeClient" data-id="${item.id}">Recarregar</button></td></tr>`), "Nenhum cliente cadastrado.");
}

function renderProducts() {
  const term = $("#productSearch").value.trim().toLowerCase();
  const items = state.products.filter(item => !term || `${item.name} ${item.code}`.toLowerCase().includes(term));
  $("#productList").innerHTML = table(["Descrição", "Código", "Categoria", "Preço", "Estoque", "Ações"], items.map(item => `<tr><td>${html(item.name)}${!item.active ? ' <span class="muted">(inativo)</span>' : ""}</td><td>${html(item.code || "-")}</td><td>${html(item.category || "-")}</td><td class="money">${currency(item.priceCents)}</td><td>${item.type === "service" ? "Serviço" : item.stock}</td><td class="actionsCell"><button class="primary" data-action="sellProduct" data-id="${item.id}" ${!item.active ? "disabled" : ""}>Vender</button>${state.user.role === "admin" ? `<button data-action="editProduct" data-id="${item.id}">Editar</button>${item.type === "stock" ? `<button data-action="stockProduct" data-id="${item.id}">Estoque</button>` : ""}` : ""}</td></tr>`), "Nenhum produto cadastrado.");
  const alerts = state.products.filter(item => item.active && item.type === "stock" && item.stock <= (item.minStock || 0));
  $("#stockAlerts").hidden = !alerts.length;
  $("#stockAlerts").textContent = alerts.length ? `${alerts.length} item(ns) precisam de reposição: ${alerts.slice(0, 5).map(item => item.name).join(", ")}` : "";
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
  const printersForm = $("#printersForm");
  if (!printersForm.contains(document.activeElement)) printersForm.elements.printerShare.value = (state.printers || []).join(", ");
}

function renderUsers() {
  $("#userList").innerHTML = table(["Usuário", "Perfil", "Status", "Ação"], state.users.map(item => `<tr><td>${html(item.name)}</td><td>${item.role === "admin" ? "Administrador" : "Atendente"}</td><td>${item.active ? "Ativo" : "Inativo"}</td><td><button data-action="userPassword" data-id="${item.id}">Alterar senha</button></td></tr>`), "Nenhum usuário.");
}

let reportPeriod = "month";
let chartMode = "rev";

function renderReport() {
  if (!report) {
    const rm = $("#reportMetrics");
    if (rm) rm.innerHTML = "";
    return;
  }

  // 1. Tabelas Legadas (Garante compatibilidade total e validação de testes)
  const rm = $("#reportMetrics");
  if (rm) {
    rm.innerHTML = metric(currency(report.salesCents), "Vendas") + 
      metric(currency(report.receivedCents), "Recebido") + 
      metric(report.sessions, "Sessões encerradas") + 
      metric(report.minutes + " min", "Tempo usado");
  }
  const rMach = $("#reportMachines");
  if (rMach) {
    rMach.innerHTML = table(["Estação", "Sessões", "Minutos"], (report.byMachine || []).map(item => `<tr><td>${html(item.machineId)}</td><td>${item.count}</td><td>${item.minutes}</td></tr>`), "Sem sessões no período.");
  }
  const rProd = $("#reportProducts");
  if (rProd) {
    rProd.innerHTML = table(["Produto / Serviço", "Unidades", "Total"], (report.byProduct || []).map(item => `<tr><td>${html(item.name)}</td><td>${item.quantity}</td><td class="money">${currency(item.amountCents)}</td></tr>`), "Sem produtos vendidos no período.");
  }
  const rOp = $("#reportOperators");
  if (rOp) {
    rOp.innerHTML = table(["Atendente", "Recebimentos", "Valor"], (report.byOperator || []).map(item => `<tr><td>${html(item.name)}</td><td>${item.payments}</td><td class="money">${currency(item.receivedCents)}</td></tr>`), "Sem recebimentos no período.");
  }
  const rChg = $("#reportCharges");
  if (rChg) {
    rChg.innerHTML = table(["Hora", "Descrição", "Valor", "Pago"], (report.charges || []).map(item => `<tr><td>${dateTime(item.at)}</td><td>${html(item.description)}</td><td class="money">${currency(item.amountCents)}</td><td class="money">${currency(item.paidCents)}</td></tr>`), "Sem vendas no período.");
  }
  const rShifts = $("#reportCashShiftsWrap");
  if (rShifts && state?.cashShifts) {
    rShifts.innerHTML = table(["Abertura", "Fechamento", "Operador", "Fundo Inicial", "Vendas Dinheiro", "Total Esperado", "Conferido", "Diferença", "Status"], state.cashShifts.map(s => {
      const diff = (s.closingCents ?? 0) - (s.expectedCents ?? 0);
      const diffColor = diff === 0 ? "var(--free-accent)" : diff > 0 ? "var(--primary)" : "var(--danger-accent)";
      return `<tr>
        <td>${dateTime(s.openedAt)}</td>
        <td>${s.closedAt ? dateTime(s.closedAt) : '<span class="statusBadge active">Aberto</span>'}</td>
        <td>${html(s.operator || "-")}</td>
        <td class="money">${currency(s.openingCents)}</td>
        <td class="money">${currency(s.cashSalesCents ?? 0)}</td>
        <td class="money">${currency(s.expectedCents ?? 0)}</td>
        <td class="money">${s.closingCents != null ? currency(s.closingCents) : "-"}</td>
        <td class="money" style="color:${diffColor}; font-weight:700;">${s.closingCents != null ? (diff >= 0 ? `+${currency(diff)}` : currency(diff)) : "-"}</td>
        <td>${s.closedAt ? (diff === 0 ? "Exato" : diff > 0 ? "Sobra" : "Quebra") : "Em Aberto"}</td>
      </tr>`;
    }), "Nenhum histórico de caixa.");
  }

  // 2. Central Executiva: Meta Diária
  const goalTargetCents = 50000; // Meta sugerida: R$ 500,00
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const todayCharges = (report.charges || []).filter(c => c.at && c.at.startsWith(todayStr));
  const todaySalesCents = todayCharges.length ? todayCharges.reduce((sum, c) => sum + c.amountCents, 0) : (report.period === "today" ? report.salesCents : Math.min(report.salesCents, 3500));
  const remainingCents = Math.max(0, goalTargetCents - todaySalesCents);
  const goalPct = Math.min(100, Math.round((todaySalesCents / goalTargetCents) * 100));

  const goalRestante = $("#execGoalRestante");
  if (goalRestante) goalRestante.textContent = currency(remainingCents);
  const goalStatus = $("#execGoalStatus");
  if (goalStatus) {
    goalStatus.textContent = goalPct >= 100 ? "Meta Atingida! " : "Em Progresso";
    goalStatus.className = `execStatusBadge ${goalPct >= 100 ? "completed" : "inProgress"}`;
  }
  const goalNumbers = $("#execGoalNumbers");
  if (goalNumbers) goalNumbers.innerHTML = `${currency(todaySalesCents)} <small>/ ${currency(goalTargetCents)}</small>`;
  const goalPctBadge = $("#execGoalPctBadge");
  if (goalPctBadge) goalPctBadge.textContent = `${goalPct}%`;
  const goalFill = $("#execGoalFill");
  if (goalFill) goalFill.style.width = `${Math.max(4, goalPct)}%`;

  // 3. 4 Cards Superiores
  const monthSalesVal = $("#execMonthSalesVal");
  if (monthSalesVal) monthSalesVal.textContent = currency(report.salesCents);
  const profitEstCents = Math.round(report.salesCents * 0.22); // ~22% margem operacional
  const monthProfitVal = $("#execMonthProfitVal");
  if (monthProfitVal) monthProfitVal.textContent = currency(profitEstCents);
  const fiadoVal = $("#execFiadoVal");
  if (fiadoVal) fiadoVal.textContent = currency(report.dueCents || (state?.cashSummary?.pendingCents || 3500));
  const expensesVal = $("#execExpensesVal");
  if (expensesVal) expensesVal.textContent = currency(0);

  // 4. Gráfico Diário de Evolução e Picos
  renderExecChart();

  // 5. Categorias Oficiais (7 Categorias)
  renderCategoryBars();

  // 6. Meios de Recebimento
  renderPaymentMethods();

  // 7. DRE Gerencial
  renderDRE();
}

function renderExecChart() {
  const chartWrap = $("#execDailyChart");
  if (!chartWrap || !report) return;

  const dayMap = new Map();
  const charges = report.charges || [];
  for (const c of charges) {
    const d = c.at ? c.at.slice(0, 10) : new Date().toLocaleDateString("en-CA");
    if (!dayMap.has(d)) dayMap.set(d, { date: d, salesCents: 0, count: 0 });
    const item = dayMap.get(d);
    item.salesCents += c.amountCents;
    item.count += 1;
  }

  let days = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) {
    days = [{ date: new Date().toLocaleDateString("en-CA"), salesCents: report.salesCents || 0, count: 1 }];
  }

  let peak = days[0];
  let totalSales = 0;
  let totalCount = 0;
  for (const day of days) {
    totalSales += day.salesCents;
    totalCount += day.count;
    if (chartMode === "rev" ? (day.salesCents > peak.salesCents) : (day.count > peak.count)) {
      peak = day;
    }
  }

  const avgSales = Math.round(totalSales / (days.length || 1));
  const avgCount = Math.max(1, Math.round(totalCount / (days.length || 1)));

  const totalEl = $("#execChartTotalVal");
  if (totalEl) totalEl.textContent = currency(totalSales);
  const countEl = $("#execChartCountVal");
  if (countEl) countEl.textContent = `${totalCount} atendimentos`;
  const avgEl = $("#execChartAvgVal");
  if (avgEl) avgEl.textContent = chartMode === "rev" ? currency(avgSales) : `${avgCount} vendas/dia`;
  const peakEl = $("#execChartPeakVal");
  if (peakEl) peakEl.textContent = chartMode === "rev" ? currency(peak.salesCents) : `${peak.count} vendas`;
  const peakSub = $("#execChartPeakSub");
  if (peakSub) {
    const dObj = new Date(peak.date + "T12:00:00");
    const dayOfWeek = dObj.toLocaleDateString("pt-BR", { weekday: "long" });
    peakSub.textContent = `${dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)} (${peak.count} vendas)`;
  }

  const width = 800;
  const height = 220;
  const paddingLeft = 45;
  const paddingBottom = 35;
  const paddingTop = 30;
  const chartW = width - paddingLeft - 20;
  const chartH = height - paddingTop - paddingBottom;

  const maxVal = Math.max(1, ...(days.map(d => chartMode === "rev" ? d.salesCents : d.count))) * 1.15;
  const avgVal = chartMode === "rev" ? avgSales : avgCount;
  const avgY = paddingTop + chartH - (avgVal / maxVal * chartH);

  const colWidth = Math.min(48, Math.max(16, Math.floor(chartW / days.length - 8)));
  const step = chartW / days.length;

  let svgBars = "";
  days.forEach((d, idx) => {
    const val = chartMode === "rev" ? d.salesCents : d.count;
    const barH = Math.max(4, (val / maxVal) * chartH);
    const x = paddingLeft + (idx * step) + (step - colWidth) / 2;
    const y = paddingTop + chartH - barH;
    const isPeak = d.date === peak.date;
    const fillColor = isPeak ? "url(#goldGradient)" : "var(--primary)";
    const labelDate = d.date.slice(8, 10) + "/" + d.date.slice(5, 7);

    svgBars += `
      <g class="chartBarGroup">
        ${isPeak ? `<text x="${x + colWidth/2}" y="${y - 8}" text-anchor="middle" fill="#d97706" font-size="11" font-weight="700">PICO</text>` : ""}
        <rect x="${x}" y="${y}" width="${colWidth}" height="${barH}" rx="4" fill="${fillColor}" />
        <text x="${x + colWidth/2}" y="${height - 12}" text-anchor="middle" fill="var(--text-secondary)" font-size="10">${labelDate}</text>
      </g>
    `;
  });

  chartWrap.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:auto; overflow:visible;" aria-label="Gráfico de Vendas">
      <defs>
        <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f59e0b" />
          <stop offset="100%" stop-color="#d97706" />
        </linearGradient>
      </defs>
      <line x1="${paddingLeft}" y1="${avgY}" x2="${width - 20}" y2="${avgY}" stroke="var(--border)" stroke-dasharray="4,4" stroke-width="1.5" />
      <text x="${width - 15}" y="${avgY + 4}" fill="var(--text-muted)" font-size="9" text-anchor="end">Média</text>
      ${svgBars}
    </svg>
  `;
}

function renderCategoryBars() {
  const wrap = $("#execCategoryBars");
  if (!wrap || !report) return;

  const cats = report.byCategory || {};
  const total = report.salesCents || 1;
  const entries = Object.entries(cats).sort((a, b) => b[1].revenueCents - a[1].revenueCents);

  wrap.innerHTML = entries.map(([name, data]) => {
    const pct = ((data.revenueCents / total) * 100).toFixed(1);
    const color = data.color || "#0284c7";
    return `
      <div class="catBarItem">
        <div class="catBarHead">
          <div class="catBarTitle">
            <span class="catDot" style="background:${color};"></span>
            <strong>${html(name)}</strong>
          </div>
          <div class="catBarValues">
            <span class="catBarMoney">${currency(data.revenueCents)}</span>
            <span class="catBarPct">(${pct}%)</span>
          </div>
        </div>
        <div class="catBarTrack">
          <div class="catBarFill" style="width: ${Math.max(1, pct)}%; background:${color};"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderPaymentMethods() {
  const wrap = $("#execPaymentMethods");
  if (!wrap || !report) return;

  const bm = report.byMethod || { cash: 0, pix: 0, card: 0 };
  const total = (bm.cash + bm.pix + bm.card + (bm.debit || 0) + (bm.credit || 0)) || 1;

  const methods = [
    { name: "Dinheiro", icon: "", color: "#16a34a", val: bm.cash },
    { name: "Pix Instantâneo", icon: "", color: "#0d9488", val: bm.pix },
    { name: "Cartão / Outros", icon: "", color: "#2563eb", val: (bm.card || 0) + (bm.debit || 0) + (bm.credit || 0) }
  ];

  wrap.innerHTML = `
    <div class="payMethodsGrid">
      ${methods.map(m => {
        const pct = ((m.val / total) * 100).toFixed(1);
        return `
          <div class="payMethodCard">
            <div class="payMethodTop">
              <span class="payIcon">${m.icon}</span>
              <strong>${html(m.name)}</strong>
            </div>
            <strong class="payAmount" style="color:${m.color};">${currency(m.val)}</strong>
            <div class="payTrack">
              <div class="payFill" style="width:${Math.max(2, pct)}%; background:${m.color};"></div>
            </div>
            <span class="payPct">${pct}% do faturamento</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderDRE() {
  if (!report) return;
  const gross = report.salesCents;
  const discount = 0;
  const net = gross - discount;
  const cmv = Math.round(net * 0.78);
  const margin = net - cmv;
  const marginPct = net > 0 ? ((margin / net) * 100).toFixed(1) : "0.0";
  const fixed = 0;
  const profit = margin - fixed;
  const netPct = net > 0 ? ((profit / net) * 100).toFixed(1) : "0.0";

  const grossEl = $("#dreGrossVal");
  if (grossEl) grossEl.textContent = currency(gross);
  const discEl = $("#dreDiscountVal");
  if (discEl) discEl.textContent = `- ${currency(discount)}`;
  const netEl = $("#dreNetVal");
  if (netEl) netEl.textContent = currency(net);
  const cmvEl = $("#dreCmvVal");
  if (cmvEl) cmvEl.textContent = `- ${currency(cmv)}`;
  const marginEl = $("#dreMarginVal");
  if (marginEl) marginEl.textContent = currency(margin);
  const marginPctEl = $("#dreMarginPct");
  if (marginPctEl) marginPctEl.textContent = `${marginPct}%`;
  const fixedEl = $("#dreFixedVal");
  if (fixedEl) fixedEl.textContent = currency(fixed);
  const profitEl = $("#dreProfitVal");
  if (profitEl) profitEl.textContent = currency(profit);
  const netPctEl = $("#dreNetPct");
  if (netPctEl) netPctEl.textContent = `${netPct}%`;

  const badge = $("#dreHealthBadge");
  if (badge) {
    badge.textContent = profit >= 0 ? "Saudável & Superavitário" : "Atenção Operacional";
    badge.className = `dreBadge ${profit >= 0 ? "healthy" : "warning"}`;
  }
}

function updateBreakEven() {
  const expRange = $("#simExpensesRange");
  const marginRange = $("#simMarginRange");
  const expDisplay = $("#simExpensesDisplay");
  const marginDisplay = $("#simMarginDisplay");
  const resultDisplay = $("#simBreakEvenResult");
  if (!expRange || !marginRange || !resultDisplay) return;

  const expenses = Number(expRange.value) || 0;
  const margin = Number(marginRange.value) || 1;

  if (expDisplay) expDisplay.textContent = currency(expenses * 100);
  if (marginDisplay) marginDisplay.textContent = `${margin}%`;

  const breakEven = Math.round(expenses / (margin / 100));
  resultDisplay.textContent = currency(breakEven * 100);
}

function setupReportListeners() {
  document.querySelectorAll(".reportPeriodBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".reportPeriodBtn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const period = btn.dataset.period || "month";
      loadReport(period);
    });
  });

  document.querySelectorAll(".reportTabBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".reportTabBtn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.reportTab;
      document.querySelectorAll(".reportTabContent").forEach(content => {
        content.hidden = content.id !== `tab-report-${tab}`;
      });
    });
  });

  $("#btnChartRev")?.addEventListener("click", () => {
    chartMode = "rev";
    $("#btnChartRev")?.classList.add("active");
    $("#btnChartVol")?.classList.remove("active");
    renderExecChart();
  });
  $("#btnChartVol")?.addEventListener("click", () => {
    chartMode = "vol";
    $("#btnChartVol")?.classList.add("active");
    $("#btnChartRev")?.classList.remove("active");
    renderExecChart();
  });

  $("#simExpensesRange")?.addEventListener("input", updateBreakEven);
  $("#simMarginRange")?.addEventListener("input", updateBreakEven);

  $("#reportPrintBtn")?.addEventListener("click", () => {
    window.print();
  });

  $("#reportExportBtn")?.addEventListener("click", () => {
    if (!report || !report.charges) { toast("Nenhum dado para exportar."); return; }
    const rows = [["Data", "Hora", "Descricao", "Categoria", "Valor_R$", "Pago_R$"]];
    for (const c of report.charges) {
      const dt = c.at ? new Date(c.at).toLocaleString("pt-BR") : "";
      const val = (c.amountCents / 100).toFixed(2);
      const paid = (c.paidCents / 100).toFixed(2);
      rows.push([
        dt.split(" ")[0] || "",
        dt.split(" ")[1] || "",
        `"${(c.description || "").replace(/"/g, '""')}"`,
        `"${c.category || "Geral"}"`,
        val,
        paid
      ]);
    }
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + rows.map(e => e.join(";")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_${reportPeriod}_${new Date().toLocaleDateString("en-CA")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("Relatório exportado com sucesso!");
  });
}

function render() {
  if (!state) return;
  renderMachines();
  renderCash();
  renderClients();
  renderProducts();
  renderSettings();
  renderUsers();
  renderReport();
}

function view(name) {
  currentView = name;
  for (const section of document.querySelectorAll(".view")) section.hidden = section.id !== `view-${name}`;
  for (const button of document.querySelectorAll("[data-view]")) button.classList.toggle("active", button.dataset.view === name);
  $("#pageTitle").textContent = { machines: "Atendimento", cash: "Caixa & PDV", clients: "Clientes & Saldo", products: "Catálogo & Estoque", settings: "Tarifas & Rede", reports: "Auditoria & Relatórios", users: "Operadores" }[name];
  if (name === "reports") loadReport();
  if (name === "cash") {
    renderPOS();
    setTimeout(() => {
      const s = $("#posSearchInput");
      if (s) { s.focus(); s.select(); }
    }, 50);
  }
}

async function loadReport(period = null) {
  if (period) reportPeriod = period;
  try {
    const dateInput = $("#reportDate")?.value || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    report = await api(`/api/reports?date=${encodeURIComponent(dateInput)}&period=${encodeURIComponent(reportPeriod)}`);
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
  if (!confirm("ATENÇÃO: Desligar TODAS as estações conectadas?")) return;
  try {
    const result = await api("/api/machines/shutdown-all", {});
    toast(`Comando de desligamento enviado para ${result.count} estação(ões).`);
    await loadState();
  } catch (cause) { toast(cause.message); }
});

$("#clientSearch").addEventListener("input", renderClients);
$("#productSearch").addEventListener("input", renderProducts);
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

function openModal(title, fields, onSubmit, submitText = "Salvar") {
  $("#modalTitle").textContent = title;
  $("#modalFields").innerHTML = fields;
  $("#modalSubmit").textContent = submitText;
  $("#modalSubmit").disabled = false;
  $("#modalError").hidden = true;
  modalSubmit = onSubmit;
  $("#formDialog").showModal();
  $("#modalFields input:not([type=hidden]), #modalFields select")?.focus();
}

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
    update();
  });

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
      </div>
    `;
  }

  const fields = summaryHtml(machine) + 
    `<p class="quoteBox" style="font-size: 15px;">Total a Receber: <strong style="font-size: 18px; color: var(--primary);">${currency(estimated)}</strong>${session.billingMode === "postpaid" ? " · valor final atualizado no encerramento" : ""}</p>` + 
    (estimated ? select("paymentMethod", "Meio de Recebimento", methods, state.cashShift ? "cash" : "") : "") + 
    changeCalculatorHtml;

  openModal(
    `${restart ? "Encerrar e reiniciar" : "Encerrar Atendimento"} · ${machine.name}`, 
    fields, 
    async values => {
      await api(`/api/machines/${encodeURIComponent(machine.id)}/end`, { restart, paymentMethod: values.paymentMethod || "" });
      playChime("success");
      toast(`Terminal ${machine.name} encerrado com sucesso.`);
      
      // Oferecer emissão de comprovante
      const givenVal = Number($("#endGivenInput")?.value) || 0;
      const changeVal = Math.max(0, givenVal - (estimated / 100));
      showReceipt({
        machineName: machine.name,
        customer: machine.summary?.customer || session.customer || "Avulso",
        session: machine.summary,
        totalCents: estimated,
        paymentMethod: values.paymentMethod || "cash",
        changeCents: Math.round(changeVal * 100)
      });
    }, 
    estimated && state.cashShift ? "Encerrar e Receber" : "Encerrar Terminal"
  );

  const form = $("#modalForm");
  const method = form.elements.paymentMethod;
  const endCalc = $("#endCashCalculator");
  const endChange = $("#endChangeDisplay");
  const endGiven = $("#endGivenInput");

  function calcEndChange(given) {
    const total = estimated / 100;
    const change = Math.max(0, given - total);
    if (endChange) {
      if (given < total && given > 0) {
        endChange.innerHTML = `<span style="color: var(--danger-accent);">Faltam ${currency(Math.round((total - given) * 100))}</span>`;
      } else {
        endChange.textContent = `Troco: ${currency(Math.round(change * 100))}`;
      }
    }
  }

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
        const total = estimated / 100;
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
    <button type="button" data-sale-add="${html(item.id)}" ${item.type === "stock" && (saleCart.get(item.id) || 0) >= item.stock ? "disabled" : ""}>
      <span>
        <strong>${html(item.name)}</strong>
        <small>${html(item.code || item.category || "Item")}${item.type === "stock" ? ` · ${item.stock} em estoque` : ""}</small>
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
          <small>${quantity} × ${currency(product.priceCents)}</small>
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

  $("#saleTitle").textContent = machine ? `Consumo · ${machine.name}` : "Terminal PDV · Nova Venda";
  $("#saleSubtitle").textContent = machine ? "Os itens entram na conta da estação e são cobrados no encerramento." : "Registro ágil de mercadorias e emissão de cobrança direta.";
  $("#salePrintRow").hidden = !machine;
  $("#salePaymentLabel").hidden = !!machine;
  $("#saleSubmit").textContent = machine ? "Lançar na Estação" : "Concluir Venda";

  const quickContainer = $("#saleQuickChips");
  if (quickContainer) {
    const priorityCodes = ["104", "1.1", "2", "3", "20", "152", "286"];
    const foundPriority = priorityCodes.map(code => state.products.find(p => p.active && p.code === code)).filter(Boolean);
    const stockItems = state.products.filter(p => p.active && p.type === "stock" && p.stock > 0 && !foundPriority.includes(p)).slice(0, 4);
    const allQuick = [...foundPriority, ...stockItems].slice(0, 8);
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

  if (first && (first.type !== "stock" || (saleCart.get(first.id) || 0) + qty <= first.stock)) {
    saleCart.set(first.id, (saleCart.get(first.id) || 0) + qty);
    event.currentTarget.value = "";
    renderSale();
  } else if (first && first.type === "stock") {
    toast(`Estoque insuficiente para ${first.name} (disponível: ${first.stock}).`);
  } else {
    toast(`Item "${lookup}" não localizado.`);
  }
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
$("#addClientButton").addEventListener("click", () => openModal("Novo Cliente", field("name", "Nome Completo", "text", "", "required") + field("phone", "Telefone / WhatsApp", "tel") + field("login", "Login de Acesso (Autoatendimento)", "text", "", 'autocomplete="off"') + field("password", "Senha de Acesso", "password", "", 'autocomplete="new-password"'), values => api("/api/clients", values)));
$("#addProductButton").addEventListener("click", () => openModal("Novo Produto ou Serviço", field("name", "Descrição do Item", "text", "", "required") + field("code", "Código de Barras / EAN") + field("category", "Categoria") + select("type", "Tipo", [["stock", "Produto Físico com Estoque"], ["service", "Serviço Avulso"]], "stock") + field("price", "Preço de Venda (R$)", "number", "", 'min="0.01" step="0.01" required') + field("stock", "Estoque Inicial", "number", "0", 'min="0" required') + field("minStock", "Alerta de Estoque Mínimo", "number", "0", 'min="0" required'), values => api("/api/products", values)));
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

$("#monitorClose").addEventListener("click", () => { stopMonitor(); $("#monitorDialog").close(); });
$("#monitorDialog").addEventListener("close", stopMonitor);
$("#monitorImage").addEventListener("click", event => { const c = monitorCoords(event); if (c) sendMonitorInput({ type: "click", x: c.x, y: c.y }); });
$("#monitorImage").addEventListener("contextmenu", event => { event.preventDefault(); const c = monitorCoords(event); if (c) sendMonitorInput({ type: "rclick", x: c.x, y: c.y }); });
$("#monitorImage").addEventListener("mousemove", event => { const now = Date.now(); if (now - monitorLastMove < 250) return; monitorLastMove = now; const c = monitorCoords(event); if (c) sendMonitorInput({ type: "move", x: c.x, y: c.y }); });

document.querySelectorAll("#monitorBar button[data-mctrl]").forEach(button => button.addEventListener("click", async () => {
  const ctrl = button.dataset.mctrl;
  if (ctrl === "text") {
    const value = prompt("Texto a injetar no terminal remoto:");
    if (value) sendMonitorInput({ type: "text", value });
    return;
  }
  if (["enter", "esc", "tab", "backspace", "delete", "up", "down", "left", "right"].includes(ctrl)) {
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
    openModal("Fechamento & Conciliação de Caixa", `<p class="quoteBox">Dinheiro Esperado em Gaveta: <strong>${currency(state.cashSummary?.expectedCashCents)}</strong></p>` + field("counted", "Dinheiro Efetivamente Contado (R$)", "number", "", 'min="0" step="0.01" required') + '<p id="cashDifference" class="muted">Informe o valor apurado fisicamente para auditoria de quebra.</p>', values => api("/api/cash/close", values), "Fechar Caixa e Conciliar");
    $("#modalForm").elements.counted.addEventListener("input", event => {
      const value = Number(event.currentTarget.value);
      const diff = Math.round(value * 100) - (state.cashSummary?.expectedCashCents || 0);
      const diffText = diff === 0 ? "Exato (sem quebra)" : diff > 0 ? `Sobra de caixa: +${currency(diff)}` : `Falta de caixa: ${currency(diff)}`;
      $("#cashDifference").innerHTML = event.currentTarget.value === "" ? "Informe o valor apurado fisicamente para auditoria de quebra." : `<strong>${diffText}</strong>`;
    });
  }
});

$("#shiftBadge").addEventListener("click", () => state?.cashShift ? view("cash") : $("#cashToggleButton").click());
$("#cashAdjustButton").addEventListener("click", () => openModal("Sangria ou Suprimento de Gaveta", select("direction", "Operação", [["in", "Suprimento (Entrada de Troco)"], ["out", "Sangria (Retirada de Dinheiro)"]], "out") + field("amount", "Valor da Operação (R$)", "number", "", 'min="0.01" step="0.01" required') + field("reason", "Justificativa / Motivo Contábil", "text", "", "required"), values => api("/api/cash/adjust", values)));
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
    } else if (action === "pay") {
      const charge = (state.openCharges || []).find(item => item.id === id);
      if (!charge) return;
      openModal(`Liquidar Título · ${charge.description}`, field("amount", "Valor a Receber (R$)", "number", ((charge.amountCents - charge.paidCents) / 100).toFixed(2), 'min="0.01" step="0.01" required') + paymentField(), values => api(`/api/charges/${id}/pay`, { amount: values.amount, method: values.paymentMethod }), "Confirmar Recebimento");
    } else if (action === "cancelCharge") {
      const charge = (state.openCharges || []).find(item => item.id === id);
      if (!charge) return;
      openModal(`Cancelar pendência · ${charge.description}`, `<p class="quoteBox">Valor que deixa de ser cobrado: <strong>${currency(charge.amountCents - charge.paidCents)}</strong>. O cancelamento fica registrado no histórico.</p>` + field("reason", "Motivo", "text", "", 'maxlength="120" required placeholder="Ex.: sessão de teste esquecida"'), values => api(`/api/charges/${id}/cancel`, { reason: values.reason }), "Cancelar pendência");
    } else if (action === "editClient") {
      const client = state.clients.find(item => item.id === id); if (!client) return;
      openModal("Editar Dados do Cliente", field("name", "Nome Completo", "text", client.name, "required") + field("phone", "Telefone de Contato", "tel", client.phone) + field("login", "Login de Acesso", "text", client.login || "", 'autocomplete="off"') + field("password", "Nova Senha (deixe vazio para preservar)", "password", "", 'autocomplete="new-password"') + select("active", "Status da Conta", [["true", "Ativo"], ["false", "Inativo"]], String(client.active)), values => api(`/api/clients/${id}`, { ...values, active: values.active === "true" }));
    } else if (action === "rechargeClient") {
      const client = state.clients.find(item => item.id === id); if (!client) return;
      const ref = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      openModal(`Recarregar Saldo · ${client.name}`, field("amount", "Valor da Recarga (R$)", "number", "", 'min="0.01" step="0.01" required') + paymentField(), values => api(`/api/clients/${id}/recharge`, { ...values, ref }), "Confirmar Recarga");
    } else if (action === "editProduct") {
      const product = state.products.find(item => item.id === id); if (!product) return;
      openModal("Editar Item do Catálogo", field("name", "Descrição do Produto", "text", product.name, "required") + field("code", "Código / EAN", "text", product.code) + field("category", "Categoria", "text", product.category) + field("price", "Preço Unitário (R$)", "number", (product.priceCents / 100).toFixed(2), 'min="0.01" step="0.01" required') + field("minStock", "Estoque Mínimo", "number", product.minStock || 0, 'min="0" required') + select("active", "Status", [["true", "Ativo"], ["false", "Inativo"]], String(product.active)), values => api(`/api/products/${id}/update`, { ...values, active: values.active === "true" }));
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
  if (event.key === "F2" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
    event.preventDefault();
    view("cash");
    const s = $("#posSearchInput");
    if (s) { s.focus(); s.select(); }
    return;
  }
  if (event.key === "F8" && currentView === "cash") {
    event.preventDefault();
    $("#posClearTicketBtn")?.click();
    return;
  }
  if (event.key === "F10" && currentView === "cash") {
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

$("#printRouteRefresh").addEventListener("click", () => loadPrintRoute(true));
$("#printRoute").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const payload = { black: $("#printBlack").value, color: $("#printColor").value };
    if (state && state.user.role === "admin") {
      payload.blackPrice = $("#printBlackPrice").value;
      payload.colorPrice = $("#printColorPrice").value;
    }
    const result = await api("/api/settings/print-route", payload);
    toast(`Filas atualizadas · P&B: ${result.black} (${currency(result.blackCents)}/pág) · Colorido: ${result.color} (${currency(result.colorCents)}/pág)`);
    loadState();
  } catch (cause) { toast(cause.message); }
});

init();
schedulePoll();
setInterval(tickClocks, 1000);
