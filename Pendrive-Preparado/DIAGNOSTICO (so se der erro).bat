@echo off
setlocal
echo Coletando diagnostico do agente (leva cerca de 30 segundos)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0LanHouseManager-Estacoes\Diagnostico.ps1"
echo.
echo Pronto. Traga o pendrive de volta ao caixa.
pause
