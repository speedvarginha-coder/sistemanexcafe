$ErrorActionPreference = "Stop"
$agentScript = Join-Path $PSScriptRoot "LanHouseAgent.ps1"
if (-not (Test-Path $agentScript)) { throw "LanHouseAgent.ps1 nao encontrado no pacote." }
$configPath = Join-Path $PSScriptRoot "install-config.json"
if (-not (Test-Path $configPath)) { throw "Configuracao do pendrive nao encontrada: install-config.json" }
$installConfig = Get-Content -Raw -Encoding UTF8 -LiteralPath $configPath | ConvertFrom-Json
$serverUrl = "$($installConfig.serverUrl)".TrimEnd("/")
if ($serverUrl -notmatch '^https?://[^/]+$') { throw "Endereco do servidor invalido no pendrive." }
try {
    $response = Invoke-RestMethod -Method Get -Uri "$serverUrl/api/bootstrap" -TimeoutSec 5
    if (-not $response.ok) { throw "Resposta inesperada do servidor." }
} catch {
    throw "Nao foi possivel conectar ao servidor $serverUrl. Verifique a rede e o firewall do servidor. Detalhe: $($_.Exception.Message)"
}
Write-Host "Servidor conectado: $serverUrl"
$number = (Read-Host "Numero da estacao (1 a 999; Enter usa o nome do computador)").Trim()
$machineArguments = ""
if ($number) {
    if ($number -notmatch '^[1-9][0-9]{0,2}$') { throw "Numero da estacao invalido. Use apenas digitos de 1 a 999, sem zero inicial." }
    $machineName = "M$([char]0x00E1)quina $number"
    $machineId = "maquina-$number"
    if ($installConfig.stationIds) {
        $existingId = $installConfig.stationIds.PSObject.Properties[$number]
        if ($existingId) { $machineId = "$($existingId.Value)" }
    }
    if ($machineId -notmatch '^[a-z0-9][a-z0-9_-]{1,31}$') { throw "ID da estacao invalido na configuracao do pendrive." }
    Write-Host "Estacao $number vinculada ao cadastro $machineId"
    $machineArguments = "-MachineId '$machineId' -MachineName '$machineName'"
}
. (Join-Path $PSScriptRoot "Executar-Elevado.ps1")
exit (Invoke-AgentElevated -AgentScript $agentScript -AgentArguments "-Action Install $machineArguments" -ErrorFile (Join-Path $PSScriptRoot "erro-instalacao.txt"))
