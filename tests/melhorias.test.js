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
