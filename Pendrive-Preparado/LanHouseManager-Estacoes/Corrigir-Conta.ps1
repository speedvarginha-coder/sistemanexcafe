# Recoloca a conta do cliente no grupo Usuarios (sem grupo o Windows esconde a conta da tela de entrada).
# Tenta tres jeitos e grava o resultado de cada um no pendrive (conta-cliente.txt).
$log = Join-Path $PSScriptRoot "conta-cliente.txt"
function Say([string]$text, [string]$color = "Gray") { Write-Host $text -ForegroundColor $color; Add-Content -LiteralPath $log -Value $text -Encoding UTF8 }
Set-Content -LiteralPath $log -Value "Correcao da conta do cliente - $(Get-Date -Format 'dd/MM/yyyy HH:mm') - $env:COMPUTERNAME - executado por $env:USERNAME" -Encoding UTF8
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Say "Administrador: $admin"

$cfg = "C:\LanHouseManagerAgent\agent-config.json"
$contas = if (Test-Path $cfg) { @((Get-Content -Raw $cfg | ConvertFrom-Json).ProtectedUsers) } else { @() }
if (-not $contas) { $contas = @(Read-Host "Digite o nome da conta do cliente (ex.: COMPUTADOR-15)") }
$grupo = (Get-LocalGroup -SID "S-1-5-32-545").Name
Say "Grupo: $grupo"

function Is-Member([string]$user) {
    $members = @(([ADSI]"WinNT://$env:COMPUTERNAME/$grupo,group").psbase.Invoke("Members") | ForEach-Object { $_.GetType().InvokeMember("Name", "GetProperty", $null, $_, $null) })
    return [bool]($members | Where-Object { $_ -ieq $user })
}

foreach ($c in $contas) {
    if (-not $c) { continue }
    Say "`nConta do cliente: $c"
    $u = Get-LocalUser -Name $c -ErrorAction SilentlyContinue
    if (-not $u) { Say "  A conta $c nao existe nesta maquina." Red; continue }
    Say "  SID: $($u.SID)  Ativa: $($u.Enabled)"
    if (Is-Member $c) { Say "  Ja esta no grupo $grupo." Green; continue }

    Say "  Tentativa 1 (Add-LocalGroupMember por SID)..."
    try { Add-LocalGroupMember -SID "S-1-5-32-545" -Member $u.SID -ErrorAction Stop; Say "    ok" } catch { Say "    erro: $($_.Exception.Message)" Yellow }
    if (-not (Is-Member $c)) {
        Say "  Tentativa 2 (ADSI)..."
        try { ([ADSI]"WinNT://$env:COMPUTERNAME/$grupo,group").Add("WinNT://$env:COMPUTERNAME/$c,user"); Say "    ok" } catch { Say "    erro: $($_.Exception.InnerException.Message) $($_.Exception.Message)" Yellow }
    }
    if (-not (Is-Member $c)) {
        Say "  Tentativa 3 (net localgroup)..."
        $out = & net.exe localgroup $grupo $c /add 2>&1
        Say "    $($out -join ' ')"
    }
    if (Is-Member $c) { Say "  PRONTO: $c esta no grupo $grupo. Saia da conta Tecnico e entre na conta do cliente." Green }
    else { Say "  NAO FUNCIONOU. Traga o pendrive ao caixa (resultado em LanHouseManager-Estacoes\conta-cliente.txt)." Red }
}
Read-Host "`nPressione Enter para fechar"
