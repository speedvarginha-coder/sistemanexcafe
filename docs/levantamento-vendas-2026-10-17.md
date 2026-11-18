# Levantamento de vendas da loja Speed (Nexcafe)

Gerado em 17/10/2026 a partir de `server/data/db.json` e `server/data/archive-2026-05..09.json`.
Período: 04/05/2026 a 17/10/2026 (outubro parcial, 13 dias com venda).
Base: 3.186 vendas (cobranças `sale`, `time` e `print`). Recargas de crédito (`credit`) ficaram de fora porque são pré-pagamento, não venda.
Valores em reais. Hora em horário de Brasília.

Cobertura dos dados:
- 04/05 a 30/09/2026: 2.723 vendas importadas do sistema anterior (relatório de vendas detalhado, com itens e forma de pagamento).
- 01/10 a 17/10/2026: 463 vendas lançadas direto no sistema atual.
- Não há vendas registradas antes de 04/05/2026 no sistema. Existe um backup do NexCafé (pasta `20260924_1051`, banco NexusDB compactado) que não foi importado e não é legível sem a ferramenta do NexusDB.
- Dias de segunda a sábado sem nenhuma venda: 04/06, 29/06, 07/07, 01/08, 07/09, 07/10 e 12/10. Domingo não abre.

## 1. Ticket médio

| Indicador | Valor |
|---|---|
| Faturamento total no período | R$ 37.678,29 |
| Número de vendas | 3.186 |
| Ticket médio geral | R$ 11,83 |
| Mediana | R$ 8,00 |
| Percentil 25 / 75 / 90 | R$ 3,50 / R$ 15,00 / R$ 26,10 |
| Itens (linhas) por venda | 1,89 |
| Descontos concedidos | R$ 64,25 |

Ticket por tipo de cobrança:

| Tipo | Vendas | Faturamento | Ticket |
|---|---|---|---|
| Balcão (`sale`) | 3.066 | R$ 37.210,29 | R$ 12,14 |
| Tempo de máquina (`time`) | 49 | R$ 261,00 | R$ 5,33 |
| Impressão da estação (`print`) | 71 | R$ 207,00 | R$ 2,92 |

Distribuição do valor por venda:

| Faixa | Vendas | % |
|---|---|---|
| até R$ 5 | 1.263 | 39,6% |
| R$ 5,01 a 10 | 742 | 23,3% |
| R$ 10,01 a 20 | 707 | 22,2% |
| R$ 20,01 a 50 | 413 | 13,0% |
| R$ 50,01 a 100 | 50 | 1,6% |
| acima de R$ 100 | 11 | 0,3% |

## 2. Evolução mensal

| Mês | Vendas | Faturamento | Ticket | Dias com venda | Faturamento/dia |
|---|---|---|---|---|---|
| 2026-05 | 735 | R$ 8.096,07 | R$ 11,02 | 24 | R$ 337,34 |
| 2026-06 | 517 | R$ 6.772,36 | R$ 13,10 | 24 | R$ 282,18 |
| 2026-07 | 441 | R$ 6.722,31 | R$ 15,24 | 26 | R$ 258,55 |
| 2026-08 | 508 | R$ 6.072,70 | R$ 11,95 | 25 | R$ 242,91 |
| 2026-09 | 522 | R$ 5.946,35 | R$ 11,39 | 25 | R$ 237,85 |
| 2026-10 (parcial) | 463 | R$ 4.068,50 | R$ 8,79 | 13 | R$ 312,96 |

Observação: em outubro o sistema novo passou a lançar tempo de máquina e impressão da estação como cobranças separadas e de valor baixo, o que puxa o ticket para baixo. Considerando só vendas de balcão, o ticket de outubro é R$ 10,50 (343 vendas, R$ 3.600,50).

## 3. Receita por categoria

| Categoria | Receita | % | Qtd vendida | Vendas em que aparece |
|---|---|---|---|---|
| Gráfica Rápida | R$ 20.074,95 | 53,2% | 17.000 | 3.215 |
| Lan House & Serviços Digitais | R$ 10.860,61 | 28,8% | 2.319 | 2.162 |
| Serviços Públicos | R$ 4.012,19 | 10,6% | 214 | 174 |
| Bomboniere & Bebidas (somadas as duas grafias) | R$ 1.304,40 | 3,5% | 366 | 317 |
| Serviços Financeiros | R$ 477,86 | 1,3% | 16 | 15 |
| Eletrônicos & Acessórios | R$ 455,82 | 1,2% | 16 | 16 |
| Informática & Celular | R$ 447,71 | 1,2% | 13 | 13 |
| Sem categoria / Acessórios & Cabos | R$ 71,00 | 0,2% | 55 | 12 |

## 4. Principais produtos e serviços

### Top 25 por receita

| # | Item | Categoria | Receita | % | Qtd | Vendas | Preço médio |
|---|---|---|---|---|---|---|---|
| 1 | Impressão P/B Balcão | Gráfica Rápida | R$ 6.446,58 | 17,1% | 6.422 | 1.656 | R$ 1,00 |
| 2 | Impressão Preto e Branco | Gráfica Rápida | R$ 4.474,62 | 11,9% | 7.280 | 245 | R$ 0,61 |
| 3 | Impressão Colorida | Gráfica Rápida | R$ 2.094,15 | 5,6% | 1.036 | 257 | R$ 2,02 |
| 4 | Acesso a Internet | Lan House & Serv. Digitais | R$ 1.460,30 | 3,9% | 284 | 255 | R$ 5,14 |
| 5 | Envelope Pardo | Gráfica Rápida | R$ 1.385,27 | 3,7% | 631 | 547 | R$ 2,20 |
| 6 | Currículo Novo + PDF - 5 folhas | Lan House & Serv. Digitais | R$ 1.187,99 | 3,2% | 78 | 76 | R$ 15,23 |
| 7 | Recebimento de Arquivos | Lan House & Serv. Digitais | R$ 1.179,17 | 3,1% | 1.150 | 1.101 | R$ 1,03 |
| 8 | MEU INSS Recuperação Senha | Serviços Públicos | R$ 1.075,78 | 2,9% | 33 | 32 | R$ 32,60 |
| 9 | Scanner | Gráfica Rápida | R$ 1.053,53 | 2,8% | 735 | 138 | R$ 1,43 |
| 10 | Impressão Papel Fotográfico | Gráfica Rápida | R$ 879,96 | 2,3% | 128 | 69 | R$ 6,87 |
| 11 | Impressão Papel Cartão | Gráfica Rápida | R$ 797,01 | 2,1% | 140 | 28 | R$ 5,69 |
| 12 | Currículo - 5 Folhas | Lan House & Serv. Digitais | R$ 783,02 | 2,1% | 78 | 76 | R$ 10,04 |
| 13 | Plastificação A4 | Gráfica Rápida | R$ 756,19 | 2,0% | 94 | 66 | R$ 8,04 |
| 14 | Revelação de Foto 3x4 (6 fotos) | Gráfica Rápida | R$ 714,64 | 1,9% | 48 | 41 | R$ 14,89 |
| 15 | Envio de arquivos | Lan House & Serv. Digitais | R$ 668,97 | 1,8% | 123 | 123 | R$ 5,44 |
| 16 | Contrato de Locação | Lan House & Serv. Digitais | R$ 603,00 | 1,6% | 16 | 15 | R$ 37,69 |
| 17 | Impressão Papel Adesivo | Gráfica Rápida | R$ 593,72 | 1,6% | 75 | 24 | R$ 7,92 |
| 18 | Detran CRLV Digital | Serviços Públicos | R$ 560,08 | 1,5% | 37 | 30 | R$ 15,14 |
| 19 | Suporte ao Cliente | Lan House & Serv. Digitais | R$ 531,31 | 1,4% | 167 | 166 | R$ 3,18 |
| 20 | Consulta SPC Boa Vista Acerta | Serviços Financeiros | R$ 477,86 | 1,3% | 16 | 15 | R$ 29,87 |
| 21 | Plastificação Identidade | Gráfica Rápida | R$ 438,08 | 1,2% | 85 | 57 | R$ 5,15 |
| 22 | Manutenção Celular Simples | Informática & Celular | R$ 388,79 | 1,0% | 11 | 11 | R$ 35,34 |
| 23 | Digitação | Lan House & Serv. Digitais | R$ 372,40 | 1,0% | 33 | 28 | R$ 11,28 |
| 24 | Detran IPVA | Serviços Públicos | R$ 330,43 | 0,9% | 20 | 19 | R$ 16,52 |
| 25 | Transferência Complexa | Lan House & Serv. Digitais | R$ 315,00 | 0,8% | 14 | 9 | R$ 22,50 |

Somando as duas linhas de impressão P&B (itens 1 e 2): R$ 10.921,20, 29% da receita. O item 2 tem preço médio de R$ 0,61, o que indica venda em volume com preço reduzido.

### Top 15 por frequência (vendas em que o item aparece)

| Item | Vendas | Receita |
|---|---|---|
| Impressão P/B Balcão | 1.656 | R$ 6.446,58 |
| Recebimento de Arquivos | 1.101 | R$ 1.179,17 |
| Envelope Pardo | 547 | R$ 1.385,27 |
| Impressão Colorida | 257 | R$ 2.094,15 |
| Acesso a Internet | 255 | R$ 1.460,30 |
| Impressão Preto e Branco | 245 | R$ 4.474,62 |
| Suporte ao Cliente | 166 | R$ 531,31 |
| Scanner | 138 | R$ 1.053,53 |
| Envio de arquivos | 123 | R$ 668,97 |
| Currículo - 5 Folhas | 76 | R$ 783,02 |
| Currículo Novo + PDF - 5 folhas | 76 | R$ 1.187,99 |
| Impressão Papel Fotográfico | 69 | R$ 879,96 |
| Plastificação A4 | 66 | R$ 756,19 |
| Água com gás 500ml | 65 | R$ 289,81 |
| Água sem gás 500ml | 61 | R$ 211,40 |

### Top 10 bomboniere e bebidas

| Item | Receita | Qtd |
|---|---|---|
| Água com gás 500ml | R$ 289,81 | 67 |
| Pé de moleque | R$ 217,56 | 57 |
| Água sem gás 500ml | R$ 211,40 | 66 |
| Coca lata 350ml | R$ 76,01 | 14 |
| Trident Fresh Intense | R$ 72,78 | 15 |
| Coca Pet 200ml | R$ 67,92 | 19 |
| Doce de Banana | R$ 48,19 | 20 |
| Coca-Cola Pet Zero 200ml | R$ 42,01 | 12 |
| Paçoquinha 14g Piranguinho | R$ 39,03 | 39 |
| Halls Menta | R$ 37,24 | 10 |

## 5. Meios de pagamento

| Meio | Valor | % |
|---|---|---|
| Dinheiro | R$ 15.586,61 | 41,4% |
| Pix | R$ 11.414,81 | 30,3% |
| Débito | R$ 7.915,98 | 21,0% |
| Crédito | R$ 2.725,89 | 7,2% |

## 6. Dia da semana e horário

| Dia | Vendas | Faturamento | Ticket |
|---|---|---|---|
| Segunda | 560 | R$ 6.638,81 | R$ 11,86 |
| Terça | 614 | R$ 6.931,79 | R$ 11,29 |
| Quarta | 547 | R$ 6.292,58 | R$ 11,50 |
| Quinta | 587 | R$ 6.777,35 | R$ 11,55 |
| Sexta | 638 | R$ 8.027,66 | R$ 12,58 |
| Sábado | 240 | R$ 3.010,10 | R$ 12,54 |

Domingo sem vendas. Pico de movimento entre 10h e 12h (10h: 479 vendas, 11h: 428). Movimento constante entre 13h e 17h (320 a 370 vendas por faixa) e quase nenhum após 18h.

## 7. Leituras principais

- A loja vive de ticket baixo e alto volume: 63% das vendas ficam em até R$ 10.
- Gráfica Rápida responde por mais da metade da receita, puxada por impressão P&B.
- Os serviços de maior valor unitário (Contrato de Locação R$ 37,69, Manutenção de Celular R$ 35,34, MEU INSS R$ 32,60, Consulta SPC R$ 29,87, Transferência Complexa R$ 22,50) aparecem em poucas vendas e são o principal caminho para subir o ticket.
- Itens de entrada muito frequentes (Recebimento de Arquivos, Envelope Pardo, Suporte ao Cliente) são bons pontos para venda adicional.
- Faturamento por dia caiu de R$ 337 em maio para R$ 238 em setembro; outubro parcial voltou a R$ 313.
- Há duplicidade de cadastro a revisar: "Bomboniere & Bebidas" x "Bebidas & Bomboniere", "Impressão P/B Balcão" x "Impressão Preto e Branco", "Currículo - 5 Folhas" x "Currículo Novo + PDF - 5 folhas", e 11 vendas com itens sem categoria.
