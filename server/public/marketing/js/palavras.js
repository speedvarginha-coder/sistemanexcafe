// palavras.js — Aba "Palavras-chave": buscas reais (ficha e site) e estudo de volume (data_palavras.js).
// Buscas reais vêm de /api/marketing/ficha-saude e /api/marketing/search-console, lidas pelo servidor.

const PalavrasState = { ficha: null, site: null, erroFicha: '', erroSite: '' };
const palNum = n => (n === null || n === undefined || n === '') ? '-' : Number(n).toLocaleString('pt-BR');
const palChave = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const PAL_PRODUTOS = ['INSS', 'CLT', 'Portabilidade e refin', 'FGTS', 'Veículos', 'Garantia', 'Marca e loja', 'Cidades da região'];

function palEstudo() { return (window.SPEED_PALAVRAS && window.SPEED_PALAVRAS.termos) || []; }

function palIndice() {
  const mapa = new Map();
  for (const t of palEstudo()) mapa.set(palChave(t.termo), t);
  return mapa;
}

function palStatus(id, texto, classe) {
  const el = document.getElementById(id);
  if (el) { el.textContent = texto; el.className = `status-badge text-[10px] whitespace-nowrap ${classe}`; }
}

function palBarra(valor, maximo) {
  const largura = maximo ? Math.max(3, Math.round((valor / maximo) * 100)) : 0;
  return `<span class="palavras-barra"><span style="width:${largura}%"></span></span>`;
}

function renderPalavrasFicha() {
  const alvo = document.getElementById('palavrasFicha');
  if (!alvo) return;
  const d = PalavrasState.ficha;
  if (PalavrasState.erroFicha) { palStatus('palavrasFichaStatus', 'Indisponível', 'bg-gray-100 text-gray-700'); alvo.innerHTML = `<p class="results-empty">${escaparHtml(PalavrasState.erroFicha)}</p>`; return; }
  if (!d) return;
  const lista = d.health?.keywords || [];
  if (!d.connected || !lista.length) {
    palStatus('palavrasFichaStatus', d.connected ? 'Sem termos ainda' : 'Sem conexão', 'bg-yellow-100 text-yellow-800');
    alvo.innerHTML = `<p class="results-empty">${d.connected ? 'A ficha ainda não foi conferida com os termos de busca. Use "Conferir agora" em Google > Saúde da ficha.' : 'Conecte a ficha na aba Google para ver o que as pessoas digitam.'}</p>`;
    return;
  }
  palStatus('palavrasFichaStatus', `${lista.length} termos`, 'bg-green-100 text-green-800');
  const indice = palIndice(), maximo = Math.max(...lista.map(k => k.count));
  const linhas = lista.map(k => {
    const estudo = indice.get(palChave(k.term));
    const marca = estudo ? `<span class="text-gray-500">MG: ${palNum(estudo.mg)}/mês</span>` : '<span class="palavras-fora">fora do estudo</span>';
    return `<tr><td>${escaparHtml(k.term)}<div class="text-[10px]">${marca}</div></td><td class="w-1/3">${palBarra(k.count, maximo)}</td><td class="text-right whitespace-nowrap font-bold">${k.approx ? 'menos de ' : ''}${palNum(k.count)}</td></tr>`;
  }).join('');
  const fora = lista.filter(k => !indice.has(palChave(k.term))).length;
  alvo.innerHTML = `<table class="ficha-tabela"><thead><tr><th>Termo</th><th></th><th class="text-right">Pessoas</th></tr></thead><tbody>${linhas}</tbody></table>
    <p class="text-[10px] text-gray-500 mt-2">Conferida em ${new Date(d.health.at).toLocaleDateString('pt-BR')}. ${fora ? `${fora} termos reais não estão no estudo de volume: são buscas que o estudo não previu e valem pauta.` : ''} O Google não informa números abaixo de 15.</p>`;
}

function renderPalavrasSite() {
  const alvo = document.getElementById('palavrasSite');
  if (!alvo) return;
  const d = PalavrasState.site;
  if (PalavrasState.erroSite) { palStatus('palavrasSiteStatus', 'Indisponível', 'bg-gray-100 text-gray-700'); alvo.innerHTML = `<p class="results-empty">${escaparHtml(PalavrasState.erroSite)}</p>`; return; }
  if (!d) return;
  if (!d.dados) {
    palStatus('palavrasSiteStatus', d.connected ? 'Falta autorizar' : 'Sem conexão', 'bg-yellow-100 text-yellow-800');
    const ocupado = PalavrasState.ocupado ? 'disabled' : '';
    alvo.innerHTML = `<div class="palavras-autorizar">
      <div class="palavras-autorizar-icone"><i class="fas fa-key"></i></div>
      <div>
        <p class="palavras-autorizar-titulo">Falta um passo: liberar a leitura do Search Console</p>
        <p class="text-[11px] text-gray-600 mt-1">A conta Google já está ligada à ficha, mas ainda não deu permissão para o Nexcafe ler as buscas do site. Leva menos de um minuto:</p>
        <ol class="palavras-passos">
          <li>Clique em <strong>Autorizar no Google</strong>. Abre uma aba do Google.</li>
          <li>Entre com a conta que administra a ficha e o site.</li>
          <li>Marque a caixa <strong>Ver os dados do Search Console</strong> e confirme.</li>
          <li>Volte aqui. As buscas aparecem sozinhas em alguns segundos.</li>
        </ol>
        <div class="flex flex-wrap gap-2 mt-3">
          <button type="button" data-palavras="autorizar" class="gmb-btn-primario" ${ocupado}>Autorizar no Google</button>
          <button type="button" data-palavras="conferir" class="palavras-btn-secundario" ${ocupado}>${PalavrasState.ocupado ? 'Conferindo...' : 'Já autorizei, conferir'}</button>
        </div>
        ${PalavrasState.mensagem ? `<p class="palavras-autorizar-msg">${escaparHtml(PalavrasState.mensagem)}</p>` : ''}
      </div>
    </div>`;
    return;
  }
  const buscas = [...(d.dados.buscas || [])].sort((a, b) => b.impressoes - a.impressoes).slice(0, 30);
  palStatus('palavrasSiteStatus', `${buscas.length} buscas`, 'bg-green-100 text-green-800');
  if (!buscas.length) { alvo.innerHTML = '<p class="results-empty">Nenhuma busca no período lido.</p>'; return; }
  const maximo = buscas[0].impressoes;
  alvo.innerHTML = `<table class="ficha-tabela"><thead><tr><th>Busca</th><th></th><th class="text-right">Aparições</th><th class="text-right">Cliques</th><th class="text-right">Posição</th></tr></thead><tbody>${buscas.map(b => `<tr><td>${escaparHtml(b.busca)}</td><td class="w-1/4">${palBarra(b.impressoes, maximo)}</td><td class="text-right">${palNum(b.impressoes)}</td><td class="text-right">${palNum(b.cliques)}</td><td class="text-right">${b.posicao ?? '-'}</td></tr>`).join('')}</tbody></table>
    <p class="text-[10px] text-gray-500 mt-2">Período: ${new Date(d.dados.inicio + 'T12:00').toLocaleDateString('pt-BR')} a ${new Date(d.dados.fim + 'T12:00').toLocaleDateString('pt-BR')}. Posição 1 é o primeiro resultado.</p>`;
}

function renderPalavrasDestaques() {
  const alvo = document.getElementById('palavrasDestaques');
  if (!alvo) return;
  alvo.innerHTML = PAL_PRODUTOS.map(produto => {
    const top = palEstudo().filter(t => t.produto === produto && t.mg).sort((a, b) => b.mg - a.mg).slice(0, 3);
    if (!top.length) return '';
    return `<div class="palavras-destaque"><p class="ficha-subtitulo mt-0">${escaparHtml(produto)}</p><ol>${top.map(t => `<li><span>${escaparHtml(t.termo)}</span><strong>${palNum(t.mg)}</strong></li>`).join('')}</ol></div>`;
  }).join('');
}

function renderPalavrasTabela() {
  const corpo = document.getElementById('palavrasTabela');
  if (!corpo) return;
  const busca = palChave(document.getElementById('palavrasBusca').value);
  const produto = document.getElementById('palavrasProduto').value;
  const intencao = document.getElementById('palavrasIntencao').value;
  const ordem = document.getElementById('palavrasOrdem').value;
  const maxima = document.getElementById('palavrasMaxima').checked;
  const lista = palEstudo().filter(t => (!busca || palChave(t.termo).includes(busca)) && (!produto || t.produto === produto) && (!intencao || t.intencao === intencao) && (!maxima || t.prioridade === 'Máxima'));
  const valor = t => ordem === 'cpc' ? (t.cpcMax || 0) : (t[ordem] || 0);
  lista.sort((a, b) => ordem === 'termo' ? a.termo.localeCompare(b.termo, 'pt-BR') : valor(b) - valor(a) || a.termo.localeCompare(b.termo, 'pt-BR'));
  document.getElementById('palavrasContagem').textContent = `${lista.length} de ${palEstudo().length} palavras`;
  const cpc = t => t.cpcMax ? `R$ ${t.cpcMin?.toFixed(2).replace('.', ',') ?? '-'} a ${t.cpcMax.toFixed(2).replace('.', ',')}` : '-';
  corpo.innerHTML = lista.map(t => `<tr>
    <td class="font-semibold">${escaparHtml(t.termo)}${t.tendencia ? ` <span class="palavras-tendencia" title="Variação em 12 meses no Keyword Planner">${escaparHtml(t.tendencia)}</span>` : ''}</td>
    <td>${escaparHtml(t.produto)}</td><td>${escaparHtml(t.intencao || '-')}</td>
    <td class="text-right">${palNum(t.brasil)}</td><td class="text-right font-bold">${palNum(t.mg)}</td><td class="text-right">${palNum(t.regiao)}</td>
    <td class="whitespace-nowrap">${escaparHtml(t.faixaVarginha || '-')}</td><td class="text-right whitespace-nowrap">${cpc(t)}</td>
    <td>${escaparHtml(t.concorrencia || '-')}</td><td>${escaparHtml(t.prioridade || '-')}</td></tr>`).join('') || '<tr><td colspan="10" class="text-center text-gray-500 py-4">Nenhuma palavra com esses filtros.</td></tr>';
}

function filtrarProdutoRapido(produto) {
  const sel = document.getElementById('palavrasProduto');
  if (sel) {
    sel.value = produto;
    renderPalavrasTabela();
    document.querySelectorAll('.pal-quick-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.prod === produto);
    });
  }
}

function copiarPalavrasFiltradas() {
  const busca = palChave(document.getElementById('palavrasBusca').value);
  const produto = document.getElementById('palavrasProduto').value;
  const intencao = document.getElementById('palavrasIntencao').value;
  const maxima = document.getElementById('palavrasMaxima').checked;
  const lista = palEstudo().filter(t => (!busca || palChave(t.termo).includes(busca)) && (!produto || t.produto === produto) && (!intencao || t.intencao === intencao) && (!maxima || t.prioridade === 'Máxima'));
  if (!lista.length) { mostrarToast('Nenhuma palavra encontrada com esses filtros.', 'erro'); return; }
  const texto = lista.map(t => `${t.termo}\t${t.mg || 0}\t${t.produto || ''}`).join('\n');
  copiarTexto(texto, `${lista.length} palavras copiadas para a área de transferência!`);
}

function renderPalavrasResumo() {
  const alvo = document.getElementById('palavrasResumo');
  if (!alvo) return;
  const ficha = PalavrasState.ficha?.health?.keywords?.[0];
  const estudo = [...palEstudo()].sort((a, b) => (b.mg || 0) - (a.mg || 0))[0];
  const site = PalavrasState.site?.dados?.buscas?.length ? [...PalavrasState.site.dados.buscas].sort((a, b) => b.impressoes - a.impressoes)[0] : null;
  const item = (rotulo, termo, detalhe) => `<div><p>${rotulo}</p><strong>${termo ? escaparHtml(termo) : '-'}</strong><span>${detalhe}</span></div>`;
  alvo.innerHTML = item('Mais digitada na ficha', ficha?.term, ficha ? `${palNum(ficha.count)} pessoas em 3 meses` : 'aguardando a ficha')
    + item('Mais vista no site', site?.busca, site ? `${palNum(site.impressoes)} aparições` : 'Search Console sem leitura')
    + item('Maior volume em MG', estudo?.termo, estudo ? `${palNum(estudo.mg)} buscas por mês` : '')
    + item('Palavras no estudo', String(palEstudo().length), `${palEstudo().filter(t => t.prioridade === 'Máxima').length} com prioridade máxima`);
}

function setupPalavras() {
  if (!document.getElementById('tab-palavras')) return;
  const opcoes = (id, valores, todos) => { document.getElementById(id).innerHTML = `<option value="">${todos}</option>` + valores.map(v => `<option>${escaparHtml(v)}</option>`).join(''); };
  opcoes('palavrasProduto', PAL_PRODUTOS.filter(p => palEstudo().some(t => t.produto === p)), 'Todos');
  opcoes('palavrasIntencao', [...new Set(palEstudo().map(t => t.intencao).filter(Boolean))].sort(), 'Todas');
  ['palavrasBusca', 'palavrasProduto', 'palavrasIntencao', 'palavrasOrdem', 'palavrasMaxima'].forEach(id => document.getElementById(id).addEventListener('input', renderPalavrasTabela));
  const f = window.SPEED_PALAVRAS?.fontes;
  if (f) document.getElementById('palavrasFonte').textContent = `${palEstudo().length} palavras. Fontes: ${f.volumes}; ${f.planner}.`;
  renderPalavrasDestaques(); renderPalavrasTabela(); renderPalavrasResumo();
}

async function carregarPalavras() {
  if (!document.getElementById('tab-palavras')) return;
  const semServidor = 'Abra o painel pelo Nexcafe (Speed Marketing), logado como administrador, para ver as buscas reais.';
  await Promise.all([
    geogridApi('/api/marketing/ficha-saude').then(r => { PalavrasState.ficha = r.ficha; }).catch(() => { PalavrasState.erroFicha = semServidor; }),
    geogridApi('/api/marketing/search-console').then(r => { PalavrasState.site = r.sc; }).catch(() => { PalavrasState.erroSite = semServidor; })
  ]);
  renderPalavrasFicha(); renderPalavrasSite(); renderPalavrasResumo();
}

// Autorizar o Search Console: o mesmo pedido de "Conectar de novo" da aba Google, que agora inclui a leitura do Search Console.
async function palavrasAcao(acao) {
  if (PalavrasState.ocupado) return;
  if (acao === 'autorizar') {
    const janela = window.open('', '_blank'); // abre antes do await: o navegador bloqueia janela aberta depois
    try {
      const resposta = await geogridApi('/api/marketing/gmb-api/connect', {});
      if (janela) janela.location = resposta.url; else window.location.href = resposta.url;
      PalavrasState.mensagem = 'Autorize na aba do Google que abriu. Quando voltar, as buscas são conferidas sozinhas.';
      PalavrasState.aguardando = true;
    } catch (erro) { if (janela) janela.close(); PalavrasState.mensagem = `${erro.message}.`; }
    renderPalavrasSite();
    return;
  }
  PalavrasState.ocupado = true; PalavrasState.mensagem = ''; renderPalavrasSite();
  try {
    PalavrasState.site = (await geogridApi('/api/marketing/search-console/run', {})).sc;
    PalavrasState.aguardando = false;
  } catch (erro) {
    PalavrasState.mensagem = /autoriz|scope|permiss/i.test(erro.message) ? 'O Google ainda não liberou a leitura. Confira se marcou a caixa do Search Console na tela de autorização.' : `${erro.message}.`;
    try { PalavrasState.site = (await geogridApi('/api/marketing/search-console')).sc; } catch { }
  }
  PalavrasState.ocupado = false;
  renderPalavrasSite(); renderPalavrasResumo();
}

document.addEventListener('DOMContentLoaded', () => {
  setupPalavras(); carregarPalavras();
  document.getElementById('palavrasSite')?.addEventListener('click', ev => { const botao = ev.target.closest('[data-palavras]'); if (botao) palavrasAcao(botao.dataset.palavras); });
  // Volta da aba do Google: o servidor já leu o Search Console ao receber a autorização.
  window.addEventListener('focus', () => {
    if (!PalavrasState.aguardando || PalavrasState.ocupado) return;
    setTimeout(async () => {
      try { PalavrasState.site = (await geogridApi('/api/marketing/search-console')).sc; } catch { return; }
      if (PalavrasState.site?.dados) { PalavrasState.aguardando = false; PalavrasState.mensagem = ''; }
      renderPalavrasSite(); renderPalavrasResumo();
    }, 4000);
  });
});
