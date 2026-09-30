@echo off
setlocal
rem Recoloca a conta do cliente no grupo Usuarios. O resultado fica em LanHouseManager-Estacoes\conta-cliente.txt.
echo Confirme o aviso de administrador (Sim). Se pedir senha, use a da conta Tecnico.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0LanHouseManager-Estacoes\Corrigir-Conta.ps1\"'"
