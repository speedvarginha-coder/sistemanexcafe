// Toques no botão do WhatsApp do site speedfinanceira.com.br, por página e por cidade.
// O site conta sozinho (wa-clique.php, sem cookie e sem dado pessoal: só a data e o caminho da página);
// o servidor do Nexcafe lê a contagem com a chave guardada em data/wa-cliques-chave.txt.
const URL_CONTADOR = "https://speedfinanceira.com.br/wa-clique.php";

const waError = (message, status = 502) => Object.assign(new Error(message), { status });
const semAcento = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const slug = s => semAcento(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const GERAIS = "Páginas gerais (home, produtos e blog)";

// Só os guias (/guia/...) e as páginas de cidade (/financeira-<cidade>-mg.html) têm cidade.
function cidadeDoCaminho(caminho, cidades) {
  const p = String(caminho || "").toLowerCase();
  if (!p.startsWith("/guia/") && !/^\/financeira-[a-z0-9-]+-mg\.html$/.test(p)) return GERAIS;
  const achada = cidades.find(c => new RegExp(`(^|[/-])${slug(c)}([-.]|$)`).test(p));
  return achada || GERAIS;
}

function tipoDoCaminho(caminho) {
  const p = String(caminho || "");
  if (p === "/" || p === "/index.html") return "Home";
  if (p.startsWith("/guia/")) return "Guia";
  if (p.startsWith("/blog/")) return "Blog";
  if (/^\/financeira-.+-mg\.html$/.test(p)) return "Página da cidade";
  return "Página de produto";
}

// dias: { "AAAA-MM-DD": { "/caminho": toques } }. Caminhos de teste ("/__...") ficam de fora.
function resumir(dias, { cidades = [], desde = "" } = {}) {
  const porCidade = new Map(), porPagina = new Map();
  let total = 0;
  for (const [dia, paginas] of Object.entries(dias || {})) {
    if (desde && dia < desde) continue;
    for (const [caminho, n] of Object.entries(paginas || {})) {
      if (caminho.startsWith("/__") || !(n > 0)) continue;
      const cidade = cidadeDoCaminho(caminho, cidades);
      total += n;
      porCidade.set(cidade, (porCidade.get(cidade) || 0) + n);
      porPagina.set(caminho, (porPagina.get(caminho) || 0) + n);
    }
  }
  return {
    total,
    cidades: [...porCidade.entries()].map(([cidade, cliques]) => ({ cidade, cliques })).sort((a, b) => b.cliques - a.cliques),
    paginas: [...porPagina.entries()].map(([caminho, cliques]) => ({ caminho, cliques, cidade: cidadeDoCaminho(caminho, cidades), tipo: tipoDoCaminho(caminho) }))
      .sort((a, b) => b.cliques - a.cliques).slice(0, 15)
  };
}

async function lerCliques({ chave, desde, fetchImpl = fetch, now = Date.now() }) {
  if (!chave) throw waError("Contador do site sem chave (data/wa-cliques-chave.txt)", 400);
  const url = `${URL_CONTADOR}?chave=${encodeURIComponent(chave)}&desde=${encodeURIComponent(desde)}&t=${now}`;
  let response;
  try { response = await fetchImpl(url, { headers: { "cache-control": "no-cache" } }); }
  catch (cause) { throw waError(`Sem conexão com o site: ${cause.message}`); }
  if (response.status === 404) throw waError("O contador do site recusou a chave ou não está publicado (wa-clique.php)", 400);
  if (!response.ok) throw waError(`O contador do site respondeu ${response.status}`);
  const data = await response.json().catch(() => null);
  if (!data || data.ok !== true || typeof data.dias !== "object") throw waError("Resposta inesperada do contador do site");
  return data.dias;
}

module.exports = { lerCliques, resumir, cidadeDoCaminho, tipoDoCaminho, GERAIS };
