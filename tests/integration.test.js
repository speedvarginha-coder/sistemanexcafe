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
    assert.equal((await request(`/api/products/${product.payload.product.id}/sell`, { quantity: 3, paymentMethod: "cash" })).status, 409);
    assert.equal((await request(`/api/products/${product.payload.product.id}/sell`, { quantity: 1, paymentMethod: "cash" })).status, 200);
    assert.equal((await request("/api/print/sale", { pages: 2, color: false, paymentMethod: "cash" })).status, 201);
    state = (await request("/api/state")).payload;
    assert.equal(state.products[0].stock, 1);
    assert.equal(state.charges.length, 4);
    const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const report = await request(`/api/reports?date=${date}`);
    assert.equal(report.payload.salesCents, 1300);
    assert.equal(report.payload.receivedCents, 1300);
    const close = await request("/api/cash/close", { counted: 20 });
    assert.equal(close.status, 200);
    assert.equal(close.payload.shift.closingExpectedCents, 2000);
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
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("tabela de tempo: 15 min R$3,00, 30 min R$3,70 e 60 min R$5,00", async () => {
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

    await startFor(15, 300);
    await startFor(30, 370);
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
    assert.equal((await request("/api/machines/shutdown-all", {})).status, 200);
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
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("impressao pelo caixa: estacao envia PDF, caixa imprime na impressora do atendimento e cobra so se sair", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-test-"));
  const printed = [];
  let failNext = false;
  const printRunner = {
    list: async () => ({ ok: true, printers: ["HP Laser MFP 432 PCL6", "EPSON176647 (L375 Series)"] }),
    print: async job => {
      if (failNext) { failNext = false; return { ok: false, error: "Sem papel" }; }
      assert.equal(fs.readFileSync(job.file).subarray(0, 4).toString("latin1"), "%PDF");
      printed.push(job);
      return { ok: true, pages: 2 };
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

    failNext = true;
    const failed = await upload(token, "pages=2&color=0");
    assert.equal(failed.status, 502);
    assert.match(failed.payload.error, /Sem papel/);

    const state = (await request("/api/state")).payload;
    const prints = state.charges.filter(row => row.kind === "print");
    assert.equal(prints.length, 1, "impressao com falha nao gera cobranca");
    assert.equal(prints[0].sessionId, state.machines[0].session.id);
    assert.equal(state.machines[0].printCents, 400);
    assert.deepEqual(state.printJobs.map(job => job.state), ["failed", "confirmed"]);
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

    const first = await request("/api/agent/enroll-by-key", { key, id: "maquina-12", name: "Máquina 12" });
    assert.equal(first.status, 200);
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
