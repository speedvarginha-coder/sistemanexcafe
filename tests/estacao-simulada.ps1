# Simula a instalacao completa numa estacao (perfil "Usuário" com acento, cliente administrador,
# reinstalacao com permissoes quebradas) usando o LanHouseAgent.ps1 real.
# So os comandos que alteram o Windows (contas, registro, Defender, impressoras, tarefa) sao
# substituidos por versoes que registram as chamadas. Permissoes (icacls) rodam de verdade numa
# pasta temporaria. Uso: chamado por tests/estacao-simulada.test.js.
param([string]$Work, [string]$AgentSource)
$ErrorActionPreference = "Stop"
$pendrive = Join-Path $Work "pendrive"
$agentCopy = Join-Path $pendrive "LanHouseAgent.ps1"

# Copia do agente sem o "switch" final (so carrega as funcoes) e sem a captura de tela
# (o Defender deste computador bloqueia esse trecho fora da pasta liberada).
$text = [IO.File]::ReadAllText($AgentSource)
$text = $text.Substring(0, $text.IndexOf("switch (`$Action) {"))
$start = $text.IndexOf("function Get-ScreenJpeg {")
$end = $text.IndexOf("function Invoke-Monitor {")
$text = $text.Substring(0, $start) + "function Get-ScreenJpeg { throw 'captura desativada no teste' }`n`n" + $text.Substring($end)
[IO.File]::WriteAllText($agentCopy, $text, (New-Object Text.UTF8Encoding($true)))
. $agentCopy

$InstallRoot = Join-Path $Work "LanHouseManagerAgent"
$ConfigPath = Join-Path $InstallRoot "agent-config.json"
$BaselineRoot = Join-Path $InstallRoot "Baseline"
$UserDataRoot = Join-Path $Work "userdata"
$StatePath = Join-Path $UserDataRoot "agent-state.json"
$LogRoot = Join-Path $UserDataRoot "Logs"
$StartupFolder = Join-Path $Work "startup"
$StartupBat = Join-Path $StartupFolder "LanHouseManager-Agent.bat"
$MachineId = "tempname"
$MachineName = "M$([char]0x00E1)quina 11"
$clientName = "Usu$([char]0x00E1)rio"
$clientSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value  # HKU carregado, como o cliente logado
$calls = New-Object System.Collections.ArrayList
function Log-Call { param($Text) [void]$calls.Add([string]$Text) }

# --- Windows simulado ---
function Require-Admin { }
function Add-MpPreference { param($ExclusionPath, $ErrorAction) Log-Call "Defender exclusao: $($ExclusionPath -join ',')" }
function wevtutil { }
function Install-VirtualPrintQueue { Log-Call "Impressora virtual" }
function Remove-DirectPrinters { Log-Call "Remove impressoras diretas" }
function Register-AgentUpdater { Log-Call "Tarefa atualizador" }
function Get-ExistingLocalUsers { return @($clientName) }
# Como na estacao depois da 1a tentativa: o cliente ja tem DisableRegistryTools e reg.exe recusa gravar.
function reg.exe { Log-Call ("reg.exe BLOQUEADO: " + ($args -join " ")); Write-Output "ERRO: a edicao do Registro foi desabilitada pelo administrador."; $global:LASTEXITCODE = 1 }
# O sandbox nao permite gravar HKCU. Registra os valores pedidos sem tocar o registro real.
$script:registryValues = @{}
function Set-RegistryDword {
    param([string]$Key, [string]$Name, [int]$Value)
    if ($Key -notmatch '^HKU\\') { throw "Chave fora de HKU: $Key" }
    Log-Call "registro: $Key"
    $script:registryValues["$Key\$Name"] = $Value
}
function Set-RegistryString {
    param([string]$Key, [string]$Name, [string]$Value)
    if ($Key -notmatch '^HKU\\') { throw "Chave fora de HKU: $Key" }
    Log-Call "registro: $Key"
    $script:registryValues["$Key\$Name"] = $Value
}
function net.exe { Log-Call ("net " + ($args -join " ")); $global:LASTEXITCODE = 0 }
function Get-CimInstance {
    param([string]$ClassName, [string]$Filter, $ErrorAction)
    if ($ClassName -eq "Win32_UserProfile") { return [pscustomobject]@{ LocalPath = (Join-Path "C:\Users" $clientName); SID = $clientSid } }
    if ($ClassName -in @("Win32_Process", "Win32_Printer", "Win32_NetworkAdapterConfiguration")) { return @() }
    throw "Classe CIM nao simulada: $ClassName"
}
function Test-Path {
    param([string]$Path, [string]$LiteralPath, [string]$PathType, $ErrorAction)
    if ($Path -eq "Registry::HKEY_USERS\$clientSid") { return $true }
    Microsoft.PowerShell.Management\Test-Path @PSBoundParameters
}
$script:groups = @{ "S-1-5-32-544" = @("Administrador", $clientName); "S-1-5-32-545" = @($clientName) }
$script:groupNames = @{ "S-1-5-32-544" = "Administradores"; "S-1-5-32-545" = "Usuários" }
$script:localUsers = @{ $clientSid = $clientName }
function Get-LocalGroup { param([string]$SID) [pscustomobject]@{ Name = $script:groupNames[$SID]; SID = $SID } }
function Get-LocalGroupMemberNames { param([string]$Sid) return @($script:groups[$Sid]) }
function Get-LocalUser {
    param([string]$Name, [string]$SID, $ErrorAction)
    if ($SID) { if ($script:localUsers[$SID]) { return [pscustomobject]@{ Name = $script:localUsers[$SID] } }; return $null }
    if ($script:localUsers.Values -contains $Name) { return [pscustomobject]@{ Name = $Name } }
    return $null
}
function New-LocalUser { param($Name, $Password, $FullName, $Description, [switch]$PasswordNeverExpires, [switch]$AccountNeverExpires) $script:localUsers["S-1-5-21-TEC"] = $Name; Log-Call "Conta criada: $Name"; [pscustomobject]@{ Name = $Name } }
function Add-LocalGroupMember { param($Group, $Member, $ErrorAction) $sid = $Group.SID; if ($script:groups[$sid] -notcontains $Member) { $script:groups[$sid] += $Member }; Log-Call "Grupo $($Group.Name) + $Member" }
function Remove-LocalGroupMember { param($Group, $Member, $ErrorAction) $sid = $Group.SID; $script:groups[$sid] = @($script:groups[$sid] | Where-Object { $_ -ne $Member }); Log-Call "Grupo $($Group.Name) - $Member" }
function Read-Host { param($Prompt, [switch]$AsSecureString) if ($AsSecureString) { $secure = New-Object Security.SecureString; foreach ($letter in "senha-tecnico".ToCharArray()) { $secure.AppendChar($letter) }; return $secure }; if ("$Prompt" -match "Aplicar") { return "S" }; return "" }

# --- Estado da estacao antes da reinstalacao: vinculada e com as permissoes quebradas ---
New-Item -ItemType Directory -Path $InstallRoot, (Join-Path $BaselineRoot "$clientName\Desktop") -Force | Out-Null
Copy-Item (Join-Path $Work "config-anterior.json") $ConfigPath
Set-Content (Join-Path $InstallRoot "LanHouseAgent.ps1") "versao anterior"
& icacls.exe $InstallRoot /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-32-545:(OI)(CI)RX" /T /C /Q 2>&1 | Out-Null

$result = [ordered]@{}
try {
    Invoke-InstallAgent *>&1 | Out-Null
    $result.install = "ok"
} catch { $result.install = "ERRO: $($_.Exception.Message) @ $($_.InvocationInfo.PositionMessage)" }
try {
    $captured = Get-Content -Raw $ConfigPath | ConvertFrom-Json
    $result.capture = if ($captured.LastCapture) { "ok" } else { "ERRO: instalacao nao registrou a captura" }
} catch { $result.capture = "ERRO: $($_.Exception.Message)" }
# Agente iniciando depois da instalacao, como no login do cliente (3 voltas do loop).
function Remove-ClientPrinterConnections { Log-Call "Remove conexoes de impressora" }
function Set-VirtualPrinterDefault { return $true }
function Get-VirtualPrinterName { return $VirtualPrinterName }
function Start-LockScreenProcess { Log-Call "Tela de bloqueio aberta"; return [pscustomobject]@{ HasExited = $false } }
function Start-OverlayProcess { Log-Call "Contador aberto"; return [pscustomobject]@{ HasExited = $false } }
function Start-MonitorProcess { Log-Call "Monitor aberto"; return [pscustomobject]@{ HasExited = $false } }
function Update-AgentScriptIfNeeded { return $false }
function Stop-AgentUiProcesses { }
$script:loops = 0
function Start-Sleep { param($Seconds, $Milliseconds) if ($Seconds -ge 2) { $script:loops++; if ($script:loops -ge 3) { throw "fim do teste" } } }
$env:USERNAME = $clientName
try { Invoke-AgentRun *>&1 | Out-Null } catch { $result.run = if ($_.Exception.Message -eq "fim do teste") { "ok ($script:loops voltas)" } else { "ERRO: $($_.Exception.Message) @ $($_.InvocationInfo.PositionMessage)" } }

try { $config = Get-Content -Raw $ConfigPath | ConvertFrom-Json } catch {
    $result.config = "ERRO ao ler configuracao: $($_.Exception.Message)"; $result.calls = @($calls); $result.fileAcl = ((& icacls.exe $ConfigPath) -join " ")
    & icacls.exe $InstallRoot /grant "*$($clientSid):(OI)(CI)F" /T /C /Q 2>&1 | Out-Null
    $result | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $Work "resultado.json"); exit 0
}
$result.protectedUsers = @($config.ProtectedUsers)
$result.protectedFolders = @($config.ProtectedFolders)
$result.token = [string]$config.AgentToken
$result.lastCapture = [string]$config.LastCapture
$result.startupBat = Test-Path $StartupBat
$sha = [Security.Cryptography.SHA256]::Create()
try {
    $installedHash = [Convert]::ToBase64String($sha.ComputeHash([IO.File]::ReadAllBytes((Join-Path $InstallRoot "LanHouseAgent.ps1"))))
    $sourceHash = [Convert]::ToBase64String($sha.ComputeHash([IO.File]::ReadAllBytes($agentCopy)))
    $result.installedScriptMatches = ($installedHash -eq $sourceHash)
} finally { $sha.Dispose() }
$result.fileAcl = ((& icacls.exe $ConfigPath) -join " ")
$result.adminsAfter = @($script:groups["S-1-5-32-544"])
$policy = "HKU\$clientSid\Software\Microsoft\Windows\CurrentVersion\Policies"
$result.policies = [ordered]@{
    DisableTaskMgr = $script:registryValues["$policy\System\DisableTaskMgr"]
    DisableRegistryTools = $script:registryValues["$policy\System\DisableRegistryTools"]
    DisableCMD = $script:registryValues["HKU\$clientSid\Software\Policies\Microsoft\Windows\System\DisableCMD"]
    NoRun = $script:registryValues["$policy\Explorer\NoRun"]
    DisallowRun1 = $script:registryValues["$policy\Explorer\DisallowRun\1"]
}
$result.calls = @($calls)
& icacls.exe $InstallRoot /grant "*$($clientSid):(OI)(CI)F" /T /C /Q 2>&1 | Out-Null
$result | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $Work "resultado.json")
