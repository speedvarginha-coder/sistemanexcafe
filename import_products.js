const fs = require('fs');
const crypto = require('crypto');

const dbPath = 'server/data/db.json';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// Backup current db
fs.writeFileSync(`${dbPath}.bak-${Date.now()}`, JSON.stringify(db, null, 2), 'utf8');

const csvLines = fs.readFileSync('server/data/produtos_speed.csv', 'utf8').split('\n').filter(Boolean);
const header = csvLines.shift(); // remove header

let countAdded = 0;
let countUpdated = 0;

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

  // Rule from user: "O preço é um real quando lançado está em 0,50" for Xerox!
  if (name.toLowerCase() === 'xerox' || name.toLowerCase().includes('xerox / cópia p&b')) {
    salePrice = 1.00;
  }

  const priceCents = Math.round(salePrice * 100);
  const costCents = Math.round(cost * 100);

  // Type: services vs stock
  const isStockCategory = ['Bomboniere & Bebidas', 'Eletrônicos & Acessórios'].includes(category);
  const type = isStockCategory ? 'stock' : 'service';

  // Find existing by exact code or exact name
  const existingId = Object.keys(db.products).find(id => {
    const p = db.products[id];
    return (p.code && p.code === code) || (p.name && p.name.toLowerCase() === name.toLowerCase());
  });

  if (existingId) {
    db.products[existingId].name = name;
    db.products[existingId].code = code;
    db.products[existingId].category = category;
    db.products[existingId].type = type;
    db.products[existingId].priceCents = priceCents;
    db.products[existingId].costCents = costCents;
    db.products[existingId].stock = stock;
    db.products[existingId].active = active;
    countUpdated++;
  } else {
    const newId = crypto.randomUUID();
    db.products[newId] = {
      id: newId,
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
    };
    countAdded++;
  }
}

// Ensure code 104 is also aliased or preserved if needed:
// In the CSV:
// Code 104 is "Criação de Usuário Aplicativo Bancário"
// Code 342 is "Xerox"
// Let's also ensure Xerox has code 342 AND if someone types 104, let's make sure both are great.
// Let's check "Acesso a Internet":
const internet = Object.values(db.products).find(p => p.code === '3' || p.name.toLowerCase() === 'acesso a internet');
console.log('Internet product in DB:', internet);

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
console.log(`Imported products! Added: ${countAdded}, Updated: ${countUpdated}, Total in DB: ${Object.keys(db.products).length}`);
