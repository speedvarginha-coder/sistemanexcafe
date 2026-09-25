# Analise estatica da instalacao NexCafe

Origem observada: `C:\nexcafe` em 24/09/2026. A analise foi somente de leitura. Nao foram executados programas da instalacao nem abertos registros de clientes, senhas ou pagamentos.

## O que foi confirmado

| Evidencia local | Conclusao sustentada |
| --- | --- |
| `NexAdmin.exe`, descricao "Administrador NexCafe", versao 5.0.0.217 | Ha um aplicativo de administracao separado. |
| `NexServ.exe`, descricao "Servidor NexCafe", versao 5.0.0.211 | Ha um servidor separado do administrador. |
| Texto `NexusDB` nos dois executaveis e cabecalho `NX!2` em `Dados\Maquina.nx1` | Os dados usam formato NexusDB/NX1. |
| 66 arquivos `.nx1` em `Dados` | Os dados sao separados por entidades. Os nomes incluem `Maquina`, `Sessao`, `Tempo`, `Tarifa`, `Caixa`, `Produto`, `Cliente`, `Usuario`, `Pacote`, `Passaporte` e `Impressao`. |
| `guardis.exe`, `wguard.exe`, `nexap.exe`, `nexguard.ini` | Existem componentes adicionais associados a protecao/agente. A funcao exata de cada executavel nao foi confirmada. |
| `novapv.exe`, `guardprintapi.dll`, `print\pend` | Ha componentes e fila de impressao. |
| `prepagobarras.fr3` em XML, com titulo "CARTAO DE ACESSO PRE-PAGO", campos `Valor` e `Minutos` e codigo de barras Code39 | Ha um modelo de impressao de cartao pre-pago. |
| `Shell\User\Desktop` e `Shell\Common\Desktop` com atalhos | A instalacao guarda atalhos de um ambiente de cliente. |
| Chaves em `NexAdmin.ini` e `nexguard.ini` para servidor/ultimo servidor | Administrador e componente guardiao possuem configuracao de conexao ao servidor. Valores nao foram incluidos nesta analise. |

## O que os nomes sugerem, sem comprovar comportamento

Os arquivos `MovEst.nx1`, `FilaImp.nx1`, `FiltroWeb.nx1`, `Chat.nx1`, `Biometria.nx1` e `Espera.nx1` sugerem modulos de estoque, impressao, filtragem, mensagens, biometria e espera. A existencia de um arquivo nao demonstra que o modulo esteja ativo na loja nem revela suas regras.

Esta analise nao determinou o protocolo entre servidor e estacoes, a logica de cobranca, o comportamento exato do bloqueio, nem qualquer mecanismo de restauracao integral do Windows. Isso exigiria observacao controlada em uma maquina de teste, com o sistema comercial em funcionamento e sem modificar sua instalacao.

## Comparacao com LanHouseManager

| Area | Estado atual do projeto | Proxima melhoria util |
| --- | --- | --- |
| Controle das maquinas | Painel, sessoes por tempo, bloquear, liberar e encerrar | Registrar confirmacao de cada comando e estado real do agente. |
| Acesso do atendente | Painel e API sem autenticacao | Login com senha, perfis e registro de operacoes. |
| Agente cliente | Consulta HTTP a cada dois segundos | Identidade propria por estacao e reconexao segura. |
| Bloqueio | Janela em tela cheia no usuario conectado | Validar resistencia e recuperacao em Windows 10; definir politica para perda de rede. |
| Restauracao | Reposicao de Desktop/Downloads e limpeza de caches | Testar com arquivos abertos; considerar perfil descartavel ou recurso de restauracao de disco independente. |
| Caixa e precos | Ausentes | Tarifas, venda de tempo, recebimentos e fechamento diario. |
| Clientes e pre-pago | Ausentes | Cadastro opcional, credito e historico, com consentimento e controle de acesso. |
| Impressao | Ausente | Fila, preco por pagina e confirmacao antes da cobranca. |

## Ordem recomendada

1. Proteger o servidor e identificar cada agente. A API atual aceita comandos sem autenticacao na rede local.
2. Validar o ciclo completo em uma unica estacao Windows 10: liberar, expirar, bloquear, restaurar e reiniciar. Registrar falhas e confirmacoes no painel.
3. Implementar tarifas, vendas de tempo e fechamento de caixa com historico auditavel.
4. Adicionar cadastro/pre-pago e impressao somente apos estabilizar os itens anteriores.

Para aproveitar dados antigos, preferir exportacao pelo proprio NexCafe para CSV ou formato documentado. Nao importar registros diretamente de arquivos `.nx1` sem validar esquema, integridade e permissao para tratar dados pessoais.

Uma copia separada de dados, fornecida depois, foi analisada em `ANALISE-BACKUP-20260924.md`.
