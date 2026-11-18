const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { syncMarketing } = require("../server/marketing-sync");

function put(root, rel, content) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}

test("sincronizacao do marketing: copia dados, adapta o SpeedGeo e ignora o que nao pertence ao painel", async () => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "mk-src-"));
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "mk-dest-"));
  put(source, "integracoes/speedgeo/dashboard.html", "<html><head><title>x</title></head><body></body></html>");
  put(source, "integracoes/speedgeo/dados_artigos.js", "window.DADOS_ARTIGOS = {};");
  put(source, "integracoes/speedgeo/config.json", '{"chave":"secreta"}');
  put(source, "integracoes/speedgeo/generator.py", "print(1)");
  put(source, "integracoes/speedgeo/artigos_gerados/a.html", "<html><head></head></html>");
  put(source, "social/posts_fila.js", "window.POSTS_FILA = [];");
  put(source, "social/posts/p1.png", "png");
  put(source, "social/posts/p1.md", "legenda");
  put(source, "social/gerar_posts.py", "print(1)");
  put(source, "pesquisa-seo/estudo.xlsx", "xlsx");
  put(source, "diretorios/Historico/controle.docx", "docx");
  put(source, "palavras-chave/estudo.md", "md");
  put(source, "pesquisa-seo/scripts/gerar.py", "print(1)");
  put(source, "google_ads_speed_financeira_importacao.csv", "a,b");
  put(source, "dashboard/index.html", "codigo do painel");

  const first = await syncMarketing({ source, dest });
  assert.deepEqual(first.errors, []);
  assert.deepEqual(first.copied.sort(), [
    "arquivos/diretorios/Historico/controle.docx",
    "arquivos/google_ads_speed_financeira_importacao.csv",
    "arquivos/palavras-chave/estudo.md",
    "arquivos/pesquisa-seo/estudo.xlsx",
    "social/posts/p1.png",
    "social/posts_fila.js",
    "speedgeo/artigos_gerados/a.html",
    "speedgeo/dados_artigos.js",
    "speedgeo/dashboard.html"
  ]);
  const page = fs.readFileSync(path.join(dest, "speedgeo/dashboard.html"), "utf8");
  assert.match(page, /compat-tw3\.css">\n<\/head>/);
  assert.doesNotMatch(fs.readFileSync(path.join(dest, "speedgeo/artigos_gerados/a.html"), "utf8"), /compat-tw3/);

  const second = await syncMarketing({ source, dest });
  assert.equal(second.copied.length, 0);
  assert.equal(second.unchanged, 9);

  const missing = await syncMarketing({ source: path.join(source, "nao-existe"), dest });
  assert.equal(missing.copied.length, 0);
  assert.ok(missing.errors.length > 0);
});

test("fila de posts: edicoes salvas prevalecem e posts novos entram no topo", () => {
  const code = fs.readFileSync(path.join(__dirname, "../server/public/marketing/js/app.js"), "utf8");
  const fn = code.match(/function mesclarPostsFila[\s\S]*?\n}\n/)[0];
  const ctx = {}; vm.runInNewContext(fn + "this.mesclar = mesclarPostsFila;", ctx);
  const salvos = [{ id: "a", status: "aprovado", manchete: "editada" }];
  const fila = [{ id: "b", status: "rascunho" }, { id: "a", status: "rascunho", manchete: "original" }];
  const posts = ctx.mesclar(salvos, fila);
  assert.deepEqual(Array.from(posts, p => p.id), ["b", "a"]);
  assert.equal(posts[1].manchete, "editada");
  assert.equal(ctx.mesclar([], fila).length, 2);
});

test("dados do marketing lidos pelo servidor: a lista sai, mas o arquivo nao alcanca o processo do servidor", () => {
  const { readMarketingList } = require("../server/app");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-mkt-dados-"));
  const tentativa = alvo => `(function () { try { return typeof ${alvo}.constructor.constructor("return process")(); } catch (e) { return "bloqueado"; } })()`;
  put(dir, "dados.js", `window.LISTA = [{ id: "a", pelaJanela: ${tentativa("window")}, peloGlobal: ${tentativa("this")}, direto: typeof process + typeof require }];\n// fim`);
  assert.deepEqual(readMarketingList(path.join(dir, "dados.js"), "LISTA"), [{ id: "a", pelaJanela: "bloqueado", peloGlobal: "bloqueado", direto: "undefinedundefined" }]);
  assert.deepEqual(readMarketingList(path.join(dir, "dados.js"), "NAO_EXISTE"), []);
});
