# Conferência da auditoria do Antigravity (17/11/2026)

Status: concluída, somente leitura.

Cada afirmação da auditoria externa foi comparada com as evidências desta pasta:
- a captura das 186 páginas ao vivo;
- o Search Console lido direto pelo servidor do Nexcafe (18/10 a 14/11, 82 buscas distintas);
- o GeoGrid e a saúde da ficha;
- o build local, com 220 arquivos HTML.

## Resultado

A parte técnica confere. A parte de Search Console não confere. Alguns conselhos locais e de anúncios são mitos ou ferem regras. A auditoria também deixou de fora os quatro achados mais graves desta avaliação.

## Confere

| Afirmação | Evidência |
|---|---|
| 220 arquivos HTML no build | 220 (o site no ar publica 186 no sitemap) |
| Cerca de 150 títulos longos | 149 de 186 passam de 60 caracteres ao vivo |
| `&nbsp;` dentro do `<title>` | Confere, mas são 7 páginas e não 4: consórcio, crédito imobiliário, empréstimo no cartão, empréstimo com garantia, financiamento veicular, portabilidade e seguros. O efeito é pequeno (vira espaço) e não é erro de sintaxe. |
| Páginas sem JSON-LD | `consultas.html`, `consignado-bpc-loas.html` e `blog/` (mais a prévia) |
| Páginas de cidade finas | De 236 a 302 palavras, conforme o método de contagem |
| Telefone antigo em diretórios | Confere em UENI, Bendito Guia, eGuias e EmpresaFone. "8 diretórios" não foi verificado: Brasil Locais não mostra telefone, e Planeta Brasileiro e TeleListas não puderam ser lidos. |
| Média 4,3 em "empréstimo consignado" e CrediMais à frente | Média 4,3 confere. O "1,3º" da CrediMais não dá para conferir, porque o GeoGrid guarda só o líder de cada ponto; ela lidera 17 de 25. |

## Não confere

1. **As três buscas do Search Console não existem nos dados do site.**
   - "como desbloquear beneficio inss para emprestimo" (~40/mês, posição 42), "antecipar fgts pelo whatsapp" (~25, posição 5 a 9) e "golpe do falso emprestimo whatsapp" (~35, posição 5) não aparecem entre as 82 buscas do período.
   - Com 40 impressões, a primeira seria a maior busca do site.
   - O Windsor, fonte citada pela auditoria, hoje recusa as leituras com a mensagem "These are not your real numbers", porque a conta grátis tem 2 contas ligadas e o plano aceita 1.
   - Inferência: os números da auditoria podem ter vindo desse bloqueio, e não do Search Console real.
2. **"Canibalização entre a home e consignado.html" não tem prova.** A `consignado.html` não teve nenhuma impressão no período, porque está fora do sitemap. Sem impressões das duas páginas na mesma busca, não há como medir disputa.
3. **"Causa raiz é o NAP, não o site" é exagerado.** O NAP pesa, mas a ficha também está sem avaliação nova há 120 dias, tem palavras-chave no nome e não tem post há 17 dias.
4. **"E-E-A-T e conformidade 92/100, aviso legal correto" não confere.** O aviso de correspondente aparece só em 26 das 186 páginas, e há promessas proibidas em 161 delas.
5. **As notas de 0 a 100 por pilar não têm método declarado.** Não dá para reproduzir.

## Conselhos para não seguir

- **"Pix em 15 minutos" no H1 da página de FGTS:** é promessa de prazo, proibida pela regra da marca.
- **Fotos com geolocalização:** o Google remove esses dados das fotos enviadas; não há efeito comprovado no ranking.
- **Roteiro de palavras para o cliente escrever na avaliação:** pode-se pedir a avaliação e lembrar do serviço, mas ditar o texto aproxima a prática de avaliação induzida, que fere a política do Google.
- **Trocar a categoria principal para "Correspondente Bancário" e acrescentar Lan House e Gráfica:**
  - não verifiquei se essa categoria existe no Google;
  - misturar a lan house na ficha da financeira dilui a relevância;
  - em "financeira" a ficha já está no top 3 em 19 de 25 pontos.
- **Seção de anúncios de serviços do governo:** a "proibição terminante com suspensão sumária" e as "5.500 buscas por mês em Varginha" não têm fonte. Precisa de verificação antes de virar decisão.

## O que a auditoria não viu

1. `consignado.html`, `fgts.html` e `financiamento-veicular.html` estão fora do sitemap.
2. `previa-novas-paginas.html` está publicada, sem noindex, e é o destino do link "Todos os Serviços" em 7 páginas.
3. Há promessas proibidas pela marca: "liberação imediata via Pix" em 130 páginas, "sem consulta ao SPC/Serasa" em 35 e "menores taxas" em 24.
4. A ficha tem nome com palavras-chave (risco de suspensão), nenhum horário especial para o feriado de 20/11 e nenhuma avaliação nova há 120 dias.

## Aproveitável da auditoria

- Tirar o `&nbsp;` dos 7 títulos e encurtar os títulos.
- Pôr JSON-LD em `consultas.html` e `consignado-bpc-loas.html`.
- Linkar a home e `consignado.html` para o artigo de desbloqueio do benefício: ele existe e só 6 páginas apontam para ele.
- Expandir as páginas de cidade.
- Corrigir os diretórios.
