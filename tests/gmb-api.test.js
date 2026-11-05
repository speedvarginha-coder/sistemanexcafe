const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/app");
const { authUrl, SCOPE } = require("../server/gmb-api");

const CLIENT_ID = "123456789012-abcdefghij.apps.googleusercontent.com";
const SECRET = "GOCSPX-segredo-de-teste-0001";

// Google simulado: token OAuth, contas, fichas (a Speed e mais tres perfis da mesma conta) e posts.
function fakeGoogle(log) {
  return async (url, init = {}) => {
    log.push({ url, method: init.method || "GET", auth: init.headers?.authorization || "", body: init.body || "" });
    const ok = data => ({ ok: true, status: 200, json: async () => data });
    if (url === "https://oauth2.googleapis.com/token") {
      const body = new URLSearchParams(init.body);
      if (body.get("code") === "codigo-ruim") return { ok: false, status: 400, json: async () => ({ error: "invalid_grant", error_description: "Bad Request" }) };
      if (body.get("grant_type") === "authorization_code") return ok({ access_token: "acesso-1", refresh_token: "refresh-secreto-1", expires_in: 3600 });
      return ok({ access_token: "acesso-2", expires_in: 3600 });
    }
    if (url.endsWith("/v1/accounts")) return ok({ accounts: [{ name: "accounts/111" }] });
    if (url.includes("/v1/accounts/111/locations")) {
      return ok({ locations: [
        { name: "locations/900", title: "Galvão Advocacia Previdenciária" },
        { name: "locations/901", title: "Speed Financeira – Empréstimo Consignado", storefrontAddress: { addressLines: ["R. Santa Cruz, 696"], locality: "Varginha" } },
        { name: "locations/902", title: "RC Refrigeração" }
      ] });
    }
    if (url.includes("/v4/accounts/111/locations/901/localPosts")) return ok({ localPosts: [{ summary: "Crédito consignado em Varginha", state: "LIVE", topicType: "STANDARD" }] });
    return { ok: false, status: 404, json: async () => ({ error: { message: "nao simulado" } }) };
  };
}

test("gmb-api: URL de autorizacao pede so business.manage, offline e com consentimento", () => {
  const url = new URL(authUrl({ clientId: CLIENT_ID, redirectUri: "http://localhost:4780/api/marketing/gmb-api/callback", state: "abc" }));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("scope"), SCOPE);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("state"), "abc");
});

test("gmb-api: salva o cliente sem devolver a chave, conecta pela volta do OAuth e escolhe so a Speed", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-gmb-"));
  const log = [];
  const server = createApp({ dataDir, backupDir: path.join(dataDir, "bk"), gmbFetch: fakeGoogle(log) });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const text = await response.text();
    let payload; try { payload = JSON.parse(text); } catch { payload = text; }
    return { status: response.status, payload, cookie: response.headers.get("set-cookie") };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    cookie = (await request("/api/login", { name: "admin", password: "senha-teste-123" })).cookie.split(";")[0];
    const inicial = (await request("/api/marketing/gmb-api")).payload.gmb;
    assert.equal(inicial.clientConfigured, false);
    assert.equal(inicial.redirectUri, "http://localhost:4780/api/marketing/gmb-api/callback");
    assert.equal((await request("/api/marketing/gmb-api/connect", {})).status, 400, "sem cliente nao conecta");
    assert.equal((await request("/api/marketing/gmb-api/config", { clientId: "qualquer", clientSecret: SECRET })).status, 400);

    const config = await request("/api/marketing/gmb-api/config", { clientId: CLIENT_ID, clientSecret: SECRET });
    assert.equal(config.status, 200);
    assert.equal(config.payload.gmb.clientConfigured, true);
    assert.equal(JSON.stringify(config.payload).includes(SECRET), false, "chave secreta nunca volta para a tela");

    // Volta do OAuth sem state valido nao conecta.
    const semState = await request("/api/marketing/gmb-api/callback?code=x&state=inventado");
    assert.equal(semState.status, 400);
    assert.match(semState.payload, /expirado ou desconhecido/);

    const connect = await request("/api/marketing/gmb-api/connect", {});
    const state = new URL(connect.payload.url).searchParams.get("state");
    // O Google redireciona o navegador sem o cookie do painel (SameSite=Strict).
    const saved = cookie; cookie = "";
    const ruim = await request(`/api/marketing/gmb-api/callback?code=codigo-ruim&state=${state}`);
    assert.equal(ruim.status, 400);
    assert.match(ruim.payload, /invalid_grant|Bad Request/);
    const repetido = await request(`/api/marketing/gmb-api/callback?code=codigo-bom&state=${state}`);
    assert.equal(repetido.status, 400, "state e de uso unico");

    cookie = saved;
    const state2 = new URL((await request("/api/marketing/gmb-api/connect", {})).payload.url).searchParams.get("state");
    cookie = "";
    const volta = await request(`/api/marketing/gmb-api/callback?code=codigo-bom&state=${state2}`);
    assert.equal(volta.status, 200);
    assert.match(volta.payload, /Speed Financeira/);
    cookie = saved;

    const view = (await request("/api/marketing/gmb-api")).payload.gmb;
    assert.equal(view.connected, true);
    assert.match(view.title, /Speed Financeira/);
    assert.equal(view.address, "R. Santa Cruz, 696, Varginha");

    const check = await request("/api/marketing/gmb-api/check", {});
    assert.equal(check.status, 200);
    assert.equal(check.payload.posts.length, 1);
    assert.ok(log.some(item => item.url.includes("/locations/901/localPosts") && item.auth === "Bearer acesso-1"), "usa o token da conexao");
    assert.equal(log.some(item => /locations\/90[02]/.test(item.url) && item.url.includes("localPosts")), false, "outros perfis nao sao usados");

    for (const route of ["/api/marketing/gmb-api", "/api/state"]) {
      const text = JSON.stringify((await request(route)).payload);
      assert.equal(text.includes(SECRET) || text.includes("refresh-secreto-1"), false, `${route} nao expoe segredo`);
    }

    assert.equal((await request("/api/marketing/gmb-api/config", { remove: true })).payload.gmb.connected, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("gmb-api: servidor publica so os posts do dia, a partir das 9h, sem repetir", async () => {
  const { postsDoDia, createPost } = require("../server/gmb-api");
  const plano = [
    { id: "post-2027-01-04", data: "2027-01-04", publicarPeloServidor: true, fotoUrl: "https://speedfinanceira.com.br/midia/posts/google-2027-01-04.png", texto: "Empréstimo CLT em Varginha", link: "https://wa.me/553530675017" },
    { id: "post-2027-01-06", data: "2027-01-06", publicarPeloServidor: true, fotoUrl: "https://x/y.png" },
    { id: "post-2026-12-28", data: "2027-01-04", programadoEm: "2026-10-30" }
  ];
  assert.deepEqual(postsDoDia(plano, {}, new Date(2027, 0, 4, 8, 59)), [], "antes das 9h nao publica");
  assert.deepEqual(postsDoDia(plano, {}, new Date(2027, 0, 4, 9, 0)).map(p => p.id), ["post-2027-01-04"], "so o do dia e marcado para o servidor");
  assert.deepEqual(postsDoDia(plano, { "post-2027-01-04": { at: "x" } }, new Date(2027, 0, 4, 15)), [], "nao repete");
  assert.deepEqual(postsDoDia(plano, {}, new Date(2027, 0, 5, 10)), [], "dia que passou fica de fora");

  const pedidos = [];
  const fake = async (url, init) => { pedidos.push({ url, init }); return { ok: true, status: 200, json: async () => ({ name: "accounts/1/locations/2/localPosts/3", state: "LIVE" }) }; };
  const criado = await createPost({ accessToken: "t", accountName: "accounts/1", locationName: "locations/2", summary: plano[0].texto, url: plano[0].link, photoUrl: plano[0].fotoUrl, fetchImpl: fake });
  assert.equal(criado.state, "LIVE");
  assert.equal(pedidos[0].url, "https://mybusiness.googleapis.com/v4/accounts/1/locations/2/localPosts");
  const body = JSON.parse(pedidos[0].init.body);
  assert.deepEqual(body.media, [{ mediaFormat: "PHOTO", sourceUrl: plano[0].fotoUrl }]);
  assert.deepEqual(body.callToAction, { actionType: "LEARN_MORE", url: "https://wa.me/553530675017" });
  assert.equal(pedidos[0].init.headers.authorization, "Bearer t");
});

test("gmb-api: calendario real tem texto, arte publica e botao em todo post do servidor", () => {
  global.window = {};
  require("../server/public/marketing/js/data_gmb_posts.js");
  const plano = global.window.SPEED_GMB_POSTS_PLANO;
  const servidor = plano.filter(p => p.publicarPeloServidor);
  assert.ok(servidor.length >= 14);
  for (const p of servidor) {
    assert.match(p.fotoUrl, /^https:\/\/speedfinanceira\.com\.br\/midia\/posts\/google-\d{4}-\d\d-\d\d\.png$/, p.id);
    assert.match(p.link, /^https:\/\/wa\.me\/553530675017\?text=/, p.id);
    assert.ok(p.texto.length > 200 && p.texto.length <= 1500, p.id);
    assert.doesNotMatch(p.texto, /\(?35\)?\s?\d{4}-?\d{4}/, `${p.id}: telefone no texto o Google recusa`);
  }
  assert.equal(new Set(plano.map(p => p.data)).size, plano.length, "uma data por post");
  delete global.window;
});
