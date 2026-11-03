// data_gmb_posts.js — Planejamento de posts da ficha no Google (só serviços financeiros)
// Speed Financeira | Varginha/MG | 3 por semana (seg, qua, sex), 03/11 a 30/12/2026
// Feriados: 02/11 passou para 03/11, 20/11 para 19/11 e 25/12 ficou sem post.
// Texto sem telefone nem link: o Google costuma recusar post com número; o contato vai no botão.
// SEO local: cada texto abre com a palavra-chave e Varginha nos primeiros 150 caracteres.
// Termos escolhidos pelo volume do Planejador de Palavras-chave (Brasil e Varginha, out/2026):
// docs/pesquisa-palavras-chave/palavras-chave-speed-financeira-2026-10.xlsx

// Arte de cada post da ficha (js/gmb_arte.js, 1200 × 900): título com *destaque* em amarelo, selo e foto.
// Mesmas regras do texto: sem taxa, prazo de liberação ou promessa de aprovação. O aviso legal entra sozinho.
window.SPEED_GMB_POSTS_ARTES = {
  '2026-11-03': ['Aposentado, *compare* antes de assinar', 'CONSIGNADO INSS • Vários bancos', 'casal'],
  '2026-11-04': ['Seu *FGTS* pode virar dinheiro agora', 'SAQUE-ANIVERSÁRIO • Simule', 'cozinha'],
  '2026-11-06': ['Não pague *nada* para liberar crédito', 'ALERTA DE GOLPE', 'senhora'],
  '2026-11-09': ['Carteira assinada tem *consignado*', 'CLT • Desconto em folha', 'homem'],
  '2026-11-11': ['Sua parcela pode *diminuir*', 'PORTABILIDADE • Traga o extrato', 'senhora'],
  '2026-11-13': ['O que trazer para *simular*', 'RG, CPF, comprovante e extrato', 'balcao'],
  '2026-11-16': ['Carro quitado vira *garantia*', 'Juros que costumam ser menores', 'homem'],
  '2026-11-18': ['Servidor público tem *consignado*', 'Desconto em folha', 'balcao'],
  '2026-11-19': ['Refinanciar ou *trocar* de banco?', 'APOSENTADOS • A gente faz a conta', 'casal'],
  '2026-11-23': ['Use o 13º na dívida mais *cara*', 'Rotativo e cheque especial primeiro', 'cozinha'],
  '2026-11-25': ['Olhe o *CET*, não só a parcela', 'CUSTO EFETIVO TOTAL', 'homem'],
  '2026-11-27': ['Black Friday sem cair no *rotativo*', 'Troque dívida cara por parcela fixa', 'cozinha'],
  '2026-11-30': ['Sua *margem* ainda está livre?', 'Extrato do Meu INSS na hora', 'senhora'],
  '2026-12-02': ['FGTS parado? *Antecipe*', 'Simule sem compromisso', 'cozinha'],
  '2026-12-04': ['Obrigado pelas mais de *200* avaliações', 'Conte como foi no Google', 'balcao'],
  '2026-12-07': ['Carro ou imóvel pelo *consórcio*', 'SEM JUROS • Taxa de administração', 'casal'],
  '2026-12-09': ['Dívida cara? *Parcela* em folha', 'CONSIGNADO CLT', 'homem'],
  '2026-12-11': ['Nome *negativado*? Veja suas opções', 'CONSIGNADO E FGTS • Sujeito a análise', 'cozinha'],
  '2026-12-14': ['Seu consignado pode ficar mais *leve*', 'PORTABILIDADE', 'senhora'],
  '2026-12-16': ['Separe parte do 13º para *janeiro*', 'IPVA, IPTU e material escolar', 'cozinha'],
  '2026-12-18': ['Fim de ano: *atenção* aos golpes', 'Nunca faça Pix para liberar crédito', 'senhora'],
  '2026-12-21': ['Consignado ou crédito *pessoal*?', 'Mostramos o que faz sentido', 'homem'],
  '2026-12-23': ['Obrigado pela *confiança* em 2026', 'Boas festas, Varginha!', 'casal'],
  '2026-12-28': ['Comece 2027 com as *dívidas* em ordem', 'Simulação sem custo', 'senhora'],
  '2026-12-30': ['Crédito para começar *2027* com calma', 'CONSIGNADO INSS', 'casal']
};

window.SPEED_GMB_POSTS_PLANO = (function () {
  const RODAPE = 'Crédito sujeito a análise. A Speed Financeira é correspondente bancário e não cobra nenhum valor antecipado.';
  const SITE = 'https://speedfinanceira.com.br';
  // Os 25 posts foram programados na ficha (Programar esta postagem, 9h) em 30/10/2026.
  const PROGRAMADO_EM = '2026-10-30';
  const arte = data => {
    const a = window.SPEED_GMB_POSTS_ARTES[data];
    // Variações intercaladas: 1 (faixa verde com diagonal) e 2 (fundo claro com faixa de contato).
    // Entre os posts da variação 1, a foto alterna de lado (layout "a" à direita, "b" à esquerda).
    const i = Object.keys(window.SPEED_GMB_POSTS_ARTES).indexOf(data);
    const variacao = i % 2 ? 2 : 1;
    const layout = Math.floor(i / 2) % 2 ? 'b' : 'a';
    return a ? { titulo: a[0], selo: a[1], foto: a[2], variacao, layout, arquivo: `gmb-artes/post-${data}${variacao === 2 ? '-v2' : ''}.png` } : null;
  };
  const p = (data, tema, termo, texto, foto, botao = 'Ligar agora', rodape = true) =>
    ({ id: `post-${data}`, data, tema, termo, texto: rodape ? `${texto}\n\n${RODAPE}` : texto, foto, botao, link: botao === 'Saiba mais' ? SITE : '', arte: arte(data), programadoEm: PROGRAMADO_EM });

  return [
    // Semana 1
    p('2026-11-03', 'Consignado INSS', 'crédito consignado varginha',
      'Crédito consignado em Varginha para aposentados e pensionistas do INSS: na Speed Financeira, no Centro, você compara as propostas de vários bancos num só atendimento e sai sabendo o valor da parcela, o prazo e o custo total antes de assinar.\n\nTraga um documento com foto. Se não tiver o extrato do benefício, a gente ajuda a tirar no Meu INSS durante o atendimento.',
      'Mesa de atendimento com a fachada ao fundo.'),
    p('2026-11-04', 'Antecipação FGTS', 'empréstimo do fgts varginha',
      'Empréstimo do FGTS em Varginha: quem aderiu ao saque-aniversário pode antecipar parcelas e receber o valor de uma vez, sem parcela no salário. O desconto sai do próprio saldo do FGTS.\n\nO valor liberado depende do saldo e das regras em vigor. Na Speed Financeira, no Centro, a gente simula com você, mostra quanto entra na conta e explica a autorização que precisa ser feita no aplicativo do FGTS.',
      'Atendente mostrando a simulação na tela, sem dados do cliente.'),
    p('2026-11-06', 'Segurança', 'empréstimo para negativado',
      'Empréstimo para negativado "liberado na hora" que pede depósito antes é golpe. Em Varginha e região, desconfie de quem cobra taxa, Pix ou "seguro" para liberar o dinheiro: correspondente bancário sério não cobra nada antecipado.\n\nNa Speed Financeira o atendimento é presencial, na Rua Santa Cruz, 696, no Centro de Varginha, e o contrato é sempre do banco, em seu nome. Na dúvida, venha conferir pessoalmente antes de pagar qualquer coisa.',
      'Fachada da loja com o número 696 visível.', 'Saiba mais', false),

    // Semana 2
    p('2026-11-09', 'Consignado CLT', 'empréstimo clt varginha',
      'Empréstimo CLT em Varginha: quem trabalha com carteira assinada pode contratar o consignado do trabalhador, com as parcelas descontadas direto no salário. Ele costuma ter juros menores que o crédito pessoal e o cartão.\n\nNa Speed Financeira, no Centro, a gente consulta as ofertas disponíveis para você, compara os bancos e explica o custo total antes de qualquer contratação.',
      'Equipe no balcão (com autorização de quem aparece).'),
    p('2026-11-11', 'Portabilidade', 'portabilidade de consignado varginha',
      'Portabilidade de consignado em Varginha: se a parcela do seu empréstimo consignado está alta, o contrato pode passar para outro banco com condições melhores. Em alguns casos a parcela diminui ou sobra um valor para você.\n\nTraga o extrato do seu empréstimo à Speed Financeira, no Centro. A gente compara e só segue se a troca valer a pena para você.',
      'Mãos segurando um extrato genérico, sem dados legíveis.'),
    p('2026-11-13', 'Atendimento', 'empréstimo varginha',
      'Vai fazer um empréstimo em Varginha? Veja o que trazer para simular na Speed Financeira:\n\n- documento com foto (RG ou CNH);\n- CPF;\n- comprovante de endereço;\n- aposentado ou pensionista: extrato do benefício (a gente ajuda a tirar);\n- carteira assinada: último holerite.\n\nAtendimento presencial na Rua Santa Cruz, 696, Centro de Varginha.',
      'Balcão de atendimento organizado.', 'Ligar agora', false),

    // Semana 3 (20/11 é feriado da Consciência Negra)
    p('2026-11-16', 'Garantia de veículo', 'empréstimo com garantia de veículo varginha',
      'Empréstimo com garantia de veículo em Varginha: se o seu carro ou moto está quitado, ele pode servir de garantia para um crédito que costuma ter juros menores que o crédito pessoal. Você continua usando o veículo normalmente.\n\nNa Speed Financeira, no Centro, a gente avalia as condições com você e mostra o custo total antes de qualquer decisão.',
      'Fachada da loja; evite foto de carro de cliente.'),
    p('2026-11-18', 'Servidor público', 'consignado para servidor público varginha',
      'Consignado para servidor público em Varginha: a parcela do empréstimo é descontada direto em folha, conforme o convênio do seu órgão. Na Speed Financeira, no Centro, a gente confere sua margem, compara as condições dos bancos conveniados e explica cada detalhe do contrato.',
      'Atendente em atendimento (sem rosto de cliente).'),
    p('2026-11-19', 'Consignado INSS', 'refinanciamento de consignado varginha',
      'Refinanciamento de consignado em Varginha: aposentado com empréstimo antigo pode, dependendo do tempo de contrato, liberar um valor novo ou levar o contrato para um banco com parcela menor. A Speed Financeira faz essa conta com você antes de qualquer mudança.\n\nAmanhã, 20/11, é feriado da Consciência Negra: confira nesta ficha o horário de atendimento.',
      'Mesa de atendimento.'),

    // Semana 4
    p('2026-11-23', 'Educação financeira', 'empréstimo pessoal varginha',
      'Antes de buscar um empréstimo pessoal em Varginha, veja se o 13º resolve: a primeira parcela deve ser paga até 30 de novembro, e usar esse dinheiro na dívida mais cara, como rotativo do cartão e cheque especial, costuma ser o melhor caminho.\n\nSe a dívida for maior que o 13º, a Speed Financeira, no Centro, ajuda a ver se trocar por um crédito com parcela fixa e juros menores compensa.',
      'Fachada da loja de manhã.'),
    p('2026-11-25', 'Educação financeira', 'empréstimo varginha',
      'Antes de contratar um empréstimo em Varginha, olhe o CET, o custo efetivo total. Ele soma juros, tarifas, seguros e impostos e mostra quanto o crédito custa de verdade.\n\nParcela menor nem sempre é mais barata: às vezes o prazo é tão longo que o total pago fica muito maior. Na Speed Financeira, no Centro, toda simulação mostra o CET e o total a pagar.',
      'Atendente apontando para uma simulação na tela.', 'Saiba mais'),
    p('2026-11-27', 'Educação financeira', 'empréstimo pessoal varginha',
      'Black Friday em Varginha: se a fatura do cartão pesar, um empréstimo pessoal com parcela fixa costuma sair mais barato que o rotativo, que tem os juros mais altos do mercado.\n\nAntes de parcelar, confira se as compras cabem no orçamento dos próximos meses. Se a dívida do cartão já virou uma bola de neve, venha conversar na Speed Financeira, no Centro: a gente compara empréstimo pessoal e consignado e mostra o custo total.',
      'Fachada da loja.'),

    // Semana 5
    p('2026-11-30', 'Consignado INSS', 'empréstimo inss varginha',
      'Empréstimo INSS em Varginha: sabe quanto do seu benefício já está comprometido? O extrato de empréstimos do Meu INSS mostra os contratos ativos e a margem que ainda está livre.\n\nNa Speed Financeira, no Centro, a gente tira esse extrato com você, explica cada contrato e mostra se vale a pena um novo crédito, um refinanciamento ou a portabilidade.',
      'Tela do Meu INSS na loja, sem dados pessoais.'),
    p('2026-12-02', 'Antecipação FGTS', 'saque-aniversário do fgts varginha',
      'Saque-aniversário do FGTS em Varginha: se o seu FGTS está parado, dá para antecipar parcelas e usar o dinheiro agora, sem parcela no salário.\n\nA Speed Financeira, no Centro, consulta com você quanto pode ser antecipado e explica o passo a passo da autorização no aplicativo do FGTS.',
      'Equipe no balcão.'),
    p('2026-12-04', 'Avaliações', 'financeira em varginha',
      'Financeira em Varginha com mais de 200 avaliações no Google e nota 4,8: obrigado a cada cliente que contou como foi o atendimento na Speed Financeira.\n\nJá foi atendido por aqui? Sua avaliação ajuda outras pessoas da cidade a escolher com segurança onde fazer o empréstimo. Conte qual serviço você fez e como foi.',
      'Equipe reunida na frente da loja (com autorização).', 'Ligar agora', false),

    // Semana 6
    p('2026-12-07', 'Consórcio', 'consórcio varginha',
      'Consórcio em Varginha: para comprar carro, moto ou imóvel sem pagar juros, o consórcio troca os juros por uma taxa de administração, e a carta de crédito sai por sorteio ou lance.\n\nNa Speed Financeira, no Centro, a gente explica como funciona, compara os planos disponíveis e mostra o valor da parcela e o custo total antes de você decidir.',
      'Fachada da loja.'),
    p('2026-12-09', 'Consignado CLT', 'consignado clt varginha',
      'Consignado CLT em Varginha: quem tem carteira assinada pode trocar dívidas caras, como cartão e cheque especial, por um empréstimo com desconto em folha e juros menores. O valor e o prazo dependem do salário e das ofertas disponíveis.\n\nNa Speed Financeira, no Centro, a gente faz a conta com você antes de qualquer contratação.',
      'Atendente ao telefone no balcão.'),
    p('2026-12-11', 'Negativado', 'empréstimo para negativado varginha',
      'Empréstimo para negativado em Varginha: nome no SPC ou no Serasa nem sempre impede o crédito. No consignado do INSS e na antecipação do saque-aniversário do FGTS, a parcela sai direto do benefício ou do saldo, e muitos bancos aceitam mesmo com restrição, sempre após análise.\n\nNa Speed Financeira, no Centro, a gente consulta as opções para o seu caso, sem cobrar nada antecipado.',
      'Mesa de atendimento.'),

    // Semana 7
    p('2026-12-14', 'Portabilidade', 'crédito consignado varginha',
      'Crédito consignado mais leve em Varginha: se o seu empréstimo foi feito há algum tempo, os juros e as condições dos bancos mudaram, e outro banco pode oferecer uma parcela menor para o mesmo contrato.\n\nA Speed Financeira, no Centro, compara as opções de portabilidade e só recomenda a troca quando ela é melhor para você.',
      'Mesa de atendimento.'),
    p('2026-12-16', 'Educação financeira', 'financeira varginha',
      'A segunda parcela do 13º deve ser paga até 20 de dezembro, e a Speed Financeira, em Varginha, recomenda separar uma parte para as contas de janeiro: IPVA, IPTU, matrícula e material escolar.\n\nPlanejar agora evita entrar no cheque especial no começo do ano. Precisa organizar as dívidas? Venha ao Centro e a gente ajuda você a fazer as contas.',
      'Fachada da loja.', 'Saiba mais'),
    p('2026-12-18', 'Segurança', 'empréstimo varginha',
      'Fim de ano é época de golpe do falso empréstimo em Varginha e em todo o país: nunca faça depósito ou Pix para liberar crédito e não passe senha nem código recebido por SMS.\n\nA Speed Financeira não cobra nenhum valor antecipado e atende presencialmente na Rua Santa Cruz, 696, no Centro. Antes das festas, confira nesta ficha o horário de Natal e Ano Novo.',
      'Fachada da loja.', 'Saiba mais', false),

    // Semana 8 (25/12 é Natal)
    p('2026-12-21', 'Crédito pessoal', 'empréstimo pessoal varginha',
      'Empréstimo pessoal ou consignado em Varginha? Para aposentados, pensionistas, servidores e quem tem carteira assinada, o consignado costuma ter juros bem menores, porque a parcela é descontada direto no benefício ou no salário.\n\nO empréstimo pessoal é uma opção para quem não tem acesso ao consignado. Na Speed Financeira, no Centro, a gente mostra qual faz mais sentido para você.',
      'Atendente no balcão.'),
    p('2026-12-23', 'Avaliações', 'financeira varginha',
      'A Speed Financeira agradece a confiança de cada cliente de Varginha e região em 2026. Desejamos um Natal com saúde e um ano novo com as contas em dia.\n\nConfira nesta ficha o horário de atendimento de Natal e Ano Novo.',
      'Equipe reunida na loja (com autorização).', 'Ligar agora', false),

    // Semana 9
    p('2026-12-28', 'Educação financeira', 'empréstimo varginha',
      'Empréstimo para organizar as dívidas em Varginha: quer começar 2027 com as contas em ordem? Liste tudo o que deve, com a parcela e os juros de cada uma, e comece pela mais cara. Trocar várias dívidas caras por um só crédito, com juros menores, pode aliviar o orçamento.\n\nTraga sua lista à Speed Financeira, no Centro. A simulação não tem custo nem compromisso.',
      'Mesa de atendimento com caneta e papel.'),
    p('2026-12-30', 'Consignado INSS', 'empréstimo para aposentado varginha',
      'Empréstimo para aposentado em Varginha: em janeiro a Speed Financeira segue atendendo no Centro para consignado, refinanciamento e portabilidade de aposentados e pensionistas do INSS.\n\nSe você planeja um crédito para o começo do ano, venha simular com calma e compare o custo total antes de decidir. Confira nesta ficha o horário de atendimento do Ano Novo.',
      'Fachada da loja.')
  ];
})();
