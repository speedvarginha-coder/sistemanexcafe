# Auditoria LanHouseManager (25/09/2026)

Escopo: `server/` (Node), `server/public/` (painel), `client-agent/` (agente PowerShell), scripts `.bat`, dados reais em `server/data/db.json` e pastas auxiliares.

Estado atual verificado:
- `npm run verify`: sintaxe OK e 14/14 testes passam. Os testes cobrem somente o servidor.
- Banco real: 10 estações cadastradas, apenas 1 (`tempname`) já se conectou. As outras 9 nunca foram vistas.
- Não existe repositório git. Há 5 cópias do agente espalhadas.

Legenda: **[C]** confirmado por teste ou pelos dados reais; **[L]** confirmado pela leitura do código.

---

## CRÍTICO (impede uso em produção)

### 1. O usuário Cliente pode editar o agente e virar administrador [C]
`C:\LanHouseManagerAgent` é criado sem ajuste de permissões. Ele herda de `C:\` a permissão "Usuários autenticados: Modificar" (conferido com `Get-Acl C:\`). Por isso a auto-atualização funciona rodando como Cliente, mas o mesmo acesso deixa o cliente:
- apagar a chamada da tela de bloqueio em `LanHouseAgent.ps1` e usar a máquina de graça;
- ler o `AgentToken` em `agent-config.json`;
- colocar qualquer código no script. O `.bat` fica na pasta Inicializar **comum** (`ProgramData\...\StartUp`), então o script roda também quando o administrador entra. A checagem `ProtectedUsers` (linha 1407) fica dentro do próprio arquivo que o cliente consegue editar.

Correção: no instalador, `icacls C:\LanHouseManagerAgent /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-32-545:(OI)(CI)RX"`. Mover a auto-atualização para uma tarefa agendada como SYSTEM e iniciar o agente por tarefa agendada no logon **apenas do usuário cliente**, sem usar a pasta Inicializar comum.

### 2. A tela de bloqueio se fecha pelo Gerenciador de Tarefas [L]
Nenhuma política é aplicada ao perfil Cliente. `Ctrl+Shift+Esc`, depois finalizar os `powershell.exe` do agente (`-Action Run`) e do bloqueio, libera a máquina. As teclas Win não são bloqueadas por um `KeyDown` de WinForms.
Correção: no instalador, gravar no HKCU do Cliente (carregando o `NTUSER.DAT`): `DisableTaskMgr`, `DisableCMD`, `NoRun`, `DisableRegistryTools`. Também um vigia (tarefa SYSTEM) que recoloca o agente no ar se o processo sumir.

### 3. As janelas de impressão congelam o agente, e o tempo não expira [L]
`Show-PdfPrintReview` (linha 948) e `Show-PrintConfirm` (linha 1216) usam `ShowDialog()` **dentro do loop principal** (chamadas nas linhas 1511 e 1526). Enquanto a janela está aberta, o agente não consulta o servidor, não abre a tela de bloqueio ao fim do tempo e aparece offline no painel depois de 20 s. Basta o cliente mandar imprimir e deixar a janela aberta para usar o PC sem limite.
Correção: abrir as janelas em processo separado (como já é feito com `-Action LockScreen`) e trocar resultados por arquivo ou pipe.

### 4. Sem servidor, a estação liberada nunca bloqueia [L]
Se o servidor cair, o `catch` do loop (linha 1563) só registra log e mantém o estado atual. O contador da barra chega a zero e nada acontece.
Correção: o agente guarda `endsAt` com a diferença de relógio do servidor e bloqueia sozinho quando o tempo acaba, ou depois de N minutos sem contato.

---

## ALTO

### 5. Instalação reabre a falha PrintNightmare [L]
`Install-SharedPrinters` (linhas 501-517) grava `RestrictDriverInstallationToAdministrators=0`, `NoWarningNoElevationOnInstall=1` e `AllowInsecureGuestAuth=1`. Isso desfaz a correção da Microsoft para o CVE-2021-34527 e libera SMB de convidado sem autenticação. O instalador já roda como administrador e não precisa disso.
Correção: remover as três gravações. Instalar os drivers durante a instalação com `printui /ga`.

### 6. Impressão sem cobrança [L]
As impressoras compartilhadas ficam conectadas direto no perfil do cliente. Impressões que não passam pela "Impressão Nexcafé" só são vistas depois de impressas (evento 307), e o cliente pode clicar em "Cancelar" na confirmação (linha 1249): a folha sai e nada é cobrado.
Correção: não conectar as compartilhadas no perfil Cliente, deixando só a fila virtual. Outra opção é controlar a fila no servidor de impressão.

### 7. Tempo extra em sessão com saldo sai de graça [L]
Em `add-time` (server/app.js:669-680) a sessão `credit` recebe `endsAt` e `plannedMinutes` novos, mas `creditSeconds` não muda. No encerramento (linha 302) o débito é `min(creditSeconds, decorrido)`, então os minutos adicionados não são descontados nem cobrados.
Correção: em sessão `credit`, recusar `add-time` quando faltar saldo, ou somar a `creditSeconds` e checar o saldo do cliente.

### 8. Acentos corrompidos nas requisições do agente [C]
No PowerShell 5.1, `Invoke-RestMethod -Body <string>` envia ISO-8859-1. O servidor lê UTF-8. Aparece no banco real: `"O tempo limite da opera��o foi atingido"`. Afeta eventos, nome da impressora e o **login do cliente**: senha com `ç` ou acento nunca confere. Só o cadastro (linhas 653-659) converte para bytes UTF-8.
Correção: função única `Invoke-AgentApi` que sempre envia `[Text.Encoding]::UTF8.GetBytes($json)` com `charset=utf-8`.

### 9. O instalador perde o nome da estação e falha em pasta com espaço [C]
`Instalar-Agente.ps1` passa o array para `Start-Process -ArgumentList` sem aspas. O PowerShell 5.1 junta tudo com espaços. Teste reproduzido:
- `-MachineName "Máquina 11"` chega como `MachineName=Máquina` e `ServerUrl=11`;
- ZIP extraído em pasta com espaço: o script não é encontrado (código de saída -196608).
Isso explica nomes errados como `tempname` / "Maquina - 11" no painel. `Capturar-Padrao.ps1` já coloca aspas; o instalador não.
Correção: colocar entre aspas os argumentos que têm espaço, como em `Capturar-Padrao.ps1`.

### 10. O monitoramento remoto enche o histórico e regrava o banco a cada 1,5 s [C]
`public/app.js:181-185` chama `POST /monitor` a cada 1,5 s. Cada chamada cria um evento e grava o `db.json` inteiro (app.js:708-709). No banco real há dezenas de eventos "Monitoramento remoto" seguidos. Como o limite é de 500 eventos, a trilha de auditoria se perde.
Correção: renovar só quando faltar menos de 30 s para `monitorUntil`, e registrar evento apenas ao iniciar o monitoramento.

### 11. Chave de instalação exposta e sequestro de estação [L]
A `installKey` está em `client-agent/install-config.json`, `server/Iniciar-Vigia-Impressao.bat`, no pendrive e no ZIP, e é igual à do banco. Com ela, `enroll-by-key` (app.js:457-464) **sobrescreve o token de uma estação que já existe**: o agente legítimo passa a receber 401 e quem tem a chave assume o lugar dele.
Correção: `enroll-by-key` só cria IDs novos, e a troca de token de uma estação existente passa a exigir o painel. Regenerar a chave depois de instalar as estações.

### 11b. Estação fica presa em "LIBERANDO" e nunca passa para "Em uso" [C]
O painel (`public/app.js:120`) só mostra "Em uso" depois que o agente envia `openedSessionId` para `/api/client/:id/event` (app.js:484). **Nenhum script `.ps1` do projeto envia esse campo** (conferido com grep em todas as cópias). No banco real, a `tempname` está desbloqueada, online, com sessão de 60 min e `openedSessionId: null`. O teste automatizado passa porque simula o agente fazendo a chamada.
Correção: quando a tela de bloqueio fechar por `locked=false`, o agente chama `Send-AgentEvent` com `openedSessionId = $command.session.id`.

---

## MÉDIO

12. **Mudar o ID da estação quebra o agente** (app.js:627-641): o agente continua usando o ID antigo e recebe 404 para sempre. Bloquear a troca de ID ou gerar um novo pareamento.
13. **Consultas pesadas a cada poll**: `Get-AgentCommand` chama `Get-AgentMac` (`Get-NetAdapter`, CIM), e isso roda em 3 processos (loop a cada 2 s, bloqueio a cada 1 s, barra a cada 3 s). A tela de bloqueio faz HTTP síncrono na thread da interface, com timeout de 5 s, e trava enquanto espera. É um provável contribuinte para os "tempo limite atingido" do banco. Solução: descobrir o MAC uma vez só e passar a chamada da tela de bloqueio para uma tarefa assíncrona.
14. **Falha de restauração** dorme 15 s dentro do loop (linha 1538), e o agente fica sem responder nesse intervalo.
15. **Valores fixos da instalação antiga**: impressoras `DESKTOP-HAA6JTV` (app.js:917, 937), IP `192.168.1.14` e a chave em `.bat`, o nome "4260" como impressora colorida. Tudo isso deveria vir da configuração.
16. **Servidor sem tratamento de erro em streams**: `fs.createReadStream(...).pipe(res)` (app.js:990) não tem `on("error")`, então um arquivo ausente derruba o processo.

---

## ORGANIZAÇÃO DO PROJETO (causa provável da dificuldade com o Codex)

- **Sem git**: cada rodada do Codex sobrescreve o código sem histórico e sem como voltar. Os backups manuais (`db.json.antes-unlock-*`, `Backup-Pendrive-Antigo-*`, `CORRIGIR.bat`) mostram correções feitas em cima de sintomas.
- **5 cópias do agente**: `LanHouseManager/client-agent` (a que o servidor distribui por auto-atualização), `../client-agent` (desatualizada, sem `Capturar-Padrao.ps1`), `../temp_test.ps1`, `Pendrive-Preparado/`, `Backup-Pendrive-Antigo-*` e o ZIP. Editar a cópia errada parece não ter efeito.
- **Agente monolítico**: 2.057 linhas num só arquivo, com rede, interface, impressão, PDF e restauração na mesma thread. É ali que estão os itens 1 a 9, e ali não há nenhum teste automatizado.
- **Lixo versionável**: `print-watcher.log` (830 KB), `pw.log`, `print-watcher.ps1` e `Iniciar-Vigia-Impressao.bat` (monitor já desativado), imagens duplicadas.
- Versões divergentes: `package.json` diz 0.2.0 e o agente diz 0.3.0.

## Ordem de correção recomendada

1. `git init` com a pasta atual como primeiro commit. Apagar as cópias duplicadas e deixar só `LanHouseManager/client-agent`.
2. Itens 8 e 9 (encoding e instalador): são pequenos e destravam a instalação das 9 estações que faltam.
3. Itens 3 e 4 (congelamento e fail-open): abrir diálogos em processo separado e fazer o agente bloquear sozinho.
4. Itens 1, 2 e 5 (permissões, políticas e PrintNightmare): fazer junto com a mudança para tarefas agendadas.
5. Itens 6, 7, 10 e 11 (receita e auditoria).
6. Testar uma estação por completo antes de replicar, com o roteiro de `TESTE-RAPIDO.md`.

Para o Codex, peça **um item por vez**, citando arquivo e linha deste documento, e faça commit ao terminar cada um.
