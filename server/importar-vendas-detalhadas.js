// Importa o "relatorio_vendas_detalhado" do sistema anterior (vendas com itens e formas de pagamento).
// Uso (com o servidor PARADO): node server/importar-vendas-detalhadas.js vendas.json
// O JSON vem da planilha (colunas: ID Venda, Data, Hora, Itens Vendidos, Forma de Pagamento, Subtotal, Desconto, Total).
// Pode rodar de novo: cada venda tem id fixo (legado_v_<ID>) e nao duplica. Nao mexe no estoque.
"use strict";
const fs = require("fs");
const path = require("path");

const dbPath = process.env.LHM_DB || path.join(__dirname, "data", "db.json"); // LHM_DB: testar numa copia
const file = process.argv[2];
if (!file) { console.error("Uso: node importar-vendas-detalhadas.js vendas.json"); process.exit(1); }
const rows = JSON.parse(fs.readFileSync(file, "utf8"));
const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
fs.copyFileSync(dbPath, `${dbPath}.antes-vendas-detalhadas-${Date.now()}.bak`);

const cents = value => Math.round(Number(String(value ?? 0).replace(",", ".")) * 100);
const norm = text => String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const METHOD = { dinheiro: "cash", pix: "pix", debito: "debit", credito: "credit" };
const products = new Map(db.products.map(p => [norm(p.name), p]));
const known = new Set(db.charges.map(c => c.id));
const stats = { vendas: 0, totalCents: 0, puladas: 0, itensSemCadastro: new Set(), ajustesPagamento: 0, fiado: 0 };

for (const row of rows) {
  const id = `legado_v_${row.id}`;
  if (known.has(id)) { stats.puladas++; continue; }
  const [d, m, y] = String(row.date).split("/");
  const at = new Date(`${y}-${m}-${d}T${row.time || "12:00"}:00-03:00`).toISOString();
  const totalCents = cents(row.total), discountCents = cents(row.discount), subtotalCents = cents(row.subtotal);

  // Itens: "2x Impressao P/B Balcao, 1x Recebimento de Arquivos". Valor de cada item: proporcional ao preco do cadastro.
  const parsed = [...String(row.items).matchAll(/(\d+)x ([^,]+)/g)].map(([, q, name]) => ({ quantity: Number(q), name: name.trim(), product: products.get(norm(name)) }));
  const weights = parsed.map(it => it.quantity * (it.product?.priceCents || 100));
  const weightSum = weights.reduce((s, w) => s + w, 0) || 1;
  let rest = subtotalCents || totalCents;
  const items = parsed.map((it, i) => {
    const lineCents = i === parsed.length - 1 ? rest : Math.round((subtotalCents || totalCents) * weights[i] / weightSum);
    rest -= lineCents;
    if (!it.product) stats.itensSemCadastro.add(it.name);
    return { productId: it.product?.id || null, name: it.product?.name || it.name, category: it.product?.category || "Sistema anterior", quantity: it.quantity, unitPriceCents: Math.round(lineCents / it.quantity), totalCents: lineCents };
  });
  if (!items.length) items.push({ productId: null, name: "Venda do sistema anterior", category: "Sistema anterior", quantity: 1, unitPriceCents: totalCents, totalCents });

  // Formas de pagamento: "Dinheiro: R$ 8.00" (pode ter mais de uma). Sem valor ou soma diferente: ajusta ao total.
  let parts = [...String(row.payment).matchAll(/([A-Za-zÀ-ú]+)\s*:\s*R\$\s*([\d.,]+)/g)].map(([, f, v]) => ({ key: norm(f), amountCents: cents(v) }));
  if (!parts.length) parts = [{ key: norm(String(row.payment).split(/[:,]/)[0]), amountCents: totalCents }];
  const sum = parts.reduce((s, p) => s + p.amountCents, 0);
  if (sum !== totalCents) { parts[parts.length - 1].amountCents += totalCents - sum; stats.ajustesPagamento++; }
  const payments = [];
  for (const [i, p] of parts.entries()) {
    if (p.key === "fiado") { stats.fiado++; continue; } // a divida do cliente ja esta cadastrada no sistema novo
    if (p.amountCents <= 0) continue;
    payments.push({ id: `${id}_pag${i}`, at, chargeId: id, shiftId: null, amountCents: p.amountCents, method: METHOD[p.key] || "cash", operator: "sistema anterior", legacy: true });
  }
  const methods = parts.map(p => p.key).join(" + ");
  db.charges.push({ id, at, kind: "sale", importedFrom: "sistema anterior", legacyRef: String(row.id), description: `Venda sistema anterior: ${items.map(it => `${it.quantity}x ${it.name}`).join(", ").slice(0, 140)} (${methods})`, amountCents: totalCents, paidCents: totalCents, discountCents, originalTotalCents: subtotalCents || totalCents, items });
  db.payments.push(...payments);
  stats.vendas++; stats.totalCents += totalCents;
}
const byDate = (a, b) => String(b.at).localeCompare(String(a.at));
db.charges.sort(byDate); db.payments.sort(byDate);
fs.writeFileSync(`${dbPath}.tmp`, JSON.stringify(db), "utf8");
fs.renameSync(`${dbPath}.tmp`, dbPath);
console.log(JSON.stringify({ ...stats, totalReais: stats.totalCents / 100, itensSemCadastro: [...stats.itensSemCadastro] }, null, 1));
