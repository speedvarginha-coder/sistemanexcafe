const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'data', 'db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// Backup
fs.writeFileSync(`${dbPath}.pre-full-import-${Date.now()}`, JSON.stringify(db, null, 2), 'utf8');

const csvPath = path.join(__dirname, 'server', 'data', 'produtos_speed.csv');
const csvLines = fs.readFileSync(csvPath, 'utf8').split('\n').filter(Boolean);
csvLines.shift(); // Remove header

if (!Array.isArray(db.products)) {
  db.products = [];
}

let addedCount = 0;
let updatedCount = 0;

for (const line of csvLines) {
  const parts = line.split(',');
  if (parts.length < 9) continue;
  const code = parts[0].trim();
  const name = parts[1].trim();
  const category = parts[2].trim();
  const stock = parseInt(parts[3], 10) || 0;
  const cost = parseFloat(parts[4]) || 0;
  let salePrice = parseFloat(parts[5]) || 0;
  const situacao = parts[8].trim();
  const active = situacao.toLowerCase().includes('ativo');

  // Xerox: R$ 1,00 (100 cents)
  if (name.toLowerCase() === 'xerox' || name.toLowerCase().includes('xerox') || code === '342') {
    salePrice = 1.00;
  }
  // Impressão P/B Balcão: R$ 1,00
  if (code === '1.1' || code === '101') {
    salePrice = 1.00;
  }

  const priceCents = Math.round(salePrice * 100);
  const costCents = Math.round(cost * 100);
  const isStockCategory = ['Bomboniere & Bebidas', 'Eletrônicos & Acessórios'].includes(category);
  const type = isStockCategory ? 'stock' : 'service';

  // Check if product exists by code or exact name
  const existing = db.products.find(p => p.code === code || p.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.name = name;
    existing.code = code;
    existing.category = category;
    existing.type = type;
    existing.priceCents = priceCents;
    existing.costCents = costCents;
    existing.stock = stock;
    existing.active = active;
    updatedCount++;
  } else {
    db.products.push({
      id: crypto.randomUUID(),
      name,
      code,
      category,
      type,
      priceCents,
      costCents,
      stock,
      minStock: isStockCategory ? 5 : 0,
      active,
      createdAt: new Date().toISOString()
    });
    addedCount++;
  }
}

// Ensure code 104 is also directly mapped to Xerox / Cópia P&B at R$ 1,00
let prod104 = db.products.find(p => p.code === '104');
if (!prod104) {
  db.products.push({
    id: crypto.randomUUID(),
    name: 'Xerox / Cópia P&B',
    code: '104',
    category: 'Gráfica Rápida',
    type: 'service',
    priceCents: 100,
    costCents: 50,
    stock: 0,
    minStock: 0,
    active: true,
    createdAt: new Date().toISOString()
  });
} else if (prod104.name.toLowerCase().includes('xerox')) {
  prod104.priceCents = 100;
  prod104.active = true;
}

// Ensure "Acesso a Internet" has code "3" and is active
let internetProd = db.products.find(p => p.code === '3' || p.name.toLowerCase() === 'acesso a internet');
if (internetProd) {
  internetProd.name = 'Acesso a Internet';
  internetProd.code = '3';
  internetProd.category = 'Lan House & Serviços Digitais';
  internetProd.active = true;
  internetProd.type = 'service';
} else {
  db.products.push({
    id: crypto.randomUUID(),
    name: 'Acesso a Internet',
    code: '3',
    category: 'Lan House & Serviços Digitais',
    type: 'service',
    priceCents: 0,
    costCents: 0,
    stock: 0,
    minStock: 0,
    active: true,
    createdAt: new Date().toISOString()
  });
}

// Ensure clients from user screenshots exist
if (!Array.isArray(db.clients)) db.clients = [];
const clientsToEnsure = [
  { id: 'cli_darci', name: 'Darci Piva', phone: '35 98849-9382', active: true, points: 185 },
  { id: 'cli_apure', name: 'Apure Saúde Varginha', phone: '(35) 3606-0600', active: true, points: 13, doc: '37321936000124' },
  { id: 'cli_christofer', name: 'CHRISTOFER DA SILVA CARVALHO', phone: '(35) 9 9988-4743', active: true, points: 12 }
];

for (const c of clientsToEnsure) {
  const existing = db.clients.find(x => x.name.toLowerCase() === c.name.toLowerCase() || x.id === c.id);
  if (!existing) {
    db.clients.push({
      id: c.id,
      name: c.name,
      phone: c.phone,
      active: true,
      createdAt: '2026-05-10T10:00:00.000Z',
      points: c.points,
      creditSeconds: 0
    });
  }
}

// Ensure open fiado charge for Darci Piva (R$ 35,00)
if (!Array.isArray(db.charges)) db.charges = [];
const hasDarciFiado = db.charges.some(ch => ch.clientId === 'cli_darci' && ch.amountCents > ch.paidCents);
if (!hasDarciFiado) {
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
      { name: 'Serviços Lan House / Gráfica', quantity: 1, unitPriceCents: 3500, totalCents: 3500, category: 'Lan House & Serviços Digitais' }
    ]
  });
}

// Ensure today's sales from screenshot exist if charges are empty
const todayStr = '2026-09-26';
const todaySales = [
  { time: '11:08', desc: 'Venda PDV', method: 'cash', items: [{ name: 'Recebimento de Arquivos', code: '20', quantity: 3, unitPriceCents: 100, totalCents: 300, category: 'Lan House & Serviços Digitais' }, { name: 'Impressão P/B Balcão', code: '1.1', quantity: 6, unitPriceCents: 100, totalCents: 600, category: 'Gráfica Rápida' }], total: 900 },
  { time: '11:04', desc: 'Venda PDV', method: 'pix', items: [{ name: 'Impressão P/B Balcão', code: '1.1', quantity: 4, unitPriceCents: 100, totalCents: 400, category: 'Gráfica Rápida' }], total: 400 },
  { time: '10:16', desc: 'Venda PDV', method: 'cash', items: [{ name: 'Impressão P/B Balcão', code: '1.1', quantity: 3, unitPriceCents: 100, totalCents: 300, category: 'Gráfica Rápida' }], total: 300 },
  { time: '10:12', desc: 'Venda PDV', method: 'cash', items: [{ name: 'Impressão Colorida', code: '2', quantity: 5, unitPriceCents: 200, totalCents: 1000, category: 'Gráfica Rápida' }, { name: 'Envelope Pardo', code: '152', quantity: 1, unitPriceCents: 200, totalCents: 200, category: 'Gráfica Rápida' }, { name: 'Recebimento de Arquivos', code: '20', quantity: 1, unitPriceCents: 100, totalCents: 100, category: 'Lan House & Serviços Digitais' }], total: 1300 },
  { time: '09:49', desc: 'Venda PDV', method: 'pix', items: [{ name: 'Impressão Colorida', code: '2', quantity: 3, unitPriceCents: 200, totalCents: 600, category: 'Gráfica Rápida' }], total: 600 }
];

if (!Array.isArray(db.payments)) db.payments = [];
let shift = db.cashShifts.find(s => !s.closedAt);
if (!shift) {
  shift = {
    id: 'shift_today_auto',
    openedAt: `${todayStr}T09:45:24.000Z`,
    openedBy: 'admin',
    openingCents: 10000,
    closedAt: null,
    notes: 'Abertura Rápida (Fundo de Troco R$ 100,00)'
  };
  db.cashShifts.unshift(shift);
}

for (const s of todaySales) {
  const chargeId = `charge_today_${s.time.replace(':', '')}`;
  if (!db.charges.some(ch => ch.id === chargeId)) {
    db.charges.push({
      id: chargeId,
      at: `${todayStr}T${s.time}:00.000Z`,
      kind: 'sale',
      description: `${s.desc} (${s.items.map(it => it.name).join(', ')})`,
      amountCents: s.total,
      paidCents: s.total,
      items: s.items
    });
    db.payments.push({
      id: `pay_today_${s.time.replace(':', '')}`,
      at: `${todayStr}T${s.time}:00.000Z`,
      chargeId,
      shiftId: shift.id,
      amountCents: s.total,
      method: s.method,
      operator: 'admin'
    });
  }
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
console.log(`DB updated successfully! Products: ${db.products.length} (Added ${addedCount}, Updated ${updatedCount})`);
