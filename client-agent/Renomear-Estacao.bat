@echo off
setlocal
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Pedindo permissao de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo ============================================================
echo  LanHouseManager - RENOMEAR ESTACAO
echo  Uso: informe o numero da maquina (ex: 11)
echo ============================================================
echo.

set /p NUM="Numero da maquina (11 a 19): "
if "%NUM%"=="" (
  echo Numero invalido.
  pause
  exit /b 1
)

set NOVO=maquina-%NUM%

echo.
echo Renomeando este computador para "%NOVO%" ...
powershell -NoProfile -Command "Rename-Computer -NewName '%NOVO%' -Force"

echo.
echo ============================================================
echo  O PC PRECISA REINICIAR para aplicar o novo nome.
echo  Depois de reiniciar, execute Instalar-Agente.bat como admin.
echo  Ele vai registrar a estacao com o novo ID "%NOVO%".
echo  (O registro antigo voce remove depois no painel, botao Remover.)
echo ============================================================
echo.
choice /c SN /m "Reiniciar agora"
if errorlevel 2 exit /b 0
shutdown /r /t 10 /c "LanHouseManager: renomeando para %NOVO%"
pause
