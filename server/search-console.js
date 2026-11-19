// Search Console do site speedfinanceira.com.br: buscas, aparições, cliques e posição por página.
// Usa o mesmo acesso OAuth da ficha (escopo webmasters.readonly, só leitura). O Google atrasa os dados
// em uns 3 dias, então o período vai até 3 dias atrás.
const API = "https://www.googleapis.com/webmasters/v3/sites";
const SITE = /speedfinanceira\.com\.br/;

const scError = (message, status = 502) => Object.assign(new Error(message), { status });

async function call(fetchImpl, url, accessToken, body) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: body ? "POST" : "GET", signal: AbortSignal.timeout(20000),
      headers: { authorization: `Bearer ${accessToken}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (cause) { throw scError(`Sem conexão com o Google: ${cause.message}`); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(data?.error?.message || "erro desconhecido");
    if (response.status === 403 && /insufficient|scope/i.test(message)) throw scError("Falta autorizar o Search Console: clique em Conectar de novo na conexão com a ficha", 400);
    if (/has not been used|is disabled/i.test(message)) throw scError("A Search Console API está desligada no projeto do Google Cloud", 400);
    throw scError(`Search Console respondeu ${response.status}: ${message.slice(0, 200)}`, response.status === 403 ? 400 : 502);
  }
  return data;
}

const dia = d => d.toISOString().slice(0, 10);

// Período: 28 dias terminando 3 dias atrás.
function periodo(now = new Date()) {
  const fim = new Date(now.getTime() - 3 * 86400_000);
  const inicio = new Date(fim.getTime() - 27 * 86400_000);
  return { inicio: dia(inicio), fim: dia(fim) };
}

// Junta as linhas (página + busca) por página, com as buscas que mais trouxeram aparições.
function resumir(rows, topBuscas = 8) {
  const paginas = new Map();
  for (const row of rows || []) {
    const [pagina, busca] = row.keys || [];
    if (!pagina) continue;
    const p = paginas.get(pagina) || { pagina, cliques: 0, impressoes: 0, somaPosicao: 0, buscas: [] };
    p.cliques += row.clicks || 0;
    p.impressoes += row.impressions || 0;
    p.somaPosicao += (row.position || 0) * (row.impressions || 0);
    if (busca) p.buscas.push({ busca, cliques: row.clicks || 0, impressoes: row.impressions || 0, posicao: Math.round((row.position || 0) * 10) / 10 });
    paginas.set(pagina, p);
  }
  return [...paginas.values()].map(p => ({
    pagina: p.pagina, cliques: p.cliques, impressoes: p.impressoes,
    posicao: p.impressoes ? Math.round((p.somaPosicao / p.impressoes) * 10) / 10 : null,
    ctr: p.impressoes ? Math.round((p.cliques / p.impressoes) * 1000) / 10 : 0,
    buscas: p.buscas.sort((a, b) => b.impressoes - a.impressoes || b.cliques - a.cliques).slice(0, topBuscas)
  })).sort((a, b) => b.impressoes - a.impressoes || b.cliques - a.cliques);
}

// Buscas do site inteiro, mais vistas primeiro.
function resumirBuscas(rows, limite = 30) {
  return (rows || []).map(r => ({ busca: r.keys?.[0] || "", cliques: r.clicks || 0, impressoes: r.impressions || 0, posicao: Math.round((r.position || 0) * 10) / 10 }))
    .filter(r => r.busca).sort((a, b) => b.impressoes - a.impressoes).slice(0, limite);
}

// Buscas que trouxeram clique, mais clicadas primeiro: busca de marca tem pouca impressao
// e alto CTR, ficando fora do topo por impressoes — aqui ela aparece.
function buscasComCliques(rows, limite = 15) {
  return (rows || []).map(r => ({ busca: r.keys?.[0] || "", cliques: r.clicks || 0, impressoes: r.impressions || 0, posicao: Math.round((r.position || 0) * 10) / 10 }))
    .filter(r => r.busca && r.cliques > 0).sort((a, b) => b.cliques - a.cliques || b.impressoes - a.impressoes).slice(0, limite);
}

async function lerSite({ accessToken, fetchImpl = fetch, now = new Date(), site }) {
  let siteUrl = site;
  if (!siteUrl) {
    const lista = (await call(fetchImpl, API, accessToken)).siteEntry || [];
    const achado = lista.find(s => SITE.test(s.siteUrl) && s.permissionLevel !== "siteUnverifiedUser");
    if (!achado) throw scError(`O site speedfinanceira.com.br não aparece no Search Console desta conta (sites: ${lista.map(s => s.siteUrl).join(", ") || "nenhum"})`, 404);
    siteUrl = achado.siteUrl;
  }
  const { inicio, fim } = periodo(now);
  const base = `${API}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const [porPagina, porBusca, total] = await Promise.all([
    call(fetchImpl, base, accessToken, { startDate: inicio, endDate: fim, dimensions: ["page", "query"], rowLimit: 5000 }),
    call(fetchImpl, base, accessToken, { startDate: inicio, endDate: fim, dimensions: ["query"], rowLimit: 500 }),
    call(fetchImpl, base, accessToken, { startDate: inicio, endDate: fim })
  ]);
  const t = (total.rows || [])[0] || {};
  return {
    site: siteUrl, inicio, fim,
    total: { cliques: t.clicks || 0, impressoes: t.impressions || 0, posicao: t.position ? Math.round(t.position * 10) / 10 : null },
    paginas: resumir(porPagina.rows),
    buscas: resumirBuscas(porBusca.rows),
    buscasComCliques: buscasComCliques(porBusca.rows)
  };
}

async function inspecionar(url, site, accessToken, fetchImpl) {
  const resposta = await call(fetchImpl, "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
    accessToken, { inspectionUrl: url, siteUrl: site, languageCode: "pt-BR" });
  return resposta.inspectionResult?.indexStatusResult;
}

module.exports = { inspecionar, lerSite, resumir, resumirBuscas, buscasComCliques, periodo };
