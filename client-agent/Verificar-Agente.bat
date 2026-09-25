@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0LanHouseAgent.ps1" -Action Status
if errorlevel 1 (
  echo.
  echo Falha na verificacao do agente. Confira a mensagem acima.
  pause
  exit /b 1
)
echo.
pause
