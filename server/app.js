const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const dgram = require("node:dgram");
const { execFile } = require("node:child_process");
const { buildZip } = require("./installer-package");

const OFFLINE_MS = 20_000;
const SESSION_MS = 12 * 60 * 60 * 1000;
const METHODS = ["cash", "pix", "card"];
const ARCHIVE_AFTER_DAYS = 45;
const BACKUP_KEEP_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const err = (status, message) => Object.assign(new Error(message), { status });
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const label = (value, max = 100) => String(value ?? "").trim().slice(0, max);
const publicUser = user => ({ id: user.id, name: user.name, role: user.role, active: user.active });
const price = (minutes, rate) => Math.round(minutes * rate / 60);
function timeAmountCents(minutes, settings) {
  const source = Array.isArray(settings.timeTable) && settings.timeTable.length ? settings.timeTable : [{ minutes: 15, cents: 300 }, { minutes: 30, cents: 370 }, { minutes: 60, cents: 500 }];
  const table = source.slice().sort((a, b) => a.minutes - b.minutes);
  const m = Math.max(1, Math.ceil(Number(minutes) || 1));
  if (m <= table[0].minutes) return table[0].cents;
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1], b = table[i];
    if (m <= b.minutes) return Math.round(a.cents + (m - a.minutes) * (b.cents - a.cents) / (b.minutes - a.minutes));
  }
  const last = table[table.length - 1];
  return Math.round(last.cents + (m - last.minutes) * settings.rateCentsHour / 60);
}
function parseTimeTable(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const rows = raw.split(/[;\n]+/).map(row => row.trim()).filter(Boolean);
  const table = [];
  for (const row of rows) {
    const match = row.match(/^(\d{1,4})\s*[=:]\s*(\d+(?:[.,]\d{1,2})?)$/);
    if (!match) throw err(400, `Faixa invalida: "${row}". Use o formato 15=3.00; 30=3.70; 60=5.00`);
    const minutes = Number(match[1]);
    const cents = Math.round(Number(match[2].replace(",", ".")) * 100);
    if (minutes < 1 || minutes > 1440 || cents < 0 || cents > 100000) throw err(400, `Faixa invalida: "${row}"`);
    table.push({ minutes, cents });
  }
  if (!table.length) throw err(400, "Informe ao menos uma faixa de tempo");
  table.sort((a, b) => a.minutes - b.minutes);
  return table;
}
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) if (net.family === "IPv4" && !net.internal) return net.address;
  }
  return "127.0.0.1";
}
function normalizeMac(value) {
  const clean = String(value || "").replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  return clean.length === 12 ? clean.match(/../g).join(":") : "";
}
function wakeOnLan(mac) {
  const clean = String(mac || "").replace(/[^0-9a-fA-F]/g, "");
  if (clean.length !== 12) return false;
  const macBytes = clean.match(/../g).map(hex => parseInt(hex, 16));
  const packet = Buffer.alloc(102, 0xff);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 6; j++) packet[6 + i * 6 + j] = macBytes[j];
  const socket = dgram.createSocket("udp4");
  socket.bind(() => {
    try { socket.setBroadcast(true); } catch { }
    for (const port of [9, 7]) socket.send(packet, 0, packet.length, port, "255.255.255.255", () => {});
    setTimeout(() => { try { socket.close(); } catch { } }, 600);
  });
  return true;
}

function number(value, min, max, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw err(400, `${field} invalido`);
  return n;
}
function money(value, field = "Valor") {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw err(400, `${field} invalido`);
  return Math.round(n * 100);
}
function machineId(value) {
  const result = label(value, 32).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(result)) throw err(400, "ID invalido: use 2 a 32 letras, numeros, _ ou -");
  return result;
}
function passwordHash(password, salt) { return crypto.scryptSync(password, salt, 64).toString("hex"); }
function makeUser(name, password, role) {
  if (password.length < 10) throw err(400, "Senha deve ter pelo menos 10 caracteres");
  const salt = crypto.randomBytes(16).toString("hex");
  return { id: uuid(), name: label(name, 60), role, active: true, salt, passwordHash: passwordHash(password, salt) };
}
function verifyPassword(password, user) {
  const actual = Buffer.from(passwordHash(password, user.salt), "hex");
  const expected = Buffer.from(user.passwordHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
function defaults() {
  return { version: 2, createdAt: now(), installKey: crypto.randomBytes(12).toString("base64url"), printerShares: [], settings: { defaultMinutes: 60, autoRestoreOnTimeEnd: true, rateCentsHour: 500, printBWCents: 100, printColorCents: 200, printBlackPrinter: "", printColorPrinter: "", timeTable: [{ minutes: 15, cents: 300 }, { minutes: 30, cents: 370 }, { minutes: 60, cents: 500 }] }, machines: {}, events: [], users: [], loginSessions: [], clients: [], products: [], charges: [], payments: [], sessionHistory: [], stockMovements: [], cashShifts: [], cashAdjustments: [], printJobs: [], waitList: [] };
}
function normalize(db) {
  const empty = defaults();
  db.version = 2;
  db.installKey ||= empty.installKey;
  db.printerShares ||= [];
  db.settings = { ...empty.settings, ...(db.settings || {}) };
  if (!Array.isArray(db.settings.timeTable) || !db.settings.timeTable.length) db.settings.timeTable = empty.settings.timeTable.map(row => ({ ...row }));
  db.machines ||= {};
  db.waitList ||= [];
  for (const machine of Object.values(db.machines)) {
    machine.restoreSeq ||= 0; machine.restartSeq ||= 0;
    machine.appliedRestoreSeq ||= 0; machine.appliedRestartSeq ||= 0;
    machine.shutdownSeq ||= 0; machine.appliedShutdownSeq ||= 0;
    machine.maintenance = machine.maintenance === true;
    if (!machine.session) machine.locked = true;
    if (machine.session && !machine.session.plannedMinutes) {
      machine.session.id ||= uuid();
      machine.session.plannedMinutes = Number(machine.session.minutes) || db.settings.defaultMinutes;
      machine.session.billingMode = "postpaid";
      machine.session.rateCentsHour = db.settings.rateCentsHour;
    }
  }
  for (const key of ["events", "users", "loginSessions", "clients", "products", "charges", "payments", "sessionHistory", "stockMovements", "cashShifts", "cashAdjustments", "printJobs"]) db[key] ||= [];
  return db;
}

// Executa server/print-pdf.ps1 no computador do caixa e devolve o JSON que ele imprime.
function runPrintScript(args, timeout = 240000) {
  const script = path.join(__dirname, "print-pdf.ps1");
  return new Promise(resolve => {
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...args], { timeout, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      const line = String(stdout || "").trim().split(/\r?\n/).pop();
      try { return resolve(JSON.parse(line)); } catch { }
      resolve({ ok: false, error: error ? error.message : "Resposta invalida do script de impressao" });
    });
  });
}
const defaultPrintRunner = {
  list: () => runPrintScript(["-Action", "List"], 30000),
  print: ({ file, printer, color }) => runPrintScript(["-Action", "Print", "-Path", file, "-Printer", printer, ...(color ? ["-Color"] : [])]),
};

const DEFAULT_DATA_DIR = path.join(__dirname, "data");
// Copia diaria em outro disco: se o disco do sistema falhar, caixa, clientes e saldos nao se perdem.
const DEFAULT_OFFSITE_DIR = process.env.LHM_BACKUP_DIR || (process.platform === "win32" ? "C:\\LanHouseManager-Backup" : "");
const OFFSITE_KEEP_DAYS = 30;

function createApp({ dataDir = DEFAULT_DATA_DIR, port = 4780, printRunner = defaultPrintRunner, backupDir } = {}) {
  const offsiteDir = backupDir !== undefined ? backupDir : (path.resolve(dataDir) === path.resolve(DEFAULT_DATA_DIR) ? DEFAULT_OFFSITE_DIR : "");
  const dbPath = path.join(dataDir, "db.json");
  fs.mkdirSync(dataDir, { recursive: true });
  const screens = new Map();
  const inputs = new Map();
  let scriptCache = { mtime: 0, text: "", hash: "" };
  function agentScript() {
    const file = path.join(__dirname, "..", "client-agent", "LanHouseAgent.ps1");
    try {
      const stat = fs.statSync(file);
      if (stat.mtimeMs !== scriptCache.mtime) {
        const buffer = fs.readFileSync(file);
        scriptCache = { mtime: stat.mtimeMs, text: buffer.toString("utf8"), hash: crypto.createHash("sha256").update(buffer).digest("hex") };
      }
      return scriptCache;
    } catch { return { mtime: 0, text: "", hash: "" }; }
  }
  let db;
  if (fs.existsSync(dbPath)) {
    db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    if (db.version !== 2) fs.copyFileSync(dbPath, `${dbPath}.antes-v2-${Date.now()}.bak`);
    normalize(db);
  } else db = defaults();
  let backupDay = "";
  let lastMaintenance = 0;
  function archiveOldData() {
    const cutoff = Date.now() - ARCHIVE_AFTER_DAYS * DAY_MS;
    const isOld = value => Date.parse(value) < cutoff;
    const fields = [
      { key: "charges", date: item => item.at },
      { key: "payments", date: item => item.at },
      { key: "sessionHistory", date: item => item.endedAt },
      { key: "stockMovements", date: item => item.at },
      { key: "cashAdjustments", date: item => item.at },
      { key: "cashShifts", date: item => item.closedAt },
      { key: "events", date: item => item.at },
    ];
    const buckets = new Map();
    for (const { key, date } of fields) {
      const keep = [];
      for (const item of db[key]) {
        const ts = date(item);
        // Pendencias precisam continuar disponiveis para recebimento, mesmo antigas.
        if (key === "charges" && item.paidCents < item.amountCents) { keep.push(item); continue; }
        if (ts && isOld(ts)) {
          const month = ts.slice(0, 7);
          if (!buckets.has(month)) buckets.set(month, {});
          (buckets.get(month)[key] ||= []).push(item);
        } else keep.push(item);
      }
      if (keep.length !== db[key].length) db[key] = keep;
    }
    if (buckets.size === 0) return false;
    for (const [month, bucket] of buckets) {
      const file = path.join(dataDir, `archive-${month}.json`);
      let existing = {};
      if (fs.existsSync(file)) {
        try { existing = JSON.parse(fs.readFileSync(file, "utf8")); } catch { console.error(`Arquivo de arquivo invalido, recriando: ${file}`); }
      }
      for (const key of Object.keys(bucket)) {
        const merged = (existing[key] || []).concat(bucket[key]);
        existing[key] = [...new Map(merged.map(item => [item.id, item])).values()];
      }
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(existing), "utf8");
      fs.renameSync(`${file}.tmp`, file);
    }
    return true;
  }
  function pruneBackups() {
    const cutoff = Date.now() - BACKUP_KEEP_DAYS * DAY_MS;
    for (const name of fs.readdirSync(dataDir)) {
      const match = name.match(/^db\.json\.(\d{4}-\d{2}-\d{2})\.bak$/);
      if (match && Date.parse(match[1]) < cutoff) fs.rmSync(path.join(dataDir, name), { force: true });
    }
  }
  function save() {
    const day = now().slice(0, 10);
    if (fs.existsSync(dbPath) && backupDay !== day) {
      const backup = `${dbPath}.${day}.bak`;
      if (!fs.existsSync(backup)) fs.copyFileSync(dbPath, backup);
      backupDay = day;
      if (offsiteDir) {
        try {
          fs.mkdirSync(offsiteDir, { recursive: true });
          fs.copyFileSync(dbPath, path.join(offsiteDir, `db-${day}.json`));
          const cutoff = Date.now() - OFFSITE_KEEP_DAYS * DAY_MS;
          for (const name of fs.readdirSync(offsiteDir)) {
            const match = name.match(/^db-(\d{4}-\d{2}-\d{2})\.json$/);
            if (match && Date.parse(match[1]) < cutoff) fs.rmSync(path.join(offsiteDir, name), { force: true });
          }
        } catch (cause) { console.error(`Backup em ${offsiteDir} falhou: ${cause.message}`); }
      }
    }
    if (Date.now() - lastMaintenance > 3600000) {
      lastMaintenance = Date.now();
      if (archiveOldData()) pruneBackups();
    }
    fs.writeFileSync(`${dbPath}.tmp`, JSON.stringify(db), "utf8");
    fs.renameSync(`${dbPath}.tmp`, dbPath);
  }
  save();
  function event(machineId, title, detail = "", user = "sistema") {
    db.events.unshift({ id: uuid(), at: now(), machineId, title, detail: label(detail, 200), user });
    db.events.length = Math.min(db.events.length, 500);
  }
  function getMachine(id) { const item = db.machines[id]; if (!item) throw err(404, "Maquina nao encontrada"); return item; }
  function touch(item) { item.updatedAt = now(); item.commandSeq = (item.commandSeq || 0) + 1; }
  function status(item) {
    if (item.maintenance) return "maintenance";
    if (!item.lastSeen || Date.now() - Date.parse(item.lastSeen) > OFFLINE_MS) return "offline";
    return item.locked ? "locked" : item.session ? "in_use" : "free";
  }
  function sessionCost(item) {
    const session = item.session;
    if (!session) return { timeCents: 0, printCents: 0, extrasCents: 0, totalCents: 0 };
    const elapsedSeconds = Math.max(1, Math.ceil((Date.now() - Date.parse(session.startedAt)) / 1000));
    let timeCents;
    if (session.billingMode === "credit") {
      const usedSeconds = Math.min(session.creditSeconds || 0, elapsedSeconds);
      timeCents = Math.round(usedSeconds / 3600 * db.settings.rateCentsHour);
    } else {
      const usedMinutes = Math.min(session.plannedMinutes, Math.max(1, Math.ceil(elapsedSeconds / 60)));
      timeCents = timeAmountCents(usedMinutes, db.settings);
    }
    const printCents = db.charges.filter(row => row.sessionId === session.id && row.kind === "print").reduce((sum, row) => sum + row.amountCents, 0);
    // Consumo lancado na maquina (agua, scanner, impressao do balcao) soma ao valor que corre com o tempo.
    const extrasCents = db.charges.filter(row => row.sessionId === session.id && row.kind === "sale").reduce((sum, row) => sum + row.amountCents, 0);
    return { timeCents, printCents, extrasCents, totalCents: timeCents + printCents + extrasCents };
  }
  function sessionSummary(item) {
    const session = item.session;
    if (!session) return null;
    const elapsedSeconds = Math.max(1, Math.ceil((Date.now() - Date.parse(session.startedAt)) / 1000));
    const usedMinutes = Math.min(session.plannedMinutes, Math.max(1, Math.ceil(elapsedSeconds / 60)));
    const cost = sessionCost(item);
    const client = db.clients.find(row => row.id === session.clientId);
    const prints = db.charges.filter(row => row.sessionId === session.id && row.kind === "print").map(row => ({ color: row.color === true, pages: row.quantity || 0, amountCents: row.amountCents }));
    const extras = db.charges.filter(row => row.sessionId === session.id && row.kind === "sale").flatMap(row => row.items || []).map(row => ({ name: row.name, quantity: row.quantity, amountCents: row.totalCents }));
    return { customer: session.customer || (client ? client.name : "Avulso"), billingMode: session.billingMode, plannedMinutes: session.plannedMinutes, usedMinutes, startedAt: session.startedAt, timeCents: cost.timeCents, prints, printCents: cost.printCents, extras, extrasCents: cost.extrasCents, totalCents: cost.totalCents };
  }
  function publicMachine(item) {
    const { agentHash, pairingHash, pairingExpiresAt, ...safe } = item;
    const cost = sessionCost(item);
    return { ...safe, status: status(item), valueCents: cost.totalCents, timeCents: cost.timeCents, printCents: cost.printCents, extrasCents: cost.extrasCents, summary: sessionSummary(item), remainingMs: item.session ? Math.max(0, Date.parse(item.session.endsAt) - Date.now()) : 0 };
  }
  const publicClient = client => ({ id: client.id, name: client.name, phone: client.phone, active: client.active, createdAt: client.createdAt, login: client.login || "", creditSeconds: client.creditSeconds || 0 });
  function setClientLogin(client, login, password) {
    const clean = label(login, 40).toLowerCase();
    if (clean && !/^[a-z0-9._-]{3,40}$/.test(clean)) throw err(400, "Login invalido: use 3 a 40 caracteres (letras, numeros, ponto, _ ou -)");
    if (clean && db.clients.some(item => item.id !== client.id && (item.login || "") === clean)) throw err(409, "Este login ja esta em uso");
    if (clean && !client.passwordHash && (password === undefined || String(password) === "")) throw err(400, "Defina uma senha para o login do cliente");
    client.login = clean;
    if (password !== undefined && String(password) !== "") {
      const value = String(password);
      if (value.length < 4) throw err(400, "Senha do cliente deve ter pelo menos 4 caracteres");
      const salt = crypto.randomBytes(16).toString("hex");
      client.salt = salt; client.passwordHash = passwordHash(value, salt);
    } else if (!clean) {
      client.salt = ""; client.passwordHash = "";
    }
  }
  function pair(item) {
    const code = crypto.randomBytes(9).toString("base64url");
    item.pairingHash = hash(code); item.pairingExpiresAt = new Date(Date.now() + 3600000).toISOString();
    item.reenrollUntil = item.pairingExpiresAt; touch(item);
    return code;
  }
  function currentShift() { return db.cashShifts.find(item => !item.closedAt) || null; }
  function charge(kind, description, amountCents, fields = {}) {
    const item = { id: uuid(), at: now(), kind, description, amountCents, paidCents: 0, ...fields };
    db.charges.unshift(item); return item;
  }
  function pay(item, amountCents, method, operator) {
    const shift = currentShift(); if (!shift) throw err(409, "Abra o caixa antes de receber");
    if (!METHODS.includes(method)) throw err(400, "Forma de pagamento invalida");
    if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > item.amountCents - item.paidCents) throw err(400, "Valor excede a pendencia");
    item.paidCents += amountCents;
    db.payments.unshift({ id: uuid(), at: now(), chargeId: item.id, amountCents, method, shiftId: shift.id, operator });
    event(item.machineId || "caixa", "Pagamento registrado", item.description, operator);
  }
  function finish(item, reason, operator, restore = true, restart = false) {
    const session = item.session; if (!session) throw err(409, "Maquina sem sessao ativa");
    const elapsedSeconds = Math.max(1, Math.ceil((Date.now() - Date.parse(session.startedAt)) / 1000));
    let summary;
    if (session.billingMode === "credit") {
      const client = db.clients.find(row => row.id === session.clientId);
      const usedSeconds = Math.min(session.creditSeconds || 0, elapsedSeconds);
      if (client) client.creditSeconds = Math.max(0, (client.creditSeconds || 0) - usedSeconds);
      db.sessionHistory.unshift({ ...session, machineId: item.id, endedAt: now(), usedSeconds, usedMinutes: Math.ceil(usedSeconds / 60), reason, operator });
      summary = `${Math.ceil(usedSeconds / 60)} min (saldo)`;
    } else {
      const usedMinutes = Math.min(session.plannedMinutes, Math.max(1, Math.ceil(elapsedSeconds / 60)));
      db.sessionHistory.unshift({ ...session, machineId: item.id, endedAt: now(), usedMinutes, reason, operator });
      if (session.billingMode === "postpaid") charge("time", `Uso ${item.name}: ${usedMinutes} min`, timeAmountCents(usedMinutes, db.settings), { machineId: item.id, clientId: session.clientId, sessionId: session.id });
      summary = `${usedMinutes} min`;
    }
    item.session = null; item.locked = true; item.openedSessionId = null; item.openedAt = null; item.lockMessage = reason === "expired" ? "Tempo encerrado. Procure o atendente." : "Atendimento encerrado";
    if (restore) item.restoreSeq = (item.restoreSeq || 0) + 1;
    if (restart) item.restartSeq = (item.restartSeq || 0) + 1;
    touch(item); event(item.id, "Sessao encerrada", `${summary}; ${reason}`, operator);
    return session.id;
  }
  function expire() {
    let changed = false;
    for (const item of Object.values(db.machines)) if (item.session && Date.parse(item.session.endsAt) <= Date.now()) { finish(item, "expired", "sistema", db.settings.autoRestoreOnTimeEnd); changed = true; }
    if (changed) save();
  }
  function send(res, statusCode, value, extra = {}) {
    res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra });
    res.end(JSON.stringify(value));
  }
  async function readBody(req) {
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > 1500000) throw err(413, "Requisicao muito grande"); }
    if (!raw) return {};
    try { const value = JSON.parse(raw); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value; }
    catch { throw err(400, "JSON invalido"); }
  }
  function loopback(req) { return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress); }
  function operator(req) {
    const token = (req.headers.cookie || "").match(/(?:^|;\s*)lhm_session=([^;]+)/)?.[1];
    if (!token) throw err(401, "Entre com sua conta");
    const session = db.loginSessions.find(item => item.tokenHash === hash(token) && Date.parse(item.expiresAt) > Date.now());
    const user = session && db.users.find(item => item.id === session.userId && item.active);
    if (!user) throw err(401, "Sessao expirada");
    return user;
  }
  function admin(user) { if (user.role !== "admin") throw err(403, "Acesso exclusivo do administrador"); }
  function agent(req, item) {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token || !item.agentHash || hash(token) !== item.agentHash) throw err(401, "Agente nao autorizado");
  }
  function origin(req) {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;
    let candidate = req.headers.origin;
    if (!candidate && req.headers.referer) {
      try { candidate = new URL(req.headers.referer).origin; } catch { throw err(403, "Origem nao permitida"); }
    }
    if (!candidate) throw err(403, "Origem obrigatoria");
    let host;
    try { host = new URL(candidate).host; } catch { throw err(403, "Origem nao permitida"); }
    if (host !== req.headers.host) throw err(403, "Origem nao permitida");
  }
  function state(user) {
    const shift = currentShift();
    const shiftPayments = shift ? db.payments.filter(item => item.shiftId === shift.id) : [];
    const shiftAdjustments = shift ? db.cashAdjustments.filter(item => item.shiftId === shift.id) : [];
    const openCharges = db.charges.filter(item => item.amountCents > item.paidCents);
    const cashReceivedCents = shiftPayments.filter(item => item.method === "cash").reduce((sum, item) => sum + item.amountCents, 0);
    const adjustmentCents = shiftAdjustments.reduce((sum, item) => sum + (item.direction === "in" ? item.amountCents : -item.amountCents), 0);
    return { ok: true, user: publicUser(user), settings: db.settings, machines: Object.values(db.machines).map(publicMachine), events: db.events.slice(0, 60), clients: db.clients.map(publicClient), products: db.products, charges: db.charges.slice(0, 200), openCharges, payments: db.payments.slice(0, 150), cashShift: shift, cashSummary: { expectedCashCents: shift ? shift.openingCents + cashReceivedCents + adjustmentCents : 0, receivedCents: shiftPayments.reduce((sum, item) => sum + item.amountCents, 0), pendingCents: openCharges.reduce((sum, item) => sum + item.amountCents - item.paidCents, 0) }, cashShifts: db.cashShifts.slice(0, 30), cashAdjustments: db.cashAdjustments.slice(0, 150), users: user.role === "admin" ? db.users.map(publicUser) : [], printers: user.role === "admin" ? db.printerShares : [], printJobs: db.printJobs.slice(0, 20), waitList: db.waitList, serverTime: now() };
  }
  function report(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw err(400, "Data invalida");
    const onDate = value => new Date(value).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) === date;
    const archiveFile = path.join(dataDir, `archive-${date.slice(0, 7)}.json`);
    let archived = {};
    if (fs.existsSync(archiveFile)) {
      try { archived = JSON.parse(fs.readFileSync(archiveFile, "utf8")); } catch { archived = {}; }
    }
    const charges = db.charges.filter(item => onDate(item.at)).concat((archived.charges || []).filter(item => onDate(item.at)));
    const payments = db.payments.filter(item => onDate(item.at)).concat((archived.payments || []).filter(item => onDate(item.at)));
    const sessions = db.sessionHistory.filter(item => onDate(item.endedAt)).concat((archived.sessionHistory || []).filter(item => onDate(item.endedAt)));
    const byMethod = { cash: 0, pix: 0, card: 0 };
    for (const item of payments) byMethod[item.method] += item.amountCents;
    const byMachine = {};
    for (const item of sessions) { byMachine[item.machineId] ||= { machineId: item.machineId, count: 0, minutes: 0 }; byMachine[item.machineId].count++; byMachine[item.machineId].minutes += item.usedMinutes; }
    const byProduct = {};
    for (const sale of charges) {
      const rows = sale.kind === "sale" ? sale.items || [] : sale.kind === "product" ? [{ productId: sale.productId, name: db.products.find(row => row.id === sale.productId)?.name || sale.description, quantity: sale.quantity || 1, totalCents: sale.amountCents }] : [];
      for (const row of rows) {
        const id = row.productId || row.name;
        byProduct[id] ||= { productId: id, name: row.name, quantity: 0, amountCents: 0 };
        byProduct[id].quantity += row.quantity;
        byProduct[id].amountCents += row.totalCents;
      }
    }
    const byOperator = {};
    for (const payment of payments) {
      const name = payment.operator || "Sistema";
      byOperator[name] ||= { name, receivedCents: 0, payments: 0 };
      byOperator[name].receivedCents += payment.amountCents;
      byOperator[name].payments++;
    }
    return { ok: true, date, salesCents: charges.reduce((sum, item) => sum + item.amountCents, 0), receivedCents: payments.reduce((sum, item) => sum + item.amountCents, 0), dueCents: db.charges.reduce((sum, item) => sum + item.amountCents - item.paidCents, 0), sessions: sessions.length, minutes: sessions.reduce((sum, item) => sum + item.usedMinutes, 0), byMethod, byMachine: Object.values(byMachine), byProduct: Object.values(byProduct).sort((a, b) => b.amountCents - a.amountCents), byOperator: Object.values(byOperator).sort((a, b) => b.receivedCents - a.receivedCents), charges };
  }

  const spoolDir = path.join(dataDir, "print-spool");
  let printQueue = Promise.resolve();
  let localPrinters = { at: 0, list: [] };
  async function readRaw(req, limit) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw err(413, "Documento muito grande");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  const attempts = new Map();
  const enrollAttempts = new Map();
  async function api(req, res, url) {
    const p = url.pathname;
    if (p === "/api/bootstrap" && req.method === "GET") return send(res, 200, { ok: true, initialized: db.users.length > 0, canSetup: loopback(req) });
    if (p === "/api/setup" && req.method === "POST") {
      if (!loopback(req)) throw err(403, "Configure o administrador no computador servidor");
      if (db.users.length) throw err(409, "Administrador ja configurado");
      const input = await readBody(req);
      const user = makeUser(input.name || "Administrador", String(input.password || ""), "admin");
      db.users.push(user); event("sistema", "Administrador criado", "", user.name); save();
      return send(res, 201, { ok: true });
    }
    if (p === "/api/login" && req.method === "POST") {
      const ip = req.socket.remoteAddress || "unknown";
      const previous = attempts.get(ip);
      const attempt = previous && previous.until > Date.now() ? previous : { count: 0, until: 0 };
      if (attempt.count >= 8 && attempt.until > Date.now()) throw err(429, "Muitas tentativas. Aguarde 15 minutos");
      const input = await readBody(req);
      const user = db.users.find(item => item.active && item.name.toLowerCase() === label(input.name, 60).toLowerCase());
      if (!user || !verifyPassword(String(input.password || ""), user)) {
        attempts.set(ip, { count: attempt.count + 1, until: Date.now() + 15 * 60000 });
        throw err(401, "Usuario ou senha incorretos");
      }
      attempts.delete(ip);
      const token = crypto.randomBytes(32).toString("base64url");
      db.loginSessions = db.loginSessions.filter(item => Date.parse(item.expiresAt) > Date.now());
      db.loginSessions.push({ userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + SESSION_MS).toISOString() });
      save();
      return send(res, 200, { ok: true, user: publicUser(user) }, { "set-cookie": `lhm_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}` });
    }
    if (p === "/api/agent/enroll" && req.method === "POST") {
      const input = await readBody(req);
      const item = getMachine(machineId(input.id));
      if (!item.pairingHash || Date.parse(item.pairingExpiresAt) < Date.now() || hash(String(input.code || "")) !== item.pairingHash) throw err(401, "Codigo de vinculacao invalido ou expirado");
      const token = crypto.randomBytes(32).toString("base64url");
      item.agentHash = hash(token); item.pairingHash = null; item.pairingExpiresAt = null;
      item.name = label(input.name || item.name, 60); touch(item); event(item.id, "Agente vinculado"); save();
      return send(res, 200, { ok: true, token });
    }
    if (p === "/api/agent/enroll-by-key" && req.method === "POST") {
      const ip = req.socket.remoteAddress || "unknown";
      const previous = enrollAttempts.get(ip);
      const attempt = previous && previous.until > Date.now() ? previous : { count: 0, until: 0 };
      if (attempt.count >= 10 && attempt.until > Date.now()) throw err(429, "Muitas tentativas. Aguarde 15 minutos");
      const input = await readBody(req);
      const key = String(input.key || "");
      const id = machineId(input.id);
      if (key !== db.installKey) {
        enrollAttempts.set(ip, { count: attempt.count + 1, until: Date.now() + 15 * 60000 });
        throw err(401, "Chave de instalacao invalida");
      }
      enrollAttempts.delete(ip);
      const name = label(input.name || id, 60);
      let item = db.machines[id];
      // Estacao ja vinculada: so reinstala na mesma maquina (token anterior) ou com "Vincular agente" no painel.
      if (item && item.agentHash) {
        const sameMachine = input.previousToken && hash(String(input.previousToken)) === item.agentHash;
        const allowed = item.reenrollUntil && Date.parse(item.reenrollUntil) > Date.now();
        if (!sameMachine && !allowed) throw err(409, `A estacao ${item.name} ja esta vinculada a outro computador. No painel, abra Mais acoes > Vincular agente nessa estacao e rode o instalador de novo em ate 1 hora.`);
      }
      if (!item) {
        item = { id, name, locked: true, lockMessage: "Aguardando liberacao", session: null, lastSeen: null, createdAt: now(), updatedAt: now(), commandSeq: 1, restoreSeq: 0, restartSeq: 0, appliedRestoreSeq: 0, appliedRestartSeq: 0 };
        db.machines[id] = item;
        event(id, "Maquina vinculada por chave", name, "instalador");
      }
      const token = crypto.randomBytes(32).toString("base64url");
      item.agentHash = hash(token); item.reenrollUntil = null; item.name = name; touch(item); event(id, "Agente vinculado", name, "instalador"); save();
      return send(res, 200, { ok: true, token, machineId: id });
    }
    const command = p.match(/^\/api\/client\/([^/]+)\/command$/);
    if (command && req.method === "GET") {
      const item = getMachine(decodeURIComponent(command[1])); agent(req, item); expire();
      item.lastSeen = now(); item.ip = req.socket.remoteAddress;
      item.windowsUser = label(url.searchParams.get("user"), 60); item.agentVersion = label(url.searchParams.get("version"), 30);
      const reportedMac = normalizeMac(url.searchParams.get("mac")); if (reportedMac) item.mac = reportedMac;
      if (!item.lastPersistedAt || Date.now() - Date.parse(item.lastPersistedAt) > 15000) { item.lastPersistedAt = now(); save(); }
      const cost = sessionCost(item);
      return send(res, 200, { ok: true, machineId: item.id, serverTime: now(), commandSeq: item.commandSeq, locked: item.locked || !item.session, lockMessage: item.lockMessage, session: item.session, openedSessionId: item.openedSessionId || null, valueCents: cost.totalCents, timeCents: cost.timeCents, printCents: cost.printCents, extrasCents: cost.extrasCents, printBWCents: db.settings.printBWCents, printColorCents: db.settings.printColorCents, restoreSeq: item.restoreSeq, restartSeq: item.restartSeq, appliedRestoreSeq: item.appliedRestoreSeq || 0, appliedRestartSeq: item.appliedRestartSeq || 0, shutdownSeq: item.shutdownSeq || 0, appliedShutdownSeq: item.appliedShutdownSeq || 0, monitorUntil: item.monitorUntil || 0, scriptHash: agentScript().hash });
    }
    const clientEvent = p.match(/^\/api\/client\/([^/]+)\/event$/);
    if (clientEvent && req.method === "POST") {
      const item = getMachine(decodeURIComponent(clientEvent[1])); agent(req, item);
      const input = await readBody(req);
      if (input.restoreSeq !== undefined) item.appliedRestoreSeq = Math.max(item.appliedRestoreSeq || 0, number(input.restoreSeq, 0, 100000000, "Sequencia"));
      if (input.restartSeq !== undefined) item.appliedRestartSeq = Math.max(item.appliedRestartSeq || 0, number(input.restartSeq, 0, 100000000, "Sequencia"));
      if (input.shutdownSeq !== undefined) item.appliedShutdownSeq = Math.max(item.appliedShutdownSeq || 0, number(input.shutdownSeq, 0, 100000000, "Sequencia"));
      if (input.openedSessionId && item.session && !item.locked && input.openedSessionId === item.session.id) {
        item.openedSessionId = item.session.id;
        item.openedAt = now();
      }
      event(item.id, label(input.title || "Evento do agente", 80), label(input.detail, 180), "agente"); save();
      return send(res, 200, { ok: true });
    }
    const printRequest = p.match(/^\/api\/client\/([^/]+)\/print-request$/);
    if (printRequest && req.method === "POST") {
      const item = getMachine(decodeURIComponent(printRequest[1])); agent(req, item);
      const input = await readBody(req);
      const pages = number(input.pages, 1, 100000, "Paginas");
      const color = input.color === true;
      const printer = label(input.printer, 80);
      const amountCents = pages * (color ? db.settings.printColorCents : db.settings.printBWCents);
      const printJob = { id: uuid(), at: now(), machineId: item.id, printer, pages, color, amountCents, state: "pending", sessionId: item.session ? item.session.id : null };
      db.printJobs.unshift(printJob);
      db.printJobs.length = Math.min(db.printJobs.length, 200);
      event(item.id, "Impressao solicitada", `${pages} pag ${color ? "colorida" : "P&B"} (${printer})`, "agente");
      save();
      return send(res, 200, { ok: true, printId: printJob.id, amountCents, pages, color });
    }
    const printConfirm = p.match(/^\/api\/client\/([^/]+)\/print-confirm$/);
    if (printConfirm && req.method === "POST") {
      const item = getMachine(decodeURIComponent(printConfirm[1])); agent(req, item);
      const input = await readBody(req);
      const printJob = db.printJobs.find(row => row.id === input.printId && row.machineId === item.id);
      if (!printJob) throw err(404, "Impressao nao encontrada");
      if (input.cancel === true) {
        printJob.state = "cancelled";
        event(item.id, "Impressao cancelada", printJob.printer, "agente");
      } else if (printJob.state === "pending") {
        printJob.state = "confirmed";
        charge("print", `Impressao ${printJob.color ? "colorida" : "P&B"}: ${printJob.pages} pag`, printJob.amountCents, { machineId: item.id, quantity: printJob.pages, color: printJob.color, printPrinter: printJob.printer, printJobId: printJob.id, sessionId: printJob.sessionId });
        event(item.id, "Impressao confirmada", `${printJob.pages} pag`, "agente");
      }
      save();
      return send(res, 200, { ok: true });
    }
    const clientLogin = p.match(/^\/api\/client\/([^/]+)\/login$/);
    if (clientLogin && req.method === "POST") {
      const item = getMachine(decodeURIComponent(clientLogin[1])); agent(req, item);
      const input = await readBody(req);
      const login = label(input.login, 40).toLowerCase();
      const client = login ? db.clients.find(row => row.active && (row.login || "") === login) : null;
      if (!client || !client.passwordHash || !verifyPassword(String(input.password || ""), client)) throw err(401, "Login ou senha incorretos");
      if (item.session) throw err(409, "Maquina ja em uso");
      if (item.maintenance) throw err(409, "Estacao em manutencao");
      if ((item.restoreSeq || 0) > (item.appliedRestoreSeq || 0)) throw err(409, "Restauracao pendente");
      if (status(item) === "offline") throw err(409, "Estacao offline");
      const busy = Object.values(db.machines).find(row => row.session && row.session.clientId === client.id && row.id !== item.id);
      if (busy) throw err(409, `Este cadastro ja esta em uso na estacao ${busy.name}`);
      if ((client.creditSeconds || 0) < 60) throw err(409, "Saldo insuficiente. Peca uma recarga no balcao");
      const minutes = Math.floor(client.creditSeconds / 60);
      const session = { id: uuid(), clientId: client.id, customer: client.name, startedAt: now(), endsAt: new Date(Date.now() + client.creditSeconds * 1000).toISOString(), plannedMinutes: minutes, billingMode: "credit", creditSeconds: client.creditSeconds, rateCentsHour: db.settings.rateCentsHour };
      item.session = session; item.locked = false; item.openedSessionId = null; item.openedAt = null; item.lockMessage = ""; touch(item);
      event(item.id, "Cliente entrou com login", `${client.name}: ${minutes} min`, "cliente");
      save();
      return send(res, 200, { ok: true, clientName: client.name, minutes, creditSeconds: client.creditSeconds });
    }
    if (p === "/api/print/pending-releases" && req.method === "GET") {
      const key = String(url.searchParams.get("key") || "");
      if (key !== db.installKey) throw err(401, "Chave invalida");
      const releases = db.printJobs.filter(row => !row.printedAt && (row.state === "confirmed" || row.state === "cancelled")).map(row => ({ printId: row.id, printer: row.printer, action: row.state === "confirmed" ? "print" : "cancel" }));
      return send(res, 200, { ok: true, releases });
    }
    if (p === "/api/print/released" && req.method === "POST") {
      const input = await readBody(req);
      if (String(input.key || "") !== db.installKey) throw err(401, "Chave invalida");
      const printJob = db.printJobs.find(row => row.id === input.printId);
      if (printJob) { printJob.printedAt = now(); save(); }
      return send(res, 200, { ok: true });
    }
    const printUpload = p.match(/^\/api\/client\/([^/]+)\/print-upload$/);
    if (printUpload && req.method === "POST") {
      // A estacao envia o PDF; o caixa imprime na impressora do Atendimento e so cobra se a impressao sair.
      const item = getMachine(decodeURIComponent(printUpload[1])); agent(req, item);
      const color = url.searchParams.get("color") === "1";
      const pages = number(url.searchParams.get("pages"), 1, 200, "Paginas");
      const printer = color ? db.settings.printColorPrinter : db.settings.printBlackPrinter;
      if (!item.session || item.locked) throw err(409, "Estacao sem sessao ativa");
      if (!printer) throw err(409, `Impressora ${color ? "colorida" : "preto e branco"} nao configurada no Atendimento`);
      const body = await readRaw(req, 60 * 1024 * 1024);
      if (body.subarray(0, 4).toString("latin1") !== "%PDF") throw err(400, "Documento invalido");
      const rate = color ? db.settings.printColorCents : db.settings.printBWCents;
      const printJob = { id: uuid(), at: now(), machineId: item.id, printer, pages, color, amountCents: pages * rate, state: "printing", sessionId: item.session.id };
      db.printJobs.unshift(printJob);
      db.printJobs.length = Math.min(db.printJobs.length, 200);
      event(item.id, "Impressao enviada ao caixa", `${pages} pag ${color ? "colorida" : "P&B"} (${printer})`, "agente");
      save();
      fs.mkdirSync(spoolDir, { recursive: true });
      const file = path.join(spoolDir, `${printJob.id}.pdf`);
      fs.writeFileSync(file, body);
      const run = () => printRunner.print({ file, printer, color });
      const result = await (printQueue = printQueue.then(run, run));
      fs.rmSync(file, { force: true });
      if (!result || !result.ok) {
        printJob.state = "failed"; printJob.error = label(result && result.error ? result.error : "Falha desconhecida", 200);
        event(item.id, "Impressao falhou", `${pages} pag: ${printJob.error}`, "servidor"); save();
        throw err(502, `Nao foi possivel imprimir no caixa: ${printJob.error}`);
      }
      const printed = Number.isInteger(result.pages) && result.pages > 0 ? result.pages : pages;
      printJob.pages = printed; printJob.amountCents = printed * rate;
      printJob.state = "confirmed"; printJob.printedAt = now();
      charge("print", `Impressao ${color ? "colorida" : "P&B"}: ${printed} pag`, printJob.amountCents, { machineId: item.id, quantity: printed, color, printPrinter: printer, printJobId: printJob.id, sessionId: printJob.sessionId });
      event(item.id, "Impressao concluida", `${printed} pag ${color ? "colorida" : "P&B"}`, "servidor"); save();
      return send(res, 200, { ok: true, printId: printJob.id, pages: printed, color, amountCents: printJob.amountCents, printer });
    }
    const clientScreen = p.match(/^\/api\/client\/([^/]+)\/screen$/);
    if (clientScreen && req.method === "POST") {
      const item = getMachine(decodeURIComponent(clientScreen[1])); agent(req, item);
      const input = await readBody(req);
      const image = String(input.image || "");
      if (image.length < 50 || image.length > 1400000) throw err(400, "Imagem invalida");
      screens.set(item.id, { at: Date.now(), image, width: number(input.width, 1, 100000, "Largura"), height: number(input.height, 1, 100000, "Altura") });
      return send(res, 200, { ok: true });
    }
    const clientInput = p.match(/^\/api\/client\/([^/]+)\/input$/);
    if (clientInput && req.method === "GET") {
      const item = getMachine(decodeURIComponent(clientInput[1])); agent(req, item);
      const queue = inputs.get(item.id) || [];
      inputs.set(item.id, []);
      return send(res, 200, { ok: true, events: queue.slice(0, 50), monitorUntil: item.monitorUntil || 0 });
    }
    const clientFrame = p.match(/^\/api\/client\/([^/]+)\/screen-frame$/);
    if (clientFrame && req.method === "POST") {
      // Quadro JPEG binario do monitoramento: bem mais leve que base64 em JSON.
      const item = getMachine(decodeURIComponent(clientFrame[1])); agent(req, item);
      const jpeg = await readRaw(req, 3 * 1024 * 1024);
      if (jpeg.length < 50 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw err(400, "Imagem invalida");
      screens.set(item.id, { at: Date.now(), jpeg, width: number(url.searchParams.get("w"), 1, 100000, "Largura"), height: number(url.searchParams.get("h"), 1, 100000, "Altura") });
      const queue = inputs.get(item.id) || [];
      inputs.set(item.id, []);
      return send(res, 200, { ok: true, events: queue.slice(0, 50), monitorUntil: item.monitorUntil || 0 });
    }
    const clientScriptHash = p.match(/^\/api\/client\/([^/]+)\/script-hash$/);
    if (clientScriptHash && req.method === "GET") {
      // Consulta leve da tarefa de atualizacao (SYSTEM) da estacao; nao altera o estado da maquina.
      const item = getMachine(decodeURIComponent(clientScriptHash[1])); agent(req, item);
      return send(res, 200, { ok: true, hash: agentScript().hash });
    }
    const clientScript = p.match(/^\/api\/client\/([^/]+)\/script$/);
    if (clientScript && req.method === "GET") {
      const item = getMachine(decodeURIComponent(clientScript[1])); agent(req, item);
      const script = agentScript();
      if (!script.text) throw err(404, "Script do agente indisponivel no servidor");
      return send(res, 200, { ok: true, hash: script.hash, script: script.text });
    }

    origin(req);
    const user = operator(req);
    if (p === "/api/me" && req.method === "GET") return send(res, 200, { ok: true, user: publicUser(user) });
    if (p === "/api/logout" && req.method === "POST") {
      const token = (req.headers.cookie || "").match(/(?:^|;\s*)lhm_session=([^;]+)/)?.[1];
      db.loginSessions = db.loginSessions.filter(item => item.tokenHash !== hash(token || "")); save();
      return send(res, 200, { ok: true }, { "set-cookie": "lhm_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
    }
    expire();
    if (p === "/api/state" && req.method === "GET") return send(res, 200, state(user));
    if (p === "/api/quote" && req.method === "GET") {
      const minutes = number(url.searchParams.get("minutes"), 1, 1440, "Minutos");
      return send(res, 200, { ok: true, minutes, amountCents: timeAmountCents(minutes, db.settings) });
    }
    if (p === "/api/reports" && req.method === "GET") return send(res, 200, report(url.searchParams.get("date") || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })));
    if (p === "/api/machines/register" && req.method === "POST") {
      admin(user); const input = await readBody(req); const id = machineId(input.id);
      if (db.machines[id]) throw err(409, "ID ja cadastrado");
      const item = { id, name: label(input.name || id, 60), locked: true, lockMessage: "Aguardando liberacao", session: null, lastSeen: null, createdAt: now(), updatedAt: now(), commandSeq: 1, restoreSeq: 0, restartSeq: 0, appliedRestoreSeq: 0, appliedRestartSeq: 0 };
      db.machines[id] = item; const pairingCode = pair(item); event(id, "Maquina cadastrada", item.name, user.name); save();
      return send(res, 201, { ok: true, machine: publicMachine(item), pairingCode });
    }
    const machineFrame = p.match(/^\/api\/machines\/([^/]+)\/screen\.jpg$/);
    if (machineFrame && req.method === "GET") {
      const item = getMachine(decodeURIComponent(machineFrame[1]));
      const screen = screens.get(item.id);
      if (!screen || !screen.jpeg) { res.writeHead(204, { "cache-control": "no-store" }); return res.end(); }
      res.writeHead(200, { "content-type": "image/jpeg", "content-length": screen.jpeg.length, "cache-control": "no-store", "x-screen-width": screen.width, "x-screen-height": screen.height, "x-screen-at": screen.at });
      return res.end(screen.jpeg);
    }
    const machineScreen = p.match(/^\/api\/machines\/([^/]+)\/screen$/);
    if (machineScreen && req.method === "GET") {
      const item = getMachine(decodeURIComponent(machineScreen[1]));
      const screen = screens.get(item.id);
      return send(res, 200, { ok: true, screen: screen ? { at: screen.at, width: screen.width, height: screen.height, image: screen.jpeg ? screen.jpeg.toString("base64") : screen.image } : null });
    }
    const machineInput = p.match(/^\/api\/machines\/([^/]+)\/input$/);
    if (machineInput && req.method === "POST") {
      const item = getMachine(decodeURIComponent(machineInput[1]));
      const input = await readBody(req);
      const evt = input.event && typeof input.event === "object" ? input.event : null;
      if (!evt) throw err(400, "Evento invalido");
      const queue = inputs.get(item.id) || [];
      if (queue.length < 300) queue.push(evt);
      inputs.set(item.id, queue);
      return send(res, 200, { ok: true });
    }
    const machineAction = p.match(/^\/api\/machines\/([^/]+)\/([^/]+)$/);
    if (machineAction && req.method === "POST") {
      const item = getMachine(decodeURIComponent(machineAction[1])); const action = machineAction[2]; const input = await readBody(req);
      if (action === "pair") { admin(user); const pairingCode = pair(item); save(); return send(res, 200, { ok: true, pairingCode }); }
      if (action === "remove") {
        admin(user); if (item.session) throw err(409, "Encerre a sessao antes de remover");
        delete db.machines[item.id]; event(item.id, "Maquina removida", "", user.name); save(); return send(res, 200, { ok: true });
      }
      if (action === "rename") {
        admin(user);
        const name = label(input.name || item.name, 60);
        const newId = input.id !== undefined && String(input.id).trim() !== "" ? machineId(input.id) : item.id;
        if (newId !== item.id) {
          if (item.session) throw err(409, "Encerre a sessao antes de mudar o ID");
          if (item.agentHash) throw err(409, "Estacao com agente instalado: altere so o nome. Para mudar o ID, remova a estacao e reinstale o agente.");
          if (db.machines[newId]) throw err(409, "ID ja cadastrado");
          delete db.machines[item.id];
          item.id = newId;
          db.machines[newId] = item;
        }
        item.name = name; touch(item);
        event(item.id, "Maquina renomeada", name, user.name); save();
        return send(res, 200, { ok: true, machine: publicMachine(item) });
      }
      if (action === "start") {
        if (item.session) throw err(409, "Maquina ja em uso");
        if ((item.restoreSeq || 0) > (item.appliedRestoreSeq || 0)) throw err(409, "Restauracao pendente. Aguarde a limpeza da estacao terminar");
        if (status(item) === "offline") throw err(409, "Agente offline. Verifique a estacao antes de liberar");
        if (item.maintenance) throw err(409, "Estacao em manutencao");
        const minutes = number(input.minutes, 1, 1440, "Minutos");
        const billingMode = ["prepaid", "postpaid", "credit"].includes(input.billingMode) ? input.billingMode : "postpaid";
        const clientId = input.clientId ? label(input.clientId, 50) : null;
        const client = clientId && db.clients.find(row => row.id === clientId && row.active);
        if (clientId && !client) throw err(400, "Cliente nao encontrado");
        if (billingMode === "credit") {
          if (!client) throw err(400, "Selecione um cliente com saldo");
          if ((client.creditSeconds || 0) < minutes * 60) throw err(409, "Saldo de tempo insuficiente");
          if (Object.values(db.machines).some(row => row.session?.clientId === client.id)) throw err(409, "Cliente ja usa outra estacao");
        }
        const session = { id: uuid(), clientId, customer: billingMode === "credit" ? client.name : label(input.customer, 80), startedAt: now(), endsAt: new Date(Date.now() + minutes * 60000).toISOString(), plannedMinutes: minutes, billingMode, rateCentsHour: db.settings.rateCentsHour };
        if (billingMode === "credit") session.creditSeconds = minutes * 60;
        if (billingMode === "prepaid") {
          if (!currentShift()) throw err(409, "Abra o caixa para venda antecipada");
          if (!METHODS.includes(input.paymentMethod)) throw err(400, "Escolha a forma de pagamento");
          const amount = timeAmountCents(minutes, db.settings); if (amount < 1) throw err(400, "Configure uma tarifa valida");
          const sale = charge("time", `Tempo ${item.name}: ${minutes} min`, amount, { machineId: item.id, clientId, sessionId: session.id });
          pay(sale, sale.amountCents, input.paymentMethod, user.name);
        }
        item.session = session; item.locked = false; item.openedSessionId = null; item.openedAt = null; item.lockMessage = ""; touch(item);
        if (input.waitId) db.waitList = db.waitList.filter(row => row.id !== input.waitId);
        event(item.id, "Maquina liberada", `${minutes} min; ${billingMode}`, user.name);
      } else if (action === "add-time") {
        if (!item.session) throw err(409, "Maquina sem sessao ativa");
        const minutes = number(input.minutes, 1, 1440, "Minutos");
        if (item.session.billingMode === "credit") {
          // Tempo extra com saldo tambem e descontado do cliente no encerramento.
          const client = db.clients.find(row => row.id === item.session.clientId);
          if (!client || (client.creditSeconds || 0) < (item.session.creditSeconds || 0) + minutes * 60) throw err(409, "Saldo do cliente insuficiente para esse tempo extra. Faca uma recarga antes.");
          item.session.creditSeconds = (item.session.creditSeconds || 0) + minutes * 60;
        }
        if (item.session.billingMode === "prepaid") {
          if (!currentShift()) throw err(409, "Abra o caixa para vender tempo");
          if (!METHODS.includes(input.paymentMethod)) throw err(400, "Escolha a forma de pagamento");
          const amount = Math.max(0, timeAmountCents(item.session.plannedMinutes + minutes, db.settings) - timeAmountCents(item.session.plannedMinutes, db.settings)); if (amount < 1) throw err(400, "Configure uma tarifa valida");
          const sale = charge("time", `Tempo extra ${item.name}: ${minutes} min`, amount, { machineId: item.id, clientId: item.session.clientId, sessionId: item.session.id });
          pay(sale, sale.amountCents, input.paymentMethod, user.name);
        }
        item.session.endsAt = new Date(Date.parse(item.session.endsAt) + minutes * 60000).toISOString();
        item.session.plannedMinutes += minutes; touch(item); event(item.id, "Tempo adicionado", `${minutes} min`, user.name);
      } else if (action === "lock") {
        item.locked = true; item.lockMessage = label(input.message || "Bloqueada pelo atendente", 100); touch(item); event(item.id, "Maquina bloqueada", item.lockMessage, user.name);
      } else if (action === "unlock") {
        if (!item.session) throw err(409, "Abra uma sessao antes de desbloquear a estacao");
        item.locked = false; item.lockMessage = ""; touch(item); event(item.id, "Maquina desbloqueada", "", user.name);
      } else if (action === "shutdown") {
        item.shutdownSeq = (item.shutdownSeq || 0) + 1; touch(item); event(item.id, "Desligamento solicitado", "", user.name);
      } else if (action === "power") {
        if (!item.mac) throw err(409, "Estacao sem MAC conhecido. Ligue a estacao uma vez com o agente atualizado.");
        wakeOnLan(item.mac); event(item.id, "Ligar (Wake-on-LAN)", item.mac, user.name);
      } else if (action === "move") {
        if (!item.session) throw err(409, "Estacao sem sessao ativa");
        const target = getMachine(machineId(input.targetId));
        if (target.id === item.id) throw err(400, "Escolha outra estacao");
        if (target.session) throw err(409, "Estacao de destino em uso");
        if (target.maintenance) throw err(409, "Estacao de destino em manutencao");
        if (status(target) === "offline") throw err(409, "Estacao de destino offline");
        if ((target.restoreSeq || 0) > (target.appliedRestoreSeq || 0)) throw err(409, "Estacao de destino com restauracao pendente");
        target.session = item.session; target.locked = false; target.lockMessage = ""; touch(target);
        item.session = null; item.locked = true; item.lockMessage = `Cliente transferido para ${target.name}`; item.restoreSeq = (item.restoreSeq || 0) + 1; touch(item);
        event(item.id, "Sessao transferida", `Para ${target.name}`, user.name);
        event(target.id, "Sessao recebida", `De ${item.name}`, user.name);
      } else if (action === "maintenance") {
        item.maintenance = !item.maintenance;
        item.locked = true;
        item.lockMessage = item.maintenance ? "Em manutencao" : "Aguardando liberacao";
        touch(item); event(item.id, item.maintenance ? "Em manutencao" : "Manutencao encerrada", "", user.name);
      } else if (action === "items") {
        // Consumo na conta da estacao: fica pendente e e recebido no "Encerrar e receber".
        if (!item.session) throw err(409, "Estacao sem sessao ativa");
        const ref = label(input.ref, 80);
        if (ref && db.charges.some(row => row.kind === "sale" && row.ref === ref)) return send(res, 200, { ok: true, duplicate: true, machine: publicMachine(item) });
        const quantities = new Map();
        for (const row of Array.isArray(input.items) ? input.items.slice(0, 50) : []) {
          const productId = label(row.productId, 80);
          quantities.set(productId, (quantities.get(productId) || 0) + number(row.quantity, 1, 1000, "Quantidade"));
        }
        const items = [];
        for (const [productId, quantity] of quantities) {
          const product = db.products.find(row => row.id === productId);
          if (!product || !product.active) throw err(409, "Produto indisponivel");
          if (product.type === "stock" && product.stock < quantity) throw err(409, `Estoque insuficiente: ${product.name}`);
          if (product.priceCents < 1) throw err(409, `Configure o preco: ${product.name}`);
          items.push({ productId, name: product.name, quantity, unitPriceCents: product.priceCents, totalCents: quantity * product.priceCents });
        }
        for (const [color, pages] of [[false, input.printBW], [true, input.printColor]]) {
          if (pages === undefined || pages === null || pages === "" || Number(pages) === 0) continue;
          const count = number(pages, 1, 10000, "Paginas");
          const unit = color ? db.settings.printColorCents : db.settings.printBWCents;
          items.push({ productId: null, name: `Impressão ${color ? "colorida" : "P&B"} (balcão)`, quantity: count, unitPriceCents: unit, totalCents: count * unit });
        }
        if (!items.length) throw err(400, "Adicione ao menos um item");
        const amountCents = items.reduce((sum, row) => sum + row.totalCents, 0);
        charge("sale", `Consumo ${item.name}: ${items.reduce((sum, row) => sum + row.quantity, 0)} item(ns)`, amountCents, { items, ref, machineId: item.id, clientId: item.session.clientId || null, sessionId: item.session.id });
        for (const row of items) {
          const product = row.productId && db.products.find(entry => entry.id === row.productId);
          if (product && product.type === "stock") {
            product.stock -= row.quantity;
            db.stockMovements.unshift({ id: uuid(), at: now(), productId: product.id, delta: -row.quantity, reason: `Consumo ${item.name}`, operator: user.name });
          }
        }
        event(item.id, "Consumo lançado", items.map(row => `${row.quantity}x ${row.name}`).join(", "), user.name);
      } else if (action === "monitor") {
        // Renovacao periodica nao gera evento: so o inicio do monitoramento entra no historico.
        const active = (item.monitorUntil || 0) > Date.now();
        if (input.stop === true) { item.monitorUntil = 0; screens.delete(item.id); }
        else { item.monitorUntil = Date.now() + 120000; if (!active) event(item.id, "Monitoramento remoto", "", user.name); }
      } else if (action === "end") {
        const paymentMethod = input.paymentMethod || "";
        if (paymentMethod && (!METHODS.includes(paymentMethod) || !currentShift())) throw err(409, "Abra o caixa e escolha uma forma de pagamento valida");
        const sessionId = finish(item, "attendant", user.name, true, Boolean(input.restart));
        if (paymentMethod) for (const chargeItem of db.charges.filter(row => row.sessionId === sessionId && row.amountCents > row.paidCents)) {
          pay(chargeItem, chargeItem.amountCents - chargeItem.paidCents, paymentMethod, user.name);
        }
      }
      else throw err(404, "Acao nao encontrada");
      save(); return send(res, 200, { ok: true, machine: publicMachine(item) });
    }
    if (p === "/api/machines/shutdown-all" && req.method === "POST") {
      let count = 0;
      for (const item of Object.values(db.machines)) { item.shutdownSeq = (item.shutdownSeq || 0) + 1; touch(item); count++; }
      event("sistema", "Desligar todas as estacoes", `${count}`, user.name); save();
      return send(res, 200, { ok: true, count });
    }
    if (p === "/api/machines/power-all" && req.method === "POST") {
      let count = 0;
      for (const item of Object.values(db.machines)) if (item.mac) { wakeOnLan(item.mac); count++; }
      event("sistema", "Ligar todas as estacoes (WOL)", `${count}`, user.name); save();
      return send(res, 200, { ok: true, count });
    }
    if (p === "/api/waitlist" && req.method === "POST") {
      const input = await readBody(req); const name = label(input.name, 60);
      if (!name) throw err(400, "Informe o nome");
      const entry = { id: uuid(), name, at: now() };
      db.waitList.unshift(entry); event("lista", "Lista de espera", name, user.name); save();
      return send(res, 201, { ok: true, entry });
    }
    if (p === "/api/waitlist/remove" && req.method === "POST") {
      const input = await readBody(req); const id = label(input.id, 60);
      db.waitList = db.waitList.filter(row => row.id !== id); save();
      return send(res, 200, { ok: true });
    }
    if (p === "/api/clients" && req.method === "POST") {
      const input = await readBody(req); const name = label(input.name, 80);
      if (!name) throw err(400, "Informe o nome");
      const client = { id: uuid(), name, phone: label(input.phone, 30), active: true, createdAt: now(), login: "", salt: "", passwordHash: "", creditSeconds: 0 };
      setClientLogin(client, input.login, input.password);
      db.clients.push(client); event("clientes", "Cliente cadastrado", name, user.name); save();
      return send(res, 201, { ok: true, client: publicClient(client) });
    }
    const clientRecharge = p.match(/^\/api\/clients\/([^/]+)\/recharge$/);
    if (clientRecharge && req.method === "POST") {
      const client = db.clients.find(item => item.id === clientRecharge[1]); if (!client) throw err(404, "Cliente nao encontrado");
      const input = await readBody(req); const amountCents = money(input.amount, "Valor da recarga");
      if (amountCents < 1) throw err(400, "Informe o valor da recarga");
      if (!currentShift()) throw err(409, "Abra o caixa antes de recarregar");
      if (!METHODS.includes(input.paymentMethod)) throw err(400, "Escolha a forma de pagamento");
      const ref = label(input.ref, 60);
      if (ref && db.charges.some(item => item.kind === "credit" && item.ref === ref)) return send(res, 200, { ok: true, duplicate: true, client: publicClient(client) });
      const seconds = Math.round(amountCents / db.settings.rateCentsHour * 3600);
      const sale = charge("credit", `Recarga ${client.name}: R$ ${(amountCents / 100).toFixed(2)}`, amountCents, { clientId: client.id, ref });
      pay(sale, sale.amountCents, input.paymentMethod, user.name);
      client.creditSeconds = (client.creditSeconds || 0) + seconds;
      event("clientes", "Recarga de tempo", `${client.name}: +${Math.round(seconds / 60)} min`, user.name);
      save(); return send(res, 201, { ok: true, client: publicClient(client), secondsAdded: seconds });
    }
    const clientAction = p.match(/^\/api\/clients\/([^/]+)$/);
    if (clientAction && req.method === "POST") {
      const client = db.clients.find(item => item.id === clientAction[1]); if (!client) throw err(404, "Cliente nao encontrado");
      const input = await readBody(req); client.name = label(input.name, 80) || client.name;
      client.phone = label(input.phone, 30); client.active = input.active !== false;
      if ("login" in input) setClientLogin(client, input.login, input.password);
      event("clientes", "Cliente atualizado", client.name, user.name); save(); return send(res, 200, { ok: true, client: publicClient(client) });
    }
    if (p === "/api/sales" && req.method === "POST") {
      const input = await readBody(req);
      if (!currentShift()) throw err(409, "Abra o caixa antes de vender");
      if (!METHODS.includes(input.paymentMethod)) throw err(400, "Escolha a forma de pagamento");
      if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) throw err(400, "Informe de 1 a 50 itens");
      const ref = label(input.ref, 80);
      const existing = ref && db.charges.find(row => row.kind === "sale" && row.ref === ref);
      if (existing) return send(res, 200, { ok: true, duplicate: true, charge: existing });
      const quantities = new Map();
      for (const row of input.items) {
        const id = label(row.productId, 80);
        quantities.set(id, (quantities.get(id) || 0) + number(row.quantity, 1, 1000, "Quantidade"));
      }
      const items = [];
      let amountCents = 0;
      for (const [id, quantity] of quantities) {
        const product = db.products.find(row => row.id === id);
        if (!product || !product.active) throw err(409, "Produto indisponivel");
        if (product.type === "stock" && product.stock < quantity) throw err(409, `Estoque insuficiente: ${product.name}`);
        if (product.priceCents < 1) throw err(409, `Configure o preco: ${product.name}`);
        const totalCents = quantity * product.priceCents;
        amountCents += totalCents;
        items.push({ productId: id, name: product.name, quantity, unitPriceCents: product.priceCents, totalCents });
      }
      if (!Number.isSafeInteger(amountCents) || amountCents > 10000000) throw err(400, "Total da venda acima do limite");
      const sale = charge("sale", `Venda balcao: ${items.reduce((sum, row) => sum + row.quantity, 0)} item(ns)`, amountCents, { items, ref, clientId: input.clientId || null });
      pay(sale, amountCents, input.paymentMethod, user.name);
      for (const row of items) {
        const product = db.products.find(item => item.id === row.productId);
        if (product.type === "stock") {
          product.stock -= row.quantity;
          db.stockMovements.unshift({ id: uuid(), at: now(), productId: product.id, delta: -row.quantity, reason: `Venda ${sale.id}`, operator: user.name });
        }
      }
      event("produtos", "Venda registrada", sale.description, user.name); save();
      return send(res, 201, { ok: true, charge: sale });
    }
    if (p === "/api/products" && req.method === "POST") {
      admin(user); const input = await readBody(req); const name = label(input.name, 100);
      if (!name) throw err(400, "Informe a descricao");
      const code = label(input.code, 50);
      if (code && db.products.some(item => item.code === code)) throw err(409, "Codigo ja cadastrado");
      const product = { id: uuid(), name, code, category: label(input.category, 50), type: input.type === "service" ? "service" : "stock", priceCents: money(input.price, "Preco"), stock: number(input.stock ?? 0, 0, 1000000, "Estoque"), minStock: number(input.minStock ?? 0, 0, 1000000, "Estoque minimo"), active: true, createdAt: now() };
      db.products.push(product); event("produtos", "Produto cadastrado", name, user.name); save();
      return send(res, 201, { ok: true, product });
    }
    const productAction = p.match(/^\/api\/products\/([^/]+)\/(update|stock|sell)$/);
    if (productAction && req.method === "POST") {
      const product = db.products.find(item => item.id === productAction[1]); if (!product) throw err(404, "Produto nao encontrado");
      const input = await readBody(req); const action = productAction[2];
      if (action === "update") {
        admin(user); const code = label(input.code, 50);
        if (code && db.products.some(item => item.id !== product.id && item.code === code)) throw err(409, "Codigo ja cadastrado");
        product.name = label(input.name, 100) || product.name; product.code = code;
        product.category = label(input.category, 50); product.priceCents = money(input.price, "Preco"); product.minStock = number(input.minStock ?? product.minStock ?? 0, 0, 1000000, "Estoque minimo"); product.active = input.active !== false;
        event("produtos", "Produto atualizado", product.name, user.name);
      } else if (action === "stock") {
        admin(user); if (product.type !== "stock") throw err(409, "Servico nao possui estoque");
        const delta = number(input.delta, -100000, 100000, "Ajuste");
        if (!delta || product.stock + delta < 0) throw err(400, "Ajuste deixaria estoque invalido");
        product.stock += delta;
        db.stockMovements.unshift({ id: uuid(), at: now(), productId: product.id, delta, reason: label(input.reason, 100), operator: user.name });
        event("produtos", "Estoque ajustado", `${product.name}: ${delta}`, user.name);
      } else {
        const quantity = number(input.quantity, 1, 1000, "Quantidade");
        if (!product.active) throw err(409, "Produto inativo");
        if (product.type === "stock" && product.stock < quantity) throw err(409, "Estoque insuficiente");
        if (!currentShift()) throw err(409, "Abra o caixa antes de vender");
        if (!METHODS.includes(input.paymentMethod)) throw err(400, "Escolha a forma de pagamento");
        if (product.priceCents < 1) throw err(400, "Configure um preco valido");
        const sale = charge("product", `${quantity} x ${product.name}`, quantity * product.priceCents, { productId: product.id, quantity, clientId: input.clientId || null });
        pay(sale, sale.amountCents, input.paymentMethod, user.name);
        if (product.type === "stock") {
          product.stock -= quantity;
          db.stockMovements.unshift({ id: uuid(), at: now(), productId: product.id, delta: -quantity, reason: "Venda", operator: user.name });
        }
        event("produtos", "Produto vendido", sale.description, user.name);
      }
      save(); return send(res, 200, { ok: true, product });
    }
    if (p === "/api/print/sale" && req.method === "POST") {
      const input = await readBody(req); const pages = number(input.pages, 1, 10000, "Paginas");
      if (!currentShift()) throw err(409, "Abra o caixa antes de registrar impressao");
      if (!METHODS.includes(input.paymentMethod)) throw err(400, "Escolha a forma de pagamento");
      const color = input.color === true;
      const amount = pages * (color ? db.settings.printColorCents : db.settings.printBWCents);
      if (amount < 1) throw err(400, "Configure uma tarifa de impressao valida");
      const sale = charge("print", `Impressao ${color ? "colorida" : "P&B"}: ${pages} pagina(s)`, amount, { machineId: input.machineId || null, quantity: pages });
      pay(sale, sale.amountCents, input.paymentMethod, user.name); save(); return send(res, 201, { ok: true, charge: sale });
    }
    if (p === "/api/cash/open" && req.method === "POST") {
      if (currentShift()) throw err(409, "Caixa ja esta aberto");
      const input = await readBody(req);
      const shift = { id: uuid(), openedAt: now(), openedBy: user.name, openingCents: money(input.opening || 0), closedAt: null, closedBy: null, closingExpectedCents: null, closingCountedCents: null };
      db.cashShifts.unshift(shift); event("caixa", "Caixa aberto", "", user.name); save();
      return send(res, 201, { ok: true, shift });
    }
    if (p === "/api/cash/adjust" && req.method === "POST") {
      const shift = currentShift(); if (!shift) throw err(409, "Caixa fechado");
      const input = await readBody(req); const amountCents = money(input.amount);
      if (amountCents < 1) throw err(400, "Informe o valor");
      const direction = input.direction === "out" ? "out" : "in"; const reason = label(input.reason, 100);
      if (!reason) throw err(400, "Informe o motivo");
      db.cashAdjustments.unshift({ id: uuid(), at: now(), shiftId: shift.id, amountCents, direction, reason, operator: user.name });
      event("caixa", direction === "in" ? "Entrada no caixa" : "Retirada do caixa", reason, user.name); save(); return send(res, 201, { ok: true });
    }
    if (p === "/api/cash/close" && req.method === "POST") {
      admin(user);
      const shift = currentShift(); if (!shift) throw err(409, "Caixa fechado");
      const input = await readBody(req); const counted = money(input.counted, "Valor contado");
      const receivedCash = db.payments.filter(item => item.shiftId === shift.id && item.method === "cash").reduce((sum, item) => sum + item.amountCents, 0);
      const adjustments = db.cashAdjustments.filter(item => item.shiftId === shift.id).reduce((sum, item) => sum + (item.direction === "in" ? item.amountCents : -item.amountCents), 0);
      shift.closingExpectedCents = shift.openingCents + receivedCash + adjustments;
      shift.closingCountedCents = counted; shift.closedAt = now(); shift.closedBy = user.name;
      event("caixa", "Caixa fechado", `Diferenca: ${counted - shift.closingExpectedCents} centavos`, user.name); save();
      return send(res, 200, { ok: true, shift });
    }
    const payment = p.match(/^\/api\/charges\/([^/]+)\/pay$/);
    if (payment && req.method === "POST") {
      const item = db.charges.find(row => row.id === payment[1]); if (!item) throw err(404, "Cobranca nao encontrada");
      const input = await readBody(req); pay(item, money(input.amount), input.method, user.name); save();
      return send(res, 200, { ok: true, charge: item });
    }
    if (p === "/api/settings" && req.method === "POST") {
      admin(user); const input = await readBody(req);
      const timeTable = parseTimeTable(input.timeTable) || db.settings.timeTable;
      const settings = { defaultMinutes: number(input.defaultMinutes, 1, 1440, "Tempo padrao"), autoRestoreOnTimeEnd: input.autoRestoreOnTimeEnd !== false, rateCentsHour: money(input.hourPrice, "Tarifa por hora"), printBWCents: money(input.printBW, "Impressao P&B"), printColorCents: money(input.printColor, "Impressao colorida"), printBlackPrinter: db.settings.printBlackPrinter || "", printColorPrinter: db.settings.printColorPrinter || "", timeTable };
      if (settings.rateCentsHour < 1 || settings.printBWCents < 1 || settings.printColorCents < 1) throw err(400, "Tarifas devem ser maiores que zero");
      db.settings = settings; event("sistema", "Tarifas atualizadas", "", user.name); save();
      return send(res, 200, { ok: true, settings });
    }
    if (p === "/api/printers/local" && req.method === "GET") {
      if (url.searchParams.get("refresh") === "1" || Date.now() - localPrinters.at > 30000) {
        const result = await printRunner.list();
        if (!result || !result.ok) throw err(502, `Nao foi possivel listar as impressoras do caixa: ${(result && result.error) || "erro"}`);
        localPrinters = { at: Date.now(), list: [].concat(result.printers || []).filter(Boolean).map(value => label(value, 200)) };
      }
      return send(res, 200, { ok: true, printers: localPrinters.list, black: db.settings.printBlackPrinter || "", color: db.settings.printColorPrinter || "", blackCents: db.settings.printBWCents, colorCents: db.settings.printColorCents });
    }
    if (p === "/api/settings/print-route" && req.method === "POST") {
      const input = await readBody(req);
      const black = label(input.black, 200), color = label(input.color, 200);
      if (!black || !color) throw err(400, "Escolha a impressora preto e branco e a colorida");
      const changePrice = input.blackPrice !== undefined || input.colorPrice !== undefined;
      if (changePrice) admin(user);
      const blackCents = changePrice ? money(input.blackPrice, "Preço P&B") : db.settings.printBWCents;
      const colorCents = changePrice ? money(input.colorPrice, "Preço colorido") : db.settings.printColorCents;
      if (blackCents < 1 || colorCents < 1) throw err(400, "Preços da impressão devem ser maiores que zero");
      db.settings.printBlackPrinter = black; db.settings.printColorPrinter = color;
      db.settings.printBWCents = blackCents; db.settings.printColorCents = colorCents;
      event("sistema", "Impressoras do atendimento", `P&B: ${black} R$ ${(blackCents / 100).toFixed(2)}; Colorida: ${color} R$ ${(colorCents / 100).toFixed(2)}`, user.name); save();
      return send(res, 200, { ok: true, black, color, blackCents, colorCents });
    }
    if (p === "/api/settings/printers" && req.method === "POST") {
      admin(user); const input = await readBody(req);
      const printers = (Array.isArray(input.printers) ? input.printers : input.printers ? [input.printers] : []).map(value => label(value, 200)).filter(Boolean);
      if (printers.some(value => !/^\\\\[^\s\\]+\\.+$/.test(value))) throw err(400, "Caminho da impressora invalido (use \\\\COMPUTADOR\\NomeCompartilhado)");
      db.printerShares = printers; event("sistema", "Impressoras configuradas", printers.join(", "), user.name); save();
      return send(res, 200, { ok: true, printers });
    }
    if (p === "/api/installer-config" && req.method === "GET") {
      admin(user);
      const shares = db.printerShares && db.printerShares.length ? db.printerShares : ["\\\\DESKTOP-HAA6JTV\\HP432", "\\\\DESKTOP-HAA6JTV\\EPSON4260"];
      const blackPrinter = shares.find(s => /hp|laser|432/i.test(s)) || shares[0];
      const colorPrinter = shares.find(s => /4260|epson|color/i.test(s)) || shares[1] || shares[0];
      return send(res, 200, { ok: true, serverUrl: `http://${lanAddress()}:${port}`, installKey: db.installKey, colorPrinters: ["4260"], printers: shares, printBlackPrinter: blackPrinter, printColorPrinter: colorPrinter });
    }
    if (p === "/api/installer-package" && req.method === "GET") {
      admin(user);
      const folder = path.join(__dirname, "..", "client-agent");
      const files = ["LanHouseAgent.ps1", "Instalar-Agente.bat", "Instalar-Agente.ps1", "Capturar-Padrao.bat", "Capturar-Padrao.ps1", "Executar-Elevado.ps1", "Verificar-Agente.bat"];
      const stationIds = {};
      const ambiguousStations = new Set();
      for (const machine of Object.values(db.machines)) {
        const station = /^(?:m[aá]quina|pc)[\s_-]*0*([1-9][0-9]{0,2})$/i.exec(machine.name)
          || /^(?:maquina|pc)[\s_-]*0*([1-9][0-9]{0,2})$/i.exec(machine.id);
        if (!station) continue;
        const number = station[1];
        if (stationIds[number] && stationIds[number] !== machine.id) ambiguousStations.add(number);
        else stationIds[number] = machine.id;
      }
      for (const number of ambiguousStations) delete stationIds[number];
      const shares = db.printerShares && db.printerShares.length ? db.printerShares : ["\\\\DESKTOP-HAA6JTV\\HP432", "\\\\DESKTOP-HAA6JTV\\EPSON4260"];
      const blackPrinter = shares.find(s => /hp|laser|432/i.test(s)) || shares[0];
      const colorPrinter = shares.find(s => /4260|epson|color/i.test(s)) || shares[1] || shares[0];
      const config = { serverUrl: `http://${lanAddress()}:${port}`, installKey: db.installKey, colorPrinters: ["4260"], printers: shares, printBlackPrinter: blackPrinter, printColorPrinter: colorPrinter, stationIds };
      const instructions = [
        "INSTALACAO DA ESTACAO - LanHouseManager", "",
        "1. Extraia todos os arquivos deste ZIP em uma pasta local da estacao.",
        "2. Entre uma vez no usuario Windows do cliente e prepare Desktop e Downloads.",
        "3. Execute Instalar-Agente.bat, informe o numero da estacao e confirme o administrador. Escolha o usuario cliente se solicitado.",
        "4. Como administrador, execute Capturar-Padrao.bat para salvar o estado padrao.",
        "5. Reinicie e entre no usuario cliente. O agente inicia automaticamente.",
        "6. Execute Verificar-Agente.bat e confirme no painel que a estacao esta online e bloqueada.",
        "7. Teste liberar, encerrar e restaurar antes de instalar nas outras estacoes.", "",
        "Esta configuracao possui uma chave de instalacao. Guarde o pacote na rede interna."
      ].join("\r\n");
      const entries = files.map(name => [name, fs.readFileSync(path.join(folder, name))]);
      entries.push(["install-config.json", JSON.stringify(config, null, 2)], ["LEIA-ME.txt", instructions]);
      const zip = buildZip(entries);
      res.writeHead(200, { "content-type": "application/zip", "content-disposition": 'attachment; filename="LanHouseManager-Estacoes.zip"', "content-length": zip.length, "cache-control": "no-store" });
      return res.end(zip);
    }
    if (p === "/api/installer-config/regenerate" && req.method === "POST") {
      admin(user);
      db.installKey = crypto.randomBytes(12).toString("base64url"); event("sistema", "Chave de instalacao regenerada", "", user.name); save();
      return send(res, 200, { ok: true, serverUrl: `http://${lanAddress()}:${port}`, installKey: db.installKey, printers: db.printerShares });
    }
    if (p === "/api/users" && req.method === "POST") {
      admin(user); const input = await readBody(req); const name = label(input.name, 60);
      if (!name || db.users.some(item => item.name.toLowerCase() === name.toLowerCase())) throw err(409, "Nome de usuario indisponivel");
      const created = makeUser(name, String(input.password || ""), input.role === "admin" ? "admin" : "attendant");
      db.users.push(created); event("sistema", "Usuario criado", name, user.name); save();
      return send(res, 201, { ok: true, user: publicUser(created) });
    }
    const userPassword = p.match(/^\/api\/users\/([^/]+)\/password$/);
    if (userPassword && req.method === "POST") {
      admin(user); const target = db.users.find(item => item.id === userPassword[1]); if (!target) throw err(404, "Usuario nao encontrado");
      const input = await readBody(req); const password = String(input.password || "");
      if (password.length < 10) throw err(400, "Senha deve ter pelo menos 10 caracteres");
      target.salt = crypto.randomBytes(16).toString("hex"); target.passwordHash = passwordHash(password, target.salt);
      db.loginSessions = db.loginSessions.filter(item => item.userId !== target.id);
      event("sistema", "Senha alterada", target.name, user.name); save(); return send(res, 200, { ok: true });
    }
    throw err(404, "API nao encontrada");
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      const files = { "/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/styles.css": "styles.css" };
      const file = files[url.pathname]; if (!file || req.method !== "GET") throw err(404, "Pagina nao encontrada");
      const type = file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : "application/javascript";
      res.writeHead(200, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store", "x-content-type-options": "nosniff" });
      fs.createReadStream(path.join(__dirname, "public", file)).pipe(res);
    } catch (cause) {
      if ((cause.status || 500) >= 500) console.error(cause);
      send(res, cause.status || 500, { ok: false, error: cause.status ? cause.message : "Erro interno" });
    }
  });
  const sweeper = setInterval(() => {
    try { expire(); } catch (cause) { console.error(cause); }
    const nowMs = Date.now();
    for (const [ip, attempt] of attempts) if (attempt.until < nowMs) attempts.delete(ip);
    for (const [ip, attempt] of enrollAttempts) if (attempt.until < nowMs) enrollAttempts.delete(ip);
  }, 15_000);
  server.on("close", () => clearInterval(sweeper));
  return server;
}

module.exports = { createApp };
