// data_gmb_posts.js — Planejamento de posts da ficha no Google (só serviços financeiros)
// Speed Financeira | Varginha/MG | 3 por semana (seg, qua, sex), 03/11 a 30/12/2026
// Feriados: 02/11 passou para 03/11, 20/11 para 19/11 e 25/12 ficou sem post.
// Texto sem telefone nem link: o Google costuma recusar post com número; o contato vai no botão.

window.SPEED_GMB_POSTS_PLANO = (function () {
  const RODAPE = 'Crédito sujeito a análise. A Speed Financeira é correspondente bancário e não cobra nenhum valor antecipado.';
  const SITE = 'https://speedfinanceira.com.br';
  const p = (data, tema, termo, texto, foto, botao = 'Ligar agora', rodape = true) =>
    ({ id: `post-${data}`, data, tema, termo, texto: rodape ? `${texto}\n\n${RODAPE}` : texto, foto, botao, link: botao === 'Saiba mais' ? SITE : '' });

  return [
    // Semana 1
    p('2026-11-03', 'Consignado INSS', 'consignado inss varginha',
      'Aposentado ou pensionista do INSS em Varginha? Na Speed Financeira, no Centro, você compara as propostas de consignado de vários bancos num só atendimento e sai sabendo o valor da parcela, o prazo e o custo total antes de assinar.\n\nTraga um documento com foto. Se não tiver o extrato do benefício, a gente ajuda a tirar no Meu INSS durante o atendimento.',
      'Mesa de atendimento com a fachada ao fundo.'),
    p('2026-11-04', 'Antecipação FGTS', 'antecipação fgts varginha',
      'Quem aderiu ao saque-aniversário do FGTS pode antecipar parcelas e receber o valor de uma vez. O desconto sai do próprio saldo do FGTS, sem parcela no salário.\n\nO valor liberado depende do saldo e das regras em vigor. Na Speed Financeira, em Varginha, a gente simula com você, mostra quanto entra na conta e explica a autorização que precisa ser feita no aplicativo do FGTS.',
      'Atendente mostrando a simulação na tela, sem dados do cliente.'),
    p('2026-11-06', 'Segurança', 'financeira varginha',
      'Golpe do falso empréstimo: desconfie de quem pede depósito, taxa ou "seguro" antes de liberar o dinheiro. Correspondente bancário sério não cobra nada antecipado.\n\nNa Speed Financeira o atendimento é presencial, na Rua Santa Cruz, 696, no Centro de Varginha, e o contrato é sempre do banco, em seu nome. Na dúvida, venha conferir pessoalmente antes de pagar qualquer coisa.',
      'Fachada da loja com o número 696 visível.', 'Saiba mais', false),

    // Semana 2
    p('2026-11-09', 'Consignado CLT', 'consignado clt varginha',
      'Trabalha com carteira assinada? O consignado do trabalhador desconta as parcelas direto no salário e costuma ter juros menores que o crédito pessoal e o cartão.\n\nNa Speed Financeira, em Varginha, a gente consulta as ofertas disponíveis para você, compara os bancos e explica o custo total antes de qualquer contratação.',
      'Equipe no balcão (com autorização de quem aparece).'),
    p('2026-11-11', 'Portabilidade', 'empréstimo consignado varginha',
      'Já tem consignado e acha a parcela alta? Com a portabilidade, o contrato passa para outro banco com condições melhores, e em alguns casos a parcela diminui ou sobra um valor para você.\n\nTraga o extrato do seu empréstimo à Speed Financeira, no Centro de Varginha. A gente compara e só segue se a troca valer a pena para você.',
      'Mãos segurando um extrato genérico, sem dados legíveis.'),
    p('2026-11-13', 'Atendimento', 'empréstimo varginha',
      'O que trazer para simular seu empréstimo na Speed Financeira:\n\n- documento com foto (RG ou CNH);\n- CPF;\n- comprovante de endereço;\n- aposentado ou pensionista: extrato do benefício (a gente ajuda a tirar);\n- carteira assinada: último holerite.\n\nAtendimento presencial na Rua Santa Cruz, 696, Centro de Varginha.',
      'Balcão de atendimento organizado.', 'Ligar agora', false),

    // Semana 3 (20/11 é feriado da Consciência Negra)
    p('2026-11-16', 'Garantia de veículo', 'empréstimo varginha',
      'Tem carro ou moto quitado? O empréstimo com garantia de veículo usa o bem como garantia e costuma ter juros menores que o crédito pessoal. Você continua usando o veículo normalmente.\n\nNa Speed Financeira, em Varginha, a gente avalia as condições com você e mostra o custo total antes de qualquer decisão.',
      'Fachada da loja; evite foto de carro de cliente.'),
    p('2026-11-18', 'Servidor público', 'empréstimo consignado varginha',
      'Servidor público também tem acesso ao consignado, com parcela descontada em folha. Na Speed Financeira, no Centro de Varginha, a gente confere sua margem, compara as condições dos bancos conveniados e explica cada detalhe do contrato.',
      'Atendente em atendimento (sem rosto de cliente).'),
    p('2026-11-19', 'Consignado INSS', 'consignado inss varginha',
      'Aposentado com consignado antigo: dependendo do tempo de contrato, dá para refinanciar e liberar um valor novo, ou trazer o contrato para um banco com parcela menor. A Speed Financeira, em Varginha, faz essa conta com você antes de qualquer mudança.\n\nAmanhã, 20/11, é feriado da Consciência Negra: confira nesta ficha o horário de atendimento.',
      'Mesa de atendimento.'),

    // Semana 4
    p('2026-11-23', 'Educação financeira', 'financeira varginha',
      'A primeira parcela do 13º salário deve ser paga até 30 de novembro. Uma boa forma de usar esse dinheiro é quitar ou reduzir a dívida mais cara, como rotativo do cartão e cheque especial, que costumam ter os juros mais altos.\n\nSe a dívida for maior que o 13º, a Speed Financeira, em Varginha, ajuda a ver se trocar por um crédito com parcela fixa e juros menores compensa.',
      'Fachada da loja de manhã.'),
    p('2026-11-25', 'Educação financeira', 'empréstimo varginha',
      'Antes de contratar um empréstimo, olhe o CET, o custo efetivo total. Ele soma juros, tarifas, seguros e impostos e mostra quanto o crédito custa de verdade. Parcela menor nem sempre é mais barata: às vezes o prazo é tão longo que o total pago fica muito maior.\n\nNa Speed Financeira, em Varginha, toda simulação mostra o CET e o total a pagar.',
      'Atendente apontando para uma simulação na tela.', 'Saiba mais'),
    p('2026-11-27', 'Educação financeira', 'financeira varginha',
      'Black Friday: antes de parcelar no cartão, confira se cabe no orçamento dos próximos meses. Se a fatura já está pesada, evite o rotativo, que costuma ter os juros mais altos do mercado.\n\nSe a dívida do cartão já virou uma bola de neve, venha conversar na Speed Financeira, no Centro de Varginha. A gente mostra as opções para trocar por uma parcela fixa e menor.',
      'Fachada da loja.'),

    // Semana 5
    p('2026-11-30', 'Consignado INSS', 'consignado inss varginha',
      'Sabe quanto do seu benefício já está comprometido com empréstimos? O extrato de empréstimos do Meu INSS mostra os contratos ativos e a margem que ainda está livre.\n\nNa Speed Financeira, em Varginha, a gente tira esse extrato com você, explica cada contrato e mostra se vale a pena um novo crédito, um refinanciamento ou a portabilidade.',
      'Tela do Meu INSS na loja, sem dados pessoais.'),
    p('2026-12-02', 'Antecipação FGTS', 'antecipação fgts varginha',
      'Seu FGTS está parado? Com o saque-aniversário, dá para antecipar parcelas e usar o dinheiro agora, sem parcela no salário.\n\nA Speed Financeira, no Centro de Varginha, consulta com você quanto pode ser antecipado e explica o passo a passo da autorização no aplicativo.',
      'Equipe no balcão.'),
    p('2026-12-04', 'Avaliações', 'speed financeira varginha',
      'Mais de 200 avaliações no Google com nota 4,8. Obrigado a cada cliente que dedicou um minuto para contar como foi o atendimento na Speed Financeira.\n\nJá foi atendido por aqui? Sua avaliação ajuda outras pessoas de Varginha a escolher com segurança onde fazer o empréstimo. Conte qual serviço você fez e como foi.',
      'Equipe reunida na frente da loja (com autorização).', 'Ligar agora', false),

    // Semana 6
    p('2026-12-07', 'Veículos', 'financiamento de veículos varginha',
      'Vai trocar de carro ou moto? Antes de fechar o financiamento na loja de veículos, simule também na Speed Financeira, em Varginha. A gente compara as condições de bancos diferentes e mostra o custo total, para você negociar com mais segurança.',
      'Fachada da loja.'),
    p('2026-12-09', 'Consignado CLT', 'consignado clt varginha',
      'Quem tem carteira assinada pode trocar dívidas caras, como cartão e cheque especial, por um consignado com desconto em folha e juros menores. O valor e o prazo dependem do salário e das ofertas disponíveis.\n\nNa Speed Financeira, em Varginha, a gente faz a conta com você antes de qualquer contratação.',
      'Atendente ao telefone no balcão.'),
    p('2026-12-11', 'Atendimento', 'empréstimo varginha',
      'Atendimento presencial no Centro de Varginha, na Rua Santa Cruz, 696, perto dos bancos. Você conversa com uma pessoa, entende o contrato e assina com calma.\n\nPrefere começar à distância? Toque em Ligar nesta ficha e já adiante a simulação. Atendemos Varginha e cidades da região.',
      'Fachada com a rua e o número da loja.'),

    // Semana 7
    p('2026-12-14', 'Portabilidade', 'empréstimo consignado varginha',
      'Seu consignado foi feito há algum tempo? Os juros e as condições dos bancos mudam, e pode ser que outro banco ofereça uma parcela menor para o mesmo contrato.\n\nA Speed Financeira, no Centro de Varginha, compara as opções de portabilidade e só recomenda a troca quando ela é melhor para você.',
      'Mesa de atendimento.'),
    p('2026-12-16', 'Educação financeira', 'financeira varginha',
      'A segunda parcela do 13º deve ser paga até 20 de dezembro. Antes de gastar tudo nas festas, separe uma parte para as contas de janeiro, que costumam pesar: IPVA, IPTU, matrícula e material escolar.\n\nPlanejar agora evita entrar no cheque especial no começo do ano. Precisa organizar as dívidas? A Speed Financeira, em Varginha, ajuda você a fazer as contas.',
      'Fachada da loja.', 'Saiba mais'),
    p('2026-12-18', 'Segurança', 'financeira varginha',
      'No fim de ano, os golpes de falso empréstimo e de falsa central de banco aumentam. Nunca faça depósito ou Pix para liberar crédito e não passe senha nem código recebido por SMS.\n\nA Speed Financeira não cobra nenhum valor antecipado. Antes das festas, confira nesta ficha o horário de atendimento de Natal e Ano Novo.',
      'Fachada da loja.', 'Saiba mais', false),

    // Semana 8 (25/12 é Natal)
    p('2026-12-21', 'Crédito pessoal', 'empréstimo varginha',
      'Crédito pessoal ou consignado? Para aposentados, pensionistas, servidores e quem tem carteira assinada, o consignado costuma ter juros bem menores, porque a parcela é descontada direto no benefício ou no salário. O crédito pessoal é uma opção para quem não tem acesso ao consignado.\n\nNa Speed Financeira, em Varginha, a gente mostra qual faz mais sentido para você.',
      'Atendente no balcão.'),
    p('2026-12-23', 'Avaliações', 'speed financeira varginha',
      'A equipe da Speed Financeira agradece a confiança de cada cliente de Varginha e região em 2026. Desejamos um Natal com saúde e um ano novo com as contas em dia.\n\nConfira nesta ficha o horário de atendimento de Natal e Ano Novo.',
      'Equipe reunida na loja (com autorização).', 'Ligar agora', false),

    // Semana 9
    p('2026-12-28', 'Educação financeira', 'empréstimo varginha',
      'Quer começar 2027 com as dívidas organizadas? Liste tudo o que deve, com o valor da parcela e os juros de cada uma, e comece pela mais cara. Trocar várias dívidas caras por uma só, com juros menores, pode aliviar o orçamento.\n\nTraga sua lista à Speed Financeira, no Centro de Varginha. A simulação não tem custo nem compromisso.',
      'Mesa de atendimento com caneta e papel.'),
    p('2026-12-30', 'Consignado INSS', 'consignado inss varginha',
      'Aposentados e pensionistas: em janeiro a Speed Financeira segue atendendo no Centro de Varginha para consignado, refinanciamento e portabilidade. Se você planeja um crédito para o começo do ano, venha simular com calma e compare o custo total antes de decidir.\n\nConfira nesta ficha o horário de atendimento do Ano Novo.',
      'Fachada da loja.')
  ];
})();
