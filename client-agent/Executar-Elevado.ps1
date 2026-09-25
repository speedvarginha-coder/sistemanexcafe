# Roda o agente como administrador a partir do pendrive.
# Antes, libera no Windows Defender a pasta do pendrive e a do agente: a captura de tela do
# monitoramento faz o Defender bloquear o script quando ele roda de uma pasta nao liberada.
# Qualquer erro fica na tela ate apertar Enter e e salvo em $ErrorFile (no pendrive).
function Invoke-AgentElevated {
    param([string]$AgentScript, [string]$AgentArguments, [string]$ErrorFile)
    $quote = { param($value) "'" + ($value -replace "'", "''") + "'" }
    $folder = Split-Path -Parent $AgentScript
    if (Test-Path -LiteralPath $ErrorFile) { Remove-Item -LiteralPath $ErrorFile -Force -ErrorAction SilentlyContinue }
    $command = @"
`$ErrorActionPreference = 'Stop'
try {
    Add-MpPreference -ExclusionPath @($(& $quote $folder), 'C:\LanHouseManagerAgent') -ErrorAction Stop
    Start-Sleep -Seconds 2
} catch { Write-Host "Aviso: nao foi possivel liberar a pasta no Windows Defender: `$(`$_.Exception.Message)" -ForegroundColor Yellow }
try {
    & $(& $quote $AgentScript) $AgentArguments
    exit `$LASTEXITCODE
} catch {
    `$message = "ERRO: `$(`$_.Exception.Message)"
    Write-Host `$message -ForegroundColor Red
    try { Set-Content -LiteralPath $(& $quote $ErrorFile) -Value (`$message + [Environment]::NewLine + `$_.InvocationInfo.PositionMessage) -Encoding UTF8 } catch { }
    Read-Host "Pressione Enter para fechar"
    exit 1
}
"@
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    $process = Start-Process -FilePath "powershell.exe" -Verb RunAs -Wait -PassThru -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encoded)
    return $process.ExitCode
}
