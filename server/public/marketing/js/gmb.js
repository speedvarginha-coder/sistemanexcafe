// gmb.js — Módulo de Gestão do Google Meu Negócio
// Speed Financeira | Varginha/MG

// ─── INICIALIZAÇÃO DO MÓDULO GMB ────────────────────────────────────────────
function initGMB() {
  if (typeof renderGmbPlano === 'function') renderGmbPlano();
  renderGmbScore();
  renderGmbChecklist();
  renderGmbPosts();
  renderGmbAvaliacoes();
  renderGmbQA();
  renderGmbFotos();
  renderGmbNAP();
}

// Helper para proteger números de telefone, horários, CEP e marcas de quebrarem no meio da linha
function formatarTextoSemQuebras(texto) {
  if (!texto) return '';
  return texto
    // Protege telefones como (35) 3067-5017 e 3113-0458
    .replace(/(\(?35\)?\s*3067-5017)/g, '<span class="whitespace-nowrap font-bold text-gray-900">$1</span>')
    .replace(/(3113-0458)/g, '<span class="whitespace-nowrap font-bold text-red-700">$1</span>')
    // Protege horários como 09h–18h, Seg–Sex
    .replace(/(Seg[–-]Sex\s*\d{2}h[–-]\d{2}h)/g, '<span class="whitespace-nowrap font-semibold text-gray-900">$1</span>')
    .replace(/(Sábado e Domingo:\s*fechado)/gi, '<span class="whitespace-nowrap font-semibold">$1</span>')
    // Protege CEP
    .replace(/(37002-090|37048-420)/g, '<span class="whitespace-nowrap font-semibold text-gray-900">$1</span>')
    // Protege termos com aspas
    .replace(/('Speed Financeira'|'Speed Financeira e Lan House')/g, '<span class="whitespace-nowrap font-bold">$1</span>');
}

// ─── ÍNDICE INTERNO DE EXECUÇÃO ─────────────────────────────────────────────
function renderGmbScore() {
  const data = window.SPEED_GMB_DATA;
  if (!data) return;

  const itens = data.checklist_ficha;
  const pesoTotal = itens.reduce((s, i) => s + i.peso, 0);
  const pesoOk    = itens.filter(i => i.status === 'ok').reduce((s, i) => s + i.peso, 0);
  const score = Math.round((pesoOk / pesoTotal) * 100);

  const el = document.getElementById('gmbScoreValue');
  const ring = document.getElementById('gmbScoreRing');
  const scoreLabel = document.getElementById('gmbScoreLabel');

  if (el) el.innerText = score + '%';

  if (ring) {
    const radius = 46;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    ring.style.strokeDasharray = `${circumference}`;
    ring.style.strokeDashoffset = `${offset}`;
    ring.style.stroke = score >= 70 ? '#019652' : score >= 40 ? '#f59e0b' : '#dc2626';
  }

  if (scoreLabel) {
    if (score < 40)       scoreLabel.innerText = 'Execução inicial';
    else if (score < 70)  scoreLabel.innerText = 'Execução intermediária';
    else if (score < 90)  scoreLabel.innerText = 'Execução avançada';
    else                  scoreLabel.innerText = 'Checklist quase completo';
  }

  // Itens ok / pendentes
  const totOk = itens.filter(i => i.status === 'ok').length;
  const totPend = itens.filter(i => i.status === 'pendente').length;
  const elOk = document.getElementById('gmbItemsOk');
  const elPend = document.getElementById('gmbItemsPend');
  if (elOk) elOk.innerText = totOk;
  if (elPend) elPend.innerText = totPend;
}

// ─── CHECKLIST DE COMPLETUDE BASEADO NO WHITESPARK 2026 ─────────────────────
function renderGmbChecklist() {
  const container = document.getElementById('gmbChecklistContainer');
  if (!container || !window.SPEED_GMB_DATA) return;

  container.innerHTML = '';
  const itens = window.SPEED_GMB_DATA.checklist_ficha;
  const wsGrupos = window.SPEED_GMB_DATA.whitespark_2026?.pesos_local_pack || {};

  itens.forEach(item => {
    const ok = item.status === 'ok';
    const grp = wsGrupos[item.grupo] || { nome: item.grupo, badge: 'bg-gray-100 text-gray-700' };

    const div = document.createElement('div');
    div.className = `checklist-card flex items-start gap-3 p-3.5 rounded-xl border transition hover:shadow-sm ${ok ? 'bg-green-50/60 border-green-200' : 'bg-white border-gray-200 hover:border-amber-300'}`;
    
    div.innerHTML = `
      <div class="shrink-0 mt-0.5 cursor-pointer" onclick="toggleGmbItem('${item.id}')" title="Clique para alternar status">
        ${ok
          ? `<span class="w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-xs shadow-sm hover:bg-green-700 transition"><i class="fas fa-check"></i></span>`
          : `<span class="w-6 h-6 rounded-full border-2 border-dashed border-amber-400 bg-amber-50/50 flex items-center justify-center text-xs text-amber-600 hover:bg-amber-100 transition"><i class="fas fa-clock"></i></span>`}
      </div>
      <div class="flex-grow min-w-0">
        <div class="flex items-center justify-between gap-2 mb-1 flex-wrap">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${grp.badge} whitespace-nowrap">${grp.nome}</span>
            ${item.rank_ws ? `<span class="text-[9px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded whitespace-nowrap">${item.rank_ws}</span>` : ''}
          </div>
          <span class="text-[10px] font-bold shrink-0 whitespace-nowrap ${ok ? 'text-green-700 bg-green-100 border border-green-200' : 'text-amber-700 bg-amber-100 border border-amber-200'} px-2 py-0.5 rounded-full">+${item.peso} pts</span>
        </div>
        <p class="text-xs font-bold leading-snug mb-1 ${ok ? 'text-green-950 line-through opacity-85' : 'text-gray-900'}">${item.label}</p>
        <p class="text-[11px] text-gray-600 leading-relaxed">${formatarTextoSemQuebras(item.dica)}</p>
      </div>
      <button onclick="toggleGmbItem('${item.id}')" class="shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition shadow-sm whitespace-nowrap ml-1 ${ok ? 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100' : 'bg-green-700 text-white border-green-700 hover:bg-green-800'}">
        ${ok ? '✓ Concluído' : 'Marcar Feito'}
      </button>
    `;
    container.appendChild(div);
  });
}

function toggleGmbItem(id) {
  const item = window.SPEED_GMB_DATA.checklist_ficha.find(i => i.id === id);
  if (!item) return;
  item.status = item.status === 'ok' ? 'pendente' : 'ok';

  // Persistência no localStorage
  const saved = lerJsonStorage('speed_gmb_checklist', {});
  saved[id] = item.status;
  localStorage.setItem('speed_gmb_checklist', JSON.stringify(saved));

  renderGmbScore();
  renderGmbChecklist();
  mostrarToast(`Critério ${item.status === 'ok' ? 'marcado como concluído' : 'retornado para pendente'}! Índice interno atualizado.`);
}

function loadGmbChecklistFromStorage() {
  const saved = lerJsonStorage('speed_gmb_checklist', {});
  if (!window.SPEED_GMB_DATA) return;
  window.SPEED_GMB_DATA.checklist_ficha.forEach(item => {
    if (saved[item.id] !== undefined) item.status = saved[item.id];
  });
}

// ─── POSTS DO GOOGLE MEU NEGÓCIO ────────────────────────────────────────────
function renderGmbPosts() {
  const container = document.getElementById('gmbPostsContainer');
  if (!container || !window.SPEED_GMB_DATA) return;

  container.innerHTML = '';
  const posts = window.SPEED_GMB_DATA.posts_gmb;

  posts.forEach(post => {
    const badgeColor = {
      oferta: 'bg-orange-100 text-orange-800',
      atualizacao: 'bg-blue-100 text-blue-800',
      evento: 'bg-purple-100 text-purple-800'
    }[post.tipo] || 'bg-gray-100 text-gray-700';

    const tipoIcon = {
      oferta: 'fa-tag',
      atualizacao: 'fa-bell',
      evento: 'fa-calendar-star'
    }[post.tipo] || 'fa-file-alt';

    const card = document.createElement('div');
    card.className = 'card-premium p-5 flex flex-col justify-between';
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full ${badgeColor} flex items-center gap-1">
            <i class="fas ${tipoIcon}"></i> ${post.tipo.charAt(0).toUpperCase() + post.tipo.slice(1)}
          </span>
          <span class="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded font-semibold">${post.categoria_produto}</span>
        </div>

        <h4 class="text-sm font-bold text-gray-900 mb-2 leading-snug">${post.titulo}</h4>

        <div class="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-700 whitespace-pre-line leading-relaxed mb-3 max-h-44 overflow-y-auto" id="gmb-post-${post.id}">
${post.corpo}
        </div>

        <div class="bg-blue-50 border border-blue-100 rounded-lg p-2 text-[11px] text-blue-800 flex items-start gap-1.5">
          <i class="fas fa-lightbulb text-blue-500 mt-0.5 shrink-0"></i>
          <span>${post.dica}</span>
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2">
        <button onclick="copiarTextoDoId('gmb-post-${post.id}')" class="flex-1 bg-green-700 hover:bg-green-800 text-white font-bold text-xs py-2 rounded-lg transition flex items-center justify-center gap-1.5 shadow-sm">
          <i class="fas fa-copy"></i> Copiar Texto do Post
        </button>
        <a href="https://business.google.com/posts" target="_blank" rel="noopener noreferrer" class="bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 font-bold text-xs py-2 px-3 rounded-lg transition flex items-center gap-1" title="Abrir Painel GMB">
          <i class="fab fa-google text-red-500"></i> Publicar
        </a>
      </div>
    `;
    container.appendChild(card);
  });
}

// ─── MODELOS DE RESPOSTAS PARA AVALIAÇÕES ──────────────────────────────────
function renderGmbAvaliacoes() {
  const container = document.getElementById('gmbAvaliacoesContainer');
  if (!container || !window.SPEED_GMB_DATA) return;

  container.innerHTML = '';
  const modelos = window.SPEED_GMB_DATA.respostas_avaliacoes;

  const estrelasBadge = {
    positiva_5_estrelas_nomeada: { cor: 'text-yellow-500', txt: '⭐⭐⭐⭐⭐', label: '5 Estrelas' },
    positiva_5_estrelas_generica:{ cor: 'text-yellow-500', txt: '⭐⭐⭐⭐⭐', label: '5 Estrelas (sem texto)' },
    positiva_4_estrelas:         { cor: 'text-yellow-400', txt: '⭐⭐⭐⭐', label: '4 Estrelas' },
    negativa_com_contexto:       { cor: 'text-red-500',    txt: '⭐⭐', label: '1–3 Estrelas' },
    negativa_processo_credito:   { cor: 'text-red-500',    txt: '⭐', label: 'Negativa de Crédito' }
  };

  modelos.forEach((modelo, idx) => {
    const badge = estrelasBadge[modelo.tipo] || { cor: 'text-gray-500', txt: '⭐', label: modelo.label };
    const card = document.createElement('div');
    card.className = 'card-premium p-5 flex flex-col justify-between';
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="text-sm font-bold ${badge.cor}">${badge.txt}</span>
          <span class="text-[11px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">${badge.label}</span>
        </div>
        <p class="text-[11px] text-gray-500 mb-1 italic">"${modelo.exemplo_avaliacao}"</p>
        <div class="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-800 whitespace-pre-line leading-relaxed mb-2 max-h-40 overflow-y-auto" id="gmb-av-${idx}">
${modelo.resposta}
        </div>
        <p class="text-[10px] text-gray-400">💡 Substitua [Nome] pelo nome real do avaliador antes de publicar.</p>
      </div>
      <div class="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
        <button onclick="copiarTextoDoId('gmb-av-${idx}')" class="flex-1 bg-green-700 hover:bg-green-800 text-white font-bold text-xs py-2 rounded-lg transition flex items-center justify-center gap-1.5 shadow-sm">
          <i class="fas fa-copy"></i> Copiar Resposta
        </button>
        <a href="https://business.google.com/" target="_blank" rel="noopener noreferrer" class="bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 font-bold text-xs py-2 px-3 rounded-lg transition flex items-center gap-1">
          <i class="fab fa-google text-red-500"></i> Responder
        </a>
      </div>
    `;
    container.appendChild(card);
  });
}

// ─── PERGUNTAS & RESPOSTAS (Q&A) ────────────────────────────────────────────
function renderGmbQA() {
  const container = document.getElementById('gmbQAContainer');
  if (!container || !window.SPEED_GMB_DATA) return;

  container.innerHTML = '';
  const qas = window.SPEED_GMB_DATA.perguntas_respostas;

  qas.forEach((qa, idx) => {
    const div = document.createElement('div');
    div.className = 'card-premium p-4';
    div.innerHTML = `
      <div class="flex items-start gap-2 mb-2">
        <span class="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">Q</span>
        <p class="text-xs font-bold text-gray-900">${qa.pergunta}</p>
      </div>
      <div class="flex items-start gap-2 mb-3">
        <span class="w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">R</span>
        <p class="text-xs text-gray-700 leading-relaxed" id="gmb-qa-${idx}">${qa.resposta}</p>
      </div>
      <div class="flex gap-2">
        <button onclick="copiarTextoDoId('gmb-qa-${idx}')" class="text-xs font-bold text-green-700 border border-green-300 hover:bg-green-700 hover:text-white px-3 py-1.5 rounded-lg transition flex items-center gap-1">
          <i class="fas fa-copy"></i> Copiar Resposta
        </button>
        <button onclick="copiarTexto('${qa.pergunta}')" class="text-xs font-bold text-gray-600 border border-gray-200 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition flex items-center gap-1">
          <i class="fas fa-question"></i> Copiar Pergunta
        </button>
      </div>
    `;
    container.appendChild(div);
  });
}

// ─── CHECKLIST DE FOTOS ─────────────────────────────────────────────────────
function renderGmbFotos() {
  const container = document.getElementById('gmbFotosContainer');
  if (!container || !window.SPEED_GMB_DATA) return;

  container.innerHTML = '';
  const fotos = window.SPEED_GMB_DATA.checklist_fotos;

  const categorias = [...new Set(fotos.map(f => f.categoria))];

  categorias.forEach(cat => {
    const grupo = document.createElement('div');
    grupo.className = 'mb-4';
    grupo.innerHTML = `<h5 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">${cat}</h5>`;

    fotos.filter(f => f.categoria === cat).forEach((foto, idx) => {
      const storageKey = `speed_gmb_foto_${foto.foto.substring(0, 20)}`;
      const savedStatus = localStorage.getItem(storageKey);
      const status = savedStatus || foto.status;
      const done = status === 'ok';

      const prioColors = { alta: 'text-red-600 bg-red-100', media: 'text-amber-600 bg-amber-100', baixa: 'text-gray-500 bg-gray-100' };
      const prioColor = prioColors[foto.prioridade] || prioColors.baixa;

      const item = document.createElement('div');
      item.className = `flex items-center gap-3 p-2.5 rounded-lg border mb-1.5 transition ${done ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:border-gray-300'}`;
      item.innerHTML = `
        <button onclick="toggleFotoStatus(this, '${storageKey}')" class="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition ${done ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 hover:border-green-500'}">
          ${done ? '<i class="fas fa-check text-[9px]"></i>' : ''}
        </button>
        <p class="text-xs flex-grow ${done ? 'line-through text-gray-400' : 'text-gray-800'}">${foto.foto}</p>
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${prioColor}">${foto.prioridade}</span>
      `;
      grupo.appendChild(item);
    });

    container.appendChild(grupo);
  });
}

function toggleFotoStatus(btn, key) {
  const current = localStorage.getItem(key);
  const novo = current === 'ok' ? 'pendente' : 'ok';
  localStorage.setItem(key, novo);
  renderGmbFotos();
  if (novo === 'ok') mostrarToast('Foto marcada como publicada no Google!');
}

// ─── PAINEL DE NAP ──────────────────────────────────────────────────────────
function renderGmbNAP() {
  const nap = window.SPEED_GMB_DATA && window.SPEED_GMB_DATA.nap_resumo;
  if (!nap) return;

  const score = nap.score;
  const bar = document.getElementById('napScoreBar');
  const label = document.getElementById('napScoreLabel');
  const meta = document.getElementById('napScoreMeta');

  if (bar) {
    bar.style.width = score + '%';
    bar.style.background = score < 30 ? '#dc2626' : score < 60 ? '#f59e0b' : '#019652';
  }
  if (label) label.innerText = score.toFixed(1) + '%';
  if (meta) meta.innerText = `Meta em 90 dias: ${nap.meta_90_dias}%`;
}
