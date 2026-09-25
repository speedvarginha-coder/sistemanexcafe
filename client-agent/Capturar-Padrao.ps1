$ErrorActionPreference = "Stop"
$agentScript = Join-Path $PSScriptRoot "LanHouseAgent.ps1"
if (-not (Test-Path -LiteralPath $agentScript)) { throw "LanHouseAgent.ps1 nao encontrado no pacote." }
$arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$agentScript`"", "-Action", "Capture")
$process = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $arguments -Wait -PassThru
exit $process.ExitCode
