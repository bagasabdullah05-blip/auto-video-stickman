@echo off
chcp 65001 >nul 2>&1
title Auto Video Stickman — Dashboard

echo.
echo  ============================================
echo   AUTO VIDEO STICKMAN — Dashboard
echo  ============================================
echo.
echo  Membuka dashboard di browser...
echo  URL: http://localhost:5000
echo.
echo  Tekan Ctrl+C untuk berhenti.
echo.

cd /d "%~dp0agent"
node server.js
