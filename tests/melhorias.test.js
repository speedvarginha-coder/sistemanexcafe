// Grupo padronizado, faixas da impressao P&B, indicadores do plano de 7 dias e normalizacao do cadastro.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/app");
const { groupOf, tierUnitCents, parsePrintTiers, normalizationPlan, applyNormalization, revertNormalization, DEFAULT_PRINT_TIERS } = require("../server/grupos");
const { buildIndicators } = require("../server/indicadores");

test("grupos: nomes lancados de formas diferentes caem no mesmo servico", () => {
  assert.equal(groupOf({ name: "Impressão P/B Balcão" }), "Impressão P&B");
  assert.equal(groupOf({ name: "Impressão Preto e Branco" }), "Impressão P&B");
  assert.equal(groupOf({ name: "Xerox" }), "Impressão P&B");
  assert.equal(groupOf({ name: "Currículo Novo + PDF - 5 folhas" }), "Currículo");
  assert.equal(groupOf({ name: "MEU INSS Recuperação Senha" }), "INSS (Meu INSS)");
  assert.equal(groupOf({ name: "Agua com gás 500ml", category: "Bebidas & Bomboniere" }), "Bomboniere e bebidas");
  assert.equal(groupOf({ name: "Qualquer", category: "Serviços Públicos" }), "Serviços Públicos");
  assert.equal(groupOf({ name: "Impressão P/B Balcão", group: "Outro grupo" }), "Outro grupo", "grupo do cadastro vale mais que a regra");
});

test("faixas P&B: preco da faixa pelo total de paginas e validacao do texto", () => {
  assert.deepEqual([1, 10, 11, 50, 51, 150, 151, 500].map(n => tierUnitCents(n)), [100, 100, 70, 70, 50, 50, 40, 40]);
  assert.deepEqual(parsePrintTiers("1=1,00; 11=0,70; 51=0.50"), [{ min: 1, cents: 100 }, { min: 11, cents: 70 }, { min: 51, cents: 50 }]);
  assert.throws(() => parsePrintTiers("5=1,00"), /comecar em 1/);
  assert.throws(() => parsePrintTiers("1=1,00; 11=0,70; 11=0,50"), /ordem crescente/);
  assert.throws(() => parsePrintTiers("1=abc"), /Faixa invalida/);
  assert.equal(DEFAULT_PRINT_TIERS[0].min, 1);
});

test("normalizacao: fica o mais vendido, preco divergente nao muda e da para desfazer", () => {
  const products = [
    { id: "a", name: "Agua com gás 500ml", category: "Bomboniere & Bebidas", priceCents: 400, active: true },
    { id: "b", name: "Água com Gás 500ml", category: "Bebidas & Bomboniere", priceCents: 400, active: true },
    { id: "c", name: "Coca Cola 600ml Pet", category: "Bomboniere & Bebidas", priceCents: 700, active: true },
    { id: "d", name: "Coca-Cola 600ml Pet", category: "Bebidas & Bomboniere", priceCents: 500, active: true }
  ];
  const sold = new Map([["a", { quantity: 67, revenueCents: 28981 }], ["c", { quantity: 3, revenueCents: 1800 }]]);
  const plan = normalizationPlan(products, sold);
  assert.equal(plan.duplicates.length, 2);
  const agua = plan.duplicates.find(dup => dup.keep.id === "a");
  assert.equal(agua.divergentPrice, false);
  assert.deepEqual(agua.retire.map(item => item.id), ["b"]);
  assert.equal(plan.duplicates.find(dup => dup.keep.id === "c").divergentPrice, true);
  assert.deepEqual(plan.categories, [{ from: "Bebidas & Bomboniere", to: "Bomboniere & Bebidas", products: 2 }]);

  const result = applyNormalization(products, plan, "2026-10-17T12:00:00.000Z", "admin");
  assert.deepEqual(result, { retired: 1, recategorized: 2 });
  assert.equal(products[1].active, false);
  assert.equal(products[1].replacedBy, "a");
  assert.equal(products[3].active, true, "preco divergente: nao inativa");
  assert.equal(products[3].category, "Bomboniere & Bebidas");
  assert.equal(normalizationPlan(products, sold).duplicates.length, 1, "o ja normalizado sai da proposta");

  assert.equal(revertNormalization(products), 2);
  assert.equal(products[1].active, true);
  assert.equal(products[1].replacedBy, undefined);
  assert.equal(products[1].category, "Bebidas & Bomboniere");
  assert.equal(products[3].category, "Bebidas & Bomboniere");
});

test("indicadores: atendimento por sessao, anexos, volume, sobra e recarga fora", () => {
  const products = [{ id: "pb", name: "Impressão P/B Balcão", category: "Gráfica Rápida" }, { id: "env", name: "Envelope Pardo", category: "Gráfica Rápida" }, { id: "inss", name: "MEU INSS Recuperação Senha", category: "Serviços Públicos" }];
  const at = "2026-10-19T14:00:00.000Z";
  const charges = [
    { id: "1", at, kind: "sale", amountCents: 1200, items: [{ productId: "pb", quantity: 10, totalCents: 1000 }, { productId: "env", quantity: 1, totalCents: 200 }] },
    { id: "2", at, kind: "sale", amountCents: 3500, items: [{ productId: "pb", quantity: 60, totalCents: 3000 }, { name: "Recebimento de Arquivos", category: "Lan House & Serviços Digitais", quantity: 1, totalCents: 100 }, { productId: "inss", quantity: 1, totalCents: 400 }] },
    { id: "3", at, kind: "time", amountCents: 500, sessionId: "s1" },
    { id: "4", at, kind: "print", amountCents: 200, quantity: 2, color: false, sessionId: "s1" },
    { id: "5", at, kind: "credit", amountCents: 5000 }
  ];
  const incomes = [{ at, category: "Venda não lançada (sobra de caixa)", amountCents: 900 }];
  const r = buildIndicators({ charges, incomes, products, start: "2026-10-19", end: "2026-10-19" });
  const day = r.days[0];
  assert.equal(day.revenueCents, 5400, "recarga de credito nao entra");
  assert.equal(day.visits, 3, "tempo e impressao da mesma sessao contam uma vez");
  assert.equal(day.ticketCents, 1800);
  assert.equal(day.pbSales, 2);
  assert.equal(day.envelopePct, 50);
  assert.equal(day.receivePct, 50);
  assert.equal(day.volumePages, 60);
  assert.equal(day.highValueUnits, 1);
  assert.equal(day.leftoverCents, 900);
  assert.equal(day.byGroup["Impressão P&B"].quantity, 72);
  assert.equal(r.average.revenueCents, 5400);
});

test("caixa: faixas P&B so com a opcao ativa, xerox e preco digitado nao mudam", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-melhorias-"));
  const server = createApp({ dataDir, backupDir: path.join(dataDir, "bk") });
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
    await request("/api/cash/open", { opening: 0 });
    const product = async (name, price) => (await request("/api/products", { name, category: "Gráfica Rápida", type: "service", price })).payload.product.id;
    const balcao = await product("Impressão P/B Balcão", 1);
    const tabela = await product("Impressão Preto e Branco", 0.5);
    const xerox = await product("Xerox", 0.5);
    const envelope = await product("Envelope Pardo", 2);
    const sale = async items => (await request("/api/sales", { items, paymentMethod: "cash" })).payload.charge;

    let state = (await request("/api/state")).payload;
    assert.equal(state.settings.printTiersEnabled, false, "faixas comecam desligadas");
    assert.equal(state.settings.comboHintsEnabled, true);
    assert.equal(state.products.find(item => item.id === tabela).group, "Impressão P&B");
    assert.equal((await sale([{ productId: balcao, quantity: 12 }])).amountCents, 1200, "desligado: preco do cadastro");

    assert.equal((await request("/api/settings/print-tiers", { tiers: "5=0,80" })).status, 400);
    assert.equal((await request("/api/settings/print-tiers", { tiers: "1=1,00; 11=0,70; 51=0,50; 151=0,40", enabled: true })).status, 200);

    let charge = await sale([{ productId: balcao, quantity: 12 }]);
    assert.equal(charge.amountCents, 840);
    assert.equal(charge.items[0].unitPriceCents, 70);
    assert.equal(charge.items[0].listPriceCents, 100);
    assert.equal(charge.items[0].priceTier, true);

    // 5 balcao + 10 "Preto e Branco" = 15 paginas: faixa de R$ 0,70 para as duas linhas.
    charge = await sale([{ productId: balcao, quantity: 5 }, { productId: tabela, quantity: 10 }, { productId: envelope, quantity: 1 }]);
    assert.deepEqual(charge.items.map(item => item.unitPriceCents), [70, 70, 200]);
    assert.equal(charge.amountCents, 15 * 70 + 200);

    // "Preto e Branco" com poucas paginas sobe para a faixa de 1 a 10 (R$ 1,00).
    assert.equal((await sale([{ productId: tabela, quantity: 3 }])).amountCents, 300);
    assert.equal((await sale([{ productId: xerox, quantity: 20 }])).amountCents, 1000, "xerox fica no preco do cadastro");
    assert.equal((await sale([{ productId: balcao, quantity: 20, unitPriceCents: 60 }])).amountCents, 1200, "preco digitado na venda nao muda");
    assert.equal((await sale([{ productId: tabela, quantity: 200 }])).amountCents, 8000);

    const indicators = (await request("/api/reports/indicators")).payload;
    assert.equal(indicators.ok, true);
    assert.equal(indicators.days.length, 1);
    assert.equal(indicators.days[0].pbSales, 7);
    assert.equal(indicators.days[0].volumePages, 200);

    await request("/api/products", { name: "Agua 500ml", category: "Bebidas & Bomboniere", type: "stock", price: 3 });
    const plan = (await request("/api/products/normalization")).payload;
    assert.deepEqual(plan.categories, [{ from: "Bebidas & Bomboniere", to: "Bomboniere & Bebidas", products: 1 }]);
    assert.equal((await request("/api/products/normalization/apply", {})).payload.recategorized, 1);
    assert.ok(fs.readdirSync(dataDir).some(name => name.includes("antes-normalizacao")), "copia do banco antes de aplicar");
    assert.equal((await request("/api/products/normalization/revert", {})).payload.reverted, 1);
    state = (await request("/api/state")).payload;
    assert.equal(state.products.find(item => item.name === "Agua 500ml").category, "Bebidas & Bomboniere");
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("indicadores: caixa, receita realizada, contribuicao e categorias sem repetir", () => {
  const products = [{ id: "pb", name: "Impressão P/B Balcão", category: "Gráfica Rápida" }, { id: "env", name: "Envelope Pardo", category: "Gráfica Rápida" }, { id: "inss", name: "MEU INSS Recuperação Senha", category: "Serviços Públicos" }, { id: "agua", name: "Agua 500ml", category: "Bebidas & Bomboniere" }];
  const at = "2026-10-19T14:00:00.000Z";
  const charges = [
    { id: "1", at, kind: "sale", amountCents: 1200, items: [{ productId: "pb", quantity: 10, totalCents: 1000 }, { productId: "env", quantity: 1, totalCents: 200 }] },
    { id: "2", at, kind: "sale", amountCents: 3300, items: [{ productId: "inss", quantity: 1, totalCents: 3000 }, { productId: "agua", quantity: 1, totalCents: 300 }] },
    { id: "3", at, kind: "package", amountCents: 25000, pages: 500 },
    { id: "4", at, kind: "sale", amountCents: 5000, packageDelivery: true, items: [{ productId: "pb", quantity: 100, totalCents: 5000 }] },
    { id: "5", at, kind: "credit", amountCents: 1000 }
  ];
  const payments = [{ at, chargeId: "1", amountCents: 1200 }, { at, chargeId: "2", amountCents: 3300 }, { at, chargeId: "3", amountCents: 25000 }, { at, chargeId: "5", amountCents: 1000 }];
  const day = buildIndicators({ charges, payments, products, start: "2026-10-19", end: "2026-10-19" }).days[0];
  assert.equal(day.revenueCents, 9500, "pacote e recarga nao sao receita; a entrega e");
  assert.equal(day.cashCents, 30500, "caixa tem tudo que entrou");
  assert.equal(day.cashPackageCents, 25000);
  assert.equal(day.cashTimeCreditCents, 1000);
  assert.equal(day.pbPages, 110);
  assert.equal(day.packageDeliveredPages, 100);
  assert.equal(day.envelopes, 1);
  // custo: 110 pag P&B x 14 + 1 envelope x 43,2 = 1583,2; receita com custo: 1000 + 200 + 5000 = 6200
  assert.equal(day.costedRevenueCents, 6200);
  assert.equal(day.contributionCents, Math.round(6200 - 1583.2));
  assert.equal(day.uncostedRevenueCents, 3300, "INSS e bomboniere ficam sem custo apurado (nada de 100% de margem)");
  assert.equal(day.byCategory["Bomboniere & Bebidas"].sales, 1, "categoria antiga cai na oficial");
  assert.equal(day.byCategory["Gráfica Rápida"].sales, 2, "um atendimento conta uma vez por categoria");
});

test("pacote pre-pago: caixa na venda, receita so na entrega e soma exata", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-pacote-"));
  const server = createApp({ dataDir, backupDir: path.join(dataDir, "bk") });
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
    await request("/api/products", { name: "Impressão P/B Balcão", category: "Gráfica Rápida", type: "service", price: 1 });
    const client = (await request("/api/clients", { name: "Contabilidade Teste", phone: "35999990000" })).payload.client;
    assert.equal((await request(`/api/clients/${client.id}/packages`, { pages: 500, amount: 250, paymentMethod: "pix" })).status, 409, "precisa de caixa aberto");
    await request("/api/cash/open", { opening: 0 });
    const sold = await request(`/api/clients/${client.id}/packages`, { pages: 500, amount: 250, paymentMethod: "pix" });
    assert.equal(sold.status, 201);
    const pack = sold.payload.package;
    let state = (await request("/api/state")).payload;
    const paymentsBefore = state.payments.length;
    let report = (await request("/api/reports?period=today")).payload;
    assert.equal(report.salesCents, 0, "venda de pacote nao e faturamento");

    assert.equal((await request(`/api/clients/${client.id}/packages/${pack.id}/deliver`, { pages: 600 })).status, 400, "nao entrega mais que o saldo");
    assert.equal((await request(`/api/clients/${client.id}/packages/${pack.id}/deliver`, { pages: 333 })).payload.charge.amountCents, 16650);
    const last = await request(`/api/clients/${client.id}/packages/${pack.id}/deliver`, { pages: 167 });
    assert.equal(last.payload.charge.amountCents, 25000 - 16650, "ultima entrega fecha o valor exato");
    assert.equal((await request(`/api/clients/${client.id}/packages/${pack.id}/deliver`, { pages: 1 })).status, 409);

    state = (await request("/api/state")).payload;
    assert.equal(state.payments.length, paymentsBefore, "entrega nao gera recebimento no caixa");
    assert.equal(state.openCharges.length, 0, "entrega nao vira pendencia");
    report = (await request("/api/reports?period=today")).payload;
    assert.equal(report.salesCents, 25000, "receita reconhecida = valor do pacote, depois de entregue");
    const ind = (await request(`/api/reports/indicators?start=2000-01-01&end=2100-01-01`)).payload;
    assert.equal(ind.total.revenueCents, 25000);
    assert.equal(ind.total.cashPackageCents, 25000);
    assert.equal(ind.total.packageDeliveredPages, 500);
    assert.equal(ind.packages.pages, 0);
    assert.deepEqual(ind.goals, [35000, 37500, 40000]);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("queda de energia: db.json ilegivel sobe com o backup valido mais recente sem estragar os backups", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lanhouse-queda-"));
  const bk = path.join(dataDir, "bk");
  fs.mkdirSync(bk);
  const put = (file, text, ageMinutes) => { fs.writeFileSync(file, text); const t = new Date(Date.now() - ageMinutes * 60000); fs.utimesSync(file, t, t); };
  const zeros = "\0".repeat(64);
  put(path.join(dataDir, "db.json"), `{"version":2,"settings":{${zeros}`, 0);
  put(path.join(bk, "db-2026-10-02.json"), `{"version":2,${zeros}`, 10); // mais recente, mas tambem ilegivel
  put(path.join(dataDir, "db.json.2026-10-02.bak"), JSON.stringify({ version: 2, settings: { defaultMinutes: 44 } }), 20);
  put(path.join(bk, "db-2026-10-01.json"), JSON.stringify({ version: 2, settings: { defaultMinutes: 33 } }), 30);
  const server = createApp({ dataDir, backupDir: bk });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const db = JSON.parse(fs.readFileSync(path.join(dataDir, "db.json"), "utf8"));
    assert.equal(db.settings.defaultMinutes, 44, "pulou o backup ilegivel e pegou o valido mais recente");
    assert.ok(db.events.some(e => e.title === "Banco restaurado de backup"));
    const kept = fs.readdirSync(dataDir).find(name => name.startsWith("db.json.corrompido-"));
    assert.match(fs.readFileSync(path.join(dataDir, kept), "utf8"), /\0/, "arquivo ilegivel guardado");
    assert.equal(JSON.parse(fs.readFileSync(path.join(bk, "db-2026-10-01.json"), "utf8")).settings.defaultMinutes, 33);
    const today = new Date().toISOString().slice(0, 10);
    assert.equal(JSON.parse(fs.readFileSync(path.join(bk, `db-${today}.json`), "utf8")).settings.defaultMinutes, 44, "copia externa do dia nao recebe o arquivo ilegivel");
    assert.equal(fs.readdirSync(dataDir).some(name => name.endsWith(".tmp")), false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  // Inclui o backup diario que o servidor acabou de gravar: sobra dele faria a carga dar certo.
  fs.readdirSync(dataDir).filter(name => /^db\.json\.\d{4}-\d{2}-\d{2}\.bak$/.test(name)).forEach(name => fs.rmSync(path.join(dataDir, name)));
  fs.readdirSync(bk).forEach(name => fs.rmSync(path.join(bk, name)));
  put(path.join(dataDir, "db.json"), `{"version":2,${zeros}`, 0);
  assert.throws(() => createApp({ dataDir, backupDir: bk }), /nenhum backup valido/);
  fs.rmSync(dataDir, { recursive: true, force: true });
});
