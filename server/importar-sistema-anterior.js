// Importacao unica dos dados do sistema anterior (planilha de produtos + fluxo de caixa).
// Uso (com o servidor PARADO): node server/importar-sistema-anterior.js produtos.json fluxo.json
// Os JSON sao gerados das planilhas pelo script Python do mesmo nome. Pode rodar de novo: nao duplica.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const dbPath = path.join(__dirname, "data", "db.json");
const [sheetFile, flowFile] = process.argv.slice(2);
if (!sheetFile || !flowFile) { console.error("Uso: node importar-sistema-anterior.js produtos.json fluxo.json"); process.exit(1); }
const sheet = JSON.parse(fs.readFileSync(sheetFile, "utf8"));
const flow = JSON.parse(fs.readFileSync(flowFile, "utf8"));
const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
fs.copyFileSync(dbPath, `${dbPath}.antes-importacao-${Date.now()}.bak`);

const cents = value => Math.round(Number(value || 0) * 100);
const norm = text => String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const STOCK_CATEGORIES = new Set(["Bomboniere & Bebidas", "Eletrônicos & Acessórios", "Informática & Celular"]);

// ---------- Produtos: a planilha manda (nome, categoria, preco, custo, estoque, situacao) ----------
// Codigos repetidos na planilha: o segundo recebe "-B" (decisao do dono da loja).
const seen = new Set();
for (const row of sheet) {
  if (seen.has(row.code)) row.code = `${row.code}-B`;
  seen.add(row.code);
}
// Codigos que o importador anterior trocou.
const RENAMES = { "104-APP": "104", "20-INATIVO": "20-B" };
for (const product of db.products) {
  if (RENAMES[product.code]) product.code = RENAMES[product.code];
  else if (product.code === "2" && norm(product.name) === "impressao colorida") product.code = "2-B";
  else if (product.code === "360" && norm(product.name).startsWith("fone pmcell")) product.code = "360-B";
}
// "Xerox / Copia P&B" com codigo 104 foi inventado (o 104 real e o aplicativo bancario). A xerox e o 342.
db.products = db.products.filter(product => !(product.code === "104" && norm(product.name).startsWith("xerox")));

const byCode = new Map(db.products.map(product => [product.code, product]));
const stats = { updated: 0, created: 0, inactive: 0, withoutCost: 0 };
for (const row of sheet) {
  const priceCents = cents(row.price);
  const cost = cents(row.cost);
  // Custo igual ao preco (ou zero) no sistema anterior significa "nao cadastrado", nao lucro zero.
  const costCents = cost > 0 && cost < priceCents ? cost : null;
  if (costCents === null) stats.withoutCost++;
  const active = row.status === "Ativo";
  if (!active) stats.inactive++;
  let product = byCode.get(row.code);
  if (!product) {
    product = { id: crypto.randomUUID(), code: row.code, type: STOCK_CATEGORIES.has(row.category) ? "stock" : "service", minStock: 0, createdAt: new Date().toISOString() };
    db.products.push(product);
    byCode.set(row.code, product);
    stats.created++;
  } else stats.updated++;
  Object.assign(product, { name: row.name, category: row.category, priceCents, costCents, stock: Math.round(Number(row.stock || 0)), active });
}

// ---------- Fluxo de caixa: vendas, sangrias, suprimento e despesas do sistema anterior ----------
// Vendas do sistema anterior lancadas a mao pelo importador anterior (duplicariam as do fluxo).
db.charges = db.charges.filter(item => !String(item.id).startsWith("charge_today_"));
db.payments = db.payments.filter(item => !String(item.id).startsWith("pay_today_"));
// Caixas fechados inventados (23 a 25/09); o historico real vem do fluxo.
db.cashShifts = db.cashShifts.filter(item => !/^shift_202609(23|24|25)$/.test(item.id));
// Caixa antigo esquecido aberto desde 24/09: fecha para ficar so um caixa aberto.
for (const shift of db.cashShifts) {
  if (!shift.closedAt && shift.id !== (db.cashShifts.find(item => !item.closedAt) || {}).id) {
    Object.assign(shift, { closedAt: new Date().toISOString(), closedBy: "importacao", notes: "Fechado na importacao: havia dois caixas abertos." });
  }
}

const METHOD = { "dinheiro": "cash", "pix": "pix", "debito": "debit", "credito": "credit", "n/a": "cash" };
const localToIso = text => {
  const [, d, m, y, hh, mm] = text.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:00-03:00`).toISOString();
};
db.expenses ||= [];
const known = new Set([...db.charges, ...db.payments, ...db.cashAdjustments, ...db.expenses].map(item => item.id));
const flowStats = { sales: 0, salesCents: 0, adjustments: 0, expenses: 0, skipped: 0 };
for (const row of flow) {
  const at = localToIso(row.date);
  const amountCents = cents(row.in) - cents(row.out);
  const id = `legado_${row.code}`;
  if (known.has(id)) { flowStats.skipped++; continue; }
  if (row.origin === "Venda PDV") {
    const methods = (row.description.match(/\((.*)\)/) || [, "N/A"])[1];
    // Fiado de R$ 35 ja esta como pendencia da Darci Piva.
    if (/fiado/i.test(methods)) { flowStats.skipped++; continue; }
    // Pagamento misto sem o valor de cada parte: fica todo na primeira forma.
    const method = METHOD[norm(methods.split("+")[0])] || "cash";
    db.charges.push({ id, at, kind: "sale", legacy: true, description: `Venda sistema anterior (${methods})`, amountCents, paidCents: amountCents, items: [{ name: "Vendas do sistema anterior", quantity: 1, unitPriceCents: amountCents, totalCents: amountCents, category: "Sistema anterior" }] });
    db.payments.push({ id: `${id}_pag`, at, chargeId: id, shiftId: null, amountCents, method, operator: "sistema anterior", legacy: true });
    flowStats.sales++; flowStats.salesCents += amountCents;
  } else if (/^(SANGRIA|SUPRIMENTO)/.test(row.description)) {
    db.cashAdjustments.push({ id, at, shiftId: null, amountCents: Math.abs(amountCents), direction: amountCents < 0 ? "out" : "in", reason: `${row.description.trim()} (sistema anterior)`, operator: "sistema anterior", legacy: true });
    flowStats.adjustments++;
  } else if (amountCents < 0) {
    db.expenses.push({ id, at, category: row.origin, description: row.description.trim(), amountCents: -amountCents, operator: "sistema anterior", legacy: true });
    flowStats.expenses++;
  } else flowStats.skipped++; // aberturas e fechamentos sem valor
}
const byDate = (a, b) => String(b.at).localeCompare(String(a.at));
for (const key of ["charges", "payments", "cashAdjustments", "expenses"]) db[key].sort(byDate);

fs.writeFileSync(`${dbPath}.tmp`, JSON.stringify(db), "utf8");
fs.renameSync(`${dbPath}.tmp`, dbPath);
console.log(JSON.stringify({ produtos: stats, fluxo: { ...flowStats, salesReais: flowStats.salesCents / 100 } }, null, 1));
