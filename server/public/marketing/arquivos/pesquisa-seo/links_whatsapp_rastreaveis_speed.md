# DICIONÁRIO DE LINKS RASTREÁVEIS DE WHATSAPP — SPEED FINANCEIRA
**Número Oficial:** `+55 (35) 3067-5017`  
**Objetivo:** Eliminar o atrito comercial e identificar a origem exata de cada lead no momento da mensagem.

---

## 1. Links Prontos para Botões de Ação no Site (Landing Pages)

### A. Antecipação do Saque-Aniversário FGTS
* **Onde usar:** Botão da página de FGTS e anúncios específicos de FGTS.
* **Mensagem pré-preenchida:**  
  *"Olá! Vi a Speed Financeira no Google e gostaria de fazer uma simulação da antecipação do meu FGTS pelo Pix."*
* **Link direto:**  
  `https://wa.me/553530675017?text=Olá!%20Vi%20a%20Speed%20Financeira%20no%20Google%20e%20gostaria%20de%20fazer%20uma%20simulação%20da%20antecipação%20do%20meu%20FGTS%20pelo%20Pix.`

---

### B. Empréstimo Consignado INSS & Aposentados
* **Onde usar:** Página de Consignado INSS e anúncios para aposentados/pensionistas.
* **Mensagem pré-preenchida:**  
  *"Olá! Sou aposentado/pensionista do INSS e gostaria de consultar minha margem disponível com as taxas reduzidas."*
* **Link direto:**  
  `https://wa.me/553530675017?text=Olá!%20Sou%20aposentado/pensionista%20do%20INSS%20e%20gostaria%20de%20consultar%20minha%20margem%20disponível%20com%20as%20taxas%20reduzidas.`

---

### C. Portabilidade de Consignado com Troco na Mão
* **Onde usar:** Página de Portabilidade, artigos do blog sobre redução de juros e anúncios de troco.
* **Mensagem pré-preenchida:**  
  *"Olá! Já tenho empréstimos consignados e gostaria de fazer um cálculo gratuito para reduzir minha parcela e liberar dinheiro de troco."*
* **Link direto:**  
  `https://wa.me/553530675017?text=Olá!%20Já%20tenho%20empréstimos%20consignados%20e%20gostaria%20de%20fazer%20um%20cálculo%20gratuito%20para%20reduzir%20minha%20parcela%20e%20liberar%20dinheiro%20de%20troco.`

---

### D. Beneficiários do BPC / LOAS
* **Onde usar:** Página e posts dedicados ao BPC/LOAS.
* **Mensagem pré-preenchida:**  
  *"Olá! Recebo o benefício BPC/LOAS e gostaria de saber se tenho margem liberada para empréstimo consignado."*
* **Link direto:**  
  `https://wa.me/553530675017?text=Olá!%20Recebo%20o%20benefício%20BPC/LOAS%20e%20gostaria%20de%20saber%20se%20tenho%20margem%20liberada%20para%20empréstimo%20consignado.`

---

### E. Empréstimo Consignado CLT (Empresas Conveniadas)
* **Onde usar:** Página de crédito consignado privado para trabalhadores de carteira assinada.
* **Mensagem pré-preenchida:**  
  *"Olá! Trabalho com carteira assinada e gostaria de verificar se a minha empresa possui convênio para consignado CLT."*
* **Link direto:**  
  `https://wa.me/553530675017?text=Olá!%20Trabalho%20com%20carteira%20assinada%20e%20gostaria%20de%20verificar%20se%20a%20minha%20empresa%20possui%20convênio%20para%20consignado%20CLT.`

---

### F. Financiamento de Veículos & Garantia de Carro (Auto Equity)
* **Onde usar:** Página de financiamentos de veículos e refinanciamento de carros quitados.
* **Mensagem pré-preenchida:**  
  *"Olá! Gostaria de fazer uma simulação de financiamento veicular / empréstimo usando meu veículo como garantia."*
* **Link direto:**  
  `https://wa.me/553530675017?text=Olá!%20Gostaria%20de%20fazer%20uma%20simulação%20de%20financiamento%20veicular%20/%20empréstimo%20usando%20meu%20veículo%20como%20garantia.`

---

### G. Atendimento Presencial na Loja do Centro de Varginha
* **Onde usar:** Ficha do Google Maps, rodapé do site e página de contato.
* **Mensagem pré-preenchida:**  
  *"Olá! Gostaria de tirar uma dúvida sobre empréstimo e agendar um atendimento na loja física da Rua Santa Cruz."*
* **Link direto:**  
  `https://wa.me/553530675017?text=Olá!%20Gostaria%20de%20tirar%20uma%20dúvida%20sobre%20empréstimo%20e%20agendar%20um%20atendimento%20na%20loja%20física%20da%20Rua%20Santa%20Cruz.`

---

## 2. Instrução de Monitoramento no Google Analytics 4 (GA4)

Para medir exatamente quantos cliques cada botão recebe no site, adicione o seguinte atributo `data-event` nos links `<a>`:
```html
<!-- Exemplo para o Botão do FGTS -->
<a href="https://wa.me/553530675017?text=..." 
   target="_blank" 
   rel="noopener noreferrer"
   data-analytics-category="WhatsApp"
   data-analytics-action="Click_WhatsApp_FGTS"
   class="btn-whatsapp-fgts">
   Simular FGTS no WhatsApp
</a>
```
Isso dispara um evento customizado no GA4 (`conversion_whatsapp_lead`), permitindo calcular o CPL (Custo por Lead) exato de cada canal.
