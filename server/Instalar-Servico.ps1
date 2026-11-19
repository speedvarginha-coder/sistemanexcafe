param(
    [string]$ServerUrl = "http://127.0.0.1:4780"
)

$ErrorActionPreference = "Stop"
$serverDir = Split-Path $PSCommandPath -Parent
$projectRoot = Split-Path $serverDir -Parent
$node = (Get-Command node.exe -ErrorAction SilentlyContinue) | Select-Object -ExpandProperty Source
if (-not $node) { throw "node.exe nao encontrado no PATH. Instale o Node.js." }
$serverJs = Join-Path $serverDir "server.js"

Write-Host "Node: $node"
Write-Host "Projeto: $projectRoot"

# Prioridade 4 (normal). O padrao do Agendador (7) tambem baixa a prioridade de disco: com outro programa
# usando o D:, o servidor esperava minutos por cada leitura e o painel parava de responder (18/11/2026).
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -Priority 4
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
# AtStartup liga com o Windows; a repeticao a cada minuto religa o servidor se ele cair (IgnoreNew evita duas instancias).
$trigger = @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)))

$serverAction = New-ScheduledTaskAction -Execute $node -Argument "`"$serverJs`"" -WorkingDirectory $projectRoot
Register-ScheduledTask -TaskName "LanHouseManager-Servidor" -Action $serverAction -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Tarefa criada: LanHouseManager-Servidor"

$firewallRule = Get-NetFirewallRule -DisplayName "LanHouseManager - Servidor TCP 4780" -ErrorAction SilentlyContinue
if (-not $firewallRule) {
    New-NetFirewallRule -DisplayName "LanHouseManager - Servidor TCP 4780" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4780 -Program $node -RemoteAddress LocalSubnet -Profile Any | Out-Null
    Write-Host "Rede local liberada para o painel na porta 4780."
}

$legacyWatcher = Get-ScheduledTask -TaskName "LanHouseManager-Impressora" -ErrorAction SilentlyContinue
if ($legacyWatcher) {
    Disable-ScheduledTask -TaskName "LanHouseManager-Impressora" -ErrorAction Stop | Out-Null
    Stop-ScheduledTask -TaskName "LanHouseManager-Impressora" -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName "LanHouseManager-Impressora" -Confirm:$false -ErrorAction Stop
    Write-Host "Monitor antigo de impressao removido."
}

# Copia do backup para o Google Drive (L:), na conta de quem instalou (que enxerga o Drive): a cada hora e no login.
$backupBat = Join-Path $serverDir "backup-drive.bat"
if (Test-Path $backupBat) {
    $who = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $backupAction = New-ScheduledTaskAction -Execute $backupBat
    $backupTriggers = @((New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)), (New-ScheduledTaskTrigger -AtLogOn -User $who))
    $backupSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName "Nexcafe-Backup-GoogleDrive" -Action $backupAction -Trigger $backupTriggers -Settings $backupSettings -User $who -Force | Out-Null
    Write-Host "Backup para o Google Drive agendado (a cada hora)."
}

Start-ScheduledTask -TaskName "LanHouseManager-Servidor"
Start-Sleep -Seconds 3
Write-Host ""
Write-Host "Pronto. O servidor agora inicia junto com o Windows."
Write-Host "Teste abrindo http://localhost:4780"
