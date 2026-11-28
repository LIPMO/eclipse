@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js n'est pas installe : telecharge-le sur https://nodejs.org puis relance. & pause & exit /b)
if not exist ".env" (copy ".env.example" ".env" >nul & echo Remplis le fichier .env puis relance start.bat & notepad .env & exit /b)
if not exist "node_modules" (echo Installation des dependances... & call npm install --omit=dev)
echo Demarrage du bot ECLIPSE...
node index.js
pause
