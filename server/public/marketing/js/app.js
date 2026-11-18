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
  const original = String(nomeArquivo || '');
  const nome = original === 'promo-fgts-204520.png' ? 'fgts-orientacao-speed-2026-11-06.png' : original;
  if (!nome || nome.includes('..') || !/^[a-zA-Z0-9_./-]+$/.test(nome)) return '';
  return `${POSTS_IMG_BASE}${nome}`;
}

function gerarSvgPlaceholderArte(post) {
  const p = post || {};
  const titulo = escaparHtml(p.manchete || p.titulo || 'Post Speed Financeira');
  const sub = escaparHtml(p.sub || 'Consulte condições com nossos especialistas');
  const cta = escaparHtml(p.cta || 'WhatsApp (35) 3067-5017');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
    <defs>
      <linearGradient id="speedGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="40%" stop-color="#022c22"/>
        <stop offset="100%" stop-color="#014b29"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1080" fill="url(#speedGrad)"/>
    <rect x="50" y="50" width="980" height="980" rx="36" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="3"/>

    <!-- Marca Speed -->
    <rect x="90" y="90" width="64" height="64" rx="16" fill="#facc15"/>
    <text x="122" y="136" font-family="system-ui, -apple-system, sans-serif" font-size="38" font-weight="900" fill="#0f172a" text-anchor="middle">S</text>
    <text x="175" y="125" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="800" fill="#ffffff">Speed Financeira</text>
    <text x="175" y="152" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#34d399">Loja Varginha/MG</text>

    <!-- Tag -->
    <rect x="760" y="98" width="230" height="46" rx="23" fill="rgba(245,158,11,0.2)" stroke="#f59e0b" stroke-width="1.5"/>
    <text x="875" y="128" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="700" fill="#fbbf24" text-anchor="middle">Rascunho Editorial</text>

    <!-- Conteúdo Central -->
    <foreignObject x="90" y="240" width="900" height="520">
      <div xmlns="http://www.w3.org/1999/xhtml" style="color: white; font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; justify-content: center; height: 100%;">
        <h1 style="font-size: 52px; font-weight: 900; line-height: 1.18; margin: 0 0 20px 0; color: #ffffff; letter-spacing: -0.02em;">${titulo}</h1>
        <p style="font-size: 26px; font-weight: 500; line-height: 1.45; margin: 0; color: #cbd5e1;">${sub}</p>
      </div>
    </foreignObject>

    <!-- Barra de Rodapé Oficial -->
    <rect x="90" y="850" width="900" height="110" rx="24" fill="#019652"/>
    <text x="540" y="918" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="800" fill="#ffffff" text-anchor="middle">📲 ${cta}</text>
    <text x="540" y="995" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="500" fill="#94a3b8" text-anchor="middle">Rua Santa Cruz, 696 - Centro · Varginha/MG · (35) 3067-5017</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function resolverImagemPost(post) {
  if (!post) return '';
  if (post.artePreview) return post.artePreview;
  if (post.imagem) {
    const imgUrl = obterImagemPost(post.imagem);
    if (imgUrl) return imgUrl;
  }

  // Mapeamento automático de imagem existente para pautas do calendário
  const texto = `${post.titulo || ''} ${post.manchete || ''} ${post.linha || ''}`.toLowerCase();
  if (texto.includes('clt') && (texto.includes('consignado') || texto.includes('carteira') || texto.includes('trabalhador'))) {
    return `${POSTS_IMG_BASE}ad-clt-01-troca-divida.png`;
  }
  if (texto.includes('fgts') || texto.includes('saque-aniversário') || texto.includes('saque aniversario')) {
    return `${POSTS_IMG_BASE}fgts-orientacao-speed-2026-11-06.png`;
  }
  if (texto.includes('consignado') || texto.includes('inss')) {
    return `${POSTS_IMG_BASE}promo-consignado-204504.png`;
  }
  if (texto.includes('portabilidade')) {
    return `${POSTS_IMG_BASE}promo-portabilidade-204534.png`;
  }
  if (texto.includes('avaliaç') || texto.includes('google')) {
    return `${POSTS_IMG_BASE}promo-avaliacoes-204548.png`;
  }
  if (texto.includes('cartão') || texto.includes('cartao') || texto.includes('limite')) {
    return `${POSTS_IMG_BASE}promo-cartao-limite-091634.png`;
  }
  if (texto.includes('refinanciamento')) {
    return `${POSTS_IMG_BASE}promo-refinanciamento-091642.png`;
  }

  return gerarSvgPlaceholderArte(post);
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
    setupLocalNinjaTools();
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
  AppState.posts = mesclarPostsFila(Array.isArray(localSaved) ? localSaved : [], fila).filter(p => p.id !== 'nov-06-atendimento-presencial');

  // Vincula automaticamente imagens reais a posts de pauta salvos sem imagem
  AppState.posts.forEach(p => {
    if (!p.imagem && !p.artePreview) {
      const texto = `${p.titulo || ''} ${p.manchete || ''} ${p.linha || ''}`.toLowerCase();
      if (texto.includes('fgts')) p.imagem = 'fgts-orientacao-speed-2026-11-06.png';
      else if (texto.includes('consignado')) p.imagem = 'promo-consignado-204504.png';
      else if (texto.includes('portabilidade')) p.imagem = 'promo-portabilidade-204534.png';
      else if (texto.includes('avaliaç')) p.imagem = 'promo-avaliacoes-204548.png';
      else if (texto.includes('cartão') || texto.includes('cartao') || texto.includes('limite')) p.imagem = 'promo-cartao-limite-091634.png';
      else if (texto.includes('refinanciamento')) p.imagem = 'promo-refinanciamento-091642.png';
    }
  });

  if (AppState.posts.length > 0 && !AppState.selectedPost) {
    AppState.selectedPost = AppState.posts[0];
  }

  // Carrega configurações da Calculadora de ROI salvas
  const savedRoi = lerJsonStorage('speed_roi_settings', null);
  if (savedRoi && typeof savedRoi === 'object' && !Array.isArray(savedRoi)) {
    AppState.roi = { ...AppState.roi, ...savedRoi };
  }
}

// Navegação de abas & Atalhos de Alta Velocidade (Menos Cliques)
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

  // Pílulas de acesso rápido no topo (1-Clique)
  document.querySelectorAll('.quick-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const tab = pill.getAttribute('data-tab-quick');
      if (tab) switchTab(tab);
    });
  });

  // Atalhos Globais de Teclado (0-Clique): Alt + 1 até Alt + 7
  const mapaAbas = ['overview', 'calendario', 'social', 'marketing', 'ads', 'gmb', 'palavras'];
  document.addEventListener('keydown', evento => {
    if (evento.altKey && !evento.ctrlKey && !evento.shiftKey && !evento.metaKey) {
      const num = parseInt(evento.key, 10);
      if (num >= 1 && num <= mapaAbas.length) {
        evento.preventDefault();
        switchTab(mapaAbas[num - 1]);
      }
    }
  });

  // Botão flutuante de retorno ao topo (1-Clique)
  window.addEventListener('scroll', () => {
    const btn = document.getElementById('btnVoltarTopo');
    if (!btn) return;
    if (window.scrollY > 280) btn.classList.add('visible');
    else btn.classList.remove('visible');
  }, { passive: true });
}

function switchTab(tabId) {
  if (tabId === 'artes') {
    switchTab('social');
    setTimeout(() => document.getElementById('tab-artes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    return;
  }
  AppState.activeTab = tabId;

  if (window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({ type: 'mktTabChanged', tab: tabId }, '*');
    } catch (e) {}
  }

  // Atualiza botões
  document.querySelectorAll('.nav-tab-btn').forEach(b => {
    const ativa = b.getAttribute('data-tab') === tabId;
    b.classList.toggle('active', ativa);
    b.setAttribute('aria-selected', String(ativa));
    b.tabIndex = ativa ? 0 : -1;
    if (ativa) b.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  });

  // Atualiza pílulas de acesso rápido no topo
  document.querySelectorAll('.quick-pill').forEach(pill => {
    const ativa = pill.getAttribute('data-tab-quick') === tabId;
    pill.classList.toggle('active', ativa);
  });

  // Atualiza grupos de aba na sidebar
  document.querySelectorAll('.sidebar-tab-group').forEach(group => {
    const ativa = group.getAttribute('data-tab-group') === tabId;
    group.classList.toggle('active', ativa);
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

  // Andamento da esteira de posts da ficha no Google (js/gmb_plano.js)
  if (typeof renderGmbCicloResumo === 'function') renderGmbCicloResumo();

  // Renderiza o banner dinâmico da Pauta de Hoje na Visão Geral
  if (typeof renderPautaDeHoje === 'function') renderPautaDeHoje();

  renderPendenciasOverview();

  // Fila de posts das redes: os que precisam de ação primeiro (rascunho e revisão), depois os prontos.
  const recentContainer = document.getElementById('overview-recent-posts');
  if (recentContainer) {
    recentContainer.innerHTML = '';
    const ordem = { revisao: 0, rascunho: 1, aprovado: 2, publicado: 3 };
    const slice = AppState.posts
      .map((post, i) => ({ post, i, status: normalizarStatusPost(post.status) }))
      .sort((a, b) => ordem[a.status] - ordem[b.status] || a.i - b.i)
      .slice(0, 5);
    if (slice.length === 0) {
      recentContainer.innerHTML = '<p class="ov-vazio">A fila está vazia. Os posts gerados aparecem aqui para revisão; abra Social &amp; Artes para criar um.</p>';
      return;
    }
    const rotulo = { rascunho: 'Rascunho', revisao: 'Em revisão', aprovado: 'Aprovado', publicado: 'Publicado' };
    slice.forEach(({ post, status }) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'ov-post';
      el.addEventListener('click', () => switchTab('social'));
      el.innerHTML = `
        <img src="${escaparHtml(resolverImagemPost(post))}" alt="" class="ov-post-img" loading="lazy">
        <span class="ov-post-texto">
          <strong>${escaparHtml(post.manchete || post.titulo)}</strong>
          <span>${escaparHtml(post.linha || 'Crédito consciente')}</span>
        </span>
        <span class="status-badge status-${status}">${rotulo[status]}</span>
      `;
      el.querySelector('img').addEventListener('error', function () { this.style.visibility = 'hidden'; }, { once: true });
      recentContainer.appendChild(el);
    });
  }
}

// "Esperando você" na Visão Geral: o que precisa de uma decisão hoje, com o atalho para resolver.
function renderPendenciasOverview() {
  const lista = document.getElementById('overview-pendencias');
  if (!lista) return;
  const contar = s => AppState.posts.filter(p => normalizarStatusPost(p.status) === s).length;
  const revisar = contar('rascunho') + contar('revisao');
  const aprovados = contar('aprovado');
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const itens = [];
  itens.push(revisar
    ? { tom: 'acao', icone: 'fab fa-instagram', texto: `${plural(revisar, 'post das redes para revisar', 'posts das redes para revisar')}`, aba: 'social', botao: 'Revisar' }
    : { tom: 'ok', icone: 'fab fa-instagram', texto: 'Nenhum post das redes esperando revisão', aba: 'social', botao: 'Abrir' });
  if (aprovados) itens.push({ tom: 'info', icone: 'fas fa-paper-plane', texto: `${plural(aprovados, 'post aprovado', 'posts aprovados')} para agendar ou publicar`, aba: 'social', botao: 'Ver' });
  if (typeof gmbEstadoPosts === 'function' && Array.isArray(window.SPEED_GMB_POSTS_PLANO)) {
    const g = gmbEstadoPosts();
    const hoje = g.itens.find(x => x.post.data === g.hoje);
    if (g.recusados) itens.push({ tom: 'alerta', icone: 'fab fa-google', texto: `${plural(g.recusados, 'post da ficha recusado', 'posts da ficha recusados')} pelo Google`, aba: 'gmb', botao: 'Corrigir' });
    if (hoje) itens.push({ tom: hoje.etapa.id === 'publicado' ? 'ok' : 'acao', icone: 'fab fa-google', texto: `Post da ficha de hoje: ${hoje.etapa.id === 'publicado' ? 'publicado' : String((typeof gmbEtapaRotulo === 'function' && gmbEtapaRotulo(hoje.etapa, hoje.post) || [])[1] || 'em andamento').toLowerCase()}`, aba: 'gmb', botao: 'Ver' });
    const prazo = g.ciclo && g.ciclo.prazos && g.ciclo.prazos.pauta;
    if (prazo) itens.push({ tom: prazo.falta < 0 ? 'alerta' : 'info', icone: 'fas fa-flag', texto: `Pauta da ficha de ${gmbMesNome(g.ciclo.mes)}: até ${gmbDataCurta(prazo.data)} (${prazo.texto})`, aba: 'gmb', botao: 'Abrir' });
  }
  lista.innerHTML = itens.map(i => `
    <li class="ov-pendencia ov-pendencia-${i.tom}">
      <i class="${i.icone} ov-pendencia-icone" aria-hidden="true"></i>
      <span class="ov-pendencia-texto">${escaparHtml(i.texto)}</span>
      <button type="button" onclick="switchTab('${i.aba}')" class="ov-pendencia-btn">${i.botao}</button>
    </li>`).join('');
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
    
    const imgSrc = escaparHtml(resolverImagemPost(post));
    const status = normalizarStatusPost(post.status);
    const postIdJs = escaparStringJs(post.id);

    card.innerHTML = `
      <img src="${imgSrc}" alt="Miniatura de ${escaparHtml(post.manchete || post.titulo)}" class="social-post-thumb" onerror="this.onerror=null; this.src=resolverImagemPost(post)">
      <div class="social-post-content">
        <div class="social-post-meta"><span>${escaparHtml(post.calendarioDiaNome || post.linha || 'Editorial')}</span><span class="status-badge status-${status}">${status}</span></div>
        <h4>${escaparHtml(post.manchete || post.titulo)}</h4>
        <p>${escaparHtml(post.sub || '')}</p>
        <div class="social-post-actions">
          <button type="button" class="btn-quick-copy" onclick="event.stopPropagation(); copiarLegendaDoPost('${postIdJs}')" title="Copiar legenda com 1 clique para colar no Instagram/Facebook"><i class="fas fa-copy"></i> Copiar Legenda</button>
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

function copiarLegendaDoPost(postId) {
  const post = AppState.posts.find(p => p.id === postId);
  if (!post) return;
  const texto = post.legenda || post.texto || `${post.manchete || post.titulo}\n\n${post.sub || ''}\n\n📲 Atendimento: WhatsApp (35) 3067-5017\n📍 Rua Santa Cruz, 696 - Centro, Varginha/MG`;
  copiarTexto(texto, 'Legenda do post copiada para Instagram/WhatsApp!');
}

function abrirFormularioResultado() {
  const det = document.getElementById('resultsEntry');
  if (det) {
    det.open = true;
    det.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => document.getElementById('resultsDate')?.focus(), 150);
  }
}

function selecionarPost(postId) {
  const post = AppState.posts.find(p => p.id === postId);
  if (!post) return;
  AppState.selectedPost = post;
  renderPosts();
  renderMockup();
}

function montarNavegacaoCarrossel(post, imagem) {
  document.getElementById('speedCarouselNav')?.remove();
  if (!imagem || !Array.isArray(post.imagens) || post.imagens.length < 2) return;
  const urls = post.imagens.map(obterImagemPost).filter(Boolean);
  if (urls.length < 2) return;
  const nav = document.createElement('div');
  nav.id = 'speedCarouselNav';
  nav.setAttribute('role', 'group');
  nav.setAttribute('aria-label', 'Telas do carrossel');
  nav.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:12px;padding:12px;background:#fff;color:#014b29';
  const anterior = document.createElement('button');
  const proxima = document.createElement('button');
  const contador = document.createElement('span');
  contador.setAttribute('aria-live', 'polite');
  anterior.type = proxima.type = 'button';
  anterior.textContent = 'Anterior';
  proxima.textContent = 'Próxima';
  for (const botao of [anterior, proxima]) botao.style.cssText = 'padding:8px 14px;border:1px solid #019652;border-radius:8px;font-weight:600;cursor:pointer';
  let atual = 0;
  function mostrar() {
    imagem.src = urls[atual];
    imagem.alt = `${post.titulo || post.manchete || 'Carrossel'} — tela ${atual + 1} de ${urls.length}`;
    contador.textContent = `${atual + 1} / ${urls.length}`;
    anterior.disabled = atual === 0;
    proxima.disabled = atual === urls.length - 1;
  }
  anterior.addEventListener('click', () => { if (atual > 0) { atual--; mostrar(); } });
  proxima.addEventListener('click', () => { if (atual < urls.length - 1) { atual++; mostrar(); } });
  nav.append(anterior, contador, proxima);
  imagem.parentElement.insertAdjacentElement('afterend', nav);
  mostrar();
}

function renderMockup() {
  const post = AppState.selectedPost;
  const mockupImage = document.getElementById('mockupPostImage');
  const mockupCaption = document.getElementById('mockupPostCaption');
  const mockupHeadline = document.getElementById('mockupHeadline');
  const mockupSub = document.getElementById('mockupSub');
  const mockupStatusBadge = document.getElementById('mockupStatusBadge');

  if (!post) return;

  const imgSrc = resolverImagemPost(post);
  if (mockupImage) {
    mockupImage.src = imgSrc;
    mockupImage.onerror = () => {
      mockupImage.src = resolverImagemPost(post);
    };
  }

  montarNavegacaoCarrossel(post, mockupImage);

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
  const inputCliente = document.getElementById('quickWhatsappCliente');
  const fone = inputCliente ? inputCliente.value.replace(/\D/g, '') : '';
  const numeroDestino = fone.length >= 10 ? (fone.startsWith('55') ? fone : `55${fone}`) : '';
  if (numeroDestino) {
    window.open(`https://wa.me/${numeroDestino}?text=${texto}`, '_blank', 'noopener,noreferrer');
  } else {
    copiarTexto(el.innerText.trim(), 'Mensagem copiada para a área de transferência!');
    window.open(`https://wa.me/553530675017?text=${texto}`, '_blank', 'noopener,noreferrer');
  }
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

// A barra de abas fica fixa no topo e muda de altura (quebra em 2 linhas no celular):
// os menus fixos das abas param logo abaixo dela.
(function () {
  const barra = document.querySelector('.sticky-tabs-bar');
  if (!barra) return;
  const medir = () => document.documentElement.style.setProperty('--altura-abas', barra.offsetHeight + 'px');
  medir();
  if (window.ResizeObserver) new ResizeObserver(medir).observe(barra); else window.addEventListener('resize', medir);
})();

// ==========================================
// MÓDULO LOCAL NINJA — AVALIAÇÕES & GUARDRAILS
// ==========================================
function setupLocalNinjaTools() {
  const reviewNomeEl = document.getElementById('ninjaReviewNomeCliente');
  const reviewTextoEl = document.getElementById('ninjaReviewTexto');
  const btnDispararReview = document.getElementById('btnDispararReviewNinja');
  const btnCopiarLinkReview = document.getElementById('btnCopiarLinkReviewNinja');

  const LINK_AVALIACAO = 'https://share.google/TYMb8tNCjBYdCTloP';

  function atualizarTextoReview() {
    if (!reviewTextoEl) return;
    const nome = (reviewNomeEl && reviewNomeEl.value.trim()) ? reviewNomeEl.value.trim() : '';
    const saudacao = nome ? `Olá, ${nome}!` : 'Olá!';
    reviewTextoEl.textContent = `${saudacao} Agradecemos pela confiança na Speed Financeira aqui no Centro de Varginha. Você poderia nos ajudar com uma avaliação sincera no Google? Leva apenas 30 segundos: ${LINK_AVALIACAO}`;
  }

  if (reviewNomeEl) {
    reviewNomeEl.addEventListener('input', atualizarTextoReview);
  }

  if (btnCopiarLinkReview) {
    btnCopiarLinkReview.addEventListener('click', () => {
      copiarTexto(LINK_AVALIACAO);
      mostrarToast('Link de avaliação do Google copiado!');
    });
  }

  if (btnDispararReview) {
    btnDispararReview.addEventListener('click', () => {
      const msg = reviewTextoEl ? reviewTextoEl.textContent.trim() : '';
      const phoneInput = document.getElementById('quickWhatsappCliente');
      const rawPhone = phoneInput ? phoneInput.value.replace(/\D/g, '') : '';
      if (rawPhone.length >= 10) {
        const url = `https://wa.me/55${rawPhone}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
        mostrarToast(`Disparando pedido de avaliação para ${rawPhone}!`);
      } else {
        copiarTexto(msg);
        window.open('https://web.whatsapp.com/', '_blank');
        mostrarToast('Mensagem de avaliação copiada! Abrindo WhatsApp Web...');
      }
    });
  }

  // Estúdio de Respostas com Guardrails Anti-Spam
  const tipoEl = document.getElementById('ninjaRespostaTipo');
  const respostaNomeEl = document.getElementById('ninjaRespostaNomeCliente');
  const respostaTextoEl = document.getElementById('ninjaRespostaTextoGerado');
  const btnCopiarResposta = document.getElementById('btnCopiarRespostaNinja');

  const RESPOSTAS = {
    consignado: (nome) => `Olá ${nome ? nome : ''}, muito obrigado pela confiança e pelas 5 estrelas! Foi um prazer atendê-lo(a) para o seu empréstimo consignado. Estamos sempre à disposição aqui na Rua Santa Cruz, 696, Centro de Varginha!`,
    fgts: (nome) => `Olá ${nome ? nome : ''}, agradecemos demais pela ótima avaliação! Ficamos muito felizes em liberar a sua antecipação do FGTS com rapidez, transparência e Pix na hora. Conte sempre com a Speed Financeira em Varginha!`,
    balcao: (nome) => `Olá ${nome ? nome : ''}, muito obrigado pelo retorno positivo! Conte conosco sempre que precisar de impressão, cópias, fotos 3x4 ou suporte em serviços digitais no Centro de Varginha!`,
    geral: (nome) => `Olá ${nome ? nome : ''}, agradecemos imensamente pela recomendação! Nosso compromisso há mais de 10 anos é oferecer um atendimento humano, ágil e transparente em Varginha. Um grande abraço de toda a nossa equipe!`,
    critica: (nome) => `Olá ${nome ? nome : ''}, agradecemos por compartilhar seu relato. Nosso compromisso é o atendimento transparente e de qualidade. Por favor, entre em contato direto pelo telefone (35) 3067-5017 ou venha nos visitar na Rua Santa Cruz, 696, para que possamos resolver qualquer pendência prontamente.`
  };

  function atualizarResposta() {
    if (!respostaTextoEl || !tipoEl) return;
    const tipo = tipoEl.value || 'geral';
    const nome = (respostaNomeEl && respostaNomeEl.value.trim()) ? respostaNomeEl.value.trim() : '';
    const gerador = RESPOSTAS[tipo] || RESPOSTAS.geral;
    respostaTextoEl.value = gerador(nome);
  }

  if (tipoEl) tipoEl.addEventListener('change', atualizarResposta);
  if (respostaNomeEl) respostaNomeEl.addEventListener('input', atualizarResposta);
  if (btnCopiarResposta) {
    btnCopiarResposta.addEventListener('click', () => {
      if (respostaTextoEl && respostaTextoEl.value) {
        copiarTexto(respostaTextoEl.value);
        mostrarToast('Resposta copiada com sucesso!');
      }
    });
  }

  atualizarTextoReview();
  atualizarResposta();
}

window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'switchTab' && event.data.tab) {
    switchTab(event.data.tab);
  }
});
