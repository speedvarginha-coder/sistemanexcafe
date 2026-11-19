# Projeto Nexcafé / LanHouseManager — Documentação Completa

**Data:** 18/11/2026
**Versão do sistema:** 0.2.0 (v2 do banco de dados)
**Natureza:** sistema local, roda no computador do caixa, sem dependência de nuvem para operar.

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [A loja em números](#2-a-loja-em-números)
3. [Arquitetura geral](#3-arquitetura-geral)
4. [Módulos do sistema](#4-módulos-do-sistema)
5. [Segurança e proteção de dados](#5-segurança-e-proteção-de-dados)
6. [Infraestrutura e operação](#6-infraestrutura-e-operação)
7. [Estado atual (18/11/2026)](#7-estado-atual-18112026)
8. [Limitações conhecidas](#8-limitações-conhecidas)
9. [Backlog priorizado](#9-backlog-priorizado)
10. [Mapa de arquivos e documentação](#10-mapa-de-arquivos-e-documentação)
11. [Manutenção rápida](#11-manutenção-rápida)

---

## 1. Visão geral

O **Nexcafé (LanHouseManager)** administra uma lan house com **8 estações Windows 10**, do acesso do cliente ao fechamento do caixa. Além da operação clássica de lan house (tempo de máquina), o sistema virou a retaguarda completa do balcão:

- **Atendimento:** liberação de tempo pré ou pós-pago, cliente entrando sozinho com saldo, monitoramento remoto, ligar/desligar máquinas, restauração do padrão ao encerrar.
- **Balcão:** caixa/PDV com produtos, serviços e combos; impressão de documentos vindos do WhatsApp com cobrança integrada; consultas CRLV; serviços da Speed Financeira.
- **Gestão:** despesas (com leitura de contas por OCR e extratos bancários), relatórios/DRE, metas, plano de ação e uma suíte de marketing local (ficha do Google, posts, Search Console, ranking de mapa, cliques no WhatsApp).
- **Segurança:** bloqueio de tela nas estações, limpeza do perfil do cliente ao encerrar, cofre de logins cifrado e três camadas de backup do banco.

Histórico da loja e do sistema: `docs/historico-nexcafe-2022-2026.md`.

---

## 2. A loja em números

| Item | Valor atual |
|---|---|
| Estações | 8 PCs com Windows 10, conta `Cliente` sem administrador + conta `Tecnico` de manuteção |
| Tarifas de tempo | 15 min R$ 3,00 · 30 min R$ 3,70 · 60 min R$ 5,00 · por hora acima da última faixa |
| Cobrança de tempo | Minuto efetivo, arredondado para cima, limitado ao contratado |
| Impressão P&B | R$ 1,00/pág — HP Laser MFP 432 PCL6 (rede 192.168.1.22) |
| Impressão colorida | R$ 2,00/pág — Epson L375 (USB); cai para P&B se o documento não tem cor |
| Recebimento de arquivo | R$ 1,00 (serviço #20 do catálogo), acompanha todo arquivo do WhatsApp |
| Faixas de volume de impressão | Cadastradas (11+ / 51+ / 151+), **desligadas** por decisão do dono |
| Papel especial | Foto/adesivo/cartão pelo catálogo; impressão usa a folha inteira em alta resolução |

---

## 3. Arquitetura geral

```
                    REDE LOCAL (isolada; HTTP sem criptografia — não abrir a 4780 para a internet)
 ┌────────────────────────────┐          ┌───────────────────────────────┐
 │  PC DO CAIXA (servidor)     │          │  8 ESTAÇÕES (agente)          │
 │                            │          │                               │
 │  Node.js porta 4780         │◀──HTTP──▶│  LanHouseAgent.ps1            │
 │   server/app.js             │  token   │   • tela de bloqueio          │
 │   painel web (public/)      │  Bearer  │   • contador de tempo/valor   │
 │   print-pdf.ps1 (impressão) │          │   • restauração/limpeza       │
 │   pdf-tools.py (PDFs)       │          │   • WOL / comandos            │
 │   db.json (dados)           │          │   • auto-atualização          │
 └────────────────────────────┘          └───────────────────────────────┘
      ▲            ▲            ▲
      │ painel     │ Drive L:   │ tarefa agendada
      │ (Chrome)   │ (Drive)    │ LanHouseManager-Servidor
      │            │ pasta de   │ (usuário Desktop, reinício automático)
      │ extensão   │ recebimento│
      │ WhatsApp   │ de arquivos│
```

### Componentes

| Componente | Tecnologia | Função |
|---|---|---|
| Servidor | Node.js puro (sem framework), porta 4780 | Autenticação, sessões, caixa, cadastros, relatórios, fila de impressão, marketing |
| Painel | HTML/JS/CSS servido de `server/public` | Interface única do atendente/dono (aba Balcão + Gestão & Mkt) |
| Agente | PowerShell na sessão do cliente | Bloqueio, restauração, comandos, monitor de tela |
| Impressão | `print-pdf.ps1` + WinRT/GDI+ (+ `pdf-tools.py`) | Contagem de páginas, detecção de cor e código de barras, conversão Office, desbloqueio com senha |
| Extensão Chrome | MV3, conteúdo no mundo da página (usa WPP da WaSpeed) | Baixa automaticamente PDFs de conversas individuais com o nome do cliente |
| Banco | `server/data/db.json` (JSON único, escrita durável com fsync) | Caixa, clientes, produtos, sessões, marketing, tudo |

### Modelo de dados (coleções principais do `db.json`)

`machines` (estações e sessão ativa) · `clients` (cadastro, saldo, fiado) · `products` · `charges` (vendas e pendências) · `payments` · `cashShifts`/`cashAdjustments` · `sessionHistory` · `stockMovements` · `expenses` · `events` · `users`/`loginSessions` · `printJobs` · `waitList` · `campaigns` · `leads`/contratos · `marketing` (ficha, posts, geogrid) · `vault` (cofre cifrado) · `crlv` (token APIBrasil).

Registros com mais de **45 dias** saem do `db.json` para `archive-YYYY-MM.json` (o relatório diário lê o arquivo do mês correspondente quando consulta data antiga).

---

## 4. Módulos do sistema

### 4.1 Atendimento (estações)

- Liberação **pré-paga** (venda lançada na hora) ou **pós-paga** (cobrança no encerramento), com cliente identificado ou avulso.
- **Encerrar e receber:** desconto opcional, pagamento único com `receiptId` comum a várias pendências; opcionalmente reinicia a estação.
- Expiração automática: tempo esgotado → servidor encerra e pede restauração mesmo sem atendente.
- **Pausar/retomar:** para o relógio e a cobrança; retomar desconta o tempo parado.
- **+Tempo / +Consumo:** produtos e impressões entram na comanda da sessão.
- Lista de espera, monitoramento de inatividade (mouse/teclado), eventos por estação.
- Ligação via **Wake-on-LAN** (MAC aprendido quando a estação fica online) e desligamento individual ou em massa das livres.
- **Monitoramento remoto** (~3 quadros/s) com controle de mouse e teclado; avisos sem roubar o foco.
- **Restauração ao encerrar:** área de trabalho, Downloads, Documentos, Imagens, Vídeos e Músicas voltam ao padrão capturado; limpa navegadores (histórico, cookies, senhas, conta), WhatsApp/Telegram/Discord, arquivos recentes, senhas salvas do Windows e a lixeira; fecha programas abertos pelo cliente.
- Auto-atualização do agente (tarefa `LanHouseManager-Atualizador`, a cada 2 min); reinstalação por pendrive/ZIP com chave de instalação regenerável.

### 4.2 Cliente entra sozinho (saldo)

- Cadastro com **login/senha**; recarga em reais convertida em tempo pela tarifa-hora (venda registrada no caixa, com `ref` único contra recarga duplicada).
- Na tela bloqueada o cliente entra com o saldo; um cadastro só ocupa uma estação por vez; o tempo restante **volta ao saldo** ao encerrar.
- Pacotes pré-pagos: caixa na venda, receita reconhecida só na entrega.

### 4.3 Caixa e vendas (PDV)

- Turno com fundo inicial, recebimentos em **dinheiro/Pix/débito/crédito**, pagamentos **misto** (mesma venda, mesma tela), fiado com cliente cadastrado, desconto com valor de tabela preservado (`listPriceCents`).
- Venda rápida: busca, código de barras, **favoritos e combos** (ex.: "1× Receb. arquivo + 2× Imp. P/B R$ 3,00"), item avulso com preço livre, lançar PDF manual.
- Consumo na estação entra como pendência da sessão (recebido no encerramento).
- Pendências a receber, cancelamento de pendência **só admin com motivo** (o já pago fica), troca de forma de pagamento após recebido.
- Fechamento **exclusivo de admin** com conferência do dinheiro físico, extrato do turno, ajustes e retirada do dono.

### 4.4 Impressão do balcão (entregue em 18/11/2026) ⭐

Fluxo completo WhatsApp → fila → impressora → caixa, sem Chrome e sem Ctrl+P:

1. Extensão baixa o PDF de conversa individual como **"Nome do Cliente - arquivo.pdf"** na pasta de recebimento.
2. Servidor vigia a pasta; painel **apita "Arquivo recebido"** em qualquer aba.
3. Aba **Impressão**: fila com páginas reais, tipo (PDF/imagem/Word/Excel/PPT), situação e botões **P&B / Cor / Especial / Escolher**, mais **cópias** (1–20), **FV** (frente e verso) e **seleção para lote**.
4. Word/Excel/PowerPoint são convertidos para PDF automaticamente (macros desativadas, cache local); PDF com senha abre com a senha do cliente; PDF falso (HTML) é bloqueado.
5. **Boleto automático opcional:** PDF de 1 página com código de barras imprime sozinho na HP (caixa aberto, chegou há menos de 30 min, nunca impresso).
6. Cartão de cobrança abre sozinho com páginas e tabela; confirmação lança no **cupom do Caixa e vendas** (Recebimento R$ 1,00 + páginas) e abre direto a tela **Finalizar venda**.
7. Proteções: sem reimpressão/cobrança dupla, valor sempre ajustável, "falta cobrar" visível na fila e no resumo do dia.

Detalhes técnicos, API e manual completo: **`docs/FLUXO-IMPRESSAO-2026-11-18.md`**.

### 4.5 Clientes

Cadastro com telefone/Login, **saldo de tempo**, recargas com histórico, fiado (dívidas com alerta de atraso > 30 dias), crédito devolvido ao encerrar.

### 4.6 Catálogo e estoque

Produtos/serviços por categoria (Gráfica Rápida, Serviços Públicos, Lan House & Digital etc.), tipo estoque ou serviço, custo e preço, estoque mínimo com alertas, entrada por **nota fiscal XML** (cadastra novos, atualiza estoque e custo), importação Excel/CSV/PDF, **normalização de duplicados** (fica o mais vendido, desfazível) e grupos de serviço (impressão P&B compartilha faixas; xerox e preço digitado ficam fora).

### 4.7 Financeiro

- Despesas por categoria; **conta paga fotografa e o OCR lê** categoria, valor e vencimento (energia, aluguel, internet reconhecidos pelo texto).
- Extratos: PDF bancário PJ e **CSV Nubank** (transferências para o CNPJ da loja ficam fora; Pix para o CPF do dono vira retirada).
- Fatura de cartão em lote; despesas fixas mensais; contas a vencer (alerta 3 dias antes) no estado do painel.
- Custo por página entra no CMV; comissão soma no resultado.

### 4.8 Relatórios e indicadores

Relatório diário (com arquivamento mensal transparente), receita realizada, contribuição por categoria sem repetir linha, DRE simplificado, atendimento por sessão, volume, sobra/recarga, metas da loja e **indicadores** que alimentam o plano de ação.

### 4.9 Consultas & CRLV

Integração com **APIBrasil** (saldo visível com faixas saudável/atenção/recarregar), histórico de consultas, cobrança como serviço do catálogo (ex.: carteira digital, consultas).

### 4.10 Speed Financeira (aba Financeira/Leads)

Funil de leads/promotoras, contratos fechados com **meta mensal própria** (separada da meta da loja), origens e campanhas, ações por lead.

### 4.11 Marketing (aba Speed Marketing, admin)

- **Sincronização** de dados de marketing a partir do Drive (copia, adapta e ignora o que não pertence ao painel).
- **Ficha de saúde do Google:** NAP, diff com a ficha atual, correções sugeridas.
- **Posts do Google:** fila com edições que prevalecem, publicados e erros.
- **Search Console:** autorização OAuth, agrupamento por página com posição média ponderada e buscas mais vistas.
- **GeoGrid:** ranking no mapa por grade de pontos, comparação por período/dia.
- **wa-cliques:** cliques no WhatsApp por cidade/página/origem; o contador do site lê com chave.
- **Plano de ação:** sugestões automáticas a partir das métricas (com templates e efeito estimado), acompanhamento com responsável e prazo.
- **Oportunidades:** serviço pela busca, feriados de Varginha, toques no WhatsApp sem contato registrado pedindo registro no funil.
- **Piloto automático:** persiste tarefas, preserva evidência na falha.

### 4.12 Cofre de logins (vault)

Senhas de bancos/sistemas **cifradas em arquivo** com senha mestre; bloqueio e tentativas limitadas; verificação de integridade.

### 4.13 Operadores e permissões

- **Admin:** tarifas, produtos, usuários, despesas, marketing, fechamento de caixa, vinculação de agentes.
- **Atendente:** máquinas, sessões, caixa (abrir/ajustar/receber), vendas, impressões.
- Senhas com `scrypt` + salt; cookie `HttpOnly`/`SameSite=Strict`; setup inicial só no próprio servidor; limite de tentativas de login; mutações exigem `Origin` conhecido.

---

## 5. Segurança e proteção de dados

| Camada | Mecanismo |
|---|---|
| Conta do cliente | Sem administrador; Gerenciador de Tarefas, CMD, Executar e PowerShell bloqueados no perfil; pasta do agente protegida e liberada no Defender |
| Banco local | Escrita em temporário + `fsync` + troca atômica; se o `db.json` ficar ilegível (queda de energia), o servidor **sobe com o backup válido mais recente** e guarda a cópia corrompida |
| Backups | 1) `db.json.YYYY-MM-DD.bak` diário, 7 dias, em `server/data`; 2) cópia offsite `C:\LanHouseManager-Backup\db-*.json`, 30 dias; 3) arquivamento mensal a partir de 45 dias |
| Rede | HTTP local sem criptografia: **nunca abrir a porta 4780 na internet** |
| Recebimento de arquivos | `.exe` nunca listado/aberto; PDF falso bloqueado; Office convertido com macros desativadas e somente leitura; PDFs com senha abertos com a senha do cliente (original intacto) |
| Estação sem contato com servidor | Bloqueia sozinha quando o tempo contratado acaba |

---

## 6. Infraestrutura e operação

- **Servidor:** tarefa agendada `LanHouseManager-Servidor` — roda como o **usuário logado (Desktop), interativa**, com gatilho de repetição a cada 1 min (`IgnoreNew`) e reinício em falha. *Alterado em 18/11/2026: antes rodava como SYSTEM e não enxergava o Drive (L:), o Office nem as caixas de diálogo — só o tempo de máquina/impressoras de rede funcionavam.*
- **Pasta de recebimento:** `L:\Meu Drive\Rotina Diaria\Recebimento de Arquivos` (Google Drive sincronizado; serve de histórico). Configurável em **Atendimento > Impressões** ou pela API.
- **Chrome do balcão:** perfil 21 (WhatsApp Business) com a extensão do Nexcafé instalada; baixar desce direto na pasta de recebimento.
- **Caches locais do fluxo de impressão** (`%LOCALAPPDATA%\Nexcafe\`): contagem de páginas por arquivo (leitura da pasta em ~2 s com 220 arquivos), PDFs convertidos de Office e PDFs consertados/desbloqueados.
- **Vigia antigo aposentado (18/11/2026):** o `Vigiar-Downloads.ps1` abria o Chrome e mandava Ctrl+P — caminho sem registro no caixa; foi substituído por um stub e seu atalho de inicialização removido. O `Abrir-Para-Imprimir.ps1` segue vivo apenas para o modo "Escolher".
- **Correção de HTML pré-existente:** o `monitorDialog` não fechava e engolia o diálogo "Lançar PDF" e os avisos (toast) — invisíveis até 18/11/2026, agora consertado.

---

## 7. Estado atual (18/11/2026)

### Entregue nesta data (fluxo de impressão do balcão)

1. Extensão com nome do cliente no arquivo.
2. Aviso sonoro de chegada + fila "Impressão" com páginas, tipos e situações.
3. Impressão em 1 clique (P&B/Cor/Especial/Escolher) com cópias e frente e verso opcionais.
4. Impressão em lote com um cartão e total único.
5. Conversão automática de Word/Excel/PowerPoint.
6. Abertura de PDFs protegidos por senha (faturas de operadora).
7. Boleto de 1 página automático (interruptor, desligado por padrão).
8. Cartão de cobrança → cupom do Caixa e vendas → tela Finalizar venda; recebimento de arquivo R$ 1,00 automático.
9. Resumo do dia com alerta de "sem cobrança".

Validação: 51 verificações do fluxo + 86 testes do sistema + duas impressões físicas reais confirmadas de ponta a ponta.

### Pendências de contabilidade

- O turno de 18/11 tem **R$ 6,00 de vendas de teste** (3 × R$ 2,00 às 22:53/22:53/22:55) — considerar na conferência do fechamento ou lançar ajuste.

---

## 8. Limitações conhecidas

| Limite | Detalhe |
|---|---|
| HTTP sem criptografia | Rede local isolada; não expor a 4780 |
| Bloqueio de tela | É janela do Windows, não congelamento de disco; depende de conta sem administrador |
| Restauração | Cobre pastas e caches configurados; não reverte instalações nem arquivos fora do perfil |
| Token do agente | Legível pelo processo do usuário local; não protege contra quem controla o Windows da estação |
| Modo "Escolher" da impressão | Abre a janela do Windows/Chrome e **não registra** no caixa (caminho B, uso eventual) |
| Boleto automático | Sempre 1 cópia; duplicata usa o campo de cópias |
| "Juntar na máquina" da impressão | Lógica testada automaticamente; falta uso real com cliente em sessão |
| Banco JSON | Adequado a uma loja; sem sincronização multi-servidor |
| Faturas de operadora com senha | Precisam da senha do cliente (geralmente CPF/telefone) — não há como abrir sem |

---

## 9. Backlog priorizado

1. **Arquivamento automático da pasta de recebimento:** impresso + cobrado → `impressos/mês` (hoje 223 arquivos acumulam no Drive).
2. **Dedupe por conteúdo:** arquivo idêntico baixado várias vezes (caso AT01445299 recebido 6×) marcado como "idêntico ao já impresso".
3. **Histórico do dia por tipo de papel** na aba Impressão.
4. Backup diário do WhatsApp (111 MB) que cai na pasta de recebimento: redirecionar para subpasta.

---

## 10. Mapa de arquivos e documentação

### Código

| Caminho | Papel |
|---|---|
| `server/server.js` → `server/app.js` | Servidor HTTP e toda a lógica de negócio |
| `server/public/` | Painel (index.html, app.js, styles.css) |
| `client-agent/LanHouseAgent.ps1` | Agente das estações |
| `server/print-pdf.ps1`, `server/pdf-tools.py` | Motor de impressão e ferramentas de PDF |
| `extensoes/whatsapp-pdf/` | Extensão Chrome de recebimento |
| `installer-package.js` | ZIP de instalação das estações |
| `server/data/db.json` | Banco (não editar com o servidor rodando) |

### Documentação (pasta `docs/`)

| Documento | Conteúdo |
|---|---|
| `FLUXO-IMPRESSAO-2026-11-18.md` | Detalhe técnico e manual do fluxo de impressão do balcão |
| `ARQUITETURA.md` | Componentes, acesso, dados e cobrança (núcleo lan house) |
| `INSTALACAO-ESTACOES.md` | Instalação, verificação e diagnóstico das estações |
| `TESTE-RAPIDO.md` | Roteiro seguro com uma estação |
| `REFERENCIA-TELAS-NEXCAFE.md` | Referência funcional das telas |
| `ANALISE-NEXCAFE.md`, `ANALISE-BACKUP-20260924.md` | Evidências da instalação antiga |
| `historico-nexcafe-2022-2026.md` | Histórico da loja e do sistema |
| `auditoria-*.md`, `PLANO-*.md`, `estudo-*.md` | Auditorias e planos de marketing |

---

## 11. Manutenção rápida

| Situação | Comando/ação |
|---|---|
| Reiniciar o servidor | `Stop-ScheduledTask LanHouseManager-Servidor; Start-ScheduledTask LanHouseManager-Servidor` (ou aguardar ≤1 min: a tarefa se recupera sozinha) |
| Painel estranho após atualização | F5 na aba do painel |
| Extensão do WhatsApp atualizada | `chrome://extensions` → recarregar → F5 na aba do WhatsApp Web |
| Fila de impressão lenta/errada | Apagar `%LOCALAPPDATA%\Nexcafe\print-inbox-cache.json` (reconta sozinho) |
| Impressora não responde | `Get-Printer` / `Get-PrintJob -PrinterName "HP Laser MFP 432 PCL6"`; conferir status e fila |
| Testar arquivo sem gastar papel | `powershell -File server\print-pdf.ps1 -Action Info -Path "<arquivo>"` |
| Rodar a bateria de testes | `npm test` (86 testes) · `npm run check` (sintaxe de tudo) |
| Backup manual do banco | Copiar `server\data` com o **servidor parado** |
| Instalar/reinstalar estação | Roteiro em `docs/INSTALACAO-ESTACOES.md` (pendrive + chave de instalação) |
| Regenerar chave de instalação | Atendimento > Impressões > Regenerar (invalida configurações já baixadas) |
