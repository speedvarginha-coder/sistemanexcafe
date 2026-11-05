// search_console.js — Buscas do site no Google (Search Console): aparições, cliques e posição por página.
// Dados de /api/marketing/search-console (server/search-console.js), lidos uma vez por dia pelo servidor.

const ScState = { dados: null, ocupado: false, mensagem: '', filtro: 'blog' };
const scNum = n => Number(n || 0).toLocaleString('pt-BR');
const scCaminho = url => { try { return decodeURIComponent(new URL(url).pathname); } catch { return url; } };

function scStatus(texto, classe) {
  const el = document.getElementById('scStatus');
  if (el) { el.textContent = texto; el.className = `status-badge text-[10px] whitespace-nowrap ${classe}`; }
}

function scLinhaPagina(p) {
  const buscas = p.buscas.length
    ? `<details><summary class="cursor-pointer text-green-800 font-semibold">${p.buscas.length} buscas</summary><ul class="mt-1 space-y-0.5">${p.buscas.map(b => `<li>${escaparHtml(b.busca)} <span class="text-gray-500">(${scNum(b.impressoes)} aparições, ${scNum(b.cliques)} cliques, posição ${b.posicao})</span></li>`).join('')}</ul></details>`
    : '<span class="text-gray-500">sem buscas identificadas</span>';
  return `<tr><td><a href="${escaparHtml(p.pagina)}" target="_blank" rel="noopener noreferrer">${escaparHtml(scCaminho(p.pagina))}</a><div class="text-[11px] mt-1">${buscas}</div></td>
    <td class="text-center">${scNum(p.impressoes)}</td><td class="text-center">${scNum(p.cliques)}</td><td class="text-center">${p.ctr}%</td><td class="text-center">${p.posicao ?? '-'}</td></tr>`;
}

function renderSc() {
  const conteudo = document.getElementById('scConteudo');
  const d = ScState.dados;
  if (!conteudo || !d) return;
  const mensagem = ScState.mensagem ? `<p class="geogrid-mensagem">${escaparHtml(ScState.mensagem)}</p>` : '';
  const erro = d.lastError ? `<p class="geogrid-erro">Última leitura (${new Date(d.lastError.at).toLocaleString('pt-BR')}) falhou: ${escaparHtml(d.lastError.message)}</p>` : '';
  const botao = `<button type="button" data-sc="atualizar" class="gmb-btn-primario" ${ScState.ocupado || !d.connected ? 'disabled' : ''}>${ScState.ocupado ? 'Lendo...' : 'Atualizar agora'}</button>`;
  if (!d.connected) { scStatus('Sem conexão', 'bg-gray-100 text-gray-700'); conteudo.innerHTML = '<p class="text-[11px] text-gray-600">Conecte a ficha no cartão de conexão para o servidor ler o Search Console.</p>'; return; }
  if (!d.dados) {
    scStatus(d.lastError ? 'Falta autorizar' : 'Ainda não lido', 'bg-yellow-100 text-yellow-800');
    conteudo.innerHTML = `<p class="text-[11px] text-gray-600 mb-2">O servidor lê o Search Console uma vez por dia. Se aparecer erro de autorização, clique em <strong>Conectar de novo</strong> no cartão de conexão e aceite também o acesso de leitura do Search Console.</p>${botao}${mensagem}${erro}`;
    return;
  }
  const s = d.dados;
  scStatus(`${scNum(s.total.cliques)} cliques`, 'bg-green-100 text-green-800');
  const filtro = ScState.filtro;
  const paginas = s.paginas.filter(p => filtro === 'todas' || scCaminho(p.pagina).startsWith(`/${filtro}/`));
  const abas = [['blog', 'Blog'], ['guia', 'Guias'], ['todas', 'Todas']].map(([id, nome]) => `<button type="button" data-sc-filtro="${id}" class="geogrid-aba ${filtro === id ? 'geogrid-aba-ativa' : ''}">${nome}</button>`).join(' ');
  conteudo.innerHTML = `
    <div class="ficha-topo">
      <div><p class="text-3xl font-black text-green-800 leading-none">${scNum(s.total.impressoes)}</p><p class="text-[11px] text-gray-600 mt-1">aparições na busca</p></div>
      <div><p class="text-3xl font-black text-green-800 leading-none">${scNum(s.total.cliques)}</p><p class="text-[11px] text-gray-600 mt-1">cliques para o site</p></div>
      <div><p class="text-3xl font-black text-green-800 leading-none">${s.total.posicao ?? '-'}</p><p class="text-[11px] text-gray-600 mt-1">posição média</p></div>
      <div class="text-[11px] text-gray-600"><p>Período: ${new Date(s.inicio + 'T12:00').toLocaleDateString('pt-BR')} a ${new Date(s.fim + 'T12:00').toLocaleDateString('pt-BR')} (o Google atrasa uns 3 dias).</p><p>Lido em ${new Date(s.at).toLocaleString('pt-BR')}.</p></div>
      <div class="ml-auto">${botao}</div>
    </div>
    ${mensagem}${erro}
    <p class="ficha-subtitulo">Páginas por aparições</p>
    <div class="flex gap-2 mb-2">${abas}</div>
    ${paginas.length ? `<table class="ficha-tabela"><thead><tr><th>Página e buscas que a trouxeram</th><th>Aparições</th><th>Cliques</th><th>CTR</th><th>Posição</th></tr></thead><tbody>${paginas.slice(0, 40).map(scLinhaPagina).join('')}</tbody></table>` : '<p class="text-[11px] text-gray-500">Nenhuma página deste grupo apareceu na busca no período.</p>'}
    <details class="mt-3"><summary class="ficha-subtitulo cursor-pointer">Buscas que mais mostraram o site (${s.buscas.length})</summary>
      <table class="ficha-tabela mt-1"><thead><tr><th>Busca</th><th>Aparições</th><th>Cliques</th><th>Posição</th></tr></thead><tbody>${s.buscas.map(b => `<tr><td>${escaparHtml(b.busca)}</td><td class="text-center">${scNum(b.impressoes)}</td><td class="text-center">${scNum(b.cliques)}</td><td class="text-center">${b.posicao}</td></tr>`).join('')}</tbody></table>
    </details>
    <p class="text-[10px] text-gray-500 mt-2">Posição média: 1 é o primeiro resultado; abaixo de 10 costuma ser a primeira página. CTR é a parte das aparições que virou clique.</p>`;
}

async function carregarSc() {
  const conteudo = document.getElementById('scConteudo');
  if (!conteudo) return;
  try { ScState.dados = (await geogridApi('/api/marketing/search-console')).sc; renderSc(); }
  catch {
    scStatus('Indisponível', 'bg-gray-100 text-gray-700');
    conteudo.innerHTML = '<p class="results-empty">O Search Console funciona com o painel aberto pelo Nexcafe (Speed Marketing), logado como administrador.</p>';
  }
}

function setupSc() {
  const painel = document.getElementById('scPainel');
  if (!painel || painel.dataset.pronto) return;
  painel.dataset.pronto = '1';
  painel.addEventListener('click', async ev => {
    const aba = ev.target.closest('[data-sc-filtro]');
    if (aba) { ScState.filtro = aba.dataset.scFiltro; renderSc(); return; }
    const botao = ev.target.closest('[data-sc="atualizar"]');
    if (!botao || ScState.ocupado) return;
    ScState.ocupado = true; ScState.mensagem = ''; renderSc();
    try { ScState.dados = (await geogridApi('/api/marketing/search-console/run', {})).sc; mostrarToast('Search Console lido.'); }
    catch (erro) { ScState.mensagem = `${erro.message}.`; try { ScState.dados = (await geogridApi('/api/marketing/search-console')).sc; } catch { } }
    finally { ScState.ocupado = false; renderSc(); }
  });
}

document.addEventListener('DOMContentLoaded', () => { setupSc(); carregarSc(); });
