const fs = require('fs');
const content = fs.readFileSync('D:/Sistema Nexcafe/LanHouseManager/server/public/marketing/social/posts_fila.js', 'utf8');
console.log('Length:', content.length);
console.log(content.substring(0, 1000));
