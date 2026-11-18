#requires -Version 5.1
<#
  cobrar_protocolos.ps1
  Le 13_Protocolos.csv, calcula prazo e atraso, e gera:
    - 26_Cobranca_Protocolos.md   (pauta de cobranca e modelos)
    - dados/protocolos_status.csv (situacao calculada)

  Nao altera 13_Protocolos.csv. Nao envia e-mail. Nao fala com suporte.
  Uso: powershell -ExecutionPolicy Bypass -File ferramentas\cobrar_protocolos.ps1
#>

$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$csvEntrada = Join-Path $raiz '13_Protocolos.csv'
$mdSaida = Join-Path $raiz '26_Cobranca_Protocolos.md'
$csvSaida = Join-Path $raiz 'dados\protocolos_status.csv'

if (-not (Test-Path -LiteralPath $csvEntrada)) {
  throw "Arquivo nao encontrado: $csvEntrada"
}

function Gravar-Utf8Bom {
  param([string]$Caminho, [string]$Conteudo)
  $utf8 = New-Object System.Text.UTF8Encoding($true)
  [System.IO.File]::WriteAllText($Caminho, $Conteudo, $utf8)
}

function Esc-Csv {
  param([string]$Valor)
  if ($null -eq $Valor) { $Valor = '' }
  return '"' + $Valor.Replace('"', '""') + '"'
}

$linhas = Import-Csv -LiteralPath $csvEntrada -Delimiter ';' -Encoding UTF8
$hoje = Get-Date

$processados = New-Object System.Collections.Generic.List[object]

foreach ($item in $linhas) {
  $dataTexto = [string]$item.'Data_solicitação'
  $prazoTexto = [string]$item.Prazo_retorno
  $status = [string]$item.Status

  $prazoDias = 0
  $m = [regex]::Match($prazoTexto, '(\d+)')
  if ($m.Success) { $prazoDias = [int]$m.Groups[1].Value }

  $data = $null
  if ($dataTexto -and $dataTexto.Trim() -ne '') {
    try {
      $data = [datetime]::ParseExact($dataTexto.Trim(), 'yyyy-MM-dd', [System.Globalization.CultureInfo]::InvariantCulture)
    } catch {
      try { $data = [datetime]::Parse($dataTexto) } catch { $data = $null }
    }
  }

  $vencimento = $null
  $diasDecorridos = $null
  $situacao = ''

  if ($status -match 'Conclu|Resolv|Feito') {
    $situacao = 'Concluido'
    if ($data) {
      $vencimento = $data.AddDays($prazoDias)
      $diasDecorridos = ($hoje - $data).Days
    }
  } elseif (-not $data) {
    $situacao = 'Sem data de solicitacao'
  } else {
    $vencimento = $data.AddDays($prazoDias)
    $diasDecorridos = ($hoje - $data).Days
    if ($hoje.Date -gt $vencimento.Date) {
      $atraso = ($hoje.Date - $vencimento.Date).Days
      $situacao = "Atrasado ($atraso dia(s))"
    } else {
      $faltam = ($vencimento.Date - $hoje.Date).Days
      $situacao = "No prazo (faltam $faltam dia(s))"
    }
  }

  $obj = [pscustomobject]@{
    ID = [string]$item.ID
    Prioridade = [string]$item.Prioridade
    Diretorio = [string]$item.'Diretório'
    Ficha = [string]$item.Ficha
    Problema = [string]$item.Problema
    Acao = [string]$item.Ação
    Canal = [string]$item.Canal
    Responsavel = [string]$item.Responsável
    Data_solicitacao = $dataTexto
    Prazo_dias = $prazoDias
    Vencimento = $(if ($vencimento) { $vencimento.ToString('yyyy-MM-dd') } else { '' })
    Dias_decorridos = $(if ($null -ne $diasDecorridos) { $diasDecorridos } else { '' })
    Situacao = $situacao
    Status_atual = $status
    Protocolo = [string]$item.Protocolo
    Observacao = [string]$item.Observações
  }
  $processados.Add($obj)
}

$ordenados = $processados | Sort-Object `
  @{ Expression = { if ($_.Prioridade -eq 'P0') { 0 } else { 1 } } }, `
  @{ Expression = { if ($_.Situacao -like 'Atrasado*') { 0 } elseif ($_.Situacao -like 'Sem data*') { 1 } elseif ($_.Situacao -like 'No prazo*') { 2 } else { 3 } } }, `
  @{ Expression = { $_.ID } }

$total = $processados.Count
$semData = ($processados | Where-Object { $_.Situacao -like 'Sem data*' }).Count
$atrasados = ($processados | Where-Object { $_.Situacao -like 'Atrasado*' }).Count
$noPrazo = ($processados | Where-Object { $_.Situacao -like 'No prazo*' }).Count
$concluidos = ($processados | Where-Object { $_.Situacao -eq 'Concluido' }).Count

$dataHoje = $hoje.ToString('dd/MM/yyyy')

# ---- CSV de status ----
$csvLinhas = New-Object System.Collections.Generic.List[string]
$csvLinhas.Add((@('ID', 'Prioridade', 'Diretorio', 'Ficha', 'Problema', 'Acao', 'Canal', 'Responsavel', 'Data_solicitacao', 'Prazo_dias', 'Vencimento', 'Dias_decorridos', 'Situacao', 'Status_atual', 'Protocolo', 'Observacao') | ForEach-Object { Esc-Csv $_ }) -join ';')
foreach ($p in $ordenados) {
  $csvLinhas.Add((@($p.ID, $p.Prioridade, $p.Diretorio, $p.Ficha, $p.Problema, $p.Acao, $p.Canal, $p.Responsavel, $p.Data_solicitacao, $p.Prazo_dias, $p.Vencimento, $p.Dias_decorridos, $p.Situacao, $p.Status_atual, $p.Protocolo, $p.Observacao) | ForEach-Object { Esc-Csv ([string]$_) }) -join ';')
}
Gravar-Utf8Bom -Caminho $csvSaida -Conteudo ($csvLinhas -join "`r`n")

# ---- Markdown ----
$md = New-Object System.Collections.Generic.List[string]
$md.Add('# Cobranca de protocolos — pauta de trabalho')
$md.Add('')
$md.Add("**Gerado em:** $dataHoje")
$md.Add('**Fonte:** `13_Protocolos.csv` (o CSV original nao foi alterado)')
$md.Add('**Regra:** uma cobranca por pedido por semana. Registrar cada contato em Observacoes.')
$md.Add('')
$md.Add('---')
$md.Add('')
$md.Add('## Situacao em uma linha')
$md.Add('')
$md.Add('| Total | Sem data | Atrasados | No prazo | Concluidos |')
$md.Add('|---|---|---|---|---|')
$md.Add("| $total | $semData | $atrasados | $noPrazo | $concluidos |")
$md.Add('')

if ($semData -gt 0) {
  $md.Add('> **Pare e preencha a data primeiro.** Pedido sem data de solicitacao nao tem prazo e nao pode ser cobrado com justica. Anote a data do envio original antes de mandar follow-up.')
  $md.Add('')
}

$md.Add('---')
$md.Add('')
$md.Add('## Fila de trabalho')
$md.Add('')
$md.Add('| ID | Prioridade | Diretorio | Problema | Situacao | Vencimento | Protocolo | Proxima acao |')
$md.Add('|---|---|---|---|---|---|---|---|')

foreach ($p in $ordenados) {
  $proxima = ''
  if ($p.Situacao -like 'Sem data*') {
    $proxima = 'Preencher data e cobrar em seguida'
  } elseif ($p.Situacao -like 'Atrasado*') {
    $proxima = 'Cobrar hoje pelo canal ' + $p.Canal
  } elseif ($p.Situacao -like 'No prazo*') {
    $proxima = 'Aguardar ate ' + $p.Vencimento
  } else {
    $proxima = 'Encerrado'
  }

  $problema = $p.Problema
  if ($problema.Length -gt 90) { $problema = $problema.Substring(0, 87) + '...' }
  $protocolo = if ($p.Protocolo) { $p.Protocolo } else { '—' }
  $venc = if ($p.Vencimento) { $p.Vencimento } else { '—' }

  $md.Add("| $($p.ID) | $($p.Prioridade) | $($p.Diretorio) | $problema | $($p.Situacao) | $venc | $protocolo | $proxima |")
}

$md.Add('')
$md.Add('---')
$md.Add('')
$md.Add('## Sem data de solicitacao')
$md.Add('')

$semDataItens = $ordenados | Where-Object { $_.Situacao -like 'Sem data*' }
if ($semDataItens.Count -eq 0) {
  $md.Add('Nenhum pedido sem data. Bom sinal.')
} else {
  $md.Add('Estes pedidos precisam da data real do primeiro contato antes de qualquer cobranca:')
  $md.Add('')
  foreach ($p in $semDataItens) {
    $md.Add("- **$($p.ID) — $($p.Diretorio)** · canal: $($p.Canal) · acao: $($p.Acao)")
  }
  $md.Add('')
  $md.Add('Se a data original se perdeu, use a data em que o pedido for reenviado e registre "reenvio" na observacao. Nao invente data retroativa.')
}

$md.Add('')
$md.Add('---')
$md.Add('')
$md.Add('## Modelo D+7 — primeira cobranca')
$md.Add('')
$md.Add('**Assunto:** Acompanhamento do protocolo [NUMERO] — Speed Financeira')
$md.Add('')
$md.Add('> Ola.')
$md.Add('>')
$md.Add('> Registrei a solicitacao [NUMERO], em [DATA], sobre [CORRECAO/MESCLAGEM] do cadastro da Speed Financeira e Lan House (CNPJ 29.497.887/0001-57).')
$md.Add('>')
$md.Add('> Passados sete dias, gostaria de saber se ha previsao de conclusao ou se falta algum documento. Segue o resumo do pedido: [RESUMO EM UMA LINHA].')
$md.Add('>')
$md.Add('> Obrigado.')
$md.Add('> [NOME] — (35) 3067-5017')
$md.Add('')
$md.Add('## Modelo D+14 — segunda e ultima cobranca')
$md.Add('')
$md.Add('**Assunto:** Segunda solicitacao sobre o protocolo [NUMERO] — Speed Financeira')
$md.Add('')
$md.Add('> Ola.')
$md.Add('>')
$md.Add('> Retomo o pedido [NUMERO], aberto em [DATA], sem retorno ate agora. A ficha ainda exibe [ERRO ATUAL].')
$md.Add('>')
$md.Add('> Podem confirmar o andamento ou informar o canal correto para escalar? Se o pedido tiver sido encerrado sem correcao, peco a reabertura com o protocolo original.')
$md.Add('>')
$md.Add('> Obrigado.')
$md.Add('> [NOME] — (35) 3067-5017')
$md.Add('')
$md.Add('---')
$md.Add('')
$md.Add('## Regras para nao perder o controle')
$md.Add('')
$md.Add('1. **Nunca cobrar duas vezes no mesmo dia.** Escolha um canal e espere 7 dias.')
$md.Add('2. **Sempre pedir numero de protocolo.** Sem protocolo, o pedido nao existe.')
$md.Add('3. **Salvar print antes e depois.** A evidencia vale mais que a conversa.')
$md.Add('4. **Nao apagar ficha duplicada.** Pedir mesclagem mantendo o historico e as avaliacoes.')
$md.Add('5. **Nao pagar destaque** antes de a ficha estar correta.')
$md.Add('6. **Registrar cada contato** em Observacoes, com data e canal.')
$md.Add('7. **Se o diretorio nao responder em 21 dias,** registrar "sem canal" e seguir. Nao insistir para sempre.')
$md.Add('')
$md.Add('---')
$md.Add('')
$md.Add('## O que este script nao faz')
$md.Add('')
$md.Add('- Nao envia e-mail, WhatsApp ou formulario.')
$md.Add('- Nao acessa painel de diretorio.')
$md.Add('- Nao altera `13_Protocolos.csv`.')
$md.Add('- Nao promete prazo de terceiro.')
$md.Add('')
$md.Add('Depois de cada contato, atualize a coluna Observacoes do CSV e rode este script de novo para ver a fila atualizada.')

Gravar-Utf8Bom -Caminho $mdSaida -Conteudo ($md -join "`r`n")

Write-Host ''
Write-Host '=== PROTOCOLOS ===' -ForegroundColor Green
Write-Host "Total: $total | Sem data: $semData | Atrasados: $atrasados | No prazo: $noPrazo | Concluidos: $concluidos"
Write-Host ''
Write-Host 'Arquivos gerados:'
Write-Host "  $mdSaida"
Write-Host "  $csvSaida"
Write-Host ''
if ($semData -gt 0) {
  Write-Host 'ATENCAO: ha pedidos sem data. Preencha a data antes de cobrar.' -ForegroundColor Yellow
}
Write-Host 'Nada foi enviado. Nada foi alterado no CSV original.'
