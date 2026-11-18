const fs = require('fs');
const content = fs.readFileSync('D:/Sistema Nexcafe/LanHouseManager/server/public/marketing/js/criador_artes.js', 'utf8');

const lines = content.split('\n');
console.log('Total lines in criador_artes.js:', lines.length);
lines.slice(0, 80).forEach((l, idx) => {
  console.log((idx + 1) + ': ' + l.trim());
});
