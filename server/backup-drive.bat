@echo off
rem Copia o backup diario do Nexcafe (banco, anexos, chave do cofre) para o Google Drive.
rem Roda na conta do usuario, que enxerga o Drive (L:). Nao apaga nada no destino.
if not exist "L:\Meu Drive" exit /b 1
robocopy "C:\LanHouseManager-Backup" "L:\Meu Drive\Backup Nexcafe" /E /R:2 /W:5 /NP /NFL /NDL >> "%~dp0backup-drive.log"
if %ERRORLEVEL% GEQ 8 exit /b 1
exit /b 0
