// gmb_plano.js — Rotina recorrente e métricas mensais do Perfil da Empresa no Google
// Speed Financeira | Varginha/MG
// Dados em chaves speed_* do localStorage: o nexcafe-sync.js guarda no servidor do Nexcafe.

const GMB_ROTINA_KEY = 'speed_gmb_rotina_v1';
const GMB_METRICAS_KEY = 'speed_gmb_metricas_v1';
const GMB_FICHA_URL = 'https://share.google/jQz1bj2r5fsU15FM8';

const GMB_ROTINA = [
  { id: 'responder_avaliacoes', titulo: 'Responder avaliações novas', dias: 2, dica: 'Responda todas, boas e ruins, sem citar dados do cliente, valores ou contrato. Em reclamação, peça para chamar no (35) 3067-5017.' },
  { id: 'pedir_avaliacoes', titulo: 'Pedir avaliação a clientes atendidos', dias: 7, dica: 'Envie o link da ficha pelo WhatsApp depois de um atendimento concluído. Não ofereça desconto, brinde ou sorteio em troca: o Google proíbe.' },
  { id: 'post', titulo: 'Publicar o post programado na ficha', dias: 3, freq: '3 por semana', dica: 'Siga o planejamento de posts mais abaixo, só com serviços financeiros. Marcar um post como publicado registra esta tarefa.' },
  { id: 'nome_categorias', titulo: 'Conferir nome e categorias', dias: 30, dica: 'Nome igual ao da fachada, sem serviços nem cidade acrescentados (em 29/10 estava "Speed Financeira – Empréstimo Consignado e Financiamento em Varginha"). Anote a categoria principal e confira se as adicionais cobrem o que a loja faz de verdade: crédito, lan house, impressão e cópias. Veja se o Google aplicou alguma edição sugerida.' },
  { id: 'dados_contato', titulo: 'Conferir endereço, telefone, site e horário', dias: 30, dica: 'Rua Santa Cruz, 696 - Centro, CEP 37002-090, (35) 3067-5017, speedfinanceira.com.br. Horário igual ao praticado na porta.' },
  { id: 'horario_especial', titulo: 'Lançar horário especial dos próximos feriados', dias: 30, dica: 'Antes de cada feriado, informe se a loja abre, fecha ou muda o horário. Ficha "aberta" com a porta fechada gera reclamação.' },
  { id: 'fotos', titulo: 'Adicionar fotos novas e reais', dias: 30, dica: 'Fachada, balcão, computadores da lan house, impressões prontas e equipe (com autorização). Nada de imagem de banco de fotos.' },
  { id: 'metricas', titulo: 'Registrar métricas e posições do mês', dias: 30, dica: 'Use o formulário "Métricas da ficha mês a mês" logo abaixo. Salvar um mês marca esta tarefa.' },
  { id: 'nap_diretorios', titulo: 'Avançar correções de telefone nos diretórios', dias: 14, dica: 'Use a Central de Correção NAP, mais abaixo nesta página.' }
];

// Termos acompanhados no Google Maps: crédito (onde a ficha aparece) e serviços da loja (onde não aparecia em 29/10).
const GMB_TERMOS = [
  { id: 'emprestimo', termo: 'empréstimo varginha' },
  { id: 'consignado', termo: 'empréstimo consignado varginha' },
  { id: 'financeira', termo: 'financeira varginha' },
  { id: 'fgts', termo: 'antecipação fgts varginha' },
  { id: 'consignado_inss', termo: 'consignado inss varginha' },
  { id: 'consignado_clt', termo: 'consignado clt varginha' },
  { id: 'lan_house', termo: 'lan house varginha' },
  { id: 'xerox', termo: 'xerox varginha' },
  { id: 'impressao', termo: 'impressão de documentos varginha' }
];

const GMB_METRICAS_CAMPOS = [
  { id: 'visualizacoes', label: 'Visualizações do perfil', curto: 'Visualizações' },
  { id: 'ligacoes', label: 'Ligações', curto: 'Ligações' },
  { id: 'rotas', label: 'Pedidos de rota', curto: 'Rotas' },
  { id: 'cliques_site', label: 'Cliques no site', curto: 'Cliques no site' }
];

const GMB_FORA = 99; // "Fora dos 20 primeiros" no Maps

function gmbPad(n) { return String(n).padStart(2, '0'); }
function gmbHoje() { const d = new Date(); return `${d.getFullYear()}-${gmbPad(d.getMonth() + 1)}-${gmbPad(d.getDate())}`; }
function gmbDiaNumero(iso) { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; }
function gmbSomarDias(iso, dias) { const t = new Date((gmbDiaNumero(iso) + dias) * 864e5); return `${t.getUTCFullYear()}-${gmbPad(t.getUTCMonth() + 1)}-${gmbPad(t.getUTCDate())}`; }
function gmbDataCurta(iso) { const [, m, d] = iso.split('-'); return `${d}/${m}`; }
function gmbMesNome(mes) { const [y, m] = mes.split('-'); return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m) - 1]}/${y}`; }
function gmbFrequencia(dias) { return { 2: 'a cada 2 dias', 7: 'toda semana', 14: 'a cada 2 semanas', 30: 'todo mês' }[dias] || `a cada ${dias} dias`; }
function gmbNumero(valor) { return valor === null || valor === undefined ? '—' : Number(valor).toLocaleString('pt-BR'); }

function lerGmbRotina() { const v = lerJsonStorage(GMB_ROTINA_KEY, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function lerGmbMetricas() { const v = lerJsonStorage(GMB_METRICAS_KEY, []); return Array.isArray(v) ? v.filter(r => r && /^\d{4}-\d{2}$/.test(r.mes)) : []; }

function registrarGmbTarefa(id, data) {
  const rotina = lerGmbRotina();
  const datas = new Set(rotina[id] || []);
  datas.add(data);
  rotina[id] = [...datas].sort().reverse().slice(0, 12);
  localStorage.setItem(GMB_ROTINA_KEY, JSON.stringify(rotina));
}

function situacaoGmbTarefa(tarefa, datas, hoje) {
  if (!datas.length) return { nivel: 0, texto: 'Ainda não registrada', classe: 'bg-yellow-100 text-yellow-800', proxima: hoje };
  const proxima = gmbSomarDias(datas[0], tarefa.dias);
  const falta = gmbDiaNumero(proxima) - gmbDiaNumero(hoje);
  if (falta < 0) return { nivel: 0, atrasada: true, texto: `Atrasada há ${-falta} dia${falta === -1 ? '' : 's'}`, classe: 'bg-red-100 text-red-700', proxima };
  if (falta === 0) return { nivel: 1, texto: 'Vence hoje', classe: 'bg-yellow-100 text-yellow-800', proxima };
  if (falta <= 3) return { nivel: 2, texto: `Vence em ${falta} dia${falta === 1 ? '' : 's'}`, classe: 'bg-yellow-50 text-yellow-800', proxima };
  return { nivel: 3, texto: 'Em dia', classe: 'bg-green-100 text-green-800', proxima };
}

// ─── ROTINA DO PERFIL ───────────────────────────────────────────────────────
function renderGmbRotina() {
  const container = document.getElementById('gmbRotinaContainer');
  if (!container) return;
  const rotina = lerGmbRotina();
  const hoje = gmbHoje();
  const linhas = GMB_ROTINA.map(t => ({ t, datas: rotina[t.id] || [] }))
    .map(x => ({ ...x, s: situacaoGmbTarefa(x.t, x.datas, hoje) }))
    .sort((a, b) => a.s.nivel - b.s.nivel || a.s.proxima.localeCompare(b.s.proxima));

  container.innerHTML = linhas.map(({ t, datas, s }) => `
    <div class="gmb-rotina-item ${s.atrasada ? 'gmb-rotina-atrasada' : ''}">
      <div class="flex items-start justify-between gap-2 mb-1">
        <p class="text-xs font-bold text-gray-900 leading-snug">${escaparHtml(t.titulo)}</p>
        <span class="status-badge ${s.classe} text-[10px] shrink-0">${s.texto}</span>
      </div>
      <p class="text-[11px] text-gray-600 leading-relaxed mb-2">${escaparHtml(t.dica)}</p>
      <div class="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
        <span class="font-semibold">${t.freq || gmbFrequencia(t.dias)}</span>
        <span>•</span>
        <span>${datas.length ? `Feito em ${gmbDataCurta(datas[0])} • próxima ${gmbDataCurta(s.proxima)}` : 'Sem registro'}</span>
      </div>
      <div class="gmb-rotina-acoes">
        <button type="button" data-gmb-feito="${t.id}" class="gmb-btn-primario">Feito hoje</button>
        <label class="gmb-rotina-outra">Outra data <input type="date" max="${hoje}" data-gmb-data="${t.id}" class="art-input"></label>
        ${datas.length ? `<button type="button" data-gmb-desfazer="${t.id}" class="gmb-btn-link">Desfazer ${gmbDataCurta(datas[0])}</button>` : ''}
      </div>
    </div>`).join('');

  const atrasadas = linhas.filter(x => x.s.nivel === 0).length;
  const semana = linhas.filter(x => x.s.nivel > 0 && gmbDiaNumero(x.s.proxima) - gmbDiaNumero(hoje) <= 7).length;
  const resumo = document.getElementById('gmbRotinaResumo');
  if (resumo) {
    resumo.textContent = atrasadas ? `${atrasadas} a fazer agora • ${semana} nos próximos 7 dias` : `Tudo em dia • ${semana} nos próximos 7 dias`;
    resumo.className = `status-badge text-[10px] ${atrasadas ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-800'}`;
  }
}

function setupGmbRotina() {
  const container = document.getElementById('gmbRotinaContainer');
  if (!container || container.dataset.pronto) return;
  container.dataset.pronto = '1';
  container.addEventListener('click', ev => {
    const feito = ev.target.closest('[data-gmb-feito]');
    const desfazer = ev.target.closest('[data-gmb-desfazer]');
    if (feito) {
      registrarGmbTarefa(feito.dataset.gmbFeito, gmbHoje());
      renderGmbRotina();
      mostrarToast('Tarefa registrada como feita hoje.');
    } else if (desfazer) {
      const rotina = lerGmbRotina();
      rotina[desfazer.dataset.gmbDesfazer] = (rotina[desfazer.dataset.gmbDesfazer] || []).slice(1);
      localStorage.setItem(GMB_ROTINA_KEY, JSON.stringify(rotina));
      renderGmbRotina();
      mostrarToast('Último registro desfeito.');
    }
  });
  container.addEventListener('change', ev => {
    const campo = ev.target.closest('[data-gmb-data]');
    if (!campo || !/^\d{4}-\d{2}-\d{2}$/.test(campo.value) || campo.value > gmbHoje()) return;
    registrarGmbTarefa(campo.dataset.gmbData, campo.value);
    renderGmbRotina();
    mostrarToast(`Tarefa registrada em ${gmbDataCurta(campo.value)}.`);
  });
}

// ─── MÉTRICAS MÊS A MÊS ─────────────────────────────────────────────────────
function gmbVariacao(atual, anterior) {
  if (atual === null || atual === undefined || !anterior) return '';
  const pct = Math.round(((atual - anterior) / anterior) * 100);
  if (pct === 0) return '<span class="gmb-var">0%</span>';
  return `<span class="gmb-var ${pct < 0 ? (pct <= -20 ? 'gmb-var-queda' : 'gmb-var-baixa') : 'gmb-var-alta'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
}

function gmbPosicaoTexto(valor) {
  if (valor === null || valor === undefined) return '<span class="text-gray-400">—</span>';
  if (valor === GMB_FORA) return '<span class="gmb-pos gmb-pos-fora">fora</span>';
  return `<span class="gmb-pos ${valor <= 3 ? 'gmb-pos-top' : ''}">${valor}º</span>`;
}

function renderGmbMetricas() {
  const container = document.getElementById('gmbMetricasContainer');
  if (!container) return;
  const registros = lerGmbMetricas().sort((a, b) => b.mes.localeCompare(a.mes));
  if (!registros.length) {
    container.innerHTML = '<p class="results-empty">Nenhum mês registrado. Comece pelo mês passado: com dois meses lado a lado já dá para ver se ligações e rotas caíram.</p>';
    return;
  }
  const anterior = i => registros[i + 1];
  const linhasMetricas = registros.map((r, i) => {
    const ant = anterior(i) || {};
    const novas = r.avaliacoes_total !== null && r.avaliacoes_total !== undefined && ant.avaliacoes_total !== null && ant.avaliacoes_total !== undefined ? r.avaliacoes_total - ant.avaliacoes_total : null;
    return `<tr>
      <td><strong>${gmbMesNome(r.mes)}</strong></td>
      ${GMB_METRICAS_CAMPOS.map(c => `<td>${gmbNumero(r[c.id])} ${gmbVariacao(r[c.id], ant[c.id])}</td>`).join('')}
      <td>${gmbNumero(r.avaliacoes_total)}${novas !== null ? ` <span class="gmb-var ${novas > 0 ? 'gmb-var-alta' : ''}">+${Math.max(novas, 0)}</span>` : ''}</td>
      <td>${r.nota === null || r.nota === undefined ? '—' : Number(r.nota).toLocaleString('pt-BR', { minimumFractionDigits: 1 })}</td>
      <td class="gmb-obs">${escaparHtml(r.obs || '')}</td>
      <td><button type="button" data-gmb-editar="${r.mes}" class="gmb-btn-link">Editar</button><button type="button" data-gmb-excluir="${r.mes}" class="gmb-btn-link gmb-btn-perigo">Excluir</button></td>
    </tr>`;
  }).join('');
  const comPosicao = registros.filter(r => r.posicoes && Object.keys(r.posicoes).length);
  const linhasPosicoes = comPosicao.map(r => `<tr><td><strong>${gmbMesNome(r.mes)}</strong></td>${GMB_TERMOS.map(t => `<td>${gmbPosicaoTexto(r.posicoes[t.id])}</td>`).join('')}</tr>`).join('');

  container.innerHTML = `
    <div class="results-table-wrap"><table class="results-table">
      <caption>Números do Perfil da Empresa (▼ em vermelho = queda de 20% ou mais sobre o mês anterior)</caption>
      <thead><tr><th>Mês</th>${GMB_METRICAS_CAMPOS.map(c => `<th>${c.curto}</th>`).join('')}<th>Avaliações</th><th>Nota</th><th>O que mudou</th><th></th></tr></thead>
      <tbody>${linhasMetricas}</tbody>
    </table></div>
    ${comPosicao.length ? `<div class="results-table-wrap mt-4"><table class="results-table">
      <caption>Posição no Google Maps por termo (fora = não apareceu entre os 20 primeiros)</caption>
      <thead><tr><th>Mês</th>${GMB_TERMOS.map(t => `<th>${escaparHtml(t.termo.replace(' varginha', ''))}</th>`).join('')}</tr></thead>
      <tbody>${linhasPosicoes}</tbody>
    </table></div>` : ''}
    <p class="results-note text-[11px] text-gray-500">Campo vazio = não medido, não zero.</p>`;
}

function preencherGmbMetricasForm(registro) {
  const form = document.getElementById('gmbMetricasForm');
  if (!form) return;
  const mesPassado = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${gmbPad(d.getMonth() + 1)}`; })();
  form.elements.mes.value = registro?.mes || mesPassado;
  GMB_METRICAS_CAMPOS.concat([{ id: 'avaliacoes_total' }, { id: 'nota' }]).forEach(c => {
    const v = registro?.[c.id];
    form.elements[c.id].value = v === null || v === undefined ? '' : v;
  });
  GMB_TERMOS.forEach(t => {
    const v = registro?.posicoes?.[t.id];
    form.elements[`pos_${t.id}`].value = v === null || v === undefined ? '' : String(v);
  });
  form.elements.obs.value = registro?.obs || '';
}

function setupGmbMetricas() {
  const form = document.getElementById('gmbMetricasForm');
  const termos = document.getElementById('gmbMetricasTermos');
  if (!form || form.dataset.pronto) return;
  form.dataset.pronto = '1';
  form.elements.mes.max = gmbHoje().slice(0, 7);
  if (termos) {
    const opcoes = '<option value="">Não medido</option>' + Array.from({ length: 20 }, (_, i) => `<option value="${i + 1}">${i + 1}º</option>`).join('') + `<option value="${GMB_FORA}">Fora dos 20</option>`;
    termos.innerHTML = GMB_TERMOS.map(t => `<label>${escaparHtml(t.termo)} <a href="https://www.google.com/maps/search/${encodeURIComponent(t.termo)}" target="_blank" rel="noopener noreferrer" class="gmb-link-busca" title="Abrir a busca no Google Maps">abrir</a><select name="pos_${t.id}" class="art-input">${opcoes}</select></label>`).join('');
  }
  preencherGmbMetricasForm(null);

  form.addEventListener('submit', ev => {
    ev.preventDefault();
    const mes = form.elements.mes.value;
    if (!/^\d{4}-\d{2}$/.test(mes) || mes > gmbHoje().slice(0, 7)) { mostrarToast('Escolha um mês válido.', 'erro'); return; }
    const numero = (nome, max) => {
      const bruto = form.elements[nome].value.trim().replace(',', '.');
      if (bruto === '') return null;
      const n = Number(bruto);
      return Number.isFinite(n) && n >= 0 && n <= max ? n : undefined;
    };
    const registro = { mes, registradoEm: new Date().toISOString() };
    for (const c of GMB_METRICAS_CAMPOS.concat([{ id: 'avaliacoes_total' }])) {
      const v = numero(c.id, 100000000);
      if (v === undefined || (v !== null && !Number.isInteger(v))) { mostrarToast('Use números inteiros nas métricas.', 'erro'); return; }
      registro[c.id] = v;
    }
    const nota = numero('nota', 5);
    if (nota === undefined || (nota !== null && nota < 1)) { mostrarToast('A nota vai de 1 a 5.', 'erro'); return; }
    registro.nota = nota;
    registro.posicoes = {};
    GMB_TERMOS.forEach(t => { const v = form.elements[`pos_${t.id}`].value; if (v) registro.posicoes[t.id] = Number(v); });
    registro.obs = form.elements.obs.value.trim().slice(0, 200);

    const registros = lerGmbMetricas().filter(r => r.mes !== mes);
    registros.push(registro);
    localStorage.setItem(GMB_METRICAS_KEY, JSON.stringify(registros));
    registrarGmbTarefa('metricas', gmbHoje());
    preencherGmbMetricasForm(null);
    renderGmbMetricas();
    renderGmbRotina();
    mostrarToast(`Métricas de ${gmbMesNome(mes)} salvas.`);
  });

  document.getElementById('gmbMetricasContainer')?.addEventListener('click', ev => {
    const editar = ev.target.closest('[data-gmb-editar]');
    const excluir = ev.target.closest('[data-gmb-excluir]');
    if (editar) {
      preencherGmbMetricasForm(lerGmbMetricas().find(r => r.mes === editar.dataset.gmbEditar));
      const caixa = document.getElementById('gmbMetricasEntrada');
      if (caixa) caixa.open = true;
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (excluir && confirm(`Excluir as métricas de ${gmbMesNome(excluir.dataset.gmbExcluir)}?`)) {
      localStorage.setItem(GMB_METRICAS_KEY, JSON.stringify(lerGmbMetricas().filter(r => r.mes !== excluir.dataset.gmbExcluir)));
      renderGmbMetricas();
      mostrarToast('Mês excluído.');
    }
  });
}

// ─── PLANEJAMENTO DE POSTS DA FICHA (js/data_gmb_posts.js) ──────────────────
const GMB_POSTS_KEY = 'speed_gmb_posts_v1';
const GMB_DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function lerGmbPostsFeitos() { const v = lerJsonStorage(GMB_POSTS_KEY, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function gmbDiaSemana(iso) { return GMB_DIAS_SEMANA[new Date(gmbDiaNumero(iso) * 864e5).getUTCDay()]; }
function gmbSegunda(iso) { const dia = new Date(gmbDiaNumero(iso) * 864e5).getUTCDay(); return gmbSomarDias(iso, dia === 0 ? -6 : 1 - dia); }

function renderGmbPostsPlano() {
  const container = document.getElementById('gmbPostsContainer');
  const posts = window.SPEED_GMB_POSTS_PLANO;
  if (!container || !Array.isArray(posts)) return;
  const feitos = lerGmbPostsFeitos();
  const hoje = gmbHoje();
  const ocultar = document.getElementById('gmbPostsOcultar')?.checked;
  const semanas = new Map();
  posts.filter(post => !(ocultar && feitos[post.id])).forEach(post => {
    const chave = gmbSegunda(post.data);
    if (!semanas.has(chave)) semanas.set(chave, []);
    semanas.get(chave).push(post);
  });

  container.innerHTML = [...semanas].map(([segunda, lista]) => `
    <div class="gmb-posts-semana">
      <p class="gmb-posts-semana-titulo">Semana de ${gmbDataCurta(segunda)} a ${gmbDataCurta(gmbSomarDias(segunda, 4))}</p>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${lista.map(post => {
          const feito = feitos[post.id];
          const atrasado = !feito && post.data < hoje;
          const situacao = feito ? ['bg-green-100 text-green-800', `Publicado em ${gmbDataCurta(feito)}`]
            : post.data === hoje ? ['bg-yellow-100 text-yellow-800', 'Publicar hoje']
            : atrasado ? ['bg-red-100 text-red-700', 'Atrasado']
            : ['bg-gray-100 text-gray-700', 'Programado'];
          return `<div class="gmb-post-card ${atrasado ? 'gmb-rotina-atrasada' : ''} ${post.data === hoje && !feito ? 'gmb-post-hoje' : ''} ${feito ? 'gmb-post-feito' : ''}">
            <div class="flex items-center justify-between gap-2 mb-2">
              <p class="text-sm font-black text-gray-900">${gmbDiaSemana(post.data)} ${gmbDataCurta(post.data)}</p>
              <span class="status-badge ${situacao[0]} text-[10px]">${situacao[1]}</span>
            </div>
            <div class="flex flex-wrap gap-1.5 mb-2">
              <span class="gmb-post-tema">${escaparHtml(post.tema)}</span>
              <span class="gmb-post-termo" title="Busca que o post reforça">busca: ${escaparHtml(post.termo)}</span>
            </div>
            ${post.arte ? `<a href="${escaparHtml(post.arte.arquivo)}" target="_blank" rel="noopener" class="gmb-post-arte" title="Abrir a arte em tamanho real"><img src="${escaparHtml(post.arte.arquivo)}" alt="Arte do post de ${gmbDataCurta(post.data)}: ${escaparHtml(post.arte.titulo.replace(/\*/g, ''))}" loading="lazy"></a>` : ''}
            <div class="gmb-post-texto">${escaparHtml(post.texto)}</div>
            <p class="text-[11px] text-gray-600 mt-2"><strong>Foto:</strong> ${escaparHtml(post.foto)}</p>
            <p class="text-[11px] text-gray-600"><strong>Botão:</strong> ${escaparHtml(post.botao)}${post.link ? ` (${escaparHtml(post.link)})` : ''}</p>
            <div class="gmb-rotina-acoes">
              <button type="button" data-gmb-post-copiar="${post.id}" class="gmb-btn-primario">Copiar texto</button>
              ${post.arte ? `<a href="${escaparHtml(post.arte.arquivo)}" download="speed-${post.data}.png" class="gmb-btn-link">Baixar arte</a>` : ''}
              ${feito
                ? `<button type="button" data-gmb-post-desfazer="${post.id}" class="gmb-btn-link">Desfazer publicado</button>`
                : `<button type="button" data-gmb-post-feito="${post.id}" class="gmb-btn-link">Marcar publicado</button>`}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('') || '<p class="results-empty">Todos os posts do período foram publicados.</p>';

  const total = posts.length;
  const publicados = posts.filter(post => feitos[post.id]).length;
  const atrasados = posts.filter(post => !feitos[post.id] && post.data < hoje).length;
  const proximo = posts.find(post => !feitos[post.id] && post.data >= hoje);
  const resumo = document.getElementById('gmbPostsResumo');
  if (resumo) {
    resumo.textContent = `${publicados} de ${total} publicados${atrasados ? ` • ${atrasados} atrasado${atrasados > 1 ? 's' : ''}` : ''}${proximo ? ` • próximo: ${gmbDiaSemana(proximo.data)} ${gmbDataCurta(proximo.data)}` : ''}`;
    resumo.className = `status-badge text-[10px] ${atrasados ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-800'}`;
  }
}

function setupGmbPostsPlano() {
  const container = document.getElementById('gmbPostsContainer');
  if (!container || container.dataset.pronto) return;
  container.dataset.pronto = '1';
  document.getElementById('gmbPostsOcultar')?.addEventListener('change', renderGmbPostsPlano);
  container.addEventListener('click', ev => {
    const botao = ev.target.closest('[data-gmb-post-copiar], [data-gmb-post-feito], [data-gmb-post-desfazer]');
    if (!botao) return;
    const id = botao.dataset.gmbPostCopiar || botao.dataset.gmbPostFeito || botao.dataset.gmbPostDesfazer;
    const post = (window.SPEED_GMB_POSTS_PLANO || []).find(item => item.id === id);
    if (!post) return;
    if (botao.dataset.gmbPostCopiar) { copiarTexto(post.texto, 'Texto do post copiado. Cole em Adicionar atualização na ficha.'); return; }
    const feitos = lerGmbPostsFeitos();
    if (botao.dataset.gmbPostFeito) {
      feitos[id] = gmbHoje();
      registrarGmbTarefa('post', gmbHoje());
      mostrarToast(`Post de ${gmbDataCurta(post.data)} marcado como publicado.`);
    } else {
      delete feitos[id];
      mostrarToast('Marcação desfeita.');
    }
    localStorage.setItem(GMB_POSTS_KEY, JSON.stringify(feitos));
    renderGmbPostsPlano();
    renderGmbRotina();
  });
}

function renderGmbPlano() {
  setupGmbRotina();
  setupGmbMetricas();
  setupGmbPostsPlano();
  renderGmbRotina();
  renderGmbMetricas();
  renderGmbPostsPlano();
}
