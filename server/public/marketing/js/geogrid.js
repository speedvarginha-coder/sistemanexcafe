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
      <div class="flex items-center justify-between mb-2">
        <label for="geogridChave" class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
          <i class="fas fa-key text-emerald-600"></i> Chave da API do Google Cloud ${dados.configured ? `<span class="text-[11px] font-normal text-gray-500">(atual termina em ${escaparHtml(dados.keyHint)})</span>` : ''}
        </label>
        ${dados.configured ? '<button type="button" data-geogrid="cancelar" class="text-xs text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i> Fechar</button>' : ''}
      </div>
      <div class="flex flex-wrap gap-2 mt-1">
        <input id="geogridChave" type="password" class="art-input" style="max-width: 26rem" placeholder="Cole aqui a chave criada no Google Cloud" required>
        <button type="submit" class="gmb-btn-primario" ${GeoGridState.ocupado ? 'disabled' : ''}>Salvar e conferir</button>
        ${dados.configured ? '<button type="button" data-geogrid="cancelar" class="gmb-btn-link">Cancelar</button>' : ''}
      </div>
      <p class="text-[11px] text-gray-500 mt-2">A chave fica salva exclusivamente no servidor do Nexcafe em cofre seguro e nunca volta desprotegida para a tela. Ao salvar, o sistema faz uma validação em tempo real buscando a ficha da Speed Financeira.</p>
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
    const dica = `${centro ? '📍 [Sede Speed - R. Santa Cruz, 696] • ' : ''}${c.rank ? `${c.rank}º lugar` : 'Fora dos 20 primeiros'}${lider ? ` • 1º: ${lider}` : ''} • Coordenadas: ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`;
    return `<span class="geogrid-celula ${geogridCor(c.rank)} ${centro ? 'geogrid-centro' : ''}" title="${escaparHtml(dica)}" aria-label="${escaparHtml(dica)}">${c.rank ? c.rank : '20+'}</span>`;
  }).join('');
  return `
    <div class="geogrid-mapa-wrap">
      <span class="geogrid-rosa geogrid-rosa-n" title="Norte (N)"><i class="fas fa-arrow-up text-[10px] mr-1"></i>N</span>
      <div class="geogrid-mapa-compass-row">
        <span class="geogrid-rosa" title="Oeste (O)">O</span>
        <div class="geogrid-mapa" style="grid-template-columns: repeat(${n}, minmax(0, 1fr))" aria-label="Posição da ficha em cada ponto da grade">${celulas}</div>
        <span class="geogrid-rosa" title="Leste (L)">L</span>
      </div>
      <span class="geogrid-rosa" title="Sul (S)">S<i class="fas fa-arrow-down text-[10px] ml-1"></i></span>
      <div class="geogrid-legenda">
        <span><i class="geogrid-top"></i>1º a 3º (Top 3)</span>
        <span><i class="geogrid-meio"></i>4º a 10º (1ª página)</span>
        <span><i class="geogrid-baixo"></i>11º a 20º</span>
        <span><i class="geogrid-fora"></i>20+</span>
        <span><strong class="text-gray-900 border border-gray-800 px-1 rounded text-[10px]">Loja</strong> Centro</span>
      </div>
    </div>`;
}

function geogridDiagnostico(item, run) {
  const total = item.cells.length;
  const pctTop3 = Math.round(item.top3 / total * 100);
  const liderPrincipal = item.leaders?.[0] ? (run.names[item.leaders[0].id] || 'Líder local') : null;

  if (pctTop3 >= 80) {
    return `
      <div class="geogrid-diagnostico" style="background:#ecfdf5;border-color:#a7f3d0">
        <div class="geogrid-diagnostico-titulo"><i class="fas fa-crown text-amber-500"></i> Liderança Consolidada no Maps</div>
        <p class="geogrid-diagnostico-texto">A Speed domina o Top 3 em ${item.top3} dos ${total} pontos da cidade neste termo. Continue respondendo a todas as avaliações no mesmo dia e mantendo posts ativos para proteger essa posição.</p>
      </div>`;
  }

  if (item.found >= 20 && pctTop3 === 0) {
    return `
      <div class="geogrid-diagnostico">
        <div class="geogrid-diagnostico-titulo"><i class="fas fa-bullseye text-emerald-600"></i> Diagnóstico Tático: Próxima da 1ª Página / Top 3</div>
        <p class="geogrid-diagnostico-texto">A Speed aparece entre os 20 primeiros em <strong>${item.found} de ${total} pontos</strong> (posição média ${item.average.toLocaleString('pt-BR')}º), mas ainda não está no Top 3 visível aos clientes no celular. ${liderPrincipal ? `O principal concorrente no Top 3 é <strong>${escaparHtml(liderPrincipal)}</strong>.` : ''}</p>
        <ul class="geogrid-diagnostico-passos">
          <li><i class="fas fa-check-circle"></i> <span><strong>Avaliações direcionadas:</strong> No balcão de atendimento, solicite aos clientes satisfeitos de consignado que incluam o termo <em>"${escaparHtml(item.term)}"</em> no texto da avaliação do Google.</span></li>
          <li><i class="fas fa-check-circle"></i> <span><strong>Posts na ficha:</strong> Mantenha a esteira de publicações ativas no Perfil da Empresa destacando atendimento presencial na Rua Santa Cruz, 696.</span></li>
          <li><i class="fas fa-check-circle"></i> <span><strong>Relevância local (NAP):</strong> Assegure que o nome e endereço nos diretórios locais estejam 100% idênticos ao da ficha do Google Maps.</span></li>
        </ul>
      </div>`;
  }

  return `
    <div class="geogrid-diagnostico" style="background:#fffbeb;border-color:#fde68a">
      <div class="geogrid-diagnostico-titulo" style="color:#92400e"><i class="fas fa-arrow-trend-up text-amber-600"></i> Oportunidade de Ganho Geográfico</div>
      <p class="geogrid-diagnostico-texto" style="color:#78350f">Neste termo a Speed está presente em ${item.found} de ${total} pontos com posição média de ${item.average.toLocaleString('pt-BR')}º. Intensificar postagens locais e menções deste serviço no site ajuda a expandir o raio de cobertura do centro para os bairros.</p>
    </div>`;
}

function geogridNumeros(run, item, anterior) {
  const total = item.cells.length;
  const antes = anterior?.terms.find(t => t.term === item.term);
  const delta = antes ? +(item.average - antes.average).toFixed(1) : null;
  const variacao = delta === null ? '' : delta === 0 ? '<small class="text-gray-500 font-semibold mt-1">Estável vs. anterior</small>'
    : `<small class="mt-1 flex items-center gap-1 ${delta < 0 ? 'geogrid-melhorou' : 'geogrid-piorou'}">
         <i class="fas ${delta < 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i>
         ${delta < 0 ? 'Melhorou' : 'Caiu'} ${Math.abs(delta).toLocaleString('pt-BR')} posições vs. ${geogridData(anterior.at)}
       </small>`;
  const pctTop3 = Math.round(item.top3 / total * 100);
  const lideres = item.leaders.length
    ? item.leaders.map(l => `<li><strong>${escaparHtml(run.names[l.id] || 'Concorrente sem nome')}</strong> em 1º em ${l.count} de ${total} pontos</li>`).join('')
    : '<li>A Speed lidera em todos os pontos.</li>';

  return `
    <div class="geogrid-numeros">
      <div>
        <span>Posição média <i class="fas fa-chart-line text-emerald-600"></i></span>
        <strong>${item.average.toLocaleString('pt-BR')}º</strong>
        ${variacao}
      </div>
      <div>
        <span>Visibilidade (Top 3) <i class="fas fa-eye text-blue-600"></i></span>
        <strong>${pctTop3}%</strong>
        <div class="geogrid-progresso-bar">
          <div class="geogrid-progresso-fill ${pctTop3 > 0 ? 'bg-emerald-500' : 'bg-gray-300'}" style="width: ${Math.max(pctTop3, 3)}%"></div>
        </div>
        <small>${item.top3} de ${total} pontos no pack</small>
      </div>
      <div>
        <span>Presença nos 20 <i class="fas fa-bullseye text-purple-600"></i></span>
        <strong>${item.found} <span class="text-xs font-normal text-gray-500">de ${total}</span></strong>
        <div class="geogrid-progresso-bar">
          <div class="geogrid-progresso-fill bg-purple-500" style="width: ${Math.round(item.found / total * 100)}%"></div>
        </div>
        <small>${Math.round(item.found / total * 100)}% de cobertura local</small>
      </div>
    </div>
    
    ${geogridDiagnostico(item, run)}
    ${geogridConcorrentes(run, item)}

    <div class="mt-4 pt-3 border-t border-gray-100">
      <p class="text-xs font-bold text-gray-800 flex items-center gap-1.5 mb-1"><i class="fas fa-medal text-amber-500"></i> Quem lidera onde a Speed não está em 1º</p>
      <ul class="geogrid-lideres">${lideres}</ul>
      <p class="text-[11px] text-gray-400 mt-2">Cálculo de média considera "fora dos 20" como 21º. O usuário mobile visualiza os 3 primeiros sem rolar a tela.</p>
    </div>`;
}

// Disputa do top 3: Speed e concorrentes lado a lado (medições a partir de 05/11/2026 trazem esses dados).
function geogridConcorrentes(run, item) {
  const total = item.cells.length;
  if (!item.competitors) return '<p class="text-[11px] text-gray-500 mt-3">Meça de novo para ver a visibilidade de cada concorrente.</p>';
  const speed = { nome: 'Speed Financeira', visibilidade: Math.round(item.top3 / total * 100), top3: item.top3, media: item.average, speed: true };
  const linhas = [speed, ...item.competitors.map(c => ({ nome: run.names[c.id] || 'Concorrente sem nome', visibilidade: c.visibility, top3: c.top3, media: c.average }))]
    .sort((a, b) => b.visibilidade - a.visibilidade || a.media - b.media);
  return `
    <div class="mt-4">
      <div class="flex items-center justify-between mb-1.5">
        <p class="text-xs font-bold text-gray-800 flex items-center gap-1.5"><i class="fas fa-ranking-star text-amber-500"></i> Disputa do Top 3 neste termo</p>
        <span class="text-[10px] text-gray-400 font-medium">Pack dos 3 primeiros no Maps</span>
      </div>
      <table class="geogrid-concorrentes-tabela">
        <thead>
          <tr>
            <th>Empresa</th>
            <th class="text-center">Visibilidade</th>
            <th class="text-center">Top 3</th>
            <th class="text-center">Posição média</th>
          </tr>
        </thead>
        <tbody>
          ${linhas.map(l => `
            <tr class="${l.speed ? 'geogrid-linha-speed' : ''}">
              <td>
                <div class="flex items-center gap-1">
                  <span>${escaparHtml(l.nome)}</span>
                  ${l.speed ? '<span class="geogrid-badge-speed">Sua Ficha</span>' : ''}
                </div>
              </td>
              <td class="text-center">
                <span class="geogrid-mini-bar"><span class="geogrid-mini-bar-fill" style="width:${l.visibilidade}%;${l.visibilidade > 0 ? '' : 'background:#cbd5e1'}"></span></span>
                <strong>${l.visibilidade}%</strong>
              </td>
              <td class="text-center font-semibold text-gray-700">${l.top3} <span class="text-gray-400 text-[10px]">/ ${total}</span></td>
              <td class="text-center font-bold text-gray-800">${l.media.toLocaleString('pt-BR')}º</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderGeogrid() {
  const conteudo = document.getElementById('geogridConteudo');
  if (!conteudo) return;
  const dados = GeoGridState.dados;
  if (!dados) return;
  const mensagem = GeoGridState.mensagem ? `<p class="geogrid-mensagem"><i class="fas fa-info-circle mr-1.5"></i>${escaparHtml(GeoGridState.mensagem)}</p>` : '';
  const erro = dados.lastError ? `<p class="geogrid-erro"><i class="fas fa-triangle-exclamation mr-1.5"></i>Última tentativa (${geogridData(dados.lastError.at)}) falhou: ${escaparHtml(dados.lastError.message)}</p>` : '';

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
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
      <div class="flex items-center gap-2">
        <span class="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-xs shrink-0"><i class="fas fa-store"></i></span>
        <div>
          <p class="text-xs font-bold text-gray-900">${escaparHtml(dados.placeName)}</p>
          <p class="text-[11px] text-gray-500 flex items-center gap-1"><i class="fas fa-location-dot text-emerald-600 text-[10px]"></i> ${escaparHtml(dados.placeAddress)}</p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" data-geogrid="medir" class="gmb-btn-primario text-xs flex items-center gap-1.5" ${GeoGridState.ocupado ? 'disabled' : ''}>
          <i class="fas ${GeoGridState.ocupado ? 'fa-circle-notch fa-spin' : 'fa-arrows-rotate'}"></i>
          <span>${GeoGridState.ocupado ? 'Medindo 25 pontos...' : 'Medir agora'}</span>
        </button>
        <button type="button" data-geogrid="trocar" class="gmb-btn-link text-xs flex items-center gap-1 text-gray-600 hover:text-gray-900">
          <i class="fas fa-key text-[10px] text-gray-400"></i> ${dados.configured ? 'Configurar chave' : 'Inserir chave'}
        </button>
        ${dados.configured ? '<button type="button" data-geogrid="remover" class="gmb-btn-link gmb-btn-perigo text-xs">Remover chave</button>' : ''}
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
  const abas = run.terms.map((t, i) => {
    const ativa = i === termo;
    return `<button type="button" data-geogrid-termo="${i}" class="geogrid-aba ${ativa ? 'geogrid-aba-ativa' : ''}">
      <span>${escaparHtml(t.term)}</span>
      <span class="geogrid-aba-badge">${t.average.toLocaleString('pt-BR')}º</span>
    </button>`;
  }).join('');
  const historico = runs.length > 1 ? `<label class="text-[11px] font-bold text-gray-600 flex items-center gap-1.5"><span>Medição:</span> <select id="geogridMedicao" class="art-input" style="width:auto;display:inline-block;padding:.25rem .5rem;font-size:.75rem">${[...runs].reverse().map(r => `<option value="${escaparHtml(r.at)}" ${r === run ? 'selected' : ''}>${geogridData(r.at)}${r.trigger === 'automatica' ? ' (automática)' : ''}</option>`).join('')}</select></label>` : '';

  conteudo.innerHTML = topo + chave + mensagem + erro + `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
      <div class="flex flex-wrap gap-1.5">${abas}</div>
      ${historico}
    </div>
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
