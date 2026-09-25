$ErrorActionPreference = "Stop"
$agentScript = Join-Path $PSScriptRoot "LanHouseAgent.ps1"
if (-not (Test-Path -LiteralPath $agentScript)) { throw "LanHouseAgent.ps1 nao encontrado no pacote." }
. (Join-Path $PSScriptRoot "Executar-Elevado.ps1")
exit (Invoke-AgentElevated -AgentScript $agentScript -AgentArguments "-Action Capture" -ErrorFile (Join-Path $PSScriptRoot "erro-captura.txt"))
