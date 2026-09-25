const $ = selector => document.querySelector(selector);
const html = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const currency = cents => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
const dateTime = iso => iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
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

async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result.error || `Erro HTTP ${response.status}`);
  return result;
}
function toast(message) {
  const el = $("#toast"); el.textContent = message; el.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, 3500);
}
function showAuth(setup = false, pendingLocalSetup = false) {
  $("#workspace").hidden = true; $("#authScreen").hidden = false;
  $("#authSubtitle").textContent = setup ? "Crie o administrador neste computador" : pendingLocalSetup ? "Abra este painel no computador servidor para criar o administrador" : "Acesso do atendente";
  $("#authSubmit").textContent = setup ? "Criar administrador" : "Entrar";
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
    const me = await api("/api/me"); showWorkspace(me.user); await loadState();
  } catch { showAuth(false); }
}
$("#authForm").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget;
  const name = form.elements.name.value.trim(); const password = form.elements.password.value;
  try {
    if (form.dataset.setup === "true") await api("/api/setup", { name, password });
    const result = await api("/api/login", { name, password });
    form.elements.password.value = ""; showWorkspace(result.user); await loadState();
  } catch (cause) { $("#authError").textContent = cause.message; $("#authError").hidden = false; }
});
$("#logoutButton").addEventListener("click", async () => { try { await api("/api/logout", {}); } finally { state = null; showAuth(false); } });

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
      if (latestPrint.state === "pending") toast(`Nova impressão: ${latestPrint.pages} pág ${latestPrint.color ? "colorida" : "P&B"} — aguardando cliente`);
      else if (latestPrint.state === "confirmed") toast(`Impressão confirmada: ${latestPrint.pages} pág ${latestPrint.color ? "colorida" : "P&B"}`);
    }
    $("#serverStatus").textContent = `Servidor online · ${dateTime(state.serverTime)}`;
    $("#shiftBadge").textContent = state.cashShift ? "Caixa aberto" : "Caixa fechado";
    $("#shiftBadge").classList.toggle("open", !!state.cashShift);
    $("#shiftBadge").title = state.cashShift ? "Ver o caixa" : "Abrir o caixa";
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
function metric(value, label, tone = "") { return `<div class="metric ${tone}"><strong>${html(value)}</strong><span>${html(label)}</span></div>`; }
function empty(message) { return `<div class="empty">${html(message)}</div>`; }
function table(columns, rows, message = "Nenhum registro.") {
  if (!rows.length) return empty(message);
  return `<table class="dataTable"><thead><tr>${columns.map(column => `<th>${html(column)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}
function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}
function tickClocks() {
  if (!state || !state.machines) return;
  const now = Date.now() + serverOffset;
  for (const machine of state.machines) {
    const el = document.querySelector(`.machineClock[data-id="${machine.id}"]`);
    if (!el || !machine.session) continue;
    el.textContent = clock(Math.max(0, Date.parse(machine.session.endsAt) - now));
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
  const mode = { prepaid: "Pago antes", postpaid: "Pagar ao sair", credit: "Saldo do cliente" }[session?.billingMode] || "";
  const phase = machine.status === "offline" ? active ? "Uso sem conexão" : "Offline" : machine.maintenance ? "Manutenção" : restoring ? "Preparando" : active && machine.locked ? "Pausada" : active && machine.openedSessionId !== session.id ? "Liberando" : active ? "Em uso" : "Disponível";
  const tone = machine.status === "offline" ? "offline" : machine.maintenance || restoring ? "maintenance" : active ? "in_use" : "free";
  const info = active ? `${html(session.customer || state.clients.find(c => c.id === session.clientId)?.name || "Avulso")} · ${mode}` : "";
  const idleTitle = machine.status === "offline" ? "Sem conexão" : machine.maintenance ? "Em manutenção" : restoring ? "Preparando estação" : "Pronta para atender";
  const idleDetail = machine.status === "offline" ? machine.mac ? "É possível tentar ligar pelo painel." : "Instale o agente no PC para liberar." : machine.maintenance ? "A liberação está suspensa." : restoring ? "Aguarde a restauração terminar." : "Disponível para o próximo cliente.";
  const monitorIcon = `<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect x="5" y="7" width="30" height="21" rx="3" stroke="currentColor" stroke-width="2"/><path d="M15 33h10M20 28v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  const action = active ? `<button class="primary" data-action="end" data-id="${html(machine.id)}">Encerrar e receber</button>` : machine.status === "offline" ? machine.mac ? `<button data-action="power" data-id="${html(machine.id)}">Ligar estação</button>` : `<span class="machineSetupNote">Aguardando instalação</span>` : `<button class="primary" data-action="start" data-id="${html(machine.id)}" ${available ? "" : "disabled"}>Liberar estação</button>`;
  return `<article class="machine ${tone}${compact ? " compact" : ""}" data-machine="${html(machine.id)}">
    <div class="machineTop"><div><h3>${html(machine.name)}</h3><small>${html(machine.id)}</small></div><span class="status ${tone}">${phase}</span></div>
    ${compact ? "" : active ? `<div class="machineMiddle"><div class="machineClock" data-id="${html(machine.id)}">${clock(machine.remainingMs)}</div><div class="machineValue">${currency(machine.valueCents || 0)}</div></div><div class="machineInfo">${info}</div>` : `<div class="machineIdle"><span class="machineIdleIcon">${monitorIcon}</span><div><strong>${idleTitle}</strong><span>${idleDetail}</span></div></div>`}
    <div class="machineActions">${action}${active ? `<button data-action="addTime" data-id="${html(machine.id)}">+ Tempo</button><button data-action="consume" data-id="${html(machine.id)}">+ Consumo</button>` : ""}</div>
    <details class="machineMore"><summary>Mais ações</summary><div class="machineMoreActions">
      ${active ? `<button data-action="${machine.locked ? "unlock" : "lock"}" data-id="${html(machine.id)}">${machine.locked ? "Retomar" : "Pausar"}</button><button data-action="summary" data-id="${html(machine.id)}">Resumo</button><button data-action="move" data-id="${html(machine.id)}">Mover</button><button data-action="restart" data-id="${html(machine.id)}">Encerrar e reiniciar</button>` : ""}
      <button data-action="monitor" data-id="${html(machine.id)}" ${machine.status === "offline" ? "disabled" : ""}>Monitorar</button>
      ${active ? "" : `<button data-action="reboot" data-id="${html(machine.id)}" ${machine.status === "offline" ? 'disabled title="Sem conexão: reinicie no próprio computador"' : ""}>Reiniciar</button>`}
      <button data-action="shutdown" data-id="${html(machine.id)}" ${machine.status === "offline" ? "disabled" : ""}>Desligar</button>
      <button data-action="maintenance" data-id="${html(machine.id)}" ${active ? "disabled" : ""}>${machine.maintenance ? "Encerrar manutenção" : "Manutenção"}</button>
      ${state.user.role === "admin" ? `<button data-action="rename" data-id="${html(machine.id)}">Renomear</button><button data-action="pair" data-id="${html(machine.id)}">Vincular agente</button><button data-action="remove" data-id="${html(machine.id)}">Remover</button>` : ""}
    </div></details></article>`;
}
function summaryHtml(machine) {
  const s = machine.summary;
  if (!s) return '<p class="muted">Sem sessão ativa nesta estação.</p>';
  const rows = [];
  rows.push(`<div class="summaryRow"><span>Cliente</span><strong>${html(s.customer)}</strong></div>`);
  rows.push(`<div class="summaryRow"><span>Contratado</span><strong>${s.plannedMinutes} min</strong></div>`);
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
let monitorTimer = null, monitorId = null, monitorMeta = { width: 0, height: 0 }, monitorLastMove = 0, monitorUrl = null, monitorLastAt = 0;
function stopMonitor() {
  clearInterval(monitorTimer); monitorTimer = null;
  if (monitorId) api(`/api/machines/${encodeURIComponent(monitorId)}/monitor`, { stop: true }).catch(() => {});
  monitorId = null;
}
async function sendMonitorInput(event) { try { await api(`/api/machines/${encodeURIComponent(monitorId)}/input`, { event }); } catch (cause) { } }
// Busca quadros JPEG em sequencia: o proximo so e pedido quando o anterior chega.
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
  $("#monitorTitle").textContent = `Monitorando · ${machine.name}`;
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
  else { contentH = rect.height; contentW = rect.height * imageAspect; offsetX = (rect.width - contentW) / 2; }
  const relX = (event.clientX - rect.left - offsetX) / contentW;
  const relY = (event.clientY - rect.top - offsetY) / contentH;
  if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;
  return { x: Math.round(relX * monitorMeta.width), y: Math.round(relY * monitorMeta.height) };
}
function renderMachines() {
  const counts = { free: 0, in_use: 0, offline: 0, preparing: 0 };
  for (const item of state.machines) {
    if (item.session) counts.in_use++;
    if (item.status === "offline") counts.offline++;
    else if (item.session) continue;
    else if (item.maintenance || item.restoreSeq > (item.appliedRestoreSeq || 0)) counts.preparing++;
    else counts.free++;
  }
  $("#machineMetrics").innerHTML = metric(counts.free, "Disponíveis", "free") + metric(counts.in_use, "Em uso", "in_use") + metric(counts.preparing, "Preparando", "maintenance") + metric(counts.offline, "Sem conexão", "offline");
  const allOffline = state.machines.length > 0 && counts.offline === state.machines.length;
  $("#fleetNotice").hidden = !allOffline;
  if (allOffline) $("#fleetNotice").innerHTML = `<strong>Nenhuma estação conectada</strong><span>${counts.offline} ${counts.offline === 1 ? "estação cadastrada aguarda" : "estações cadastradas aguardam"} o agente. Instale primeiro em um PC e confirme a conexão aqui.</span>`;
  $("#powerAllButton").disabled = !state.machines.some(machine => machine.status === "offline" && machine.mac);
  $("#shutdownAllButton").disabled = !state.machines.some(machine => machine.status !== "offline");
  const expanded = [...document.querySelectorAll(".machineMore[open]")].map(item => item.closest("[data-machine]")?.dataset.machine);
  // Conectadas em cima; sem conexao em cartoes compactos abaixo, para nao ocupar a tela de atendimento.
  const sortedMachines = state.machines.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
  const onlineMachines = sortedMachines.filter(machine => machine.status !== "offline" || machine.session);
  const offlineMachines = sortedMachines.filter(machine => machine.status === "offline" && !machine.session);
  $("#machines").innerHTML = !state.machines.length ? empty("Nenhuma estação. Baixe o instalador e rode nas estações: elas se cadastram sozinhas.") : onlineMachines.length ? onlineMachines.map(machine => machineCard(machine)).join("") : empty("Nenhuma estação conectada no momento.");
  $("#offlineSection").hidden = !offlineMachines.length;
  $("#offlineCount").textContent = offlineMachines.length;
  $("#offlineMachines").innerHTML = offlineMachines.map(machine => machineCard(machine, true)).join("");
  for (const id of expanded) {
    const card = [...document.querySelectorAll("#machines [data-machine]")].find(item => item.dataset.machine === id);
    if (card) card.querySelector(".machineMore").open = true;
  }
  const inUse = state.machines.filter(item => item.session).slice().sort((a, b) => a.remainingMs - b.remainingMs);
  $("#etaSection").hidden = inUse.length === 0;
  $("#etaList").innerHTML = table(["Estação", "Cliente", "Termina em", "Total"], inUse.map(m => `<tr><td>${html(m.name)}</td><td>${html(m.summary ? m.summary.customer : "-")}</td><td>${clock(m.remainingMs)}</td><td class="money">${currency(m.valueCents || 0)}</td></tr>`), "Nenhuma estação em uso.");
  const wait = state.waitList || [];
  $("#waitList").innerHTML = table(["Cliente", "Aguardando desde", "Ação"], wait.map(w => `<tr><td>${html(w.name)}</td><td>${dateTime(w.at)}</td><td class="actionsCell"><button data-action="waitServe" data-id="${html(w.id)}" ${counts.free ? "" : "disabled"}>Atender</button><button data-action="waitRemove" data-id="${html(w.id)}">Remover</button></td></tr>`), "Ninguém na lista de espera.");
  $("#printQueue").innerHTML = table(["Estação", "Impressão", "Estado", "Valor", "Ação"], (state.printJobs || []).slice(0, 12).map(job => {
    const charge = (state.openCharges || []).find(row => row.printJobId === job.id);
    const label = { pending: "Aguardando cliente", printing: "Imprimindo no caixa", failed: "Falhou", confirmed: job.printedAt ? "Impressa" : "Confirmada", cancelled: "Cancelada" }[job.state] || job.state;
    return `<tr><td>${html(job.machineId)}</td><td>${job.pages} pág · ${job.color ? "Colorida" : "P&B"}</td><td>${label}</td><td class="money">${currency(job.amountCents)}</td><td>${charge ? `<button data-action="pay" data-id="${html(charge.id)}" ${state.cashShift ? "" : "disabled"}>Receber</button>` : "-"}</td></tr>`;
  }), "Nenhuma impressão recente.");
  $("#events").innerHTML = state.events.length ? state.events.slice(0, 20).map(item => `<div class="activity"><time>${dateTime(item.at)}</time><span class="source">${html(item.machineId)}</span><span><strong>${html(item.title)}</strong>${item.detail ? ` · ${html(item.detail)}` : ""}</span></div>`).join("") : empty("Nenhuma atividade ainda.");
}
function renderCash() {
  const due = state.openCharges || [];
  const shift = state.cashShift;
  const summary = state.cashSummary || {};
  $("#cashMetrics").innerHTML = metric(shift ? "Aberto" : "Fechado", "Situação") + metric(currency(summary.expectedCashCents), "Dinheiro esperado") + metric(currency(summary.receivedCents), "Recebido no caixa") + metric(currency(summary.pendingCents), "Pendente");
  $("#shiftDetail").textContent = shift ? `Aberto por ${shift.openedBy} em ${dateTime(shift.openedAt)}` : "Abra o caixa para registrar pagamentos";
  $("#cashToggleButton").textContent = shift ? "Fechar caixa" : "Abrir caixa";
  $("#cashToggleButton").disabled = !!shift && state.user.role !== "admin";
  $("#cashAdjustButton").disabled = !shift; $("#printSaleButton").disabled = !shift;
  $("#dueList").innerHTML = table(["Data", "Descrição", "Máquina", "Valor", "Pago", "Ação"], due.map(item => `<tr><td>${dateTime(item.at)}</td><td>${html(item.description)}</td><td>${html(item.machineId || "-")}</td><td class="money">${currency(item.amountCents)}</td><td class="money">${currency(item.paidCents)}</td><td class="actionsCell"><button data-action="pay" data-id="${item.id}" ${!shift ? "disabled" : ""}>Receber</button></td></tr>`), "Sem pendências.");
  $("#paymentList").innerHTML = table(["Data", "Descrição", "Valor", "Meio", "Atendente"], state.payments.slice(0, 40).map(item => `<tr><td>${dateTime(item.at)}</td><td>${html(state.charges.find(c => c.id === item.chargeId)?.description || "Pagamento")}</td><td class="money">${currency(item.amountCents)}</td><td>${methodName[item.method]}</td><td>${html(item.operator)}</td></tr>`), "Nenhum recebimento.");
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
  $("#productList").innerHTML = table(["Descrição", "Código", "Categoria", "Preço", "Estoque", "Ações"], items.map(item => `<tr><td>${html(item.name)}${!item.active ? ' <span class="muted">(inativo)</span>' : ""}</td><td>${html(item.code || "-")}</td><td>${html(item.category || "-")}</td><td class="money">${currency(item.priceCents)}</td><td>${item.type === "service" ? "Serviço" : item.stock}</td><td class="actionsCell"><button data-action="sellProduct" data-id="${item.id}" ${!item.active ? "disabled" : ""}>Vender</button>${state.user.role === "admin" ? `<button data-action="editProduct" data-id="${item.id}">Editar</button>${item.type === "stock" ? `<button data-action="stockProduct" data-id="${item.id}">Estoque</button>` : ""}` : ""}</td></tr>`), "Nenhum produto cadastrado.");
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
function render() { if (!state) return; renderMachines(); renderCash(); renderClients(); renderProducts(); renderSettings(); renderUsers(); renderReport(); }
function view(name) {
  currentView = name;
  for (const section of document.querySelectorAll(".view")) section.hidden = section.id !== `view-${name}`;
  for (const button of document.querySelectorAll("[data-view]")) button.classList.toggle("active", button.dataset.view === name);
  $("#pageTitle").textContent = { machines: "Atendimento", cash: "Caixa", clients: "Clientes", products: "Produtos", settings: "Tarifas", reports: "Relatórios", users: "Usuários" }[name];
  if (name === "reports") loadReport();
}
async function loadReport() { try { report = await api(`/api/reports?date=${encodeURIComponent($("#reportDate").value)}`); renderReport(); } catch (cause) { toast(cause.message); } }
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => view(button.dataset.view)));
$("#refreshButton").addEventListener("click", loadState);
$("#powerAllButton").addEventListener("click", async () => {
  if (!confirm("Ligar TODAS as estações (Wake-on-LAN)?")) return;
  try { const result = await api("/api/machines/power-all", {}); toast(`Wake-on-LAN enviado para ${result.count} estação(ões).`); await loadState(); } catch (cause) { toast(cause.message); }
});
$("#shutdownAllButton").addEventListener("click", async () => {
  if (!confirm("Desligar TODAS as estações?")) return;
  try { const result = await api("/api/machines/shutdown-all", {}); toast(`Desligando ${result.count} estação(ões).`); await loadState(); } catch (cause) { toast(cause.message); }
});
$("#clientSearch").addEventListener("input", renderClients);
$("#productSearch").addEventListener("input", renderProducts);
$("#reportDate").value = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
$("#reportDate").addEventListener("change", loadReport);

function field(name, title, type = "text", value = "", attrs = "") { return `<label>${title}<input name="${name}" type="${type}" value="${html(value)}" ${attrs}></label>`; }
function select(name, title, values, selected) { return `<label>${title}<select name="${name}">${values.map(([value, text]) => `<option value="${html(value)}" ${value === selected ? "selected" : ""}>${html(text)}</option>`).join("")}</select></label>`; }
function paymentField() { return select("paymentMethod", "Pagamento", options.map(value => [value, methodName[value]]), "cash"); }
function openModal(title, fields, onSubmit, submitText = "Salvar") {
  $("#modalTitle").textContent = title; $("#modalFields").innerHTML = fields; $("#modalSubmit").textContent = submitText;
  $("#modalSubmit").disabled = false;
  $("#modalError").hidden = true; modalSubmit = onSubmit; $("#formDialog").showModal();
  $("#modalFields input:not([type=hidden]), #modalFields select")?.focus();
}
$("#modalClose").addEventListener("click", () => $("#formDialog").close());
$("#modalCancel").addEventListener("click", () => $("#formDialog").close());
$("#modalForm").addEventListener("submit", async event => {
  event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
  const submit = $("#modalSubmit"); submit.disabled = true;
  try { await modalSubmit(values); $("#formDialog").close(); await loadState(); }
  catch (cause) { $("#modalError").textContent = cause.message; $("#modalError").hidden = false; }
  finally { submit.disabled = false; }
});
function openStartModal(machine, wait = null) {
  const clients = state.clients.filter(item => item.active).slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const free = state.machines.filter(item => !item.session && item.status !== "offline" && !item.maintenance && item.restoreSeq <= (item.appliedRestoreSeq || 0));
  const target = wait ? select("targetMachineId", "Estação", free.map(item => [item.id, item.name]), machine.id) : "";
  const fields = target + field("clientSearch", "Buscar cliente", "search", "", 'placeholder="Nome ou login" autocomplete="off"') + select("clientId", "Cliente", [["", "Avulso"], ...clients.map(item => [item.id, `${item.name}${item.creditSeconds ? ` · saldo ${formatCredit(item.creditSeconds)}` : ""}`])], "") + field("customer", "Nome avulso (opcional)", "text", wait?.name || "") + '<div class="presetRow" aria-label="Durações rápidas"><button type="button" data-preset="15">15 min</button><button type="button" data-preset="30">30 min</button><button type="button" data-preset="60">1 hora</button></div>' + field("minutes", "Minutos", "number", state.settings.defaultMinutes, 'min="1" max="1440" required') + select("billingMode", "Cobrança", [["postpaid", "Pagar ao sair"], ["prepaid", "Pagar agora"], ["credit", "Usar saldo do cliente"]], "postpaid") + paymentField() + '<p id="startQuote" class="quoteBox" role="status">Calculando valor...</p>';
  openModal(`Liberar ${machine.name}`, fields, values => api(`/api/machines/${encodeURIComponent(values.targetMachineId || machine.id)}/start`, { ...values, minutes: Number(values.minutes), waitId: wait?.id || null }), "Liberar estação");
  const form = $("#modalForm"), clientSelect = form.elements.clientId, search = form.elements.clientSearch, mode = form.elements.billingMode, minutes = form.elements.minutes;
  let quoteRun = 0;
  search.addEventListener("input", () => {
    const term = search.value.trim().toLocaleLowerCase("pt-BR");
    const selected = clientSelect.value;
    const visible = clients.filter(item => !term || `${item.name} ${item.login || ""}`.toLocaleLowerCase("pt-BR").includes(term));
    clientSelect.innerHTML = `<option value="">Avulso</option>${visible.map(item => `<option value="${html(item.id)}">${html(item.name)}${item.creditSeconds ? ` · saldo ${formatCredit(item.creditSeconds)}` : ""}</option>`).join("")}`;
    if (visible.some(item => item.id === selected)) clientSelect.value = selected;
    else if (term && visible.length === 1) clientSelect.value = visible[0].id;
    update();
  });
  async function update() {
    const credit = mode.value === "credit";
    const prepaid = mode.value === "prepaid";
    form.elements.paymentMethod.closest("label").hidden = !prepaid;
    form.elements.paymentMethod.disabled = !prepaid;
    form.elements.customer.closest("label").hidden = credit || !!clientSelect.value;
    const client = clients.find(item => item.id === clientSelect.value);
    if (credit && client && Number(minutes.value) > Math.floor(client.creditSeconds / 60)) minutes.value = Math.floor(client.creditSeconds / 60) || 1;
    const run = ++quoteRun;
    const count = Number(minutes.value);
    $("#modalSubmit").disabled = (credit && (!client || client.creditSeconds < count * 60)) || (prepaid && !state.cashShift);
    if (!Number.isInteger(count) || count < 1 || count > 1440) { $("#startQuote").textContent = "Informe de 1 a 1440 minutos."; return; }
    if (credit) { $("#startQuote").textContent = client ? `Saldo disponível: ${formatCredit(client.creditSeconds)}. Serão reservados ${count} min.` : "Selecione um cliente com saldo."; return; }
    if (prepaid && !state.cashShift) { $("#startQuote").textContent = "Abra o caixa antes de receber e liberar."; return; }
    try {
      const quote = await api(`/api/quote?minutes=${count}`);
      if (run === quoteRun) $("#startQuote").textContent = `${prepaid ? "Receber agora" : "Valor previsto"}: ${currency(quote.amountCents)} por ${count} min.`;
    } catch { if (run === quoteRun) $("#startQuote").textContent = "Valor indisponível. Confira a tarifa."; }
  }
  form.querySelectorAll("[data-preset]").forEach(button => button.addEventListener("click", () => { minutes.value = button.dataset.preset; update(); }));
  clientSelect.addEventListener("change", update); mode.addEventListener("change", update); minutes.addEventListener("input", update);
  update();
}
function openEndModal(machine, restart = false) {
  const session = machine.session;
  if (!session) return;
  const printDue = (state.openCharges || []).filter(row => row.sessionId === session.id).reduce((sum, row) => sum + row.amountCents - row.paidCents, 0);
  const estimated = printDue + (session.billingMode === "postpaid" ? machine.summary?.timeCents || 0 : 0);
  const methods = [["", "Deixar pendente"], ...options.map(value => [value, methodName[value]])];
  const fields = summaryHtml(machine) + `<p class="quoteBox">A receber agora: <strong>${currency(estimated)}</strong>${session.billingMode === "postpaid" ? " · valor final atualizado no encerramento" : ""}</p>` + (estimated ? select("paymentMethod", "Recebimento", methods, state.cashShift ? "cash" : "") : "");
  openModal(`${restart ? "Encerrar e reiniciar" : "Encerrar"} · ${machine.name}`, fields, values => api(`/api/machines/${encodeURIComponent(machine.id)}/end`, { restart, paymentMethod: values.paymentMethod || "" }), estimated && state.cashShift ? "Encerrar e receber" : "Encerrar estação");
  const method = $("#modalForm").elements.paymentMethod;
  if (method) method.addEventListener("change", () => { $("#modalSubmit").textContent = method.value ? "Encerrar e receber" : "Encerrar estação"; });
}
let saleCart = new Map();
let saleRef = "";
let saleMachine = null;
const salePrintPages = () => ({ bw: Math.max(0, Math.floor(Number($("#salePrintBW").value) || 0)), color: Math.max(0, Math.floor(Number($("#salePrintColor").value) || 0)) });
function renderSale() {
  const term = $("#saleSearch").value.trim().toLocaleLowerCase("pt-BR");
  const products = state.products.filter(item => item.active && (!term || `${item.name} ${item.code || ""}`.toLocaleLowerCase("pt-BR").includes(term))).slice(0, 8);
  $("#saleMatches").innerHTML = products.length ? products.map(item => `<button type="button" data-sale-add="${html(item.id)}" ${item.type === "stock" && (saleCart.get(item.id) || 0) >= item.stock ? "disabled" : ""}><span><strong>${html(item.name)}</strong><small>${html(item.code || item.category || "Produto")}${item.type === "stock" ? ` · ${item.stock} em estoque` : ""}</small></span><span>${currency(item.priceCents)}</span></button>`).join("") : '<p class="muted">Produto não encontrado.</p>';
  let total = 0;
  $("#saleCart").innerHTML = saleCart.size ? [...saleCart].map(([id, quantity]) => {
    const product = state.products.find(item => item.id === id);
    if (!product) return "";
    total += product.priceCents * quantity;
    return `<div class="cartRow"><span><strong>${html(product.name)}</strong><small>${quantity} × ${currency(product.priceCents)}</small></span><strong>${currency(product.priceCents * quantity)}</strong><button type="button" data-sale-remove="${html(id)}" aria-label="Remover uma unidade de ${html(product.name)}">−</button></div>`;
  }).join("") : '<p class="muted">Nenhum item no carrinho.</p>';
  const pages = saleMachine ? salePrintPages() : { bw: 0, color: 0 };
  total += pages.bw * state.settings.printBWCents + pages.color * state.settings.printColorCents;
  $("#saleTotal").textContent = currency(total);
  $("#saleSubmit").disabled = saleMachine ? !(saleCart.size || pages.bw || pages.color) : !saleCart.size || !state.cashShift;
  $("#saleError").hidden = true;
}
// Com machine: lanca o consumo na conta da estacao (cobrado ao encerrar), sem receber agora.
function openSale(productId = null, machine = null) {
  saleCart = new Map(); saleRef = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; saleMachine = machine;
  $("#saleSearch").value = ""; $("#salePrintBW").value = "0"; $("#salePrintColor").value = "0";
  $("#saleTitle").textContent = machine ? `Consumo · ${machine.name}` : "Nova venda";
  $("#saleSubtitle").textContent = machine ? "Os itens entram na conta da estação e são cobrados no encerramento." : "Adicione produtos e receba em uma operação.";
  $("#salePrintRow").hidden = !machine; $("#salePaymentLabel").hidden = !!machine;
  $("#saleSubmit").textContent = machine ? "Lançar na estação" : "Concluir venda";
  if (productId) saleCart.set(productId, 1);
  $("#saleDialog").showModal(); renderSale(); $("#saleSearch").focus();
  if (!machine && !state.cashShift) { $("#saleError").textContent = "Abra o caixa para registrar vendas."; $("#saleError").hidden = false; }
}
$("#quickSaleButton").addEventListener("click", () => openSale());
$("#saleClose").addEventListener("click", () => $("#saleDialog").close());
$("#saleCancel").addEventListener("click", () => $("#saleDialog").close());
$("#saleSearch").addEventListener("input", renderSale);
$("#salePrintBW").addEventListener("input", renderSale);
$("#salePrintColor").addEventListener("input", renderSale);
$("#saleSearch").addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const code = event.currentTarget.value.trim();
  const exact = state.products.find(item => item.active && item.code && item.code === code);
  const first = exact || state.products.find(item => item.active && item.name.toLocaleLowerCase("pt-BR").includes(code.toLocaleLowerCase("pt-BR")));
  if (first && (first.type !== "stock" || (saleCart.get(first.id) || 0) < first.stock)) { saleCart.set(first.id, (saleCart.get(first.id) || 0) + 1); event.currentTarget.value = ""; renderSale(); }
});
$("#saleDialog").addEventListener("click", event => {
  const add = event.target.closest("[data-sale-add]");
  const remove = event.target.closest("[data-sale-remove]");
  if (add) { const id = add.dataset.saleAdd; saleCart.set(id, (saleCart.get(id) || 0) + 1); $("#saleSearch").value = ""; renderSale(); $("#saleSearch").focus(); }
  if (remove) { const id = remove.dataset.saleRemove, count = saleCart.get(id) || 0; if (count <= 1) saleCart.delete(id); else saleCart.set(id, count - 1); renderSale(); }
});
$("#saleForm").addEventListener("submit", async event => {
  event.preventDefault();
  const submit = $("#saleSubmit");
  if (saleMachine) {
    const pages = salePrintPages();
    if (!saleCart.size && !pages.bw && !pages.color) return;
    submit.disabled = true;
    try {
      await api(`/api/machines/${encodeURIComponent(saleMachine.id)}/items`, { items: [...saleCart].map(([productId, quantity]) => ({ productId, quantity })), printBW: pages.bw, printColor: pages.color, ref: saleRef });
      $("#saleDialog").close(); await loadState(); toast(`Consumo lançado em ${saleMachine.name}.`);
    } catch (cause) { $("#saleError").textContent = cause.message; $("#saleError").hidden = false; submit.disabled = false; }
    return;
  }
  if (!saleCart.size || !state.cashShift) return;
  submit.disabled = true;
  try {
    await api("/api/sales", { items: [...saleCart].map(([productId, quantity]) => ({ productId, quantity })), paymentMethod: $("#salePayment").value, ref: saleRef });
    $("#saleDialog").close(); await loadState(); toast("Venda registrada.");
  } catch (cause) { $("#saleError").textContent = cause.message; $("#saleError").hidden = false; submit.disabled = false; }
});
function showPair(code) { $("#pairCode").textContent = code; $("#pairDialog").showModal(); }
$("#pairClose").addEventListener("click", () => $("#pairDialog").close());

$("#addMachineButton").addEventListener("click", () => openModal("Adicionar estação (manual)", field("id", "ID", "text", "", 'placeholder="pc-01" required pattern="[A-Za-z0-9_-]{2,32}"') + field("name", "Nome exibido", "text", "", 'placeholder="PC 01"'), async values => { const result = await api("/api/machines/register", values); showPair(result.pairingCode); }, "Adicionar"));
$("#addClientButton").addEventListener("click", () => openModal("Novo cliente", field("name", "Nome", "text", "", "required") + field("phone", "Telefone", "tel") + field("login", "Login (opcional, para entrar sozinho na estação)", "text", "", 'autocomplete="off"') + field("password", "Senha (se definir login)", "password", "", 'autocomplete="new-password"'), values => api("/api/clients", values)));
$("#addProductButton").addEventListener("click", () => openModal("Novo produto ou serviço", field("name", "Descrição", "text", "", "required") + field("code", "Código / barras") + field("category", "Categoria") + select("type", "Tipo", [["stock", "Produto com estoque"], ["service", "Serviço"]], "stock") + field("price", "Preço (R$)", "number", "", 'min="0.01" step="0.01" required') + field("stock", "Estoque inicial", "number", "0", 'min="0" required') + field("minStock", "Estoque mínimo", "number", "0", 'min="0" required'), values => api("/api/products", values)));
$("#addUserButton").addEventListener("click", () => openModal("Novo usuário", field("name", "Usuário", "text", "", "required") + field("password", "Senha inicial", "password", "", 'minlength="10" required') + select("role", "Perfil", [["attendant", "Atendente"], ["admin", "Administrador"]], "attendant"), values => api("/api/users", values)));
$("#settingsForm").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); values.autoRestoreOnTimeEnd = form.elements.autoRestoreOnTimeEnd.checked;
  try { await api("/api/settings", values); toast("Tarifas salvas."); await loadState(); } catch (cause) { toast(cause.message); }
});
$("#printersForm").addEventListener("submit", async event => {
  event.preventDefault(); const value = event.currentTarget.elements.printerShare.value.trim();
  const printers = value ? value.split(/[,;]/).map(item => item.trim()).filter(Boolean) : [];
  try { await api("/api/settings/printers", { printers }); toast("Impressora salva."); await loadState(); } catch (cause) { toast(cause.message); }
});
$("#regenerateKeyButton").addEventListener("click", async () => {
  if (!confirm("Gerar nova chave de instalação? As configurações baixadas deixam de funcionar.")) return;
  try { await api("/api/installer-config/regenerate", {}); toast("Chave regenerada."); } catch (cause) { toast(cause.message); }
});
$("#waitAddButton").addEventListener("click", async () => {
  const name = $("#waitName").value.trim(); if (!name) return;
  try { await api("/api/waitlist", { name }); $("#waitName").value = ""; await loadState(); } catch (cause) { toast(cause.message); }
});
$("#waitName").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); $("#waitAddButton").click(); } });
$("#monitorClose").addEventListener("click", () => { stopMonitor(); $("#monitorDialog").close(); });
$("#monitorDialog").addEventListener("close", stopMonitor);
$("#monitorImage").addEventListener("click", event => { const c = monitorCoords(event); if (c) sendMonitorInput({ type: "click", x: c.x, y: c.y }); });
$("#monitorImage").addEventListener("contextmenu", event => { event.preventDefault(); const c = monitorCoords(event); if (c) sendMonitorInput({ type: "rclick", x: c.x, y: c.y }); });
$("#monitorImage").addEventListener("mousemove", event => { const now = Date.now(); if (now - monitorLastMove < 250) return; monitorLastMove = now; const c = monitorCoords(event); if (c) sendMonitorInput({ type: "move", x: c.x, y: c.y }); });
document.querySelectorAll("#monitorBar button[data-mctrl]").forEach(button => button.addEventListener("click", async () => {
  const ctrl = button.dataset.mctrl;
  if (ctrl === "text") { const value = prompt("Texto a enviar para a estação:"); if (value) sendMonitorInput({ type: "text", value }); return; }
  if (["enter", "esc", "tab", "backspace", "delete", "up", "down", "left", "right"].includes(ctrl)) { sendMonitorInput({ type: "key", value: ctrl }); return; }
  try {
    if (ctrl === "restart") { await api(`/api/machines/${encodeURIComponent(monitorId)}/end`, { restart: true }); toast("Reiniciando..."); }
    else if (ctrl === "shutdown") { await api(`/api/machines/${encodeURIComponent(monitorId)}/shutdown`, {}); toast("Desligando..."); }
    else if (ctrl === "unlock") { await api(`/api/machines/${encodeURIComponent(monitorId)}/unlock`, {}); toast("Desbloqueando..."); }
    await loadState();
  } catch (cause) { toast(cause.message); }
}));
$("#downloadInstallerButton").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/installer-package");
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Falha ao gerar o pacote");
    const blob = await response.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "LanHouseManager-Estacoes.zip";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Pacote baixado. Extraia em cada estação e execute Instalar-Agente.bat.");
  } catch (cause) { toast(cause.message); }
});
$("#cashToggleButton").addEventListener("click", () => {
  if (!state.cashShift) openModal("Abrir caixa", field("opening", "Valor inicial em dinheiro (R$)", "number", "0.00", 'min="0" step="0.01" required'), values => api("/api/cash/open", values), "Abrir");
  else {
    openModal("Fechar caixa", `<p class="quoteBox">Dinheiro esperado: <strong>${currency(state.cashSummary?.expectedCashCents)}</strong></p>` + field("counted", "Dinheiro contado (R$)", "number", "", 'min="0" step="0.01" required') + '<p id="cashDifference" class="muted">Informe o valor contado para ver a diferença.</p>', values => api("/api/cash/close", values), "Fechar caixa");
    $("#modalForm").elements.counted.addEventListener("input", event => {
      const value = Number(event.currentTarget.value);
      $("#cashDifference").textContent = event.currentTarget.value === "" ? "Informe o valor contado para ver a diferença." : `Diferença: ${currency(Math.round(value * 100) - (state.cashSummary?.expectedCashCents || 0))}`;
    });
  }
});
$("#shiftBadge").addEventListener("click", () => state?.cashShift ? view("cash") : $("#cashToggleButton").click());
$("#cashAdjustButton").addEventListener("click", () => openModal("Entrada ou retirada", select("direction", "Operação", [["in", "Entrada"], ["out", "Retirada"]], "in") + field("amount", "Valor (R$)", "number", "", 'min="0.01" step="0.01" required') + field("reason", "Motivo", "text", "", "required"), values => api("/api/cash/adjust", values)));
$("#printSaleButton").addEventListener("click", () => openModal("Registrar impressão", field("pages", "Páginas", "number", "1", 'min="1" required') + select("color", "Tipo", [["false", "Preto e branco"], ["true", "Colorida"]], "false") + paymentField(), values => api("/api/print/sale", { ...values, color: values.color === "true" }), "Registrar"));

document.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]"); if (!button || !state) return;
  const action = button.dataset.action, id = button.dataset.id;
  const machine = state.machines.find(item => item.id === id);
  try {
    if (action === "start" && machine) {
      openStartModal(machine);
    } else if (action === "consume" && machine) {
      openSale(null, machine);
    } else if (action === "addTime" && machine) {
      openModal(`Adicionar tempo · ${machine.name}`, field("minutes", "Minutos", "number", "10", 'min="1" max="1440" required') + (machine.session?.billingMode === "prepaid" ? paymentField() : ""), values => api(`/api/machines/${encodeURIComponent(id)}/add-time`, { ...values, minutes: Number(values.minutes) }), "Adicionar");
    } else if (action === "reboot" && machine) {
      if (!confirm(`Reiniciar ${machine.name}?`)) return;
      await api(`/api/machines/${encodeURIComponent(id)}/reboot`, {});
      await loadState(); toast("Reiniciando a estação...");
    } else if (action === "shutdown" && machine) {
      if (!confirm(`Desligar ${machine.name}?`)) return;
      await api(`/api/machines/${encodeURIComponent(id)}/shutdown`, {});
      await loadState(); toast("Desligando a estação...");
    } else if (action === "power" && machine) {
      await api(`/api/machines/${encodeURIComponent(id)}/power`, {});
      await loadState(); toast("Wake-on-LAN enviado.");
    } else if (action === "waitRemove") {
      try { await api("/api/waitlist/remove", { id }); await loadState(); } catch (cause) { toast(cause.message); }
    } else if (action === "waitServe") {
      const wait = state.waitList.find(item => item.id === id);
      const free = state.machines.find(item => !item.session && item.status !== "offline" && !item.maintenance && item.restoreSeq <= (item.appliedRestoreSeq || 0));
      if (wait && free) openStartModal(free, wait);
    } else if (action === "move" && machine) {
      const free = state.machines.filter(m => m.id !== machine.id && !m.session && m.status !== "offline" && m.status !== "maintenance");
      if (!free.length) { toast("Nenhuma estação livre para receber o cliente."); return; }
      openModal(`Mover ${machine.name}`, select("targetId", "Estação de destino", free.map(m => [m.id, `${m.name} · ${m.id}`]), free[0].id), values => api(`/api/machines/${encodeURIComponent(id)}/move`, { targetId: values.targetId }), "Mover");
    } else if (action === "maintenance" && machine) {
      await api(`/api/machines/${encodeURIComponent(id)}/maintenance`, {});
      await loadState(); toast(machine.maintenance ? "Manutenção encerrada." : "Estação em manutenção.");
    } else if (action === "monitor" && machine) {
      openMonitor(machine);
    } else if (action === "summary" && machine) {
      openModal(`Resumo · ${machine.name}`, summaryHtml(machine), () => {}, "Fechar");
    } else if (action === "end" && machine) {
      openEndModal(machine);
    } else if (["lock", "unlock", "restart"].includes(action) && machine) {
      if (action === "restart") { openEndModal(machine, true); return; }
      await api(`/api/machines/${encodeURIComponent(id)}/${action === "restart" ? "end" : action}`, action === "restart" ? { restart: true } : {});
      await loadState(); toast("Comando enviado.");
    } else if (action === "rename" && machine) {
      openModal(`Renomear ${machine.name}`, field("name", "Nome exibido", "text", machine.name, "required") + field("id", "ID interno (opcional)", "text", machine.id, 'pattern="[A-Za-z0-9_-]{2,32}"'), values => api(`/api/machines/${encodeURIComponent(id)}/rename`, { name: values.name, id: values.id }), "Renomear");
    } else if (action === "remove" && machine) {
      if (!confirm(`Remover ${machine.name}?`)) return;
      await api(`/api/machines/${encodeURIComponent(id)}/remove`, {}); await loadState(); toast("Estação removida.");
    } else if (action === "pair" && machine) { const result = await api(`/api/machines/${encodeURIComponent(id)}/pair`, {}); showPair(result.pairingCode); }
    else if (action === "pay") {
      const charge = (state.openCharges || []).find(item => item.id === id); if (!charge) return;
      openModal(`Receber · ${charge.description}`, field("amount", "Valor (R$)", "number", ((charge.amountCents - charge.paidCents) / 100).toFixed(2), 'min="0.01" step="0.01" required') + paymentField(), values => api(`/api/charges/${id}/pay`, { amount: values.amount, method: values.paymentMethod }), "Receber");
    } else if (action === "editClient") {
      const client = state.clients.find(item => item.id === id); if (!client) return;
      openModal("Editar cliente", field("name", "Nome", "text", client.name, "required") + field("phone", "Telefone", "tel", client.phone) + field("login", "Login (para entrar sozinho na estação)", "text", client.login || "", 'autocomplete="off"') + field("password", "Nova senha (deixe vazio para manter)", "password", "", 'autocomplete="new-password"') + select("active", "Status", [["true", "Ativo"], ["false", "Inativo"]], String(client.active)), values => api(`/api/clients/${id}`, { ...values, active: values.active === "true" }));
    } else if (action === "rechargeClient") {
      const client = state.clients.find(item => item.id === id); if (!client) return;
      const ref = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      openModal(`Recarregar · ${client.name}`, field("amount", "Valor (R$)", "number", "", 'min="0.01" step="0.01" required') + paymentField(), values => api(`/api/clients/${id}/recharge`, { ...values, ref }), "Recarregar");
    } else if (action === "editProduct") {
      const product = state.products.find(item => item.id === id); if (!product) return;
      openModal("Editar item", field("name", "Descrição", "text", product.name, "required") + field("code", "Código", "text", product.code) + field("category", "Categoria", "text", product.category) + field("price", "Preço (R$)", "number", (product.priceCents / 100).toFixed(2), 'min="0.01" step="0.01" required') + field("minStock", "Estoque mínimo", "number", product.minStock || 0, 'min="0" required') + select("active", "Status", [["true", "Ativo"], ["false", "Inativo"]], String(product.active)), values => api(`/api/products/${id}/update`, { ...values, active: values.active === "true" }));
    } else if (action === "stockProduct") {
      openModal("Ajustar estoque", field("delta", "Quantidade (+ entrada / - saída)", "number", "", "required") + field("reason", "Motivo", "text", "", "required"), values => api(`/api/products/${id}/stock`, values));
    } else if (action === "sellProduct") {
      const product = state.products.find(item => item.id === id); if (!product) return;
      openSale(product.id);
    } else if (action === "userPassword") {
      openModal("Alterar senha", field("password", "Nova senha", "password", "", 'minlength="10" required'), values => api(`/api/users/${id}/password`, values), "Alterar");
    }
  } catch (cause) { toast(cause.message); }
});

// Impressoras do caixa usadas pela "Impressão Nexcafé": trocar aqui quando acabar a tinta de uma delas.
let printRouteLoaded = false;
async function loadPrintRoute(refresh = false) {
  printRouteLoaded = true;
  try {
    const result = await api(`/api/printers/local${refresh ? "?refresh=1" : ""}`);
    const fill = (select, current) => {
      const names = result.printers.includes(current) || !current ? result.printers : [current, ...result.printers];
      select.innerHTML = `<option value="">Escolha a impressora</option>${names.map(name => `<option value="${html(name)}" ${name === current ? "selected" : ""}>${html(name)}${name === current && !result.printers.includes(name) ? " (não encontrada)" : ""}</option>`).join("")}`;
    };
    fill($("#printBlack"), result.black);
    fill($("#printColor"), result.color);
    $("#printBlackPrice").value = ((result.blackCents || 0) / 100).toFixed(2);
    $("#printColorPrice").value = ((result.colorCents || 0) / 100).toFixed(2);
    const isAdmin = state && state.user.role === "admin";
    for (const id of ["#printBlackPrice", "#printColorPrice"]) { $(id).disabled = !isAdmin; $(id).title = isAdmin ? "" : "Somente o administrador altera preços"; }
  } catch (cause) {
    for (const id of ["#printBlack", "#printColor"]) $(id).innerHTML = `<option value="">${html(cause.message)}</option>`;
  }
}
$("#printRouteRefresh").addEventListener("click", () => loadPrintRoute(true));
$("#printRoute").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const payload = { black: $("#printBlack").value, color: $("#printColor").value };
    if (state && state.user.role === "admin") { payload.blackPrice = $("#printBlackPrice").value; payload.colorPrice = $("#printColorPrice").value; }
    const result = await api("/api/settings/print-route", payload);
    toast(`Impressoras salvas · P&B: ${result.black} (${currency(result.blackCents)}/pág) · Colorido: ${result.color} (${currency(result.colorCents)}/pág)`);
    loadState();
  } catch (cause) { toast(cause.message); }
});

init();
schedulePoll();
setInterval(tickClocks, 1000);
