$src = Get-Content -Raw "D:\Sistema Nexcafe\LanHouseManager\client-agent\Executar-Elevado.ps1"
# Sem UAC no teste: executa o comando gerado diretamente e responde o Read-Host automaticamente.
$src = $src.Replace("-Verb RunAs -Wait -PassThru", "-Wait -PassThru -WindowStyle Hidden")
$src = $src.Replace('Read-Host "Pressione Enter para fechar"', 'Write-Host "(Read-Host)"')
Invoke-Expression $src
$dir = Join-Path $env:TEMP "lhm pendrive teste"
New-Item -ItemType Directory -Path $dir -Force | Out-Null
Set-Content (Join-Path $dir "LanHouseAgent.ps1") -Encoding UTF8 -Value 'param([string]$Action,[string]$MachineId,[string]$MachineName) if ($Action -eq "Capture") { throw "falha simulada na captura" }; "Action=$Action Id=$MachineId Nome=$MachineName" | Set-Content -Encoding UTF8 (Join-Path $PSScriptRoot "saida.txt"); exit 0'
$name = "M$([char]0x00E1)quina 11"
$code1 = Invoke-AgentElevated -AgentScript (Join-Path $dir "LanHouseAgent.ps1") -AgentArguments "-Action Install -MachineId 'tempname' -MachineName '$name'" -ErrorFile (Join-Path $dir "erro-instalacao.txt")
"instalar: retorno=$code1 | " + (Get-Content -Encoding UTF8 (Join-Path $dir "saida.txt"))
"acento correto: " + ((Get-Content -Encoding UTF8 (Join-Path $dir "saida.txt")) -like "*Nome=$name")
$code2 = Invoke-AgentElevated -AgentScript (Join-Path $dir "LanHouseAgent.ps1") -AgentArguments "-Action Capture" -ErrorFile (Join-Path $dir "erro-captura.txt")
"capturar: retorno=$code2 | arquivo de erro: " + ((Get-Content -Encoding UTF8 (Join-Path $dir "erro-captura.txt")) -join " / ")
Remove-Item $dir -Recurse -Force
