# Estudo de Diretórios e Citações Locais — Speed Financeira

**Data do estudo:** 07/11/2026
**Fontes:** `Controle_Diretorios_Speed_2026-11-07.csv` e `.docx` (seções 1 a 12), `painel_correcao_diretorios.html`, `Roteiro_Correcoes_NAP.md`
**Escopo:** 44 itens mapeados no controle — fichas em diretórios de terceiros, canais próprios, menções e cadastros previstos
**Método:** auditoria documental sobre os dados registrados. **Nenhuma ficha foi aberta ao vivo nesta análise**, conforme definido. Onde os dois arquivos de controle divergem, o conflito está sinalizado e não foi resolvido por presunção.

---

## 1. Sumário executivo

O mapa de diretórios da Speed está **mais completo do que saudável**. O controle de 07/11 fez o trabalho difícil — encontrou fichas esquecidas, telefones mortos e duplicidades — mas os indicadores do painel medem **linhas de planilha, não a saúde do NAP**. Corrigida a contagem, o cenário é este:

| Indicador | Resultado | Leitura |
|---|---|---|
| Itens mapeados | 44 | 6 canais próprios, 28 fichas de terceiros, 3 menções, 7 a cadastrar |
| Fichas de terceiros realmente existentes | 25 | 3 itens do mapa não são ficha ativa (404, link morto, cadastro irrelevante) |
| Fichas de terceiros auditadas | 21 | 4 seguem sem verificação |
| **NAP núcleo correto** (telefone + endereço + CEP) | **10 de 21 = 47,6%** | Metade das citações está correta no essencial |
| **Fichas com telefone desativado no ar** | **8 de 21 = 38,1%** | 3113-0458 ou 3067-4361 publicados |
| **Identidade completa** (NAP + nome padrão + site próprio + horário único) | **0 de 21 = 0%** | Problema sistêmico, não de ficha isolada |
| Duplicidades ativas | 6 fichas excedentes em 5 diretórios | Solutudo, TeleListas, Cylex, Página Amarela, Planeta Brasileiro |
| Fichas incompletas | 1 (Zapia) | Sem telefone, sem horário, categoria errada |
| Cadastros novos previstos | 7 | Reclame Aqui é o mais crítico |
| Acessos de edição confirmados | 0 de 36 | O CSV diz "login: sim" em vários; o DOCX diz que nenhum acesso está confirmado |

### Os sete achados que importam

1. **O número (35) 3113-0458 continua no ar em 8 fichas** e em pelo menos um post do Instagram. Não é um resíduo: é o telefone que uma parcela relevante dos clientes que chegam por diretório ainda recebe.
2. **A UENI é o pior caso e não foi resolvida.** Quatro botões apontam para `wa.me/553531130458`. Todo visitante daquele site é mandado para um WhatsApp morto — 100% de perda naquele canal.
3. **"44 fichas" é uma contagem inflada.** Só 25 fichas de terceiros existem e são relevantes. O número superestima cobertura e dilui a prioridade.
4. **O painel diz "10 fichas 100% corretas". Nenhuma está 100%.** As 10 têm NAP núcleo correto, mas 4 carregam defeito secundário confirmado (site apontando para terceiro, nome antigo, horário divergente) e as demais divergem no horário.
5. **O nome padrão do DOCX não é usado em nenhuma ficha de forma exata.** A base se divide entre "Speed Lan House", "Speed Financeira e Lan House" e variações longas. Isso explica por que o NAP "núcleo" subiu e a percepção de consistência não.
6. **Há seis horários diferentes publicados.** Enquanto o dono não decidir um, cada correção de horário será desfeita na próxima reimportação — e o Google é a fonte que os diretórios copiam.
7. **Os dois arquivos de controle se contradizem sobre o site oficial.** O CSV diz "CEP 37002-090 correto, status OK"; o DOCX diz que o site publica CEP 37010-000 (Avenida Benjamin Constant) e razão social divergente da Receita. Um dos dois está errado, e essa é a fonte que alimenta as citações.

---

## 2. O universo real: por que o "44" engana

Os 44 itens não são 44 diretórios. São quatro camadas com funções diferentes, e misturá-las distorce qualquer índice:

| Camada | Qtd. | O que é | Deve entrar no índice NAP? |
|---|---|---|---|
| Canais próprios | 6 | Google, Bing, Facebook, Instagram, Apple, site | Parcialmente. O Google é a **fonte**, não uma citação |
| Fichas de terceiros | 28 | Diretórios e agregadores | **Sim** — é aqui que NAP se mede |
| Menções | 3 | Infobel, InfoisInfo, SmartScrapers | Só se confirmadas como ficha da Speed |
| A cadastrar | 7 | Ainda não existem | Não |

Das 28 fichas de terceiros, **3 não são ficha ativa**:

- **Cylex 13608995** — retorna 404. Deve sair do plano.
- **Spotway** — o link cai na home do portal; não há ficha localizável.
- **Portal do Representante** — cadastro de representante comercial, sem telefone e sem endereço. Não é citação local.

Sobram **25 fichas existentes e relevantes**. Dessas, **4 nunca foram verificadas**: Cybo, AppLocal, YellowPages e Moovit. A base auditável, portanto, é **21 fichas**.

> **Consequência prática:** qualquer meta baseada em "44 fichas corrigidas" é inatingível por definição. A meta correta é sobre 21 fichas auditadas + 4 a verificar + 7 a criar.

---

## 3. Índice de consistência NAP

### 3.1 Metodologia

Para não repetir o erro do painel, o índice separa três coisas:

| Índice | O que mede | Para que serve |
|---|---|---|
| **NAP núcleo** | Telefone, endereço e CEP conferem com o padrão | Saúde da citação |
| **Erro crítico** | Ficha publica telefone desativado | Risco imediato de perda de cliente |
| **Identidade completa** | NAP + nome padrão + site próprio + horário único | Consistência real da marca |

Campos de horário e nome só pontuam quando há decisão oficial — hoje não há.

### 3.2 Resultado sobre as 21 fichas auditadas

| Situação | Qtd. | % | Fichas |
|---|---|---|---|
| OK no núcleo | 5 | 23,8% | Solutudo 1, TeleListas 1, Cylex 11934350, Cylex 12279811, Wanderlog |
| OK no núcleo com ressalva secundária | 5 | 23,8% | Cylex 13008709, Página Amarela 1, Lista Mais, Encontra Varginha, Localo |
| **Erro confirmado de NAP** | **8** | **38,1%** | Bendito Guia, Brasil Locais, Planeta Brasileiro 1, Solutudo 2, TeleListas 2, eGuias, UENI, EmpresaFone |
| Duplicada ativa | 2 | 9,5% | Planeta Brasileiro 2, Página Amarela 2 |
| Incompleta | 1 | 4,8% | Zapia Digital |

- **NAP núcleo:** 10/21 = **47,6%**
- **Identidade completa:** 0/21 = **0%**
- **Erro crítico:** 8/21 = **38,1%**

### 3.3 Por que 47,6% e não 18,2%

O `Roteiro_Correcoes_NAP.md` falava em subir de 18,2% para ~40%. A diferença não é melhora real: é **mudança de régua**. Os 18,2% provavelmente mediam identidade completa (nome + NAP + site), e nesse critério o resultado de hoje continua praticamente igual — nenhuma ficha usa o nome padrão de forma exata. O NAP estrito (telefone/endereço/CEP) é que está em 47,6%. Os dois números devem ser reportados separados, senão a evolução vira ficção.

---

## 4. Erros confirmados — a fila P0

Oito fichas publicam telefone desativado. Sete delas são corrigíveis sem criar conta nova; a UENI e a EmpresaFone dependem de acesso ao painel.

| # | Diretório | Erro confirmado | Canal de correção | Acesso |
|---|---|---|---|---|
| 1 | **UENI** | 4 botões → `wa.me/553531130458`; número correto não aparece na página | Painel UENI | Sim (conta antiga) |
| 2 | **Solutudo (ficha 2)** | 3113-0458 no ar, sem horários, duplicada da 23132000 | WhatsApp do suporte | Sim |
| 3 | **eGuias** | Imóvel **6969** (correto: 696) e 3113-0458 no título | Botão público "alterar cadastro" | Testar |
| 4 | **EmpresaFone** | 3113-0458; endereço e CEP corretos | Painel EmpresaFone | Sim |
| 5 | **Planeta Brasileiro 1** | 3113-0458 + horário 07:30–22:00 todos os dias + site no Spotway | "Sugerir uma alteração" | Não |
| 6 | **Bendito Guia** | 3113-0458 | Canal de sugestão | A confirmar |
| 7 | **Brasil Locais** | 3113-0458; **2 avaliações** de clientes | Reivindicar a ficha | A confirmar |
| 8 | **Instagram** (não é ficha) | Publicação divulga 3113-0458; bio a trocar para `wa.me/553530675017` | Painel | Sim |

### Correção que não é de telefone, mas está na mesma fila

- **Zapia Digital** — sem telefone, horários todos "Confirmar" e categoria "assistência técnica de informática". Para uma financeira, categoria errada é pior que campo vazio: atrai a demanda errada e não aparece nas buscas certas.

---

## 5. Duplicidades

São **6 fichas excedentes em 5 diretórios**. A regra do DOCX está correta e deve ser mantida: **nunca apagar a duplicada — pedir mesclagem**, senão avaliações e histórico se perdem.

| Diretório | Fichas | Excedente | Observação |
|---|---|---|---|
| Solutudo | 23132000 (matriz) + 22353545 | 1 | Excedente tem telefone morto; mesclar urgente |
| TeleListas | bu-21209255 (matriz) + bu-20063351 | 1 | Excedente tem **3067-4361**, outro número morto |
| Cylex | 11934350, 12279811, 13008709, 13608995 | 2 ativas (1 é 404) | 13608995 é 404; 12279811 provavelmente já mesclada; 13008709 aponta site para o Localo |
| Página Amarela | 13363568 + 13354263 | 1 | Portal bloqueia robô; conferir manualmente |
| Planeta Brasileiro | 2 fichas | 1 | A segunda não tem URL registrada |

**Custo de não mesclar:** o mesmo negócio aparece várias vezes com dados diferentes no mesmo portal. Isso não é só feiúra — enfraquece a confiança da citação e divide avaliações.

---

## 6. Não verificados, inexistentes e fora do perfil

| Item | Situação | Decisão recomendada |
|---|---|---|
| Cybo | Nunca verificado; só há listagem regional | Localizar a ficha individual antes de qualquer ação |
| AppLocal | Bloqueio de robô | Abrir manualmente, conferir e reivindicar gestão |
| YellowPages | Telefone 3221-5809 não retorna nenhuma empresa de Varginha | **Confirmar se a ficha é mesmo da Speed antes de corrigir** |
| Moovit | Ponto de referência no mapa | Conferir posição do alfinete; baixo impacto |
| Infobel | Servidor recusa leitura automatizada | Verificar e reivindicar |
| Cylex 13608995 | 404 | Remover do plano |
| Spotway | Link cai na home | Procurar no site; se não existir, fechar o item |
| Portal do Representante | Sem telefone nem endereço | Avaliar remoção |
| InfoisInfo | Link aponta para a Lan House Autorama (outra empresa) | Fechar o item |
| SmartScrapers | Base de terceiros | Apenas monitorar |

---

## 7. Decisões que bloqueiam a correção

Estas não se resolvem editando ficha. Enquanto o dono não decidir, a correção de hoje volta na próxima reimportação.

### 7.1 Nome de exibição — a decisão mais importante

O DOCX define como padrão:

> **Speed Financeira – Empréstimo Consignado e Financiamento em Varginha**

Nenhuma ficha usa isso literalmente. Na prática convivem:

- **"Speed Lan House" / "Speed Financeira e Lan House"** — maioria das fichas antigas
- **variações longas** — Solutudo, Lista Mais, Localo, Wanderlog
- **"Speed Financeira"** — site e domínio

**Recomendação:** adotar **"Speed Financeira e Lan House"** como nome de exibição único.

Por quê:

1. O estudo de palavras-chave do próprio projeto coloca **impressão/xerox, foto 3x4, lan house e informática** no primeiro nível de prioridade local. Retirar "Lan House" do nome abandona exatamente a demanda que já existe e que a concorrência na mesma rua disputa.
2. É curto o suficiente para caber em qualquer diretório sem truncamento.
3. Evita o risco do nome longo: o Google desaconselha **termos promocionais ou de palavra-chave no nome do perfil**. "Empréstimo Consignado e Financiamento" no nome é exatamente isso. Usar esse nome em todas as fichas pode gerar sugestões de edição de terceiros e, no limite, suspensão do perfil.
4. A intenção financeira deve ir em **categoria e descrição**, não no nome.

**Alternativa:** separar as marcas ("Speed Financeira" para crédito, "Speed Lan House" para serviços digitais). Só faz sentido se houver intenção de dois perfis no Google — o que duplicaria o problema de NAP. Não recomendo agora.

> ⚠️ O `Roteiro_Correcoes_NAP.md` e o DOCX mandam replicar o nome longo. Esta recomendação **contraria** esses documentos e precisa de aprovação explícita antes de virar execução.

### 7.2 Horário — seis versões no ar

| Fonte | Seg–Sex | Sábado |
|---|---|---|
| Google e Localo | 08:00–18:00 | 09:00–12:30 |
| Site oficial | 08:00–18:00 | 08:00–12:00 |
| Cylex, TeleListas, Solutudo, Página Amarela | 08:00–18:30 | 09:00–13:00 |
| Lista Mais | 08:00–18:45 | 09:00–13:45 |
| Planeta Brasileiro | 07:30–22:00 **todos os dias, inclusive domingo** | idem |

**Ação:** definir o horário real com o dono, corrigir **primeiro no Google** (é a fonte que os diretórios reimportam) e só depois replicar. Domingo fechado é informação crítica: publicar "aberto" e estar fechado gera avaliação negativa.

### 7.3 Razão social e CEP no site

- O site declara **"Speed Financeira Promotora de Crédito Ltda"**; a Receita, para o CNPJ 29.497.887/0001-57, retorna **"Gleison Kleber dos Santos — empresário individual"**.
- O site publica **CEP 37010-000** (Avenida Benjamin Constant), não 37002-090 (Rua Santa Cruz).
- **Mas o CSV de 07/11 diz que o site está com CEP 37002-090 correto e "status OK".** Os dois arquivos não podem estar certos.

**Ação:** abrir o site e conferir rodapé e página de contato. É uma verificação de dois minutos e resolve a contradição. Até lá, o site deve ser tratado como **não conforme**.

### 7.4 Site de destino

Duas fichas apontam para terceiros: **Cylex 13008709 → Localo** e **Planeta Brasileiro 1 → Spotway**. Padronizar tudo em `https://speedfinanceira.com.br`. Citação que aponta para portal de terceiro transfere autoridade para quem não deveria recebê-la.

---

## 8. Risco e impacto

| Risco | Exposição | Gravidade |
|---|---|---|
| Cliente liga para número morto | 8 fichas + 1 post; UENI perde 100% do tráfego dela | **Alta** |
| Consistência de citação | 38% das fichas auditadas com erro; sinais contraditórios para o Google | **Alta** |
| Reputação financeira | Reclame Aqui ausente; reputação se decide lá | **Alta** |
| Perda de avaliações na mesclagem | Brasil Locais (2), Google (209–212) | Média |
| Reimportação desfaz correção | Horário e nome sem decisão oficial | **Alta** |
| Acesso | 0 de 36 acessos confirmados no DOCX | **Alta (bloqueador)** |
| Categoria errada (Zapia) | Atrai demanda de informática, não de crédito | Média |
| Ficha de outra empresa (InfoisInfo) | Confusão de marca | Baixa |

**Sobre o Google:** a inconsistência de citações não derruba ranking sozinha, mas corrói um dos sinais de confiança que sustentam o pacote local. O ativo real da Speed é o perfil com **4,8 e 209–212 avaliações** — ele é a âncora. Toda ficha deve espelhar o Google, e o Google deve estar certo primeiro.

**Sobre a estratégia:** o gargalo não é cobertura (25 fichas relevantes é razoável para Varginha), é **verdade única**. Criar os 7 cadastros novos antes de resolver os 8 erros só multiplicaria a divergência — o próprio DOCX já diz isso na seção 8, e está correto.

---

## 9. Plano de ação priorizado

### P0 — hoje/48h: parar de mandar cliente para número morto

| # | Ação | Onde | Dono | Prazo |
|---|---|---|---|---|
| 1 | Corrigir ou tirar do ar a **UENI** | Painel UENI | — | Hoje |
| 2 | Mesclar **Solutudo 22353545** na 23132000 | WhatsApp suporte | — | Hoje |
| 3 | Corrigir **eGuias** (696 e telefone) e vincular conta | Botão público | — | 24h |
| 4 | Corrigir telefone na **EmpresaFone** | Painel | — | 24h |
| 5 | **Planeta Brasileiro 1**: telefone + horário + site | Sugerir alteração | — | 48h |
| 6 | **Bendito Guia** e **Brasil Locais**: telefone | Sugestão / reivindicação | — | 48h |
| 7 | **Instagram**: remover/editar post e trocar link da bio | Painel | — | 48h |
| 8 | **Confirmar acessos** de todos os painéis (cofre + 2FA) | DOCX seção 12 | — | 48h |

> Sem o item 8, os itens 1 a 6 travam. O CSV diz "login: sim" em vários diretórios, mas o DOCX registra **"Login confirmado? Não" em 36 plataformas**. "Existe login" não é "temos acesso".

### P1 — esta semana: decisões e duplicidades

1. Decidir **nome**, **horário**, **razão social** e **CEP** (seção 7).
2. Corrigir o **site oficial** — é a fonte das citações.
3. Mesclar **TeleListas 2**, **Cylex 12279811 e 13008709**, **Página Amarela 2**, **Planeta Brasileiro 2**.
4. Corrigir **Cylex 13008709** (site → domínio próprio) e **Página Amarela 1** (nome).
5. **Zapia**: telefone, horário e categoria por e-mail.
6. Abrir a planilha de **protocolos** (DOCX seção 11 está vazia) e registrar cada pedido com número e data de cobrança.

### P2 — 30 dias: cobertura e canais próprios

1. **Google Perfil:** categorias (correspondente bancário primeiro), horários, fotos, WhatsApp e **alerta de sugestão de edição de terceiros**.
2. **Bing Places:** só monitorar (já sincronizado).
3. **Facebook:** revisar dados comerciais, categoria e vínculo com o Instagram.
4. **Apple Business:** concluir o cadastro (etapa 1 pede o nome jurídico).
5. **Reivindicar/verificar:** AppLocal, Infobel, YellowPages (se for a Speed), Moovit.
6. **Cadastrar:** Reclame Aqui (prioridade alta), Apontador, Foursquare, Hotfrog, GuiaMais, Guia Urbana, Yelp.

### P3 — contínuo: governança

- **Reconferência trimestral** — diretório reverte sozinho ao reimportar base. O campo está em branco no DOCX; agendar a próxima data e nomear responsável.
- **Definição de pronto:** NAP confere, site próprio, categoria correta, horário oficial, protocolo registrado.
- **Não criar cadastro novo** com dado divergente.

---

## 10. KPIs

| KPI | Hoje | Meta | Prazo |
|---|---|---|---|
| Fichas com telefone desativado | 8 | 0 | 7 dias |
| NAP núcleo correto | 47,6% (10/21) | ≥ 90% | 60 dias |
| Identidade completa | 0% | ≥ 80% | 90 dias |
| Duplicidades ativas | 6 | 0 | 30 dias |
| Fichas não verificadas | 4 (+ Infobel, em menções) | 0 | 30 dias |
| Cobertura relevante | 25 | 32 (+7) | 90 dias |
| Protocolos registrados | 0 | 100% dos pedidos | imediato |
| Acessos confirmados | 0/36 | 100% dos usados | 7 dias |

---

## 11. Lacunas do mapa

O controle cobre bem diretórios genéricos. Ficam de fora canais que pesam para uma financeira:

| Canal | Por que importa | Prioridade |
|---|---|---|
| **Reclame Aqui** | Já está no plano, mas é o mais crítico: é onde a reputação de crédito se decide e onde um concorrente pode registrar a marca | Alta |
| **Consumidor.gov.br** | Plataforma oficial de reclamações; ausência não protege, só deixa o campo aberto | Média |
| **LinkedIn** | Credibilidade B2B e prova de existência para parceiros bancários | Média |
| **YouTube** | Segundo maior buscador; vídeos de "como simular consignado" sustentam confiança | Baixa |
| **Waze / HERE** | Consomem base do Google; só relevantes depois que o Google estiver correto | Baixa |

> Não recomendo abrir nenhum destes antes de fechar os P0. A regra do DOCX vale para todos: cadastro novo com dado divergente cria a próxima duplicidade.

---

## 12. Conciliação com o painel e o CSV

O painel exibe 44 / 9 / 11 / 10 / 7. Nenhum desses números sobrevive a uma leitura por status:

| Número do painel | O que realmente é | Número correto |
|---|---|---|
| **44** diretórios | 44 linhas, sendo 7 inexistentes, 3 menções, 6 canais próprios | **25 fichas de terceiros relevantes** |
| **9** erros críticos | 8 fichas + 1 post de Instagram | **8 fichas** (+1 post) — no CSV os 9 aparecem como `ERRO` |
| **11** duplicidades | Tamanho da seção "Duplicadas", não fichas duplicadas | **6 fichas excedentes** |
| **10** fichas 100% corretas | NAP núcleo correto; 4 com defeito secundário | **0** com identidade completa; 5 OK no núcleo |
| **7** cadastros novos | Correto | **7** |

### Defeitos de forma do controle atual

1. **Taxonomia mistura status e ação.** "Duplicadas" é status; "Corrigir", "Cadastrar" e "Descobertas" são ações. Uma linha pode ser duplicada *e* ter erro *e* precisar de ação — e só cabe em uma seção.
2. **A seção "Corrigir" contém fichas já corretas** (Lista Mais, Encontra Varginha, Localo, Wanderlog). O nome sugere erro onde não há.
3. **Datas inconsistentes.** Das 37 fichas existentes, 11 têm data explícita 07/11, 11 têm 10/09 e 15 não têm data. O DOCX afirma "conferidas uma a uma em 07/11", mas isso não se sustenta linha a linha.
4. **CSV e DOCX divergem sobre o site** (CEP e razão social). Um controle que se contradiz não serve de fonte de verdade.
5. **"Login: sim" no CSV ≠ acesso confirmado.** O DOCX registra zero acessos confirmados.
6. **Protocolos e acessos vazios.** São as duas seções que transformam intenção em execução, e estão em branco.

### Schema sugerido (v2)

Substituir as seções por colunas independentes:

`ID | Diretório | Camada (próprio/terceiro/menção/novo) | Status (ok / ok-ressalva / erro / duplicada / incompleta / não verificada / inexistente) | Severidade (P0–P3) | Campos com problema | Ação | Canal | Acesso confirmado? | Protocolo | Data do pedido | Cobrar em | Última verificação | Responsável`

As seções viram filtros, não gavetas. A matriz completa já está em `Auditoria_Diretorios_Speed_2026-11-07.csv`.

---

## 13. Limitações deste estudo

- Baseado **apenas nos dados registrados**; nenhuma ficha foi aberta ao vivo.
- 4 fichas seguem **não verificadas** e podem conter erros não contabilizados.
- O conflito do **site oficial** não foi resolvido — depende de conferência manual.
- O horário real **não é conhecido**; por isso nenhum índice de horário foi pontuado.
- Não há dados de tráfego por diretório, então o impacto foi descrito em exposição (fichas/visitantes), não em reais.
- O `Roteiro_Correcoes_NAP.md` referencia `speedgeo/diretorios.py` e `relatorio_nap.html`, que estão arquivados em `99 - Arquivo/migracao-2026-10-14/` e não foram executados.

---

## Anexo A — Dados oficiais (usar em toda correção)

| Campo | Valor |
|---|---|
| Razão social (Receita) | Gleison Kleber dos Santos — empresário individual |
| CNPJ | 29.497.887/0001-57 (ativo desde 22/01/2018) |
| Nome fantasia (Receita) | Speed Prestação de Serviços |
| Nome de exibição recomendado | **Speed Financeira e Lan House** (decisão pendente — ver 7.1) |
| Endereço | Rua Santa Cruz, 696 — Centro — Varginha/MG |
| CEP | 37002-090 |
| Telefone / WhatsApp | (35) 3067-5017 · `https://wa.me/553530675017` |
| **Telefones a banir** | **(35) 3113-0458 · (35) 3067-4361** |
| E-mail | speed.varginha@gmail.com |
| Site | https://speedfinanceira.com.br |
| Facebook / Instagram | facebook.com/speedfinanceira · instagram.com/speedfinanceira |
| Categoria principal | Correspondente bancário |
| Cores | Verde #019652 · Amarelo #FADB20 |

## Anexo B — Artefatos

| Arquivo | Conteúdo |
|---|---|
| `Estudo_Diretorios_Speed_2026-11-07.md` | Este estudo |
| `Auditoria_Diretorios_Speed_2026-11-07.csv` | Matriz das 44 linhas com status, severidade, ação, canal e prazo |
| `Controle_Diretorios_Speed_2026-11-07.csv/.docx` | Controle original (não alterado) |
| `painel_correcao_diretorios.html` | Painel original (não alterado) |
| `Roteiro_Correcoes_NAP.md` | Roteiro original (não alterado) |

> Nenhum arquivo existente foi modificado. Nenhuma ficha foi aberta ao vivo.
