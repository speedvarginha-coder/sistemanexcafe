// Leitura de produtos para cadastro/entrada de estoque: XML da NF-e (exato), Excel (.xlsx), CSV,
// e texto de PDF/foto da DANFE (melhor esforco). Sem dependencias: o .xlsx e um zip lido com zlib.
"use strict";
const zlib = require("zlib");

const num = value => {
  const s = String(value ?? "").trim().replace(/[R$\s]/g, "");
  if (!s) return NaN;
  // "1.234,56" (BR) ou "1234.56" (Excel/XML).
  return Number(/,\d{1,4}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""));
};
const cents = value => { const n = num(value); return Number.isFinite(n) ? Math.round(n * 100) : null; };
const decodeXml = s => String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, "&").trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`)); return m ? decodeXml(m[1]) : ""; };

// ---------- NF-e (XML) ----------
function parseNfe(xml) {
  const items = [];
  for (const det of xml.match(/<(?:\w+:)?det\b[\s\S]*?<\/(?:\w+:)?det>/g) || []) {
    const prod = (det.match(/<(?:\w+:)?prod>[\s\S]*?<\/(?:\w+:)?prod>/) || [""])[0];
    const qty = num(tag(prod, "qCom")), total = num(tag(prod, "vProd"));
    const ean = tag(prod, "cEAN");
    items.push({ code: tag(prod, "cProd"), ean: /^\d{8,14}$/.test(ean) ? ean : "", name: tag(prod, "xProd"), ncm: tag(prod, "NCM"), unit: tag(prod, "uCom"), quantity: Number.isFinite(qty) ? qty : 1, unitCostCents: Number.isFinite(total) && qty ? Math.round(total / qty * 100) : cents(tag(prod, "vUnCom")) });
  }
  const emit = (xml.match(/<(?:\w+:)?emit>[\s\S]*?<\/(?:\w+:)?emit>/) || [""])[0];
  return { kind: "nfe", supplier: tag(emit, "xNome") || tag(emit, "xFant"), number: tag(xml, "nNF"), date: (tag(xml, "dhEmi") || tag(xml, "dEmi")).slice(0, 10), totalCents: cents(tag(xml, "vNF")), items };
}

// ---------- Excel (.xlsx) ----------
function unzip(buffer) {
  const files = {};
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Arquivo Excel invalido");
  const count = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(p + 10), size = buffer.readUInt32LE(p + 20);
    const nameLen = buffer.readUInt16LE(p + 28), extraLen = buffer.readUInt16LE(p + 30), commentLen = buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42);
    const name = buffer.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(dataStart, dataStart + size);
    if (/^xl\/(sharedStrings|workbook|worksheets\/sheet\d+)\.xml$/.test(name)) files[name] = (method === 8 ? zlib.inflateRawSync(raw) : raw).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
function xlsxRows(buffer) {
  const files = unzip(buffer);
  const shared = [...(files["xl/sharedStrings.xml"] || "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join("")));
  const sheetName = Object.keys(files).filter(n => n.startsWith("xl/worksheets/")).sort()[0];
  if (!sheetName) throw new Error("Planilha vazia");
  const rows = [];
  for (const row of files[sheetName].match(/<row\b[\s\S]*?<\/row>/g) || []) {
    const cells = [];
    for (const c of row.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
      const ref = (c.match(/\br="([A-Z]+)\d+"/) || [])[1] || "";
      const col = ref.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const type = (c.match(/\bt="(\w+)"/) || [])[1];
      let v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      if (type === "s") v = shared[Number(v)];
      else if (type === "inlineStr") v = decodeXml(((c.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1]) || "");
      else v = v !== undefined ? decodeXml(v) : "";
      cells[col >= 0 ? col : cells.length] = v;
    }
    rows.push(Array.from(cells, v => v ?? ""));
  }
  return rows;
}
function csvRows(text) {
  const sep = (text.split("\n")[0].match(/;/g) || []).length >= (text.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  return text.split(/\r?\n/).filter(l => l.trim()).map(line => {
    const out = []; let cur = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; }
      else if (ch === sep && !quoted) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur); return out;
  });
}
// Descobre as colunas pelo nome do cabecalho.
function rowsToItems(rows) {
  const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const headerIndex = rows.findIndex(r => r.some(c => /(descri|produto|nome|item)/.test(norm(c))));
  if (headerIndex < 0) throw new Error("Não encontrei o cabeçalho (coluna Descrição/Produto/Nome)");
  const header = rows[headerIndex].map(norm);
  const find = re => header.findIndex(h => re.test(h));
  const col = {
    code: find(/^(cod|codigo|cod\.|referencia|ref|sku)/), ean: find(/(ean|barra|gtin)/), name: find(/(descri|produto|nome|item)/),
    quantity: find(/^(qtd|quant|estoque|qtde)/), cost: find(/(custo|valor unit|vl unit|preco unit|unitario|compra)/), price: find(/(venda|preco de venda|preco venda)/), category: find(/(categoria|grupo|departamento)/)
  };
  const items = [];
  for (const r of rows.slice(headerIndex + 1)) {
    const name = String(r[col.name] ?? "").trim();
    if (!name) continue;
    const qty = col.quantity >= 0 ? num(r[col.quantity]) : NaN;
    items.push({ code: col.code >= 0 ? String(r[col.code] ?? "").trim() : "", ean: col.ean >= 0 ? String(r[col.ean] ?? "").replace(/\D/g, "") : "", name: name.slice(0, 100), quantity: Number.isFinite(qty) ? qty : 0,
      unitCostCents: col.cost >= 0 ? cents(r[col.cost]) : null, priceCents: col.price >= 0 && col.price !== col.cost ? cents(r[col.price]) : null, category: col.category >= 0 ? String(r[col.category] ?? "").trim() : "" });
  }
  return { kind: "sheet", supplier: "", items };
}

// ---------- DANFE em PDF/foto (texto) ----------
// Linha tipica: CODIGO DESCRICAO NCM CST CFOP UN QTD V.UNIT V.TOTAL ...
function parseDanfeText(text) {
  const items = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    const m = line.match(/^(\S{1,20})\s+(.+?)\s+(\d{8})\s+\d{3,4}\s+\d{4}\s+([A-Za-z]{1,6})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/);
    if (!m) continue;
    const qty = num(m[5]), total = num(m[7]);
    items.push({ code: m[1], ean: "", name: m[2].slice(0, 100), ncm: m[3], unit: m[4], quantity: Number.isFinite(qty) ? qty : 1, unitCostCents: Number.isFinite(total) && qty ? Math.round(total / qty * 100) : cents(m[6]) });
  }
  const supplier = (text.match(/(?:raz[aã]o social|emitente)[:\s]*([^\n]{3,80})/i) || [])[1] || "";
  return { kind: "danfe", supplier: supplier.trim(), items };
}

function readProducts(buffer, ext, text = "") {
  if (ext === ".xml") return parseNfe(buffer.toString("utf8"));
  if (ext === ".xlsx") return rowsToItems(xlsxRows(buffer));
  if (ext === ".csv") return rowsToItems(csvRows(buffer.toString("utf8").replace(/^﻿/, "")));
  return parseDanfeText(text);
}

module.exports = { readProducts, parseNfe, xlsxRows, rowsToItems, csvRows, parseDanfeText };
