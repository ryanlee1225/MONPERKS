@echo off
cd /d "%~dp0"
echo MONPERKS local demo - requires Node.js 24 or later
echo Open http://localhost:4173 after the server is ready.
node api\server.mjs
pause
