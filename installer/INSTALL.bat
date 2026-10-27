@echo off
chcp 65001 >nul 2>&1
title Instalasi Viral Video Studio
set "ROOT=%~dp0"
if not exist "%ROOT%agent\package.json" if exist "%ROOT%..\agent\package.json" set "ROOT=%~dp0.."
cd /d "%ROOT%"

echo.
echo  ==================================================
echo   INSTALASI VIRAL VIDEO STUDIO (cukup sekali)
echo  ==================================================
echo   Semua kebutuhan dipasang otomatis di sini.
echo   Butuh internet. Perkiraan 5-15 menit.
echo.

set "NODEEXE="
if exist "%ROOT%\tools\node\node.exe" set "NODEEXE=%ROOT%\tools\node\node.exe"
if not defined NODEEXE (
  where node >nul 2>&1
  if not errorlevel 1 set "NODEEXE=node"
)
if not defined NODEEXE (
  echo  [1/4] Node.js belum ada, mengunduh otomatis...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\tools-dl-node.ps1" "%ROOT%\tools"
  if exist "%ROOT%\tools\node\node.exe" set "NODEEXE=%ROOT%\tools\node\node.exe"
)
if not defined NODEEXE (
  echo.
  echo  GAGAL: Node.js tidak tersedia. Cek internet lalu jalankan INSTALL.bat lagi.
  pause
  exit /b 1
)
set "PATH=%ROOT%\tools\node;%PATH%"
echo  [1/4] Node.js siap:
"%NODEEXE%" --version

cd /d "%ROOT%\agent"
if not exist "package.json" (
  echo  GAGAL: paket tidak lengkap, file agent\package.json tidak ada.
  pause
  exit /b 1
)

echo.
echo  [2/4] Memasang komponen (jangan tutup jendela ini)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo  Percobaan kedua...
  call npm install --no-audit --no-fund
)

echo.
echo  [3/4] Memeriksa dan melengkapi komponen...
"%NODEEXE%" tools-setup.js --repair
if errorlevel 1 (
  echo.
  echo  Ada komponen yang belum siap, mencoba sekali lagi...
  call npm install --no-audit --no-fund
  "%NODEEXE%" tools-setup.js --repair
)
if errorlevel 1 (
  echo.
  echo  ==================================================
  echo   BELUM SEPENUHNYA SIAP
  echo  ==================================================
  echo  Biasanya karena internet terputus saat unduh.
  echo  Sambungkan internet lalu jalankan INSTALL.bat lagi,
  echo  atau jalankan PERBAIKI.bat.
  echo.
  pause
  exit /b 1
)

echo.
echo  [4/4] Membuat tombol pintasan di Desktop...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Viral Video Studio.lnk'); $s.TargetPath='%ROOT%\ViralVideoStudio.bat'; $s.WorkingDirectory='%ROOT%'; $s.IconLocation='%SystemRoot%\System32\shell32.dll,116'; $s.Save()" >nul 2>&1
echo  dibuat: "Viral Video Studio" di Desktop

echo terpasang %DATE% %TIME%> "%ROOT%\agent\.installed"

echo.
echo  ==================================================
echo   SELESAI - SEMUA SIAP
echo  ==================================================
echo   Mulai sekarang cukup klik "Viral Video Studio"
echo   di Desktop, atau ViralVideoStudio.bat di folder ini.
echo.
pause
start "" "%ROOT%\ViralVideoStudio.bat"
