@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Programa do WhatsApp - Cozinha Sem Fronteiras

if not exist ".env" (
  echo Falta o arquivo .env. Copie o ".env.exemplo" para ".env" e preencha. Veja o LEIA-ME.md.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando pela primeira vez, aguarde...
  call npm install --no-audit --no-fund
)

:inicio
node index.js
echo.
echo O programa parou. Reiniciando em 10 segundos... (feche esta janela para parar de vez)
timeout /t 10 >nul
goto inicio
