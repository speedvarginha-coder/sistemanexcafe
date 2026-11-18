const fsp = require("node:fs/promises");
const path = require("node:path");

// Pasta ativa de marketing da Speed. O SpeedGeo chega por juncao (integracoes\speedgeo -> Google Drive).
const DEFAULT_MARKETING_SOURCE = "D:\\Gestão Speed Financeira Marketing\\marketing";
const COMPAT_LINK = '  <link rel="stylesheet" href="../css/compat-tw3.css">';
const SKIP_DIRS = new Set(["scripts", "__pycache__", "node_modules", ".git"]);

// Copia so dados e conteudo. O codigo do painel (index.html, js/, css/) tem adaptacoes do Nexcafe e nao entra aqui.
const RULES = [
  { from: "integracoes/speedgeo", to: "speedgeo", match: rel => (/^[^/]+\.(html|js|json)$/i.test(rel) && rel.toLowerCase() !== "config.json") || /^artigos_gerados\/[^/]+\.html$/i.test(rel) },
  { from: "social", to: "social", match: rel => rel === "posts_fila.js" || /^posts\/[^/]+\.(png|jpe?g|webp)$/i.test(rel) },
  { from: "diretorios", to: "arquivos/diretorios", match: rel => !/\.pyc?$/i.test(rel) },
  { from: "palavras-chave", to: "arquivos/palavras-chave", match: rel => !/\.pyc?$/i.test(rel) },
  { from: "pesquisa-seo", to: "arquivos/pesquisa-seo", match: rel => !/\.pyc?$/i.test(rel) },
  { from: "", to: "arquivos", match: rel => rel === "google_ads_speed_financeira_importacao.csv" }
];

// Assincrono de proposito: o Google Drive baixa sob demanda e nao pode travar o servidor das estacoes.
async function walk(dir, recursive, prefix = "") {
  const files = [];
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const rel = prefix + entry.name;
    if (entry.isDirectory()) { if (recursive && !SKIP_DIRS.has(entry.name)) files.push(...await walk(path.join(dir, entry.name), true, rel + "/")); }
    else files.push(rel);
  }
  return files;
}

// Paginas do SpeedGeo no Nexcafe carregam o Tailwind 2; o compat-tw3.css cobre as classes do Tailwind 3.
function adapt(destRel, buffer) {
  if (!/^speedgeo\/[^/]+\.html$/i.test(destRel)) return buffer;
  const text = buffer.toString("utf8");
  if (text.includes("compat-tw3.css")) return buffer;
  return Buffer.from(text.replace(/<\/head>/i, `${COMPAT_LINK}\n</head>`), "utf8");
}

async function syncMarketing({ source = DEFAULT_MARKETING_SOURCE, dest }) {
  const result = { at: new Date().toISOString(), source, copied: [], unchanged: 0, errors: [] };
  for (const rule of RULES) {
    const from = path.join(source, rule.from);
    let files;
    try { files = await walk(from, rule.from !== ""); }
    catch (cause) { result.errors.push(`${rule.from || "raiz"}: ${cause.code === "ENOENT" ? "pasta de origem não encontrada" : cause.message}`); continue; }
    for (const rel of files.filter(rule.match)) {
      const destRel = `${rule.to}/${rel}`;
      try {
        const srcPath = path.join(from, rel);
        const target = path.join(dest, destRel);
        const [srcStat, targetStat] = await Promise.all([
          fsp.stat(srcPath).catch(() => null),
          fsp.stat(target).catch(() => null)
        ]);
        if (!srcStat) continue;

        const isAdapted = /^speedgeo\/[^/]+\.html$/i.test(destRel);
        if (!isAdapted && targetStat && targetStat.size === srcStat.size && Math.abs(targetStat.mtimeMs - srcStat.mtimeMs) < 2000) {
          result.unchanged++;
          continue;
        }

        const content = adapt(destRel, await fsp.readFile(srcPath));
        const current = targetStat ? await fsp.readFile(target).catch(() => null) : null;
        if (current && current.equals(content)) {
          result.unchanged++;
          await fsp.utimes(target, srcStat.atime, srcStat.mtime).catch(() => {});
          continue;
        }
        await fsp.mkdir(path.dirname(target), { recursive: true });
        // Grava ao lado e renomeia: o painel nunca le um arquivo pela metade.
        await fsp.writeFile(target + ".sync-tmp", content);
        await fsp.rename(target + ".sync-tmp", target);
        await fsp.utimes(target, srcStat.atime, srcStat.mtime).catch(() => {});
        result.copied.push(destRel);
      } catch (cause) { result.errors.push(`${destRel}: ${cause.message}`); }
    }
  }
  return result;
}

// Linha de comando, rodada pela tarefa Nexcafe-Marketing-Sync na sessao do usuario (onde o Google Drive L: existe).
// O servidor roda como SISTEMA, nao enxerga o L: e le o resultado gravado aqui.
const TASK_NAME = "Nexcafe-Marketing-Sync";
const RESULT_FILE = "marketing-sync.json";
module.exports = { syncMarketing, DEFAULT_MARKETING_SOURCE, TASK_NAME, RESULT_FILE };

if (require.main === module) {
  const dataDir = process.env.LHM_DATA_DIR || path.join(__dirname, "data");
  syncMarketing({ source: process.env.NEXCAFE_MARKETING_SRC || DEFAULT_MARKETING_SOURCE, dest: path.join(__dirname, "public", "marketing") })
    .then(async result => {
      await fsp.writeFile(path.join(dataDir, RESULT_FILE), JSON.stringify(result, null, 1));
      console.log(`${result.at} copiados ${result.copied.length}, iguais ${result.unchanged}, erros ${result.errors.length}`);
      for (const line of result.errors) console.error(line);
      process.exitCode = result.errors.length ? 1 : 0;
    });
}
