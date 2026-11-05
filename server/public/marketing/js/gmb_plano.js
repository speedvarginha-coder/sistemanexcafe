// gmb_plano.js — Rotina recorrente e métricas mensais do Perfil da Empresa no Google
// Speed Financeira | Varginha/MG
// Dados em chaves speed_* do localStorage: o nexcafe-sync.js guarda no servidor do Nexcafe.

const GMB_ROTINA_KEY = 'speed_gmb_rotina_v1';
const GMB_METRICAS_KEY = 'speed_gmb_metricas_v1';
const GMB_FICHA_URL = 'https://share.google/jQz1bj2r5fsU15FM8';

const GMB_ROTINA = [
  { id: 'responder_avaliacoes', titulo: 'Responder avaliações novas', dias: 2, dica: 'Responda todas, boas e ruins, sem citar dados do cliente, valores ou contrato. Em reclamação, peça para chamar no (35) 3067-5017.' },
  { id: 'pedir_avaliacoes', titulo: 'Pedir avaliação a clientes atendidos', dias: 7, dica: 'Envie o link da ficha pelo WhatsApp depois de um atendimento concluído. Não ofereça desconto, brinde ou sorteio em troca: o Google proíbe.' },
  { id: 'post', titulo: 'Conferir os posts publicados na ficha', dias: 7, freq: 'toda segunda', dica: 'Os posts já ficam programados na ficha. Abra Suas postagens e veja se algum foi recusado ou não saiu; se foi, marque "Google recusou" no post da esteira, mais abaixo.' },
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

// ─── ESTEIRA DE POSTS DA FICHA (js/data_gmb_posts.js) ───────────────────────
// Ciclo mensal: pauta (dia 20), textos (22), artes (24), aprovação e programação na ficha (25),
// conferência dos publicados toda segunda. Aprovado, programado e recusado ficam em GMB_ETAPAS_KEY.
const GMB_POSTS_KEY = 'speed_gmb_posts_v1'; // legado: { id: data em que foi marcado publicado }
const GMB_ETAPAS_KEY = 'speed_gmb_posts_etapas_v1';
const GMB_DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const GMB_HORA_POST = 9;

const GMB_ETAPAS = [
  { id: 'pauta', titulo: 'Pauta', prazo: 20, dica: 'Temas e datas pela planilha de palavras-chave e pelo GeoGrid' },
  { id: 'texto', titulo: 'Textos', prazo: 22, dica: 'Palavra-chave e Varginha nos primeiros 150 caracteres' },
  { id: 'arte', titulo: 'Artes', prazo: 24, dica: 'Layout do Google, variações intercaladas' },
  { id: 'aprovado', titulo: 'Aprovação', prazo: 25, dica: 'Conferir texto, arte e botão' },
  { id: 'programado', titulo: 'Programado na ficha', prazo: 25, dica: 'Programar esta postagem, às 9h' },
  { id: 'publicado', titulo: 'Publicado', prazo: null, dica: 'Conferir toda segunda se o Google não recusou' }
];
const GMB_ETAPA_INDICE = Object.fromEntries(GMB_ETAPAS.map((e, i) => [e.id, i]));

function lerGmbPostsFeitos() { const v = lerJsonStorage(GMB_POSTS_KEY, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function lerGmbEtapas() { const v = lerJsonStorage(GMB_ETAPAS_KEY, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function salvarGmbEtapas(etapas) { localStorage.setItem(GMB_ETAPAS_KEY, JSON.stringify(etapas)); }
function gmbDiaSemana(iso) { return GMB_DIAS_SEMANA[new Date(gmbDiaNumero(iso) * 864e5).getUTCDay()]; }
function gmbSegunda(iso) { const dia = new Date(gmbDiaNumero(iso) * 864e5).getUTCDay(); return gmbSomarDias(iso, dia === 0 ? -6 : 1 - dia); }
function gmbSemAcento(texto) { return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/-/g, ' '); }

// Etapa em que o post está agora. "publicado" é deduzido: programado e a data (9h) já passou.
function gmbEtapaPost(post, reg, legado, hoje, hora) {
  if (reg?.recusado) return { id: 'recusado', indice: GMB_ETAPA_INDICE.aprovado };
  if (legado) return { id: 'publicado', indice: GMB_ETAPA_INDICE.publicado, data: legado };
  // Post que o servidor publica: o resultado vem da conexão com a ficha (js/gmb_api.js).
  if (post.publicarPeloServidor) {
    const servidor = (typeof GmbApiState !== 'undefined' && GmbApiState.dados?.postsServidor) || {};
    if (servidor.publicados?.[post.id]) return { id: 'publicado', indice: GMB_ETAPA_INDICE.publicado, data: post.data };
    if (servidor.erros?.[post.id]) return { id: 'erroServidor', indice: GMB_ETAPA_INDICE.aprovado, erro: servidor.erros[post.id].message };
    const passou = post.data < hoje || (post.data === hoje && hora >= GMB_HORA_POST + 1);
    return passou ? { id: 'naoSaiu', indice: GMB_ETAPA_INDICE.aprovado } : { id: 'programado', indice: GMB_ETAPA_INDICE.programado };
  }
  if (reg?.programado || post.programadoEm) {
    const saiu = post.data < hoje || (post.data === hoje && hora >= GMB_HORA_POST);
    return saiu ? { id: 'publicado', indice: GMB_ETAPA_INDICE.publicado, data: post.data } : { id: 'programado', indice: GMB_ETAPA_INDICE.programado };
  }
  if (reg?.aprovado) return { id: 'aprovado', indice: GMB_ETAPA_INDICE.aprovado };
  if (post.arte && post.texto) return { id: 'arte', indice: GMB_ETAPA_INDICE.arte };
  if (post.texto) return { id: 'texto', indice: GMB_ETAPA_INDICE.texto };
  return { id: 'pauta', indice: GMB_ETAPA_INDICE.pauta };
}

function gmbEtapaRotulo(etapa, post) {
  return {
    pauta: ['bg-gray-100 text-gray-700', 'Falta o texto'],
    texto: ['bg-yellow-100 text-yellow-800', 'Falta a arte'],
    arte: ['bg-yellow-100 text-yellow-800', 'Falta aprovar'],
    aprovado: ['bg-blue-100 text-blue-800', 'Falta programar na ficha'],
    programado: ['bg-gray-100 text-gray-700', `Programado para ${gmbDataCurta(post.data)} ${GMB_HORA_POST}h${post.publicarPeloServidor ? ' (pelo servidor)' : ''}`],
    erroServidor: ['bg-red-100 text-red-700', `Servidor não publicou: ${etapa.erro || 'erro'}`],
    naoSaiu: ['bg-red-100 text-red-700', 'Não saiu: o servidor estava desligado no dia'],
    publicado: ['bg-green-100 text-green-800', `Publicado em ${gmbDataCurta(etapa.data || post.data)}`],
    recusado: ['bg-red-100 text-red-700', 'Recusado pelo Google']
  }[etapa.id];
}

// SEO local: palavra-chave e Varginha nos 150 caracteres que o Google mostra antes do "Mais".
function gmbSeoPost(post) {
  const inicio = gmbSemAcento((post.texto || '').slice(0, 150));
  const chave = gmbSemAcento(post.termo || '').replace(/ varginha$/, '').replace(/^financeira em$/, 'financeira');
  return { chave: !!chave && inicio.includes(chave), cidade: inicio.includes('varginha'), tamanho: (post.texto || '').length };
}

// Próximo ciclo: mês seguinte ao último post planejado, com os prazos no mês anterior a ele.
function gmbProximoCiclo(posts, hoje) {
  const ultimo = posts.reduce((m, p) => (p.data > m ? p.data : m), hoje);
  const [ano, mes] = ultimo.split('-').map(Number);
  const alvo = mes === 12 ? `${ano + 1}-01` : `${ano}-${gmbPad(mes + 1)}`;
  const prazos = {};
  GMB_ETAPAS.filter(e => e.prazo).forEach(e => {
    const data = `${ultimo.slice(0, 7)}-${gmbPad(e.prazo)}`;
    const falta = gmbDiaNumero(data) - gmbDiaNumero(hoje);
    prazos[e.id] = { data, falta, texto: falta < 0 ? 'atrasado' : falta === 0 ? 'hoje' : `em ${falta} dia${falta === 1 ? '' : 's'}` };
  });
  return { mes: alvo, prazos };
}

function gmbEstadoPosts() {
  const posts = Array.isArray(window.SPEED_GMB_POSTS_PLANO) ? window.SPEED_GMB_POSTS_PLANO : [];
  const etapas = lerGmbEtapas();
  const legado = lerGmbPostsFeitos();
  const hoje = gmbHoje();
  const hora = new Date().getHours();
  const itens = posts.map(post => ({ post, reg: etapas[post.id] || {}, etapa: gmbEtapaPost(post, etapas[post.id], legado[post.id], hoje, hora) }));
  const contar = id => itens.filter(x => x.etapa.id === id).length;
  return {
    posts, itens, hoje,
    total: posts.length,
    publicados: contar('publicado'),
    programados: contar('programado'),
    recusados: contar('recusado'),
    pendentes: itens.filter(x => x.etapa.indice < GMB_ETAPA_INDICE.programado && x.etapa.id !== 'recusado').length,
    concluidas: GMB_ETAPAS.map((e, i) => itens.filter(x => x.etapa.indice >= i).length),
    ciclo: gmbProximoCiclo(posts, hoje)
  };
}

function gmbBarraEtapas(indice, recusado) {
  return `<div class="gmb-etapa-segmentos ${recusado ? 'gmb-etapa-recusado' : ''}" aria-hidden="true">${GMB_ETAPAS.map((e, i) => `<span class="${i <= indice ? 'gmb-seg-ok' : ''}" title="${escaparHtml(e.titulo)}"></span>`).join('')}</div>`;
}

function renderGmbEtapas(estado) {
  const caixa = document.getElementById('gmbPostsEtapas');
  if (!caixa) return;
  const { total, concluidas, ciclo, recusados } = estado;
  caixa.innerHTML = `
    <p class="gmb-ciclo-linha">Próximo ciclo: <strong>${gmbMesNome(ciclo.mes)}</strong> • pauta até ${gmbDataCurta(ciclo.prazos.pauta.data)} (${ciclo.prazos.pauta.texto})${recusados ? ` • <span class="text-red-700 font-bold">${recusados} recusado${recusados > 1 ? 's' : ''} pelo Google</span>` : ''}</p>
    <div class="gmb-etapas">${GMB_ETAPAS.map((e, i) => {
      const pct = total ? Math.round((concluidas[i] / total) * 100) : 0;
      const prazo = ciclo.prazos[e.id];
      return `<div class="gmb-etapa ${total && concluidas[i] === total ? 'gmb-etapa-completa' : ''}">
        <p class="gmb-etapa-num">${i + 1}. ${escaparHtml(e.titulo)}</p>
        <p class="gmb-etapa-conta"><strong>${concluidas[i]}</strong>/${total}</p>
        <div class="gmb-etapa-barra"><span style="width:${pct}%"></span></div>
        <p class="gmb-etapa-prazo">${prazo ? `${gmbMesNome(ciclo.mes)}: até ${gmbDataCurta(prazo.data)} <span class="${prazo.falta < 0 ? 'text-red-700' : ''}">(${prazo.texto})</span>` : 'Conferir toda segunda'}</p>
        <p class="gmb-etapa-dica">${escaparHtml(e.dica)}</p>
      </div>`;
    }).join('')}</div>`;
}

// Bloco da Visão Geral (index.html, #gmbCicloResumo).
function renderGmbCicloResumo() {
  const caixa = document.getElementById('gmbCicloResumo');
  if (!caixa || !Array.isArray(window.SPEED_GMB_POSTS_PLANO)) return;
  const estado = gmbEstadoPosts();
  const { total, concluidas, ciclo, recusados } = estado;
  caixa.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
      <p class="text-sm font-bold text-gray-900"><i class="fab fa-google text-red-600 mr-1"></i> Esteira de posts da ficha no Google</p>
      <p class="text-[11px] text-gray-500">Próximo ciclo ${gmbMesNome(ciclo.mes)}: pauta até ${gmbDataCurta(ciclo.prazos.pauta.data)} (${ciclo.prazos.pauta.texto})${recusados ? ` • <span class="text-red-700 font-bold">${recusados} recusado${recusados > 1 ? 's' : ''}</span>` : ''}</p>
    </div>
    <div class="gmb-etapas gmb-etapas-compacto">${GMB_ETAPAS.map((e, i) => `
      <div class="gmb-etapa ${total && concluidas[i] === total ? 'gmb-etapa-completa' : ''}">
        <p class="gmb-etapa-num">${i + 1}. ${escaparHtml(e.titulo)}</p>
        <p class="gmb-etapa-conta"><strong>${concluidas[i]}</strong>/${total}</p>
        <div class="gmb-etapa-barra"><span style="width:${total ? Math.round((concluidas[i] / total) * 100) : 0}%"></span></div>
      </div>`).join('')}</div>`;
}

function renderGmbPostsPlano() {
  const container = document.getElementById('gmbPostsContainer');
  if (!container || !Array.isArray(window.SPEED_GMB_POSTS_PLANO)) return;
  const estado = gmbEstadoPosts();
  const { itens, hoje } = estado;
  const filtro = document.getElementById('gmbPostsFiltro')?.value || 'todos';
  const passa = ({ etapa }) => filtro === 'todos'
    || (filtro === 'pendentes' && etapa.indice < GMB_ETAPA_INDICE.programado && etapa.id !== 'recusado')
    || etapa.id === filtro;
  const semanas = new Map();
  itens.filter(passa).forEach(item => {
    const chave = gmbSegunda(item.post.data);
    if (!semanas.has(chave)) semanas.set(chave, []);
    semanas.get(chave).push(item);
  });

  container.innerHTML = [...semanas].map(([segunda, lista]) => `
    <div class="gmb-posts-semana">
      <p class="gmb-posts-semana-titulo">Semana de ${gmbDataCurta(segunda)} a ${gmbDataCurta(gmbSomarDias(segunda, 4))}</p>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${lista.map(({ post, reg, etapa }) => {
          const rotulo = gmbEtapaRotulo(etapa, post);
          const seo = gmbSeoPost(post);
          const publicado = etapa.id === 'publicado';
          const hojeClasse = post.data === hoje && !publicado ? 'gmb-post-hoje' : '';
          const acoes = [];
          if (etapa.id === 'arte') acoes.push(`<button type="button" data-gmb-post-acao="aprovar" data-id="${post.id}" class="gmb-btn-primario">Aprovar</button>`);
          if (etapa.id === 'aprovado') {
            acoes.push(`<button type="button" data-gmb-post-acao="programar" data-id="${post.id}" class="gmb-btn-primario">Marcar programado na ficha</button>`);
            acoes.push(`<button type="button" data-gmb-post-acao="desaprovar" data-id="${post.id}" class="gmb-btn-link">Desfazer aprovação</button>`);
          }
          if (etapa.id === 'programado' || publicado) acoes.push(`<button type="button" data-gmb-post-acao="recusar" data-id="${post.id}" class="gmb-btn-link gmb-btn-perigo">Google recusou</button>`);
          if (etapa.id === 'programado' && reg.programado) acoes.push(`<button type="button" data-gmb-post-acao="desprogramar" data-id="${post.id}" class="gmb-btn-link">Desfazer programado</button>`);
          if (etapa.id === 'recusado') acoes.push(`<button type="button" data-gmb-post-acao="reprogramar" data-id="${post.id}" class="gmb-btn-primario">Reprogramado</button>`);
          return `<div class="gmb-post-card ${etapa.id === 'recusado' ? 'gmb-rotina-atrasada' : ''} ${hojeClasse} ${publicado ? 'gmb-post-feito' : ''}">
            <div class="flex items-center justify-between gap-2 mb-2">
              <p class="text-sm font-black text-gray-900">${gmbDiaSemana(post.data)} ${gmbDataCurta(post.data)}</p>
              <span class="status-badge ${rotulo[0]} text-[10px]">${rotulo[1]}</span>
            </div>
            ${gmbBarraEtapas(etapa.indice, etapa.id === 'recusado')}
            <div class="flex flex-wrap gap-1.5 mb-2">
              <span class="gmb-post-tema">${escaparHtml(post.tema)}</span>
              <span class="gmb-post-termo" title="Busca que o post reforça">busca: ${escaparHtml(post.termo)}</span>
            </div>
            <div class="flex flex-wrap gap-1.5 mb-2">
              <span class="gmb-seo ${seo.chave ? 'gmb-seo-ok' : 'gmb-seo-falha'}" title="A palavra-chave aparece nos 150 primeiros caracteres">${seo.chave ? '✓' : '✗'} busca no início</span>
              <span class="gmb-seo ${seo.cidade ? 'gmb-seo-ok' : 'gmb-seo-falha'}" title="Varginha aparece nos 150 primeiros caracteres">${seo.cidade ? '✓' : '✗'} Varginha no início</span>
              <span class="gmb-seo ${seo.tamanho <= 1500 ? 'gmb-seo-ok' : 'gmb-seo-falha'}" title="O Google aceita até 1.500 caracteres">${seo.tamanho}/1.500</span>
            </div>
            ${post.arte ? `<a href="${escaparHtml(post.arte.arquivo)}" target="_blank" rel="noopener" class="gmb-post-arte" title="Abrir a arte em tamanho real"><img src="${escaparHtml(post.arte.arquivo)}" alt="Arte do post de ${gmbDataCurta(post.data)}: ${escaparHtml(post.arte.titulo.replace(/\*/g, ''))}" loading="lazy"></a>` : ''}
            <div class="gmb-post-texto">${escaparHtml(post.texto)}</div>
            <p class="text-[11px] text-gray-600 mt-2"><strong>Foto:</strong> ${escaparHtml(post.foto)}</p>
            <p class="text-[11px] text-gray-600"><strong>Botão:</strong> ${escaparHtml(post.botao)}${post.link ? ` (${escaparHtml(post.link)})` : ''}</p>
            <div class="gmb-rotina-acoes">
              ${acoes.join('')}
              <button type="button" data-gmb-post-copiar="${post.id}" class="gmb-btn-link">Copiar texto</button>
              ${post.arte ? `<a href="${escaparHtml(post.arte.arquivo)}" download="speed-${post.data}.png" class="gmb-btn-link">Baixar arte</a>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('') || '<p class="results-empty">Nenhum post nesta etapa.</p>';

  renderGmbEtapas(estado);
  renderGmbCicloResumo();
  const resumo = document.getElementById('gmbPostsResumo');
  if (resumo) {
    resumo.textContent = `${estado.publicados} publicados • ${estado.programados} programados • ${estado.pendentes} pendentes • ${estado.recusados} recusados`;
    resumo.className = `status-badge text-[10px] ${estado.recusados ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-800'}`;
  }
}

function setupGmbPostsPlano() {
  const container = document.getElementById('gmbPostsContainer');
  if (!container || container.dataset.pronto) return;
  container.dataset.pronto = '1';
  document.getElementById('gmbPostsFiltro')?.addEventListener('change', renderGmbPostsPlano);
  container.addEventListener('click', ev => {
    const copiar = ev.target.closest('[data-gmb-post-copiar]');
    if (copiar) {
      const post = (window.SPEED_GMB_POSTS_PLANO || []).find(item => item.id === copiar.dataset.gmbPostCopiar);
      if (post) copiarTexto(post.texto, 'Texto do post copiado. Cole em Adicionar atualização na ficha.');
      return;
    }
    const botao = ev.target.closest('[data-gmb-post-acao]');
    if (!botao) return;
    const post = (window.SPEED_GMB_POSTS_PLANO || []).find(item => item.id === botao.dataset.id);
    if (!post) return;
    const etapas = lerGmbEtapas();
    const reg = { ...(etapas[post.id] || {}) };
    const hoje = gmbHoje();
    const dia = gmbDataCurta(post.data);
    const mensagens = {
      aprovar: () => { reg.aprovado = hoje; return `Post de ${dia} aprovado.`; },
      desaprovar: () => { delete reg.aprovado; return 'Aprovação desfeita.'; },
      programar: () => { reg.programado = hoje; return `Post de ${dia} marcado como programado na ficha.`; },
      desprogramar: () => { delete reg.programado; return 'Programação desfeita.'; },
      recusar: () => { reg.recusado = hoje; registrarGmbTarefa('post', hoje); return `Post de ${dia} marcado como recusado. Corrija e programe de novo na ficha.`; },
      reprogramar: () => { delete reg.recusado; reg.programado = hoje; return `Post de ${dia} programado de novo.`; }
    };
    const acao = mensagens[botao.dataset.gmbPostAcao];
    if (!acao) return;
    const msg = acao();
    if (Object.keys(reg).length) etapas[post.id] = reg; else delete etapas[post.id];
    salvarGmbEtapas(etapas);
    renderGmbPostsPlano();
    renderGmbRotina();
    mostrarToast(msg);
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
