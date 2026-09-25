# LanHouseManager

Sistema local para administrar uma lan house com oito estações Windows 10. Inclui servidor no caixa, painel web e agente instalado em cada PC cliente.

## O que esta versão faz

- Login de administrador e atendentes, com senhas protegidas por `scrypt`.
- Cadastro e vinculação das estações por código temporário.
- Liberação de tempo pré-pago ou pós-pago, adição de minutos, bloqueio, encerramento e reinício remoto.
- Tela cheia de bloqueio (fundo azul) no cliente. Ao encerrar, volta Área de trabalho, Downloads, Documentos, Imagens, Vídeos e Músicas ao padrão salvo e limpa navegadores (histórico, cookies, senhas, conta conectada), WhatsApp/Telegram/Discord, arquivos recentes, senhas salvas no Windows e a lixeira. Programas abertos pelo cliente são fechados antes.
- Ligar e desligar estações pelo painel: desligar o Windows de uma máquina ou de todas, e ligar via Wake-on-LAN (envia o pacote mágico pelo MAC que o agente informa).
- Caixa com abertura, recebimentos em dinheiro/Pix/cartão, entradas, retiradas e fechamento.
- Tarifas por faixas de tempo (ex.: 15 min = R$ 3,00, 30 min = R$ 3,70, 60 min = R$ 5,00) e por hora acima da última faixa, mais valor por página; cobrança pelo tempo efetivamente usado, arredondado para cima ao minuto e limitado ao tempo contratado.
- Painel flutuante na tela do cliente, no canto inferior direito, com o tempo restante e o valor que está correndo (tempo + impressões + consumo).
- Consumo na estação (**+ Consumo** no cartão): produtos, serviços e impressões feitas no balcão entram na conta da sessão e são recebidos no encerramento.
- Monitoramento remoto da tela com controle de mouse e teclado (cerca de 3 quadros por segundo).
- Atualização automática do agente: as estações comparam a versão com o servidor e se atualizam e reiniciam sozinhas (depois da primeira instalação por pen drive).
- Clientes, produtos/serviços, estoque, venda e histórico diário.
- Atendimento com duração rápida, busca de cliente, prévia de tarifa, confirmação de abertura pelo agente e recebimento no encerramento.
- Venda rápida com vários produtos, leitura de código de barras, um pagamento e alerta de estoque mínimo.
- Pacote ZIP de instalação gerado pelo painel, com configuração atual do servidor.
- Saldo pré-pago por cliente: o atendente recarrega em reais e o próprio cliente entra na estação com login e senha; o tempo usado é descontado do saldo e o que sobrar volta ao cadastro.
- Impressão pelo caixa: a estação só enxerga a **Impressão Nexcafé**. O cliente vê a prévia, escolhe preto e branco ou colorido, e o computador do caixa imprime na impressora escolhida em **Atendimento > Impressões** (onde também ficam os preços). Só cobra se a impressão sair.

O bloqueio é uma janela do Windows, não um congelamento de disco como Deep Freeze. Não substitui políticas de segurança do Windows. Teste uma estação antes de migrar as oito.

## Requisitos

- Servidor: Windows 10/11, Node.js 18 ou superior, IP fixo na rede local.
- Clientes: Windows 10, PowerShell padrão, conta `Cliente` sem privilégios de administrador.
- Rede local isolada. O tráfego HTTP da instalação padrão não é criptografado; não abra a porta 4780 para a internet.

## Primeiro acesso no servidor

1. No PC do caixa, execute `server\Start-Servidor.bat`.
2. No mesmo PC, abra `http://localhost:4780`.
3. Crie o administrador com uma senha de pelo menos 10 caracteres. A configuração inicial só é aceita no próprio servidor.
4. Entre no painel. Em **Tarifas**, confira os valores antes da primeira venda: as faixas de tempo (ex.: `15=3.00; 30=3.70; 60=5.00`), o valor por hora acima da última faixa, e os valores por página P&B e colorida.
5. Abra o caixa informando o dinheiro inicial.

Para o servidor iniciar junto com o Windows (mesmo sem ninguém abrir janela), execute `server\Instalar-Servico.bat` como administrador. Ele cria a tarefa do servidor e remove o monitor antigo que pausava trabalhos de impressão. Para desfazer, rode `server\Remover-Servico.bat`.

O servidor guarda dados em `server\data\db.json`. Na migração da versão anterior, cria uma cópia `db.json.antes-v2-*.bak`. Também cria uma cópia diária antes da primeira gravação do dia, mantendo os últimos 7 dias. Registros com mais de 45 dias são arquivados mensalmente em `archive-YYYY-MM.json`. Se o JSON estiver inválido, o servidor falha ao iniciar em vez de zerar a loja. Faça backup periódico da pasta `server\data` com o servidor parado.

## Instalar cada estação (modo rápido)

1. Em **Atendimento > Impressões**, escolha as impressoras do caixa (preto e branco e colorida) e os preços por página.
2. Use o pendrive preparado (`Pendrive-Preparado`, com a pasta `LanHouseManager-Estacoes`) ou baixe o ZIP em **Atendimento > Baixar pacote das estações**.
3. Na estação, deixe o perfil do cliente como deve ficar e execute `1 - INSTALAR.bat` com o número da estação. No fim, responda **S** para proteger a conta: o instalador cria a conta administradora **Tecnico** (pede a senha na primeira vez), tira o administrador do usuário do cliente, bloqueia Gerenciador de Tarefas, CMD, Executar e PowerShell no perfil do cliente, protege a pasta do agente, remove as impressoras diretas e libera a pasta do agente no Windows Defender.
4. Execute `2 - CAPTURAR PADRAO.bat`. Reinicie e entre no usuário cliente.
5. Execute `3 - VERIFICAR APOS REINICIAR.bat` e confirme no painel que a estação ficou online e bloqueada.

Reinstalar na mesma máquina funciona direto. Para instalar uma estação já cadastrada em **outro** computador, clique antes em **Mais ações > Vincular agente** no cartão dela (vale por 1 hora); sem isso a chave de instalação não substitui o vínculo existente.

Siga o roteiro completo em `docs\INSTALACAO-ESTACOES.md` antes de instalar nas oito máquinas.

A chave de instalação autentica as estações. Para invalidar configurações já baixadas, use **Regenerar chave de instalação** na mesma tela.

## Instalar cada estação (modo manual)

1. No painel, clique **Adicionar estação** e cadastre `pc-01` / `PC 01`. Guarde o código exibido; ele vale por uma hora e é usado uma vez.
2. Copie a pasta `client-agent` para essa estação.
3. Entre como administrador e execute `Instalar-Agente.bat`.
4. Informe a URL do servidor, o ID, o nome e o código de vinculação.
5. Escolha o perfil Windows do cliente. Esta versão aceita **um perfil cliente por estação**.
6. Prepare Desktop e Downloads do perfil `Cliente`. Execute `Capturar-Padrao.bat` como administrador para salvar o padrão.
7. Entre no perfil `Cliente` e reinicie a estação. O agente inicia automaticamente e deve aparecer online no painel.

Se já havia um agente da versão 0.1, reinstale com o novo instalador.

## Rotina de atendimento

1. Abra o caixa.
2. Na estação online, clique **Liberar estação**. Escolha uma duração rápida ou informe minutos, cliente e cobrança **agora**, **ao sair** ou **com saldo**.
3. No pré-pago, selecione o meio de pagamento. A venda é lançada ao liberar; minutos extras são cobrados no momento da adição.
4. No pós-pago, use **Encerrar e receber** no cartão da estação. Se o cliente não pagar no momento, escolha **Deixar pendente**; ela continuará disponível em **Caixa**.
5. Ao encerrar, o servidor solicita bloqueio e restauração. **Encerrar + reiniciar** também reinicia o PC cliente.
6. Confira no cartão da estação se a restauração foi confirmada pelo agente. Quando o tempo expira, o servidor encerra a sessão automaticamente e solicita restauração.
7. Registre vendas de produtos, serviços e impressões. Feche o caixa após conferir o valor físico em dinheiro. O fechamento é feito apenas por administradores.

**Pausar** cobre a tela; com sessão ativa o relógio e a cobrança continuam correndo. **Retomar** exige uma sessão ativa. Uma estação livre permanece bloqueada até ser liberada.

## Cliente entra sozinho com saldo

1. Em **Clientes**, edite o cadastro e informe um **login** (3 a 40 caracteres: letras, números, ponto, `_` ou `-`) e uma **senha** de pelo menos 4 caracteres. O login não pode repetir.
2. Em **Clientes > Recarregar**, informe o valor em reais e o meio de pagamento. O valor é convertido em tempo pela tarifa por hora (R$ 5,00 = 1 hora) e entra como venda no caixa.
3. Na estação bloqueada, o cliente informa login e senha e a sessão começa na hora, usando o saldo.
4. Um cadastro só pode estar em uma estação por vez. Ao encerrar, o tempo restante volta para o saldo do cliente.

O login do cliente é opcional: o atendente continua podendo liberar tempo pelo painel, cobrando antes ou depois, como nas sessões normais.

## Segurança e limites conhecidos

- A proteção depende de o cliente usar conta **sem administrador** (o instalador faz isso). Com a conta Tecnico a estação fica em manutenção normal: o agente não roda nela. Desinstalar (`LanHouseAgent.ps1 -Action Uninstall`, como Tecnico) remove as restrições.
- O agente do cliente não consegue gravar a própria pasta; a atualização automática é feita pela tarefa **LanHouseManager-Atualizador** (conta do sistema, a cada 2 minutos) e o agente reinicia sozinho com a versão nova.
- Sem contato com o servidor, a estação liberada bloqueia sozinha quando o tempo contratado acaba.
- A restauração cobre as pastas e dados listados acima. Programas instalados e arquivos salvos fora do perfil (por exemplo em outro disco) não são revertidos. Arquivos que continuarem em uso são mantidos e registrados no log.
- A impressão pelo caixa roda no serviço do servidor (conta do sistema): as impressoras precisam estar instaladas no computador do caixa de forma visível para essa conta (impressoras locais ou de rede). Conexões `\\PC\Impressora` feitas só no usuário do Windows não aparecem na lista.
- Desligar funciona por comando ao agente. Ligar usa Wake-on-LAN: exige que a placa de rede do PC suporte WOL, que esteja habilitado no BIOS e no driver do Windows, e que o "Início Rápido" do Windows esteja desligado. O servidor precisa ter aprendido o MAC da estação (basta ela ter ficado online uma vez com o agente atualizado).
- O banco local JSON atende a uma instalação pequena. Além da cópia diária em `server\data`, o servidor grava `C:\LanHouseManager-Backup\db-AAAA-MM-DD.json` (30 dias, em outro disco). Copie essa pasta de vez em quando para fora do computador do caixa (pendrive ou nuvem).

## Documentação

- `docs\TESTE-RAPIDO.md`: roteiro seguro com uma estação.
- `docs\INSTALACAO-ESTACOES.md`: instalação, verificação e diagnóstico em cada PC cliente.
- `docs\ARQUITETURA.md`: componentes e limites técnicos.
- `docs\REFERENCIA-TELAS-NEXCAFE.md`: funcionalidades observadas nas capturas.
- `docs\ANALISE-NEXCAFE.md` e `docs\ANALISE-BACKUP-20260924.md`: evidências da instalação antiga.
