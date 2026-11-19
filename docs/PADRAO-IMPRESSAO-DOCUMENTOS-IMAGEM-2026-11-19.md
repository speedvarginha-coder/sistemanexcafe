# Padrão Operacional e Técnico de Impressão de Documentos em Imagem (Balcão)

**Data de aprovação:** 19/11/2026  
**Unidade:** Speed Financeira & Lan House — Varginha/MG  
**Status:** Vigente e integrado ao Sistema Nexcafé (`LanHouseManager`)  
**Arquivos de referência:** `docs/FLUXO-IMPRESSAO-2026-11-18.md` e `server/pdf-tools.py`

---

## 1. Contexto e Diagnóstico

Diariamente, a Speed recebe dezenas de documentos enviados por clientes via WhatsApp ou digitalizados no balcão em formato de imagem (`.jpeg`, `.jpg`, `.png`). 

### Problemas identificados antes desta padronização:
1. **Distorção e desperdício de papel (estica no A4):**  
   Ao mandar imprimir uma imagem de documento (ex: CNH, CPF ou foto de RG) pelo fluxo padrão de imagem, o sistema ou visualizador do Windows tentava esticar o documento para ocupar a folha A4 inteira. Isso gerava impressões gigantescas, estourava a resolução, gastava quantidade excessiva de toner e passava aspecto amador ao cliente.
2. **Gasto duplo em documentos frente e verso:**  
   Quando o cliente enviava duas fotos (uma da frente e outra do verso do RG), a impressão avulsa gerava **2 folhas A4 separadas**, quando o correto e exigido por órgãos e bancos é que a frente e o verso fiquem na **mesma folha A4** (metade superior, formato cópia/xerox).
3. **Corte acidental de dados no Windows:**  
   No assistente manual do Windows ("Imprimir imagens"), a opção *"Ajustar imagem ao quadro"* vinha frequentemente marcada por padrão, cortando números de CPF, datas de emissão ou bordas de segurança do documento.
4. **Vazamento de receita no caixa:**  
   Para contornar o problema, o atendente saía do painel, abria o Windows Explorer, selecionava as fotos e imprimia pelo assistente do Windows. Como esse caminho é externo ao sistema, o lançamento no caixa não abria automaticamente, gerando esquecimento e furo financeiro na correria do balcão.

---

## 2. A Matriz Oficial de Padrões de Impressão

Todo documento em formato de imagem que chega ao balcão deve seguir estritamente um dos padrões abaixo:

### Padrão 1: Documento de Bolso Individual (1 foto)
* **Aplicações:** CNH aberta/digital, CPF avulso, Cartão do SUS (frente), Título de Eleitor, Crachá, Carteira de Trabalho digital ou foto única.
* **Diagramação na folha A4:**  
  * Posicionado no **Quadrante Superior Esquerdo** (caixa de **9 × 13 cm**).
  * O restante da folha permanece em branco.
* **Regra de enquadramento:** **Sempre proporcional (Fit / Contain)**. A imagem nunca é cortada nem esticada. Mantém margens de respiro de 15 mm.

### Padrão 2: Documento Frente e Verso (2 fotos)
* **Aplicações:** Carteira de Identidade (RG tradicional), Cartão do SUS (frente e verso), CNH antiga (frente e verso desdobrada), Cartão bancário (quando solicitado).
* **Diagramação na folha A4:**  
  * **Frente:** Quadrante Superior Esquerdo (**9 × 13 cm**).
  * **Verso:** Quadrante Superior Direito (**9 × 13 cm**).
  * Ambos lado a lado na metade superior da **mesma folha A4**, idêntico a uma cópia xerox autenticável de balcão.
* **Folhas gastas:** Exatamente **1 folha A4**.

### Padrão 3: Documentos de Família / Lote Pequeno (3 a 4 fotos)
* **Aplicações:** Documentos de casal, RG de irmãos/filhos, conjunto RG + CPF + SUS + Certidão reduzida.
* **Diagramação na folha A4:**  
  * Grade 2 × 2 ocupando os 4 quadrantes da folha (cada um em 9 × 13 cm).
  * Permite imprimir até 4 documentos de bolso em **1 única folha A4**, reduzindo custo para a loja e tempo de máquina.

### Padrão 4: Documento Grande / Folha Inteira (1 foto)
* **Aplicações:** Foto de Certidão de Nascimento ou Casamento, Histórico Escolar, Atestado Médico, Declaração de Matrícula, Contrato ou Laudo fotografado em página inteira.
* **Diagramação na folha A4:**  
  * Ocupa a página inteira A4, mas respeitando uma **margem de segurança de 15 mm** em toda a volta para garantir que nenhuma assinatura, carimbo ou cabeçalho seja cortado pela área não imprimível da impressora.

### Padrão 5: Tira Estreita / Comprovante de Terminal
* **Aplicações:** Foto de comprovante de pagamento de maquininha de cartão, recibo de lotérica ou extrato longo de banco 24h.
* **Diagramação na folha A4:**  
  * Posicionado centralizado no topo da folha com largura física proporcional de ~8 a 10 cm, mantendo altura real sem alargar para o A4.

---

## 3. Regras Comerciais e Cobrança no Caixa

Para garantir clareza com o cliente e evitar prejuízo para a loja:

1. **A cobrança é por FOLHA FÍSICA impressa:**
   * Juntar 2 fotos de RG na mesma folha conta como **1 página impressa**.
   * O valor de tabela da página P&B é **R$ 1,00** (na HP Laser MFP 432).
   * O valor da página colorida é **R$ 2,00** (na Epson L375).
2. **Serviço de Recebimento de Arquivos (Produto #20):**
   * Todo arquivo que chega pelo WhatsApp e demanda atendimento de balcão tem a taxa padrão de **R$ 1,00** de recebimento.
3. **Cálculo da Venda Padrão de RG / CNH:**
   $$\text{Total} = \text{1× Impressão P\&B (R\$ 1,00)} + \text{1× Recebimento de Arquivo (R\$ 1,00)} = \mathbf{R\$\ 2,00}$$
4. **Cópias adicionais:**
   * O campo **"Cópias da folha"** (ao lado do botão "Juntar Documento (Grade 9×13)") define quantas folhas iguais saem em um só clique. Confira o valor antes de imprimir para não desperdiçar papel.
   * Se o cliente pedir 2 cópias do RG montado:
     $$\text{Total} = \text{2× Impressão P\&B (R\$ 2,00)} + \text{1× Recebimento de Arquivo (R\$ 1,00)} = \mathbf{R\$\ 3,00}$$
5. **Idempotência e Segurança:**
   * O sistema impede reimpressão acidental do mesmo lote sem confirmação do atendente: clicar de novo em "Juntar Documento" com as mesmas fotos pergunta se é para imprimir outra vez. Vale para o botão individual "Doc 9×13" e para o botão de lote.
   * O cartão de cobrança abre automaticamente na tela assim que o documento sai na impressora, já com o total de folhas × cópias.

---

## 4. Engenharia Técnica do Módulo

O processamento não depende de visualizadores externos ou assistentes manuais do Windows:

1. **Motor de Composição (`server/pdf-tools.py`):**
   * Usa biblioteca Python `PIL` (Pillow) integrada ao ambiente local.
   * Cria um canvas A4 nativo a **300 DPI** ($2480 \times 3508$ pixels), garantindo máxima nitidez de texto para números miúdos de documentos.
   * Aplica correção automática de orientação de câmera (`ImageOps.exif_transpose`).
   * Calcula as células da grade com precisão milimétrica:
     * Célula 9×13: largura útil de 1004 px, altura útil de 1518 px.
     * Enquadramento via `thumbnail(..., Image.Resampling.LANCZOS)`: preserva a proporção exata sem cortar e sem esticar.
     * Centraliza a imagem no quadrante correspondente.
   * Gera um PDF limpo de 1 página e entrega ao spooler de impressão.
2. **Spooler Direto (`server/print-pdf.ps1`):**
   * Envia o PDF gerado diretamente para o driver da impressora configurada (HP Laser P&B ou Epson Colorida).
   * Sem abrir janelas do Windows, sem dialogs e sem intervenção manual.
3. **Servidor e API (`server/app.js`):**
   * Rota `/api/print/inbox/print-grid`: recebe lista de arquivos (1 a 4), o número de cópias da folha (1 a 20) e monta a folha; dispara a impressão e lança `páginas = cópias` no caixa.
   * Rota `/api/print/inbox/rotate`: gira uma imagem em 90° no disco caso o cliente tenha fotografado deitada.
   * Reimpressão do mesmo lote (mesmas fotos, mesmos tamanhos) só sai com flag de confirmação (`reprint: true`), exigida pelo painel.
4. **Painel do Atendente (`server/public/`):**
   * Botão individual **"Doc 9×13"** em cada linha de foto.
   * Botão em lote **"Juntar Documento (Grade 9×13)"** no topo da tabela: acionado quando 2 a 4 fotos estão marcadas.
   * Ícone de giro rápido (`⟳`) para desvirar fotos na hora.

---

## 5. Procedimento Operacional Padrão (POP) para o Atendente

Ao atender um cliente que enviou foto de documento no WhatsApp:

1. Abra a aba **"Impressão"** no painel do Nexcafé.
2. **Se o cliente mandou CNH ou foto única:**
   * Localize o arquivo na lista.
   * Confira se a miniatura está em pé (se estiver deitada, clique no botão `⟳` para girar).
   * Clique em **"Doc 9×13"**.
3. **Se o cliente mandou RG (Frente e Verso) ou 2 documentos:**
   * Marque a caixinha de seleção $(\square)$ da Frente e a do Verso.
   * Se o cliente pediu mais de uma cópia, acerte o campo **"Cópias da folha"** ao lado do botão azul (o padrão é 1).
   * Clique no botão azul no topo: **"Juntar Documento (Grade 9×13)"**.
   * Se o sistema avisar que o lote já foi impresso, confirme só se for para gastar outra folha de propósito.
4. **Retire a folha na HP Laser:**
   * O documento sairá impresso com a Frente e o Verso perfeitamente alinhados na metade de cima da folha.
5. **Finalize no Caixa:**
   * A janela de cobrança abrirá na tela já preenchida com **R$ 2,00**.
   * Clique em **"Lançar no cupom"**, selecione como o cliente pagou (Dinheiro, Pix, Cartão) e encerre a venda.

---

*Documento registrado em 19/11/2026. Qualquer alteração nos preços, tabelas ou parâmetros de grade deve ser registrada neste mesmo padrão.*

**Registro de alteração (19/11/2026, revisão):** adicionado o campo "Cópias da folha" ao botão de grade (antes o campo de cópias da linha era ignorado no lote) e a trava de reimpressão com confirmação no botão "Juntar Documento (Grade 9×13)" — antes só o botão individual "Doc 9×13" tinha a trava. Cobertura de teste em `tests/integration.test.js` ("grade de documentos 9x13").
