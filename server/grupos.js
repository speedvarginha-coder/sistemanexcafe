// Grupo padronizado de cada produto/servico (relatorios somam pelo grupo, nao pelo nome lancado),
// faixas de preco da impressao P&B e proposta de normalizacao do cadastro (sem apagar historico).
"use strict";

const norm = text => String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const PB_GROUP = "Impressão P&B";
const COLOR_GROUP = "Impressão Colorida";
// Ordem importa: a primeira regra que casar com o nome define o grupo.
const GROUP_RULES = [
  [/^impressao p\/b balcao$|^impressao preto e branco$|^xerox$|^impressao acima de 150/, PB_GROUP],
  [/^impressao colorida$|^xerox colorida$/, COLOR_GROUP],
  [/^recebimento (de arquivos|internet|colorido)$/, "Recebimento de Arquivos"],
  [/^scanner$/, "Scanner"],
  [/^envio de arquivos$/, "Envio de arquivos"],
  [/curriculo/, "Currículo"],
  [/^acesso a internet$/, "Uso de computador"],
  [/^(taxa de )?consulta simples$/, "Consulta simples"],
  [/^plastificacao/, "Plastificação"],
  [/^impressao papel (fotografico|cartao|adesivo)$/, "Impressão em papel especial"],
  [/^revelacao de foto/, "Foto 3x4"],
  [/^envelope/, "Envelope"],
  [/^encadernacao/, "Encadernação"],
  [/inss/, "INSS (Meu INSS)"],
  [/^detran/, "Detran"],
  [/conta gov|assinatura gov|subir conta gov/, "gov.br"],
  [/consulta spc|serasa|score/, "Consulta SPC/crédito"],
  [/^transferencia|transferencia de titularidade|cemig transferencia/, "Transferência de titularidade"],
  [/^digitacao|^edicao de 1 folha/, "Digitação"],
  [/^edicao (simples|ocr)/, "Edição de arquivo"],
  [/^contrato/, "Contrato de locação"],
  [/^suporte ao cliente$/, "Suporte ao cliente"],
  [/manutencao celular|formatacao|backup e configuracao/, "Manutenção de celular"],
  [/^(tim|claro|vivo)\b|recargas? de celular/, "Recarga de celular (repasse)"],
];
const CATEGORY_FALLBACK = [
  [/bomboniere|bebidas/i, "Bomboniere e bebidas"],
  [/eletronicos|eletrônicos|acessorios|acessórios|cabos/i, "Eletrônicos e acessórios"],
];
// Servicos de maior valor (ticket medio de R$ 23 contra R$ 10 das demais vendas).
const HIGH_VALUE_GROUPS = new Set(["Currículo", "INSS (Meu INSS)", "Detran", "gov.br", "Consulta SPC/crédito", "Contrato de locação", "Transferência de titularidade", "Digitação", "Manutenção de celular"]);
const HIGH_VALUE_CATEGORIES = new Set(["Serviços Públicos", "Serviços Financeiros", "Informática & Celular"]);

function groupOfName(name, category) {
  const n = norm(name);
  for (const [re, group] of GROUP_RULES) if (re.test(n)) return group;
  for (const [re, group] of CATEGORY_FALLBACK) if (re.test(category || "")) return group;
  return category || "Outros";
}
// Produto pode ter grupo definido no cadastro; senao vem das regras pelo nome.
function groupOf(product) {
  if (!product) return "Outros";
  return product.group || groupOfName(product.name, product.category);
}
function isHighValue(group, category) {
  return HIGH_VALUE_GROUPS.has(group) || HIGH_VALUE_CATEGORIES.has(category);
}

// ---------- Faixas da impressao P&B: preco da faixa vale para todas as paginas do pedido ----------
const DEFAULT_PRINT_TIERS = [{ min: 1, cents: 100 }, { min: 11, cents: 70 }, { min: 51, cents: 50 }, { min: 151, cents: 40 }];
function tierUnitCents(pages, tiers = DEFAULT_PRINT_TIERS) {
  let unit = tiers[0].cents;
  for (const tier of tiers) if (pages >= tier.min) unit = tier.cents;
  return unit;
}
// "1=1,00; 11=0,70; 51=0,50; 151=0,40" -> [{min,cents}]
function parsePrintTiers(value) {
  const rows = String(value ?? "").split(/[;\n]+/).map(row => row.trim()).filter(Boolean);
  const tiers = [];
  for (const row of rows) {
    const match = row.match(/^(\d{1,5})\s*[=:]\s*(\d+(?:[.,]\d{1,2})?)$/);
    if (!match) throw Object.assign(new Error(`Faixa invalida: "${row}". Use paginas=preco, ex.: 11=0,70`), { status: 400 });
    tiers.push({ min: Number(match[1]), cents: Math.round(Number(match[2].replace(",", ".")) * 100) });
  }
  if (!tiers.length || tiers[0].min !== 1) throw Object.assign(new Error("A primeira faixa deve comecar em 1 pagina"), { status: 400 });
  for (let i = 0; i < tiers.length; i++) {
    if (tiers[i].cents < 1) throw Object.assign(new Error("Preco da faixa deve ser maior que zero"), { status: 400 });
    if (i && tiers[i].min <= tiers[i - 1].min) throw Object.assign(new Error("As faixas devem estar em ordem crescente de paginas"), { status: 400 });
  }
  return tiers;
}

// ---------- Normalizacao do cadastro: proposta (nada e apagado) ----------
const CATEGORY_MERGE = { "Bebidas & Bomboniere": "Bomboniere & Bebidas", "Acessórios & Cabos": "Eletrônicos & Acessórios" };
const nameKey = name => norm(name).replace(/[^a-z0-9 ]/g, " ").replace(/\b(de|da|do|e|para|pra|com)\b/g, " ").replace(/\s+/g, " ").trim();

// soldByProduct: Map productId -> { quantity, revenueCents }
function normalizationPlan(products, soldByProduct = new Map()) {
  const sold = id => soldByProduct.get(id) || { quantity: 0, revenueCents: 0 };
  const byKey = new Map();
  for (const product of products) {
    if (product.replacedBy) continue; // ja normalizado
    const key = nameKey(product.name);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(product);
  }
  const duplicates = [];
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    // Fica o que mais vendeu; empate: o ativo, depois o mais antigo.
    const ranked = list.slice().sort((a, b) => sold(b.id).revenueCents - sold(a.id).revenueCents || Number(b.active) - Number(a.active) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    const keep = ranked[0];
    const retire = ranked.slice(1);
    const divergent = retire.some(item => item.priceCents !== keep.priceCents && item.active);
    duplicates.push({
      keep: { id: keep.id, code: keep.code, name: keep.name, category: keep.category, priceCents: keep.priceCents, active: keep.active, sold: sold(keep.id) },
      retire: retire.map(item => ({ id: item.id, code: item.code, name: item.name, category: item.category, priceCents: item.priceCents, active: item.active, sold: sold(item.id) })),
      divergentPrice: divergent,
      action: divergent ? "decidir o preço antes" : "inativar e apontar para o principal"
    });
  }
  const categories = Object.entries(CATEGORY_MERGE).map(([from, to]) => ({ from, to, products: products.filter(item => item.category === from).length })).filter(row => row.products);
  const ungrouped = products.filter(item => item.active && groupOf(item) === (item.category || "Outros") && !HIGH_VALUE_CATEGORIES.has(item.category)).length;
  return { duplicates, categories, ungrouped };
}

// Aplica a proposta guardando o valor anterior em product.normalization (permite desfazer).
function applyNormalization(products, plan, at, by) {
  const byId = new Map(products.map(item => [item.id, item]));
  let retired = 0, recategorized = 0;
  for (const dup of plan.duplicates) {
    if (dup.divergentPrice) continue;
    for (const row of dup.retire) {
      const product = byId.get(row.id); if (!product || product.replacedBy) continue;
      product.normalization = { ...(product.normalization || {}), active: product.active, at, by };
      product.active = false; product.replacedBy = dup.keep.id; retired++;
    }
  }
  for (const { from, to } of plan.categories) {
    for (const product of products) {
      if (product.category !== from) continue;
      product.normalization = { ...(product.normalization || {}), category: from, at, by };
      product.category = to; recategorized++;
    }
  }
  return { retired, recategorized };
}
function revertNormalization(products) {
  let reverted = 0;
  for (const product of products) {
    if (!product.normalization) continue;
    if ("active" in product.normalization) product.active = product.normalization.active;
    if (product.normalization.category) product.category = product.normalization.category;
    delete product.replacedBy; delete product.normalization; reverted++;
  }
  return reverted;
}

module.exports = { norm, PB_GROUP, COLOR_GROUP, HIGH_VALUE_GROUPS, groupOf, groupOfName, isHighValue, DEFAULT_PRINT_TIERS, tierUnitCents, parsePrintTiers, normalizationPlan, applyNormalization, revertNormalization, CATEGORY_MERGE };
