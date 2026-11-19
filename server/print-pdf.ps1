param(
    [ValidateSet("List", "Print", "Barcode", "Info", "Inbox", "PageImage")]
    [string]$Action = "List",
    [string]$Path,
    # Pasta consultada pelo Action Inbox (arquivos recebidos do WhatsApp/pendrive).
    [string]$Folder,
    [string]$Printer,
    [switch]$Color,
    [ValidateSet("Draft", "Standard", "High")]
    [string]$Quality = "High",
    # Paginas a imprimir, 1-based, separadas por virgula (ex.: "1,3"). Vazio = todas.
    [string]$Pages,
    # Pagina (1-based) a renderizar em JPEG para pre-visualizacao (Action PageImage).
    [int]$Page = 1,
    # Margem em centesimos de polegada (25 = 6,3 mm). Papel especial/foto usa 0.
    [int]$Margin = 25,
    # Senha do cliente para PDF protegido (fatura de operadora: costuma ser CPF ou telefone).
    [string]$Password,
    # Copias do documento inteiro (impressora de boleto em duplicata, trabalho escolar etc.).
    [int]$Copies = 1,
    # Frente e verso (duplex): o atendente decide na hora, arquivo por arquivo.
    [switch]$Duplex
)

# Impressao feita pelo computador do caixa: as estacoes so enxergam a "Impressao Nexcafe"
# e enviam o PDF ao servidor, que imprime aqui na impressora escolhida no painel.
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Drawing

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

# Documento sem cor mandado como colorido (ex.: contracheque em escala de cinza) e cobrado como P&B.
# Reduz a pagina e procura pixels com saturacao; exige alguns pixels para ignorar ruido de digitalizacao.
function Test-BitmapHasColor {
    param([System.Drawing.Bitmap]$Bitmap)
    $width = [Math]::Min(240, $Bitmap.Width)
    $height = [Math]::Max(1, [int]($Bitmap.Height * $width / $Bitmap.Width))
    $small = New-Object System.Drawing.Bitmap($Bitmap, $width, $height)
    try {
        $found = 0
        for ($y = 0; $y -lt $height; $y++) {
            for ($x = 0; $x -lt $width; $x++) {
                $p = $small.GetPixel($x, $y)
                $max = [Math]::Max($p.R, [Math]::Max($p.G, $p.B))
                $min = [Math]::Min($p.R, [Math]::Min($p.G, $p.B))
                if ($max - $min -gt 40) { $found++; if ($found -ge 4) { return $true } }
            }
        }
        return $false
    } finally { $small.Dispose() }
}

# Dados de um arquivo recebido, sem renderizar: paginas, se e PDF de verdade e se tem senha.
# Arquivo baixado da internet com nome .pdf mas conteudo HTML (boleto que exige login) e recusado aqui.
function Get-PdfInfo {
    param([string]$Path)
    $file = Get-Item -LiteralPath $Path
    $ext = $file.Extension.ToLowerInvariant()
    $info = [ordered]@{ pages = 1; kind = "image"; valid = $true; problem = $null; encrypted = $false }
    if ($ext -ne ".pdf") { return [pscustomobject]$info }

    $info.kind = "pdf"
    $stream = [System.IO.File]::OpenRead($file.FullName)
    try {
        $head = New-Object byte[] 5
        $read = $stream.Read($head, 0, 5)
    } finally { $stream.Close() }
    $assinatura = if ($read -ge 4) { [System.Text.Encoding]::ASCII.GetString($head, 0, 4) } else { "" }
    if ($assinatura -ne "%PDF") {
        $info.valid = $false; $info.pages = 0
        $info.problem = "O arquivo nao e um PDF de verdade. Parece uma pagina da internet baixada com nome .pdf."
        return [pscustomobject]$info
    }
    try {
        $document = Open-PdfDocument -Path $file.FullName
        $info.pages = [int]$document.PageCount
        if ($info.pages -lt 1) { throw "O documento nao contem paginas." }
    } catch {
        # O leitor do Windows nao abriu: ou o PDF tem senha, ou tem defeito que o pypdf conserta.
        $repaired = Get-CachedPdfPath -File $file -Suffix ".reparado"
        $tool = if (Test-Path -LiteralPath $repaired) { [pscustomobject]@{ ok = $true } } else { Invoke-PdfTool -Command "repair" -Path $file.FullName -Out $repaired -Password "" }
        if ($tool.ok) {
            try {
                $document = Open-PdfDocument -Path $repaired
                $info.pages = [int]$document.PageCount
                if ($info.pages -lt 1) { throw "vazio" }
            } catch {
                $info.valid = $false; $info.pages = 0; $info.problem = "O PDF esta corrompido e nao abre nem depois de consertado."
            }
        } else {
            $info.valid = $false; $info.pages = 0
            $info.encrypted = [bool]$tool.encrypted
            $info.problem = if ($info.encrypted) { "Protegido por senha. Clique no botao de impressao e informe a senha do cliente (fatura de operadora costuma ser CPF ou telefone)." } else { "O PDF esta corrompido e nao abre." }
        }
    }
    return [pscustomobject]$info
}

# Copias consertadas/desbloqueadas ficam em cache local: nunca na pasta que sincroniza com o Drive.
function Get-PdfToolDir {
    return (Join-Path $env:LOCALAPPDATA "Nexcafe\inbox-reparados")
}

function Get-CachedPdfPath {
    param([System.IO.FileInfo]$File, [string]$Suffix)
    return (Join-Path (Get-PdfToolDir) ("$([System.IO.Path]::GetFileNameWithoutExtension($File.Name)).$($File.Length).$($File.LastWriteTimeUtc.Ticks)$Suffix.pdf"))
}

# Roda o server/pdf-tools.py e devolve o JSON de resposta (nunca lanca excecao).
function Invoke-PdfTool {
    param([string]$Command, [string]$Path, [string]$Out, [string]$Password)
    $script = Join-Path $PSScriptRoot "pdf-tools.py"
    $exe = if (Get-Command python -ErrorAction SilentlyContinue) { "python" } else { "C:\Python314\python.exe" }
    New-Item -ItemType Directory -Force -Path (Get-PdfToolDir) | Out-Null
    $arguments = @($script, $Command, $Path, $Out)
    if ($Password) { $arguments += $Password }
    $raw = & $exe @arguments 2>$null
    $line = @($raw | Where-Object { $_ })[-1]
    try { return ($line | ConvertFrom-Json) } catch { return [pscustomobject]@{ ok = $false; encrypted = $false; error = "Resposta invalida do leitor de PDF." } }
}

# Caminho do PDF pronto para imprimir: o original, ou a copia consertada/desbloqueada em cache.
function Ensure-PrintablePdf {
    param([string]$Path, [string]$Password)
    try { $null = Open-PdfDocument -Path $Path; return $Path } catch { }
    $file = Get-Item -LiteralPath $Path
    if ($Password) {
        $md5 = [System.Security.Cryptography.MD5]::Create()
        $hash = [System.BitConverter]::ToString($md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Password))).Replace("-", "").Substring(0, 8).ToLowerInvariant()
        $unlocked = Get-CachedPdfPath -File $file -Suffix ".$hash.aberto"
        if (-not (Test-Path -LiteralPath $unlocked)) {
            $tool = Invoke-PdfTool -Command "unlock" -Path $file.FullName -Out $unlocked -Password $Password
            if (-not $tool.ok) { throw $tool.error }
        }
        return $unlocked
    }
    $repaired = Get-CachedPdfPath -File $file -Suffix ".reparado"
    if (Test-Path -LiteralPath $repaired) { return $repaired }
    $tool = Invoke-PdfTool -Command "repair" -Path $file.FullName -Out $repaired -Password ""
    if ($tool.ok -and (Test-Path -LiteralPath $repaired)) { return $repaired }
    throw "Este PDF precisa de senha (ou esta corrompido). Peca a senha ao cliente e mande imprimir de novo."
}

# Arquivo Office do cliente (Word/Excel/PowerPoint): vira PDF uma unica vez e o resultado
# fica em cache local. Da fila de impressao para frente e tratado como PDF qualquer.
$OFFICE_EXTS = @(".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx")

function Get-OfficePdfPath {
    param([System.IO.FileInfo]$File)
    $outDir = Join-Path $env:LOCALAPPDATA "Nexcafe\inbox-convertidos"
    return (Join-Path $outDir ("$([System.IO.Path]::GetFileNameWithoutExtension($File.Name)).$($File.Length).$($File.LastWriteTimeUtc.Ticks).pdf"))
}

# Converte com macros desativadas (AutomationSecurity = 3, ForceDisable) e em modo somente leitura.
# Documento malicioso nao executa nada; o original nunca e tocado.
function Convert-OfficeToPdf {
    param([string]$Path, [string]$Out)
    $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
    $tmp = "$Out.$PID.pdf"
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Out) | Out-Null
    if (".doc", ".docx" -contains $ext) {
        $app = New-Object -ComObject Word.Application
        try {
            $app.AutomationSecurity = 3
            $app.Visible = $false
            $app.DisplayAlerts = 0
            $doc = $app.Documents.Open($Path, $false, $true)
            try { $doc.ExportAsFixedFormat($tmp, 17) } finally { $doc.Close($false) }
        } finally { $app.Quit(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) }
    } elseif (".xls", ".xlsx" -contains $ext) {
        $app = New-Object -ComObject Excel.Application
        try {
            $app.AutomationSecurity = 3
            $app.Visible = $false
            $app.DisplayAlerts = $false
            $book = $app.Workbooks.Open($Path, 0, $true)
            try { $book.ExportAsFixedFormat(0, $tmp) } finally { $book.Close($false) }
        } finally { $app.Quit(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) }
    } elseif (".ppt", ".pptx" -contains $ext) {
        $app = New-Object -ComObject PowerPoint.Application
        try {
            $app.AutomationSecurity = 3
            $pres = $app.Presentations.Open($Path, $true, $false, $false)
            try { $pres.SaveAs($tmp, 32) } finally { $pres.Close() }
        } finally { $app.Quit(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) }
    } else {
        throw "Tipo de arquivo Office nao suportado: $ext"
    }
    if (-not (Test-Path -LiteralPath $tmp)) { throw "A conversao nao gerou o PDF (arquivo corrompido ou protegido por senha?)." }
    Move-Item -LiteralPath $tmp -Destination $Out -Force
    return $Out
}

# Garante que o PDF convertido existe (converte na primeira vez) e devolve o caminho dele.
function Ensure-OfficePdf {
    param([string]$Path)
    $file = Get-Item -LiteralPath $Path
    $out = Get-OfficePdfPath -File $file
    if (-not (Test-Path -LiteralPath $out)) { Convert-OfficeToPdf -Path $file.FullName -Out $out | Out-Null }
    return $out
}

# Dados de um arquivo Office: paginas do PDF convertido ou o motivo da falha.
function Get-OfficeInfo {
    param([string]$Path)
    try {
        $pdf = Ensure-OfficePdf -Path $Path
        $info = Get-PdfInfo -Path $pdf
        $info.kind = "office"
        return $info
    } catch {
        return [pscustomobject]@{ pages = 0; kind = "office"; valid = $false; problem = "Falha ao converter para PDF: $($_.Exception.Message)" }
    }
}

# Lista os arquivos imprimiveis de uma pasta (sem subpastas), com paginas e validade.
# A contagem de paginas fica em cache por arquivo (nome, tamanho e data): so o arquivo novo e aberto.
function Get-InboxInfo {
    param([string]$Folder)
    if (-not (Test-Path -LiteralPath $Folder)) { throw "Pasta de recebimento nao encontrada: $Folder" }
    $allowed = @(".pdf", ".jpg", ".jpeg", ".png", ".webp") + $OFFICE_EXTS
    $cacheDir = Join-Path $env:LOCALAPPDATA "Nexcafe"
    $cacheFile = Join-Path $cacheDir "print-inbox-cache.json"
    $cache = @{}
    if (Test-Path -LiteralPath $cacheFile) {
        try {
            $saved = Get-Content -LiteralPath $cacheFile -Raw -Encoding UTF8 | ConvertFrom-Json
            foreach ($prop in $saved.PSObject.Properties) { $cache[$prop.Name] = $prop.Value }
        } catch { $cache = @{} }
    }
    $list = New-Object System.Collections.Generic.List[object]
    $used = @{}
    foreach ($f in Get-ChildItem -LiteralPath $Folder -File -ErrorAction SilentlyContinue) {
        $ext = $f.Extension.ToLowerInvariant()
        if ($allowed -notcontains $ext) { continue }
        $key = "$($f.FullName)|$($f.Length)|$($f.LastWriteTimeUtc.Ticks)"
        $used[$key] = $true
        if ($cache.ContainsKey($key)) {
            $info = $cache[$key]
        } else {
            try { $info = if ($OFFICE_EXTS -contains $ext) { Get-OfficeInfo -Path $f.FullName } else { Get-PdfInfo -Path $f.FullName } } catch {
                $info = [pscustomobject]@{ pages = 0; kind = $ext.TrimStart('.'); valid = $false; problem = $_.Exception.Message }
            }
            # Falha de conversao Office nao fica em cache: a proxima leitura tenta de novo.
            if ($info.valid -or $info.kind -ne "office") { $cache[$key] = $info }
        }
        $list.Add([pscustomobject]@{
            name       = $f.Name
            bytes      = [long]$f.Length
            modifiedAt = $f.LastWriteTimeUtc.ToString("o")
            ext        = $ext.TrimStart('.')
            kind       = $info.kind
            pages      = $info.pages
            valid      = $info.valid
            encrypted  = [bool]$info.encrypted
            problem    = $info.problem
        })
    }
    # Guarda so as entradas dos arquivos que ainda estao na pasta.
    $fresh = @{}
    foreach ($k in $used.Keys) { if ($cache.ContainsKey($k)) { $fresh[$k] = $cache[$k] } }
    try {
        New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
        ($fresh | ConvertTo-Json -Depth 4 -Compress) | Set-Content -LiteralPath $cacheFile -Encoding UTF8
    } catch { }
    return ,$list.ToArray()
}

# Codigo de barras de boleto (ITF): faixa com muitas barras verticais, identica linha a linha por varios mm.
# Texto, tabelas, linhas tracejadas e QR Code nao repetem a mesma linha com tantas transicoes.
$BarcodeSource = @"
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class NexBarcode {
    public static bool Has(Bitmap src, int minTransitions, int minRows) {
        int w = src.Width, h = src.Height;
        var data = src.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        byte[] buf = new byte[data.Stride * h];
        Marshal.Copy(data.Scan0, buf, 0, buf.Length);
        int stride = data.Stride; src.UnlockBits(data);
        bool[] prev = null; int run = 0;
        for (int y = 0; y < h; y++) {
            bool[] row = new bool[w]; int trans = 0;
            for (int x = 0; x < w; x++) {
                int i = y * stride + x * 4;
                row[x] = (buf[i] + buf[i + 1] + buf[i + 2]) < 384;
                if (x > 0 && row[x] != row[x - 1]) trans++;
            }
            if (trans < minTransitions) { run = 0; prev = null; continue; }
            if (prev != null) {
                int diff = 0;
                for (int x = 0; x < w; x++) if (row[x] != prev[x]) diff++;
                run = diff <= Math.Max(4, trans / 5) ? run + 1 : 1;
            } else run = 1;
            if (run >= minRows) return true;
            prev = row;
        }
        return false;
    }
}
"@

# Paginas (1-based) que tem codigo de barras. Renderiza a 144 DPI: barra fina do boleto fica com ~2 px.
function Get-BarcodePages {
    param([string]$Path)
    # Compila so quando usado, para nao atrasar a impressao normal do servidor.
    Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $BarcodeSource
    $document = Open-PdfDocument -Path $Path
    $found = @()
    for ($i = 0; $i -lt [int]$document.PageCount; $i++) {
        $bitmap = Get-PdfPageImage -Document $document -Index $i -Scale 2.0
        try { if ([NexBarcode]::Has($bitmap, 80, 25)) { $found += ($i + 1) } } finally { $bitmap.Dispose() }
    }
    return ,$found
}

function Send-PdfToPrinter {
    param([string]$Path, [string]$Printer, [bool]$Color, [string]$Quality = "High", [int[]]$Only, [int]$Margin = 25, [int]$Copies = 1, [bool]$Duplex = $false)
    $queue = Get-Printer -Name $Printer -ErrorAction Stop
    $queueStatus = [string]$queue.PrinterStatus
    # NoToner nao bloqueia: a HP 432 informa "Sem toner" com toner baixo e continua imprimindo.
    if ($queueStatus -match 'Offline|Error|PaperOut|NotAvailable|UserIntervention|DoorOpen') {
        throw "Impressora $Printer indisponivel: $queueStatus"
    }
    $document = Open-PdfDocument -Path $Path
    $total = [int]$document.PageCount
    if ($total -lt 1) { throw "O documento nao contem paginas." }
    # Indices 0-based das paginas a imprimir, na ordem do documento.
    $indexes = if ($Only) { @($Only | Where-Object { $_ -ge 1 -and $_ -le $total } | Sort-Object -Unique | ForEach-Object { $_ - 1 }) } else { @(0..($total - 1)) }
    if (-not $indexes.Count) { throw "Nenhuma das paginas pedidas existe no documento ($total pag)." }
    # Copias: a lista de paginas repete, entao a contagem (e o cobrado) ja sai multiplicada.
    if ($Copies -gt 1) { $base = $indexes; $indexes = @(); for ($c = 0; $c -lt $Copies; $c++) { $indexes += $base } }
    $pages = $indexes.Count
    $settings = New-Object System.Drawing.Printing.PrinterSettings
    $settings.PrinterName = $Printer
    if (-not $settings.IsValid) { throw "Impressora indisponivel no caixa: $Printer" }

    # Frente e verso: so quando o atendente pede; se a impressora nao tiver duplex, imprime normal.
    if ($Duplex -and $settings.CanDuplex) { $settings.Duplex = [System.Drawing.Printing.Duplex]::Vertical }

    # Solicita resolucao High ou especificada ao driver da impressora
    if ($Quality -eq "High" -or $Color) {
        foreach ($res in $settings.PrinterResolutions) {
            if ($res.Kind -eq [System.Drawing.Printing.PrinterResolutionKind]::High) {
                $settings.DefaultPageSettings.PrinterResolution = $res
                break
            }
        }
    } elseif ($Quality -eq "Draft") {
        foreach ($res in $settings.PrinterResolutions) {
            if ($res.Kind -eq [System.Drawing.Printing.PrinterResolutionKind]::Draft) {
                $settings.DefaultPageSettings.PrinterResolution = $res
                break
            }
        }
    }

    $print = New-Object System.Drawing.Printing.PrintDocument
    try {
        $print.PrinterSettings = $settings
        $print.PrintController = New-Object System.Drawing.Printing.StandardPrintController
        $print.DocumentName = "Nexcafe:$([guid]::NewGuid().ToString('N'))"
        $print.DefaultPageSettings.Color = $Color
        if ($Duplex -and $settings.CanDuplex) { $print.DefaultPageSettings.Duplex = [System.Drawing.Printing.Duplex]::Vertical }
        $print.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins($Margin, $Margin, $Margin, $Margin)
        $script:PdfIndex = 0
        $script:HasColor = $false
        $print.add_QueryPageSettings({ param($sender, $eventArgs)
            $page = $document.GetPage($indexes[$script:PdfIndex])
            try { $eventArgs.PageSettings.Landscape = ($page.Size.Width -gt $page.Size.Height) }
            finally { $page.Dispose() }
            $eventArgs.PageSettings.Color = $Color
            if ($Quality -eq "High" -or $Color) {
                foreach ($res in $settings.PrinterResolutions) {
                    if ($res.Kind -eq [System.Drawing.Printing.PrinterResolutionKind]::High) {
                        $eventArgs.PageSettings.PrinterResolution = $res
                        break
                    }
                }
            }
        })
        $print.add_PrintPage({ param($sender, $eventArgs)
            # Escala de resolucao de renderizacao:
            # High ou Colorida: 4.167 (300 DPI) para nitidez fotografica e cores densas
            # Standard: 3.0 (216 DPI)
            # Draft: 2.0 (144 DPI)
            $scaleFactor = if ($Quality -eq "High" -or $Color) { 4.167 } elseif ($Quality -eq "Draft") { 2.0 } else { 3.0 }
            $bitmap = Get-PdfPageImage -Document $document -Index $indexes[$script:PdfIndex] -Scale $scaleFactor
            try {
                if ($Color -and -not $script:HasColor) { $script:HasColor = Test-BitmapHasColor -Bitmap $bitmap }
                if ($Quality -eq "High" -or $Color) {
                    $eventArgs.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $eventArgs.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                    $eventArgs.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                    $eventArgs.Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                }
                $target = $eventArgs.MarginBounds
                $scale = [Math]::Min($target.Width / $bitmap.Width, $target.Height / $bitmap.Height)
                $destW = [int]($bitmap.Width * $scale)
                $destH = [int]($bitmap.Height * $scale)
                $destX = $target.X + [int](($target.Width - $destW) / 2)
                $destY = $target.Y + [int](($target.Height - $destH) / 2)
                $eventArgs.Graphics.DrawImage($bitmap, (New-Object System.Drawing.Rectangle($destX, $destY, $destW, $destH)))
            } finally { $bitmap.Dispose() }
            $script:PdfIndex++
            $eventArgs.HasMorePages = ($script:PdfIndex -lt $pages)
        })
        $print.Print()
    } finally { $print.Dispose() }
    return $pages
}

# Imagem recebida (foto de documento, comprovante, foto para revelar): imprime direto, sem abrir o Chrome.
function Send-ImageToPrinter {
    param([string]$Path, [string]$Printer, [bool]$Color, [string]$Quality = "High", [int]$Margin = 25)
    $queue = Get-Printer -Name $Printer -ErrorAction Stop
    $queueStatus = [string]$queue.PrinterStatus
    if ($queueStatus -match 'Offline|Error|PaperOut|NotAvailable|UserIntervention|DoorOpen') {
        throw "Impressora $Printer indisponivel: $queueStatus"
    }
    $image = [System.Drawing.Image]::FromFile($Path)
    $print = New-Object System.Drawing.Printing.PrintDocument
    try {
        $print.PrinterSettings.PrinterName = $Printer
        if (-not $print.PrinterSettings.IsValid) { throw "Impressora indisponivel no caixa: $Printer" }
        $print.PrintController = New-Object System.Drawing.Printing.StandardPrintController
        $print.DocumentName = "Nexcafe:$([guid]::NewGuid().ToString('N'))"
        $print.DefaultPageSettings.Color = $Color
        $print.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins($Margin, $Margin, $Margin, $Margin)
        $script:HasColor = $false
        $print.add_PrintPage({ param($sender, $eventArgs)
            $bitmap = $null
            try {
                $bitmap = New-Object System.Drawing.Bitmap($image)
                if ($Color -and -not $script:HasColor) { $script:HasColor = Test-BitmapHasColor -Bitmap $bitmap }
                if ($Quality -eq "High" -or $Color) {
                    $eventArgs.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $eventArgs.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                    $eventArgs.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                    $eventArgs.Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                }
                $target = $eventArgs.MarginBounds
                $scale = [Math]::Min($target.Width / $bitmap.Width, $target.Height / $bitmap.Height)
                $destW = [int]($bitmap.Width * $scale)
                $destH = [int]($bitmap.Height * $scale)
                $destX = $target.X + [int](($target.Width - $destW) / 2)
                $destY = $target.Y + [int](($target.Height - $destH) / 2)
                $eventArgs.Graphics.DrawImage($bitmap, (New-Object System.Drawing.Rectangle($destX, $destY, $destW, $destH)))
            } finally { if ($bitmap) { $bitmap.Dispose() } }
            $eventArgs.HasMorePages = $false
        })
        $print.Print()
    } finally { $print.Dispose(); $image.Dispose() }
    return 1
}

try {
    if ($Action -eq "List") {
        $names = @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters | Where-Object { $_ -notmatch '^(OneNote|Microsoft Print to PDF|Microsoft XPS Document Writer|Fax)' })
        Write-Output (ConvertTo-Json -InputObject @{ ok = $true; printers = $names } -Compress)
    } elseif ($Action -eq "Barcode") {
        if (-not (Test-Path -LiteralPath $Path)) { throw "Arquivo nao encontrado." }
        # PDF com senha: a deteccao roda na copia desbloqueada em cache, nunca no original.
        $printable = Ensure-PrintablePdf -Path ([System.IO.Path]::GetFullPath($Path)) -Password $Password
        $found = Get-BarcodePages -Path $printable
        $total = [int](Open-PdfDocument -Path $printable).PageCount
        Write-Output (ConvertTo-Json -InputObject @{ ok = $true; total = $total; pages = @($found) } -Compress)
    } elseif ($Action -eq "Info") {
        if (-not (Test-Path -LiteralPath $Path)) { throw "Arquivo nao encontrado." }
        $full = [System.IO.Path]::GetFullPath($Path)
        $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
        $info = $null
        if ($ext -eq ".pdf" -and $Password) {
            try { $info = Get-PdfInfo -Path (Ensure-PrintablePdf -Path $full -Password $Password) } catch {
                $info = [pscustomobject]@{ pages = 0; kind = "pdf"; valid = $false; encrypted = $true; problem = $_.Exception.Message }
            }
        }
        if (-not $info) { $info = if ($OFFICE_EXTS -contains $ext) { Get-OfficeInfo -Path $full } else { Get-PdfInfo -Path $full } }
        $output = @{ ok = $true; pages = $info.pages; kind = $info.kind; valid = $info.valid; problem = $info.problem }
        if ($info.encrypted) { $output.encrypted = $true }
        Write-Output (ConvertTo-Json -InputObject $output -Compress)
    } elseif ($Action -eq "PageImage") {
        # Pre-visualizacao da folha do boleto: renderiza a pagina em JPEG e devolve em base64.
        if (-not (Test-Path -LiteralPath $Path)) { throw "Arquivo nao encontrado." }
        $full = [System.IO.Path]::GetFullPath($Path)
        if ([System.IO.Path]::GetExtension($full).ToLowerInvariant() -ne ".pdf") { throw "So PDF tem pre-visualizacao de pagina." }
        $printable = Ensure-PrintablePdf -Path $full -Password $Password
        $document = Open-PdfDocument -Path $printable
        try {
            $total = [int]$document.PageCount
            $index = [Math]::Max(0, [Math]::Min($total, [int]$Page)) - 1
            $bitmap = Get-PdfPageImage -Document $document -Index $index -Scale 2.0
            try {
                $ms = New-Object System.IO.MemoryStream
                $jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
                $qp = New-Object System.Drawing.Imaging.EncoderParameters(1)
                $qp.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]70)
                $bitmap.Save($ms, $jpeg, $qp)
                Write-Output (ConvertTo-Json -InputObject @{ ok = $true; page = $index + 1; total = $total; image = [Convert]::ToBase64String($ms.ToArray()) } -Compress)
            } finally { $bitmap.Dispose(); $ms.Dispose() }
        } catch { throw }
    } elseif ($Action -eq "Inbox") {
        $files = Get-InboxInfo -Folder ([System.IO.Path]::GetFullPath($Folder))
        Write-Output (ConvertTo-Json -InputObject @{ ok = $true; files = @($files) } -Compress -Depth 4)
    } else {
        if (-not (Test-Path -LiteralPath $Path)) { throw "Arquivo de impressao nao encontrado." }
        $Path = [System.IO.Path]::GetFullPath($Path)
        $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
        # Word/Excel/PowerPoint: imprime o PDF convertido (converte agora se ainda nao existe).
        if ($OFFICE_EXTS -contains $ext) { $Path = Ensure-OfficePdf -Path $Path }
        # PDF com senha do cliente: abre com a senha e imprime a copia limpa em cache.
        if ($ext -eq ".pdf") { $Path = Ensure-PrintablePdf -Path $Path -Password $Password }
        $copies = [Math]::Max(1, $Copies)
        if (@(".jpg", ".jpeg", ".png", ".webp") -contains $ext) {
            $pages = 0
            for ($c = 0; $c -lt $copies; $c++) {
                $pages += Send-ImageToPrinter -Path $Path -Printer $Printer -Color ([bool]$Color) -Quality $Quality -Margin $Margin
            }
        } else {
            $only = @($Pages -split '[,; ]+' | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ })
            $pages = Send-PdfToPrinter -Path $Path -Printer $Printer -Color ([bool]$Color) -Quality $Quality -Only $only -Margin $Margin -Copies $copies -Duplex ([bool]$Duplex)
        }
        $output = @{ ok = $true; pages = $pages }
        if ($Color) { $output.hasColor = [bool]$script:HasColor }
        Write-Output (ConvertTo-Json -InputObject $output -Compress)
    }
    exit 0
} catch {
    Write-Output (ConvertTo-Json -InputObject @{ ok = $false; error = $_.Exception.Message } -Compress)
    exit 1
}
