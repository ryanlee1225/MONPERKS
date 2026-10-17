@echo off
cd /d "%~dp0"
echo MONPERKS local demo - requires Node.js 24 or later
if not exist node_modules\ethers call npm ci
call npm run build
if errorlevel 1 exit /b 1
echo Open http://localhost:4173 after the server is ready.
node api\server.mjs
pause
