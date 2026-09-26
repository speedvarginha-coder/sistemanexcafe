# Monta a tela de bloqueio (sem exibir) e confere que o relogio foi registrado para atualizar.
param([string]$AgentFile)
$ErrorActionPreference = "Stop"
$ast = [System.Management.Automation.Language.Parser]::ParseFile($AgentFile, [ref]$null, [ref]$null)
foreach ($name in "New-RoundedRegion", "New-LockBackground", "New-LockInput", "New-ClientAccessCard") {
    $fn = $ast.Find({ param($x) $x -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $x.Name -eq $name }, $true)
    Invoke-Expression $fn.Extent.Text
}
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$script:ClockUpdaters = New-Object System.Collections.ArrayList
$form = New-Object System.Windows.Forms.Form
$form.ClientSize = New-Object System.Drawing.Size(1366, 768)
[void](New-ClientAccessCard -Form $form -Config ([pscustomobject]@{ MachineName = "PC" }) -CardWidth 468 -CardHeight 528)
"relogios registrados: $($script:ClockUpdaters.Count)"
$form.Dispose()
