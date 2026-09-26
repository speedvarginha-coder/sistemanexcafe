const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'server', 'data', 'db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// Set up settings
db.settings = db.settings || {};
db.settings.dailyGoalCents = 50000; // R$ 500,00
db.settings.monthGoalCents = 3000000; // R$ 30.000,00
db.settings.printBWCents = 100;
db.settings.printColorCents = 200;

// Setup client accounts
db.clients = db.clients || [];
const clientsData = [
  { id: 'cli_darci', name: 'Darci Piva', phone: '35 98849-9382', active: true, points: 185 },
  { id: 'cli_apure', name: 'Apure Saúde Varginha', phone: '(35) 3606-0600', active: true, points: 13, doc: '37321936000124' },
  { id: 'cli_christofer', name: 'CHRISTOFER DA SILVA CARVALHO', phone: '(35) 9 9988-4743', active: true, points: 12 }
];
for (const c of clientsData) {
  const ex = db.clients.find(x => x.id === c.id || x.name.toLowerCase() === c.name.toLowerCase());
  if (!ex) db.clients.push({ id: c.id, name: c.name, phone: c.phone, active: true, points: c.points, creditSeconds: 0, createdAt: '2026-05-10T10:00:00Z' });
  else { ex.id = c.id; ex.points = c.points; }
}

// Setup fiado pending charge for Darci Piva (R$ 35,00)
db.charges = db.charges || [];
if (!db.charges.some(ch => ch.clientId === 'cli_darci' && ch.amountCents > ch.paidCents)) {
  db.charges.push({
    id: 'charge_fiado_darci_35',
    at: '2026-05-13T14:20:00.000Z',
    dueDate: '2026-06-12',
    kind: 'sale',
    description: 'Venda a Prazo / Fiado · Darci Piva',
    clientId: 'cli_darci',
    amountCents: 3500,
    paidCents: 0,
    items: [
      { name: 'Serviços de Impressão e Cópias', quantity: 1, unitPriceCents: 3500, totalCents: 3500, category: 'Gráfica Rápida' }
    ]
  });
}

// Setup historical cash movements
db.cashShifts = db.cashShifts || [];
const shiftsData = [
  { id: 'shift_20260926', openedAt: '2026-09-26T09:45:24.000Z', openedBy: 'admin', openingCents: 10000, closedAt: null, notes: 'Abertura Rápida (Fundo de Troco R$ 100,00)' },
  { id: 'shift_20260925', openedAt: '2026-09-25T10:37:00.000Z', openedBy: 'admin', openingCents: 10000, closedAt: '2026-09-25T18:55:13.000Z', closedBy: 'admin', countedCashCents: 21150, expectedCashCents: 21150, diffCents: 0, notes: 'RESUMO DO PERÍODO: (+) Fundo de Troco: R$ 100,00 (+) Vendas em Dinheiro: R$ 111,50' },
  { id: 'shift_20260924', openedAt: '2026-09-24T09:57:00.000Z', openedBy: 'admin', openingCents: 10000, closedAt: '2026-09-24T23:59:00.000Z', closedBy: 'admin', countedCashCents: 13300, expectedCashCents: 13300, diffCents: 0, notes: 'RESUMO DO PERÍODO: (+) Fundo de Troco: R$ 100,00' },
  { id: 'shift_20260923', openedAt: '2026-09-23T09:30:00.000Z', openedBy: 'admin', openingCents: 10000, closedAt: '2026-09-23T23:59:00.000Z', closedBy: 'admin', countedCashCents: 16450, expectedCashCents: 16450, diffCents: 0, notes: 'RESUMO DO PERÍODO: (+) Fundo de Troco: R$ 100,00' }
];

for (const sh of shiftsData) {
  const existingIdx = db.cashShifts.findIndex(x => x.id === sh.id);
  if (existingIdx >= 0) db.cashShifts[existingIdx] = { ...db.cashShifts[existingIdx], ...sh };
  else db.cashShifts.unshift(sh);
}

// Generate September month charges matching exactly the Speed Financeira numbers:
// Receita Operacional Bruta: R$ 4.884,25
// Descontos: R$ 7,00
// Receita Operacional Líquida: R$ 4.877,25
// CMV: R$ 3.929,60
// Lucro Bruto: R$ 947,65
// Despesas Fixas: R$ 0,00 (no mês) ou R$ 5.330,00 no ano
// Meios de recebimento: Dinheiro (R$ 1.991,05), PIX (R$ 1.241,50), Débito (R$ 1.209,40), Crédito (R$ 442,30)

// Let's check how many charges exist for September 2026:
const septCharges = db.charges.filter(c => c.at && c.at.startsWith('2026-09'));
console.log('Existing September charges:', septCharges.length);

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
console.log('Database base configuration updated successfully!');
