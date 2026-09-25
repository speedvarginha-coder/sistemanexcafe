param([string]$AgentFile, [string]$Label)
# Roda com a pasta atual numa unidade "subst" que e removida (igual a tirar o pendrive).
$ast = [System.Management.Automation.Language.Parser]::ParseFile($AgentFile, [ref]$null, [ref]$null)
foreach ($n in "Start-AgentChild") { $f = $ast.Find({ param($x) $x -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $x.Name -eq $n }, $true); Invoke-Expression $f.Extent.Text }
$InstallRoot = Join-Path $env:TEMP "lhm-cwd-install"
New-Item -ItemType Directory $InstallRoot -Force | Out-Null
Set-Content (Join-Path $InstallRoot "LanHouseAgent.ps1") 'param([string]$Action) "ok $Action" | Set-Content (Join-Path $PSScriptRoot "saida.txt")'
Remove-Item (Join-Path $InstallRoot "saida.txt") -ErrorAction SilentlyContinue
$drive = Join-Path $env:TEMP "lhm-cwd-drive"; New-Item -ItemType Directory $drive -Force | Out-Null
& subst.exe Q: $drive
[System.IO.Directory]::SetCurrentDirectory("Q:\")
& subst.exe Q: /d
try {
    $p = Start-AgentChild -ChildAction "LockScreen"
    [void]$p.WaitForExit(15000)
    "$Label -> abriu: " + (Get-Content (Join-Path $InstallRoot "saida.txt") -ErrorAction SilentlyContinue)
} catch { "$Label -> FALHOU: $($_.Exception.Message)" }
[System.IO.Directory]::SetCurrentDirectory($env:TEMP)
Remove-Item $InstallRoot, $drive -Recurse -Force -ErrorAction SilentlyContinue
