# Auditoria do Nexcafe — 26/09/2026

## Escopo e verificação

Revisão do servidor Node, painel, agente Windows, instaladores, documentação, testes e estado local de `server/data`, sem alterar os dados de produção. A auditoria considera a árvore de trabalho atual, que contém mudanças ainda não confirmadas no Git. `npm run verify` passou com 35 testes. Os testes de estação são simulações; não comprovam impressão física nem a limpeza do perfil Windows em uso real.

**Decisão:** não instalar nas demais estações até concluir os itens críticos e validar uma estação piloto de ponta a ponta. A máquina 11 está comunicando com o servidor, bloqueada, sem sessão e sem restauração pendente no banco local. Seu ID persistido é `tempname`, apesar do nome exibido “Máquina 11”; a documentação prevê `maquina-11` quando se informa 11 na instalação.

## Achados por prioridade

### Críticos

1. **Limpeza pode ser confirmada com dados do cliente ainda presentes.** Em `client-agent/LanHouseAgent.ps1:314-343`, se a renomeação da pasta falha, `Sync-FolderContent` mantém itens travados e registra só um aviso. `Invoke-AgentRestore` ainda termina normalmente (`:513-542`), e o agente confirma `restoreSeq` ao servidor (`:1786-1800`). A próxima liberação aceita a estação (`server/app.js:1115-1118`). Corrigir para falhar a restauração quando sobrar qualquer item do usuário anterior, manter a máquina indisponível e tentar novamente após reinício. Testar com arquivos bloqueados de navegador e WhatsApp.

2. **O bloqueio depende de um processo iniciado no login do usuário.** A inicialização está em `client-agent/LanHouseAgent.ps1:786-790`; a tarefa SYSTEM em `:1461-1507` atualiza o arquivo, mas não verifica nem reinicia o processo `Run` do usuário. As restrições aplicadas em `:1331-1351` são políticas de interface, não um supervisor do agente. Se o agente não iniciar ou morrer, a tela de bloqueio e a confirmação de limpeza deixam de funcionar. Implementar detecção e recuperação confiável no contexto da sessão interativa; testar queda forçada do agente e login após reinício antes de usar com clientes.

3. **Chave de API aparentemente real no diretório servido pelo painel.** `server/public/marketing/speedgeo/config.json:4` contém um valor não fictício; a validade da chave não foi testada. `/marketing` exige administrador (`server/app.js:1919-1943`), portanto não se confirmou acesso anônimo, mas a rota permite baixar arquivos JSON para qualquer administrador e a pasta está não rastreada, sem regra específica no `.gitignore`. Remover a chave do diretório distribuído, colocá-la em configuração privada e substituí-la no provedor. Não incluir o valor em logs, relatório ou commit.

### Altos

4. **Backup incompleto entre duas cópias diárias.** `server/app.js:252-284` copia o banco antigo apenas na primeira gravação do dia. Anexos adicionados depois ficam sem cópia até o dia seguinte; anexos modificados não são substituídos no destino (`:264-269`). O arquivamento é feito depois dessa cópia (`:279-281`). `C:\LanHouseManager-Backup` fica no mesmo computador e `server/backup-drive.bat` não está agendado por `server/Instalar-Servico.ps1`. Fazer backup consistente do banco, chave e anexos após a gravação, agendar a cópia externa e verificar uma restauração completa.

5. **Arquivamento pode perder histórico se uma escrita falhar.** `server/app.js:215-241` remove registros antigos da memória antes de gravar o arquivo mensal. Se a escrita/renomeação do arquivo falhar e depois ocorrer outra gravação do banco, o processo já não tem esses registros. Um arquivo mensal inválido é tratado como `{}` e pode ser sobrescrito. Arquivar primeiro em arquivo íntegro, só então retirar registros do banco; nunca sobrescrever arquivo corrompido sem cópia de recuperação.

6. **Impressão em curso e encerramento da sessão concorrem.** `server/app.js:966-990` verifica a sessão antes de aguardar o corpo e o executor de impressão; ao final, cria a cobrança usando o ID antigo, sem conferir se a sessão ainda está aberta. `:1234-1240` encerra e recebe apenas as cobranças existentes naquele instante. Isso permite uma impressão cobrada depois do fechamento da conta; se a sessão acabar durante o upload, há acesso a `item.session.id` depois do `await`. Serializar o fechamento com trabalhos em curso ou bloquear o encerramento até resolver a impressão. Testar o intervalo exato com executor de impressão controlado.

7. **O teste de impressão confirma aceitação pela fila, não saída no papel.** `server/print-pdf.ps1:80-110` usa `PrintDocument.Print()`; o servidor registra cobrança ao receber sucesso (`server/app.js:979-991`). Sem confirmação da impressora, papel ausente ou falha posterior na fila podem exigir estorno manual. Deixar isso explícito na operação e, se a regra de negócio for cobrar somente após entrega, criar confirmação física/reconciliação.

### Médios

8. **Resultado anual exclui receitas extras.** O cálculo mensal inclui `db.incomes` (`server/app.js:630-634`), mas o consolidado anual só soma vendas, taxas, custos e despesas (`:636-642`). Assim, o resultado anual não bate com a soma dos meses quando há comissões ou outras receitas. Somar receitas extras no consolidado anual e cobrir com teste.

9. **Pacote de implantação ainda não é reproduzível.** Há alterações locais extensas e `server/public/marketing/` (210 arquivos) está fora do Git. Uma cópia baseada apenas no commit atual não inclui o painel de marketing nem as mudanças recentes. Separar segredos e dados, revisar os arquivos de distribuição, criar uma versão fechada e executar o mesmo pacote na estação piloto antes de replicar.

10. **Identidade da máquina 11 diverge do procedimento documentado.** O registro atual usa ID `tempname` e nome “Máquina 11”; `docs/INSTALACAO-ESTACOES.md:24` orienta que o número 11 cria ID `maquina-11`. Não renomear automaticamente uma estação ativa. Na próxima reinstalação, conferir o ID do pacote e o vínculo do agente para evitar cadastro duplicado ou perda de comandos.

## O que já está correto

- A tela de marketing tem verificação de administrador antes de servir arquivos (`server/app.js:1919-1922`).
- O início de sessão impede máquina offline, em manutenção ou com restauração pendente (`server/app.js:1115-1119`).
- O tempo livre inicia em zero, cobra ao encerrar, e a tabela local registra mínimo de R$ 3,00 até 15 minutos e R$ 5,00 em 60 minutos (`server/app.js:27-37`, `:1120-1143`).
- Vendas no balcão exigem caixa aberto, validam pagamentos e têm referência para evitar duplicidade (`server/app.js:1337-1406`). A venda permite estoque negativo por decisão atual do produto.

## Critério para expansão

Corrigir os achados críticos e altos; executar restauração completa de backup em diretório isolado; fazer na máquina 11 uma sessão de teste com arquivo em Downloads, navegador aberto, impressão real, encerramento, limpeza confirmada, reinício e retorno do agente; validar fechamento de caixa e relatórios. Só depois repetir o pacote versionado nas demais máquinas.
