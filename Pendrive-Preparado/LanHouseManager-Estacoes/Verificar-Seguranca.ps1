param([string]$UserProfile)
# Limpeza de seguranca da estacao antes de instalar o agente (roda como administrador).
# Usa o antivirus do proprio Windows (Microsoft Defender). O resultado fica no pendrive.
$ErrorActionPreference = "Continue"
$log = Join-Path $PSScriptRoot "verificacao-seguranca.txt"
function Say([string]$text, [string]$color = "Gray") { Write-Host $text -ForegroundColor $color; Add-Content -LiteralPath $log -Value $text -Encoding UTF8 }
Set-Content -LiteralPath $log -Value "Verificacao de seguranca - $(Get-Date -Format 'dd/MM/yyyy HH:mm') - $env:COMPUTERNAME" -Encoding UTF8

Say "`n1/5 Removendo exclusoes suspeitas do antivirus..." Cyan
$pref = Get-MpPreference -ErrorAction SilentlyContinue
if (-not $pref) { Say "O antivirus do Windows nao respondeu. Ele pode estar desativado por outro programa." Red }
foreach ($path in @($pref.ExclusionPath)) {
    if (-not $path) { continue }
    # Mantem as exclusoes do Nexcafe. Remove as que apontam para pastas de usuario, temporarias ou arquivos soltos de programas.
    if ($path -match 'LanHouseManager') { Say "  mantida (Nexcafe): $path"; continue }
    if ($path -match '\\AppData\\|\\Temp\\|\\Users\\|\\ProgramData\\') {
        Remove-MpPreference -ExclusionPath $path -ErrorAction SilentlyContinue
        Say "  REMOVIDA: $path" Yellow
    } else { Say "  mantida: $path" }
}
foreach ($proc in @($pref.ExclusionProcess)) { if ($proc) { Remove-MpPreference -ExclusionProcess $proc -ErrorAction SilentlyContinue; Say "  REMOVIDA exclusao de programa: $proc" Yellow } }

Say "`n2/5 Ligando a protecao em tempo real..." Cyan
try { Set-MpPreference -DisableRealtimeMonitoring $false -ErrorAction Stop; Say "  protecao ligada." Green }
catch { Say "  Nao foi possivel ligar a protecao: $($_.Exception.Message)" Red }

Say "`n3/5 Atualizando o antivirus (precisa de internet)..." Cyan
try { Update-MpSignature -ErrorAction Stop; Say "  atualizado." Green } catch { Say "  Nao atualizou (sem internet?). A verificacao continua com a versao atual." Yellow }

Say "`n4/5 Esvaziando a pasta Downloads..." Cyan
$downloads = if ($UserProfile) { Join-Path $UserProfile "Downloads" } else { $null }
if ($downloads -and (Test-Path -LiteralPath $downloads)) {
    $items = @(Get-ChildItem -LiteralPath $downloads -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "desktop.ini" })
    foreach ($item in $items) { Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction SilentlyContinue }
    Say "  $($items.Count) item(ns) apagado(s) de $downloads" Green
} else { Say "  pasta Downloads nao encontrada." }

Say "`n5/5 Verificacao completa do computador. Pode demorar de 30 minutos a algumas horas." Cyan
Say "     Nao desligue a maquina. Esta janela avisa quando terminar." Cyan
$start = Get-Date
try { Start-MpScan -ScanType FullScan -ErrorAction Stop } catch { Say "  A verificacao nao rodou: $($_.Exception.Message)" Red }
$found = @(Get-MpThreatDetection -ErrorAction SilentlyContinue | Where-Object { $_.InitialDetectionTime -ge $start.AddMinutes(-5) })
if ($found.Count) {
    Say "`nAMEACAS ENCONTRADAS: $($found.Count)" Red
    foreach ($t in $found) { $name = (Get-MpThreat -ThreatID $t.ThreatID -ErrorAction SilentlyContinue).ThreatName; Say "  $name em $($t.Resources -join ', ')" Red }
    Remove-MpThreat -ErrorAction SilentlyContinue
    Say "As ameacas foram removidas ou colocadas em quarentena. Reinicie a maquina e rode esta verificacao de novo." Yellow
} else { Say "`nNenhuma ameaca encontrada. Pode rodar o INSTALAR." Green }
Say "Resultado salvo no pendrive: LanHouseManager-Estacoes\verificacao-seguranca.txt"
Read-Host "`nPressione Enter para fechar"
