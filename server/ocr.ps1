# OCR de foto ou PDF digitalizado com o reconhecimento de texto do proprio Windows (sem internet).
# Uso: powershell -File ocr.ps1 -Path arquivo.(jpg|png|pdf)   -> texto em UTF-8 na saida padrao.
param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime

function Wait-WinRt {
    param([object]$Operation, [type]$ResultType)
    $methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
    if ($ResultType) {
        $method = $methods | Where-Object { $_.Name -eq "AsTask" -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like "IAsyncOperation*" } | Select-Object -First 1
        $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    } else {
        $method = $methods | Where-Object { $_.Name -eq "AsTask" -and -not $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
        $task = $method.Invoke($null, @($Operation))
    }
    $task.Wait()
    if ($ResultType) { return $task.Result }
}

$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage((New-Object Windows.Globalization.Language "pt-BR"))
if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
if (-not $engine) { throw "OCR do Windows indisponivel (instale o idioma Portugues com reconhecimento de texto)." }

function Read-Stream {
    param($stream)
    $decoder = Wait-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $max = [Windows.Media.Ocr.OcrEngine]::MaxImageDimension
    $transform = New-Object Windows.Graphics.Imaging.BitmapTransform
    $w = $decoder.PixelWidth; $h = $decoder.PixelHeight
    if ($w -gt $max -or $h -gt $max) {
        $scale = [Math]::Min($max / $w, $max / $h)
        $transform.ScaledWidth = [uint32]($w * $scale); $transform.ScaledHeight = [uint32]($h * $scale)
    }
    $bitmap = Wait-WinRt ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied, $transform, [Windows.Graphics.Imaging.ExifOrientationMode]::RespectExifOrientation, [Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage)) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Wait-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    return ($result.Lines | ForEach-Object { $_.Text }) -join "`n"
}

$file = Wait-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $Path).Path)) ([Windows.Storage.StorageFile])
$text = New-Object System.Collections.Generic.List[string]
if ([IO.Path]::GetExtension($Path).ToLower() -eq ".pdf") {
    try { $doc = Wait-WinRt ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument]) }
    catch { throw "PDF protegido por senha ou danificado: abra, imprima em PDF (ou tire uma foto) e envie de novo." }
    for ($i = 0; $i -lt [Math]::Min($doc.PageCount, 8); $i++) {
        $page = $doc.GetPage($i)
        $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
        $options = New-Object Windows.Data.Pdf.PdfPageRenderOptions
        $targetWidth = [Math]::Min(2400, [Math]::Ceiling($page.Size.Width * 3))
        $options.DestinationWidth = [uint32]$targetWidth
        $options.DestinationHeight = [uint32][Math]::Ceiling($page.Size.Height * $targetWidth / $page.Size.Width)
        Wait-WinRt ($page.RenderToStreamAsync($stream, $options)) | Out-Null
        $stream.Seek(0)
        $text.Add((Read-Stream $stream))
        $stream.Dispose(); $page.Dispose()
    }
} else {
    $stream = Wait-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $text.Add((Read-Stream $stream))
    $stream.Dispose()
}
[Console]::Out.Write(($text -join "`n"))
