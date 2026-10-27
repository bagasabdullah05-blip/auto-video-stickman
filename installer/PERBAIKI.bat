@echo off
chcp 65001 >nul 2>&1
title Perbaiki Viral Video Studio
set "ROOT=%~dp0"
if not exist "%ROOT%agent\package.json" if exist "%ROOT%..\agent\package.json" set "ROOT=%~dp0.."
cd /d "%ROOT%"
if exist "%ROOT%\tools\node\node.exe" set "PATH=%ROOT%\tools\node;%PATH%"
where node >nul 2>&1
if errorlevel 1 (
  call "%ROOT%\INSTALL.bat"
  exit /b 0
)
cd /d "%ROOT%\agent"
echo  Memasang ulang komponen yang hilang...
call npm install --no-audit --no-fund
node tools-setup.js --repair
echo.
pause
