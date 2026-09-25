@echo off
setlocal
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Pedindo permissao de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo ============================================================
echo  LanHouseManager - CORRIGIR AGENTE (roda sozinho)
echo ============================================================
echo.
echo 1) Parando agentes antigos...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Parar-Processos-Agente.ps1"
timeout /t 2 /nobreak >nul

echo 2) Removendo inicios automaticos duplicados...
del /F /Q "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\LanHouseManager-Agent.bat" >nul 2>&1
del /F /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LanHouseManager-Agent.bat" >nul 2>&1

echo 3) Copiando o agente novo...
if not exist "C:\LanHouseManagerAgent" mkdir "C:\LanHouseManagerAgent"
copy /Y "%~dp0LanHouseAgent.ps1" "C:\LanHouseManagerAgent\LanHouseAgent.ps1" >nul
if errorlevel 1 (
  echo ERRO: nao consegui copiar o LanHouseAgent.ps1 do pen drive.
  pause
  exit /b 1
)

echo 4) Recriando o inicio automatico...
> "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\LanHouseManager-Agent.bat" echo @echo off
>> "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\LanHouseManager-Agent.bat" echo powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "C:\LanHouseManagerAgent\LanHouseAgent.ps1" -Action Run

echo.
echo TUDO CERTO. Reinicie para ativar o agente atualizado.
echo Depois do reinicio, no painel, clique Bloquear para ver a tela com Login e Senha.
echo.
choice /c SN /m "Reiniciar agora"
if errorlevel 2 exit /b 0
shutdown /r /t 10 /c "LanHouseManager: aplicando agente novo"
pause
