// data_gmb.js — Dados e configurações para Gestão do Google Meu Negócio
// Speed Financeira | Varginha/MG | Rua Santa Cruz, 696 - Centro

window.SPEED_GMB_DATA = {

  // ─── FICHA DA EMPRESA ───────────────────────────────────────────────────────
  ficha: {
    nome_oficial: "Speed Financeira",
    categoria_principal: "Correspondente bancário",
    categorias_secundarias: ["Empresa financeira", "Serviço de empréstimo"],
    endereco: "Rua Santa Cruz, 696 - Centro, Varginha - MG, 37002-090",
    telefone: "(35) 3067-5017",
    whatsapp: "https://wa.me/553530675017",
    site: "https://speedfinanceira.com.br",
    horario: [
      { dia: "Segunda-feira", abre: "09:00", fecha: "18:00" },
      { dia: "Terça-feira",   abre: "09:00", fecha: "18:00" },
      { dia: "Quarta-feira",  abre: "09:00", fecha: "18:00" },
      { dia: "Quinta-feira",  abre: "09:00", fecha: "18:00" },
      { dia: "Sexta-feira",   abre: "09:00", fecha: "18:00" },
      { dia: "Sábado",        abre: null,    fecha: null,    fechado: true },
      { dia: "Domingo",       abre: null,    fecha: null,    fechado: true }
    ],
    links_diretos: {
      painel_gmb: "https://business.google.com/",
      ficha_maps: "https://share.google/TYMb8tNCjBYdCTloP",
      link_share_oficial: "https://share.google/TYMb8tNCjBYdCTloP",
      link_review: "https://share.google/TYMb8tNCjBYdCTloP",
      link_fotos: "https://business.google.com/photos",
      link_publicar_post: "https://business.google.com/posts"
    }
  },

  // ─── PESOS INTERNOS ORIENTADOS PELA PESQUISA WHITESPARK 2026 ───────────────
  whitespark_2026: {
    titulo: "Whitespark Local Search Ranking Factors 2026",
    pesquisador: "Pesquisa Whitespark com 47 especialistas em SEO local",
    url: "https://whitespark.ca/local-search-ranking-factors/",
    pesos_local_pack: {
      gbp: { nome: "GBP Signals", peso: 32, badge: "bg-pink-100 text-pink-800 border-pink-200" },
      reviews: { nome: "Review Signals", peso: 20, badge: "bg-purple-100 text-purple-800 border-purple-200" },
      onpage: { nome: "On-Page Signals", peso: 15, badge: "bg-blue-100 text-blue-800 border-blue-200" },
      behavior: { nome: "Comportamento", peso: 9, badge: "bg-indigo-100 text-indigo-800 border-indigo-200" },
      links: { nome: "Links Locais", peso: 8, badge: "bg-green-100 text-green-800 border-green-200" },
      citations: { nome: "Citações / NAP", peso: 6, badge: "bg-yellow-100 text-yellow-800 border-yellow-200" },
      proximity: { nome: "Localização / Centro", peso: 6, badge: "bg-teal-100 text-teal-800 border-teal-200" },
      social: { nome: "Redes Sociais", peso: 4, badge: "bg-red-100 text-red-800 border-red-200" }
    }
  },

  // ─── CHECKLIST OPERACIONAL INTERNO (TOTAL: 100 PONTOS) ──────────────────────
  checklist_ficha: [
    // 1. GBP SIGNALS (prioridade interna: 32 pontos)
    { id: "cat_primaria",        grupo: "gbp",       rank_ws: "Alta prioridade",        label: "Categoria primária mais adequada ao negócio",       peso: 10, status: "ok",       dica: "Validar no Perfil da Empresa a categoria que melhor descreve a atividade principal da loja. A pesquisa trata categorias como sinal relevante, mas não garante posição." },
    { id: "nome_sem_spam",       grupo: "gbp",       rank_ws: "Alta prioridade",        label: "Nome real da empresa, sem palavras acrescentadas",                 peso: 6,  status: "pendente", dica: "Em 29/10 o nome na ficha era \"Speed Financeira – Empréstimo Consignado e Financiamento em Varginha\". Usar exatamente o nome adotado na fachada e nos documentos. Acrescentar serviços ou cidade apenas para ranquear pode causar edição ou suspensão." },
    { id: "horario_aberto",      grupo: "gbp",       rank_ws: "#5 no Maps",  label: "Horário de atendimento real e atualizado",             peso: 5,  status: "ok",       dica: "Conferir horários normais e especiais no Google. A pesquisa destaca a condição de estar aberto no momento da busca; nunca ampliar horários sem atendimento real." },
    { id: "cat_secundarias",     grupo: "gbp",       rank_ws: "#8 no Maps",        label: "Categorias adicionais pertinentes",                      peso: 4,  status: "ok",       dica: "Conferir se as categorias adicionais disponíveis no Google descrevem serviços que a loja realmente oferece." },
    { id: "servicos_cadastrados",grupo: "gbp",       rank_ws: "#22 e #30 Fator Geral", label: "Serviços Pré-definidos e Customizados no Perfil",    peso: 4,  status: "pendente", dica: "Cadastrar no painel: Antecipação Saque FGTS, Consignado INSS, Portabilidade e Refinanciamento." },
    { id: "descricao_atributos", grupo: "gbp",       rank_ws: "#16 Fator Geral",       label: "Descrição de 750 Caracteres & Atributos de Loja",    peso: 3,  status: "pendente", dica: "Descrição otimizada com palavras de Varginha + marcação de acessibilidade e Wi-Fi para clientes." },

    // 2. REVIEW SIGNALS (prioridade interna: 20 pontos)
    { id: "nota_alta",           grupo: "reviews",   rank_ws: "#6 no Maps",label: "Nota média do Google conferida",                  peso: 6,  status: "ok",       dica: "Acompanhar a nota diretamente no perfil e registrar a data da consulta antes de comparar com concorrentes." },
    { id: "volume_comentarios",  grupo: "reviews",   rank_ws: "#9 no Maps",        label: "Volume de avaliações com texto",        peso: 5,  status: "ok",       dica: "Registrar contagem e evolução das avaliações autênticas no Google. Não oferecer vantagem em troca de avaliações." },
    { id: "recencia_reviews",    grupo: "reviews",   rank_ws: "#11 e #14 Fator Geral", label: "Fluxo Contínuo & Recência de Avaliações Semanais",  peso: 5,  status: "pendente", dica: "Receber 2 a 3 novas avaliações por semana usando os links de WhatsApp pós-atendimento. Evita estagnação da ficha." },
    { id: "resposta_reviews",    grupo: "reviews",   rank_ws: "Experiência",      label: "Responder avaliações de forma útil e respeitosa",     peso: 4,  status: "pendente", dica: "Acompanhar respostas no perfil, sem expor dados financeiros ou pessoais de clientes." },

    // 3. ON-PAGE & LANDING PAGE (prioridade interna: 15 pontos)
    { id: "nap_site",            grupo: "onpage",    rank_ws: "#15 Fator Geral",       label: "HTML NAP no Site Idêntico à Ficha do Google",        peso: 5,  status: "ok",       dica: "Nome, Rua Santa Cruz 696, (35) 3067-5017 e CEP 37002-090 no rodapé com Schema.org indexável." },
    { id: "paginas_servicos",    grupo: "onpage",    rank_ws: "#24 Geral / #2 em IAs", label: "Página Dedicada para Cada Serviço Financeiro",      peso: 5,  status: "ok",       dica: "O site possui páginas e seções estruturadas para Consignado, FGTS e Portabilidade (essencial para ChatGPT/Gemini)." },
    { id: "seo_local_tags",      grupo: "onpage",    rank_ws: "#17 e #20 Fator Geral", label: "Title Tags & H1/H2 com Termos de Varginha",          peso: 5,  status: "ok",       dica: "Títulos e cabeçalhos otimizados para 'Empréstimo em Varginha' e 'Financeira no Centro'." },

    // 4. BEHAVIOURAL SIGNALS / ENGAJAMENTO (prioridade interna: 9 pontos)
    { id: "fotos_fachada_equipe",grupo: "behavior",  rank_ws: "Conversão",   label: "Fotos reais da fachada, loja e equipe", peso: 5, status: "pendente", dica: "Publicar imagens atuais, nítidas e autorizadas da loja. Evitar fotos de banco de imagens apresentadas como se fossem do estabelecimento." },
    { id: "interatividade_rotas",grupo: "behavior",  rank_ws: "#13 Fator Geral",       label: "Botões de Rota no Maps, Ligação e WhatsApp Ativos",  peso: 4,  status: "ok",       dica: "Sinais de engajamento do usuário (cliques para ligar, rotas e visitas) fortalecem a autoridade local." },

    // 5. LINK SIGNALS / BACKLINKS LOCAIS (prioridade interna: 8 pontos)
    { id: "backlinks_locais",    grupo: "links",     rank_ws: "#26 e #27 Fator Geral", label: "Links de Domínios Locais do Sul de Minas",          peso: 8,  status: "pendente", dica: "Conquistar links de parceiros locais, ACIV e notícias de Varginha apontando para speedfinanceira.com.br." },

    // 6. CITATION SIGNALS / CONSISTÊNCIA NAP (prioridade interna: 6 pontos)
    { id: "consistencia_nap",    grupo: "citations", rank_ws: "#28 Fator Geral",       label: "Consistência NAP em Diretórios (Eliminar Telefones Antigos)", peso: 6, status: "pendente", dica: "Corrigir os 9 diretórios que ainda divulgam o telefone antigo 3113-0458 para alinhar com o (35) 3067-5017." },

    // 7. PROXIMIDADE / CENTRO COMERCIAL (prioridade interna: 6 pontos)
    { id: "local_centro_pino",   grupo: "proximity", rank_ws: "Localização",  label: "Endereço verdadeiro e pino conferido",    peso: 6,  status: "ok",       dica: "Conferir que o endereço exibido e o pino correspondem à loja aberta ao público. A proximidade varia conforme o local de quem busca." },

    // 8. SOCIAL SIGNALS / REDES SOCIAIS (prioridade interna: 4 pontos)
    { id: "redes_sociais_ativas",grupo: "social",    rank_ws: "Apoio à descoberta",   label: "Instagram e Facebook da loja atualizados",      peso: 4,  status: "pendente", dica: "Manter perfis sociais autênticos e coerentes com endereço, serviços e canais oficiais da loja." }
  ],

  // ─── MODELOS DE POSTS PARA O GOOGLE MEU NEGÓCIO ─────────────────────────────
  posts_gmb: [
    {
      id: "gmb-fgts-oferta",
      tipo: "oferta",
      titulo: "Antecipe seu FGTS ainda hoje — Pix na hora!",
      categoria_produto: "Antecipação FGTS",
      corpo: `Tem saldo no FGTS (Saque-Aniversário)?

Antecipe até 5 parcelas e receba o dinheiro via Pix em minutos, sem sair de casa.

✅ Liberado para negativados
✅ Sem consulta ao SPC/Serasa
✅ Sem cobrança antecipada

Venha ao nosso endereço ou fale pelo WhatsApp!`,
      cta_tipo: "Ligar",
      cta_url: "https://wa.me/553530675017?text=Olá!%20Vi%20o%20post%20do%20Google%20e%20gostaria%20de%20antecipar%20meu%20FGTS.",
      dica: "Tipo 'Oferta' dá mais destaque. Defina validade de 30 dias e adicione a imagem do post de FGTS."
    },
    {
      id: "gmb-inss-novidades",
      tipo: "atualizacao",
      titulo: "Novas taxas para Consignado INSS em Setembro",
      categoria_produto: "Consignado INSS",
      corpo: `Aposentados e pensionistas do INSS:

Setembro chegou com condições renovadas para o crédito consignado! Comparamos mais de 10 bancos parceiros para encontrar a menor taxa e o maior valor liberado para você.

📍 Atendimento presencial: Rua Santa Cruz, 696 — Centro, Varginha
📲 WhatsApp: (35) 3067-5017
🏦 Correspondente bancário autorizado | Sem cobrança antecipada`,
      cta_tipo: "Saiba mais",
      cta_url: "https://speedfinanceira.com.br/?utm_source=gmb&utm_medium=post&utm_campaign=inss_setembro#servicos",
      dica: "Publicar toda primeira semana do mês. Substitua o mês a cada nova publicação."
    },
    {
      id: "gmb-portabilidade",
      tipo: "atualizacao",
      titulo: "Portabilidade de Consignado: reduza juros e receba troco",
      categoria_produto: "Portabilidade",
      corpo: `Você sabia que é possível reduzir a parcela do seu consignado OU receber um dinheiro de volta?

Com a Portabilidade de Crédito:
• Transferimos seu contrato para um banco com juros menores
• Você mantém a parcela e recebe um "troco" direto no Pix
• Sem cobrança antecipada; operação sujeita às regras e à análise da instituição financeira

Fale com a Speed Financeira e faça uma simulação grátis hoje.`,
      cta_tipo: "Ligar",
      cta_url: "https://wa.me/553530675017?text=Olá!%20Vi%20o%20post%20no%20Google%20e%20quero%20simular%20a%20portabilidade%20com%20troco.",
      dica: "Ideal para publicar em semanas sem promoção específica. Excelente engajamento com quem pesquisa 'reduzir parcela consignado'."
    },
    {
      id: "gmb-veiculo-equity",
      tipo: "oferta",
      titulo: "Use seu veículo e pegue dinheiro — sem perder o carro",
      categoria_produto: "Auto Equity (Garantia de Veículo)",
      corpo: `Tem carro ou moto quitados? Você pode usar o veículo como garantia e pegar um valor maior com juros muito mais baixos.

• Até 90% do valor da Tabela FIPE
• Taxas reduzidas (bem abaixo do cheque especial)
• Continue usando o veículo normalmente!

Simule agora na Speed Financeira, Centro de Varginha.`,
      cta_tipo: "Saiba mais",
      cta_url: "https://speedfinanceira.com.br/?utm_source=gmb&utm_medium=post&utm_campaign=garantia_veiculo#servicos",
      dica: "Público-alvo: autônomos e microempreendedores que precisam de capital de giro. Adicione foto de carro com destaque."
    },
    {
      id: "gmb-evento-mutirao",
      tipo: "evento",
      titulo: "Mutirão de Consulta de Margem INSS — Atendimento Especial",
      categoria_produto: "Consignado INSS (Evento)",
      corpo: `Nesta semana realizamos um atendimento especial para aposentados e pensionistas do INSS!

Nossa equipe estará disponível para:
• Consultar sua margem disponível gratuitamente
• Comparar propostas de múltiplos bancos
• Orientar sobre portabilidade e refinanciamento

📍 Rua Santa Cruz, 696 - Centro, Varginha-MG
📞 (35) 3067-5017 | WhatsApp disponível

Sem compromisso. Atendimento humanizado e transparente.`,
      cta_tipo: "Ligar",
      cta_url: "https://wa.me/553530675017?text=Quero%20agendar%20minha%20consulta%20de%20margem%20INSS%20no%20mutirão%20da%20Speed%20Financeira.",
      dica: "Publique como 'Evento' com datas de início e fim da semana. Gera pico de visualizações e ligações."
    }
  ],

  // ─── MODELOS DE RESPOSTA PARA AVALIAÇÕES ─────────────────────────────────────
  respostas_avaliacoes: [
    {
      tipo: "positiva_5_estrelas_nomeada",
      label: "5 Estrelas — Com nome de produto",
      exemplo_avaliacao: "Fiz meu empréstimo consignado lá e foi tudo ótimo! Atendimento rápido.",
      resposta: `Muito obrigado pelo carinho, [Nome]! 🙏

Fico muito feliz que você tenha tido uma ótima experiência com a gente. Nossa equipe trabalha com muito cuidado para garantir que cada cliente encontre a melhor condição disponível, com total transparência.

Se precisar de mais alguma coisa — seja uma portabilidade, uma nova consulta ou indicar para algum amigo — estamos sempre aqui!

Speed Financeira | Rua Santa Cruz, 696 — Centro, Varginha`
    },
    {
      tipo: "positiva_5_estrelas_generica",
      label: "5 Estrelas — Genérica (sem texto)",
      exemplo_avaliacao: "(somente 5 estrelas, sem comentário)",
      resposta: `Obrigado pela avaliação 5 estrelas, [Nome]! ⭐

Sua confiança é muito importante para nós. Esperamos te atender novamente em breve!

Speed Financeira — Correspondente bancário em Varginha, Centro.`
    },
    {
      tipo: "positiva_4_estrelas",
      label: "4 Estrelas — Positiva com ressalva",
      exemplo_avaliacao: "Bom atendimento, mas demorou um pouco.",
      resposta: `Muito obrigado pelo retorno, [Nome]! Adoramos saber que o atendimento foi positivo. 😊

Levamos muito a sério todo tipo de comentário, e já estamos trabalhando para reduzir o tempo de espera nos atendimentos. Sua opinião nos ajuda muito a melhorar!

Quando precisar, nos encontre na Rua Santa Cruz, 696 — Centro, Varginha.`
    },
    {
      tipo: "negativa_com_contexto",
      label: "1–3 Estrelas — Negativa com contexto",
      exemplo_avaliacao: "Fui lá e não me atenderam bem.",
      resposta: `Olá, [Nome]. Lamentamos muito que a sua experiência não tenha sido a que esperávamos oferecer. 😔

Pedimos que entre em contato direto conosco pelo WhatsApp (35) 3067-5017 ou venha pessoalmente à nossa loja para que possamos entender o que aconteceu e resolver da melhor forma.

Nosso compromisso é com um atendimento humanizado e transparente, e queremos ter a oportunidade de te atender melhor.

Speed Financeira`
    },
    {
      tipo: "negativa_processo_credito",
      label: "1–3 Estrelas — Sobre não aprovação de crédito",
      exemplo_avaliacao: "Não conseguiram me aprovar.",
      resposta: `Olá, [Nome]. Entendemos a frustração e lamentamos muito. 

A análise e aprovação de crédito segue critérios de cada banco parceiro, e infelizmente nem sempre conseguimos uma aprovação imediata. Mas o nosso trabalho é buscar a melhor alternativa possível para cada perfil.

Se quiser, entre em contato pelo WhatsApp (35) 3067-5017 para conversarmos sobre outras opções disponíveis para o seu caso.

Speed Financeira | Correspondente bancário autorizado — CMN 4.935/2021`
    }
  ],

  // ─── PERGUNTAS & RESPOSTAS (Q&A DO GMB) ─────────────────────────────────────
  perguntas_respostas: [
    {
      pergunta: "Quais são os serviços da Speed Financeira?",
      resposta: "Oferecemos: Empréstimo Consignado INSS (aposentados, pensionistas e BPC/LOAS), Antecipação do Saque-Aniversário FGTS via Pix, Portabilidade de Consignado com Redução de Juros, Consignado CLT para trabalhadores de carteira assinada, Financiamento e Refinanciamento de Veículos (Auto Equity). Somos correspondente bancário com acesso a mais de 10 bancos parceiros. Atendimento presencial (Rua Santa Cruz, 696 — Centro) ou pelo WhatsApp (35) 3067-5017."
    },
    {
      pergunta: "A Speed Financeira cobra taxa antecipada?",
      resposta: "Não. A Speed Financeira NUNCA cobra nenhuma taxa ou valor antecipado para liberação de empréstimos. Se alguém cobrar qualquer valor antes da liberação do crédito em nome da Speed, é golpe. Denuncie pelo (35) 3067-5017."
    },
    {
      pergunta: "Negativado pode fazer empréstimo?",
      resposta: "Sim! A Antecipação do Saque-Aniversário FGTS e o Crédito Consignado INSS/BPC são liberados mesmo para pessoas com restrições no CPF (SPC/Serasa), pois o desconto é direto no benefício ou no saldo do FGTS. Consulte as condições pelo WhatsApp (35) 3067-5017."
    },
    {
      pergunta: "Qual o horário de funcionamento?",
      resposta: "Funcionamos de Segunda a Sexta-feira, das 09h às 18h. Sábados, Domingos e Feriados estamos fechados presencialmente, mas você pode entrar em contato pelo WhatsApp (35) 3067-5017 e deixar sua mensagem que retornamos no próximo dia útil."
    },
    {
      pergunta: "Como funciona a portabilidade de consignado?",
      resposta: "A portabilidade transfere seu contrato para outra instituição, que apresentará taxa e CET para comparação. Conforme o saldo devedor e a análise, pode haver redução da parcela ou valor adicional. Não cobramos taxa antecipada. Solicite a proposta oficial na loja ou pelo WhatsApp: (35) 3067-5017."
    },
    {
      pergunta: "Posso fazer empréstimo com meu veículo como garantia?",
      resposta: "Sim! Com o crédito com garantia de veículo (Auto Equity), você usa seu carro ou moto quitados como garantia e recebe até 90% do valor da Tabela FIPE em dinheiro. As taxas são bem menores que um empréstimo pessoal comum e você continua usando o veículo normalmente. Simule no WhatsApp: (35) 3067-5017."
    },
    {
      pergunta: "Onde fica a Speed Financeira em Varginha?",
      resposta: "Estamos na Rua Santa Cruz, 696 — Centro, Varginha — MG (próximo ao centro comercial e aos principais bancos). CEP: 37002-090. Também atendemos 100% pelo WhatsApp: (35) 3067-5017."
    }
  ],

  // ─── CHECKLIST DE FOTOS PARA O GMB ───────────────────────────────────────────
  checklist_fotos: [
    { categoria: "Identidade Visual",  foto: "Logomarca oficial em fundo branco (1:1, mínimo 720x720px)",     status: "pendente", prioridade: "alta" },
    { categoria: "Identidade Visual",  foto: "Foto de capa da fachada da loja (16:9, mínimo 1080x608px)",     status: "pendente", prioridade: "alta" },
    { categoria: "Interior da Loja",   foto: "Recepção e balcão de atendimento principal",                    status: "pendente", prioridade: "alta" },
    { categoria: "Interior da Loja",   foto: "Área de espera com cadeiras (transmite conforto ao cliente)",   status: "pendente", prioridade: "media" },
    { categoria: "Equipe",             foto: "Foto da equipe completa na loja (sorrindo, uniforme ou crachá)",status: "pendente", prioridade: "alta" },
    { categoria: "Equipe",             foto: "Foto individual de cada consultor com nome e cargo",             status: "pendente", prioridade: "media" },
    { categoria: "Ambiente Externo",   foto: "Fachada externa com letreiro visível (luz do dia)",            status: "pendente", prioridade: "alta" },
    { categoria: "Ambiente Externo",   foto: "Placa de rua ou pontos de referência próximos",                status: "pendente", prioridade: "baixa" },
    { categoria: "Produto / Serviço",  foto: "Imagem representando Pix/FGTS (pode ser arte digital)",        status: "pendente", prioridade: "media" },
    { categoria: "Produto / Serviço",  foto: "Imagem representando Consignado INSS (aposentados)",           status: "pendente", prioridade: "media" }
  ],

  // ─── DADOS DE NAP (SINCRONIZADO COM dados_diretorios.js) ─────────────────────
  nap_resumo: {
    score: 18.2,
    total_fichas: 44,
    corretas: 8,
    erros_confirmados: 9,
    ajustar: 4,
    pendentes: 22,
    meta_90_dias: 60,
    nap_padrao: {
      nome: "Speed Financeira",
      endereco: "Rua Santa Cruz, 696 - Centro, Varginha - MG",
      cep: "37002-090",
      telefone: "(35) 3067-5017",
      telefone_errado_antigo: "3113-0458"
    }
  }
};
