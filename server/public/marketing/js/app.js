// app.js - Lógica principal do Dashboard da Speed Financeira

// Estado global da aplicação
const AppState = {
  activeTab: 'overview',
  posts: [],
  selectedPost: null,
  postFilter: 'todos',
  adFilter: 'todas',
  adSearch: '',
  roi: {
    orcamento: 1000,
    cpc: 3.20,
    taxaConversaoLead: 12,
    taxaFechamento: 20,
    ticketComissao: 850
  }
};

// Caminho relativo às imagens de posts (dashboard está em marketing/dashboard/, imagens em marketing/social/posts/)
const POSTS_IMG_BASE = 'social/posts/';
const POST_STATUS_VALIDOS = new Set(['rascunho', 'revisao', 'aprovado', 'publicado']);
let modalTriggerAnterior = null;

function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, caractere => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[caractere]);
}

function escaparStringJs(valor) {
  return JSON.stringify(String(valor ?? '')).slice(1, -1).replace(/</g, '\\u003c');
}

function normalizarStatusPost(status) {
  return POST_STATUS_VALIDOS.has(status) ? status : 'rascunho';
}

function obterImagemPost(nomeArquivo) {
  const nome = String(nomeArquivo || '');
  if (!nome || nome.includes('..') || !/^[a-zA-Z0-9_./-]+$/.test(nome)) return '';
  return `${POSTS_IMG_BASE}${nome}`;
}

function salvarPostsLocais() {
  const posts = AppState.posts.map(({ artePreview, ...post }) => post);
  localStorage.setItem('speed_posts_custom', JSON.stringify(posts));
}

function lerJsonStorage(chave, fallback) {
  try {
    const valor = localStorage.getItem(chave);
    return valor === null ? fallback : JSON.parse(valor);
  } catch (erro) {
    console.warn(`Dados locais inválidos em ${chave}; usando valor padrão.`, erro);
    return fallback;
  }
}

// Inicialização após o DOM estar pronto
document.addEventListener('DOMContentLoaded', () => {
  initData();
  setupNavigation();
  setupEventListeners();
  // Carrega status salvo do checklist GMB antes do renderOverview
  if (typeof loadGmbChecklistFromStorage === 'function') loadGmbChecklistFromStorage();
  renderOverview();
  renderPosts();
  renderGoogleAds();
  renderMetaAds();
  renderMarketingCopys();
  gerarLinkUtmCustomizado();
  calcularROI();
  // Módulo GMB: inicializa renderização
  if (typeof initGMB === 'function') initGMB();
  // Módulo Calendário: inicializa régua editorial semanal
  if (typeof initCalendario === 'function') initCalendario();
  // Módulo Simuladores de Balcão, Correção NAP e Backup
  if (typeof initSimuladoresEBackup === 'function') initSimuladoresEBackup();
  if (typeof initRaioX === 'function') initRaioX();
  const hashSolicitada = window.location.hash.replace('#', '');
  const abaSolicitada = hashSolicitada === 'raiox' ? 'gmb' : hashSolicitada;
  if (abaSolicitada && document.getElementById(`tab-${abaSolicitada}`)) switchTab(abaSolicitada);
});

// Posts salvos (com as edições) prevalecem; posts novos do posts_fila.js entram no topo pelo id.
function mesclarPostsFila(salvos, fila) {
  const ids = new Set(salvos.map(post => post.id));
  const novos = fila.filter(post => post && post.id && !ids.has(post.id));
  return [...JSON.parse(JSON.stringify(novos)), ...salvos];
}

// Carrega os dados de posts do arquivo posts_fila.js ou localStorage
function initData() {
  const localSaved = lerJsonStorage('speed_posts_custom', null);
  const fila = Array.isArray(window.POSTS_FILA) ? window.POSTS_FILA : [];
  AppState.posts = mesclarPostsFila(Array.isArray(localSaved) ? localSaved : [], fila);

  if (AppState.posts.length > 0 && !AppState.selectedPost) {
    AppState.selectedPost = AppState.posts[0];
  }

  // Carrega configurações da Calculadora de ROI salvas
  const savedRoi = lerJsonStorage('speed_roi_settings', null);
  if (savedRoi && typeof savedRoi === 'object' && !Array.isArray(savedRoi)) {
    AppState.roi = { ...AppState.roi, ...savedRoi };
  }
}

// Navegação de abas
function setupNavigation() {
  const buttons = document.querySelectorAll('.nav-tab-btn');
  buttons.forEach((btn, indice) => {
    btn.tabIndex = indice === 0 ? 0 : -1;
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
    btn.addEventListener('keydown', evento => {
      const teclas = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
      if (!teclas.includes(evento.key)) return;
      evento.preventDefault();
      let destino = indice;
      if (evento.key === 'ArrowRight') destino = (indice + 1) % buttons.length;
      if (evento.key === 'ArrowLeft') destino = (indice - 1 + buttons.length) % buttons.length;
      if (evento.key === 'Home') destino = 0;
      if (evento.key === 'End') destino = buttons.length - 1;
      buttons[destino].focus();
      switchTab(buttons[destino].getAttribute('data-tab'));
    });
  });
}

function switchTab(tabId) {
  if (tabId === 'artes') {
    switchTab('social');
    setTimeout(() => document.getElementById('tab-artes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    return;
  }
  AppState.activeTab = tabId;

  // Atualiza botões
  document.querySelectorAll('.nav-tab-btn').forEach(b => {
    const ativa = b.getAttribute('data-tab') === tabId;
    b.classList.toggle('active', ativa);
    b.setAttribute('aria-selected', String(ativa));
    b.tabIndex = ativa ? 0 : -1;
    if (ativa) b.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  });

  // Atualiza painéis
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const ativa = panel.id === `tab-${tabId}`;
    panel.classList.toggle('hidden', !ativa);
    panel.setAttribute('aria-hidden', String(!ativa));
  });

  if (tabId === 'social') {
    renderPosts();
    renderMockup();
    if (typeof window.refreshArtPreview === 'function') window.refreshArtPreview();
  } else if (tabId === 'ads') {
    renderGoogleAds();
    calcularROI();
  } else if (tabId === 'overview') {
    renderOverview();
  } else if (tabId === 'marketing') {
    if (typeof calcularSimuladorFGTS === 'function') calcularSimuladorFGTS();
    if (typeof calcularSimuladorPortabilidade === 'function') calcularSimuladorPortabilidade();
  } else if (tabId === 'gmb') {
    if (typeof loadGmbChecklistFromStorage === 'function') loadGmbChecklistFromStorage();
    if (typeof initGMB === 'function') initGMB();
    if (typeof renderCentralCorrecaoNAP === 'function') renderCentralCorrecaoNAP();
    if (typeof initRaioX === 'function') initRaioX();
  } else if (tabId === 'calendario') {
    if (typeof renderCalendario === 'function') renderCalendario();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function abrirCriadorDoPost(postId) {
  const post = AppState.posts.find(item => item.id === postId) || AppState.selectedPost;
  if (!post) return;
  AppState.selectedPost = post;
  switchTab('social');
  document.dispatchEvent(new CustomEvent('speed:edit-art', { detail: { postId: post.id } }));
  setTimeout(() => document.getElementById('tab-artes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

// Event Listeners Gerais
function setupEventListeners() {
  document.addEventListener('keydown', evento => {
    const modal = document.getElementById('modalEdicaoPost');
    if (!modal || modal.classList.contains('hidden')) return;
    if (evento.key === 'Escape') {
      fecharModalEdicao();
      return;
    }
    if (evento.key !== 'Tab') return;
    const focaveis = [...modal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (!focaveis.length) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  });

  // Filtros de posts
  document.querySelectorAll('.post-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.post-filter-btn').forEach(b => {
        b.classList.remove('bg-gray-900', 'text-white');
        b.classList.add('bg-white', 'text-gray-700');
      });
      btn.classList.remove('bg-white', 'text-gray-700');
      btn.classList.add('bg-gray-900', 'text-white');

      AppState.postFilter = btn.getAttribute('data-filter');
      renderPosts();
    });
  });

  // Busca de anúncios
  const adSearchInput = document.getElementById('adSearchInput');
  if (adSearchInput) {
    adSearchInput.addEventListener('input', (e) => {
      AppState.adSearch = e.target.value.toLowerCase();
      renderGoogleAds();
    });
  }

  // Filtro de campanhas de anúncios
  const adCampaignFilter = document.getElementById('adCampaignFilter');
  if (adCampaignFilter) {
    adCampaignFilter.addEventListener('change', (e) => {
      AppState.adFilter = e.target.value;
      renderGoogleAds();
    });
  }

  // Sliders da Calculadora de ROI
  const sliderOrcamento = document.getElementById('sliderOrcamento');
  const sliderCpc = document.getElementById('sliderCpc');
  const sliderConvLead = document.getElementById('sliderConvLead');
  const sliderFechamento = document.getElementById('sliderFechamento');
  const sliderComissao = document.getElementById('sliderComissao');

  function salvarRoiStorage() {
    localStorage.setItem('speed_roi_settings', JSON.stringify(AppState.roi));
  }

  if (sliderOrcamento) {
    sliderOrcamento.value = AppState.roi.orcamento;
    document.getElementById('valOrcamento').innerText = `R$ ${AppState.roi.orcamento.toLocaleString('pt-BR')}`;
    sliderOrcamento.addEventListener('input', (e) => {
      AppState.roi.orcamento = parseFloat(e.target.value);
      document.getElementById('valOrcamento').innerText = `R$ ${AppState.roi.orcamento.toLocaleString('pt-BR')}`;
      salvarRoiStorage();
      calcularROI();
    });
  }

  if (sliderCpc) {
    sliderCpc.value = AppState.roi.cpc;
    document.getElementById('valCpc').innerText = `R$ ${AppState.roi.cpc.toFixed(2)}`;
    sliderCpc.addEventListener('input', (e) => {
      AppState.roi.cpc = parseFloat(e.target.value);
      document.getElementById('valCpc').innerText = `R$ ${AppState.roi.cpc.toFixed(2)}`;
      salvarRoiStorage();
      calcularROI();
    });
  }

  if (sliderConvLead) {
    sliderConvLead.value = AppState.roi.taxaConversaoLead;
    document.getElementById('valConvLead').innerText = `${AppState.roi.taxaConversaoLead}%`;
    sliderConvLead.addEventListener('input', (e) => {
      AppState.roi.taxaConversaoLead = parseFloat(e.target.value);
      document.getElementById('valConvLead').innerText = `${AppState.roi.taxaConversaoLead}%`;
      salvarRoiStorage();
      calcularROI();
    });
  }

  if (sliderFechamento) {
    sliderFechamento.value = AppState.roi.taxaFechamento;
    document.getElementById('valFechamento').innerText = `${AppState.roi.taxaFechamento}%`;
    sliderFechamento.addEventListener('input', (e) => {
      AppState.roi.taxaFechamento = parseFloat(e.target.value);
      document.getElementById('valFechamento').innerText = `${AppState.roi.taxaFechamento}%`;
      salvarRoiStorage();
      calcularROI();
    });
  }

  if (sliderComissao) {
    sliderComissao.value = AppState.roi.ticketComissao;
    document.getElementById('valComissao').innerText = `R$ ${AppState.roi.ticketComissao.toLocaleString('pt-BR')}`;
    sliderComissao.addEventListener('input', (e) => {
      AppState.roi.ticketComissao = parseFloat(e.target.value);
      document.getElementById('valComissao').innerText = `R$ ${AppState.roi.ticketComissao.toLocaleString('pt-BR')}`;
      salvarRoiStorage();
      calcularROI();
    });
  }
}

// -------------------------------------------------------------
// RENDERIZAÇÃO: VISÃO GERAL (OVERVIEW)
// -------------------------------------------------------------
function renderOverview() {
  const totPosts = AppState.posts.length;
  const totAprovados = AppState.posts.filter(p => p.status === 'aprovado' || p.status === 'publicado').length;
  const totGoogleKeywords = window.SPEED_ADS_DATA ? window.SPEED_ADS_DATA.campanhas_google.reduce((acc, c) => acc + c.palavras_chave.length, 0) : 31;
  const totCopys = window.SPEED_MARKETING_DATA ? window.SPEED_MARKETING_DATA.copys_whatsapp.length : 7;

  document.getElementById('kpi-tot-posts').innerText = totPosts;
  document.getElementById('kpi-tot-aprovados').innerText = totAprovados;
  document.getElementById('kpi-tot-keywords').innerText = totGoogleKeywords;
  document.getElementById('kpi-tot-copys').innerText = totCopys;

  const elGmb = document.getElementById('kpi-gmb-score');
  if (elGmb && window.SPEED_GMB_DATA) {
    const itens = window.SPEED_GMB_DATA.checklist_ficha;
    const pesoTotal = itens.reduce((s, i) => s + i.peso, 0);
    const pesoOk = itens.filter(i => i.status === 'ok').reduce((s, i) => s + i.peso, 0);
    const score = Math.round((pesoOk / pesoTotal) * 100);
    elGmb.innerText = score + '%';
  }

  // Renderiza o banner dinâmico da Pauta de Hoje na Visão Geral
  if (typeof renderPautaDeHoje === 'function') renderPautaDeHoje();

  // Carrega lista resumida dos posts mais recentes
  const recentContainer = document.getElementById('overview-recent-posts');
  if (recentContainer) {
    recentContainer.innerHTML = '';
    const slice = AppState.posts.slice(0, 3);
    if (slice.length === 0) {
      recentContainer.innerHTML = '<p class="text-xs text-gray-500 py-4">Nenhum post na fila ainda. Clique na aba Social Mídia para gerar.</p>';
      return;
    }
    slice.forEach(post => {
      const el = document.createElement('div');
      el.className = 'flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition';
      const imgSrc = escaparHtml(obterImagemPost(post.imagem));
      const status = normalizarStatusPost(post.status);
      el.innerHTML = `
        <img src="${imgSrc}" alt="Prévia do post" class="w-12 h-12 rounded object-cover border border-gray-200" onerror="this.onerror=null; this.src='https://placehold.co/100x100?text=Speed'">
        <div class="flex-grow min-w-0">
          <p class="text-xs font-bold text-gray-900 truncate">${escaparHtml(post.manchete || post.titulo)}</p>
          <p class="text-[11px] text-gray-500 truncate">${escaparHtml(post.linha || 'Crédito Consciente')}</p>
        </div>
        <span class="status-badge status-${status}">${status}</span>
      `;
      recentContainer.appendChild(el);
    });
  }
}

// -------------------------------------------------------------
// RENDERIZAÇÃO: SOCIAL MÍDIA
// -------------------------------------------------------------
function renderPosts() {
  const container = document.getElementById('postsContainer');
  if (!container) return;

  container.innerHTML = '';

  const filtered = AppState.posts.filter(p => {
    if (AppState.postFilter === 'todos') return true;
    return p.status === AppState.postFilter;
  });

  // Atualizar contadores
  const tot = AppState.posts.length;
  const rasc = AppState.posts.filter(p => !p.status || p.status === 'rascunho').length;
  const rev = AppState.posts.filter(p => p.status === 'revisao').length;
  const apr = AppState.posts.filter(p => p.status === 'aprovado').length;
  const pub = AppState.posts.filter(p => p.status === 'publicado').length;

  document.getElementById('badge-tot-fila').innerText = tot;
  document.getElementById('badge-tot-rascunho').innerText = rasc;
  document.getElementById('badge-tot-revisao').innerText = rev;
  document.getElementById('badge-tot-aprovado').innerText = apr;
  document.getElementById('badge-tot-publicado').innerText = pub;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center text-gray-500">
        <i class="fas fa-folder-open text-4xl text-gray-300 mb-3"></i>
        <p class="text-sm font-semibold">Nenhum post encontrado nesta categoria.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(post => {
    const card = document.createElement('div');
    const isSelected = AppState.selectedPost && AppState.selectedPost.id === post.id;
    card.className = `social-post-card card-premium ${isSelected ? 'is-selected' : ''}`;
    
    const imgSrc = escaparHtml(post.artePreview || obterImagemPost(post.imagem));
    const status = normalizarStatusPost(post.status);
    const postIdJs = escaparStringJs(post.id);

    card.innerHTML = `
      <img src="${imgSrc}" alt="Miniatura de ${escaparHtml(post.manchete || post.titulo)}" class="social-post-thumb" onerror="this.onerror=null; this.src='https://placehold.co/160x200/019652/FFFFFF?text=Speed'">
      <div class="social-post-content">
        <div class="social-post-meta"><span>${escaparHtml(post.calendarioDiaNome || post.linha || 'Editorial')}</span><span class="status-badge status-${status}">${status}</span></div>
        <h4>${escaparHtml(post.manchete || post.titulo)}</h4>
        <p>${escaparHtml(post.sub || '')}</p>
        <div class="social-post-actions">
          <button type="button" onclick="event.stopPropagation(); selecionarPost('${postIdJs}')">Prévia</button>
          <button type="button" onclick="event.stopPropagation(); abrirModalEdicao('${postIdJs}')">Editar texto</button>
          <button type="button" onclick="event.stopPropagation(); abrirCriadorDoPost('${postIdJs}')">Criar arte <i class="fas fa-arrow-right" aria-hidden="true"></i></button>
        </div>
      </div>`;

    card.addEventListener('click', () => {
      selecionarPost(post.id);
    });

    container.appendChild(card);
  });
}

function selecionarPost(postId) {
  const post = AppState.posts.find(p => p.id === postId);
  if (!post) return;
  AppState.selectedPost = post;
  renderPosts();
  renderMockup();
}

function renderMockup() {
  const post = AppState.selectedPost;
  const mockupImage = document.getElementById('mockupPostImage');
  const mockupCaption = document.getElementById('mockupPostCaption');
  const mockupHeadline = document.getElementById('mockupHeadline');
  const mockupSub = document.getElementById('mockupSub');
  const mockupStatusBadge = document.getElementById('mockupStatusBadge');

  if (!post) return;

  const imgSrc = post.artePreview || obterImagemPost(post.imagem);
  if (mockupImage) {
    mockupImage.src = imgSrc;
    mockupImage.onerror = () => {
      mockupImage.src = 'https://placehold.co/600x600/019652/FFFFFF?text=Speed+Financeira';
    };
  }

  if (mockupHeadline) mockupHeadline.innerText = post.manchete || post.titulo;
  if (mockupSub) mockupSub.innerText = post.sub || '';

  if (mockupStatusBadge) {
    const status = normalizarStatusPost(post.status);
    mockupStatusBadge.className = `status-badge status-${status}`;
    mockupStatusBadge.innerText = status;
  }

  if (mockupCaption) {
    const legenda = post.legenda_ig || post.legenda_fb || 'Nenhuma legenda cadastrada.';
    mockupCaption.innerHTML = `<strong>speedfinanceira</strong> ${formatarLegendaHtml(legenda)}`;
  }
}

function formatarLegendaHtml(texto) {
  return escaparHtml(texto || '')
    .replace(/\n/g, '<br>')
    .replace(/(#[a-zA-Z0-9_]+)/g, '<span class="text-blue-600 font-semibold">$1</span>');
}

// Modal de edição rápida
function abrirModalEdicao(postId) {
  const post = AppState.posts.find(p => p.id === postId);
  if (!post) return;

  document.getElementById('editPostId').value = post.id;
  document.getElementById('editManchete').value = post.manchete || post.titulo || '';
  document.getElementById('editSub').value = post.sub || '';
  document.getElementById('editCta').value = post.cta || '';
  document.getElementById('editLegenda').value = post.legenda_ig || post.legenda_fb || '';
  document.getElementById('editStatus').value = post.status || 'rascunho';

  verificarComplianceEdicao();
  const modal = document.getElementById('modalEdicaoPost');
  modalTriggerAnterior = document.activeElement;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('editManchete').focus();
}

function fecharModalEdicao() {
  const modal = document.getElementById('modalEdicaoPost');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  if (modalTriggerAnterior && typeof modalTriggerAnterior.focus === 'function') modalTriggerAnterior.focus();
}

function salvarEdicaoPost() {
  const id = document.getElementById('editPostId').value;
  const post = AppState.posts.find(p => p.id === id);
  if (!post) return;

  post.manchete = document.getElementById('editManchete').value.trim();
  post.sub = document.getElementById('editSub').value.trim();
  post.cta = document.getElementById('editCta').value.trim();
  post.legenda_ig = document.getElementById('editLegenda').value.trim();
  post.legenda_fb = post.legenda_ig;
  post.status = document.getElementById('editStatus').value;

  // Persiste no localStorage
  salvarPostsLocais();

  fecharModalEdicao();
  renderPosts();
  renderMockup();
  renderOverview();
  mostrarToast('Post atualizado e salvo localmente com sucesso!');
}

function alterarStatusPostSelecionado(novoStatus) {
  if (!AppState.selectedPost) return;
  AppState.selectedPost.status = novoStatus;
  salvarPostsLocais();
  renderPosts();
  renderMockup();
  renderOverview();
  mostrarToast(`Status alterado para: ${novoStatus.toUpperCase()}`);
}

function verificarComplianceEdicao() {
  const texto = document.getElementById('editLegenda').value;
  const temSemCobranca = /sem cobrança antecipada/i.test(texto);
  const temAnalise = /sujeito à análise/i.test(texto);
  const temTaxas = /(?:taxa|cet|custo efetivo total)/i.test(texto);

  const indicator = document.getElementById('complianceIndicator');
  if (temSemCobranca && temAnalise && temTaxas) {
    indicator.className = 'text-xs text-green-700 bg-green-50 p-2 rounded-lg border border-green-200 flex items-center gap-1.5';
    indicator.innerHTML = '<i class="fas fa-check-circle"></i> <strong>Checklist textual completo:</strong> ainda requer revisão humana da peça, produto, taxas e instituição contratante.';
  } else {
    indicator.className = 'text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200 flex items-center gap-1.5';
    indicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <strong>Checklist textual incompleto:</strong> revise análise de crédito, ausência de cobrança antecipada e informação de taxas/CET. Esta checagem não certifica conformidade.';
  }
}

function copiarLegenda(postId) {
  const post = AppState.posts.find(p => p.id === postId) || AppState.selectedPost;
  if (!post) return;
  const texto = post.legenda_ig || post.legenda_fb || '';
  copiarTexto(texto, 'Legenda copiada para a área de transferência!');
}

function exportarJsonRevisao() {
  const posts = AppState.posts.map(({ artePreview, ...post }) => post);
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(posts, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", "revisao_speed_posts.json");
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  mostrarToast('Arquivo de revisão baixado! Execute APLICAR_REVISAO.bat para sincronizar.');
}

// -------------------------------------------------------------
// RENDERIZAÇÃO: MARKETING & COPYS WHATSAPP
// -------------------------------------------------------------
function renderMarketingCopys() {
  const container = document.getElementById('marketingCopysContainer');
  if (!container || !window.SPEED_MARKETING_DATA) return;

  container.innerHTML = '';
  const copys = window.SPEED_MARKETING_DATA.copys_whatsapp;

  copys.forEach(copy => {
    const card = document.createElement('div');
    card.className = 'card-premium p-5 flex flex-col justify-between';
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="text-xs font-bold text-green-800 bg-green-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
            <i class="fas ${copy.icone || 'fa-tag'}"></i> ${copy.produto}
          </span>
          <span class="text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            ${copy.badge}
          </span>
        </div>
        <h4 class="text-base font-bold text-gray-900 mb-1">${copy.titulo}</h4>
        <p class="text-xs text-gray-500 mb-3 italic">Público: ${copy.destinatario}</p>
        <div class="bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-xs text-gray-800 font-sans whitespace-pre-line leading-relaxed mb-4 max-h-56 overflow-y-auto" id="text-${copy.id}">
${copy.texto}
        </div>
      </div>

      <div class="flex items-center gap-2 pt-3 border-t border-gray-100">
        <button onclick="copiarTextoDoId('text-${copy.id}')" class="flex-1 bg-green-700 hover:bg-green-800 text-white font-bold text-xs py-2 px-3 rounded-lg transition flex items-center justify-center gap-1.5 shadow-sm">
          <i class="fas fa-copy"></i> Copiar Mensagem
        </button>
        <button onclick="dispararWhatsappComTexto('text-${copy.id}')" class="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs py-2 px-3 rounded-lg transition flex items-center justify-center gap-1" title="Abrir WhatsApp Web">
          <i class="fab fa-whatsapp text-green-600 text-base"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  // Renderizar pedidos de review
  const reviewsContainer = document.getElementById('marketingReviewsContainer');
  if (reviewsContainer && window.SPEED_MARKETING_DATA.pedidos_review_google) {
    reviewsContainer.innerHTML = '';
    window.SPEED_MARKETING_DATA.pedidos_review_google.forEach((rev, idx) => {
      const card = document.createElement('div');
      card.className = 'border border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col justify-between';
      card.innerHTML = `
        <div>
          <span class="text-xs font-bold text-yellow-800 bg-yellow-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
            <i class="fas fa-star text-yellow-500"></i> Avaliação Google 5★
          </span>
          <h5 class="text-sm font-bold text-gray-900 mt-2 mb-1">${rev.titulo}</h5>
          <p class="text-xs text-gray-500 mb-3">${rev.descricao}</p>
          <div class="bg-white border border-gray-200 p-3 rounded-lg text-xs text-gray-700 whitespace-pre-line font-mono mb-3" id="rev-text-${idx}">
${rev.texto}
          </div>
        </div>
        <button onclick="copiarTextoDoId('rev-text-${idx}')" class="w-full bg-white hover:bg-gray-100 text-gray-900 border border-gray-300 font-bold text-xs py-2 rounded-lg transition flex items-center justify-center gap-1.5">
          <i class="fas fa-copy text-green-600"></i> Copiar Modelo de Review
        </button>
      `;
      reviewsContainer.appendChild(card);
    });
  }
}

function dispararWhatsappComTexto(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const texto = encodeURIComponent(el.innerText.trim());
  window.open(`https://wa.me/553530675017?text=${texto}`, '_blank', 'noopener,noreferrer');
}

// Origem e meio no padrão do Google Analytics 4; valores fora do padrão caem em "Não atribuído".
const UTM_CANAIS = {
  instagram_bio: { utm_source: 'instagram', utm_medium: 'social', utm_content: 'bio' },
  instagram_stories: { utm_source: 'instagram', utm_medium: 'social', utm_content: 'stories' },
  facebook_post: { utm_source: 'facebook', utm_medium: 'social', utm_content: 'post' },
  whatsapp_status: { utm_source: 'whatsapp', utm_medium: 'social', utm_content: 'status' },
  panfleto_rua: { utm_source: 'panfleto', utm_medium: 'qrcode', utm_content: 'rua' },
  google_meu_negocio: { utm_source: 'google', utm_medium: 'organic', utm_content: 'perfil_empresa' }
};

// Chamado ao abrir o painel e a cada troca de produto ou canal.
function gerarLinkUtmCustomizado() {
  const produto = document.getElementById('utmProduto').value;
  const { utm_content, ...origem } = UTM_CANAIS[document.getElementById('utmCanal').value] || UTM_CANAIS.instagram_bio;
  const anchor = produto === 'inss' || produto === 'veiculos' ? '#servicos' : '#simular';
  const parametros = new URLSearchParams({ ...origem, utm_campaign: `${produto}_varginha`, utm_content });
  document.getElementById('utmResultado').value = `https://speedfinanceira.com.br/?${parametros}${anchor}`;
}

// -------------------------------------------------------------
// RENDERIZAÇÃO: ANÚNCIOS (GOOGLE ADS & META ADS)
// -------------------------------------------------------------
function renderGoogleAds() {
  const container = document.getElementById('googleAdsKeywordsTable');
  if (!container || !window.SPEED_ADS_DATA) return;

  container.innerHTML = '';
  const campanhas = window.SPEED_ADS_DATA.campanhas_google;

  let totalKeywords = 0;

  campanhas.forEach(camp => {
    if (AppState.adFilter !== 'todas' && camp.categoria !== AppState.adFilter) return;

    camp.palavras_chave.forEach(kw => {
      if (AppState.adSearch && !kw.termo.includes(AppState.adSearch) && !camp.nome_amigavel.toLowerCase().includes(AppState.adSearch)) {
        return;
      }

      totalKeywords++;
      const tr = document.createElement('tr');
      tr.className = 'border-b border-gray-100 hover:bg-gray-50 transition text-xs';
      tr.innerHTML = `
        <td class="py-2.5 px-3 font-semibold text-gray-900">${kw.termo}</td>
        <td class="py-2.5 px-3 text-gray-600">${camp.nome_amigavel}</td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded text-[11px] font-bold ${kw.tipo === 'Exata' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}">
            ${kw.tipo}
          </span>
        </td>
        <td class="py-2.5 px-3 font-mono font-bold text-gray-900">R$ ${kw.cpc_max.toFixed(2)}</td>
        <td class="py-2.5 px-3">
          <button onclick="copiarTexto('${kw.url}')" class="text-green-700 hover:text-green-900 font-semibold" title="Copiar URL Final com UTM">
            <i class="fas fa-link mr-1"></i> Copiar URL
          </button>
        </td>
      `;
      container.appendChild(tr);
    });
  });

  const countBadge = document.getElementById('adKeywordsCountBadge');
  if (countBadge) countBadge.innerText = `${totalKeywords} palavras-chave`;
}

function renderMetaAds() {
  const container = document.getElementById('metaAdsContainer');
  if (!container || !window.SPEED_ADS_DATA) return;

  container.innerHTML = '';
  const estrategias = window.SPEED_ADS_DATA.meta_ads_estrategia;

  estrategias.forEach(meta => {
    const card = document.createElement('div');
    card.className = 'card-premium p-5 flex flex-col justify-between';
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="text-xs font-bold text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
            <i class="fab fa-instagram"></i> Meta Ads
          </span>
          <span class="text-[11px] font-bold text-green-800 bg-green-100 px-2 py-0.5 rounded">
            ${meta.badge}
          </span>
        </div>
        <h4 class="text-base font-bold text-gray-900 mb-1">${meta.titulo}</h4>
        <p class="text-xs text-gray-500 mb-3"><i class="fas fa-bullseye text-blue-600 mr-1"></i> <strong>Objetivo:</strong> ${meta.objetivo}</p>

        <div class="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs space-y-2 mb-4">
          <p><strong>📍 Raio / Praça:</strong> ${meta.publico.localizacao}</p>
          <p><strong>👥 Faixa Etária:</strong> ${meta.publico.idade}</p>
          <p><strong>🎯 Interesses:</strong> ${meta.publico.interesses}</p>
          ${meta.publico.observacao ? `<p class="text-amber-800 bg-amber-50 p-2 rounded border border-amber-200"><strong>💡 Dica:</strong> ${meta.publico.observacao}</p>` : ''}
        </div>

        <div class="border-l-4 border-yellow-400 pl-3 py-1 mb-4">
          <p class="text-[11px] uppercase font-bold text-gray-500">Gancho do Criativo (Copy do Anúncio):</p>
          <p class="text-xs font-semibold text-gray-900 mt-0.5">"${meta.gancho}"</p>
        </div>
      </div>

      <div class="pt-3 border-t border-gray-100 flex items-center gap-2">
        <button onclick="copiarTexto('${meta.gancho}')" class="flex-1 bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 font-bold text-xs py-2 rounded-lg transition flex items-center justify-center gap-1">
          <i class="fas fa-copy"></i> Copiar Gancho
        </button>
        <button onclick="copiarTexto('${meta.link_whatsapp_pre}')" class="flex-1 bg-green-700 hover:bg-green-800 text-white font-bold text-xs py-2 rounded-lg transition flex items-center justify-center gap-1">
          <i class="fab fa-whatsapp"></i> Copiar Resposta
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// -------------------------------------------------------------
// CALCULADORA DE ROI & ORÇAMENTO DE ANÚNCIOS
// -------------------------------------------------------------
function calcularROI() {
  const { orcamento, cpc, taxaConversaoLead, taxaFechamento, ticketComissao } = AppState.roi;

  // Cálculos matemáticos
  const cliquesEstimados = Math.floor(orcamento / cpc);
  const leadsEstimados = Math.floor(cliquesEstimados * (taxaConversaoLead / 100));
  const contratosEstimados = Math.round(leadsEstimados * (taxaFechamento / 100));
  const faturamentoEstimado = contratosEstimados * ticketComissao;
  const saldoAposMidia = faturamentoEstimado - orcamento;
  const retornoSobreMidia = ((saldoAposMidia / orcamento) * 100).toFixed(0);
  const cpl = leadsEstimados > 0 ? (orcamento / leadsEstimados).toFixed(2) : '0.00';
  const cpa = contratosEstimados > 0 ? (orcamento / contratosEstimados).toFixed(2) : '0.00';

  // Atualização dos elementos na tela
  document.getElementById('resCliques').innerText = cliquesEstimados.toLocaleString('pt-BR');
  document.getElementById('resLeads').innerText = leadsEstimados.toLocaleString('pt-BR');
  document.getElementById('resContratos').innerText = contratosEstimados.toLocaleString('pt-BR');
  document.getElementById('resFaturamento').innerText = `R$ ${faturamentoEstimado.toLocaleString('pt-BR')}`;
  document.getElementById('resLucroLiquido').innerText = `R$ ${saldoAposMidia.toLocaleString('pt-BR')}`;
  document.getElementById('resRoi').innerText = `${retornoSobreMidia}% (${(faturamentoEstimado / orcamento).toFixed(1)}x)`;
  document.getElementById('resCpl').innerText = `R$ ${cpl}`;
  document.getElementById('resCpa').innerText = `R$ ${cpa}`;
}

// -------------------------------------------------------------
// UTILITÁRIOS: CLIPBOARD & TOAST
// -------------------------------------------------------------
async function copiarTexto(texto, mensagemSucesso = 'Copiado para a área de transferência!') {
  try {
    await navigator.clipboard.writeText(String(texto ?? ''));
    mostrarToast(mensagemSucesso);
    return true;
  } catch (erro) {
    console.error('Não foi possível copiar o conteúdo.', erro);
    mostrarToast('Não foi possível copiar automaticamente. Selecione e copie o conteúdo manualmente.', 'erro');
    return false;
  }
}

function copiarTextoDoId(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const texto = 'value' in el ? el.value : el.innerText;
  copiarTexto(String(texto || '').trim());
}

function mostrarToast(mensagem, tipo = 'sucesso') {
  let toast = document.getElementById('toastNotification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastNotification';
    toast.className = 'bg-gray-900 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border border-gray-700';
    document.body.appendChild(toast);
  }
  toast.replaceChildren();
  const icone = document.createElement('i');
  icone.className = tipo === 'erro' ? 'fas fa-exclamation-circle text-red-400' : 'fas fa-check-circle text-green-400';
  const texto = document.createElement('span');
  texto.textContent = String(mensagem);
  toast.append(icone, texto);
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}
