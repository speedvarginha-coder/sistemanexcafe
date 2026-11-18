# Histórico de vendas recuperado do NexCafé (dez/2022 a set/2026)

Gerado em 17/10/2026 a partir do backup `D:\Sistema Nexcafe\20260924_1051` (banco NexusDB do NexCafé). O backup só foi lido; nada foi alterado nele, no `db.json` ou no sistema. Nada foi importado.

Arquivos extraídos em `D:\Sistema Nexcafe\_nexcafe_extraido\`: `transacoes.csv` (36.614), `itens-vendidos.csv` (29.625), `produtos.csv` (302), `caixas.csv` (332), `resumo-mensal.csv`, `resumo.json` e os scripts de leitura em `scripts\`.

## Como foi lido e conferido

- Tabelas usadas: `Tran` (cabeçalho de cada lançamento), `MovEst` (itens de produto e serviço), `Produto` e `Caixa`.
- Conferência: a soma do valor pago das transações de cada caixa bate exatamente com o total de fechamento do caixa em 331 de 331 caixas fechados. O caixa 332, aberto em 26/11/2024, nunca foi fechado e vai até o fim do backup.
- Faturamento = valor líquido dos lançamentos de sessão de máquina, venda de balcão e impressão da estação, sem cancelados.
- Recargas de tempo (crédito pré-pago) ficaram fora da receita. Aparecem numa coluna à parte.
- Forma de pagamento não foi registrada no NexCafé (tabela de espécies vazia), por isso não há divisão por dinheiro, Pix ou cartão.
- A soma dos itens de balcão (R$ 74.014,63 de dez/2022 a ago/2023) fica próxima do total de vendas de balcão do período (R$ 73.826,08). A diferença vem de descontos.

## Período coberto

- Primeiro lançamento: 29/12/2022. Último: 24/09/2026 (data do backup).
- Meses sem nenhum lançamento na cópia principal: set/2023 a dez/2023 e dez/2024 a fev/2025. Mar/2025 tem só 4 dias. De 12/08 a 20/10/2023 o valor por caixa foi recuperado de uma cópia do Google Drive (ver abaixo).
- Horário: o NexCafé grava a hora local, sem fuso.

O histórico tem duas fases bem diferentes:

| Fase | Meses | Vendas | Faturamento | Ticket | Dias com venda | Por dia | Sessões | Balcão | Impressão da estação | Recargas (fora) |
|---|---|---|---|---|---|---|---|---|---|---|
| Dez/2022 a ago/2023: NexCafé usado para tudo | 9 | 17.664 | R$ 87.240,48 | R$ 4,94 | 187 | R$ 466,53 | R$ 11.083,90 | R$ 73.826,08 | R$ 2.330,50 | R$ 1.217,50 |
| Jan/2024 a set/2026: só lan house | 30 | 8.987 | R$ 42.751,99 | R$ 4,76 | 675 | R$ 63,34 | R$ 31.686,83 | R$ 3.437,16 | R$ 7.628,00 | R$ 1.715,60 |
| Total | 39 | 26.651 | R$ 129.992,47 | R$ 4,88 | 862 | R$ 150,80 | R$ 42.770,73 | R$ 77.263,24 | R$ 9.958,50 | R$ 2.933,10 |

A partir de 2024 o NexCafé passou a registrar quase só o tempo de máquina e as impressões das estações. As vendas de balcão quase somem dele (de R$ 10 mil para menos de R$ 200 por mês). O balcão desse período (jan/2024 a abr/2026) não está nem no NexCafé nem no sistema atual; deve ter sido lançado em outro programa ou não foi registrado.

## Mês a mês

| Mês | Vendas | Faturamento | Ticket | Dias | Por dia | Sessões | Balcão | Impressões | Recargas (fora) |
|---|---|---|---|---|---|---|---|---|---|
| 2022-12 | 214 | R$ 872,64 | R$ 4,08 | 3 | R$ 290,88 | R$ 89,05 | R$ 760,59 | R$ 23,00 | R$ 34,00 |
| 2023-01 | 2654 | R$ 11.799,02 | R$ 4,45 | 26 | R$ 453,81 | R$ 1.362,57 | R$ 10.159,45 | R$ 277,00 | R$ 47,00 |
| 2023-02 | 2320 | R$ 11.266,95 | R$ 4,86 | 22 | R$ 512,13 | R$ 1.733,64 | R$ 9.057,31 | R$ 476,00 | R$ 105,00 |
| 2023-03 | 2367 | R$ 12.776,26 | R$ 5,40 | 27 | R$ 473,19 | R$ 1.781,56 | R$ 10.629,45 | R$ 365,25 | R$ 102,90 |
| 2023-04 | 2118 | R$ 10.545,13 | R$ 4,98 | 24 | R$ 439,38 | R$ 1.380,16 | R$ 8.888,97 | R$ 276,00 | R$ 121,90 |
| 2023-05 | 2385 | R$ 12.136,82 | R$ 5,09 | 25 | R$ 485,47 | R$ 1.683,04 | R$ 10.192,78 | R$ 261,00 | R$ 248,50 |
| 2023-06 | 2338 | R$ 11.206,80 | R$ 4,79 | 25 | R$ 448,27 | R$ 1.206,78 | R$ 9.811,02 | R$ 189,00 | R$ 224,90 |
| 2023-07 | 2404 | R$ 12.022,32 | R$ 5,00 | 25 | R$ 480,89 | R$ 1.358,55 | R$ 10.327,27 | R$ 336,50 | R$ 266,30 |
| 2023-08 | 864 | R$ 4.614,54 | R$ 5,34 | 10 | R$ 461,45 | R$ 488,55 | R$ 3.999,24 | R$ 126,75 | R$ 67,00 |
| 2024-01 | 532 | R$ 2.403,31 | R$ 4,52 | 15 | R$ 160,22 | R$ 569,79 | R$ 1.709,02 | R$ 124,50 | R$ 52,50 |
| 2024-02 | 356 | R$ 1.073,35 | R$ 3,02 | 23 | R$ 46,67 | R$ 783,85 | R$ 48,00 | R$ 241,50 | R$ 85,00 |
| 2024-03 | 428 | R$ 1.464,80 | R$ 3,42 | 23 | R$ 63,69 | R$ 1.052,05 | R$ 100,75 | R$ 312,00 | R$ 199,00 |
| 2024-04 | 435 | R$ 1.446,10 | R$ 3,32 | 25 | R$ 57,84 | R$ 1.093,95 | R$ 104,15 | R$ 248,00 | R$ 308,20 |
| 2024-05 | 354 | R$ 1.351,48 | R$ 3,82 | 26 | R$ 51,98 | R$ 1.001,74 | R$ 92,74 | R$ 257,00 | R$ 90,00 |
| 2024-06 | 336 | R$ 1.261,18 | R$ 3,75 | 25 | R$ 50,45 | R$ 968,19 | R$ 82,99 | R$ 210,00 | R$ 222,00 |
| 2024-07 | 368 | R$ 1.489,10 | R$ 4,05 | 26 | R$ 57,27 | R$ 1.057,35 | R$ 88,75 | R$ 343,00 | R$ 120,00 |
| 2024-08 | 408 | R$ 1.937,45 | R$ 4,75 | 26 | R$ 74,52 | R$ 1.252,65 | R$ 202,80 | R$ 482,00 | R$ 103,00 |
| 2024-09 | 356 | R$ 1.572,18 | R$ 4,42 | 23 | R$ 68,36 | R$ 1.102,69 | R$ 181,99 | R$ 287,50 | R$ 32,00 |
| 2024-10 | 325 | R$ 1.406,38 | R$ 4,33 | 24 | R$ 58,60 | R$ 1.017,14 | R$ 125,74 | R$ 263,50 | R$ 9,00 |
| 2024-11 | 280 | R$ 1.069,40 | R$ 3,82 | 19 | R$ 56,28 | R$ 779,65 | R$ 79,75 | R$ 210,00 | R$ 17,00 |
| 2025-03 | 41 | R$ 137,80 | R$ 3,36 | 4 | R$ 34,45 | R$ 111,30 | R$ 8,50 | R$ 18,00 | R$ 2,50 |
| 2025-04 | 319 | R$ 1.382,80 | R$ 4,33 | 23 | R$ 60,12 | R$ 1.042,80 | R$ 98,50 | R$ 241,50 | R$ 15,00 |
| 2025-05 | 395 | R$ 1.629,40 | R$ 4,13 | 26 | R$ 62,67 | R$ 1.298,90 | R$ 36,00 | R$ 294,50 | R$ 43,00 |
| 2025-06 | 264 | R$ 1.693,90 | R$ 6,42 | 23 | R$ 73,65 | R$ 1.382,40 | R$ 44,00 | R$ 267,50 | R$ 22,50 |
| 2025-07 | 319 | R$ 1.558,30 | R$ 4,88 | 25 | R$ 62,33 | R$ 1.276,55 | R$ 51,75 | R$ 230,00 | R$ 19,00 |
| 2025-08 | 279 | R$ 1.514,18 | R$ 5,43 | 25 | R$ 60,57 | R$ 1.227,44 | R$ 63,24 | R$ 223,50 | R$ 31,70 |
| 2025-09 | 263 | R$ 1.428,78 | R$ 5,43 | 24 | R$ 59,53 | R$ 1.144,54 | R$ 30,24 | R$ 254,00 | R$ 8,70 |
| 2025-10 | 317 | R$ 1.483,50 | R$ 4,68 | 25 | R$ 59,34 | R$ 1.184,25 | R$ 66,25 | R$ 233,00 | R$ 10,00 |
| 2025-11 | 281 | R$ 1.575,40 | R$ 5,61 | 25 | R$ 63,02 | R$ 1.268,90 | R$ 83,00 | R$ 223,50 | R$ 10,60 |
| 2025-12 | 212 | R$ 1.255,70 | R$ 5,92 | 21 | R$ 59,80 | R$ 1.054,20 | R$ 3,00 | R$ 198,50 | R$ 11,00 |
| 2026-01 | 261 | R$ 1.277,70 | R$ 4,90 | 23 | R$ 55,55 | R$ 1.012,45 | R$ 39,25 | R$ 226,00 | R$ 5,00 |
| 2026-02 | 229 | R$ 1.298,90 | R$ 5,67 | 20 | R$ 64,95 | R$ 1.031,15 | R$ 24,75 | R$ 243,00 | R$ 10,00 |
| 2026-03 | 243 | R$ 1.701,90 | R$ 7,00 | 23 | R$ 74,00 | R$ 1.349,90 | R$ 8,00 | R$ 344,00 | R$ 10,50 |
| 2026-04 | 311 | R$ 1.949,30 | R$ 6,27 | 22 | R$ 88,60 | R$ 1.473,80 | R$ 42,50 | R$ 433,00 | R$ 21,60 |
| 2026-05 | 251 | R$ 1.694,70 | R$ 6,75 | 24 | R$ 70,61 | R$ 1.459,20 | R$ 12,50 | R$ 223,00 | R$ 85,90 |
| 2026-06 | 214 | R$ 1.221,80 | R$ 5,71 | 21 | R$ 58,18 | R$ 919,80 | R$ 3,00 | R$ 299,00 | R$ 56,80 |
| 2026-07 | 190 | R$ 1.244,30 | R$ 6,55 | 25 | R$ 49,77 | R$ 1.053,80 | R$ 2,50 | R$ 188,00 | R$ 13,70 |
| 2026-08 | 282 | R$ 1.418,10 | R$ 5,03 | 23 | R$ 61,66 | R$ 1.059,60 | R$ 3,50 | R$ 355,00 | R$ 60,40 |
| 2026-09 | 138 | R$ 810,80 | R$ 5,88 | 18 | R$ 45,04 | R$ 656,80 | R$ 0,00 | R$ 154,00 | R$ 40,00 |

## Principais itens: dez/2022 a ago/2023 (fase completa)

| # | Item | Categoria | Quantidade | Receita | Preço médio |
|---|---|---|---|---|---|
| 1 | Impressão Preto e Branco | Impressão | 47.311 | R$ 11.827,75 | R$ 0,25 |
| 2 | Curriculo | Serviço | 767 | R$ 5.369,00 | R$ 7,00 |
| 3 | Recebimento de Arquivos | Serviço | 6.638 | R$ 4.978,50 | R$ 0,75 |
| 4 | Impressão Colorida | Impressão | 2.856 | R$ 4.275,62 | R$ 1,50 |
| 5 | Xerox | Impressão | 15.262 | R$ 3.815,50 | R$ 0,25 |
| 6 | Scanner | Serviço | 1.961 | R$ 2.451,25 | R$ 1,25 |
| 7 | Impressão acima de 100 Folhas | Impressão | 10.744 | R$ 2.148,80 | R$ 0,20 |
| 8 | Detran IPVA | Serviço | 185 | R$ 1.850,00 | R$ 10,00 |
| 9 | Plastificação A4 | Serviço | 291 | R$ 1.746,00 | R$ 6,00 |
| 10 | Envio de arquivos | Serviço | 361 | R$ 1.444,00 | R$ 4,00 |
| 11 | Segunda Via de Conta | Serviço | 265 | R$ 1.428,75 | R$ 5,39 |
| 12 | Envelope Pardo | Papelaria | 2.580 | R$ 1.290,00 | R$ 0,50 |
| 13 | Envio de Curriculo PDF | Serviço | 261 | R$ 1.249,00 | R$ 4,79 |
| 14 | Revelação de Foto 3x4 6 fotos | Serviço | 89 | R$ 1.246,00 | R$ 14,00 |
| 15 | Suporte ao Cliente | Serviço | 453 | R$ 1.245,75 | R$ 2,75 |
| 16 | Detran CRLV Digital | Serviço | 122 | R$ 1.220,00 | R$ 10,00 |
| 17 | Impressão Papel Fotográfico | Impressão | 221 | R$ 1.105,00 | R$ 5,00 |
| 18 | MEU INSS Recuperação Senha | Serviço | 49 | R$ 980,00 | R$ 20,00 |
| 19 | Plastificação Identidade | Serviço | 221 | R$ 884,00 | R$ 4,00 |
| 20 | Impressão Papel Cartão | Impressão | 195 | R$ 780,00 | R$ 4,00 |

Em 2023 a impressão P&B e a xerox saíam por R$ 0,25 a página. Acima de 100 folhas, R$ 0,20. Hoje a impressão P&B de balcão é R$ 1,00.

## Principais itens de balcão: jan/2024 a set/2026

| # | Item | Categoria | Quantidade | Receita |
|---|---|---|---|---|
| 1 | Impressão Preto e Branco | Impressão | 1.416 | R$ 706,50 |
| 2 | Scanner | Serviço | 170 | R$ 220,50 |
| 3 | Xerox | Impressão | 399 | R$ 196,75 |
| 4 | Impressão Colorida | Impressão | 106 | R$ 162,55 |
| 5 | Coca lata 350ml | Refrigante | 29 | R$ 145,00 |
| 6 | Curriculo | Serviço | 20 | R$ 140,00 |
| 7 | Detran IPVA | Serviço | 13 | R$ 130,00 |
| 8 | Pé de Moleque | Doce | 37 | R$ 129,50 |
| 9 | Recebimento de Arquivos | Serviço | 168 | R$ 126,00 |
| 10 | Água sem Gás 500ml | Bebidas | 46 | R$ 115,00 |

## Cópias do Google Drive (L:\Meu Drive\Copias Nexcafé)

São 33 cópias datadas, de 14/07/2023 a 26/11/2024, mais a pasta `Copia`, que tem cópias de 28/12/2022 a 12/01/2023. Foram lidas sem alterar nada. As tabelas usadas foram copiadas para `_nexcafe_extraido\copias-drive\`.

- Só a cópia de 26/11/2024 tem as tabelas de transação (`Tran` e `MovEst`). Ela não tem nenhum registro que falte na cópia principal; a principal já contém tudo dela.
- As cópias de 2023 têm caixa, sessões e impressões, mas não as transações.
- **Período perdido na cópia principal:** em janeiro/2024 o banco foi restaurado para um ponto de 10/08/2023. Tudo o que foi lançado de 11/08 a 21/10/2023 sumiu, e os números de caixa 186 em diante foram reaproveitados a partir de 14/01/2024.
- A cópia de 20/10/2023 guarda os fechamentos desses caixas, mas sem os itens vendidos. Recuperei o valor recebido em cada dia (`caixas-recuperados-ago-out-2023.csv`):

| Mês | Caixas | Recebido no caixa | Por dia |
|---|---|---|---|
| Ago/2023 (12 a 31) | 17 | R$ 5.859,54 | R$ 344,68 |
| Set/2023 | 24 | R$ 10.641,38 | R$ 443,39 |
| Out/2023 (1 a 19) | 14 | R$ 6.893,73 | R$ 492,41 |
| Total | 55 | R$ 23.394,65 | R$ 425,36 |

O "recebido no caixa" inclui recargas de tempo e pagamentos de fiado. Por isso é uma estimativa do faturamento, não o número exato; na fase completa as recargas foram cerca de 1,4% do valor.

O que continua sem registro em nenhuma cópia: parte de 11/08/2023 (a principal tem R$ 164,65 dos R$ 386,88 desse caixa), de 20/10/2023 a 13/01/2024, e de dez/2024 a fev/2025.

Somando o recuperado, a fase completa (dez/2022 a out/2023) chega a R$ 110.635,13, cerca de R$ 457 por dia aberto.

## Cuidados antes de juntar com o sistema atual

- De maio a setembro de 2026 o NexCafé tem tempo de máquina e impressões das estações, e o `db.json` já tem as vendas de balcão importadas do sistema anterior, inclusive itens como "Acesso a Internet". Somar as duas fontes nesse período pode contar a mesma venda duas vezes. É preciso conferir caso a caso antes de qualquer importação.
- Nada disso foi importado para o sistema. A importação depende de autorização.
