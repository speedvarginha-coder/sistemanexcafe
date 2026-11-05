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
  '2026-11-06': ['Vai financiar *carro* ou moto?', 'FINANCIAMENTO DE VEÍCULO • Simule', 'homem'],
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
  '2026-12-02': ['Empréstimo *consignado* em Varginha', 'INSS • CLT • SERVIDOR', 'casal'],
  '2026-12-04': ['Obrigado pelas mais de *200* avaliações', 'Conte como foi no Google', 'balcao'],
  '2026-12-07': ['Pouco tempo de *carteira*?', 'CONSIGNADO CLT • Compare os bancos', 'balcao'],
  '2026-12-09': ['Dívida cara? *Parcela* em folha', 'CONSIGNADO CLT', 'homem'],
  '2026-12-11': ['Nome *negativado*? Veja suas opções', 'CONSIGNADO E FGTS • Sujeito a análise', 'cozinha'],
  '2026-12-14': ['Seu consignado pode ficar mais *leve*', 'PORTABILIDADE', 'senhora'],
  '2026-12-16': ['Separe parte do 13º para *janeiro*', 'IPVA, IPTU e material escolar', 'cozinha'],
  '2026-12-18': ['Fim de ano: *atenção* aos golpes', 'Nunca faça Pix para liberar crédito', 'senhora'],
  '2026-12-21': ['Consignado ou crédito *pessoal*?', 'Mostramos o que faz sentido', 'homem'],
  '2026-12-23': ['Obrigado pela *confiança* em 2026', 'Boas festas, Varginha!', 'casal'],
  '2026-12-28': ['Comece 2027 com as *dívidas* em ordem', 'Simulação sem custo', 'senhora'],
  '2026-12-30': ['Crédito para começar *2027* com calma', 'CONSIGNADO INSS', 'casal'],
  // Posts que o servidor publica (05/11/2026). Entram no fim da lista para não mudar a variação das artes já feitas.
  '2026-12-22': ['No Natal, confira o *extrato* dos seus pais', 'APOSENTADOS • Meu INSS', 'casal'],
  '2026-12-29': ['Comece 2027 sem *rotativo*', 'CONSIGNADO CLT • Desconto em folha', 'homem'],
  '2027-01-04': ['Ano novo, dívida *mais barata*', 'CONSIGNADO CLT', 'balcao'],
  '2027-01-06': ['Benefício reajustado, *margem* nova?', 'CONSIGNADO INSS • Consulte', 'senhora'],
  '2027-01-08': ['IPVA, IPTU e *material escolar*', 'Compare antes de contratar', 'cozinha'],
  '2027-01-11': ['Pediram *Pix* para liberar crédito?', 'É GOLPE • Não pague', 'senhora'],
  '2027-01-13': ['Quanto posso pegar no *consignado CLT*?', 'Depende da sua margem', 'homem'],
  '2027-01-15': ['Vai *financiar* em 2027?', 'Compare o CET', 'balcao'],
  '2027-01-18': ['Já pagou parte do *consignado*?', 'REFINANCIAMENTO • A gente faz a conta', 'casal'],
  '2027-01-20': ['Foi atendido na Speed? *Avalie*', 'Sua opinião ajuda Varginha', 'balcao'],
  '2027-01-22': ['O que trazer para o *consignado CLT*', 'Documento, CPF e holerite', 'homem'],
  '2027-01-25': ['Aposentado: 3 *cuidados* antes de assinar', 'CONSIGNADO INSS', 'casal'],
  '2027-01-27': ['Quem pode fazer *crédito consignado*', 'INSS • CLT • SERVIDOR', 'senhora'],
  '2027-01-29': ['Simulação de *consignado* sem custo', 'Compare vários bancos', 'balcao']
};

window.SPEED_GMB_POSTS_PLANO = (function () {
  const RODAPE = 'Crédito sujeito a análise. A Speed Financeira é correspondente bancário e não cobra nenhum valor antecipado.';
  // Botão Saiba mais abre o WhatsApp oficial (35) 3067-5017 com a data do post na mensagem: a loja quase não atende telefone.
  const WHATSAPP = 'https://wa.me/553530675017?text=';
  const whatsapp = data => WHATSAPP + encodeURIComponent(`Olá! Vi o post da Speed Financeira no Google (${data.slice(8, 10)}/${data.slice(5, 7)}) e quero fazer uma simulação.`);
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
  // Post que o servidor do Nexcafe publica sozinho no dia, às 9h (server/app.js, gmbPostsDue): a API do Google
  // não programa post novo. A arte vai antes para speedfinanceira.com.br/midia/posts/google-AAAA-MM-DD.png.
  const s = (...args) => ({ ...p(...args), programadoEm: '2026-11-05', publicarPeloServidor: true, fotoUrl: `https://speedfinanceira.com.br/midia/posts/google-${args[0]}.png` });
  const p = (data, tema, termo, texto, foto, rodape = true) =>
    ({ id: `post-${data}`, data, tema, termo, texto: rodape ? `${texto}\n\n${RODAPE}` : texto, foto, botao: 'Saiba mais', link: whatsapp(data), arte: arte(data), programadoEm: PROGRAMADO_EM });

  return [
    // Semana 1
    p('2026-11-03', 'Consignado INSS', 'crédito consignado varginha',
      'Crédito consignado em Varginha para aposentados e pensionistas do INSS: na Speed Financeira, no Centro, você compara as propostas de vários bancos num só atendimento e sai sabendo o valor da parcela, o prazo e o custo total antes de assinar.\n\nTraga um documento com foto. Se não tiver o extrato do benefício, a gente ajuda a tirar no Meu INSS durante o atendimento.',
      'Mesa de atendimento com a fachada ao fundo.'),
    p('2026-11-04', 'Antecipação FGTS', 'empréstimo do fgts varginha',
      'Empréstimo do FGTS em Varginha: quem aderiu ao saque-aniversário pode antecipar parcelas e receber o valor de uma vez, sem parcela no salário. O desconto sai do próprio saldo do FGTS.\n\nO valor liberado depende do saldo e das regras em vigor. Na Speed Financeira, no Centro, a gente simula com você, mostra quanto entra na conta e explica a autorização que precisa ser feita no aplicativo do FGTS.',
      'Atendente mostrando a simulação na tela, sem dados do cliente.'),
    // 06/11 era alerta de golpe; trocado em 30/10 porque um alerta igual foi publicado na ficha nesse dia.
    p('2026-11-06', 'Financiamento de veículo', 'financiamento de veículo varginha',
      'Financiamento de veículo em Varginha: antes de fechar a compra do carro ou da moto, compare o custo efetivo total (CET) das propostas, e não só o valor da parcela. Uma entrada maior e um prazo menor costumam deixar o total pago bem mais baixo.\n\nNa Speed Financeira, no Centro, a gente simula com você e mostra a parcela, o CET e o total a pagar antes de qualquer decisão.',
      'Fachada da loja; evite foto de carro de cliente.'),

    // Semana 2
    p('2026-11-09', 'Consignado CLT', 'empréstimo clt varginha',
      'Empréstimo CLT em Varginha: quem trabalha com carteira assinada pode contratar o consignado do trabalhador, com as parcelas descontadas direto no salário. Ele costuma ter juros menores que o crédito pessoal e o cartão.\n\nNa Speed Financeira, no Centro, a gente consulta as ofertas disponíveis para você, compara os bancos e explica o custo total antes de qualquer contratação.',
      'Equipe no balcão (com autorização de quem aparece).'),
    p('2026-11-11', 'Portabilidade', 'portabilidade de consignado varginha',
      'Portabilidade de consignado em Varginha: se a parcela do seu empréstimo consignado está alta, o contrato pode passar para outro banco com condições melhores. Em alguns casos a parcela diminui ou sobra um valor para você.\n\nTraga o extrato do seu empréstimo à Speed Financeira, no Centro. A gente compara e só segue se a troca valer a pena para você.',
      'Mãos segurando um extrato genérico, sem dados legíveis.'),
    p('2026-11-13', 'Atendimento', 'empréstimo varginha',
      'Vai fazer um empréstimo em Varginha? Veja o que trazer para simular na Speed Financeira:\n\n- documento com foto (RG ou CNH);\n- CPF;\n- comprovante de endereço;\n- aposentado ou pensionista: extrato do benefício (a gente ajuda a tirar);\n- carteira assinada: último holerite.\n\nAtendimento presencial na Rua Santa Cruz, 696, Centro de Varginha.',
      'Balcão de atendimento organizado.', false),

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
      'Atendente apontando para uma simulação na tela.'),
    p('2026-11-27', 'Educação financeira', 'empréstimo pessoal varginha',
      'Black Friday em Varginha: se a fatura do cartão pesar, um empréstimo pessoal com parcela fixa costuma sair mais barato que o rotativo, que tem os juros mais altos do mercado.\n\nAntes de parcelar, confira se as compras cabem no orçamento dos próximos meses. Se a dívida do cartão já virou uma bola de neve, venha conversar na Speed Financeira, no Centro: a gente compara empréstimo pessoal e consignado e mostra o custo total.',
      'Fachada da loja.'),

    // Semana 5
    p('2026-11-30', 'Consignado INSS', 'empréstimo inss varginha',
      'Empréstimo INSS em Varginha: sabe quanto do seu benefício já está comprometido? O extrato de empréstimos do Meu INSS mostra os contratos ativos e a margem que ainda está livre.\n\nNa Speed Financeira, no Centro, a gente tira esse extrato com você, explica cada contrato e mostra se vale a pena um novo crédito, um refinanciamento ou a portabilidade.',
      'Tela do Meu INSS na loja, sem dados pessoais.'),
    // 02, 07, 14 e 16/12 trocados em 05/11/2026 pelas buscas reais da ficha (ago-out/2026): "empréstimo consignado"
    // (146 buscas) não estava em nenhum post; FGTS, consórcio e "financeira" quase não aparecem nas buscas.
    p('2026-12-02', 'Consignado', 'empréstimo consignado varginha',
      'Empréstimo consignado em Varginha: a parcela é descontada direto do benefício do INSS ou do salário, por isso os juros costumam ser menores que os do crédito pessoal e do cartão. Podem fazer aposentados e pensionistas do INSS, servidores públicos e quem tem carteira assinada.\n\nNa Speed Financeira, no Centro, a gente consulta sua margem, compara as propostas de vários bancos e mostra a parcela e o custo total antes de você decidir.',
      'Mesa de atendimento com a fachada ao fundo.'),
    p('2026-12-04', 'Avaliações', 'financeira em varginha',
      'Financeira em Varginha com mais de 200 avaliações no Google e nota 4,8: obrigado a cada cliente que contou como foi o atendimento na Speed Financeira.\n\nJá foi atendido por aqui? Sua avaliação ajuda outras pessoas da cidade a escolher com segurança onde fazer o empréstimo. Conte qual serviço você fez e como foi.',
      'Equipe reunida na frente da loja (com autorização).', false),

    // Semana 6
    p('2026-12-07', 'Consignado CLT', 'empréstimo clt varginha',
      'Empréstimo CLT em Varginha com pouco tempo de carteira assinada? Cada banco define quanto tempo de empresa exige para o consignado do trabalhador, e um pode aceitar quando outro recusa.\n\nPor isso vale comparar. Na Speed Financeira, no Centro, a gente consulta as ofertas dos bancos para você, mostra a parcela e o custo total e só segue se fizer sentido para o seu orçamento.',
      'Equipe no balcão.'),
    p('2026-12-09', 'Consignado CLT', 'consignado clt varginha',
      'Consignado CLT em Varginha: quem tem carteira assinada pode trocar dívidas caras, como cartão e cheque especial, por um empréstimo com desconto em folha e juros menores. O valor e o prazo dependem do salário e das ofertas disponíveis.\n\nNa Speed Financeira, no Centro, a gente faz a conta com você antes de qualquer contratação.',
      'Atendente ao telefone no balcão.'),
    p('2026-12-11', 'Negativado', 'empréstimo para negativado varginha',
      'Empréstimo para negativado em Varginha: nome no SPC ou no Serasa nem sempre impede o crédito. No consignado do INSS e na antecipação do saque-aniversário do FGTS, a parcela sai direto do benefício ou do saldo, e muitos bancos aceitam mesmo com restrição, sempre após análise.\n\nNa Speed Financeira, no Centro, a gente consulta as opções para o seu caso, sem cobrar nada antecipado.',
      'Mesa de atendimento.'),

    // Semana 7
    p('2026-12-14', 'Portabilidade', 'empréstimo consignado varginha',
      'Empréstimo consignado em Varginha com parcela mais leve: se o seu consignado foi feito há algum tempo, outro banco pode oferecer juros menores para o mesmo contrato. É a portabilidade, e em alguns casos a parcela diminui ou sobra um valor para você.\n\nA Speed Financeira, no Centro, compara as opções e só recomenda a troca quando ela é melhor para você.',
      'Mesa de atendimento.'),
    p('2026-12-16', 'Educação financeira', 'empréstimo pessoal varginha',
      'Empréstimo pessoal em Varginha no começo do ano? Antes, use a segunda parcela do 13º, que deve ser paga até 20 de dezembro: separe uma parte para as contas de janeiro, como IPVA, IPTU, matrícula e material escolar.\n\nSe mesmo assim faltar, compare antes de contratar: o consignado costuma ter juros menores que o pessoal. Na Speed Financeira, no Centro, a gente faz as contas com você.',
      'Fachada da loja.'),
    p('2026-12-18', 'Segurança', 'empréstimo varginha',
      'Fim de ano é época de golpe do falso empréstimo em Varginha e em todo o país: nunca faça depósito ou Pix para liberar crédito e não passe senha nem código recebido por SMS.\n\nA Speed Financeira não cobra nenhum valor antecipado e atende presencialmente na Rua Santa Cruz, 696, no Centro. Antes das festas, confira nesta ficha o horário de Natal e Ano Novo.',
      'Fachada da loja.', false),

    // Semana 8 (25/12 é Natal)
    p('2026-12-21', 'Crédito pessoal', 'empréstimo pessoal varginha',
      'Empréstimo pessoal ou consignado em Varginha? Para aposentados, pensionistas, servidores e quem tem carteira assinada, o consignado costuma ter juros bem menores, porque a parcela é descontada direto no benefício ou no salário.\n\nO empréstimo pessoal é uma opção para quem não tem acesso ao consignado. Na Speed Financeira, no Centro, a gente mostra qual faz mais sentido para você.',
      'Atendente no balcão.'),
    s('2026-12-22', 'Consignado INSS', 'empréstimo consignado varginha',
      'Empréstimo consignado em Varginha: vai encontrar seus pais aposentados no Natal? Aproveite para conferir com eles o extrato de empréstimos no Meu INSS. Ele mostra os contratos ativos e quanto do benefício já está comprometido, e ajuda a perceber um desconto que ninguém pediu.\n\nFicou alguma dúvida? Traga o extrato à Speed Financeira, no Centro, e a gente explica cada contrato com calma.',
      'Casal de aposentados em casa.'),
    p('2026-12-23', 'Avaliações', 'financeira varginha',
      'A Speed Financeira agradece a confiança de cada cliente de Varginha e região em 2026. Desejamos um Natal com saúde e um ano novo com as contas em dia.\n\nConfira nesta ficha o horário de atendimento de Natal e Ano Novo.',
      'Equipe reunida na loja (com autorização).', false),

    // Semana 9
    p('2026-12-28', 'Educação financeira', 'empréstimo varginha',
      'Empréstimo para organizar as dívidas em Varginha: quer começar 2027 com as contas em ordem? Liste tudo o que deve, com a parcela e os juros de cada uma, e comece pela mais cara. Trocar várias dívidas caras por um só crédito, com juros menores, pode aliviar o orçamento.\n\nTraga sua lista à Speed Financeira, no Centro. A simulação não tem custo nem compromisso.',
      'Mesa de atendimento com caneta e papel.'),
    s('2026-12-29', 'Consignado CLT', 'empréstimo clt varginha',
      'Empréstimo CLT em Varginha para começar 2027 sem rotativo: quem tem carteira assinada pode trocar a dívida do cartão e do cheque especial por um consignado com parcela descontada em folha, que costuma ter juros bem menores.\n\nNa Speed Financeira, no Centro, a gente compara as ofertas dos bancos, mostra a parcela e o custo total e só segue se a troca valer a pena para você.',
      'Atendente no balcão.'),
    p('2026-12-30', 'Consignado INSS', 'empréstimo para aposentado varginha',
      'Empréstimo para aposentado em Varginha: em janeiro a Speed Financeira segue atendendo no Centro para consignado, refinanciamento e portabilidade de aposentados e pensionistas do INSS.\n\nSe você planeja um crédito para o começo do ano, venha simular com calma e compare o custo total antes de decidir. Confira nesta ficha o horário de atendimento do Ano Novo.',
      'Fachada da loja.'),

    // Janeiro de 2027: publicados pelo servidor. Termos pelas buscas reais da ficha (ago-out/2026):
    // empréstimo consignado e empréstimo CLT primeiro; 01/01 é feriado.
    s('2027-01-04', 'Consignado CLT', 'empréstimo clt varginha',
      'Empréstimo CLT em Varginha: ano novo pode ser a hora de trocar a dívida mais cara por uma mais barata. Com carteira assinada, o consignado do trabalhador tem a parcela descontada em folha e costuma ter juros menores que o cartão e o crédito pessoal.\n\nNa Speed Financeira, no Centro, a gente consulta as ofertas dos bancos para você e mostra o custo total antes de qualquer contratação.',
      'Balcão de atendimento.'),
    s('2027-01-06', 'Consignado INSS', 'empréstimo consignado varginha',
      'Empréstimo consignado em Varginha para aposentados e pensionistas: em janeiro os benefícios do INSS costumam ser reajustados, e a margem consignável acompanha o valor do benefício. Pode ser que você tenha um valor livre que não tinha antes.\n\nNa Speed Financeira, no Centro, a gente consulta sua margem com você, compara as propostas dos bancos e mostra a parcela e o custo total.',
      'Aposentada em atendimento.'),
    s('2027-01-08', 'Crédito pessoal', 'empréstimo pessoal varginha',
      'Empréstimo pessoal em Varginha para IPVA, IPTU e material escolar? Antes de contratar, veja se dá para pagar à vista com desconto ou parcelar direto, e compare: quem é aposentado, servidor ou tem carteira assinada costuma conseguir juros menores no consignado.\n\nNa Speed Financeira, no Centro, a gente mostra as opções lado a lado, com a parcela e o custo total.',
      'Mesa com material escolar.'),
    s('2027-01-11', 'Segurança', 'empréstimo varginha',
      'Empréstimo em Varginha: se pediram Pix, depósito ou boleto para liberar o seu crédito, é golpe. Banco e correspondente bancário não cobram nada antecipado para liberar empréstimo, e ninguém precisa da sua senha ou do código que chegou por SMS.\n\nNa dúvida, não pague e não envie documentos. Venha à Speed Financeira, na Rua Santa Cruz, 696, no Centro, e a gente confere com você.',
      'Fachada da loja.', false),
    s('2027-01-13', 'Consignado CLT', 'consignado clt varginha',
      'Consignado CLT em Varginha: quanto posso pegar? Depende da sua margem, que é a parte do salário que pode ser comprometida com a parcela, e das ofertas que os bancos fazem para a sua empresa e o seu tempo de carteira.\n\nNa Speed Financeira, no Centro, a gente consulta isso com você, compara os bancos e mostra a parcela, o prazo e o custo total antes de qualquer decisão.',
      'Atendente com o cliente no balcão.'),
    s('2027-01-15', 'Financiamento', 'financiamento varginha',
      'Financiamento em Varginha: vai trocar de carro ou moto em 2027? Antes de fechar, compare o custo efetivo total (CET) das propostas, e não só a parcela. Uma entrada maior e um prazo menor costumam reduzir bastante o total pago.\n\nNa Speed Financeira, no Centro, a gente simula financiamento e empréstimo com garantia de veículo e mostra o que sai mais barato para você.',
      'Fachada da loja; evite foto de carro de cliente.'),
    s('2027-01-18', 'Refinanciamento', 'empréstimo consignado varginha',
      'Empréstimo consignado em Varginha: já pagou parte das parcelas? Dependendo do contrato, o refinanciamento pode liberar um valor novo, e a portabilidade pode levar o contrato para um banco com juros menores. O prazo e o custo mudam, então a conta precisa ser feita antes.\n\nTraga o seu contrato à Speed Financeira, no Centro. A gente compara as opções e só recomenda o que vale a pena.',
      'Casal com o contrato na mesa.'),
    s('2027-01-20', 'Avaliações', 'empréstimo varginha',
      'Empréstimo em Varginha com atendimento de verdade: se você já fez um consignado, uma portabilidade ou uma simulação na Speed Financeira, conte aqui no Google como foi. Sua avaliação ajuda outras pessoas da cidade a escolher com segurança onde contratar crédito.\n\nVale contar qual serviço você fez e como foi o atendimento no Centro.',
      'Equipe no balcão (com autorização).', false),
    s('2027-01-22', 'Consignado CLT', 'empréstimo clt varginha',
      'Empréstimo CLT em Varginha: o que trazer para simular o consignado do trabalhador na Speed Financeira:\n\n- documento com foto (RG ou CNH);\n- CPF;\n- último holerite;\n- comprovante de endereço.\n\nCom isso a gente consulta as ofertas dos bancos para você e mostra a parcela e o custo total, sem compromisso. Atendimento na Rua Santa Cruz, 696, Centro.',
      'Documentos sobre o balcão, sem dados legíveis.', false),
    s('2027-01-25', 'Consignado INSS', 'empréstimo para aposentado varginha',
      'Empréstimo para aposentado em Varginha: três cuidados antes de assinar. Primeiro, saiba quanto de margem você tem. Segundo, compare o custo efetivo total (CET), não só a parcela. Terceiro, desconfie de quem pede dinheiro antes de liberar o crédito: isso é golpe.\n\nNa Speed Financeira, no Centro, a gente faz essa conferência com você antes de qualquer contrato.',
      'Casal de aposentados em atendimento.'),
    s('2027-01-27', 'Consignado', 'crédito consignado varginha',
      'Crédito consignado em Varginha: quem pode fazer? Aposentados e pensionistas do INSS, servidores públicos e quem tem carteira assinada. A parcela sai direto do benefício ou do salário, por isso os juros costumam ser menores.\n\nCada caso tem a sua margem e as suas regras. Na Speed Financeira, no Centro, a gente confere o seu e compara as propostas de vários bancos.',
      'Atendente explicando uma simulação.'),
    s('2027-01-29', 'Consignado', 'empréstimo consignado varginha',
      'Empréstimo consignado em Varginha com simulação sem custo: na Speed Financeira, no Centro, você compara as propostas de vários bancos num só atendimento e sai sabendo a parcela, o prazo e o custo total antes de assinar.\n\nTraga um documento com foto. Aposentado ou pensionista: se não tiver o extrato do benefício, a gente ajuda a tirar durante o atendimento.',
      'Mesa de atendimento com a fachada ao fundo.')
  ];
})();
