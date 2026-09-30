# Coleta o estado do agente nesta estacao e grava em diagnostico.txt (na pasta do pendrive).
# Nao altera nada na estacao. O token do agente nao e gravado.
$out = Join-Path $PSScriptRoot "diagnostico.txt"
$lines = New-Object System.Collections.ArrayList
function Add-Line { param($Text) [void]$lines.Add([string]$Text) }
function Add-Section { param($Title, [scriptblock]$Block)
    Add-Line ""; Add-Line "===== $Title"
    try { (& $Block 2>&1 | Out-String -Width 220).TrimEnd() -split "`r?`n" | ForEach-Object { Add-Line $_ } } catch { Add-Line "ERRO: $($_.Exception.Message)" }
}
$root = "C:\LanHouseManagerAgent"
$script = Join-Path $root "LanHouseAgent.ps1"
$startup = "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\LanHouseManager-Agent.bat"

Add-Line "Diagnostico LanHouseManager - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Add-Line "Computador: $env:COMPUTERNAME  Usuario: $env:USERNAME  PowerShell: $($PSVersionTable.PSVersion)"
Add-Section "Inicio automatico" { if (Test-Path -LiteralPath $startup) { Get-Content -LiteralPath $startup } else { "NAO EXISTE: $startup" } }
Add-Section "Arquivos do agente" { Get-ChildItem -LiteralPath $root -Force | Select-Object Name, Length, LastWriteTime }
Add-Section "Hash do script" { if (Test-Path $script) { (Get-FileHash $script -Algorithm SHA256).Hash } }
Add-Section "Permissoes da pasta" { & icacls.exe $root }
Add-Section "Configuracao (sem token)" { $c = Get-Content -Raw (Join-Path $root "agent-config.json") | ConvertFrom-Json; $c.PSObject.Properties.Remove("AgentToken"); $c | ConvertTo-Json -Depth 4 }
Add-Section "Usuario atual esta na lista protegida?" { $c = Get-Content -Raw (Join-Path $root "agent-config.json") | ConvertFrom-Json; "ProtectedUsers=[$($c.ProtectedUsers -join ', ')]  USERNAME=[$env:USERNAME]  contem=$($c.ProtectedUsers -contains $env:USERNAME)"; "codigos USERNAME: " + (($env:USERNAME.ToCharArray() | ForEach-Object { [int]$_ }) -join ' '); "codigos Protegido: " + ((([string]$c.ProtectedUsers[0]).ToCharArray() | ForEach-Object { [int]$_ }) -join ' ') }
Add-Section "Contas da maquina" { Get-LocalUser | Select-Object Name, FullName, Enabled, LastLogon, PrincipalSource | Format-Table -AutoSize }
Add-Section "Grupos de cada conta" {
    # Le cada grupo uma vez so (ler por conta ficava lento). Grupos principais: Administradores, Usuarios, Convidados.
    $map = @{}
    foreach ($sid in @("S-1-5-32-544", "S-1-5-32-545", "S-1-5-32-546")) {
        $n = (Get-LocalGroup -SID $sid -ErrorAction SilentlyContinue).Name; if (-not $n) { continue }
        foreach ($m in @(([ADSI]"WinNT://$env:COMPUTERNAME/$n,group").psbase.Invoke("Members") | ForEach-Object { $_.GetType().InvokeMember("Name", "GetProperty", $null, $_, $null) })) { $map[$m] = @($map[$m]) + $n }
    }
    foreach ($u in Get-LocalUser) { "$($u.Name): $(if ($map[$u.Name]) { ($map[$u.Name] | Where-Object { $_ }) -join ', ' } else { 'NENHUM GRUPO PRINCIPAL' })" }
}
Add-Section "Contas escondidas da tela de entrada" { $k = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\SpecialAccounts\UserList"; if (Test-Path $k) { Get-ItemProperty $k | Select-Object * -ExcludeProperty PS* } else { "nenhuma (chave nao existe)" }; $p = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" -ErrorAction SilentlyContinue; "dontdisplaylastusername=$($p.dontdisplaylastusername)  DontDisplayLockedUserId=$($p.DontDisplayLockedUserId)"; $w = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -ErrorAction SilentlyContinue; "AutoAdminLogon=$($w.AutoAdminLogon)  DefaultUserName=$($w.DefaultUserName)" }
Add-Section "Exclusoes do Defender" { try { (Get-MpPreference).ExclusionPath } catch { "sem acesso (precisa de administrador): $($_.Exception.Message)" } }
Add-Section "Tarefa de atualizacao" { Get-ScheduledTask -TaskName "LanHouseManager-Atualizador" -ErrorAction Stop | Select-Object TaskName, State; (Get-ScheduledTaskInfo -TaskName "LanHouseManager-Atualizador") | Select-Object LastRunTime, LastTaskResult, NextRunTime }
Add-Section "Processos do agente" { Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match 'LanHouseAgent' } | Select-Object ProcessId, CommandLine }
Add-Section "Log do agente (ultimas 80 linhas)" { Get-Content (Join-Path $env:LOCALAPPDATA "LanHouseManagerAgent\Logs\agent.log") -Tail 80 }
Add-Section "Servidor responde?" { $c = Get-Content -Raw (Join-Path $root "agent-config.json") | ConvertFrom-Json; Invoke-RestMethod -Uri "$($c.ServerUrl.TrimEnd('/'))/api/bootstrap" -TimeoutSec 5 | ConvertTo-Json -Compress }
Add-Section "Tentativa de iniciar o agente (25 s)" {
    $stdout = Join-Path $env:TEMP "lhm-diag-out.txt"; $stderr = Join-Path $env:TEMP "lhm-diag-err.txt"
    $p = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$script`"", "-Action", "Run") -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -WindowStyle Hidden
    if (-not $p.WaitForExit(25000)) { "agente continua rodando apos 25 s (bom sinal); encerrando o teste"; Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } else { "agente terminou sozinho com codigo $($p.ExitCode)" }
    "--- saida:"; Get-Content $stdout -ErrorAction SilentlyContinue
    "--- erros:"; Get-Content $stderr -ErrorAction SilentlyContinue
}
Set-Content -LiteralPath $out -Value $lines -Encoding UTF8
Write-Host "Diagnostico salvo em $out"
