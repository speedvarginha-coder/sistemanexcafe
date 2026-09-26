const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'data', 'db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

function computeExecutiveReport(input, db) {
  const date = typeof input === 'string' ? input : (input.date || '2026-09-26');
  const period = typeof input === 'object' && input.period ? input.period : 'today';

  const onDate = value => {
    if (!value) return false;
    const d = new Date(value).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    if (period === 'today') return d === date;
    if (period === 'month') return d.slice(0, 7) === date.slice(0, 7);
    if (period === '7d') {
      const diff = (Date.parse(date) - Date.parse(d)) / (24 * 3600 * 1000);
      return diff >= 0 && diff < 7;
    }
    if (period === '15d') {
      const diff = (Date.parse(date) - Date.parse(d)) / (24 * 3600 * 1000);
      return diff >= 0 && diff < 15;
    }
    if (period === '30d') {
      const diff = (Date.parse(date) - Date.parse(d)) / (24 * 3600 * 1000);
      return diff >= 0 && diff < 30;
    }
    if (period === 'all') return true;
    return d === date;
  };

  const charges = db.charges.filter(item => onDate(item.at));
  const payments = db.payments.filter(item => onDate(item.at));
  const sessions = (db.sessionHistory || []).filter(item => onDate(item.endedAt));

  const byMethod = { cash: 0, pix: 0, card: 0, debit: 0, credit: 0 };
  for (const item of payments) {
    if (byMethod[item.method] !== undefined) byMethod[item.method] += item.amountCents;
    else byMethod.card += item.amountCents;
  }

  const byMachine = {};
  for (const item of sessions) {
    byMachine[item.machineId] ||= { machineId: item.machineId, count: 0, minutes: 0 };
    byMachine[item.machineId].count++;
    byMachine[item.machineId].minutes += item.usedMinutes;
  }

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

  const salesCents = charges.reduce((sum, item) => sum + item.amountCents, 0);
  const receivedCents = payments.reduce((sum, item) => sum + item.amountCents, 0);
  const dueCents = db.charges.reduce((sum, item) => sum + item.amountCents - item.paidCents, 0);

  return {
    ok: true,
    date,
    period,
    salesCents,
    receivedCents,
    dueCents,
    sessions: sessions.length,
    minutes: sessions.reduce((sum, item) => sum + item.usedMinutes, 0),
    byMethod,
    byMachine: Object.values(byMachine),
    byProduct: Object.values(byProduct).sort((a, b) => b.amountCents - a.amountCents),
    byOperator: Object.values(byOperator).sort((a, b) => b.receivedCents - a.receivedCents),
    charges
  };
}

console.log('Today report:', computeExecutiveReport('2026-09-26', db));
console.log('Month report:', computeExecutiveReport({ date: '2026-09-26', period: 'month' }, db));
