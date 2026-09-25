@echo off
setlocal
echo ============================================================
echo  LanHouseManager - atualizar agente (execute como ADMIN)
echo ============================================================
echo.

if not exist "C:\LanHouseManagerAgent\agent-config.json" (
  echo ATENCAO: nao encontrei C:\LanHouseManagerAgent\agent-config.json
  echo Rode primeiro o Instalar-Agente.bat. Abortando.
  echo.
  pause
  exit /b 1
)

echo 1) Parando agentes e telas de bloqueio antigos...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Parar-Processos-Agente.ps1"

echo 2) Removendo inicios automaticos duplicados...
del /F /Q "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\LanHouseManager-Agent.bat" >nul 2>&1
del /F /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LanHouseManager-Agent.bat" >nul 2>&1

echo 3) Copiando o agente novo...
if not exist "C:\LanHouseManagerAgent" mkdir "C:\LanHouseManagerAgent"
copy /Y "%~dp0LanHouseAgent.ps1" "C:\LanHouseManagerAgent\LanHouseAgent.ps1" >nul

echo 4) Recriando o inicio automatico (unico)...
> "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\LanHouseManager-Agent.bat" echo @echo off
>> "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\LanHouseManager-Agent.bat" echo powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "C:\LanHouseManagerAgent\LanHouseAgent.ps1" -Action Run

echo.
echo Agente atualizado. Agora SAIA e ENTRE novamente no usuario cliente
echo (ou reinicie o PC). Depois clique Bloquear no painel.
echo.
pause
