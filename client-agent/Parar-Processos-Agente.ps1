$ErrorActionPreference = "Stop"
$agentPath = 'C:\LanHouseManagerAgent\LanHouseAgent.ps1'
$escaped = [regex]::Escape($agentPath)
$pattern = '(?i)-File\s+"?' + $escaped + '"?\s+-Action\s+"?(Run|LockScreen|Overlay|Monitor|PrintReview|Update)"?(?:\s|$)'
$processes = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" |
    Where-Object { $_.CommandLine -match $pattern }
foreach ($process in $processes) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
Write-Host "Processos do agente encerrados: $(@($processes).Count)"
