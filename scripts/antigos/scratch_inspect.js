const fs = require('fs');

const db = JSON.parse(fs.readFileSync('server/data/db.json', 'utf8'));
console.log('Total products:', Object.keys(db.products).length);

const prods = Object.values(db.products);
console.log('Sample products:');
prods.slice(0, 10).forEach(p => console.log(`Code: ${p.code}, Name: ${p.name}, Price: ${p.priceCents}, Active: ${p.active}`));

const internet = prods.filter(p => p.name.toLowerCase().includes('internet') || p.name.toLowerCase().includes('acesso'));
console.log('Internet products:', internet);
