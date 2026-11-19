param(
    [string]$Pasta,
    [string[]]$Arquivo,
    [string]$Impressora = "HP Laser MFP 432 PCL6"
)

# Imprime PDFs de uma pasta (ex.: pendrive) ou arquivos avulsos (ex.: baixados do WhatsApp) na HP.
# Opcao "So codigo de barras": imprime apenas as paginas com codigo de barras de boleto.
# Usa o mesmo script de impressao do servidor (server\print-pdf.ps1).
Add-Type -AssemblyName System.Windows.Forms
$script = Join-Path $PSScriptRoot "server\print-pdf.ps1"

function Invoke-PrintPdf {
    param([string[]]$Argumentos)
    $saida = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script @Argumentos | Select-Object -Last 1
    try { return ($saida | ConvertFrom-Json) } catch { return [pscustomobject]@{ ok = $false; error = "$saida" } }
}

# Janela com tres botoes; devolve "Tudo", "Codigo" ou $null.
function Show-Escolha {
    param([string]$Texto)
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Imprimir na $Impressora"; $form.TopMost = $true; $form.StartPosition = "CenterScreen"
    $form.FormBorderStyle = "FixedDialog"; $form.MaximizeBox = $false; $form.MinimizeBox = $false
    $form.Font = New-Object System.Drawing.Font("Segoe UI", 10); $form.AutoSize = $true; $form.AutoSizeMode = "GrowAndShrink"
    $painel = New-Object System.Windows.Forms.FlowLayoutPanel
    $painel.FlowDirection = "TopDown"; $painel.AutoSize = $true; $painel.Padding = New-Object System.Windows.Forms.Padding(12)
    $rotulo = New-Object System.Windows.Forms.Label
    $rotulo.Text = $Texto; $rotulo.AutoSize = $true; $rotulo.MaximumSize = New-Object System.Drawing.Size(520, 0)
    $painel.Controls.Add($rotulo)
    $botoes = New-Object System.Windows.Forms.FlowLayoutPanel; $botoes.AutoSize = $true; $botoes.Margin = New-Object System.Windows.Forms.Padding(0, 12, 0, 0)
    $form.Tag = $null
    foreach ($b in @(@("So codigo de barras", "Codigo"), @("Imprimir tudo", "Tudo"), @("Cancelar", $null))) {
        $botao = New-Object System.Windows.Forms.Button
        $botao.Text = $b[0]; $botao.AutoSize = $true; $botao.Padding = New-Object System.Windows.Forms.Padding(8, 4, 8, 4)
        $valor = $b[1]
        $botao.Add_Click({ $form.Tag = $valor; $form.Close() }.GetNewClosure())
        $botoes.Controls.Add($botao)
    }
    $painel.Controls.Add($botoes); $form.Controls.Add($painel)
    $form.Add_Shown({ $form.Activate() })
    [void]$form.ShowDialog()
    return $form.Tag
}

if ($Arquivo) {
    $arquivos = @($Arquivo | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object { Get-Item -LiteralPath $_ })
} else {
    if (-not $Pasta) {
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = "Escolha a pasta com os PDFs para imprimir na $Impressora"
        $dialog.ShowNewFolderButton = $false
        if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit }
        $Pasta = $dialog.SelectedPath
    }
    $arquivos = @(Get-ChildItem -LiteralPath $Pasta -Filter *.pdf -File | Sort-Object Name)
}
if (-not $arquivos.Count) {
    [System.Windows.Forms.MessageBox]::Show("Nenhum PDF encontrado.", "Imprimir") | Out-Null
    exit
}

$lista = ($arquivos | Select-Object -First 15 | ForEach-Object { "- $($_.Name)" }) -join "`n"
if ($arquivos.Count -gt 15) { $lista += "`n... e mais $($arquivos.Count - 15)" }
$modo = Show-Escolha "Imprimir $($arquivos.Count) PDF(s)?`n`n$lista`n`n""So codigo de barras"" imprime apenas as folhas do boleto com codigo de barras."
if (-not $modo) { exit }

$folhas = 0; $falhas = @(); $semCodigo = @()
$i = 0
foreach ($arq in $arquivos) {
    $i++
    Write-Host "[$i/$($arquivos.Count)] $($arq.Name)... " -NoNewline
    $paginas = ""
    if ($modo -eq "Codigo") {
        $d = Invoke-PrintPdf @("-Action", "Barcode", "-Path", $arq.FullName)
        if (-not $d.ok) { $falhas += "$($arq.Name): $($d.error)"; Write-Host "FALHOU: $($d.error)" -ForegroundColor Red; continue }
        if (-not @($d.pages).Count) { $semCodigo += $arq.Name; Write-Host "sem codigo de barras, pulado" -ForegroundColor Yellow; continue }
        $paginas = (@($d.pages) -join ",")
        Write-Host "pag $paginas de $($d.total)... " -NoNewline
    }
    $argumentos = @("-Action", "Print", "-Path", $arq.FullName, "-Printer", $Impressora)
    if ($paginas) { $argumentos += @("-Pages", $paginas) }
    $r = Invoke-PrintPdf $argumentos
    if ($r.ok) { $folhas += [int]$r.pages; Write-Host "$($r.pages) pag" -ForegroundColor Green }
    else { $falhas += "$($arq.Name): $($r.error)"; Write-Host "FALHOU: $($r.error)" -ForegroundColor Red }
}

$msg = "Enviadas $folhas pagina(s) para a $Impressora."
if ($semCodigo.Count) { $msg += "`n`nSem codigo de barras (nao impressos):`n" + ($semCodigo -join "`n") }
if ($falhas.Count) { $msg += "`n`nCom erro:`n" + ($falhas -join "`n") }
[System.Windows.Forms.MessageBox]::Show($msg, "Imprimir") | Out-Null
