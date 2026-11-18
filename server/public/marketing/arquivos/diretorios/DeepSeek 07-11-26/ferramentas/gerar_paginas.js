#!/usr/bin/env node
/*
  Gerador das páginas orgânicas da Speed.
  Fonte de NAP: dados/nap.json (fonte única).
  Saída: paginas/*.html

  Uso: node ferramentas/gerar_paginas.js
  Não publica nada. Apenas grava rascunhos HTML.
*/
'use strict';

const fs = require('fs');
const path = require('path');

const nap = require(path.join(__dirname, '..', 'dados', 'nap.json'));
const OUT = path.join(__dirname, '..', 'paginas');

const NOME = nap.nome_exibicao;
const TEL = nap.telefone.exibicao;
const E164 = nap.telefone.e164;
const WPP = nap.telefone.whatsapp;
const EMAIL = nap.email;
const CNPJ = nap.cnpj;
const SITE = nap.site;
const CEP = nap.endereco.cep;
const CIDADE = nap.endereco.cidade;
const UF = nap.endereco.uf;
const ENDERECO = nap.endereco.logradouro + ', ' + nap.endereco.numero + ' — ' +
  nap.endereco.bairro + ' — ' + CIDADE + '/' + UF;

function zap(msg) {
  return 'https://wa.me/' + WPP + '?text=' + encodeURIComponent(msg);
}

const CSS = `
:root{--verde:#019652;--verde-escuro:#016b3b;--amarelo:#FADB20;--tinta:#14231b;--texto:#33443b;--claro:#f6f8f7;--branco:#fff;--borda:#e2e8e4;--sombra:0 10px 30px rgba(20,35,27,.08);--raio:16px;--max:1080px}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--claro);color:var(--texto);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:var(--verde-escuro)}
.wrap{max-width:var(--max);margin:0 auto;padding:0 20px}
.skip{position:absolute;left:-9999px}
.skip:focus{left:16px;top:16px;background:#fff;padding:10px 14px;border-radius:8px;z-index:99}
header{background:#fff;border-bottom:1px solid var(--borda);position:sticky;top:0;z-index:20}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0}
.marca{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--tinta);font-weight:800;letter-spacing:-.2px}
.marca .ponto{width:34px;height:34px;border-radius:10px;background:var(--verde);display:grid;place-items:center;color:#fff;font-size:15px;font-weight:800}
.marca small{display:block;font-size:11px;font-weight:600;color:#6b7d73;letter-spacing:.4px;text-transform:uppercase}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--verde);color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:999px;border:2px solid var(--verde);transition:transform .15s,background .15s}
.btn:hover{background:var(--verde-escuro);border-color:var(--verde-escuro);transform:translateY(-1px)}
.btn:focus-visible{outline:3px solid var(--amarelo);outline-offset:2px}
.btn.sec{background:#fff;color:var(--verde-escuro);border-color:var(--verde)}
.btn.sec:hover{background:#effaf4}
.hero{background:radial-gradient(900px 420px at 85% -10%,rgba(250,219,32,.28),transparent 60%),linear-gradient(140deg,var(--verde-escuro),var(--verde));color:#fff;padding:58px 0 50px;position:relative;overflow:hidden}
.hero:after{content:"";position:absolute;inset:auto -60px -90px auto;width:340px;height:340px;border:40px solid rgba(255,255,255,.08);border-radius:50%}
.hero h1{font-size:clamp(29px,4.8vw,46px);line-height:1.12;letter-spacing:-1px;margin:0 0 14px;max-width:20ch}
.hero p{font-size:clamp(16px,2vw,19px);max-width:60ch;margin:0 0 24px;color:#e8f5ee}
.acoes{display:flex;flex-wrap:wrap;gap:12px}
.hero .btn{background:var(--amarelo);color:#25301f;border-color:var(--amarelo)}
.hero .btn:hover{background:#ffd94a;border-color:#ffd94a}
.hero .btn.sec{background:transparent;color:#fff;border-color:rgba(255,255,255,.55)}
.hero .btn.sec:hover{background:rgba(255,255,255,.12)}
.selos{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
.selo{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);padding:7px 12px;border-radius:999px;font-size:13px;font-weight:600}
section{padding:54px 0}
section.alt{background:#fff;border-block:1px solid var(--borda)}
h2{font-size:clamp(23px,3.2vw,32px);letter-spacing:-.6px;color:var(--tinta);margin:0 0 10px}
.sub{color:#5d7066;margin:0 0 28px;max-width:66ch}
.lead{font-size:17px;color:var(--tinta);max-width:70ch}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.card{display:block;background:#fff;border:1px solid var(--borda);border-radius:var(--raio);padding:22px;box-shadow:0 2px 6px rgba(20,35,27,.04);color:var(--texto);text-decoration:none;transition:box-shadow .15s,transform .15s}
.card:hover{box-shadow:var(--sombra);transform:translateY(-2px)}
.card h3{margin:0 0 8px;font-size:17px;color:var(--tinta)}
.card p{margin:0;font-size:14.5px}
.card .ico{width:40px;height:40px;border-radius:10px;background:#effaf4;color:var(--verde-escuro);display:grid;place-items:center;font-weight:800;margin-bottom:12px;font-size:14px}
.transparencia{background:#fffbe6;border:1px solid #f3e08a;border-radius:12px;padding:14px 18px;font-size:13.8px;color:#5c4b00;margin:18px 0 0}
.transparencia strong{color:#3f3400}
.passos{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));counter-reset:p}
.passo{background:#fff;border:1px solid var(--borda);border-radius:var(--raio);padding:22px;position:relative}
.passo:before{counter-increment:p;content:counter(p);position:absolute;top:-14px;left:20px;width:30px;height:30px;border-radius:50%;background:var(--amarelo);color:#25301f;display:grid;place-items:center;font-weight:800;font-size:14px;border:3px solid var(--claro)}
.passo h3{margin:8px 0 4px;font-size:16px;color:var(--tinta)}
.passo p{margin:0;font-size:14px}
.duas{display:grid;gap:18px;grid-template-columns:1fr 1fr}
.bloco{background:#fff;border:1px solid var(--borda);border-radius:var(--raio);padding:24px}
.bloco h3{margin:0 0 10px;color:var(--tinta);font-size:18px}
.bloco ul{margin:0;padding-left:18px;font-size:14.5px}
.bloco li{margin:7px 0}
.faq{display:grid;gap:10px}
details{background:#fff;border:1px solid var(--borda);border-radius:12px;padding:0 18px}
details[open]{box-shadow:var(--sombra)}
summary{cursor:pointer;font-weight:700;color:var(--tinta);padding:16px 0;list-style:none;display:flex;justify-content:space-between;gap:12px}
summary::-webkit-details-marker{display:none}
summary:after{content:"+";color:var(--verde);font-size:20px;line-height:1}
details[open] summary:after{content:"–"}
details p{margin:0 0 16px;font-size:14.5px}
.cta{background:linear-gradient(140deg,var(--verde-escuro),var(--verde));color:#fff;border-radius:20px;padding:36px;display:flex;flex-wrap:wrap;gap:20px;align-items:center;justify-content:space-between}
.cta h2{color:#fff;margin:0 0 6px}
.cta p{margin:0;color:#dff1e7}
.cta .btn{background:var(--amarelo);color:#25301f;border-color:var(--amarelo)}
footer{background:#0f1c15;color:#c9d8d0;padding:40px 0 96px;margin-top:10px;font-size:13.5px}
footer a{color:#fff}
footer .nap{font-style:normal;line-height:1.8}
footer .fim{border-top:1px solid rgba(255,255,255,.12);margin-top:22px;padding-top:18px;color:#93a89c}
.zap{position:fixed;right:18px;bottom:18px;background:var(--verde);color:#fff;text-decoration:none;padding:14px 20px;border-radius:999px;font-weight:800;box-shadow:0 12px 24px rgba(1,150,82,.35);z-index:30}
.zap:hover{background:var(--verde-escuro)}
@media(max-width:760px){.duas{grid-template-columns:1fr}.hero{padding:44px 0 40px}.bar .btn{display:none}section{padding:42px 0}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
`;

const TRANSPARENCIA_DIGITAL =
  '<strong>Transparência:</strong> a Speed Financeira é uma empresa privada e não representa o INSS, o Governo Federal, o Detran ou qualquer órgão público. ' +
  'Prestamos auxílio na emissão, conferência e impressão de documentos mediante autorização do titular. O acesso aos sistemas oficiais é feito pelo próprio cidadão.';

const PAGES = [
  {
    slug: 'meu-inss-varginha',
    title: 'Meu INSS em Varginha: acesso e impressão | Speed',
    desc: 'Não consegue entrar no Meu INSS? Auxílio presencial em Varginha para acessar, gerar e imprimir extratos e declarações. WhatsApp (35) 3067-5017.',
    h1: 'Meu INSS em Varginha: auxílio para acessar e imprimir',
    lead: 'Se o aplicativo trava, a senha não funciona ou o documento precisa sair no papel, a gente ajuda — com você na frente da tela, digitando a sua senha.',
    selos: ['Atendimento presencial', 'Impressão na hora', 'Centro de Varginha'],
    assunto: 'Meu INSS',
    code: 'DIG',
    msg: 'Olá! Vim pela página do Meu INSS e quero atendimento. [DIG]',
    paras: [
      'O Meu INSS é o aplicativo e o site do INSS para consultar benefício, extrato de contribuição, carta de concessão, agendamentos e declarações. O acesso é pessoal e usa a conta gov.br.',
      'A Speed não é o INSS. A gente orienta o caminho, ajuda a recuperar o acesso quando possível e imprime o documento que você gerar. Nenhum atendente pede, anota ou fotografa a sua senha.',
      'O atendimento é útil para quem não tem familiaridade com aplicativo, esqueceu a senha, trocou de celular ou precisa do documento em papel para entregar em banco, cartório ou empresa.'
    ],
    transparencia: TRANSPARENCIA_DIGITAL,
    stepsTitle: 'Como funciona o atendimento',
    stepsSub: 'Você conduz o acesso. A gente orienta e imprime.',
    steps: [
      { t: 'Chegue com documento e celular', d: 'Traga CPF, documento com foto e o celular que você usa na conta gov.br.' },
      { t: 'Acesse com a gente', d: 'Você digita sua senha no aparelho. Nós mostramos o caminho e não guardamos nada.' },
      { t: 'Escolha o documento', d: 'Extrato, carta de concessão, declaração ou comprovante: localizamos a opção certa.' },
      { t: 'Gere e imprima', d: 'O PDF é conferido com você e impresso na hora, ou enviado por e-mail.' }
    ],
    bringTitle: 'O que levar',
    bring: [
      'CPF e documento com foto',
      'Celular com acesso ao gov.br (ou ajuda para recuperar)',
      'E-mail e telefone atualizados na conta',
      'Lista do que você precisa comprovar',
      'Cartão ou número do benefício, se tiver'
    ],
    helpTitle: 'Onde a Speed ajuda',
    help: [
      'Orientação passo a passo no aplicativo ou site',
      'Recuperação de acesso quando o próprio sistema permite',
      'Impressão e digitalização do documento gerado',
      'Conferência de nome, CPF e dados do benefício',
      'Envio por e-mail ou WhatsApp depois de impresso',
      'Segunda via de documento que você já gerou'
    ],
    faq: [
      { q: 'Vocês são o INSS?', a: 'Não. A Speed é uma empresa privada. O acesso ao Meu INSS é feito pelo próprio cidadão, com nossa orientação.' },
      { q: 'Preciso entregar minha senha?', a: 'Não. Você digita a senha no seu aparelho. Nenhum atendente pede, anota ou fotografa sua senha.' },
      { q: 'Não sei minha senha do gov.br. E agora?', a: 'A recuperação é feita com você, pelo próprio aplicativo. Se não for possível, orientamos o caminho oficial e o que levar.' },
      { q: 'Consigo imprimir na hora?', a: 'Na maioria dos casos, sim. Documentos longos podem ser enviados por e-mail ou retirados depois.' },
      { q: 'Quanto custa?', a: 'O valor do serviço é informado antes de qualquer impressão. Não cobramos nada antecipado.' }
    ],
    related: [
      { href: 'extrato-cnis.html', t: 'Extrato CNIS', d: 'Como emitir e conferir o tempo de contribuição.' },
      { href: 'carta-concessao.html', t: 'Carta de concessão', d: 'Comprovante do benefício para banco e cadastro.' },
      { href: 'conta-govbr.html', t: 'Conta Gov.br', d: 'Criar, recuperar e elevar o nível de acesso.' }
    ]
  },
  {
    slug: 'extrato-cnis',
    title: 'Extrato CNIS: como emitir e imprimir em Varginha',
    desc: 'Veja como tirar o extrato CNIS pelo Meu INSS e imprimir em Varginha. Auxílio presencial para acessar, conferir vínculos e gerar o PDF.',
    h1: 'Extrato CNIS: como emitir e imprimir em Varginha',
    lead: 'O extrato mostra seus vínculos, salários e contribuições. Serve para conferir o tempo antes de pedir aposentadoria — e a gente ajuda a tirar no papel.',
    selos: ['Auxílio presencial', 'Impressão na hora', 'Centro de Varginha'],
    assunto: 'extrato CNIS',
    code: 'DIG',
    msg: 'Olá! Vim pela página do extrato CNIS e quero atendimento. [DIG]',
    paras: [
      'O CNIS é o Cadastro Nacional de Informações Sociais. O extrato reúne os vínculos empregatícios, as remunerações e as contribuições registradas em seu nome.',
      'Ele é um dos documentos usados na análise da aposentadoria, mas não garante benefício nem substitui a contagem oficial feita pelo INSS. Se faltar vínculo, o caminho é pedir a correção no próprio INSS.',
      'A emissão é feita no Meu INSS, com a conta gov.br do titular. A Speed orienta o acesso, ajuda a localizar o extrato, confere o que foi gerado e imprime.'
    ],
    transparencia: TRANSPARENCIA_DIGITAL,
    stepsTitle: 'Passo a passo do extrato',
    stepsSub: 'O caminho é curto; o problema costuma ser o acesso.',
    steps: [
      { t: 'Entre no Meu INSS', d: 'O acesso usa a conta gov.br do titular, no aplicativo ou no site.' },
      { t: 'Abra "Extrato de contribuição"', d: 'A opção fica na área de benefícios e contribuições.' },
      { t: 'Escolha o período', d: 'Você pode ver todo o histórico ou um intervalo específico.' },
      { t: 'Baixe o PDF e confira', d: 'Conferimos nome, CPF e vínculos antes de imprimir.' }
    ],
    bringTitle: 'O que levar',
    bring: [
      'CPF e documento com foto',
      'Celular com a conta gov.br ativa',
      'Se possível, a relação de empregos e períodos',
      'Carteira de trabalho (física ou digital), se tiver',
      'Lista de dúvidas para conferir no extrato'
    ],
    helpTitle: 'Onde a Speed ajuda',
    help: [
      'Localizar o extrato dentro do Meu INSS',
      'Ajudar no acesso ao gov.br',
      'Conferir se os vínculos aparecem no PDF',
      'Imprimir em tamanho legível',
      'Digitalizar e enviar por e-mail',
      'Orientar como pedir correção de vínculo no INSS'
    ],
    faq: [
      { q: 'O extrato CNIS serve para aposentadoria?', a: 'Ele é um dos documentos de conferência. A análise e a concessão são do INSS, e o extrato sozinho não garante o benefício.' },
      { q: 'Quanto tempo demora para emitir?', a: 'Se o acesso ao gov.br estiver funcionando, a emissão é rápida. O tempo maior costuma ser o de recuperar a conta.' },
      { q: 'Posso tirar só pelo celular?', a: 'Sim. O PDF pode ser gerado no celular e enviado para impressão. Se preferir, faça tudo na loja.' },
      { q: 'Vocês guardam meu PDF?', a: 'Não. O arquivo é conferido, impresso ou enviado e não fica armazenado depois do atendimento.' },
      { q: 'Falta um vínculo no meu extrato. O que faço?', a: 'A correção é solicitada ao INSS. Orientamos o caminho e os documentos, mas não alteramos o cadastro por você.' }
    ],
    related: [
      { href: 'meu-inss-varginha.html', t: 'Meu INSS', d: 'Acesso, extratos e declarações do benefício.' },
      { href: 'carta-concessao.html', t: 'Carta de concessão', d: 'Documento que comprova o benefício concedido.' },
      { href: 'conta-govbr.html', t: 'Conta Gov.br', d: 'Criar ou recuperar o acesso usado no Meu INSS.' }
    ]
  },
  {
    slug: 'carta-concessao',
    title: 'Carta de concessão do INSS: emitir e imprimir',
    desc: 'Como emitir a carta de concessão pelo Meu INSS e imprimir em Varginha. Documento usado por banco, consignado e cadastro. Atendimento presencial.',
    h1: 'Carta de concessão do INSS: como emitir e imprimir',
    lead: 'É o documento que mostra que o benefício foi concedido, com valor e data. Bancos e cadastros pedem, e muita gente não sabe onde encontrar.',
    selos: ['Atendimento presencial', 'Impressão na hora', 'Centro de Varginha'],
    assunto: 'carta de concessão',
    code: 'DIG',
    msg: 'Olá! Vim pela página da carta de concessão e quero atendimento. [DIG]',
    paras: [
      'A carta de concessão é emitida pelo INSS e reúne dados do benefício: espécie, data de início, valor e número. Ela é usada como comprovação em bancos, cadastros e processos.',
      'O documento sai pelo Meu INSS, na conta do titular. A Speed ajuda a localizar, conferir e imprimir. Não emitimos a carta em nome do INSS e não prometemos aprovação de crédito.',
      'Se o destino for uma proposta de consignado, a análise é da instituição financeira parceira. A carta é só um dos documentos; ela não garante contratação.'
    ],
    transparencia: TRANSPARENCIA_DIGITAL,
    stepsTitle: 'Como emitir',
    stepsSub: 'Tudo pelo Meu INSS, com a conta do titular.',
    steps: [
      { t: 'Acesse o Meu INSS', d: 'Use o aplicativo ou o site, com a conta gov.br.' },
      { t: 'Procure "Carta de concessão"', d: 'A opção aparece na área do benefício.' },
      { t: 'Selecione o benefício', d: 'Se houver mais de um, confira o número correto.' },
      { t: 'Gere o PDF e confira', d: 'Nome, CPF, valor e data são conferidos antes da impressão.' }
    ],
    bringTitle: 'O que levar',
    bring: [
      'CPF e documento com foto',
      'Celular com acesso ao gov.br',
      'Número ou cartão do benefício, se tiver',
      'Documento de quem vai receber a carta, se for para terceiro',
      'Lista do que o banco ou a empresa pediu'
    ],
    helpTitle: 'Onde a Speed ajuda',
    help: [
      'Localizar a carta no Meu INSS',
      'Conferir os dados do benefício',
      'Imprimir em papel legível',
      'Digitalizar e enviar por e-mail',
      'Organizar os documentos pedidos pelo banco',
      'Explicar que a análise de crédito é da instituição'
    ],
    faq: [
      { q: 'A carta serve como comprovante de renda?', a: 'Em muitos casos, sim, mas depende de quem está pedindo. Alguns bancos aceitam a carta; outros pedem extrato ou declaração específica.' },
      { q: 'Vale para consignado?', a: 'É um dos documentos usados. A aprovação, a taxa e o prazo são definidos pela instituição financeira, após análise.' },
      { q: 'Preciso do documento original?', a: 'Depende de quem recebe. Na maioria dos cadastros, uma cópia legível resolve; confirme antes de pagar por uma via extra.' },
      { q: 'Quanto tempo demora?', a: 'Se o acesso ao Meu INSS estiver funcionando, a emissão é imediata. O tempo maior costuma ser o de recuperar a senha.' },
      { q: 'Vocês guardam meus dados?', a: 'Não. O documento é conferido, impresso ou enviado e não fica armazenado depois do atendimento.' }
    ],
    related: [
      { href: 'meu-inss-varginha.html', t: 'Meu INSS', d: 'Acesso ao aplicativo e às declarações.' },
      { href: 'extrato-cnis.html', t: 'Extrato CNIS', d: 'Vínculos e contribuições para conferência.' },
      { href: 'conta-govbr.html', t: 'Conta Gov.br', d: 'O acesso que destrava todos os serviços.' }
    ]
  },
  {
    slug: 'conta-govbr',
    title: 'Conta Gov.br em Varginha: criar e recuperar acesso',
    desc: 'Ajuda presencial para criar, recuperar e elevar o nível da conta gov.br em Varginha. Sem guardar senha. Atendimento na Rua Santa Cruz, 696.',
    h1: 'Conta Gov.br: ajuda para criar e recuperar acesso',
    lead: 'A conta gov.br destrava Meu INSS, Detran, CNIS e uma lista de serviços. O problema quase sempre está no cadastro, no celular antigo ou na senha.',
    selos: ['Atendimento presencial', 'Sem guardar senha', 'Centro de Varginha'],
    assunto: 'conta Gov.br',
    code: 'DIG',
    msg: 'Olá! Vim pela página da conta Gov.br e quero atendimento. [DIG]',
    paras: [
      'A conta gov.br é a identidade digital usada para acessar serviços públicos federais, estaduais e municipais. Ela tem níveis de segurança (bronze, prata e ouro), que liberam serviços diferentes.',
      'Criar a conta é gratuito. Os problemas mais comuns são senha esquecida, número de celular antigo, nome divergente e dificuldade para subir de nível.',
      'A Speed orienta o processo com você. A senha é digitada por você, no seu aparelho. Nós não anotamos, não fotografamos e não guardamos credenciais.'
    ],
    transparencia: TRANSPARENCIA_DIGITAL,
    stepsTitle: 'Como funciona',
    stepsSub: 'Do primeiro acesso ao nível que o serviço exige.',
    steps: [
      { t: 'Baixe o app gov.br', d: 'Ou use o site, se o serviço permitir.' },
      { t: 'Informe o CPF', d: 'Confira os dados pessoais antes de continuar.' },
      { t: 'Confirme e crie a senha', d: 'Você define a senha; nós orientamos os requisitos.' },
      { t: 'Eleve o nível, se precisar', d: 'Banco, biometria ou reconhecimento facial podem ser exigidos.' }
    ],
    bringTitle: 'O que levar',
    bring: [
      'CPF e documento com foto',
      'Celular com o número atual',
      'E-mail que você acessa',
      'Dados bancários, se for elevar o nível',
      'Documento do responsável, se houver procuração'
    ],
    helpTitle: 'Onde a Speed ajuda',
    help: [
      'Criar a conta com você',
      'Recuperar acesso e trocar o número',
      'Orientar a elevação de nível',
      'Explicar os níveis bronze, prata e ouro',
      'Imprimir comprovantes e declarações',
      'Orientar sobre golpes e uso seguro'
    ],
    faq: [
      { q: 'Criar a conta gov.br é gratuito?', a: 'Sim. A criação da conta é gratuita. Serviços de impressão, conferência e digitalização têm valor informado antes.' },
      { q: 'Vocês guardam minha senha?', a: 'Não. A senha é digitada por você no aparelho. Nenhum atendente pede, anota ou fotografa credenciais.' },
      { q: 'Preciso de biometria?', a: 'Depende do nível e do serviço. Alguns exigem reconhecimento facial ou validação por banco.' },
      { q: 'Esqueci a senha e troquei de celular. E agora?', a: 'A recuperação é feita pelo próprio gov.br. Orientamos o caminho e o que fazer quando o sistema bloqueia.' },
      { q: 'Posso criar a conta para outra pessoa?', a: 'A conta é pessoal. Em casos específicos, o atendimento a terceiros exige procuração e autorização, quando o serviço permite.' }
    ],
    related: [
      { href: 'meu-inss-varginha.html', t: 'Meu INSS', d: 'Benefícios, extratos e declarações.' },
      { href: 'imprimir-crlv.html', t: 'Imprimir CRLV', d: 'Documento do veículo pelo Detran.' },
      { href: 'abrir-mei.html', t: 'Abrir MEI', d: 'Formalização pelo Portal do Empreendedor.' }
    ]
  },
  {
    slug: 'imprimir-crlv',
    title: 'Imprimir CRLV em Varginha: como emitir o documento',
    desc: 'Como baixar o CRLV digital pelo Detran e imprimir em Varginha. Auxílio presencial com o acesso gov.br. Sem promessa de serviço do Detran.',
    h1: 'Imprimir CRLV em Varginha: como emitir o documento',
    lead: 'O CRLV digital fica no portal do Detran e é acessado com a conta gov.br. Se você precisa do documento no papel, a gente ajuda a baixar e imprimir.',
    selos: ['Auxílio presencial', 'Impressão legível', 'Centro de Varginha'],
    assunto: 'CRLV',
    code: 'DIG',
    msg: 'Olá! Vim pela página do CRLV e quero atendimento. [DIG]',
    paras: [
      'O CRLV é o Certificado de Registro e Licenciamento de Veículo. A versão digital (CRLV-e) é emitida pelo Detran e fica disponível para download.',
      'A Speed não é o Detran e não emite documento de veículo. A gente ajuda o titular a acessar o portal, baixar o arquivo e imprimir uma cópia legível.',
      'O documento só pode ser acessado pelo proprietário ou por quem tenha autorização. Não contorne essa regra: sem o titular, não há atendimento.'
    ],
    transparencia: TRANSPARENCIA_DIGITAL,
    stepsTitle: 'Como baixar e imprimir',
    stepsSub: 'O acesso é do Detran; o suporte é nosso.',
    steps: [
      { t: 'Abra o portal do Detran-MG', d: 'O acesso usa a conta gov.br do proprietário.' },
      { t: 'Selecione o veículo', d: 'Confira placa, Renavam e município.' },
      { t: 'Baixe o CRLV-e', d: 'O arquivo é gerado pelo sistema do Detran.' },
      { t: 'Confira e imprima', d: 'Verificamos placa, proprietário e validade antes de imprimir.' }
    ],
    bringTitle: 'O que levar',
    bring: [
      'CPF do proprietário e documento com foto',
      'Placa e Renavam do veículo',
      'Celular com acesso ao gov.br',
      'Documento do veículo anterior, se tiver',
      'Autorização do proprietário, se o veículo não for seu'
    ],
    helpTitle: 'Onde a Speed ajuda',
    help: [
      'Ajudar no acesso ao portal do Detran',
      'Localizar o CRLV-e do veículo',
      'Conferir os dados antes de imprimir',
      'Imprimir em papel comum, legível',
      'Digitalizar e enviar por e-mail',
      'Orientar sobre o que o Detran exige'
    ],
    faq: [
      { q: 'O CRLV digital vale como documento?', a: 'A versão digital tem validade conforme a regra do Detran. A cópia impressa é uma reprodução do arquivo oficial.' },
      { q: 'Preciso andar com o CRLV impresso?', a: 'Depende da exigência de cada situação e do que a autoridade aceita. O digital costuma ser aceito; a via impressa é uma segurança a mais.' },
      { q: 'Vocês são o Detran?', a: 'Não. A Speed é uma empresa privada. O documento é emitido pelo Detran, e o acesso é feito pelo proprietário.' },
      { q: 'Posso tirar o CRLV de outra pessoa?', a: 'Só com autorização do proprietário. Sem o titular ou procuração, não é possível acessar o documento.' },
      { q: 'Quanto custa?', a: 'O valor do serviço de impressão e conferência é informado antes. Não cobramos nada antecipado.' }
    ],
    related: [
      { href: 'conta-govbr.html', t: 'Conta Gov.br', d: 'O acesso usado no portal do Detran.' },
      { href: 'meu-inss-varginha.html', t: 'Meu INSS', d: 'Benefícios e declarações do INSS.' },
      { href: 'servicos-digitais.html', t: 'Serviços digitais', d: 'Todos os documentos que resolvemos na loja.' }
    ]
  },
  {
    slug: 'abrir-mei',
    title: 'Abrir MEI em Varginha: passo a passo e auxílio',
    desc: 'Como abrir MEI pelo Portal do Empreendedor e imprimir o CCMEI em Varginha. Auxílio presencial, sem promessa de aprovação e sem contabilidade.',
    h1: 'Abrir MEI em Varginha: passo a passo e auxílio',
    lead: 'Formalizar o negócio destrava CNPJ, conta PJ e emissão de nota. O caminho é gratuito no portal; o que trava é o cadastro e o acesso gov.br.',
    selos: ['Auxílio presencial', 'Sem contabilidade', 'Centro de Varginha'],
    assunto: 'abertura de MEI',
    code: 'DIG',
    msg: 'Olá! Vim pela página de abertura de MEI e quero atendimento. [DIG]',
    paras: [
      'O MEI é o Microempreendedor Individual, regime simplificado com CNPJ, obrigações e limites próprios. A abertura é feita no Portal do Empreendedor, com a conta gov.br.',
      'A Speed não é a Receita Federal e não garante deferimento. A gente orienta o preenchimento, ajuda no acesso e imprime o CCMEI e o DAS. Contabilidade e rotina fiscal não fazem parte do serviço.',
      'Em alguns casos, o atendimento a terceiros exige procuração. Quando o portal permite, fazemos com o titular presente e autorização formal.'
    ],
    transparencia: TRANSPARENCIA_DIGITAL,
    stepsTitle: 'Como abrir o MEI',
    stepsSub: 'O portal é gratuito; o cuidado está nos dados.',
    steps: [
      { t: 'Reúna os dados', d: 'CPF, título de eleitor, endereço, atividade e contato.' },
      { t: 'Acesse o Portal do Empreendedor', d: 'O login é a conta gov.br do titular.' },
      { t: 'Preencha atividade e endereço', d: 'A descrição precisa combinar com o que você vai fazer.' },
      { t: 'Emita o CNPJ e o CCMEI', d: 'Conferimos os dados e imprimimos o comprovante.' }
    ],
    bringTitle: 'O que levar',
    bring: [
      'CPF e documento com foto',
      'Título de eleitor ou recibo da última eleição',
      'Endereço completo do negócio',
      'Telefone e e-mail que você usa',
      'Descrição da atividade e do nome fantasia'
    ],
    helpTitle: 'Onde a Speed ajuda',
    help: [
      'Orientar o preenchimento no portal',
      'Ajudar no acesso ao gov.br',
      'Conferir atividade e endereço',
      'Imprimir CCMEI e boleto DAS',
      'Explicar as obrigações mensais',
      'Orientar quando procurar um contador'
    ],
    faq: [
      { q: 'Quanto custa abrir um MEI?', a: 'A abertura no Portal do Empreendedor é gratuita. O nosso serviço de orientação e impressão tem valor informado antes. Depois, existe o DAS mensal conforme a atividade.' },
      { q: 'Preciso de contador?', a: 'Para abrir, não é obrigatório. Para a rotina fiscal e a declaração anual, um contador é recomendável.' },
      { q: 'Posso abrir MEI para outra pessoa?', a: 'Quando o portal permite, é necessário procuração e autorização. O titular precisa participar do processo.' },
      { q: 'O CNPJ sai na hora?', a: 'Em geral, sim, se os dados estiverem regulares. Pendências de CPF ou endereço podem exigir ajuste antes.' },
      { q: 'O que acontece se eu não pagar o DAS?', a: 'Podem haver juros, multa e impacto nas obrigações. Orientamos o básico, mas não fazemos a gestão fiscal.' }
    ],
    related: [
      { href: 'conta-govbr.html', t: 'Conta Gov.br', d: 'O acesso usado no Portal do Empreendedor.' },
      { href: 'servicos-digitais.html', t: 'Serviços digitais', d: 'Documentos e serviços resolvidos na loja.' },
      { href: 'meu-inss-varginha.html', t: 'Meu INSS', d: 'Benefícios e extratos do INSS.' }
    ]
  },
  {
    slug: 'informatica',
    title: 'Conserto de celular e computador em Varginha | Speed',
    desc: 'Manutenção de computador e celular no Centro de Varginha: formatação, limpeza, SSD, vírus e backup. Diagnóstico e orçamento antes do reparo.',
    h1: 'Conserto de celular e computador no Centro de Varginha',
    lead: 'Computador lento, celular com problema, vírus ou troca de peça: a gente avalia, explica o que dá para fazer e só mexe depois do seu ok.',
    selos: ['Diagnóstico antes do reparo', 'Atendimento presencial', 'Centro de Varginha'],
    assunto: 'informática',
    code: 'GERAL',
    msg: 'Olá! Vim pela página de informática e quero atendimento. [GERAL]',
    paras: [
      'A Speed faz manutenção de computadores e suporte a celulares no Centro de Varginha. O primeiro passo é entender o problema; o segundo é apresentar o que pode ser feito e quanto custa.',
      'Nenhum reparo começa sem orçamento aprovado. Também não prometemos recuperar dados nem salvar aparelho que já chegou sem conserto — o diagnóstico dirá o que é possível.',
      'Se o problema for software, muitas vezes a solução é formatação, limpeza ou remoção de vírus. Se for hardware, avaliamos a peça e o custo antes de seguir.'
    ],
    transparencia: '<strong>Transparência:</strong> a Speed é uma empresa privada de manutenção e suporte. Nenhum reparo é iniciado sem orçamento aprovado. Não há garantia de recuperação de dados ou de conserto em todos os casos.',
    cardsTitle: 'O que você resolve aqui',
    cardsSub: 'Serviços de informática para o dia a dia de casa e do trabalho.',
    cards: [
      { ico: 'PC', t: 'Formatação e limpeza', d: 'Sistema lento, travando ou com vírus? Avaliamos a melhor saída.' },
      { ico: 'SSD', t: 'Upgrade de SSD e memória', d: 'Deixe o computador mais rápido com peça adequada ao uso.' },
      { ico: 'VÍ', t: 'Remoção de vírus', d: 'Limpeza de programas maliciosos e orientação para não voltar.' },
      { ico: 'BK', t: 'Backup e transferência', d: 'Cópia de arquivos e passagem para um aparelho novo.' },
      { ico: 'CEL', t: 'Suporte a celular', d: 'Avaliação de tela, bateria, conector e configuração.' },
      { ico: 'CFG', t: 'Configuração', d: 'Wi-Fi, impressora, e-mail e programas essenciais.' }
    ],
    stepsTitle: 'Como funciona o reparo',
    stepsSub: 'Sem surpresa no valor final.',
    steps: [
      { t: 'Traga o aparelho', d: 'Se possível, com o carregador e o relato do problema.' },
      { t: 'Fazemos o diagnóstico', d: 'Testamos e identificamos a causa provável.' },
      { t: 'Você aprova o orçamento', d: 'Só seguimos depois do seu ok, com prazo informado.' },
      { t: 'Reparo e teste', d: 'Testamos na retirada e explicamos o que foi feito.' }
    ],
    bringTitle: 'O que levar',
    bring: [
      'Aparelho e carregador',
      'Senha digitada na hora (não anotamos)',
      'Backup, se você já tiver',
      'Relato do problema e quando começou',
      'Nota fiscal ou garantia, se ainda estiver valendo'
    ],
    helpTitle: 'Onde a Speed ajuda',
    help: [
      'Diagnóstico claro do problema',
      'Orçamento antes de qualquer reparo',
      'Formatação com backup quando possível',
      'Instalação de SSD e memória',
      'Configuração de impressora, Wi-Fi e e-mail',
      'Teste do aparelho na retirada'
    ],
    faq: [
      { q: 'Qual é o prazo do conserto?', a: 'Depende do diagnóstico e da disponibilidade da peça. O prazo é informado junto com o orçamento.' },
      { q: 'Vou perder meus arquivos?', a: 'Formatação apaga o que estiver no aparelho. Quando é possível, fazemos backup antes. Ainda assim, nenhum backup é infalível.' },
      { q: 'O diagnóstico é gratuito?', a: 'A política de diagnóstico é informada antes do atendimento. Você sabe o valor antes de deixar o aparelho.' },
      { q: 'Tem garantia?', a: 'A garantia depende do serviço e da peça. Ela é informada por escrito no orçamento ou na retirada.' },
      { q: 'Vocês atendem notebook e celular?', a: 'Sim, dentro do que a loja consegue avaliar. Casos que exigem laboratório especializado são informados com transparência.' }
    ],
    related: [
      { href: 'servicos-digitais.html', t: 'Serviços digitais', d: 'Documentos, gov.br e impressão na loja.' },
      { href: 'grafica.html', t: 'Gráfica rápida', d: 'Impressão, xerox, foto 3x4 e encadernação.' },
      { href: 'https://speedfinanceira.com.br', t: 'Speed Financeira', d: 'Voltar para a página inicial do site.' }
    ]
  },
  {
    slug: 'servicos-digitais',
    title: 'Serviços digitais em Varginha: INSS, Gov.br e CRLV',
    desc: 'Meu INSS, CNIS, carta de concessão, Gov.br, CRLV e MEI com auxílio presencial em Varginha. Empresa privada, sem guardar senhas.',
    h1: 'Serviços digitais em Varginha: documentos sem complicação',
    lead: 'Meu INSS, CNIS, carta de concessão, Gov.br, CRLV e MEI no mesmo lugar. Você acessa com a sua conta; a gente orienta, confere e imprime.',
    selos: ['Atendimento presencial', 'Sem guardar senha', 'Centro de Varginha'],
    assunto: 'serviços digitais',
    code: 'DIG',
    msg: 'Olá! Vim pela página de serviços digitais e quero atendimento. [DIG]',
    paras: [
      'Boa parte das buscas em Varginha é por documento e serviço do governo: Meu INSS, extrato CNIS, carta de concessão, conta gov.br, CRLV e MEI. São serviços que não podem ser anunciados, mas podem ser explicados e atendidos presencialmente.',
      'A Speed é uma empresa privada. Não somos INSS, Gov.br, Detran ou Receita. O acesso é feito pelo próprio cidadão, com a nossa orientação; a senha é digitada por você e nunca fica com a loja.',
      'Além do acesso, a loja imprime, digitaliza, confere dados e organiza os documentos. Você sai com o papel certo na mão — ou com o PDF enviado por e-mail.'
    ],
    transparencia: TRANSPARENCIA_DIGITAL,
    cardsTitle: 'Escolha o que você precisa',
    cardsSub: 'Cada serviço tem uma página com passo a passo e o que levar.',
    cards: [
      { href: 'meu-inss-varginha.html', ico: 'INSS', t: 'Meu INSS', d: 'Extratos, declarações e acesso ao aplicativo.' },
      { href: 'extrato-cnis.html', ico: 'CNIS', t: 'Extrato CNIS', d: 'Vínculos e contribuições para conferência.' },
      { href: 'carta-concessao.html', ico: 'CARTA', t: 'Carta de concessão', d: 'Comprovante do benefício para banco e cadastro.' },
      { href: 'conta-govbr.html', ico: 'GOV', t: 'Conta Gov.br', d: 'Criar, recuperar e elevar o nível de acesso.' },
      { href: 'imprimir-crlv.html', ico: 'CRLV', t: 'Imprimir CRLV', d: 'Documento do veículo pelo portal do Detran.' },
      { href: 'abrir-mei.html', ico: 'MEI', t: 'Abrir MEI', d: 'Formalização e emissão do CCMEI.' }
    ],
    stepsTitle: 'Como funciona o atendimento',
    stepsSub: 'Quatro passos, com você no controle da conta.',
    steps: [
      { t: 'Chegue com documento', d: 'CPF, documento com foto e o celular que você usa.' },
      { t: 'Acesse com a gente', d: 'Você digita a senha; nós orientamos o caminho.' },
      { t: 'Gere o documento', d: 'Localizamos o serviço certo e conferimos os dados.' },
      { t: 'Imprima e leve', d: 'Impressão na hora ou envio por e-mail.' }
    ],
    bringTitle: 'O que levar',
    bring: [
      'CPF e documento com foto',
      'Celular com acesso ao gov.br',
      'E-mail e telefone atualizados',
      'Documentos específicos do serviço',
      'Autorização do titular, quando for o caso'
    ],
    helpTitle: 'Onde a Speed ajuda',
    help: [
      'Orientação no acesso aos sistemas oficiais',
      'Conferência dos dados antes de imprimir',
      'Impressão, digitalização e plastificação',
      'Envio por e-mail ou WhatsApp',
      'Organização de documentos para banco',
      'Explicação sobre prazos e exigências'
    ],
    faq: [
      { q: 'Quais serviços vocês atendem?', a: 'Meu INSS, extrato CNIS, carta de concessão, conta gov.br, CRLV, MEI, currículo, impressão e digitalização. A lista pode mudar conforme as regras de cada órgão.' },
      { q: 'Precisa agendar?', a: 'Não é obrigatório, mas confirmar o horário pelo WhatsApp evita espera.' },
      { q: 'Vocês são órgãos públicos?', a: 'Não. A Speed é uma empresa privada. O acesso é feito pelo titular, com a nossa orientação.' },
      { q: 'Quanto custa?', a: 'O valor é informado antes de qualquer serviço. Não cobramos nada antecipado.' },
      { q: 'Atendem por WhatsApp?', a: 'O WhatsApp serve para orientação inicial e envio de arquivos. O acesso a sistemas oficiais é presencial, com o titular.' }
    ],
    related: [
      { href: 'meu-inss-varginha.html', t: 'Meu INSS', d: 'Acesso e impressão de extratos.' },
      { href: 'imprimir-crlv.html', t: 'CRLV', d: 'Documento do veículo pelo Detran.' },
      { href: 'abrir-mei.html', t: 'MEI', d: 'Formalização pelo Portal do Empreendedor.' }
    ]
  },
  {
    slug: 'curriculo',
    title: 'Currículo em Varginha: montar, revisar e imprimir | Speed',
    desc: 'Currículo pronto para entregar: revisão de dados, formato limpo, PDF e impressão na hora em Varginha. Atendimento presencial no Centro. WhatsApp (35) 3067-5017.',
    h1: 'Currículo em Varginha: montar, revisar e imprimir',
    lead: 'Currículo com erro, desatualizado ou sem a vaga certa perde espaço. A gente organiza o texto com você, confere os dados e entrega em PDF ou impresso na hora.',
    selos: ['Revisão com você', 'PDF e impressão', 'Centro de Varginha'],
    assunto: 'currículo',
    code: 'DIG',
    msg: 'Olá! Quero ajuda com currículo. [DIG]',
    paras: [
      'Quem procura emprego em Varginha muitas vezes entrega o mesmo currículo para vagas muito diferentes. O recrutador lê em segundos: se o topo não mostra o que ele procura, a candidatura é descartada antes da entrevista.',
      'A Speed não inventa experiência nem promete vaga. O trabalho é de organização: separar dados de contato, resumo, experiências, formação e cursos; corrigir português e datas; deixar o arquivo legível no celular e no papel.',
      'O resultado é um currículo verdadeiro, curto e fácil de ler — em PDF para enviar por WhatsApp ou e-mail e impresso para entregar no balcão da empresa.'
    ],
    transparencia: '<strong>Transparência:</strong> a Speed Financeira é uma empresa privada. O serviço é de organização, revisão e impressão do currículo. Não somos agência de emprego, não garantimos entrevista, vaga ou contratação, e não enviamos currículo a empresas sem a sua autorização.',
    cardsTitle: 'O que você pode fazer aqui',
    cardsSub: 'Escolha o ponto em que você está.',
    cards: [
      { ico: 'NOVO', t: 'Montar do zero', d: 'Você traz a história; a gente organiza em um formato que o recrutador lê.' },
      { ico: 'REVISAR', t: 'Revisar o existente', d: 'Correção de dados, datas, português e excesso de informação.' },
      { ico: 'PDF', t: 'Gerar PDF e imprimir', d: 'Arquivo leve para WhatsApp e cópia impressa para entregar.' }
    ],
    stepsTitle: 'Como funciona',
    stepsSub: 'Quatro passos, com você decidindo o conteúdo.',
    steps: [
      { t: 'Traga o que tem', d: 'Currículo antigo, documentos e a lista de empregos e cursos.' },
      { t: 'Defina a vaga', d: 'Uma vaga por versão. O texto se ajusta ao que a empresa pede.' },
      { t: 'Revise com a gente', d: 'Você confere cada dado. Nada é inventado.' },
      { t: 'Leve em PDF ou papel', d: 'Envio por WhatsApp/e-mail e impressão na hora.' }
    ],
    bringTitle: 'O que levar',
    bring: [
      'Documento com foto e CPF',
      'Currículo antigo, se tiver',
      'Lista de empregos, com datas e funções',
      'Cursos e certificados',
      'A descrição da vaga, quando existir',
      'Telefone e e-mail que você realmente usa'
    ],
    helpTitle: 'Onde a Speed ajuda',
    help: [
      'Organização das seções e do texto',
      'Correção de datas, contatos e português',
      'Versão em PDF leve para WhatsApp',
      'Impressão em papel de qualidade',
      'Digitalização de certificados',
      'Orientação sobre o que evitar no currículo'
    ],
    faq: [
      { q: 'Vocês inventam experiência?', a: 'Não. O currículo precisa ser verdadeiro. A revisão organiza o que você realmente fez, com datas e funções corretas.' },
      { q: 'Preciso levar foto?', a: 'Foto é opcional. Se você quiser usar, leve uma foto recente e neutra. Muitas vagas não exigem foto.' },
      { q: 'Vocês enviam para as empresas?', a: 'O envio é feito por você. A loja entrega o arquivo ou a via impressa; não manda currículo a terceiros sem autorização.' },
      { q: 'Quanto tempo leva?', a: 'Uma revisão simples sai no mesmo atendimento. Um currículo novo, com muita informação para organizar, pode precisar de mais tempo — o prazo é informado antes.' },
      { q: 'Vocês garantem emprego?', a: 'Não. Nenhuma loja garante contratação. O que garantimos é um currículo organizado, legível e verdadeiro.' }
    ],
    related: [
      { href: 'servicos-digitais.html', t: 'Serviços digitais', d: 'Documentos, gov.br e impressão na loja.' },
      { href: 'grafica.html', t: 'Gráfica rápida', d: 'Impressão, xerox e encadernação.' },
      { href: 'informatica.html', t: 'Informática', d: 'Suporte para computador e celular.' }
    ]
  }
];

function render(p) {
  const link = zap(p.msg);
  const cardsHtml = p.cards ? `
  <section class="alt">
    <div class="wrap">
      <h2>${p.cardsTitle || 'O que você resolve aqui'}</h2>
      <p class="sub">${p.cardsSub || ''}</p>
      <div class="grid">
        ${p.cards.map(function (c) {
          const tag = c.href ? 'a' : 'div';
          const href = c.href ? ' href="' + c.href + '"' : '';
          return '<' + tag + ' class="card"' + href + '><span class="ico">' + c.ico + '</span><h3>' + c.t + '</h3><p>' + c.d + '</p></' + tag + '>';
        }).join('')}
      </div>
    </div>
  </section>` : '';

  const stepsHtml = `
  <section>
    <div class="wrap">
      <h2>${p.stepsTitle}</h2>
      <p class="sub">${p.stepsSub || ''}</p>
      <div class="passos">
        ${p.steps.map(function (s) {
          return '<div class="passo"><h3>' + s.t + '</h3><p>' + s.d + '</p></div>';
        }).join('')}
      </div>
    </div>
  </section>`;

  const duasHtml = `
  <section class="alt">
    <div class="wrap">
      <div class="duas">
        <div class="bloco">
          <h3>${p.bringTitle || 'O que levar'}</h3>
          <ul>${p.bring.map(function (i) { return '<li>' + i + '</li>'; }).join('')}</ul>
        </div>
        <div class="bloco">
          <h3>${p.helpTitle || 'Onde a Speed ajuda'}</h3>
          <ul>${p.help.map(function (i) { return '<li>' + i + '</li>'; }).join('')}</ul>
        </div>
      </div>
    </div>
  </section>`;

  const faqHtml = `
  <section>
    <div class="wrap">
      <h2>Perguntas frequentes</h2>
      <div class="faq">
        ${p.faq.map(function (f) {
          return '<details><summary>' + f.q + '</summary><p>' + f.a + '</p></details>';
        }).join('')}
      </div>
    </div>
  </section>`;

  const relatedHtml = `
  <section class="alt">
    <div class="wrap">
      <h2>Veja também</h2>
      <div class="grid">
        ${p.related.map(function (r) {
          return '<a class="card" href="' + r.href + '"><h3>' + r.t + '</h3><p>' + r.d + '</p></a>';
        }).join('')}
      </div>
    </div>
  </section>`;

  const faqLd = p.faq.length ? `
<script type="application/ld+json">
${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': p.faq.map(function (f) {
      return {
        '@type': 'Question',
        'name': f.q,
        'acceptedAnswer': { '@type': 'Answer', 'text': f.a }
      };
    })
  }, null, 2)}
</script>` : '';

  return `<!DOCTYPE html>
<!--
  RASCUNHO gerado por ferramentas/gerar_paginas.js
  Nome de exibição e horário pendentes de aprovação (ver 03_Decisoes_Pendentes.md).
  Antes de publicar: revisar 16_Checklist_Publicacao.md.
-->
<html lang="pt-BR" data-status="rascunho">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.title}</title>
<meta name="description" content="${p.desc}">
<link rel="canonical" href="${SITE}/${p.slug}.html">
<meta property="og:title" content="${p.title}">
<meta property="og:description" content="${p.desc}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/${p.slug}.html">
<meta name="theme-color" content="#019652">
<style>${CSS}</style>
</head>
<body>
<a class="skip" href="#conteudo">Ir para o conteúdo</a>

<header>
  <div class="wrap bar">
    <a class="marca" href="${SITE}">
      <span class="ponto" aria-hidden="true">S</span>
      <span>Speed<small>Financeira e Lan House</small></span>
    </a>
    <a class="btn" href="${link}">Falar no WhatsApp</a>
  </div>
</header>

<main id="conteudo">

  <section class="hero">
    <div class="wrap">
      <h1>${p.h1}</h1>
      <p>${p.lead}</p>
      <div class="acoes">
        <a class="btn" href="${link}">Falar no WhatsApp</a>
        <a class="btn sec" href="https://www.google.com/maps/search/?api=1&amp;query=Rua+Santa+Cruz+696+Centro+Varginha+MG">Como chegar</a>
      </div>
      <div class="selos">
        ${p.selos.map(function (s) { return '<span class="selo">' + s + '</span>'; }).join('')}
      </div>
    </div>
  </section>

  <section>
    <div class="wrap">
      ${p.paras.map(function (t) { return '<p>' + t + '</p>'; }).join('')}
      <div class="transparencia">${p.transparencia}</div>
    </div>
  </section>

  ${cardsHtml}
  ${stepsHtml}
  ${duasHtml}
  ${faqHtml}
  ${relatedHtml}

  <section>
    <div class="wrap">
      <div class="cta">
        <div>
          <h2>Fale com a gente antes de sair de casa</h2>
          <p>Confirme o horário, tire a dúvida e veja o que levar.</p>
        </div>
        <a class="btn" href="${link}">Chamar no WhatsApp</a>
      </div>
    </div>
  </section>

</main>

<footer>
  <div class="wrap">
    <address class="nap">
      <strong>${NOME}</strong><br>
      Correspondente bancário · CNPJ ${CNPJ}<br>
      ${ENDERECO} — CEP ${CEP}<br>
      Telefone e WhatsApp: <a href="tel:${E164}">${TEL}</a><br>
      E-mail: <a href="mailto:${EMAIL}">${EMAIL}</a><br>
      Horário: confirme no WhatsApp antes de vir.
    </address>
    <div class="fim">
      ${p.code === 'DIG'
        ? 'A Speed Financeira é uma empresa privada e não representa INSS, Gov.br, Detran ou qualquer órgão público. O acesso aos sistemas oficiais é feito pelo próprio cidadão.'
        : p.code === 'GERAL'
          ? 'Serviço de manutenção prestado por empresa privada. Nenhum reparo é iniciado sem orçamento aprovado.'
          : 'Atendimento presencial em Varginha/MG.'}
      <br>© <span id="ano">2026</span> ${NOME}.
    </div>
  </div>
</footer>

<a class="zap" href="${link}" aria-label="Falar no WhatsApp">WhatsApp</a>
${faqLd}
<script>document.getElementById('ano').textContent = new Date().getFullYear();</script>
</body>
</html>
`;
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

PAGES.forEach(function (p) {
  const destino = path.join(OUT, p.slug + '.html');
  fs.writeFileSync(destino, render(p), 'utf8');
  console.log('gerado: paginas/' + p.slug + '.html');
});

console.log('');
console.log('Total: ' + PAGES.length + ' páginas.');
console.log('Fonte NAP: dados/nap.json');
console.log('Nada foi publicado.');
