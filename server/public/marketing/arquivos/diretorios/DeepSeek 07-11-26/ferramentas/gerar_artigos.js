#!/usr/bin/env node
/*
  Gerador dos artigos orgânicos da Speed.
  Fonte de NAP: dados/nap.json (fonte única).
  Saída: artigos/*.html

  Uso: node ferramentas/gerar_artigos.js
  Não publica nada. Apenas grava rascunhos HTML.
*/
'use strict';

const fs = require('fs');
const path = require('path');

const nap = require(path.join(__dirname, '..', 'dados', 'nap.json'));
const OUT = path.join(__dirname, '..', 'artigos');

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
const ENDERECO = nap.endereco.logradouro + ', ' + nap.endereco.numero + ' - ' +
  nap.endereco.bairro + ' - ' + CIDADE + '/' + UF;

const DATA = '2026-11-07';

function zap(msg) {
  return 'https://wa.me/' + WPP + '?text=' + encodeURIComponent(msg);
}

function semTags(html) {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function palavras(html) {
  return semTags(html).split(' ').filter(Boolean).length;
}

function tempoLeitura(html) {
  const min = Math.max(3, Math.round(palavras(html) / 200));
  return min + ' min de leitura';
}

const CSS = `
:root{--verde:#019652;--verde-escuro:#016b3b;--amarelo:#FADB20;--tinta:#14231b;--texto:#33443b;--claro:#f6f8f7;--branco:#fff;--borda:#e2e8e4;--sombra:0 10px 30px rgba(20,35,27,.08);--raio:16px;--max:1080px}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--claro);color:var(--texto);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.7;-webkit-font-smoothing:antialiased}
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
.crumb{font-size:13px;color:#6b7d73;padding:16px 0 0}
.crumb a{color:#4b6356;text-decoration:none}
.crumb a:hover{text-decoration:underline}
.cabeca{background:linear-gradient(140deg,var(--verde-escuro),var(--verde));color:#fff;padding:36px 0 42px;margin-top:8px}
.cabeca h1{font-size:clamp(27px,4.2vw,42px);line-height:1.14;letter-spacing:-.8px;margin:0 0 12px;max-width:24ch}
.cabeca p{font-size:clamp(15.5px,1.8vw,18px);max-width:66ch;margin:0 0 18px;color:#e8f5ee}
.meta-artigo{display:flex;flex-wrap:wrap;gap:8px}
.meta-artigo span{background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.28);padding:5px 11px;border-radius:999px;font-size:12.5px;font-weight:600}
.artigo{background:#fff;border:1px solid var(--borda);border-radius:var(--raio);padding:clamp(22px,4vw,44px);margin:-22px auto 0;position:relative;box-shadow:var(--sombra)}
.artigo .entrada{font-size:18px;color:var(--tinta);border-left:4px solid var(--amarelo);padding:2px 0 2px 16px;margin:0 0 26px}
.artigo h2{font-size:clamp(21px,2.6vw,27px);letter-spacing:-.4px;color:var(--tinta);margin:34px 0 10px;scroll-margin-top:80px}
.artigo h3{font-size:18px;color:var(--tinta);margin:22px 0 6px}
.artigo p{margin:0 0 14px;font-size:16px}
.artigo ul,.artigo ol{margin:0 0 16px;padding-left:22px;font-size:16px}
.artigo li{margin:7px 0}
.artigo table{border-collapse:collapse;width:100%;font-size:14.5px;margin:6px 0 18px;display:block;overflow-x:auto}
.artigo th,.artigo td{border:1px solid var(--borda);padding:9px 11px;text-align:left;vertical-align:top}
.artigo th{background:#f0f6f2;color:var(--tinta);font-size:12px;text-transform:uppercase;letter-spacing:.4px}
.toc{background:#f4faf7;border:1px solid #cfe8db;border-radius:12px;padding:14px 18px;margin:0 0 26px;font-size:14.5px}
.toc strong{display:block;color:var(--tinta);font-size:12px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
.toc ol{margin:0;padding-left:20px;font-size:14px}
.toc li{margin:5px 0}
.toc a{text-decoration:none}
.toc a:hover{text-decoration:underline}
.caixa{border-radius:12px;padding:14px 18px;font-size:15px;margin:18px 0}
.caixa p:last-child{margin-bottom:0}
.caixa.info{background:#eef6ff;border:1px solid #cfe0f5;color:#1e3a5f}
.caixa.atencao{background:#fffbe6;border:1px solid #f3e08a;color:#5c4b00}
.caixa.verde{background:#effaf4;border:1px solid #bfe6d2;color:#14503a}
.caixa-cta{background:linear-gradient(140deg,var(--verde-escuro),var(--verde));color:#fff;border-radius:14px;padding:20px 22px;margin:26px 0;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
.caixa-cta p{margin:0;font-size:15.5px;color:#e8f5ee;max-width:52ch}
.caixa-cta .btn{background:var(--amarelo);color:#25301f;border-color:var(--amarelo);white-space:nowrap}
.faq-artigo details{background:#fff;border:1px solid var(--borda);border-radius:12px;padding:0 18px;margin:8px 0}
.faq-artigo details[open]{box-shadow:var(--sombra)}
.faq-artigo summary{cursor:pointer;font-weight:700;color:var(--tinta);padding:15px 0;list-style:none;display:flex;justify-content:space-between;gap:12px;font-size:15.5px}
.faq-artigo summary::-webkit-details-marker{display:none}
.faq-artigo summary:after{content:"+";color:var(--verde);font-size:20px;line-height:1}
.faq-artigo details[open] summary:after{content:"–"}
.faq-artigo details p{margin:0 0 15px;font-size:15px}
.fontes{font-size:12.5px;color:#6b7d73;border-top:1px solid var(--borda);margin-top:30px;padding-top:14px}
.fontes a{color:#4b6356}
.autor{display:flex;gap:12px;align-items:flex-start;background:#f7fbf9;border:1px solid var(--borda);border-radius:12px;padding:14px 16px;margin-top:18px;font-size:13.5px}
.autor .selo{width:38px;height:38px;border-radius:10px;background:var(--verde);color:#fff;display:grid;place-items:center;font-weight:800;flex:0 0 auto}
.autor p{margin:0;font-size:13.5px;color:#4b6356}
.leia{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin:10px 0 4px}
.leia a{display:block;background:#fff;border:1px solid var(--borda);border-radius:12px;padding:16px;text-decoration:none;color:var(--texto)}
.leia a:hover{border-color:var(--verde);box-shadow:var(--sombra)}
.leia strong{display:block;color:var(--tinta);font-size:15px;margin-bottom:3px}
.leia span{font-size:13px;color:#5d7066}
footer{background:#0f1c15;color:#c9d8d0;padding:40px 0 96px;margin-top:34px;font-size:13.5px}
footer a{color:#fff}
footer .nap{font-style:normal;line-height:1.8}
footer .fim{border-top:1px solid rgba(255,255,255,.12);margin-top:22px;padding-top:18px;color:#93a89c}
.zap{position:fixed;right:18px;bottom:18px;background:var(--verde);color:#fff;text-decoration:none;padding:14px 20px;border-radius:999px;font-weight:800;box-shadow:0 12px 24px rgba(1,150,82,.35);z-index:30}
.zap:hover{background:var(--verde-escuro)}
.indice{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.indice a{background:#fff;border:1px solid var(--borda);border-radius:var(--raio);padding:22px;text-decoration:none;color:var(--texto);box-shadow:0 2px 6px rgba(20,35,27,.04)}
.indice a:hover{box-shadow:var(--sombra);transform:translateY(-2px)}
.indice h2{font-size:18px;margin:0 0 8px;color:var(--tinta)}
.indice p{font-size:14px;margin:0 0 10px}
.indice small{font-size:12px;color:#6b7d73}
@media(max-width:760px){.bar .btn{display:none}.artigo{padding:20px}.cabeca{padding:28px 0 36px}.artigo p,.artigo ul,.artigo ol{font-size:15.5px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
@media print{header,.zap,.caixa-cta,.leia,footer{display:none}.artigo{border:0;box-shadow:none;margin:0;padding:0}.cabeca{background:#016b3b!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

const TRANSPARENCIA_DIGITAL =
  'A Speed Financeira é uma empresa privada e não representa INSS, Gov.br, Detran, Receita Federal ou qualquer órgão público. ' +
  'O acesso aos sistemas oficiais é feito pelo próprio titular, com orientação da equipe. A loja não retém senhas.';

const AVISO_CONTEUDO =
  'Conteúdo informativo, revisado em 07/11/2026. Regras, prazos e canais de órgãos públicos podem mudar sem aviso. ' +
  'Antes de decidir, confirme no site ou no aplicativo oficial do órgão.';

const ARTIGOS = [
  {
    slug: 'como-imprimir-crlv-digital',
    title: 'Como imprimir o CRLV digital em Varginha (passo a passo)',
    desc: 'Passo a passo para baixar e imprimir o CRLV digital em Minas Gerais, o que conferir antes de imprimir e o que fazer quando o documento não aparece.',
    h1: 'Como imprimir o CRLV digital em Varginha',
    lead: 'O CRLV digital vale como documento de porte, mas só ajuda se estiver legível na hora da fiscalização. Veja como baixar, conferir e imprimir sem erro.',
    code: 'DIG',
    assunto: 'CRLV digital',
    msg: 'Olá! Preciso de ajuda para imprimir o CRLV. [DIG]',
    servico: 'imprimir-crlv.html',
    servicoNome: 'Imprimir CRLV',
    entrada: 'O CRLV digital (CRLV-e) é a versão eletrônica do Certificado de Registro e Licenciamento de Veículo. Em Minas Gerais, ele é gerado pelos canais oficiais do Detran-MG e pode ser apresentado no celular ou impresso. O problema aparece quando o arquivo não abre, o QR code sai borrado ou o documento é de um veículo que não está no seu nome.',
    secoes: [
      {
        id: 'o-que-e',
        h2: 'O que é o CRLV digital e quando ele vale',
        html: `
<p>O CRLV-e substitui o antigo documento em papel plastificado. Ele reúne os dados do veículo, do proprietário e do licenciamento do exercício, com um QR code que permite à fiscalização conferir a autenticidade no sistema.</p>
<p>Em Minas Gerais, o documento é disponibilizado pelo <strong>Detran-MG</strong>, pelo portal do órgão e pela Carteira Digital de Trânsito (CDT). O acesso exige uma conta <strong>gov.br</strong> do proprietário ou de quem tem vínculo autorizado com o veículo.</p>
<div class="caixa info"><p><strong>Ponto importante:</strong> o CRLV digital não é um “documento particular” emitido pela loja. Ele nasce no sistema oficial. A loja apenas ajuda a acessar, conferir e imprimir.</p></div>
`
      },
      {
        id: 'passo-a-passo',
        h2: 'Passo a passo para baixar o CRLV',
        html: `
<ol>
  <li><strong>Entre com a conta gov.br</strong> do proprietário. Se a senha não funcionar, o problema precisa ser resolvido antes: sem login, não há documento.</li>
  <li><strong>Abra o canal oficial.</strong> Pode ser o portal do Detran-MG ou a Carteira Digital de Trânsito, no celular.</li>
  <li><strong>Localize o veículo</strong> pela placa e pelo Renavam. Confira se o veículo aparece no seu nome ou como possuidor autorizado.</li>
  <li><strong>Gere o CRLV do exercício</strong> e faça o download do PDF. Evite apenas tirar print da tela: o print pode cortar o QR code.</li>
  <li><strong>Confira os dados</strong> antes de imprimir: placa, Renavam, marca/modelo, ano, nome do proprietário e exercício do licenciamento.</li>
  <li><strong>Imprima em boa qualidade</strong>, de preferência em folha A4 e com o QR code nítido. Se o QR sair borrado, a via impressa perde utilidade.</li>
  <li><strong>Guarde o PDF</strong> no celular e no e-mail. Assim você tem uma cópia se precisar reimprimir.</li>
</ol>
<div class="caixa-cta"><p>Não consegue baixar ou o documento sai sem o QR code? A loja ajuda no acesso e na impressão, com você digitando a sua senha.</p><a class="btn" href="{{ZAP}}">Falar no WhatsApp</a></div>
`
      },
      {
        id: 'imprimir-ou-celular',
        h2: 'Precisa imprimir ou pode andar com o celular?',
        html: `
<p>O CRLV-e pode ser apresentado no celular, desde que o documento esteja acessível e legível. A via impressa é útil quando a bateria acaba, o sinal falha ou o aplicativo não abre — situações comuns na estrada.</p>
<p>Se optar pelo papel, imprima o PDF oficial, não uma foto da tela. O papel sulfite comum serve; o que importa é a integridade dos dados e do QR code.</p>
<table>
  <thead><tr><th>Situação</th><th>O que fazer</th></tr></thead>
  <tbody>
    <tr><td>Celular sem bateria ou sem internet</td><td>Leve a via impressa do PDF oficial</td></tr>
    <tr><td>QR code ilegível</td><td>Reimprima em qualidade melhor ou apresente no aplicativo</td></tr>
    <tr><td>Documento de outra pessoa</td><td>O acesso depende de vínculo autorizado; pode ser necessária procuração</td></tr>
    <tr><td>Veículo com licenciamento atrasado</td><td>O CRLV do exercício pode não estar disponível; regularize antes</td></tr>
  </tbody>
</table>
<div class="caixa atencao"><p><strong>Atenção:</strong> regras de porte e de aceitação da via impressa podem mudar. Em caso de dúvida, consulte o Detran-MG antes de viajar.</p></div>
`
      },
      {
        id: 'nao-aparece',
        h2: 'O CRLV não aparece: os motivos mais comuns',
        html: `
<ul>
  <li><strong>Senha do gov.br bloqueada ou em nível insuficiente.</strong> Muitos serviços exigem conta prata ou ouro.</li>
  <li><strong>Veículo não vinculado ao seu CPF.</strong> Compra recente sem transferência, veículo de empresa ou de familiar.</li>
  <li><strong>Licenciamento do ano pendente.</strong> Sem o pagamento, o documento do exercício pode não ser liberado.</li>
  <li><strong>Restrição administrativa ou financeira.</strong> O sistema pode exibir pendências que impedem a emissão.</li>
  <li><strong>Aplicativo desatualizado.</strong> Atualize a CDT e tente novamente.</li>
</ul>
<p>Quando o problema é cadastral — transferência, alienação, mudança de categoria — não é a impressão que resolve. Nesse caso, o caminho é o setor de veículos do Detran ou um despachante credenciado.</p>
`
      },
      {
        id: 'na-loja',
        h2: 'Como a Speed ajuda',
        html: `
<p>A Speed é uma empresa privada no Centro de Varginha. O atendimento é presencial, com o titular na frente da tela, digitando a própria senha. A equipe orienta o caminho, confere os dados e imprime o PDF oficial.</p>
<h3>O que levar</h3>
<ul>
  <li>Documento com foto e CPF do proprietário</li>
  <li>Celular com acesso à conta gov.br</li>
  <li>Placa e Renavam do veículo</li>
  <li>Se o veículo não estiver no seu nome: autorização ou procuração, quando exigida</li>
</ul>
`
      }
    ],
    faq: [
      { q: 'O CRLV impresso em folha comum vale?', a: 'A via impressa a partir do PDF oficial, com dados e QR code legíveis, é o formato usado para apresentação. A aceitação depende da fiscalização; em caso de dúvida, consulte o Detran-MG.' },
      { q: 'Posso imprimir o CRLV de outra pessoa?', a: 'Só com autorização do titular e acesso ao vínculo do veículo. A loja não acessa conta de terceiro sem a presença e a autorização do proprietário.' },
      { q: 'O print da tela serve?', a: 'Não é recomendado. O print pode cortar o QR code e prejudicar a conferência. O correto é baixar o PDF oficial.' },
      { q: 'Vocês emitam o CRLV?', a: 'Não. O documento é emitido pelo Detran-MG. A Speed apenas auxilia no acesso, na conferência e na impressão.' },
      { q: 'E se o licenciamento estiver atrasado?', a: 'O documento do exercício pode não ser liberado. Regularize a pendência no canal oficial antes de imprimir.' }
    ],
    leia: [
      { href: 'meu-inss-sem-senha.html', t: 'Meu INSS sem senha', d: 'O que fazer quando o login não funciona.' },
      { href: 'regularizar-mei.html', t: 'Regularizar o MEI', d: 'DAS, declaração anual e CCMEI.' },
      { href: 'revisao-de-curriculo.html', t: 'Revisar currículo', d: 'O que o recrutador lê primeiro.' }
    ]
  },
  {
    slug: 'meu-inss-sem-senha',
    title: 'Meu INSS sem senha: o que fazer quando o login não funciona',
    desc: 'Senha do Meu INSS bloqueada, conta gov.br em nível baixo ou app que não abre: o que tentar antes de ir à loja e o que levar no atendimento.',
    h1: 'Meu INSS sem senha: o que fazer quando o login não funciona',
    lead: 'Na maioria dos casos, o problema não é o benefício: é a conta gov.br. Entender isso economiza tempo e evita fila no lugar errado.',
    code: 'DIG',
    assunto: 'Meu INSS',
    msg: 'Olá! Preciso de ajuda com o Meu INSS. [DIG]',
    servico: 'meu-inss-varginha.html',
    servicoNome: 'Meu INSS',
    entrada: 'O Meu INSS é o canal oficial do INSS para extrato, agendamento, declarações e prova de vida. Ele não tem senha própria: o acesso é feito pela conta gov.br. Quando o login falha, quase sempre é a conta gov.br que precisa ser recuperada — e não o benefício que está com problema.',
    secoes: [
      {
        id: 'por-que-falha',
        h2: 'Por que o Meu INSS não abre',
        html: `
<ul>
  <li><strong>Senha do gov.br esquecida ou bloqueada.</strong> Tentativas erradas bloqueiam o acesso temporariamente.</li>
  <li><strong>Conta em nível bronze.</strong> Vários serviços do Meu INSS exigem conta prata ou ouro.</li>
  <li><strong>Celular antigo ou número trocado.</strong> A verificação em duas etapas vai para um número que você não usa mais.</li>
  <li><strong>Reconhecimento facial que não passa.</strong> Luz ruim, óculos, barba ou foto antiga atrapalham.</li>
  <li><strong>Aplicativo desatualizado.</strong> Atualize o Meu INSS e o gov.br antes de concluir que a conta está bloqueada.</li>
</ul>
<div class="caixa info"><p><strong>Antes de sair de casa:</strong> tente a recuperação de senha no site ou no aplicativo gov.br. Se a recuperação pedir validação bancária ou facial, tenha em mãos o celular e o documento.</p></div>
`
      },
      {
        id: 'recuperar',
        h2: 'Como recuperar o acesso pela via oficial',
        html: `
<ol>
  <li>Abra o site ou o aplicativo <strong>gov.br</strong> e toque em “Entrar com gov.br”.</li>
  <li>Escolha <strong>“Esqueci minha senha”</strong> e informe CPF, data de nascimento e os dados pedidos.</li>
  <li>Escolha a forma de validação disponível: banco, reconhecimento facial ou outro método oferecido.</li>
  <li>Crie uma nova senha e anote em local seguro. Não compartilhe a senha com ninguém.</li>
  <li>Volte ao Meu INSS e confira se a conta está em nível prata ou ouro.</li>
</ol>
<p>Se a recuperação não avançar, os canais oficiais do INSS são o aplicativo, o site e a central <strong>135</strong>. A central atende por telefone e orienta o próximo passo.</p>
<div class="caixa atencao"><p><strong>Nunca envie sua senha por WhatsApp.</strong> Nenhum órgão público pede senha por mensagem. A Speed também não pede: no atendimento presencial, quem digita é você.</p></div>
`
      },
      {
        id: 'nao-e-senha',
        h2: 'Quando o problema não é a senha',
        html: `
<p>Às vezes o acesso funciona, mas o documento não aparece. Os casos mais comuns:</p>
<table>
  <thead><tr><th>O que aparece</th><th>O que costuma significar</th></tr></thead>
  <tbody>
    <tr><td>“Benefício não encontrado”</td><td>CPF sem benefício ativo ou vínculo diferente do consultado</td></tr>
    <tr><td>Extrato vazio</td><td>Vínculos ainda não processados ou consulta no lugar errado</td></tr>
    <tr><td>Documento indisponível</td><td>Processo em análise ou exigência pendente</td></tr>
    <tr><td>Erro ao gerar PDF</td><td>Aplicativo desatualizado, conexão instável ou bloqueio do navegador</td></tr>
  </tbody>
</table>
<p>Nesses casos, a loja ajuda a localizar a informação e imprimir o que estiver disponível, mas não altera o resultado do benefício. Decisão sobre concessão, revisão ou pagamento é do INSS.</p>
`
      },
      {
        id: 'na-loja',
        h2: 'O atendimento presencial na Speed',
        html: `
<p>A Speed fica no Centro de Varginha e atende com o titular na frente da tela. O que a equipe faz:</p>
<ul>
  <li>Orienta o caminho dentro do gov.br e do Meu INSS</li>
  <li>Confere CPF, nome e dados antes de gerar o documento</li>
  <li>Imprime extrato, declaração ou carta de concessão</li>
  <li>Digitaliza e organiza documentos para banco ou cadastro</li>
  <li>Explica o que cada documento significa — sem prometer resultado</li>
</ul>
<h3>O que levar</h3>
<ul>
  <li>Documento com foto e CPF</li>
  <li>Celular que você usa na conta gov.br</li>
  <li>E-mail e telefone atualizados</li>
  <li>Se for para outra pessoa: autorização e documento do titular</li>
</ul>
`
      },
      {
        id: 'documentos',
        h2: 'Quais documentos costumam ser pedidos',
        html: `
<ul>
  <li><strong>Extrato CNIS:</strong> vínculos e contribuições, usado para conferir tempo de contribuição.</li>
  <li><strong>Carta de concessão:</strong> comprova o benefício e os dados do pagamento.</li>
  <li><strong>Extrato de pagamento:</strong> mostra valores e datas creditados.</li>
  <li><strong>Declarações:</strong> alguns bancos pedem declaração específica para crédito consignado.</li>
</ul>
<p>O banco define o que aceita. Leve o pedido do banco por escrito ou a lista de documentos para evitar ida e volta.</p>
`
      }
    ],
    faq: [
      { q: 'A Speed consegue desbloquear minha senha?', a: 'Não. O desbloqueio e a recuperação são feitos nos canais oficiais do gov.br. A loja orienta o passo a passo, com você digitando a senha.' },
      { q: 'Preciso levar meu celular?', a: 'Sim. O acesso é feito pela sua conta, com verificação no seu aparelho. Sem o celular, o atendimento fica limitado.' },
      { q: 'Vocês guardam minha senha?', a: 'Não. A senha é digitada por você e não é anotada, fotografada ou armazenada.' },
      { q: 'O Meu INSS tem senha própria?', a: 'Não. O acesso é pela conta gov.br. Por isso, o primeiro passo é verificar se a conta está funcionando e em nível adequado.' },
      { q: 'Quanto custa o atendimento?', a: 'O valor é informado antes do serviço. A impressão é cobrada à parte, conforme a quantidade de páginas.' }
    ],
    leia: [
      { href: 'como-imprimir-crlv-digital.html', t: 'Imprimir o CRLV', d: 'Passo a passo do documento do veículo.' },
      { href: 'regularizar-mei.html', t: 'Regularizar o MEI', d: 'DAS, declaração e CCMEI sem susto.' },
      { href: 'revisao-de-curriculo.html', t: 'Revisar currículo', d: 'Como organizar antes de entregar.' }
    ]
  },
  {
    slug: 'revisao-de-curriculo',
    title: 'Currículo em Varginha: 6 erros que o recrutador não perdoa',
    desc: 'Guia prático para revisar o currículo antes de entregar: contato, resumo, experiências, PDF, impressão e o que evitar. Atendimento em Varginha.',
    h1: 'Currículo em Varginha: 6 erros que fazem o recrutador parar de ler',
    lead: 'O recrutador decide em poucos segundos se continua lendo. Corrigir seis pontos simples muda a chance de o seu currículo chegar à entrevista.',
    code: 'DIG',
    assunto: 'currículo',
    msg: 'Olá! Quero revisar meu currículo. [DIG]',
    servico: 'curriculo.html',
    servicoNome: 'Currículo',
    entrada: 'Currículo não é autobiografia. É uma ferramenta de trabalho: precisa dizer, rápido, quem você é, o que sabe fazer e como entrar em contato. Em Varginha, muitas vagas passam por seleção no balcão e por aplicativo — o mesmo documento precisa funcionar nos dois.',
    secoes: [
      {
        id: 'erros',
        h2: 'Os 6 erros mais comuns',
        html: `
<h3>1. Contato desatualizado</h3>
<p>Telefone que não existe, e-mail que você não abre e cidade ausente. Se o recrutador não consegue falar com você, o resto não importa.</p>
<h3>2. Foto inadequada</h3>
<p>Foto de festa, selfie escura ou imagem antiga. Foto é opcional; se usar, que seja recente, neutra e com o rosto visível.</p>
<h3>3. Experiência sem data ou sem função</h3>
<p>“Trabalhei em loja” não diz nada. O correto é empresa, cargo, período e duas ou três atividades concretas.</p>
<h3>4. Texto genérico para todas as vagas</h3>
<p>Um currículo só serve para várias candidaturas quando o resumo é vago. Uma versão por tipo de vaga melhora a leitura.</p>
<h3>5. Arquivo pesado ou em formato estranho</h3>
<p>PDF de 12 MB não abre no celular do recrutador. Exporte em PDF leve e use um nome de arquivo claro.</p>
<h3>6. Currículo longo demais</h3>
<p>Para a maioria das vagas, uma página basta. Duas páginas só quando a experiência realmente exige.</p>
`
      },
      {
        id: 'estrutura',
        h2: 'Estrutura que funciona',
        html: `
<ol>
  <li><strong>Nome e contato:</strong> cidade, telefone com WhatsApp e e-mail.</li>
  <li><strong>Resumo:</strong> três linhas sobre a área e o tempo de experiência.</li>
  <li><strong>Experiência:</strong> da mais recente para a mais antiga, com período e atividades.</li>
  <li><strong>Formação:</strong> curso, instituição e ano de conclusão.</li>
  <li><strong>Cursos e certificações:</strong> só os que têm relação com a vaga.</li>
  <li><strong>Informações extras:</strong> CNH, disponibilidade de horário e idiomas, quando fizer diferença.</li>
</ol>
<div class="caixa verde"><p><strong>Regra prática:</strong> se uma informação não ajuda o recrutador a decidir, ela pode sair. Currículo bom é curto e específico.</p></div>
`
      },
      {
        id: 'vaga',
        h2: 'Uma versão por vaga (sem inventar)',
        html: `
<p>Leia o anúncio e marque as palavras que se repetem: atendimento, caixa, estoque, CNH, Excel, vendas. Use essas palavras no seu currículo <strong>apenas se forem verdade</strong>. Ajustar a ordem e o destaque é diferente de inventar experiência.</p>
<p>Se a vaga pede algo que você não tem, não escreva que tem. A entrevista e o teste prático revelam. O que você pode fazer é mostrar o que já aprendeu e a disposição para aprender.</p>
<div class="caixa atencao"><p><strong>Nunca invente empresa, cargo ou tempo.</strong> Além de prejudicar a contratação, isso pode gerar problema em processos seletivos e em contratações formais.</p></div>
`
      },
      {
        id: 'pdf-impressao',
        h2: 'PDF, nome do arquivo e impressão',
        html: `
<ul>
  <li>Exporte em <strong>PDF</strong>, com texto selecionável. Foto de documento ou print de tela não servem.</li>
  <li>Use nome claro: <code>Nome-Sobrenome-Curriculo.pdf</code>.</li>
  <li>Teste abrir no celular antes de enviar.</li>
  <li>Se for imprimir, prefira papel branco e tinta legível. Currículo amassado ou borrado passa impressão de descuido.</li>
  <li>Evite caixas de texto, colunas complexas e gráficos que atrapalham sistemas de triagem.</li>
</ul>
`
      },
      {
        id: 'na-loja',
        h2: 'Como a Speed ajuda na revisão',
        html: `
<p>A loja organiza o conteúdo com você, corrige dados e formata o arquivo. O texto final é sempre aprovado por você.</p>
<h3>O que levar</h3>
<ul>
  <li>Currículo atual, se tiver</li>
  <li>Lista de empregos com datas e atividades</li>
  <li>Cursos e certificados</li>
  <li>A descrição da vaga</li>
  <li>Telefone e e-mail que você usa</li>
</ul>
<div class="caixa-cta"><p>Quer chegar com o currículo pronto para entregar? A revisão e a impressão saem no mesmo atendimento.</p><a class="btn" href="{{ZAP}}">Falar no WhatsApp</a></div>
`
      }
    ],
    faq: [
      { q: 'Currículo precisa de foto?', a: 'Não. A foto é opcional. Se usar, escolha uma imagem recente, neutra e com boa iluminação.' },
      { q: 'Quantas páginas deve ter?', a: 'Para a maioria das vagas, uma página. Duas só quando a experiência e a formação exigem.' },
      { q: 'Posso usar o mesmo currículo para tudo?', a: 'Pode, mas não é o ideal. Ajustar o resumo e a ordem das experiências para a vaga melhora a leitura — desde que tudo seja verdade.' },
      { q: 'Vocês garantem emprego?', a: 'Não. O serviço é de organização, revisão e impressão. Contratação depende da empresa e do processo seletivo.' },
      { q: 'Vocês enviam o currículo para empresas?', a: 'Não sem sua autorização. O arquivo é entregue a você, e o envio é feito por você.' }
    ],
    leia: [
      { href: 'meu-inss-sem-senha.html', t: 'Meu INSS sem senha', d: 'O que fazer quando o login falha.' },
      { href: 'como-imprimir-crlv-digital.html', t: 'Imprimir o CRLV', d: 'Documento do veículo passo a passo.' },
      { href: 'regularizar-mei.html', t: 'Regularizar o MEI', d: 'DAS, declaração e CCMEI.' }
    ]
  },
  {
    slug: 'regularizar-mei',
    title: 'MEI atrasado: como regularizar DAS, declaração e CCMEI',
    desc: 'O que fazer quando o MEI tem DAS em atraso ou declaração anual pendente: ordem dos passos, onde acessar, o que levar e quando procurar contador.',
    h1: 'MEI atrasado: como regularizar DAS, declaração e CCMEI',
    lead: 'DAS em atraso, declaração anual esquecida ou dados desatualizados travam o MEI. A ordem de resolução importa — e começa pelo login certo.',
    code: 'DIG',
    assunto: 'MEI',
    msg: 'Olá! Preciso de ajuda para regularizar meu MEI. [DIG]',
    servico: 'abrir-mei.html',
    servicoNome: 'MEI',
    entrada: 'O Microempreendedor Individual tem três obrigações que se repetem: pagar o DAS mensal, entregar a declaração anual (DASN-SIMEI) e manter os dados cadastrais em dia. Quando uma delas atrasa, o CNPJ pode ficar irregular e o acesso a benefícios e financiamentos trava.',
    secoes: [
      {
        id: 'situacao',
        h2: 'Primeiro, veja a situação real do CNPJ',
        html: `
<p>Antes de pagar qualquer coisa, consulte o <strong>Portal do Empreendedor</strong> e o site da Receita Federal. Lá aparecem o DAS em aberto, as declarações entregues e a situação cadastral.</p>
<ul>
  <li><strong>DAS em atraso:</strong> boletos vencidos e não pagos.</li>
  <li><strong>DASN-SIMEI pendente:</strong> declaração anual não entregue.</li>
  <li><strong>Dados desatualizados:</strong> endereço, telefone ou atividade diferentes do cadastro.</li>
  <li><strong>Excesso de faturamento:</strong> situação que exige avaliação contábil, não apenas pagamento.</li>
</ul>
<div class="caixa info"><p><strong>Ordem prática:</strong> confira a situação, emita os DAS pendentes, pague, entregue a declaração e só então atualize os dados. Cada etapa destrava a seguinte.</p></div>
`
      },
      {
        id: 'passo-a-passo',
        h2: 'Passo a passo da regularização',
        html: `
<ol>
  <li><strong>Entre com a conta gov.br</strong> do titular do MEI. Sem login, não há como emitir DAS nem declarar.</li>
  <li><strong>Abra o Portal do Empreendedor</strong> e consulte a situação do CNPJ.</li>
  <li><strong>Emita os DAS em aberto</strong> e pague pelo banco ou aplicativo. Guarde os comprovantes.</li>
  <li><strong>Entregue a DASN-SIMEI</strong> referente ao ano pendente. A declaração costuma ter prazo em 31 de maio; confirme o ano e o prazo no portal.</li>
  <li><strong>Atualize os dados cadastrais</strong> que estiverem diferentes: endereço, telefone, e-mail e atividade.</li>
  <li><strong>Emita o CCMEI</strong> atualizado, que comprova a condição de MEI.</li>
  <li><strong>Guarde tudo:</strong> comprovantes de pagamento, recibo da declaração e CCMEI.</li>
</ol>
<div class="caixa-cta"><p>Travou no login ou não sabe qual DAS está em aberto? A loja ajuda a consultar e imprimir os documentos, com você na frente da tela.</p><a class="btn" href="{{ZAP}}">Falar no WhatsApp</a></div>
`
      },
      {
        id: 'valores',
        h2: 'Valores, multas e juros',
        html: `
<p>O valor do DAS depende da atividade do MEI e é atualizado todos os anos. Multa e juros de atraso também mudam. Por isso, este artigo não traz valor fixo: o número correto está no boleto gerado no portal oficial.</p>
<p>Não pague boleto recebido por WhatsApp ou e-mail sem conferir o emissor. Gere a guia você mesmo, no portal, e confira o CNPJ antes de pagar.</p>
<div class="caixa atencao"><p><strong>Golpe comum:</strong> mensagem com boleto de “regularização” e valor alto. O DAS é gerado no Portal do Empreendedor e pode ser conferido no app gov.br.</p></div>
`
      },
      {
        id: 'quando-contador',
        h2: 'Quando procurar um contador',
        html: `
<ul>
  <li>Faturamento acima do limite do MEI ou próximo dele.</li>
  <li>Necessidade de desenquadramento ou baixa do CNPJ.</li>
  <li>Dívida acumulada que você não consegue pagar de uma vez.</li>
  <li>Emissão de notas fiscais para empresas.</li>
  <li>Dúvida sobre imposto de renda e ganho de capital.</li>
</ul>
<p>A Speed orienta o acesso e imprime documentos, mas não faz contabilidade, não calcula imposto e não decide enquadramento. Nessas questões, o caminho é um contador.</p>
`
      },
      {
        id: 'na-loja',
        h2: 'Como a Speed ajuda',
        html: `
<p>O atendimento é presencial, com o titular do MEI. A equipe orienta o caminho no portal, confere os dados antes de imprimir e organiza os comprovantes.</p>
<h3>O que levar</h3>
<ul>
  <li>Documento com foto e CPF</li>
  <li>CNPJ do MEI</li>
  <li>Celular com a conta gov.br</li>
  <li>Comprovantes de pagamento, se tiver</li>
  <li>E-mail e telefone atualizados</li>
</ul>
`
      }
    ],
    faq: [
      { q: 'Posso pagar o DAS atrasado?', a: 'Sim. O próprio portal gera a guia com multa e juros. Confira o valor e o CNPJ antes de pagar.' },
      { q: 'O que acontece se eu não declarar?', a: 'O CNPJ pode ficar irregular, com restrição de acesso a benefícios e crédito. A declaração pendente precisa ser resolvida.' },
      { q: 'A Speed abre MEI?', a: 'A loja auxilia no acesso ao Portal do Empreendedor e na impressão do CCMEI. A decisão e a responsabilidade pelos dados são do titular.' },
      { q: 'Vocês fazem contabilidade?', a: 'Não. Para cálculo de imposto, desenquadramento ou baixa, procure um contador.' },
      { q: 'Preciso levar meu celular?', a: 'Sim. O acesso ao gov.br é feito com a sua conta e a verificação no seu aparelho.' }
    ],
    leia: [
      { href: 'meu-inss-sem-senha.html', t: 'Meu INSS sem senha', d: 'O que fazer quando o login falha.' },
      { href: 'como-imprimir-crlv-digital.html', t: 'Imprimir o CRLV', d: 'Documento do veículo passo a passo.' },
      { href: 'revisao-de-curriculo.html', t: 'Revisar currículo', d: 'O que o recrutador lê primeiro.' }
    ]
  }
];

function renderArtigo(a) {
  const link = zap(a.msg);
  const url = SITE + '/artigos/' + a.slug + '.html';
  const corpo = a.secoes.map(function (s) {
    return '<h2 id="' + s.id + '">' + s.h2 + '</h2>\n' + s.html.replace(/\{\{ZAP\}\}/g, link);
  }).join('\n');
  const indice = a.secoes.map(function (s) {
    return '<li><a href="#' + s.id + '">' + s.h2 + '</a></li>';
  }).join('');
  const faqHtml = a.faq.map(function (f) {
    return '<details><summary>' + f.q + '</summary><p>' + f.a + '</p></details>';
  }).join('');
  const leiaHtml = a.leia.map(function (l) {
    return '<a href="' + l.href + '"><strong>' + l.t + '</strong><span>' + l.d + '</span></a>';
  }).join('');
  const tempo = tempoLeitura(corpo);

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        'headline': a.h1,
        'description': a.desc,
        'inLanguage': 'pt-BR',
        'datePublished': DATA,
        'dateModified': DATA,
        'mainEntityOfPage': { '@type': 'WebPage', '@id': url },
        'author': { '@type': 'Organization', 'name': NOME, 'url': SITE },
        'publisher': {
          '@type': 'Organization',
          'name': NOME,
          'url': SITE,
          'logo': { '@type': 'ImageObject', 'url': SITE + '/logo.png' }
        },
        'about': a.assunto
      },
      {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          { '@type': 'ListItem', 'position': 1, 'name': 'Início', 'item': SITE + '/' },
          { '@type': 'ListItem', 'position': 2, 'name': 'Artigos', 'item': SITE + '/artigos/' },
          { '@type': 'ListItem', 'position': 3, 'name': a.h1, 'item': url }
        ]
      },
      {
        '@type': 'FAQPage',
        'mainEntity': a.faq.map(function (f) {
          return {
            '@type': 'Question',
            'name': f.q,
            'acceptedAnswer': { '@type': 'Answer', 'text': f.a }
          };
        })
      }
    ]
  };

  return `<!DOCTYPE html>
<!--
  RASCUNHO gerado por ferramentas/gerar_artigos.js
  Nome de exibição e horário pendentes de aprovação (ver 03_Decisoes_Pendentes.md).
  Antes de publicar: revisar 16_Checklist_Publicacao.md.
-->
<html lang="pt-BR" data-status="rascunho">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${a.title}</title>
<meta name="description" content="${a.desc}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${a.title}">
<meta property="og:description" content="${a.desc}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="pt_BR">
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
  <div class="wrap crumb">
    <a href="${SITE}">Início</a> › <a href="index.html">Artigos</a> › <span>${a.assunto}</span>
  </div>

  <section class="cabeca">
    <div class="wrap">
      <h1>${a.h1}</h1>
      <p>${a.lead}</p>
      <div class="meta-artigo">
        <span>Atualizado em 07/11/2026</span>
        <span>${tempo}</span>
        <span>Por Speed Financeira</span>
      </div>
    </div>
  </section>

  <div class="wrap">
    <article class="artigo">
      <p class="entrada">${a.entrada}</p>

      <nav class="toc" aria-label="Neste artigo">
        <strong>Neste artigo</strong>
        <ol>${indice}</ol>
      </nav>

      ${corpo}

      <h2 id="faq">Perguntas frequentes</h2>
      <div class="faq-artigo">${faqHtml}</div>

      <h2 id="leia">Leia também</h2>
      <div class="leia">${leiaHtml}</div>

      <div class="caixa-cta">
        <p>Precisa de ajuda presencial em Varginha? Confirme o horário e veja o que levar antes de sair de casa.</p>
        <a class="btn" href="${link}">Chamar no WhatsApp</a>
      </div>

      <div class="autor">
        <span class="selo" aria-hidden="true">S</span>
        <p><strong>${NOME}</strong> — empresa privada no Centro de Varginha, com atendimento presencial em serviços digitais, gráfica rápida, informática e correspondente bancário. ${TRANSPARENCIA_DIGITAL}</p>
      </div>

      <div class="fontes">
        <strong>Como este conteúdo foi feito:</strong> ${AVISO_CONTEUDO}
        Serviço relacionado: <a href="${a.servico}">${a.servicoNome}</a>.
      </div>
    </article>
  </div>
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
      ${TRANSPARENCIA_DIGITAL}
      <br>© <span id="ano">2026</span> ${NOME}.
    </div>
  </div>
</footer>

<a class="zap" href="${link}" aria-label="Falar no WhatsApp">WhatsApp</a>
<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>
<script>document.getElementById('ano').textContent = new Date().getFullYear();</script>
</body>
</html>
`;
}

function renderIndice() {
  const link = zap('Olá! Vim pelos artigos da Speed e quero atendimento. [GERAL]');
  const cards = ARTIGOS.map(function (a) {
    return '<a href="' + a.slug + '.html"><h2>' + a.h1 + '</h2><p>' + a.lead + '</p><small>' + tempoLeitura(a.secoes.map(function (s) { return s.html; }).join(' ')) + ' · Atualizado em 07/11/2026</small></a>';
  }).join('');

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': 'Artigos da Speed Financeira',
    'description': 'Guias sobre documentos, serviços digitais, currículo e MEI em Varginha.',
    'url': SITE + '/artigos/',
    'inLanguage': 'pt-BR',
    'hasPart': ARTIGOS.map(function (a) {
      return { '@type': 'Article', 'headline': a.h1, 'url': SITE + '/artigos/' + a.slug + '.html' };
    })
  };

  return `<!DOCTYPE html>
<!--
  RASCUNHO gerado por ferramentas/gerar_artigos.js
  Antes de publicar: revisar 16_Checklist_Publicacao.md.
-->
<html lang="pt-BR" data-status="rascunho">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Artigos e guias — Speed Financeira</title>
<meta name="description" content="Guias práticos sobre CRLV digital, Meu INSS, currículo e MEI. Conteúdo informativo da Speed Financeira, Varginha/MG.">
<link rel="canonical" href="${SITE}/artigos/">
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
  <section class="cabeca">
    <div class="wrap">
      <h1>Artigos e guias da Speed</h1>
      <p>Explicação direta sobre documentos, serviços digitais e rotina de quem empreende. Conteúdo informativo, com os canais oficiais indicados.</p>
      <div class="meta-artigo"><span>4 guias</span><span>Atualizado em 07/11/2026</span></div>
    </div>
  </section>
  <div class="wrap">
    <div class="artigo">
      <div class="indice">${cards}</div>
      <div class="caixa atencao" style="margin-top:22px">
        <p><strong>Conteúdo informativo.</strong> ${AVISO_CONTEUDO}</p>
      </div>
    </div>
  </div>
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
    <div class="fim">${TRANSPARENCIA_DIGITAL}<br>© <span id="ano">2026</span> ${NOME}.</div>
  </div>
</footer>
<a class="zap" href="${link}" aria-label="Falar no WhatsApp">WhatsApp</a>
<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>
<script>document.getElementById('ano').textContent = new Date().getFullYear();</script>
</body>
</html>
`;
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

ARTIGOS.forEach(function (a) {
  fs.writeFileSync(path.join(OUT, a.slug + '.html'), renderArtigo(a), 'utf8');
  console.log('gerado: artigos/' + a.slug + '.html');
});
fs.writeFileSync(path.join(OUT, 'index.html'), renderIndice(), 'utf8');
console.log('gerado: artigos/index.html');

const totalPalavras = ARTIGOS.reduce(function (s, a) {
  return s + palavras(a.secoes.map(function (x) { return x.html; }).join(' '));
}, 0);
console.log('');
console.log('Total: ' + (ARTIGOS.length + 1) + ' páginas · ' + totalPalavras + ' palavras de conteúdo.');
console.log('Fonte NAP: dados/nap.json');
console.log('Nada foi publicado.');
