@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Capturar-Padrao.ps1"
if errorlevel 1 (
  echo.
  echo Falha ao capturar o padrao. Confira a mensagem acima ou na janela do agente.
  pause
  exit /b 1
)
echo.
echo Padrao salvo. Reinicie e entre no perfil do cliente.
pause
