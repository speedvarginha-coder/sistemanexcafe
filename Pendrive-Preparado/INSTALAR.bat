@echo off
setlocal
if not exist "%~dp0LanHouseManager-Estacoes\Instalar-Agente.bat" (
  echo ERRO: pacote de estacoes nao encontrado.
  pause
  exit /b 1
)
call "%~dp0LanHouseManager-Estacoes\Instalar-Agente.bat"
exit /b %errorlevel%
