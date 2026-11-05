// geogrid.js — GeoGrid da ficha no Google (Raio-X Local)
// Dados vêm do servidor do Nexcafe (/api/marketing/geogrid), que mede pela Places API.

const GeoGridState = { dados: null, termo: 0, medicao: null, editandoChave: false, ocupado: false, mensagem: '' };

async function geogridApi(rota, corpo) {
  const resposta = await fetch(rota, corpo === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok || !dados.ok) throw Object.assign(new Error(dados.error || `Erro ${resposta.status}`), { dados });
  return dados;
}

function geogridData(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function geogridCor(rank) {
  if (!rank) return 'geogrid-fora';
  if (rank <= 3) return 'geogrid-top';
  if (rank <= 10) return 'geogrid-meio';
  return 'geogrid-baixo';
}

function geogridStatus(texto, classe) {
  const el = document.getElementById('geogridStatus');
  if (el) { el.textContent = texto; el.className = `status-badge text-[10px] whitespace-nowrap ${classe}`; }
}

function geogridFormularioChave(dados) {
  return `
    <form id="geogridChaveForm" class="geogrid-config" autocomplete="off">
      <label for="geogridChave" class="text-xs font-bold text-gray-700">Chave da API do Google${dados.configured ? ` (atual termina em ${escaparHtml(dados.keyHint)})` : ''}</label>
      <div class="flex flex-wrap gap-2 mt-1">
        <input id="geogridChave" type="password" class="art-input" style="max-width: 26rem" placeholder="Cole aqui a chave criada no Google Cloud" required>
        <button type="submit" class="gmb-btn-primario" ${GeoGridState.ocupado ? 'disabled' : ''}>Salvar e conferir</button>
        ${dados.configured ? '<button type="button" data-geogrid="cancelar" class="gmb-btn-link">Cancelar</button>' : ''}
      </div>
      <p class="text-[11px] text-gray-500 mt-1">A chave fica só no servidor do Nexcafe e nunca volta para a tela. Ao salvar, o sistema busca a ficha da Speed Financeira para confirmar que a chave funciona.</p>
    </form>`;
}

function geogridInstrucoes() {
  return `
    <ol class="geogrid-passos">
      <li>No <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud</a>, crie um projeto e ative uma conta de faturamento. O Google exige o faturamento ativo mesmo para o uso gratuito.</li>
      <li>Em APIs e serviços, ative a <strong>Places API (New)</strong>.</li>
      <li>Em Credenciais, crie uma chave de API e restrinja a chave à Places API (New).</li>
      <li>Cole a chave abaixo.</li>
    </ol>
    <p class="text-[11px] text-gray-600 mb-3">Custo esperado: zero. As 100 buscas de cada medição pedem só o identificador das empresas, que o Google não cobra. Os nomes dos concorrentes usam poucas buscas por medição, dentro da cota gratuita mensal.</p>`;
}

function geogridMapa(run, item) {
  const n = run.size;
  const celulas = [...item.cells].sort((a, b) => a.row - b.row || a.col - b.col).map(c => {
    const lider = c.leader && c.rank !== 1 ? run.names[c.leader] || 'concorrente' : '';
    const centro = c.row === (n - 1) / 2 && c.col === (n - 1) / 2;
    const dica = `${c.rank ? `${c.rank}º lugar` : 'Fora dos 20 primeiros'}${lider ? ` • 1º: ${lider}` : ''} • ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`;
    return `<span class="geogrid-celula ${geogridCor(c.rank)} ${centro ? 'geogrid-centro' : ''}" title="${escaparHtml(dica)}">${c.rank ? c.rank : '20+'}</span>`;
  }).join('');
  return `
    <div class="geogrid-mapa-wrap">
      <span class="geogrid-rosa geogrid-n">N</span>
      <div class="geogrid-mapa" style="grid-template-columns: repeat(${n}, minmax(0, 1fr))" aria-label="Posição da ficha em cada ponto da grade">${celulas}</div>
      <span class="geogrid-rosa geogrid-s">S</span>
    </div>
    <div class="geogrid-legenda">
      <span><i class="geogrid-top"></i>1º a 3º</span><span><i class="geogrid-meio"></i>4º a 10º</span><span><i class="geogrid-baixo"></i>11º a 20º</span><span><i class="geogrid-fora"></i>fora dos 20</span><span>Borda escura = loja</span>
    </div>`;
}

function geogridNumeros(run, item, anterior) {
  const total = item.cells.length;
  const antes = anterior?.terms.find(t => t.term === item.term);
  const delta = antes ? +(item.average - antes.average).toFixed(1) : null;
  const variacao = delta === null ? '' : delta === 0 ? '<small>igual à anterior</small>'
    : `<small class="${delta < 0 ? 'geogrid-melhorou' : 'geogrid-piorou'}">${delta < 0 ? 'melhorou' : 'piorou'} ${Math.abs(delta).toLocaleString('pt-BR')} desde ${geogridData(anterior.at)}</small>`;
  const lideres = item.leaders.length
    ? item.leaders.map(l => `<li><strong>${escaparHtml(run.names[l.id] || 'Concorrente sem nome')}</strong> em 1º em ${l.count} de ${total} pontos</li>`).join('')
    : '<li>A Speed lidera em todos os pontos.</li>';
  return `
    <div class="geogrid-numeros">
      <div><span>Posição média</span><strong>${item.average.toLocaleString('pt-BR')}º</strong>${variacao}</div>
      <div><span>Visibilidade (top 3)</span><strong>${Math.round(item.top3 / total * 100)}%</strong><small>${item.top3} de ${total} pontos</small></div>
      <div><span>Aparece entre os 20</span><strong>${item.found} de ${total}</strong></div>
    </div>
    ${geogridConcorrentes(run, item)}
    <p class="text-xs font-bold text-gray-700 mt-3 mb-1">Quem fica em 1º onde a Speed não está</p>
    <ul class="geogrid-lideres">${lideres}</ul>
    <p class="text-[11px] text-gray-500 mt-2">Média com "fora dos 20" contado como 21º. O cliente vê no mapa só os 3 primeiros. Visibilidade é a parte dos pontos em que a empresa aparece entre os 3.</p>`;
}

// Disputa do top 3: Speed e concorrentes lado a lado (medições a partir de 05/11/2026 trazem esses dados).
function geogridConcorrentes(run, item) {
  const total = item.cells.length;
  if (!item.competitors) return '<p class="text-[11px] text-gray-500 mt-3">Meça de novo para ver a visibilidade de cada concorrente.</p>';
  const speed = { nome: 'Speed Financeira', visibilidade: Math.round(item.top3 / total * 100), top3: item.top3, media: item.average, speed: true };
  const linhas = [speed, ...item.competitors.map(c => ({ nome: run.names[c.id] || 'Concorrente sem nome', visibilidade: c.visibility, top3: c.top3, media: c.average }))]
    .sort((a, b) => b.visibilidade - a.visibilidade || a.media - b.media);
  return `<p class="text-xs font-bold text-gray-700 mt-3 mb-1">Quem divide o top 3 neste termo</p>
    <table class="ficha-tabela"><thead><tr><th>Empresa</th><th>Visibilidade</th><th>Pontos no top 3</th><th>Posição média</th></tr></thead><tbody>
    ${linhas.map(l => `<tr${l.speed ? ' style="background:#f0fdf4;font-weight:700"' : ''}><td>${escaparHtml(l.nome)}</td><td class="text-center">${l.visibilidade}%</td><td class="text-center">${l.top3} de ${total}</td><td class="text-center">${l.media.toLocaleString('pt-BR')}º</td></tr>`).join('')}
    </tbody></table>`;
}

function renderGeogrid() {
  const conteudo = document.getElementById('geogridConteudo');
  if (!conteudo) return;
  const dados = GeoGridState.dados;
  if (!dados) return;
  const mensagem = GeoGridState.mensagem ? `<p class="geogrid-mensagem">${escaparHtml(GeoGridState.mensagem)}</p>` : '';
  const erro = dados.lastError ? `<p class="geogrid-erro">Última tentativa (${geogridData(dados.lastError.at)}) falhou: ${escaparHtml(dados.lastError.message)}</p>` : '';

  if (!dados.configured) {
    geogridStatus('A configurar', 'bg-yellow-100 text-yellow-800');
    conteudo.innerHTML = geogridInstrucoes() + geogridFormularioChave(dados) + mensagem + erro;
    return;
  }

  const runs = dados.runs || [];
  const run = runs.find(r => r.at === GeoGridState.medicao) || runs.at(-1);
  if (GeoGridState.ocupado) geogridStatus('Medindo...', 'bg-yellow-100 text-yellow-800');
  else if (run) geogridStatus(`Medido em ${geogridData(run.at)}`, 'bg-green-100 text-green-800');
  else geogridStatus('Sem medição', 'bg-yellow-100 text-yellow-800');

  const topo = `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <p class="text-[11px] text-gray-600"><strong>Ficha:</strong> ${escaparHtml(dados.placeName)} • ${escaparHtml(dados.placeAddress)}</p>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" data-geogrid="medir" class="gmb-btn-primario" ${GeoGridState.ocupado ? 'disabled' : ''}>${GeoGridState.ocupado ? 'Medindo, aguarde...' : 'Medir agora'}</button>
        <button type="button" data-geogrid="trocar" class="gmb-btn-link">Trocar chave</button>
        <button type="button" data-geogrid="remover" class="gmb-btn-link gmb-btn-perigo">Remover chave</button>
      </div>
    </div>`;
  const chave = GeoGridState.editandoChave ? geogridFormularioChave(dados) : '';

  if (!run) {
    conteudo.innerHTML = topo + chave + mensagem + erro + '<p class="results-empty">Nenhuma medição ainda. Clique em Medir agora: leva cerca de meio minuto. Depois disso o sistema mede sozinho a cada 30 dias.</p>';
    return;
  }

  const termo = Math.min(GeoGridState.termo, run.terms.length - 1);
  const item = run.terms[termo];
  const indice = runs.indexOf(run);
  const anterior = indice > 0 ? runs[indice - 1] : null;
  const abas = run.terms.map((t, i) => `<button type="button" data-geogrid-termo="${i}" class="geogrid-aba ${i === termo ? 'geogrid-aba-ativa' : ''}">${escaparHtml(t.term)}</button>`).join('');
  const historico = runs.length > 1 ? `<label class="text-[11px] font-bold text-gray-600">Medição <select id="geogridMedicao" class="art-input" style="width:auto;display:inline-block;padding:.25rem .5rem;font-size:.75rem">${[...runs].reverse().map(r => `<option value="${escaparHtml(r.at)}" ${r === run ? 'selected' : ''}>${geogridData(r.at)}${r.trigger === 'automatica' ? ' (automática)' : ''}</option>`).join('')}</select></label>` : '';

  conteudo.innerHTML = topo + chave + mensagem + erro + `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3"><div class="flex flex-wrap gap-1.5">${abas}</div>${historico}</div>
    <div class="geogrid-corpo">
      <div>${geogridMapa(run, item)}</div>
      <div>${geogridNumeros(run, item, anterior)}</div>
    </div>`;
}

async function carregarGeogrid() {
  const conteudo = document.getElementById('geogridConteudo');
  if (!conteudo) return;
  try {
    GeoGridState.dados = (await geogridApi('/api/marketing/geogrid')).geogrid;
    renderGeogrid();
  } catch {
    geogridStatus('Indisponível', 'bg-gray-100 text-gray-700');
    conteudo.innerHTML = '<p class="results-empty">O GeoGrid funciona com o painel aberto pelo Nexcafe (Speed Marketing), logado como administrador.</p>';
  }
}

async function geogridAcao(executar, sucesso) {
  GeoGridState.ocupado = true;
  GeoGridState.mensagem = '';
  renderGeogrid();
  try {
    GeoGridState.dados = (await executar()).geogrid;
    GeoGridState.mensagem = '';
    if (sucesso) mostrarToast(sucesso);
    return true;
  } catch (erro) {
    const candidatos = erro.dados?.candidates?.length ? ` Encontradas: ${erro.dados.candidates.map(c => c.name).join(', ')}.` : '';
    GeoGridState.mensagem = `${erro.message}.${candidatos}`;
    try { GeoGridState.dados = (await geogridApi('/api/marketing/geogrid')).geogrid; } catch { }
    return false;
  } finally {
    GeoGridState.ocupado = false;
    renderGeogrid();
  }
}

function setupGeogrid() {
  const painel = document.getElementById('geogridPainel');
  if (!painel || painel.dataset.pronto) return;
  painel.dataset.pronto = '1';
  painel.addEventListener('submit', async ev => {
    if (ev.target.id !== 'geogridChaveForm') return;
    ev.preventDefault();
    const key = document.getElementById('geogridChave').value.trim();
    if (!key) return;
    const ok = await geogridAcao(() => geogridApi('/api/marketing/geogrid/config', { key }), 'Chave salva e ficha encontrada.');
    if (ok) { GeoGridState.editandoChave = false; renderGeogrid(); }
  });
  painel.addEventListener('click', async ev => {
    const aba = ev.target.closest('[data-geogrid-termo]');
    if (aba) { GeoGridState.termo = Number(aba.dataset.geogridTermo); renderGeogrid(); return; }
    const botao = ev.target.closest('[data-geogrid]');
    if (!botao || GeoGridState.ocupado) return;
    const acao = botao.dataset.geogrid;
    if (acao === 'medir') {
      GeoGridState.medicao = null;
      await geogridAcao(() => geogridApi('/api/marketing/geogrid/run', {}), 'Medição concluída.');
    } else if (acao === 'trocar') { GeoGridState.editandoChave = true; renderGeogrid(); }
    else if (acao === 'cancelar') { GeoGridState.editandoChave = false; renderGeogrid(); }
    else if (acao === 'remover' && confirm('Remover a chave da API? As medições já feitas continuam guardadas.')) {
      await geogridAcao(() => geogridApi('/api/marketing/geogrid/config', { remove: true }), 'Chave removida.');
    }
  });
  painel.addEventListener('change', ev => {
    if (ev.target.id !== 'geogridMedicao') return;
    GeoGridState.medicao = ev.target.value;
    renderGeogrid();
  });
}

document.addEventListener('DOMContentLoaded', () => { setupGeogrid(); carregarGeogrid(); });
