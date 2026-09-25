@echo off
setlocal
cd /d "%~dp0"
echo === 1. Sintaxe ===
call npm run check
if errorlevel 1 goto fim
echo.
echo === 2. Testes ===
call npm test
if errorlevel 1 goto fim
echo.
echo Tudo OK. Iniciando o servidor em http://localhost:4780
node server\server.js
:fim
pause
