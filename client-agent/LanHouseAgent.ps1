param(
    [ValidateSet("Install", "Run", "LockScreen", "Overlay", "Monitor", "PrintReview", "Update", "Capture", "Restore", "Status", "Uninstall")]
    [string]$Action = "Status",

    [string]$ServerUrl,
    [string]$MachineId,
    [string]$MachineName,
    [string]$PairingCode,
    [string[]]$Users,
    [switch]$IncludeDocuments,
    [string]$JobPath
)

$ErrorActionPreference = "Stop"
# Barra de progresso do Invoke-RestMethod deixa cada envio (tela do monitor, eventos) bem mais lento no PowerShell 5.1.
$ProgressPreference = "SilentlyContinue"
$AgentVersion = "0.3.2"
$InstallRoot = "C:\LanHouseManagerAgent"
$ConfigPath = Join-Path $InstallRoot "agent-config.json"
$UserDataRoot = Join-Path $env:LOCALAPPDATA "LanHouseManagerAgent"
$StatePath = Join-Path $UserDataRoot "agent-state.json"
$BaselineRoot = Join-Path $InstallRoot "Baseline"
$LogRoot = Join-Path $UserDataRoot "Logs"
$StartupFolder = "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp"
$StartupBat = Join-Path $StartupFolder "LanHouseManager-Agent.bat"
$TechnicianUser = "Tecnico"

function Write-AgentLog {
    param([string]$Message)

    if (-not (Test-Path $LogRoot)) {
        New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null
    }
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -Path (Join-Path $LogRoot "agent.log") -Value $line
    Write-Host $line
}

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Require-Admin {
    if (-not (Test-IsAdmin)) {
        throw "Execute como Administrador."
    }
}

function Ensure-AgentRoot {
    if (-not (Test-Path $InstallRoot)) { New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null }
    if (-not (Test-Path $BaselineRoot)) { New-Item -ItemType Directory -Path $BaselineRoot -Force | Out-Null }
    if (-not (Test-Path $LogRoot)) { New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null }
}

function Load-Config {
    if (-not (Test-Path $ConfigPath)) {
        throw "Agente nao configurado. Rode: .\LanHouseAgent.ps1 -Action Install"
    }
    return Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
}

function Save-Config {
    param([object]$Config)
    Ensure-AgentRoot
    $Config | ConvertTo-Json -Depth 8 | Set-Content -Path $ConfigPath -Encoding UTF8
}

function Load-State {
    if (-not (Test-Path $StatePath)) {
        return [pscustomobject]@{
            LastRestoreSeq = 0
            LastRestartSeq = 0
            LastShutdownSeq = 0
            LastPrintRecordId = 0
        }
    }
    $state = Get-Content -Raw -Path $StatePath | ConvertFrom-Json
    if (-not ($state.PSObject.Properties.Name -contains "LastPrintRecordId")) {
        Add-OrUpdateProperty -Object $state -Name "LastPrintRecordId" -Value 0
    }
    if (-not ($state.PSObject.Properties.Name -contains "LastShutdownSeq")) {
        Add-OrUpdateProperty -Object $state -Name "LastShutdownSeq" -Value 0
    }
    return $state
}

function Save-State {
    param([object]$State)
    New-Item -ItemType Directory -Path $UserDataRoot -Force | Out-Null
    $State | ConvertTo-Json -Depth 8 | Set-Content -Path $StatePath -Encoding UTF8
}

function Add-OrUpdateProperty {
    param([object]$Object, [string]$Name, [object]$Value)
    if ($Object.PSObject.Properties.Name -contains $Name) {
        $Object.$Name = $Value
    } else {
        $Object | Add-Member -MemberType NoteProperty -Name $Name -Value $Value
    }
}

function Get-FullPath {
    param([string]$Path)
    return [System.IO.Path]::GetFullPath($Path)
}

function Assert-PathUnderRoot {
    param([string]$Path, [string]$Root, [string]$Purpose)
    $fullPath = Get-FullPath $Path
    $fullRoot = (Get-FullPath $Root).TrimEnd("\") + "\"
    if (-not $fullPath.StartsWith($fullRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Seguranca: caminho fora da area permitida para ${Purpose}: $fullPath"
    }
}

function Get-ExistingLocalUsers {
    return @(Get-ChildItem "C:\Users" -Directory -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -notin @("Public", "Default", "Default User", "All Users", "Administrador", "Administrator", $TechnicianUser) -and
            -not $_.Name.StartsWith("TEMP", [StringComparison]::OrdinalIgnoreCase)
        } |
        Select-Object -ExpandProperty Name)
}

function Remove-Diacritics {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return $Text }
    $normalized = $Text.Normalize([System.Text.NormalizationForm]::FormD)
    $result = New-Object System.Text.StringBuilder
    foreach ($ch in $normalized.ToCharArray()) {
        if ([System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$result.Append($ch)
        }
    }
    return $result.ToString()
}

function Resolve-UserList {
    param([string[]]$InputUsers)

    $existing = Get-ExistingLocalUsers

    if ($InputUsers -and $InputUsers.Count -gt 0) {
        $raw = $InputUsers
    } else {
        Write-Host ""
        Write-Host "Usuarios encontrados em C:\Users:"
        $existing | ForEach-Object { Write-Host " - $_" }
        Write-Host ""
        $answer = Read-Host "Digite o(s) usuario(s) cliente separados por virgula"
        $raw = $answer -split ","
    }

    $resolved = @()
    foreach ($user in $raw) {
        $name = "$user".Trim()
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        $match = $existing | Where-Object { (Remove-Diacritics "$_") -ieq (Remove-Diacritics $name) } | Select-Object -First 1
        if (-not $match) {
            throw "Usuario nao encontrado: $name"
        }
        $resolved += $match
    }

    if ($resolved.Count -eq 0) {
        throw "Nenhum usuario cliente informado."
    }
    $uniqueUsers = @($resolved | Select-Object -Unique)
    if ($uniqueUsers.Count -ne 1) {
        throw "Esta versao aceita um usuario cliente por estacao."
    }
    return $uniqueUsers
}

function Get-AgentMac {
    if ($null -ne $script:AgentMacCache) { return $script:AgentMacCache }
    $script:AgentMacCache = Find-AgentMac
    return $script:AgentMacCache
}

function Find-AgentMac {
    try {
        $adapter = Get-NetAdapter -Physical -ErrorAction Stop | Where-Object { $_.Status -eq "Up" } | Sort-Object ifIndex | Select-Object -First 1
        if ($adapter -and $adapter.MacAddress) { return ($adapter.MacAddress -replace "-", ":") }
    } catch { }
    try {
        $nic = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True" -ErrorAction Stop | Select-Object -First 1
        if ($nic -and $nic.MACAddress) { return $nic.MACAddress }
    } catch { }
    return ""
}

function Get-AgentCommand {
    param([object]$Config)

    $base = "$($Config.ServerUrl)".TrimEnd("/")
    $id = [Uri]::EscapeDataString($Config.MachineId)
    $name = [Uri]::EscapeDataString($Config.MachineName)
    $user = [Uri]::EscapeDataString($env:USERNAME)
    $version = [Uri]::EscapeDataString($AgentVersion)
    $mac = [Uri]::EscapeDataString((Get-AgentMac))
    $uri = "$base/api/client/$id/command?name=$name&user=$user&version=$version&mac=$mac"
    return Invoke-RestMethod -Method Get -Uri $uri -Headers @{ Authorization = "Bearer $($Config.AgentToken)" } -TimeoutSec 5
}

function Send-AgentEvent {
    param([object]$Config, [string]$Title, [string]$Detail, [int]$RestoreSeq = -1, [int]$RestartSeq = -1, [int]$ShutdownSeq = -1, [string]$OpenedSessionId = "")

    try {
        $base = "$($Config.ServerUrl)".TrimEnd("/")
        $id = [Uri]::EscapeDataString($Config.MachineId)
        $payload = @{ title = $Title; detail = $Detail }
        if ($RestoreSeq -ge 0) { $payload.restoreSeq = $RestoreSeq }
        if ($RestartSeq -ge 0) { $payload.restartSeq = $RestartSeq }
        if ($ShutdownSeq -ge 0) { $payload.shutdownSeq = $ShutdownSeq }
        if ($OpenedSessionId) { $payload.openedSessionId = $OpenedSessionId }
        # PowerShell 5.1 envia string como ISO-8859-1; bytes UTF-8 preservam acentos.
        $body = [System.Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Depth 4))
        Invoke-RestMethod -Method Post -Uri "$base/api/client/$id/event" -Headers @{ Authorization = "Bearer $($Config.AgentToken)" } -ContentType "application/json; charset=utf-8" -Body $body -TimeoutSec 5 | Out-Null
    } catch {
        Write-AgentLog "Falha ao enviar evento: $($_.Exception.Message)"
    }
}

function Get-ApiMessage {
    param([object]$ErrorRecord)

    try {
        if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
            $text = $ErrorRecord.ErrorDetails.Message
            try {
                $json = $text | ConvertFrom-Json
                if ($json.error) { return $json.error }
            } catch { }
            if ($text) { return $text }
        }
    } catch { }

    try {
        $response = $ErrorRecord.Exception.Response
        if ($response) {
            $stream = $response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $text = $reader.ReadToEnd()
            $reader.Close()
            try {
                $json = $text | ConvertFrom-Json
                if ($json.error) { return $json.error }
            } catch { }
            if ($text) { return $text }
        }
    } catch { }

    return $ErrorRecord.Exception.Message
}

function Invoke-ClientLogin {
    param([object]$Config, [string]$Login, [string]$Password)

    $base = "$($Config.ServerUrl)".TrimEnd("/")
    $id = [Uri]::EscapeDataString($Config.MachineId)
    $body = [System.Text.Encoding]::UTF8.GetBytes((@{ login = $Login; password = $Password } | ConvertTo-Json -Depth 3))
    return Invoke-RestMethod -Method Post -Uri "$base/api/client/$id/login" -Headers @{ Authorization = "Bearer $($Config.AgentToken)" } -ContentType "application/json; charset=utf-8" -Body $body -TimeoutSec 8
}

function Clear-FolderContent {
    param([string]$Path, [string]$AllowedRoot)

    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
        return
    }

    Assert-PathUnderRoot -Path $Path -Root $AllowedRoot -Purpose "limpeza"
    Get-ChildItem -LiteralPath $Path -Force -ErrorAction Stop | Where-Object { -not ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) } | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop
    }
}

function Copy-FolderContent {
    param([string]$Source, [string]$Destination)

    if (-not (Test-Path $Source)) {
        return
    }

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    Get-ChildItem -LiteralPath $Source -Force -ErrorAction Stop | Where-Object { -not ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force -ErrorAction Stop
    }
}

function Replace-FolderContent {
    param([string]$Source, [string]$Destination, [string]$AllowedRoot)

    Assert-PathUnderRoot -Path $Destination -Root $AllowedRoot -Purpose "restauracao"
    if (-not (Test-Path $Source)) {
        return
    }

    $parent = Split-Path -Path $Destination -Parent
    $leaf = Split-Path -Path $Destination -Leaf
    $staging = Join-Path $parent "$leaf.lhm-new"
    $backup = Join-Path $parent "$leaf.lhm-old"

    if (Test-Path $staging) { Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue }
    if (Test-Path $backup) { Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue }

    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    Copy-FolderContent -Source $Source -Destination $staging

    if (Test-Path $Destination) {
        try {
            Rename-Item -LiteralPath $Destination -NewName "$leaf.lhm-old" -ErrorAction Stop
        } catch {
            # Pasta com arquivo aberto: restaura item por item e mantem so o que estiver travado.
            Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
            Sync-FolderContent -Source $Source -Destination $Destination
            return
        }
    }
    try {
        Rename-Item -LiteralPath $staging -NewName $leaf
        if (Test-Path $backup) { Remove-Item -LiteralPath $backup -Recurse -Force -ErrorAction SilentlyContinue }
    } catch {
        if (Test-Path $Destination) { Remove-Item -LiteralPath $Destination -Recurse -Force -ErrorAction SilentlyContinue }
        if (Test-Path $backup) { Rename-Item -LiteralPath $backup -NewName $leaf }
        throw
    }
}

function Sync-FolderContent {
    param([string]$Source, [string]$Destination)
    $locked = @()
    foreach ($item in @(Get-ChildItem -LiteralPath $Destination -Force -ErrorAction SilentlyContinue | Where-Object { -not ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) })) {
        try { Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction Stop } catch { $locked += $item.Name }
    }
    foreach ($item in @(Get-ChildItem -LiteralPath $Source -Force -ErrorAction SilentlyContinue | Where-Object { -not ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) })) {
        try { Copy-Item -LiteralPath $item.FullName -Destination $Destination -Recurse -Force -ErrorAction Stop } catch { $locked += $item.Name }
    }
    if ($locked.Count -gt 0) { Write-AgentLog "Restaurado com itens em uso mantidos em $($Destination):$($locked -join ', ')" }
    # Sobrou arquivo do cliente anterior (nao existe no padrao): a limpeza NAO pode ser confirmada.
    $baselineNames = @(Get-ChildItem -LiteralPath $Source -Force -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
    $leftover = @(Get-ChildItem -LiteralPath $Destination -Force -ErrorAction SilentlyContinue | Where-Object { -not ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -and $baselineNames -notcontains $_.Name } | ForEach-Object { $_.Name })
    if ($leftover.Count -gt 0) { throw "Limpeza incompleta em $($Destination): arquivo(s) em uso $($leftover -join ', ')" }
}

function Get-ProtectedTarget {
    param([string]$User, [string]$Folder)
    return Join-Path (Join-Path "C:\Users" $User) $Folder
}

function Get-BaselineTarget {
    param([string]$User, [string]$Folder)
    return Join-Path (Join-Path $BaselineRoot $User) $Folder
}

# Garante Word, Excel e PowerPoint na area de trabalho do cliente antes de salvar o padrao
# (muitos clientes nao sabem achar os programas). Nao duplica se ja houver atalho.
function Add-OfficeShortcuts {
    param([string]$User)
    $desktop = Join-Path (Resolve-LocalAccount -User $User).ProfilePath "Desktop"
    if (-not (Test-Path -LiteralPath $desktop)) { return }
    $public = Join-Path $env:PUBLIC "Desktop"
    $apps = @(@{ Name = "Word"; Exe = "WINWORD.EXE" }, @{ Name = "Excel"; Exe = "EXCEL.EXE" }, @{ Name = "PowerPoint"; Exe = "POWERPNT.EXE" })
    $roots = @("$env:ProgramFiles\Microsoft Office", "${env:ProgramFiles(x86)}\Microsoft Office") | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
    $shell = New-Object -ComObject WScript.Shell
    foreach ($app in $apps) {
        $existing = @(Get-ChildItem -LiteralPath $desktop, $public -Filter "*.lnk" -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -match $app.Name })
        if ($existing.Count -gt 0) { continue }
        $exe = Get-ChildItem -LiteralPath $roots -Recurse -Depth 3 -Filter $app.Exe -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $exe) { Write-AgentLog "$($app.Name) nao encontrado; atalho nao criado."; continue }
        $link = $shell.CreateShortcut((Join-Path $desktop "$($app.Name).lnk"))
        $link.TargetPath = $exe.FullName
        $link.Save()
        Write-AgentLog "Atalho criado na area de trabalho: $($app.Name)"
    }
}

function Invoke-CaptureBaseline {
    Require-Admin
    Ensure-AgentRoot
    $config = Load-Config

    foreach ($user in $config.ProtectedUsers) {
        $profile = Join-Path "C:\Users" $user
        foreach ($folder in $config.ProtectedFolders) {
            $source = Get-ProtectedTarget -User $user -Folder $folder
            $destination = Get-BaselineTarget -User $user -Folder $folder
            Assert-PathUnderRoot -Path $source -Root $profile -Purpose "captura"
            Assert-PathUnderRoot -Path $destination -Root $BaselineRoot -Purpose "baseline"

            Write-AgentLog "Capturando padrao: $source"
            if (Test-Path $destination) {
                Clear-FolderContent -Path $destination -AllowedRoot $BaselineRoot
            } else {
                New-Item -ItemType Directory -Path $destination -Force | Out-Null
            }
            Copy-FolderContent -Source $source -Destination $destination
        }
    }
    # Area de trabalho e Downloads do padrao ficam so com atalhos (documento esquecido nao vira parte do padrao).
    Clear-BaselineDocuments -Config $config

    Add-OrUpdateProperty -Object $config -Name "LastCapture" -Value (Get-Date).ToString("s")
    Save-Config -Config $config
    Write-AgentLog "Captura concluida."
}

function Remove-PathSafe {
    param([string]$Path, [string]$AllowedRoot)

    if (-not (Test-Path -LiteralPath $Path)) { return }
    try {
        Assert-PathUnderRoot -Path $Path -Root $AllowedRoot -Purpose "limpeza"
    } catch {
        Write-AgentLog "Ignorado (fora da area permitida): $Path"
        return
    }
    try {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        Write-AgentLog "Removido: $Path"
    } catch {
        Write-AgentLog "Falha ao remover (arquivo em uso?): $Path : $($_.Exception.Message)"
    }
}

function Stop-ClientBrowsers {
    foreach ($name in @("chrome", "msedge", "MicrosoftEdge", "brave", "opera", "vivaldi", "firefox", "iexplore")) {
        try { Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue } catch { }
    }
    Start-Sleep -Milliseconds 800
}

function Clear-UserCaches {
    param([string]$User, [object]$Config)

    $profile = Join-Path "C:\Users" $User
    if (-not (Test-Path $profile)) { return }

    $cleanCookies = $true
    if ($Config.PSObject.Properties.Name -contains "CleanCookies") { $cleanCookies = [bool]$Config.CleanCookies }

    if ($cleanCookies) { Stop-ClientBrowsers }

    $cachePaths = @()

    if ($Config.CleanTemp) {
        $cachePaths += Join-Path $profile "AppData\Local\Temp"
    }

    $chromiumRoots = @(
        "AppData\Local\Google\Chrome\User Data",
        "AppData\Local\Microsoft\Edge\User Data",
        "AppData\Local\BraveSoftware\Brave-Browser\User Data",
        "AppData\Local\Vivaldi\User Data"
    )
    $firefoxRoots = @(
        "AppData\Roaming\Mozilla\Firefox\Profiles",
        "AppData\Local\Mozilla\Firefox\Profiles"
    )

    if ($Config.CleanBrowserCache -or $cleanCookies) {
        foreach ($root in $chromiumRoots) {
            $userData = Join-Path $profile $root
            if (-not (Test-Path $userData)) { continue }
            foreach ($prof in @(Get-ChildItem -LiteralPath $userData -Directory -ErrorAction SilentlyContinue)) {
                $cachePaths += Join-Path $prof.FullName "Cache"
                $cachePaths += Join-Path $prof.FullName "Code Cache"
                $cachePaths += Join-Path $prof.FullName "GPUCache"
            }
        }
    }

    foreach ($path in $cachePaths) { Remove-PathSafe -Path $path -AllowedRoot $profile }

    if (-not $cleanCookies) { return }

    # Navegadores voltam de fabrica: apagar arquivo por arquivo deixava perfis inteiros de clientes
    # (conta Google conectada, perfis extras como "Comarca de ..."). Com os navegadores fechados,
    # a pasta de dados inteira sai; o navegador cria outra limpa na proxima abertura.
    $wholeRoots = $chromiumRoots + @("AppData\Roaming\Opera Software\Opera Stable", "AppData\Roaming\Opera Software\Opera GX Stable", "AppData\Roaming\Mozilla\Firefox", "AppData\Local\Mozilla\Firefox")
    foreach ($root in $wholeRoots) {
        $dir = Join-Path $profile $root
        if (Test-Path -LiteralPath $dir) { Remove-PathSafe -Path $dir -AllowedRoot $profile }
        if (Test-Path -LiteralPath $dir) { Write-AgentLog "Navegador: dados ainda presentes em $dir (arquivo em uso); removendo o que for possivel." }
    }

    $chromiumFiles = @(
        "Cookies", "Cookies-journal", "Login Data", "Login Data-journal", "Web Data", "Web Data-journal",
        "History", "History-journal", "Current Session", "Current Tabs", "Last Session", "Last Tabs",
        "Visited Links", "Network\Cookies", "Network\Cookies-journal", "Network\Network Persistent State",
        "Network\Reporting and NEL", "Network\Trust Tokens"
    )
    $chromiumDirs = @("Sessions", "Session Storage", "Local Storage", "Service Worker", "IndexedDB")

    foreach ($root in $chromiumRoots) {
        $userData = Join-Path $profile $root
        if (-not (Test-Path $userData)) { continue }
        foreach ($prof in @(Get-ChildItem -LiteralPath $userData -Directory -ErrorAction SilentlyContinue)) {
            foreach ($file in $chromiumFiles) { Remove-PathSafe -Path (Join-Path $prof.FullName $file) -AllowedRoot $profile }
            foreach ($dir in $chromiumDirs) { Remove-PathSafe -Path (Join-Path $prof.FullName $dir) -AllowedRoot $profile }
        }
    }

    $opera = Join-Path $profile "AppData\Roaming\Opera Software\Opera Stable"
    if (Test-Path $opera) {
        foreach ($file in $chromiumFiles) { Remove-PathSafe -Path (Join-Path $opera $file) -AllowedRoot $profile }
        foreach ($dir in @("Cache", "Code Cache", "GPUCache") + $chromiumDirs) { Remove-PathSafe -Path (Join-Path $opera $dir) -AllowedRoot $profile }
    }

    $firefoxFiles = @(
        "cookies.sqlite", "cookies.sqlite-wal", "cookies.sqlite-shm", "logins.json", "logins-backup.json",
        "key4.db", "key3.db", "places.sqlite", "places.sqlite-wal", "formhistory.sqlite",
        "webappsstore.sqlite", "sessionstore.jsonlz4"
    )
    foreach ($root in $firefoxRoots) {
        $profilesDir = Join-Path $profile $root
        if (-not (Test-Path $profilesDir)) { continue }
        foreach ($prof in @(Get-ChildItem -LiteralPath $profilesDir -Directory -ErrorAction SilentlyContinue)) {
            foreach ($file in $firefoxFiles) { Remove-PathSafe -Path (Join-Path $prof.FullName $file) -AllowedRoot $profile }
            foreach ($dir in @("storage", "sessionstore-backups", "cache2", "startupCache")) { Remove-PathSafe -Path (Join-Path $prof.FullName $dir) -AllowedRoot $profile }
        }
    }
}

function Invoke-AgentRestore {
    Ensure-AgentRoot
    $config = Load-Config
    if ($config.ProtectedUsers -contains $env:USERNAME) { Close-ClientApps }

    foreach ($user in $config.ProtectedUsers) {
        $profile = Join-Path "C:\Users" $user
        if (-not (Test-Path $profile)) {
            Write-AgentLog "Perfil nao encontrado: $user"
            continue
        }

        foreach ($folder in $config.ProtectedFolders) {
            $target = Get-ProtectedTarget -User $user -Folder $folder
            $baseline = Get-BaselineTarget -User $user -Folder $folder
            if (-not (Test-Path $baseline)) {
                Write-AgentLog "Baseline ausente, pasta ignorada: $baseline"
                continue
            }

            Write-AgentLog "Restaurando: $target"
            Replace-FolderContent -Source $baseline -Destination $target -AllowedRoot $profile
            # Pasta redirecionada (OneDrive ou outro local): limpa tambem o caminho real que o Windows usa.
            if ($user -eq $env:USERNAME) {
                $real = Get-RealUserFolder -Folder $folder
                if ($real -and (Test-Path -LiteralPath $real) -and ($real.TrimEnd('\') -ne $target.TrimEnd('\')) -and $real.StartsWith($profile, [System.StringComparison]::OrdinalIgnoreCase)) {
                    Write-AgentLog "Restaurando pasta redirecionada: $real"
                    Replace-FolderContent -Source $baseline -Destination $real -AllowedRoot $profile
                }
            }
        }

        Clear-UserCaches -User $user -Config $config
        if ($user -eq $env:USERNAME) { Clear-ClientTraces -User $user }
    }

    Write-AgentLog "Restauracao concluida."
    # A limpeza troca as pastas inteiras; o Explorer continuava mostrando os icones antigos (arquivo apagado
    # aparecendo, atalho restaurado sumido). Reinicia o Explorer da sessao para a area de trabalho refletir o real.
    if ($config.ProtectedUsers -contains $env:USERNAME) { Restart-SessionExplorer }
    # Relatorio para o painel: o que ficou na area de trabalho e o que o padrao contem (so nomes).
    try {
        if ($config.ProtectedUsers -contains $env:USERNAME) {
            $desktop = Get-RealUserFolder -Folder "Desktop"
            if (-not $desktop) { $desktop = Get-ProtectedTarget -User $env:USERNAME -Folder "Desktop" }
            $left = @(Get-ChildItem -LiteralPath $desktop -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "desktop.ini" -and $_.Extension -ne ".lnk" } | ForEach-Object { $_.Name })
            $public = @(Get-ChildItem -LiteralPath "C:\Users\Public\Desktop" -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "desktop.ini" -and $_.Extension -ne ".lnk" } | ForEach-Object { $_.Name })
            $inBaseline = @(Get-ChildItem -LiteralPath (Get-BaselineTarget -User $env:USERNAME -Folder "Desktop") -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne "desktop.ini" -and $_.Extension -ne ".lnk" } | ForEach-Object { $_.Name })
            $detail = "Ficaram: $(if ($left.Count) { ($left | Select-Object -First 8) -join ', ' } else { 'nada' }) | Padrao: $(if ($inBaseline.Count) { ($inBaseline | Select-Object -First 8) -join ', ' } else { 'so atalhos' }) | Publica: $(if ($public.Count) { ($public | Select-Object -First 5) -join ', ' } else { 'vazia' }) | $desktop"
            Send-AgentEvent -Config $config -Title $(if ($left.Count -or $public.Count) { "Limpeza: arquivos na area de trabalho" } else { "Limpeza: area de trabalho limpa" }) -Detail $detail
        }
    } catch { Write-AgentLog "Relatorio da area de trabalho: $($_.Exception.Message)" }
}

function Restart-SessionExplorer {
    try {
        $session = (Get-Process -Id $PID).SessionId
        $explorers = @(Get-Process -Name explorer -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $session })
        foreach ($process in $explorers) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
        # O Windows reabre o shell sozinho; se nao reabrir em 4 s, abre manualmente.
        for ($i = 0; $i -lt 8; $i++) {
            Start-Sleep -Milliseconds 500
            if (@(Get-Process -Name explorer -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $session }).Count) { return }
        }
        Start-Process -FilePath "$env:WINDIR\explorer.exe"
    } catch { Write-AgentLog "Nao foi possivel reiniciar o Explorer: $($_.Exception.Message)" }
}

# Caminho real de uma pasta do usuario (considera redirecionamento para OneDrive ou outra unidade).
function Get-RealUserFolder {
    param([string]$Folder)
    try {
        switch ($Folder) {
            "Desktop" { return [Environment]::GetFolderPath("Desktop") }
            "Documents" { return [Environment]::GetFolderPath("MyDocuments") }
            "Pictures" { return [Environment]::GetFolderPath("MyPictures") }
            "Videos" { return [Environment]::GetFolderPath("MyVideos") }
            "Music" { return [Environment]::GetFolderPath("MyMusic") }
            "Downloads" {
                $value = (Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders" -Name "{374DE290-123F-4565-9164-39C4925E467B}" -ErrorAction Stop)."{374DE290-123F-4565-9164-39C4925E467B}"
                return [Environment]::ExpandEnvironmentVariables($value)
            }
        }
    } catch { }
    return $null
}

function ConvertTo-MachineId {
    param([string]$Value)
    $id = $Value.ToLowerInvariant() -replace '[^a-z0-9_-]', '-'
    $id = $id -replace '^-+', '' -replace '-+$', ''
    if ($id.Length -gt 32) { $id = $id.Substring(0, 32) }
    return $id.TrimEnd('-')
}

function Test-VirtualOnlyPrinter {
    param([object]$Printer)
    # Filas sem papel (PDF, XPS, OneNote, fax) e a propria Impressao Nexcafe ficam.
    return ($Printer.PortName -eq $VirtualPrinterPort -or $Printer.PortName -in @("PORTPROMPT:", "nul:", "SHRFAX:", "XPSPort:") -or $Printer.Name -like "OneNote*")
}

# Executado na instalacao (administrador): a estacao deixa de enxergar impressoras fisicas.
function Remove-DirectPrinters {
    try {
        $autoSetup = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\NcdAutoSetup\Private"
        if (-not (Test-Path $autoSetup)) { New-Item -Path $autoSetup -Force | Out-Null }
        Set-ItemProperty -Path $autoSetup -Name "AutoSetup" -Value 0 -Type DWord
        Write-AgentLog "Instalacao automatica de impressoras da rede desativada."
    } catch { Write-AgentLog "Falha ao desativar impressoras automaticas: $($_.Exception.Message)" }

    # Desfaz o afrouxamento de seguranca feito por versoes antigas do instalador (PrintNightmare).
    try {
        $ppKey = "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Printers\PointAndPrint"
        if (Test-Path $ppKey) {
            Set-ItemProperty -Path $ppKey -Name "RestrictDriverInstallationToAdministrators" -Value 1 -Type DWord
            Remove-ItemProperty -Path $ppKey -Name "NoWarningNoElevationOnInstall" -ErrorAction SilentlyContinue
        }
        $wsParam = "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation\Parameters"
        if ((Get-ItemProperty -Path $wsParam -Name "AllowInsecureGuestAuth" -ErrorAction SilentlyContinue).AllowInsecureGuestAuth -eq 1) {
            Set-ItemProperty -Path $wsParam -Name "AllowInsecureGuestAuth" -Value 0 -Type DWord
        }
    } catch { Write-AgentLog "Falha ao restaurar seguranca de impressao: $($_.Exception.Message)" }

    foreach ($printer in @(Get-Printer -ErrorAction SilentlyContinue)) {
        if (Test-VirtualOnlyPrinter -Printer $printer) { continue }
        try {
            Remove-Printer -InputObject $printer -ErrorAction Stop
            Write-AgentLog "Impressora removida da estacao: $($printer.Name)"
        } catch { Write-AgentLog "Falha ao remover impressora $($printer.Name): $($_.Exception.Message)" }
    }
}

# Executado pelo agente no usuario cliente: remove conexoes de impressora que ele mesmo adicionar.
function Remove-ClientPrinterConnections {
    foreach ($printer in @(Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.Type -eq "Connection" })) {
        try {
            Remove-Printer -InputObject $printer -ErrorAction Stop
            Write-AgentLog "Conexao de impressora removida: $($printer.Name)"
        } catch { }
    }
}

$VirtualPrinterName = "Impress$([char]0x00E3)o Nexcaf$([char]0x00E9)"
$VirtualPrinterPort = "NexcafePdfTcp"

# A fila virtual e identificada pela porta; versoes antigas criaram o nome com acento corrompido.
function Get-VirtualPrinterName {
    $printer = @(Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.PortName -eq $VirtualPrinterPort }) |
        Sort-Object @{ Expression = { $_.Name -ne $VirtualPrinterName } } | Select-Object -First 1
    if ($printer) { return [string]$printer.Name }
    return ""
}

function Set-VirtualPrinterDefault {
    $name = Get-VirtualPrinterName
    if (-not $name) { return $false }
    try {
        # Impede o Windows 10 de trocar a padrao para a ultima impressora usada.
        $key = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows"
        if ((Get-ItemProperty -Path $key -Name "LegacyDefaultPrinterMode" -ErrorAction SilentlyContinue).LegacyDefaultPrinterMode -ne 1) {
            Set-ItemProperty -Path $key -Name "LegacyDefaultPrinterMode" -Value 1 -Type DWord
        }
    } catch { }
    $current = Get-CimInstance -ClassName Win32_Printer -Filter "Default=True" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($current -and $current.Name -eq $name) { return $true }
    (New-Object -ComObject WScript.Network).SetDefaultPrinter($name)
    Write-AgentLog "Impressora padrao definida: $name"
    return $true
}

function Install-VirtualPrintQueue {
    $name = $VirtualPrinterName
    $portName = $VirtualPrinterPort
    if (-not (Get-PrinterDriver -Name "Microsoft Print To PDF" -ErrorAction SilentlyContinue)) {
        throw "O recurso Microsoft Print To PDF do Windows precisa estar instalado."
    }
    $port = Get-PrinterPort -Name $portName -ErrorAction SilentlyContinue
    if ($port -and ($port.PrinterHostAddress -ne "127.0.0.1" -or [int]$port.PortNumber -ne 18955)) {
        throw "A porta $portName ja existe com outro destino."
    }
    if (-not $port) { Add-PrinterPort -Name $portName -PrinterHostAddress "127.0.0.1" -PortNumber 18955 }
    $existing = Get-VirtualPrinterName
    if ($existing -and $existing -ne $name) {
        Rename-Printer -Name $existing -NewName $name
        Write-AgentLog "Impressora virtual renomeada: $existing -> $name"
    }
    $printer = Get-Printer -Name $name -ErrorAction SilentlyContinue
    if ($printer -and ($printer.DriverName -ne "Microsoft Print To PDF" -or $printer.PortName -ne $portName)) {
        throw "A impressora $name ja existe com outra configuracao."
    }
    if (-not $printer) { Add-Printer -Name $name -DriverName "Microsoft Print To PDF" -PortName $portName }
    Write-AgentLog "Impressora virtual $name pronta."
}

function Invoke-InstallAgent {
    Require-Admin
    # Para o agente em execucao: senao ele reinicia no meio da instalacao (token novo) e a tela de
    # bloqueio cobre a janela do instalador. Ele volta no proximo login/reinicio.
    Stop-AgentUiProcesses -Actions @("Run", "LockScreen", "Overlay", "Monitor", "PrintReview")
    Repair-AgentFolderAccess
    Ensure-AgentRoot

    # O agente captura a tela para o monitoramento remoto e o Defender pode bloquear o script;
    # libera somente a pasta do proprio agente.
    try {
        Add-MpPreference -ExclusionPath $InstallRoot -ErrorAction Stop
        Write-AgentLog "Pasta do agente liberada no Windows Defender: $InstallRoot"
    } catch { Write-AgentLog "Nao foi possivel liberar a pasta no Defender (outro antivirus?): $($_.Exception.Message)" }

    try { wevtutil sl "Microsoft-Windows-PrintService/Operational" /e:true | Out-Null } catch { }

    $installConfig = $null
    $configFilePath = $null
    if ($PSScriptRoot) {
        $configFilePath = Join-Path $PSScriptRoot "install-config.json"
        if (Test-Path $configFilePath) {
            try { $installConfig = Get-Content -Raw -Encoding UTF8 -Path $configFilePath | ConvertFrom-Json } catch { throw "install-config.json invalido: $($_.Exception.Message)" }
        }
    }

    $sharedPrinters = @()
    $colorPrinters = @("L375")
    $blackPrinter = ""
    $colorPrinter = ""
    if ($installConfig) {
        $ServerUrl = $installConfig.serverUrl
        $InstallKey = $installConfig.installKey
        if ($installConfig.printers) { $sharedPrinters = @($installConfig.printers) }
        if ($installConfig.users) { $Users = @($installConfig.users) }
        if ($installConfig.colorPrinters) { $colorPrinters = @($installConfig.colorPrinters) }
        if ($installConfig.printBlackPrinter) { $blackPrinter = [string]$installConfig.printBlackPrinter }
        if ($installConfig.printColorPrinter) { $colorPrinter = [string]$installConfig.printColorPrinter }
    }
    if (-not $blackPrinter -and $sharedPrinters.Count -gt 0) {
        $blackPrinter = ($sharedPrinters | Where-Object { $_ -match "HP|Laser|432" } | Select-Object -First 1)
        if (-not $blackPrinter) { $blackPrinter = $sharedPrinters[0] }
    }
    if (-not $colorPrinter -and $sharedPrinters.Count -gt 0) {
        $colorPrinter = ($sharedPrinters | Where-Object { $_ -match "L375|Epson|Color" } | Select-Object -First 1)
        if (-not $colorPrinter -and $sharedPrinters.Count -gt 1) { $colorPrinter = $sharedPrinters[1] }
    }

    if (-not $MachineId) {
        if ($installConfig) {
            $MachineId = ConvertTo-MachineId -Value $env:COMPUTERNAME
        } else {
            $MachineId = Read-Host "ID da maquina (ex: pc-01)"
        }
        if ([string]::IsNullOrWhiteSpace($MachineId)) { $MachineId = ConvertTo-MachineId -Value $env:COMPUTERNAME }
    }
    if (-not $MachineName) {
        if ($installConfig) {
            $MachineName = $MachineId
        } else {
            $MachineName = Read-Host "Nome exibido no painel (ex: PC 01)"
            if ([string]::IsNullOrWhiteSpace($MachineName)) { $MachineName = $MachineId }
        }
    }

    if (-not $installConfig) {
        if (-not $ServerUrl) { $ServerUrl = Read-Host "URL do servidor (ex: http://192.168.1.31:4780)" }
        if (-not $PairingCode) { $PairingCode = Read-Host "Codigo de vinculacao exibido no painel" }
    }
    $ServerUrl = $ServerUrl.TrimEnd("/")
    if ($ServerUrl -notmatch '^https?://[^/]+$') { throw "URL do servidor invalida." }

    $autoLoginUser = $null
    try {
        $autoLoginUser = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -Name "DefaultUserName" -ErrorAction Stop).DefaultUserName
    } catch { $autoLoginUser = $null }

    if ($Users -and $Users.Count -gt 0) {
        $resolvedUsers = Resolve-UserList -InputUsers $Users
    } elseif ($installConfig) {
        $detected = Get-ExistingLocalUsers
        if ($autoLoginUser -and ($detected -contains $autoLoginUser)) {
            Write-Host "Perfil do cliente detectado: $autoLoginUser"
            $resolvedUsers = Resolve-UserList -InputUsers @($autoLoginUser)
        } elseif ($detected.Count -eq 1) {
            $resolvedUsers = Resolve-UserList -InputUsers $detected
        } else {
            $resolvedUsers = Resolve-UserList
        }
    } else {
        $resolvedUsers = Resolve-UserList
    }

    # Tudo o que o cliente costuma salvar volta ao padrao a cada atendimento.
    $folders = @("Desktop", "Downloads", "Documents", "Pictures", "Videos", "Music")
    $previousToken = ""
    if (Test-Path $ConfigPath) { try { $previousToken = [string](Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json).AgentToken } catch { } }

    if ($installConfig -and $InstallKey) {
        $enrollBody = @{ key = $InstallKey.Trim(); id = $MachineId.Trim(); name = $MachineName.Trim(); previousToken = $previousToken } | ConvertTo-Json -Depth 4
        $enrollBytes = [System.Text.Encoding]::UTF8.GetBytes($enrollBody)
        try {
            $enrollment = Invoke-RestMethod -Method Post -Uri "$ServerUrl/api/agent/enroll-by-key" -ContentType "application/json; charset=utf-8" -Body $enrollBytes -TimeoutSec 10
        } catch { throw (Get-ApiMessage -ErrorRecord $_) }
    } else {
        $enrollBody = @{ id = $MachineId.Trim(); name = $MachineName.Trim(); code = $PairingCode.Trim() } | ConvertTo-Json -Depth 4
        $enrollBytes = [System.Text.Encoding]::UTF8.GetBytes($enrollBody)
        $enrollment = Invoke-RestMethod -Method Post -Uri "$ServerUrl/api/agent/enroll" -ContentType "application/json; charset=utf-8" -Body $enrollBytes -TimeoutSec 10
    }

    $installedScript = Join-Path $InstallRoot "LanHouseAgent.ps1"
    if ($PSCommandPath -and (Test-Path $PSCommandPath)) {
        Copy-Item -LiteralPath $PSCommandPath -Destination $installedScript -Force
    }

    $config = [ordered]@{
        Version = $AgentVersion
        ServerUrl = $ServerUrl
        MachineId = $MachineId.Trim()
        MachineName = $MachineName.Trim()
        AgentToken = $enrollment.token
        ProtectedUsers = @($resolvedUsers)
        ProtectedFolders = @($folders | Select-Object -Unique)
        CleanTemp = $true
        CleanBrowserCache = $true
        CleanCookies = $true
        LastCapture = $null
        ColorPrinters = $colorPrinters
        SharedPrinters = $sharedPrinters
        PrintBlackPrinter = $blackPrinter
        PrintColorPrinter = $colorPrinter
        VirtualPrinting = $true
    }
    Save-Config -Config $config

    New-Item -ItemType Directory -Path $StartupFolder -Force | Out-Null
    @"
@echo off
powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "$installedScript" -Action Run
"@ | Set-Content -Path $StartupBat -Encoding ASCII

    Write-AgentLog "Maquina vinculada ao servidor."

    # O cliente so enxerga a "Impressao Nexcafe"; o caixa imprime nas impressoras fisicas.
    Install-VirtualPrintQueue
    Remove-DirectPrinters

    # Captura enquanto o instalador ainda esta elevado; depois a conta do cliente
    # perde permissao para iniciar outro PowerShell como administrador.
    try { Add-OfficeShortcuts -User ([string](@($resolvedUsers)[0])) } catch { Write-AgentLog "Atalhos do Office nao criados: $($_.Exception.Message)" }
    Invoke-CaptureBaseline

    # Protecao: pasta somente leitura, atualizacao pelo sistema, perfil restrito e cliente sem administrador.
    Protect-AgentFolder
    Register-AgentUpdater
    # Com um so usuario o PowerShell devolve texto, e [0] pegaria a primeira letra.
    $clientUser = [string](@($resolvedUsers)[0])
    Set-ClientRestrictions -User $clientUser
    Set-StationAccounts -ClientUser $clientUser

    Write-Host ""
    Write-Host "Agente instalado em $InstallRoot"
    Write-Host "Inicializacao criada em $StartupBat"
    Write-Host "Impressora do cliente: $VirtualPrinterName (impressao feita pelo caixa)"
    Write-Host ""
    Write-Host "Padrao salvo. PROXIMO PASSO: reinicie a estacao pelo menu Iniciar." -ForegroundColor Green
    Write-Host "(O agente e a tela de bloqueio voltam depois do reinicio.)"
}

# Abre outra acao do agente (bloqueio, contador, monitor, revisao de impressao) sem janela de console.
# Usa CreateProcess direto: a politica DisallowRun do cliente (que bloqueia powershell.exe) vale para
# programas abertos pelo Explorer/ShellExecute, e Start-Process passaria por esse caminho.
function Start-AgentChild {
    param([string]$ChildAction, [string[]]$Extra = @())
    $scriptPath = Join-Path $InstallRoot "LanHouseAgent.ps1"
    if (-not (Test-Path $scriptPath)) { $scriptPath = $PSCommandPath }
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = Join-Path $env:WINDIR "System32\WindowsPowerShell\v1.0\powershell.exe"
    $info.Arguments = (@("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", "`"$scriptPath`"", "-Action", $ChildAction) + $Extra) -join " "
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    # Pasta fixa: herdar a pasta atual falha se ela deixou de existir (ex.: pendrive removido).
    $info.WorkingDirectory = if (Test-Path -LiteralPath $InstallRoot) { $InstallRoot } else { $env:SystemRoot }
    return [System.Diagnostics.Process]::Start($info)
}

function Start-LockScreenProcess { return Start-AgentChild -ChildAction "LockScreen" }
function Start-OverlayProcess { return Start-AgentChild -ChildAction "Overlay" }

function Wait-WinRtOperation {
    param([object]$Operation, [type]$ResultType)
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
    if ($ResultType) {
        $method = $methods | Where-Object {
            $_.Name -eq "AsTask" -and $_.IsGenericMethodDefinition -and
            $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like "IAsyncOperation*"
        } | Select-Object -First 1
        $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    } else {
        $method = $methods | Where-Object {
            $_.Name -eq "AsTask" -and -not $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1
        } | Select-Object -First 1
        $task = $method.Invoke($null, @($Operation))
    }
    $task.Wait()
    if ($ResultType) { return $task.Result }
}

function Open-PdfDocument {
    param([string]$Path)
    $fileType = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
    $pdfType = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType=WindowsRuntime]
    $file = Wait-WinRtOperation -Operation ($fileType::GetFileFromPathAsync($Path)) -ResultType $fileType
    return Wait-WinRtOperation -Operation ($pdfType::LoadFromFileAsync($file)) -ResultType $pdfType
}

function Get-PdfPageImage {
    param([object]$Document, [int]$Index, [double]$Scale = 1.0)
    Add-Type -AssemblyName System.Drawing
    $page = $Document.GetPage($Index)
    $stream = $null
    $netStream = $null
    $bitmap = $null
    try {
        $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
        $options = New-Object Windows.Data.Pdf.PdfPageRenderOptions
        $options.DestinationWidth = [uint32][Math]::Ceiling($page.Size.Width * $Scale)
        $options.DestinationHeight = [uint32][Math]::Ceiling($page.Size.Height * $Scale)
        Wait-WinRtOperation -Operation ($page.RenderToStreamAsync($stream, $options)) | Out-Null
        $stream.Seek(0)
        $netStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStream($stream)
        $bitmap = New-Object System.Drawing.Bitmap($netStream)
        return New-Object System.Drawing.Bitmap($bitmap)
    } finally {
        if ($bitmap) { $bitmap.Dispose() }
        if ($netStream) { $netStream.Dispose() }
        if ($stream) { $stream.Dispose() }
        $page.Dispose()
    }
}

function Get-PdfPageCount {
    param([string]$Path)
    $document = Open-PdfDocument -Path $Path
    return [int]$document.PageCount
}

function Show-PdfPrintReview {
    param([string]$Path, [int]$Pages, [int]$BwCents, [int]$ColorCents)
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [System.Windows.Forms.Application]::EnableVisualStyles()
    $document = Open-PdfDocument -Path $Path
    $dark = [Drawing.Color]::FromArgb(17, 29, 39)
    $panelColor = [Drawing.Color]::FromArgb(24, 42, 53)
    $teal = [Drawing.Color]::FromArgb(12, 137, 126)
    $white = [Drawing.Color]::White
    $muted = [Drawing.Color]::FromArgb(177, 195, 205)
    $form = New-Object Windows.Forms.Form
    $form.Text = "Impressão Nexcafé"
    $form.StartPosition = "CenterScreen"
    $form.Size = New-Object Drawing.Size(990, 675)
    $form.MinimumSize = New-Object Drawing.Size(820, 580)
    $form.BackColor = $dark
    $form.ForeColor = $white
    $form.TopMost = $true
    # Abre maximizada para o cliente conferir a pagina em tamanho grande; pode restaurar e redimensionar.
    $form.MaximizeBox = $true
    $form.WindowState = "Maximized"
    $form.KeyPreview = $true
    $script:PrintReviewChoice = $null
    $script:PrintPreviewIndex = 0
    $script:PrintPreviewImage = $null

    $summary = New-Object Windows.Forms.Panel
    $summary.Location = New-Object Drawing.Point(18, 18)
    $summary.Size = New-Object Drawing.Size(280, 605)
    $summary.Anchor = "Top,Bottom,Left"
    $summary.BackColor = $panelColor
    $form.Controls.Add($summary)

    $title = New-Object Windows.Forms.Label
    $title.Text = "Impressão Nexcafé"
    $title.Font = New-Object Drawing.Font("Segoe UI", 17, [Drawing.FontStyle]::Bold)
    $title.Location = New-Object Drawing.Point(18, 22)
    $title.Size = New-Object Drawing.Size(250, 38)
    $summary.Controls.Add($title)

    $pageLabel = New-Object Windows.Forms.Label
    $pageLabel.Text = "$Pages página(s)"
    $pageLabel.Font = New-Object Drawing.Font("Segoe UI", 22, [Drawing.FontStyle]::Bold)
    $pageLabel.Location = New-Object Drawing.Point(18, 78)
    $pageLabel.Size = New-Object Drawing.Size(250, 48)
    $summary.Controls.Add($pageLabel)

    $instruction = New-Object Windows.Forms.Label
    $instruction.Text = "Confira as páginas. Escolha o tipo de impressão antes de enviar."
    $instruction.Font = New-Object Drawing.Font("Segoe UI", 10)
    $instruction.ForeColor = $muted
    $instruction.Location = New-Object Drawing.Point(20, 139)
    $instruction.Size = New-Object Drawing.Size(240, 64)
    $summary.Controls.Add($instruction)

    $bwButton = New-Object Windows.Forms.Button
    $bwButton.Text = ("Preto e branco  R$ {0:N2}" -f ($BwCents / 100))
    $bwButton.Font = New-Object Drawing.Font("Segoe UI", 12, [Drawing.FontStyle]::Bold)
    $bwButton.BackColor = $teal
    $bwButton.ForeColor = $white
    $bwButton.FlatStyle = "Flat"
    $bwButton.FlatAppearance.BorderSize = 0
    $bwButton.Location = New-Object Drawing.Point(18, 218)
    $bwButton.Size = New-Object Drawing.Size(244, 66)
    $summary.Controls.Add($bwButton)

    $colorButton = New-Object Windows.Forms.Button
    $colorButton.Text = ("Colorido  R$ {0:N2}" -f ($ColorCents / 100))
    $colorButton.Font = New-Object Drawing.Font("Segoe UI", 12, [Drawing.FontStyle]::Bold)
    $colorButton.BackColor = [Drawing.Color]::FromArgb(59, 81, 94)
    $colorButton.ForeColor = $white
    $colorButton.FlatStyle = "Flat"
    $colorButton.FlatAppearance.BorderSize = 0
    $colorButton.Location = New-Object Drawing.Point(18, 300)
    $colorButton.Size = New-Object Drawing.Size(244, 66)
    $summary.Controls.Add($colorButton)

    $cancelButton = New-Object Windows.Forms.Button
    $cancelButton.Text = "Cancelar impressão"
    $cancelButton.Font = New-Object Drawing.Font("Segoe UI", 10)
    $cancelButton.BackColor = $panelColor
    $cancelButton.ForeColor = $muted
    $cancelButton.FlatStyle = "Flat"
    $cancelButton.Location = New-Object Drawing.Point(18, 388)
    $cancelButton.Size = New-Object Drawing.Size(244, 48)
    $summary.Controls.Add($cancelButton)

    $preview = New-Object Windows.Forms.PictureBox
    $preview.Location = New-Object Drawing.Point(321, 18)
    $preview.Size = New-Object Drawing.Size(635, 550)
    $preview.Anchor = "Top,Bottom,Left,Right"
    $preview.BackColor = [Drawing.Color]::FromArgb(229, 236, 239)
    $preview.SizeMode = "Zoom"
    $form.Controls.Add($preview)

    $prev = New-Object Windows.Forms.Button
    $prev.Text = "Anterior"
    $prev.Location = New-Object Drawing.Point(329, 583)
    $prev.Size = New-Object Drawing.Size(90, 37)
    $prev.Anchor = "Bottom,Left"
    $form.Controls.Add($prev)
    $position = New-Object Windows.Forms.Label
    $position.TextAlign = "MiddleCenter"
    $position.ForeColor = $muted
    $position.Location = New-Object Drawing.Point(429, 583)
    $position.Size = New-Object Drawing.Size(418, 37)
    $position.Anchor = "Bottom,Left,Right"
    $form.Controls.Add($position)
    $next = New-Object Windows.Forms.Button
    $next.Text = "Próxima"
    $next.Location = New-Object Drawing.Point(855, 583)
    $next.Size = New-Object Drawing.Size(90, 37)
    $next.Anchor = "Bottom,Right"
    $form.Controls.Add($next)

    $loadPage = {
        $newImage = Get-PdfPageImage -Document $document -Index $script:PrintPreviewIndex -Scale 1.0
        if ($script:PrintPreviewImage) { $script:PrintPreviewImage.Dispose() }
        $script:PrintPreviewImage = $newImage
        $preview.Image = $newImage
        $position.Text = "Página $($script:PrintPreviewIndex + 1) de $Pages"
        $prev.Enabled = ($script:PrintPreviewIndex -gt 0)
        $next.Enabled = ($script:PrintPreviewIndex -lt ($Pages - 1))
    }
    $prev.Add_Click({ if ($script:PrintPreviewIndex -gt 0) { $script:PrintPreviewIndex--; & $loadPage } })
    $next.Add_Click({ if ($script:PrintPreviewIndex -lt ($Pages - 1)) { $script:PrintPreviewIndex++; & $loadPage } })
    $bwButton.Add_Click({ $script:PrintReviewChoice = "bw"; $form.Close() })
    $colorButton.Add_Click({ $script:PrintReviewChoice = "color"; $form.Close() })
    $cancelButton.Add_Click({ $form.Close() })
    $form.Add_Shown({ & $loadPage })
    try { $form.ShowDialog() | Out-Null; return $script:PrintReviewChoice }
    finally {
        if ($script:PrintPreviewImage) { $script:PrintPreviewImage.Dispose(); $script:PrintPreviewImage = $null }
        $form.Dispose()
    }
}

function Receive-VirtualPrintJob {
    param([object]$Listener, [object]$Config, [string]$SessionId, [int]$PrintBW, [int]$PrintColor)
    if (-not $Listener.Pending()) { return }
    $folder = Join-Path $UserDataRoot "PrintJobs"
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
    $path = Join-Path $folder ("job-{0}.pdf" -f [guid]::NewGuid().ToString("N"))
    $client = $Listener.AcceptTcpClient()
    try {
        $stream = $client.GetStream()
        $stream.ReadTimeout = 30000
        $output = [IO.File]::Create($path)
        try {
            $buffer = New-Object byte[] 65536
            $total = 0L
            while (($count = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $total += $count
                if ($total -gt 100MB) { throw "Documento excede 100 MB." }
                $output.Write($buffer, 0, $count)
            }
        } finally { $output.Dispose() }
    } finally { $client.Dispose() }
    $header = New-Object byte[] 4
    $file = [IO.File]::OpenRead($path)
    try { if ($file.Read($header, 0, 4) -ne 4) { throw "Documento vazio." } }
    finally { $file.Dispose() }
    if ([Text.Encoding]::ASCII.GetString($header) -ne "%PDF") { throw "A impressora virtual nao gerou PDF valido." }
    [void](Start-PrintReviewProcess -Path $path)
    Write-AgentLog "Documento recebido da Impressao Nexcafe; revisao aberta para o cliente."
}

$script:LhmInputReady = $false
function Add-LhmInputTypes {
    if ($script:LhmInputReady) { return }
    Add-Type -AssemblyName System.Windows.Forms
    if (-not ("LhmKeys" -as [type])) {
        # Digitacao por SendInput com caractere Unicode (acentos corretos, nao depende do layout do teclado).
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public class LhmKeys {
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    static INPUT Key(ushort vk, ushort scan, uint flags) { var i = new INPUT(); i.type = 1; i.u.ki.wVk = vk; i.u.ki.wScan = scan; i.u.ki.dwFlags = flags; return i; }
    public static void Type(string text) {
        foreach (char c in text) {
            if (c == '\r') continue;
            INPUT[] pair = c == '\n' ? new[] { Key(0x0D, 0, 0), Key(0x0D, 0, 2) } : new[] { Key(0, c, 4), Key(0, c, 4 | 2) };
            if (SendInput(2, pair, Marshal.SizeOf(typeof(INPUT))) != 2) throw new InvalidOperationException("O Windows recusou a digitacao (erro " + Marshal.GetLastWin32Error() + ").");
        }
    }
    // Tecla virtual, com Ctrl opcional (Enter, setas, Ctrl+C...).
    public static void Press(ushort vk, bool ctrl) {
        var list = new System.Collections.Generic.List<INPUT>();
        uint ext = (vk >= 0x21 && vk <= 0x2E) ? 1u : 0u;
        if (ctrl) list.Add(Key(0x11, 0, 0));
        list.Add(Key(vk, 0, ext)); list.Add(Key(vk, 0, ext | 2));
        if (ctrl) list.Add(Key(0x11, 0, 2));
        if (SendInput((uint)list.Count, list.ToArray(), Marshal.SizeOf(typeof(INPUT))) != list.Count) throw new InvalidOperationException("O Windows recusou a tecla (erro " + Marshal.GetLastWin32Error() + ").");
    }
}
"@
    }
    if (-not ("LhmInput" -as [type])) {
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public class LhmInput {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [StructLayout(LayoutKind.Sequential)] public struct MouseData {
        public int dx, dy;
        public uint mouseData, flags, time;
        public IntPtr extraInfo;
    }
    [StructLayout(LayoutKind.Sequential)] public struct InputData {
        public int type;
        public MouseData mouse;
    }
    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, InputData[] inputs, int size);
    public static int InputSize() { return Marshal.SizeOf(typeof(InputData)); }
    public static void MoveTo(int x, int y) {
        if (!SetCursorPos(x, y)) throw new InvalidOperationException("O Windows recusou mover o cursor.");
    }
    public static void Mouse(uint flags, int data) {
        var input = new InputData { type = 0, mouse = new MouseData { flags = flags, mouseData = unchecked((uint)data) } };
        if (SendInput(1, new[] { input }, InputSize()) != 1)
            throw new InvalidOperationException("O Windows recusou o comando de mouse (erro " + Marshal.GetLastWin32Error() + "). Verifique a tela segura ou um aplicativo elevado.");
    }
    public static void Click(uint down, uint up) {
        var inputs = new[] {
            new InputData { type = 0, mouse = new MouseData { flags = down } },
            new InputData { type = 0, mouse = new MouseData { flags = up } }
        };
        if (SendInput(2, inputs, InputSize()) != 2)
            throw new InvalidOperationException("O Windows recusou o clique (erro " + Marshal.GetLastWin32Error() + "). Verifique a tela segura ou um aplicativo elevado.");
    }
}
"@
    }
    $script:LhmInputReady = $true
}

function ConvertTo-SendKeys {
    param([string]$Text)
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $Text.ToCharArray()) {
        if ($ch -eq "`r") { continue }
        if ($ch -eq "`n") { [void]$sb.Append("{ENTER}"); continue }
        if ("+^%~(){}[]".IndexOf($ch) -ge 0) { [void]$sb.Append("{$ch}") } else { [void]$sb.Append($ch) }
    }
    return $sb.ToString()
}

function Invoke-InputEvent {
    param([object]$Event)
    Add-LhmInputTypes
    $type = [string]$Event.type
    if ($type -eq "move") { [LhmInput]::MoveTo([int]$Event.x, [int]$Event.y); return }
    if ($type -eq "dblclick") {
        [LhmInput]::MoveTo([int]$Event.x, [int]$Event.y)
        Start-Sleep -Milliseconds 40
        for ($k = 0; $k -lt 2; $k++) {
            [LhmInput]::Click(0x0002, 0x0004)
            if ($k -eq 0) { Start-Sleep -Milliseconds 60 }
        }
        return
    }
    if ($type -eq "click" -or $type -eq "rclick") {
        [LhmInput]::MoveTo([int]$Event.x, [int]$Event.y)
        Start-Sleep -Milliseconds 50
        if ($type -eq "click") { [LhmInput]::Click(0x0002, 0x0004) }
        else { [LhmInput]::Click(0x0008, 0x0010) }
        return
    }
    if ($type -eq "scroll") {
        [LhmInput]::MoveTo([int]$Event.x, [int]$Event.y)
        $amount = [int]$Event.amount
        if ($amount -gt 0) { [LhmInput]::Mouse(0x0800, 120) } elseif ($amount -lt 0) { [LhmInput]::Mouse(0x0800, -120) }
        return
    }
    if ($type -eq "text") { [LhmKeys]::Type([string]$Event.value); return }
    if ($type -eq "key") {
        $vk = @{ enter = 0x0D; tab = 0x09; esc = 0x1B; backspace = 0x08; delete = 0x2E; up = 0x26; down = 0x28; left = 0x25; right = 0x27; home = 0x24; end = 0x23; pageup = 0x21; pagedown = 0x22; f5 = 0x74 }
        $key = ([string]$Event.value).ToLower()
        if ($key -match '^ctrl\+([a-z])$') { [LhmKeys]::Press([uint16][char]$Matches[1].ToUpper(), $true); return }
        if ($vk.ContainsKey($key)) { [LhmKeys]::Press([uint16]$vk[$key], $false) }
        return
    }
}

function Get-EpochMs {
    return [long](([DateTime]::UtcNow - [DateTime]"1970-01-01").TotalMilliseconds)
}

function Get-ScriptHash {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return "" }
    try { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLower() } catch { return "" }
}

function Update-AgentScriptIfNeeded {
    param([object]$Config, [string]$ServerHash, [string]$RunningHash)
    $installed = Join-Path $InstallRoot "LanHouseAgent.ps1"
    if (-not $script:UpdateDenied) {
        try { [void](Save-AgentScriptFromServer -Config $Config -ServerHash $ServerHash) }
        catch {
            $denied = $_.Exception -is [System.UnauthorizedAccessException] -or $_.Exception.InnerException -is [System.UnauthorizedAccessException]
            if ($denied) { $script:UpdateDenied = $true; Write-AgentLog "Pasta protegida: a atualizacao fica com a tarefa do sistema." }
            else { Write-AgentLog "Falha ao atualizar agente: $($_.Exception.Message)" }
        }
    }
    $current = Get-ScriptHash -Path $installed
    if (-not $current -or $current -eq $RunningHash) { return $false }
    Write-AgentLog "Nova versao do agente instalada. Reiniciando em 3s."
    Restart-AgentRun
    return $true
}

# Inicia um novo agente em 3 s (depois que este sair) e fecha as telas antigas para reabrirem com ele.
function Restart-AgentRun {
    $installed = Join-Path $InstallRoot "LanHouseAgent.ps1"
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = Join-Path $env:WINDIR "System32\cmd.exe"
    $info.Arguments = "/c timeout /t 3 /nobreak >nul & powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$installed`" -Action Run"
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    # Pasta fixa: herdar a pasta atual falha se ela deixou de existir (ex.: pendrive removido).
    $info.WorkingDirectory = if (Test-Path -LiteralPath $InstallRoot) { $InstallRoot } else { $env:SystemRoot }
    [void][System.Diagnostics.Process]::Start($info)
}

function Get-ScreenJpeg {
    param([int]$MaxWidth = 1366, [long]$Quality = 40)
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try { $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size) } finally { $g.Dispose() }
    if ($bounds.Width -gt $MaxWidth) {
        $small = New-Object System.Drawing.Bitmap($MaxWidth, [int]($bounds.Height * $MaxWidth / $bounds.Width))
        $g2 = [System.Drawing.Graphics]::FromImage($small)
        $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::Bilinear
        $g2.DrawImage($bmp, 0, 0, $small.Width, $small.Height)
        $g2.Dispose(); $bmp.Dispose(); $bmp = $small
    }
    if (-not $script:JpegCodec) {
        $script:JpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" } | Select-Object -First 1
    }
    $params = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, $Quality)
    $ms = New-Object System.IO.MemoryStream
    try { $bmp.Save($ms, $script:JpegCodec, $params); $bytes = $ms.ToArray() } finally { $ms.Dispose(); $bmp.Dispose() }
    return @{ Bytes = $bytes; Width = $bounds.Width; Height = $bounds.Height }
}

# Processo proprio para o monitoramento: envia a tela ~3 vezes por segundo e executa os cliques
# recebidos na mesma resposta, sem depender do loop principal do agente.
function Invoke-Monitor {
    $monitorMutex = New-Object System.Threading.Mutex($false, "Local\LanHouseManagerMonitor")
    if (-not $monitorMutex.WaitOne(0)) { return }
    $config = Load-Config
    $base = "$($Config.ServerUrl)".TrimEnd("/")
    $id = [Uri]::EscapeDataString($config.MachineId)
    $headers = @{ Authorization = "Bearer $($config.AgentToken)" }
    $failures = 0
    $script:MonitorReported = 0
    Add-LhmInputTypes
    # Com a escala do Windows (125%, 150%) um processo sem DPI captura e clica em coordenadas virtuais:
    # a imagem e o clique nao batiam. Com DPI ativado, captura, tamanho e cursor usam os pixels reais.
    try { [void][LhmInput]::SetProcessDPIAware() } catch { }
    if (-not ("LhmInputDiag" -as [type])) {
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public class LhmInputDiag {
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    public static int ForegroundPid() { uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid); return (int)pid; }
}
"@
    }
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        Send-AgentEvent -Config $config -Title "Monitor: iniciado" -Detail "Tela $($bounds.Width)x$($bounds.Height); sessao $((Get-Process -Id $PID).SessionId)"
    } catch { }
    while ($true) {
        $started = Get-Date
        try {
            $shot = Get-ScreenJpeg
            $response = Invoke-RestMethod -Method Post -Uri "$base/api/client/$id/screen-frame?w=$($shot.Width)&h=$($shot.Height)" -Headers $headers -ContentType "image/jpeg" -Body $shot.Bytes -TimeoutSec 5
            $failures = 0
            foreach ($evt in @($response.events)) {
                if (-not $evt) { continue }
                $inputError = ""
                try { Invoke-InputEvent -Event $evt } catch { $inputError = $_.Exception.Message }
                # Diagnostico: os 3 primeiros cliques de cada monitoramento (e todo erro) vao para o painel.
                if (($evt.type -ne "move" -and $script:MonitorReported -lt 6) -or $inputError) {
                    $script:MonitorReported++
                    $pos = [System.Windows.Forms.Cursor]::Position
                    $fg = ""
                    try { $fg = (Get-Process -Id ([LhmInputDiag]::ForegroundPid()) -ErrorAction Stop).ProcessName } catch { }
                    Send-AgentEvent -Config $config -Title $(if ($inputError) { "Monitor: comando falhou" } else { "Monitor: comando executado" }) -Detail "$($evt.type) em $($evt.x),$($evt.y); cursor ficou em $($pos.X),$($pos.Y); janela ativa: $fg; sessao $((Get-Process -Id $PID).SessionId) $inputError"
                }
            }
            if ([long]$response.monitorUntil -le (Get-EpochMs)) { break }
            if (@($response.events).Count -gt 0) { continue }
        } catch {
            $failures++
            if ($failures -ge 10) { Write-AgentLog "Monitoramento encerrado: $($_.Exception.Message)"; break }
            Start-Sleep -Milliseconds 700
        }
        $elapsed = ((Get-Date) - $started).TotalMilliseconds
        if ($elapsed -lt 200) { Start-Sleep -Milliseconds ([int](200 - $elapsed)) }
    }
}

function Start-MonitorProcess {
    return Start-AgentChild -ChildAction "Monitor"
}

# Encerra telas (bloqueio, contador, monitor) de uma versao anterior para que a nova assuma.
function Stop-AgentUiProcesses {
    param([string[]]$Actions = @("LockScreen", "Overlay", "Monitor", "PrintReview"))
    $session = (Get-Process -Id $PID).SessionId
    $pattern = '(?i)-Action\s+"?(' + ($Actions -join '|') + ')"?'
    foreach ($process in @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='cmd.exe'" -ErrorAction SilentlyContinue)) {
        if ($process.ProcessId -eq $PID -or $process.SessionId -ne $session) { continue }
        # Inclui o cmd.exe de reinicio de uma versao anterior (herdou a porta da impressora virtual).
        $restartHelper = $process.Name -eq "cmd.exe" -and $process.CommandLine -match '(?i)-Action\s+"?Run'
        if (($process.CommandLine -match $pattern -or $restartHelper) -and $process.CommandLine -match 'LanHouseAgent\.ps1') {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }
}

# Fecha os programas abertos pelo cliente antes da restauracao (arquivos abertos travam a limpeza).
function Close-ClientApps {
    $session = (Get-Process -Id $PID).SessionId
    $keep = @("explorer", "powershell", "ShellExperienceHost", "StartMenuExperienceHost", "SearchUI", "SearchApp", "TextInputHost", "ctfmon", "sihost", "taskhostw", "RuntimeBroker", "dwm", "SecurityHealthSystray", "LockApp", "conhost")
    $targets = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $_.SessionId -eq $session -and $_.Id -ne $PID -and $_.MainWindowHandle -ne [IntPtr]::Zero -and $keep -notcontains $_.ProcessName
    })
    foreach ($process in $targets) { try { [void]$process.CloseMainWindow() } catch { } }
    if ($targets.Count -gt 0) { Start-Sleep -Milliseconds 1500 }
    foreach ($process in $targets) {
        try { if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction Stop } } catch { }
    }
    if ($targets.Count -gt 0) { Write-AgentLog "Programas fechados antes da restauracao: $(($targets | ForEach-Object { $_.ProcessName } | Select-Object -Unique) -join ', ')" }
}

#region Protecao da estacao (instalacao como administrador)

$TechnicianUser = "Tecnico"
$UpdaterTaskName = "LanHouseManager-Atualizador"
$SessionTaskName = "LanHouseManager-AgenteSessao"

# Resolve a conta pelo caminho da pasta do perfil (C:\Users\<pasta>). O nome da pasta pode diferir
# do nome interno da conta (acento gravado de outra forma, conta renomeada), entao nao da para
# procurar so pelo nome.
function Resolve-LocalAccount {
    param([string]$User)
    $profilePath = (Join-Path "C:\Users" $User).Normalize([Text.NormalizationForm]::FormC)
    $profile = Get-CimInstance -ClassName Win32_UserProfile -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPath -and $_.LocalPath.Normalize([Text.NormalizationForm]::FormC) -ieq $profilePath } | Select-Object -First 1
    $sid = $null
    if ($profile) { $sid = [string]$profile.SID }
    else {
        foreach ($candidate in @($User, $User.Normalize([Text.NormalizationForm]::FormC), $User.Normalize([Text.NormalizationForm]::FormD), (Remove-Diacritics $User))) {
            try { $sid = (New-Object System.Security.Principal.NTAccount($candidate)).Translate([System.Security.Principal.SecurityIdentifier]).Value; break } catch { }
        }
    }
    if (-not $sid) { throw "Conta do Windows do perfil '$User' nao encontrada." }
    $account = Get-LocalUser -SID $sid -ErrorAction SilentlyContinue
    $name = if ($account) { [string]$account.Name } else { ((New-Object System.Security.Principal.SecurityIdentifier($sid)).Translate([System.Security.Principal.NTAccount]).Value -split '\\')[-1] }
    return [pscustomobject]@{ Sid = $sid; Name = $name; ProfilePath = if ($profile) { [string]$profile.LocalPath } else { Join-Path "C:\Users" $User } }
}

# Executa $Action com o registro (HKU) do usuario carregado, mesmo que ele nao esteja logado.
function Invoke-WithUserHive {
    param([string]$User, [scriptblock]$Action)
    $account = Resolve-LocalAccount -User $User
    $sid = $account.Sid
    if (Test-Path "Registry::HKEY_USERS\$sid") { & $Action "HKU\$sid"; return }
    $hive = Join-Path $account.ProfilePath "NTUSER.DAT"
    if (-not (Test-Path -LiteralPath $hive)) { throw "Perfil do usuario $User ainda nao foi criado (entre uma vez nele)." }
    $mount = "LHM_$($User -replace '[^A-Za-z0-9]', '')"
    & reg.exe load "HKU\$mount" "$hive" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel carregar o registro do usuario $User." }
    try { & $Action "HKU\$mount" }
    finally {
        [GC]::Collect(); [GC]::WaitForPendingFinalizers()
        & reg.exe unload "HKU\$mount" | Out-Null
    }
}

# Grava no registro pela API do .NET. A politica DisableRegistryTools (aplicada ao cliente) bloqueia
# regedit.exe e reg.exe para o proprio usuario; numa reinstalacao feita logado como cliente o
# instalador nao conseguiria mais gravar com reg.exe.
function Open-UserRegistryKey {
    param([string]$Key)
    if ($Key -notmatch '^HKU\\(.+)$') { throw "Chave fora de HKU: $Key" }
    $opened = [Microsoft.Win32.Registry]::Users.CreateSubKey($Matches[1])
    if (-not $opened) { throw "Nao foi possivel abrir $Key" }
    return $opened
}

function Set-RegistryDword {
    param([string]$Key, [string]$Name, [int]$Value)
    $opened = Open-UserRegistryKey -Key $Key
    try { $opened.SetValue($Name, $Value, [Microsoft.Win32.RegistryValueKind]::DWord) } finally { $opened.Close() }
}

function Set-RegistryString {
    param([string]$Key, [string]$Name, [string]$Value)
    $opened = Open-UserRegistryKey -Key $Key
    try { $opened.SetValue($Name, $Value, [Microsoft.Win32.RegistryValueKind]::String) } finally { $opened.Close() }
}

function Remove-RegistryValue {
    param([string]$Key, [string]$Name)
    if ($Key -notmatch '^HKU\\(.+)$') { return }
    $opened = [Microsoft.Win32.Registry]::Users.OpenSubKey($Matches[1], $true)
    if ($opened) { try { $opened.DeleteValue($Name, $false) } finally { $opened.Close() } }
}

function Remove-RegistryKey {
    param([string]$Key)
    if ($Key -notmatch '^HKU\\(.+)$') { return }
    [Microsoft.Win32.Registry]::Users.DeleteSubKeyTree($Matches[1], $false)
}

# Bloqueia no perfil do cliente as ferramentas usadas para fechar o agente.
# DisableCMD=2 impede o prompt mas mantem o .bat de inicializacao do agente funcionando.
function Set-ClientRestrictions {
    param([string]$User)
    Invoke-WithUserHive -User $User -Action {
        param($root)
        $system = "$root\Software\Microsoft\Windows\CurrentVersion\Policies\System"
        Set-RegistryDword -Key $system -Name "DisableTaskMgr" -Value 1
        Set-RegistryDword -Key $system -Name "DisableRegistryTools" -Value 1
        Set-RegistryDword -Key $system -Name "DisableChangePassword" -Value 1
        Set-RegistryDword -Key "$root\Software\Policies\Microsoft\Windows\System" -Name "DisableCMD" -Value 2
        $explorer = "$root\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer"
        Set-RegistryDword -Key $explorer -Name "NoRun" -Value 1
        Set-RegistryDword -Key $explorer -Name "DisallowRun" -Value 1
        $index = 1
        foreach ($exe in @("powershell.exe", "powershell_ise.exe", "pwsh.exe", "regedit.exe", "taskmgr.exe", "mmc.exe", "Autoruns.exe", "procexp.exe", "procexp64.exe", "ProcessHacker.exe")) {
            Set-RegistryString -Key "$explorer\DisallowRun" -Name "$index" -Value $exe
            $index++
        }
    }
    Write-AgentLog "Restricoes aplicadas ao perfil $User (Gerenciador de Tarefas, CMD, Executar, PowerShell)."
}

function Remove-ClientRestrictions {
    param([string]$User)
    Invoke-WithUserHive -User $User -Action {
        param($root)
        foreach ($name in @("DisableTaskMgr", "DisableRegistryTools", "DisableChangePassword")) { Remove-RegistryValue -Key "$root\Software\Microsoft\Windows\CurrentVersion\Policies\System" -Name $name }
        Remove-RegistryValue -Key "$root\Software\Policies\Microsoft\Windows\System" -Name "DisableCMD"
        foreach ($name in @("NoRun", "DisallowRun")) { Remove-RegistryValue -Key "$root\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer" -Name $name }
        Remove-RegistryKey -Key "$root\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer\DisallowRun"
    }
    Write-AgentLog "Restricoes removidas do perfil $User."
}

# Executa um programa do Windows (reg, icacls, cmdkey) sem que as mensagens de erro dele virem erro
# fatal: no Windows PowerShell 5.1, redirecionar o stderr de um programa com
# $ErrorActionPreference = "Stop" interrompe o script. Devolve a saida; o codigo fica em $LASTEXITCODE.
function Invoke-NativeQuiet {
    param([string]$File, [string[]]$Arguments)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { return @(& $File @Arguments 2>&1 | ForEach-Object { [string]$_ }) }
    finally { $ErrorActionPreference = $previous }
}

function Get-LocalGroupMemberNames {
    param([string]$Sid)
    # ADSI em vez de Get-LocalGroupMember, que falha quando o grupo tem contas antigas removidas.
    $groupName = (Get-LocalGroup -SID $Sid).Name
    $group = [ADSI]"WinNT://$env:COMPUTERNAME/$groupName,group"
    return @($group.psbase.Invoke("Members") | ForEach-Object { $_.GetType().InvokeMember("Name", "GetProperty", $null, $_, $null) })
}

function Test-LocalAdmin {
    param([string]$User)
    return [bool](Get-LocalGroupMemberNames -Sid "S-1-5-32-544" | Where-Object { $_ -ieq $User })
}

# Cria a conta administradora "Tecnico" e tira o administrador do usuario dos clientes.
function Set-StationAccounts {
    param([string]$ClientUser)
    # Nome interno da conta (pode diferir do nome da pasta do perfil).
    $ClientUser = (Resolve-LocalAccount -User $ClientUser).Name
    $admins = Get-LocalGroup -SID "S-1-5-32-544"
    $users = Get-LocalGroup -SID "S-1-5-32-545"
    $technician = Get-LocalUser -Name $TechnicianUser -ErrorAction SilentlyContinue
    $clientIsAdmin = Test-LocalAdmin -User $ClientUser
    if ($technician -and (Test-LocalAdmin -User $TechnicianUser) -and -not $clientIsAdmin) {
        Write-AgentLog "Contas ja protegidas: $TechnicianUser administrador, $ClientUser padrao."
        return
    }
    Write-Host ""
    Write-Host "PROTECAO DA CONTA DO CLIENTE" -ForegroundColor Cyan
    Write-Host "O usuario '$ClientUser' deixa de ser administrador. A manutencao passa a usar a conta '$TechnicianUser'."
    if (-not $technician) { Write-Host "Sera criada a conta '$TechnicianUser' com a senha que voce digitar. GUARDE ESSA SENHA." -ForegroundColor Yellow }
    $answer = Read-Host "Aperte Enter para aplicar (recomendado) ou digite N para pular"
    if ($answer -match '^[nN]') {
        Write-Host "Protecao da conta pulada. O cliente continua administrador e pode desativar o agente." -ForegroundColor Yellow
        Write-AgentLog "Protecao da conta pulada pelo instalador."
        return
    }
    if (-not $technician) {
        while ($true) {
            $first = Read-Host "Senha da conta $TechnicianUser (minimo 6 caracteres)" -AsSecureString
            $second = Read-Host "Repita a senha" -AsSecureString
            $plainA = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($first))
            $plainB = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($second))
            if ($plainA.Length -lt 6) { Write-Host "Senha muito curta." -ForegroundColor Red; continue }
            if ($plainA -cne $plainB) { Write-Host "As senhas nao conferem." -ForegroundColor Red; continue }
            break
        }
        $technician = New-LocalUser -Name $TechnicianUser -Password $first -FullName "Tecnico da lan house" -Description "Manutencao do LanHouseManager" -PasswordNeverExpires -AccountNeverExpires
        Write-AgentLog "Conta $TechnicianUser criada."
    }
    if (-not (Test-LocalAdmin -User $TechnicianUser)) { Add-LocalGroupMember -Group $admins -Member $TechnicianUser -ErrorAction SilentlyContinue }
    # So rebaixa o cliente depois de garantir um administrador com senha.
    if (-not (Test-LocalAdmin -User $TechnicianUser)) { throw "A conta $TechnicianUser nao ficou administradora; o cliente nao foi alterado." }
    if (-not (Get-LocalGroupMemberNames -Sid "S-1-5-32-545" | Where-Object { $_ -ieq $ClientUser })) { Add-LocalGroupMember -Group $users -Member $ClientUser -ErrorAction SilentlyContinue }
    if ($clientIsAdmin) {
        try { Remove-LocalGroupMember -Group $admins -Member $ClientUser -ErrorAction Stop }
        catch { & net.exe localgroup "$($admins.Name)" "$ClientUser" /delete | Out-Null }
        if (Test-LocalAdmin -User $ClientUser) { throw "Nao foi possivel tirar o administrador do usuario $ClientUser." }
        Write-AgentLog "Usuario $ClientUser deixou de ser administrador (vale no proximo login)."
    }
    Write-Host "Pronto: '$TechnicianUser' administrador, '$ClientUser' conta padrao." -ForegroundColor Green
}

# Pasta do agente: cliente so le. Sem isso ele poderia editar o script e remover o bloqueio.
function Protect-AgentFolder {
    # Permissoes explicitas so na pasta; arquivos e subpastas herdam dela. (Aplicar com /T deixava os
    # arquivos sem nenhuma permissao, e nem o agente do cliente nem o administrador conseguiam le-los.)
    & icacls.exe $InstallRoot /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-32-545:(OI)(CI)RX" /C /Q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao proteger a pasta $InstallRoot (icacls $LASTEXITCODE)." }
    & icacls.exe (Join-Path $InstallRoot "*") /reset /T /C /Q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Falha ao aplicar permissoes nos arquivos de $InstallRoot (icacls $LASTEXITCODE)." }
    $probe = Get-ChildItem -LiteralPath $InstallRoot -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($probe -and -not ((& icacls.exe $probe.FullName) -match 'S-1-5-32-545|\\Usu|\\Users')) { throw "Arquivos do agente ficaram sem permissao de leitura para os clientes." }
    Write-AgentLog "Pasta do agente protegida: clientes somente leitura."
}

# Conserta permissoes deixadas por uma instalacao anterior (inclusive arquivos sem nenhuma permissao).
function Repair-AgentFolderAccess {
    if (-not (Test-Path -LiteralPath $InstallRoot)) { return }
    [void](Invoke-NativeQuiet icacls.exe @($InstallRoot, "/setowner", "*S-1-5-32-544", "/T", "/C", "/Q"))
    [void](Invoke-NativeQuiet icacls.exe @($InstallRoot, "/reset", "/T", "/C", "/Q"))
    Write-AgentLog "Permissoes da pasta do agente restauradas para a instalacao."
}

# Com a pasta protegida o agente do cliente nao grava a atualizacao; uma tarefa do sistema faz isso.
function Register-AgentUpdater {
    $script = Join-Path $InstallRoot "LanHouseAgent.ps1"
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -Action Update"
    $triggers = @(
        (New-ScheduledTaskTrigger -AtStartup),
        (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration (New-TimeSpan -Days 3650))
    )
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -MultipleInstances IgnoreNew -StartWhenAvailable
    Register-ScheduledTask -TaskName $UpdaterTaskName -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Force | Out-Null
    Write-AgentLog "Tarefa de atualizacao automatica registrada ($UpdaterTaskName)."
    Register-AgentSessionTask
}

function Register-AgentSessionTask {
    $script = Join-Path $InstallRoot "LanHouseAgent.ps1"
    # Tarefa sob demanda que abre o agente na sessao do usuario logado; o supervisor (SYSTEM) a dispara se o agente cair.
    $runAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File `"$script`" -Action Run" -WorkingDirectory $InstallRoot
    $runPrincipal = New-ScheduledTaskPrincipal -GroupId "S-1-5-32-545" -RunLevel Limited
    $runSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $SessionTaskName -Action $runAction -Principal $runPrincipal -Settings $runSettings -Force | Out-Null
    Write-AgentLog "Tarefa de supervisao do agente registrada ($SessionTaskName)."
}

# Padrao (SYSTEM): area de trabalho e Downloads do padrao so podem ter atalhos. Documento capturado por engano
# junto com o padrao voltaria a cada limpeza (cliente seguinte veria o arquivo do anterior).
function Clear-BaselineDocuments {
    param([object]$Config)
    $removed = @()
    foreach ($user in @($Config.ProtectedUsers)) {
        foreach ($folder in @("Desktop", "Downloads")) {
            $dir = Get-BaselineTarget -User $user -Folder $folder
            if (-not (Test-Path -LiteralPath $dir)) { continue }
            foreach ($item in @(Get-ChildItem -LiteralPath $dir -Force -ErrorAction SilentlyContinue)) {
                $keep = -not $item.PSIsContainer -and ($item.Name -eq "desktop.ini" -or ($folder -eq "Desktop" -and $item.Extension -in @(".lnk", ".url")))
                if ($keep) { continue }
                try { Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction Stop; $removed += "$folder\$($item.Name)" } catch { Write-AgentLog "Padrao: nao removeu $($item.FullName): $($_.Exception.Message)" }
            }
        }
    }
    if ($removed.Count -gt 0) {
        Write-AgentLog "Padrao: documentos removidos do padrao: $($removed -join ', ')"
        try {
            $base = "$($Config.ServerUrl)".TrimEnd("/"); $id = [Uri]::EscapeDataString($Config.MachineId)
            $body = [System.Text.Encoding]::UTF8.GetBytes((@{ title = "Padrao corrigido: documentos removidos"; detail = (($removed | Select-Object -First 10) -join ", ") } | ConvertTo-Json))
            Invoke-RestMethod -Method Post -Uri "$base/api/client/$id/event" -Headers @{ Authorization = "Bearer $($Config.AgentToken)" } -ContentType "application/json; charset=utf-8" -Body $body -TimeoutSec 5 | Out-Null
        } catch { }
    }
}

# Supervisor (SYSTEM): cliente logado sem o agente rodando = sem bloqueio nem limpeza. Religa o agente na sessao dele.
function Invoke-AgentSupervisor {
    param([object]$Config)
    # Estacao instalada antes desta versao: o atualizador (SYSTEM) cria a tarefa que faltava.
    if (-not (Get-ScheduledTask -TaskName $SessionTaskName -ErrorAction SilentlyContinue)) { Register-AgentSessionTask }
    $protected = @($Config.ProtectedUsers)
    $processes = @(Get-CimInstance Win32_Process -Filter "Name='explorer.exe' OR Name='powershell.exe'" -ErrorAction SilentlyContinue)
    foreach ($explorer in @($processes | Where-Object { $_.Name -eq "explorer.exe" })) {
        $owner = (Invoke-CimMethod -InputObject $explorer -MethodName GetOwner -ErrorAction SilentlyContinue).User
        if (-not $owner -or $protected -notcontains $owner) { continue }
        $running = @($processes | Where-Object { $_.Name -eq "powershell.exe" -and $_.SessionId -eq $explorer.SessionId -and $_.CommandLine -match '(?i)-Action\s+"?Run' -and $_.CommandLine -match 'LanHouseAgent\.ps1' })
        if ($running.Count -gt 0) { continue }
        # Logo apos o login o atalho de inicializacao ainda esta abrindo o agente: da uma folga de 90 s.
        if (((Get-Date) - $explorer.CreationDate).TotalSeconds -lt 90) { continue }
        Start-ScheduledTask -TaskName $SessionTaskName
        Write-AgentLog "Supervisor: agente parado na sessao de $owner; reiniciado."
        try {
            $base = "$($Config.ServerUrl)".TrimEnd("/"); $id = [Uri]::EscapeDataString($Config.MachineId)
            $body = [System.Text.Encoding]::UTF8.GetBytes((@{ title = "Agente religado pelo supervisor"; detail = "O agente estava parado na sessao de $owner" } | ConvertTo-Json))
            Invoke-RestMethod -Method Post -Uri "$base/api/client/$id/event" -Headers @{ Authorization = "Bearer $($Config.AgentToken)" } -ContentType "application/json; charset=utf-8" -Body $body -TimeoutSec 5 | Out-Null
        } catch { }
        break
    }
}

#endregion

#region Atualizacao do script

# Baixa o script do servidor quando o hash muda. Retorna $true se o arquivo instalado foi trocado.
function Save-AgentScriptFromServer {
    param([object]$Config, [string]$ServerHash)
    $installed = Join-Path $InstallRoot "LanHouseAgent.ps1"
    if (-not $ServerHash -or (Get-ScriptHash -Path $installed) -eq $ServerHash) { return $false }
    $base = "$($Config.ServerUrl)".TrimEnd("/")
    $id = [Uri]::EscapeDataString($Config.MachineId)
    $resp = Invoke-RestMethod -Method Get -Uri "$base/api/client/$id/script" -Headers @{ Authorization = "Bearer $($Config.AgentToken)" } -TimeoutSec 20
    $text = [string]$resp.script
    if ($text.Length -lt 15000 -or $text -notmatch "param\(" -or $text -notmatch "function Invoke-AgentRun") { throw "script recebido invalido" }
    $tmp = "$installed.new"
    [System.IO.File]::WriteAllText($tmp, $text, (New-Object System.Text.UTF8Encoding($false)))
    if ((Get-ScriptHash -Path $tmp) -ne $ServerHash) {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
        throw "hash do script nao confere"
    }
    Move-Item -LiteralPath $tmp -Destination $installed -Force
    Write-AgentLog "Agente atualizado para o hash $ServerHash."
    return $true
}

# Executado pela tarefa do sistema a cada 2 minutos.
function Invoke-AgentUpdate {
    $config = Load-Config
    $base = "$($config.ServerUrl)".TrimEnd("/")
    $id = [Uri]::EscapeDataString($config.MachineId)
    try {
        $info = Invoke-RestMethod -Method Get -Uri "$base/api/client/$id/script-hash" -Headers @{ Authorization = "Bearer $($config.AgentToken)" } -TimeoutSec 10
        [void](Save-AgentScriptFromServer -Config $config -ServerHash ([string]$info.hash))
    } catch { Write-AgentLog "Atualizador: $($_.Exception.Message)" }
    try { Invoke-AgentSupervisor -Config $config } catch { Write-AgentLog "Supervisor: $($_.Exception.Message)" }
    try { Clear-BaselineDocuments -Config $config } catch { Write-AgentLog "Padrao: $($_.Exception.Message)" }
}

#endregion

#region Limpeza reforcada entre clientes (roda no usuario cliente)

function Clear-ClientTraces {
    param([string]$User)
    $profile = Join-Path "C:\Users" $User
    $local = Join-Path $profile "AppData\Local"
    $roaming = Join-Path $profile "AppData\Roaming"

    # Aplicativos que guardam login: fechados e com os dados de sessao apagados.
    foreach ($name in @("WhatsApp", "Telegram", "Discord", "Spotify", "Teams", "ms-teams", "Zoom", "Skype")) {
        Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 500
    $appData = @(
        (Join-Path $local "WhatsApp"), (Join-Path $roaming "WhatsApp"),
        (Join-Path $roaming "Telegram Desktop\tdata"),
        (Join-Path $roaming "discord\Local Storage"), (Join-Path $roaming "discord\Session Storage"), (Join-Path $roaming "discord\Cookies"),
        (Join-Path $roaming "Spotify\Users"), (Join-Path $roaming "Zoom\data")
    )
    foreach ($package in @(Get-ChildItem -LiteralPath (Join-Path $local "Packages") -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^(5319275A\.WhatsAppDesktop|4DF9E0F8\.Netflix|SpotifyAB\.SpotifyMusic|TelegramMessengerLLP\.TelegramDesktop|Facebook\.|Instagram\.|MicrosoftTeams|MSTeams)' })) {
        $appData += Join-Path $package.FullName "LocalState"
        $appData += Join-Path $package.FullName "LocalCache"
        $appData += Join-Path $package.FullName "AC\INetCookies"
    }
    foreach ($path in $appData) { Remove-PathSafe -Path $path -AllowedRoot $profile }

    # Conta conectada nos navegadores Chromium (sincronizacao), alem do que Clear-UserCaches ja remove.
    foreach ($root in @("Google\Chrome\User Data", "Microsoft\Edge\User Data", "BraveSoftware\Brave-Browser\User Data")) {
        $userData = Join-Path $local $root
        if (-not (Test-Path $userData)) { continue }
        foreach ($prof in @(Get-ChildItem -LiteralPath $userData -Directory -ErrorAction SilentlyContinue)) {
            foreach ($item in @("Account Web Data", "Account Web Data-journal", "Login Data For Account", "Login Data For Account-journal", "Sync Data", "Top Sites", "Shortcuts", "Favicons")) {
                Remove-PathSafe -Path (Join-Path $prof.FullName $item) -AllowedRoot $profile
            }
        }
    }

    # Arquivos recentes do Windows e do Office.
    foreach ($path in @((Join-Path $roaming "Microsoft\Windows\Recent"), (Join-Path $roaming "Microsoft\Office\Recent"))) {
        foreach ($item in @(Get-ChildItem -LiteralPath $path -Force -ErrorAction SilentlyContinue)) { Remove-PathSafe -Path $item.FullName -AllowedRoot $profile }
    }
    foreach ($key in @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\RecentDocs",
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\RunMRU",
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\TypedPaths",
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\WordWheelQuery",
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\ComDlg32\OpenSavePidlMRU",
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\ComDlg32\LastVisitedPidlMRU"
    )) { Remove-Item -Path $key -Recurse -Force -ErrorAction SilentlyContinue }
    foreach ($office in @(Get-ChildItem "HKCU:\Software\Microsoft\Office" -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^\d+\.\d+$' })) {
        foreach ($mru in @(Get-ChildItem $office.PSPath -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -in @("File MRU", "Place MRU", "User MRU") })) {
            Remove-Item -Path $mru.PSPath -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    # Senhas salvas no Windows (Gerenciador de Credenciais) do usuario cliente.
    foreach ($line in @(Invoke-NativeQuiet cmdkey.exe @("/list"))) {
        if ($line -match '^\s*(Destino|Target):\s*(.+)$') {
            $target = $Matches[2].Trim() -replace '^(LegacyGeneric|Domain|Generic|WindowsLive):target=', ''
            if ($target -and $target -notmatch 'virtualapp/didlogical|WindowsLive:') { [void](Invoke-NativeQuiet cmdkey.exe @("/delete:$target")) }
        }
    }

    try { Clear-RecycleBin -Force -ErrorAction Stop } catch { }
    try { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::Clear() } catch { }
    Remove-PathSafe -Path (Join-Path $UserDataRoot "PrintJobs") -AllowedRoot $profile
    Write-AgentLog "Rastros do cliente removidos (apps, conta do navegador, recentes, credenciais, lixeira)."
}

#endregion

#region Impressao: revisao em processo proprio (o loop do agente nao para)

function Open-PrintListener {
    param([int]$Attempts = 1)
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 18955)
    for ($attempt = 1; ; $attempt++) {
        try { $listener.Start(); break }
        catch { if ($attempt -ge $Attempts) { throw }; Start-Sleep -Seconds 1 }
    }
    # Porta nao herdavel: telas e o cmd de reinicio abertos por este agente herdavam o socket
    # e seguravam a porta 18955, impedindo o proximo agente de abrir a impressora virtual.
    try {
        if (-not ("LhmNet.Handle" -as [type])) {
            Add-Type -Namespace LhmNet -Name Handle -MemberDefinition '[DllImport("kernel32.dll", SetLastError = true)] public static extern bool SetHandleInformation(IntPtr hObject, uint dwMask, uint dwFlags);'
        }
        [void][LhmNet.Handle]::SetHandleInformation($listener.Server.Handle, 1, 0)
    } catch { Write-AgentLog "Nao foi possivel marcar a porta da impressora como nao herdavel: $($_.Exception.Message)" }
    return $listener
}

function Start-PrintReviewProcess {
    param([string]$Path)
    return Start-AgentChild -ChildAction "PrintReview" -Extra @("-JobPath", "`"$Path`"")
}

function Show-PrintError {
    param([string]$Message)
    # Popup com prazo e sempre na frente: o loop do agente chama esta funcao, e um MessageBox escondido
    # atras de outra janela travava o agente inteiro (sem impressao, monitor nem bloqueio no fim do tempo).
    try { [void](New-Object -ComObject WScript.Shell).Popup("Não foi possível concluir a impressão. Nada foi cobrado. Avise o atendente se precisar.`n`n$Message", 20, "Impressão Nexcafé", 0x10 + 0x40000) } catch { }
}

function Invoke-PrintReview {
    param([string]$Path)
    $config = Load-Config
    try {
        if (-not (Test-Path -LiteralPath $Path)) { throw "Documento nao encontrado." }
        $pages = Get-PdfPageCount -Path $Path
        if ($pages -lt 1 -or $pages -gt 200) { throw "Numero de paginas fora do limite (1 a 200)." }
        $command = Get-AgentCommand -Config $config
        if ($command.locked -or -not $command.session) { throw "A estação não está liberada. Imprima durante o seu tempo de uso." }
        $sessionId = [string]$command.session.id
        $choice = Show-PdfPrintReview -Path $Path -Pages $pages -BwCents ($pages * [int]$command.printBWCents) -ColorCents ($pages * [int]$command.printColorCents)
        if (-not $choice) {
            Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
            Write-AgentLog "Impressao cancelada pelo cliente: $pages pagina(s)."
            return
        }
        $current = Get-AgentCommand -Config $config
        if ($current.locked -or -not $current.session -or [string]$current.session.id -ne $sessionId) { throw "O tempo terminou antes da confirmação. Imprima novamente em uma sessão ativa." }
        # O caixa imprime na impressora escolhida no Atendimento e so cobra se a impressao sair.
        $color = ($choice -eq "color")
        $base = "$($config.ServerUrl)".TrimEnd("/")
        $id = [Uri]::EscapeDataString($config.MachineId)
        $uri = "$base/api/client/$id/print-upload?pages=$pages&color=$(if ($color) { '1' } else { '0' })"
        try {
            $result = Invoke-RestMethod -Method Post -Uri $uri -Headers @{ Authorization = "Bearer $($config.AgentToken)" } -ContentType "application/pdf" -InFile $Path -TimeoutSec 240
        } catch { throw (Get-ApiMessage -ErrorRecord $_) }
        Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
        Write-AgentLog "Impresso pelo caixa em $($result.printer): $($result.pages) pagina(s), $(if ($color) { 'colorido' } else { 'preto e branco' })."
    } catch {
        Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
        Write-AgentLog "Falha na impressao: $($_.Exception.Message)"
        Show-PrintError -Message $_.Exception.Message
    }
}

#endregion

function Invoke-AgentRun {
    $runMutex = New-Object System.Threading.Mutex($false, "Local\LanHouseManagerAgentRun")
    if (-not $runMutex.WaitOne(0)) {
        Write-AgentLog "Ja existe um agente ativo nesta sessao; encerrando esta copia."
        return
    }
    $config = Load-Config
    if ($config.ProtectedUsers -notcontains $env:USERNAME) {
        Write-AgentLog "Usuario atual '$env:USERNAME' nao esta na lista protegida; agente nao inicia."
        return
    }
    if (-not $config.AgentToken) { throw "Agente antigo sem vinculacao. Reinstale pelo painel." }
    $state = Load-State
    # Fecha telas da versao anterior ANTES de abrir a porta da impressora virtual: processos filhos
    # herdam o socket de escuta e seguram a porta enquanto estiverem abertos.
    Stop-AgentUiProcesses
    $printListener = $null
    # Toda impressao passa pela "Impressao Nexcafe" e e impressa pelo caixa.
    Add-OrUpdateProperty -Object $config -Name "VirtualPrinting" -Value $true
    Remove-ClientPrinterConnections
    if ($config.VirtualPrinting) {
        try {
            if (-not (Get-VirtualPrinterName)) {
                try { Install-VirtualPrintQueue } catch { }
            }
            # Ao reiniciar, o agente anterior pode levar alguns segundos para liberar a porta.
            $printListener = Open-PrintListener -Attempts 30
            try {
                if (-not (Set-VirtualPrinterDefault)) { throw "Impressora virtual nao encontrada." }
            } catch {
                Write-AgentLog "Impressão Nexcafé ativa; defina como padrao apos reiniciar: $($_.Exception.Message)"
            }
        } catch {
            if ($printListener) { $printListener.Stop(); $printListener = $null }
            $failure = $_.Exception.Message
            # Diz no painel qual processo esta segurando a porta, para o diagnostico nao depender de palpite.
            $holder = ""
            try {
                $owners = @(Get-NetTCPConnection -LocalPort 18955 -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique)
                $holder = ($owners | ForEach-Object {
                    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$_" -ErrorAction SilentlyContinue
                    if ($p) { "PID $_ $($p.Name): $([string]$p.CommandLine)" } else { "PID $_" }
                }) -join " | "
            } catch { }
            Write-AgentLog "Falha ao iniciar impressão Nexcafé: $failure $holder"
            Send-AgentEvent -Config $config -Title "Impressão indisponível" -Detail "$failure $(if ($holder) { "Porta usada por: $holder" })"
        }
    }
    $lockProcess = $null
    $overlayProcess = $null
    $lastScreenAt = [datetime]::MinValue
    $lastScriptCheck = (Get-Date).AddSeconds(-50)
    $lastFailureEvent = [datetime]::MinValue
    $nextRestoreAt = [datetime]::MinValue
    $restoreFailures = 0
    $monitorProcess = $null
    $lastCommand = $null
    $consecutiveFailures = 0
    $serverOffsetMs = 0
    $runningHash = Get-ScriptHash -Path $PSCommandPath
    # Informa no painel se o padrao das pastas foi salvo (sem isso a restauracao ignora as pastas).
    $captureInfo = if ($config.LastCapture) { "padrao salvo em $($config.LastCapture)" } else { "PADRAO NAO SALVO: reinstale pela conta Tecnico" }
    Send-AgentEvent -Config $config -Title "Agente iniciado" -Detail "$env:USERNAME; $captureInfo"

    while ($true) {
        try {
            $command = Get-AgentCommand -Config $config
            $consecutiveFailures = 0
            $lastCommand = $command
            try { $serverOffsetMs = ([datetime]::Parse($command.serverTime).ToUniversalTime() - (Get-Date).ToUniversalTime()).TotalMilliseconds } catch { }

            if ([int]$state.LastRestoreSeq -gt [int]$command.appliedRestoreSeq) {
                Send-AgentEvent -Config $config -Title "Restauracao confirmada" -Detail "Sequencia $($state.LastRestoreSeq)" -RestoreSeq ([int]$state.LastRestoreSeq)
            }
            if ([int]$state.LastRestartSeq -gt [int]$command.appliedRestartSeq) {
                Send-AgentEvent -Config $config -Title "Reinicio confirmado" -Detail "Sequencia $($state.LastRestartSeq)" -RestartSeq ([int]$state.LastRestartSeq)
            }

            if ($command.locked) {
                Stop-AgentUiProcesses -Actions @("PrintReview")
                if (-not $lockProcess -or $lockProcess.HasExited) {
                    # Falha ao abrir a tela nao pode impedir o resto do ciclo (restauracao, reinicio).
                    try { $lockProcess = Start-LockScreenProcess; Start-Sleep -Milliseconds 500 }
                    catch { Write-AgentLog "Falha ao abrir a tela de bloqueio: $($_.Exception.Message)"; Send-AgentEvent -Config $config -Title "Falha ao abrir bloqueio" -Detail $_.Exception.Message }
                }
            }

            # Confirma ao servidor que a estacao abriu; sem isso o painel fica em "Liberando".
            if (-not $command.locked -and $command.session -and [string]$command.openedSessionId -ne [string]$command.session.id) {
                Send-AgentEvent -Config $config -Title "Acesso liberado" -Detail "Sessao aberta na estacao" -OpenedSessionId ([string]$command.session.id)
            }

            if ($command.locked -or -not $command.session) {
                if ($overlayProcess) {
                    try {
                        if (-not $overlayProcess.HasExited -and -not $overlayProcess.WaitForExit(5000)) {
                            $overlayProcess.Kill()
                        }
                    } catch { }
                    $overlayProcess = $null
                }
            } elseif (-not $overlayProcess -or $overlayProcess.HasExited) {
                $overlayProcess = Start-OverlayProcess
            }

            if ([long]$command.monitorUntil -gt (Get-EpochMs) -and (-not $monitorProcess -or $monitorProcess.HasExited)) {
                $monitorProcess = Start-MonitorProcess
            }

            if (((Get-Date) - $lastScriptCheck).TotalSeconds -ge 60) {
                $lastScriptCheck = Get-Date
                Remove-ClientPrinterConnections
                # Porta estava ocupada na partida: tenta de novo, para a impressao voltar sem reiniciar.
                if (-not $printListener -and $config.VirtualPrinting) {
                    try {
                        $printListener = Open-PrintListener
                        Send-AgentEvent -Config $config -Title "Impressão disponível" -Detail "Porta da Impressão Nexcafé liberada"
                    } catch { $printListener = $null }
                }
                if ($printListener) { try { [void](Set-VirtualPrinterDefault) } catch { Write-AgentLog "Falha ao manter impressora padrao: $($_.Exception.Message)" } }
                if (Update-AgentScriptIfNeeded -Config $config -ServerHash ([string]$command.scriptHash) -RunningHash $runningHash) { break }
            }

            if (-not $command.locked) {
                if ($printListener -and $command.session) {
                    while ($printListener.Pending()) {
                        try {
                            Receive-VirtualPrintJob -Listener $printListener -Config $config -SessionId ([string]$command.session.id) -PrintBW ([int]$command.printBWCents) -PrintColor ([int]$command.printColorCents)
                        } catch {
                            Write-AgentLog "Falha na impressão virtual: $($_.Exception.Message)"
                            Show-PrintError -Message $_.Exception.Message
                        }
                    }
                }
            }

            # O servidor e quem sabe se a limpeza ja foi feita: se ele ja registrou esta sequencia, so atualiza o estado local.
            # Sem isso, um agente reiniciado repetia a limpeza e podia apagar arquivos de um cliente que acabou de entrar.
            if ([int]$command.appliedRestoreSeq -ge [int]$command.restoreSeq -and [int]$state.LastRestoreSeq -lt [int]$command.restoreSeq) {
                $state.LastRestoreSeq = [int]$command.restoreSeq
                Save-State -State $state
            }
            if ([int]$command.restoreSeq -gt [int]$state.LastRestoreSeq -and [int]$command.restoreSeq -gt [int]$command.appliedRestoreSeq -and (Get-Date) -ge $nextRestoreAt) {
                $restoreDone = $false
                try {
                    Invoke-AgentRestore
                    $restoreDone = $true
                } catch {
                    $restoreFailures++
                    Write-AgentLog "Falha na restauracao ($restoreFailures, nova tentativa em 15s): $($_.Exception.Message)"
                    if ($restoreFailures -eq 1) { Send-AgentEvent -Config $config -Title "Falha na restauracao" -Detail $_.Exception.Message }
                    $nextRestoreAt = (Get-Date).AddSeconds(15)
                    # Arquivo travado por 1 minuto: reinicia UMA vez por limpeza (a limpeza roda de novo no login).
                    if ($restoreFailures -ge 4 -and [int]$state.RebootForRestoreSeq -ne [int]$command.restoreSeq) {
                        Add-OrUpdateProperty -Object $state -Name "RebootForRestoreSeq" -Value ([int]$command.restoreSeq)
                        Save-State -State $state
                        Send-AgentEvent -Config $config -Title "Limpeza travada: reiniciando" -Detail $_.Exception.Message
                        shutdown.exe /r /t 10 /c "LanHouseManager: reiniciando para concluir a limpeza."
                        break
                    }
                    if ($restoreFailures -eq 8) { Send-AgentEvent -Config $config -Title "Limpeza ainda incompleta" -Detail "Verifique a estacao: $($_.Exception.Message)" }
                }
                if ($restoreDone) {
                    $restoreFailures = 0
                    $state.LastRestoreSeq = [int]$command.restoreSeq
                    Save-State -State $state
                    Send-AgentEvent -Config $config -Title "Restauracao executada" -Detail "Sequencia $($command.restoreSeq)" -RestoreSeq ([int]$command.restoreSeq)
                }
            }

            if ([int]$command.restartSeq -gt [int]$state.LastRestartSeq) {
                $state.LastRestartSeq = [int]$command.restartSeq
                Save-State -State $state
                Send-AgentEvent -Config $config -Title "Reinicio solicitado" -Detail "Sequencia $($command.restartSeq)" -RestartSeq ([int]$command.restartSeq)
                shutdown.exe /r /t 5 /c "LanHouseManager: atendimento encerrado."
                break
            }

            if ([int]$command.shutdownSeq -gt [int]$state.LastShutdownSeq) {
                $state.LastShutdownSeq = [int]$command.shutdownSeq
                Save-State -State $state
                Send-AgentEvent -Config $config -Title "Desligamento solicitado" -Detail "Sequencia $($command.shutdownSeq)" -ShutdownSeq ([int]$command.shutdownSeq)
                shutdown.exe /s /t 5 /c "LanHouseManager: maquina desligada pelo atendente."
                break
            }

        } catch {
            Write-AgentLog "Falha no loop do agente: $($_.Exception.Message)"
            # Reinstalacao gera um token novo: recarrega a configuracao e reinicia o agente com ele.
            try {
                $fresh = Load-Config
                if ($fresh.AgentToken -and $fresh.AgentToken -ne $config.AgentToken) {
                    Write-AgentLog "Nova vinculacao detectada; reiniciando o agente."
                    Restart-AgentRun
                    break
                }
            } catch { }
            # Sem servidor: bloqueia sozinho quando o tempo contratado acaba.
            if ($lastCommand -and -not $lastCommand.locked -and $lastCommand.session) {
                try {
                    $endsAt = [datetime]::Parse($lastCommand.session.endsAt).ToUniversalTime()
                    if ((Get-Date).ToUniversalTime().AddMilliseconds($serverOffsetMs) -ge $endsAt -and (-not $lockProcess -or $lockProcess.HasExited)) {
                        Write-AgentLog "Tempo encerrado sem contato com o servidor; bloqueando a estacao."
                        $lockProcess = Start-LockScreenProcess
                    }
                } catch { }
            }
            # Falha isolada (rede) nao vai para o painel; so se repetir em seguida.
            $consecutiveFailures++
            if ($consecutiveFailures -ge 3 -and ((Get-Date) - $lastFailureEvent).TotalSeconds -ge 30) {
                Send-AgentEvent -Config $config -Title "Falha no agente" -Detail "$consecutiveFailures falhas seguidas: $($_.Exception.Message)"
                $lastFailureEvent = Get-Date
            }
        }

        Start-Sleep -Seconds 2
    }
    if ($printListener) { $printListener.Stop() }
}

function Invoke-Overlay {
    $overlayMutex = New-Object System.Threading.Mutex($false, "Local\LanHouseManagerOverlay")
    if (-not $overlayMutex.WaitOne(0)) { return }
    $config = Load-Config

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    Add-Type -ReferencedAssemblies @("System.Windows.Forms", "System.Drawing", "System") -TypeDefinition @'
using System.Windows.Forms;
public class LanHouseOverlayForm : Form {
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override System.Windows.Forms.CreateParams CreateParams {
        get {
            var parameters = base.CreateParams;
            parameters.ExStyle |= 0x08000000 | 0x00000080;
            return parameters;
        }
    }
}
'@
    [System.Windows.Forms.Application]::EnableVisualStyles()

    $dark = [Drawing.Color]::FromArgb(13, 20, 28)
    $accent = [Drawing.Color]::FromArgb(10, 190, 170)
    $danger = [Drawing.Color]::FromArgb(230, 120, 110)
    $muted = [Drawing.Color]::FromArgb(164, 176, 192)
    $white = [Drawing.Color]::White

    $form = New-Object LanHouseOverlayForm
    $form.FormBorderStyle = "None"
    $form.StartPosition = "Manual"
    $form.TopMost = $true
    $form.ShowInTaskbar = $false
    $form.BackColor = $dark
    $panelWidth = 300
    $panelHeight = 94
    $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    $form.ClientSize = New-Object Drawing.Size($panelWidth, $panelHeight)
    $form.Opacity = 0.94
    $form.Location = New-Object Drawing.Point(($area.Right - $panelWidth - 12), ($area.Bottom - $panelHeight - 12))

    $script:OverlaySession = $null
    $script:OverlayValueCents = 0
    $script:OverlayTimeCents = 0
    $script:OverlayPrintCents = 0
    $script:OverlayExtrasCents = 0
    $script:OverlayOffset = 0
    $script:OverlayWarn5 = $false
    $script:OverlayWarn1 = $false

    $timeLabel = New-Object System.Windows.Forms.Label
    $timeLabel.Text = "--:--"
    $timeLabel.Font = New-Object Drawing.Font("Segoe UI", 20, [Drawing.FontStyle]::Bold)
    $timeLabel.ForeColor = $white
    $timeLabel.BackColor = [Drawing.Color]::Transparent
    $timeLabel.TextAlign = "MiddleLeft"
    $timeLabel.Location = New-Object Drawing.Point(12, 4)
    $timeLabel.Size = New-Object Drawing.Size(120, 40)
    $form.Controls.Add($timeLabel)

    $totalLabel = New-Object System.Windows.Forms.Label
    $totalLabel.Text = "Total R$ 0,00"
    $totalLabel.Font = New-Object Drawing.Font("Segoe UI", 12, [Drawing.FontStyle]::Bold)
    $totalLabel.ForeColor = $accent
    $totalLabel.BackColor = [Drawing.Color]::Transparent
    $totalLabel.TextAlign = "MiddleRight"
    $totalLabel.Location = New-Object Drawing.Point(128, 8)
    $totalLabel.Size = New-Object Drawing.Size(($panelWidth - 140), 32)
    $form.Controls.Add($totalLabel)

    $breakLabel = New-Object System.Windows.Forms.Label
    $breakLabel.Text = "Tempo R$ 0,00 + Impressoes R$ 0,00"
    $breakLabel.Font = New-Object Drawing.Font("Segoe UI", 9)
    $breakLabel.ForeColor = $muted
    $breakLabel.BackColor = [Drawing.Color]::Transparent
    $breakLabel.TextAlign = "MiddleLeft"
    $breakLabel.Location = New-Object Drawing.Point(12, 46)
    $breakLabel.Size = New-Object Drawing.Size(($panelWidth - 24), 22)
    $form.Controls.Add($breakLabel)

    $hintLabel = New-Object System.Windows.Forms.Label
    $hintLabel.Text = "Clique aqui para encerrar seu acesso"
    $hintLabel.Font = New-Object Drawing.Font("Segoe UI", 8, [Drawing.FontStyle]::Underline)
    $hintLabel.ForeColor = $accent
    $hintLabel.BackColor = [Drawing.Color]::Transparent
    $hintLabel.Location = New-Object Drawing.Point(12, 68)
    $hintLabel.Size = New-Object Drawing.Size(($panelWidth - 24), 20)
    $form.Controls.Add($hintLabel)

    # Cantos arredondados e arrastar para outra posicao, sem roubar o foco.
    $radius = 14
    $shape = New-Object System.Drawing.Drawing2D.GraphicsPath
    $shape.AddArc(0, 0, $radius, $radius, 180, 90)
    $shape.AddArc(($panelWidth - $radius), 0, $radius, $radius, 270, 90)
    $shape.AddArc(($panelWidth - $radius), ($panelHeight - $radius), $radius, $radius, 0, 90)
    $shape.AddArc(0, ($panelHeight - $radius), $radius, $radius, 90, 90)
    $shape.CloseAllFigures()
    $form.Region = New-Object System.Drawing.Region($shape)
    $script:OverlayDrag = $null
    $dragDown = { $script:OverlayDrag = [System.Windows.Forms.Cursor]::Position; $script:OverlayDragOrigin = $form.Location }
    $dragMove = {
        if ($script:OverlayDrag) {
            $p = [System.Windows.Forms.Cursor]::Position
            $form.Location = New-Object Drawing.Point(($script:OverlayDragOrigin.X + $p.X - $script:OverlayDrag.X), ($script:OverlayDragOrigin.Y + $p.Y - $script:OverlayDrag.Y))
        }
    }
    # Clique sem arrastar (menos de 6 px) abre a confirmacao para o cliente encerrar o proprio acesso.
    $dragUp = {
        $start = $script:OverlayDrag
        $script:OverlayDrag = $null
        if (-not $start) { return }
        $p = [System.Windows.Forms.Cursor]::Position
        if ([math]::Abs($p.X - $start.X) + [math]::Abs($p.Y - $start.Y) -lt 6) { & $askEnd }
    }
    $askEnd = {
        if (-not $script:OverlaySession -or $script:OverlayAsking) { return }
        $script:OverlayAsking = $true
        try {
            $dialog = New-Object System.Windows.Forms.Form
            $dialog.Text = "Encerrar acesso"
            $dialog.FormBorderStyle = "FixedDialog"; $dialog.MaximizeBox = $false; $dialog.MinimizeBox = $false
            $dialog.StartPosition = "CenterScreen"; $dialog.TopMost = $true; $dialog.ShowInTaskbar = $false
            $dialog.ClientSize = New-Object Drawing.Size(420, 210)
            $dialog.BackColor = $dark; $dialog.ForeColor = $white
            $title = New-Object System.Windows.Forms.Label
            $title.Text = "Deseja encerrar seu acesso agora?"
            $title.Font = New-Object Drawing.Font("Segoe UI", 14, [Drawing.FontStyle]::Bold)
            $title.Location = New-Object Drawing.Point(20, 18); $title.Size = New-Object Drawing.Size(380, 30)
            $info = New-Object System.Windows.Forms.Label
            $info.Text = "Tempo: $($timeLabel.Text)    Total: " + ("R$ {0:N2}" -f ($script:OverlayValueCents / 100)) + "`r`nO valor fica para pagar no caixa. Salve seus arquivos antes: ao encerrar, a máquina é limpa."
            $info.Font = New-Object Drawing.Font("Segoe UI", 10); $info.ForeColor = $muted
            $info.Location = New-Object Drawing.Point(20, 56); $info.Size = New-Object Drawing.Size(380, 70)
            $yes = New-Object System.Windows.Forms.Button
            $yes.Text = "Encerrar meu acesso"; $yes.FlatStyle = "Flat"; $yes.FlatAppearance.BorderSize = 0
            $yes.BackColor = [Drawing.Color]::FromArgb(200, 55, 60); $yes.ForeColor = $white
            $yes.Font = New-Object Drawing.Font("Segoe UI", 11, [Drawing.FontStyle]::Bold)
            $yes.Location = New-Object Drawing.Point(20, 142); $yes.Size = New-Object Drawing.Size(185, 46)
            $yes.DialogResult = [System.Windows.Forms.DialogResult]::Yes
            $no = New-Object System.Windows.Forms.Button
            $no.Text = "Continuar usando"; $no.FlatStyle = "Flat"; $no.FlatAppearance.BorderSize = 0
            $no.BackColor = $accent; $no.ForeColor = $dark
            $no.Font = New-Object Drawing.Font("Segoe UI", 11, [Drawing.FontStyle]::Bold)
            $no.Location = New-Object Drawing.Point(215, 142); $no.Size = New-Object Drawing.Size(185, 46)
            $no.DialogResult = [System.Windows.Forms.DialogResult]::No
            $dialog.Controls.AddRange(@($title, $info, $yes, $no))
            $dialog.AcceptButton = $no; $dialog.CancelButton = $no
            if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::Yes) { return }
            try {
                $base = "$($config.ServerUrl)".TrimEnd("/")
                $id = [Uri]::EscapeDataString($config.MachineId)
                $body = [System.Text.Encoding]::UTF8.GetBytes((@{ sessionId = [string]$script:OverlaySession.id } | ConvertTo-Json))
                Invoke-RestMethod -Method Post -Uri "$base/api/client/$id/end" -Headers @{ Authorization = "Bearer $($config.AgentToken)" } -ContentType "application/json; charset=utf-8" -Body $body -TimeoutSec 10 | Out-Null
                # O agente principal mostra a tela de bloqueio com o valor a pagar em seguida.
                $script:OverlaySession = $null
                if ($script:OverlayTimer) { $script:OverlayTimer.Stop() }
                $form.Close()
            } catch {
                [System.Windows.Forms.MessageBox]::Show("Não foi possível encerrar agora. Chame o atendente.", "Encerrar acesso", "OK", "Warning") | Out-Null
            }
        } finally { $script:OverlayAsking = $false }
    }
    foreach ($control in @($form, $timeLabel, $totalLabel, $breakLabel, $hintLabel)) {
        $control.Cursor = [System.Windows.Forms.Cursors]::SizeAll
        $control.Add_MouseDown($dragDown); $control.Add_MouseMove($dragMove); $control.Add_MouseUp($dragUp)
    }

    $load = {
        try {
            $command = Get-AgentCommand -Config $config
            $script:OverlayOffset = ([datetime]::Parse($command.serverTime).ToUniversalTime() - (Get-Date).ToUniversalTime()).TotalMilliseconds
            if ($command.locked -or -not $command.session) {
                $script:OverlaySession = $null
                if ($script:OverlayTimer) { $script:OverlayTimer.Stop() }
                if ($form.Visible) { $form.Close() }
                return
            }
            $script:OverlaySession = $command.session
            $script:OverlayValueCents = [int]$command.valueCents
            $script:OverlayTimeCents = [int]$command.timeCents
            $script:OverlayPrintCents = [int]$command.printCents
            $script:OverlayExtrasCents = [int]$command.extrasCents
        } catch { }
    }

    & $load
    if (-not $script:OverlaySession) { return }

    $tick = {
        if (-not $script:OverlaySession) { return }
        $now = (Get-Date).ToUniversalTime().AddMilliseconds($script:OverlayOffset)
        # Tempo livre: mostra o tempo usado (conta do zero), sem avisos de fim.
        $openSession = [bool]$script:OverlaySession.open
        if ($openSession) {
            $total = [int][math]::Floor([math]::Max(0, ($now - [datetime]::Parse($script:OverlaySession.startedAt).ToUniversalTime()).TotalSeconds))
        } else {
            $end = [datetime]::Parse($script:OverlaySession.endsAt).ToUniversalTime()
            $total = [int][math]::Floor([math]::Max(0, ($end - $now).TotalSeconds))
        }
        $h = [int][math]::Floor($total / 3600); $m = [int][math]::Floor(($total % 3600) / 60); $sec = $total % 60
        $timeLabel.Text = if ($h -gt 0) { "{0:00}:{1:00}:{2:00}" -f $h, $m, $sec } else { "{0:00}:{1:00}" -f $m, $sec }
        $timeLabel.ForeColor = if (-not $openSession -and $total -le 300) { $danger } else { $white }
        if ($openSession) { $script:OverlayWarn5 = $true; $script:OverlayWarn1 = $true }
        if (-not $script:OverlayWarn5 -and $total -le 300 -and $total -gt 60) { $script:OverlayWarn5 = $true; try { [System.Media.SystemSounds]::Exclamation.Play() } catch { } }
        if (-not $script:OverlayWarn1 -and $total -le 60) { $script:OverlayWarn1 = $true; try { [System.Media.SystemSounds]::Hand.Play() } catch { } }
        $totalLabel.Text = "Total " + ("R$ {0:N2}" -f ($script:OverlayValueCents / 100))
        $breakLabel.Text = if ($script:OverlayExtrasCents -gt 0) { ("Tempo R$ {0:N2} + Impr. R$ {1:N2} + Consumo R$ {2:N2}") -f ($script:OverlayTimeCents / 100), ($script:OverlayPrintCents / 100), ($script:OverlayExtrasCents / 100) } else { ("Tempo R$ {0:N2} + Impressões R$ {1:N2}") -f ($script:OverlayTimeCents / 100), ($script:OverlayPrintCents / 100) }
        if (((Get-Date).ToUniversalTime() - $script:OverlayLastPoll).TotalSeconds -ge 3) {
            $script:OverlayLastPoll = (Get-Date).ToUniversalTime()
            & $load
        }
    }

    $script:OverlayLastPoll = (Get-Date).ToUniversalTime()
    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 1000
    $script:OverlayTimer = $timer
    $timer.Add_Tick($tick)
    $timer.Start()
    $form.Show()
    [System.Windows.Forms.Application]::Run($form)
}

function New-RoundedRegion {
    param([int]$Width, [int]$Height, [int]$Radius)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $Radius * 2
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc(($Width - $d - 1), 0, $d, $d, 270, 90)
    $path.AddArc(($Width - $d - 1), ($Height - $d - 1), $d, $d, 0, 90)
    $path.AddArc(0, ($Height - $d - 1), $d, $d, 90, 90)
    $path.CloseAllFigures()
    return New-Object System.Drawing.Region($path)
}

function New-LockBackground {
    param([int]$Width, [int]$Height)
    $bitmap = New-Object System.Drawing.Bitmap([math]::Max(1, $Width), [math]::Max(1, $Height))
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $rect = New-Object System.Drawing.Rectangle(0, 0, $bitmap.Width, $bitmap.Height)
    $gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [Drawing.Color]::FromArgb(8, 30, 82), [Drawing.Color]::FromArgb(24, 104, 204), [single]35)
    $g.FillRectangle($gradient, $rect)
    $soft = New-Object System.Drawing.SolidBrush([Drawing.Color]::FromArgb(16, 255, 255, 255))
    $g.FillEllipse($soft, [int]($Width * 0.62), [int](-$Height * 0.25), [int]($Height * 0.9), [int]($Height * 0.9))
    $g.FillEllipse($soft, [int](-$Height * 0.3), [int]($Height * 0.55), [int]($Height * 0.8), [int]($Height * 0.8))
    $soft.Dispose(); $gradient.Dispose(); $g.Dispose()
    return $bitmap
}

function New-LockInput {
    param([object]$Parent, [int]$X, [int]$Y, [int]$Width, [bool]$Password)
    $box = New-Object System.Windows.Forms.Panel
    $box.BackColor = [Drawing.Color]::FromArgb(241, 245, 249)
    $box.Location = New-Object Drawing.Point($X, $Y)
    $box.Size = New-Object Drawing.Size($Width, 46)
    $box.Region = New-RoundedRegion -Width $Width -Height 46 -Radius 8
    $text = New-Object System.Windows.Forms.TextBox
    $text.BorderStyle = "None"
    $text.BackColor = $box.BackColor
    $text.ForeColor = [Drawing.Color]::FromArgb(15, 23, 42)
    $text.Font = New-Object Drawing.Font("Segoe UI", 13)
    $text.Location = New-Object Drawing.Point(14, 11)
    $text.Size = New-Object Drawing.Size(($Width - 28), 26)
    $text.UseSystemPasswordChar = $Password
    $box.Controls.Add($text)
    $box.Add_Click({ $this.Controls[0].Focus() })
    $Parent.Controls.Add($box)
    return $text
}

function New-ClientAccessCard {
    param([object]$Form, [object]$Config, [int]$CardWidth, [int]$CardHeight)

    $navy = [Drawing.Color]::FromArgb(15, 23, 42)
    $muted = [Drawing.Color]::FromArgb(100, 116, 139)
    $blue = [Drawing.Color]::FromArgb(29, 99, 237)
    $blueHover = [Drawing.Color]::FromArgb(37, 117, 252)
    $blueSoft = [Drawing.Color]::FromArgb(219, 234, 254)
    $line = [Drawing.Color]::FromArgb(226, 232, 240)
    $danger = [Drawing.Color]::FromArgb(220, 38, 38)
    $paleText = [Drawing.Color]::FromArgb(203, 219, 245)
    $white = [Drawing.Color]::White
    $transparent = [Drawing.Color]::Transparent

    $Form.BackgroundImage = New-LockBackground -Width $Form.ClientSize.Width -Height $Form.ClientSize.Height
    $Form.BackgroundImageLayout = "Stretch"

    $outer = New-Object System.Windows.Forms.TableLayoutPanel
    $outer.Dock = "Fill"
    $outer.BackColor = $transparent
    $outer.ColumnCount = 3
    $outer.RowCount = 3
    $outer.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Percent, 50))) | Out-Null
    $outer.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Absolute, $CardWidth))) | Out-Null
    $outer.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle([System.Windows.Forms.SizeType]::Percent, 50))) | Out-Null
    $outer.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Percent, 50))) | Out-Null
    $outer.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Absolute, $CardHeight))) | Out-Null
    $outer.RowStyles.Add((New-Object System.Windows.Forms.RowStyle([System.Windows.Forms.SizeType]::Percent, 50))) | Out-Null
    $Form.Controls.Add($outer)

    $cardPanel = New-Object System.Windows.Forms.Panel
    $cardPanel.BackColor = $white
    $cardPanel.Dock = "Fill"
    $cardPanel.Margin = New-Object System.Windows.Forms.Padding(0)
    $cardPanel.Region = New-RoundedRegion -Width $CardWidth -Height $CardHeight -Radius 18
    $outer.Controls.Add($cardPanel, 1, 1)

    $footer = New-Object System.Windows.Forms.Label
    $footer.Text = "Sem cadastro? Procure o atendente no balcão."
    $footer.Font = New-Object Drawing.Font("Segoe UI", 11)
    $footer.ForeColor = $paleText
    $footer.BackColor = $transparent
    $footer.TextAlign = "TopCenter"
    $footer.Dock = "Top"
    $footer.Height = 60
    $footer.Padding = New-Object System.Windows.Forms.Padding(0, 22, 0, 0)
    $outer.Controls.Add($footer, 1, 2)

    # Topo da tela: estacao a esquerda, relogio a direita (dentro do layout, sem depender da ordem das camadas).
    $top = New-Object System.Windows.Forms.Panel
    $top.BackColor = $transparent
    $top.Dock = "Fill"
    $top.Margin = New-Object System.Windows.Forms.Padding(0)
    $top.Size = New-Object Drawing.Size($Form.ClientSize.Width, 130)
    $outer.Controls.Add($top, 0, 0)
    $outer.SetColumnSpan($top, 3)

    $brand = New-Object System.Windows.Forms.Label
    $brand.Text = "LAN HOUSE"
    $brand.Font = New-Object Drawing.Font("Segoe UI", 10, [Drawing.FontStyle]::Bold)
    $brand.ForeColor = [Drawing.Color]::FromArgb(147, 186, 245)
    $brand.BackColor = $transparent
    $brand.AutoSize = $true
    $brand.Location = New-Object Drawing.Point(50, 30)
    $top.Controls.Add($brand)

    $station = New-Object System.Windows.Forms.Label
    $station.Text = if ($Config.MachineName) { [string]$Config.MachineName } else { "Estação" }
    $station.Font = New-Object Drawing.Font("Segoe UI", 22, [Drawing.FontStyle]::Bold)
    $station.ForeColor = $white
    $station.BackColor = $transparent
    $station.AutoSize = $true
    $station.Location = New-Object Drawing.Point(46, 50)
    $top.Controls.Add($station)

    $clock = New-Object System.Windows.Forms.Label
    $clock.Font = New-Object Drawing.Font("Segoe UI Light", 40)
    $clock.ForeColor = $white
    $clock.BackColor = $transparent
    $clock.TextAlign = "TopRight"
    $clock.Anchor = "Top, Right"
    $clock.Size = New-Object Drawing.Size(360, 72)
    $clock.Location = New-Object Drawing.Point(($top.Width - 408), 20)
    $top.Controls.Add($clock)

    $date = New-Object System.Windows.Forms.Label
    $date.Font = New-Object Drawing.Font("Segoe UI", 12)
    $date.ForeColor = $paleText
    $date.BackColor = $transparent
    $date.TextAlign = "TopRight"
    $date.Anchor = "Top, Right"
    $date.Size = New-Object Drawing.Size(360, 26)
    $date.Location = New-Object Drawing.Point(($top.Width - 408), 92)
    $top.Controls.Add($date)

    $culture = [Globalization.CultureInfo]::GetCultureInfo("pt-BR")
    $updateClock = {
        $now = Get-Date
        $clock.Text = $now.ToString("HH:mm", $culture)
        $dateText = $now.ToString("dddd, d 'de' MMMM", $culture)
        $date.Text = $dateText.Substring(0, 1).ToUpper() + $dateText.Substring(1)
    }.GetNewClosure()
    & $updateClock
    # Lista vazia conta como falso no PowerShell: testar $null, senao o relogio nunca atualiza.
    if ($null -ne $script:ClockUpdaters) { [void]$script:ClockUpdaters.Add($updateClock) }

    # Cartao central.
    $left = 44
    $contentWidth = $CardWidth - ($left * 2)

    $iconCircle = New-Object System.Windows.Forms.Panel
    $iconCircle.BackColor = $blueSoft
    $iconCircle.Location = New-Object Drawing.Point($left, 38)
    $iconCircle.Size = New-Object Drawing.Size(56, 56)
    $iconCircle.Region = New-RoundedRegion -Width 56 -Height 56 -Radius 28
    $cardPanel.Controls.Add($iconCircle)

    $icon = New-Object System.Windows.Forms.Label
    $icon.Text = [string][char]0xE72E
    $icon.Font = New-Object Drawing.Font("Segoe MDL2 Assets", 20)
    $icon.ForeColor = $blue
    $icon.BackColor = $transparent
    $icon.TextAlign = "MiddleCenter"
    $icon.Dock = "Fill"
    $iconCircle.Controls.Add($icon)

    $title = New-Object System.Windows.Forms.Label
    $title.Text = "Estação bloqueada"
    $title.Font = New-Object Drawing.Font("Segoe UI", 22, [Drawing.FontStyle]::Bold)
    $title.ForeColor = $navy
    $title.BackColor = $transparent
    $title.Location = New-Object Drawing.Point(($left - 3), 106)
    $title.Size = New-Object Drawing.Size($contentWidth, 42)
    $cardPanel.Controls.Add($title)

    $messageLabel = New-Object System.Windows.Forms.Label
    $messageLabel.Text = "Aguardando liberação pelo atendente"
    $messageLabel.Font = New-Object Drawing.Font("Segoe UI", 11.5)
    $messageLabel.ForeColor = $muted
    $messageLabel.BackColor = $transparent
    $messageLabel.Location = New-Object Drawing.Point($left, 150)
    $messageLabel.Size = New-Object Drawing.Size($contentWidth, 26)
    $messageLabel.Name = "MessageLabel"
    $cardPanel.Controls.Add($messageLabel)

    $separator = New-Object System.Windows.Forms.Panel
    $separator.BackColor = $line
    $separator.Location = New-Object Drawing.Point($left, 196)
    $separator.Size = New-Object Drawing.Size($contentWidth, 1)
    $cardPanel.Controls.Add($separator)

    $section = New-Object System.Windows.Forms.Label
    $section.Text = "Já tem cadastro? Entre com seu login"
    $section.Font = New-Object Drawing.Font("Segoe UI", 11, [Drawing.FontStyle]::Bold)
    $section.ForeColor = $navy
    $section.BackColor = $transparent
    $section.Location = New-Object Drawing.Point($left, 214)
    $section.Size = New-Object Drawing.Size($contentWidth, 24)
    $cardPanel.Controls.Add($section)

    $loginCaption = New-Object System.Windows.Forms.Label
    $loginCaption.Text = "Login"
    $loginCaption.Font = New-Object Drawing.Font("Segoe UI", 9.5, [Drawing.FontStyle]::Bold)
    $loginCaption.ForeColor = $muted
    $loginCaption.BackColor = $transparent
    $loginCaption.Location = New-Object Drawing.Point($left, 250)
    $loginCaption.Size = New-Object Drawing.Size($contentWidth, 20)
    $cardPanel.Controls.Add($loginCaption)
    $loginBox = New-LockInput -Parent $cardPanel -X $left -Y 272 -Width $contentWidth -Password $false

    $passCaption = New-Object System.Windows.Forms.Label
    $passCaption.Text = "Senha"
    $passCaption.Font = New-Object Drawing.Font("Segoe UI", 9.5, [Drawing.FontStyle]::Bold)
    $passCaption.ForeColor = $muted
    $passCaption.BackColor = $transparent
    $passCaption.Location = New-Object Drawing.Point($left, 330)
    $passCaption.Size = New-Object Drawing.Size($contentWidth, 20)
    $cardPanel.Controls.Add($passCaption)
    $passBox = New-LockInput -Parent $cardPanel -X $left -Y 352 -Width $contentWidth -Password $true

    $errorLabel = New-Object System.Windows.Forms.Label
    $errorLabel.Text = ""
    $errorLabel.Font = New-Object Drawing.Font("Segoe UI", 10)
    $errorLabel.ForeColor = $danger
    $errorLabel.BackColor = $transparent
    $errorLabel.Location = New-Object Drawing.Point($left, 404)
    $errorLabel.Size = New-Object Drawing.Size($contentWidth, 22)
    $cardPanel.Controls.Add($errorLabel)

    $button = New-Object System.Windows.Forms.Button
    $button.Text = "Entrar"
    $button.Font = New-Object Drawing.Font("Segoe UI", 13, [Drawing.FontStyle]::Bold)
    $button.ForeColor = $white
    $button.BackColor = $blue
    $button.FlatStyle = "Flat"
    $button.FlatAppearance.BorderSize = 0
    $button.FlatAppearance.MouseOverBackColor = $blueHover
    $button.Location = New-Object Drawing.Point($left, 432)
    $button.Size = New-Object Drawing.Size($contentWidth, 52)
    $button.Region = New-RoundedRegion -Width $contentWidth -Height 52 -Radius 10
    $button.Cursor = [System.Windows.Forms.Cursors]::Hand
    $cardPanel.Controls.Add($button)

    $submit = {
        if ($script:LoginBusy) { return }
        $script:LoginBusy = $true
        $button.Enabled = $false
        $errorLabel.Text = ""
        try {
            $result = Invoke-ClientLogin -Config $Config -Login $loginBox.Text.Trim() -Password $passBox.Text
            $messageLabel.ForeColor = $blue
            $messageLabel.Text = "Bem-vindo, $($result.clientName)! Liberando a estação..."
            if ($script:Timer) { $script:Timer.Stop() }
            foreach ($openForm in @($script:Forms)) {
                if ($openForm -and -not $openForm.IsDisposed) { $openForm.Close() }
            }
        } catch {
            $errorLabel.Text = Get-ApiMessage -ErrorRecord $_
            $passBox.Clear()
            $passBox.Focus()
            $button.Enabled = $true
            $script:LoginBusy = $false
        }
    }
    $button.Add_Click($submit)
    $Form.AcceptButton = $button

    return $messageLabel
}

function Invoke-LockScreen {
    $lockMutex = New-Object System.Threading.Mutex($false, "Local\LanHouseManagerLockScreen")
    if (-not $lockMutex.WaitOne(0)) { return }
    $config = Load-Config

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [System.Windows.Forms.Application]::EnableVisualStyles()

    $script:Forms = New-Object System.Collections.ArrayList
    $script:MessageLabels = New-Object System.Collections.ArrayList
    $script:LastCommand = $null
    $script:LoginBusy = $false
    $script:Timer = $null
    $script:ClockUpdaters = New-Object System.Collections.ArrayList
    $dark = [Drawing.Color]::FromArgb(8, 30, 82)
    $cardWidth = 468
    $cardHeight = 528

    foreach ($screen in [System.Windows.Forms.Screen]::AllScreens) {
        $form = New-Object System.Windows.Forms.Form
        $form.Text = "LanHouseManager"
        $form.FormBorderStyle = "None"
        $form.StartPosition = "Manual"
        $form.Bounds = $screen.Bounds
        $form.BackColor = $dark
        $form.TopMost = $true
        $form.ShowInTaskbar = $false
        $form.KeyPreview = $true
        $form.Add_KeyDown({
            if ($_.Alt -or $_.KeyCode -in @("Escape", "LWin", "RWin")) {
                $_.SuppressKeyPress = $true
            }
        })

        $form.Add_FormClosed({ if ($this.BackgroundImage) { $this.BackgroundImage.Dispose() } })
        [void]$script:Forms.Add($form)
        $messageLabel = New-ClientAccessCard -Form $form -Config $config -CardWidth $cardWidth -CardHeight $cardHeight
        [void]$script:MessageLabels.Add($messageLabel)
    }

    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = 1000
    $script:Timer = $timer
    $timer.Add_Tick({
        foreach ($updater in @($script:ClockUpdaters)) { try { & $updater } catch { } }
        try {
            if ($script:LoginBusy) { return }
            $command = Get-AgentCommand -Config $config
            $script:LastCommand = $command
            if (-not $command.locked) {
                $timer.Stop()
                foreach ($lockForm in @($script:Forms)) {
                    if ($lockForm -and -not $lockForm.IsDisposed) { $lockForm.Close() }
                }
                return
            }

            foreach ($label in @($script:MessageLabels)) {
                if ($label -and -not $label.IsDisposed) {
                    $label.Text = if ($command.lockMessage) { $command.lockMessage } else { "Aguardando liberação pelo atendente" }
                }
            }
            foreach ($lockForm in @($script:Forms)) {
                if (-not $lockForm.IsDisposed) {
                    $lockForm.TopMost = $true
                    $lockForm.Activate()
                }
            }
        } catch {
            foreach ($lockForm in @($script:Forms)) {
                if (-not $lockForm.IsDisposed) {
                    $lockForm.TopMost = $true
                    $lockForm.Activate()
                }
            }
        }
    })
    $timer.Start()

    foreach ($form in @($script:Forms)) {
        $form.Show()
    }
    if ($script:Forms.Count -eq 0) { return }
    [System.Windows.Forms.Application]::Run($script:Forms[0])
}

function Show-AgentStatus {
    $config = Load-Config
    Write-Host "LanHouseManager Agent"
    Write-Host "Versao: $AgentVersion"
    Write-Host "Servidor: $($config.ServerUrl)"
    Write-Host "Maquina: $($config.MachineName) ($($config.MachineId))"
    Write-Host "Usuarios protegidos: $($config.ProtectedUsers -join ', ')"
    Write-Host "Pastas: $($config.ProtectedFolders -join ', ')"
    Write-Host "Impressoras previstas: $($config.SharedPrinters -join ', ')"
    Write-Host "Ultima captura: $($config.LastCapture)"
    Write-Host "Startup: $StartupBat"
    if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot "LanHouseAgent.ps1"))) { throw "Arquivo do agente instalado nao encontrado." }
    if (-not (Test-Path -LiteralPath $StartupBat)) { throw "Inicializacao automatica nao encontrada." }
    if (-not $config.ProtectedUsers -or $config.ProtectedUsers.Count -ne 1) { throw "Perfil do cliente nao configurado." }
    if (-not $config.LastCapture) { throw "Padrao do cliente ainda nao capturado." }
    $server = "$($config.ServerUrl)".TrimEnd("/")
    try { $response = Invoke-RestMethod -Method Get -Uri "$server/api/bootstrap" -TimeoutSec 5 } catch { throw "Servidor nao acessivel: $($_.Exception.Message)" }
    if (-not $response.ok) { throw "Servidor respondeu de forma inesperada." }
    Write-Host "Verificacao: configuracao, captura, inicio automatico e servidor OK."
}

function Invoke-UninstallAgent {
    Require-Admin
    if (Test-Path $StartupBat) {
        Remove-Item -LiteralPath $StartupBat -Force
    }
    Unregister-ScheduledTask -TaskName $UpdaterTaskName -Confirm:$false -ErrorAction SilentlyContinue
    try { foreach ($user in @((Load-Config).ProtectedUsers)) { Remove-ClientRestrictions -User $user } } catch { Write-Host "Restricoes nao removidas: $($_.Exception.Message)" }
    Write-Host "Inicializacao removida. Arquivos mantidos em $InstallRoot por seguranca."
}

# Acoes que rodam na estacao trabalham a partir da pasta do agente (nunca do pendrive).
if ($Action -in @("Run", "LockScreen", "Overlay", "Monitor", "PrintReview", "Update") -and (Test-Path -LiteralPath $InstallRoot)) {
    Set-Location -LiteralPath $InstallRoot
}

switch ($Action) {
    "Install" {
        try {
            Invoke-InstallAgent
            Write-Host ""
            Read-Host "Instalacao concluida. Pressione Enter para fechar"
        } catch {
            $errorMessage = "ERRO: $($_.Exception.Message)"
            Write-Host $errorMessage -ForegroundColor Red
            # Detalhe completo tambem ao lado do instalador (pendrive), para diagnostico fora da estacao.
            $errorDetail = @(
                "Data: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
                "Computador: $env:COMPUTERNAME  Usuario: $env:USERNAME"
                "Agente: $AgentVersion  MachineId: $MachineId  MachineName: $MachineName"
                $errorMessage
                "Local: $($_.InvocationInfo.PositionMessage)"
                "Pilha:"
                $_.ScriptStackTrace
            ) -join "`r`n"
            foreach ($folder in @($InstallRoot, $PSScriptRoot)) {
                if (-not $folder) { continue }
                try {
                    New-Item -ItemType Directory -Path $folder -Force | Out-Null
                    Set-Content -LiteralPath (Join-Path $folder "erro-instalacao.txt") -Value $errorDetail -Encoding UTF8
                    Write-Host "Erro salvo em $folder\erro-instalacao.txt"
                } catch { }
            }
            Read-Host "Pressione Enter para fechar"
            exit 1
        }
    }
    "Run" { Invoke-AgentRun }
    "LockScreen" { Invoke-LockScreen }
    "Overlay" { Invoke-Overlay }
    "Monitor" { Invoke-Monitor }
    "PrintReview" { Invoke-PrintReview -Path $JobPath }
    "Update" { Invoke-AgentUpdate }
    "Capture" { Invoke-CaptureBaseline }
    "Restore" { Invoke-AgentRestore }
    "Status" { Show-AgentStatus }
    "Uninstall" { Invoke-UninstallAgent }
}
