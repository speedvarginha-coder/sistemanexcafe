// Sugestões de ação calculadas com os números reais da loja.
// Cada regra traduz uma prática de gestão (meta realista, ticket médio, ociosidade, margem,
// capital parado, recebíveis, custos fixos) em uma ação concreta com o porquê em números.
// A chave (key) é estável: a mesma sugestão não entra duas vezes no plano.

const brl = cents => `R$ ${(Math.round(cents) / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const pct = (part, total) => total ? Math.round(part / total * 100) : 0;

function suggestActions(r, db) {
  const out = [];
  const add = (key, priority, area, title, why, how, impact = "") => out.push({ key, priority, area, title, why, how, impact });
  const settings = db.settings || {};
  const products = (db.products || []).filter(p => p.active !== false);

  // 1. Meta realista: meta muito acima do que a loja vende tira o valor dos alertas e da projeção.
  const months = (r.monthly || []).filter(m => m.salesCents > 0);
  const recent = months.slice(-3);
  const avg = recent.length ? recent.reduce((s, m) => s + m.salesCents, 0) / recent.length : 0;
  const base = Math.max(avg, r.goal?.projectionCents || 0);
  if (r.goal && base && r.goal.monthGoalCents > base * 1.6) {
    const target = Math.ceil(base * 1.15 / 10000) * 10000;
    add("meta-realista", "alta", "Metas", `Ajustar a meta do mês para ${brl(target)}`,
      `A meta atual é ${brl(r.goal.monthGoalCents)}, mas a loja projeta ${brl(r.goal.projectionCents || base)} no mês. Meta impossível não orienta a equipe.`,
      `Em Relatórios, abra "Metas e taxas" e coloque ${brl(target)} (15% acima do ritmo atual) e meta diária de ${brl(target / Math.max(1, (settings.workDays || 6) * 4.3))}. Revise todo mês.`,
      "Alertas e projeção passam a mostrar se o mês está no rumo.");
  }

  // 2. Ticket médio: muitas vendas pequenas = espaço para combos e venda adicional no balcão.
  const bands = r.ticketBands || [];
  const small = bands.filter(b => (b.max || Infinity) <= 1000).reduce((s, b) => s + b.count, 0);
  const totalCount = bands.reduce((s, b) => s + b.count, 0);
  if (totalCount >= 30 && small / totalCount > 0.5) {
    const gain = Math.round(small * 0.3 * 200);
    add("ticket-combos", "alta", "Vendas", "Criar combos e oferecer um item a mais em toda venda pequena",
      `${pct(small, totalCount)}% das vendas (${small} de ${totalCount}) ficam abaixo de R$ 10,00. Ticket médio: ${brl(r.averageTicketCents || 0)}.`,
      "Cadastre combos no catálogo, por exemplo: currículo + 3 impressões + envelope; documento + plastificação; foto 3x4 + impressão. No balcão, sempre ofereça envelope, plastificação ou uma bebida junto.",
      `Se 3 em cada 10 vendas pequenas levarem R$ 2,00 a mais: cerca de ${brl(gain)} por mês.`);
  }

  // 3. Preço inconsistente do mesmo serviço (ex.: impressão P&B com dois preços).
  const bw = products.filter(p => /impress/i.test(p.name) && /(p\/?b|p&b|preto)/i.test(p.name) && !/foto|cart[aã]o|adesiv|colorid/i.test(p.name));
  const bwPrices = [...new Set(bw.map(p => p.priceCents))].sort((a, b) => a - b);
  if (bwPrices.length > 1) {
    const legacyBw = (r.legacyUnits || []).filter(u => /impress/i.test(u.name) && /(p\/?b|preto)/i.test(u.name) && !/foto|cart|adesiv|colorid/i.test(u.name));
    const cheap = legacyBw.filter(u => u.priceCents === bwPrices[0]).reduce((s, u) => s + u.units, 0);
    add("preco-pb", "alta", "Preços", "Padronizar o preço da impressão P&B",
      `A impressão P&B está cadastrada com ${bwPrices.length} preços (${bwPrices.map(brl).join(" e ")}) em ${bw.map(p => `"${p.name}"`).join(", ")}.${cheap ? ` No histórico, ${cheap} páginas saíram pelo preço menor.` : ""}`,
      `Defina uma tabela única e deixe visível no balcão, por exemplo: até 10 páginas ${brl(bwPrices[bwPrices.length - 1])} cada; acima de 10, ${brl(bwPrices[0])} cada. Desative o cadastro duplicado.`,
      cheap ? `Cada página cobrada pelo preço cheio no lugar do menor rende ${brl(bwPrices[bwPrices.length - 1] - bwPrices[0])} a mais.` : "");
  }

  // 4. Serviços de maior valor: divulgar o que tem ticket alto e já tem procura.
  const premium = (r.legacyUnits || []).filter(u => u.priceCents >= 1500 && u.units >= 5).sort((a, b) => b.estimatedCents - a.estimatedCents).slice(0, 6);
  if (premium.length) {
    add("divulgar-servicos", "alta", "Marketing", "Divulgar os serviços de maior valor",
      `Serviços acima de R$ 15,00 que já têm procura: ${premium.map(u => `${u.name} (${brl(u.priceCents)}, ${u.units} vendidos)`).join("; ")}.`,
      "Placa na vitrine e no balcão com esses serviços e preços. Publique no Google Meu Negócio e no status do WhatsApp da loja uma vez por semana (use o módulo Speed Marketing).",
      "Uma venda a mais por dia de um serviço de R$ 20,00 são cerca de R$ 500,00 por mês.");
  }

  // 5. Horários e dias fracos dentro do horário de funcionamento.
  const hours = (r.byHour || []).filter(h => h.count > 0);
  const byDay = (r.byWeekday || []).filter(d => d.days > 0).map(d => ({ ...d, perDay: d.salesCents / d.days }));
  const bestDay = byDay.reduce((a, b) => (b.perDay > (a?.perDay || 0) ? b : a), null);
  const weakDay = byDay.reduce((a, b) => (b.perDay < (a?.perDay ?? Infinity) ? b : a), null);
  if (bestDay && weakDay && weakDay.perDay < bestDay.perDay * 0.65) {
    add("dia-fraco", "media", "Vendas", `Movimentar ${weakDay.name.toLowerCase()}, o dia mais fraco`,
      `${weakDay.name} vende em média ${brl(weakDay.perDay)} por dia; ${bestDay.name.toLowerCase()} vende ${brl(bestDay.perDay)}.`,
      `Promoção só para ${weakDay.name.toLowerCase()}: hora de máquina com desconto, impressão escolar ou "traga seu currículo". Divulgue na véspera no WhatsApp.`,
      `Chegar a 80% da média de ${bestDay.name.toLowerCase()} rende cerca de ${brl((bestDay.perDay * 0.8 - weakDay.perDay) * 4)} por mês.`);
  }
  const late = hours.filter(h => h.hour >= 18).reduce((s, h) => s + h.salesCents, 0);
  const total = hours.reduce((s, h) => s + h.salesCents, 0);
  if (total && late / total < 0.05) {
    add("horario-fim-tarde", "media", "Vendas", "Aproveitar o fim da tarde e o início da manhã",
      `Depois das 18h entram só ${pct(late, total)}% das vendas. O pico é entre 10h e 13h.`,
      "Se a loja fica aberta depois das 18h, crie a \"hora feliz\" da máquina (ex.: 18h às 19h com hora mais barata) para estudantes e quem sai do trabalho. Se não compensa, ajuste o horário e economize energia.",
      "");
  }

  // 6. Máquinas ociosas: tempo de máquina é margem quase total.
  const machineMinutes = (r.byMachine || []).reduce((s, m) => s + (m.minutes || 0), 0);
  const machines = Object.keys(db.machines || {}).length;
  if (machines >= 3) {
    const capacity = machines * 8 * 60 * Math.max(1, r.goal?.workedDays || 20);
    const use = pct(machineMinutes, capacity);
    if (use < 25) add("maquinas-ociosas", "alta", "Lan house", "Encher as máquinas: pacote de horas e recarga com bônus",
      `As ${machines} máquinas foram usadas ${Math.round(machineMinutes / 60)} h no período, cerca de ${use}% do tempo disponível.`,
      "Crie recarga com bônus no cadastro de clientes (ex.: R$ 20,00 vira 5 horas; R$ 10,00 vira 2h30). Ofereça para estudantes, concurseiros e quem faz serviços on-line. Cadastre o cliente com login para ele usar o saldo sozinho.",
      "Cada máquina com 1 hora a mais por dia rende perto de R$ 130,00 por mês.");
  }

  // 7. Margem: sem custo cadastrado o lucro aparece maior que o real.
  const noCost = products.filter(p => !Number.isInteger(p.costCents));
  if (noCost.length > 20) {
    add("cadastrar-custos", "alta", "Custos", `Cadastrar o custo dos produtos mais vendidos (${noCost.length} sem custo)`,
      `${noCost.length} produtos ativos estão sem custo. Sem isso o DRE mostra lucro maior que o real e não dá para saber o que vale a pena vender.`,
      "Comece pelos 30 mais vendidos (Catálogo: filtro \"Sem custo cadastrado\"). Use a importação da nota fiscal para cadastrar custo e estoque de uma vez. Inclua o custo do papel e da tinta por página em Metas e taxas.",
      "Mostra a margem real de cada item e revela o que está sendo vendido no prejuízo.");
  }

  // 8. Estoque negativo e mercadoria parada: capital preso e estoque errado.
  const negative = products.filter(p => p.type === "stock" && p.stock < 0);
  if (negative.length) add("estoque-negativo", "media", "Estoque", `Dar entrada nas compras (${negative.length} produtos com estoque negativo)`,
    `Produtos vendidos sem entrada: ${negative.slice(0, 5).map(p => p.name).join(", ")}${negative.length > 5 ? "..." : ""}.`,
    "Importe as notas de compra no Catálogo (XML, Excel, PDF ou foto). Faça uma contagem rápida da bomboniere uma vez por semana.",
    "Estoque certo evita faltar produto que vende e comprar o que já sobra.");
  const stale = r.stock?.stale || [];
  if (stale.length >= 5) add("mercadoria-parada", "media", "Estoque", `Girar a mercadoria parada (${stale.length} itens sem venda registrada há 60 dias)`,
    `Parados: ${stale.slice(0, 6).map(s => `${s.name} (${s.stock} un.)`).join(", ")}.`,
    "Coloque perto do caixa, faça combo com serviço (ex.: impressão + água) ou preço promocional até girar. Não compre mais desses itens até acabar.",
    "Libera dinheiro parado na prateleira.");

  // 9. Taxas de cartão: sem elas o lucro fica superestimado.
  const card = (r.byMethod?.debit || 0) + (r.byMethod?.credit || 0) + (r.byMethod?.card || 0);
  const received = Object.values(r.byMethod || {}).reduce((s, v) => s + v, 0);
  if (card && !(settings.feeDebitPct || settings.feeCreditPct)) add("taxas-cartao", "media", "Custos", "Cadastrar as taxas das maquininhas",
    `${pct(card, received)}% do recebido (${brl(card)}) entrou no cartão, mas as taxas não estão cadastradas.`,
    "Em Metas e taxas, informe a taxa de débito e de crédito da maquininha. Estimule o Pix, que não tem taxa, com uma placa no caixa.",
    `Com taxa média de 2,5%, o cartão custa perto de ${brl(card * 0.025)} no período.`);

  // 10. Despesas incompletas: sem elas não existe lucro real.
  const cats = Object.keys(r.byExpenseCategory || {});
  if (cats.length < 4) add("lancar-despesas", "alta", "Custos", "Lançar todas as contas fixas do mês",
    `${cats.length ? `Só há despesa de ${cats.join(", ")} lançada no período.` : "Nenhuma despesa lançada no período."} Sem energia, internet, água, salários e fornecedores, o resultado mostrado não é o lucro de verdade.`,
    "Na aba Despesas, envie o PDF ou a foto de cada conta. Marque as fixas como mensais para repetirem sozinhas.",
    "O DRE passa a mostrar o lucro real e o ponto de equilíbrio da loja.");

  // 11. Recebíveis: fiado antigo vira prejuízo.
  const aging = r.agingBuckets || [];
  const old = aging.slice(2).reduce((s, b) => s + (b.dueCents || 0), 0);
  if (old > 0) add("cobrar-fiado", "media", "Caixa", `Cobrar os fiados com mais de 30 dias (${brl(old)})`,
    `Há ${brl(old)} em aberto há mais de 30 dias.`,
    "Em Clientes, abra \"Ver dívidas\" e use \"Cobrar no WhatsApp\". Aceite pagamento em parte. Defina limite de fiado por cliente.",
    `Recupera até ${brl(old)}.`);

  // 12. Rotina de fechamento: conferência diária evita quebra de caixa.
  add("fechamento-diario", "media", "Caixa", "Fechar o caixa todo dia e mandar o resumo no WhatsApp",
    "Com fechamento diário a diferença da gaveta aparece no mesmo dia e o dono acompanha a loja de longe.",
    "No fim do dia: Caixa e vendas, Fechar caixa, informe o valor contado e toque em \"Enviar no WhatsApp\". Abra o caixa de manhã com o troco de R$ 100,00.",
    "Controle diário do dinheiro e do resultado.");

  const order = { alta: 0, media: 1, baixa: 2 };
  return out.sort((a, b) => order[a.priority] - order[b.priority]);
}

module.exports = { suggestActions };
