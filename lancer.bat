@echo off
cd /d "%~dp0"
title ECLIPSE - serveur de jeu
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n est pas installe. Telecharge-le sur https://nodejs.org puis relance ce fichier.
  pause
  exit /b 1
)
set "PORT=%~1"
if "%PORT%"=="" set /p "PORT=Port a utiliser (Entree = 3000) : "
if "%PORT%"=="" set "PORT=3000"
if not exist node_modules (
  echo Installation des dependances, une seule fois...
  call npm install --omit=dev
)
node server\server.js --port %PORT%
pause
