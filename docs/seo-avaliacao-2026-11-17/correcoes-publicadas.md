# Correções publicadas no site (17/11/2026)

Status: publicadas e conferidas ao vivo. Autorização: o dono respondeu "Sim, corrigir" à pergunta sobre corrigir no site os itens que conferem nas duas auditorias.

## O que mudou

| Item | Antes | Depois |
|---|---|---|
| Sitemap | `consignado.html`, `fgts.html` e `financiamento-veicular.html` fora; uma URL do blog repetida | As três entraram; a repetição saiu (218 no build; 189 no ar, porque os artigos futuros ficam filtrados) |
| Página de prévia | `previa-novas-paginas.html` no ar, sem noindex, linkada como "Todos os Serviços" em 7 páginas | O link aponta para `index.html#servicos`; a página responde 404 e a cópia foi para `legado/` |
| Promessas proibidas pela marca | "liberação imediata via Pix" (130 páginas), "sem consulta ao SPC/Serasa" (35), "menores taxas" (24), "PIX na hora/imediato" | Nenhuma ocorrência afirmativa no build; ficaram só os alertas contra golpe |
| Aviso de correspondente | 26 de 186 páginas | Todas as páginas com rodapé (blog e guias incluídos) |
| `&nbsp;` no `<title>` | 7 páginas | Nenhuma |
| JSON-LD | Faltava em `consultas.html` e `consignado-bpc-loas.html` | Serviço, página, migalhas e empresa; validado ao vivo |
| Artigo de desbloqueio do INSS | Sem link da home e do consignado | 2 links no consignado e 1 no rodapé da home |

A URL dos guias de FGTS (`...pix-imediato...`) foi mantida, para não perder o histórico de busca; mudaram só o título e o texto.

## Como foi feito

- Script `scripts/correcoes_seo_20261117.py`, na pasta do site no Drive. Ele é idempotente: rodar de novo não muda nada.
- O script foi ligado ao fim de `audit_fixes.transform`, por onde já passam os geradores do blog e dos guias. Gerar de novo não traz as frases de volta.
- Também foram corrigidos os textos-fonte: `speedgeo/generator.py`, `pautas_varginha.json` e `blog_conteudo_*.py`.
- 321 arquivos alterados, 189 deles do build. O original de cada um está em `speedfinanceira.com.br-audit/implementation-20261117/backups/`, e a lista com os hashes em `manifest.json`.
- Antes de alterar, o build foi conferido byte a byte com o site ao vivo: 192 de 192 arquivos iguais.
- Envio seletivo por FTP de 181 arquivos. Os 8 artigos com data futura ficaram de fora; a tarefa diária publica cada um no seu dia. A lista está em `published.json`.

## Conferência ao vivo

- Os 181 arquivos enviados são idênticos ao build.
- A prévia responde 404.
- O sitemap ao vivo lista as três páginas novas e não tem mais a URL repetida.
- A home, mesmo sem forçar atualização do cache, já mostra o aviso legal e o link para o artigo do INSS.
- O guia de FGTS de Alfenas, também sem forçar o cache, já tem o título novo.
- O JSON-LD das duas páginas novas é válido.

O Google ainda não releu nada. Entrega no site não é indexação.

## Continua pendente

- **Títulos longos (149 páginas):** precisam de escolha de texto página por página.
- **Expansão das 5 páginas de cidade:** precisa de fatos locais reais.
- **Consolidação dos guias:** é decisão do dono.
- **Outras promessas de prazo:** "em minutos", "em até 24h", "no mesmo dia" e "poucas horas" aparecem em algumas páginas e não entraram nesta rodada.
- **Margem desatualizada:** `consignado.html` ainda diz "Margem total de até 45%", que é a regra antiga de margem.
- **Ficha do Google:** nome com palavras-chave, horário especial de 20/11 e pedido de avaliações. Isso é com o dono.
- **Diretórios com o telefone antigo:** UENI, Bendito Guia, eGuias e EmpresaFone. Também é com o dono.
- **Envio do sitemap no Search Console:** não foi feito, porque é uma operação no provedor que não foi autorizada. O Google relê o sitemap sozinho.
