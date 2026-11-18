# Contagem dos toques no WhatsApp por cidade (17/11/2026)

Status: no ar e conferida de ponta a ponta. O dono aprovou com "Sim, fazer a contagem".

## Para que serve

Saber de que cidade e de qual guia ou página vêm as pessoas que tocam no botão do WhatsApp do site, sem depender do aceite de cookies do Google Analytics. Só quem aceita cookies aparece no Analytics, e num site deste tamanho o Google não estima os outros.

## Como funciona

1. **Site.** As 218 páginas do build têm o script `id="wa-contagem"`. A cada toque num link `wa.me` ou `api.whatsapp.com`, ou num `window.open` para o WhatsApp (formulário da home e calculadoras), o navegador envia só o caminho da página para `/wa-clique.php`.
   - Sem cookie, sem IP, sem nome e sem telefone.
2. **Contador** (`site/build/wa-clique.php`, no ar). Grava "data + caminho" em `public_html/.wa-cliques/AAAA-MM.log`.
   - A pasta fica bloqueada para acesso pela web: o log responde 404 e a pasta, 403.
   - Fora do `public_html` a hospedagem não deixa gravar.
   - O arquivo de cada mês tem limite de 5 MB.
   - A leitura exige a chave; sem ela, o contador responde 404.
3. **Nexcafe** (`server/wa-cliques.js`):
   - lê a contagem a cada 3 horas, com a chave em `server/data/wa-cliques-chave.txt` (fora do git);
   - guarda o resultado em `db.waClicks`;
   - responde em `GET /api/wa-cliques`, e `POST /api/wa-cliques/atualizar` força a leitura (só administrador);
   - caminhos de teste (`/__...`) ficam de fora.
4. **Painel Financeira.** O quadro "Por cidade" junta os toques no WhatsApp dos últimos 30 dias com os contatos, os contatos pelo site, os contratos e a comissão. Logo abaixo, lista as 10 páginas com mais toques.

Cidade só é atribuída a guias (`/guia/...`) e páginas de cidade (`/financeira-<cidade>-mg.html`). Home, produtos e blog ficam em "Páginas gerais".

## Conferência

- **Contador:** chave errada dá 404; com a chave, devolve a contagem. Um POST de teste foi gravado e lido.
- **Navegador real:** no guia de consignado CLT de Três Pontas, o script carregou. Um toque no link e um `window.open` para o WhatsApp geraram 2 registros no caminho de teste.
- **Envio:** 189 páginas foram publicadas, todas idênticas ao build ao vivo. Os 29 artigos do blog com data futura já têm o script e sobem pela tarefa diária. A lista está em `speedfinanceira.com.br-audit/implementation-20261117/published-2-contagem.json`.
- **Leitura pelo Nexcafe:** depois do reinício, a primeira leitura foi gravada às 22h50 UTC.
- **Testes:** `npm run verify` passou com 76 de 76, incluindo os 4 de `tests/wa-cliques.test.js`.

## Limites

- Conta toques no botão, não conversas iniciadas. Quem toca e desiste também conta. A comparação com os contatos registrados no funil mostra a diferença.
- Qualquer pessoa pode enviar toques falsos ao contador. O formato do caminho é conferido e o tamanho do arquivo é limitado, mas a contagem não é à prova de fraude.
- Ainda não houve toque real de cliente: os números começam a aparecer a partir de agora.
