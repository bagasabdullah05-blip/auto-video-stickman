@echo off
chcp 65001 >nul 2>&1
title Auto Video Stickman — Installer

echo.
echo  ============================================
echo   AUTO VIDEO STICKMAN — Installer
echo  ============================================
echo.

:: -----------------------------------------------
:: 1. Cek Node.js
:: -----------------------------------------------
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Node.js belum terinstall.
    echo  [~] Mencoba install via winget...
    echo.
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo.
        echo  [!] Gagal install otomatis. Silakan install manual:
        echo      https://nodejs.org
        echo.
        pause
        exit /b 1
    )
    echo.
    echo  [OK] Node.js berhasil diinstall.
    echo  [~] Memperbarui PATH...
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
) else (
    echo  [OK] Node.js terdeteksi.
)

node -v
echo.

:: -----------------------------------------------
:: 2. Clone atau update repo
:: -----------------------------------------------
set "REPO_URL=https://github.com/bagasabdullah05-blip/auto-video-stickman.git"
set "TARGET=%~dp0auto-video-stickman"

if exist "%TARGET%" (
    echo  [~] Repo sudah ada, update...
    cd /d "%TARGET%"
    git pull
) else (
    echo  [~] Mengunduh repo...
    git clone %REPO_URL% "%TARGET%"
    cd /d "%TARGET%"
)

if %errorlevel% neq 0 (
    echo  [!] Gagal mengunduh repo. Pastikan internet aktif.
    pause
    exit /b 1
)

echo  [OK] Repo siap di: %TARGET%
echo.

:: -----------------------------------------------
:: 3. Install dependencies
:: -----------------------------------------------
echo  [~] Install dependencies (npm install)...
echo.
cd /d "%TARGET%\agent"
call npm install

if %errorlevel% neq 0 (
    echo  [!] Gagal install dependencies.
    pause
    exit /b 1
)

echo.
echo  [OK] Semua dependencies terinstall.
echo.

:: -----------------------------------------------
:: 4. Jalankan status check
:: -----------------------------------------------
echo  [~] Mengecek status folder...
echo.
node run.js status
echo.

:: -----------------------------------------------
:: 5. Selesai
:: -----------------------------------------------
echo  ============================================
echo   INSTALASI SELESAI!
echo  ============================================
echo.
echo  Folder proyek: %TARGET%
echo.
echo  Langkah selanjutnya:
echo    1. Buka file flow-kerja-video-stickman.html
echo    2. Ikuti panduan langkah demi langkah
echo.
echo  Atau jalankan perintah manual dari folder agent\:
echo    node run.js status
echo    node run.js voices
echo    node run.js tts --input 01-script/script_x.txt
echo.

:: Buka panduan HTML
start "" "%TARGET%\flow-kerja-video-stickman.html"

pause
