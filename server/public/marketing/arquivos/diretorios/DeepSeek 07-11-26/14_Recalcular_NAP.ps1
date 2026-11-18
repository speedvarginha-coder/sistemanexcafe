#Requires -Version 5.1
<#
.SYNOPSIS
  Recalcula os indicadores da auditoria de diretórios da Speed a partir do CSV.

.DESCRIPTION
  Lê dados\auditoria_2026-11-07.csv (delimitador ';') e recalcula:
    - fichas de terceiros auditáveis
    - NAP núcleo OK
    - fichas com telefone morto
    - duplicidades ativas
    - identidade completa
    - acessos confirmados
    - P0 e P1

  Uso:
    .\14_Recalcular_NAP.ps1
    .\14_Recalcular_NAP.ps1 -CaminhoCsv 'dados\auditoria_2026-11-07.csv'
    .\14_Recalcular_NAP.ps1 -GerarJson

  Nada aqui altera o CSV. O script só lê e, se pedido, grava um JSON de métricas.
#>
[CmdletBinding()]
param(
  [string]$CaminhoCsv,
  [switch]$GerarJson
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($CaminhoCsv)) {
  $pastaScript = $PSScriptRoot
  if ([string]::IsNullOrWhiteSpace($pastaScript)) {
    $pastaScript = Split-Path -Parent $MyInvocation.MyCommand.Path
  }
  if ([string]::IsNullOrWhiteSpace($pastaScript)) {
    $pastaScript = (Get-Location).Path
  }
  $CaminhoCsv = Join-Path $pastaScript 'dados\auditoria_2026-11-07.csv'
}
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

if (-not (Test-Path -LiteralPath $CaminhoCsv)) {
  throw "CSV não encontrado: $CaminhoCsv"
}

$linhas = @(Import-Csv -LiteralPath $CaminhoCsv -Delimiter ';' -Encoding UTF8)
if ($linhas.Count -eq 0) { throw 'O CSV está vazio.' }

function Pct {
  param([double]$Parte, [double]$Todo)
  if ($Todo -le 0) { return '—' }
  return ('{0:N1}%' -f (100 * $Parte / $Todo))
}

function Linha {
  param([string]$Rotulo, [string]$Valor)
  Write-Host ('  {0,-38} {1}' -f $Rotulo, $Valor)
}

# --- Recortes -------------------------------------------------------------

$naoAuditaveis = @('INEXISTENTE', 'NÃO VERIFICADA', 'FORA DO PERFIL')

$auditaveis = @($linhas | Where-Object {
  $_.Camada -eq 'Terceiro' -and $naoAuditaveis -notcontains $_.Situação
})

$napOk = @($auditaveis | Where-Object {
  $_.Situação -in @('OK', 'OK-RESSALVA')
})

$mortos = @($auditaveis | Where-Object {
  $_.'Campos com problema' -match '3113-0458|3067-4361|31130458|30674361|553531130458'
})

# Duplicidades: grupos com mais de uma ficha auditável no mesmo diretório.
# Ex.: Cylex (3 fichas) = 2 excedentes; Solutudo (2) = 1 excedente.
$grupos = $auditaveis | Group-Object {
  ($_.Diretório -replace '\(.*?\)', '').Trim()
}
$extras = 0
$gruposDuplicados = @()
foreach ($g in $grupos) {
  if ($g.Count -gt 1) {
    $extras += ($g.Count - 1)
    $gruposDuplicados += ('{0} ({1} fichas)' -f $g.Name, $g.Count)
  }
}

$marcadasDuplicadas = @($linhas | Where-Object {
  $_.Situação -eq 'DUPLICADA' -or $_.'Campos com problema' -match 'duplic'
})

$identidadeCompleta = @($auditaveis | Where-Object {
  $_.Situação -eq 'OK' -and [string]::IsNullOrWhiteSpace($_.'Campos com problema')
})

$p0 = @($linhas | Where-Object { $_.Severidade -eq 'P0' })
$p1 = @($linhas | Where-Object { $_.Severidade -eq 'P1' })
$comAcesso = @($linhas | Where-Object { $_.'Acesso confirmado' -eq 'Sim' })

# --- Saída ----------------------------------------------------------------

Write-Host ''
Write-Host '=============================================================='
Write-Host ' Recalculo NAP - Speed Financeira'
Write-Host '=============================================================='
Write-Host (' Arquivo : {0}' -f (Resolve-Path -LiteralPath $CaminhoCsv).Path)
Write-Host (' Linhas  : {0}' -f $linhas.Count)
Write-Host (' Data    : {0}' -f (Get-Date -Format 'dd/MM/yyyy HH:mm'))
Write-Host ''

Write-Host 'FICHAS DE TERCEIROS'
Linha 'Auditáveis (ficha existente)' ('{0}' -f $auditaveis.Count)
Linha 'NAP núcleo OK' ('{0}/{1} ({2})' -f $napOk.Count, $auditaveis.Count, (Pct $napOk.Count $auditaveis.Count))
Linha 'Telefone morto' ('{0}/{1} ({2})' -f $mortos.Count, $auditaveis.Count, (Pct $mortos.Count $auditaveis.Count))
Linha 'Identidade completa' ('{0}/{1} ({2})' -f $identidadeCompleta.Count, $auditaveis.Count, (Pct $identidadeCompleta.Count $auditaveis.Count))
Linha 'Duplicidades ativas (excedentes)' ('{0}' -f $extras)
Write-Host ''

Write-Host 'TODAS AS LINHAS'
Linha 'Severidade P0' ('{0}' -f $p0.Count)
Linha 'Severidade P1' ('{0}' -f $p1.Count)
Linha 'Acesso confirmado no CSV' ('{0}/{1}' -f $comAcesso.Count, $linhas.Count)
Write-Host ''

if ($mortos.Count -gt 0) {
  Write-Host 'FICHAS COM TELEFONE MORTO'
  foreach ($m in $mortos) {
    Write-Host ('  - {0} | {1} | {2}' -f $m.Diretório, $m.'Ficha / identificador', $m.'Campos com problema')
  }
  Write-Host ''
}

if ($extras -gt 0) {
  Write-Host 'DIRETÓRIOS COM DUPLICIDADE'
  foreach ($d in $gruposDuplicados) { Write-Host ('  - {0}' -f $d) }
  Write-Host ''
  Write-Host ('  Linhas marcadas como duplicadas no CSV: {0}' -f $marcadasDuplicadas.Count)
  Write-Host ''
}

Write-Host 'CONFERÊNCIA COM O BASELINE DE 07/11/2026'
$baselineNap = 10
$baselineMortos = 8
$baselineDup = 6

$ok = $true
if ($napOk.Count -ne $baselineNap) { $ok = $false; Write-Warning ('NAP OK calculado ({0}) difere do baseline ({1}).' -f $napOk.Count, $baselineNap) }
if ($mortos.Count -ne $baselineMortos) { $ok = $false; Write-Warning ('Telefone morto calculado ({0}) difere do baseline ({1}).' -f $mortos.Count, $baselineMortos) }
if ($extras -ne $baselineDup) { $ok = $false; Write-Warning ('Duplicidades calculadas ({0}) diferem do baseline ({1}).' -f $extras, $baselineDup) }
if ($ok) { Write-Host '  OK: os números batem com o baseline documentado.' }
Write-Host ''

Write-Host 'OBSERVAÇÕES'
Write-Host '  - "Acesso confirmado = Sim" no CSV significa login conhecido.'
Write-Host '    O controle DOCX registra 0 comprovantes de acesso testado em 07/11/2026.'
Write-Host '  - O baseline manual de duplicidades (6) inclui a terceira ficha Cylex.'
Write-Host '    O script chega ao mesmo número agrupando fichas do mesmo diretório.'
Write-Host ''

if ($GerarJson) {
  $destino = Join-Path (Split-Path -Parent (Resolve-Path -LiteralPath $CaminhoCsv).Path) 'metricas_calculadas.json'
  $saida = [ordered]@{
    gerado_em              = (Get-Date).ToString('s')
    arquivo                = (Resolve-Path -LiteralPath $CaminhoCsv).Path
    total_linhas           = $linhas.Count
    terceiros_auditaveis   = $auditaveis.Count
    nap_nucleo_ok          = $napOk.Count
    nap_nucleo_pct         = [math]::Round(100 * $napOk.Count / [math]::Max(1, $auditaveis.Count), 1)
    telefone_morto         = $mortos.Count
    telefone_morto_pct     = [math]::Round(100 * $mortos.Count / [math]::Max(1, $auditaveis.Count), 1)
    identidade_completa    = $identidadeCompleta.Count
    duplicidades_ativas    = $extras
    p0                     = $p0.Count
    p1                     = $p1.Count
    acesso_sim_csv         = $comAcesso.Count
    fichas_telefone_morto  = @($mortos | ForEach-Object { $_.Diretório })
    diretorios_duplicados  = $gruposDuplicados
  }
  $saida | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $destino -Encoding UTF8
  Write-Host ('JSON gravado em: {0}' -f $destino)
}
