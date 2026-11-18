# Runbook de 14 dias — da decisão à correção no ar

**Janela:** segunda 09/11/2026 a domingo 22/11/2026
**Objetivo do ciclo:** sair de 10/21 de NAP correto (47,6%) e 8 telefones mortos no ar para **0 telefone banido, 21/21 fichas com NAP núcleo correto e Perfil do Google 100% preenchido**.
**Regra:** cada dia termina com evidência salva e linha atualizada em `13_Protocolos.csv`. Sem evidência, a tarefa continua aberta.
**Quem executa:** Operação (balcão/gestor), Marketing e Dono. O dono só entra nos dias 1 e 13.

> Este runbook não publica, não acessa painel e não fala com suporte por você. Ele ordena o que a pessoa responsável faz, com o texto pronto em cada arquivo do pacote.

---

## Mapa do ciclo

| Fase | Dias | Entrega | Critério de pronto |
|---|---|---|---|
| A. Decidir | 1 | 4 decisões assinadas | `21_One_Page_Decisoes.html` preenchido e assinado |
| B. Parar o sangramento | 1–2 | UENI e Instagram sem telefone morto | 0 links para 3113-0458 / 3067-4361 |
| C. Corrigir a fonte | 2–4 | Google + site com NAP único | Ficha e rodapé idênticos ao `dados/nap.json` |
| D. Corrigir as 8 fichas P0 | 4–8 | 8 protocolos abertos | 8 linhas com data e protocolo |
| E. Cobrar e mesclar | 8–12 | 6 duplicidades protocoladas | 6 pedidos com número |
| F. Medir e publicar | 10–14 | Links, painel, páginas e LPs | 5 links testados, 8+2 URLs no ar |

---

## Dia 1 — segunda 09/11 · Decidir e parar o sangramento

**Tempo estimado:** 2h30 (1h30 com o dono + 1h de execução)

| # | Hora | Tarefa | Responsável | Evidência |
|---|---|---|---|---|
| 1.1 | 08:30 | Abrir `21_One_Page_Decisoes.html`, preencher com o dono e assinar as 4 decisões | Dono + Marketing | PDF/print da one-page assinada |
| 1.2 | 09:30 | Atualizar `dados/nap.json` com nome e horário aprovados (campo `status_nome` e `horario`) | Marketing | Commit/print do arquivo |
| 1.3 | 10:00 | UENI: trocar os 4 botões para `https://wa.me/553530675017` **ou** despublicar a página | Operação | Print antes/depois (P0-01) |
| 1.4 | 10:30 | Instagram: apagar o post com 3113-0458 e revisar bio e botão de contato | Marketing | Print do perfil (P0-08) |
| 1.5 | 11:00 | Rodar os scripts para refletir a decisão | Marketing | Saída do console |

```powershell
powershell -ExecutionPolicy Bypass -File 14_Recalcular_NAP.ps1
node ferramentas\gerar_paginas.js
node ferramentas\gerar_artigos.js
powershell -ExecutionPolicy Bypass -File ferramentas\gerar_citacoes.ps1
```

**Pronto quando:** one-page assinada, `nap.json` atualizado, UENI e Instagram sem o número morto.

---

## Dia 2 — terça 10/11 · Google como fonte da verdade

**Tempo estimado:** 2h

| # | Tarefa | Responsável | Evidência |
|---|---|---|---|
| 2.1 | Abrir o Perfil da Empresa e conferir nome, categoria principal, endereço, CEP, telefone, site e horário | Operação | Print da ficha completa |
| 2.2 | Corrigir o que divergir do `dados/nap.json` | Operação | Print antes/depois (B1-02) |
| 2.3 | Conferir se existem fichas duplicadas no Google e denunciar duplicata | Operação | Print da denúncia |
| 2.4 | Publicar o primeiro post do `18_Posts_Perfil_Google_8s.md` | Marketing | Print do post no ar |

**Pronto quando:** a ficha do Google é a referência e não há duplicata ativa.

---

## Dia 3 — quarta 11/11 · Site com NAP único

**Tempo estimado:** 3h

| # | Tarefa | Responsável | Evidência |
|---|---|---|---|
| 3.1 | Seguir `04_Correcao_Site.md`: rodapé, bloco NAP, schema `LocalBusiness`/`FinancialService` | Marketing | Print do rodapé e do código |
| 3.2 | Conferir CEP, razão social, telefone e horário na página de contato | Marketing | Print |
| 3.3 | Revisar `16_Checklist_Publicacao.md` seção 3 (NAP) | Marketing | Checklist marcado |
| 3.4 | Testar os 5 links de WhatsApp do `05_WhatsApp_por_Intencao.md` | Marketing | Print das 5 conversas (B1-07) |

**Pronto quando:** site, Google e `nap.json` mostram o mesmo NAP, e os 5 links abrem com o texto certo.

---

## Dia 4 — quinta 12/11 · Começar as 8 fichas P0

**Tempo estimado:** 3h

Fichas do `02_Kit_Execucao_P0.md`. Abrir 4 hoje, 4 no dia 5. Para cada uma: print antes, correção, protocolo, print depois.

| Ordem | Ficha | Problema | Canal |
|---|---|---|---|
| 1 | Solutudo 22353545 | telefone morto + duplicada de 23132000 | WhatsApp do suporte |
| 2 | eGuias 3548163 | imóvel 6969 + telefone morto | botão público |
| 3 | EmpresaFone 3271489 | telefone morto | painel |
| 4 | Planeta Brasileiro F1008C40E1CD645 | telefone, horário e site | portal de sugestão |

**Pronto quando:** 4 linhas de `13_Protocolos.csv` com data e protocolo.

---

## Dia 5 — sexta 13/11 · Fechar as 8 fichas P0

**Tempo estimado:** 3h

| Ordem | Ficha | Problema | Canal |
|---|---|---|---|
| 5 | Bendito Guia | telefone morto | portal de sugestão |
| 6 | Brasil Locais 314988 | telefone morto + reivindicar | reivindicação |
| 7 | Solutudo 23132000 | ficha que deve sobreviver à mesclagem | suporte |
| 8 | Cylex 13008709 | site apontando para Localo | suporte |

Ao fim do dia, rodar a fila de cobrança:

```powershell
powershell -ExecutionPolicy Bypass -File ferramentas\cobrar_protocolos.ps1
```

**Pronto quando:** `26_Cobranca_Protocolos.md` mostra 8 protocolos com data e 0 "sem data" entre os P0.

---

## Dia 6 — sábado 14/11 · Revisão e resposta padrão

**Tempo estimado:** 1h30

| # | Tarefa | Responsável | Evidência |
|---|---|---|---|
| 6.1 | Revisar as 8 fichas em janela anônima (telefone e endereço) | Operação | Print das 8 |
| 6.2 | Ajustar a primeira resposta do WhatsApp com o script do `05` | Operação | Conversa de teste |
| 6.3 | Registrar divergências que voltarem como nova linha no `13` | Operação | CSV atualizado |

**Pronto quando:** nenhuma das 8 fichas exibe telefone banido.

---

## Dia 7 — domingo 15/11 · Folga operacional (só monitorar)

Sem tarefa de balcão. Se houver retorno de suporte, responder com o modelo do `19_Emails_e_Modelos.md` e atualizar o protocolo.

---

## Dia 8 — segunda 16/11 · Duplicidades e Perfil

**Tempo estimado:** 3h

| # | Tarefa | Responsável | Evidência |
|---|---|---|---|
| 8.1 | Abrir os 6 pedidos de mesclagem (DUP-01 a DUP-06) | Operação | 6 protocolos |
| 8.2 | Completar categorias, serviços, fotos e Q&A do Perfil (`08`) | Operação | Print do perfil |
| 8.3 | Agendar os 8 posts semanais (`18`) | Marketing | Calendário preenchido |
| 8.4 | Publicar `31_Respostas_Avaliacoes.md` como guia interno de resposta | Marketing | Documento impresso no balcão |

**Pronto quando:** 6 duplicidades protocoladas e Perfil 100% preenchido.

---

## Dia 9 — terça 17/11 · Publicar páginas de serviço

**Tempo estimado:** 3h

| # | Tarefa | Responsável | Evidência |
|---|---|---|---|
| 9.1 | Revisar `16_Checklist_Publicacao.md` seções 2 a 4 | Marketing | Checklist marcado |
| 9.2 | Publicar as 9 páginas de `paginas\` | Marketing | 9 URLs no ar |
| 9.3 | Publicar os 4 artigos e o índice de `artigos\` | Marketing | 5 URLs no ar |
| 9.4 | Enviar `sitemap.xml` e `robots.txt` de `30_SEO_Tecnico\` | Marketing | Print do Search Console |

**Pronto quando:** 14 URLs respondem 200 e o sitemap está acessível.

---

## Dia 10 — quarta 18/11 · LPs e SEO técnico

**Tempo estimado:** 3h

| # | Tarefa | Responsável | Evidência |
|---|---|---|---|
| 10.1 | Publicar `06_LP_Grafica.html` e `07_LP_Consignado.html` | Marketing | 2 URLs no ar |
| 10.2 | Validar os JSON-LD com o Rich Results Test | Marketing | Print sem erro crítico |
| 10.3 | Publicar `30_SEO_Tecnico/llms.txt` na raiz | Marketing | URL acessível |
| 10.4 | Conferir `canonical` e `og:url` das 14 páginas | Marketing | Planilha de conferência |

**Pronto quando:** 16 URLs no ar e schema sem erro crítico.

---

## Dia 11 — quinta 19/11 · Medição

**Tempo estimado:** 2h

| # | Tarefa | Responsável | Evidência |
|---|---|---|---|
| 11.1 | Configurar conversão e UTM do WhatsApp e das LPs (`12`) | Marketing | Evento de teste |
| 11.2 | Abrir o `27_Contador_Balcao.html` e treinar o balcão (1 toque por atendimento) | Operação | 3 registros de teste apagados depois |
| 11.3 | Definir a meta diária de visitas identificadas | Dono | Meta escrita no painel |

**Pronto quando:** o painel registra um evento de teste e o balcão sabe usar o contador.

---

## Dia 12 — sexta 20/11 · Cobrar o que não voltou

**Tempo estimado:** 1h30

```powershell
powershell -ExecutionPolicy Bypass -File ferramentas\cobrar_protocolos.ps1
```

| # | Tarefa | Responsável | Evidência |
|---|---|---|---|
| 12.1 | Ler `26_Cobranca_Protocolos.md` e cobrar o que passou de 7 dias | Operação | Mensagem enviada |
| 12.2 | Atualizar status e data de retorno no `13_Protocolos.csv` | Operação | CSV atualizado |
| 12.3 | Reenviar o que não teve resposta em 7 dias | Operação | Novo protocolo |

**Pronto quando:** nenhum protocolo P0 vencido sem cobrança registrada.

---

## Dia 13 — sábado 21/11 · Fechamento da quinzena

**Tempo estimado:** 2h

| # | Tarefa | Responsável | Evidência |
|---|---|---|---|
| 13.1 | Rodar `14_Recalcular_NAP.ps1` | Marketing | `metricas_calculadas.json` novo |
| 13.2 | Rodar `ferramentas\gerar_citacoes.ps1` | Marketing | `validacao_citacoes.txt` novo |
| 13.3 | Rodar `node ferramentas\validar_pacote.js` | Marketing | 0 erros |
| 13.4 | Preencher o `24_Relatorio_Mensal.html` com a quinzena | Marketing | Relatório salvo |
| 13.5 | Levar ao dono o resultado: fichas corrigidas, pendentes e bloqueios | Marketing | Reunião de 20 min |

**Pronto quando:** há um número novo de NAP e uma lista curta do que falta.

---

## Dia 14 — domingo 22/11 · Fechar e planejar

**Tempo estimado:** 1h

| # | Tarefa | Evidência |
|---|---|---|
| 14.1 | Atualizar `00_LEIA-ME.md` com o que mudou | Arquivo revisado |
| 14.2 | Marcar no `25_Backlog_90_Dias.csv` o que foi concluído | CSV atualizado |
| 14.3 | Escolher as 3 prioridades da semana seguinte | Lista de 3 |

**Pronto quando:** o pacote conta a história do ciclo sem depender da memória de ninguém.

---

## Painel de controle do ciclo

| Indicador | Antes (07/11) | Meta (22/11) | Onde medir |
|---|---|---|---|
| Fichas com NAP núcleo correto | 10/21 (47,6%) | 21/21 | `14_Recalcular_NAP.ps1` |
| Fichas com telefone morto | 8/21 (38,1%) | 0 | `validacao_citacoes.txt` |
| Duplicidades ativas | 6 | 0 protocoladas | `13_Protocolos.csv` |
| Identidade completa | 0/21 | 21/21 | `14` |
| Perfil do Google preenchido | ? | 100% | Print do perfil |
| Links de WhatsApp testados | 0/5 | 5/5 | Prints |
| Páginas públicas no ar | 0 | 16 | URLs |
| Acessos testados | 0/36 | 12/36 (mínimo) | `15_Acessos_e_Cofre.md` |

---

## O que pode travar o ciclo

| Bloqueio | Efeito | Contorno |
|---|---|---|
| Dono não assina a one-page no dia 1 | Todo o resto para | Marcar reunião de 30 min antes de começar |
| Sem acesso ao painel da ficha | Correção não acontece | Usar canal público e registrar protocolo |
| Portal não responde em 7 dias | Ficha continua errada | Cobrar no dia 12 e escalar no 14 |
| Sem link de avaliação do Google | QR de avaliação não sai | Usar o QR de WhatsApp e pedir avaliação no atendimento |
| Sem preço real de gráfica | `32` e `22` ficam com exemplo | Preencher a ficha de custo antes de divulgar preço |

---

> **Limite:** este runbook é operacional. Ele não substitui a decisão do dono, não publica sozinho e não promete prazo de portal. Cada linha de evidência existe para provar o que foi feito — não para presumir que foi.
