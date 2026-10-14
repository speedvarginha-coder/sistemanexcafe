param(
    [ValidateSet("List", "Print")]
    [string]$Action = "List",
    [string]$Path,
    [string]$Printer,
    [switch]$Color,
    [ValidateSet("Draft", "Standard", "High")]
    [string]$Quality = "High"
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

function Send-PdfToPrinter {
    param([string]$Path, [string]$Printer, [bool]$Color, [string]$Quality = "High")
    $queue = Get-Printer -Name $Printer -ErrorAction Stop
    $queueStatus = [string]$queue.PrinterStatus
    if ($queueStatus -match 'Offline|Error|PaperOut|NotAvailable|UserIntervention|DoorOpen|NoToner') {
        throw "Impressora $Printer indisponivel: $queueStatus"
    }
    $document = Open-PdfDocument -Path $Path
    $pages = [int]$document.PageCount
    if ($pages -lt 1) { throw "O documento nao contem paginas." }
    $settings = New-Object System.Drawing.Printing.PrinterSettings
    $settings.PrinterName = $Printer
    if (-not $settings.IsValid) { throw "Impressora indisponivel no caixa: $Printer" }

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
        $print.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(25, 25, 25, 25)
        $script:PdfIndex = 0
        $script:HasColor = $false
        $print.add_QueryPageSettings({ param($sender, $eventArgs)
            $page = $document.GetPage($script:PdfIndex)
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
            $bitmap = Get-PdfPageImage -Document $document -Index $script:PdfIndex -Scale $scaleFactor
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

try {
    if ($Action -eq "List") {
        $names = @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters | Where-Object { $_ -notmatch '^(OneNote|Microsoft Print to PDF|Microsoft XPS Document Writer|Fax)' })
        Write-Output (ConvertTo-Json -InputObject @{ ok = $true; printers = $names } -Compress)
    } else {
        if (-not (Test-Path -LiteralPath $Path)) { throw "Arquivo de impressao nao encontrado." }
        $Path = [System.IO.Path]::GetFullPath($Path)
        $pages = Send-PdfToPrinter -Path $Path -Printer $Printer -Color ([bool]$Color) -Quality $Quality
        $output = @{ ok = $true; pages = $pages }
        if ($Color) { $output.hasColor = [bool]$script:HasColor }
        Write-Output (ConvertTo-Json -InputObject $output -Compress)
    }
    exit 0
} catch {
    Write-Output (ConvertTo-Json -InputObject @{ ok = $false; error = $_.Exception.Message } -Compress)
    exit 1
}
