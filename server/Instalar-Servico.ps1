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

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$trigger = New-ScheduledTaskTrigger -AtStartup

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

Start-ScheduledTask -TaskName "LanHouseManager-Servidor"
Start-Sleep -Seconds 3
Write-Host ""
Write-Host "Pronto. O servidor agora inicia junto com o Windows."
Write-Host "Teste abrindo http://localhost:4780"
