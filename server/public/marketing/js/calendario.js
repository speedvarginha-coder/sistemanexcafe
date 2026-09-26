// calendario.js — Controlador da Régua Editorial Semanal
// Speed Financeira | Instagram, Facebook & Google Meu Negócio

const CalendarioState = {
  filtroDia: 'todos', // 'todos' ou 1..6
  filtroCanal: 'todos' // 'todos', 'social', 'gmb'
};

// Inicialização
function initCalendario() {
  loadCalendarioProgresso();
  setupCalendarioFiltros();
  renderCalendario();
  renderPautaDeHoje();
}

// Retorna o índice do dia atual (1=Segunda ... 6=Sábado, 0=Domingo mapeado para 1)
function getDiaAtualIndice() {
  const diaSemana = new Date().getDay(); // 0 = Domingo, 1 = Segunda, ... 6 = Sábado
  if (diaSemana === 0) return 1; // Se for domingo, adianta a pauta de segunda
  return diaSemana;
}

// Carrega o progresso semanal salvo em localStorage
function loadCalendarioProgresso() {
  // Chave semanal dinâmica para que o progresso resete a cada nova semana
  const semanaChave = getSemanaAnoChave();
  const salvo = lerJsonStorage(`speed_cal_${semanaChave}`, {});
  CalendarioState.progresso = salvo;
}

function salvarCalendarioProgresso() {
  const semanaChave = getSemanaAnoChave();
  localStorage.setItem(`speed_cal_${semanaChave}`, JSON.stringify(CalendarioState.progresso || {}));
}

// Gera chave única por semana (ex: 2026_W39)
function getSemanaAnoChave() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}_W${weekNo}`;
}

// Configura os botões de filtro de dia e canal
function setupCalendarioFiltros() {
  // Filtro por dia
  const btnsDia = document.querySelectorAll('.cal-day-filter');
  btnsDia.forEach(btn => {
    btn.addEventListener('click', () => {
      btnsDia.forEach(b => b.classList.remove('active', 'bg-green-700', 'text-white'));
      btnsDia.forEach(b => b.classList.add('bg-white', 'text-gray-700'));
      btn.classList.remove('bg-white', 'text-gray-700');
      btn.classList.add('active', 'bg-green-700', 'text-white');
      
      CalendarioState.filtroDia = btn.getAttribute('data-day');
      renderCalendario();
    });
  });

  // Filtro por canal (Todos, Instagram/Face, Google)
  const btnsCanal = document.querySelectorAll('.cal-channel-filter');
  btnsCanal.forEach(btn => {
    btn.addEventListener('click', () => {
      btnsCanal.forEach(b => b.classList.remove('active', 'bg-gray-900', 'text-white'));
      btnsCanal.forEach(b => b.classList.add('bg-gray-100', 'text-gray-700'));
      btn.classList.remove('bg-gray-100', 'text-gray-700');
      btn.classList.add('active', 'bg-gray-900', 'text-white');

      CalendarioState.filtroCanal = btn.getAttribute('data-channel');
      renderCalendario();
    });
  });
}

// Renderiza os cards da Régua Semanal
function renderCalendario() {
  const container = document.getElementById('calendarioCardsContainer');
  if (!container || !window.SPEED_CALENDARIO_DATA) return;

  container.innerHTML = '';
  const dias = window.SPEED_CALENDARIO_DATA.dias;
  const diaHoje = getDiaAtualIndice();

  let diasFiltrados = dias;
  if (CalendarioState.filtroDia !== 'todos') {
    const diaNum = parseInt(CalendarioState.filtroDia, 10);
    diasFiltrados = dias.filter(d => d.dia_indice === diaNum);
  }

  diasFiltrados.forEach(dia => {
    const isHoje = dia.dia_indice === diaHoje;
    const progKeySocial = `dia_${dia.dia_indice}_social`;
    const progKeyGmb    = `dia_${dia.dia_indice}_gmb`;
    const isSocialDone  = !!(CalendarioState.progresso && CalendarioState.progresso[progKeySocial]);
    const isGmbDone     = !!(CalendarioState.progresso && CalendarioState.progresso[progKeyGmb]);

    const showSocial = CalendarioState.filtroCanal === 'todos' || CalendarioState.filtroCanal === 'social';
    const showGmb    = CalendarioState.filtroCanal === 'todos' || CalendarioState.filtroCanal === 'gmb';

    const card = document.createElement('div');
    card.className = `card-premium overflow-hidden border-2 transition-all ${isHoje ? 'border-green-600 shadow-lg ring-2 ring-green-100' : 'border-gray-200'}`;

    card.innerHTML = `
      <!-- Cabeçalho do Dia -->
      <div class="bg-gray-50 border-b border-gray-200 px-5 py-3.5 flex flex-wrap justify-between items-center gap-3">
        <div class="flex items-center gap-3">
          <span class="w-9 h-9 rounded-xl bg-gradient-to-br ${dia.cor_tema} text-white flex items-center justify-center text-base shadow-sm shrink-0">
            <i class="fas ${dia.icone}"></i>
          </span>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-bold text-gray-900 text-sm sm:text-base">${dia.dia_nome}</h3>
              ${isHoje ? '<span class="bg-green-600 text-white text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full shadow-sm animate-pulse">Hoje</span>' : ''}
              <span class="border ${dia.badge_cor} text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">${dia.foco_produto}</span>
            </div>
            <p class="text-[11px] text-gray-500 mt-0.5">${dia.foco_estrategico}</p>
          </div>
        </div>

        <div class="flex items-center gap-2 text-xs">
          <span class="text-[11px] text-gray-400 font-semibold hidden sm:inline">Checklist do dia:</span>
          <button onclick="toggleProgressoCalendario('${progKeySocial}')" class="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1.5 ${isSocialDone ? 'bg-pink-100 text-pink-800 border-pink-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}">
            <i class="${isSocialDone ? 'fas fa-check-circle text-pink-600' : 'far fa-circle text-gray-400'}"></i>
            <span>Insta/Face</span>
          </button>
          <button onclick="toggleProgressoCalendario('${progKeyGmb}')" class="px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1.5 ${isGmbDone ? 'bg-red-100 text-red-800 border-red-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}">
            <i class="${isGmbDone ? 'fas fa-check-circle text-red-600' : 'far fa-circle text-gray-400'}"></i>
            <span>Google Ficha</span>
          </button>
        </div>
      </div>

      <!-- Corpo com as 2 Trilhas (Instagram/Face + Google Meu Negócio) -->
      <div class="p-5 grid grid-cols-1 ${showSocial && showGmb ? 'lg:grid-cols-2' : 'grid-cols-1'} gap-5">
        
        <!-- TRILHA 1: INSTAGRAM & FACEBOOK -->
        ${showSocial ? `
        <div class="border rounded-xl p-4 flex flex-col justify-between ${isSocialDone ? 'bg-green-50/30 border-green-200' : 'bg-white border-gray-200'}">
          <div>
            <div class="flex items-center justify-between gap-2 pb-2.5 border-b border-gray-100 mb-3">
              <span class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <i class="${dia.social.icone_canal}"></i> Instagram & Facebook
              </span>
              <span class="text-[10px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                ${dia.social.tipo_formato}
              </span>
            </div>

            <div class="bg-gray-50 rounded-lg p-3 mb-3 border border-gray-100">
              <p class="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Horário de Pico Sugerido:</p>
              <p class="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                <i class="far fa-clock text-pink-600"></i> ${dia.social.horario_recomendado}
              </p>
            </div>

            <div class="mb-3">
              <p class="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Manchete Recomendada para a Imagem:</p>
              <p class="text-xs font-extrabold text-gray-900 leading-snug">"${dia.social.manchete_imagem}"</p>
              <p class="text-[11px] text-gray-500 mt-0.5">${dia.social.sub_imagem}</p>
            </div>

            <div>
              <p class="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Legenda Pronta (com disclaimers CMN 4.935/2021):</p>
              <div class="bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-line leading-relaxed max-h-40 overflow-y-auto" id="cal-legenda-${dia.dia_indice}">
${dia.social.legenda_pronta}
              </div>
            </div>

            <div class="mt-3 p-2.5 bg-yellow-50/70 border border-yellow-200 rounded-lg text-[11px] text-yellow-900 flex items-start gap-1.5">
              <i class="fas fa-lightbulb text-yellow-600 mt-0.5 shrink-0"></i>
              <span>${dia.social.dica_execucao}</span>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2">
            <button onclick="criarPostDaPauta(${dia.dia_indice})" class="flex-1 bg-green-700 hover:bg-green-800 text-white font-bold text-xs py-2 rounded-lg transition flex items-center justify-center gap-1.5" title="Levar a pauta ao Social Mídia e abrir o Criador de Artes">
              <i class="fas fa-palette"></i> Criar post e arte
            </button>
            <button onclick="copiarTextoDoId('cal-legenda-${dia.dia_indice}')" class="flex-1 bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs py-2 rounded-lg transition flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap">
              <i class="fas fa-copy"></i> Copiar Legenda do Post
            </button>
            <button onclick="switchTab('social')" class="bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 font-bold text-xs py-2 px-3 rounded-lg transition whitespace-nowrap" title="Ver no feed/mockup">
              <i class="fas fa-eye text-gray-500"></i> Mockup
            </button>
          </div>
        </div>
        ` : ''}

        <!-- TRILHA 2: GOOGLE MEU NEGÓCIO -->
        ${showGmb ? `
        <div class="border rounded-xl p-4 flex flex-col justify-between ${isGmbDone ? 'bg-green-50/30 border-green-200' : 'bg-white border-gray-200'}">
          <div>
            <div class="flex items-center justify-between gap-2 pb-2.5 border-b border-gray-100 mb-3">
              <span class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <i class="${dia.gmb.icone_canal}"></i> Google Meu Negócio
              </span>
              <span class="text-[10px] font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded">
                ${dia.gmb.tipo_post_gmb}
              </span>
            </div>

            <div class="bg-gray-50 rounded-lg p-3 mb-3 border border-gray-100">
              <p class="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Horário de Publicação no Google:</p>
              <p class="text-xs font-semibold text-gray-800 flex items-center gap-1.5">
                <i class="far fa-clock text-red-600"></i> ${dia.gmb.horario_recomendado}
              </p>
            </div>

            <div class="mb-3">
              <p class="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Título do Post no Maps:</p>
              <p class="text-xs font-extrabold text-gray-900 leading-snug">${dia.gmb.titulo}</p>
            </div>

            <div>
              <p class="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Texto Pronto para a Ficha:</p>
              <div class="bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-line leading-relaxed max-h-40 overflow-y-auto" id="cal-gmb-${dia.dia_indice}">
${dia.gmb.texto_post}
              </div>
            </div>

            <div class="mt-3 p-2.5 bg-blue-50/70 border border-blue-200 rounded-lg text-[11px] text-blue-900 flex items-start gap-1.5">
              <i class="fas fa-info-circle text-blue-600 mt-0.5 shrink-0"></i>
              <span>${dia.gmb.dica_execucao}</span>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2">
            <button onclick="copiarTextoDoId('cal-gmb-${dia.dia_indice}')" class="flex-1 bg-green-700 hover:bg-green-800 text-white font-bold text-xs py-2 rounded-lg transition flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap">
              <i class="fas fa-copy"></i> Copiar Post Google
            </button>
            <a href="https://business.google.com/posts" target="_blank" rel="noopener noreferrer" class="bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 font-bold text-xs py-2 px-3 rounded-lg transition flex items-center gap-1 whitespace-nowrap" title="Abrir Google Posts">
              <i class="fab fa-google text-red-500"></i> Publicar
            </a>
          </div>
        </div>
        ` : ''}

      </div>
    `;

    container.appendChild(card);
  });
}

function criarPostDaPauta(diaIndice) {
  const dia = window.SPEED_CALENDARIO_DATA?.dias?.find(item => item.dia_indice === diaIndice);
  if (!dia || typeof AppState === 'undefined') return;
  const id = `pauta-${getSemanaAnoChave()}-${diaIndice}`;
  let post = AppState.posts.find(item => item.id === id);
  if (!post) {
    post = {
      id,
      calendarioDiaNome: dia.dia_nome,
      linha: dia.foco_produto,
      formato: dia.social.tipo_formato,
      manchete: dia.social.manchete_imagem,
      sub: dia.social.sub_imagem,
      cta: 'Fale com a Speed',
      legenda_ig: dia.social.legenda_pronta,
      legenda_fb: dia.social.legenda_pronta,
      status: 'rascunho',
      imagem: ''
    };
    AppState.posts.unshift(post);
    salvarPostsLocais();
  }
  abrirCriadorDoPost(id);
}

// Alterna o status de concluído do post no dia
function toggleProgressoCalendario(key) {
  if (!CalendarioState.progresso) CalendarioState.progresso = {};
  CalendarioState.progresso[key] = !CalendarioState.progresso[key];
  salvarCalendarioProgresso();
  renderCalendario();
  renderPautaDeHoje();
  mostrarToast('Progresso semanal atualizado!');
}

// Renderiza o banner dinâmico de Pauta do Dia (para a tela de Visão Geral)
function renderPautaDeHoje() {
  const container = document.getElementById('bannerPautaHoje');
  if (!container || !window.SPEED_CALENDARIO_DATA) return;

  const diaHoje = getDiaAtualIndice();
  const diaData = window.SPEED_CALENDARIO_DATA.dias.find(d => d.dia_indice === diaHoje);
  if (!diaData) return;

  const progKeySocial = `dia_${diaData.dia_indice}_social`;
  const progKeyGmb    = `dia_${diaData.dia_indice}_gmb`;
  const isSocialDone  = !!(CalendarioState.progresso && CalendarioState.progresso[progKeySocial]);
  const isGmbDone     = !!(CalendarioState.progresso && CalendarioState.progresso[progKeyGmb]);

  container.innerHTML = `
    <div class="bg-gradient-to-r from-green-900 via-green-800 to-green-700 rounded-2xl p-5 text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="bg-yellow-400 text-gray-900 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">Pauta de Hoje • ${diaData.dia_nome}</span>
          <span class="text-xs text-green-200">${diaData.foco_produto}</span>
        </div>
        <h4 class="text-base sm:text-lg font-bold mt-1 text-white leading-snug">
          "${diaData.social.manchete_imagem}"
        </h4>
        <p class="text-xs text-green-100 mt-1 max-w-2xl leading-relaxed">
          <strong>Instagram/Face:</strong> ${diaData.social.tipo_formato} às ${diaData.social.horario_recomendado} • 
          <strong>Google Meu Negócio:</strong> ${diaData.gmb.tipo_post_gmb} às ${diaData.gmb.horario_recomendado}
        </p>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button onclick="switchTab('calendario')" class="bg-yellow-400 hover:bg-yellow-300 text-gray-900 text-xs font-bold py-2.5 px-4 rounded-xl transition shadow flex items-center gap-1.5 whitespace-nowrap">
          <i class="fas fa-calendar-alt"></i> Ver Calendário Completo
        </button>
      </div>
    </div>
  `;
}
