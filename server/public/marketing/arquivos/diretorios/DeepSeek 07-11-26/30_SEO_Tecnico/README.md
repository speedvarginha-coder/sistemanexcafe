# 30 — SEO técnico

**Gerado em:** 07/11/2026
**Fonte de NAP:** `dados/nap.json`
**Natureza:** arquivos prontos para copiar na raiz do site **depois** da revisão do `16_Checklist_Publicacao.md`. Nada foi publicado.

---

## O que tem na pasta

| Arquivo | Para que serve | Onde vai no site |
|---|---|---|
| `sitemap.xml` | Lista as 17 URLs planejadas | `https://speedfinanceira.com.br/sitemap.xml` |
| `robots.txt` | Permite indexação e aponta o sitemap | `https://speedfinanceira.com.br/robots.txt` |
| `llms.txt` | Resumo factual para assistentes de IA | `https://speedfinanceira.com.br/llms.txt` |
| `schema_localbusiness.json` | JSON-LD da loja e dos serviços | Dentro do `<head>` do template do site |
| `README.md` | Este arquivo | Consulta interna |

---

## 1. Sitemap

O arquivo lista:

- home (`/`)
- 2 landing pages (`/grafica.html`, `/consignado.html`)
- 9 páginas de serviço (`/meu-inss-varginha.html` etc.)
- índice de artigos (`/artigos/`)
- 4 artigos

**Antes de publicar:**

1. Confirme que cada URL responde **200**.
2. Confira se o `<link rel="canonical">` de cada página é igual ao `<loc>`.
3. Preencha a data real de publicação em `lastmod` (hoje está 2026-11-07, data de criação).
4. Remova do sitemap o que não for publicado.
5. Envie no Google Search Console: **Sitemaps → adicionar sitemap → `sitemap.xml`**.

> O sitemap não garante indexação. Ele apenas informa o que existe. A indexação depende de conteúdo, links internos e tempo.

---

## 2. robots.txt

O arquivo:

- libera todo o site (`Allow: /`);
- bloqueia `/rascunho/` e `/teste/`, caso sejam publicados por engano;
- aponta o sitemap.

**Não** coloque `Disallow` nas páginas que você quer indexar. Um `Disallow: /` acidental derruba a indexação inteira.

**Teste:** acesse `https://speedfinanceira.com.br/robots.txt` e confira se o texto aparece exatamente como está aqui.

---

## 3. llms.txt

Formato aberto, sem padrão oficial do Google, usado por assistentes de IA para entender o site. O arquivo:

- apresenta a loja em uma frase;
- lista serviços e limites (empresa privada, não é órgão público);
- aponta as páginas principais;
- informa o WhatsApp e o endereço;
- deixa claro que aprovação de crédito é da instituição financeira.

**Regra:** o `llms.txt` não substitui o conteúdo das páginas. Ele só resume o que já está publicado. Se uma página mudar, atualize o resumo.

---

## 4. Schema JSON-LD

O arquivo `schema_localbusiness.json` traz um `@graph` com:

- **FinancialService** (`#loja`): nome, endereço, telefone, e-mail, área atendida, temas e catálogo de serviços;
- **WebSite** (`#site`): nome, idioma e publisher.

### Como instalar

1. Abra o template do site (o arquivo que gera o `<head>` de todas as páginas).
2. Cole o conteúdo de `schema_localbusiness.json` dentro de:

```html
<script type="application/ld+json">
  { ...cole aqui o JSON... }
</script>
```

3. O JSON-LD pode ficar no `<head>` ou no fim do `<body>`. O Google lê os dois.
4. Não duplique o schema: se o site já tem um `LocalBusiness`, **substitua** pelo novo, não some.

### Validação

- **Rich Results Test:** `https://search.google.com/test/rich-results`
- **Schema Markup Validator:** `https://validator.schema.org/`

O teste deve mostrar `FinancialService` e `WebSite` sem erro crítico. Aviso sobre `logo.png` só desaparece quando a imagem existir no ar.

---

## 5. O que ainda falta (e por que não inventei)

| Campo | Situação | O que fazer |
|---|---|---|
| `openingHoursSpecification` | Horário pendente (Decisão 2) | Inserir depois da aprovação, com o mesmo horário do Google |
| `logo.png` | Não confirmado no site | Confirmar se `https://speedfinanceira.com.br/logo.png` existe; se não, publicar o logo ou remover o campo |
| `sameAs` | Perfis sociais não confirmados | Adicionar só URLs oficiais verificadas (Instagram, Facebook) |
| `geo` (latitude/longitude) | Não informado | Não inventar. Se quiser, pegar do Google Maps e conferir |
| `aggregateRating` | Reputação muda | Não usar. O Google não exibe estrelas de autoavaliação e pode penalizar |
| `priceRange` | Faixa de preço não informada | Não usar até ter a faixa real |

> **Regra:** schema é declaração de fato. Campo inventado gera aviso, perda de rich result ou ação manual. É melhor um schema menor e verdadeiro do que um completo e falso.

---

## 6. Checklist de publicação

- [ ] `sitemap.xml` na raiz e acessível
- [ ] `robots.txt` na raiz e acessível
- [ ] `llms.txt` na raiz e acessível
- [ ] JSON-LD no template, sem duplicar schema antigo
- [ ] `logo.png` existe ou campo removido
- [ ] `openingHoursSpecification` igual ao horário aprovado
- [ ] Rich Results sem erro crítico
- [ ] Search Console com sitemap enviado
- [ ] Canonical de cada página igual ao `<loc>`
- [ ] Nenhuma página publicada retorna 404 ou 301 inesperado

---

## 7. Diagnóstico rápido se algo não indexar

| Sintoma | Causa provável | Correção |
|---|---|---|
| Página não aparece no Google | `robots.txt` bloqueando ou `noindex` | Conferir os dois |
| Sitemap com erro | URL com 404 ou XML inválido | Validar o XML e testar cada URL |
| Rich result não aparece | Schema incompleto ou campo falso | Validar no Rich Results Test |
| Canonical diferente da URL | Página publicada em caminho diferente | Ajustar canonical ou redirecionar |
| Conteúdo duplicado | Mesma página em dois caminhos | Escolher um canonical e redirecionar o outro |

---

> **Limite:** estes arquivos não publicam nada e não substituem o Search Console. Eles estão prontos para copiar, mas só valem depois de conferidos contra o site que estiver no ar.
