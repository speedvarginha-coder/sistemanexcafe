# Analise da copia de dados 20260924_1051

Origem: `D:\Sistema NexCafe\20260924_1051`, observada em 24/09/2026. A pasta foi lida sem alteracoes. Nenhum registro individual de cliente, pagamento, senha ou impressao foi extraido ou incluido neste documento.

## Identificacao

- A pasta contem 67 arquivos `.nx1` e um `nxTrans.cfg`.
- Todos os 67 arquivos `.nx1` comecam com o cabecalho `NX!2` e seus tamanhos sao multiplos de 4096 bytes, coerentes com arquivos de dados do NexusDB presentes na instalacao NexCafe.
- Tamanho agregado dos `.nx1`: 26.501.120 bytes, aproximadamente 25,3 MiB.
- Trata-se de uma copia de dados, nao de codigo-fonte nem de um projeto que possa ser executado sozinho.

## Areas com mais dados em disco

| Arquivo | Tamanho | Relacao funcional provavel |
| --- | ---: | --- |
| `ITran.nx1` | 6.488.064 bytes | Itens de transacao (inferencia pelo nome). |
| `Tran.nx1` | 5.316.608 bytes | Transacoes; a tela Caixa exibe lancamentos por sessao e impressao. |
| `MovEst.nx1` | 4.550.656 bytes | Movimentos de estoque; a tela Produtos exibe entrada e saida. |
| `FilaImp.nx1` | 2.387.968 bytes | Fila de impressao; vista no painel lateral. |
| `Sessao.nx1` | 2.207.744 bytes | Sessoes de uso das maquinas. |
| `Impressao.nx1` | 2.072.576 bytes | Trabalhos/historico de impressao. |
| `Ocupacao.nx1` | 991.232 bytes | Ocupacao/uso das maquinas (inferencia pelo nome). |
| `Log.nx1` | 720.896 bytes | Registros de eventos (inferencia pelo nome). |

O tamanho de um arquivo nao informa a quantidade de registros ativos: pode incluir espaco livre, indices e registros antigos.

## Diferencas da instalacao

Em `C:\nexcafe\Dados` ha 66 arquivos `.nx1`, somando 1.626.112 bytes. A copia em `D:` possui 67 arquivos e e substancialmente maior. Apenas na copia aparecem `ContaPagar.nx1`, `OS.nx1`, `OSHistorico.nx1`, `OSItens.nx1` e `Servico.nx1`. Apenas na pasta da instalacao aparecem quatro arquivos internos com prefixo `$SQL$` (funcoes, procedimentos, gatilhos e visoes). Isso sugere origens ou momentos diferentes do banco; nao comprova diferenca de versao do programa.

## O que isso esclarece para o LanHouseManager

- Sessao de maquina, lancamento financeiro, item de venda, movimento de estoque e trabalho de impressao devem ser entidades distintas, ligadas por identificadores. O volume e as telas reforcam essa separacao.
- O caixa precisa de historico de transacoes, nao apenas do saldo atual.
- A impressao e parte importante do fluxo da loja: fila, confirmacao, tarifacao e registro financeiro.
- Uma futura migracao exige exportacao suportada ou leitura documentada do NexusDB, com esquema validado e preservacao de integridade. Nomes de arquivo e tamanho nao bastam para importar dados com seguranca.

## Limite da analise

Nao foram lidos campos, linhas, relacoes, indices ou contagens de registros do banco. Os nomes dos arquivos e os prints permitem inferir modulos, mas nao suas regras internas. A copia nao demonstra como o agente bloqueia as estacoes nem se ha congelamento de disco.
