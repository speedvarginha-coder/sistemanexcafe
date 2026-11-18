# Auditoria de qualidade do projeto (11/11/2026)

Escopo: código do LanHouseManager (`server/`, `server/public/`, `client-agent/`, `tests/`), repositório git, configuração ativa no banco e tarefas agendadas do caixa.

Fora do escopo: site, ficha do Google e conteúdo de marketing (cobertos em `auditoria-2026-11-05.md`). As estações reais não foram testadas. O `server/app.js` foi lido nos pontos sensíveis (login, sessão, arquivos, comandos, cofre, roteador), não linha a linha.

## Resultado

O código e os testes estão em bom estado. Os riscos estão na operação: painel aberto à rede, segredos sem proteção e código sem cópia fora do PC.

| Verificação | Resultado |
|---|---|
| `npm run verify` | 70 de 70 testes passam em 21 s |
| Sintaxe | 14 arquivos JS e 10 scripts PowerShell sem erro |
| Dependências npm | nenhuma (só módulos do Node) |
| Servidor | no ar, respondendo 200 em `localhost:4780` |
| Backup e sincronização | última execução de hoje sem erro |

## Situação depois das correções (11/11/2026)

- Item 4: os dois `install-config.json` saíram do git (`git rm --cached`); os arquivos continuam no disco. A remoção está preparada, ainda sem commit.
- Item 5: `server/app.js` voltou para CRLF. O teste "fim de linha" em `tests/painel.test.js` faz o `npm run verify` falhar se um arquivo versionado em CRLF for regravado em LF.
- Item 6: a estação trava o login do cliente por 15 minutos depois de 8 senhas erradas (`clientLoginAttempts` em `server/app.js`), com teste em `tests/integration.test.js`. Servidor reiniciado às 10h09.
- Item 3: o backup do Drive (`server/backup-drive.bat`, de hora em hora) passou a copiar também o código para `L:\Meu Drive\Backup Nexcafe\codigo`, com o histórico do git e o que não teve commit. A pasta `data` fica de fora. Primeira cópia: 2.222 arquivos, 163 MB, sem falhas. Um remoto privado continua sendo a opção mais completa.
- Item 7: os dados do marketing são lidos por `readMarketingList`, num contexto vazio, sem `eval`, de onde só sai texto JSON. O arquivo deixa de alcançar o processo do servidor (teste em `tests/marketing-sync.test.js`). O risco foi reduzido, não eliminado: o `vm` do Node não é uma barreira completa. A solução definitiva é gerar esses dados em JSON na origem.
- Item 9: o gatilho de logon da tarefa `Speed-Blog-Publicar-Dia` ganhou atraso de 3 minutos. Ainda não foi observado num logon real.
- Item 10: a chave de instalação é comparada em tempo constante (`sameSecret`). Ela continua passando na URL em `/api/print/pending-releases`.
- Item 12: os 3 scripts soltos foram para `scripts/antigos/` e os arquivos `.bak` entraram no `.gitignore`. Os 3 backups manuais do banco em `server/data` não foram apagados.
- Item 14: os 6 `catch` vazios do servidor foram revisados e são intencionais (limpeza de socket, leitura opcional de arquivo, sessão ausente). Os 4 do painel não foram revisados.
- Agora são 72 de 72 testes passando. Servidor reiniciado de novo às 10h20.
- Continuam abertos: itens 1 e 2 (dependem do dono), 8, 11 e 13. Nada disto teve commit.

## Prioridade alta

1. **O painel responde a qualquer PC da rede.** Aberto desde 05/11.
   - `settings.panelOnlyHere` continua desligado.
   - A regra de firewall "LanHouseManager - Servidor TCP 4780" vale para os perfis Privado e Público.
   - O tráfego é HTTP e o servidor roda na conta SISTEMA.
   - Correção: ligar "Painel só neste computador" e deixar a regra de firewall só no perfil Privado.
2. **Segredos sem proteção.** Aberto desde 05/11.
   - O cofre tem 8 itens e nenhuma senha mestre. A chave `cofre.chave` fica ao lado do banco e vai junto para o Google Drive.
   - O `db.json` guarda em texto puro `gmbApi.clientSecret` e `gmbApi.refreshToken`.
   - Correção: ativar a senha mestre no painel.
3. **O código não tem cópia fora deste PC.**
   - O git não tem remoto.
   - O backup do Drive copia só `C:\LanHouseManager-Backup` (banco, anexos e chave), não o código.
   - Há 108 arquivos alterados ou novos sem commit desde 05/11 (46 modificados, 53 novos, 9 renomeados).
   - Correção: fazer o commit e criar um remoto privado, ou copiar um `git bundle` para o Drive.
4. **A chave de instalação está versionada.**
   - `client-agent/install-config.json` e `Pendrive-Preparado/LanHouseManager-Estacoes/install-config.json` estão no git com a chave atual, apesar do `.gitignore`.
   - Sem remoto, hoje não há vazamento. Passa a haver no dia em que o repositório subir para o GitHub.
   - Correção: `git rm --cached` nos dois arquivos.

## Prioridade média

5. **`server/app.js` trocou de CRLF para LF.** O `git diff` mostra 6.679 linhas, mas só 7 mudaram de verdade. É a segunda vez (o commit `6efa0bc` já corrigiu isso). Correção: criar `.gitattributes` fixando o fim de linha.
6. **O login do cliente na estação não limita tentativas.**
   - A rota `POST /api/client/:id/login` aceita senha de 4 caracteres e não conta erros.
   - Ela exige o token do agente, mas o usuário da estação consegue ler esse token (limite já descrito em `ARQUITETURA.md`).
   - Cada tentativa roda `scryptSync` e trava o servidor por um instante.
   - Hoje só 1 cliente tem login. Correção: usar o mesmo contador do `/api/login`, por estação.
7. **O servidor executa arquivos da pasta de marketing.** `napDirectories` e a leitura dos posts usam `vm.runInNewContext` em `data_nap_erros.js` e `data_gmb_posts.js`, que chegam pela sincronização do Drive. O `vm` não é barreira de segurança: quem alterar esses arquivos no Drive executa código no caixa como SISTEMA. Correção: ler os dados em JSON.
8. **Arquivos muito grandes.**
   - `server/app.js`: 3.341 linhas, com a função `api()` de cerca de 2.000 linhas e 121 rotas em sequência.
   - `server/public/app.js`: 5.573 linhas. `client-agent/LanHouseAgent.ps1`: 2.997 linhas.
   - Funciona e está testado. Não vale reescrever; ao mexer em uma área, separe em módulo, como já foi feito com `geogrid.js` e `ficha-saude.js`.
9. **A tarefa `Speed-Blog-Publicar-Dia` falha no gatilho de logon.** A execução das 9h07 terminou com 0x8007010B, porque o L: ainda não estava montado. O artigo de hoje saiu às 6h (confirmado no log). O risco é o dia em que o PC estiver desligado às 6h. Correção: atraso de 2 minutos no gatilho de logon.

## Manutenção

10. A chave de instalação é comparada com `!==` e passa na URL em `/api/print/pending-releases`. Risco baixo na rede local.
11. Não há lint nem formatador. O CI (`.github/workflows/ci.yml`) nunca roda, porque não há remoto.
12. Sobras: 6 arquivos `.bak` no repositório, 3 scripts soltos na raiz (`check_criador.js`, `check_post_fila.js`, `inspect_ficha.js`) e 3 backups manuais do banco em `server/data`, cada um com os mesmos segredos.
13. `server/public/marketing` tem 88 MB de artes dentro do repositório, e o `.git` já tem 79 MB.
14. Há 10 blocos `catch` vazios (6 no servidor, 4 no painel). Não foram revisados um a um.

## O que está certo

- **Login e sessão:** scrypt com comparação em tempo constante; limite de tentativas no login, na vinculação e no cofre; cookie `HttpOnly` e `SameSite=Strict`; conferência de origem em toda gravação; tokens guardados só como hash.
- **Arquivos:** o painel serve uma lista fixa de arquivos; o marketing só abre para o administrador, com conferência de caminho e de tipo.
- **Comandos:** todas as chamadas externas usam `execFile` com lista de argumentos, sem shell.
- **Banco:** gravação com `fsync` e troca de arquivo, backup diário, cópia externa e restauração automática quando o arquivo está ilegível.
- **Painel:** os dados passam pela função `html()` antes de virar HTML; as interpolações sem escape são números e valores.
- **Auditoria anterior:** os itens 13, 14 e 15 foram resolvidos.
