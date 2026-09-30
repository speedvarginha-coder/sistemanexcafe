@echo off
setlocal
rem Recoloca a conta do cliente no grupo Usuarios (sem grupo o Windows esconde a conta da tela de entrada).
net session >nul 2>&1
if errorlevel 1 (
  echo Confirme o aviso de administrador. Se pedir senha, use a da conta Tecnico.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$cfg = 'C:\LanHouseManagerAgent\agent-config.json';" ^
  "$contas = if (Test-Path $cfg) { @((Get-Content -Raw $cfg | ConvertFrom-Json).ProtectedUsers) } else { @() };" ^
  "if (-not $contas) { $contas = @(Read-Host 'Digite o nome da conta do cliente (ex.: COMPUTADOR-15)') };" ^
  "$grupo = (Get-LocalGroup -SID 'S-1-5-32-545').Name;" ^
  "foreach ($c in $contas) { if (-not $c) { continue }; Write-Host ('Conta do cliente: ' + $c); & net.exe localgroup $grupo $c /add; & net.exe user $c | Select-String 'Associa|Group' };" ^
  "Write-Host ''; Write-Host 'Pronto. Saia da conta Tecnico: a conta do cliente deve aparecer na tela de entrada.' -ForegroundColor Green"
echo.
echo (Se aparecer "ja e membro do grupo", a conta ja estava certa.)
pause
