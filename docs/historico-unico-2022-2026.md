# Histórico único de vendas da loja (dez/2022 a out/2026)

Gerado em 17/10/2026. Junta quatro fontes num único quadro mensal. Nada foi importado no sistema e nenhum arquivo de origem foi alterado.
Dados em planilha: `historico-unico-2022-2026.csv` (nesta pasta), com todas as colunas de cada fonte.

## 1. Fontes e o que cada uma cobre

| Fonte | Onde está | Período | O que registra | O que não registra |
|---|---|---|---|---|
| **NexCafé** (programa da lan house) | Backup `D:\Sistema Nexcafe\20260924_1051`, extraído em `D:\Sistema Nexcafe\_nexcafe_extraido\` | 29/12/2022 a 24/09/2026 | Até ago/2023: **tudo** (tempo de máquina, balcão e impressão). De jan/2024 em diante: quase só tempo de máquina e impressão da estação. | Forma de pagamento. Balcão a partir de 2024. |
| **Caixas recuperados** (cópias do NexCafé no Google Drive) | `_nexcafe_extraido\caixas-recuperados-ago-out-2023.csv` | 12/08 a 19/10/2023 | Total recebido em cada fechamento de caixa | Itens vendidos. Inclui recargas de tempo e pagamentos de fiado (por isso o valor é estimado). |
| **SumUp** (maquininha) | Área de Trabalho: `relatorio-vendas-2025-07-01_2026-07-30.csv` (o `.xlsx` de mesmo conteúdo é cópia) | 01/07/2025 a 30/07/2026 | Cada pagamento na maquininha: Pix, débito, crédito e pouco dinheiro (7.097 vendas) | Itens vendidos. Quase todo o dinheiro em espécie. O arquivo começa em 01/07/2025 porque foi exportado com esse filtro; a conta SumUp pode ter meses anteriores. |
| **Planilhas de gestão** | Google Drive: `Planilha Março/Abril/Maio_Gestao_Profissional_LOJA NOVA.xlsx` | Março a 16/05/2026 | Total de cada dia por forma de pagamento | Itens. Em março, Pix e cartão só até 24/03; em abril e maio, só dinheiro. Fevereiro está vazio. |
| **Sistema atual** | `LanHouseManager/server/data` | 04/05/2026 a hoje | Tudo: itens, forma de pagamento, cliente | De 04/05 a 30/09 são as vendas importadas do app do AI Studio. Desde 01/10, lançadas direto no sistema. |

## 2. Como foi escolhido o "melhor número" de cada mês

As fontes **não podem ser somadas** onde se sobrepõem. O tempo de máquina do NexCafé, por exemplo, também pode ter sido pago na SumUp. Em cada mês vale a fonte mais completa:

1. Dez/2022 a jul/2023: NexCafé (completo).
2. Ago/2023: NexCafé (1 a 11/08) + caixas recuperados (12 a 31/08).
3. Set/2023 e out/2023 (até dia 19): caixas recuperados.
4. Jan/2024 a nov/2024 e mar/2025 a jun/2025: só existe o NexCafé, que nessa fase registrava só a lan house. **É um piso**: o balcão não está aí.
5. Jul/2025 a fev/2026: SumUp. **É um piso**: falta o dinheiro em espécie.
6. Mar/2026: planilha de gestão (dinheiro do mês todo; Pix e cartão de 1 a 24) + SumUp (Pix e cartão de 25 a 31).
7. Abr/2026: dinheiro da planilha + Pix e cartão da SumUp.
8. Mai/2026 em diante: sistema atual.

**Conferência que valida o item 6:** de 1 a 24/03/2026, a planilha registra R$ 2.472,51 em Pix e R$ 3.385,14 em cartão, e a SumUp R$ 2.594,60 e R$ 3.363,24. A diferença é de 5% no Pix e menos de 1% no cartão.

## 3. Mês a mês

Colunas por fonte em reais. Vazio = a fonte não cobre o mês.

| Mês | Melhor número | Cobertura | Fonte usada | NexCafé | Caixas recuperados | SumUp | Planilha de gestão | Sistema atual |
|---|---|---|---|---|---|---|---|---|
| dez/2022 | R$ 872,64 | Completo (desde 29/12) | NexCafé | 872,64 |  |  |  |  |
| jan/2023 | R$ 11.799,02 | Completo | NexCafé | 11.799,02 |  |  |  |  |
| fev/2023 | R$ 11.266,95 | Completo | NexCafé | 11.266,95 |  |  |  |  |
| mar/2023 | R$ 12.776,26 | Completo | NexCafé | 12.776,26 |  |  |  |  |
| abr/2023 | R$ 10.545,13 | Completo | NexCafé | 10.545,13 |  |  |  |  |
| mai/2023 | R$ 12.136,82 | Completo | NexCafé | 12.136,82 |  |  |  |  |
| jun/2023 | R$ 11.206,80 | Completo | NexCafé | 11.206,80 |  |  |  |  |
| jul/2023 | R$ 12.022,32 | Completo | NexCafé | 12.022,32 |  |  |  |  |
| ago/2023 | R$ 10.474,08 | Completo (estimado) | NexCafé (1 a 11) + caixas recuperados (12 a 31) | 4.614,54 | 5.859,54 |  |  |  |
| set/2023 | R$ 10.641,38 | Completo (estimado) | Caixas recuperados |  | 10.641,38 |  |  |  |
| out/2023 | R$ 6.893,73 | Parcial: 19 dias | Caixas recuperados (1 a 19) |  | 6.893,73 |  |  |  |
| nov/2023 | - | Sem registro | - |  |  |  |  |  |
| dez/2023 | - | Sem registro | - |  |  |  |  |  |
| jan/2024 | R$ 2.403,31 | Parcial: só lan house | NexCafé | 2.403,31 |  |  |  |  |
| fev/2024 | R$ 1.073,35 | Parcial: só lan house | NexCafé | 1.073,35 |  |  |  |  |
| mar/2024 | R$ 1.464,80 | Parcial: só lan house | NexCafé | 1.464,80 |  |  |  |  |
| abr/2024 | R$ 1.446,10 | Parcial: só lan house | NexCafé | 1.446,10 |  |  |  |  |
| mai/2024 | R$ 1.351,48 | Parcial: só lan house | NexCafé | 1.351,48 |  |  |  |  |
| jun/2024 | R$ 1.261,18 | Parcial: só lan house | NexCafé | 1.261,18 |  |  |  |  |
| jul/2024 | R$ 1.489,10 | Parcial: só lan house | NexCafé | 1.489,10 |  |  |  |  |
| ago/2024 | R$ 1.937,45 | Parcial: só lan house | NexCafé | 1.937,45 |  |  |  |  |
| set/2024 | R$ 1.572,18 | Parcial: só lan house | NexCafé | 1.572,18 |  |  |  |  |
| out/2024 | R$ 1.406,38 | Parcial: só lan house | NexCafé | 1.406,38 |  |  |  |  |
| nov/2024 | R$ 1.069,40 | Parcial: só lan house | NexCafé | 1.069,40 |  |  |  |  |
| dez/2024 | - | Sem registro | - |  |  |  |  |  |
| jan/2025 | - | Sem registro | - |  |  |  |  |  |
| fev/2025 | - | Sem registro | - |  |  |  |  |  |
| mar/2025 | R$ 137,80 | Parcial: só lan house (4 dias) | NexCafé | 137,80 |  |  |  |  |
| abr/2025 | R$ 1.382,80 | Parcial: só lan house | NexCafé | 1.382,80 |  |  |  |  |
| mai/2025 | R$ 1.629,40 | Parcial: só lan house | NexCafé | 1.629,40 |  |  |  |  |
| jun/2025 | R$ 1.693,90 | Parcial: só lan house | NexCafé | 1.693,90 |  |  |  |  |
| jul/2025 | R$ 6.332,81 | Parcial: só maquininha | SumUp | 1.558,30 |  | 6.332,81 |  |  |
| ago/2025 | R$ 6.343,05 | Parcial: só maquininha | SumUp | 1.514,18 |  | 6.343,05 |  |  |
| set/2025 | R$ 5.518,74 | Parcial: só maquininha | SumUp | 1.428,78 |  | 5.518,74 |  |  |
| out/2025 | R$ 5.990,35 | Parcial: só maquininha | SumUp | 1.483,50 |  | 5.990,35 |  |  |
| nov/2025 | R$ 5.388,32 | Parcial: só maquininha | SumUp | 1.575,40 |  | 5.388,32 |  |  |
| dez/2025 | R$ 5.129,22 | Parcial: só maquininha | SumUp | 1.255,70 |  | 5.129,22 |  |  |
| jan/2026 | R$ 4.869,40 | Parcial: só maquininha | SumUp | 1.277,70 |  | 4.869,40 |  |  |
| fev/2026 | R$ 5.372,20 | Parcial: só maquininha | SumUp | 1.298,90 |  | 5.372,20 |  |  |
| mar/2026 | R$ 12.815,15 | Completo (estimado) | Planilha + SumUp (Pix e cartão de 25 a 31) | 1.701,90 |  | 7.402,34 | 11.370,65 |  |
| abr/2026 | R$ 11.149,94 | Completo (estimado) | Planilha (dinheiro) + SumUp (Pix e cartão) | 1.949,30 |  | 6.385,94 | 4.981,20 |  |
| mai/2026 | R$ 8.096,07 | Completo (desde 04/05) | Sistema atual | 1.694,70 |  | 5.155,59 | 2.017,00 | 8.096,07 |
| jun/2026 | R$ 6.772,36 | Completo | Sistema atual | 1.221,80 |  | 6.138,88 |  | 6.772,36 |
| jul/2026 | R$ 6.722,31 | Completo | Sistema atual | 1.244,30 |  | 6.366,82 |  | 6.722,31 |
| ago/2026 | R$ 6.072,70 | Completo | Sistema atual | 1.418,10 |  |  |  | 6.072,70 |
| set/2026 | R$ 5.946,35 | Completo | Sistema atual | 810,80 |  |  |  | 5.946,35 |
| out/2026 | R$ 4.080,00 | Parcial: até 17/10 | Sistema atual |  |  |  |  | 4.080,00 |

Em abril/2026 a coluna "Planilha de gestão" soma Pix, cartão e dinheiro digitados; a própria planilha mostra R$ 3.941,20 porque a fórmula do total deixou alguns dias de fora.

## 4. Meses com número completo

| Período | Meses | Média por mês |
|---|---|---|
| Jan a jul/2023 (NexCafé) | 7 | R$ 11.679,04 |
| Ago e set/2023 (com caixas recuperados) | 2 | R$ 10.557,73 |
| Mar e abr/2026 (planilha + SumUp) | 2 | R$ 11.982,55 |
| Jun a set/2026 (sistema atual) | 4 | R$ 6.378,43 |

## 5. Pontos de atenção

1. **A queda de mar e abr/2026 para mai a set/2026 pede conferência.** Março e abril estimados ficam acima de R$ 11 mil. De junho a setembro, o sistema registra cerca de R$ 6,4 mil por mês. Nos meses em que as duas fontes existem, a maquininha recebeu mais em Pix e cartão do que o sistema registrou:

   | Mês | Sistema: Pix + cartão | SumUp: Pix + cartão | Diferença |
   |---|---|---|---|
   | Mai/2026 | R$ 4.057 | R$ 5.155 | R$ 1.098 |
   | Jun/2026 | R$ 4.264 | R$ 5.329 | R$ 1.065 |
   | Jul/2026 | R$ 4.114 | R$ 5.443 | R$ 1.329 |

   Pode ser venda passada na maquininha e não lançada no PDV, ou dinheiro que entra na maquininha sem ser venda da loja (por exemplo, da Speed Financeira). Vale conferir alguns dias no extrato da SumUp.

2. **Lacunas sem nenhum registro:** nov e dez/2023, dez/2024 a fev/2025, e o balcão de jan/2024 a jun/2025.

3. **De jul/2025 a fev/2026 o número é piso.** A SumUp não tem o dinheiro em espécie. Nos meses completos de 2026, o dinheiro foi de 35% a 50% da receita, mas a proporção varia demais para estimar com segurança.

4. **DoWay (ERP Prata), o sistema usado antes do app do AI Studio.** O catálogo exportado dele tem produtos cadastrados em 10/01/2025, então é provável que ele tenha as vendas detalhadas de jan/2025 a mai/2026, justamente o período mais fraco deste quadro. A licença está vencida desde 10/06/2026 e o site bloqueia todas as telas, inclusive relatórios, até o pagamento (R$ 69,90/mês). Não há programa nem banco do DoWay neste computador, e o histórico do Chrome guarda só 90 dias, então não mostra downloads antigos dele.

   Lugares já conferidos sem achar nenhuma exportação do DoWay:
   - discos C: e D:;
   - pasta "Recebimento de Arquivos" (os downloads do Chrome vão para lá desde abr/2026);
   - Lixeira do Windows (a pasta `D:\Copy`, destino dos downloads de jan a mai/2026, foi apagada já vazia);
   - pendrive E: (vazio);
   - busca no Google Drive por "doway", "Perc. lucro" e por todas as planilhas de nov/2024 a jun/2026;
   - varredura do Drive inteiro: 706 planilhas, CSV, ZIP e textos até jun/2026, nenhum do DoWay;
   - lixeira do Google Drive.

   Caminhos para recuperar:
   - pedir ao suporte do DoWay a exportação das vendas;
   - ou reativar por um mês, exportar o relatório de vendas e cancelar.

5. **Antes de dez/2022 só há volume de impressão, não valor.** A planilha `Documentos Lan\Controle de Impressoes e xerox novo.xlsx`, no Drive, traz o contador diário das copiadoras de jun/2020 a ago/2022: páginas de xerox e de impressão, sem valores em reais.

6. **SumUp anterior a jul/2025.** O arquivo começa em 01/07/2025 só por causa do filtro da exportação. Exportar de novo desde o início da conta pode cobrir o primeiro semestre de 2025.
