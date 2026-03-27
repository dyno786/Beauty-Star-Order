@echo off
title Beauty Star Orders
cd /d "%~dp0"

REM Install dependencies silently if not already installed
IF NOT EXIST "node_modules\mssql" (
    echo Installing... please wait...
    npm install --save mssql --silent 2>nul
)

:loop
node orders-bs.js
echo.
echo Restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto loop
