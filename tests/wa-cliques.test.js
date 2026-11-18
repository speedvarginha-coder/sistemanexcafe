const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { lerCliques, resumir, cidadeDoCaminho, tipoDoCaminho, GERAIS } = require("../server/wa-cliques");
const { createApp } = require("../server/app");

const CIDADES = ["Varginha", "Três Corações", "Três Pontas", "Elói Mendes", "Boa Esperança", "Carmo da Cachoeira", "Alfenas"];

test("wa-cliques: cidade só pelos guias e páginas de cidade", () => {
  assert.equal(cidadeDoCaminho("/guia/consignado-clt-tres-pontas.html", CIDADES), "Três Pontas");
  assert.equal(cidadeDoCaminho("/guia/como-antecipar-fgts-varginha-pix-imediato.html", CIDADES), "Varginha");
  assert.equal(cidadeDoCaminho("/financeira-boa-esperanca-mg.html", CIDADES), "Boa Esperança");
  assert.equal(cidadeDoCaminho("/guia/emprestimo-garantia-veiculo-carmo-da-cachoeira.html", CIDADES), "Carmo da Cachoeira");
  assert.equal(cidadeDoCaminho("/blog/onde-fazer-emprestimo-varginha-como-escolher-confiavel.html", CIDADES), GERAIS);
  assert.equal(cidadeDoCaminho("/", CIDADES), GERAIS);
  assert.deepEqual(["/", "/guia/x.html", "/blog/y.html", "/financeira-alfenas-mg.html", "/fgts.html"].map(tipoDoCaminho),
    ["Home", "Guia", "Blog", "Página da cidade", "Página de produto"]);
});

test("wa-cliques: resumo por cidade e página, sem testes e sem dias antigos", () => {
  const dias = {
    "2026-10-01": { "/guia/consignado-clt-alfenas.html": 9 },
    "2026-11-16": { "/guia/consignado-clt-tres-pontas.html": 2, "/": 1, "/__teste__": 5 },
    "2026-11-17": { "/financeira-tres-pontas-mg.html": 1, "/guia/consignado-clt-alfenas.html": 1 }
  };
  const r = resumir(dias, { cidades: CIDADES, desde: "2026-10-19" });
  assert.equal(r.total, 5);
  assert.deepEqual(r.cidades, [{ cidade: "Três Pontas", cliques: 3 }, { cidade: GERAIS, cliques: 1 }, { cidade: "Alfenas", cliques: 1 }]);
  assert.deepEqual(r.paginas[0], { caminho: "/guia/consignado-clt-tres-pontas.html", cliques: 2, cidade: "Três Pontas", tipo: "Guia" });
});

test("wa-cliques: leitura do contador do site com chave, e erros claros", async () => {
  let pedido = "";
  const ok = async url => { pedido = url; return { ok: true, status: 200, json: async () => ({ ok: true, pasta: true, dias: { "2026-11-17": { "/": 2 } } }) }; };
  assert.deepEqual(await lerCliques({ chave: "abc", desde: "2026-09-18", fetchImpl: ok, now: 1 }), { "2026-11-17": { "/": 2 } });
  assert.match(pedido, /wa-clique\.php\?chave=abc&desde=2026-09-18&t=1$/);
  await assert.rejects(lerCliques({ chave: "", desde: "2026-09-18", fetchImpl: ok }), /sem chave/);
  await assert.rejects(lerCliques({ chave: "x", desde: "2026-09-18", fetchImpl: async () => ({ ok: false, status: 404 }) }), /recusou a chave/);
  await assert.rejects(lerCliques({ chave: "x", desde: "2026-09-18", fetchImpl: async () => { throw new Error("offline"); } }), /Sem conexão com o site/);
});

test("wa-cliques: servidor lê o contador, guarda e mostra no painel", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-wa-"));
  fs.writeFileSync(path.join(dataDir, "wa-cliques-chave.txt"), "chave-teste\n");
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  let chamadas = 0;
  const waFetch = async url => { chamadas++; assert.match(url, /chave=chave-teste/); return { ok: true, status: 200, json: async () => ({ ok: true, dias: { [hoje]: { "/guia/consignado-clt-tres-pontas.html": 3 } } }) }; };
  const server = createApp({ dataDir, waFetch });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const json = (method, p, body, cookie = "") => fetch(base + p, { method, headers: { "content-type": "application/json", origin: base, cookie }, body: body ? JSON.stringify(body) : undefined });
    assert.equal((await json("POST", "/api/setup", { name: "admin", password: "senha-teste-123" })).status, 201);
    const cookie = (await json("POST", "/api/login", { name: "admin", password: "senha-teste-123" })).headers.get("set-cookie").split(";")[0];
    const antes = (await (await json("GET", "/api/wa-cliques", null, cookie)).json()).wa;
    assert.equal(antes.configured, true);
    assert.equal(antes.total, 0);
    const depois = (await (await json("POST", "/api/wa-cliques/atualizar", {}, cookie)).json()).wa;
    assert.equal(chamadas, 1);
    assert.equal(depois.total, 3);
    assert.deepEqual(depois.cidades, [{ cidade: "Três Pontas", cliques: 3 }]);
    assert.ok(depois.fetchedAt);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
