# Auditoria executiva: Speed Lan House & Financeira (Varginha-MG)

Data: 17/10/2026, com dados lidos por volta das 12h (a base continua recebendo vendas).

## Fonte dos dados

Os arquivos citados no pedido (`/src/data/rawCatalog.ts`, `/src/lib/categoriesConfig.ts` e `/src/types.ts`) não existem neste computador, e nenhum anexo chegou com a mensagem. A auditoria usa a mesma informação direto do sistema em produção, sem alterar nada:

| Informação pedida | Onde está no sistema |
|---|---|
| Catálogo de produtos e serviços | 404 itens em `server/data/db.json` (o pedido menciona 386; a diferença são cadastros criados depois) |
| Preço de custo | 80 itens com custo cadastrado |
| Preço de venda | Cadastro de cada produto |
| Volume acumulado de saída | No sistema anterior, o estoque negativo de cada serviço é a quantidade vendida desde o início |
| Histórico de vendas | 3.190 vendas e 5.929 itens vendidos, de 04/05 a 17/10/2026, em `db.json` e `archive-2026-05` a `archive-2026-09` |

Recargas de crédito de clientes ficaram fora da receita. As categorias do sistema foram mapeadas para as 7 oficiais ("Bebidas & Bomboniere" entra em Bomboniere & Bebidas; "Acessórios & Cabos" entra em Eletrônicos & Acessórios). Itens sem categoria foram classificados pelo nome; por exemplo, Certidão, DAS MEI e IPTU foram para Serviços Públicos.

Complementa o relatório [relatorio.md](relatorio.md), que traz o plano de 7 dias, os cenários de R$ 400 a R$ 500/dia e as 20 oportunidades.

## 1. Curva ABC

Classes: A = itens que somam até 80% do total; B = de 80% a 95%; C = o restante.

### 1.1 Volume de clientes no balcão

Medido pelo número de vendas em que o item aparece, que equivale ao número de clientes atendidos.

Resumo das classes (137 itens vendidos):
- **Classe A:** 10 itens geram 79,1% do fluxo.
- **Classe B:** 29 itens, 15,9%.
- **Classe C:** 98 itens, 5,0%.

| # | Item | Categoria | Vendas | % das vendas | % acumulado | Classe | Receita (R$) |
|---|---|---|---|---|---|---|---|
| 1 | Impressão P/B Balcão | Gráfica Rápida | 1.715 | 53,8% | 29,0% | A | 6.619,58 |
| 2 | Recebimento de Arquivos | Lan House & Serv. Digitais | 1.101 | 34,5% | 47,6% | A | 1.180,17 |
| 3 | Envelope Pardo | Gráfica Rápida | 547 | 17,1% | 56,8% | A | 1.385,27 |
| 4 | Acesso a Internet (inclui tempo de máquina) | Lan House & Serv. Digitais | 303 | 9,5% | 61,9% | A | 1.724,80 |
| 5 | Impressão Colorida | Gráfica Rápida | 272 | 8,5% | 66,5% | A | 2.132,15 |
| 6 | Impressão Preto e Branco (11+ páginas) | Gráfica Rápida | 245 | 7,7% | 70,6% | A | 4.474,62 |
| 7 | Suporte ao Cliente | Lan House & Serv. Digitais | 166 | 5,2% | 73,4% | A | 531,31 |
| 8 | Scanner | Gráfica Rápida | 138 | 4,3% | 75,8% | A | 1.053,53 |
| 9 | Envio de arquivos | Lan House & Serv. Digitais | 123 | 3,9% | 77,8% | A | 668,97 |
| 10 | Currículo - 5 Folhas | Lan House & Serv. Digitais | 76 | 2,4% | 79,1% | A | 783,02 |
| 11 | Currículo Novo + PDF | Lan House & Serv. Digitais | 76 | 2,4% | 80,4% | B | 1.187,99 |
| 12 | Impressão Papel Fotográfico | Gráfica Rápida | 68 | 2,1% | 81,6% | B | 879,96 |
| 13 | Plastificação A4 | Gráfica Rápida | 66 | 2,1% | 82,7% | B | 756,19 |
| 14 | Água com gás 500ml | Bomboniere & Bebidas | 65 | 2,0% | 83,8% | B | 289,81 |
| 15 | Água sem gás 500ml | Bomboniere & Bebidas | 61 | 1,9% | 84,8% | B | 211,40 |
| 16 | Plastificação Identidade | Gráfica Rápida | 57 | 1,8% | 85,8% | B | 438,08 |
| 17 | Edição simples | Lan House & Serv. Digitais | 49 | 1,5% | 86,6% | B | 189,55 |
| 18 | Pé de moleque | Bomboniere & Bebidas | 49 | 1,5% | 87,4% | B | 217,56 |
| 19 | Resultado de exame | Lan House & Serv. Digitais | 41 | 1,3% | 88,1% | B | 214,64 |
| 20 | Revelação de Foto 3x4 (6 fotos) | Gráfica Rápida | 41 | 1,3% | 88,8% | B | 714,64 |

### 1.2 Receita

Resumo das classes:
- **Classe A:** 25 itens geram 79,7% da receita.
- **Classe B:** 39 itens, 15,2%.
- **Classe C:** 73 itens, 5,2%.

| # | Item | Categoria | Receita (R$) | % | % acumulado | Vendas | Qtd |
|---|---|---|---|---|---|---|---|
| 1 | Impressão P/B Balcão | Gráfica Rápida | 6.619,58 | 17,6% | 17,6% | 1.715 | 6.601 |
| 2 | Impressão Preto e Branco (11+ páginas) | Gráfica Rápida | 4.474,62 | 11,9% | 29,4% | 245 | 7.280 |
| 3 | Impressão Colorida | Gráfica Rápida | 2.132,15 | 5,7% | 35,1% | 272 | 1.055 |
| 4 | Acesso a Internet | Lan House & Serv. Digitais | 1.724,80 | 4,6% | 39,6% | 303 | 334 |
| 5 | Envelope Pardo | Gráfica Rápida | 1.385,27 | 3,7% | 43,3% | 547 | 631 |
| 6 | Currículo Novo + PDF | Lan House & Serv. Digitais | 1.187,99 | 3,2% | 46,5% | 76 | 78 |
| 7 | Recebimento de Arquivos | Lan House & Serv. Digitais | 1.180,17 | 3,1% | 49,6% | 1.101 | 1.151 |
| 8 | MEU INSS Recuperação Senha | Serviços Públicos | 1.075,78 | 2,9% | 52,4% | 32 | 33 |
| 9 | Scanner | Gráfica Rápida | 1.053,53 | 2,8% | 55,2% | 138 | 735 |
| 10 | Impressão Papel Fotográfico | Gráfica Rápida | 879,96 | 2,3% | 57,6% | 68 | 128 |
| 11 | Impressão Papel Cartão | Gráfica Rápida | 797,01 | 2,1% | 59,7% | 28 | 140 |
| 12 | Currículo - 5 Folhas | Lan House & Serv. Digitais | 783,02 | 2,1% | 61,8% | 76 | 78 |
| 13 | Plastificação A4 | Gráfica Rápida | 756,19 | 2,0% | 63,8% | 66 | 94 |
| 14 | Revelação de Foto 3x4 | Gráfica Rápida | 714,64 | 1,9% | 65,7% | 41 | 48 |
| 15 | Envio de arquivos | Lan House & Serv. Digitais | 668,97 | 1,8% | 67,4% | 123 | 123 |
| 16 | Contrato de Locação | Lan House & Serv. Digitais | 603,00 | 1,6% | 69,0% | 15 | 16 |
| 17 | Impressão Papel Adesivo | Gráfica Rápida | 593,72 | 1,6% | 70,6% | 24 | 75 |
| 18 | Detran CRLV Digital | Serviços Públicos | 560,08 | 1,5% | 72,1% | 30 | 37 |
| 19 | Suporte ao Cliente | Lan House & Serv. Digitais | 531,31 | 1,4% | 73,5% | 166 | 167 |
| 20 | Consulta SPC Boa Vista Acerta | Serviços Financeiros | 477,86 | 1,3% | 74,8% | 15 | 16 |

### 1.3 Fluxo comparado com receita

| | Receita A | Receita B | Receita C |
|---|---|---|---|
| **Fluxo A** | 10 | 0 | 0 |
| **Fluxo B** | 14 | 12 | 3 |
| **Fluxo C** | 1 | 27 | 70 |

- **Tráfego e receita ao mesmo tempo (A nos dois).** Impressão P&B, Recebimento, Envelope, Internet, Colorida, Scanner, Envio de arquivos, Suporte e Currículo. São a porta de entrada da loja.
- **Muita receita com pouco fluxo (A em receita, B ou C em fluxo).** MEU INSS Recuperação Senha (32 vendas, R$ 1.075,78), Contrato de Locação (15 vendas, R$ 603), Consulta SPC (15 vendas, R$ 477,86), Detran CRLV (30 vendas), Manutenção de celular (11 vendas, R$ 388,79), Transferência Complexa (9 vendas, R$ 315), Papel cartão e Papel adesivo. São os itens de maior valor agregado e o alvo da esteira de vendas (seção 5).
- **Catálogo inchado.** 404 itens cadastrados e só 137 vendidos no período. Eletrônicos & Acessórios tem 101 cadastros e apenas 10 itens vendidos; Bomboniere tem 108 cadastros e 34 vendidos.

### 1.4 Volume acumulado do catálogo antigo

No sistema anterior, o estoque negativo de um serviço é a quantidade vendida desde o início. O total bate com o histórico importado (17.577 unidades contra 18.044 registradas até 30/09). Isso confirma que o sistema anterior também começou em maio/2026.

| Item | Unidades acumuladas |
|---|---|
| Impressão Preto e Branco | 6.955 |
| Impressão P/B Balcão | 5.306 |
| Recebimento de Arquivos | 967 |
| Impressão Colorida | 915 |
| Scanner | 629 |
| Envelope Pardo | 578 |
| Acesso a Internet | 267 |
| Xerox | 164 |
| Suporte ao Cliente | 137 |
| Impressão Papel Fotográfico | 117 |
| Impressão Papel Cartão | 107 |
| Envio de arquivos | 101 |

## 2. Participação das 7 categorias

"Operações" = cada item lançado numa venda (5.929 no total). "Vendas" = atendimentos em que a categoria aparece (3.190 no total; uma venda pode ter várias categorias).

| Categoria | Operações | % operações | Vendas com a categoria | % das vendas | Unidades | % unidades | Receita (R$) | % receita | Valor médio por operação |
|---|---|---|---|---|---|---|---|---|---|
| 1. Gráfica Rápida | 3.222 | 54,3% | 2.500 | 78,4% | 17.051 | 85,2% | 20.104,95 | 53,3% | 6,24 |
| 2. Serviços Públicos | 174 | 2,9% | 160 | 5,0% | 214 | 1,1% | 4.012,19 | 10,6% | 23,06 |
| 3. Lan House & Serv. Digitais | 2.165 | 36,5% | 2.046 | 64,1% | 2.322 | 11,6% | 10.870,11 | 28,8% | 5,02 |
| 4. Informática & Celular | 13 | 0,2% | 13 | 0,4% | 13 | 0,1% | 447,71 | 1,2% | 34,44 |
| 5. Eletrônicos & Acessórios | 17 | 0,3% | 17 | 0,5% | 17 | 0,1% | 474,82 | 1,3% | 27,93 |
| 6. Bomboniere & Bebidas | 323 | 5,4% | 290 | 9,1% | 372 | 1,9% | 1.325,40 | 3,5% | 4,10 |
| 7. Serviços Financeiros | 15 | 0,3% | 15 | 0,5% | 16 | 0,1% | 477,86 | 1,3% | 31,86 |
| **Total** | **5.929** | | **3.190** | | | | **37.713,04** | | |

- **Fluxo.** Gráfica e Lan House somam 90,8% das operações e 82,1% da receita.
- **Valor por operação.** Serviços Públicos, Financeiros e Informática valem 4 a 7 vezes mais por operação (R$ 23 a R$ 34) e somam só 3,4% das operações.
- **Serviços Financeiros.** No balcão aparece só a Consulta SPC (15 vendas). As comissões de crédito entram por fora: R$ 1.957,92 de maio a setembro, cerca de 6% da receita de balcão do mesmo período (R$ 33.631,79).

## 3. Margem e rentabilidade

### 3.1 O que dá para afirmar

- **Margem líquida por item não pode ser calculada com os dados atuais.** Seria preciso o custo real de cada item e o rateio de aluguel, energia, internet e mão de obra (R$ 5.194/mês). Nenhum dos dois existe por item.
- **Margem apurada com dado real.** Só a agregada da gráfica: os insumos comprados de maio a agosto foram 10,1% da receita da gráfica (R$ 0,13 por página impressa). Não inclui toner comprado de outra forma nem manutenção.
- **Margem cadastrada.** É preço de tabela menos o custo cadastrado. O custo veio da planilha do sistema anterior, cobre 37,8% da receita e **não foi verificado**. Alguns valores são incoerentes (ver 3.3).

### 3.2 Itens com maior margem cadastrada

Ordenados pela margem total gerada no período. Valores em R$.

| Item | Categoria | Preço | Custo cadastrado | Margem unitária | Margem % | Unidades | Margem total gerada |
|---|---|---|---|---|---|---|---|
| Envelope Pardo | Gráfica | 2,00 | 1,00 | 1,00 | 50% | 631 | 754,27 |
| Impressão Colorida | Gráfica | 2,00 | 1,50 | 0,50 | 25% | 1.036 | 540,15 |
| MEU INSS Recuperação Senha | Serv. Públicos | 30,00 | 20,00 | 10,00 | 33% | 33 | 415,78 |
| Currículo Novo + PDF | Lan House | 15,00 | 10,00 | 5,00 | 33% | 78 | 407,99 |
| Consulta SPC Boa Vista | Serv. Financeiros | 30,00 | 6,21 | 23,79 | **79%** | 16 | 378,50 |
| Impressão Papel Fotográfico | Gráfica | 6,00 | 5,00 | 1,00 | 17% | 128 | 239,96 |
| Detran CRLV Digital | Serv. Públicos | 15,00 | 10,00 | 5,00 | 33% | 37 | 190,08 |
| Água com gás 500ml | Bomboniere | 4,00 | 1,64 | 2,36 | 59% | 67 | 179,93 |
| Nota fiscal | Serv. Públicos | 30,00 | 7,00 | 23,00 | **77%** | 3 | 69,00 |
| Kit Carregador Gold 3.1 Tipo C | Eletrônicos | 29,90 | 10,90 | 19,00 | 64% | 4 | 79,13 |

Margem média cadastrada no catálogo por categoria:

| Categoria | Itens com custo | Margem média |
|---|---|---|
| Serviços Financeiros | 1 | 79% |
| Eletrônicos | 22 | 54% |
| Bomboniere | 18 | 41% |
| Lan House | 15 | 37% |
| Serviços Públicos | 12 | 36% |
| Gráfica | 12 | 28% |

### 3.3 Itens de margem cadastrada baixa ou custo suspeito

| Item | Preço | Custo cadastrado | Margem | Leitura |
|---|---|---|---|---|
| Revelação de Foto 3x4 | 15,00 | 14,00 | 7% | Se o custo for real, o preço está errado |
| Impressão Papel Adesivo | 7,00 | 6,00 | 14% | Confirmar o custo por folha |
| Papel Fotográfico / Papel Cartão | 6,00 | 5,00 | 17% | Confirmar o custo por folha |
| Scanner | 1,50 | 1,25 | 17% | Digitalizar não consome material. O custo cadastrado parece errado. |
| MEU INSS Desbloqueio Empréstimo | 30,00 | 25,00 | 17% | Serviço sem material: o "custo" pode ser repasse a terceiro |
| Impressão Colorida | 2,00 | 1,50 | 25% | Incoerente com R$ 0,13 de insumo médio por página |

### 3.4 Alta margem ou conveniência

| Grupo | Exemplos | Margem | Peso na receita |
|---|---|---|---|
| **Serviços de alta margem** (sem material) | Consulta SPC (79% cadastrada), Nota fiscal (77%), MEI, gov.br, INSS, Detran, contrato, currículo | Alta: o custo é tempo do atendente. Só SPC e alguns INSS e Detran têm custo cadastrado. | 10,6% (Públicos) + 1,3% (Financeiros) + parte da Lan House |
| **Conveniência** | Água, refrigerante, doces, carregadores | 41% a 59% cadastrada, mas valor unitário baixo (R$ 1,35 a R$ 2,36 de margem) | 3,5% (Bomboniere) + 1,3% (Eletrônicos) |
| **Gráfica** | P&B, colorida, envelope | Insumo apurado de 10,1%; margem de material alta, mas R$ 0,80 por página | 53,3% |

**Conclusão:** em reais por atendimento, um serviço público ou financeiro rende de 10 a 20 vezes a margem de uma água ou de uma página impressa. A conveniência serve para aumentar o ticket de quem já está no balcão, não para gerar lucro sozinha.

## 4. Perfil do cliente e comportamento

| Evidência | Número |
|---|---|
| Vendas de até R$ 5 | 39,6% (1.263 vendas) |
| Vendas de até R$ 10 | 63,0% |
| Vendas acima de R$ 50 | 1,9% (61 vendas) |
| Vendas só de impressão P&B (com ou sem recebimento) | 35,6%, ticket de R$ 5,42 |
| Ticket com serviço digital ou público de maior valor | R$ 23,18 |
| Ticket sem esses serviços | R$ 10,30 |
| Vendas com serviço público, financeiro ou de celular | 188 (5,9%) |
| Dessas, as que também levaram item rápido | 24,5% |
| INSS com impressão junto | 2,4% |
| Peso dos serviços de maior valor por hora do dia | Estável entre 2,4% e 4,6% em todas as horas; pico de movimento entre 10h e 12h |
| Pagamento em dinheiro, vendas de até R$ 5 | 60,5% |
| Pagamento em dinheiro, vendas acima de R$ 20 | 34% a 35% |
| Pix e cartão, vendas acima de R$ 20 | Cerca de 65% |
| Vendas com cliente identificado | 1 em 3.190 |
| Sábado | R$ 97/dia nos últimos 60 dias, contra R$ 252 a R$ 301 nos dias úteis |
| Clientes pagantes por dia (outubro, sistema novo) | 29,5 atendimentos, ticket de R$ 10,64 |

O que isso revela:
1. **Público de resolução rápida.** A maioria entra para imprimir documento (enviado pelo WhatsApp, por isso Recebimento em 34,5% das vendas) e sai em minutos, pagando em dinheiro.
2. **Necessidade escondida.** Quem imprime documento costuma estar no meio de um processo: emprego, INSS, Detran, aluguel, matrícula. Esse processo é o serviço de maior valor que a loja já vende, mas ele aparece em só 5,9% das vendas.
3. **Comprador de serviço de maior valor quase não é reaproveitado.** Só 24,5% levam outro item e só 2,4% dos clientes de INSS imprimem algo.
4. **Sem identificação de cliente não há recompra.** A loja não sabe quem voltou, quem é MEI, quem é aposentado (perfil de consignado) nem quem imprime em volume.
5. **Indício de cliente MEI e empresa.** DAS MEI (11 vendas), Nota fiscal (3), Abertura de MEI (2), Cadastro Nota Fiscal Prefeitura (1) e as 35 vendas de 50+ páginas sugerem pequenos empresários entre os clientes, ainda sem oferta recorrente.

## 5. Esteira de vendas (cross-sell)

Princípio: oferecer o próximo passo do processo que o cliente já está resolvendo, nunca condicionar um serviço ao outro. No crédito, oferecer simulação só com consentimento e registro (LGPD).

### 5.1 Gatilhos de entrada e o serviço de maior valor a oferecer

| Cliente de entrada (gatilho nos dados) | Volume hoje | Pergunta no balcão | Serviço de maior valor | Preço de tabela hoje |
|---|---|---|---|---|
| Imprimiu ou recebeu documento pessoal (RG, comprovante, laudo) | 1.715 vendas de P&B balcão | "Isso é para INSS, Detran ou algum cadastro? A gente resolve aqui." | INSS, Detran, gov.br, 2ª via CPF | R$ 10 a R$ 50 |
| Aposentado ou pensionista em serviço de INSS | 42 vendas de INSS; 6 de "Desbloqueio INSS Empréstimo" | "Quer saber quanto tem de margem consignável? A simulação é gratuita." | Consignado, portabilidade, refinanciamento | Comissão média de R$ 652,64 por contrato |
| Consultou SPC | 15 vendas | "Quer ver opções de crédito ou de regularizar a dívida?" | Empréstimo, limpa nome, cartão | Comissão |
| Pagou DAS MEI ou emitiu nota | 11 + 3 vendas | "Quer que a gente cuide do DAS todo mês e da declaração anual?" | Pacote MEI mensal, DASN-SIMEI, IRPF | DAS R$ 9,50; Abertura MEI R$ 50; IR R$ 15 (vendido a R$ 25) |
| Imprimiu muitas páginas (50+) | 35 vendas | "É para a empresa? Tenho pacote mensal com preço menor." | Pacote de impressão pré-pago e cadastro de empresa | R$ 0,40 a R$ 0,50/página |
| Fez currículo | 170 vendas | "Quer que eu cadastre seu currículo em sites de emprego?" Para quem conseguiu emprego: CTPS digital, gov.br | Cadastro Emprego (R$ 20), gov.br | R$ 20 a R$ 50 |
| Tomou água ou usou o computador | 290 e 305 vendas | Cartaz no balcão com "Resolvemos aqui: INSS, Detran, MEI, IR, crédito" | Qualquer serviço público ou financeiro | |
| Trocou ou consertou celular | 13 vendas | "Quer backup e conta Google configurada?" | Backup e configuração (R$ 50); película e carregador | R$ 30 a R$ 50 |

### 5.2 Estratégias

1. **Cartaz e frase única no caixa.** "Além de imprimir, resolvemos INSS, Detran, MEI, Imposto de Renda e crédito consignado." Essa é a ponte entre o fluxo da classe A e os itens de alto valor. Esforço baixo; vale do primeiro dia.
2. **Cadastro mínimo do cliente** (nome, WhatsApp, autorização de contato) em vendas de R$ 20 ou mais, INSS, SPC, MEI e impressões grandes. Sem isso não há esteira nem remarketing.
3. **Funil Speed Financeira.** Toda venda de INSS, SPC ou "Desbloqueio de empréstimo" gera uma linha no funil, com consentimento. Retorno pelo WhatsApp em 48 horas com a simulação.
   - Meta: 5 simulações por semana e 1 contrato por mês, equivalente a cerca de R$ 650/mês de comissão, pela média observada.
4. **Pacote MEI recorrente.** DAS mensal, nota fiscal, DASN anual e IR do titular, oferecido a quem já pagou DAS na loja. É receita previsível. Rever o preço do IRPF: o cadastro diz R$ 15 e a única venda foi de R$ 25, abaixo de Abertura de MEI (R$ 50) e MEU INSS Cadastro (R$ 49).
5. **Calendário de picos de serviço público.** Divulgar no período certo:
   - **IRPF:** março a maio.
   - **IPVA e licenciamento:** início do ano e calendário do Detran-MG.
   - **DASN-SIMEI:** até maio.
   - **Prova de vida do INSS:** ao longo do ano.
6. **Conveniência como ponte, não como produto.** Água e doce no caixa sobem o ticket de quem já pagou. Os 101 cadastros de eletrônicos com 10 itens vendidos indicam catálogo para enxugar: manter só cabos, carregadores e películas que giram.
7. **Pacote de impressão para empresas.** Pré-pago de 500 ou 1.000 páginas para contabilidades, imobiliárias, escritórios e igrejas, com cadastro do cliente. Uma empresa que compra impressão é candidata a nota fiscal, MEI e crédito para capital de giro.

### 5.3 Metas da esteira (estimativas)

| Indicador | Hoje | Meta em 30 dias |
|---|---|---|
| Vendas com serviço público, financeiro ou de celular | 5,9% das vendas (cerca de 1,4/dia) | 9% (cerca de 2,7/dia) |
| Ticket médio | R$ 10,64 por atendimento | R$ 13,33 (equivale a R$ 400/dia com 30 atendimentos) |
| Simulações financeiras com consentimento | sem registro | 20/mês |
| Contratos financeiros | cerca de 0,6/mês (3 em 5 meses) | 1,5/mês |
| Clientes identificados | 1 venda | todas as vendas de R$ 20 ou mais |

## 6. Limitações

1. **Custos.** Margem líquida por item exige o custo real e o rateio das despesas fixas, que não existem por item. Os custos cadastrados não foram verificados.
2. **Receita por item com rateio.** De maio a setembro, a receita por item em vendas com vários itens foi rateada pelo importador do sistema anterior: 52,6% da receita por item vem desse rateio. O total de cada venda é exato.
3. **Estoque.** Eletrônicos e bomboniere não têm controle de estoque confiável: quase todos os itens estão com estoque zero ou negativo. Não dá para medir capital parado.
4. **Período anterior.** O histórico antigo do NexCafé (2022 a 2024) está sendo recuperado em outra sessão e não entra nesta auditoria.
