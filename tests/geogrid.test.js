const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/app");
const { measureGeogrid, gridPoints, DEFAULT_CENTER } = require("../server/geogrid");

// Google Places simulado: a Speed cai de posicao conforme o ponto se afasta para o sul.
function fakePlaces(log) {
  return async (url, init) => {
    const fields = init.headers["X-Goog-FieldMask"];
    log.push({ url, fields, key: init.headers["X-Goog-Api-Key"], body: init.body ? JSON.parse(init.body) : null });
    if (init.headers["X-Goog-Api-Key"] === "chave-recusada-0000000000") return { ok: false, status: 403, json: async () => ({ error: { message: "API key not valid" } }) };
    if (!init.body) return { ok: true, status: 200, json: async () => ({ displayName: { text: "Lider Distante" } }) };
    const body = JSON.parse(init.body);
    if (/speed financeira/i.test(body.textQuery)) {
      return { ok: true, status: 200, json: async () => ({ places: [
        { id: "outra", displayName: { text: "Speed Motos" }, formattedAddress: "Av. X" },
        { id: "speed", displayName: { text: "Speed Financeira" }, formattedAddress: "R. Santa Cruz, 696" }
      ] }) };
    }
    const lat = body.locationBias.circle.center.latitude;
    const south = lat < DEFAULT_CENTER.lat - 0.005;
    const north = lat > DEFAULT_CENTER.lat + 0.005;
    const ids = north ? ["speed", "credimais", "dlcred"] : south ? ["distante", "credimais", "dlcred", "empresta"] : ["credimais", "speed", "dlcred"];
    const places = ids.map(id => fields.includes("displayName") ? { id, displayName: { text: id.toUpperCase() } } : { id });
    return { ok: true, status: 200, json: async () => ({ places }) };
  };
}

test("geogrid: grade 5x5 centrada na loja, norte em cima, 1 km entre pontos", () => {
  const points = gridPoints();
  assert.equal(points.length, 25);
  const center = points.find(p => p.row === 2 && p.col === 2);
  assert.deepEqual([center.lat, center.lng], [+DEFAULT_CENTER.lat.toFixed(6), +DEFAULT_CENTER.lng.toFixed(6)]);
  assert.ok(points.find(p => p.row === 0 && p.col === 2).lat > center.lat, "linha 0 e o norte");
  assert.ok(points.find(p => p.row === 2 && p.col === 4).lng > center.lng, "coluna 4 e o leste");
  assert.ok(Math.abs(points.find(p => p.row === 1 && p.col === 2).lat - center.lat - 1 / 111.32) < 1e-5);
});

test("geogrid: posicao por ponto, media, top 3 e lideres; grade so pede places.id e busca sem cidade", async () => {
  const log = [];
  const run = await measureGeogrid({ key: "chave-de-teste-123456789", placeId: "speed", terms: ["empréstimo consignado"], fetchImpl: fakePlaces(log) });
  const term = run.terms[0];
  assert.equal(term.cells.length, 25);
  // Linhas 0 e 1 (norte): 1o; linha 2 (centro): 2o; linhas 3 e 4 (sul): fora dos 20.
  assert.equal(term.cells.find(c => c.row === 1).rank, 1, "norte: 1o");
  assert.equal(term.cells.find(c => c.row === 2).rank, 2, "centro: 2o");
  assert.equal(term.cells.find(c => c.row === 4).rank, null, "sul: fora dos 20");
  assert.equal(term.top3, 15);
  assert.equal(term.found, 15);
  assert.equal(term.average, +((10 * 1 + 5 * 2 + 10 * 21) / 25).toFixed(1));
  assert.deepEqual(term.leaders, [{ id: "credimais", count: 5 }, { id: "distante", count: 10 }].sort((a, b) => b.count - a.count));
  assert.equal(run.names.credimais, "CREDIMAIS");
  assert.equal(run.names.distante, "Lider Distante", "lider fora da busca do centro vem do Place Details");
  const grid = log.filter(item => item.body && item.fields === "places.id");
  assert.equal(grid.length, 25);
  assert.ok(grid.every(item => item.body.textQuery === "empréstimo consignado" && item.body.locationBias.circle.radius === 1000 && item.body.pageSize === 20));
  assert.equal(run.calls, 27, "1 busca com nomes + 25 da grade + 1 detalhe");
});

test("geogrid: rotas do painel guardam a chave sem devolve-la, medem e registram erro", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-geogrid-"));
  const log = [];
  const server = createApp({ dataDir, backupDir: path.join(dataDir, "bk"), placesFetch: fakePlaces(log) });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(route, data) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (data !== undefined) { headers["content-type"] = "application/json"; headers.origin = base; }
    const response = await fetch(base + route, { method: data === undefined ? "GET" : "POST", headers, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: response.status, payload: await response.json(), cookie: response.headers.get("set-cookie") };
  }
  try {
    await request("/api/setup", { name: "admin", password: "senha-teste-123" });
    cookie = (await request("/api/login", { name: "admin", password: "senha-teste-123" })).cookie.split(";")[0];
    assert.equal((await request("/api/marketing/geogrid")).payload.geogrid.configured, false);
    assert.equal((await request("/api/marketing/geogrid/run", {})).status, 400, "sem chave nao mede");
    assert.equal((await request("/api/marketing/geogrid/config", { key: "curta" })).status, 400);
    const recusada = await request("/api/marketing/geogrid/config", { key: "chave-recusada-0000000000" });
    assert.equal(recusada.status, 400);
    assert.match(recusada.payload.error, /API key not valid/);

    const config = await request("/api/marketing/geogrid/config", { key: "chave-de-teste-123456789" });
    assert.equal(config.status, 200);
    assert.equal(config.payload.geogrid.placeId, "speed", "escolhe a Speed Financeira, nao a Speed Motos");
    assert.equal(config.payload.geogrid.keyHint, "...6789");
    assert.equal(JSON.stringify(config.payload).includes("chave-de-teste-123456789"), false, "chave nunca volta para a tela");

    const run = await request("/api/marketing/geogrid/run", {});
    assert.equal(run.status, 200);
    const view = run.payload.geogrid;
    assert.equal(view.runs.length, 1);
    assert.equal(view.runs[0].trigger, "manual");
    assert.equal(view.runs[0].terms.length, 4);
    assert.ok(log.filter(item => item.body?.textQuery).every(item => !/varginha/i.test(item.body.textQuery) || /speed financeira/i.test(item.body.textQuery)), "termos da grade sem cidade");
    const state = (await request("/api/state")).payload;
    assert.equal(JSON.stringify(state).includes("chave-de-teste-123456789"), false);

    assert.equal((await request("/api/marketing/geogrid/config", { remove: true })).payload.geogrid.configured, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("geogrid: visibilidade e posicao media dos concorrentes", () => {
  const { rivals } = require("../server/geogrid");
  const cells = [
    { ids: ["credimais", "speed", "dl"] },
    { ids: ["credimais", "dl", "outro", "speed"] },
    { ids: ["ideal", "credimais"] },
    { ids: [] }
  ];
  const r = rivals(cells, "speed");
  assert.deepEqual(r.map(c => c.id), ["credimais", "dl", "ideal", "outro"]);
  assert.deepEqual(r[0], { id: "credimais", top3: 3, visibility: 75, average: 6.3, found: 3 });
  assert.equal(r.find(c => c.id === "dl").average, 11.8, "(3 + 2 + 21 + 21) / 4");
  assert.equal(r.some(c => c.id === "speed"), false, "a propria ficha fica de fora");
});
