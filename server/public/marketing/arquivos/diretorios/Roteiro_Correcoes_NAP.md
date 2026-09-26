# Roteiro de Correções NAP — Speed Financeira

> Documento de trabalho para corrigir as fichas com erro confirmado nos diretórios.
> **Gerado em:** 21/09/2026

---

## 1. Dados NAP oficiais (usar em TODAS as correções)

| Campo | Valor padrão |
|---|---|
| **Nome** | Speed Financeira – Empréstimo Consignado e Financiamento em Varginha |
| **Nome alternativo** | Speed Financeira |
| **Endereço** | Rua Santa Cruz, 696 – Centro – Varginha/MG |
| **CEP** | 37002-090 |
| **Telefone / WhatsApp** | (35) 3067-5017 |
| **WhatsApp link** | https://wa.me/553530675017 |
| **E-mail** | speed.varginha@gmail.com |
| **Site** | https://speedfinanceira.com.br |
| **CNPJ** | 29.497.887/0001-57 |
| **Horário** | Seg a Sex 08:00–18:00 · Sáb 08:00–12:00 |

Regra: o telefone **3113-0458 está desativado**. Nunca usar. O correto é sempre **(35) 3067-5017**.

---

## 2. Passo 0 — Publicar o site oficial (fazer primeiro)

O build já foi corrigido (CEP 37002-090 + nome padrão). Falta subir ao ar.

- [ ] Rodar `PUBLICAR_SITE.bat` (raiz do projeto)
- [ ] Conferir em https://speedfinanceira.com.br: rodapé com nome padrão, CEP 37002-090, telefone (35) 3067-5017
- [ ] Marcar como concluído no CSV (linha "Site oficial")

---

## 3. Correções em diretórios externos (por prioridade)

### URGENTE — WhatsApp quebrado mandando cliente para número morto

#### UENI
- **Ficha:** https://speedlanhouse.ueniweb.com/
- **Erro:** 4 botões de WhatsApp apontam para `553531130458` (desativado). O número correto não aparece em lugar nenhum.
- **Login:** Sim (conta do site na UENI)
- **Passos:**
  1. Entrar no painel da UENI (velho domínio `speedlanhouse.ueniweb.com`)
  2. Localizar todos os botões/links de WhatsApp
  3. Trocar o número para `553530675017` (ou link `https://wa.me/553530675017`)
  4. Adicionar o telefone (35) 3067-5017 em local visível da página
  5. Publicar e revalidar a página em janela anônima
- [ ] Concluído
- **Alternativa:** se não for possível corrigir, tirar o site do ar.

---

### Telefone errado (3113-0458 → 3067-5017)

#### Bendito Guia
- **Ficha:** https://www.benditoguia.com.br/empresa/speed-financeira-e-lan-house-centro-varginha-mg
- **Erro:** telefone 3113-0458
- **Passos:**
  1. Abrir a ficha e procurar o botão/link "Sugerir alteração", "Corrigir dados" ou contato do site
  2. Enviar a correção: telefone para (35) 3067-5017, nome padrão, CEP 37002-090
- [ ] Concluído

#### Brasil Locais
- **Ficha:** https://brasillocais.com/minas-gerais/speed-financeira-e-lan-house-314988
- **Erro:** telefone 3113-0458. Tem 2 avaliações — vale reivindicar a ficha.
- **Passos:**
  1. Procurar opção de reivindicar/claim da ficha
  2. Após o acesso, editar o telefone para (35) 3067-5017
- [ ] Concluído

#### Planeta Brasileiro (ficha 1)
- **Ficha:** https://www.planetabrasileiro.com/speed-financeira-e-lan-house-F1008C40E1CD645
- **Erro:** telefone 3113-0458, horário 07:30–22:00 todos os dias (inclusive domingo), site apontando para o Spotway.
- **Login:** Não (usar "Sugerir uma alteração")
- **Passos:**
  1. Usar a opção "Sugerir uma alteração" na ficha
  2. Corrigir: telefone (35) 3067-5017 · horário Seg-Sex 08:00–18:00, Sáb 08:00–12:00 · site https://speedfinanceira.com.br
- [ ] Concluído

#### Planeta Brasileiro (ficha 2)
- **Erro:** duplicidade dentro do mesmo diretório.
- **Passos:**
  1. Buscar "Speed" no site e localizar a 2ª ficha
  2. Pedir unificação com a ficha 1 (F1008C40E1CD645)
- [ ] Concluído

#### Solutudo (ficha 2)
- **Ficha:** https://www.solutudo.com.br/empresas/mg/varginha/lan-house/speed-lan-house-servicos-digitais-e-financeira-22353545
- **Erro:** telefone 3113-0458 no ar, sem horários.
- **Login:** Sim
- **Passos:**
  1. Entrar no painel da Solutudo
  2. Corrigir telefone para (35) 3067-5017 e preencher horários
  3. Pedir mesclagem com a ficha matriz `23132000` (que já está correta)
- [ ] Concluído

#### eGuias
- **Ficha:** https://eguias.net/empresa/speed-financeira-e-lan-house/varginha/mg/3548163
- **Erro:** número do imóvel cadastrado como **6969** (correto: 696); telefone 3113-0458 no título.
- **Passos:**
  1. A página tem botão público de "alterar cadastro" — testar em janela anônima
  2. Corrigir número do imóvel para 696 e telefone para (35) 3067-5017
  3. Se pedir login, criar conta e vincular
- [ ] Concluído

#### EmpresaFone
- **Ficha:** https://www.empresafone.com.br/empresa/speed-lan-house-e-financeira-lan-house-financeiras-correspondentes-de-instituicoes-financeiras-centro-3271489
- **Erro:** telefone 3113-0458. Endereço e CEP já corretos.
- **Login:** Sim
- **Passos:**
  1. Entrar no painel EmpresaFone
  2. Trocar telefone para (35) 3067-5017
- [ ] Concluído

---

### Duplicidade — pedir unificação

#### TeleListas (ficha 2)
- **Ficha:** https://www.telelistas.net/locais/mg/varginha/impressao%2Beletronica%2Be%2Bdigital/bu-20063351/speed%2Blan%2Bhouse%2Bem%2Bcentro?amp=1
- **Erro:** telefone **3067-4361** no ar (número errado).
- **Login:** Não (reporte público)
- **Passos:**
  1. Reportar o telefone incorreto
  2. Pedir unificação com a ficha matriz `bu-21209255`
- [ ] Concluído

---

### Redes sociais

#### Instagram
- **Perfil:** https://www.instagram.com/speedfinanceira/
- **Erro:** há publicação divulgando o telefone 3113-0458.
- **Login:** Sim
- **Passos:**
  1. Revisar posts fixados e bio
  2. Apagar/editar publicações com o número antigo
  3. Trocar o link da bio para `https://wa.me/553530675017`
- [ ] Concluído

---

### Dados incompletos / categoria errada

#### Zapia Digital
- **Ficha:** https://www.zapia.digital/varginha-mg/centro/assistencia-tecnica-para-informatica/speed-lan-house/5421379
- **Erro:** telefone não aparece, horários todos como "Confirmar", categoria errada (assistência técnica de informática).
- **Login:** Não (e-mail ao suporte)
- **Passos:**
  1. Escrever para o suporte da Zapia
  2. Informar: telefone (35) 3067-5017, horários (Seg-Sex 08:00–18:00, Sáb 08:00–12:00) e pedir troca de categoria para "Correspondente bancário / financeira"
- [ ] Concluído

---

## 4. Acompanhamento

Após cada correção concluída:
1. Atualizar a coluna **"Ajuste a realizar"** no `Controle_Diretorios_Speed_2026-09-10.csv` para indicar "Conferido {data}: corrigido"
2. Rodar `python diretorios.py` em `speedgeo/` para recalcular o NAP Score
3. Reabrir `speedgeo/relatorio_nap.html` para conferir o novo status

> Objetivo: subir o NAP Score de 18,2% para ~40% (fichas com erro confirmado corrigidas).