# Teste em uma estação

Antes de tocar em hardware, rode `Verificar.bat` (ou `npm run verify`) na raiz: ele valida a sintaxe, roda os testes automatizados e só então sobe o servidor.

1. No servidor, execute `server\Start-Servidor.bat` e abra `http://localhost:4780`.
2. Crie o administrador, entre no painel e ajuste **Tarifas**. Abra o caixa com R$ 0,00 para o teste.
3. Em **Atendimento**, baixe o pacote ZIP das estações e extraia todos os arquivos no PC cliente Windows 10.
4. Prepare o perfil Windows `Cliente` e execute `Instalar-Agente.bat` como administrador. O pacote contém IP e chave atuais do servidor.
5. Execute `Capturar-Padrao.bat` como administrador. Reinicie, entre como `Cliente` e execute `Verificar-Agente.bat`.
6. Confira que `PC 01` está online e bloqueado. Libere 5 minutos em modo **depois do uso**.
7. Crie um arquivo de teste em Downloads. Encerre pelo painel e confira bloqueio, remoção do arquivo e confirmação de restauração.
8. No cartão da estação, use **Encerrar e receber**. Faça uma venda antecipada e verifique que o encerramento não gera segunda cobrança.
9. Teste **Encerrar + reiniciar**. Confira o reinício, o retorno do agente e o padrão do Desktop/Downloads.

## Conferir as melhorias recentes

10. **Fechar caixa é só do admin**: em **Usuários**, crie um atendente, entre como ele e abra o caixa. O botão "Fechar caixa" deve ficar desabilitado. Como admin, ele funciona.
11. **Origem obrigatória (CSRF)**: já coberto pelos testes (`exige origem nas mutacoes`). Para conferir na mão, abra o painel e tente um POST de fora do navegador sem o header `Origin`; deve retornar 403.
12. **Arquivamento mensal**: com dados de mais de 45 dias no `db.json`, reinicie o servidor e veja surgir `server\data\archive-YYYY-MM.json`; o `db.json` deve ficar só com registros recentes. O relatório diário de uma data antiga continua lendo esses arquivos.
13. **Expiração por timer**: deixe uma sessão aberta e feche o painel; ao fim do tempo o servidor deve encerrar e solicitar restauração mesmo sem ninguém usando a tela.
14. **Polling com backoff**: desligue o servidor com o painel aberto; a mensagem de status muda e, ao religar, o painel volta a atualizar sem intervenção.

Se a estação não confirmar restauração, verifique `%LOCALAPPDATA%\LanHouseManagerAgent\Logs\agent.log` no usuário `Cliente`. A proteção deve ser validada com os aplicativos reais da loja antes de instalar nas outras sete máquinas.
