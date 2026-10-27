@echo off
chcp 65001 >nul 2>&1
title Viral Video Studio
set "ROOT=%~dp0"
if not exist "%ROOT%agent\StudioApp.ps1" if exist "%ROOT%..\agent\StudioApp.ps1" set "ROOT=%~dp0.."
cd /d "%ROOT%\agent"

if not exist "%ROOT%\agent\.installed" goto :belum
if not exist "%ROOT%\agent\node_modules" goto :belum
if not exist "%ROOT%\agent\StudioApp.ps1" goto :rusak

if exist "%ROOT%\tools\node\node.exe" set "PATH=%ROOT%\tools\node;%PATH%"
start "" powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\agent\StudioApp.ps1"
exit /b 0

:belum
echo.
echo  Aplikasi belum terpasang di PC ini.
echo  Memulai instalasi otomatis sekarang (sekali saja)...
echo.
call "%ROOT%\INSTALL.bat"
exit /b 0

:rusak
echo.
echo  File aplikasi tidak lengkap. Jalankan INSTALL.bat.
echo.
pause
exit /b 1
