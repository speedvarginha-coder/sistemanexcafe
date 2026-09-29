@echo off
setlocal
echo Verificacao de seguranca da maquina. Confirme o aviso de administrador (Sim).
echo Ela remove excecoes suspeitas do antivirus, liga a protecao, esvazia a pasta Downloads
echo e faz a verificacao completa. Pode demorar bastante.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0LanHouseManager-Estacoes\Verificar-Seguranca.ps1\" -UserProfile \"%USERPROFILE%\"'"
