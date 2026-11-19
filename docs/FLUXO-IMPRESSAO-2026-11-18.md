# Sistema de Impressão do Balcão — Fluxo WhatsApp até o Caixa

**Data:** 18/11/2026
**Status:** em produção, validado com impressões reais
**Escopo:** receptor de arquivos (extensão do WhatsApp), fila de impressão no painel, impressão em 1 clique, cartão de cobrança e lançamento no Caixa e vendas.

---

## 1. Objetivo

Receber o arquivo que o cliente manda pelo WhatsApp, imprimir com o mínimo de cliques e **cobrar certo**, lançando no caixa como sempre foi feito — sem Chrome aberto, sem Ctrl+P e sem digitar páginas na mão.

### Problemas que motivaram o projeto (diagnóstico de 13 a 18/11/2026)

- 227 arquivos recebidos em 6 dias (140 PDFs, 62 imagens, 18 Office); pico entre 11h e 12h.
- Fluxo antigo: 4 decisões manuais por trabalho (Chrome, Ctrl+P, escolher impressora, digitar páginas no caixa). O vigia antigo (`Vigiar-Downloads.ps1`) abria o Chrome sozinho e mandava Ctrl+P — caminho **sem registro no caixa**, que gerou vazamento de faturamento.
- Mesmo serviço cobrado com preços diferentes (R$ 0,50 e R$ 1,00) por falta de um caminho único.
- 6 PDFs falsos (página de internet salva como `.pdf`) e 1 `.exe` recebido na pasta.
- Faturas de operadora chegam **protegidas por senha** e travavam a impressão.

---

## 2. Arquitetura

```
[Cliente manda PDF no WhatsApp 1:1]
        │  (extensão Chrome "Nexcafe" + WPP da WaSpeed)
        ▼
L:\Meu Drive\Rotina Diaria\Recebimento de Arquivos
   "Nome do Cliente - boleto.pdf"
        │  (vigia leve do servidor: 1 leitura de nomes a cada 20 s)
        ▼
┌─────────────────── Servidor Nexcafé (porta 4780) ───────────────────┐
│  server/print-pdf.ps1    contagem de páginas, cor, código de barras,  │
│                          conversão Office→PDF, desbloqueio com senha    │
│  server/pdf-tools.py     conserta PDF / abre PDF com senha (pypdf)      │
│  server/app.js            fila, impressão, cobrança, aviso de chegada   │
└────────────────────────────────────────────────────────────────────────┘
        │
        ▼
Aba "Impressão" do painel → 1 clique → impressora (HP P&B / Epson cor)
        │
        ▼
Cartão de cobrança (abre sozinho) → cupom do "Caixa e vendas"
   1× Recebimento de Arquivos (R$ 1,00) + N× Impressão (tabela)
        │
        ▼
Tela "Finalizar venda" → forma de pagamento → venda registrada
```

### Componentes

| Componente | Papel |
|---|---|
| Extensão Chrome (`extensoes/whatsapp-pdf/`) | Baixa automaticamente PDFs de conversas **individuais** com o nome do cliente na frente |
| Pasta de recebimento | Ponto único de entrada de arquivos (Drive sincroniza, serve de histórico) |
| Servidor (`server/app.js`, porta 4780) | Fila, impressão, cobrança, aviso de chegada, boleto automático |
| Script de impressão (`server/print-pdf.ps1`) | Conta páginas, detecta cor e código de barras, imprime direto no driver |
| Painel (aba **Impressão**) | Fila de arquivos, botões de impressão, cartão de cobrança, resumo do dia |

---

## 3. Como atende (manual do balcão)

1. **Chegou arquivo** → bip no painel e aviso "Arquivo recebido: Nome do Cliente - boleto.pdf". A fila marca **"Novo · aguardando"** em destaque por 15 min.
2. **Um clique imprime**:
   - **P&B** → HP Laser MFP 432 (sulfite, boletos e documentos).
   - **Cor** → Epson L375; documento sem cor cai automaticamente para preço P&B.
   - **Especial** → Epson em alta resolução usando a folha inteira (papel foto/adesivo/cartão).
   - **Escolher** → abre a janela do Windows/Chrome (frente e verso manual, outra impressora). *Este caminho não gera registro — usar só quando necessário.*
   - **Cópias** → campo ao lado dos botões (1 a 20). Ex.: 4 folhas × 2 cópias = 8 páginas impressas e cobradas.
   - **FV** → botão por linha: aperta, fica verde, e a impressão daquela linha sai frente e verso na HP.
   - **Lote** → marque as caixas de várias linhas e clique **"Imprimir N selecionado(s) (P&B)"**: sai tudo em sequência e abre **um cartão com o total**.
3. **Cartão de cobrança** abre sozinho após a impressão, com páginas reais e valor de tabela editável. Destinos:
   - **Lançar no cupom (Caixa e vendas)** — padrão: entra `1× Recebimento de Arquivos` + `N× Impressão` no cupom e a tela **"Finalizar venda"** abre direto para escolher a forma de pagamento.
   - **Juntar na máquina** — entra na comanda da estação em uso, sai no "Encerrar e receber".
   - **Deixar pendente** — cobrança registrada sem pagamento.
4. **Boleto automático (opcional)**: com o interruptor "Boleto de 1 página imprime sozinho" ligado, PDF de 1 página com código de barras imprime sozinho na HP — a cobrança continua esperando o atendente.
5. **Fila por arquivo**: `Novo · aguardando` → `Impresso · falta cobrar` (com botão **Cobrar**) → `No cupom · finalize no caixa` → `Cobrado`.
6. **Resumo do dia** (faixa acima da fila): trabalhos, páginas P&B e cor, valor impresso, valor cobrado e alerta **"X sem cobrança"** dos últimos 7 dias.

---

## 4. Regras de negócio configuradas

| Regra | Valor |
|---|---|
| Página P&B | R$ 1,00 (impressora HP Laser MFP 432 PCL6) |
| Página colorida | R$ 2,00 (impressora EPSON176647 L375 Series) |
| Documento sem cor impresso na Epson | cobrado como P&B (automático) |
| Recebimento de arquivo (produto #20) | R$ 1,00, entra por padrão em todo lançamento (desmarcável no cartão) |
| Faixas de volume (`printTiers`) | cadastradas, **desligadas** por decisão do dono |
| Lançamento no caixa | **nunca automático**: sempre com confirmação e valor ajustável |

### Proteções embutidas

- **Fatura de banco/operadora em PDF (regra de 19/11/2026):** se o PDF tem 2 a 10 páginas e só algumas têm código de barras de boleto, abre o **cartão de autorização** mostrando a folha do pagamento renderizada (imagem da página identificada) e a cobrança (`pág × R$ 1,00 + recebimento`). O atendente confere se a página está certa e escolhe: **"Autorizar e imprimir"** (só a folha do boleto), **"Imprimir PDF inteiro"** ou **Cancelar** — nenhuma folha sai sem autorização. Depois de imprimir, o cartão de cobrança abre como sempre. PDF de 1 página, sem código de barras ou com todas as páginas codificadas sai inteiro e direto; o mesmo vale no botão de lote. PDF com senha sai inteiro (a leitura do código de barras não abre o original).
- Mesmo arquivo não imprime duas vezes sem confirmar ("Este arquivo já foi impresso em DD/MM HH:MM").
- Mesmo trabalho nunca é **cobrado** duas vezes (idempotência por `ref: print:<jobId>`).
- Cobrança confere com as folhas: se o script de impressão não devolver a contagem, o caixa usa o que deveria sair (páginas do documento ou da seleção × cópias) — nunca cobra a menos que imprimiu.
- PDF falso (HTML disfarçado) é sinalizado "Não imprimível" e recusado antes de gastar papel.
- PDF com senha aparece como "Protegido por senha": o atendente digita a senha do cliente (CPF/telefone) e imprime; a cópia desbloqueada fica em cache local, o original não é tocado.
- Word/Excel/PowerPoint são convertidos com **macros desativadas** e em modo somente leitura.
- `.exe` e outros executáveis nunca são listados nem abertos (um recebido em 16/11 foi isolado em `_nao-imprimir`).
- Boleto automático só dispara se: 1 página + código de barras + chegou nos últimos 30 min + caixa aberto + nunca impresso + no máximo 3 por ciclo.

---

## 5. API (endpoints desta entrega)

| Método e rota | Função |
|---|---|
| `GET /api/print/inbox` | Lista a pasta (cache 30 s) com páginas, validade, senha, situação, resumo do dia e preço do recebimento |
| `POST /api/print/inbox/print` | Imprime um arquivo: `{ name, mode: bw\|color\|special\|choose, copies, duplex, password, reprint }`; fatura em PDF devolve `printPages`/`totalPages` quando sai só a folha do boleto |
| `POST /api/print/inbox/fatura-preview` | Fatura em PDF: devolve as páginas do boleto renderizadas em JPEG (base64) e a cobrança prevista para o atendente autorizar antes de imprimir |
| `POST /api/print/inbox/print-batch` | Imprime vários marcados; devolve total único e erro por arquivo sem parar o lote |
| `POST /api/print/inbox/charge` | Registra a cobrança de 1 ou N trabalhos: `{ jobId(s), amountCents, receipt, target: now\|machine\|pending, sessionId, method }` |
| `POST /api/print/inbox/auto` | Liga/desliga o boleto automático |
| `POST /api/settings/print-route` | Impressoras P&B e cor + pasta de recebimento (`inboxDir`) |
| `POST /api/printers/open-driver-prefs` | Abre as preferências do driver da Epson (bandeja/mídia) |
| `GET /api/state` | Inclui `printJobs` de balcão e `inboxNews` (arquivos que acabaram de chegar) |
| `POST /api/sales` | Aceita `printJobIds`: a venda finalizada marca os trabalhos como cobrados |

---

## 6. Arquivos importantes

| Caminho | Papel |
|---|---|
| `server/print-pdf.ps1` | Ações `List`, `Print`, `Barcode`, `Info`, `Inbox`, `PageImage` (pré-visualização da folha do boleto); parâmetros `-Copies`, `-Duplex`, `-Margin`, `-Page`, `-Password`, `-Pages`, `-Quality` |
| `server/pdf-tools.py` | `repair` (conserta PDF) e `unlock` (abre com senha do cliente) via pypdf |
| `server/app.js` | Servidor (endpoints acima, vigia de chegada, boleto automático, resumo do dia) |
| `server/public/index.html` / `app.js` / `styles.css` | Aba Impressão, cartão de cobrança, integração com o cupom do PDV |
| `extensoes/whatsapp-pdf/` | Extensão que baixa os PDFs com nome do cliente |
| `Abrir-Para-Imprimir.ps1` | Legado: usado só pelo modo "Escolher" (janela do Windows) |
| `Vigiar-Downloads.ps1` | **Aposentado** (vira stub que só imprime aviso e sai) |
| Cache local `%LOCALAPPDATA%\Nexcafe\` | `print-inbox-cache.json` (contagem de páginas), `inbox-convertidos\` (Office→PDF), `inbox-reparados\` (PDFs consertados/desbloqueados) |

---

## 7. Infraestrutura e decisões técnicas

- **Servidor:** tarefa agendada `LanHouseManager-Servidor`, executando como o usuário logado (Desktop), interativa. *Era SYSTEM e não enxergava o Drive (L:) nem o Office — trocado em 18/11/2026.* Gatilho de repetição a cada 1 min com `IgnoreNew` mantém uma instância viva.
- **Vigia antigo aposentado:** o antigo `Vigiar-Downloads.ps1` abria o Chrome e mandava Ctrl+P (impressão sem registro). Processo encerrado, script virou stub e o atalho de inicialização foi removido.
- **Correção de HTML pré-existente:** o `monitorDialog` não fechava no `index.html`, engolindo o diálogo "Lançar PDF" e os avisos (toast) — ninguém os via. Corrigido.
- **Cache de leitura da pasta:** a contagem de páginas fica em cache por arquivo (nome+tamanho+data); a leitura caiu de ~29 s para ~2 s com 220 arquivos.
- **Arquivos estáticos** (`app.js`, `styles.css`, `index.html`) são servidos com `no-store`: basta F5 no navegador após atualizações.
- **Faturas com senha:** senhas não são armazenadas; a cópia desbloqueada fica em cache local, chaveada por arquivo+senha.

---

## 8. Validação executada (18/11/2026)

- 51 verificações automáticas do fluxo (impressão, cópias, FV, lote com arquivo inválido no meio, cobrança única do lote, recebimento junto, senha errada/correta, boleto automático sem cobrança, resumo do dia, deduplicação).
- 86 testes do sistema (`npm test`) passando.
- Impressões físicas reais na HP: 22:16 (página em branco, de propósito) e 22:54 (página "TESTE DE IMPRESSÃO"), ambas confirmadas no caixa com cupom + "Finalizar venda".
- Conversão real de 17 arquivos Office da pasta (Word, Excel, PowerPoint) e leitura da pasta real (223 arquivos).

---

## 9. Limitações conhecidas e pendências

| Item | Situação |
|---|---|
| Modo "Escolher" (janela do Windows) | Imprime mas **não registra** por decisão de projeto; cobrança manual no PDV |
| Boleto automático | Sempre 1 cópia; duplicata usa o campo de cópias |
| "Juntar na máquina" | Lógica coberta por teste automatizado; falta uso real com cliente em sessão |
| Caixa de 18/11 | Entraram **R$ 6,00 de vendas de teste** (3 × R$ 2,00 às 22:53/22:53/22:55) — considerar na conferência do turno |
| Pasta acumula arquivos | Impresso+cobrado continua na pasta (ideia futura: arquivar por mês) |
| Arquivos idênticos com "(1)" | Ainda permitem reimpressão (ideia futura: dedupe por conteúdo) |

### Backlog priorizado (não construído)

1. Arquivamento automático da pasta (impresso + cobrado → `impressos/mês`).
2. Deduplicação por hash de conteúdo (caso AT01445299 recebido 6×).
3. Histórico do dia detalhado por tipo de papel.

---

## 10. Manutenção rápida

| Situação | O que fazer |
|---|---|
| Reiniciar o servidor | `Stop-ScheduledTask LanHouseManager-Servidor; Start-ScheduledTask LanHouseManager-Servidor` |
| Painel estranho depois de update | F5 na aba (não precisa Ctrl+F5) |
| Extensão atualizada | `chrome://extensions` → recarregar → F5 na aba do WhatsApp Web |
| Fila lenta ou errada | Apagar `%LOCALAPPDATA%\Nexcafe\print-inbox-cache.json` (reconta na próxima leitura) |
| Impressora não pega trabalho | `Get-Printer` + `Get-PrintJob -PrinterName "HP Laser MFP 432 PCL6"`; conferir fila e status |
| Teste sem gastar papel | `powershell -File server\print-pdf.ps1 -Action Info -Path "<arquivo>"` devolve páginas/validade sem imprimir |
| Ver o que o servidor recebeu | aba Impressão → resumo do dia; ou `db.json` → `printJobs` (source `counter`) |
