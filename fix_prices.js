const fs = require('fs');

const dbPath = 'server/data/db.json';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// 1. Update product 104
for (const p of Object.values(db.products)) {
  if (p.code === '104' && p.name.toLowerCase().includes('xerox')) {
    p.priceCents = 100;
    p.category = 'Gráfica Rápida';
    p.active = true;
  }
  if (p.code === '342') {
    p.priceCents = 100;
    p.category = 'Gráfica Rápida';
    p.active = true;
  }
  if (p.code === '101' || p.code === '1.1') {
    p.priceCents = 100;
    p.category = 'Gráfica Rápida';
    p.active = true;
  }
  if (p.code === '3') {
    // Acesso a internet
    p.name = 'Acesso a Internet';
    p.category = 'Lan House & Serviços Digitais';
    p.active = true;
  }
}

// Make sure code 104 Xerox exists if 104 was overwritten by banking app
const xerox104 = Object.values(db.products).find(p => p.code === '104');
if (xerox104 && !xerox104.name.toLowerCase().includes('xerox')) {
  // Add dedicated 104 for Xerox or keep 342
  console.log('104 is:', xerox104.name);
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
console.log('Updated key print & Xerox products in db.json!');
