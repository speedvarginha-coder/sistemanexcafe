@echo off
setlocal
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Pedindo permissao de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo ============================================================
echo  LanHouseManager - PREPARAR ANTIVIRUS
echo  Rode isto UMA vez antes do Instalar-Agente.bat
echo ============================================================
echo.

echo 1) Desbloqueando arquivos do pen drive (Mark of the Web)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%~dp0' -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue"

echo 2) Adicionando exclusoes no Windows Defender...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = ('%~dp0').TrimEnd('\'); Add-MpPreference -ExclusionPath $p; Add-MpPreference -ExclusionPath 'C:\LanHouseManagerAgent'; Write-Host ('   Adicionado: ' + $p + '  e  C:\LanHouseManagerAgent')"

echo 3) Exclusoes ativas agora:
powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-MpPreference).ExclusionPath"

echo.
echo TUDO CERTO. Agora execute Instalar-Agente.bat como administrador.
echo Se mesmo assim o antivirus bloquear, avise: pode ser outro antivirus
echo instalado (Avast, AVG, Kaspersky etc.), e ai a exclusao precisa ser
echo feita dentro dele.
echo.
pause
