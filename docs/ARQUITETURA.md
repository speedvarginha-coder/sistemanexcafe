# Arquitetura

## Componentes

- `server/server.js`: inicia o servidor HTTP.
- `server/app.js`: autenticação, regras de sessão, vendas, caixa, cadastros e relatórios.
- `server/public`: painel do atendente.
- `server/data/db.json`: dados locais. Escrita por arquivo temporário e substituição; backup da versão anterior e cópia diária.
- `client-agent/LanHouseAgent.ps1`: agente PowerShell na sessão do usuário Windows cliente.

## Acesso

O administrador inicial é criado apenas por uma requisição local no computador servidor. O painel usa cookie de sessão `HttpOnly` e `SameSite=Strict`. Senhas são derivadas com `scrypt`. Atendentes operam máquinas, abrem e ajustam o caixa e recebem pagamentos; apenas administradores mudam tarifas, produtos, usuários, vinculação de agentes e fecham o caixa.

Cada estação recebe um código de vinculação temporário, usado uma vez. O agente troca o código por um token e o envia nas chamadas `GET /api/client/:id/command` e `POST /api/client/:id/event`. O servidor guarda apenas o hash do token. O agente informa os números de restauração e reinício concluídos.

Como alternativa sem digitação, o painel gera um `install-config.json` com IP do servidor, chave de instalação e impressoras. O instalador do agente lê esse arquivo, se cadastra por `POST /api/agent/enroll-by-key` (chave única validada no servidor) e conecta as impressoras compartilhadas via `Add-Printer`. A chave fica em `db.installKey`, visível apenas para administradores, e pode ser regenerada.

Um cliente cadastrado com login e senha pode entrar sozinho pela tela de bloqueio via `POST /api/client/:id/login`. O servidor exige a credencial do agente da estação, cria uma sessão por saldo (`billingMode: credit`), recusa um cadastro já em uso em outra estação e exige saldo de pelo menos um minuto.

## Dados e cobrança

Sessão ativa fica na máquina; ao encerrar, vai para `sessionHistory`. Vendas ficam em `charges`; recebimentos ficam em `payments`; alterações de estoque ficam em `stockMovements`; aberturas e fechamentos ficam em `cashShifts`. Isso permite pendências e relatórios sem confundir o estado atual da estação com o histórico financeiro.

No pré-pago, a cobrança ocorre ao liberar ou adicionar tempo. No pós-pago, a cobrança é criada ao encerrar ou expirar. O tempo usado é arredondado para cima em minutos e limitado ao tempo contratado. A tabela `settings.timeTable` define faixas de minutos com preço (`{ minutes, cents }`), interpoladas linearmente entre os pontos; até a primeira faixa vale o preço dela e acima da última vale `rateCentsHour`. O valor corrente da estação (tempo da sessão, já incluindo impressões confirmadas) é exposto em `valueCents` no estado e na resposta de comando do agente, que o mostra no painel do cliente.

Na sessão por saldo (`billingMode: credit`), o tempo usado é descontado de `client.creditSeconds` ao encerrar ou expirar e o restante volta ao cadastro. A recarga (`POST /api/clients/:id/recharge`) converte reais em segundos pela tarifa vigente, exige um `ref` único para não lançar a mesma recarga duas vezes e registra a venda no caixa.

## Arquivamento e backup

Registros com mais de 45 dias (`charges`, `payments`, `sessionHistory`, `stockMovements`, `cashAdjustments`, caixas fechados e eventos) saem do `db.json` e vão para arquivos mensais `server/data/archive-YYYY-MM.json`. O relatório diário lê o arquivo do mês correspondente quando a data consultada é antiga. Backups diários `db.json.YYYY-MM-DD.bak` são mantidos por 7 dias; a cópia de migração `db.json.antes-v2-*.bak` não é apagada automaticamente.

## Limites

- O bloqueio é uma janela no desktop do cliente, que pode ser interrompida por quem controlar a sessão Windows. O agente tenta bloquear quando perde conexão com o servidor.
- O token do agente fica disponível no PC cliente para que o processo do usuário o leia; ele não protege contra um usuário local com controle do sistema.
- A limpeza restaura apenas pastas configuradas e caches conhecidos. Não reverte instalações nem todo o perfil Windows.
- O registro de impressão é manual; não há integração com spooler ou impressora virtual.
- O banco JSON é adequado para uma instalação pequena com um único processo servidor. Registros antigos são arquivados mensalmente para limitar o tamanho do `db.json`. Não há sincronização entre servidores.
