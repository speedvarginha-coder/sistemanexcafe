// raiox.js — consolidação local de NAP, visibilidade em IA e concorrentes

function formatarDataRaioX(valor) {
  if (!valor) return 'data não disponível';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? 'data não disponível' : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatarDiaRaioX(valor) {
  const data = new Date(valor);
  return !valor || Number.isNaN(data.getTime()) ? 's/d' : data.toLocaleDateString('pt-BR');
}

function criarCardTexto(titulo, texto, cor = 'blue') {
  const card = document.createElement('article');
  card.className = `border-l-4 border-${cor}-500 bg-white rounded-xl p-3 shadow-sm`;
  const heading = document.createElement('h4');
  heading.className = 'text-xs font-bold text-gray-900 mb-1';
  heading.textContent = titulo;
  const body = document.createElement('p');
  body.className = 'text-[11px] text-gray-600 leading-relaxed';
  body.textContent = texto;
  card.append(heading, body);
  return card;
}

function renderRaioXConcorrentes(dados) {
  const container = document.getElementById('raioxConcorrentesLista');
  if (!container) return;
  container.replaceChildren();
  (dados.concorrentes || []).forEach((concorrente, indice) => {
    const item = document.createElement('article');
    item.className = 'p-3 rounded-xl border border-gray-200 bg-gray-50';
    const topo = document.createElement('div');
    topo.className = 'flex items-start gap-2';
    const numero = document.createElement('span');
    numero.className = 'w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-[10px] font-black flex items-center justify-center shrink-0';
    numero.textContent = String(indice + 1);
    const conteudo = document.createElement('div');
    conteudo.className = 'min-w-0';
    const nome = document.createElement('h4');
    nome.className = 'text-xs font-bold text-gray-900';
    nome.textContent = concorrente.nome;
    const tipo = document.createElement('p');
    tipo.className = 'text-[10px] text-gray-500 mt-0.5';
    tipo.textContent = concorrente.tipo;
    const estrategia = document.createElement('p');
    estrategia.className = 'text-[10px] text-gray-600 mt-2 leading-relaxed';
    estrategia.textContent = concorrente.estrategia_local || concorrente.presenca_varginha;
    const verificacao = document.createElement('p');
    verificacao.className = 'text-[10px] text-gray-500 mt-1';
    verificacao.textContent = concorrente.status_http === 200
      ? `Site acessível na coleta de ${formatarDataRaioX(concorrente.data_verificacao)}`
      : `Site sem leitura confirmada na coleta de ${formatarDataRaioX(concorrente.data_verificacao)}`;
    conteudo.append(nome, tipo, estrategia, verificacao);
    if (/^https?:\/\//i.test(concorrente.url || '')) {
      const fonte = document.createElement('a');
      fonte.href = concorrente.url;
      fonte.target = '_blank';
      fonte.rel = 'noopener noreferrer';
      fonte.className = 'inline-block text-[10px] font-bold text-blue-700 hover:underline mt-1';
      fonte.textContent = 'Abrir site observado';
      conteudo.append(fonte);
    }
    topo.append(numero, conteudo);
    item.append(topo);
    container.append(item);
  });
}

function renderRaioXTemas(dados) {
  const container = document.getElementById('raioxTemasLista');
  if (!container) return;
  container.replaceChildren();
  (dados.pautas || []).forEach(pauta => {
    const item = document.createElement('div');
    item.className = 'flex items-start justify-between gap-3 p-3 rounded-xl border border-gray-200';
    const conteudo = document.createElement('div');
    conteudo.className = 'min-w-0';
    const pergunta = document.createElement('p');
    pergunta.className = 'text-xs font-semibold text-gray-800 leading-relaxed';
    pergunta.textContent = pauta.pergunta;
    const meta = document.createElement('p');
    meta.className = 'text-[10px] text-gray-500 mt-1';
    meta.textContent = `${pauta.total_verificacoes || 0} verificação(ões) • ${pauta.provider || 'fonte não informada'} • ${formatarDataRaioX(pauta.ultima_verificacao)}`;
    conteudo.append(pergunta, meta);
    const status = document.createElement('span');
    status.className = pauta.citou_na_ultima
      ? 'text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full whitespace-nowrap'
      : 'text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded-full whitespace-nowrap';
    status.textContent = pauta.citou_na_ultima ? 'Citou' : 'Não citou';
    item.append(conteudo, status);
    container.append(item);
  });
}

const RAIOX_ACOES_KEY = 'speed_raiox_acoes_v1';

function lerAcoesRaioX() {
  try {
    const valor = JSON.parse(localStorage.getItem(RAIOX_ACOES_KEY) || '{}');
    return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {};
  } catch (erro) {
    return {};
  }
}

function criarLinhaPlano(rotulo, texto) {
  const linha = document.createElement('p');
  linha.className = 'text-xs text-gray-700 leading-relaxed';
  const titulo = document.createElement('strong');
  titulo.className = 'text-gray-900';
  titulo.textContent = `${rotulo}: `;
  linha.append(titulo, document.createTextNode(texto));
  return linha;
}

function criarLinkPlano(link) {
  if (link.id) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'text-xs font-bold text-green-800 hover:underline';
    botao.textContent = link.label;
    botao.addEventListener('click', () => document.getElementById(link.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return botao;
  }
  const url = String(link.href || '');
  if (!/^(https?:\/\/|\.\.\/)/i.test(url)) return null;
  const ancora = document.createElement('a');
  ancora.href = url;
  ancora.target = '_blank';
  ancora.rel = 'noopener noreferrer';
  ancora.className = 'text-xs font-bold text-green-800 hover:underline';
  ancora.textContent = link.label;
  return ancora;
}

function renderRaioXDetalhado({ monitor, concorrentes, diretorios }) {
  const container = document.getElementById('raioxDetalhado');
  if (!container) return;
  container.replaceChildren();
  const score = diretorios.score || {};
  const perguntasSemCitacao = (monitor.pautas || []).filter(p => !p.citou_na_ultima)
    .sort((a, b) => (b.total_verificacoes || 0) - (a.total_verificacoes || 0));
  const errosComLink = (diretorios.registros || []).filter(registro =>
    registro.status === 'erro' && /^https?:\/\//i.test(registro.ficha || '')).slice(0, 2);
  const acoes = [
    {
      id: 'nap_erros', prioridade: 'P1', titulo: `Corrigir ${score.erros || 0} fichas com erro confirmado`,
      evidencia: `${score.ok || 0}/${score.total || 0} diretórios corretos (${Number(score.score || 0).toFixed(1)}%). Entre os erros há telefones antigos e cadastros duplicados.`,
      acao: 'Abrir as fichas, solicitar correção ou mesclagem e registrar o pedido na Central NAP.',
      verificar: 'Reexecutar a coleta de diretórios; os erros confirmados devem cair e o total correto deve subir.',
      links: [{ label: 'Abrir Central NAP', id: 'centralCorrecaoNap' }, ...errosComLink.map(r => ({ label: r.diretorio, href: r.ficha }))]
    },
    {
      id: 'nap_pendentes', prioridade: 'P1', titulo: `Conferir ${score.pendentes || 0} cadastros sem validação`,
      evidencia: `${score.pendentes || 0} registros pendentes e ${score.ajustar || 0} marcados para ajuste na coleta de ${formatarDataRaioX(diretorios.gerado_em)}.`,
      acao: 'Revisar telefone, nome, endereço, site e duplicatas no relatório NAP; corrigir primeiro as divergências confirmadas.',
      verificar: 'Na próxima coleta, reduzir pendências e registrar quais fichas passaram a corretas, erro ou remoção.',
      links: [{ label: 'Abrir relatório NAP', href: 'speedgeo/relatorio_nap.html' }]
    },
    {
      id: 'ia_perguntas', prioridade: 'P2', titulo: `Responder ${perguntasSemCitacao.length} perguntas sem citação`,
      evidencia: `${monitor.total_citou || 0}/${monitor.total_verificacoes || 0} verificações citaram a Speed. Exemplo: “${perguntasSemCitacao[0]?.pergunta || 'nenhuma pergunta pendente'}”`,
      acao: 'Revisar páginas de serviço e criar respostas objetivas às perguntas monitoradas, com condições verificáveis e dados da loja.',
      verificar: 'Repetir as mesmas perguntas no monitor de IA e comparar citação por pergunta, não apenas a porcentagem geral.',
      links: [{ label: 'Ver perguntas monitoradas', id: 'raioxTemasLista' }]
    },
    {
      id: 'google_avaliacoes', prioridade: 'P2', titulo: 'Registrar linha de base de avaliações',
      evidencia: 'Os arquivos locais não trazem nota, quantidade e data da última avaliação do Perfil da Empresa.',
      acao: 'Conferir no Google a nota, o total de avaliações, a recência e as respostas; registrar os valores antes de planejar metas.',
      verificar: 'Atualizar esses campos na próxima coleta e comparar evolução semanal com pelo menos dois concorrentes locais.',
      links: [{ label: 'Abrir Perfil da Empresa', href: 'https://business.google.com/' }]
    },
    {
      id: 'maps_posicoes', prioridade: 'P2', titulo: 'Medir posição real no Google Maps',
      evidencia: 'A coleta atual não contém posições por termo ou por ponto geográfico. A grade exibida no painel é apenas ilustrativa.',
      acao: 'Definir uma grade fixa de 5 × 5 pontos em Varginha e medir os mesmos termos locais de serviço em cada ponto.',
      verificar: 'Guardar data, termo, coordenadas e posição; repetir com a mesma grade para avaliar mudanças após as correções.',
      links: []
    },
    {
      id: 'concorrencia_maps', prioridade: 'P3', titulo: 'Comparar concorrentes no mesmo mercado local',
      evidencia: `${concorrentes.total_concorrentes || 0} sites concorrentes foram documentados. A coleta de sites não comprova posição no Maps nem reputação.`,
      acao: 'Escolher três concorrentes de Varginha e comparar categoria do perfil, serviços, avaliações, fotos e presença nas mesmas buscas.',
      verificar: 'Montar comparação com data e links dos perfis; atualizar junto da medição GeoGrid.',
      links: []
    }
  ];
  const feitas = lerAcoesRaioX();
  const progresso = document.getElementById('raioxPlanoProgresso');
  if (progresso) progresso.textContent = `${acoes.filter(acao => feitas[acao.id]).length}/${acoes.length} ações registradas`;

  acoes.forEach((acao, indice) => {
    const card = document.createElement('article');
    card.className = 'raiox-action-card flex flex-col gap-3';
    card.dataset.priority = acao.prioridade;
    const topo = document.createElement('div');
    topo.className = 'flex items-start justify-between gap-3';
    const heading = document.createElement('h4');
    heading.className = 'text-sm font-black text-gray-900 leading-snug';
    heading.textContent = `${indice + 1}. ${acao.titulo}`;
    const badge = document.createElement('span');
    badge.className = 'shrink-0 rounded-full bg-gray-100 text-gray-700 text-[10px] font-black px-2 py-1';
    badge.textContent = acao.prioridade;
    topo.append(heading, badge);
    card.append(topo,
      criarLinhaPlano('Evidência', acao.evidencia),
      criarLinhaPlano('Próxima ação', acao.acao),
      criarLinhaPlano('Como verificar', acao.verificar));

    const rodape = document.createElement('div');
    rodape.className = 'mt-auto pt-3 border-t border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-2';
    for (const link of acao.links) {
      const item = criarLinkPlano(link);
      if (item) rodape.append(item);
    }
    const registro = document.createElement('button');
    registro.type = 'button';
    registro.className = feitas[acao.id]
      ? 'ml-auto text-xs font-bold text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5'
      : 'ml-auto text-xs font-bold text-white bg-green-700 rounded-lg px-3 py-1.5 hover:bg-green-800';
    registro.textContent = feitas[acao.id] ? 'Execução registrada · desfazer' : 'Registrar execução';
    registro.title = feitas[acao.id]
      ? `Registrada em ${formatarDataRaioX(feitas[acao.id])}. Isso não confirma mudança nas métricas.`
      : 'Marca apenas a execução da tarefa; o resultado depende de nova coleta.';
    registro.addEventListener('click', () => {
      const atual = lerAcoesRaioX();
      if (atual[acao.id]) delete atual[acao.id];
      else atual[acao.id] = new Date().toISOString();
      try { localStorage.setItem(RAIOX_ACOES_KEY, JSON.stringify(atual)); }
      catch (erro) { console.warn('Não foi possível salvar as ações do Raio-X.', erro); }
      renderRaioXDetalhado({ monitor, concorrentes, diretorios });
    });
    rodape.append(registro);
    card.append(rodape);
    container.append(card);
  });
}

function initRaioX() {
  const monitor = window.DADOS_MONITOR;
  const concorrentes = window.DADOS_CONCORRENTES;
  const diretorios = window.DADOS_DIRETORIOS;
  if (!monitor || !concorrentes || !diretorios) {
    const container = document.getElementById('raioxOportunidades');
    if (container) container.append(criarCardTexto('Dados indisponíveis', 'Execute os coletores locais antes de abrir o Raio-X.', 'red'));
    return;
  }

  const score = diretorios.score || {};
  document.getElementById('raioxNap').textContent = `${Number(score.score || 0).toFixed(1)}%`;
  document.getElementById('raioxNapMeta').textContent = `${score.ok || 0} de ${score.total || 0} diretórios corretos`;
  document.getElementById('raioxIa').textContent = `${Number(monitor.score_citacao || 0).toFixed(1)}%`;
  document.getElementById('raioxIaMeta').textContent = `${monitor.total_citou || 0} citação em ${monitor.total_verificacoes || 0} verificações`;
  document.getElementById('raioxConcorrentes').textContent = String(concorrentes.total_concorrentes || 0);
  document.getElementById('raioxTemas').textContent = String(monitor.pautas?.length || 0);
  document.getElementById('raioxAtualizado').textContent = `NAP ${formatarDiaRaioX(diretorios.gerado_em)} • IA ${formatarDiaRaioX(monitor.ultima_verificacao)}`;

  const oportunidades = document.getElementById('raioxOportunidades');
  oportunidades.replaceChildren(
    criarCardTexto('Corrigir cadastros divergentes', `${score.erros || 0} diretórios têm erro confirmado e afetam confiança e descoberta local.`, 'red'),
    criarCardTexto('Fechar pendências NAP', `${score.pendentes || 0} registros ainda precisam de verificação antes de elevar o score local.`, 'orange'),
    criarCardTexto('Cobrir perguntas sem citação', `${(monitor.pautas || []).filter(p => !p.citou_na_ultima).length} temas não citaram a Speed na última coleta.`, 'blue'),
    criarCardTexto('Implantar GeoGrid real', 'Defina termos, raio e pontos de coleta para medir posição no Google Maps sem estimativas fictícias.', 'green')
  );

  renderRaioXConcorrentes(concorrentes);
  renderRaioXTemas(monitor);
  renderRaioXDetalhado({ monitor, concorrentes, diretorios });
}
