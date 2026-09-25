# Referencia funcional das telas do NexAdmin

Fonte: nove capturas fornecidas pelo usuario em 24/09/2026. Este documento registra apenas elementos visiveis. Nomes, e-mail e historico de pessoas nao foram transcritos. Precos e saldos citados sao exemplos da captura, nao regras atuais da loja.

## 1. Atendimento

- Area principal em grade, com uma celula por maquina, numero e estado como `Livre`.
- Acoes visiveis: ligar, desligar, reiniciar, desbloquear, capturar, processos e controle remoto.
- Acoes comerciais rapidas: venda avulsa de tempo e venda avulsa de produto.
- Painel lateral persistente: chat/mensagens e impressoes pendentes ou registradas, com liberar/cancelar.
- Os identificadores exibidos na grade nao comprovam quantas estacoes estao ativas hoje. O usuario informou oito estacoes para o projeto proprio.

## 2. Clientes

- Tabela pesquisavel com nome, username, codigo, status, tipo, debito, credito de tempo, credito de valor, promocao e tempo usado; ha tambem campos cadastrais.
- Barra de acoes para cadastrar/editar/excluir, senha, tempo, debito e fidelidade.
- Implicacao: separar cadastro de cliente de sessao da maquina. Permitir uso avulso sem cadastro, se a loja desejar.

## 3. Produtos

- Catalogo pesquisavel por codigo ou descricao.
- Colunas de descricao, codigo, estoque, preco, categoria, unidade, fornecedor e estoque minimo.
- Entrada e saida de estoque na barra de acoes.
- A captura mostra alguns saldos negativos; isso evidencia a necessidade de regras explicitas para venda sem estoque e ajuste auditavel.

## 4. Caixa

- Abas de caixa atual e caixas anteriores.
- Fechar caixa, ver total, adicionar/retirar dinheiro, transacoes, contador de cedulas e recibo.
- Grade com maquina, data/hora, tipo, descricao, cliente, valor, desconto, total final, valor pago, pagamento, debito e funcionario.
- Tipos visiveis: inicio de sessao, fim de sessao e impressao.
- Implicacao: registrar eventos de uso e lancamentos financeiros separadamente, com autoria e cancelamentos auditaveis.

## 5. Opcoes

- Grupos visiveis: Geral; Maquinas Clientes; Restricoes do Windows; Recibos; Tarifacao; Avisos de Fim de Tempo; Cores; Caixa; Fidelidade; Fundo de Tela e Posicao de Login; Meios de Pagamento.
- A captura mostra as secoes fechadas; nao permite inferir valores internos.

## 6. Impressoes

- Controle de impressoes feitas nas maquinas clientes e, opcionalmente, no servidor e por funcionarios.
- Tarifas por tipo, incluindo preto e branco e colorida, vinculadas a impressoras.
- Opcao de impressora virtual NexCafe nas maquinas clientes.
- Fila lateral de trabalhos pendentes/registrados com liberar/cancelar.
- Confirmacao do trabalho pelo cliente marcada na captura; confirmacao pelo atendente aparece como opcao separada.
- Revisao antes da impressao aparece como recurso Premium desabilitado; nao assumir disponibilidade na loja.

## 7. Tarifas

- Tarifa padrao com faixas por duracao. A captura mostra 1h = R$ 5,00, 2h = R$ 10,00 e 3h = R$ 15,00; sao valores de referencia historica.
- Existem abas/opcoes para tarifas por dia e horario e grupos de tarifas (descontos, maquinas especiais e tipo de acesso).
- Implicacao: modelo de precificacao configuravel, sem valores codificados no programa.

## 8. Usuarios

- Lista de funcionarios/operadores e perfil administrativo.
- Acoes de adicionar, editar e apagar usuario.
- Implicacao: login no painel e permissoes por funcao, com registro de quem liberou maquina ou movimentou caixa.

## 9. Estatisticas

- Periodo selecionavel.
- Analises de tempo por maquina, horario, funcionario, cliente, cliente gratis e duracao de acesso.
- Analise de vendas por categoria, produto e funcionario.
- Implicacao: relatorios devem derivar de sessoes e lancamentos historicos, nao apenas do estado atual das maquinas.

## Prioridade para o LanHouseManager

1. Autenticacao de atendente e identidade de agente; estado real da estacao e confirmacao dos comandos.
2. Tarifa configuravel, venda de tempo e caixa com trilha de auditoria.
3. Clientes e pre-pago opcionais; produtos e estoque.
4. Fila de impressoes com confirmacao e cobranca; relatorios operacionais.

As capturas descrevem comportamento visivel do NexAdmin. Elas nao especificam protocolo interno, esquema dos arquivos `.nx1` nem mecanismo de protecao do Windows.
