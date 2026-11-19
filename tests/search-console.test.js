const test = require("node:test");
const assert = require("node:assert/strict");
const { lerSite, resumir, periodo } = require("../server/search-console");
const { SCOPE } = require("../server/gmb-api");

test("search-console: escopo de leitura do Search Console entra na autorização da ficha", () => {
  assert.match(SCOPE, /business\.manage/);
  assert.match(SCOPE, /webmasters\.readonly/);
});

test("search-console: período de 28 dias terminando 3 dias atrás", () => {
  assert.deepEqual(periodo(new Date("2026-11-05T12:00:00Z")), { inicio: "2026-10-06", fim: "2026-11-02" });
});

test("search-console: agrupa por página com posição média ponderada e buscas mais vistas", () => {
  const paginas = resumir([
    { keys: ["https://speedfinanceira.com.br/blog/a.html", "empréstimo clt varginha"], clicks: 2, impressions: 10, position: 4 },
    { keys: ["https://speedfinanceira.com.br/blog/a.html", "consignado clt"], clicks: 0, impressions: 30, position: 12 },
    { keys: ["https://speedfinanceira.com.br/guia/b.html", "empréstimo"], clicks: 1, impressions: 5, position: 8 }
  ]);
  assert.equal(paginas[0].pagina, "https://speedfinanceira.com.br/blog/a.html");
  assert.equal(paginas[0].impressoes, 40);
  assert.equal(paginas[0].cliques, 2);
  assert.equal(paginas[0].posicao, 10, "(4*10 + 12*30) / 40");
  assert.equal(paginas[0].ctr, 5);
  assert.deepEqual(paginas[0].buscas.map(b => b.busca), ["consignado clt", "empréstimo clt varginha"]);
});

test("search-console: acha o site na conta, consulta e explica falta de autorização", async () => {
  const pedidos = [];
  const google = async (url, init = {}) => {
    pedidos.push({ url, body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith("/webmasters/v3/sites")) return { ok: true, status: 200, json: async () => ({ siteEntry: [{ siteUrl: "https://outro.com.br/", permissionLevel: "siteOwner" }, { siteUrl: "https://speedfinanceira.com.br/", permissionLevel: "siteOwner" }] }) };
    const body = JSON.parse(init.body);
    if (!body.dimensions) return { ok: true, status: 200, json: async () => ({ rows: [{ clicks: 9, impressions: 300, position: 14.26 }] }) };
    if (body.dimensions.length === 1) return { ok: true, status: 200, json: async () => ({ rows: [{ keys: ["empréstimo consignado varginha"], clicks: 3, impressions: 50, position: 6 }] }) };
    return { ok: true, status: 200, json: async () => ({ rows: [{ keys: ["https://speedfinanceira.com.br/", "speed financeira"], clicks: 5, impressions: 20, position: 1 }] }) };
  };
  const dados = await lerSite({ accessToken: "t", fetchImpl: google, now: new Date("2026-11-05T12:00:00Z") });
  assert.equal(dados.site, "https://speedfinanceira.com.br/");
  assert.deepEqual(dados.total, { cliques: 9, impressoes: 300, posicao: 14.3 });
  assert.equal(dados.buscas[0].busca, "empréstimo consignado varginha");
  assert.deepEqual(dados.buscasComCliques, [{ busca: "empréstimo consignado varginha", cliques: 3, impressoes: 50, posicao: 6 }]);
  assert.ok(pedidos.some(p => p.url.includes(encodeURIComponent("https://speedfinanceira.com.br/")) && p.body?.startDate === "2026-10-06"));

  const semEscopo = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: "Request had insufficient authentication scopes." } }) });
  await assert.rejects(lerSite({ accessToken: "t", fetchImpl: semEscopo }), /Conectar de novo/);
});
