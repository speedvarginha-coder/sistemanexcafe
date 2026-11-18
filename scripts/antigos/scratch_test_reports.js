const fs = require('fs');

const dbPath = 'server/data/db.json';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('Total charges:', db.charges.length);
console.log('Total payments:', db.payments.length);
console.log('Total products:', db.products.length);

const now = new Date();
const currentMonthStr = '2026-09';

// Calculate month revenue
const monthCharges = db.charges.filter(ch => (ch.at || '').startsWith(currentMonthStr));
const monthRevenue = monthCharges.reduce((s, ch) => s + ch.amountCents, 0);
console.log('September charges revenue:', monthRevenue / 100);
