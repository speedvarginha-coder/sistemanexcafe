param([Parameter(Mandatory)][string]$Arquivo)

# Abre o PDF ou imagem no Chrome e aperta Ctrl+P: o atendente escolhe paginas, copias e impressora.
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class JanelaAtiva {
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    public static string Titulo() { var s = new StringBuilder(512); GetWindowText(GetForegroundWindow(), s, 512); return s.ToString(); }
    public static uint Processo() { uint p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return p; }
}
// Aviso que fica por cima sem tirar o foco da tela de impressao do Chrome.
public class AvisoSemFoco : System.Windows.Forms.Form {
    protected override bool ShowWithoutActivation { get { return true; } }
    protected override System.Windows.Forms.CreateParams CreateParams {
        get { var cp = base.CreateParams; cp.ExStyle |= 0x08000000 | 0x00000008; return cp; }   // NOACTIVATE | TOPMOST
    }
}
"@ -ReferencedAssemblies System.Windows.Forms, System.Drawing

function Show-Aviso {
    param([string]$Texto)
    $f = New-Object AvisoSemFoco
    $f.FormBorderStyle = "None"; $f.ShowInTaskbar = $false; $f.StartPosition = "Manual"
    $f.BackColor = [System.Drawing.Color]::FromArgb(248, 219, 31); $f.Padding = New-Object System.Windows.Forms.Padding(14)
    $f.AutoSize = $true; $f.AutoSizeMode = "GrowAndShrink"
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $Texto; $l.AutoSize = $true; $l.ForeColor = [System.Drawing.Color]::Black
    $l.Font = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
    $f.Controls.Add($l)
    $f.Show()
    $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    $f.Location = New-Object System.Drawing.Point(($area.Right - $f.Width - 20), ($area.Top + 90))
    return $f
}

$log = Join-Path $PSScriptRoot "abrir-para-imprimir.log"
function Write-Log { param([string]$t) Add-Content -LiteralPath $log -Value "$(Get-Date -Format 'dd/MM HH:mm:ss') $t" -Encoding UTF8 }
$antes = [JanelaAtiva]::Titulo()
Write-Log "abrindo $Arquivo (janela antes: $antes)"
# Imagens abrem no app Fotos por padrao: forca o Chrome para usar a mesma tela de impressao do PDF.
$deteccao = $null
if ([System.IO.Path]::GetExtension($Arquivo) -eq ".pdf") {
    Start-Process -FilePath $Arquivo
    # Procura o codigo de barras em paralelo, enquanto o Chrome abre o PDF.
    $saidaDeteccao = Join-Path $env:TEMP "nexcafe-barcode-$PID.json"
    $deteccao = Start-Process powershell.exe -WindowStyle Hidden -PassThru -RedirectStandardOutput $saidaDeteccao -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$(Join-Path $PSScriptRoot 'server\print-pdf.ps1')`"", "-Action", "Barcode", "-Path", "`"$Arquivo`"")
}
else {
    $chrome = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe').'(default)'
    # Perfil do WhatsApp (Profile 21): a aba abre ativa na janela em que o atendente baixou o arquivo.
    Start-Process -FilePath $chrome -ArgumentList "--profile-directory=`"Profile 21`"", "`"$Arquivo`""
}
$nome = [System.IO.Path]::GetFileNameWithoutExtension($Arquivo)

# Espera a aba do PDF ficar na frente. So aperta Ctrl+P se a janela ativa for o Chrome mostrando este PDF,
# nunca na aba do WhatsApp, para nao imprimir a conversa por engano.
# Ate 40 s: com o Drive (L:) ocupado o Chrome pode demorar a mostrar a aba.
for ($i = 0; $i -lt 80; $i++) {
    Start-Sleep -Milliseconds 500
    $titulo = [JanelaAtiva]::Titulo()
    $proc = (Get-Process -Id ([JanelaAtiva]::Processo()) -ErrorAction SilentlyContinue).ProcessName
    if ($i % 4 -eq 0) { Write-Log "  $i $proc | $titulo" }
    if ($proc -ne "chrome" -or $titulo -match "WhatsApp") { continue }
    # Exige o nome do arquivo no titulo: outra janela do Chrome nunca recebe o Ctrl+P.
    if ($titulo.Contains($nome)) {
        Start-Sleep -Milliseconds 1200   # deixa o leitor de PDF terminar de carregar
        [System.Windows.Forms.SendKeys]::SendWait("^p")
        Write-Log "  Ctrl+P enviado"
        # Segura a fila ate o atendente sair desta aba (fechar ou voltar ao WhatsApp), no maximo 15 min.
        # Enquanto isso, quando a deteccao terminar, mostra em que pagina esta o codigo de barras (so se tiver 2+ paginas).
        $fim = (Get-Date).AddMinutes(15); $aviso = $null
        while ((Get-Date) -lt $fim -and [JanelaAtiva]::Titulo() -eq $titulo) {
            if ($deteccao -and $deteccao.HasExited) {
                $r = $null; try { $r = Get-Content -LiteralPath $saidaDeteccao -Raw | ConvertFrom-Json } catch {}
                Remove-Item -LiteralPath $saidaDeteccao -ErrorAction SilentlyContinue
                $deteccao = $null
                $paginas = @($r.pages)
                if ($r.ok -and $r.total -gt 1 -and $paginas.Count) {
                    $texto = if ($paginas.Count -eq 1) { "Codigo de barras na pagina $($paginas[0]) (de $($r.total))" } else { "Codigo de barras nas paginas $($paginas -join ', ') (de $($r.total))" }
                    $aviso = Show-Aviso $texto
                    Write-Log "  aviso: $texto"
                }
            }
            [System.Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds 300
        }
        if ($aviso) { $aviso.Close() }
        Write-Log "  saiu da aba"
        exit
    }
}
Write-Log "  desisti: a aba do PDF nao ficou na frente"
