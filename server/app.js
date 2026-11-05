const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const dgram = require("node:dgram");
const { execFile } = require("node:child_process");
const { buildZip } = require("./installer-package");
const { readBill, analyzeText, extractText, parseBankCsv } = require("./pdf-conta");
const { readProducts } = require("./importar-produtos");
const { suggestActions, METRICS, actionEffect, goalProgress, TEMPLATES } = require("./plano-acao");
const { syncMarketing, DEFAULT_MARKETING_SOURCE, TASK_NAME: MARKETING_SYNC_TASK, RESULT_FILE: MARKETING_SYNC_RESULT } = require("./marketing-sync");
const { groupOf, PB_GROUP, DEFAULT_PRINT_TIERS, tierUnitCents, parsePrintTiers, normalizationPlan, applyNormalization, revertNormalization } = require("./grupos");
const { buildIndicators, packagesOutstanding } = require("./indicadores");
const { measureGeogrid, findPlaces, DEFAULT_TERMS: GEOGRID_TERMS, GRID_SIZE: GEOGRID_SIZE, SPACING_KM: GEOGRID_SPACING_KM } = require("./geogrid");
const gmbApi = require("./gmb-api");
const ficha = require("./ficha-saude");
const vm = require("node:vm");

const OFFLINE_MS = 20_000;
// Limite de seguranca do tempo livre (a sessao encerra sozinha se ninguem encerrar).
const OPEN_SESSION_MAX_MINUTES = 12 * 60;
const SESSION_MS = 12 * 60 * 60 * 1000;
const METHODS = ["cash", "pix", "card", "debit", "credit"];
const ARCHIVE_AFTER_DAYS = 45;
const BACKUP_KEEP_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const err = (status, message) => Object.assign(new Error(message), { status });
const now = () => new Date().toISOString();
function expensePaymentDate(value, fallback = now()) {
  if (value === undefined || value === "") return fallback;
  const day = String(value);
  const date = new Date(`${day}T12:00:00-03:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) throw err(400, "Data do pagamento invalida");
  return date.toISOString();
}
const uuid = () => crypto.randomUUID();
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const label = (value, max = 100) => String(value ?? "").trim().slice(0, max);
// Conexao do servidor com o Perfil da Empresa no Google (server/gmb-api.js).
const emptyGmbApi = () => ({ clientId: "", clientSecret: "", refreshToken: "", accountName: "", locationName: "", title: "", address: "", connectedAt: null, lastError: null });
const publicUser = user => ({ id: user.id, name: user.name, role: user.role, active: user.active });
const price = (minutes, rate) => Math.round(minutes * rate / 60);
// Valor do tempo arredondado para cima (padrao R$ 0,50) para facilitar o troco; 0 desliga.
function timeAmountCents(minutes, settings) {
  const exact = timeAmountExactCents(minutes, settings);
  const step = Number.isInteger(settings.timeRoundCents) ? settings.timeRoundCents : 50;
  return step > 0 ? Math.ceil(exact / step) * step : exact;
}
function timeAmountExactCents(minutes, settings) {
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
// Custo opcional: vazio = nao cadastrado (o DRE separa a receita sem custo em vez de inventar margem).
function optionalCost(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return money(String(value).replace(",", "."), "Custo");
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
  return { version: 2, createdAt: now(), installKey: crypto.randomBytes(12).toString("base64url"), printerShares: [], settings: { defaultMinutes: 60, autoRestoreOnTimeEnd: true, rateCentsHour: 500, printBWCents: 100, printColorCents: 200, printBlackPrinter: "", printColorPrinter: "", timeTable: [{ minutes: 15, cents: 300 }, { minutes: 30, cents: 370 }, { minutes: 60, cents: 500 }], printTiers: DEFAULT_PRINT_TIERS.map(row => ({ ...row })), printTiersEnabled: false, comboHintsEnabled: true }, machines: {}, events: [], users: [], loginSessions: [], clients: [], products: [], charges: [], payments: [], sessionHistory: [], stockMovements: [], cashShifts: [], cashAdjustments: [], expenses: [], incomes: [], printJobs: [], waitList: [], marketing: { store: {}, updatedAt: null }, geogrid: { key: "", placeId: "", placeName: "", placeAddress: "", runs: [], lastError: null }, gmbApi: emptyGmbApi(), vault: { salt: null, check: null, items: [], updatedAt: null } };
}
function normalize(db) {
  const empty = defaults();
  db.version = 2;
  db.installKey ||= empty.installKey;
  db.printerShares ||= [];
  db.settings = { ...empty.settings, ...(db.settings || {}) };
  if (!Array.isArray(db.settings.timeTable) || !db.settings.timeTable.length) db.settings.timeTable = empty.settings.timeTable.map(row => ({ ...row }));
  // Faixas da impressao P&B comecam desligadas (o dono ativa em Tarifas); avisos de combo comecam ligados.
  if (!Array.isArray(db.settings.printTiers) || !db.settings.printTiers.length) db.settings.printTiers = DEFAULT_PRINT_TIERS.map(row => ({ ...row }));
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
  for (const key of ["events", "users", "loginSessions", "clients", "products", "charges", "payments", "sessionHistory", "stockMovements", "cashShifts", "cashAdjustments", "printJobs", "expenses", "incomes"]) db[key] ||= [];
  db.marketing ||= { store: {}, updatedAt: null };
  db.geogrid ||= { key: "", placeId: "", placeName: "", placeAddress: "", runs: [], lastError: null };
  db.geogrid.runs ||= [];
  db.gmbApi ||= emptyGmbApi();
  db.fichaSaude ||= { health: null, history: [], snapshot: null, changes: [], googleDiff: [], nap: null, lastError: null };
  db.vault ||= { salt: null, check: null, items: [], updatedAt: null };
  db.vault.banks ||= [];
  // Despesa do sistema anterior veio com categoria generica: aluguel volta para Aluguel.
  for (const item of db.expenses) if (item.legacy && /^Despesas Fixas/.test(item.category) && /aluguel/i.test(item.description)) item.category = "Aluguel";
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
  print: ({ file, printer, color, quality }) => runPrintScript(["-Action", "Print", "-Path", file, "-Printer", printer, ...(color ? ["-Color"] : []), "-Quality", quality || "High"]),
};

const DEFAULT_DATA_DIR = path.join(__dirname, "data");
const isOwnerDraw = item => item.category === "Retirada do dono";
// Preco desta venda: o do cadastro, ou o informado no caixa (fica registrado o preco de tabela em listPriceCents).
function salePrice(row, product) {
  if (row.unitPriceCents === undefined || row.unitPriceCents === null || row.unitPriceCents === "") return product.priceCents;
  const v = Number(row.unitPriceCents);
  if (!Number.isInteger(v) || v < 1 || v > 10000000) throw Object.assign(new Error("Preco invalido"), { status: 400 });
  return v;
}
const EXPENSE_CATEGORIES = ["Aluguel", "Energia", "Água", "Internet", "Salários", "Impostos", "Contabilidade", "Tarifas bancárias", "Cartão de crédito", "Sistemas e assinaturas", "Compras de mercadoria", "Insumos gráficos", "Manutenção", "Marketing e anúncios", "Transporte e combustível", "Alimentação", "Retirada do dono", "Outros"];
// Copia diaria em outro disco: se o disco do sistema falhar, caixa, clientes e saldos nao se perdem.
const DEFAULT_OFFSITE_DIR = process.env.LHM_BACKUP_DIR || (process.platform === "win32" ? "C:\\LanHouseManager-Backup" : "");
const OFFSITE_KEEP_DAYS = 30;

// Forca o disco (fsync) antes de trocar o arquivo: queda de energia nao deixa o banco com o final zerado.
function writeDurable(file, text) {
  const fd = fs.openSync(`${file}.tmp`, "w");
  try { fs.writeFileSync(fd, text, "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(`${file}.tmp`, file);
}

function defaultOcrRunner(file) {
  return new Promise(resolve => {
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "ocr.ps1"), "-Path", file], { timeout: 90000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) return resolve({ ok: false, error: (String(stderr).match(/PDF protegido[^\r\n]*|OCR do Windows[^\r\n]*/) || [])[0] || "Nao foi possivel ler a imagem" });
      resolve({ ok: true, text: String(stdout) });
    });
  });
}

function createApp({ dataDir = DEFAULT_DATA_DIR, port = 4780, printRunner = defaultPrintRunner, backupDir, ocrRunner = defaultOcrRunner, marketingSource, marketingDir = path.join(__dirname, "public", "marketing"), placesFetch = globalThis.fetch, gmbFetch = globalThis.fetch, napFetch = globalThis.fetch } = {}) {
  const offsiteDir = backupDir !== undefined ? backupDir : (path.resolve(dataDir) === path.resolve(DEFAULT_DATA_DIR) ? DEFAULT_OFFSITE_DIR : "");
  const mkSource = marketingSource !== undefined ? marketingSource : (path.resolve(dataDir) === path.resolve(DEFAULT_DATA_DIR) ? (process.env.NEXCAFE_MARKETING_SRC || DEFAULT_MARKETING_SOURCE) : "");
  const dbPath = path.join(dataDir, "db.json");
  const vaultKeyFile = path.join(dataDir, "cofre.chave");
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
  let restored = null;
  // Banco ilegivel (ex.: queda de energia): guarda a copia e sobe com o backup diario/externo valido mais recente.
  function loadDb() {
    try { return JSON.parse(fs.readFileSync(dbPath, "utf8")); }
    catch (cause) {
      const kept = `${dbPath}.corrompido-${Date.now()}`;
      fs.copyFileSync(dbPath, kept);
      const candidates = [];
      for (const dir of [dataDir, offsiteDir]) {
        if (!dir || !fs.existsSync(dir)) continue;
        for (const name of fs.readdirSync(dir)) {
          if (!/^db\.json\.\d{4}-\d{2}-\d{2}\.bak$|^db-\d{4}-\d{2}-\d{2}\.json$/.test(name)) continue;
          const file = path.join(dir, name);
          candidates.push({ file, mtime: fs.statSync(file).mtimeMs });
        }
      }
      for (const { file } of candidates.sort((a, b) => b.mtime - a.mtime)) {
        try {
          const data = JSON.parse(fs.readFileSync(file, "utf8"));
          // Antes do primeiro save(): senao a copia diaria/externa do dia receberia o arquivo ilegivel.
          fs.copyFileSync(file, dbPath);
          restored = { file, kept, reason: cause.message };
          console.error(`db.json ilegivel (${cause.message}); restaurado de ${file}, copia guardada em ${kept}`);
          return data;
        } catch { /* backup tambem ilegivel: tenta o proximo */ }
      }
      throw new Error(`db.json ilegivel (${cause.message}) e nenhum backup valido; copia guardada em ${kept}`);
    }
  }
  if (fs.existsSync(dbPath)) {
    db = loadDb();
    if (db.version !== 2) fs.copyFileSync(dbPath, `${dbPath}.antes-v2-${Date.now()}.bak`);
    normalize(db);
    if (restored) event("sistema", "Banco restaurado de backup", `${path.basename(restored.file)}; ilegivel: ${path.basename(restored.kept)}`);
  } else db = defaults();
  let backupDay = "";
  let lastMaintenance = 0;
  let lastOffsite = 0;
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
    const buckets = new Map(), keeps = {};
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
      if (keep.length !== db[key].length) keeps[key] = keep;
    }
    if (buckets.size === 0) return false;
    for (const [month, bucket] of buckets) {
      const file = path.join(dataDir, `archive-${month}.json`);
      let existing = {};
      if (fs.existsSync(file)) {
        try { existing = JSON.parse(fs.readFileSync(file, "utf8")); }
        catch {
          // Nunca sobrescreve um arquivo mensal ilegivel: guarda a copia e deixa os registros no banco.
          fs.copyFileSync(file, `${file}.corrompido-${Date.now()}`);
          console.error(`Arquivo mensal ilegivel, arquivamento adiado: ${file}`);
          return false;
        }
      }
      for (const key of Object.keys(bucket)) {
        const merged = (existing[key] || []).concat(bucket[key]);
        existing[key] = [...new Map(merged.map(item => [item.id, item])).values()];
      }
      writeDurable(file, JSON.stringify(existing));
    }
    // So agora (arquivos mensais gravados) os registros saem do banco.
    for (const [key, keep] of Object.entries(keeps)) db[key] = keep;
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
          // Anexos (PDF/fotos das contas, prints das dividas) e arquivos mensais: copia o que ainda nao esta la.
          if (fs.existsSync(vaultKeyFile)) { fs.mkdirSync(path.join(offsiteDir, "anexos"), { recursive: true }); fs.copyFileSync(vaultKeyFile, path.join(offsiteDir, "anexos", "cofre.chave")); }
          for (const sub of ["contas", "provas"]) {
            const from = path.join(dataDir, sub), to = path.join(offsiteDir, "anexos", sub);
            if (!fs.existsSync(from)) continue;
            fs.mkdirSync(to, { recursive: true });
            for (const name of fs.readdirSync(from)) if (!fs.existsSync(path.join(to, name))) fs.copyFileSync(path.join(from, name), path.join(to, name));
          }
          for (const name of fs.readdirSync(dataDir)) if (/^archive-\d{4}-\d{2}\.json$/.test(name)) fs.copyFileSync(path.join(dataDir, name), path.join(offsiteDir, name));
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
    const text = JSON.stringify(db);
    writeDurable(dbPath, text);
    // Copia externa do banco JA gravado a cada 15 min: o arquivo do dia guarda o estado mais recente daquele dia.
    if (offsiteDir && Date.now() - lastOffsite > 15 * 60000) {
      lastOffsite = Date.now();
      try {
        fs.mkdirSync(offsiteDir, { recursive: true });
        writeDurable(path.join(offsiteDir, `db-${day}.json`), text);
      } catch (cause) { console.error(`Backup externo do banco falhou: ${cause.message}`); }
    }
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
  // Sessao pausada (cliente saiu e volta): o relogio fica parado no momento da pausa.
  const sessionNow = session => session.pausedAt ? Date.parse(session.pausedAt) : Date.now();
  function sessionCost(item) {
    const session = item.session;
    if (!session) return { timeCents: 0, printCents: 0, extrasCents: 0, totalCents: 0 };
    const elapsedSeconds = Math.max(1, Math.ceil((sessionNow(session) - Date.parse(session.startedAt)) / 1000));
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
    const elapsedSeconds = Math.max(1, Math.ceil((sessionNow(session) - Date.parse(session.startedAt)) / 1000));
    const usedMinutes = Math.min(session.plannedMinutes, Math.max(1, Math.ceil(elapsedSeconds / 60)));
    const cost = sessionCost(item);
    const client = db.clients.find(row => row.id === session.clientId);
    const prints = db.charges.filter(row => row.sessionId === session.id && row.kind === "print").map(row => ({ color: row.color === true, pages: row.quantity || 0, amountCents: row.amountCents }));
    const extras = db.charges.filter(row => row.sessionId === session.id && row.kind === "sale").flatMap(row => row.items || []).map(row => ({ name: row.name, quantity: row.quantity, amountCents: row.totalCents }));
    return { customer: session.customer || (client ? client.name : "Avulso"), billingMode: session.billingMode, open: session.open === true, plannedMinutes: session.plannedMinutes, usedMinutes, startedAt: session.startedAt, timeCents: cost.timeCents, prints, printCents: cost.printCents, extras, extrasCents: cost.extrasCents, totalCents: cost.totalCents };
  }
  function publicMachine(item) {
    const { agentHash, pairingHash, pairingExpiresAt, ...safe } = item;
    const cost = sessionCost(item);
    return { ...safe, status: status(item), valueCents: cost.totalCents, timeCents: cost.timeCents, printCents: cost.printCents, extrasCents: cost.extrasCents, summary: sessionSummary(item), remainingMs: item.session ? Math.max(0, Date.parse(item.session.endsAt) - sessionNow(item.session)) : 0 };
  }
  const publicClient = client => ({ id: client.id, name: client.name, phone: client.phone, active: client.active, createdAt: client.createdAt, login: client.login || "", creditSeconds: client.creditSeconds || 0, origin: client.origin || "", printPackages: client.printPackages || [] });
  // Marketing: de onde o cliente veio e qual campanha trouxe a venda.
  const ORIGINS = ["Passou na frente", "Indicação", "Google", "Instagram", "Facebook", "WhatsApp", "Cliente antigo", "Outro"];
  const pickOrigin = value => ORIGINS.includes(value) ? value : "";
  const FIN_PRODUCTS = ["Consignado INSS", "Antecipação FGTS", "Consignado CLT", "Portabilidade", "Refinanciamento", "Financiamento de veículos"];
  const LEAD_STAGES = [{ key: "new", label: "Novo contato" }, { key: "simulated", label: "Simulado" }, { key: "proposal", label: "Proposta enviada" }, { key: "won", label: "Contratado" }, { key: "lost", label: "Não fechou" }];
  const LEAD_SOURCES = ["Serviço da loja", "Indicação", "Campanha", "Passou na frente", "WhatsApp", "Instagram", "Facebook", "Google", "Cliente antigo", "Outro"];
  const campaignCode = value => { const code = label(value, 20).toUpperCase(); return code && (db.campaigns || []).some(c => c.code === code) ? code : ""; };
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
  // receiptId: mesmo valor em todos os pagamentos de um recebimento (ex.: Receber da maquina quita varias pendencias).
  function pay(item, amountCents, method, operator, receiptId) {
    const shift = currentShift(); if (!shift) throw err(409, "Abra o caixa antes de receber");
    if (!METHODS.includes(method)) throw err(400, "Forma de pagamento invalida");
    if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > item.amountCents - item.paidCents) throw err(400, "Valor excede a pendencia");
    item.paidCents += amountCents;
    db.payments.unshift({ id: uuid(), at: now(), chargeId: item.id, amountCents, method, shiftId: shift.id, operator, ...(receiptId ? { receiptId } : {}) });
    event(item.machineId || "caixa", "Pagamento registrado", item.description, operator);
  }
  // Desconto em pendencias: abate do tempo primeiro, depois do resto. Fica em discountCents (relatorios e auditoria por operador).
  function discountCharges(list, cents, operator) {
    let left = Math.max(0, Number.isInteger(cents) ? cents : 0);
    const pending = list.filter(row => row.amountCents > row.paidCents).sort((a, b) => (b.kind === "time") - (a.kind === "time"));
    for (const row of pending) {
      const cut = Math.min(left, row.amountCents - row.paidCents);
      if (!cut) continue;
      row.originalTotalCents ??= row.amountCents;
      row.amountCents -= cut; row.discountCents = (row.discountCents || 0) + cut; row.operator = operator;
      left -= cut;
    }
    return Math.max(0, Number.isInteger(cents) ? cents : 0) - left;
  }
  // Quita as pendencias num recebimento so (mesmo receiptId). cashCents: parte paga em dinheiro
  // (pagamento dividido), abatida primeiro; o restante vai em method. Quem chama valida caixa e forma antes.
  function receiveCharges(list, method, operator, cashCents = 0) {
    const receiptId = uuid();
    let cashLeft = Math.max(0, Number.isInteger(cashCents) ? cashCents : 0), receivedCents = 0;
    for (const row of list) {
      let open = row.amountCents - row.paidCents;
      const cash = Math.min(cashLeft, open);
      if (cash > 0) { pay(row, cash, "cash", operator, receiptId); cashLeft -= cash; open -= cash; receivedCents += cash; }
      if (open > 0) { pay(row, open, method, operator, receiptId); receivedCents += open; }
    }
    return { receiptId, receivedCents };
  }
  function finish(item, reason, operator, restore = true, restart = false) {
    const session = item.session; if (!session) throw err(409, "Maquina sem sessao ativa");
    const elapsedSeconds = Math.max(1, Math.ceil((sessionNow(session) - Date.parse(session.startedAt)) / 1000));
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
    for (const item of Object.values(db.machines)) if (item.session && !item.session.pausedAt && Date.parse(item.session.endsAt) <= Date.now()) { finish(item, "expired", "sistema", db.settings.autoRestoreOnTimeEnd); changed = true; }
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
    if (!token || !item.agentHash || hash(token) !== item.agentHash) {
      // Diferencia no painel "PC desligado" de "PC ligado com vinculo antigo" (so em memoria).
      if (token) item.rejectedAt = now();
      throw err(401, "Agente nao autorizado");
    }
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
    const today = localDay(Date.now());
    const thisMonth = today.slice(0, 7);
    const todayPayments = (db.payments || []).filter(item => localDay(item.at) === today);
    const todaySalesCents = todayPayments.reduce((sum, item) => sum + item.amountCents, 0);
    const monthSalesCents = (db.payments || []).filter(item => localDay(item.at).startsWith(thisMonth)).reduce((sum, item) => sum + item.amountCents, 0);
    const zeroStockProducts = (db.products || []).filter(p => p.active !== false && (p.stock || 0) <= 0);
    const lateDebts = openCharges.filter(c => (Date.now() - Date.parse(c.at)) > 30 * 86400000);
    const lateBills = (db.expenses || []).filter(item => item.paid === false && Date.parse(item.at) < Date.now());
    return {
      ok: true,
      user: publicUser(user),
      settings: db.settings,
      machines: Object.values(db.machines).map(publicMachine),
      events: db.events.slice(0, 60),
      clients: db.clients.map(publicClient),
      products: db.products.map(item => ({ ...item, group: groupOf(item) })),
      charges: db.charges.slice(0, 200),
      openCharges,
      payments: db.payments.slice(0, 150),
      cashShift: shift,
      cashSummary: {
        expectedCashCents: shift ? shift.openingCents + cashReceivedCents + adjustmentCents : 0,
        receivedCents: shiftPayments.reduce((sum, item) => sum + item.amountCents, 0),
        pendingCents: openCharges.reduce((sum, item) => sum + item.amountCents - item.paidCents, 0),
        todaySalesCents,
        monthSalesCents,
        dailyGoalCents: db.settings?.dailyGoalCents || 50000,
        monthGoalCents: db.settings?.monthGoalCents || 3000000
      },
      hudAlerts: {
        overdueBillsCount: lateBills.length,
        overdueBillsCents: lateBills.reduce((s, b) => s + b.amountCents, 0),
        zeroStockCount: zeroStockProducts.length,
        lateDebtsCount: lateDebts.length,
        lateDebtsCents: lateDebts.reduce((s, c) => s + c.amountCents - c.paidCents, 0)
      },
      cashShifts: db.cashShifts.slice(0, 30),
      cashAdjustments: db.cashAdjustments.slice(0, 150),
      users: user.role === "admin" ? db.users.map(publicUser) : [],
      printers: user.role === "admin" ? db.printerShares : [],
      printJobs: db.printJobs.slice(0, 20),
      waitList: db.waitList,
      campaigns: (db.campaigns || []).filter(c => c.active).map(c => ({ code: c.code, name: c.name })),
      origins: ORIGINS,
      billsDue: user.role === "admin" ? db.expenses.filter(item => item.paid === false && Date.parse(item.at) < Date.now() + 3 * 86400000).map(item => ({ id: item.id, at: item.at, description: item.description, amountCents: item.amountCents })) : [],
      serverTime: now()
    };
  }
  // Datas locais (America/Sao_Paulo) no formato AAAA-MM-DD; comparacao por texto.
  function localDay(value) { return new Date(value).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }
  function shiftDay(day, days) { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
  function periodRange(date, period, customStart, customEnd) {
    if (period === "custom" && customStart && customEnd) {
      const start = customStart <= customEnd ? customStart : customEnd;
      const end = customStart <= customEnd ? customEnd : customStart;
      return { start, end, prevStart: null, prevEnd: null };
    }
    if (period === "month") {
      const start = `${date.slice(0, 7)}-01`;
      const end = shiftDay(`${shiftDay(start, 32).slice(0, 7)}-01`, -1);
      const prevStart = `${shiftDay(start, -1).slice(0, 7)}-01`;
      return { start, end, prevStart, prevEnd: shiftDay(start, -1) };
    }
    if (period === "all") return { start: "0000-00-00", end: "9999-12-31", prevStart: null, prevEnd: null };
    const days = { "7d": 7, "15d": 15, "30d": 30, "60d": 60, "90d": 90 }[period] || 1;
    const start = shiftDay(date, 1 - days);
    return { start, end: date, prevStart: shiftDay(start, -days), prevEnd: shiftDay(start, -1) };
  }
  // Tudo que ja foi para os arquivos mensais (mais de 45 dias) tambem entra nos relatorios.
  function historyRecords(key) {
    const rows = db[key] || [];
    const extra = [];
    for (const name of fs.readdirSync(dataDir)) {
      if (!/^archive-\d{4}-\d{2}\.json$/.test(name)) continue;
      try { extra.push(...(JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"))[key] || [])); } catch { }
    }
    return extra.length ? rows.concat(extra) : rows;
  }

  // Quantidade e receita de cada produto em todo o historico (decide qual cadastro duplicado fica).
  function soldByProduct() {
    const sold = new Map();
    for (const c of historyRecords("charges")) for (const it of c.items || []) {
      if (!it.productId) continue;
      const row = sold.get(it.productId) || { quantity: 0, revenueCents: 0 };
      row.quantity += it.quantity || 0; row.revenueCents += it.totalCents || 0; sold.set(it.productId, row);
    }
    return sold;
  }

  function report(inputDate) {
    const today = localDay(Date.now());
    let date = typeof inputDate === "string" ? inputDate : (inputDate?.date || today);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = today;
    const period = ["today", "month", "7d", "15d", "30d", "60d", "90d", "all", "custom"].includes(inputDate?.period) ? inputDate.period : "today";
    const customStart = inputDate?.start && /^\d{4}-\d{2}-\d{2}$/.test(inputDate.start) ? inputDate.start : null;
    const customEnd = inputDate?.end && /^\d{4}-\d{2}-\d{2}$/.test(inputDate.end) ? inputDate.end : null;
    const range = periodRange(date, period, customStart, customEnd);
    const inRange = (value, start, end) => { if (!value || !start) return false; const d = localDay(value); return d >= start && d <= end; };
    const onDate = value => inRange(value, range.start, range.end);
    // Custo de papel e tinta por pagina (Metas e taxas).
    const printCost = sale => {
      const pages = sale.quantity || Number((String(sale.description).match(/(\d+) pag/) || [])[1]) || 1;
      const perPage = (sale.color || /colorida/i.test(sale.description)) ? db.settings.printColorCostCents : db.settings.printBWCostCents;
      return perPage ? pages * perPage : 0;
    };

    // Pacote pre-pago e dinheiro recebido antes de prestar o servico: entra no caixa (pagamentos),
    // mas so vira venda quando as paginas sao entregues (cobranca "Entrega do pacote").
    const allCharges = historyRecords("charges").filter(item => item.kind !== "package");
    const allPayments = historyRecords("payments");
    const charges = allCharges.filter(item => onDate(item.at)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const payments = allPayments.filter(item => onDate(item.at));
    const sessions = historyRecords("sessionHistory").filter(item => onDate(item.endedAt));
    const expenses = (db.expenses || []).filter(item => onDate(item.at)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const productById = new Map(db.products.map(item => [item.id, item]));

    const byMethod = { cash: 0, pix: 0, card: 0, debit: 0, credit: 0 };
    for (const item of payments) {
      if (byMethod[item.method] !== undefined) byMethod[item.method] += item.amountCents;
      else byMethod.card += item.amountCents;
    }
    const byMachine = {};
    for (const item of sessions) { byMachine[item.machineId] ||= { machineId: item.machineId, name: db.machines[item.machineId]?.name || item.machineId, count: 0, minutes: 0 }; byMachine[item.machineId].count++; byMachine[item.machineId].minutes += item.usedMinutes; }
    const byOperator = {};
    for (const payment of payments) {
      const name = payment.operator || "Sistema";
      byOperator[name] ||= { name, receivedCents: 0, payments: 0 };
      byOperator[name].receivedCents += payment.amountCents;
      byOperator[name].payments++;
    }

    const byCategory = {
      "Gráfica Rápida": { count: 0, revenueCents: 0, color: "#0284c7" },
      "Lan House & Serviços Digitais": { count: 0, revenueCents: 0, color: "#d4a000" },
      "Serviços Públicos": { count: 0, revenueCents: 0, color: "#059669" },
      "Bomboniere & Bebidas": { count: 0, revenueCents: 0, color: "#e11d48" },
      "Serviços Financeiros": { count: 0, revenueCents: 0, color: "#0d9488" },
      "Informática & Celular": { count: 0, revenueCents: 0, color: "#2563eb" },
      "Eletrônicos & Acessórios": { count: 0, revenueCents: 0, color: "#ea580c" }
    };
    const byProduct = {};
    const byDay = {};
    const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, salesCents: 0 }));
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
    const byWeekday = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map(name => ({ name, count: 0, salesCents: 0, days: new Set() }));
    const printAudit = {
      bwPages: 0,
      bwRevenueCents: 0,
      colorPages: 0,
      colorRevenueCents: 0,
      xeroxCount: 0,
      xeroxRevenueCents: 0,
      scanCount: 0,
      scanRevenueCents: 0,
      laminationCount: 0,
      laminationRevenueCents: 0,
      otherGraphicCount: 0,
      otherGraphicRevenueCents: 0,
      totalPages: 0,
      paperReamsEst: 0,
      totalGraphicRevenueCents: 0,
      printers: {}
    };
    let cmvCents = 0, printCmvCents = 0, productCmvCents = 0, costedRevenueCents = 0, uncostedRevenueCents = 0, legacyCents = 0, discountCents = 0, todayCents = 0;
    for (const sale of charges) {
      const local = new Date(new Date(sale.at).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const day = localDay(sale.at);
      byDay[day] ||= { date: day, salesCents: 0, count: 0 };
      byDay[day].salesCents += sale.amountCents; byDay[day].count++;
      heat[local.getDay()][local.getHours()]++; byHour[local.getHours()].count++; byHour[local.getHours()].salesCents += sale.amountCents;
      const weekday = byWeekday[local.getDay()]; weekday.count++; weekday.salesCents += sale.amountCents; weekday.days.add(day);
      if (day === today) todayCents += sale.amountCents;
      discountCents += sale.discountCents || 0;
      if (sale.legacy) { legacyCents += sale.amountCents; }

      // Auditoria grafica (paginas e copias)
      if (sale.kind === "print") {
        const isColor = Boolean(sale.color || /colorida/i.test(sale.description));
        const pages = sale.quantity || Number((String(sale.description).match(/(\d+)\s*p[aá]g/i) || [])[1]) || 1;
        const prName = sale.printPrinter || "Impressora de rede";
        printAudit.printers[prName] ||= { name: prName, pages: 0, jobs: 0 };
        printAudit.printers[prName].pages += pages;
        printAudit.printers[prName].jobs++;
        if (isColor) {
          printAudit.colorPages += pages;
          printAudit.colorRevenueCents += sale.amountCents;
        } else {
          printAudit.bwPages += pages;
          printAudit.bwRevenueCents += sale.amountCents;
        }
      }

      const fallbackCategory = sale.kind === "print" ? "Gráfica Rápida" : "Lan House & Serviços Digitais";
      const rows = sale.kind === "sale" ? sale.items || [] : sale.kind === "product" ? [{ productId: sale.productId, name: productById.get(sale.productId)?.name || sale.description, quantity: sale.quantity || 1, totalCents: sale.amountCents }] : [{ name: sale.kind === "time" ? "Tempo de máquina" : sale.kind === "print" ? (/colorida/i.test(sale.description) ? "Impressão colorida (estação)" : "Impressão P&B (estação)") : sale.description, quantity: 1, totalCents: sale.amountCents, category: fallbackCategory }];
      // Cancelamento reduz o valor da cobranca: proporcao aplicada aos itens para o total bater.
      const itemsTotal = rows.reduce((sum, r) => sum + (r.totalCents || 0), 0);
      const ratio = itemsTotal > 0 ? sale.amountCents / itemsTotal : 0;
      if (sale.kind === "print" && !sale.legacy && (db.settings.printBWCostCents || db.settings.printColorCostCents)) {
        const cost = printCost(sale); cmvCents += cost; printCmvCents += cost; costedRevenueCents += sale.amountCents;
        const key = rows[0].name; byProduct[key] ||= { productId: key, name: key, category: "Gráfica Rápida", quantity: 0, amountCents: 0, costCents: 0 };
        byProduct[key].quantity += sale.quantity || 1; byProduct[key].amountCents += sale.amountCents; byProduct[key].costCents += cost;
        const cat = byCategory["Gráfica Rápida"]; cat.count += sale.quantity || 1; cat.revenueCents += sale.amountCents;
        continue;
      }
      for (const r of rows) {
        const product = r.productId ? productById.get(r.productId) : null;
        const revenue = Math.round((r.totalCents || 0) * ratio);
        const cat = r.category || product?.category || fallbackCategory;
        const target = byCategory[cat] || (byCategory[cat] = { count: 0, revenueCents: 0, color: "#64748b" });
        target.count += (r.quantity || 1);
        target.revenueCents += revenue;

        // Auditoria grafica em itens de balcao (Xerox, Impressoes, Scanner, Plastificacao)
        if (sale.kind !== "print") {
          const nameLower = (r.name || "").toLowerCase();
          const qty = r.quantity || 1;
          const isColor = /color/i.test(nameLower);
          if (/xerox|c[oó]pia/i.test(nameLower) && !/cd|dvd/i.test(nameLower)) {
            printAudit.xeroxCount += qty;
            printAudit.xeroxRevenueCents += revenue;
            if (isColor) { printAudit.colorPages += qty; printAudit.colorRevenueCents += revenue; }
            else { printAudit.bwPages += qty; printAudit.bwRevenueCents += revenue; }
          } else if (/impress[aã]o/i.test(nameLower)) {
            if (isColor) { printAudit.colorPages += qty; printAudit.colorRevenueCents += revenue; }
            else { printAudit.bwPages += qty; printAudit.bwRevenueCents += revenue; }
          } else if (/scan|digitaliz/i.test(nameLower)) {
            printAudit.scanCount += qty;
            printAudit.scanRevenueCents += revenue;
          } else if (/plastif|encadern/i.test(nameLower)) {
            printAudit.laminationCount += qty;
            printAudit.laminationRevenueCents += revenue;
          } else if (cat === "Gráfica Rápida") {
            printAudit.otherGraphicCount += qty;
            printAudit.otherGraphicRevenueCents += revenue;
          }
        }

        if (sale.legacy) continue;
        const key = r.productId || r.name;
        byProduct[key] ||= { productId: key, name: r.name, category: cat, quantity: 0, amountCents: 0, costCents: null };
        byProduct[key].quantity += r.quantity || 1;
        byProduct[key].amountCents += revenue;
        if (product && Number.isInteger(product.costCents)) {
          const cost = product.costCents * (r.quantity || 1);
          cmvCents += cost; productCmvCents += cost; costedRevenueCents += revenue;
          byProduct[key].costCents = (byProduct[key].costCents || 0) + cost;
        } else uncostedRevenueCents += revenue;
      }
    }
    for (const row of Object.values(byProduct)) row.profitCents = row.costCents === null ? null : row.amountCents - row.costCents;

    printAudit.totalPages = printAudit.bwPages + printAudit.colorPages;
    printAudit.paperReamsEst = Math.round((printAudit.totalPages / 500) * 10) / 10;
    printAudit.totalGraphicRevenueCents = printAudit.bwRevenueCents + printAudit.colorRevenueCents + printAudit.scanRevenueCents + printAudit.laminationRevenueCents + printAudit.otherGraphicRevenueCents;
    printAudit.printersList = Object.values(printAudit.printers).sort((a, b) => b.pages - a.pages);

    // Horarios de pico e analise por turno
    const activeHours = byHour.filter(h => h.hour >= 8 && h.hour <= 22);
    const peakHour = activeHours.length ? activeHours.reduce((best, h) => (h.salesCents > best.salesCents || (h.salesCents === best.salesCents && h.count > best.count)) ? h : best, activeHours[0]) : null;
    const slowCandidates = activeHours.filter(h => h.count > 0);
    const slowHour = slowCandidates.length ? slowCandidates.reduce((slowest, h) => h.count < slowest.count ? h : slowest, slowCandidates[0]) : null;
    const dayparts = [
      { id: "morning", name: "Manhã", range: "08h às 12h", icon: "🌅", count: 0, salesCents: 0 },
      { id: "lunch", name: "Almoço", range: "12h às 14h", icon: "☀️", count: 0, salesCents: 0 },
      { id: "afternoon", name: "Tarde", range: "14h às 18h", icon: "⚡", count: 0, salesCents: 0 },
      { id: "night", name: "Noite", range: "18h às 22h", icon: "🌙", count: 0, salesCents: 0 }
    ];
    for (const h of byHour) {
      if (h.hour >= 8 && h.hour < 12) { dayparts[0].count += h.count; dayparts[0].salesCents += h.salesCents; }
      else if (h.hour >= 12 && h.hour < 14) { dayparts[1].count += h.count; dayparts[1].salesCents += h.salesCents; }
      else if (h.hour >= 14 && h.hour < 18) { dayparts[2].count += h.count; dayparts[2].salesCents += h.salesCents; }
      else if (h.hour >= 18 && h.hour < 22) { dayparts[3].count += h.count; dayparts[3].salesCents += h.salesCents; }
    }
    const hourlyPeak = {
      peakHour: peakHour ? { hour: peakHour.hour, count: peakHour.count, salesCents: peakHour.salesCents, label: `${String(peakHour.hour).padStart(2, "0")}h às ${String(peakHour.hour + 1).padStart(2, "0")}h` } : null,
      slowHour: slowHour ? { hour: slowHour.hour, count: slowHour.count, salesCents: slowHour.salesCents, label: `${String(slowHour.hour).padStart(2, "0")}h às ${String(slowHour.hour + 1).padStart(2, "0")}h` } : null,
      dayparts
    };

    const salesCents = charges.reduce((sum, item) => sum + item.amountCents, 0);
    const receivedCents = payments.reduce((sum, item) => sum + item.amountCents, 0);
    const openCharges = db.charges.filter(item => item.amountCents > item.paidCents);
    const dueCents = openCharges.reduce((sum, item) => sum + item.amountCents - item.paidCents, 0);
    // Retirada do dono nao e despesa da loja: sai depois do lucro, em linha propria.
    const ownerDrawCents = expenses.filter(isOwnerDraw).reduce((sum, item) => sum + item.amountCents, 0);
    const expensesCents = expenses.filter(item => !isOwnerDraw(item)).reduce((sum, item) => sum + item.amountCents, 0);
    const byExpenseCategory = {};
    for (const item of expenses.filter(item => !isOwnerDraw(item))) byExpenseCategory[item.category] = (byExpenseCategory[item.category] || 0) + item.amountCents;

    // Configuracoes de taxas e calculo de custos
    const settings = db.settings || {};
    const incomes = (db.incomes || []).filter(item => onDate(item.at)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const incomesCents = incomes.reduce((sum, item) => sum + item.amountCents, 0);
    const feePct = { debit: settings.feeDebitPct || 0, credit: settings.feeCreditPct || 0, card: settings.feeCardPct || 0, pix: settings.feePixPct || 0, cash: 0 };
    const feeOf = rows => rows.reduce((sum, item) => sum + Math.round(item.amountCents * (feePct[item.method] || 0) / 100), 0);
    const feesCents = feeOf(payments);
    const byFee = Object.fromEntries(Object.keys(byMethod).map(method => [method, Math.round(byMethod[method] * (feePct[method] || 0) / 100)]));
    const costOfCharge = sale => {
      if (sale.kind === "print" && !sale.legacy) return printCost(sale);
      if (sale.legacy || sale.kind !== "sale") return 0;
      return (sale.items || []).reduce((sum, r) => { const product = r.productId ? productById.get(r.productId) : null; return sum + (product && Number.isInteger(product.costCents) ? product.costCents * (r.quantity || 1) : 0); }, 0);
    };

    // Periodo anterior do mesmo tamanho: base do comparativo.
    const prevCharges = range.prevStart ? allCharges.filter(item => inRange(item.at, range.prevStart, range.prevEnd)) : [];
    const prevPayments = range.prevStart ? allPayments.filter(item => inRange(item.at, range.prevStart, range.prevEnd)) : [];
    const prevByDayMap = {};
    for (const sale of prevCharges) { const d = localDay(sale.at); prevByDayMap[d] ||= { date: d, salesCents: 0, count: 0 }; prevByDayMap[d].salesCents += sale.amountCents; prevByDayMap[d].count++; }
    const summaryOf = (list, pays, start, end) => {
      const sales = list.reduce((sum, item) => sum + item.amountCents, 0);
      const exp = (db.expenses || []).filter(item => start && inRange(item.at, start, end) && !isOwnerDraw(item)).reduce((sum, item) => sum + item.amountCents, 0);
      const fees = feeOf(pays);
      const cmv = list.reduce((sum, sale) => sum + costOfCharge(sale), 0);
      const profit = sales - fees - cmv - exp;
      return {
        salesCents: sales,
        count: list.length,
        ticketCents: list.length ? Math.round(sales / list.length) : 0,
        receivedCents: pays.reduce((sum, item) => sum + item.amountCents, 0),
        expensesCents: exp,
        feesCents: fees,
        cmvCents: cmv,
        profitCents: profit,
        timeCents: list.filter(item => item.kind === "time").reduce((sum, item) => sum + item.amountCents, 0),
        printCents: list.filter(item => item.kind === "print").reduce((sum, item) => sum + item.amountCents, 0)
      };
    };
    const compare = range.prevStart ? { current: summaryOf(charges, payments, range.start, range.end), previous: summaryOf(prevCharges, prevPayments, range.prevStart, range.prevEnd) } : null;
    const previousSalesCents = range.prevStart ? allCharges.filter(item => inRange(item.at, range.prevStart, range.prevEnd)).reduce((sum, item) => sum + item.amountCents, 0) : null;
    const grossProfitCents = salesCents - cmvCents;
    const lowStock = db.products.filter(item => item.active && item.type === "stock" && item.stock <= (item.minStock || 0))
      .map(item => ({ id: item.id, code: item.code, name: item.name, stock: item.stock, minStock: item.minStock || 0 }))
      .sort((a, b) => a.stock - b.stock);

    // Meta do mes da data escolhida: ritmo por dia trabalhado e projecao de fechamento.
    const workDays = settings.workDays || 6;
    const isWorkDay = day => workDays >= 7 || new Date(`${day}T12:00:00Z`).getUTCDay() !== 0;
    const monthStart = `${date.slice(0, 7)}-01`;
    const monthEnd = shiftDay(`${shiftDay(monthStart, 32).slice(0, 7)}-01`, -1);
    let workedDays = 0, remainingDays = 0;
    for (let day = monthStart; day <= monthEnd; day = shiftDay(day, 1)) {
      if (!isWorkDay(day)) continue;
      if (day <= date) workedDays++; else remainingDays++;
    }
    const monthSalesCents = allCharges.filter(item => inRange(item.at, monthStart, date)).reduce((sum, item) => sum + item.amountCents, 0);
    const monthGoalCents = settings.monthGoalCents || 0;
    const paceCents = workedDays ? Math.round(monthSalesCents / workedDays) : 0;
    const goal = {
      monthGoalCents, dailyGoalCents: settings.dailyGoalCents || 0, monthSalesCents, workedDays, remainingDays, paceCents,
      projectionCents: monthSalesCents + paceCents * remainingDays,
      neededPerDayCents: remainingDays ? Math.max(0, Math.round((monthGoalCents - monthSalesCents) / remainingDays)) : Math.max(0, monthGoalCents - monthSalesCents),
      percent: monthGoalCents ? Math.round(monthSalesCents / monthGoalCents * 1000) / 10 : 0
    };
    // Speed Financeira: meta separada, sobre o valor dos contratos fechados no mes (funil da financeira).
    const finWon = (db.leads || []).filter(lead => lead.stage === "won" && lead.closedAt && inRange(lead.closedAt, monthStart, date));
    goal.finGoalCents = settings.finContractGoalCents || 0;
    goal.finContractsCents = finWon.reduce((sum, lead) => sum + (lead.contractCents || 0), 0);
    goal.finContracts = finWon.length;
    goal.finProjectionCents = workedDays ? goal.finContractsCents + Math.round(goal.finContractsCents / workedDays) * remainingDays : 0;

    // Ultimos 12 meses: receita, custo, taxas, despesas e resultado.
    const monthly = Array.from({ length: 12 }, () => ({}));
    for (let i = 0, cursor = monthStart; i < 12; i++) { monthly[11 - i].month = cursor.slice(0, 7); cursor = `${shiftDay(cursor, -1).slice(0, 7)}-01`; }
    const monthIndex = new Map(monthly.map((row, index) => [row.month, index]));
    for (const row of monthly) Object.assign(row, { salesCents: 0, cmvCents: 0, feesCents: 0, expensesCents: 0, count: 0 });
    for (const sale of allCharges) { const row = monthly[monthIndex.get(localDay(sale.at).slice(0, 7))]; if (row) { row.salesCents += sale.amountCents; row.cmvCents += costOfCharge(sale); row.count++; } }
    for (const item of allPayments) { const row = monthly[monthIndex.get(localDay(item.at).slice(0, 7))]; if (row) row.feesCents += Math.round(item.amountCents * (feePct[item.method] || 0) / 100); }
    for (const item of db.expenses || []) { if (isOwnerDraw(item)) continue; const row = monthly[monthIndex.get(localDay(item.at).slice(0, 7))]; if (row) row.expensesCents += item.amountCents; }
    for (const item of db.incomes || []) { const row = monthly[monthIndex.get(localDay(item.at).slice(0, 7))]; if (row) row.incomesCents = (row.incomesCents || 0) + item.amountCents; }
    for (const row of monthly) row.resultCents = row.salesCents + (row.incomesCents || 0) - row.cmvCents - row.feesCents - row.expensesCents;

    // Ano a ano: vendas, despesas e resultado de cada mes em todos os anos com movimento.
    const yearly = {};
    const yearRow = y => (yearly[y] ||= Array.from({ length: 12 }, () => ({ salesCents: 0, count: 0, cmvCents: 0, feesCents: 0, expensesCents: 0 })));
    for (const sale of allCharges) { const d = localDay(sale.at); const row = yearRow(d.slice(0, 4))[Number(d.slice(5, 7)) - 1]; row.salesCents += sale.amountCents; row.count++; row.cmvCents += costOfCharge(sale); }
    for (const item of allPayments) { const d = localDay(item.at); yearRow(d.slice(0, 4))[Number(d.slice(5, 7)) - 1].feesCents += Math.round(item.amountCents * (feePct[item.method] || 0) / 100); }
    for (const item of db.expenses || []) { if (isOwnerDraw(item)) continue; const d = localDay(item.at); yearRow(d.slice(0, 4))[Number(d.slice(5, 7)) - 1].expensesCents += item.amountCents; }
    for (const item of db.incomes || []) { const d = localDay(item.at); const row = yearRow(d.slice(0, 4))[Number(d.slice(5, 7)) - 1]; row.incomesCents = (row.incomesCents || 0) + item.amountCents; }
    for (const rows of Object.values(yearly)) for (const row of rows) row.resultCents = row.salesCents + (row.incomesCents || 0) - row.cmvCents - row.feesCents - row.expensesCents;

    // Faixas de ticket.
    const ticketBands = [[0, 1000], [1000, 2000], [2000, 5000], [5000, 10000], [10000, 20000], [20000, Infinity]].map(([min, max]) => ({ min, max: max === Infinity ? null : max, count: 0, salesCents: 0 }));
    for (const sale of charges) { const band = ticketBands.find(b => sale.amountCents >= b.min && (b.max === null || sale.amountCents < b.max)); if (band) { band.count++; band.salesCents += sale.amountCents; } }

    // Curva ABC do periodo (itens vendidos no sistema novo).
    const abcRows = Object.values(byProduct).filter(row => row.amountCents > 0).sort((a, b) => b.amountCents - a.amountCents);
    const abcTotal = abcRows.reduce((sum, row) => sum + row.amountCents, 0);
    let running = 0;
    const abc = abcRows.map(row => { const before = running; running += row.amountCents; const share = abcTotal ? before / abcTotal : 0; return { ...row, cumulative: abcTotal ? Math.round(running / abcTotal * 1000) / 10 : 0, abcClass: share < 0.8 ? "A" : share < 0.95 ? "B" : "C" }; });
    const abcCount = { A: 0, B: 0, C: 0 };
    const abcRevenue = { A: 0, B: 0, C: 0 };
    for (const item of abc) {
      if (abcCount[item.abcClass] !== undefined) {
        abcCount[item.abcClass]++;
        abcRevenue[item.abcClass] += item.amountCents;
      }
    }
    const abcSummary = {
      totalItems: abc.length,
      totalRevenueCents: abcTotal,
      A: { class: "A", count: abcCount.A, revenueCents: abcRevenue.A, pct: abcTotal ? Math.round(abcRevenue.A / abcTotal * 1000) / 10 : 0, role: "80% da Receita (Produtos Essenciais)", tip: "Itens vitais. Nunca podem faltar estoque ou manutenção." },
      B: { class: "B", count: abcCount.B, revenueCents: abcRevenue.B, pct: abcTotal ? Math.round(abcRevenue.B / abcTotal * 1000) / 10 : 0, role: "15% da Receita (Intermediários)", tip: "Itens de giro moderado. Mantenha compras regulares equilibradas." },
      C: { class: "C", count: abcCount.C, revenueCents: abcRevenue.C, pct: abcTotal ? Math.round(abcRevenue.C / abcTotal * 1000) / 10 : 0, role: "5% da Receita (Cauda Longa)", tip: "Itens de baixo giro. Evite manter capital parado." }
    };
    // Historico do sistema anterior: nos servicos, estoque negativo = unidades vendidas desde o inicio.
    const legacyUnits = db.products.filter(item => item.type === "service" && item.stock < 0)
      .map(item => ({ code: item.code, name: item.name, category: item.category, units: -item.stock, priceCents: item.priceCents, estimatedCents: -item.stock * item.priceCents }))
      .sort((a, b) => b.estimatedCents - a.estimatedCents);

    // Clientes: quem mais compra no periodo e idade das pendencias.
    const byClient = {};
    for (const sale of charges) {
      if (!sale.clientId) continue;
      const client = db.clients.find(row => row.id === sale.clientId);
      byClient[sale.clientId] ||= { clientId: sale.clientId, name: client?.name || "Cliente removido", count: 0, salesCents: 0, dueCents: 0, lastAt: sale.at };
      const row = byClient[sale.clientId]; row.count++; row.salesCents += sale.amountCents; row.dueCents += sale.amountCents - sale.paidCents;
      if (sale.at > row.lastAt) row.lastAt = sale.at;
    }
    const agingBuckets = [{ label: "Até 7 dias", max: 7 }, { label: "8 a 30 dias", max: 30 }, { label: "31 a 60 dias", max: 60 }, { label: "Mais de 60 dias", max: Infinity }].map(b => ({ ...b, count: 0, dueCents: 0 }));
    for (const item of openCharges) {
      const age = Math.floor((Date.now() - Date.parse(item.at)) / 86400000);
      const bucket = agingBuckets.find(b => age <= b.max); bucket.count++; bucket.dueCents += item.amountCents - item.paidCents;
    }

    // Estoque: valor parado em mercadoria e itens sem venda ha 60 dias.
    const soldSince = new Set();
    const cutoff60 = shiftDay(today, -60);
    for (const sale of allCharges) {
      if (sale.legacy || localDay(sale.at) < cutoff60) continue;
      for (const r of sale.items || []) if (r.productId) soldSince.add(r.productId);
      if (sale.productId) soldSince.add(sale.productId);
    }
    const stockProducts = db.products.filter(item => item.active && item.type === "stock");
    const stock = {
      valueCents: stockProducts.reduce((sum, item) => sum + (item.stock > 0 && Number.isInteger(item.costCents) ? item.stock * item.costCents : 0), 0),
      saleValueCents: stockProducts.reduce((sum, item) => sum + (item.stock > 0 ? item.stock * item.priceCents : 0), 0),
      withoutCost: stockProducts.filter(item => item.stock > 0 && !Number.isInteger(item.costCents)).length,
      negative: stockProducts.filter(item => item.stock < 0).length,
      withoutCostProducts: db.products.filter(item => item.active && !Number.isInteger(item.costCents)).length,
      stale: stockProducts.filter(item => item.stock > 0 && !soldSince.has(item.id)).map(item => ({ code: item.code, name: item.name, stock: item.stock, valueCents: Number.isInteger(item.costCents) ? item.stock * item.costCents : null })).sort((a, b) => b.stock - a.stock).slice(0, 100)
    };

    // Maquinas: faturamento de tempo por estacao.
    for (const sale of charges) {
      if (sale.kind !== "time" || !sale.machineId) continue;
      byMachine[sale.machineId] ||= { machineId: sale.machineId, name: db.machines[sale.machineId]?.name || sale.machineId, count: 0, minutes: 0 };
      byMachine[sale.machineId].revenueCents = (byMachine[sale.machineId].revenueCents || 0) + sale.amountCents;
    }

    // Caixa: diferencas de conferencia e sangrias no periodo.
    const shiftsInPeriod = historyRecords("cashShifts").filter(item => item.closedAt && onDate(item.closedAt)).map(item => {
      const expected = item.closingExpectedCents ?? item.expectedCashCents ?? null; const counted = item.closingCountedCents ?? item.countedCashCents ?? null;
      return { id: item.id, openedAt: item.openedAt, closedAt: item.closedAt, operator: item.closedBy || item.openedBy, expectedCents: expected, countedCents: counted, diffCents: expected !== null && counted !== null ? counted - expected : null };
    });
    const adjustments = historyRecords("cashAdjustments").filter(item => onDate(item.at));
    const cash = {
      shifts: shiftsInPeriod,
      shortCents: shiftsInPeriod.reduce((sum, s) => sum + (s.diffCents < 0 ? s.diffCents : 0), 0),
      overCents: shiftsInPeriod.reduce((sum, s) => sum + (s.diffCents > 0 ? s.diffCents : 0), 0),
      withdrawalsCents: adjustments.filter(a => a.direction === "out").reduce((sum, a) => sum + a.amountCents, 0),
      suppliesCents: adjustments.filter(a => a.direction === "in").reduce((sum, a) => sum + a.amountCents, 0)
    };

    // Auditoria de Seguranca do Caixa (Anti-fraude, diferencas de turno e descontos)
    const operatorShifts = {};
    for (const s of shiftsInPeriod) {
      const op = s.operator || "Sistema";
      operatorShifts[op] ||= { operator: op, shiftsCount: 0, exactCount: 0, shortCents: 0, overCents: 0, netDiffCents: 0 };
      operatorShifts[op].shiftsCount++;
      if (s.diffCents === 0) operatorShifts[op].exactCount++;
      else if (s.diffCents < 0) operatorShifts[op].shortCents += s.diffCents;
      else if (s.diffCents > 0) operatorShifts[op].overCents += s.diffCents;
      if (s.diffCents !== null) operatorShifts[op].netDiffCents += s.diffCents;
    }
    const paymentByCharge = new Map(payments.map(p => [p.chargeId, p]));
    const discountsByOperator = {};
    for (const sale of charges) {
      if (sale.discountCents > 0) {
        const payment = paymentByCharge.get(sale.id);
        const op = payment?.operator || sale.operator || "Sistema";
        discountsByOperator[op] ||= { operator: op, count: 0, totalDiscountCents: 0, totalSalesCents: 0 };
        discountsByOperator[op].count++;
        discountsByOperator[op].totalDiscountCents += sale.discountCents;
        discountsByOperator[op].totalSalesCents += sale.amountCents;
      }
    }
    const cancelledCharges = allCharges.filter(sale => onDate(sale.cancelledAt || sale.at) && (sale.cancelledAt || sale.cancelReason)).map(s => ({
      id: s.id,
      at: s.cancelledAt || s.at,
      description: s.description,
      originalAmountCents: s.originalAmountCents || s.amountCents,
      amountCents: s.amountCents,
      cancelledCents: (s.originalAmountCents || s.amountCents) - s.amountCents,
      cancelledBy: s.cancelledBy || "Sistema",
      cancelReason: s.cancelReason || "Cancelamento de pendência"
    }));
    const totalCancelledCents = cancelledCharges.reduce((sum, c) => sum + c.cancelledCents, 0);
    const securityAudit = {
      shiftsByOperator: Object.values(operatorShifts).sort((a, b) => a.netDiffCents - b.netDiffCents),
      discountsByOperator: Object.values(discountsByOperator).sort((a, b) => b.totalDiscountCents - a.totalDiscountCents),
      cancelledCharges: cancelledCharges.slice(0, 50),
      totalDiscountCents: discountCents,
      discountCount: charges.filter(s => (s.discountCents || 0) > 0).length,
      totalShortCents: cash.shortCents,
      totalOverCents: cash.overCents,
      totalCancelledCents
    };

    // Ponto de equilibrio: despesas medias dos meses com despesa / margem de contribuicao conhecida.
    const monthsWithExpenses = monthly.filter(row => row.expensesCents > 0);
    const avgExpensesCents = monthsWithExpenses.length ? Math.round(monthsWithExpenses.reduce((sum, row) => sum + row.expensesCents, 0) / monthsWithExpenses.length) : 0;
    const contributionPct = costedRevenueCents > 0 ? (costedRevenueCents - cmvCents) / costedRevenueCents - (salesCents ? feesCents / salesCents : 0) : null;
    const breakEven = { avgExpensesCents, contributionPct: contributionPct === null ? null : Math.round(contributionPct * 1000) / 10, reliable: costedRevenueCents >= salesCents * 0.5, breakEvenCents: contributionPct > 0 ? Math.round(avgExpensesCents / contributionPct) : null };

    // Alertas automaticos para o gestor.
    const alerts = [];
    const money2 = value => `R$ ${(value / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (monthGoalCents && remainingDays && goal.projectionCents < monthGoalCents) alerts.push({ level: "warn", title: "Abaixo do ritmo da meta", text: `No ritmo atual o mês fecha em ${money2(goal.projectionCents)}. Para bater ${money2(monthGoalCents)} é preciso vender ${money2(goal.neededPerDayCents)} por dia nos ${remainingDays} dias restantes.` });
    if (monthGoalCents && goal.monthSalesCents >= monthGoalCents) alerts.push({ level: "ok", title: "Meta do mês atingida", text: `Vendas do mês: ${money2(goal.monthSalesCents)}.` });
    if (previousSalesCents && salesCents < previousSalesCents * 0.85) alerts.push({ level: "warn", title: "Queda nas vendas", text: `Vendas ${Math.round((1 - salesCents / previousSalesCents) * 100)}% menores que no período anterior (${money2(previousSalesCents)}).` });
    const late = agingBuckets.slice(2).reduce((sum, b) => sum + b.dueCents, 0);
    if (late > 0) alerts.push({ level: "danger", title: "Pendências com mais de 30 dias", text: `${money2(late)} a receber estão atrasados há mais de 30 dias. Cobre esses clientes.` });
    if (stock.negative > 0) alerts.push({ level: "warn", title: "Estoque negativo", text: `${stock.negative} produto(s) com estoque negativo: faça a entrada das compras para o estoque e o custo ficarem certos.` });
    if (uncostedRevenueCents + legacyCents > salesCents * 0.2) alerts.push({ level: "info", title: "Custo dos produtos incompleto", text: `${stock.withoutCostProducts} produto(s) ativos sem preço de custo. Sem o custo o lucro mostrado fica maior que o real.` });
    if (cash.shortCents < 0) alerts.push({ level: "danger", title: "Quebra de caixa", text: `Faltou ${money2(-cash.shortCents)} nos fechamentos de caixa do período.` });
    if (!feePct.debit && !feePct.credit && (byMethod.debit + byMethod.credit + byMethod.card) > 0) alerts.push({ level: "info", title: "Taxas das maquininhas não cadastradas", text: "Cadastre as taxas de débito e crédito em Metas e taxas para o DRE descontar o custo do cartão." });
    if (!avgExpensesCents) alerts.push({ level: "info", title: "Despesas não lançadas", text: "Lance aluguel, energia, internet e salários (ou envie o PDF da conta) para o resultado ficar real." });
    if (stock.stale.length) alerts.push({ level: "info", title: "Mercadoria parada", text: `${stock.stale.length} produto(s) com estoque e sem venda há 60 dias.` });

    // Desempenho por banco parceiro (Correspondente Bancario / Speed Financeira)
    const knownBanks = (db.vault?.banks || []).map(b => b.name).filter(Boolean);
    const bankMap = {};
    for (const b of knownBanks) {
      bankMap[b.toLowerCase()] = { name: b, count: 0, totalCents: 0 };
    }
    for (const inc of incomes) {
      const text = `${inc.category || ""} ${inc.description || ""}`.toLowerCase();
      let matchedBank = null;
      for (const b of knownBanks) {
        if (text.includes(b.toLowerCase())) {
          matchedBank = b.toLowerCase();
          break;
        }
      }
      const key = matchedBank || (inc.category || "Outros").trim().toLowerCase();
      if (!bankMap[key]) {
        bankMap[key] = { name: inc.category || "Outros", count: 0, totalCents: 0 };
      }
      bankMap[key].count += 1;
      bankMap[key].totalCents += inc.amountCents;
    }
    const bankPerformance = Object.values(bankMap)
      .filter(item => item.totalCents > 0 || item.count > 0)
      .map(item => ({
        ...item,
        avgTicketCents: item.count ? Math.round(item.totalCents / item.count) : 0
      }))
      .sort((a, b) => b.totalCents - a.totalCents);

    // Gasto e comissao registrados no Speed Marketing
    let marketingSpendCents = 0;
    let marketingCommissionCents = 0;
    try {
      const rawMkt = db.marketing?.store?.speed_resultados_reais_v1;
      const mktList = rawMkt ? JSON.parse(rawMkt) : [];
      if (Array.isArray(mktList)) {
        for (const row of mktList) {
          if (row?.date && onDate(row.date)) {
            if (typeof row.spend === "number" && row.spend > 0) marketingSpendCents += Math.round(row.spend * 100);
            if (typeof row.commission === "number" && row.commission > 0) marketingCommissionCents += Math.round(row.commission * 100);
          }
        }
      }
    } catch { }

    return {
      ok: true,
      date,
      period,
      range: { start: range.start, end: range.end, prevStart: range.prevStart, prevEnd: range.prevEnd },
      salesCents,
      receivedCents,
      dueCents,
      todayCents,
      previousSalesCents,
      salesCount: charges.length,
      averageTicketCents: charges.length ? Math.round(salesCents / charges.length) : 0,
      unitsPerSale: (() => { const withItems = charges.filter(c => c.kind === "sale" && !c.legacy && (c.items || []).length); return withItems.length ? Math.round(withItems.reduce((s, c) => s + c.items.reduce((u, i) => u + (i.quantity || 1), 0), 0) / withItems.length * 10) / 10 : null; })(),
      sessions: sessions.length,
      minutes: sessions.reduce((sum, item) => sum + item.usedMinutes, 0),
      byMethod,
      byCategory,
      byMachine: Object.values(byMachine),
      byProduct: Object.values(byProduct).sort((a, b) => b.amountCents - a.amountCents),
      byOperator: Object.values(byOperator).sort((a, b) => b.receivedCents - a.receivedCents),
      byDay: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
      byHour,
      byWeekday: byWeekday.map(({ days, ...row }) => ({ ...row, days: days.size })),
      // DRE: CMV so com custo cadastrado; o que nao tem custo aparece separado para nao inventar margem.
      dre: {
        grossCents: salesCents + discountCents,
        discountCents,
        feesCents,
        byFee,
        netCents: salesCents - feesCents,
        cmvCents,
        printCmvCents,
        productCmvCents,
        coveragePct: salesCents ? Math.round(costedRevenueCents / salesCents * 1000) / 10 : 0,
        grossMarginPct: salesCents ? Math.round((salesCents - feesCents - cmvCents) / salesCents * 1000) / 10 : 0,
        netMarginPct: salesCents ? Math.round((salesCents + incomesCents - feesCents - cmvCents - expensesCents) / salesCents * 1000) / 10 : 0,
        grossProfitCents: salesCents - feesCents - cmvCents,
        expensesCents,
        profitCents: salesCents + incomesCents - feesCents - cmvCents - expensesCents,
        ownerDrawCents,
        incomesCents,
        marketingSpendCents,
        marketingCommissionCents,
        costedRevenueCents,
        uncostedRevenueCents,
        legacyCents
      },
      printAudit,
      hourlyPeak,
      abcSummary,
      securityAudit,
      bankPerformance,
      payables: (db.expenses || []).filter(item => item.paid === false).sort((x, y) => String(x.at).localeCompare(String(y.at))), goal, monthly, ticketBands, abc, legacyUnits: legacyUnits.slice(0, 150), clients: Object.values(byClient).sort((a, b) => b.salesCents - a.salesCents).slice(0, 50), agingBuckets: agingBuckets.map(({ max, ...row }) => row), stock, cash, breakEven, alerts, heat, yearly, incomes: incomes.slice(0, 200), compare, prevByDay: Object.values(prevByDayMap).sort((a, b) => a.date.localeCompare(b.date)),
      expenses: expenses.slice(0, 300),
      expensesCents,
      byExpenseCategory,
      lowStock: lowStock.slice(0, 1000),
      lowStockCount: lowStock.length,
      openCharges: openCharges.map(item => ({ id: item.id, at: item.at, description: item.description, dueCents: item.amountCents - item.paidCents, clientId: item.clientId || null, clientName: db.clients.find(row => row.id === item.clientId)?.name || null })),
      charges: charges.slice(0, 500)
    };
  }

  const spoolDir = path.join(dataDir, "print-spool");
  const billsDir = path.join(dataDir, "contas");
  function backupAttachment(sub, file) {
    if (!offsiteDir) return;
    try { const to = path.join(offsiteDir, "anexos", sub); fs.mkdirSync(to, { recursive: true }); fs.copyFileSync(file, path.join(to, path.basename(file))); }
    catch (cause) { console.error(`Backup do anexo falhou: ${cause.message}`); }
  }
  const proofsDir = path.join(dataDir, "provas");
  let printQueue = Promise.resolve();
  let favoritesCache = null;
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
        // Estacao que nunca se conectou (cadastro de testes/instalacao interrompida) pode ser vinculada.
        const allowed = !item.lastSeen || (item.reenrollUntil && Date.parse(item.reenrollUntil) > Date.now());
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
      // Segundos sem mouse e teclado na estacao (so o processo da sessao do usuario envia): avisa maquina esquecida aberta.
      const idle = Number(url.searchParams.get("idle"));
      if (url.searchParams.get("idle") && Number.isFinite(idle) && idle >= 0) { item.idleSeconds = Math.floor(idle); item.idleAt = now(); }
      if (!item.lastPersistedAt || Date.now() - Date.parse(item.lastPersistedAt) > 15000) { item.lastPersistedAt = now(); save(); }
      const cost = sessionCost(item);
      return send(res, 200, { ok: true, machineId: item.id, serverTime: now(), commandSeq: item.commandSeq, locked: item.locked || !item.session, lockMessage: item.lockMessage, session: item.session, openedSessionId: item.openedSessionId || null, valueCents: cost.totalCents, timeCents: cost.timeCents, printCents: cost.printCents, extrasCents: cost.extrasCents, printBWCents: db.settings.printBWCents, printColorCents: db.settings.printColorCents, restoreSeq: item.restoreSeq, restartSeq: item.restartSeq, appliedRestoreSeq: item.appliedRestoreSeq || 0, appliedRestartSeq: item.appliedRestartSeq || 0, shutdownSeq: item.shutdownSeq || 0, appliedShutdownSeq: item.appliedShutdownSeq || 0, monitorUntil: item.monitorUntil || 0, scriptHash: agentScript().hash, serverHost: os.hostname() });
    }
    // O cliente encerra o proprio acesso pelo relogio da estacao: vira pendencia para pagar no caixa.
    const clientEnd = p.match(/^\/api\/client\/([^/]+)\/end$/);
    if (clientEnd && req.method === "POST") {
      const item = getMachine(decodeURIComponent(clientEnd[1])); agent(req, item);
      const input = await readBody(req);
      if (!item.session) return send(res, 200, { ok: true, alreadyEnded: true });
      if (input.sessionId && input.sessionId !== item.session.id) throw err(409, "Sessao ja trocada");
      const sessionId = finish(item, "client", "cliente", true);
      const dueCents = db.charges.filter(row => row.sessionId === sessionId).reduce((sum, row) => sum + row.amountCents - row.paidCents, 0);
      item.lockMessage = dueCents > 0 ? `Acesso encerrado. Pague R$ ${(dueCents / 100).toFixed(2).replace(".", ",")} no caixa. Obrigado!` : "Acesso encerrado. Obrigado pela visita!";
      event(item.id, "Cliente encerrou o acesso", dueCents > 0 ? `A receber: R$ ${(dueCents / 100).toFixed(2)}` : "Sem valor a receber", "cliente"); save();
      return send(res, 200, { ok: true, dueCents });
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
      // A estacao envia o PDF; a cobranca ocorre quando a fila do Windows aceita o trabalho.
      const item = getMachine(decodeURIComponent(printUpload[1])); agent(req, item);
      const color = url.searchParams.get("color") === "1";
      const pages = number(url.searchParams.get("pages"), 1, 200, "Paginas");
      const printer = color ? db.settings.printColorPrinter : db.settings.printBlackPrinter;
      if (!item.session || item.locked) throw err(409, "Estacao sem sessao ativa");
      if (!printer) throw err(409, `Impressora ${color ? "colorida" : "preto e branco"} nao configurada no Atendimento`);
      const uploadSessionId = item.session.id;
      const body = await readRaw(req, 60 * 1024 * 1024);
      if (!item.session || item.session.id !== uploadSessionId) throw err(409, "A sessao foi encerrada durante o envio: impressao cancelada");
      if (body.subarray(0, 4).toString("latin1") !== "%PDF") throw err(400, "Documento invalido");
      const rate = color ? db.settings.printColorCents : db.settings.printBWCents;
      const printJob = { id: uuid(), at: now(), machineId: item.id, printer, pages, color, amountCents: pages * rate, state: "printing", sessionId: uploadSessionId };
      db.printJobs.unshift(printJob);
      db.printJobs.length = Math.min(db.printJobs.length, 200);
      event(item.id, "Impressao enviada ao caixa", `${pages} pag ${color ? "colorida" : "P&B"} (${printer})`, "agente");
      save();
      fs.mkdirSync(spoolDir, { recursive: true });
      const file = path.join(spoolDir, `${printJob.id}.pdf`);
      fs.writeFileSync(file, body);
      const quality = (color ? db.settings.printColorQuality : db.settings.printBWQuality) || "High";
      const run = () => printRunner.print({ file, printer, color, quality });
      const result = await (printQueue = printQueue.then(run, run));
      fs.rmSync(file, { force: true });
      if (!result || !result.ok) {
        printJob.state = "failed"; printJob.error = label(result && result.error ? result.error : "Falha desconhecida", 200);
        event(item.id, "Impressao falhou", `${pages} pag: ${printJob.error}`, "servidor"); save();
        throw err(502, `Nao foi possivel imprimir no caixa: ${printJob.error}`);
      }
      const printed = Number.isInteger(result.pages) && result.pages > 0 ? result.pages : pages;
      // Pediu colorido, mas o documento nao tem cor nenhuma (ex.: contracheque em cinza): cobra como P&B.
      const noColor = color && result.hasColor === false;
      const billColor = color && !noColor;
      printJob.pages = printed; printJob.amountCents = printed * (billColor ? rate : db.settings.printBWCents);
      if (noColor) printJob.noColor = true;
      printJob.state = "confirmed"; printJob.printedAt = now();
      const stillOpen = item.session && item.session.id === printJob.sessionId;
      charge("print", `Impressao ${billColor ? "colorida" : "P&B"}: ${printed} pag${noColor ? " (documento sem cor)" : ""}${stillOpen ? "" : " (apos encerrar a sessao)"}`, printJob.amountCents, { machineId: item.id, quantity: printed, color: billColor, printPrinter: printer, printJobId: printJob.id, sessionId: stillOpen ? printJob.sessionId : null });
      event(item.id, noColor ? "Impressao colorida sem cor" : "Impressao enviada a impressora", noColor ? `${printed} pag: documento sem cor, cobrado como P&B` : `${printed} pag ${color ? "colorida" : "P&B"}`, "servidor"); save();
      return send(res, 200, { ok: true, printId: printJob.id, pages: printed, color: billColor, noColor, amountCents: printJob.amountCents, printer });
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
      const previous = screens.get(item.id);
      // Intervalo medio entre quadros: mostrado no monitor para medir a velocidade real da estacao.
      const gap = previous ? Date.now() - previous.at : 0;
      const intervalMs = previous && gap < 10000 ? Math.round((previous.intervalMs || gap) * 0.7 + gap * 0.3) : 0;
      screens.set(item.id, { at: Date.now(), intervalMs, jpeg, width: number(url.searchParams.get("w"), 1, 100000, "Largura"), height: number(url.searchParams.get("h"), 1, 100000, "Altura") });
      const queue = inputs.get(item.id) || [];
      inputs.set(item.id, []);
      return send(res, 200, { ok: true, events: queue.slice(0, 50), monitorUntil: item.monitorUntil || 0 });
    }
    const clientScriptHash = p.match(/^\/api\/client\/([^/]+)\/script-hash$/);
    if (clientScriptHash && req.method === "GET") {
      // Consulta leve da tarefa de atualizacao (SYSTEM) da estacao; nao altera o estado da maquina.
      const item = getMachine(decodeURIComponent(clientScriptHash[1])); agent(req, item);
      return send(res, 200, { ok: true, hash: agentScript().hash, serverHost: os.hostname() });
    }
    const clientScript = p.match(/^\/api\/client\/([^/]+)\/script$/);
    if (clientScript && req.method === "GET") {
      const item = getMachine(decodeURIComponent(clientScript[1])); agent(req, item);
      const script = agentScript();
      if (!script.text) throw err(404, "Script do agente indisponivel no servidor");
      return send(res, 200, { ok: true, hash: script.hash, script: script.text });
    }

    // Volta do OAuth do Perfil da Empresa: o navegador chega do Google sem o cookie do painel (SameSite=Strict);
    // quem confere e o state de uso unico criado em /api/marketing/gmb-api/connect.
    if (p === "/api/marketing/gmb-api/callback" && req.method === "GET") return gmbCallback(res, url);

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
    if (p === "/api/reports" && req.method === "GET") {
      return send(res, 200, report({
        date: url.searchParams.get("date") || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
        period: url.searchParams.get("period") || "today",
        start: url.searchParams.get("start") || null,
        end: url.searchParams.get("end") || null
      }));
    }
    // Indicadores do plano de 7 dias, dia a dia, com a media dos 60 dias anteriores como base de comparacao.
    if (p === "/api/reports/indicators" && req.method === "GET") {
      const day = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : null;
      // Padrao: a semana atual de segunda a sabado (o plano roda por semana).
      const today = localDay(Date.now());
      const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
      const monday = shiftDay(today, weekday === 0 ? -6 : 1 - weekday);
      const start = day(url.searchParams.get("start")) || monday;
      const end = day(url.searchParams.get("end")) || shiftDay(start, 5);
      if (start > end) throw err(400, "Data inicial depois da final");
      const charges = historyRecords("charges"), payments = historyRecords("payments"), incomes = db.incomes || [], products = db.products;
      const current = buildIndicators({ charges, payments, incomes, products, start, end });
      const base = buildIndicators({ charges, payments, incomes, products, start: shiftDay(start, -60), end: shiftDay(start, -1) });
      return send(res, 200, { ok: true, ...current, goals: [35000, 37500, 40000], packages: packagesOutstanding(db.clients), base: { start: base.start, end: base.end, openDays: base.openDays, average: base.average } });
    }
    if (p === "/api/products/normalization" && req.method === "GET") {
      admin(user);
      const plan = normalizationPlan(db.products, soldByProduct());
      return send(res, 200, { ok: true, ...plan, applied: db.products.filter(item => item.normalization).length });
    }
    if (p === "/api/products/normalization/apply" && req.method === "POST") {
      admin(user);
      fs.copyFileSync(dbPath, `${dbPath}.antes-normalizacao-${Date.now()}.bak`);
      const result = applyNormalization(db.products, normalizationPlan(db.products, soldByProduct()), now(), user.name);
      event("produtos", "Cadastro normalizado", `${result.retired} duplicado(s) inativado(s), ${result.recategorized} produto(s) com categoria unificada`, user.name); save();
      return send(res, 200, { ok: true, ...result });
    }
    if (p === "/api/products/normalization/revert" && req.method === "POST") {
      admin(user);
      const reverted = revertNormalization(db.products);
      event("produtos", "Normalizacao desfeita", `${reverted} produto(s) voltaram ao cadastro anterior`, user.name); save();
      return send(res, 200, { ok: true, reverted });
    }
    if (p === "/api/settings/print-tiers" && req.method === "POST") {
      admin(user); const input = await readBody(req);
      if ("tiers" in input) db.settings.printTiers = parsePrintTiers(input.tiers);
      if ("enabled" in input) db.settings.printTiersEnabled = input.enabled === true;
      if ("comboHints" in input) db.settings.comboHintsEnabled = input.comboHints !== false;
      const text = db.settings.printTiers.map(row => `${row.min}+ pág: R$ ${(row.cents / 100).toFixed(2)}`).join(", ");
      event("sistema", "Faixas da impressao P&B", `${db.settings.printTiersEnabled ? "ativas" : "desligadas"}: ${text}`, user.name); save();
      return send(res, 200, { ok: true, printTiers: db.settings.printTiers, printTiersEnabled: db.settings.printTiersEnabled, comboHintsEnabled: db.settings.comboHintsEnabled });
    }
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
      res.writeHead(200, { "content-type": "image/jpeg", "content-length": screen.jpeg.length, "cache-control": "no-store", "x-screen-width": screen.width, "x-screen-height": screen.height, "x-screen-at": screen.at, "x-screen-interval": screen.intervalMs || 0 });
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
        // Tempo livre: sem duracao combinada; o relogio conta do zero e cobra pela tabela ao encerrar.
        const open = input.billingMode === "open";
        const minutes = open ? OPEN_SESSION_MAX_MINUTES : number(input.minutes, 1, 1440, "Minutos");
        const billingMode = open ? "postpaid" : ["prepaid", "postpaid", "credit"].includes(input.billingMode) ? input.billingMode : "postpaid";
        const clientId = input.clientId ? label(input.clientId, 50) : null;
        const client = clientId && db.clients.find(row => row.id === clientId && row.active);
        if (clientId && !client) throw err(400, "Cliente nao encontrado");
        if (billingMode === "credit") {
          if (!client) throw err(400, "Selecione um cliente com saldo");
          if ((client.creditSeconds || 0) < minutes * 60) throw err(409, "Saldo de tempo insuficiente");
          if (Object.values(db.machines).some(row => row.session?.clientId === client.id)) throw err(409, "Cliente ja usa outra estacao");
        }
        const session = { id: uuid(), clientId, customer: billingMode === "credit" ? client.name : label(input.customer, 80), startedAt: now(), endsAt: new Date(Date.now() + minutes * 60000).toISOString(), plannedMinutes: minutes, billingMode, open, rateCentsHour: db.settings.rateCentsHour };
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
        event(item.id, "Maquina liberada", open ? "tempo livre" : `${minutes} min; ${billingMode}`, user.name);
      } else if (action === "add-time") {
        if (!item.session) throw err(409, "Maquina sem sessao ativa");
        if (item.session.open) throw err(409, "Tempo livre nao precisa de tempo extra");
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
      } else if (action === "pause") {
        // Cliente saiu (foi ao carro) e volta: bloqueia a tela e para o relogio; nada e cobrado durante a pausa.
        if (!item.session) throw err(409, "Estacao sem sessao ativa");
        if (item.session.pausedAt) throw err(409, "Sessao ja esta pausada");
        item.session.pausedAt = now(); item.locked = true; item.lockMessage = "Sessao pausada. O tempo esta parado ate o atendente retomar.";
        touch(item); event(item.id, "Sessao pausada", "relogio parado", user.name);
      } else if (action === "unlock") {
        if (!item.session) throw err(409, "Abra uma sessao antes de desbloquear a estacao");
        let detail = "";
        if (item.session.pausedAt) {
          // Retomar: empurra inicio e fim pelo tempo parado, assim tudo que conta pelo relogio ignora a pausa.
          const pausedMs = Math.max(0, Date.now() - Date.parse(item.session.pausedAt));
          item.session.startedAt = new Date(Date.parse(item.session.startedAt) + pausedMs).toISOString();
          item.session.endsAt = new Date(Date.parse(item.session.endsAt) + pausedMs).toISOString();
          item.session.pausedMs = (item.session.pausedMs || 0) + pausedMs;
          delete item.session.pausedAt;
          detail = `pausa de ${Math.round(pausedMs / 60000)} min`;
        }
        item.locked = false; item.lockMessage = ""; touch(item); event(item.id, detail ? "Sessao retomada" : "Maquina desbloqueada", detail, user.name);
      } else if (action === "reboot") {
        // Reinicio sem sessao (com cliente, use "Encerrar e reiniciar" para cobrar e restaurar).
        if (item.session) throw err(409, "Estacao com cliente: use Encerrar e reiniciar");
        if (status(item) === "offline") throw err(409, "Estacao sem conexao: o comando nao chega ate ela. Reinicie no proprio computador.");
        item.restartSeq = (item.restartSeq || 0) + 1; touch(item); event(item.id, "Reinicio solicitado", "", user.name);
      } else if (action === "shutdown") {
        item.shutdownSeq = (item.shutdownSeq || 0) + 1; touch(item); event(item.id, "Desligamento solicitado", "", user.name);
      } else if (action === "power") {
        if (!item.mac) throw err(409, "Estacao sem MAC conhecido. Ligue a estacao uma vez com o agente atualizado.");
        wakeOnLan(item.mac); event(item.id, "Ligar (Wake-on-LAN)", item.mac, user.name);
      } else if (action === "move") {
        if (!item.session) throw err(409, "Estacao sem sessao ativa");
        if (item.session.pausedAt) throw err(409, "Retome a sessao antes de mover");
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
      } else if (action === "client") {
        // Troca o cliente da sessao em andamento (ex.: liberou como Avulso por engano).
        const session = item.session; if (!session) throw err(409, "Estacao sem sessao ativa");
        if (session.billingMode === "credit") throw err(409, "Sessao com saldo de tempo: encerre e libere de novo");
        const clientId = input.clientId ? label(input.clientId, 50) : null;
        const client = clientId && db.clients.find(row => row.id === clientId && row.active);
        if (clientId && !client) throw err(400, "Cliente nao encontrado");
        // Pos-pago com cliente que tem saldo: passa a usar o saldo desde o inicio da sessao (nada foi cobrado ainda).
        const elapsedSeconds = Math.ceil((sessionNow(session) - Date.parse(session.startedAt)) / 1000);
        const useCredit = client && session.billingMode === "postpaid" && (client.creditSeconds || 0) > elapsedSeconds + 60;
        if (useCredit && Object.values(db.machines).some(row => row !== item && row.session?.clientId === client.id)) throw err(409, "Cliente ja usa outra estacao");
        session.clientId = client ? client.id : null; session.customer = client ? client.name : label(input.customer, 80);
        for (const row of db.charges) if (row.sessionId === session.id) row.clientId = session.clientId;
        let detail = session.customer || "Avulso";
        if (useCredit) {
          session.billingMode = "credit"; session.open = false; session.creditSeconds = client.creditSeconds;
          session.plannedMinutes = Math.floor(client.creditSeconds / 60);
          session.endsAt = new Date(Date.parse(session.startedAt) + client.creditSeconds * 1000).toISOString();
          detail += " (passou a usar o saldo)";
        }
        touch(item); event(item.id, "Cliente da sessao alterado", detail, user.name);
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
        const quantities = new Map(); // produto + preco (preco alterado no caixa vira outra linha)
        for (const row of Array.isArray(input.items) ? input.items.slice(0, 50) : []) {
          const productId = label(row.productId, 80);
          const product = db.products.find(entry => entry.id === productId);
          if (!product || !product.active) throw err(409, "Produto indisponivel");
          const unit = salePrice(row, product), key = `${productId}@${unit}`;
          quantities.set(key, { product, unit, quantity: (quantities.get(key)?.quantity || 0) + number(row.quantity, 1, 1000, "Quantidade") });
        }
        const items = [];
        for (const { product, unit, quantity } of quantities.values()) {
          if (unit < 1) throw err(409, `Configure o preco: ${product.name}`);
          items.push({ productId: product.id, name: product.name, quantity, unitPriceCents: unit, totalCents: quantity * unit, ...(unit !== product.priceCents ? { listPriceCents: product.priceCents } : {}) });
        }
        for (const [color, pages] of [[false, input.printBW], [true, input.printColor]]) {
          if (pages === undefined || pages === null || pages === "" || Number(pages) === 0) continue;
          const count = number(pages, 1, 10000, "Paginas");
          const unit = color ? db.settings.printColorCents : db.settings.printBWCents;
          items.push({ productId: null, name: `Impressão ${color ? "colorida" : "P&B"} (balcão)`, quantity: count, unitPriceCents: unit, totalCents: count * unit });
        }
        if (!items.length) throw err(400, "Adicione ao menos um item");
        const amountCents = items.reduce((sum, row) => sum + row.totalCents, 0);
        charge("sale", `Consumo ${item.name}: ${items.map(row => `${row.quantity}x ${row.name}`).join(", ").slice(0, 160)}`, amountCents, { items, ref, machineId: item.id, clientId: item.session.clientId || null, sessionId: item.session.id });
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
        // Desconto no encerramento (ex.: esqueceu de fechar a maquina).
        const discounted = discountCharges(db.charges.filter(row => row.sessionId === sessionId), input.discountCents, user.name);
        if (discounted) event(item.id, "Desconto no encerramento", `R$ ${(discounted / 100).toFixed(2)}`, user.name);
        if (paymentMethod) receiveCharges(db.charges.filter(row => row.sessionId === sessionId && row.amountCents > row.paidCents), paymentMethod, user.name, input.cashCents);
      }
      else throw err(404, "Acao nao encontrada");
      save(); return send(res, 200, { ok: true, machine: publicMachine(item) });
    }
    if (p === "/api/machines/shutdown-all" && req.method === "POST") {
      // So maquinas conectadas e livres: com cliente usando fica ligada; desligada nao guarda o pedido para depois.
      let count = 0, inUse = [];
      for (const item of Object.values(db.machines)) {
        const online = item.lastSeen && Date.now() - Date.parse(item.lastSeen) < 60000;
        if (!online) continue;
        if (item.session) { inUse.push(item.name); continue; }
        item.shutdownSeq = (item.shutdownSeq || 0) + 1; touch(item); count++;
      }
      event("sistema", "Desligar maquinas livres", `${count} desligada(s)${inUse.length ? `; em uso mantidas: ${inUse.join(", ")}` : ""}`, user.name); save();
      return send(res, 200, { ok: true, count, inUse });
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
      const client = { id: uuid(), name, phone: label(input.phone, 30), active: true, createdAt: now(), login: "", salt: "", passwordHash: "", creditSeconds: 0, origin: pickOrigin(input.origin), campaign: campaignCode(input.campaign) };
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
    // Pacote de impressao pre-pago: o dinheiro entra no caixa agora, mas e obrigacao de entregar paginas.
    // A receita so e reconhecida em cada entrega (pelo preco por pagina do pacote).
    const clientPackage = p.match(/^\/api\/clients\/([^/]+)\/packages$/);
    if (clientPackage && req.method === "POST") {
      const client = db.clients.find(item => item.id === clientPackage[1]); if (!client) throw err(404, "Cliente nao encontrado");
      const input = await readBody(req);
      const pages = number(input.pages, 1, 100000, "Paginas do pacote");
      const amountCents = money(input.amount, "Valor do pacote");
      if (amountCents < 1) throw err(400, "Informe o valor do pacote");
      if (!currentShift()) throw err(409, "Abra o caixa antes de vender o pacote");
      if (!METHODS.includes(input.paymentMethod)) throw err(400, "Escolha a forma de pagamento");
      const validDays = number(input.validDays ?? 60, 1, 365, "Validade");
      const pack = { id: uuid(), soldAt: now(), pages, delivered: 0, amountCents, recognizedCents: 0, validUntil: shiftDay(localDay(Date.now()), validDays), soldBy: user.name };
      const sale = charge("package", `Pacote ${pages} pág. P&B ${client.name} (a entregar)`, amountCents, { clientId: client.id, packageId: pack.id, pages });
      pay(sale, amountCents, input.paymentMethod, user.name);
      client.printPackages = [...(client.printPackages || []), pack];
      event("clientes", "Pacote de impressao vendido", `${client.name}: ${pages} pág. por R$ ${(amountCents / 100).toFixed(2)} (receita conforme entrega)`, user.name); save();
      return send(res, 201, { ok: true, client: publicClient(client), package: pack });
    }
    const packageDeliver = p.match(/^\/api\/clients\/([^/]+)\/packages\/([^/]+)\/deliver$/);
    if (packageDeliver && req.method === "POST") {
      const client = db.clients.find(item => item.id === packageDeliver[1]); if (!client) throw err(404, "Cliente nao encontrado");
      const pack = (client.printPackages || []).find(item => item.id === packageDeliver[2]); if (!pack) throw err(404, "Pacote nao encontrado");
      const input = await readBody(req);
      const remaining = pack.pages - pack.delivered;
      if (!remaining) throw err(409, "Pacote ja foi todo entregue");
      const pages = number(input.pages, 1, remaining, "Paginas entregues");
      // Ultima entrega leva o que falta do valor, para a receita somar exatamente o preco do pacote.
      const cents = pages === remaining ? pack.amountCents - pack.recognizedCents : Math.round(pack.amountCents * pages / pack.pages);
      const product = db.products.find(item => item.active && groupOf(item) === PB_GROUP && !/xerox/i.test(item.name));
      const sale = charge("sale", `Entrega do pacote ${client.name}: ${pages} pág. P&B`, cents, {
        items: [{ productId: product?.id || null, name: "Impressão P&B (pacote pré-pago)", category: "Gráfica Rápida", quantity: pages, unitPriceCents: Math.round(cents / pages), totalCents: cents }],
        clientId: client.id, packageId: pack.id, packageDelivery: true, discountCents: 0, originalTotalCents: cents
      });
      sale.paidCents = cents; // pago na venda do pacote; nao gera novo recebimento no caixa
      pack.delivered += pages; pack.recognizedCents += cents;
      event("clientes", "Entrega de pacote", `${client.name}: ${pages} pág. (faltam ${pack.pages - pack.delivered})`, user.name); save();
      return send(res, 201, { ok: true, client: publicClient(client), package: pack, charge: sale });
    }
    // Divida do cliente (fiado): fica como pendencia no nome dele; pode ter prints da conversa como prova.
    const clientDebt = p.match(/^\/api\/clients\/([^/]+)\/debt$/);
    if (clientDebt && req.method === "POST") {
      const client = db.clients.find(item => item.id === clientDebt[1]); if (!client) throw err(404, "Cliente nao encontrado");
      const input = await readBody(req); const amountCents = money(input.amount, "Valor da divida");
      if (amountCents < 1) throw err(400, "Informe o valor da divida");
      const day = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || "")) ? input.date : null;
      const description = label(input.description, 120) || "Fiado";
      // Divida antiga (anterior ao sistema) entra na data dela e sem custo, para nao inflar as vendas de hoje.
      const item = charge("debt", `Fiado ${client.name}: ${description}`, amountCents, { clientId: client.id, note: label(input.note, 300), proofs: [], operator: user.name, ...(day ? { at: new Date(`${day}T12:00:00-03:00`).toISOString() } : {}), ...(input.old === true || input.old === "true" ? { legacy: true } : {}) });
      event("clientes", "Divida registrada", `${client.name}: R$ ${(amountCents / 100).toFixed(2)}`, user.name); save();
      return send(res, 201, { ok: true, charge: item });
    }
    const chargeProof = p.match(/^\/api\/charges\/([^/]+)\/proof$/);
    if (chargeProof && req.method === "POST") {
      const item = db.charges.find(row => row.id === chargeProof[1]); if (!item) throw err(404, "Pendencia nao encontrada");
      const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "application/pdf": ".pdf" }[type];
      if (!ext) throw err(415, "Envie imagem (print) ou PDF");
      const buffer = await readRaw(req, 15 * 1024 * 1024);
      const proofId = uuid();
      fs.mkdirSync(proofsDir, { recursive: true });
      fs.writeFileSync(path.join(proofsDir, `${proofId}${ext}`), buffer);
      backupAttachment("provas", path.join(proofsDir, `${proofId}${ext}`));
      item.proofs = [...(item.proofs || []), { id: proofId, ext, at: now(), by: user.name }];
      save(); return send(res, 201, { ok: true, proof: item.proofs[item.proofs.length - 1] });
    }
    const chargeProofFile = p.match(/^\/api\/charges\/([^/]+)\/proof\/([0-9a-f-]{36})$/);
    if (chargeProofFile && req.method === "GET") {
      const item = db.charges.find(row => row.id === chargeProofFile[1]);
      const proof = item && (item.proofs || []).find(row => row.id === chargeProofFile[2]);
      if (!proof) throw err(404, "Prova nao encontrada");
      const file = path.join(proofsDir, `${proof.id}${proof.ext}`);
      if (!fs.existsSync(file)) throw err(404, "Arquivo nao encontrado");
      res.writeHead(200, { "content-type": { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".pdf": "application/pdf" }[proof.ext], "cache-control": "no-store" });
      return res.end(fs.readFileSync(file));
    }
    const clientAction = p.match(/^\/api\/clients\/([^/]+)$/);
    if (clientAction && req.method === "POST") {
      const client = db.clients.find(item => item.id === clientAction[1]); if (!client) throw err(404, "Cliente nao encontrado");
      const input = await readBody(req); client.name = label(input.name, 80) || client.name;
      client.phone = label(input.phone, 30); client.active = input.active !== false;
      if ("origin" in input) client.origin = pickOrigin(input.origin);
      if ("login" in input) setClientLogin(client, input.login, input.password);
      event("clientes", "Cliente atualizado", client.name, user.name); save(); return send(res, 200, { ok: true, client: publicClient(client) });
    }
    // Atalhos do caixa: itens mais vendidos (30 dias) e vendas que se repetem (60 dias). Recalcula a cada 10 min.
    if (p === "/api/pos/favorites" && req.method === "GET") {
      if (!favoritesCache || Date.now() - favoritesCache.at > 600000) {
        const today = localDay(Date.now()), from30 = shiftDay(today, -29), from60 = shiftDay(today, -59);
        const active = new Map(db.products.filter(pr => pr.active).map(pr => [pr.id, pr]));
        const qty = new Map(), baskets = new Map();
        for (const c of historyRecords("charges")) {
          if (c.kind !== "sale" || !(c.items || []).length) continue;
          const day = localDay(c.at); if (day < from60) continue;
          const rows = c.items.filter(it => it.productId && active.has(it.productId));
          if (!rows.length || rows.length !== c.items.length) continue;
          if (day >= from30) for (const it of rows) qty.set(it.productId, (qty.get(it.productId) || 0) + it.quantity);
          if (rows.length > 4) continue;
          const key = rows.map(it => `${it.quantity}*${it.productId}`).sort().join("|");
          baskets.set(key, (baskets.get(key) || 0) + 1);
        }
        favoritesCache = {
          at: Date.now(),
          products: [...qty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([productId, quantity]) => ({ productId, quantity })),
          // Cesta repetida com mais de um item, ou um item so com quantidade maior que 1 (ex.: "2x Impressao").
          baskets: [...baskets.entries()].filter(([key, n]) => n >= 3 && (key.includes("|") || !key.startsWith("1*"))).sort((a, b) => b[1] - a[1]).slice(0, 6)
            .map(([key, count]) => ({ count, items: key.split("|").map(part => { const [q, productId] = part.split("*"); return { productId, quantity: Number(q) }; }) }))
        };
      }
      return send(res, 200, { ok: true, products: favoritesCache.products, baskets: favoritesCache.baskets });
    }
    if (p === "/api/sales" && req.method === "POST") {
      const input = await readBody(req);
      if (!currentShift()) throw err(409, "Abra o caixa antes de vender");
      if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) throw err(400, "Informe de 1 a 50 itens");
      const ref = label(input.ref, 80);
      const existing = ref && db.charges.find(row => row.kind === "sale" && row.ref === ref);
      if (existing) return send(res, 200, { ok: true, duplicate: true, charge: existing });

      const items = [];
      let amountCents = 0;
      const stockNeeded = new Map();
      for (const row of input.items) {
        const qty = number(row.quantity, 1, 1000, "Quantidade");
        if (row.productId) {
          const id = label(row.productId, 80);
          const product = db.products.find(item => item.id === id);
          if (!product || !product.active) throw err(409, "Produto indisponivel");
          stockNeeded.set(id, (stockNeeded.get(id) || 0) + qty);
          const unit = salePrice(row, product);
          if (unit < 1) throw err(409, `Configure o preco: ${product.name}`);
          const totalCents = qty * unit;
          amountCents += totalCents;
          items.push({ productId: id, name: product.name, category: product.category, quantity: qty, unitPriceCents: unit, totalCents, ...(unit !== product.priceCents ? { listPriceCents: product.priceCents } : {}) });
        } else {
          const name = label(row.name, 100);
          if (!name) throw err(400, "Informe a descricao do item");
          const unitPriceCents = money(row.unitPriceCents !== undefined ? row.unitPriceCents / 100 : row.unitPrice, "Preco unitario");
          if (unitPriceCents < 1) throw err(400, `Configure o preco do item: ${name}`);
          const totalCents = qty * unitPriceCents;
          amountCents += totalCents;
          items.push({ productId: null, name, category: label(row.category, 50) || "Serviço Avulso", quantity: qty, unitPriceCents, totalCents });
        }
      }

      // Faixas da impressao P&B: o preco da faixa (pelo total de paginas P&B do pedido) vale para todas as paginas.
      // Preco digitado na venda e xerox (copia de papel) ficam como estao.
      if (db.settings.printTiersEnabled) {
        const typed = row => row.unitPriceCents !== undefined && row.unitPriceCents !== null && row.unitPriceCents !== "";
        const tierRows = items.map((row, i) => ({ row, product: row.productId ? db.products.find(item => item.id === row.productId) : null, typed: typed(input.items[i]) }))
          .filter(({ product, typed }) => product && !typed && groupOf(product) === PB_GROUP && !/xerox/i.test(product.name));
        const pages = tierRows.reduce((sum, { row }) => sum + row.quantity, 0);
        if (pages) {
          const unit = tierUnitCents(pages, db.settings.printTiers);
          for (const { row, product } of tierRows) {
            amountCents += row.quantity * unit - row.totalCents;
            row.unitPriceCents = unit; row.totalCents = row.quantity * unit; row.priceTier = true;
            if (unit !== product.priceCents) row.listPriceCents = product.priceCents; else delete row.listPriceCents;
          }
        }
      }
      const discountCents = Math.min(amountCents, Math.max(0, Number.isInteger(input.discountCents) ? input.discountCents : 0));
      const finalTotalCents = amountCents - discountCents;
      if (!Number.isSafeInteger(finalTotalCents) || finalTotalCents > 10000000) throw err(400, "Total da venda acima do limite");

      const requested = Array.isArray(input.payments) && input.payments.length ? input.payments : (input.paymentMethod ? [{ method: input.paymentMethod, amountCents: finalTotalCents }] : []);
      if (!requested.length) throw err(400, "Informe ao menos uma forma de pagamento");
      const clientId = input.clientId ? label(input.clientId, 50) : null;
      const planned = [];
      let fiado = false;
      for (const payEntry of requested) {
        const m = payEntry.method;
        if (m === "fiado" || m === "due") { fiado = true; continue; }
        if (!METHODS.includes(m)) throw err(400, `Forma de pagamento invalida: ${m}`);
        const payAmount = Number.isInteger(payEntry.amountCents) ? payEntry.amountCents : money(payEntry.amount, "Valor do pagamento");
        if (payAmount > 0) planned.push({ method: m, amountCents: payAmount });
      }
      const plannedCents = planned.reduce((sum, row) => sum + row.amountCents, 0);
      if (plannedCents > finalTotalCents) throw err(400, "Pagamentos somam mais que o total da venda");
      if (plannedCents < finalTotalCents) {
        if (!fiado) throw err(400, `Pagamentos somam ${(plannedCents / 100).toFixed(2)}; faltam R$ ${((finalTotalCents - plannedCents) / 100).toFixed(2)}`);
        if (!clientId || !db.clients.some(row => row.id === clientId && row.active)) throw err(400, "Selecione um cliente cadastrado para vender fiado / a prazo");
      }

      const sale = charge("sale", `Venda balcao: ${items.map(row => `${row.quantity}x ${row.name}`).join(", ").slice(0, 160)}`, finalTotalCents, { items, discountCents, originalTotalCents: amountCents, ref, clientId, campaign: campaignCode(input.campaign), origin: pickOrigin(input.origin) });
      for (const row of planned) pay(sale, row.amountCents, row.method, user.name);

      for (const row of items) {
        if (row.productId) {
          const product = db.products.find(item => item.id === row.productId);
          if (product && product.type === "stock") {
            product.stock -= row.quantity;
            db.stockMovements.unshift({ id: uuid(), at: now(), productId: product.id, delta: -row.quantity, reason: `Venda ${sale.id}`, operator: user.name });
          }
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
      const product = { id: uuid(), name, code, category: label(input.category, 50), type: input.type === "service" ? "service" : "stock", priceCents: money(input.price, "Preco"), costCents: optionalCost(input.cost), stock: number(input.stock ?? 0, 0, 1000000, "Estoque"), minStock: number(input.minStock ?? 0, 0, 1000000, "Estoque minimo"), active: true, createdAt: now() };
      db.products.push(product); event("produtos", "Produto cadastrado", name, user.name); save();
      return send(res, 201, { ok: true, product });
    }
    // Produtos por nota fiscal (XML), Excel, CSV, PDF ou foto da DANFE: le e sugere o produto correspondente.
    if (p === "/api/products/import-read" && req.method === "POST") {
      admin(user);
      const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      const ext = { "text/xml": ".xml", "application/xml": ".xml", "text/csv": ".csv", "application/vnd.ms-excel": ".csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx", "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[type];
      if (!ext) throw err(415, "Envie XML da nota, Excel (.xlsx), CSV, PDF ou foto");
      const buffer = await readRaw(req, 20 * 1024 * 1024);
      let text = "";
      if (ext === ".pdf" || ext === ".jpg" || ext === ".png" || ext === ".webp") {
        if (ext === ".pdf") { try { text = extractText(buffer); } catch { text = ""; } }
        if (text.replace(/\s/g, "").length < 20) {
          const tmp = path.join(os.tmpdir(), `lhm-nota-${uuid()}${ext}`);
          fs.writeFileSync(tmp, buffer);
          try { const result = await ocrRunner(tmp); if (!result.ok) throw err(422, result.error || "Nao foi possivel ler o arquivo"); text = result.text || ""; }
          finally { fs.rmSync(tmp, { force: true }); }
        }
      }
      let parsed;
      try { parsed = readProducts(buffer, ext, text); } catch (cause) { throw err(400, cause.message || "Arquivo invalido"); }
      const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const items = parsed.items.slice(0, 1000).map(item => {
        const match = (item.ean && db.products.find(prod => prod.barcode === item.ean)) || (item.code && db.products.find(prod => prod.code === item.code && norm(prod.name) === norm(item.name)))
          || (item.name && db.products.find(prod => norm(prod.name) === norm(item.name))) || (item.code && parsed.kind === "sheet" && db.products.find(prod => prod.code === item.code));
        return { ...item, productId: match ? match.id : null, productName: match ? match.name : null };
      });
      return send(res, 200, { ok: true, kind: parsed.kind, supplier: parsed.supplier || "", number: parsed.number || "", date: parsed.date || "", totalCents: parsed.totalCents || null, items, empty: !items.length });
    }
    if (p === "/api/products/import-apply" && req.method === "POST") {
      admin(user); const input = await readBody(req);
      const rows = Array.isArray(input.items) ? input.items.slice(0, 1000) : [];
      if (!rows.length) throw err(400, "Nenhum item selecionado");
      const source = label(input.source, 80) || "importacao";
      let updated = 0, created = 0, units = 0;
      for (const row of rows) {
        const qty = Math.round(Number(row.quantity) || 0);
        const cost = Number.isInteger(row.unitCostCents) && row.unitCostCents > 0 ? row.unitCostCents : null;
        const price = Number.isInteger(row.priceCents) && row.priceCents >= 0 ? row.priceCents : null;
        let product = row.productId ? db.products.find(item => item.id === row.productId) : null;
        if (!product) {
          const name = label(row.name, 100); if (!name) continue;
          let code = label(row.code, 50) || null;
          if (code && db.products.some(item => item.code === code)) code = `${code}-${db.products.filter(item => String(item.code || "").startsWith(code)).length + 1}`;
          product = { id: uuid(), name, code, barcode: /^\d{8,14}$/.test(String(row.ean || "")) ? row.ean : null, category: label(row.category, 50) || "Bomboniere & Bebidas", type: row.type === "service" ? "service" : "stock", priceCents: price ?? (cost ? cost * 2 : 0), costCents: cost, stock: 0, minStock: 0, active: true, createdAt: now() };
          db.products.push(product); created++;
        } else updated++;
        if (cost) product.costCents = cost;
        if (price !== null && row.productId) product.priceCents = price;
        if (!product.barcode && /^\d{8,14}$/.test(String(row.ean || ""))) product.barcode = row.ean;
        if (product.type === "stock" && qty > 0) {
          product.stock = (product.stock || 0) + qty; units += qty;
          db.stockMovements.unshift({ id: uuid(), at: now(), productId: product.id, delta: qty, reason: `Entrada: ${source}`, operator: user.name, unitCostCents: cost });
        }
      }
      event("produtos", "Entrada de produtos", `${source}: ${updated} atualizado(s), ${created} novo(s), +${units} un.`, user.name); save();
      return send(res, 200, { ok: true, updated, created, units });
    }
    const productAction = p.match(/^\/api\/products\/([^/]+)\/(update|stock|sell)$/);
    if (productAction && req.method === "POST") {
      const product = db.products.find(item => item.id === productAction[1]); if (!product) throw err(404, "Produto nao encontrado");
      const input = await readBody(req); const action = productAction[2];
      if (action === "update") {
        admin(user); const code = label(input.code, 50);
        if (code && db.products.some(item => item.id !== product.id && item.code === code)) throw err(409, "Codigo ja cadastrado");
        product.name = label(input.name, 100) || product.name; product.code = code;
        product.category = label(input.category, 50); product.priceCents = money(input.price, "Preco"); if ("cost" in input) product.costCents = optionalCost(input.cost); product.minStock = number(input.minStock ?? product.minStock ?? 0, 0, 1000000, "Estoque minimo"); product.active = input.active !== false;
        event("produtos", "Produto atualizado", product.name, user.name);
      } else if (action === "stock") {
        admin(user); if (product.type !== "stock") throw err(409, "Servico nao possui estoque");
        const delta = number(input.delta, -100000, 100000, "Ajuste");
        // Estoque pode estar negativo (venda sem estoque liberada): entrada sempre aceita; saida nao passa de zero.
        if (!delta || (delta < 0 && product.stock + delta < 0)) throw err(400, "Ajuste deixaria estoque invalido");
        product.stock += delta;
        db.stockMovements.unshift({ id: uuid(), at: now(), productId: product.id, delta, reason: label(input.reason, 100), operator: user.name });
        event("produtos", "Estoque ajustado", `${product.name}: ${delta}`, user.name);
      } else {
        const quantity = number(input.quantity, 1, 1000, "Quantidade");
        if (!product.active) throw err(409, "Produto inativo");
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
      const adjustment = { id: uuid(), at: now(), shiftId: shift.id, amountCents, direction, reason, operator: user.name };
      db.cashAdjustments.unshift(adjustment);
      // Gasto da loja pago com dinheiro da gaveta (almoco, compra rapida): alem de sair do caixa, entra como despesa no DRE.
      const expenseCategory = label(input.expenseCategory, 60);
      if (direction === "out" && expenseCategory) {
        if (!EXPENSE_CATEGORIES.includes(expenseCategory)) throw err(400, "Categoria invalida");
        db.expenses.unshift({ id: uuid(), at: adjustment.at, category: expenseCategory, description: reason, amountCents, operator: user.name, paid: true, paidAt: adjustment.at, fileId: null, source: "dinheiro do caixa", adjustmentId: adjustment.id });
        adjustment.expense = true;
      }
      event("caixa", direction === "in" ? "Entrada no caixa" : adjustment.expense ? "Despesa paga com dinheiro do caixa" : "Retirada do caixa", reason, user.name); save(); return send(res, 201, { ok: true });
    }
    if (p === "/api/cash/close" && req.method === "POST") {
      admin(user);
      const shift = currentShift(); if (!shift) throw err(409, "Caixa fechado");
      const input = await readBody(req); const counted = money(input.counted, "Valor contado");
      const receivedCash = db.payments.filter(item => item.shiftId === shift.id && item.method === "cash").reduce((sum, item) => sum + item.amountCents, 0);
      const adjustments = db.cashAdjustments.filter(item => item.shiftId === shift.id).reduce((sum, item) => sum + (item.direction === "in" ? item.amountCents : -item.amountCents), 0);
      shift.closingExpectedCents = shift.openingCents + receivedCash + adjustments;
      shift.closingCountedCents = counted; shift.closedAt = now(); shift.closedBy = user.name;
      // Sobrou dinheiro (venda feita na correria sem lancar, ou resto de outro dia): vira receita para o DRE bater com o deposito.
      const extra = counted - shift.closingExpectedCents;
      if (extra > 0 && input.extraAsSale) {
        db.incomes ||= [];
        db.incomes.unshift({ id: uuid(), at: shift.closedAt, category: "Venda não lançada (sobra de caixa)", description: `Sobra no fechamento do caixa (${shift.closedAt.slice(0, 10).split("-").reverse().join("/")})`, amountCents: extra, operator: user.name, shiftId: shift.id });
        shift.extraAsSale = true;
      }
      event("caixa", "Caixa fechado", `Diferenca: ${extra} centavos${shift.extraAsSale ? " (sobra lancada como venda nao lancada)" : ""}`, user.name); save();
      return send(res, 200, { ok: true, shift });
    }
    // Resumo do turno para imprimir ou mandar no WhatsApp no fechamento.
    const shiftSummary = p.match(/^\/api\/cash\/shifts\/([^/]+)\/summary$/);
    if (shiftSummary && req.method === "GET") {
      const shift = db.cashShifts.find(item => item.id === shiftSummary[1]); if (!shift) throw err(404, "Caixa nao encontrado");
      const from = Date.parse(shift.openedAt), to = shift.closedAt ? Date.parse(shift.closedAt) : Date.now();
      const inShift = at => { const t = Date.parse(at); return t >= from && t <= to; };
      const payments = db.payments.filter(item => item.shiftId === shift.id);
      const byMethod = {}, byKind = {};
      const KIND = { time: "Tempo de máquina", print: "Impressões", sale: "Produtos e consumo", product: "Produtos e consumo", credit: "Recargas de crédito", debt: "Fiado recebido" };
      for (const pay of payments) {
        byMethod[pay.method] = (byMethod[pay.method] || 0) + pay.amountCents;
        const kind = KIND[db.charges.find(row => row.id === pay.chargeId)?.kind] || "Outros";
        byKind[kind] = (byKind[kind] || 0) + pay.amountCents;
      }
      const adjustments = db.cashAdjustments.filter(item => item.shiftId === shift.id).map(item => ({ at: item.at, direction: item.direction, amountCents: item.amountCents, reason: item.reason }));
      const adjustCents = adjustments.reduce((sum, item) => sum + (item.direction === "in" ? item.amountCents : -item.amountCents), 0);
      const expectedCents = shift.closedAt ? shift.closingExpectedCents : shift.openingCents + (byMethod.cash || 0) + adjustCents;
      const openCharges = db.charges.filter(item => item.amountCents > item.paidCents);
      const newDue = openCharges.filter(item => inShift(item.at));
      const cancelled = db.charges.filter(item => item.cancelledAt && inShift(item.cancelledAt));
      return send(res, 200, {
        ok: true,
        shift: { id: shift.id, openedAt: shift.openedAt, openedBy: shift.openedBy, closedAt: shift.closedAt, closedBy: shift.closedBy, openingCents: shift.openingCents },
        receivedCents: payments.reduce((sum, item) => sum + item.amountCents, 0), paymentsCount: payments.length,
        byMethod, byKind, adjustments, expectedCents,
        countedCents: shift.closedAt ? shift.closingCountedCents : null,
        differenceCents: shift.closedAt ? shift.closingCountedCents - shift.closingExpectedCents : null,
        newDueCents: newDue.reduce((sum, item) => sum + item.amountCents - item.paidCents, 0), newDueCount: newDue.length,
        pendingCents: openCharges.reduce((sum, item) => sum + item.amountCents - item.paidCents, 0), pendingCount: openCharges.length,
        cancelledCents: cancelled.reduce((sum, item) => sum + (item.originalAmountCents || 0) - item.amountCents, 0), cancelledCount: cancelled.length
      });
    }
    // Despesas (aluguel, energia, internet...): entram no DRE. Sangria nao e despesa.
    if (p === "/api/expenses" && req.method === "POST") {
      admin(user); const input = await readBody(req);
      const category = label(input.category, 60); const description = label(input.description || category, 120);
      if (!category) throw err(400, "Informe a categoria da despesa");
      const amountCents = Number.isInteger(input.amountCents) ? input.amountCents : money(input.amount, "Valor");
      if (amountCents < 1) throw err(400, "Informe o valor da despesa");
      const day = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || "")) ? input.date : localDay(Date.now());
      // Conta a pagar: fica pendente ate marcar como paga. PDF anexado fica em data/contas.
      const paidAt = input.paid !== false ? expensePaymentDate(input.paidDate) : null;
      const fileId = /^[0-9a-f-]{36}$/.test(String(input.fileId || "")) && fs.existsSync(billsDir) && fs.readdirSync(billsDir).some(name => name.startsWith(input.fileId)) ? input.fileId : null;
      const repeat = Number.isInteger(Number(input.repeatMonths)) ? Math.max(1, Math.min(24, Number(input.repeatMonths))) : 1;
      const groupId = repeat > 1 ? uuid() : null;
      const created = [];
      for (let i = 0; i < repeat; i++) {
        // Despesa fixa: mesmo dia nos meses seguintes (dia 31 vira o ultimo dia do mes).
        const [y, m, d] = day.split("-").map(Number);
        const last = new Date(Date.UTC(y, m - 1 + i + 1, 0)).getUTCDate();
        const when = `${new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 7)}-${String(Math.min(d, last)).padStart(2, "0")}`;
        const paidNow = input.paid !== false && i === 0;
        created.push({ id: uuid(), at: new Date(`${when}T12:00:00-03:00`).toISOString(), category, description, amountCents, operator: user.name, paid: paidNow, paidAt: paidNow ? paidAt : null, fileId: i === 0 ? fileId : null, groupId, source: label(input.source, 30) || "manual" });
      }
      const item = created[0];
      db.expenses.unshift(...created); event("caixa", "Despesa lancada", `${description}: R$ ${(amountCents / 100).toFixed(2)}`, user.name); save();
      return send(res, 200, { ok: true, expense: item });
    }
    if (p === "/api/expenses" && req.method === "GET") { admin(user); return send(res, 200, { ok: true, expenses: db.expenses, categories: EXPENSE_CATEGORIES }); }
    // Conta em PDF ou foto (ou fatura do cartao): le o texto (OCR se preciso) e devolve a sugestao para conferir.
    if (p === "/api/expenses/read" && req.method === "POST") {
      admin(user);
      const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      const ext = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/bmp": ".bmp", "image/gif": ".gif", "image/tiff": ".tif", "image/heic": ".heic", "text/csv": ".csv", "application/vnd.ms-excel": ".csv" }[type];
      if (!ext) throw err(415, "Envie um PDF, uma foto (JPG ou PNG) ou o extrato em CSV");
      const buffer = await readRaw(req, 20 * 1024 * 1024);
      const fileId = uuid();
      fs.mkdirSync(billsDir, { recursive: true });
      const file = path.join(billsDir, `${fileId}${ext}`);
      fs.writeFileSync(file, buffer);
      backupAttachment("contas", file);
      let text = "", ocr = false, csvItems = null;
      if (ext === ".csv") {
        // Extrato CSV do banco (Nubank): ja vem linha a linha, sem OCR.
        text = buffer.toString("utf8"); if (text.includes("�")) text = buffer.toString("latin1");
        csvItems = parseBankCsv(text);
        if (!csvItems) throw err(400, "CSV nao reconhecido: envie o extrato CSV do banco (colunas Data, Valor, Identificador, Descricao)");
      }
      if (ext === ".pdf") {
        if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw err(400, "Arquivo nao e um PDF");
        try { text = extractText(buffer); } catch { text = ""; }
      }
      if (!csvItems && text.replace(/\s/g, "").length < 20) {
        const result = await ocrRunner(file);
        if (!result.ok) throw err(422, result.error || "Nao foi possivel ler o arquivo");
        text = result.text || ""; ocr = true;
      }
      const analysis = csvItems ? { kind: "statement", suggestion: { description: "Extrato CSV" }, items: csvItems } : analyzeText(text, new Date(), url.searchParams.get("as") === "extrato");
      if (analysis.kind === "statement") {
        // Ja lancado? Mesmo valor ate 5 dias de diferenca: despesa (a pagar vira "marcar como paga") ou receita.
        const used = new Set();
        // Antes do inicio das vendas no sistema o resultado do mes ficaria so com despesa: vem desmarcado.
        const since = historyRecords("charges").reduce((min, c) => (c.at < min ? c.at : min), new Date().toISOString()).slice(0, 10);
        analysis.since = since;
        for (const it of analysis.items) if (it.date < since && it.include) { it.include = false; it.old = true; }
        // Mesmo lancamento do banco ja importado (codigo do banco): nao repete.
        const refs = new Set([...db.expenses, ...(db.incomes || [])].map(row => row.bankRef).filter(Boolean));
        for (const it of analysis.items) if (it.bankRef && refs.has(it.bankRef)) { it.include = false; it.match = { id: "", at: `${it.date}T12:00:00-03:00`, description: "já importado antes", pending: false }; }
        for (const it of analysis.items) {
          if (it.match) continue;
          const t = Date.parse(`${it.date}T12:00:00-03:00`);
          const pool = it.type === "out" ? db.expenses : (db.incomes || []);
          const hit = pool.find(row => !used.has(row.id) && row.amountCents === it.amountCents && Math.abs(Date.parse(row.at) - t) <= 5 * 86400000);
          if (hit) { used.add(hit.id); it.match = { id: hit.id, at: hit.at, description: hit.description, pending: hit.paid === false }; it.include = it.type === "out" && hit.paid === false; }
        }
      }
      return send(res, 200, { ok: true, fileId, ocr, empty: text.replace(/\s/g, "").length < 20, kind: analysis.kind, suggestion: analysis.suggestion, items: analysis.items, since: analysis.since });
    }
    // Extrato PJ conferido: novas despesas (ja pagas), receitas e contas a pagar que o extrato mostra como pagas.
    if (p === "/api/statement/import" && req.method === "POST") {
      admin(user); const input = await readBody(req);
      const rows = Array.isArray(input.rows) ? input.rows.slice(0, 1000) : [];
      if (!rows.length) throw err(400, "Nenhum lançamento selecionado");
      const fileId = /^[0-9a-f-]{36}$/.test(String(input.fileId || "")) ? input.fileId : null;
      const groupId = uuid(), source = label(input.source, 60) || "extrato";
      db.incomes ||= [];
      const stats = { expenses: 0, incomes: 0, paid: 0 };
      for (const row of rows) {
        const day = /^\d{4}-\d{2}-\d{2}$/.test(String(row.date || "")) ? row.date : localDay(Date.now());
        const at = new Date(`${day}T12:00:00-03:00`).toISOString();
        const match = row.matchId ? db.expenses.find(e => e.id === row.matchId && e.paid === false) : null;
        if (match) { match.paid = true; match.paidAt = at; stats.paid++; continue; }
        const amountCents = Number.isInteger(row.amountCents) ? row.amountCents : money(row.amount, "Valor");
        if (amountCents < 1) throw err(400, "Valor invalido");
        const base = { id: uuid(), at, category: label(row.category, 60) || "Outros", description: label(row.description, 120) || "Extrato", amountCents, operator: user.name, fileId, groupId, source, ...(row.bankRef ? { bankRef: label(row.bankRef, 80) } : {}) };
        if (row.type === "in") { db.incomes.unshift(base); stats.incomes++; }
        else { db.expenses.unshift({ ...base, paid: true, paidAt: at }); stats.expenses++; }
      }
      const byDate = (a, b) => String(b.at).localeCompare(String(a.at));
      db.expenses.sort(byDate); db.incomes.sort(byDate);
      event("caixa", "Extrato importado", `${source}: ${stats.expenses} despesa(s), ${stats.incomes} receita(s), ${stats.paid} conta(s) baixada(s)`, user.name); save();
      return send(res, 200, { ok: true, ...stats });
    }
    // Varias despesas de uma vez (compras da fatura do cartao).
    if (p === "/api/expenses/bulk" && req.method === "POST") {
      admin(user); const input = await readBody(req);
      const rows = Array.isArray(input.items) ? input.items.slice(0, 300) : [];
      if (!rows.length) throw err(400, "Nenhuma despesa selecionada");
      const fileId = /^[0-9a-f-]{36}$/.test(String(input.fileId || "")) ? input.fileId : null;
      const groupId = uuid(), source = label(input.source, 60) || "fatura";
      const created = rows.map(row => {
        const amountCents = Number.isInteger(row.amountCents) ? row.amountCents : money(row.amount, "Valor");
        if (amountCents < 1) throw err(400, "Valor invalido");
        const day = /^\d{4}-\d{2}-\d{2}$/.test(String(row.date || "")) ? row.date : localDay(Date.now());
        return { id: uuid(), at: new Date(`${day}T12:00:00-03:00`).toISOString(), category: label(row.category, 60) || "Outros", description: label(row.description, 120) || "Compra no cartão", amountCents, operator: user.name, paid: input.paid !== false, paidAt: input.paid !== false ? now() : null, fileId, groupId, source };
      });
      db.expenses.unshift(...created);
      event("caixa", "Despesas importadas", `${created.length} lançamento(s) de ${source}: R$ ${(created.reduce((s, r) => s + r.amountCents, 0) / 100).toFixed(2)}`, user.name); save();
      return send(res, 200, { ok: true, count: created.length });
    }
    const expenseUpdate = p.match(/^\/api\/expenses\/([^/]+)\/update$/);
    if (expenseUpdate && req.method === "POST") {
      admin(user); const item = db.expenses.find(row => row.id === expenseUpdate[1]); if (!item) throw err(404, "Despesa nao encontrada");
      const input = await readBody(req);
      const paid = input.paid === undefined ? item.paid !== false : input.paid === true || input.paid === "true";
      const paidAt = paid ? expensePaymentDate(input.paidDate, item.paidAt || now()) : null;
      if (input.category !== undefined) item.category = label(input.category, 60) || item.category;
      if (input.description !== undefined) item.description = label(input.description, 120) || item.description;
      if (input.amount !== undefined || input.amountCents !== undefined) item.amountCents = Number.isInteger(input.amountCents) ? input.amountCents : money(input.amount, "Valor");
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(input.date || ""))) item.at = new Date(`${input.date}T12:00:00-03:00`).toISOString();
      if (input.paid !== undefined || input.paidDate !== undefined) { item.paid = paid; item.paidAt = paidAt; }
      save(); return send(res, 200, { ok: true, expense: item });
    }
    // Speed Financeira: funil de contatos. Venda cruzada a partir da loja (ex.: serviços do INSS).
    if (p === "/api/leads" && req.method === "GET") {
      return send(res, 200, { ok: true, leads: db.leads || [], products: FIN_PRODUCTS, stages: LEAD_STAGES, sources: LEAD_SOURCES });
    }
    if (p === "/api/leads" && req.method === "POST") {
      const input = await readBody(req);
      const name = label(input.name, 80); if (!name) throw err(400, "Informe o nome");
      const phone = label(input.phone, 30); if (!phone) throw err(400, "Informe o telefone para retornar o contato");
      db.leads ||= [];
      const item = { id: uuid(), name, phone, product: FIN_PRODUCTS.includes(input.product) ? input.product : FIN_PRODUCTS[0], stage: "new", source: LEAD_SOURCES.includes(input.source) ? input.source : "Outro", sourceDetail: label(input.sourceDetail, 100), campaign: campaignCode(input.campaign), clientId: input.clientId && db.clients.some(c => c.id === input.clientId) ? input.clientId : null, notes: label(input.notes, 500), owner: user.name, contractCents: 0, commissionCents: 0, createdAt: now(), updatedAt: now(), stageAt: now(), closedAt: null };
      db.leads.unshift(item); event("financeira", "Contato da financeira registrado", `${item.product} · ${name} (${item.source})`, user.name); save();
      return send(res, 201, { ok: true, lead: item });
    }
    const leadEdit = p.match(/^\/api\/leads\/([^/]+)$/);
    if (leadEdit && req.method === "POST") {
      const input = await readBody(req);
      const item = (db.leads || []).find(l => l.id === leadEdit[1]); if (!item) throw err(404, "Contato não encontrado");
      if (input.stage !== undefined) {
        if (!LEAD_STAGES.some(s => s.key === input.stage)) throw err(400, "Etapa inválida");
        if (item.stage !== input.stage) { item.stage = input.stage; item.stageAt = now(); }
        item.closedAt = ["won", "lost"].includes(item.stage) ? (item.closedAt || now()) : null;
      }
      if (input.product !== undefined && FIN_PRODUCTS.includes(input.product)) item.product = input.product;
      if (input.notes !== undefined) item.notes = label(input.notes, 500);
      if (input.lostReason !== undefined) item.lostReason = label(input.lostReason, 120);
      if (input.contract !== undefined) item.contractCents = input.contract === "" ? 0 : money(input.contract, "Valor do contrato");
      if (input.commission !== undefined) item.commissionCents = input.commission === "" ? 0 : money(input.commission, "Comissão");
      if (item.stage === "won" && !item.commissionCents) throw err(400, "Informe o valor da comissão do contrato");
      // Comissão de contrato fechado vira receita da Speed Financeira (DRE); desfazer o fechamento remove.
      db.incomes ||= [];
      const income = db.incomes.find(i => i.leadId === item.id);
      if (item.stage === "won") {
        const desc = `${item.product} · ${item.name}`;
        if (income) Object.assign(income, { amountCents: item.commissionCents, description: desc });
        else db.incomes.unshift({ id: uuid(), at: now(), category: "Comissão Speed Financeira", description: desc, amountCents: item.commissionCents, operator: user.name, leadId: item.id });
      } else if (income) db.incomes.splice(db.incomes.indexOf(income), 1);
      item.updatedAt = now();
      if (input.stage === "won") event("financeira", "Contrato fechado", `${item.product} · ${item.name}: comissão R$ ${(item.commissionCents / 100).toFixed(2)}`, user.name);
      save(); return send(res, 200, { ok: true, lead: item });
    }
    // Campanhas: código curto escolhido no caixa (ex.: SABADO). O resultado sai das vendas reais.
    if (p === "/api/campaigns" && req.method === "GET") {
      admin(user);
      return send(res, 200, { ok: true, campaigns: db.campaigns || [], origins: ORIGINS });
    }
    if (p === "/api/campaigns" && req.method === "POST") {
      admin(user); const input = await readBody(req);
      const code = label(input.code, 20).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const name = label(input.name, 80);
      if (!code || code.length < 3) throw err(400, "Código de 3 a 20 letras ou números, sem espaço");
      if (!name) throw err(400, "Informe o nome da campanha");
      db.campaigns ||= [];
      if (db.campaigns.some(c => c.code === code)) throw err(409, "Já existe uma campanha com esse código");
      const day = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : "";
      const item = { id: uuid(), code, name, business: input.business === "financeira" ? "financeira" : "loja", channel: label(input.channel, 40), start: day(input.start) || localDay(Date.now()), end: day(input.end), costCents: input.cost ? money(input.cost, "Investimento") : 0, active: true, createdAt: now() };
      db.campaigns.unshift(item); event("sistema", "Campanha criada", `${code} · ${name}`, user.name); save();
      return send(res, 201, { ok: true, campaign: item });
    }
    const campaignEdit = p.match(/^\/api\/campaigns\/([^/]+)$/);
    if (campaignEdit && req.method === "POST") {
      admin(user); const input = await readBody(req);
      const item = (db.campaigns || []).find(c => c.id === campaignEdit[1]); if (!item) throw err(404, "Campanha não encontrada");
      if (input.active !== undefined) item.active = input.active === true || input.active === "true";
      if (input.cost !== undefined) item.costCents = money(input.cost, "Investimento");
      if (input.end !== undefined) item.end = /^\d{4}-\d{2}-\d{2}$/.test(String(input.end)) ? input.end : "";
      save(); return send(res, 200, { ok: true, campaign: item });
    }
    if (p === "/api/marketing/results" && req.method === "GET") {
      admin(user);
      const today = localDay(Date.now());
      const start = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("start") || "") ? url.searchParams.get("start") : shiftDay(today, -29);
      const end = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("end") || "") ? url.searchParams.get("end") : today;
      const inRange = at => { const d = localDay(at); return d >= start && d <= end; };
      const clientsById = new Map(db.clients.map(c => [c.id, c]));
      const byCampaign = new Map((db.campaigns || []).map(c => [c.code, { code: c.code, name: c.name, business: c.business || "loja", channel: c.channel, costCents: c.costCents || 0, active: c.active, start: c.start, end: c.end, salesCents: 0, count: 0, clients: new Set(), newClients: 0, leads: 0, won: 0, commissionCents: 0 }]));
      const fin = { leads: 0, won: 0, commissionCents: 0, fromStore: 0, fromStoreWon: 0, byProduct: {}, bySource: {} };
      for (const lead of db.leads || []) {
        if (!inRange(lead.createdAt)) continue;
        fin.leads++;
        const won = lead.stage === "won";
        if (won) { fin.won++; fin.commissionCents += lead.commissionCents || 0; }
        if (lead.source === "Serviço da loja") { fin.fromStore++; if (won) fin.fromStoreWon++; }
        for (const [bucket, key] of [[fin.byProduct, lead.product], [fin.bySource, lead.source]]) {
          bucket[key] ||= { leads: 0, won: 0, commissionCents: 0 };
          bucket[key].leads++; if (won) { bucket[key].won++; bucket[key].commissionCents += lead.commissionCents || 0; }
        }
        const camp = lead.campaign && byCampaign.get(lead.campaign);
        if (camp) { camp.leads++; if (won) { camp.won++; camp.commissionCents += lead.commissionCents || 0; } }
      }
      const byOrigin = new Map(ORIGINS.map(o => [o, { origin: o, salesCents: 0, count: 0, newClients: 0 }]));
      let totalCents = 0, trackedCents = 0, originCents = 0;
      for (const c of db.charges) {
        if (!inRange(c.at) || !(c.amountCents > 0) || c.kind === "debt") continue;
        totalCents += c.amountCents;
        const camp = c.campaign && byCampaign.get(c.campaign);
        if (camp) { camp.salesCents += c.amountCents; camp.count++; if (c.clientId) camp.clients.add(c.clientId); trackedCents += c.amountCents; }
        const o = byOrigin.get(c.origin || clientsById.get(c.clientId)?.origin || "");
        if (o) { o.salesCents += c.amountCents; o.count++; originCents += c.amountCents; }
      }
      for (const client of db.clients) {
        if (!inRange(client.createdAt)) continue;
        if (client.origin && byOrigin.get(client.origin)) byOrigin.get(client.origin).newClients++;
        if (client.campaign && byCampaign.get(client.campaign)) byCampaign.get(client.campaign).newClients++;
      }
      const campaigns = [...byCampaign.values()].map(c => ({ ...c, clients: c.clients.size, roi: c.costCents ? Math.round((c.salesCents + c.commissionCents) / c.costCents * 10) / 10 : null })).sort((a, b) => (b.salesCents + b.commissionCents) - (a.salesCents + a.commissionCents));
      const origins = [...byOrigin.values()].filter(o => o.count || o.newClients).sort((a, b) => b.salesCents - a.salesCents);
      return send(res, 200, { ok: true, start, end, totalCents, trackedCents, originCents, campaigns, origins, financeira: fin });
    }
    // Passos de uma ação: lista curta de { text, done }.
    const planSteps = value => (Array.isArray(value) ? value : String(value || "").split(/\n|;/)).map(step => typeof step === "string" ? { text: label(step, 120), done: false } : { text: label(step?.text, 120), done: step?.done === true }).filter(step => step.text).slice(0, 12);
    // Plano de ação: sugestões recalculadas com os números do mês + ações acompanhadas pelo dono.
    if (p === "/api/actions" && req.method === "GET") {
      admin(user);
      const today = localDay(Date.now());
      const rep = report({ date: today, period: "month" });
      const suggestions = suggestActions(rep, db);
      if (!db.actionPlan) { // primeira vez: o plano já nasce com as prioridades altas
        db.actionPlan = suggestions.filter(s => s.priority === "alta").map((s, i) => ({ id: uuid(), key: s.key, title: s.title, area: s.area, priority: s.priority, why: s.why, how: s.how, impact: s.impact, owner: "", due: localDay(Date.now() + (7 + i * 3) * 86400000), status: "todo", createdAt: now(), doneAt: null }));
        save();
      }
      const kpis = { salesCents: rep.salesCents, salesCount: rep.salesCount, averageTicketCents: rep.averageTicketCents, projectionCents: rep.goal?.projectionCents || 0, monthGoalCents: rep.goal?.monthGoalCents || 0, workedDays: rep.goal?.workedDays || 0, dueCents: rep.dueCents || 0 };
      const cache = new Map();
      const reportFor = (start, end) => { const k = `${start}|${end}`; if (!cache.has(k)) cache.set(k, report({ date: today, period: "custom", start, end })); return cache.get(k); };
      const goals = (db.planGoals || []).map(goal => goalProgress(goal, reportFor, today));
      const actions = db.actionPlan.map(item => ({ ...item, effect: actionEffect(item, reportFor, today, db, shiftDay) }));
      const templates = Object.values(TEMPLATES).map(t => ({ key: t.key, actions: t.actions.length, imported: (db.planTemplates || []).includes(t.key) }));
      return send(res, 200, { ok: true, kpis, goals, suggestions, actions, metrics: METRICS, templates });
    }
    if (p === "/api/actions/template" && req.method === "POST") {
      admin(user); const input = await readBody(req);
      const template = TEMPLATES[input.key]; if (!template) throw err(404, "Plano não encontrado");
      db.actionPlan ||= []; db.planGoals ||= []; db.planTemplates ||= [];
      let added = 0;
      for (const goal of template.goals) if (!db.planGoals.some(g => g.start === goal.start && g.end === goal.end)) db.planGoals.push({ id: uuid(), ...goal });
      for (const a of template.actions) {
        const existing = db.actionPlan.find(item => item.key === a.key);
        const steps = a.steps.map(text => ({ text, done: false }));
        if (existing) { Object.assign(existing, { title: a.title, due: a.due, metric: a.metric || existing.metric || "", owner: existing.owner || a.owner, steps: existing.steps?.length ? existing.steps : steps }); continue; }
        db.actionPlan.push({ id: uuid(), key: a.key, title: a.title, area: a.area, priority: a.priority, why: "", how: "", impact: "", owner: a.owner || "", due: a.due, metric: a.metric || "", steps, status: "todo", createdAt: now(), doneAt: null });
        added++;
      }
      if (!db.planTemplates.includes(template.key)) db.planTemplates.push(template.key);
      event("sistema", "Plano de 30 dias importado", `${added} ações novas, ${template.goals.length} metas semanais`, user.name); save();
      return send(res, 200, { ok: true, added });
    }
    if (p === "/api/actions" && req.method === "POST") {
      admin(user); const input = await readBody(req);
      const title = label(input.title, 140); if (!title) throw err(400, "Informe a ação");
      db.actionPlan ||= [];
      const key = label(input.key, 60) || null;
      if (key && db.actionPlan.some(item => item.key === key)) throw err(409, "Essa sugestão já está no plano");
      const item = { id: uuid(), key, title, area: label(input.area, 40) || "Geral", priority: ["alta", "media", "baixa"].includes(input.priority) ? input.priority : "media", why: label(input.why, 600), how: label(input.how, 800), impact: label(input.impact, 300), owner: label(input.owner, 60), due: /^\d{4}-\d{2}-\d{2}$/.test(String(input.due || "")) ? input.due : localDay(Date.now() + 7 * 86400000), metric: METRICS[input.metric] ? input.metric : "", steps: planSteps(input.steps), status: "todo", createdAt: now(), doneAt: null };
      db.actionPlan.push(item); event("sistema", "Ação adicionada ao plano", title, user.name); save();
      return send(res, 201, { ok: true, action: item });
    }
    const actionUpdate = p.match(/^\/api\/actions\/([^/]+)(\/delete)?$/);
    if (actionUpdate && req.method === "POST") {
      admin(user); const input = await readBody(req);
      const index = (db.actionPlan || []).findIndex(row => row.id === actionUpdate[1]); if (index < 0) throw err(404, "Ação não encontrada");
      const item = db.actionPlan[index];
      if (actionUpdate[2]) { db.actionPlan.splice(index, 1); save(); return send(res, 200, { ok: true }); }
      if (input.status !== undefined) {
        if (!["todo", "doing", "done"].includes(input.status)) throw err(400, "Situação inválida");
        item.status = input.status; item.doneAt = input.status === "done" ? now() : null;
        if (input.status === "done") event("sistema", "Ação concluída", item.title, user.name);
      }
      if (input.owner !== undefined) item.owner = label(input.owner, 60);
      if (input.due !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(String(input.due))) item.due = input.due;
      if (input.note !== undefined) item.note = label(input.note, 400);
      if (input.metric !== undefined) item.metric = METRICS[input.metric] ? input.metric : "";
      if (input.steps !== undefined) item.steps = planSteps(input.steps);
      save(); return send(res, 200, { ok: true, action: item });
    }
    if (p === "/api/incomes" && req.method === "POST") {
      admin(user); const input = await readBody(req);
      const amountCents = money(input.amount, "Valor"); if (amountCents < 1) throw err(400, "Informe o valor");
      const day = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || "")) ? input.date : localDay(Date.now());
      const item = { id: uuid(), at: new Date(`${day}T12:00:00-03:00`).toISOString(), category: label(input.category, 60) || "Comissão Speed Financeira", description: label(input.description, 120) || "Comissão", amountCents, operator: user.name };
      db.incomes.unshift(item); event("caixa", "Receita lançada", `${item.description}: R$ ${(amountCents / 100).toFixed(2)}`, user.name); save();
      return send(res, 200, { ok: true, income: item });
    }
    const incomeDelete = p.match(/^\/api\/incomes\/([^/]+)\/delete$/);
    if (incomeDelete && req.method === "POST") { admin(user); db.incomes = db.incomes.filter(item => item.id !== incomeDelete[1]); save(); return send(res, 200, { ok: true }); }
    // PDF da conta: le o texto e devolve a sugestao; o atendente confere antes de salvar.
    if (p === "/api/expenses/read-pdf" && req.method === "POST") {
      admin(user);
      const pdf = await readRaw(req, 15 * 1024 * 1024);
      let result;
      try { result = readBill(pdf); } catch (cause) { throw err(400, cause.message || "PDF invalido"); }
      const fileId = uuid();
      fs.mkdirSync(billsDir, { recursive: true });
      fs.writeFileSync(path.join(billsDir, `${fileId}.pdf`), pdf);
      return send(res, 200, { ok: true, fileId, scanned: result.scanned, suggestion: result.suggestion });
    }
    const expenseFile = p.match(/^\/api\/expenses\/([^/]+)\/file$/);
    if (expenseFile && req.method === "GET") {
      admin(user); const item = db.expenses.find(row => row.id === expenseFile[1]);
      if (!item || !item.fileId) throw err(404, "Conta sem PDF");
      const found = [".pdf", ".jpg", ".png", ".webp", ".bmp", ".gif", ".tif", ".heic"].map(ext => path.join(billsDir, `${item.fileId}${ext}`)).find(name => fs.existsSync(name));
      if (!found) throw err(404, "Arquivo nao encontrado");
      const types = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".bmp": "image/bmp", ".gif": "image/gif", ".tif": "image/tiff", ".heic": "image/heic" };
      res.writeHead(200, { "content-type": types[path.extname(found)], "cache-control": "no-store", "content-disposition": "inline" });
      return res.end(fs.readFileSync(found));
    }
    const expensePay = p.match(/^\/api\/expenses\/([^/]+)\/pay$/);
    if (expensePay && req.method === "POST") {
      admin(user); const item = db.expenses.find(row => row.id === expensePay[1]); if (!item) throw err(404, "Despesa nao encontrada");
      const input = await readBody(req);
      Object.assign(item, { paid: true, paidAt: expensePaymentDate(input.paidDate, item.paidAt || now()), paidBy: user.name });
      event("caixa", "Conta paga", `${item.description}: R$ ${(item.amountCents / 100).toFixed(2)}`, user.name); save();
      return send(res, 200, { ok: true, expense: item });
    }
    const productStrategy = p.match(/^\/api\/products\/([^/]+)\/strategy$/);
    if (productStrategy && req.method === "POST") {
      admin(user); const product = db.products.find(row => row.id === productStrategy[1]); if (!product) throw err(404, "Produto nao encontrado");
      const input = await readBody(req); product.strategy = label(input.strategy, 40) || null; save();
      return send(res, 200, { ok: true, product });
    }
    const expenseDelete = p.match(/^\/api\/expenses\/([^/]+)\/delete$/);
    if (expenseDelete && req.method === "POST") {
      admin(user); const item = db.expenses.find(row => row.id === expenseDelete[1]); if (!item) throw err(404, "Despesa nao encontrada");
      db.expenses = db.expenses.filter(row => row !== item);
      event("caixa", "Despesa excluida", `${item.description}: R$ ${(item.amountCents / 100).toFixed(2)}`, user.name); save();
      return send(res, 200, { ok: true });
    }
    const chargeCancel = p.match(/^\/api\/charges\/([^/]+)\/cancel$/);
    if (chargeCancel && req.method === "POST") {
      // Cancela o que falta receber (ex.: sessao de teste esquecida). O que ja foi pago fica.
      admin(user);
      const item = db.charges.find(row => row.id === chargeCancel[1]); if (!item) throw err(404, "Cobranca nao encontrada");
      const input = await readBody(req); const reason = label(input.reason, 120);
      if (!reason) throw err(400, "Informe o motivo do cancelamento");
      if (item.paidCents >= item.amountCents) throw err(409, "Cobranca ja quitada");
      const cancelledCents = item.amountCents - item.paidCents;
      Object.assign(item, { originalAmountCents: item.amountCents, amountCents: item.paidCents, cancelledAt: now(), cancelledBy: user.name, cancelReason: reason });
      event(item.machineId || "caixa", "Pendencia cancelada", `${item.description}: R$ ${(cancelledCents / 100).toFixed(2)} (${reason})`, user.name); save();
      return send(res, 200, { ok: true, charge: item });
    }
    // Cliente trocou a forma de pagamento depois de recebido: so no caixa aberto (admin pode em qualquer turno).
    const paymentMethod = p.match(/^\/api\/payments\/([^/]+)\/method$/);
    if (paymentMethod && req.method === "POST") {
      const input = await readBody(req);
      const item = db.payments.find(row => row.id === decodeURIComponent(paymentMethod[1])); if (!item) throw err(404, "Recebimento nao encontrado");
      if (!METHODS.includes(input.method)) throw err(400, "Forma de pagamento invalida");
      const shift = currentShift();
      if (user.role !== "admin" && (!shift || item.shiftId !== shift.id)) throw err(403, "So da para alterar recebimentos do caixa aberto");
      if (item.method === input.method) return send(res, 200, { ok: true });
      const before = item.method;
      item.methodHistory = [...(item.methodHistory || []), { from: before, to: input.method, at: now(), by: user.name }];
      item.method = input.method;
      event("caixa", "Forma de pagamento alterada", `${(item.amountCents / 100).toFixed(2)}: ${before} -> ${input.method}`, user.name); save();
      return send(res, 200, { ok: true });
    }
    // Receber varias pendencias de uma vez (Receber da maquina): desconto e pagamento na mesma operacao,
    // validados antes de mexer em qualquer coisa, e todos os pagamentos com o mesmo receiptId.
    if (p === "/api/charges/receive" && req.method === "POST") {
      const input = await readBody(req);
      if (!currentShift()) throw err(409, "Abra o caixa antes de receber");
      if (!METHODS.includes(input.method)) throw err(400, "Forma de pagamento invalida");
      const ids = Array.isArray(input.ids) ? input.ids.map(id => label(id, 60)) : [];
      const list = db.charges.filter(row => ids.includes(row.id) && row.amountCents > row.paidCents);
      if (!list.length) throw err(404, "Nenhuma pendencia em aberto");
      const discounted = discountCharges(list, input.discountCents, user.name);
      if (discounted) event(list[0].machineId || "caixa", "Desconto no recebimento", `R$ ${(discounted / 100).toFixed(2)}`, user.name);
      const { receiptId, receivedCents } = receiveCharges(list.filter(row => row.amountCents > row.paidCents), input.method, user.name, input.cashCents);
      save();
      return send(res, 200, { ok: true, receiptId, receivedCents, discountCents: discounted });
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
      const settings = { ...db.settings, defaultMinutes: number(input.defaultMinutes, 1, 1440, "Tempo padrao"), autoRestoreOnTimeEnd: input.autoRestoreOnTimeEnd !== false, rateCentsHour: money(input.hourPrice, "Tarifa por hora"), printBWCents: money(input.printBW, "Impressao P&B"), printColorCents: money(input.printColor, "Impressao colorida"), printBlackPrinter: db.settings.printBlackPrinter || "", printColorPrinter: db.settings.printColorPrinter || "", timeTable, timeRoundCents: [0, 25, 50, 100].includes(Number(input.timeRound)) ? Number(input.timeRound) : (Number.isInteger(db.settings.timeRoundCents) ? db.settings.timeRoundCents : 50) };
      if (settings.rateCentsHour < 1 || settings.printBWCents < 1 || settings.printColorCents < 1) throw err(400, "Tarifas devem ser maiores que zero");
      db.settings = settings; event("sistema", "Tarifas atualizadas", "", user.name); save();
      return send(res, 200, { ok: true, settings });
    }
    // Metas e taxas das maquininhas: usadas no DRE (deducoes) e na projecao do mes.
    if (p === "/api/settings/finance" && req.method === "POST") {
      admin(user); const input = await readBody(req);
      const pct = (value, field) => { const n = Number(String(value ?? 0).replace(",", ".")); if (!Number.isFinite(n) || n < 0 || n > 20) throw err(400, `${field} invalida`); return Math.round(n * 100) / 100; };
      Object.assign(db.settings, {
        monthGoalCents: money(input.monthGoal, "Meta mensal"), dailyGoalCents: money(input.dailyGoal, "Meta diaria"),
        finContractGoalCents: input.finContractGoal !== undefined && input.finContractGoal !== "" ? money(input.finContractGoal, "Meta de contratos da financeira") : (db.settings.finContractGoalCents || 0),
        feeDebitPct: pct(input.feeDebit, "Taxa do debito"), feeCreditPct: pct(input.feeCredit, "Taxa do credito"),
        feeCardPct: pct(input.feeCard, "Taxa do cartao"), feePixPct: pct(input.feePix, "Taxa do Pix"),
        workDays: number(input.workDays ?? 6, 1, 7, "Dias de trabalho por semana"),
        printBWCostCents: input.printBWCost !== undefined && input.printBWCost !== "" ? money(input.printBWCost, "Custo da pagina P&B") : (db.settings.printBWCostCents || 0),
        printColorCostCents: input.printColorCost !== undefined && input.printColorCost !== "" ? money(input.printColorCost, "Custo da pagina colorida") : (db.settings.printColorCostCents || 0),
        pixKey: input.pixKey !== undefined ? label(input.pixKey, 100) : (db.settings.pixKey || ""),
        receiptHeader: input.receiptHeader !== undefined ? label(input.receiptHeader, 500) : (db.settings.receiptHeader || ""),
        idleAlertMinutes: input.idleAlertMinutes !== undefined && input.idleAlertMinutes !== "" ? number(input.idleAlertMinutes, 0, 600, "Aviso de maquina sem uso") : (db.settings.idleAlertMinutes ?? 15),
        panelOnlyHere: input.panelOnlyHere === true || input.panelOnlyHere === "true"
      });
      event("sistema", "Metas e taxas atualizadas", "", user.name); save();
      return send(res, 200, { ok: true, settings: db.settings });
    }
    if (p === "/api/printers/local" && req.method === "GET") {
      if (url.searchParams.get("refresh") === "1" || Date.now() - localPrinters.at > 30000) {
        const result = await printRunner.list();
        if (!result || !result.ok) throw err(502, `Nao foi possivel listar as impressoras do caixa: ${(result && result.error) || "erro"}`);
        localPrinters = { at: Date.now(), list: [].concat(result.printers || []).filter(Boolean).map(value => label(value, 200)) };
      }
      return send(res, 200, { ok: true, printers: localPrinters.list, black: db.settings.printBlackPrinter || "", color: db.settings.printColorPrinter || "", blackCents: db.settings.printBWCents, colorCents: db.settings.printColorCents, colorQuality: db.settings.printColorQuality || "High" });
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
      const colorQuality = ["High", "Standard", "Draft"].includes(input.colorQuality) ? input.colorQuality : (db.settings.printColorQuality || "High");
      db.settings.printBlackPrinter = black; db.settings.printColorPrinter = color;
      db.settings.printBWCents = blackCents; db.settings.printColorCents = colorCents;
      db.settings.printColorQuality = colorQuality;
      event("sistema", "Impressoras do atendimento", `P&B: ${black} R$ ${(blackCents / 100).toFixed(2)}; Colorida: ${color} R$ ${(colorCents / 100).toFixed(2)} (Qualidade: ${colorQuality})`, user.name); save();
      return send(res, 200, { ok: true, black, color, blackCents, colorCents, colorQuality });
    }
    if (p === "/api/printers/open-driver-prefs" && req.method === "POST") {
      const input = await readBody(req);
      const printer = label(input.printer || db.settings.printColorPrinter, 200);
      if (!printer) throw err(400, "Nenhuma impressora selecionada");
      execFile("rundll32.exe", ["printui.dll,PrintUIEntry", "/e", "/n", printer], err => {
        if (err) console.error("Erro ao abrir preferencias da impressora:", err);
      });
      return send(res, 200, { ok: true, printer });
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
      const shares = db.printerShares || [];
      const blackPrinter = db.settings.printBlackPrinter || shares.find(s => /hp|laser|432/i.test(s)) || "";
      const colorPrinter = db.settings.printColorPrinter || shares.find(s => /l375|epson|color/i.test(s)) || "";
      return send(res, 200, { ok: true, serverUrl: `http://${lanAddress()}:${port}`, installKey: db.installKey, colorPrinters: colorPrinter ? [colorPrinter] : [], printers: shares, printBlackPrinter: blackPrinter, printColorPrinter: colorPrinter });
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
      const shares = db.printerShares || [];
      const blackPrinter = db.settings.printBlackPrinter || shares.find(s => /hp|laser|432/i.test(s)) || "";
      const colorPrinter = db.settings.printColorPrinter || shares.find(s => /l375|epson|color/i.test(s)) || "";
      const config = { serverUrl: `http://${lanAddress()}:${port}`, installKey: db.installKey, colorPrinters: colorPrinter ? [colorPrinter] : [], printers: shares, printBlackPrinter: blackPrinter, printColorPrinter: colorPrinter, stationIds };
      const instructions = [
        "INSTALACAO DA ESTACAO - LanHouseManager", "",
        "1. Extraia todos os arquivos deste ZIP em uma pasta local da estacao.",
        "2. Entre uma vez no usuario Windows do cliente e prepare Desktop e Downloads.",
        "3. Execute Instalar-Agente.bat, informe o numero da estacao e confirme o administrador. Escolha o usuario cliente se solicitado.",
        "4. Execute Capturar-Padrao.bat para conferir a captura feita na instalacao.",
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
    // ---------- Cofre de logins (promotoras, bancos, sistemas da Speed) ----------
    // Tudo criptografado (AES-256-GCM) com chave derivada da senha mestre, que nunca e gravada.
    // A chave fica so na memoria, ligada a sessao de login, e expira apos 15 min sem uso.
    if (p.startsWith("/api/vault")) {
      admin(user);
      const sessionKey = hash((req.headers.cookie || "").match(/(?:^|;\s*)lhm_session=([^;]+)/)?.[1] || "");
      const masterMode = Boolean(db.vault.salt);
      const unlocked = () => { if (!masterMode) return vaultAutoKey(); const entry = vaultKeys.get(sessionKey); if (!entry || entry.until < Date.now()) { vaultKeys.delete(sessionKey); return null; } entry.until = Date.now() + 15 * 60000; return entry.key; };
      const encrypt = (key, value) => { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", key, iv); const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]); return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") }; };
      const decrypt = (key, box) => { const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64")); decipher.setAuthTag(Buffer.from(box.tag, "base64")); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(box.data, "base64")), decipher.final()]).toString("utf8")); };
      const list = key => (db.vault.items || []).map(box => ({ id: box.id, ...decrypt(key, box) }));
      if (p === "/api/vault" && req.method === "GET") {
        const key = unlocked();
        // Formato antigo: banco sem login e sem senha era so um nome da lista de bancos.
        if (key) {
          const old = list(key).filter(item => item.kind === "banco" && !item.login && !item.password);
          if (old.length) {
            db.vault.banks ||= [];
            for (const item of old) if (!db.vault.banks.some(b => b.name.toLowerCase() === item.name.toLowerCase())) db.vault.banks.push({ name: item.name, url: item.url || "", active: item.active !== false });
            db.vault.banks.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
            const ids = new Set(old.map(item => item.id));
            db.vault.items = db.vault.items.filter(box => !ids.has(box.id));
            db.vault.updatedAt = now(); save();
          }
        }
        return send(res, 200, { ok: true, masterMode, unlocked: Boolean(key), items: key ? list(key) : [], banks: key ? (db.vault.banks || []) : [] });
      }
      if (p === "/api/vault/setup" && req.method === "POST") {
        if (db.vault.salt) throw err(409, "O cofre ja tem senha mestre");
        const input = await readBody(req); const master = String(input.master || "");
        if (master.length < 8) throw err(400, "A senha mestre precisa ter pelo menos 8 caracteres");
        const salt = crypto.randomBytes(16).toString("hex"); const key = crypto.scryptSync(master, salt, 32);
        const current = list(vaultAutoKey());
        db.vault = { salt, check: encrypt(key, "cofre-ok"), items: current.map(({ id, ...value }) => ({ id, ...encrypt(key, value) })), updatedAt: now() };
        vaultKeys.set(sessionKey, { key, until: Date.now() + 15 * 60000 });
        event("sistema", "Senha mestre do cofre ativada", "", user.name); save();
        return send(res, 200, { ok: true, items: list(key) });
      }
      if (p === "/api/vault/unlock" && req.method === "POST") {
        if (!db.vault.salt) throw err(409, "Crie a senha mestre primeiro");
        const ip = req.socket.remoteAddress || "";
        const attempt = vaultAttempts.get(ip);
        if (attempt && attempt.count >= 5 && attempt.until > Date.now()) throw err(429, "Muitas tentativas. Aguarde 15 minutos.");
        const input = await readBody(req);
        const key = crypto.scryptSync(String(input.master || ""), db.vault.salt, 32);
        let ok = false; try { ok = decrypt(key, db.vault.check) === "cofre-ok"; } catch { ok = false; }
        if (!ok) { vaultAttempts.set(ip, { count: (attempt && attempt.until > Date.now() ? attempt.count : 0) + 1, until: Date.now() + 15 * 60000 }); event("sistema", "Senha mestre errada no cofre", ip, user.name); save(); throw err(401, "Senha mestre incorreta"); }
        vaultAttempts.delete(ip);
        vaultKeys.set(sessionKey, { key, until: Date.now() + 15 * 60000 });
        return send(res, 200, { ok: true, items: list(key) });
      }
      if (p === "/api/vault/lock" && req.method === "POST") { vaultKeys.delete(sessionKey); return send(res, 200, { ok: true }); }
      const key = unlocked();
      if (!key) throw err(423, "Cofre bloqueado: digite a senha mestre");
      if (p === "/api/vault/banks" && req.method === "POST") {
        const input = await readBody(req);
        const seen = new Set();
        db.vault.banks = [].concat(input.banks || []).map(b => ({ name: label(b.name, 60), url: label(b.url, 300), active: b.active !== false })).filter(b => b.name && !seen.has(b.name.toLowerCase()) && seen.add(b.name.toLowerCase())).slice(0, 300)
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
        db.vault.updatedAt = now(); save();
        return send(res, 200, { ok: true, banks: db.vault.banks });
      }
      if (p === "/api/vault/items" && req.method === "POST") {
        const input = await readBody(req);
        const kind = ["banco", "promotora", "sistema"].includes(input.kind) ? input.kind : "banco";
        const value = { kind, name: label(input.name, 80), promoter: label(input.promoter, 80), products: [].concat(input.products || []).map(v => label(v, 20)).filter(Boolean).slice(0, 10), login: String(input.login || "").slice(0, 200), password: String(input.password || "").slice(0, 200), url: label(input.url, 300), notes: String(input.notes || "").slice(0, 1000), active: input.active !== false, updatedAt: now(), updatedBy: user.name };
        if (!value.name) throw err(400, "Informe o nome do banco, promotora ou sistema");
        const id = /^[0-9a-f-]{36}$/.test(String(input.id || "")) && db.vault.items.some(box => box.id === input.id) ? input.id : uuid();
        const box = { id, ...encrypt(key, value) };
        db.vault.items = db.vault.items.filter(item => item.id !== id).concat(box);
        db.vault.updatedAt = now(); event("sistema", "Login do cofre salvo", value.name, user.name); save();
        return send(res, 200, { ok: true, items: list(key) });
      }
      const vaultDelete = p.match(/^\/api\/vault\/items\/([^/]+)\/delete$/);
      if (vaultDelete && req.method === "POST") {
        db.vault.items = db.vault.items.filter(item => item.id !== vaultDelete[1]);
        db.vault.updatedAt = now(); event("sistema", "Login do cofre excluido", "", user.name); save();
        return send(res, 200, { ok: true, items: list(key) });
      }
      throw err(404, "API nao encontrada");
    }
    // Modulo Speed Marketing: chaves "speed_*" que o painel guardava no navegador.
    if (p === "/api/marketing/store" && req.method === "GET") { admin(user); return send(res, 200, { ok: true, store: db.marketing.store }); }
    if (p === "/api/marketing/store" && req.method === "POST") {
      admin(user); const input = await readBody(req);
      const store = { ...db.marketing.store };
      for (const [key, value] of Object.entries(input.set || {})) {
        if (!/^speed_[\w .-]{1,90}$/.test(key)) throw err(400, "Chave invalida");
        if (typeof value !== "string" || value.length > 8 * 1024 * 1024) throw err(400, "Valor invalido");
        store[key] = value;
      }
      for (const key of [].concat(input.remove || [])) delete store[key];
      const size = Object.values(store).reduce((sum, value) => sum + value.length, 0);
      if (size > 40 * 1024 * 1024) throw err(413, "Dados do marketing passaram de 40 MB");
      db.marketing = { store, updatedAt: now() }; save();
      return send(res, 200, { ok: true });
    }
    if (p === "/api/marketing/sync" && req.method === "GET") { admin(user); return send(res, 200, { ok: true, configured: !!mkSource, running: !!mkSync.running, last: readMarketingSync() }); }
    if (p === "/api/marketing/sync" && req.method === "POST") { admin(user); return send(res, 200, { ok: true, result: await runMarketingSync() }); }
    if (p === "/api/marketing/geogrid" && req.method === "GET") { admin(user); return send(res, 200, { ok: true, geogrid: geogridView() }); }
    if (p === "/api/marketing/geogrid/config" && req.method === "POST") {
      admin(user); const input = await readBody(req);
      if (input.remove) { db.geogrid.key = ""; db.geogrid.placeId = ""; db.geogrid.placeName = ""; db.geogrid.placeAddress = ""; db.geogrid.lastError = null; save(); return send(res, 200, { ok: true, geogrid: geogridView() }); }
      const key = String(input.key || db.geogrid.key || "").trim();
      if (!/^[\w-]{20,200}$/.test(key)) throw err(400, "Chave da API invalida");
      // Confere a chave buscando a ficha: so salva se o Google responder.
      const places = await findPlaces({ key, query: "Speed Financeira Varginha", fetchImpl: placesFetch });
      const chosen = input.placeId ? places.find(place => place.id === input.placeId) : places.find(place => /speed financeira/i.test(place.name));
      if (!chosen) return send(res, 404, { ok: false, error: "Ficha da Speed Financeira nao encontrada na busca", candidates: places.slice(0, 10) });
      Object.assign(db.geogrid, { key, placeId: chosen.id, placeName: chosen.name, placeAddress: chosen.address, lastError: null });
      event("sistema", "GeoGrid configurado", `${chosen.name} - ${chosen.address}`, user.name);
      save();
      return send(res, 200, { ok: true, geogrid: geogridView() });
    }
    if (p === "/api/marketing/geogrid/run" && req.method === "POST") {
      admin(user);
      if (!db.geogrid.key || !db.geogrid.placeId) throw err(400, "Configure a chave da API antes de medir");
      await runGeogrid("manual");
      return send(res, 200, { ok: true, geogrid: geogridView() });
    }
    if (p === "/api/marketing/gmb-api" && req.method === "GET") { admin(user); return send(res, 200, { ok: true, gmb: gmbView() }); }
    if (p === "/api/marketing/gmb-api/config" && req.method === "POST") {
      admin(user); const input = await readBody(req);
      if (input.remove) {
        db.gmbApi = emptyGmbApi();
        gmbAccess.token = null; event("sistema", "Perfil da Empresa desconectado", "", user.name); save();
        return send(res, 200, { ok: true, gmb: gmbView() });
      }
      const clientId = String(input.clientId || "").trim();
      const clientSecret = String(input.clientSecret || "").trim() || (clientId === db.gmbApi.clientId ? db.gmbApi.clientSecret : "");
      if (!/^[\w-]{10,120}\.apps\.googleusercontent\.com$/.test(clientId)) throw err(400, "ID do cliente OAuth invalido");
      if (!/^[\w-]{10,120}$/.test(clientSecret)) throw err(400, "Chave secreta do cliente invalida");
      // Cliente novo invalida a conexao antiga: o refresh token pertence ao cliente que o gerou.
      if (clientId !== db.gmbApi.clientId) Object.assign(db.gmbApi, { refreshToken: "", accountName: "", locationName: "", title: "", address: "", connectedAt: null });
      Object.assign(db.gmbApi, { clientId, clientSecret, lastError: null });
      gmbAccess.token = null; event("sistema", "Cliente OAuth do Perfil da Empresa salvo", "", user.name); save();
      return send(res, 200, { ok: true, gmb: gmbView() });
    }
    if (p === "/api/marketing/gmb-api/connect" && req.method === "POST") {
      admin(user);
      if (!db.gmbApi.clientId || !db.gmbApi.clientSecret) throw err(400, "Salve o ID e a chave secreta do cliente antes de conectar");
      const state = gmbApi.newState();
      for (const [key, at] of gmbStates) if (Date.now() - at > 600_000) gmbStates.delete(key);
      gmbStates.set(state, Date.now());
      return send(res, 200, { ok: true, url: gmbApi.authUrl({ clientId: db.gmbApi.clientId, redirectUri: gmbRedirect(), state }) });
    }
    if (p === "/api/marketing/gmb-api/check" && req.method === "POST") {
      admin(user);
      if (!db.gmbApi.refreshToken || !db.gmbApi.locationName) throw err(400, "Conecte a ficha antes de testar");
      try {
        const posts = await gmbApi.listPosts({ accessToken: await gmbToken(), accountName: db.gmbApi.accountName, locationName: db.gmbApi.locationName, fetchImpl: gmbFetch });
        db.gmbApi.lastError = null; save();
        return send(res, 200, { ok: true, gmb: gmbView(), posts });
      } catch (cause) { db.gmbApi.lastError = { at: now(), message: label(cause.message, 300) }; save(); throw cause; }
    }
    // Saude da ficha: nota, alteracoes no perfil, potencial de crescimento e NAP nos diretorios.
    if (p === "/api/marketing/ficha-saude" && req.method === "GET") { admin(user); return send(res, 200, { ok: true, ficha: fichaView() }); }
    if (p === "/api/marketing/ficha-saude/run" && req.method === "POST") {
      admin(user);
      if (!db.gmbApi.refreshToken || !db.gmbApi.locationName) throw err(400, "Conecte a ficha antes de conferir");
      await runFicha("manual");
      return send(res, 200, { ok: true, ficha: fichaView() });
    }
    if (p === "/api/marketing/ficha-saude/nap" && req.method === "POST") {
      admin(user);
      if (!db.fichaSaude.health?.profile) throw err(400, "Confira a saúde da ficha antes, para ter o nome, endereço e telefone oficiais");
      await runNap("manual");
      return send(res, 200, { ok: true, ficha: fichaView() });
    }
    if (p === "/api/marketing/ficha-saude/changes/seen" && req.method === "POST") {
      admin(user);
      for (const change of db.fichaSaude.changes) change.seen = true;
      save(); return send(res, 200, { ok: true, ficha: fichaView() });
    }
    throw err(404, "API nao encontrada");
  }

  const vaultKeys = new Map(), vaultAttempts = new Map();
  function vaultAutoKey() {
    if (!fs.existsSync(vaultKeyFile)) { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(vaultKeyFile, crypto.randomBytes(32).toString("hex")); }
    return Buffer.from(fs.readFileSync(vaultKeyFile, "utf8").trim(), "hex");
  }
  // Sincronizacao do marketing: traz dados, posts e pesquisas da pasta ativa da Speed.
  // O SpeedGeo vem do Google Drive (L:), que so existe na sessao do usuario; este servidor roda como SISTEMA.
  // Por isso o botao dispara a tarefa Nexcafe-Marketing-Sync (sessao do usuario, tambem de hora em hora) e espera o
  // resultado que ela grava. Sem a tarefa, sincroniza aqui mesmo (o SpeedGeo fica de fora).
  const mkSync = { running: null };
  const mkResultFile = path.join(dataDir, MARKETING_SYNC_RESULT);
  const readMarketingSync = () => { try { return JSON.parse(fs.readFileSync(mkResultFile, "utf8")); } catch { return null; } };
  async function marketingSyncViaTask() {
    if (process.platform !== "win32") return null;
    const startedAt = new Date().toISOString();
    const started = await new Promise(resolve => execFile("schtasks", ["/Run", "/TN", MARKETING_SYNC_TASK], { windowsHide: true }, error => resolve(!error)));
    for (let i = 0; started && i < 60; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const last = readMarketingSync();
      if (last && last.at >= startedAt) return last;
    }
    return null;
  }
  function runMarketingSync() {
    if (!mkSource) return Promise.reject(err(400, "Origem do marketing nao configurada"));
    mkSync.running ||= marketingSyncViaTask()
      .then(result => result || syncMarketing({ source: mkSource, dest: marketingDir }))
      .finally(() => { mkSync.running = null; });
    return mkSync.running;
  }
  // Perfil da Empresa (Business Profile API): cliente OAuth, conexao com a ficha e token de acesso em memoria.
  const gmbStates = new Map(), gmbAccess = { token: null, expiresAt: 0 };
  const gmbRedirect = () => `http://localhost:${port}/api/marketing/gmb-api/callback`;
  function gmbView() {
    const g = db.gmbApi;
    return {
      clientConfigured: !!(g.clientId && g.clientSecret), clientIdHint: g.clientId ? `${g.clientId.slice(0, 12)}...` : "",
      connected: !!(g.refreshToken && g.locationName), title: g.title, address: g.address, connectedAt: g.connectedAt,
      redirectUri: gmbRedirect(), scope: gmbApi.SCOPE, lastError: g.lastError
    };
  }
  async function gmbToken() {
    if (gmbAccess.token && gmbAccess.expiresAt - Date.now() > 60_000) return gmbAccess.token;
    const fresh = await gmbApi.refreshAccess({ clientId: db.gmbApi.clientId, clientSecret: db.gmbApi.clientSecret, refreshToken: db.gmbApi.refreshToken, fetchImpl: gmbFetch });
    Object.assign(gmbAccess, { token: fresh.accessToken, expiresAt: fresh.expiresAt });
    return gmbAccess.token;
  }
  async function gmbCallback(res, url) {
    const page = (ok, message) => {
      const text = String(message).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      res.writeHead(ok ? 200 : 400, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Perfil da Empresa</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f4f7f5;color:#1f2d24;margin:0;padding:40px 16px}main{max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.08)}h1{font-size:20px;color:${ok ? "#047857" : "#b91c1c"}}a{color:#047857;font-weight:700}</style></head>
<body><main><h1>${ok ? "Ficha conectada" : "Não foi possível conectar"}</h1><p>${text}</p><p><a href="/marketing/">Voltar ao painel de marketing</a></p></main></body></html>`);
    };
    const state = url.searchParams.get("state") || "";
    if (!gmbStates.has(state) || Date.now() - gmbStates.get(state) > 600_000) return page(false, "Pedido de conexão expirado ou desconhecido. Volte ao painel e clique em Conectar de novo.");
    gmbStates.delete(state);
    if (url.searchParams.get("error")) return page(false, `O Google recusou a autorização (${label(url.searchParams.get("error"), 60)}).`);
    try {
      const tokens = await gmbApi.exchangeCode({ clientId: db.gmbApi.clientId, clientSecret: db.gmbApi.clientSecret, code: String(url.searchParams.get("code") || ""), redirectUri: gmbRedirect(), fetchImpl: gmbFetch });
      const location = await gmbApi.findLocation({ accessToken: tokens.accessToken, fetchImpl: gmbFetch });
      Object.assign(db.gmbApi, { refreshToken: tokens.refreshToken, ...location, connectedAt: now(), lastError: null });
      Object.assign(gmbAccess, { token: tokens.accessToken, expiresAt: tokens.expiresAt });
      event("sistema", "Perfil da Empresa conectado", `${location.title} - ${location.address}`);
      save();
      return page(true, `${location.title} (${location.address}) está ligada ao Nexcafe. Os outros perfis da conta não foram usados.`);
    } catch (cause) {
      db.gmbApi.lastError = { at: now(), message: label(cause.message, 300) }; save();
      return page(false, cause.message);
    }
  }
  // GeoGrid da ficha no Google: medicao manual pelo painel e automatica a cada 30 dias.
  const geo = { running: null, lastCheck: 0 };
  function geogridView() {
    const g = db.geogrid;
    return {
      configured: !!(g.key && g.placeId), keyHint: g.key ? `...${g.key.slice(-4)}` : "", placeId: g.placeId, placeName: g.placeName, placeAddress: g.placeAddress,
      terms: GEOGRID_TERMS, size: GEOGRID_SIZE, spacingKm: GEOGRID_SPACING_KM, running: !!geo.running, lastError: g.lastError, runs: g.runs.slice(-12)
    };
  }
  function runGeogrid(trigger) {
    geo.running ||= measureGeogrid({ key: db.geogrid.key, placeId: db.geogrid.placeId, fetchImpl: placesFetch })
      .then(run => {
        db.geogrid.runs.push({ ...run, trigger });
        db.geogrid.runs = db.geogrid.runs.slice(-24);
        db.geogrid.lastError = null;
        event("sistema", "GeoGrid medido", run.terms.map(item => `${item.term}: media ${item.average}, top 3 em ${item.top3}`).join("; "));
        save();
        return run;
      }, cause => {
        db.geogrid.lastError = { at: now(), message: label(cause.message, 300), trigger };
        save();
        throw cause;
      })
      .finally(() => { geo.running = null; });
    return geo.running;
  }
  function geogridDue() {
    const g = db.geogrid;
    if (!g.key || !g.placeId || geo.running || Date.now() - geo.lastCheck < 3600_000) return;
    geo.lastCheck = Date.now();
    const last = g.runs.at(-1);
    // Erro recente (chave invalida, faturamento desligado): espera um dia antes de tentar de novo sozinho.
    if (g.lastError && Date.now() - Date.parse(g.lastError.at) < 86400_000) return;
    if (!last || Date.now() - Date.parse(last.at) >= 30 * 86400_000) runGeogrid("automatica").catch(cause => console.error(`GeoGrid automatico falhou: ${cause.message}`));
  }
  // Saude da ficha (server/ficha-saude.js): conferida uma vez por dia; NAP dos diretorios uma vez por semana.
  const fichaState = { running: null, napRunning: null, lastCheck: 0 };
  const OLD_PHONES = ["(35) 3113-0458"]; // desativado: nao pode aparecer em diretorio nenhum
  // Fichas parecidas no Maps (Places API, chave do GeoGrid) para a checagem de duplicada.
  async function similarPlaces(location) {
    if (!db.geogrid.key) return null;
    const own = location.metadata?.placeId || db.geogrid.placeId;
    const found = new Map();
    for (const textQuery of [`${ficha.brandName(location.title)} Varginha`, "Speed Lan House Varginha"]) {
      let response;
      try { response = await placesFetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "content-type": "application/json", "X-Goog-Api-Key": db.geogrid.key, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber" }, body: JSON.stringify({ textQuery, languageCode: "pt-BR", regionCode: "BR", pageSize: 10 }) }); }
      catch (cause) { throw new Error(`sem conexão com o Google (${cause.message})`); }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Places respondeu ${response.status}: ${data?.error?.message || "erro desconhecido"}`);
      for (const place of data.places || []) if (place.id !== own) found.set(place.id, { id: place.id, name: place.displayName?.text || "", address: place.formattedAddress || "", phone: place.nationalPhoneNumber || "" });
    }
    return [...found.values()];
  }
  function runFicha(trigger) {
    fichaState.running ||= (async () => {
      const f = db.fichaSaude, at = now(), today = new Date();
      try {
        const data = await gmbApi.readFicha({ accessToken: await gmbToken(), accountName: db.gmbApi.accountName, locationName: db.gmbApi.locationName, fetchImpl: gmbFetch, now: today });
        if (!data.location.ok) throw err(502, `Não deu para ler a ficha: ${data.location.message}`);
        const location = data.location.value;
        let others = null, othersError = null;
        try { others = await similarPlaces(location); } catch (cause) { othersError = label(cause.message, 160); }
        const keywords = data.keywords.ok ? ficha.topKeywords(data.keywords.value) : [];
        const reviews = data.reviews.ok ? { ok: true, value: ficha.reviewSummary(data.reviews.value, today) } : data.reviews;
        const checks = ficha.evaluateHealth({ ...data, reviews, keywords: keywords.map(k => k.term), others, othersError }, today);
        const score = ficha.scoreOf(checks);
        // Alteracoes: compara com a foto da ficha guardada na conferencia anterior.
        const snapshot = ficha.snapshotOf(location);
        const changes = ficha.diffSnapshots(f.snapshot?.fields, snapshot);
        if (changes.length) {
          f.changes = [...changes.map(change => ({ ...change, at, seen: false })), ...f.changes].slice(0, 50);
          event("sistema", "Ficha do Google alterada", changes.map(change => change.label).join(", "));
        }
        f.snapshot = { at, fields: snapshot };
        if (data.updated.ok) {
          const diff = ficha.googleDiff(data.updated.value);
          const fresh = diff.filter(item => !f.googleDiff.some(old => old.field === item.field));
          if (fresh.length) event("sistema", "Google tem versão diferente na ficha", fresh.map(item => item.label).join(", "));
          f.googleDiff = diff;
        }
        const l = location;
        const previous = f.history.at(-1);
        f.health = {
          at, trigger, checks, score, keywords: keywords.slice(0, 10),
          actions: data.actions.ok ? data.actions.value : null, actionsError: data.actions.ok ? null : data.actions.message,
          reviews: reviews.ok ? reviews.value : null,
          profile: { title: l.title || "", name: ficha.brandName(l.title), address: ficha.addressLine(l.storefrontAddress), phone: l.phoneNumbers?.primaryPhone || "", primaryCategory: l.categories?.primaryCategory?.displayName || "", additionalCategories: (l.categories?.additionalCategories || []).map(c => c.displayName || c.name) }
        };
        f.history = [...f.history, { at, percent: score.percent }].slice(-60);
        f.lastError = null;
        if (trigger === "manual" || previous?.percent !== score.percent) event("sistema", "Saúde da ficha conferida", `nota ${score.percent} (${score.passed} de ${score.total} itens)`);
        save();
      } catch (cause) {
        f.lastError = { at, message: label(cause.message, 300), trigger }; save();
        throw cause;
      }
    })().finally(() => { fichaState.running = null; });
    return fichaState.running;
  }
  // Diretorios mapeados na Central de Correcao NAP (public/marketing/js/data_nap_erros.js).
  function napDirectories() {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(marketingDir, "js", "data_nap_erros.js"), "utf8"), sandbox, { timeout: 1000 });
    return (sandbox.window.SPEED_NAP_ERROS || []).filter(item => /^https:\/\//.test(String(item.url_ficha || ""))).map(item => ({ id: String(item.id), name: String(item.diretorio), url: String(item.url_ficha) }));
  }
  async function fetchPage(url) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await napFetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "accept-language": "pt-BR,pt;q=0.9" }, redirect: "follow", signal: controller.signal });
      if (!response.ok) return { error: `o site respondeu ${response.status}` };
      return { html: (await response.text()).slice(0, 3_000_000) };
    } catch (cause) { return { error: cause.name === "AbortError" ? "o site demorou mais de 15 s" : `sem conexão (${label(cause.message, 80)})` }; }
    finally { clearTimeout(timer); }
  }
  function runNap(trigger) {
    fichaState.napRunning ||= (async () => {
      const profile = db.fichaSaude.health.profile;
      const official = { name: profile.name, address: profile.address, phone: profile.phone };
      const results = [];
      for (const dir of napDirectories()) {
        const page = await fetchPage(dir.url);
        results.push(page.error ? { ...dir, result: "unreadable", message: page.error } : { ...dir, ...ficha.compareNap(page.html, official, OLD_PHONES) });
      }
      db.fichaSaude.nap = { at: now(), trigger, official, results };
      event("sistema", "NAP dos diretórios conferido", `${results.filter(r => r.result === "match").length} certos, ${results.filter(r => r.result === "mismatch").length} com erro, ${results.filter(r => r.result !== "match" && r.result !== "mismatch").length} sem confirmação`);
      save();
    })().finally(() => { fichaState.napRunning = null; });
    return fichaState.napRunning;
  }
  function fichaDue() {
    if (!db.gmbApi.refreshToken || !db.gmbApi.locationName || fichaState.running || Date.now() - fichaState.lastCheck < 3600_000) return;
    fichaState.lastCheck = Date.now();
    const f = db.fichaSaude;
    if (f.lastError && Date.now() - Date.parse(f.lastError.at) < 6 * 3600_000) return;
    if (f.health && Date.now() - Date.parse(f.health.at) < 20 * 3600_000) return;
    runFicha("automatica")
      .then(() => (!f.nap || Date.now() - Date.parse(f.nap.at) >= 7 * 86400_000 ? runNap("automatica") : null))
      .catch(cause => console.error(`Saude da ficha automatica falhou: ${cause.message}`));
  }
  function fichaView() {
    const f = db.fichaSaude, run = db.geogrid.runs.at(-1), actions = f.health?.actions;
    // Potencial por termo: ultima medicao do GeoGrid com as acoes dos ultimos 30 dias da ficha.
    const growth = run && actions ? run.terms.map(t => ({ term: t.term, measuredAt: run.at, ...ficha.estimateGrowthPotential(t.cells.map(c => c.rank), actions.total) })) : [];
    return { connected: !!(db.gmbApi.refreshToken && db.gmbApi.locationName), running: !!fichaState.running, napRunning: !!fichaState.napRunning, health: f.health, history: f.history.slice(-30), changes: f.changes.slice(0, 20), unseenChanges: f.changes.filter(c => !c.seen).length, googleDiff: f.googleDiff, nap: f.nap, growth, lastError: f.lastError };
  }
  const MARKETING_TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".json": "application/json", ".csv": "text/csv; charset=utf-8", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".pdf": "application/pdf", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
  // Biblioteca de pesquisas do marketing: lista as pastas em /marketing/arquivos/.
  function marketingLibrary(dir, relative) {
    const esc = value => String(value).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const kinds = { ".xlsx": "Planilha", ".csv": "Planilha", ".docx": "Documento", ".md": "Texto", ".txt": "Texto", ".pptx": "Apresentação", ".json": "Dados", ".html": "Página", ".pdf": "PDF" };
    const entries = fs.readdirSync(dir, { withFileTypes: true }).filter(e => !e.name.startsWith(".")).sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name, "pt-BR"));
    const rows = entries.map(e => {
      const href = encodeURIComponent(e.name) + (e.isDirectory() ? "/" : "");
      const size = e.isDirectory() ? "" : `${Math.max(1, Math.round(fs.statSync(path.join(dir, e.name)).size / 1024))} KB`;
      return `<tr><td><a href="${href}"${e.isDirectory() ? "" : ' target="_blank" rel="noopener"'}>${e.isDirectory() ? "&#128193; " : ""}${esc(e.name)}</a></td><td>${e.isDirectory() ? "Pasta" : kinds[path.extname(e.name).toLowerCase()] || "Arquivo"}</td><td>${size}</td></tr>`;
    }).join("");
    const title = relative ? relative.replace(/\/$/, "") : "Arquivos de pesquisa";
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      body{font-family:"Segoe UI",Arial,sans-serif;margin:0;background:#f4f7f5;color:#0b2e1a}
      header{background:linear-gradient(90deg,#0a7a3d,#0b8a45);color:#fff;padding:18px 28px;display:flex;align-items:center;gap:12px}
      header b{background:#f5c518;color:#0b3a1e;border-radius:8px;padding:4px 10px;font-size:13px}
      main{padding:24px 28px;max-width:1000px} table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}
      td,th{padding:11px 14px;border-bottom:1px solid #e6efe9;text-align:left;font-size:14px} th{background:#eef7f1;font-size:12px;text-transform:uppercase;color:#4b6b58}
      a{color:#0a7a3d;font-weight:600;text-decoration:none} a:hover{text-decoration:underline} p{color:#4b6b58}
    </style></head><body><header><b>Speed Financeira</b><strong>${esc(title)}</strong></header><main>
    ${relative ? '<p><a href="../">&larr; Voltar</a></p>' : "<p>Estudos de palavras-chave, pesquisa SEO, controle de diretórios e importação do Google Ads. Planilhas e documentos abrem no Excel/Word ao clicar.</p>"}
    <table><thead><tr><th>Nome</th><th>Tipo</th><th>Tamanho</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Pasta vazia</td></tr>'}</tbody></table></main></body></html>`;
  }
  function serveMarketing(req, res, url) {
    let user = null;
    try { user = operator(req); } catch { }
    if (!user || user.role !== "admin") { res.writeHead(302, { location: "/" }); return res.end(); }
    if (url.pathname === "/marketing") { res.writeHead(302, { location: "/marketing/" }); return res.end(); }
    const relative = decodeURIComponent(url.pathname.slice("/marketing/".length)) || "index.html";
    const file = path.resolve(marketingDir, relative);
    const libraryDir = path.join(marketingDir, "arquivos");
    if ((file === libraryDir || file.startsWith(libraryDir + path.sep)) && fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!url.pathname.endsWith("/")) { res.writeHead(302, { location: url.pathname + "/" }); return res.end(); }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(marketingLibrary(file, relative.replace(/^arquivos\/?/, "")));
    }
    if (!file.startsWith(marketingDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw err(404, "Arquivo nao encontrado");
    const type = MARKETING_TYPES[path.extname(file).toLowerCase()];
    if (!type) throw err(404, "Arquivo nao encontrado");
    if (relative === "index.html") {
      // Dados salvos no Nexcafe entram antes dos scripts do painel (que leem o localStorage ao abrir).
      const data = JSON.stringify(db.marketing.store).replace(/</g, "\\u003c");
      const page = fs.readFileSync(file, "utf8").replace(/<head>/i, () => `<head>\n  <script>window.__NEXCAFE_MARKETING__ = ${data};</script>\n  <script src="nexcafe-sync.js"></script>`);
      res.writeHead(200, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
      return res.end(page);
    }
    res.writeHead(200, { "content-type": type, "cache-control": "no-cache", "x-content-type-options": "nosniff" });
    fs.createReadStream(file).pipe(res);
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const stationRoute = /^\/api\/(client|agent|bootstrap)(\/|$)/.test(url.pathname);
      if (db.settings.panelOnlyHere && !loopback(req) && !stationRoute) {
        if (url.pathname.startsWith("/api/")) throw err(403, "Painel liberado apenas no computador do caixa");
        res.writeHead(403, { "content-type": "text/html; charset=utf-8" });
        return res.end("<!doctype html><meta charset=utf-8><body style=\"font-family:Segoe UI;padding:40px\"><h2>Painel disponível só no computador do caixa.</h2></body>");
      }
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      if (url.pathname === "/marketing" || url.pathname.startsWith("/marketing/")) return serveMarketing(req, res, url);
      const files = {
        "/": "index.html",
        "/index.html": "index.html",
        "/app.js": "app.js",
        "/styles.css": "styles.css",
        "/favicon.ico": "favicon.ico",
        "/favicon.svg": "favicon.svg",
        "/favicon-32x32.png": "favicon-32x32.png",
        "/favicon-16x16.png": "favicon-16x16.png",
        "/apple-touch-icon.png": "apple-touch-icon.png"
      };
      const file = files[url.pathname]; if (!file || req.method !== "GET") throw err(404, "Pagina nao encontrada");
      const mimeTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ico": "image/x-icon"
      };
      const ext = path.extname(file).toLowerCase();
      const type = mimeTypes[ext] || "application/octet-stream";
      res.writeHead(200, { "content-type": type, "cache-control": ext === ".html" || ext === ".js" || ext === ".css" ? "no-store" : "public, max-age=86400", "x-content-type-options": "nosniff" });
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
    geogridDue();
    fichaDue();
  }, 15_000);
  server.on("close", () => clearInterval(sweeper));
  // O .NET das estacoes reaproveita conexao ociosa por ate 100 s; o padrao do Node fecha em 5 s.
  // Se o servidor fecha primeiro, a estacao tenta usar a conexao morta e a requisicao estoura o tempo.
  server.keepAliveTimeout = 120_000;
  server.headersTimeout = 125_000;
  return server;
}

module.exports = { createApp };
