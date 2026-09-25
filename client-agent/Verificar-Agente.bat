@echo off
setlocal
set "config=C:\LanHouseManagerAgent\agent-config.json"
if not exist "%config%" goto missing
if not exist "C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\LanHouseManager-Agent.bat" goto missing
set "server="
for /f "tokens=2 delims=, " %%A in ('findstr /C:"ServerUrl" "%config%"') do set "server=%%~A"
if not defined server goto missing
curl.exe --silent --show-error --fail --max-time 5 "%server%/api/bootstrap" >nul
if errorlevel 1 goto offline
echo.
echo Instalacao e conexao com o servidor OK.
echo No painel, confira que esta maquina aparece DISPONIVEL, nao OFFLINE.
echo Depois, teste liberar e encerrar uma sessao.
pause
exit /b 0
:offline
echo ERRO: nao foi possivel conectar ao servidor %server%.
echo Confira rede e servidor. No painel, a maquina deve aparecer online.
pause
exit /b 1
:missing
echo ERRO: instalacao incompleta. Entre na conta Tecnico e refaca 1 - INSTALAR.bat.
pause
exit /b 1
