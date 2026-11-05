const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ficha = require("../server/ficha-saude");
const { createApp } = require("../server/app");

const NOW = new Date("2026-11-05T12:00:00Z");
const daysAgo = n => new Date(NOW.getTime() - n * 86400_000).toISOString();
const LOCATION = {
  name: "locations/901", title: "Speed Financeira – Empréstimo Consignado e Financiamento em Varginha",
  phoneNumbers: { primaryPhone: "(35) 3067-5017" }, websiteUri: "http://www.speedfinanceira.com.br/",
  categories: { primaryCategory: { name: "categories/gcid:financial_institution", displayName: "Instituição financeira" }, additionalCategories: [{ name: "categories/gcid:loan_agency", displayName: "Agência de empréstimos" }] },
  storefrontAddress: { addressLines: ["R. Santa Cruz, 696"], sublocality: "Centro", locality: "Varginha", administrativeArea: "MG", postalCode: "37002-090" },
  regularHours: { periods: [{ openDay: "MONDAY", openTime: { hours: 8 }, closeDay: "MONDAY", closeTime: { hours: 18 } }] },
  profile: { description: "Correspondente bancário no Centro de Varginha. Empréstimo consignado para aposentados e pensionistas do INSS e para quem trabalha de carteira assinada (CLT), portabilidade e refinanciamento, antecipação do saque-aniversário do FGTS. Atendimento presencial na Rua Santa Cruz e pelo WhatsApp." },
  serviceItems: [{ freeFormServiceItem: { label: { displayName: "Consignado INSS" } } }],
  metadata: { placeId: "ChIJspeed" }
};
const ok = value => ({ ok: true, value });

function input(over = {}) {
  return {
    location: ok(LOCATION), attributes: ok([{ name: "attributes/has_onsite_services", values: [true] }]),
    media: ok([...Array(12)].map((_, i) => ({ mediaFormat: "PHOTO", createTime: daysAgo(10 + i), locationAssociation: { category: i === 0 ? "PROFILE" : i === 1 ? "COVER" : "ADDITIONAL" } }))),
    posts: ok([{ state: "LIVE", createTime: daysAgo(3) }, { state: "SCHEDULED", createTime: daysAgo(0) }]),
    reviews: ok(ficha.reviewSummary({ totalReviewCount: 212, averageRating: 4.8, reviews: [{ createTime: daysAgo(108), reviewReply: { comment: "Obrigado" } }] }, NOW)),
    voice: { ok: false, message: "a API está desligada no projeto do Google Cloud" }, links: ok([]),
    keywords: ["emprestimo consignado", "empréstimo", "lan house varginha", "consignado", "emprestimo pessoal"],
    others: [{ name: "Speed Lan House", address: "R. Santa Cruz, 696 - Centro, Varginha - MG, 37002-090", phone: "(35) 3067-5017" }, { name: "CrediMais Empréstimos Varginha", address: "Av. Rio Branco, 154 - Centro, Varginha", phone: "(35) 99999-0000" }],
    ...over
  };
}

test("ficha-saude: nota conta so o que foi lido e aponta os problemas da ficha", () => {
  const checks = ficha.evaluateHealth(input(), NOW);
  const by = Object.fromEntries(checks.map(c => [c.id, c]));
  assert.equal(checks.length, 24);
  assert.equal(by.name_keywords.status, "fail", "nome com servico e cidade");
  assert.equal(by.new_reviews.status, "fail");
  assert.match(by.new_reviews.detail, /há 108 dias/);
  assert.equal(by.unreplied_reviews.status, "pass");
  assert.equal(by.recent_post.status, "pass", "post agendado nao conta, o publicado de 3 dias conta");
  assert.equal(by.verification.status, "unknown");
  assert.match(by.verification.detail, /desligada/);
  assert.equal(by.duplicate_listing.status, "fail", "mesmo endereco e telefone com outro nome e duplicada");
  assert.match(by.duplicate_listing.detail, /Speed Lan House/);
  assert.equal(by.description_keywords.status, "pass");
  assert.match(by.description_keywords.detail, /lan house varginha/);
  const score = ficha.scoreOf(checks);
  assert.equal(score.total, 23, "leitura que falhou fica fora da nota");
  assert.equal(score.percent, Math.round(score.passed / 23 * 100));
  assert.equal(by.name_keywords.fix.includes("Nome da empresa"), true);
  assert.equal(by.phone.fix, null, "item certo nao mostra onde corrigir");
});

test("ficha-saude: nome so com a marca passa, descricao com link e repeticao falha", () => {
  const limpo = ficha.evaluateHealth(input({ location: ok({ ...LOCATION, title: "Speed Financeira", profile: { description: "Emprestimo emprestimo emprestimo emprestimo emprestimo. Veja www.speed.com.br" } }) }), NOW);
  const by = Object.fromEntries(limpo.map(c => [c.id, c]));
  assert.equal(by.name_keywords.status, "pass");
  assert.equal(by.description.status, "fail");
  assert.match(by.description_quality.detail, /repete "emprestimo"/);
});

test("ficha-saude: alteracao no perfil aparece com antes e depois; campo novo nao vira alerta", () => {
  const antes = ficha.snapshotOf(LOCATION);
  assert.deepEqual(ficha.diffSnapshots(null, antes), [], "primeira foto nao gera alerta");
  const depois = ficha.snapshotOf({ ...LOCATION, title: "Speed Financeira", categories: { primaryCategory: { displayName: "Agência de empréstimos" } } });
  const mudancas = ficha.diffSnapshots(antes, depois);
  assert.deepEqual(mudancas.map(m => m.label), ["Nome", "Categorias"]);
  assert.match(mudancas[0].before, /Empréstimo Consignado/);
  assert.equal(mudancas[1].after, "Agência de empréstimos");
  const { title, ...semNome } = antes;
  assert.deepEqual(ficha.diffSnapshots(semNome, depois).map(m => m.label), ["Categorias"]);
  // Ordem das chaves nao conta como mudanca.
  assert.deepEqual(ficha.diffSnapshots(antes, ficha.snapshotOf(JSON.parse(JSON.stringify(LOCATION)))), []);
  assert.deepEqual(ficha.googleDiff({ diffMask: "title,regularHours", location: { title: "Speed Financeira" } }).map(d => [d.label, d.google]), [["Nome", "Speed Financeira"], ["Horário", "(vazio)"]]);
});

test("ficha-saude: potencial de crescimento como no Local Ninja", () => {
  assert.equal(ficha.estimateGrowthPotential([], 65), null);
  assert.equal(ficha.estimateGrowthPotential([5, 5], null), null);
  assert.deepEqual(ficha.estimateGrowthPotential(Array(25).fill(5), 65), { low: 1, high: 7, outside: 25, points: 25 });
  assert.deepEqual(ficha.estimateGrowthPotential(Array(25).fill(2), 65), { low: 0, high: 0, outside: 0, points: 25 });
});

test("ficha-saude: NAP acha telefone antigo, confere endereco sem CEP e nao chama de erro o que so nao achou", () => {
  const oficial = { name: "Speed Financeira", address: "R. Santa Cruz, 696, Centro, Varginha, MG, 37002-090", phone: "(35) 3067-5017" };
  const certo = ficha.compareNap("<h1>Speed Financeira e Lan House</h1><p>Rua Santa Cruz, 696 - Centro - Varginha/MG</p><a href='tel:+553530675017'>Ligar</a>", oficial, ["(35) 3113-0458"]);
  assert.equal(certo.result, "match");
  assert.deepEqual(certo.fields, { name: "match", phone: "match", address: "match" });
  const antigo = ficha.compareNap("<h1>Speed Financeira</h1><p>Rua Santa Cruz, 696</p><a href='https://wa.me/553531130458'>WhatsApp</a>", oficial, ["(35) 3113-0458"]);
  assert.equal(antigo.oldPhone, true);
  assert.equal(antigo.result, "mismatch");
  const ld = ficha.compareNap(`<script type="application/ld+json">{"@type":"LocalBusiness","name":"Speed Financeira","telephone":"(35) 3222-1111","address":{"streetAddress":"Rua Santa Cruz, 696","addressLocality":"Varginha"}}</script>`, oficial);
  assert.equal(ld.fields.phone, "mismatch", "telefone diferente no dado estruturado da empresa");
  const solto = ficha.compareNap("<p>Outra empresa, fone 3222-9999</p>", oficial);
  assert.equal(solto.result, "not_found");
});

// Servidor: rota de saude com Google, Places e diretorios simulados.
test("ficha-saude: servidor confere a ficha, guarda a foto e avisa quando algo muda", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-ficha-"));
  let titulo = LOCATION.title;
  const json = data => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
  const google = async url => {
    if (url === "https://oauth2.googleapis.com/token") return json({ access_token: "acesso", expires_in: 3600 });
    if (url.includes(":getGoogleUpdated")) return json({ location: { title: "Speed Financeira" }, diffMask: "title" });
    if (url.includes("/v1/locations/901?readMask")) return json({ ...LOCATION, title: titulo });
    if (url.endsWith("/attributes")) return json({ attributes: [] });
    if (url.includes("/media")) return json({ mediaItems: [] });
    if (url.includes("/localPosts")) return json({ localPosts: [] });
    if (url.includes("/reviews")) return json({ totalReviewCount: 1, averageRating: 5, reviews: [{ createTime: daysAgo(2) }] });
    if (url.includes("fetchMultiDailyMetricsTimeSeries")) return json({ multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: [{ dailyMetric: "CALL_CLICKS", timeSeries: { datedValues: [{ value: "20" }, {}] } }, { dailyMetric: "BUSINESS_DIRECTION_REQUESTS", timeSeries: { datedValues: [{ value: "40" }] } }] }] });
    if (url.includes("searchkeywords")) return json({ searchKeywordsCounts: [{ searchKeyword: "emprestimo consignado", insightsValue: { value: "107" } }, { searchKeyword: "empréstimo consignado", insightsValue: { threshold: "15" } }] });
    return { ok: false, status: 403, json: async () => ({ error: { message: "My Business Verifications API has not been used in project 1 before or it is disabled." } }) };
  };
  const places = async () => json({ places: [{ id: "ChIJspeed", displayName: { text: "Speed Financeira" } }, { id: "ChIJoutra", displayName: { text: "Speed Lan House" }, formattedAddress: "R. Santa Cruz, 696 - Centro, Varginha - MG, 37002-090", nationalPhoneNumber: "(35) 3067-5017" }] });
  const sites = async url => (url.includes("ueniweb") ? { ok: true, status: 200, text: async () => "<h1>Speed Financeira</h1> Rua Santa Cruz, 696 <a href='https://wa.me/553531130458'>zap</a>" } : { ok: false, status: 403, text: async () => "" });
  const server = createApp({ dataDir, backupDir: path.join(dataDir, "bk"), gmbFetch: google, placesFetch: places, napFetch: sites });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const request = async (route, data) => {
    const headers = cookie ? { cookie } : {};
    if (data !== undefined) Object.assign(headers, { "content-type": "application/json", origin: base });
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, payload: await response.json(), cookie: response.headers.get("set-cookie") };
  };
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    cookie = (await request("/api/login", { name: "admin", password: "senha-teste-123" })).cookie.split(";")[0];
    assert.equal((await request("/api/marketing/ficha-saude/run", {})).status, 400, "sem ficha conectada nao confere");
    // Ficha conectada direto no banco do teste (o fluxo OAuth tem teste proprio).
    await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
    const dbFile = path.join(dataDir, "db.json");
    const saved = JSON.parse(fs.readFileSync(dbFile, "utf8"));
    Object.assign(saved.gmbApi, { clientId: "id", clientSecret: "segredo", refreshToken: "refresh", accountName: "accounts/111", locationName: "locations/901" });
    Object.assign(saved.geogrid, { key: "chave-places", placeId: "ChIJspeed", runs: [{ at: daysAgo(1), terms: [{ term: "empréstimo consignado", cells: Array(25).fill({ rank: 5 }) }] }] });
    fs.writeFileSync(dbFile, JSON.stringify(saved));
    const server2 = createApp({ dataDir, backupDir: path.join(dataDir, "bk"), gmbFetch: google, placesFetch: places, napFetch: sites });
    await new Promise(resolve => server2.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server2.address().port}`;
    try {
      cookie = (await request("/api/login", { name: "admin", password: "senha-teste-123" })).cookie.split(";")[0];
      const primeira = (await request("/api/marketing/ficha-saude/run", {})).payload.ficha;
      const by = Object.fromEntries(primeira.health.checks.map(c => [c.id, c]));
      assert.equal(by.duplicate_listing.status, "fail");
      assert.equal(by.verification.status, "unknown");
      assert.equal(by.new_reviews.status, "pass");
      assert.equal(primeira.health.actions.total, 60);
      assert.deepEqual(primeira.health.keywords.map(k => k.term), ["emprestimo consignado"], "mesma busca com acento nao repete");
      assert.deepEqual(primeira.growth[0], { term: "empréstimo consignado", measuredAt: daysAgo(1), low: 1, high: 7, outside: 25, points: 25 });
      assert.equal(primeira.changes.length, 0, "primeira conferencia so guarda a foto");
      assert.deepEqual(primeira.googleDiff.map(d => d.label), ["Nome"]);
      assert.equal(JSON.stringify(primeira).includes("chave-places"), false);

      titulo = "Speed Financeira";
      const segunda = (await request("/api/marketing/ficha-saude/run", {})).payload.ficha;
      assert.equal(segunda.unseenChanges, 1);
      assert.equal(segunda.changes[0].label, "Nome");
      assert.equal(segunda.changes[0].after, "Speed Financeira");
      assert.equal((await request("/api/marketing/ficha-saude/changes/seen", {})).payload.ficha.unseenChanges, 0);

      const nap = (await request("/api/marketing/ficha-saude/nap", {})).payload.ficha.nap;
      const ueni = nap.results.find(r => r.id === "ueni");
      assert.equal(ueni.oldPhone, true);
      assert.equal(ueni.result, "mismatch");
      assert.equal(nap.results.find(r => r.id === "bendito_guia").result, "unreadable");
    } finally { await new Promise(resolve => server2.close(resolve)); }
  } finally { if (server.listening) server.close(); }
});
