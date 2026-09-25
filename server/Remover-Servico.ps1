$ErrorActionPreference = "Continue"
foreach ($name in @("LanHouseManager-Servidor", "LanHouseManager-Impressora")) {
    try {
        Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction Stop
        Write-Host "Removida: $name"
    } catch {
        Write-Host "Nao encontrada ou ja removida: $name"
    }
}
Write-Host "Servico removido. O sistema nao inicia mais automaticamente."
