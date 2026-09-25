$ErrorActionPreference = "Stop"
$root = "C:\LanHouseManagerAgent"
$configPath = Join-Path $root "agent-config.json"
if (-not (Test-Path -LiteralPath $configPath)) { throw "Agente nao instalado. Execute 1 - INSTALAR.bat." }
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath $configPath | ConvertFrom-Json
if (-not $config.LastCapture) {
    throw "Padrao ainda nao salvo. Entre na conta Tecnico e execute 1 - INSTALAR.bat novamente."
}
foreach ($user in @($config.ProtectedUsers)) {
    foreach ($folder in @($config.ProtectedFolders)) {
        $baseline = Join-Path $root "Baseline\$user\$folder"
        if (-not (Test-Path -LiteralPath $baseline -PathType Container)) {
            throw "Padrao incompleto: $baseline. Entre na conta Tecnico e reinstale."
        }
    }
}
Write-Host "Padrao salvo em $($config.LastCapture)." -ForegroundColor Green
Write-Host "Proximo passo: reinicie e entre no perfil do cliente."
