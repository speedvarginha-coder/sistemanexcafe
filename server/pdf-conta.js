// Leitura de PDF de contas (energia, agua, internet, aluguel, impostos...) sem dependencias:
// extrai o texto do PDF, le a linha digitavel do boleto e sugere categoria, valor e vencimento.
"use strict";
const zlib = require("zlib");

function inflate(buffer) {
  for (const fn of [zlib.inflateSync, zlib.inflateRawSync]) {
    try { return fn(buffer, { finishFlush: zlib.constants.Z_SYNC_FLUSH }); } catch { }
  }
  return null;
}

// Objetos do PDF (inclusive os compactados em /ObjStm), com o stream ja descompactado.
function readObjects(pdf) {
  const text = pdf.toString("latin1");
  const objects = new Map();
  const re = /(\d+)\s+\d+\s+obj\b/g;
  let match;
  while ((match = re.exec(text))) {
    const start = match.index + match[0].length;
    const end = text.indexOf("endobj", start);
    if (end < 0) break;
    const body = text.slice(start, end);
    const streamAt = body.search(/stream\r?\n/);
    let dict = body, stream = null;
    if (streamAt >= 0) {
      dict = body.slice(0, streamAt);
      const dataStart = start + streamAt + body.slice(streamAt).match(/stream\r?\n/)[0].length;
      const dataEnd = text.lastIndexOf("endstream", end);
      const raw = pdf.subarray(dataStart, dataEnd > dataStart ? dataEnd : end);
      stream = /\/FlateDecode/.test(dict) ? inflate(raw) : (/\/Filter/.test(dict) ? null : raw);
    }
    objects.set(Number(match[1]), { dict, stream });
    re.lastIndex = end;
  }
  for (const obj of [...objects.values()]) {
    if (!/\/Type\s*\/ObjStm/.test(obj.dict) || !obj.stream) continue;
    const n = Number((obj.dict.match(/\/N\s+(\d+)/) || [])[1] || 0);
    const first = Number((obj.dict.match(/\/First\s+(\d+)/) || [])[1] || 0);
    const content = obj.stream.toString("latin1");
    const nums = content.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const id = nums[i * 2], offset = nums[i * 2 + 1];
      const next = i + 1 < n ? nums[i * 2 + 3] : content.length - first;
      if (!objects.has(id)) objects.set(id, { dict: content.slice(first + offset, first + next), stream: null });
    }
  }
  return objects;
}

function hexToBuffer(hex) { const clean = hex.replace(/[^0-9a-fA-F]/g, ""); return Buffer.from(clean.length % 2 ? `${clean}0` : clean, "hex"); }
function utf16(buffer) { let out = ""; for (let i = 0; i + 1 < buffer.length; i += 2) out += String.fromCharCode(buffer.readUInt16BE(i)); return out; }

// Tabela ToUnicode: codigo do glifo -> texto.
function parseCMap(buffer) {
  const text = buffer.toString("latin1");
  const map = new Map();
  let codeLen = 1;
  const range = text.match(/begincodespacerange\s*<([0-9a-fA-F]+)>/);
  if (range) codeLen = range[1].length / 2;
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const [, src, dst] of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) { map.set(parseInt(src, 16), utf16(hexToBuffer(dst))); codeLen = src.length / 2; }
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const [, lo, hi, rest] of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]*>)/g)) {
      const a = parseInt(lo, 16), b = parseInt(hi, 16);
      codeLen = lo.length / 2;
      if (rest.startsWith("[")) {
        const list = [...rest.matchAll(/<([0-9a-fA-F]*)>/g)].map(m => utf16(hexToBuffer(m[1])));
        for (let c = a; c <= b && c - a < list.length; c++) map.set(c, list[c - a]);
      } else {
        const base = hexToBuffer(rest.slice(1, -1));
        for (let c = a; c <= b && c - a < 65536; c++) {
          const copy = Buffer.from(base);
          if (copy.length >= 2) copy.writeUInt16BE((copy.readUInt16BE(copy.length - 2) + c - a) & 0xffff, copy.length - 2);
          map.set(c, utf16(copy));
        }
      }
    }
  }
  return { map, codeLen };
}

// Nome do recurso de fonte (/F1) -> tabela ToUnicode, juntando todos os dicionarios de recursos.
function fontMaps(objects) {
  const cmapByFontObj = new Map();
  for (const [id, obj] of objects) {
    const ref = obj.dict.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    if (ref && objects.get(Number(ref[1]))?.stream) cmapByFontObj.set(id, parseCMap(objects.get(Number(ref[1])).stream));
  }
  const byName = new Map();
  for (const obj of objects.values()) {
    let fontDict = (obj.dict.match(/\/Font\s*<<([\s\S]*?)>>/) || [])[1];
    const indirect = obj.dict.match(/\/Font\s+(\d+)\s+\d+\s+R/);
    if (!fontDict && indirect) fontDict = objects.get(Number(indirect[1]))?.dict || "";
    if (!fontDict) continue;
    for (const [, name, id] of fontDict.matchAll(/\/([^\s\/<>\[\]]+)\s+(\d+)\s+\d+\s+R/g)) {
      const cmap = cmapByFontObj.get(Number(id));
      if (cmap && !byName.has(name)) byName.set(name, cmap);
    }
  }
  return byName;
}

function decodeLiteral(raw) {
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    let c = raw.charCodeAt(i);
    if (c !== 92) { out.push(c & 0xff); continue; }
    const n = raw[++i];
    const map = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
    if (n in map) out.push(map[n]);
    else if (/[0-7]/.test(n)) { let oct = n; while (oct.length < 3 && /[0-7]/.test(raw[i + 1])) oct += raw[++i]; out.push(parseInt(oct, 8) & 0xff); }
    else if (n === "\r" || n === "\n") { if (n === "\r" && raw[i + 1] === "\n") i++; }
    else if (n !== undefined) out.push(n.charCodeAt(0));
  }
  return Buffer.from(out);
}

function decodeBytes(bytes, cmap) {
  if (!cmap) return bytes.toString("latin1");
  let out = "";
  for (let i = 0; i + cmap.codeLen <= bytes.length; i += cmap.codeLen) {
    const code = cmap.codeLen === 2 ? bytes.readUInt16BE(i) : bytes[i];
    out += cmap.map.get(code) ?? "";
  }
  return out;
}

// Interpreta os operadores de texto (Tf, Tj, TJ, ', ", Td, TD, Tm, T*) de um stream de conteudo.
function contentText(content, fonts) {
  const s = content.toString("latin1");
  let out = "", font = null, lastY = null;
  const stack = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "(") {
      let depth = 1, j = i + 1, raw = "";
      while (j < s.length && depth) { const c = s[j]; if (c === "\\") { raw += c + s[j + 1]; j += 2; continue; } if (c === "(") depth++; else if (c === ")") { depth--; if (!depth) break; } raw += c; j++; }
      stack.push({ str: decodeLiteral(raw) }); i = j + 1; continue;
    }
    if (ch === "<" && s[i + 1] !== "<") { const j = s.indexOf(">", i); stack.push({ str: hexToBuffer(s.slice(i + 1, j)) }); i = j + 1; continue; }
    if (ch === "[") { stack.push({ mark: true }); i++; continue; }
    if (ch === "]") { const arr = []; while (stack.length && !stack[stack.length - 1].mark) arr.unshift(stack.pop()); stack.pop(); stack.push({ arr }); i++; continue; }
    if (ch === "%") { while (i < s.length && s[i] !== "\n" && s[i] !== "\r") i++; continue; }
    if (/\s/.test(ch)) { i++; continue; }
    const m = s.slice(i).match(/^(\/[^\s\/\[\]()<>]*|[^\s\/\[\]()<>%]+|<<|>>)/);
    if (!m) { i++; continue; }
    const token = m[1]; i += token.length;
    if (token[0] === "/" ) { stack.push({ name: token.slice(1) }); continue; }
    if (/^[-+.\d]+$/.test(token)) { stack.push({ num: Number(token) }); continue; }
    const args = stack.splice(0);
    const text = str => decodeBytes(str, font);
    if (token === "Tf") { const name = args.find(a => a.name)?.name; font = fonts.get(name) || null; }
    else if (token === "Tj") { const a = args.find(x => x.str); if (a) out += text(a.str); }
    else if (token === "'" || token === "\"") { out += "\n"; const a = args.find(x => x.str); if (a) out += text(a.str); }
    else if (token === "TJ") { const a = args.find(x => x.arr); if (a) for (const part of a.arr) { if (part.str) out += text(part.str); else if (part.num < -180) out += " "; } }
    else if (token === "T*") out += "\n";
    else if (token === "Td" || token === "TD") { const nums = args.filter(a => "num" in a); const ty = nums[1]?.num || 0; out += ty ? "\n" : " "; }
    else if (token === "Tm") { const nums = args.filter(a => "num" in a); const y = nums[5]?.num; if (lastY !== null && y !== lastY) out += "\n"; else out += " "; lastY = y; }
    else if (token === "ET") out += " ";
  }
  return out;
}

function extractText(pdf) {
  const objects = readObjects(pdf);
  const fonts = fontMaps(objects);
  let text = "";
  for (const obj of objects.values()) {
    if (!obj.stream || /\/Subtype\s*\/Image|\/Type\s*\/(XRef|ObjStm)|\/Length1/.test(obj.dict)) continue;
    const head = obj.stream.subarray(0, 200000).toString("latin1");
    if (!/\bBT\b/.test(head) || !/\bET\b/.test(head)) continue;
    text += contentText(obj.stream, fonts) + "\n";
  }
  return text.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

// ---------- Linha digitavel: valor e vencimento exatos ----------
function boletoFromText(text) {
  const digits = text.replace(/[^\d\s.]/g, " ");
  // Boleto bancario (47 digitos): fator de vencimento + valor no ultimo bloco.
  const bank = digits.match(/(\d{5})\.?(\d{5})\s+(\d{5})\.?(\d{6})\s+(\d{5})\.?(\d{6})\s+(\d)\s+(\d{14})/);
  if (bank) {
    const factor = Number(bank[8].slice(0, 4)), value = Number(bank[8].slice(4)) / 100;
    let due = null;
    if (factor >= 1000) {
      const base = new Date(Date.UTC(2025, 1, 22)); base.setUTCDate(base.getUTCDate() + factor - 1000);
      due = base.toISOString().slice(0, 10);
    }
    return { amountCents: Math.round(value * 100) || null, dueDate: due, line: bank.slice(1).join("") };
  }
  // Conta de consumo / arrecadacao (48 digitos, comeca com 8): valor nos digitos 5 a 15 do codigo de barras.
  const utility = digits.match(/\b(8\d{10})[-\s.]?\d\s+(\d{11})[-\s.]?\d\s+(\d{11})[-\s.]?\d\s+(\d{11})[-\s.]?\d/);
  if (utility) {
    const barcode = utility.slice(1, 5).join("");
    const realValue = barcode[2] === "6" || barcode[2] === "8";
    return { amountCents: realValue ? Number(barcode.slice(4, 15)) || null : null, dueDate: null, line: barcode };
  }
  return null;
}

const CATEGORY_RULES = [
  ["Energia", /\b(cemig|energia eletrica|kwh|enel|cpfl|light s\.?a|equatorial|energisa|celesc|copel|coelba|neoenergia|elektro)\b/],
  ["Água", /\b(copasa|saae|sabesp|sanepar|agua e esgoto|cedae|embasa|caesb|saneamento|abastecimento de agua)\b/],
  ["Internet", /\b(internet|fibra|banda larga|mbps|vivo|claro|oi fibra|telecom|provedor|algar|telefonia|brisanet|desktop sa)\b/],
  ["Aluguel", /\b(aluguel|locacao|locatario|locador|imobiliaria|condominio)\b/],
  ["Impostos", /\b(simples nacional|documento de arrecadacao|das\b|darf|receita federal|iptu|icms|issqn|prefeitura municipal|tributo)\b/],
  ["Salários", /\b(holerite|folha de pagamento|pro-labore|pro labore|recibo de pagamento de salario|salario)\b/],
  ["Contabilidade", /\b(contabilidade|contabil|honorarios)\b/],
  ["Tarifas bancárias", /\b(tarifa bancaria|cesta de servicos|cielo|stone|pagseguro|mercado pago|getnet|rede s\.?a|sumup)\b/],
  ["Sistemas e assinaturas", /\b(assinatura|licenca|software|microsoft|google|adobe|antivirus|hospedagem)\b/],
  ["Compras de mercadoria", /\b(danfe|nota fiscal eletronica|nf-e|pedido de compra|atacad|distribuidora de bebidas|fornecedor)\b/],
  ["Manutenção", /\b(manutencao|reparo|conserto|assistencia tecnica)\b/]
];

const money = text => Math.round(Number(text.replace(/\./g, "").replace(",", ".")) * 100);

function suggest(text) {
  const plain = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const rule = CATEGORY_RULES.find(([, re]) => re.test(plain));
  const category = rule ? rule[0] : "Outros";
  const brand = rule ? (plain.match(rule[1]) || [""])[0] : "";
  const boleto = boletoFromText(text);

  let amountCents = boleto?.amountCents || null;
  if (!amountCents) {
    const labels = /(total a pagar|valor a pagar|valor do documento|valor cobrado|total da fatura|valor total|total geral|valor\s*\(r\$\)|total)[^\d]{0,60}?(\d{1,3}(?:\.\d{3})*,\d{2})/gi;
    const found = [...text.matchAll(labels)].map(m => money(m[2])).filter(v => v > 0);
    if (found.length) amountCents = found[0];
  }
  if (!amountCents) {
    const counts = new Map();
    for (const m of text.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{2})/g)) { const v = money(m[1]); if (v > 0) counts.set(v, (counts.get(v) || 0) + 1); }
    amountCents = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] || null;
  }
  let dueDate = boleto?.dueDate || null;
  const dueMatch = text.match(/vencimento[^\d]{0,40}(\d{2})\/(\d{2})\/(\d{4})/i) || text.match(/(\d{2})\/(\d{2})\/(20\d{2})/);
  if (!dueDate && dueMatch) dueDate = `${dueMatch[3]}-${dueMatch[2]}-${dueMatch[1]}`;
  const supplier = brand ? brand.toUpperCase() : (text.split("\n").map(line => line.trim()).find(line => /[a-zA-Z]{3}/.test(line)) || "").slice(0, 60);
  return { category, description: supplier ? `${category} - ${supplier}` : category, amountCents, dueDate, fromBarcode: Boolean(boleto?.amountCents) };
}

// ---------- Fatura de cartao de credito: uma despesa por compra, com categoria pelo estabelecimento ----------
const MERCHANT_RULES = [
  ["Insumos gráficos", /\b(papel|chamex|report|toner|tinta|cartucho|refil|epson|hp inc|brother|kalunga|papelaria|resma|plastific|encaderna)/],
  ["Marketing e anúncios", /\b(facebk|facebook|meta ads|meta platforms|google ads|instagram|canva|tiktok ads)/],
  ["Sistemas e assinaturas", /\b(google|microsoft|adobe|apple\.com|hostinger|registro\.br|locaweb|openai|chatgpt|anthropic|claude|dropbox|zoom|github|notion|spotify|netflix)/],
  ["Transporte e combustível", /\b(posto|combustiv|shell|ipiranga|petrobras|br mania|auto posto|uber|99app|99 taxi|estacionamento|pedagio|sem parar|conectcar)/],
  ["Alimentação", /\b(restaurante|lanchonete|padaria|ifood|pizzaria|burger|mcdonald|subway|cafeteria|churrascaria|acai|sorveteria)/],
  ["Compras de mercadoria", /\b(atacad|assai|makro|distribuidora|supermercado|mercado|ambev|coca.cola|spal|tenda atacado|fort atacadista|bahamas|epa )/],
  ["Manutenção", /\b(kabum|pichau|terabyte|informatica|eletronic|ferragens|material de construcao|leroy|c&c|madeira)/],
  ["Internet", /\b(vivo|claro|tim |oi fibra|oi s\.?a|telecom|provedor)/],
  ["Energia", /\b(cemig|energia)/],
  ["Água", /\b(copasa|saae|saneamento)/],
  ["Tarifas bancárias", /\b(anuidade|tarifa|iof|juros|encargo|multa|seguro cartao|protecao)/]
];
const MONTHS = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

function isCardStatement(plain) {
  return /fatura/.test(plain) && /(cartao|credito|limite|pagamento minimo|lancamentos)/.test(plain);
}

function merchantCategory(description) {
  const plain = description.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const rule = MERCHANT_RULES.find(([, re]) => re.test(plain));
  return rule ? rule[0] : "Outros";
}

// Linhas "12/09 LOJA X 45,90" ou "12 SET LOJA X R$ 45,90"; pagamentos, estornos e creditos ficam de fora.
function parseCardStatement(text, reference = new Date()) {
  const items = [];
  const year = reference.getFullYear(), month = reference.getMonth() + 1;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    const m = line.match(/^(\d{2})[\/.\s-]?(\d{2}|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?:[\/.](\d{2,4}))?\s+(.+?)\s+(-\s*)?(?:R\$\s*)?(-?\d{1,3}(?:\.\d{3})*,\d{2})(\s*-)?$/i);
    if (!m) continue;
    const day = Number(m[1]);
    const mon = /\d/.test(m[2]) ? Number(m[2]) : MONTHS[m[2].toLowerCase()];
    if (!day || day > 31 || !mon || mon > 12) continue;
    const description = m[4].replace(/\s+R\$/i, "").trim();
    const negative = Boolean(m[5] || m[7] || m[6].startsWith("-"));
    const plain = description.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (negative || /(pagamento|pgto|estorno|credito de|desconto|saldo anterior|total d|limite)/.test(plain)) continue;
    let y = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : year;
    if (!m[3] && mon > month) y -= 1; // compra de dezembro numa fatura de janeiro
    const amountCents = Math.round(Number(m[6].replace(/-/g, "").replace(/\./g, "").replace(",", ".")) * 100);
    if (!amountCents) continue;
    items.push({ date: `${y}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`, description: description.slice(0, 120), amountCents, category: merchantCategory(description) });
  }
  return items;
}

// ---------- Extrato da conta PJ: saidas viram despesas, entradas viram receitas (o dono confere) ----------
const plainOf = text => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const FULL_MONTHS = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
function isBankStatement(plain) {
  return /extrato/.test(plain) && /saldo/.test(plain) && !isCardStatement(plain);
}
// Entradas: vendas da loja (maquininha, Pix de cliente, deposito do caixa) ja estao no caixa e ficam desmarcadas.
function creditCategory(plain) {
  if (/(comissao|promotora|banco pan|facta|mercantil|v8 |credspot|bmg|daycoval|ole consignado|safra|c6 consig|consignado)/.test(plain)) return { category: "Comissão Speed Financeira", include: true };
  if (/(stone|cielo|getnet|pagseguro|pagbank|mercado pago|sumup|rede s|redecard|infinitepay|ton |vero|antecipacao|liquidacao|vendas? cart|deposito|pix receb|recebido|transferencia receb|ted receb|doc receb|credito pix)/.test(plain)) return { category: "Vendas (já no caixa)", include: false };
  if (/(resgate|aplicacao|rendimento|mesma titularidade|entre contas)/.test(plain)) return { category: "Movimentação entre contas", include: false };
  return { category: "Outra receita", include: false };
}
function debitCategory(plain) {
  if (/(aplicacao|resgate|mesma titularidade|entre contas|transf.* propria)/.test(plain)) return { category: "Movimentação entre contas", include: false };
  if (/(fatura|cartao de credito|pagto cartao|pag cartao)/.test(plain)) return { category: "Cartão de crédito", include: true };
  if (/(tarifa|cesta|pacote de servicos|iof|juros|encargo|mensalidade conta|manutencao de conta)/.test(plain)) return { category: "Tarifas bancárias", include: true };
  if (/(\bdas\b|simples nacional|darf|gps|inss|fgts|iptu|issqn|receita federal|tributo|imposto)/.test(plain)) return { category: "Impostos", include: true };
  if (/(saque|retirada|pro.?labore)/.test(plain)) return { category: "Retirada do dono", include: true };
  const rule = CATEGORY_RULES.find(([, re]) => re.test(plain));
  return { category: rule ? rule[0] : merchantCategory(plain), include: true };
}
const CREDIT_WORDS = /(recebid|receb\b|credito|deposito|estorno|resgate|rendimento|liquidacao|entrada|devolucao)/;
const DEBIT_WORDS = /(pagamento|pagto|pago|enviad|debito|tarifa|compra|saque|aplicacao|transferencia env|ted env|pix env|boleto|cesta|iof|juros)/;
// Linhas com data no inicio (ou data num cabecalho do dia) e valor no fim; o ultimo valor da linha pode ser o saldo.
function parseBankStatement(text, reference = new Date()) {
  const items = [];
  let year = reference.getFullYear(), current = null, prevBalance = null, lastText = "";
  const yearHit = plainOf(text).match(/\b(?:periodo|de)\b[^\n]{0,40}?\d{2}\/\d{2}\/(20\d{2})/);
  if (yearHit) year = Number(yearHit[1]);
  for (const raw of text.split("\n")) {
    let line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    let plain = plainOf(line);
    let m = plain.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/) || plain.match(/^(\d{1,2}) (jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(?: (\d{4}))?\b/) || plain.match(/^(\d{1,2}) de ([a-z]+) de (\d{4})/);
    if (m) {
      const mon = /\d/.test(m[2]) ? Number(m[2]) : MONTHS[m[2].slice(0, 3)] || FULL_MONTHS[m[2]];
      if (mon >= 1 && mon <= 12 && Number(m[1]) >= 1 && Number(m[1]) <= 31) {
        if (m[3]) year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
        current = `${year}-${String(mon).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
        line = line.slice(m[0].length).trim(); plain = plainOf(line);
      }
    }
    const amounts = [...line.matchAll(/([+-]\s*)?(?:R\$\s*)?(-?\d{1,3}(?:\.\d{3})*,\d{2})(\s*[-+]|\s*[CD](?![A-Za-z]))?/g)];
    if (!amounts.length) { if (/[a-z]{3}/.test(plain) && !/saldo|data|historico|descricao|valor/.test(plain)) lastText = line; continue; }
    const value = token => Math.round(Number(token[2].replace(/-/g, "").replace(/\./g, "").replace(",", ".")) * 100);
    const balance = amounts.length > 1 ? value(amounts[amounts.length - 1]) : null;
    if (/saldo|total de (entradas|saidas)|^total\b|limite/.test(plain)) { if (/saldo/.test(plain)) prevBalance = value(amounts[amounts.length - 1]); continue; }
    if (!current) continue;
    const tx = amounts[0], amountCents = value(tx);
    if (!amountCents) continue;
    const mark = `${tx[1] || ""}${tx[3] || ""}${tx[2].startsWith("-") ? "-" : ""}`.toUpperCase().replace(/\s/g, "");
    let description = line.replace(tx[0], " ").replace(amounts.length > 1 ? amounts[amounts.length - 1][0] : "", " ").replace(/R\$/g, "").replace(/\s+/g, " ").trim();
    if (!/[a-z]{3}/i.test(description)) description = lastText;
    const dplain = plainOf(description);
    let type = /-|D/.test(mark) ? "out" : /\+|C/.test(mark) ? "in" : null;
    if (!type && prevBalance !== null && balance !== null) type = prevBalance + amountCents === balance ? "in" : prevBalance - amountCents === balance ? "out" : null;
    if (!type) type = CREDIT_WORDS.test(dplain) && !DEBIT_WORDS.test(dplain) ? "in" : "out";
    if (balance !== null) prevBalance = balance;
    const guess = type === "in" ? creditCategory(dplain) : debitCategory(dplain);
    items.push({ type, date: current, description: (description || (type === "in" ? "Entrada" : "Saída")).slice(0, 120), amountCents, ...guess });
    lastText = "";
  }
  return items;
}

// Analisa o texto (vindo do PDF ou do OCR): fatura de cartao vira lista de compras; o resto vira uma conta.
function analyzeText(text, reference, forceStatement = false) {
  const plain = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const base = suggest(text);
  if (forceStatement || isBankStatement(plain)) {
    const items = parseBankStatement(text, reference);
    if (items.length || forceStatement) {
      const bank = (plain.match(/\b(nubank|itau|bradesco|santander|caixa|banco do brasil|inter|c6|sicoob|sicredi|mercado pago|picpay|cora|pagbank|btg|original|safra)\b/) || [])[0];
      return { kind: "statement", suggestion: { ...base, description: `Extrato${bank ? ` ${bank.toUpperCase()}` : " PJ"}` }, items };
    }
  }
  if (isCardStatement(plain)) {
    const items = parseCardStatement(text, reference);
    if (items.length) {
      const bank = (plain.match(/\b(nubank|itau|bradesco|santander|caixa|banco do brasil|inter|c6|sicoob|sicredi|mercado pago|picpay|neon|next|original|pan|will bank)\b/) || [])[0];
      return { kind: "card", suggestion: { ...base, category: "Cartão de crédito", description: `Fatura cartão${bank ? ` ${bank.toUpperCase()}` : ""}` }, items };
    }
  }
  return { kind: "bill", suggestion: base, items: [] };
}

function readBill(pdf) {
  if (!pdf || pdf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("Arquivo nao e um PDF");
  const text = extractText(pdf);
  if (text.replace(/\s/g, "").length < 20) return { text: "", suggestion: { category: "Outros", description: "", amountCents: null, dueDate: null }, scanned: true };
  return { text: text.slice(0, 4000), suggestion: suggest(text), scanned: false };
}

module.exports = { readBill, extractText, suggest, boletoFromText, analyzeText, parseCardStatement, parseBankStatement, merchantCategory };
