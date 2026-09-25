@echo off
setlocal
if exist "%~dp0erro-instalacao.txt" del /f /q "%~dp0erro-instalacao.txt" >nul 2>&1
echo Instalando o agente nesta estacao. Confirme o aviso de administrador.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Instalar-Agente.ps1"
if errorlevel 1 (
  echo.
  echo A instalacao falhou. Confira a mensagem acima ou na janela do instalador.
  if exist "%~dp0erro-instalacao.txt" (
    echo.
    echo ----- Detalhe do erro [salvo em %~dp0erro-instalacao.txt] -----
    type "%~dp0erro-instalacao.txt"
  )
  pause
  exit /b 1
)
echo.
echo Instalacao concluida. Execute Capturar-Padrao.bat e depois reinicie a estacao.
pause
