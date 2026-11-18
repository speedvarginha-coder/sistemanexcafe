#!/usr/bin/env node
/*
  Validador do pacote DeepSeek 07-11-26.

  O que confere:
    - sintaxe do JavaScript e dos blocos JSON-LD
    - balanco de tags HTML
    - um H1 por pagina publica, title, description e canonical
    - frases proibidas e telefones banidos
    - bloco de transparencia nas paginas de servico digital
    - links internos que apontam para arquivo existente
    - sitemap, robots, llms.txt e schema da pasta 30_SEO_Tecnico
    - presenca dos QR codes e dos arquivos 27 a 32

  Uso: node ferramentas/validar_pacote.js
  Nao publica e nao altera nada.
*/
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PAGINAS = path.join(RAIZ, 'paginas');
const ARTIGOS = path.join(RAIZ, 'artigos');
const QR = path.join(RAIZ, '29_QR_Codes');
const SEO = path.join(RAIZ, '30_SEO_Tecnico');

let erros = 0;
let avisos = 0;
const relatorio = [];

function erro(msg) { erros++; relatorio.push('ERRO   ' + msg); }
function aviso(msg) { avisos++; relatorio.push('aviso  ' + msg); }

function ler(caminho) {
  return fs.readFileSync(caminho, 'utf8');
}

function contar(texto, re) {
  return (texto.match(re) || []).length;
}

const HTML_PUBLICOS = [
  '06_LP_Grafica.html',
  '07_LP_Consignado.html'
].map(function (n) { return path.join(RAIZ, n); });

const HTML_FERRAMENTAS = [
  '12_Painel_KPIs.html',
  '21_One_Page_Decisoes.html',
  '22_Calculadora_Grafica.html',
  '23_Simulador_Midia.html',
  '24_Relatorio_Mensal.html',
  '27_Contador_Balcao.html',
  '32_Ficha_Custo_Grafica.html'
].map(function (n) { return path.join(RAIZ, n); });

function listarHtml(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(function (f) { return f.toLowerCase().endsWith('.html'); })
    .map(function (f) { return path.join(dir, f); });
}

HTML_PUBLICOS.push.apply(HTML_PUBLICOS, listarHtml(PAGINAS));
HTML_PUBLICOS.push.apply(HTML_PUBLICOS, listarHtml(ARTIGOS));
HTML_FERRAMENTAS.push.apply(HTML_FERRAMENTAS, listarHtml(QR));

const TODOS_HTML = HTML_PUBLICOS.concat(HTML_FERRAMENTAS);

const PROIBIDOS = [
  '3113-0458', '3067-4361',
  'aprovação garantida', 'aprovado na hora',
  'somos oficiais', 'credenciados pelo inss',
  'sem consulta', 'taxa zero'
];

const FUTUROS = ['grafica.html', 'consignado.html', 'index.html'];

function validarHtml(arquivo, ehFerramenta) {
  const nome = path.relative(RAIZ, arquivo);
  const html = ler(arquivo);

  // JSON-LD
  const lds = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  lds.forEach(function (bloco, i) {
    const conteudo = bloco.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    try { JSON.parse(conteudo); }
    catch (e) { erro(nome + ' → JSON-LD ' + (i + 1) + ': ' + e.message); }
  });

  // JavaScript
  const scripts = html.match(/<script(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/gi) || [];
  scripts.forEach(function (bloco, i) {
    const code = bloco.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    if (!code) return;
    try { new Function(code); }
    catch (e) { erro(nome + ' → JS ' + (i + 1) + ': ' + e.message); }
  });

  // Tags
  const semScript = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const tags = ['div', 'section', 'header', 'footer', 'main', 'table', 'thead', 'tbody', 'tfoot',
    'tr', 'td', 'th', 'ul', 'ol', 'li', 'details', 'summary', 'form', 'article', 'address',
    'span', 'button', 'label', 'select', 'p', 'h1', 'h2', 'h3', 'a', 'em', 'strong', 'small',
    'nav', 'title', 'head', 'body', 'html'];
  tags.forEach(function (t) {
    const abre = contar(semScript, new RegExp('<' + t + '(?=[\\s>])', 'gi'));
    const fecha = contar(semScript, new RegExp('</' + t + '\\s*>', 'gi'));
    if (abre !== fecha) erro(nome + ' → tag ' + t + ': ' + abre + '/' + fecha);
  });

  const h1 = contar(semScript, /<h1[\s>]/gi);
  if (!ehFerramenta && h1 !== 1) erro(nome + ' → H1 encontrado ' + h1 + 'x');
  if (ehFerramenta && h1 > 1) erro(nome + ' → mais de um H1 (' + h1 + ')');

  const titulo = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
  if (!titulo) erro(nome + ' → sem <title>');
  else if (titulo.length > 65) aviso(nome + ' → title com ' + titulo.length + ' caracteres');

  if (!ehFerramenta) {
    const desc = (html.match(/<meta\s+name="description"\s+content="([\s\S]*?)"/i) || [])[1] || '';
    if (!desc) erro(nome + ' → sem meta description');
    else if (desc.length > 160) aviso(nome + ' → description com ' + desc.length + ' caracteres');
    else if (desc.length < 100) aviso(nome + ' → description curta: ' + desc.length);
    if (!/rel="canonical"/i.test(html)) erro(nome + ' → sem canonical');
  }

  const proibidos = PROIBIDOS.filter(function (p) {
    return html.toLowerCase().includes(p.toLowerCase());
  });
  if (proibidos.length && !ehFerramenta) {
    erro(nome + ' → texto proibido: ' + proibidos.join(', '));
  }

  if (/\{\{ZAP\}\}/.test(html)) erro(nome + ' → placeholder {{ZAP}} nao substituido');

  const ehDigital = /meu-inss|extrato-cnis|carta-concessao|conta-govbr|imprimir-crlv|abrir-mei|servicos-digitais/.test(nome);
  if (ehDigital && !/empresa privada e não representa/i.test(html)) {
    erro(nome + ' → sem bloco de transparencia');
  }

  const links = (html.match(/href="([^"#:]+\.html)"/gi) || []).map(function (m) {
    return m.replace(/^href="/i, '').replace(/"$/, '');
  });
  const unicos = Array.from(new Set(links));
  unicos.forEach(function (l) {
    if (FUTUROS.indexOf(l) !== -1) return;
    const candidatos = [
      path.join(path.dirname(arquivo), l),
      path.join(RAIZ, l),
      path.join(PAGINAS, l),
      path.join(ARTIGOS, l)
    ];
    if (!candidatos.some(function (c) { return fs.existsSync(c); })) {
      aviso(nome + ' → link ausente: ' + l);
    }
  });
}

TODOS_HTML.forEach(function (arquivo) {
  if (!fs.existsSync(arquivo)) {
    erro('arquivo ausente: ' + path.relative(RAIZ, arquivo));
    return;
  }
  validarHtml(arquivo, HTML_FERRAMENTAS.indexOf(arquivo) !== -1);
});

// ---------- SEO tecnico ----------
function validarSitemap() {
  const arquivo = path.join(SEO, 'sitemap.xml');
  if (!fs.existsSync(arquivo)) { erro('30_SEO_Tecnico/sitemap.xml ausente'); return; }
  const texto = ler(arquivo);
  if (!/^<\?xml/i.test(texto.trim())) erro('sitemap.xml sem declaracao XML');
  if (!/<urlset[\s>]/.test(texto) || !/<\/urlset>/.test(texto)) erro('sitemap.xml sem urlset');
  const locs = (texto.match(/<loc>([^<]+)<\/loc>/g) || []).map(function (m) {
    return m.replace(/<\/?loc>/g, '').trim();
  });
  if (!locs.length) erro('sitemap.xml sem <loc>');
  const vistos = {};
  locs.forEach(function (url) {
    if (vistos[url]) erro('sitemap.xml com URL duplicada: ' + url);
    vistos[url] = true;
    if (!/^https:\/\/speedfinanceira\.com\.br\//.test(url)) {
      erro('sitemap.xml com URL fora do dominio: ' + url);
      return;
    }
    if (url === 'https://speedfinanceira.com.br/') return;
    const caminho = url.replace('https://speedfinanceira.com.br/', '');
    if (caminho === 'grafica.html' || caminho === 'consignado.html') return;
    let local;
    if (caminho === 'artigos/') local = path.join(ARTIGOS, 'index.html');
    else if (caminho.indexOf('artigos/') === 0) local = path.join(ARTIGOS, caminho.slice('artigos/'.length));
    else local = path.join(PAGINAS, caminho);
    if (!fs.existsSync(local)) erro('sitemap.xml aponta para arquivo inexistente: ' + url);
  });
  relatorio.push('OK     sitemap.xml: ' + locs.length + ' URLs');
}

function validarRobots() {
  const arquivo = path.join(SEO, 'robots.txt');
  if (!fs.existsSync(arquivo)) { erro('30_SEO_Tecnico/robots.txt ausente'); return; }
  const texto = ler(arquivo);
  if (!/User-agent:\s*\*/i.test(texto)) erro('robots.txt sem User-agent: *');
  if (!/Sitemap:\s*https:\/\/speedfinanceira\.com\.br\/sitemap\.xml/i.test(texto)) {
    erro('robots.txt sem Sitemap correto');
  }
  if (/Disallow:\s*\/\s*$/m.test(texto)) erro('robots.txt bloqueia o site inteiro');
  relatorio.push('OK     robots.txt');
}

function validarLlms() {
  const arquivo = path.join(SEO, 'llms.txt');
  if (!fs.existsSync(arquivo)) { erro('30_SEO_Tecnico/llms.txt ausente'); return; }
  const texto = ler(arquivo);
  if (!/^#\s+/m.test(texto)) erro('llms.txt sem titulo H1');
  if (!texto.includes('(35) 3067-5017')) erro('llms.txt sem telefone oficial');
  if (!texto.includes('https://speedfinanceira.com.br/')) erro('llms.txt sem URL do site');
  relatorio.push('OK     llms.txt');
}

function validarSchema() {
  const arquivo = path.join(SEO, 'schema_localbusiness.json');
  if (!fs.existsSync(arquivo)) { erro('30_SEO_Tecnico/schema_localbusiness.json ausente'); return; }
  let json;
  try { json = JSON.parse(ler(arquivo)); }
  catch (e) { erro('schema_localbusiness.json invalido: ' + e.message); return; }
  if (json['@context'] !== 'https://schema.org') erro('schema sem @context schema.org');
  if (!Array.isArray(json['@graph'])) { erro('schema sem @graph'); return; }
  const tipos = json['@graph'].map(function (n) { return n['@type']; });
  if (tipos.indexOf('FinancialService') === -1) erro('schema sem FinancialService');
  if (tipos.indexOf('WebSite') === -1) erro('schema sem WebSite');
  const loja = json['@graph'].filter(function (n) { return n['@type'] === 'FinancialService'; })[0] || {};
  if (!loja.address || loja.address.postalCode !== '37002-090') erro('schema com CEP divergente');
  if (!loja.telephone || loja.telephone.indexOf('3067-5017') === -1) erro('schema sem telefone oficial');
  relatorio.push('OK     schema_localbusiness.json');
}

validarSitemap();
validarRobots();
validarLlms();
validarSchema();

// ---------- QR codes ----------
const QRS = ['qr_01_grafica', 'qr_02_consignado', 'qr_03_digitais', 'qr_04_perfil', 'qr_05_geral', 'qr_06_site'];
QRS.forEach(function (base) {
  ['png', 'svg'].forEach(function (ext) {
    const arquivo = path.join(QR, base + '.' + ext);
    if (!fs.existsSync(arquivo)) erro('QR ausente: ' + base + '.' + ext);
    else if (fs.statSync(arquivo).size < 300) erro('QR pequeno demais: ' + base + '.' + ext);
  });
});
['cartoes_A6.html', 'cartaz_A5.html', 'README.md'].forEach(function (n) {
  if (!fs.existsSync(path.join(QR, n))) erro('29_QR_Codes/' + n + ' ausente');
});
relatorio.push('OK     29_QR_Codes: 6 QR em PNG e SVG + cartoes + cartaz');

// ---------- Arquivos 27 a 32 ----------
const OBRIGATORIOS = [
  '27_Contador_Balcao.html',
  '28_Runbook_14_Dias.md',
  '29_QR_Codes/README.md',
  '30_SEO_Tecnico/README.md',
  '31_Respostas_Avaliacoes.md',
  '32_Ficha_Custo_Grafica.html'
];
OBRIGATORIOS.forEach(function (n) {
  if (!fs.existsSync(path.join(RAIZ, n))) erro('arquivo ausente: ' + n);
});

// ---------- Resultado ----------
console.log('');
console.log('=== VALIDACAO DO PACOTE ===');
console.log('HTML analisados: ' + TODOS_HTML.length + ' (' + HTML_PUBLICOS.length + ' publicos + ' + HTML_FERRAMENTAS.length + ' ferramentas)');
relatorio.forEach(function (linha) { console.log(linha); });
console.log('');
console.log('Erros: ' + erros + ' | Avisos: ' + avisos);
if (erros === 0 && avisos === 0) console.log('Pacote consistente.');
process.exit(erros === 0 ? 0 : 1);
