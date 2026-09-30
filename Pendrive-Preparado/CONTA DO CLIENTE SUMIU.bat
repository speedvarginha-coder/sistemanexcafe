@echo off
setlocal
rem Recoloca a conta do cliente no grupo Usuarios (sem grupo o Windows esconde a conta da tela de entrada).
net session >nul 2>&1
if errorlevel 1 (
  echo Confirme o aviso de administrador. Se pedir senha, use a da conta Tecnico.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo Contas desta maquina:
net user
set "conta="
set /p conta=Digite o nome da conta do cliente (ex.: COMPUTADOR-15) e aperte Enter:
if "%conta%"=="" goto fim
powershell -NoProfile -Command "$g = (Get-LocalGroup -SID 'S-1-5-32-545').Name; try { Add-LocalGroupMember -Group $g -Member '%conta%' -ErrorAction Stop; Write-Host 'Pronto: conta colocada no grupo' $g -ForegroundColor Green } catch { if ($_.Exception.Message -match 'membro|member') { Write-Host 'A conta ja estava no grupo' $g -ForegroundColor Yellow } else { Write-Host ('Erro: ' + $_.Exception.Message) -ForegroundColor Red } }"
echo.
net user "%conta%" | findstr /i "Grupo Group"
echo.
echo Saia da conta Tecnico: a conta do cliente deve aparecer na tela de entrada.
:fim
pause
