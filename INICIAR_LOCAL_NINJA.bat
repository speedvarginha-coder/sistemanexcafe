@echo off
title Local Ninja - Painel Google Meu Negocio (Speed Financeira)
echo ========================================================
echo   Iniciando Local Ninja v1.1.0 - Speed Financeira
echo   Banco de Dados: PostgreSQL 16 (Local)
echo   Painel Web: http://localhost:3000
echo ========================================================
start http://localhost:3000
cd /d "D:\GiraLocal Projeto Google Meu Negócio\Gestão Google Meu Negócio SEO\local-ninja"
pnpm dev
pause
