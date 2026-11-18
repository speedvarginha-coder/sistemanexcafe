# Correção do Site Oficial

**Objetivo:** o site é a fonte que os diretórios copiam. Se ele estiver errado, todo o resto herda o erro.

> ⚠️ Não publicar antes das decisões de nome e horário (`03`). Os blocos abaixo estão prontos, mas com campos pendentes marcados.

---

## 1. O que conferir no site hoje

Abra `https://speedfinanceira.com.br` em janela anônima e verifique:

| Item | Onde olhar | Valor correto |
|---|---|---|
| Telefone | topo, rodapé, contato | (35) 3067-5017 |
| CEP | rodapé, contato, schema | 37002-090 |
| Endereço | rodapé, contato | Rua Santa Cruz, 696 — Centro — Varginha/MG |
| Razão social | rodapé | **a decidir** — não usar "Ltda" se não for |
| CNPJ | rodapé | 29.497.887/0001-57 |
| Horário | rodapé, contato | **a decidir** |
| Link do WhatsApp | botões | `https://wa.me/553530675017` |
| E-mail | rodapé/contato | speed.varginha@gmail.com |

---

## 2. Bloco NAP para o rodapé (copiar e colar)

```html
<address class="nap">
  <strong>Speed Financeira e Lan House</strong><br>
  Correspondente bancário · CNPJ 29.497.887/0001-57<br>
  Rua Santa Cruz, 696 — Centro — Varginha/MG — CEP 37002-090<br>
  Telefone e WhatsApp: <a href="tel:+553530675017">(35) 3067-5017</a><br>
  E-mail: <a href="mailto:speed.varginha@gmail.com">speed.varginha@gmail.com</a><br>
  <a href="https://wa.me/553530675017">Falar no WhatsApp</a>
</address>
```

> Se o nome aprovado for outro, troque apenas a primeira linha.

---

## 3. Dados estruturados (schema)

Inserir no `<head>` da página inicial. Ajuste o horário depois da decisão.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FinancialService",
  "name": "Speed Financeira e Lan House",
  "alternateName": "Speed Financeira",
  "url": "https://speedfinanceira.com.br",
  "telephone": "+55-35-3067-5017",
  "email": "speed.varginha@gmail.com",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Rua Santa Cruz, 696",
    "addressLocality": "Varginha",
    "addressRegion": "MG",
    "postalCode": "37002-090",
    "addressCountry": "BR"
  },
  "areaServed": {
    "@type": "City",
    "name": "Varginha"
  },
  "sameAs": [
    "https://www.instagram.com/speedfinanceira/",
    "https://www.facebook.com/speedfinanceira/"
  ],
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
      "opens": "08:00",
      "closes": "18:00"
    },
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": "Saturday",
      "opens": "09:00",
      "closes": "12:30"
    }
  ]
}
</script>
```

**Validação:** depois de publicar, testar em `https://search.google.com/test/rich-results` e conferir se não há erro de campo obrigatório.

---

## 4. Título e descrição da página inicial

**Título (até ~60 caracteres):**
`Speed Financeira e Lan House | Varginha MG`

**Descrição (até ~155 caracteres):**
`Correspondente bancário e lan house no Centro de Varginha. Consignado INSS e CLT, FGTS, impressão, xerox e serviços digitais. WhatsApp (35) 3067-5017.`

> A descrição pode citar serviços, mas não pode prometer aprovação.

---

## 5. Páginas que precisam do mesmo bloco

- [ ] Página inicial (one-page)
- [ ] Páginas por cidade (`financeira-varginha-mg.html` e afins)
- [ ] Página de serviços digitais
- [ ] Página de contato
- [ ] Blog (rodapé global)

---

## 6. O que remover ou corrigir

| Item | Ação |
|---|---|
| CEP 37010-000 | Trocar por 37002-090 |
| "Promotora de Crédito Ltda" | Remover ou corrigir conforme `03` |
| Botão de WhatsApp com número antigo | Trocar por `wa.me/553530675017` |
| Horário divergente | Substituir pelo aprovado |
| Logos de governo (INSS, Gov.br, Detran) | **Remover** — uso indevido e risco de política |
| Promessa de "aprovação garantida" | **Remover** |
| "Somos oficiais" | **Remover** — a Speed é empresa privada |

---

## 7. Checklist de publicação

- [ ] Nome e horário aprovados
- [ ] Rodapé com NAP completo
- [ ] Schema validado sem erro
- [ ] Todos os links de WhatsApp testados no celular
- [ ] Teste em 360 px, 768 px e 1440 px
- [ ] Nenhum logo oficial de governo
- [ ] Nenhuma promessa de crédito
- [ ] Página de contato funcional
- [ ] Backup do arquivo anterior salvo

---

## 8. Depois de publicar

1. Pedir reindexação no Search Console (se houver acesso).
2. Atualizar Google (telefone, site, horário).
3. Só então reimportar/corrigir as fichas.
4. Registrar data e print no `13_Protocolos.csv`.
