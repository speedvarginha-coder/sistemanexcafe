# Instalação das estações

Instale primeiro em **uma estação de teste**. Depois de validar o ciclo completo, repita nas demais. O servidor e o caixa devem permanecer ligados durante a instalação.

## Preparar o servidor

1. No computador do caixa, execute `Verificar.bat`. Confirme que a sintaxe e os testes passaram.
2. Inicie o servidor com `server\Start-Servidor.bat` ou instale as tarefas de inicialização com `server\Instalar-Servico.bat` como administrador.
3. Entre no painel como administrador. Confira tarifas e a impressora compartilhada em **Tarifas**.
4. Em **Atendimento**, clique **Baixar pacote das estações**. O arquivo `LanHouseManager-Estacoes.zip` contém o agente, os comandos de instalação e uma configuração nova para este servidor.
5. Guarde o ZIP apenas na rede interna. Ele contém uma chave que permite cadastrar estações. Se a chave for regenerada no painel, baixe outro pacote.

## Instalar em cada PC cliente

1. Confirme que o PC usa Windows 10, acessa o servidor pela rede local e tem um usuário **cliente sem privilégios de administrador**.
2. Entre uma vez no usuário cliente. Prepare Desktop e Downloads no estado que deve reaparecer após cada atendimento.
3. Extraia **todos** os arquivos do ZIP em uma pasta local. Não execute o instalador de dentro do arquivo compactado.
4. Execute `Instalar-Agente.bat`. Informe o número da estação (por exemplo, 11) ou pressione Enter para usar o nome do computador. Aceite a elevação de administrador e informe o usuário cliente se o instalador pedir. O instalador valida a configuração e o cadastro no servidor. Se houver erro, a janela mostra a causa e o `.bat` informa falha.
5. Execute `Capturar-Padrao.bat` como administrador para salvar o padrão das pastas protegidas.
6. Reinicie o PC e entre no usuário cliente. O agente inicia no login desse usuário.
7. Execute `Verificar-Agente.bat`. Confira o servidor, usuário protegido, última captura e inicialização automática. No painel, a estação deve aparecer online e disponível para liberação, com a tela do cliente bloqueada.
8. No usuário cliente, confira se `HP432` e `EPSON4260` aparecem como impressoras, quando incluídas no pacote. A conexão por computador é aplicada ao entrar no Windows. Se o Windows solicitar driver, instale um driver assinado como administrador e entre novamente no perfil cliente.

Se você informar um número, o painel mostra `Máquina 11` com ID `maquina-11`. Se deixar em branco, o cadastro usa o nome do computador como ID.

Não use o `INSTALAR.bat` antigo na raiz do pen drive. Ele contém configuração fixa de perfil e comandos de manutenção desatualizados. Extraia o ZIP novo em uma pasta limpa e use apenas os arquivos desse pacote. A instalação normal não precisa criar exclusões no Windows Defender.

## Teste obrigatório na primeira estação

1. Abra o caixa. Libere 15 minutos na estação de teste e aguarde o estado **Em uso**. O estado **Liberando** indica que o servidor ainda espera confirmação do agente.
2. Crie um arquivo de teste em Downloads. Encerre a sessão e confirme que a tela bloqueou, a limpeza terminou e o arquivo foi removido.
3. Teste uma sessão pré-paga, outra pós-paga com **Encerrar e receber**, uma venda de produto e uma impressão.
4. Teste o login do cliente por saldo, se a loja usar esse recurso.
5. Teste desligar pelo painel. Para ligar por Wake-on-LAN, habilite o recurso no BIOS e no driver da placa de rede. O servidor precisa ter recebido o MAC da estação ao menos uma vez.

## Se a estação não aparecer pronta

- **Offline:** confirme o IP fixo do servidor, a rede local e se o usuário cliente está logado. Execute `Verificar-Agente.bat` nesse usuário.
- **Preparando:** aguarde a confirmação de restauração. Se persistir, consulte `%LOCALAPPDATA%\LanHouseManagerAgent\Logs\agent.log` no usuário cliente.
- **Sem MAC para ligar:** ligue o PC manualmente uma vez, entre no usuário cliente e espere o agente conectar.
- **Configuração inválida ou chave recusada:** baixe um novo ZIP no painel e reinstale. Não reutilize um `install-config.json` antigo.
- **Usuário protegido incorreto:** reinstale escolhendo o perfil Windows correto. Esta versão protege um perfil cliente por estação.

Para remover a inicialização automática, execute `powershell -ExecutionPolicy Bypass -File C:\LanHouseManagerAgent\LanHouseAgent.ps1 -Action Uninstall` como administrador. Os arquivos locais são mantidos para permitir diagnóstico e recuperação.
