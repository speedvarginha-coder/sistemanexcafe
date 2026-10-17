// Indicadores diarios do plano de 7 dias: receita, atendimentos, ticket, anexos (envelope, recebimento),
// servicos de maior valor e impressao em volume. Recarga de credito do cliente nao e venda.
"use strict";
const { groupOf, groupOfName, isHighValue, PB_GROUP, COLOR_GROUP } = require("./grupos");

const VOLUME_PAGES = 50;
const localDay = value => new Date(value).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

// Itens de uma cobranca, ja com o grupo padronizado.
function chargeLines(charge, productById) {
  if (charge.items?.length) {
    return charge.items.map(item => {
      const product = item.productId ? productById.get(item.productId) : null;
      const group = product ? groupOf(product) : groupOfName(item.name, item.category);
      return { group, category: product?.category || item.category, quantity: item.quantity || 1, totalCents: item.totalCents || 0 };
    });
  }
  if (charge.kind === "time") return [{ group: "Uso de computador", category: "Lan House & Serviços Digitais", quantity: 1, totalCents: charge.amountCents }];
  if (charge.kind === "print") return [{ group: charge.color ? COLOR_GROUP : PB_GROUP, category: "Gráfica Rápida", quantity: charge.quantity || 1, totalCents: charge.amountCents }];
  if (charge.kind === "product" && charge.productId) {
    const product = productById.get(charge.productId);
    return [{ group: groupOf(product), category: product?.category, quantity: charge.quantity || 1, totalCents: charge.amountCents }];
  }
  return [{ group: "Outros", category: "", quantity: 1, totalCents: charge.amountCents }];
}

function emptyDay(date) {
  return { date, revenueCents: 0, charges: 0, visits: 0, pbSales: 0, pbWithEnvelope: 0, pbWithReceive: 0, highValueUnits: 0, highValueCents: 0, volumePages: 0, volumeSales: 0, leftoverCents: 0, byGroup: {} };
}

// charges: historico completo (db + arquivos mensais); incomes: receitas avulsas (sobras de caixa).
function buildIndicators({ charges, incomes = [], products = [], start, end }) {
  const productById = new Map(products.map(item => [item.id, item]));
  const days = new Map();
  const dayOf = date => { if (!days.has(date)) days.set(date, emptyDay(date)); return days.get(date); };
  const sessions = new Map();
  for (const charge of charges) {
    if (charge.kind === "credit") continue;
    const date = localDay(charge.at);
    if (date < start || date > end) continue;
    const day = dayOf(date);
    day.revenueCents += charge.amountCents || 0;
    day.charges++;
    // Tempo e impressao da mesma sessao de maquina contam como um atendimento.
    const visitKey = `${date}|${charge.sessionId || charge.id}`;
    if (!sessions.has(visitKey)) { sessions.set(visitKey, true); day.visits++; }
    const lines = chargeLines(charge, productById);
    for (const line of lines) {
      const g = day.byGroup[line.group] ||= { quantity: 0, revenueCents: 0 };
      g.quantity += line.quantity; g.revenueCents += line.totalCents;
      if (isHighValue(line.group, line.category)) { day.highValueUnits += line.quantity; day.highValueCents += line.totalCents; }
    }
    // Anexos so fazem sentido na venda de balcao (cobranca com itens).
    if (!charge.items?.length) continue;
    const pbPages = lines.filter(line => line.group === PB_GROUP).reduce((sum, line) => sum + line.quantity, 0);
    if (!pbPages) continue;
    day.pbSales++;
    if (lines.some(line => line.group === "Envelope")) day.pbWithEnvelope++;
    if (lines.some(line => line.group === "Recebimento de Arquivos")) day.pbWithReceive++;
    if (pbPages >= VOLUME_PAGES) { day.volumePages += pbPages; day.volumeSales++; }
  }
  for (const income of incomes) {
    if (!/sobra/i.test(income.category || "")) continue;
    const date = localDay(income.at);
    if (date >= start && date <= end) dayOf(date).leftoverCents += income.amountCents || 0;
  }
  const list = [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map(finish);
  const total = finish(list.reduce((acc, day) => {
    for (const key of ["revenueCents", "charges", "visits", "pbSales", "pbWithEnvelope", "pbWithReceive", "highValueUnits", "highValueCents", "volumePages", "volumeSales", "leftoverCents"]) acc[key] += day[key];
    for (const [group, g] of Object.entries(day.byGroup)) { const t = acc.byGroup[group] ||= { quantity: 0, revenueCents: 0 }; t.quantity += g.quantity; t.revenueCents += g.revenueCents; }
    return acc;
  }, emptyDay("total")));
  const open = list.length || 1;
  // Media por dia aberto (dias com venda).
  const average = finish({ ...total, date: "media", revenueCents: Math.round(total.revenueCents / open), charges: total.charges / open, visits: total.visits / open, highValueUnits: total.highValueUnits / open, highValueCents: Math.round(total.highValueCents / open), volumePages: total.volumePages / open, volumeSales: total.volumeSales / open, leftoverCents: Math.round(total.leftoverCents / open) });
  return { start, end, openDays: list.length, days: list, total, average };
}
function finish(day) {
  return {
    ...day,
    ticketCents: day.visits ? Math.round(day.revenueCents / day.visits) : 0,
    envelopePct: day.pbSales ? Math.round(1000 * day.pbWithEnvelope / day.pbSales) / 10 : null,
    receivePct: day.pbSales ? Math.round(1000 * day.pbWithReceive / day.pbSales) / 10 : null
  };
}

module.exports = { buildIndicators, chargeLines, VOLUME_PAGES };
