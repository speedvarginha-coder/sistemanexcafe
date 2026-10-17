// Indicadores diarios do plano de 7 dias. Separa tres coisas que nao podem ser misturadas:
// - caixa recebido (pagamentos do dia, inclusive pacote pre-pago e recarga de tempo);
// - receita de servicos prestados (o que foi entregue no dia, inclusive entrega de pacote; sem recarga e sem venda de pacote);
// - contribuicao estimada (receita menos custo direto), so nos itens com custo comprovado ou cenario identificado.
"use strict";
const { groupOf, groupOfName, isHighValue, PB_GROUP, COLOR_GROUP } = require("./grupos");

const VOLUME_PAGES = 50;
const localDay = value => new Date(value).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

// Custo direto por unidade (centavos). Nada aqui e inventado: cada linha diz de onde veio.
const COSTS = [
  { test: line => /envelope pardo/i.test(line.name || ""), cents: 43.2, label: "Envelope pardo", source: "comprovado: compra de 250 unidades por R$ 108,00 (R$ 0,432 cada)" },
  { test: line => line.group === PB_GROUP, cents: 14, label: "Página P&B", source: "cenário: papelaria R$ 0,10 a R$ 0,13 + toner (recarga R$ 70) + cilindro (R$ 130) = R$ 0,12 a R$ 0,16; usado R$ 0,14" },
  { test: line => line.group === COLOR_GROUP, cents: 14, label: "Página colorida (texto)", source: "cenário: papel como no P&B + tinta pelo rendimento publicado da Epson; foto ou página cheia custa mais" },
];
const COST_NOTES = COSTS.map(({ label, cents, source }) => ({ label, cents, source }));
const costOf = line => { const rule = COSTS.find(item => item.test(line)); return rule ? rule.cents * line.quantity : null; };

// As 7 categorias oficiais; nomes antigos de categoria e servicos sem cadastro caem na categoria certa pelo grupo.
const CATEGORY_ALIASES = { "Bebidas & Bomboniere": "Bomboniere & Bebidas", "Acessórios & Cabos": "Eletrônicos & Acessórios" };
const OFFICIAL = ["Gráfica Rápida", "Serviços Públicos", "Lan House & Serviços Digitais", "Informática & Celular", "Eletrônicos & Acessórios", "Bomboniere & Bebidas", "Serviços Financeiros"];
const GROUP_CATEGORY = {
  [PB_GROUP]: "Gráfica Rápida", [COLOR_GROUP]: "Gráfica Rápida", "Impressão em papel especial": "Gráfica Rápida", "Plastificação": "Gráfica Rápida", "Foto 3x4": "Gráfica Rápida", "Envelope": "Gráfica Rápida", "Encadernação": "Gráfica Rápida", "Scanner": "Gráfica Rápida",
  "INSS (Meu INSS)": "Serviços Públicos", "Detran": "Serviços Públicos", "gov.br": "Serviços Públicos",
  "Consulta SPC/crédito": "Serviços Financeiros", "Manutenção de celular": "Informática & Celular",
  "Bomboniere e bebidas": "Bomboniere & Bebidas", "Eletrônicos e acessórios": "Eletrônicos & Acessórios"
};
function categoryOf(line) {
  const named = CATEGORY_ALIASES[line.category] || line.category;
  if (OFFICIAL.includes(named)) return named;
  return GROUP_CATEGORY[line.group] || "Lan House & Serviços Digitais";
}

// Itens de uma cobranca, ja com o grupo padronizado.
function chargeLines(charge, productById) {
  if (charge.items?.length) {
    return charge.items.map(item => {
      const product = item.productId ? productById.get(item.productId) : null;
      const group = product ? groupOf(product) : groupOfName(item.name, item.category);
      return { group, name: product?.name || item.name, category: product?.category || item.category, quantity: item.quantity || 1, totalCents: item.totalCents || 0 };
    });
  }
  if (charge.kind === "time") return [{ group: "Uso de computador", name: "Tempo de máquina", category: "Lan House & Serviços Digitais", quantity: 1, totalCents: charge.amountCents }];
  if (charge.kind === "print") return [{ group: charge.color ? COLOR_GROUP : PB_GROUP, name: "Impressão da estação", category: "Gráfica Rápida", quantity: charge.quantity || 1, totalCents: charge.amountCents }];
  if (charge.kind === "product" && charge.productId) {
    const product = productById.get(charge.productId);
    return [{ group: groupOf(product), name: product?.name, category: product?.category, quantity: charge.quantity || 1, totalCents: charge.amountCents }];
  }
  return [{ group: "Outros", name: charge.description, category: "", quantity: 1, totalCents: charge.amountCents }];
}

const SUM_KEYS = ["revenueCents", "charges", "visits", "pbSales", "pbWithEnvelope", "pbWithReceive", "highValueUnits", "highValueCents", "volumePages", "volumeSales", "leftoverCents",
  "cashCents", "cashPackageCents", "cashTimeCreditCents", "pbPages", "colorPages", "envelopes", "costedRevenueCents", "costCents", "uncostedRevenueCents", "packageDeliveredCents", "packageDeliveredPages"];
function emptyDay(date) {
  const day = { date, byGroup: {}, byCategory: {} };
  for (const key of SUM_KEYS) day[key] = 0;
  return day;
}

// charges e payments: historico completo (db + arquivos mensais); incomes: receitas avulsas (sobras de caixa).
function buildIndicators({ charges, payments = [], incomes = [], products = [], start, end }) {
  const productById = new Map(products.map(item => [item.id, item]));
  const chargeById = new Map(charges.map(item => [item.id, item]));
  const days = new Map();
  const dayOf = date => { if (!days.has(date)) days.set(date, emptyDay(date)); return days.get(date); };
  const visits = new Set(), categoryVisits = new Set();
  for (const charge of charges) {
    // Recarga de tempo e venda de pacote sao dinheiro recebido antes de prestar o servico: so contam no caixa.
    if (charge.kind === "credit" || charge.kind === "package") continue;
    const date = localDay(charge.at);
    if (date < start || date > end) continue;
    const day = dayOf(date);
    day.revenueCents += charge.amountCents || 0;
    day.charges++;
    // Tempo e impressao da mesma sessao de maquina contam como um atendimento.
    const visitKey = `${date}|${charge.sessionId || charge.id}`;
    if (!visits.has(visitKey)) { visits.add(visitKey); day.visits++; }
    if (charge.packageDelivery) { day.packageDeliveredCents += charge.amountCents; }
    const lines = chargeLines(charge, productById);
    // Desconto da venda reduz a receita dos itens na mesma proporcao (para a contribuicao nao ficar maior que a venda).
    const gross = lines.reduce((sum, line) => sum + line.totalCents, 0);
    const factor = gross > 0 ? (charge.amountCents || 0) / gross : 1;
    for (const line of lines) {
      const revenue = line.totalCents * factor;
      const g = day.byGroup[line.group] ||= { quantity: 0, revenueCents: 0 };
      g.quantity += line.quantity; g.revenueCents += revenue;
      const category = categoryOf(line);
      const c = day.byCategory[category] ||= { sales: 0, units: 0, revenueCents: 0 };
      c.units += line.quantity; c.revenueCents += revenue;
      const catKey = `${visitKey}|${category}`;
      if (!categoryVisits.has(catKey)) { categoryVisits.add(catKey); c.sales++; }
      if (isHighValue(line.group, line.category)) { day.highValueUnits += line.quantity; day.highValueCents += revenue; }
      if (line.group === PB_GROUP) { day.pbPages += line.quantity; if (charge.packageDelivery) day.packageDeliveredPages += line.quantity; }
      if (line.group === COLOR_GROUP) day.colorPages += line.quantity;
      if (/envelope pardo/i.test(line.name || "")) day.envelopes += line.quantity;
      const cost = costOf(line);
      if (cost === null) day.uncostedRevenueCents += revenue;
      else { day.costedRevenueCents += revenue; day.costCents += cost; }
    }
    // Anexos so fazem sentido na venda de balcao (cobranca com itens), e nao na entrega de pacote.
    if (!charge.items?.length || charge.packageDelivery) continue;
    const pbPages = lines.filter(line => line.group === PB_GROUP).reduce((sum, line) => sum + line.quantity, 0);
    if (!pbPages) continue;
    day.pbSales++;
    if (lines.some(line => line.group === "Envelope")) day.pbWithEnvelope++;
    if (lines.some(line => line.group === "Recebimento de Arquivos")) day.pbWithReceive++;
    if (pbPages >= VOLUME_PAGES) { day.volumePages += pbPages; day.volumeSales++; }
  }
  for (const payment of payments) {
    const date = localDay(payment.at);
    if (date < start || date > end) continue;
    const day = dayOf(date);
    day.cashCents += payment.amountCents || 0;
    const kind = chargeById.get(payment.chargeId)?.kind;
    if (kind === "package") day.cashPackageCents += payment.amountCents || 0;
    if (kind === "credit") day.cashTimeCreditCents += payment.amountCents || 0;
  }
  for (const income of incomes) {
    if (!/sobra/i.test(income.category || "")) continue;
    const date = localDay(income.at);
    if (date >= start && date <= end) dayOf(date).leftoverCents += income.amountCents || 0;
  }
  const list = [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map(finish);
  const total = finish(list.reduce((acc, day) => {
    for (const key of SUM_KEYS) acc[key] += day[key];
    for (const [group, g] of Object.entries(day.byGroup)) { const t = acc.byGroup[group] ||= { quantity: 0, revenueCents: 0 }; t.quantity += g.quantity; t.revenueCents += g.revenueCents; }
    for (const [cat, c] of Object.entries(day.byCategory)) { const t = acc.byCategory[cat] ||= { sales: 0, units: 0, revenueCents: 0 }; t.sales += c.sales; t.units += c.units; t.revenueCents += c.revenueCents; }
    return acc;
  }, emptyDay("total")));
  // Media por dia aberto (dias com venda).
  const open = list.length || 1;
  const average = { date: "media", byGroup: {}, byCategory: {} };
  for (const key of SUM_KEYS) average[key] = total[key] / open;
  for (const [cat, c] of Object.entries(total.byCategory)) average.byCategory[cat] = { sales: c.sales / open, units: c.units / open, revenueCents: c.revenueCents / open };
  return { start, end, openDays: list.length, days: list, total, average: finish(average), costNotes: COST_NOTES };
}
function finish(day) {
  return {
    ...day,
    contributionCents: Math.round(day.costedRevenueCents - day.costCents),
    marginPct: day.costedRevenueCents ? Math.round(1000 * (day.costedRevenueCents - day.costCents) / day.costedRevenueCents) / 10 : null,
    ticketCents: day.visits ? Math.round(day.revenueCents / day.visits) : 0,
    envelopePct: day.pbSales ? Math.round(1000 * day.pbWithEnvelope / day.pbSales) / 10 : null,
    receivePct: day.pbSales ? Math.round(1000 * day.pbWithReceive / day.pbSales) / 10 : null
  };
}

// Pacotes pre-pagos ainda a entregar (obrigacao com o cliente).
function packagesOutstanding(clients = []) {
  const rows = [];
  for (const client of clients) for (const pack of client.printPackages || []) {
    const pages = pack.pages - pack.delivered;
    if (pages > 0) rows.push({ clientId: client.id, client: client.name, packageId: pack.id, soldAt: pack.soldAt, validUntil: pack.validUntil, pages, cents: pack.amountCents - pack.recognizedCents });
  }
  return { rows, pages: rows.reduce((s, r) => s + r.pages, 0), cents: rows.reduce((s, r) => s + r.cents, 0) };
}

module.exports = { buildIndicators, chargeLines, packagesOutstanding, categoryOf, VOLUME_PAGES, COST_NOTES };
