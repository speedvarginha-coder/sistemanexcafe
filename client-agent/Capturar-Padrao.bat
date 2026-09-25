@echo off
setlocal
set "config=C:\LanHouseManagerAgent\agent-config.json"
if not exist "%config%" goto missing
if not exist "C:\LanHouseManagerAgent\Baseline\" goto missing
set "capture="
for /f "tokens=2 delims=, " %%A in ('findstr /C:"LastCapture" "%config%"') do set "capture=%%~A"
if not defined capture goto missing
if /I "%capture%"=="null" goto missing
echo.
echo Padrao capturado em %capture%.
echo Reinicie e entre no perfil do cliente.
pause
exit /b 0
:missing
echo ERRO: padrao ausente ou incompleto.
echo Entre na conta Tecnico e execute 1 - INSTALAR.bat novamente.
pause
exit /b 1
