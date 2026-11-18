# Análise gerencial e plano de 7 dias: Speed Financeira & Lan House

Data: 17/10/2026. Período analisado: 04/05/2026 a 17/10/2026 (137 dias com venda).
Fontes (somente leitura): `server/data/db.json`, `archive-2026-05.json` a `archive-2026-09.json` e o relatório `docs/levantamento-vendas-2026-10-17.md`. Nenhum dado original foi alterado e nada foi implementado no sistema.
Arquivos de apoio nesta pasta: `receita-diaria.csv` (uma linha por dia) e `servicos-por-dia.csv` (quantidade e receita de cada serviço por dia).

## 1. Resumo executivo

1. **Situação atual.** A loja fatura **R$ 275/dia** na média do período (R$ 6.964/mês), **R$ 246/dia** nos últimos 60 dias e **R$ 313/dia** em outubro. Com despesas de R$ 5.194/mês, o equilíbrio fica entre **R$ 217 e R$ 242/dia**, conforme o custo variável. A loja cobre as despesas, mas não cobre também a retirada média do dono (R$ 4.562/mês de maio a setembro). Para cobrir os dois são necessários **R$ 408 a R$ 454/dia**.
2. **Peso da gráfica.** Impressão P&B é 29,7% da receita e aparece em 61,6% das vendas, mas rende só R$ 0,80 por página. A receita de impressão cresce com volume, não com preço.
3. **Serviços que mais sobem o ticket.** Vendas que incluem serviço digital ou público de maior valor (INSS, Detran, currículo, contrato, SPC, gov.br, transferência, digitação, celular) têm ticket de **R$ 23,18**, contra **R$ 10,30** das demais. Hoje são só 2,7 dessas vendas por dia.
4. **Impressão em volume.** Já existem 35 vendas acima de 50 páginas (média de 78 páginas a R$ 0,55), sem cliente identificado. Um pacote para empresas e escolas é a maior alavanca de volume.
5. **Speed Financeira.** As comissões somaram R$ 1.957,92 em cinco meses (média de R$ 391,58/mês), com apenas três entradas de valor médio R$ 652,64. Converter um cliente a mais por mês entre os que já usam INSS, SPC ou Detran equivale a cerca de R$ 26/dia.
6. **Metas por dia.** Os cenários de R$ 400, R$ 450 e R$ 500/dia exigem cerca de 38, 42 e 47 atendimentos com o ticket atual (R$ 10,64), ou ticket de R$ 13,33, R$ 15,00 e R$ 16,67 com 30 atendimentos. Os planos por serviço estão na seção 8.
7. **Custos.** Não há custo unitário confiável no sistema. A única margem apurada com dado real é agregada: os insumos gráficos comprados de maio a agosto foram **10,1% da receita da gráfica** (R$ 0,13 por página impressa). Os custos cadastrados nos produtos não foram verificados e alguns são incoerentes (ver seção 3).

## 2. Base, padronização e premissas

### 2.1 O que entrou e o que saiu

| Item | Tratamento |
|---|---|
| Vendas de balcão (`sale`), tempo de máquina (`time`) e impressão da estação (`print`) | Entram como faturamento. Total de 3.189 cobranças e R$ 37.683,79. |
| Recargas de crédito de cliente (`credit`) | **Excluídas.** São pagamento adiantado, não venda. |
| Recargas de celular (Tim, Claro, Vivo: R$ 812,50 no período, R$ 9,80/dia nos últimos 60 dias) | Mantidas no faturamento porque foram lançadas como venda, mas marcadas como **repasse provável**: a receita não é margem. Ficam fora das metas de crescimento. |
| Sobras de caixa lançadas como "venda não lançada" (R$ 176,75 em outubro) | Fora da base, porque não têm item. É sinal de venda feita e não registrada (ver oportunidade 18). |
| Comissões da Speed Financeira | Tratadas à parte, como receita financeira (seção 7). |

### 2.2 Diferenças entre as versões do sistema e como foram corrigidas

1. **Maio a setembro (sistema anterior importado).** Cada venda tem os itens e o total. Nas vendas com dois ou mais itens, o importador **rateou o total entre os itens** pelo preço de tabela. Isso vale para **52,6% da receita por item**: nesses casos a receita por serviço é estimativa, embora o total da venda seja exato. Para analisar preço usei também o "preço médio só com valor exato" (vendas de um item e sistema novo).
2. **Outubro (sistema novo).** Tempo de máquina e impressão da estação viram cobranças separadas da venda de balcão. Por isso outubro tem mais cobranças por dia (35,8) e ticket menor (R$ 8,74). Agrupando as cobranças da mesma sessão, são **29,5 atendimentos/dia com ticket de R$ 10,64**, número coerente com os "mais de 30 clientes pagantes por dia".
3. **Nomes diferentes para o mesmo serviço.** Foram agrupados em serviços padronizados. Os principais grupos:

| Serviço padronizado | Nomes lançados agrupados |
|---|---|
| Impressão P&B | Impressão P/B Balcão (R$ 1,00), Impressão Preto e Branco (R$ 0,50), Xerox (R$ 0,50), Impressão acima de 150 Folhas (R$ 0,40), impressão P&B da estação |
| Impressão Colorida | Impressão Colorida, XEROX COLORIDA, impressão colorida da estação |
| Recebimento de Arquivos | Recebimento de Arquivos, Recebimento Internet, Recebimento Colorido |
| Currículo | Curriculo - 5 Folhas, Currículo Novo + PDF, Envio de Curriculo PDF, Conversão/Edição de currículo |
| Uso de computador | Acesso a Internet e cobranças de tempo de máquina |
| Impressão em papel especial | Papel fotográfico, papel cartão, papel adesivo |
| INSS (Meu INSS) | Todos os itens "MEU INSS" e "Recuperação INSS" |
| Bomboniere e bebidas | Categorias "Bomboniere & Bebidas" e "Bebidas & Bomboniere" |

### 2.3 Bases de comparação

| Base | Dias | Vendas/dia | Receita/dia | Ticket |
|---|---|---|---|---|
| Período total (04/05 a 17/10) | 137 | 23,3 | R$ 275,06 | R$ 11,82 |
| Últimos 60 dias (19/08 a 17/10) | 49 | 23,3 | R$ 245,54 | R$ 10,53 |
| Outubro, sistema novo (01 a 17/10) | 13 | 35,8 cobranças / 29,5 atendimentos | R$ 313,38 | R$ 8,74 por cobrança / R$ 10,64 por atendimento |

Os cenários partem da **base do período (R$ 275/dia)**, que corresponde a R$ 6.964/mês e fica dentro da faixa informada de R$ 6.000 a R$ 8.000. Parte da alta de outubro pode vir do registro mais completo do sistema novo, por isso ela não foi usada como base.

Fórmulas usadas:
- Receita/dia = receita do período ÷ dias com venda
- Ticket = receita ÷ número de vendas (ou de atendimentos)
- Frequência (penetração) = vendas que contêm o serviço ÷ total de vendas
- Mês = receita/dia × 25,3 (média de dias abertos de maio a setembro)

## 3. Faturamento, margem apurada e estimativa

| Tipo de número | O que existe | Confiabilidade |
|---|---|---|
| **Faturamento** | Total por venda, dia, mês e forma de pagamento | Alta. Por serviço é exato em 47,4% da receita e rateado no restante (legado com vários itens). |
| **Margem apurada** | Só agregada: insumos gráficos pagos de maio a agosto = R$ 1.482,96 contra R$ 14.709,50 de receita da gráfica, ou **10,1%** (R$ 0,13 por página P&B, colorida e especial) | Média. Só capta compras registradas no banco. Toner, cilindro (R$ 130 em outubro), compras em dinheiro e depreciação podem estar fora. É um piso de custo, não o custo real. |
| **Custo cadastrado nos produtos** | Cobre 37,8% da receita, vindo da planilha do sistema anterior | **Não verificado** e em parte incoerente: Scanner custo R$ 1,25 para preço R$ 1,50; Colorida R$ 1,50 por página contra R$ 0,13 de insumo agregado; Foto 3x4 custo R$ 14 para preço R$ 15; Meu INSS Recuperação de Senha custo R$ 20 para preço R$ 30 (serviço sem material, então pode ser repasse a terceiro). Usado só como alerta, nunca como margem. |
| **Taxas de cartão** | Não constam nos dados. Débito é 21,0% e crédito 7,2% do valor recebido. | Desconhecidas. Entram como premissa nos cenários. |
| **Estimativa** | Cenários, metas e impacto de cada ação | Condicional às premissas indicadas em cada linha. |

Custo variável usado nos cenários (fração da receita total):
- **5,6%**: só o insumo gráfico apurado (10,1% × 55% de peso da gráfica)
- **10%**: insumo mais taxas de cartão e manutenção (premissa)
- **15%**: cenário conservador (premissa)

**Dados que faltam para apurar margem por serviço** (preencher antes de mudar preços):
1. Preço da resma A4 e quantas folhas tem.
2. Preço do toner P&B e rendimento em páginas.
3. Preço da tinta ou refil colorido e rendimento.
4. Cilindro: preço e vida útil.
5. Preço por folha de papel fotográfico, cartão e adesivo.
6. Custo de plastificação, envelope e foto 3x4.
7. Taxas de débito e crédito da maquininha.
8. Natureza do "custo" de R$ 20 a R$ 30 cadastrado nos serviços de INSS e Detran.

Fórmula para o custo por página P&B: (preço da resma ÷ folhas) + (preço do toner ÷ rendimento) + (preço do cilindro ÷ vida útil).

## 4. Receita, volume, ticket e frequência por serviço

Período total com /dia sobre 137 dias. A coluna "60d" é a média dos últimos 49 dias com venda.

| Serviço | Receita | % | Qtd | Vendas com o item | Penetração | R$/dia | Qtd/dia | Preço médio | Preço médio (só exato) | R$/dia 60d | Qtd/dia 60d |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Impressão P&B | 11.199,84 | 29,7% | 14.043 | 1.964 | 61,6% | 81,75 | 102,5 | 0,80 | 0,80 | 72,33 | 89,9 |
| Impressão em papel especial | 2.270,69 | 6,0% | 343 | 117 | 3,7% | 16,57 | 2,5 | 6,62 | 6,54 | 10,57 | 1,6 |
| Impressão Colorida | 2.132,15 | 5,7% | 1.055 | 272 | 8,5% | 15,56 | 7,7 | 2,02 | 2,07 | 14,96 | 7,2 |
| Currículo | 2.071,62 | 5,5% | 174 | 170 | 5,3% | 15,12 | 1,3 | 11,91 | 12,82 | 11,86 | 0,9 |
| Uso de computador | 1.730,80 | 4,6% | 336 | 305 | 9,6% | 12,63 | 2,5 | 5,15 | 7,84 | 10,56 | 2,9 |
| INSS (Meu INSS) | 1.528,28 | 4,1% | 48 | 42 | 1,3% | 11,16 | 0,4 | 31,84 | 32,00 | 12,24 | 0,4 |
| Envelope | 1.385,27 | 3,7% | 631 | 547 | 17,2% | 10,11 | 4,6 | 2,20 | 2,00 | 7,90 | 3,8 |
| Bomboniere e bebidas | 1.304,40 | 3,5% | 366 | 284 | 8,9% | 9,52 | 2,7 | 3,56 | 3,42 | 8,30 | 2,4 |
| Detran | 1.204,15 | 3,2% | 72 | 62 | 1,9% | 8,79 | 0,5 | 16,72 | 16,93 | 7,16 | 0,4 |
| Plastificação | 1.194,27 | 3,2% | 179 | 114 | 3,6% | 8,72 | 1,3 | 6,67 | 6,57 | 7,22 | 1,1 |
| Recebimento de Arquivos | 1.179,17 | 3,1% | 1.150 | 1.100 | 34,5% | 8,61 | 8,4 | 1,03 | 1,00 | 9,05 | 9,0 |
| Scanner | 1.053,53 | 2,8% | 735 | 138 | 4,3% | 7,69 | 5,4 | 1,43 | 1,23 | 9,03 | 6,8 |
| Foto 3x4 | 714,64 | 1,9% | 48 | 41 | 1,3% | 5,22 | 0,4 | 14,89 | 14,79 | 7,84 | 0,5 |
| Transferência de titularidade | 673,68 | 1,8% | 36 | 24 | 0,8% | 4,92 | 0,3 | 18,71 | 19,03 | 3,84 | 0,2 |
| Envio de arquivos | 668,97 | 1,8% | 123 | 123 | 3,9% | 4,88 | 0,9 | 5,44 | 5,71 | 5,18 | 0,9 |
| Contrato de locação | 603,00 | 1,6% | 16 | 15 | 0,5% | 4,40 | 0,1 | 37,69 | 38,58 | 2,82 | 0,1 |
| Suporte ao cliente | 531,31 | 1,4% | 167 | 166 | 5,2% | 3,88 | 1,2 | 3,18 | 3,30 | 4,22 | 1,2 |
| Consulta SPC/crédito | 477,86 | 1,3% | 16 | 15 | 0,5% | 3,49 | 0,1 | 29,87 | 30,00 | 2,45 | 0,1 |
| Manutenção de celular | 447,71 | 1,2% | 13 | 13 | 0,4% | 3,27 | 0,1 | 34,44 | 38,89 | 3,75 | 0,1 |
| Edição de arquivo | 435,70 | 1,2% | 66 | 63 | 2,0% | 3,18 | 0,5 | 6,60 | 10,54 | 3,04 | 0,4 |
| Digitação | 407,40 | 1,1% | 35 | 30 | 0,9% | 2,97 | 0,3 | 11,64 | 15,08 | 4,36 | 0,3 |
| Itens avulsos (inclui recargas de celular R$ 812,50) | 3.838,78 | 10,2% | | | | 28,02 | | | | | |

**Tendência dos serviços de maior valor** (INSS, Detran, currículo, contrato, SPC, transferência, gov.br, digitação, celular, foto 3x4):

| Mês | Unidades | Receita |
|---|---|---|
| Maio | 111 | R$ 1.875,62 |
| Junho | 79 | R$ 1.398,86 |
| Julho | 84 | R$ 1.672,64 |
| Agosto | 66 | R$ 1.099,30 |
| Setembro | 68 | R$ 1.249,92 |
| Outubro até dia 17 | 57 | R$ 992,00 |

Outubro dá R$ 76/dia, o melhor ritmo do período. O currículo caiu de 53 unidades em maio para cerca de 20 por mês.

### 4.1 Por dia

| Indicador | Valor |
|---|---|
| Mediana de receita/dia | R$ 269,25 (p25 R$ 181,50 e p75 R$ 355,40; máximo R$ 709,60) |
| Dias com receita de R$ 400 ou mais | 23 de 137 (16,8%). Nos últimos 60 dias: 7 de 49. |
| Dias com receita de R$ 450 ou mais | 15 de 137 (10,9%). Nos últimos 60 dias: 5 de 49. |
| Dias com receita de R$ 500 ou mais | 9 de 137 (6,6%). Nos últimos 60 dias: 3 de 49. |
| Receita média por dia da semana (60 dias) | seg R$ 291 · ter R$ 267 · qua R$ 252 · qui R$ 301 · sex R$ 283 · sáb R$ 97 |
| Horário | Pico entre 10h e 12h. Quase nada depois das 18h. |

A série completa está em `receita-diaria.csv` e `servicos-por-dia.csv`.

## 5. O que os dados mostram

### 5.1 Preço da impressão P&B por tamanho do pedido

| Páginas por venda | Vendas | % das páginas | R$/página | R$/página (só exato) |
|---|---|---|---|---|
| 1 a 2 | 848 | 8,4% | 1,04 | 1,02 |
| 3 a 5 | 475 | 12,9% | 1,03 | 1,00 |
| 6 a 10 | 334 | 18,4% | 1,01 | 0,99 |
| 11 a 20 | 165 | 17,8% | 0,77 | 0,82 |
| 21 a 50 | 111 | 24,5% | 0,63 | 0,65 |
| 51 a 100 | 25 | 12,1% | 0,56 | 0,59 |
| 101 a 150 | 3 | 2,3% | 0,50 | 0,50 |
| Acima de 150 | 3 | 3,6% | 0,58 | 0,50 |

- A partir de 11 páginas o lançamento passa de "P/B Balcão" (R$ 1,00) para "Preto e Branco" (R$ 0,50). O degrau é brusco: um pedido de 10 páginas sai por R$ 10,00 e um de 11 páginas pode sair por R$ 5,50.
- Pedidos de 11 páginas ou mais são 6% das vendas com P&B, mas **60% das páginas**.
- Os pedidos acima de 150 páginas foram cobrados a R$ 0,50, não pela tabela de R$ 0,40 cadastrada.

### 5.2 Anexação (itens que acompanham outro)

| Quem compra | Também leva | Taxa | Legado | Sistema novo |
|---|---|---|---|---|
| Impressão P&B | Recebimento de Arquivos | 51,5% | 52,2% | 47,5% |
| Recebimento de Arquivos | Impressão P&B | 92,0% | 91,5% | 95,7% |
| Impressão P&B | Envelope | 19,8% | 21,6% | 9,3% |
| Currículo | Envelope | 47,1% | 50,7% | 16,7% |
| Scanner | Envio de arquivos | 76,8% | 74,6% | 90,0% |
| INSS | Impressão P&B | 2,4% | | |
| Detran | Impressão P&B | 9,7% | | |
| Impressão P&B | Plastificação | 2,3% | | |

- **Envelope.** A anexação caiu à metade no sistema novo. Pode ser cobrança esquecida ou lançamento esquecido; as sobras de caixa de outubro apontam para a segunda hipótese.
- **INSS e Detran.** Quase nunca saem com comprovante impresso. É um anexo natural de R$ 1 a R$ 3.
- **Vendas só de P&B (com ou sem recebimento).** São 35,6% das vendas, com ticket de R$ 5,42. É o público principal para oferta de um item a mais.
- **Pares mais frequentes.** P&B + Recebimento (1.012), Envelope + P&B (389), Envelope + Recebimento (157), Bomboniere + P&B (135), Colorida + Recebimento (119), Envio + Scanner (106).

### 5.3 Preços potencialmente baixos em relação ao trabalho

A comparação é feita com a própria tabela da loja, sem uso de preço de mercado:

| Serviço | Evidência | Leitura |
|---|---|---|
| Suporte ao cliente | R$ 3,18 em média em 166 atendimentos, o mesmo preço de 15 min de computador sem atendente | Mão de obra quase grátis |
| Currículo 5 folhas | R$ 10, dos quais R$ 5 equivalem às 5 páginas P&B de balcão | Sobram R$ 5 pela criação ou edição |
| Digitação | R$ 8 por página, enquanto "Edição de 1 folha de contrato" custa R$ 10 e "Digitação de Contratos" R$ 30 | Inconsistente com a própria tabela |
| Edição simples | Cadastro de R$ 2 | Abaixo do Recebimento Internet (R$ 3) |
| P&B de 11 a 50 páginas | R$ 0,63 a R$ 0,77 por página e degrau brusco a partir de 11 | Ver oportunidade 10 |
| Uso de computador | Sessões acima de 2 h saem a R$ 4,50/h; de até 15 min, a R$ 15/h. Na tabela, 30 min custam só R$ 0,70 a mais que 15 min. | Sessão longa barata (impacto pequeno) |
| Scanner | Tabela de R$ 1,50, praticado R$ 1,33 nos últimos 60 dias | Desconto informal |
| Foto 3x4, papel especial e colorida | Custo cadastrado quase igual ao preço | Confirmar o custo real antes de vender mais |

## 6. Duplicidades de cadastro e proposta de normalização

### 6.1 Encontradas

| Tipo | Caso | Observação |
|---|---|---|
| Mesmo produto duas vezes | [6] Agua com gás 500ml e [402] Água com Gás 500ml | Mesmo preço; só o [6] vende |
| Mesmo produto duas vezes | [360] pe de moleque e [224] Pé de Moleque | Mesmo preço; só o [360] vende |
| Mesmo produto, preços diferentes | [88] Coca Cola 600ml Pet R$ 7,00 e [407] Coca-Cola 600ml Pet R$ 5,00 | **Risco de cobrar o preço errado** |
| Mesmo produto, preços diferentes | [418] Trident Fresh Intense R$ 4,50 e [333] inativo R$ 2,50 | |
| Categoria duplicada | "Bomboniere & Bebidas" (96) e "Bebidas & Bomboniere" (12); também "Acessórios & Cabos" (6) e "Eletrônicos & Acessórios" (95) | |
| Família com vários cadastros | Recebimento: de Arquivos R$ 1,00, Internet R$ 3,00 e Colorido R$ 1,00 (os dois últimos nunca vendidos) | |
| Família com vários cadastros | Consulta Simples R$ 5,00 e Taxa de Consulta Simples R$ 3,00 (nunca vendida) | |
| Família com vários cadastros | Currículo: 5 Folhas, Novo + PDF, Conversão e Edição, Edição e envio, Envio de PDF | |
| Família com vários cadastros | INSS senha: Recuperação Senha R$ 30, Recuperação Simples senha R$ 20, Autenticação Fatores R$ 40 | |
| Família com vários cadastros | Transferência: Simples, Complexa, CEMIG, COPASA, Detran, com DVD | |
| Família com vários cadastros | Digitação R$ 8, Edição de 1 folha R$ 10, Digitação de Contratos R$ 30 | |
| Faixas de preço sem regra explícita | P&B: P/B Balcão R$ 1,00, Preto e Branco R$ 0,50, Xerox R$ 0,50, Acima de 150 Folhas R$ 0,40 | Não são duplicidade, são faixas. Corrige o que o levantamento anterior chamou de duplicidade. |
| Produtos ativos com preço zero | Acesso a Internet, Recargas de celulares, Envio de contrato, E-Prepag | |

### 6.2 Normalização proposta (não implementada)

1. **Grupo padronizado no produto.** Criar um campo `grupo` (por exemplo "Impressão P&B") e um `substituidoPor` nos cadastros duplicados. Os relatórios passam a somar pelo grupo.
2. **Nada é apagado.** Os duplicados ficam com `active: false` e apontam para o cadastro principal. As vendas antigas continuam com o nome original; o relatório traduz o nome pelo grupo.
3. **Categoria única.** "Bebidas & Bomboniere" vira "Bomboniere & Bebidas" e "Acessórios & Cabos" vira "Eletrônicos & Acessórios", com a categoria antiga guardada num campo de histórico.
4. **P&B com faixa explícita.** Um único produto "Impressão P&B" com preço por faixa de quantidade (seção 9, oportunidade 10), em vez de quatro produtos.
5. **Preço divergente.** Decidir o preço da Coca 600ml e do Trident antes de desativar o duplicado.
6. **Recarga de celular separada.** Marcar como repasse, para não inflar a receita de serviço.

## 7. Equilíbrio financeiro

Fórmula: Receita/dia de equilíbrio = Despesas mensais ÷ (25,3 dias × (1 − custo variável)).

| Custo variável | Cobrir R$ 5.194 de despesas | Despesas + retirada média do dono (R$ 4.561,60) | Despesas + retirada − comissão média (R$ 391,58) |
|---|---|---|---|
| 5,6% (insumo apurado) | R$ 217,48/dia | R$ 408,47/dia | R$ 392,08/dia |
| 10% | R$ 228,11/dia | R$ 428,44/dia | R$ 411,24/dia |
| 15% | R$ 241,53/dia | R$ 453,64/dia | R$ 435,43/dia |

Resultado mensal antes da retirada = Receita/dia × 25,3 × (1 − custo variável) − R$ 5.194:

| Cenário | Receita/dia | Receita/mês | Resultado com 5,6% | com 10% | com 15% |
|---|---|---|---|---|---|
| Últimos 60 dias | 245,77 | 6.217,98 | 675,77 | 402,18 | 91,28 |
| Base do período | 275,26 | 6.964,08 | 1.380,09 | 1.073,67 | 725,47 |
| Outubro | 313,38 | 7.928,51 | 2.290,52 | 1.941,66 | 1.545,24 |
| Meta R$ 400 | 400,00 | 10.120,00 | 4.359,28 | 3.914,00 | 3.408,00 |
| Meta R$ 450 | 450,00 | 11.385,00 | 5.553,44 | 5.052,50 | 4.483,25 |
| Meta R$ 500 | 500,00 | 12.650,00 | 6.747,60 | 6.191,00 | 5.558,50 |

Leitura: a meta de **R$ 450/dia** é a que cobre despesas e a retirada média do dono em qualquer premissa de custo variável.

## 8. Cenários de R$ 400, R$ 450 e R$ 500 por dia

Equivalência com atendimentos e ticket (Receita/dia = atendimentos × ticket):

| Meta | Atendimentos com ticket atual de R$ 10,64 | Ticket com 30 atendimentos | Ticket com 35 atendimentos |
|---|---|---|---|
| R$ 400 | 37,6 | R$ 13,33 | R$ 11,43 |
| R$ 450 | 42,3 | R$ 15,00 | R$ 12,86 |
| R$ 500 | 47,0 | R$ 16,67 | R$ 14,29 |

Metas por serviço. Base = média diária do período; R$/dia da meta = quantidade/dia × preço da meta. Quando o preço da meta é igual ao da base, é o preço médio praticado hoje.

| Serviço | Base qtd/dia | Base R$/dia | Preço base | Meta qtd/dia R$ 400 | R$ 450 | R$ 500 | Preço meta | R$/dia R$ 400 | R$ 450 | R$ 500 |
|---|---|---|---|---|---|---|---|---|---|---|
| Impressão P&B (balcão) | 102,5 | 81,75 | 0,80 | 120 | 125 | 130 | 0,82 | 98,40 | 102,50 | 106,60 |
| P&B em volume para empresas e escolas (novo) | 0 | 0,00 | | 80 | 90 | 100 | 0,50 | 40,00 | 45,00 | 50,00 |
| Currículo | 1,3 | 15,12 | 11,91 | 1,6 | 1,9 | 2,2 | 15,00 | 24,00 | 28,50 | 33,00 |
| Impressão Colorida | 7,7 | 15,56 | 2,02 | 11 | 12 | 13 | 2,05 | 22,55 | 24,60 | 26,65 |
| INSS (Meu INSS) | 0,4 | 11,16 | 31,84 | 0,65 | 0,75 | 0,9 | 31,84 | 20,70 | 23,88 | 28,66 |
| Impressão em papel especial | 2,5 | 16,57 | 6,62 | 3,2 | 3,5 | 4,0 | 6,62 | 21,18 | 23,17 | 26,48 |
| Uso de computador | 2,5 | 12,63 | 5,15 | 3,0 | 3,5 | 4,0 | 5,15 | 15,45 | 18,03 | 20,60 |
| Bomboniere e bebidas | 2,7 | 9,52 | 3,56 | 4,0 | 4,5 | 5,0 | 3,56 | 14,26 | 16,04 | 17,82 |
| Plastificação | 1,3 | 8,72 | 6,67 | 1,8 | 2,2 | 2,6 | 6,67 | 12,01 | 14,68 | 17,35 |
| Detran | 0,5 | 8,79 | 16,72 | 0,75 | 0,85 | 1,0 | 16,72 | 12,54 | 14,22 | 16,72 |
| Envelope | 4,6 | 10,11 | 2,20 | 5,5 | 6,5 | 7,5 | 2,00 | 11,00 | 13,00 | 15,00 |
| Foto 3x4 | 0,4 | 5,22 | 14,89 | 0,6 | 0,8 | 1,0 | 15,00 | 9,00 | 12,00 | 15,00 |
| Scanner (páginas) | 5,4 | 7,69 | 1,43 | 7 | 8 | 9 | 1,50 | 10,50 | 12,00 | 13,50 |
| Recebimento de Arquivos | 8,4 | 8,61 | 1,03 | 10,5 | 11,5 | 12,5 | 1,00 | 10,50 | 11,50 | 12,50 |
| Consulta SPC/crédito | 0,1 | 3,49 | 29,87 | 0,25 | 0,35 | 0,4 | 29,87 | 7,47 | 10,45 | 11,95 |
| Transferência de titularidade | 0,3 | 4,92 | 18,71 | 0,35 | 0,45 | 0,55 | 18,71 | 6,55 | 8,42 | 10,29 |
| Contrato de locação | 0,1 | 4,40 | 37,69 | 0,15 | 0,2 | 0,25 | 37,69 | 5,65 | 7,54 | 9,42 |
| Manutenção de celular | 0,1 | 3,27 | 34,44 | 0,15 | 0,2 | 0,25 | 34,44 | 5,17 | 6,89 | 8,61 |
| Suporte ao cliente | 1,2 | 3,88 | 3,18 | 1,2 | 1,3 | 1,4 | 5,00 | 6,00 | 6,50 | 7,00 |
| gov.br | 0,1 | 1,17 | 22,86 | 0,15 | 0,25 | 0,3 | 22,86 | 3,43 | 5,71 | 6,86 |
| Digitação | 0,3 | 2,97 | 11,64 | 0,35 | 0,45 | 0,5 | 11,64 | 4,07 | 5,24 | 5,82 |
| Demais serviços (mantidos) | | 43,57 | | | | | | 43,57 | 43,57 | 43,57 |
| **Total** | | **275,26** | | | | | | **400,14** | **449,57** | **499,54** |

A linha "Demais serviços" soma Envio de arquivos, Edição, Resultado de exame, Consulta simples, Encadernação e os itens avulsos (inclui recargas de celular), todos mantidos no nível atual.

Premissas dos cenários:
1. O volume de P&B para empresas é novo e depende de clientes fechados (oportunidade 3). Sem ele, cada meta precisa de outros R$ 40 a R$ 50/dia vindos de atendimentos.
2. A meta de P&B balcão a R$ 0,82 por página vem da escada de preço (oportunidade 10).
3. A comissão financeira fica fora dessas metas e soma por cima: +1 contrato/mês ≈ +R$ 25,80/dia.
4. Nenhum cenário supõe aumento de preço nos serviços de maior valor. Supõe apenas mais unidades.

## 9. As 20 maiores oportunidades de receita e margem

Impacto em R$/dia sobre a base; R$/mês = R$/dia × 25,3. "F" = faturamento; "M" = efeito em margem. Todos os impactos são **estimativas**, com a fórmula mostrada.

| # | Oportunidade | Evidência nos dados | Fórmula do impacto | R$/dia | R$/mês | Tipo | Impacto | Esforço | Risco | Retorno |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Pacote de impressão P&B para empresas, escolas e escritórios (500/1.000 páginas pré-pagas) | 35 vendas de 50+ páginas a R$ 0,55; pedidos de 11+ páginas = 60% das páginas; 0% com cliente identificado | 80 pág/dia × R$ 0,50 | 40,00 | 1.012 | F; M condicional: com R$ 0,13/pág de insumo, contribuição R$ 29,60/dia (R$ 24 a R$ 0,20/pág; R$ 20 a R$ 0,25/pág) | Alto | Médio | Médio (preço abaixo do custo real se o custo por página passar de R$ 0,50) | 7 a 14 dias |
| 2 | Speed Financeira: oferecer simulação de crédito, com consentimento, a quem usa INSS, SPC ou Detran | Comissões de R$ 1.957,92 em 5 meses; média de R$ 652,64 por entrada; 42 vendas de INSS e 15 de SPC no período | +1 contrato/mês × R$ 652,64 ÷ 25,3 | 25,80 | 653 | F e M (comissão é quase toda margem) | Alto | Baixo | Médio (conformidade e LGPD; nunca condicionar o serviço ao crédito) | 7 a 30 dias (comissão paga depois) |
| 3 | Divulgar e oferecer ativamente os serviços digitais e públicos de maior valor | Ticket de R$ 23,18 com esses serviços contra R$ 10,30 sem eles; só 2,7 vendas/dia; outubro já em R$ 76/dia | +1 serviço/dia × R$ 25 | 25,00 | 633 | F; M alta (mão de obra, sem material, exceto taxa SPC) | Alto | Baixo | Baixo | Imediato |
| 4 | Currículo completo a R$ 15 (texto + PDF + envio + 1 cópia) e reativação do volume | 53 unidades em maio e cerca de 20/mês depois; preço médio de R$ 11,91 | 1,6/dia × R$ 15 − R$ 15,12 | 8,88 | 225 | F | Médio | Baixo | Baixo | Imediato |
| 5 | Atender com hora marcada aos sábados (currículo, INSS, gov.br) | Sábado rende R$ 97/dia contra R$ 252 a R$ 301 nos dias úteis | +R$ 50 por sábado × 4,3 ÷ 25,3 | 8,50 | 215 | F | Médio | Baixo | Médio (premissa sem dado) | 7 dias |
| 6 | Kit "documento pronto": envelope, plastificação e foto 3x4 junto da impressão | Envelope em 19,8% das vendas com P&B; plastificação em 2,3% | Envelope 0,89 + plastificação 3,29 + foto 3,78 | 7,96 | 201 | F; M: envelope tem margem cadastrada de 54% | Médio | Baixo | Baixo | Imediato |
| 7 | Oferecer colorida para documentos, convites e materiais de pequenos negócios | 7,7 páginas/dia; 84 vendas já misturam colorida e P&B | 11/dia × R$ 2,05 − R$ 15,56 | 7,00 | 177 | F; M depende do custo real (cadastro diz R$ 1,50) | Médio | Baixo | Baixo | Imediato |
| 8 | Bomboniere visível e oferecida no caixa | Penetração de 8,9%; margem cadastrada de 56% | 4/dia × R$ 3,56 − R$ 9,52 | 4,74 | 120 | F e M | Médio | Baixo | Baixo | Imediato |
| 9 | Papel especial (convites, etiquetas, adesivos) | 2,5/dia; caiu para 1,6/dia nos últimos 60 dias | 3,2/dia × R$ 6,62 − R$ 16,57 | 4,61 | 117 | F; margem cadastrada de 21%, revisar preço primeiro | Médio | Baixo | Médio | Imediato |
| 10 | Escada de preço P&B: 1 a 10 páginas R$ 1,00; 11 a 50 a R$ 0,70; 51 a 150 a R$ 0,50; 150+ a R$ 0,40 | 119 vendas abaixo desses pisos; degrau brusco aos 11 | Diferença recalculada venda a venda | 2,62 (3,15 nos 60 dias) | 66 a 80 | M (preço puro) | Baixo | Baixo | Médio (cliente de volume pode reagir) | Imediato |
| 11 | Revisar preços cujo custo cadastrado está colado no preço (foto 3x4 R$ 15 com custo R$ 14; papel especial R$ 6 a R$ 7 com custo R$ 5 a R$ 6) | Margem cadastrada de 6% (foto) e 21% (papel especial) | Foto +R$ 5 × 0,4/dia + papel +R$ 1 × 2,5/dia | 4,50 | 114 | M, condicional ao custo real | Médio | Baixo | Médio | Imediato depois de confirmar o custo |
| 12 | Cobrar novamente o envelope e os itens que caíram no sistema novo | Anexação de envelope caiu de 21,6% para 9,3%; sobras de caixa de R$ 176,75 em outubro | 14,3 vendas P&B/dia × 12,3 pontos × R$ 2 | 3,52 | 89 | F; medição | Médio | Baixo | Baixo | Imediato |
| 13 | Scanner na tabela (R$ 1,50) e digitalização em lote | Praticado R$ 1,33; 76,8% já levam Envio de arquivos | 7/dia × R$ 1,50 − R$ 7,69 | 2,81 | 71 | F e M | Baixo | Baixo | Baixo | Imediato |
| 14 | Uso de computador: tabela com degrau real e pacote de horas | Sessões longas a R$ 4,50/h; 30 min só R$ 0,70 acima de 15 min | 3/dia × R$ 5,15 − R$ 12,63 | 2,82 | 71 | F | Baixo | Baixo | Baixo | Imediato |
| 15 | Suporte ao cliente com mínimo de R$ 5 | 166 atendimentos a R$ 3,18 | 1,24/dia × (R$ 5 − R$ 3,18) | 2,26 | 57 | M | Baixo | Baixo | Médio | Imediato |
| 16 | Cobrar recebimento sempre que o cliente mandar arquivo | 5,2 vendas/dia de P&B balcão sem recebimento nem scanner | 5,2 × 40% (premissa) × R$ 1 | 2,08 | 53 | M | Baixo | Baixo | Baixo | Imediato |
| 17 | Comprovante impresso + envelope em INSS e Detran | Só 2,4% (INSS) e 9,7% (Detran) saem com impressão | 0,9/dia × R$ 3 × 70% | 1,89 | 48 | F | Baixo | Baixo | Baixo | Imediato |
| 18 | Lançar toda venda no sistema e investigar as sobras de caixa | R$ 176,75 de sobra em outubro, cerca de R$ 13,60/dia sem item | Medição | indireto | | Medição | Médio | Baixo | Baixo | Imediato |
| 19 | Identificar o cliente em vendas de R$ 20 ou mais e em impressões de 50+ páginas | Hoje 1 venda em 3.189 tem cliente | Base para as oportunidades 1, 2 e 3 | indireto | | Base | Alto (habilitador) | Baixo | Baixo | 7 dias |
| 20 | Corrigir duplicidades e preços divergentes | Coca 600ml a R$ 5 e R$ 7; categorias duplicadas | Evita venda a preço errado | indireto | | M e medição | Baixo | Baixo | Baixo | Depois de aprovado |

Soma das oportunidades com valor (1 a 17): cerca de **R$ 155/dia**. Sobre a base de R$ 275, isso leva a cerca de R$ 430/dia, entre os cenários de R$ 400 e R$ 450. Os impactos não são totalmente independentes: o kit, o envelope e o recebimento disputam a mesma venda.

Combinações que aumentam o ticket sem prejudicar o cliente (todas já aparecem juntas nos dados):

| Combo | Itens | Valor | Quando oferecer |
|---|---|---|---|
| Documento pronto | Impressão + envelope (+ plastificação para RG ou certidão) | P&B + R$ 2 (+ R$ 5 a R$ 8) | Toda impressão de documento |
| Currículo completo | Currículo + PDF + envio por WhatsApp/e-mail + 1 cópia + envelope | R$ 15 + R$ 2 | Toda procura por currículo |
| INSS ou Detran resolvido | Serviço + comprovante impresso + envelope | Serviço + R$ 1 a R$ 3 | Todo INSS e Detran |
| Digitalização | Scanner + envio do arquivo | R$ 1,50/pág + R$ 5 | Já ocorre em 76,8% dos casos; padronizar |
| Foto 3x4 + documento | Foto + impressão do formulário | R$ 15 + impressão | INSS, Detran, cadastros |

## 10. Plano de ação de 7 dias

Ordem de prioridade: impacto financeiro esperado, facilidade de execução e velocidade de retorno. Datas sugeridas para os dias úteis de 19 a 26/10.

| Dia | Ações | Oportunidades | Meta do dia | Como medir |
|---|---|---|---|---|
| 1 (seg 19/10) | Aprovar a tabela nova: escada P&B, scanner R$ 1,50, suporte mínimo R$ 5, currículo completo R$ 15, digitação R$ 10/página. Imprimir cartaz de preços e combos no balcão. Combinar com o atendimento a frase de oferta (veja abaixo). Anotar os custos que faltam (seção 3). | 3, 4, 6, 10, 13, 15, 16 | R$ 330 | Receita/dia, % de P&B com envelope, % de P&B com recebimento |
| 2 (ter 20/10) | Lista de 20 empresas, escolas, contabilidades, imobiliárias, escritórios de advocacia e igrejas num raio de 1 km. Proposta de pacote: 500 páginas por R$ 250 e 1.000 por R$ 450 (só com custo por página abaixo de R$ 0,30). Enviar a 10 deles por WhatsApp ou visita. | 1, 19 | R$ 340 e 10 propostas enviadas | Propostas enviadas e respondidas |
| 3 (qua 21/10) | Speed Financeira: a cada cliente de INSS, SPC ou Detran, perguntar se quer uma simulação gratuita. Anotar só com consentimento. Postar no WhatsApp e no Google os serviços de INSS, Detran, gov.br e currículo, com preço. | 2, 3 | R$ 360, 5 simulações e 3 serviços de maior valor | Simulações, serviços de maior valor/dia |
| 4 (qui 22/10) | Kit documento pronto e comprovante em INSS/Detran. Bomboniere à vista no caixa. Amostras de colorida e papel especial no balcão (convite, etiqueta, foto). | 6, 7, 8, 9, 17 | R$ 380 | Ticket médio, itens por venda |
| 5 (sex 23/10) | Retorno às 10 empresas e novas 10 propostas. Fechar ao menos 1 pedido-teste de volume. Conferir a sobra do caixa contra o que foi lançado. | 1, 12, 18 | R$ 400 e 1 pedido de volume | Páginas de volume/dia, sobra de caixa |
| 6 (sáb 24/10) | Sábado com hora marcada para currículo, INSS e gov.br, divulgado na quinta e na sexta | 5, 3 | R$ 150 no sábado | Receita do sábado comparada com R$ 97 |
| 7 (seg 26/10) | Revisão: comparar a semana com a base (R$ 275/dia, ticket R$ 10,64, 29,5 atendimentos, envelope 9,3%, recebimento 47,5%, 2,7 serviços de maior valor/dia). Decidir manter, ajustar ou recuar cada preço. Aprovar a normalização do cadastro. | todas | R$ 400 | Painel de indicadores abaixo |

Frase de oferta no caixa, uma por atendimento:
- Para quem imprimiu documento: "Quer um envelope para não amassar? São R$ 2."
- Para quem fez INSS ou Detran: "Já imprimo o comprovante para o senhor?"
- Para quem comprou só impressão: "Hoje temos água gelada e pé de moleque."

Indicadores diários (planilha ou relatório do sistema):

| Indicador | Base |
|---|---|
| Receita/dia | R$ 275 |
| Atendimentos | 29,5 |
| Ticket | R$ 10,64 |
| % de vendas P&B com envelope | 9,3% no sistema novo |
| % de vendas P&B com recebimento | 47,5% |
| Serviços de maior valor/dia | 2,7 |
| Páginas de volume/dia | 0 |
| Simulações financeiras/dia | sem base |
| Sobra de caixa/dia | sem base |

## 11. Limitações

1. **Receita por serviço com rateio.** 52,6% da receita por serviço vem do rateio do importador nas vendas legadas com vários itens. O total da venda é exato; a divisão entre os itens é estimada.
2. **Custos.** Não há custo unitário confiável. A margem apurada é só o agregado de insumos gráficos e é um piso. Os custos cadastrados não foram usados como margem.
3. **Taxas de cartão.** Desconhecidas; tratadas por cenário (10% e 15% de custo variável).
4. **Comissão financeira.** São só três entradas em cinco meses. A média de R$ 652,64 por contrato é uma amostra pequena.
5. **Outubro.** Só 13 dias, e com mudança na forma de registrar. Não foi usado como base.
6. **Clientes.** Quase nenhuma venda tem cliente identificado, então não dá para medir recompra nem quem são os clientes de volume.

## 12. O que depende de autorização

Nada foi alterado no sistema. Depois da aprovação deste plano, as mudanças possíveis no sistema são:
1. Grupo padronizado e `substituidoPor` nos cadastros (seção 6.2).
2. Preço por faixa automático para P&B.
3. Aviso de combo no caixa (envelope, comprovante, recebimento).
4. Relatório diário com os indicadores da seção 10.
5. Cliente obrigatório em vendas de R$ 20 ou mais e em impressões de 50+ páginas.
