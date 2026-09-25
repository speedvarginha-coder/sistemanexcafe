@echo off
setlocal
echo ============================================================
echo  LanHouseManager - parar agente e remover inicio automatico
echo ============================================================
echo.
echo Fechando agentes e telas de bloqueio...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Parar-Processos-Agente.ps1"

echo Removendo inicio automatico (comum e do usuario)...
del /F /Q "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\LanHouseManager-Agent.bat" >nul 2>&1
del /F /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LanHouseManager-Agent.bat" >nul 2>&1

echo.
echo Pronto. A tela de bloqueio nao deve mais aparecer.
echo Para reativar o agente depois, rode Instalar-Agente.bat (como administrador).
echo.
pause
