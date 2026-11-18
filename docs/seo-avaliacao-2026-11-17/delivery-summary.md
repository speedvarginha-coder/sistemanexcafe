# Avaliação de SEO da Speed Financeira (17/11/2026)

Status: concluída, somente leitura. Nada foi alterado no site, na ficha do Google ou em outro serviço.
Responsável pela avaliação: Claude (roteador `seo`). Decisões e correções: dono da Speed Financeira.

## Escopo e evidências

| Fonte | O que foi lido | Data | Arquivo |
|---|---|---|---|
| Site ao vivo | 186 páginas dos dois sitemaps, robots, cabeçalhos, redirecionamentos | 17/11/2026 | `evidencias/captura-site-2026-11-17.json` |
| Search Console | 28 dias, 34 páginas com impressão, 30 buscas | 18/10 a 14/11/2026 | `evidencias/search-console-2026-10-18_2026-11-14.json` |
| GeoGrid (Maps) | 4 termos, grade 5x5 de 1 km | 05/11 e 17/11/2026 | `evidencias/geogrid-ultimas.json` |
| Ficha do Google | 22 itens da saúde da ficha, pela API | 17/11/2026 | lida do banco do Nexcafe |
| Diretórios (NAP) | 9 diretórios | 13/11/2026 | lida do banco do Nexcafe |

Fatos vêm dessas fontes. Onde há inferência, o texto diz.

## Resultado

O site está tecnicamente limpo:
- todas as 186 URLs respondem 200;
- todas têm canonical próprio, um único H1 e `lang="pt-BR"`;
- nenhuma tem noindex por engano;
- nenhuma traz o telefone antigo, e todas têm WhatsApp;
- não há página órfã.

O problema está na visibilidade:
- **Search Console:** 35 cliques e 2.739 impressões em 28 dias, posição média 11,2. As impressões vêm de 13º salário, RCC do INSS, FGTS via Pix e refinanciamento. Consignado CLT e consignado INSS, os produtos prioritários, quase não aparecem.
- **Maps:**

| Termo | Posição média | Pontos no top 3 | Quem lidera |
|---|---|---|---|
| empréstimo consignado | 4,3 | 0 de 25 | CrediMais Empréstimos Varginha |
| empréstimo | 5,9 | 0 de 25 | CrediMais Empréstimos Varginha |
| financeira | 2,6 | 19 de 25 | DL Cred |
| antecipação FGTS | 2,2 | 25 de 25 | Empresta Varginha |

## Prioridade alta

1. **Três páginas principais estão fora do sitemap.**
   - As páginas são `consignado.html` (INSS, BPC, servidor e CLT), `fgts.html` e `financiamento-veicular.html`.
   - Elas estão no ar, com canonical próprio e de 9 a 13 links internos cada, mas não aparecem em nenhum dos dois sitemaps.
   - Nenhuma das três aparece entre as 34 páginas com impressão no Search Console. Inferência: a falta no sitemap contribui, mas não é a única causa possível.
   - Correção: incluir as três no gerador do `sitemap.xml`.
2. **Uma página interna de prévia está publicada e linkada.**
   - `previa-novas-paginas.html` ("Painel de Prévia — Todas as 14 Páginas de Produtos") responde 200, sem noindex.
   - Ela é o destino do link "Todos os Serviços" em 7 páginas de produto: consórcio, crédito imobiliário, empréstimo no cartão, empréstimo com garantia, portabilidade, seguros e troca de crédito.
   - Correção: apontar esse link para a home ou para uma página real de serviços, e tirar a prévia do ar.
3. **Há frases de promessa que a regra da marca proíbe.**

   | Frase | Páginas | Onde aparece |
   |---|---|---|
   | "liberação imediata via Pix" | 130 | Título dos guias de FGTS, repetido nos links entre guias. A URL também usa `pix-imediato`. |
   | "sem consulta ao SPC/Serasa" | 35 | Guias de consignado e de garantia de veículo |
   | "menores taxas" | 24 | Passo "Receba a cotação com as menores taxas entre os bancos conveniados" |
   | "PIX na hora" | 2 | `emprestimo-cartao.html` e `credito-trabalhador-clt.html` |

   - Correção: trocar o texto no gerador dos guias e nas páginas. Manter a URL atual e mudar só o título e o texto, para não perder o histórico de busca.
4. **O aviso de correspondente bancário falta na maior parte do site.**
   - O aviso (Res. CMN 4.935/2021) aparece em 26 das 186 páginas: na home e nas páginas de produto.
   - Faltam o blog (36 páginas) e os guias (129 páginas).
   - Correção: pôr o aviso no rodapé comum a todas as páginas.
5. **A ficha do Google tem riscos e itens vencidos.** A nota de saúde é 16 de 22.
   - **Nome:** "Speed Financeira – Empréstimo Consignado e Financiamento em Varginha". Nome com serviço e cidade fere a regra do Google quando não está na fachada, e uma denúncia pode suspender a ficha. Isso é o maior risco local.
   - **Horário especial:** não há nenhum cadastrado. O feriado de 20/11 é daqui a 3 dias, e faltam também Natal e Ano-Novo.
   - **Avaliações:** nenhuma nova há 120 dias.
   - **Post:** o último saiu há 17 dias.
   - **Link do site:** é `http://www...`, com 2 redirecionamentos e sem UTM.
   - **Verificação e links de ação:** não foram lidos, porque duas APIs continuam desligadas no Google Cloud.

## Prioridade média

6. **Títulos e descrições longos.**
   - A mediana dos títulos é de 109 caracteres, e 149 de 186 passam de 60. O Google tende a cortar ou reescrever.
   - 82 descrições passam de 160 caracteres.
   - Sem mudança desde 05/11 (mediana 113).
7. **Os 129 guias por cidade são conteúdo em escala com pouco retorno.**
   - São 13 temas x 10 cidades.
   - A data de alteração no sitemap é 15/10 em todos.
   - Os 10 guias de golpe repetem a mesma descrição.
   - No Search Console, os guias que aparecem ficam entre as posições 40 e 90, com exceção de 2.
   - O índice `/guia/` responde 403, e os 129 guias apontam para ele.
   - A decisão de 05/11 foi manter e medir. Com os dados de agora, recomendo juntar por tema e manter cidade só onde há busca local. A decisão é do dono.
8. **As 5 páginas de cidade são finas.** `financeira-<cidade>-mg` tem de 255 a 302 palavras, e cada uma recebe só 1 link interno.
9. **Há redundância no sitemap.**
   - As 129 URLs dos guias estão no `sitemap.xml` e também no `sitemap_guias.xml`.
   - Uma URL está duplicada dentro do `sitemap.xml`: `blog/refinanciamento-de-consignado-quando-vale-a-pena.html`.
10. **Cabeçalhos de segurança e de cache.**
    - Faltam `Strict-Transport-Security` e `X-Content-Type-Options`, apontados desde 05/11.
    - A home tem 162 KB de HTML com `no-store`.
11. **72 imagens sem largura e altura** em 36 páginas. Isso pode mexer o layout (CLS). Todas têm texto alternativo.
12. **Diretórios com divergência.** 5 de 9 divergem; UENI, Bendito Guia, eGuias e EmpresaFone ainda mostram o telefone antigo.

## Oportunidades de curto prazo (Search Console)

- **"o que é rcc no inss":** 38 impressões, posição 20,7. A página é `blog/cartao-beneficio-rcc-inss-margem-exclusiva-5-por-cento.html`. Uma resposta direta logo no início do texto pode trazê-la para a primeira página.
- **"empréstimo varginha":** posição 4,4, mas com poucas impressões. A home é a dona natural dessa busca, e o título dela deve começar por esse termo.
- **Buscas de refinanciamento:** posições de 39 a 48. Hoje três páginas disputam a mesma busca (o guia, e dois artigos do blog), e é preciso escolher uma.
- **13º salário:** 109 impressões, mas na posição 61. É sazonal e acaba em dezembro, então não vale grande esforço.

## Termos principais (frente de longo prazo)

"empréstimo consignado" e "empréstimo" em Varginha são o objetivo de liderança. Hoje: média 4,3 e 5,9 no Maps, 0 de 25 no top 3, e quase nenhuma impressão orgânica nas páginas de consignado.

O que move esses termos, em ordem:
1. Página `consignado.html` no sitemap, com título direto.
2. Avaliações novas todo mês.
3. Nome da ficha dentro da regra do Google.
4. Diretórios corrigidos.
5. Links locais.

Esta avaliação não mediu links: não há dados de backlinks liberados.

## Horário de sábado

O horário de sábado está **9h às 12h30** na ficha e no site, que concordam entre si. O registro interno de 05/11 dizia 9h às 13h, mas o relatório de correções de 10/11 do site (`speedfinanceira.com.br-audit/implementation/RESULTADO.md`) traz a última confirmação do dono: 9h às 12h30. O registro interno foi corrigido.

## Correções feitas depois desta avaliação

Os itens 1, 2, 3 e 4, o `&nbsp;` dos títulos, o schema e os links para o artigo do INSS foram corrigidos e publicados em 17/11. Detalhes em `correcoes-publicadas.md`.

## Fora desta avaliação

- **Velocidade medida pelo Google:** o PageSpeed recusou a consulta (limite diário).
- **Respostas de buscadores com IA** (ChatGPT, Perplexity, Gemini): não houve acesso para observar. O `robots.txt` libera esses robôs. Não há `llms.txt`, que é opcional.
- **Backlinks:** sem ferramenta autorizada.

## Cobertura das 27 frentes

| Situação | Frentes |
|---|---|
| Executadas | roteador, pesquisa de buscas, auditoria geral, técnica, página, conteúdo, dados estruturados, imagens, sitemap, arquitetura, medição (Search Console), local, programático |
| Bloqueadas por falta de dados | pesquisa em buscadores com IA, monitor de visibilidade em IA, autoridade (backlinks) |
| Não se aplicam | internacional, loja virtual, vídeo, notícias, páginas de comparação com concorrente, jornada de agentes |
| Ficam para depois da sua decisão | respostas diretas (AEO), entidade e citação (GEO), plano de ação, roteiro, implementação |

O registro completo está em `orchestration-ledger.json`.

## Próximo passo

Os itens 1 a 4 e 6, 8, 9 e 11 são correções no gerador do site, que fica no Drive. Os itens 5 e 12 são na ficha e nos diretórios. Com a sua aprovação, o próximo passo é transformar esta lista em plano de ação e corrigir o site.
