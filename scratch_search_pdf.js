const fs = require('fs');

const appJs = fs.readFileSync('server/public/app.js', 'utf8');
const lines = appJs.split('\n');
console.log('--- Matches for pdf or print dialog in app.js ---');
lines.forEach((l, i) => {
  if (l.toLowerCase().includes('pdf') || l.toLowerCase().includes('impress') || l.toLowerCase().includes('dialog')) {
    if (l.includes('Dialog') || l.includes('Modal') || l.includes('open') || l.includes('print')) {
      console.log(`${i+1}: ${l.trim()}`);
    }
  }
});
