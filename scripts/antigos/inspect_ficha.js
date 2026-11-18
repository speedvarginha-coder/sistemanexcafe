const fs = require('fs');
const content = fs.readFileSync('D:/Sistema Nexcafe/LanHouseManager/server/public/marketing/js/ficha_saude.js', 'utf8');

const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('A ficha mudou') || l.includes('marcar como visto') || l.includes('fichaSaudeConteudo')) {
    console.log((idx + 1) + ': ' + l.trim());
  }
});
