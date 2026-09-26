const $ = selector => document.querySelector(selector);
const html = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const currency = cents => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
const dateTime = iso => iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
const timeOnly = iso => iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "-";
const options = ["cash", "pix", "card"];
const methodName = { cash: "Dinheiro", pix: "Pix", card: "Cartão" };

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
          toast(`⚠️ Tempo esgotado: ${machine.name}!`);
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
            <button data-action="summary" data-id="${html(machine.id)}">📄 Resumo</button>
            <button data-action="move" data-id="${html(machine.id)}">⇄ Mover</button>
            <button data-action="restart" data-id="${html(machine.id)}">🔄 Reiniciar</button>
          ` : ""}
          <button data-action="monitor" data-id="${html(machine.id)}" ${machine.status === "offline" ? "disabled" : ""}>👁 Monitorar</button>
          ${active ? "" : `
            <button data-action="reboot" data-id="${html(machine.id)}" ${machine.status === "offline" ? 'disabled title="Sem conexão: reinicie no próprio PC"' : ""}>🔄 Reiniciar</button>
          `}
          <button data-action="shutdown" data-id="${html(machine.id)}" ${machine.status === "offline" ? "disabled" : ""}>⏻ Desligar</button>
          <button data-action="maintenance" data-id="${html(machine.id)}" ${active ? "disabled" : ""}>🛠 ${machine.maintenance ? "Fim Manut." : "Manutenção"}</button>
          ${state.user.role === "admin" ? `
            <button data-action="rename" data-id="${html(machine.id)}">✏ Renomear</button>
            <button data-action="pair" data-id="${html(machine.id)}">🔑 Vincular</button>
            <button data-action="remove" data-id="${html(machine.id)}" class="danger">🗑 Remover</button>
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
      : `<button class="primary" data-action="quickStart" data-minutes="30" data-id="${html(m.id)}">⚡ 30m</button><button class="primary" data-action="quickStart" data-minutes="60" data-id="${html(m.id)}">⚡ 1h</button><button class="secondaryBtn" data-action="start" data-id="${html(m.id)}">Opções...</button>`;

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
}

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

function renderReport() {
  if (!report) { $("#reportMetrics").innerHTML = ""; return; }
  $("#reportMetrics").innerHTML = metric(currency(report.salesCents), "Vendas") + metric(currency(report.receivedCents), "Recebido") + metric(report.sessions, "Sessões encerradas") + metric(report.minutes + " min", "Tempo usado");
  $("#reportMachines").innerHTML = table(["Estação", "Sessões", "Minutos"], report.byMachine.map(item => `<tr><td>${html(item.machineId)}</td><td>${item.count}</td><td>${item.minutes}</td></tr>`), "Sem sessões nesta data.");
  $("#reportProducts").innerHTML = table(["Produto", "Unidades", "Total"], (report.byProduct || []).map(item => `<tr><td>${html(item.name)}</td><td>${item.quantity}</td><td class="money">${currency(item.amountCents)}</td></tr>`), "Sem produtos vendidos nesta data.");
  $("#reportOperators").innerHTML = table(["Atendente", "Recebimentos", "Valor"], (report.byOperator || []).map(item => `<tr><td>${html(item.name)}</td><td>${item.payments}</td><td class="money">${currency(item.receivedCents)}</td></tr>`), "Sem recebimentos nesta data.");
  $("#reportCharges").innerHTML = table(["Hora", "Descrição", "Valor", "Pago"], report.charges.map(item => `<tr><td>${dateTime(item.at)}</td><td>${html(item.description)}</td><td class="money">${currency(item.amountCents)}</td><td class="money">${currency(item.paidCents)}</td></tr>`), "Sem vendas nesta data.");
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
}

async function loadReport() {
  try {
    report = await api(`/api/reports?date=${encodeURIComponent($("#reportDate").value)}`);
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
    const stockItems = state.products.filter(p => p.active && p.type === "stock" && p.stock > 0).slice(0, 6);
    if (stockItems.length) {
      quickContainer.innerHTML = stockItems.map(p => 
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

$("#quickSaleButton").addEventListener("click", () => openSale());
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
  const code = event.currentTarget.value.trim();
  const exact = state.products.find(item => item.active && item.code && item.code === code);
  const first = exact || state.products.find(item => item.active && item.name.toLocaleLowerCase("pt-BR").includes(code.toLocaleLowerCase("pt-BR")));
  if (first && (first.type !== "stock" || (saleCart.get(first.id) || 0) < first.stock)) {
    saleCart.set(first.id, (saleCart.get(first.id) || 0) + 1);
    event.currentTarget.value = "";
    renderSale();
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
        toast(`⚡ ${machine.name} liberada por ${open ? "tempo livre" : minutes + " min"}!`);
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
    openSale();
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
