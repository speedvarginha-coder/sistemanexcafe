const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createApp } = require("../server/app");

test("operacao completa: login, agente, tempo, caixa, produto e relatorio", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  let agentToken = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const payload = await response.json();
    return { status: response.status, payload, cookie: response.headers.get("set-cookie") };
  }
  try {
    assert.equal((await request("/api/state")).status, 401);
    assert.equal((await request("/api/setup", { name: "admin", password: "senha-teste-123" })).status, 201);
    const login = await request("/api/login", { name: "admin", password: "senha-teste-123" });
    assert.equal(login.status, 200);
    cookie = login.cookie.split(";")[0];
    const created = await request("/api/machines/register", { id: "pc-01", name: "PC 01" });
    assert.equal(created.status, 201);
    assert.equal((await request("/api/client/pc-01/command")).status, 401);
    const enrolled = await request("/api/agent/enroll", { id: "pc-01", name: "PC 01", code: created.payload.pairingCode });
    assert.equal(enrolled.status, 200);
    agentToken = enrolled.payload.token;
    assert.equal((await request("/api/agent/enroll", { id: "pc-01", code: created.payload.pairingCode })).status, 401);
    assert.equal((await request("/api/client/pc-01/command", undefined, agentToken)).status, 200);
    assert.equal((await request("/api/machines/pc-01/start", { minutes: 60, billingMode: "prepaid", paymentMethod: "cash" })).status, 409);
    assert.equal((await request("/api/cash/open", { opening: 10 })).status, 201);
    assert.equal((await request("/api/machines/pc-01/start", { minutes: 60, billingMode: "prepaid", paymentMethod: "cash" })).status, 200);
    let state = (await request("/api/state")).payload;
    assert.equal(state.charges[0].amountCents, 500);
    assert.equal(state.charges[0].paidCents, 500);
    assert.equal((await request("/api/machines/pc-01/end", {})).status, 200);
    state = (await request("/api/state")).payload;
    assert.equal(state.charges.length, 1, "pre-pago nao deve cobrar novamente ao encerrar");
    assert.equal(state.machines[0].restoreSeq, 1);
    assert.equal((await request("/api/client/pc-01/event", { title: "Restauracao executada", restoreSeq: 1 }, agentToken)).status, 200);
    state = (await request("/api/state")).payload;
    assert.equal(state.machines[0].appliedRestoreSeq, 1);

    assert.equal((await request("/api/machines/pc-01/start", { minutes: 30, billingMode: "postpaid" })).status, 200);
    assert.equal((await request("/api/machines/pc-01/end", {})).status, 200);
    state = (await request("/api/state")).payload;
    assert.equal(state.charges[0].paidCents, 0);
    assert.equal(state.charges[0].amountCents, 300);
    assert.equal((await request(`/api/charges/${state.charges[0].id}/pay`, { amount: 3.00, method: "pix" })).status, 200);
    const product = await request("/api/products", { name: "Agua", code: "123", category: "Bebidas", type: "stock", price: 3, stock: 2 });
    assert.equal(product.status, 201);
    assert.equal((await request(`/api/products/${product.payload.product.id}/sell`, { quantity: 1, paymentMethod: "cash" })).status, 200);
    assert.equal((await request("/api/print/sale", { pages: 2, color: false, paymentMethod: "cash" })).status, 201);
    state = (await request("/api/state")).payload;
    assert.equal(state.products[0].stock, 1);
    assert.equal(state.charges.length, 4);
    const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const report = await request(`/api/reports?date=${date}`);
    assert.equal(report.payload.salesCents, 1300);
    assert.equal(report.payload.receivedCents, 1300);
    assert.equal((await request("/api/campaigns", { name: "Sabado da Lan", code: "sab ado", channel: "WhatsApp" })).status, 201);
    assert.equal((await request("/api/campaigns", { name: "Outra", code: "SABADO" })).status, 409, "codigo repetido");
    const mkClient = (await request("/api/clients", { name: "Cliente Google", origin: "Google" })).payload.client;
    assert.equal(mkClient.origin, "Google");
    assert.equal((await request("/api/sales", { items: [{ name: "Combo Curriculo", unitPrice: 18, quantity: 1 }], paymentMethod: "pix", campaign: "sabado", origin: "Instagram", ref: "mk-1" })).status, 201);
    assert.equal((await request("/api/sales", { items: [{ name: "Impressao", unitPrice: 5, quantity: 1 }], paymentMethod: "cash", clientId: mkClient.id, ref: "mk-2" })).status, 201);
    const mk = (await request("/api/marketing/results")).payload;
    assert.equal(mk.campaigns.find(c => c.code === "SABADO").salesCents, 1800);
    assert.equal(mk.origins.find(o => o.origin === "Instagram").salesCents, 1800);
    assert.equal(mk.origins.find(o => o.origin === "Google").salesCents, 500, "origem vem do cadastro do cliente");
    assert.equal(mk.origins.find(o => o.origin === "Google").newClients, 1);
    assert.ok((await request("/api/state")).payload.campaigns.some(c => c.code === "SABADO"), "campanha ativa aparece no caixa");
    assert.equal((await request("/api/campaigns", { name: "Consignado INSS outubro", code: "INSS10", business: "financeira" })).status, 201);
    assert.equal((await request("/api/leads", { name: "Maria", product: "Consignado INSS" })).status, 400, "telefone obrigatorio");
    const lead = (await request("/api/leads", { name: "Maria", phone: "35999990000", product: "Consignado INSS", source: "Serviço da loja", sourceDetail: "Meu INSS senha", campaign: "INSS10" })).payload.lead;
    assert.equal(lead.stage, "new");
    // Mensagem colada do WhatsApp vinda do site: origem, cidade, guia e produto saem dela; escolha manual prevalece.
    const doGuia = (await request("/api/leads", { name: "Ana", phone: "35988880000", product: "", source: "", message: "Olá! Li o guia sobre Como antecipar o Saque-Aniversário do FGTS em Três Pontas com pagamento via Pix no site e gostaria de fazer uma simulação gratuita." })).payload.lead;
    assert.deepEqual([doGuia.source, doGuia.city, doGuia.product], ["Site", "Três Pontas", "Antecipação FGTS"]);
    assert.match(doGuia.sourceDetail, /^Guia: Como antecipar/);
    const daCidade = (await request("/api/leads", { name: "Rui", phone: "35977770000", product: "Consignado CLT", source: "", message: "Olá, sou de Boa Esperança e quero simular um empréstimo." })).payload.lead;
    assert.deepEqual([daCidade.source, daCidade.city, daCidade.product], ["Site", "Boa Esperança", "Consignado CLT"]);
    const semSite = (await request("/api/leads", { name: "Lia", phone: "35966660000", product: "", source: "", message: "oi, quero saber de empréstimo" })).payload.lead;
    assert.deepEqual([semSite.source, semSite.city], ["Outro", ""]);
    assert.equal((await request(`/api/leads/${semSite.id}`, { city: "Alfenas" })).payload.lead.city, "Alfenas");
    assert.equal((await request(`/api/leads/${lead.id}`, { stage: "won" })).status, 400, "contrato exige comissao");
    assert.equal((await request(`/api/leads/${lead.id}`, { stage: "won", commission: "250" })).payload.lead.commissionCents, 25000);
    const mkFin = (await request("/api/marketing/results")).payload;
    assert.equal(mkFin.financeira.won, 1);
    assert.equal(mkFin.financeira.commissionCents, 25000);
    assert.equal(mkFin.financeira.fromStoreWon, 1);
    assert.equal(mkFin.campaigns.find(c => c.code === "INSS10").commissionCents, 25000);
    assert.equal((await request(`/api/leads/${lead.id}`, { stage: "proposal" })).payload.lead.stage, "proposal");
    assert.equal((await request("/api/marketing/results")).payload.financeira.commissionCents, 0, "desfazer contrato tira a comissao");
    const close = await request("/api/cash/close", { counted: 25 });
    assert.equal(close.status, 200);
    assert.equal(close.payload.shift.closingExpectedCents, 2500);
    const summary = (await request(`/api/cash/shifts/${close.payload.shift.id}/summary`)).payload;
    assert.equal(summary.receivedCents, 3600);
    assert.equal(summary.byMethod.pix, 2100);
    assert.equal(summary.byMethod.cash, 1500);
    assert.equal(summary.byKind["Impressões"], 200);
    assert.equal(summary.differenceCents, 0);
    const plan = (await request("/api/actions")).payload;
    assert.ok(Array.isArray(plan.suggestions) && plan.suggestions.length > 0, "plano traz sugestoes");
    assert.ok(plan.suggestions.every(s => s.key && s.title && s.why && s.how), "sugestao completa");
    const planItem = await request("/api/actions", { title: "Placa de precos no balcao", area: "Precos", due: "2026-10-05" });
    assert.equal(planItem.status, 201);
    assert.equal((await request(`/api/actions/${planItem.payload.action.id}`, { status: "done" })).payload.action.status, "done");
    const again = plan.suggestions[0];
    const first = await request("/api/actions", again);
    assert.ok(first.status === 201 || first.status === 409);
    assert.equal((await request("/api/actions", again)).status, 409, "mesma sugestao nao entra duas vezes");
    const imported = await request("/api/actions/template", { key: "outubro-2026" });
    assert.equal(imported.status, 200);
    const plan2 = (await request("/api/actions")).payload;
    assert.equal(plan2.goals.length, 4, "metas semanais de outubro");
    assert.ok(plan2.goals.every(g => typeof g.soldCents === "number" && g.status), "progresso da meta");
    assert.ok(plan2.templates.find(t => t.key === "outubro-2026").imported);
    const combos = plan2.actions.find(a => a.key === "ticket-combos");
    assert.ok(combos.steps.length >= 5 && combos.metric === "ticket");
    const stepped = (await request(`/api/actions/${combos.id}`, { steps: combos.steps.map((s, i) => ({ text: s.text, done: i === 0 })), status: "done" })).payload.action;
    assert.equal(stepped.steps[0].done, true);
    const measured = (await request("/api/actions")).payload.actions.find(a => a.id === combos.id);
    assert.equal(measured.effect.metric, "ticket");
    assert.equal(measured.effect.daysMeasured, 1);
    assert.equal((await request("/api/actions/template", { key: "outubro-2026" })).payload.added, 0, "importar de novo nao duplica");
    assert.equal(fs.existsSync(path.join(dataDir, "db.json")), true);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("migra dados antigos sem descartar maquinas e restringe atendente", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-migrate-"));
  const legacy = {
    version: 1,
    settings: { defaultMinutes: 45, autoRestoreOnTimeEnd: true },
    machines: { "pc-02": { id: "pc-02", name: "PC 02", locked: true, session: null, restoreSeq: 0, restartSeq: 0 } },
    events: []
  };
  fs.writeFileSync(path.join(dataDir, "db.json"), JSON.stringify(legacy));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(route, data, cookie = "") {
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers: { cookie, ...(data === undefined ? {} : { "content-type": "application/json", origin: base }) }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie") };
  }
  try {
    assert.equal((await call("/api/setup", { name: "admin", password: "senha-teste-123" })).status, 201);
    const adminLogin = await call("/api/login", { name: "admin", password: "senha-teste-123" });
    const adminCookie = adminLogin.cookie.split(";")[0];
    let state = await call("/api/state", undefined, adminCookie);
    assert.equal(state.body.machines[0].id, "pc-02");
    assert.equal(state.body.settings.defaultMinutes, 45);
    assert.equal(fs.readdirSync(dataDir).some(name => name.includes("antes-v2")), true);
    assert.equal((await call("/api/users", { name: "atendente", password: "senha-teste-456", role: "attendant" }, adminCookie)).status, 201);
    const employeeLogin = await call("/api/login", { name: "atendente", password: "senha-teste-456" });
    const employeeCookie = employeeLogin.cookie.split(";")[0];
    assert.equal((await call("/api/settings", { defaultMinutes: 10, hourPrice: 2, printBW: 1, printColor: 2 }, employeeCookie)).status, 403);
    assert.equal((await call("/api/products", { name: "Teste", price: 2 }, employeeCookie)).status, 403);
    state = await call("/api/state", undefined, employeeCookie);
    assert.equal(state.body.users.length, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("exige origem nas mutacoes, limita tentativas de login e restringe fechamento de caixa", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-sec-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function raw(route, data, headers = {}) {
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, body: await response.json().catch(() => ({})), cookie: response.headers.get("set-cookie") };
  }
  try {
    assert.equal((await raw("/api/setup", { name: "admin", password: "senha-teste-123" })).status, 201);

    const login = await raw("/api/login", { name: "admin", password: "senha-teste-123" }, { origin: base });
    assert.equal(login.status, 200);
    const adminCookie = login.cookie.split(";")[0];

    assert.equal((await raw("/api/machines/register", { id: "pc-01", name: "PC 01" }, { cookie: adminCookie })).status, 403, "mutacao sem origem deve falhar");
    assert.equal((await raw("/api/machines/register", { id: "pc-01", name: "PC 01" }, { cookie: adminCookie, origin: "http://evil.example" })).status, 403, "mutacao com origem externa deve falhar");
    assert.equal((await raw("/api/machines/register", { id: "pc-01", name: "PC 01" }, { cookie: adminCookie, origin: base })).status, 201);

    const attendant = await raw("/api/users", { name: "atendente", password: "senha-teste-456", role: "attendant" }, { origin: base, cookie: adminCookie });
    assert.equal(attendant.status, 201);
    const empLogin = await raw("/api/login", { name: "atendente", password: "senha-teste-456" }, { origin: base });
    const empCookie = empLogin.cookie.split(";")[0];
    assert.equal((await raw("/api/cash/open", { opening: 5 }, { origin: base, cookie: empCookie })).status, 201);
    assert.equal((await raw("/api/cash/close", { counted: 5 }, { origin: base, cookie: empCookie })).status, 403, "atendente nao pode fechar caixa");
    assert.equal((await raw("/api/cash/close", { counted: 5 }, { origin: base, cookie: adminCookie })).status, 200);

    for (let i = 0; i < 8; i++) {
      const bad = await raw("/api/login", { name: "admin", password: "senha-errada-1" }, { origin: base });
      assert.equal(bad.status, 401);
    }
    assert.equal((await raw("/api/login", { name: "admin", password: "senha-errada-1" }, { origin: base })).status, 429, "oito falhas devem bloquear por 15 minutos");
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("instalador por chave: descobre servidor, cadastra por chave e configura impressora", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-install-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function raw(route, data, headers = {}) {
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, body: await response.json().catch(() => ({})), cookie: response.headers.get("set-cookie") };
  }
  try {
    assert.equal((await raw("/api/setup", { name: "admin", password: "senha-teste-123" })).status, 201);
    const login = await raw("/api/login", { name: "admin", password: "senha-teste-123" }, { origin: base });
    const adminCookie = login.cookie.split(";")[0];

    assert.equal((await raw("/api/settings/printers", { printers: ["\\\\BALCAO\\Impressora"] }, { origin: base, cookie: adminCookie })).status, 200);

    const config = await raw("/api/installer-config", undefined, { cookie: adminCookie });
    assert.equal(config.status, 200);
    assert.ok(config.body.installKey, "deve conter a chave de instalacao");
    assert.match(config.body.serverUrl, /^http:\/\//);
    assert.deepEqual(config.body.printers, ["\\\\BALCAO\\Impressora"]);
    assert.equal((await raw("/api/machines/register", { id: "tempname", name: "Maquina - 11" }, { origin: base, cookie: adminCookie })).status, 201);
    const packageResponse = await fetch(base + "/api/installer-package", { headers: { cookie: adminCookie } });
    assert.equal(packageResponse.status, 200);
    assert.match(packageResponse.headers.get("content-type"), /application\/zip/);
    const zip = Buffer.from(await packageResponse.arrayBuffer());
    const packed = {};
    for (let offset = 0; zip.readUInt32LE(offset) === 0x04034b50;) {
      const size = zip.readUInt32LE(offset + 18);
      const nameLength = zip.readUInt16LE(offset + 26);
      const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
      packed[name] = zip.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size);
      offset += 30 + nameLength + size;
    }
    assert.ok(packed["LanHouseAgent.ps1"]);
    assert.ok(packed["Instalar-Agente.bat"]);
    assert.ok(packed["Instalar-Agente.ps1"]);
    assert.ok(packed["Capturar-Padrao.ps1"]);
    assert.ok(packed["Verificar-Agente.bat"]);
    assert.ok(!JSON.parse(packed["install-config.json"].toString()).users, "perfil deve ser escolhido na estacao");
    assert.equal(JSON.parse(packed["install-config.json"].toString()).installKey, config.body.installKey);
    assert.equal(JSON.parse(packed["install-config.json"].toString()).stationIds["11"], "tempname");

    assert.equal((await raw("/api/agent/enroll-by-key", { key: "chave-errada", id: "pc-05", name: "PC 05" })).status, 401);
    const enrolled = await raw("/api/agent/enroll-by-key", { key: config.body.installKey, id: "pc-05", name: "PC 05" });
    assert.equal(enrolled.status, 200);
    assert.ok(enrolled.body.token);
    assert.equal((await raw("/api/client/pc-05/command", undefined, { authorization: `Bearer ${enrolled.body.token}` })).status, 200);

    const attendant = await raw("/api/users", { name: "atendente", password: "senha-teste-456", role: "attendant" }, { origin: base, cookie: adminCookie });
    assert.equal(attendant.status, 201);
    const empLogin = await raw("/api/login", { name: "atendente", password: "senha-teste-456" }, { origin: base });
    assert.equal((await raw("/api/installer-config", undefined, { cookie: empLogin.cookie.split(";")[0] })).status, 403, "config do instalador e exclusiva do admin");
    assert.equal((await fetch(base + "/api/installer-package", { headers: { cookie: empLogin.cookie.split(";")[0] } })).status, 403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("impressao cobrada: agente solicita, cliente confirma e gera cobranca", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-print-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function raw(route, data, headers = {}) {
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, body: await response.json().catch(() => ({})), cookie: response.headers.get("set-cookie") };
  }
  try {
    assert.equal((await raw("/api/setup", { name: "admin", password: "senha-teste-123" })).status, 201);
    const login = await raw("/api/login", { name: "admin", password: "senha-teste-123" }, { origin: base });
    const adminCookie = login.cookie.split(";")[0];
    const config = await raw("/api/installer-config", undefined, { cookie: adminCookie });
    const enrolled = await raw("/api/agent/enroll-by-key", { key: config.body.installKey, id: "pc-09", name: "PC 09" });
    const token = enrolled.body.token;
    const auth = { authorization: `Bearer ${token}` };

    const req = await raw("/api/client/pc-09/print-request", { pages: 3, color: false, printer: "HP432" }, auth);
    assert.equal(req.status, 200);
    assert.equal(req.body.pages, 3);
    assert.equal(req.body.amountCents, 300, "3 paginas P&B a R$ 1,00 = R$ 3,00");

    const statePending = (await raw("/api/state", undefined, { cookie: adminCookie })).body;
    assert.equal(statePending.printJobs[0].state, "pending");

    assert.equal((await raw("/api/client/pc-09/print-confirm", { printId: req.body.printId }, auth)).status, 200);

    const stateDone = (await raw("/api/state", undefined, { cookie: adminCookie })).body;
    assert.equal(stateDone.printJobs[0].state, "confirmed");
    assert.equal(stateDone.charges[0].kind, "print");
    assert.equal(stateDone.charges[0].amountCents, 300);
    assert.equal(stateDone.charges[0].paidCents, 0, "impressao confirmada fica pendente para o balcao receber");
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("restauracao pendente bloqueia nova liberacao (evita o pisca-pisca)", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-restore-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, payload: await response.json(), cookie: response.headers.get("set-cookie") };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    const login = await request("/api/login", { name: "admin", password: "senha-teste-123" });
    cookie = login.cookie.split(";")[0];
    const created = await request("/api/machines/register", { id: "pc-20", name: "PC 20" });
    const enrolled = await request("/api/agent/enroll", { id: "pc-20", name: "PC 20", code: created.payload.pairingCode });
    const agentToken = enrolled.payload.token;
    assert.equal((await request("/api/client/pc-20/command", undefined, agentToken)).status, 200);
    await request("/api/cash/open", { opening: 0 });
    assert.equal((await request("/api/machines/pc-20/start", { minutes: 30, billingMode: "postpaid" })).status, 200);
    assert.equal((await request("/api/machines/pc-20/end", {})).status, 200);
    const blocked = await request("/api/machines/pc-20/start", { minutes: 30, billingMode: "postpaid" });
    assert.equal(blocked.status, 409, "nao pode liberar com restauracao pendente");
    assert.match(blocked.payload.error, /Restauracao pendente/);
    assert.equal((await request("/api/client/pc-20/event", { title: "Restauracao executada", restoreSeq: 1 }, agentToken)).status, 200);
    assert.equal((await request("/api/machines/pc-20/start", { minutes: 30, billingMode: "postpaid" })).status, 200, "apos confirmar a restauracao, libera");
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("login do cliente por saldo: recarga, uso exclusivo e devolucao do tempo", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-credit-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, payload: await response.json(), cookie: response.headers.get("set-cookie") };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    const login = await request("/api/login", { name: "admin", password: "senha-teste-123" });
    cookie = login.cookie.split(";")[0];
    await request("/api/cash/open", { opening: 0 });
    const created = await request("/api/clients", { name: "Joao", login: "joao", password: "1234" });
    assert.equal(created.status, 201);
    assert.equal(created.payload.client.login, "joao");
    assert.equal(created.payload.client.creditSeconds, 0);
    const clientId = created.payload.client.id;

    const rec = await request(`/api/clients/${clientId}/recharge`, { amount: 15, paymentMethod: "cash", ref: "r1" });
    assert.equal(rec.status, 201);
    assert.equal(rec.payload.secondsAdded, 10800, "R$15 a R$5/h = 3h = 10800s");
    assert.equal(rec.payload.client.creditSeconds, 10800);
    const rec2 = await request(`/api/clients/${clientId}/recharge`, { amount: 15, paymentMethod: "cash", ref: "r1" });
    assert.equal(rec2.payload.duplicate, true, "mesma ref nao soma de novo");
    assert.equal(rec2.payload.client.creditSeconds, 10800);

    const m1 = await request("/api/machines/register", { id: "pc-30", name: "PC 30" });
    const e1 = await request("/api/agent/enroll", { id: "pc-30", name: "PC 30", code: m1.payload.pairingCode });
    const t1 = e1.payload.token;
    await request("/api/client/pc-30/command", undefined, t1);
    const m2 = await request("/api/machines/register", { id: "pc-31", name: "PC 31" });
    const e2 = await request("/api/agent/enroll", { id: "pc-31", name: "PC 31", code: m2.payload.pairingCode });
    const t2 = e2.payload.token;
    await request("/api/client/pc-31/command", undefined, t2);

    const cl = await request("/api/client/pc-30/login", { login: "joao", password: "1234" }, t1);
    assert.equal(cl.status, 200, "login do cliente funciona");
    assert.equal(cl.payload.clientName, "Joao");

    const busy = await request("/api/client/pc-31/login", { login: "joao", password: "1234" }, t2);
    assert.equal(busy.status, 409, "nao pode entrar em duas maquinas ao mesmo tempo");

    await request("/api/machines/pc-30/end", {});
    const after = (await request("/api/state")).payload.clients.find(c => c.id === clientId);
    assert.ok(after.creditSeconds > 10700 && after.creditSeconds <= 10800, "devolveu o tempo restante (" + after.creditSeconds + ")");
    assert.equal((await request("/api/client/pc-30/login", { login: "joao", password: "1234" }, t1)).status, 409, "cliente nao entra durante a restauracao");
    await request("/api/machines/pc-31/maintenance", {});
    assert.equal((await request("/api/client/pc-31/login", { login: "joao", password: "1234" }, t2)).status, 409, "cliente nao entra durante manutencao");
    assert.equal((await request("/api/client/pc-31/login", { login: "joao", password: "errada" }, t2)).status, 401);
    // Oito erros seguidos na mesma estacao travam o login dela, mesmo com a senha certa.
    for (let i = 0; i < 7; i++) assert.equal((await request("/api/client/pc-31/login", { login: "joao", password: "errada" }, t2)).status, 401);
    assert.equal((await request("/api/client/pc-31/login", { login: "joao", password: "1234" }, t2)).status, 429, "estacao travada apos 8 senhas erradas");
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("tabela de tempo arredondada para cima de R$0,50: minimo R$3,00 ate 15 min, 1 hora R$5,00", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-price-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, payload: await response.json(), cookie: response.headers.get("set-cookie") };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    const login = await request("/api/login", { name: "admin", password: "senha-teste-123" });
    cookie = login.cookie.split(";")[0];
    const created = await request("/api/machines/register", { id: "pc-01", name: "PC 01" });
    const enrolled = await request("/api/agent/enroll", { id: "pc-01", name: "PC 01", code: created.payload.pairingCode });
    const token = enrolled.payload.token;
    await request("/api/client/pc-01/command", undefined, token);
    await request("/api/cash/open", { opening: 0 });

    const startFor = async (minutes, expectedCents) => {
      assert.equal((await request("/api/machines/pc-01/start", { minutes, billingMode: "prepaid", paymentMethod: "cash" })).status, 200);
      const state = (await request("/api/state")).payload;
      assert.equal(state.charges[0].amountCents, expectedCents, `${minutes} min custa ${expectedCents}`);
      await request("/api/machines/pc-01/end", {});
      const after = (await request("/api/state")).payload.machines[0];
      await request("/api/client/pc-01/event", { title: "Restauracao executada", restoreSeq: after.restoreSeq }, token);
    };

    await startFor(10, 300);
    await startFor(15, 300);
    await startFor(19, 350);
    await startFor(30, 400);
    await startFor(60, 500);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("ligar e desligar estacoes: shutdown, MAC e wake-on-lan", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-power-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, payload: await response.json(), cookie: response.headers.get("set-cookie") };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    const login = await request("/api/login", { name: "admin", password: "senha-teste-123" });
    cookie = login.cookie.split(";")[0];
    const created = await request("/api/machines/register", { id: "pc-01", name: "PC 01" });
    const enrolled = await request("/api/agent/enroll", { id: "pc-01", name: "PC 01", code: created.payload.pairingCode });
    const token = enrolled.payload.token;

    assert.equal((await request("/api/machines/pc-01/power", {})).status, 409, "sem MAC nao liga");
    await request("/api/client/pc-01/command?mac=AA-BB-CC-DD-EE-FF", undefined, token);
    let state = (await request("/api/state")).payload;
    assert.equal(state.machines[0].mac, "aa:bb:cc:dd:ee:ff");
    assert.equal((await request("/api/machines/pc-01/power", {})).status, 200, "com MAC liga (WOL)");

    assert.equal((await request("/api/machines/pc-01/shutdown", {})).status, 200);
    state = (await request("/api/state")).payload;
    assert.equal(state.machines[0].shutdownSeq, 1);
    assert.equal((await request("/api/client/pc-01/event", { title: "Desligamento", shutdownSeq: 1 }, token)).status, 200);
    state = (await request("/api/state")).payload;
    assert.equal(state.machines[0].appliedShutdownSeq, 1);
    const all = (await request("/api/machines/shutdown-all", {})).payload;
    assert.equal(all.count, 1, "maquina conectada e livre recebe o desligamento");
    assert.equal((await request("/api/state")).payload.machines[0].shutdownSeq, 2);
    assert.equal((await request("/api/machines/pc-01/start", { minutes: 10, billingMode: "postpaid" })).status, 200);
    const busy = (await request("/api/machines/shutdown-all", {})).payload;
    assert.equal(busy.count, 0, "maquina em uso nao desliga");
    assert.deepEqual(busy.inUse, [state.machines[0].name]);
    assert.equal((await request("/api/machines/power-all", {})).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("mover sessao, manutencao e lista de espera", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-move-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, payload: await response.json(), cookie: response.headers.get("set-cookie") };
  }
  const online = async id => {
    const created = await request("/api/machines/register", { id, name: id });
    const enrolled = await request("/api/agent/enroll", { id, name: id, code: created.payload.pairingCode });
    await request(`/api/client/${id}/command`, undefined, enrolled.payload.token);
  };
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    const login = await request("/api/login", { name: "admin", password: "senha-teste-123" });
    cookie = login.cookie.split(";")[0];
    await online("pc-01"); await online("pc-02"); await online("pc-03");
    await request("/api/cash/open", { opening: 0 });

    assert.equal((await request("/api/machines/pc-01/start", { minutes: 60, billingMode: "postpaid" })).status, 200);
    assert.equal((await request("/api/machines/pc-01/move", { targetId: "pc-02" })).status, 200);
    let state = (await request("/api/state")).payload;
    const pc01 = state.machines.find(m => m.id === "pc-01");
    const pc02 = state.machines.find(m => m.id === "pc-02");
    assert.equal(pc01.session, null, "origem fica sem sessao");
    assert.ok(pc02.session, "destino recebe a sessao");
    assert.equal(pc01.restoreSeq, 1, "origem pede restauracao");

    assert.equal((await request("/api/machines/pc-03/maintenance", {})).status, 200);
    state = (await request("/api/state")).payload;
    assert.equal(state.machines.find(m => m.id === "pc-03").status, "maintenance");
    assert.equal((await request("/api/machines/pc-03/start", { minutes: 30, billingMode: "postpaid" })).status, 409, "nao libera em manutencao");

    assert.equal((await request("/api/waitlist", { name: "Ana" })).status, 201);
    state = (await request("/api/state")).payload;
    assert.equal(state.waitList.length, 1);
    assert.equal(state.waitList[0].name, "Ana");
    assert.equal((await request("/api/waitlist/remove", { id: state.waitList[0].id })).status, 200);
    state = (await request("/api/state")).payload;
    assert.equal(state.waitList.length, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("monitoramento remoto: tela e entrada", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-screen-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, payload: await response.json(), cookie: response.headers.get("set-cookie") };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    const login = await request("/api/login", { name: "admin", password: "senha-teste-123" });
    cookie = login.cookie.split(";")[0];
    const created = await request("/api/machines/register", { id: "pc-01", name: "PC 01" });
    const enrolled = await request("/api/agent/enroll", { id: "pc-01", name: "PC 01", code: created.payload.pairingCode });
    const token = enrolled.payload.token;
    await request("/api/client/pc-01/command", undefined, token);

    const fakeImage = "A".repeat(200);
    assert.equal((await request("/api/client/pc-01/screen", { image: fakeImage, width: 1920, height: 1080 }, token)).status, 200);
    let shot = (await request("/api/machines/pc-01/screen")).payload;
    assert.equal(shot.screen.width, 1920);
    assert.equal(shot.screen.image, fakeImage);

    assert.equal((await request("/api/machines/pc-01/input", { event: { type: "click", x: 10, y: 20 } })).status, 200);
    let queue = (await request("/api/client/pc-01/input", undefined, token)).payload;
    assert.equal(queue.events.length, 1);
    assert.equal(queue.events[0].type, "click");
    queue = (await request("/api/client/pc-01/input", undefined, token)).payload;
    assert.equal(queue.events.length, 0, "fila e consumida uma vez");
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("auto-atualizacao: servidor entrega o script do agente com hash", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-script-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, payload: await response.json(), cookie: response.headers.get("set-cookie") };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    const login = await request("/api/login", { name: "admin", password: "senha-teste-123" });
    cookie = login.cookie.split(";")[0];
    const created = await request("/api/machines/register", { id: "pc-01", name: "PC 01" });
    const enrolled = await request("/api/agent/enroll", { id: "pc-01", name: "PC 01", code: created.payload.pairingCode });
    const token = enrolled.payload.token;

    const file = path.join(__dirname, "..", "client-agent", "LanHouseAgent.ps1");
    const expected = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    const command = (await request("/api/client/pc-01/command", undefined, token)).payload;
    assert.equal(command.scriptHash, expected);
    const script = (await request("/api/client/pc-01/script", undefined, token)).payload;
    assert.equal(script.hash, expected);
    assert.ok(script.script.length > 15000);
    assert.equal((await request("/api/client/pc-01/script")).status, 401, "script exige token do agente");
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("liberacao confirma o agente, usa saldo e recebe ao encerrar", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-flow-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = { ...(cookie ? { cookie } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) };
    if (data !== undefined) Object.assign(headers, { "content-type": "application/json", origin: base });
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, payload: await response.json(), cookie: response.headers.get("set-cookie") };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    cookie = (await request("/api/login", { name: "admin", password: "senha-teste-123" })).cookie.split(";")[0];
    const created = await request("/api/machines/register", { id: "pc-01", name: "PC 01" });
    const token = (await request("/api/agent/enroll", { id: "pc-01", name: "PC 01", code: created.payload.pairingCode })).payload.token;
    await request("/api/client/pc-01/command", undefined, token);
    assert.equal((await request("/api/machines/pc-01/unlock", {})).status, 409, "sem sessao nao pode liberar o desktop");
    await request("/api/cash/open", { opening: 0 });
    const client = (await request("/api/clients", { name: "Cliente teste" })).payload.client;
    assert.equal((await request(`/api/clients/${client.id}/recharge`, { amount: 5, paymentMethod: "pix", ref: "credito-teste" })).status, 201);
    assert.equal((await request("/api/machines/pc-01/start", { minutes: 30, billingMode: "credit", clientId: client.id })).status, 200);
    let state = (await request("/api/state")).payload;
    const sessionId = state.machines[0].session.id;
    assert.equal(state.machines[0].openedSessionId, null);
    assert.equal((await request("/api/client/pc-01/event", { title: "Acesso liberado", openedSessionId: sessionId }, token)).status, 200);
    state = (await request("/api/state")).payload;
    assert.equal(state.machines[0].openedSessionId, sessionId);
    assert.equal((await request("/api/machines/pc-01/end", {})).status, 200);
    state = (await request("/api/state")).payload;
    assert.equal(state.machines[0].openedSessionId, null);
    assert.equal(state.openCharges.length, 0);
    assert.ok(state.clients.find(row => row.id === client.id).creditSeconds > 0);
    await request("/api/client/pc-01/event", { title: "Restauracao executada", restoreSeq: state.machines[0].restoreSeq }, token);
    assert.equal((await request("/api/machines/pc-01/start", { minutes: 15, billingMode: "postpaid" })).status, 200);
    assert.equal((await request("/api/machines/pc-01/end", { paymentMethod: "cash" })).status, 200);
    state = (await request("/api/state")).payload;
    assert.equal(state.openCharges.length, 0);
    assert.ok(state.cashSummary.receivedCents >= 800);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("venda em carrinho e pendencias antigas permanecem operaveis", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-sale-"));
  const oldAt = new Date(Date.now() - 50 * 86400000).toISOString();
  const charges = Array.from({ length: 201 }, (_, i) => ({ id: `charge-${i}`, at: i === 0 ? oldAt : new Date().toISOString(), kind: "time", description: `Cobranca ${i}`, amountCents: 100, paidCents: 0 }));
  fs.writeFileSync(path.join(dataDir, "db.json"), JSON.stringify({ version: 2, charges }));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data) {
    const headers = { ...(cookie ? { cookie } : {}) };
    if (data !== undefined) Object.assign(headers, { "content-type": "application/json", origin: base });
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, payload: await response.json(), cookie: response.headers.get("set-cookie") };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    cookie = (await request("/api/login", { name: "admin", password: "senha-teste-123" })).cookie.split(";")[0];
    let state = (await request("/api/state")).payload;
    assert.equal(state.charges.length, 200);
    assert.equal(state.openCharges.length, 201);
    assert.equal(state.cashSummary.pendingCents, 20100);
    await request("/api/cash/open", { opening: 0 });
    assert.equal((await request("/api/charges/charge-0/pay", { amount: 1, method: "cash" })).status, 200);
    const water = (await request("/api/products", { name: "Agua", code: "7891", category: "Bebidas", type: "stock", price: 3, stock: 5, minStock: 2 })).payload.product;
    const snack = (await request("/api/products", { name: "Lanche", code: "7892", category: "Comida", type: "stock", price: 7, stock: 3, minStock: 1 })).payload.product;
    const items = [{ productId: water.id, quantity: 2 }, { productId: snack.id, quantity: 1 }];
    const sale = await request("/api/sales", { items, paymentMethod: "pix", ref: "venda-unica" });
    assert.equal(sale.status, 201);
    assert.equal(sale.payload.charge.amountCents, 1300);
    assert.equal((await request("/api/sales", { items, paymentMethod: "pix", ref: "venda-unica" })).payload.duplicate, true);
    state = (await request("/api/state")).payload;
    assert.equal(state.products.find(row => row.id === water.id).stock, 3);
    assert.equal(state.products.find(row => row.id === snack.id).stock, 2);
    assert.equal(state.openCharges.length, 200);
    // Preco alterado no caixa vale so para a venda e guarda o preco de tabela.
    const promo = await request("/api/sales", { items: [{ productId: water.id, quantity: 2, unitPriceCents: 250 }], paymentMethod: "cash", ref: "venda-preco" });
    assert.equal(promo.payload.charge.amountCents, 500);
    assert.equal(promo.payload.charge.items[0].listPriceCents, 300);
    assert.equal((await request("/api/sales", { items: [{ productId: water.id, quantity: 1, unitPriceCents: 0 }], paymentMethod: "cash", ref: "venda-preco-0" })).status, 400);
    // Despesa paga com dinheiro da gaveta: sai do caixa e entra em Despesas.
    assert.equal((await request("/api/cash/adjust", { direction: "out", amount: 35, reason: "Almoço", expenseCategory: "Alimentação" })).status, 201);
    const lunch = (await (await fetch(`${base}/api/expenses`, { headers: { cookie } })).json()).expenses.find(e => e.description === "Almoço");
    assert.equal(lunch.amountCents, 3500); assert.equal(lunch.category, "Alimentação"); assert.equal(lunch.paid, true);
    // Cliente trocou a forma de pagamento: Pix vira dinheiro e a gaveta acompanha.
    const promoPay = (await request("/api/state")).payload.payments.find(x => x.chargeId === promo.payload.charge.id);
    const drawerBefore = (await request("/api/state")).payload.cashSummary.expectedCashCents;
    assert.equal((await request(`/api/payments/${promoPay.id}/method`, { method: "pix" })).status, 200);
    assert.equal((await request("/api/state")).payload.cashSummary.expectedCashCents, drawerBefore - 500);
    assert.equal((await request(`/api/payments/${promoPay.id}/method`, { method: "boleto" })).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("impressao pelo caixa: estacao envia PDF e cobra quando a fila do Windows aceita", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const printed = [];
  let failNext = false, grayNext = false;
  const printRunner = {
    list: async () => ({ ok: true, printers: ["HP Laser MFP 432 PCL6", "EPSON176647 (L375 Series)"] }),
    print: async job => {
      if (failNext) { failNext = false; return { ok: false, error: "Sem papel" }; }
      assert.equal(fs.readFileSync(job.file).subarray(0, 4).toString("latin1"), "%PDF");
      printed.push(job);
      if (grayNext) { grayNext = false; return { ok: true, pages: 2, hasColor: false }; }
      return { ok: true, pages: 2, ...(job.color ? { hasColor: true } : {}) };
    },
  };
  const server = createApp({ dataDir, printRunner });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, payload: await response.json() };
  }
  const upload = (token, query, body = Buffer.from("%PDF-1.4 teste")) => fetch(`${base}/api/client/pc-01/print-upload?${query}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/pdf" }, body }).then(async response => ({ status: response.status, payload: await response.json() }));
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    const login = await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ name: "admin", password: "senha-teste-123" }) });
    cookie = login.headers.get("set-cookie").split(";")[0];
    const created = await request("/api/machines/register", { id: "pc-01", name: "PC 01" });
    const token = (await request("/api/agent/enroll", { id: "pc-01", name: "PC 01", code: created.payload.pairingCode })).payload.token;
    await request("/api/client/pc-01/command", undefined, token);

    const local = await request("/api/printers/local");
    assert.deepEqual(local.payload.printers, ["HP Laser MFP 432 PCL6", "EPSON176647 (L375 Series)"]);
    assert.equal((await upload(token, "pages=1&color=0")).status, 409, "sem sessao nao imprime");
    await request("/api/machines/pc-01/start", { minutes: 30, billingMode: "postpaid" });
    assert.equal((await upload(token, "pages=1&color=0")).status, 409, "sem impressora configurada");
    assert.equal((await request("/api/settings/print-route", { black: "HP Laser MFP 432 PCL6", color: "EPSON176647 (L375 Series)" })).status, 200);
    assert.equal((await upload(token, "pages=1&color=0", Buffer.from("nao e pdf"))).status, 400);

    const color = await upload(token, "pages=2&color=1");
    assert.equal(color.status, 200);
    assert.equal(color.payload.printer, "EPSON176647 (L375 Series)");
    assert.equal(color.payload.amountCents, 400);
    assert.equal(printed[0].printer, "EPSON176647 (L375 Series)");
    assert.equal(printed[0].color, true);
    assert.equal(fs.existsSync(printed[0].file), false, "arquivo temporario removido");

    grayNext = true;
    const gray = await upload(token, "pages=2&color=1");
    assert.equal(gray.payload.noColor, true);
    assert.equal(gray.payload.amountCents, 200, "colorido sem cor cobra P&B");
    assert.equal(printed[1].printer, "EPSON176647 (L375 Series)", "imprime na colorida mesmo assim");

    failNext = true;
    const failed = await upload(token, "pages=2&color=0");
    assert.equal(failed.status, 502);
    assert.match(failed.payload.error, /Sem papel/);

    const state = (await request("/api/state")).payload;
    const prints = state.charges.filter(row => row.kind === "print");
    assert.equal(prints.length, 2, "impressao com falha nao gera cobranca");
    assert.equal(prints[0].sessionId, state.machines[0].session.id);
    assert.equal(state.machines[0].printCents, 600);
    assert.deepEqual(state.printJobs.map(job => job.state), ["failed", "confirmed", "confirmed"]);
    assert.equal(state.settings.printColorPrinter, "EPSON176647 (L375 Series)");
    assert.equal((await request("/api/settings", { defaultMinutes: 60, hourPrice: 5, printBW: 1, printColor: 2, timeTable: "15=3.00; 30=3.70; 60=5.00" })).status, 200);
    assert.equal((await request("/api/state")).payload.settings.printBlackPrinter, "HP Laser MFP 432 PCL6", "salvar tarifas preserva impressoras");
    const priced = await request("/api/settings/print-route", { black: "HP Laser MFP 432 PCL6", color: "EPSON176647 (L375 Series)", blackPrice: "0.50", colorPrice: "1.50" });
    assert.equal(priced.status, 200);
    assert.deepEqual([priced.payload.blackCents, priced.payload.colorCents], [50, 150]);
    assert.equal((await upload(token, "pages=2&color=0")).payload.amountCents, 100, "novo preco P&B aplicado");
    assert.equal((await request("/api/settings/print-route", { black: "x", color: "y", blackPrice: "0", colorPrice: "1" })).status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("consumo na estacao: itens entram na conta da sessao, somam ao valor e sao recebidos ao encerrar", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: response.status, payload: await response.json() };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    await request("/api/login", { name: "admin", password: "senha-teste-123" });
    const created = await request("/api/machines/register", { id: "pc-01", name: "PC 01" });
    const token = (await request("/api/agent/enroll", { id: "pc-01", name: "PC 01", code: created.payload.pairingCode })).payload.token;
    await request("/api/client/pc-01/command", undefined, token);
    const water = (await request("/api/products", { name: "Agua", type: "stock", price: 2.5, stock: 5 })).payload.product;
    const scan = (await request("/api/products", { name: "Scanner", type: "service", price: 3 })).payload.product;

    assert.equal((await request("/api/machines/pc-01/items", { items: [{ productId: water.id, quantity: 1 }] })).status, 409, "sem sessao");
    await request("/api/machines/pc-01/start", { minutes: 30, billingMode: "postpaid" });
    const before = (await request("/api/state")).payload.machines[0];
    const added = await request("/api/machines/pc-01/items", { items: [{ productId: water.id, quantity: 2 }, { productId: scan.id, quantity: 1 }], printBW: 3, printColor: 0, ref: "consumo-1" });
    assert.equal(added.status, 200);
    assert.equal((await request("/api/machines/pc-01/items", { items: [{ productId: water.id, quantity: 2 }], ref: "consumo-1" })).payload.duplicate, true, "clique duplo nao lanca duas vezes");

    let state = (await request("/api/state")).payload;
    const machine = state.machines[0];
    assert.equal(machine.extrasCents, 500 + 300 + 300);
    assert.equal(machine.valueCents, before.valueCents + 1100, "consumo soma ao valor que corre com o tempo");
    assert.equal(machine.summary.extras.length, 3);
    assert.equal(state.products.find(row => row.id === water.id).stock, 3);
    const command = (await request("/api/client/pc-01/command", undefined, token)).payload;
    assert.equal(command.extrasCents, 1100, "a estacao recebe o consumo para mostrar ao cliente");

    await request("/api/cash/open", { opening: 0 });
    assert.equal((await request("/api/machines/pc-01/end", { paymentMethod: "pix" })).status, 200);
    state = (await request("/api/state")).payload;
    assert.equal(state.openCharges.length, 0, "tempo e consumo recebidos juntos");
    assert.equal(state.payments.reduce((sum, row) => sum + row.amountCents, 0), 1100 + 300);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("protecoes: reinstalacao so na mesma maquina, ID fixo com agente, saldo no tempo extra, hash leve e backup externo", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-backup-"));
  const server = createApp({ dataDir, backupDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: response.status, payload: await response.json() };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    await request("/api/login", { name: "admin", password: "senha-teste-123" });
    const key = (await request("/api/installer-config")).payload.installKey;

    const neverSeen = await request("/api/agent/enroll-by-key", { key, id: "maquina-12", name: "Máquina 12" });
    assert.equal(neverSeen.status, 200);
    const first = await request("/api/agent/enroll-by-key", { key, id: "maquina-12", name: "Máquina 12" });
    assert.equal(first.status, 200, "estacao que nunca se conectou pode ser vinculada de novo");
    assert.equal((await request("/api/client/maquina-12/command", undefined, first.payload.token)).status, 200);
    const hijack = await request("/api/agent/enroll-by-key", { key, id: "maquina-12", name: "Intruso" });
    assert.equal(hijack.status, 409, "chave sozinha nao toma o lugar de uma estacao vinculada");
    assert.match(hijack.payload.error, /Vincular agente/);
    assert.equal((await request("/api/client/maquina-12/command", undefined, first.payload.token)).status, 200, "agente legitimo continua funcionando");
    const reinstall = await request("/api/agent/enroll-by-key", { key, id: "maquina-12", name: "Máquina 12", previousToken: first.payload.token });
    assert.equal(reinstall.status, 200, "reinstalar na mesma maquina usa o token anterior");
    assert.equal((await request("/api/machines/maquina-12/pair", {})).status, 200);
    const replaced = await request("/api/agent/enroll-by-key", { key, id: "maquina-12", name: "Máquina 12" });
    assert.equal(replaced.status, 200, "com Vincular agente no painel, outro computador pode assumir");
    assert.equal((await request("/api/agent/enroll-by-key", { key, id: "maquina-12", name: "Máquina 12" })).status, 409, "a liberacao vale uma vez");

    const hashInfo = await request("/api/client/maquina-12/script-hash", undefined, replaced.payload.token);
    assert.equal(hashInfo.status, 200);
    assert.match(hashInfo.payload.hash, /^[0-9a-f]{64}$/);
    assert.equal((await request("/api/client/maquina-12/script-hash")).status, 401);

    assert.equal((await request("/api/machines/maquina-12/rename", { name: "Máquina 12 B", id: "maquina-99" })).status, 409, "ID nao muda com agente instalado");
    assert.equal((await request("/api/machines/maquina-12/rename", { name: "Máquina 12 B" })).status, 200, "nome continua editavel");

    await request("/api/cash/open", { opening: 0 });
    const client = (await request("/api/clients", { name: "Ana", login: "ana", password: "1234" })).payload.client;
    await request(`/api/clients/${client.id}/recharge`, { amount: 5, paymentMethod: "cash" });
    await request("/api/client/maquina-12/command", undefined, replaced.payload.token);
    assert.equal((await request("/api/machines/maquina-12/start", { minutes: 30, billingMode: "credit", clientId: client.id })).status, 200);
    assert.equal((await request("/api/machines/maquina-12/add-time", { minutes: 60 })).status, 409, "sem saldo para o tempo extra");
    assert.equal((await request("/api/machines/maquina-12/add-time", { minutes: 20 })).status, 200);
    const session = (await request("/api/state")).payload.machines[0].session;
    assert.equal(session.creditSeconds, 50 * 60, "tempo extra entra no saldo a descontar");

    assert.ok(fs.readdirSync(backupDir).some(name => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(name)), "copia diaria no disco de backup");
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
});

test("reiniciar estacao sem cliente pelo painel", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: response.status, payload: await response.json() };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    await request("/api/login", { name: "admin", password: "senha-teste-123" });
    const created = await request("/api/machines/register", { id: "pc-01", name: "PC 01" });
    const token = (await request("/api/agent/enroll", { id: "pc-01", name: "PC 01", code: created.payload.pairingCode })).payload.token;
    assert.equal((await request("/api/machines/pc-01/reboot", {})).status, 409, "offline: comando nao chega");
    await request("/api/client/pc-01/command", undefined, token);
    assert.equal((await request("/api/machines/pc-01/reboot", {})).status, 200);
    assert.equal((await request("/api/client/pc-01/command", undefined, token)).payload.restartSeq, 1, "agente recebe o pedido de reinicio");
    await request("/api/machines/pc-01/start", { minutes: 30, billingMode: "postpaid" });
    assert.equal((await request("/api/machines/pc-01/reboot", {})).status, 409, "com cliente usa Encerrar e reiniciar");
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("tempo livre: libera sem minutos, conta do zero e cobra pela tabela ao sair (minimo R$ 3,00)", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: response.status, payload: await response.json() };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    await request("/api/login", { name: "admin", password: "senha-teste-123" });
    const created = await request("/api/machines/register", { id: "pc-01", name: "PC 01" });
    const token = (await request("/api/agent/enroll", { id: "pc-01", name: "PC 01", code: created.payload.pairingCode })).payload.token;
    await request("/api/client/pc-01/command", undefined, token);
    assert.equal((await request("/api/machines/pc-01/start", { billingMode: "open" })).status, 200, "libera sem informar minutos");
    let machine = (await request("/api/state")).payload.machines[0];
    assert.equal(machine.session.open, true);
    assert.equal(machine.session.billingMode, "postpaid");
    assert.equal(machine.summary.open, true);
    assert.equal(machine.valueCents, 300, "comeca no minimo da tabela");
    const command = (await request("/api/client/pc-01/command", undefined, token)).payload;
    assert.equal(command.session.open, true, "estacao sabe que e tempo livre (conta para cima)");
    assert.equal((await request("/api/machines/pc-01/add-time", { minutes: 10 })).status, 409);
    assert.equal((await request("/api/machines/pc-01/end", {})).status, 200);
    const state = (await request("/api/state")).payload;
    assert.equal(state.charges[0].amountCents, 300, "cobranca minima de R$ 3,00");
    assert.equal(state.events.find(row => row.title === "Maquina liberada").detail, "tempo livre");
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("cancelar pendencia: so administrador, com motivo, preserva o que ja foi pago", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: response.status, payload: await response.json() };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    await request("/api/login", { name: "admin", password: "senha-teste-123" });
    const created = await request("/api/machines/register", { id: "pc-01", name: "PC 01" });
    const token = (await request("/api/agent/enroll", { id: "pc-01", name: "PC 01", code: created.payload.pairingCode })).payload.token;
    await request("/api/client/pc-01/command", undefined, token);
    await request("/api/machines/pc-01/start", { minutes: 60, billingMode: "postpaid" });
    await request("/api/machines/pc-01/end", {});
    await request("/api/cash/open", { opening: 0 });
    let charge = (await request("/api/state")).payload.openCharges[0];
    await request(`/api/charges/${charge.id}/pay`, { amount: 1, method: "cash" });
    assert.equal((await request(`/api/charges/${charge.id}/cancel`, {})).status, 400, "motivo obrigatorio");
    await request("/api/users", { name: "atendente", password: "senha-atendente-1", role: "attendant" });
    const adminCookie = cookie;
    await request("/api/login", { name: "atendente", password: "senha-atendente-1" });
    assert.equal((await request(`/api/charges/${charge.id}/cancel`, { reason: "teste" })).status, 403, "atendente nao cancela");
    cookie = adminCookie;
    const cancelled = await request(`/api/charges/${charge.id}/cancel`, { reason: "sessao de teste esquecida" });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.payload.charge.amountCents, 100, "fica so o valor ja pago");
    const state = (await request("/api/state")).payload;
    assert.equal(state.openCharges.length, 0);
    assert.match(state.events.find(row => row.title === "Pendencia cancelada").detail, /sessao de teste esquecida/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("receber da maquina: desconto e pagamento numa operacao so, com o mesmo receiptId", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: response.status, payload: await response.json() };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    await request("/api/login", { name: "admin", password: "senha-teste-123" });
    const created = await request("/api/machines/register", { id: "pc-01", name: "PC 01" });
    const token = (await request("/api/agent/enroll", { id: "pc-01", name: "PC 01", code: created.payload.pairingCode })).payload.token;
    await request("/api/client/pc-01/command", undefined, token);
    await request("/api/machines/pc-01/start", { minutes: 60, billingMode: "postpaid" });
    await request("/api/machines/pc-01/end", {});
    const charge = (await request("/api/state")).payload.openCharges[0];
    const total = charge.amountCents;
    assert.ok(total > 100);
    const closed = await request("/api/charges/receive", { ids: [charge.id], discountCents: 100, method: "pix" });
    assert.equal(closed.status, 409, "caixa fechado recusa");
    assert.equal((await request("/api/state")).payload.openCharges[0].amountCents, total, "recusa nao aplica o desconto");
    await request("/api/cash/open", { opening: 0 });
    // Desconto de R$ 1,00, R$ 1,00 em dinheiro e o restante no Pix.
    const received = await request("/api/charges/receive", { ids: [charge.id], discountCents: 100, method: "pix", cashCents: 100 });
    assert.equal(received.status, 200);
    assert.equal(received.payload.receivedCents, total - 100);
    assert.equal(received.payload.discountCents, 100);
    const state = (await request("/api/state")).payload;
    assert.equal(state.openCharges.length, 0);
    const payments = state.payments.filter(row => row.receiptId === received.payload.receiptId);
    assert.equal(payments.length, 2);
    assert.equal(payments.find(row => row.method === "cash").amountCents, 100);
    assert.equal(payments.find(row => row.method === "pix").amountCents, total - 200);
    assert.equal(state.charges.find(row => row.id === charge.id).discountCents, 100);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("estacao informa tempo sem mouse/teclado; processo sem o dado nao apaga o valor", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: response.status, payload: await response.json() };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    await request("/api/login", { name: "admin", password: "senha-teste-123" });
    const created = await request("/api/machines/register", { id: "pc-01", name: "PC 01" });
    const token = (await request("/api/agent/enroll", { id: "pc-01", name: "PC 01", code: created.payload.pairingCode })).payload.token;
    await request("/api/client/pc-01/command?idle=1500", undefined, token);
    await request("/api/client/pc-01/command?idle=", undefined, token);
    const machine = (await request("/api/state")).payload.machines.find(row => row.id === "pc-01");
    assert.equal(machine.idleSeconds, 1500);
    assert.ok(machine.idleAt);
    assert.equal((await request("/api/settings/finance", { monthGoal: 0, dailyGoal: 0, idleAlertMinutes: 30 })).status, 200);
    assert.equal((await request("/api/state")).payload.settings.idleAlertMinutes, 30);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("meta da Speed Financeira: soma o valor dos contratos fechados no mes, separada da meta da loja", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: response.status, payload: await response.json() };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    await request("/api/login", { name: "admin", password: "senha-teste-123" });
    assert.equal((await request("/api/settings/finance", { monthGoal: 15000, dailyGoal: 580, finContractGoal: 30000 })).status, 200);
    const lead = (await request("/api/leads", { name: "Cliente INSS", phone: "35999990000" })).payload.lead;
    await request("/api/leads", { name: "Outro contato", phone: "35999991111" });
    assert.equal((await request(`/api/leads/${lead.id}`, { stage: "won", contract: 12000, commission: 600 })).status, 200);
    const goal = (await request("/api/reports")).payload.goal;
    assert.equal(goal.finGoalCents, 3000000);
    assert.equal(goal.finContractsCents, 1200000);
    assert.equal(goal.finContracts, 1);
    assert.equal(goal.monthGoalCents, 1500000, "meta da loja continua separada");
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("PDV: debito/credito, misto fechando o total, fiado com cliente, desconto, estoque negativo e DRE", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: response.status, payload: await response.json() };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    await request("/api/login", { name: "admin", password: "senha-teste-123" });
    await request("/api/cash/open", { opening: 0 });
    const water = (await request("/api/products", { name: "Agua", type: "stock", price: 2.5, stock: 3, cost: 1 })).payload.product;
    const client = (await request("/api/clients", { name: "Ana" })).payload.client;
    const sale = (items, extra, ref) => request("/api/sales", { items, ref, ...extra });

    assert.equal((await sale([{ productId: water.id, quantity: 1 }], { paymentMethod: "debit" }, "a")).status, 201, "debito aceito");
    assert.equal((await sale([{ name: "Acesso internet", unitPriceCents: 530, quantity: 1 }], { paymentMethod: "credit" }, "b")).status, 201, "credito e item avulso aceitos");
    const short = await sale([{ productId: water.id, quantity: 1 }], { payments: [{ method: "cash", amountCents: 100 }] }, "c");
    assert.equal(short.status, 400, "misto que nao fecha o total e recusado");
    assert.match(short.payload.error, /faltam R\$ 1\.50/);
    assert.equal((await sale([{ productId: water.id, quantity: 1 }], { paymentMethod: "fiado" }, "d")).status, 400, "fiado sem cliente recusado");
    let state = (await request("/api/state")).payload;
    assert.equal(state.charges.length, 2, "vendas recusadas nao deixam cobranca pela metade");
    assert.equal(state.products[0].stock, 2);

    assert.equal((await sale([{ productId: water.id, quantity: 1 }], { payments: [{ method: "cash", amountCents: 100 }, { method: "pix", amountCents: 150 }] }, "e")).status, 201, "misto que fecha o total");
    assert.equal((await sale([{ productId: water.id, quantity: 1 }, { productId: water.id, quantity: 1 }], { paymentMethod: "cash" }, "f")).status, 201, "vende mesmo sem estoque (acerto depois)");
    const fiado = await sale([{ productId: water.id, quantity: 1 }], { payments: [{ method: "cash", amountCents: 50 }, { method: "fiado" }], clientId: client.id, discountCents: 50 }, "g");
    assert.equal(fiado.status, 201);
    assert.equal(fiado.payload.charge.amountCents, 200, "desconto registrado de verdade");
    assert.equal(fiado.payload.charge.paidCents, 50, "restante fica pendente no nome do cliente");
    state = (await request("/api/state")).payload;
    assert.equal(state.openCharges.length, 1);
    assert.equal(state.openCharges[0].clientId, client.id);
    assert.equal(state.products[0].stock, -2, "estoque fica negativo e aparece no alerta");
    assert.equal((await request("/api/expenses", { category: "Aluguel", amount: 30 })).status, 200);
    const report = (await request("/api/reports")).payload;
    assert.equal(report.byMethod.debit + report.byMethod.credit, 250 + 530);
    assert.equal(report.salesCents, 250 + 530 + 250 + 500 + 200);
    assert.equal(report.expensesCents, 3000);
    assert.equal(report.lowStockCount, 1);
    const water2 = (await request("/api/state")).payload.products[0];
    if (Number.isInteger(water2.costCents)) {
      assert.equal(report.dre.cmvCents, 5 * water2.costCents, "CMV pelo custo cadastrado");
      assert.equal(report.dre.uncostedRevenueCents, 530, "item avulso sem custo fica separado");
    }
    assert.equal(report.dre.profitCents, report.salesCents - report.dre.cmvCents - 3000);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("despesas: foto lida por OCR, fatura do cartao em lote, despesa fixa mensal, edicao e modulo de marketing", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const ocrText = "Fatura do cartão de crédito\nVencimento 10/10/2026\n12/09 ATACADAO 100,00\n13/09 POSTO SHELL 50,00\n14/09 Pagamento recebido -80,00";
  const server = createApp({ dataDir, ocrRunner: async () => ({ ok: true, text: ocrText }) });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, type) {
    const headers = { origin: base };
    if (cookie) headers.cookie = cookie;
    let body;
    if (Buffer.isBuffer(data)) { headers["content-type"] = type; body = data; }
    else if (data !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(data); }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body, redirect: "manual" });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const text = await response.text();
    let payload; try { payload = JSON.parse(text); } catch { payload = text; }
    return { status: response.status, payload, location: response.headers.get("location") };
  }
  try {
    assert.equal((await request("/marketing/")).status, 302, "sem login nao abre o marketing");
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    await request("/api/login", { name: "admin", password: "senha-teste-123" });

    const avulsa = await request("/api/expenses", { category: "Outros", description: "Compra avulsa", amount: 25, date: "2026-09-30", paid: true, paidDate: "2026-10-02" });
    assert.equal(avulsa.status, 200);
    assert.equal(avulsa.payload.expense.at.slice(0, 10), "2026-09-30");
    assert.equal(avulsa.payload.expense.paidAt.slice(0, 10), "2026-10-02");
    const expenseId = avulsa.payload.expense.id;
    const corrected = await request(`/api/expenses/${expenseId}/update`, { paidDate: "2026-10-03" });
    assert.equal(corrected.payload.expense.paidAt.slice(0, 10), "2026-10-03");
    assert.equal(corrected.payload.expense.at.slice(0, 10), "2026-09-30");
    assert.equal((await request(`/api/expenses/${expenseId}/update`, { description: "Nao deve salvar", paidDate: "2026-02-30" })).status, 400);
    assert.equal((await request("/api/expenses")).payload.expenses.find(e => e.id === expenseId).description, "Compra avulsa");
    assert.equal((await request(`/api/expenses/${expenseId}/update`, { paid: false })).payload.expense.paidAt, null);
    assert.equal((await request(`/api/expenses/${expenseId}/pay`, { paidDate: "2026-10-04" })).payload.expense.paidAt.slice(0, 10), "2026-10-04");
    assert.equal((await request("/api/expenses", { category: "Outros", amount: 1, paid: true, paidDate: "data-invalida" })).status, 400);
    const photo = await request("/api/expenses/read", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), "image/jpeg");
    assert.equal(photo.status, 200);
    assert.equal(photo.payload.ocr, true, "foto passa pelo OCR");
    assert.equal(photo.payload.kind, "card", "fatura do cartao reconhecida");
    assert.deepEqual(photo.payload.items.map(i => [i.category, i.amountCents]), [["Compras de mercadoria", 10000], ["Transporte e combustível", 5000]], "pagamento da fatura fica de fora");
    assert.equal((await request("/api/expenses/bulk", { items: photo.payload.items, fileId: photo.payload.fileId, source: "Fatura" })).payload.count, 2);

    const fixed = await request("/api/expenses", { category: "Aluguel", description: "Aluguel loja", amount: 2935, date: "2026-01-31", paid: false, repeatMonths: 3 });
    assert.equal(fixed.status, 200);
    let list = (await request("/api/expenses")).payload.expenses;
    const rent = list.filter(e => e.description === "Aluguel loja").map(e => e.at.slice(0, 10)).sort();
    assert.deepEqual(rent, ["2026-01-31", "2026-02-28", "2026-03-31"], "despesa fixa repete no ultimo dia do mes");
    const target = list.find(e => e.description === "POSTO SHELL");
    assert.equal((await request(`/api/expenses/${target.id}/update`, { category: "Manutenção", amount: 55 })).status, 200);
    list = (await request("/api/expenses")).payload.expenses;
    assert.equal(list.find(e => e.id === target.id).amountCents, 5500);
    assert.equal(list.find(e => e.id === target.id).category, "Manutenção");
    assert.equal((await request("/api/expenses/read", Buffer.from("texto"), "text/plain")).status, 415);

    assert.equal((await request("/api/marketing/store", { set: { speed_roi_settings: "{\"a\":1}" } })).status, 200);
    assert.equal((await request("/api/marketing/store", { set: { outra: "x" } })).status, 400, "so chaves do painel Speed");
    const page = await request("/marketing/");
    assert.equal(page.status, 200);
    assert.match(page.payload, /__NEXCAFE_MARKETING__ = \{"speed_roi_settings":"\{\\"a\\":1\}"\}/, "dados salvos entram na pagina");
    assert.equal((await request("/marketing/../db.json")).status, 404);
    const client = (await request("/api/clients", { name: "Joao Devedor", phone: "35 9999" })).payload.client;
    const debt = await request(`/api/clients/${client.id}/debt`, { description: "Impressoes", amount: 12.5, date: "2026-05-10", old: true });
    assert.equal(debt.status, 201);
    assert.equal(debt.payload.charge.at.slice(0, 10), "2026-05-10", "divida antiga fica na data dela");
    const proof = await request(`/api/charges/${debt.payload.charge.id}/proof`, Buffer.from([0x89, 0x50, 0x4e, 0x47]), "image/png");
    assert.equal(proof.status, 201);
    const open = (await request("/api/state")).payload.openCharges.find(c => c.id === debt.payload.charge.id);
    assert.equal(open.amountCents - open.paidCents, 1250);
    assert.equal(open.proofs.length, 1, "print anexado como prova");
    assert.equal((await request(`/api/charges/${debt.payload.charge.id}/proof/${open.proofs[0].id}`)).status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("produtos: entrada pela nota fiscal (XML) atualiza estoque e custo e cadastra os novos", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const server = createApp({ dataDir, ocrRunner: async () => ({ ok: true, text: "" }) });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, type) {
    const headers = { origin: base };
    if (cookie) headers.cookie = cookie;
    let body;
    if (Buffer.isBuffer(data)) { headers["content-type"] = type; body = data; }
    else if (data !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(data); }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: response.status, payload: await response.json() };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    await request("/api/login", { name: "admin", password: "senha-teste-123" });
    const coca = (await request("/api/products", { name: "Coca Lata 350ml", code: "90", type: "stock", price: 5, stock: 0 })).payload.product;
    const xml = `<nfeProc><NFe><infNFe><ide><nNF>55</nNF></ide><emit><xNome>ATACADAO</xNome></emit>
      <det nItem="1"><prod><cProd>A1</cProd><cEAN>7894900011517</cEAN><xProd>Coca Lata 350ml</xProd><NCM>22021000</NCM><uCom>UN</uCom><qCom>12.0000</qCom><vUnCom>3.25</vUnCom><vProd>39.00</vProd></prod></det>
      <det nItem="2"><prod><cProd>B2</cProd><cEAN>SEM GTIN</cEAN><xProd>Papel A4 Chamex</xProd><NCM>48021000</NCM><uCom>PC</uCom><qCom>5</qCom><vUnCom>25.90</vUnCom><vProd>129.50</vProd></prod></det></infNFe></NFe></nfeProc>`;
    const read = await request("/api/products/import-read", Buffer.from(xml), "application/xml");
    assert.equal(read.status, 200);
    assert.equal(read.payload.supplier, "ATACADAO");
    assert.equal(read.payload.items[0].productId, coca.id, "reconhece o produto ja cadastrado pelo nome");
    assert.equal(read.payload.items[1].productId, null);
    const items = read.payload.items.map(it => ({ ...it, category: "Bomboniere & Bebidas", priceCents: it.productId ? null : 3990 }));
    const applied = await request("/api/products/import-apply", { items, source: "NF 55" });
    assert.deepEqual([applied.payload.updated, applied.payload.created, applied.payload.units], [1, 1, 17]);
    const products = (await request("/api/state")).payload.products;
    const cocaAfter = products.find(p => p.id === coca.id);
    assert.equal(cocaAfter.stock, 12, "entrada da nota soma no estoque");
    assert.equal(cocaAfter.costCents, 325, "custo atualizado pela nota");
    assert.equal(cocaAfter.priceCents, 500, "preco mantido");
    assert.equal(cocaAfter.barcode, "7894900011517", "codigo de barras gravado");
    const papel = products.find(p => p.name === "Papel A4 Chamex");
    assert.deepEqual([papel.stock, papel.costCents, papel.priceCents], [5, 2590, 3990]);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("cliente encerra o proprio acesso pelo relogio: sessao fecha, maquina bloqueia e o valor fica a receber", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: response.status, payload: await response.json() };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    await request("/api/login", { name: "admin", password: "senha-teste-123" });
    const created = await request("/api/machines/register", { id: "pc-40", name: "PC 40" });
    const token = (await request("/api/agent/enroll", { id: "pc-40", name: "PC 40", code: created.payload.pairingCode })).payload.token;
    await request("/api/cash/open", { opening: 0 });
    await request("/api/client/pc-40/command", undefined, token);
    const started = await request("/api/machines/pc-40/start", { minutes: 60, billingMode: "open" });
    assert.equal(started.status, 200, JSON.stringify(started.payload));
    const command = (await request("/api/client/pc-40/command", undefined, token)).payload;
    assert.equal((await request("/api/client/pc-40/end", { sessionId: "outra" }, token)).status, 409, "pedido velho de outra sessao e recusado");
    assert.equal((await request("/api/client/pc-40/end", {}, cookie ? undefined : token)).status, 401, "so o agente da propria estacao encerra");
    const ended = await request("/api/client/pc-40/end", { sessionId: command.session.id }, token);
    assert.equal(ended.status, 200);
    assert.ok(ended.payload.dueCents > 0, "tempo usado vira valor a receber");
    const after = (await request("/api/client/pc-40/command", undefined, token)).payload;
    assert.equal(after.locked, true);
    assert.match(after.lockMessage, /Pague R\$ \d+,\d{2} no caixa/);
    const state = (await request("/api/state")).payload;
    assert.equal(state.openCharges.filter(c => c.machineId === "pc-40").length, 1, "pendencia no caixa");
    assert.equal(state.machines.find(m => m.id === "pc-40").restoreSeq, 1, "maquina e limpa apos o encerramento");
    assert.equal((await request("/api/client/pc-40/end", { sessionId: command.session.id }, token)).payload.alreadyEnded, true, "clique duplo nao cobra duas vezes");
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("cofre de logins: senha mestre, dados cifrados no arquivo, bloqueio e tentativas limitadas", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data) {
    const headers = { origin: base };
    if (cookie) headers.cookie = cookie;
    if (data !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: response.status, payload: await response.json() };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    await request("/api/login", { name: "admin", password: "senha-teste-123" });
    const first = (await request("/api/vault")).payload;
    assert.equal(first.unlocked, true, "abre direto para o administrador, sem senha mestre");
    assert.equal(first.masterMode, false);
    const saved = await request("/api/vault/items", { kind: "banco", name: "Pan", promoter: "X3 Promotora", products: ["INSS", "FGTS"], login: "pan_vendas_84", password: "Senh@Secreta99", url: "https://pan.example" });
    assert.equal(saved.payload.items[0].password, "Senh@Secreta99");
    let file = fs.readFileSync(path.join(dataDir, "db.json"), "utf8");
    assert.ok(!file.includes("Senh@Secreta99") && !file.includes("pan_vendas_84"), "senha e login nao ficam em texto no banco");
    assert.equal((await request("/api/vault/setup", { master: "curta" })).status, 400);
    const activated = await request("/api/vault/setup", { master: "mestre-forte-1" });
    assert.equal(activated.payload.items[0].password, "Senh@Secreta99", "ativar senha mestre mantem os logins");
    assert.equal((await request("/api/vault/lock", {})).status, 200);
    assert.equal((await request("/api/vault")).payload.items.length, 0, "bloqueado nao mostra nada");
    assert.equal((await request("/api/vault/items", { name: "Teste" })).status, 423);
    for (let i = 0; i < 5; i++) assert.equal((await request("/api/vault/unlock", { master: "errada" })).status, 401);
    assert.equal((await request("/api/vault/unlock", { master: "mestre-forte-1" })).status, 429, "trava apos 5 tentativas erradas");
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("custo por pagina entra no CMV, comissao soma no resultado e contas a vencer aparecem no estado", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data) {
    const headers = { origin: base };
    if (cookie) headers.cookie = cookie;
    if (data !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return { status: response.status, payload: await response.json() };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    await request("/api/login", { name: "admin", password: "senha-teste-123" });
    await request("/api/cash/open", { opening: 0 });
    assert.equal((await request("/api/settings/finance", { monthGoal: 1000, dailyGoal: 50, feeDebit: 0, feeCredit: 0, feeCard: 0, feePix: 0, workDays: 6, printBWCost: 0.12, printColorCost: 0.6, panelOnlyHere: false })).status, 200);
    assert.equal((await request("/api/print/sale", { pages: 10, color: false, paymentMethod: "cash" })).status, 201);
    assert.equal((await request("/api/incomes", { description: "Comissão consignado", amount: 80 })).status, 200);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    await request("/api/expenses", { category: "Energia", description: "CEMIG", amount: 30, date: today, paid: false });
    const report = (await request("/api/reports?period=month")).payload;
    assert.equal(report.dre.cmvCents, 120, "10 paginas x R$ 0,12");
    assert.equal(report.dre.incomesCents, 8000);
    assert.equal(report.dre.profitCents, report.salesCents + 8000 - 120 - 3000);
    assert.equal(typeof report.dre.coveragePct, "number", "cobertura do DRE calculada");
    assert.equal(report.printAudit.totalPages >= 10, true, "printAudit contabiliza total de paginas");
    assert.equal(report.printAudit.bwPages >= 10, true, "printAudit contabiliza P&B");
    assert.equal(typeof report.printAudit.paperReamsEst, "number", "calcula estimativa de resmas");
    assert.equal(Array.isArray(report.hourlyPeak.dayparts), true, "turnos do dia calculados");
    assert.equal(report.hourlyPeak.dayparts.length, 4, "4 faixas do dia (manha, almoco, tarde, noite)");
    assert.equal(typeof report.abcSummary.A, "object", "curva ABC classe A resumida");
    assert.equal(Array.isArray(report.securityAudit.shiftsByOperator), true, "seguranca: fechamentos por operador");
    const month = Number(today.slice(5, 7)) - 1;
    assert.equal(report.yearly[today.slice(0, 4)][month].resultCents, report.monthly[11].resultCents, "resultado anual do mes bate com o mensal (inclui comissao)");
    const state = (await request("/api/state")).payload;
    assert.equal(state.billsDue.length, 1, "conta do dia aparece no aviso");
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("pausar sessao: bloqueia a tela, para o relogio e retomar desconta o tempo parado", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const server = createApp({ dataDir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data, token = null) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, payload: await response.json() };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    const login = await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ name: "admin", password: "senha-teste-123" }) });
    cookie = login.headers.get("set-cookie").split(";")[0];
    const created = await request("/api/machines/register", { id: "pc-01", name: "PC 01" });
    const token = (await request("/api/agent/enroll", { id: "pc-01", name: "PC 01", code: created.payload.pairingCode })).payload.token;
    await request("/api/client/pc-01/command", undefined, token);
    await request("/api/machines/pc-01/start", { billingMode: "open" });
    const before = (await request("/api/state")).payload.machines[0].session;

    assert.equal((await request("/api/machines/pc-01/pause", {})).status, 200);
    assert.equal((await request("/api/machines/pc-01/pause", {})).status, 409, "nao pausa duas vezes");
    const paused = (await request("/api/state")).payload.machines[0];
    assert.equal(paused.locked, true, "tela bloqueada");
    assert.ok(paused.session.pausedAt);
    assert.equal((await request("/api/machines/pc-01/move", { targetId: "pc-01" })).status, 409);
    const frozen = paused.summary.usedMinutes;
    await new Promise(resolve => setTimeout(resolve, 1200));
    assert.equal((await request("/api/state")).payload.machines[0].summary.usedMinutes, frozen, "relogio parado");

    assert.equal((await request("/api/machines/pc-01/unlock", {})).status, 200);
    const resumed = (await request("/api/state")).payload.machines[0];
    assert.equal(resumed.locked, false);
    assert.equal(resumed.session.pausedAt, undefined);
    assert.ok(Date.parse(resumed.session.startedAt) - Date.parse(before.startedAt) >= 1100, "inicio empurrado pela pausa");
    assert.ok(resumed.session.pausedMs >= 1100);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
