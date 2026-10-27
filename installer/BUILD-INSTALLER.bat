@echo off
chcp 65001 >nul 2>&1
title Build Installer Viral Video Studio
cd /d "%~dp0.."
set "ROOT=%CD%"
set "DST=%ROOT%\dist\ViralVideoStudio"

echo  Membersihkan hasil lama...
if exist "%DST%" rmdir /s /q "%DST%"
mkdir "%DST%"

echo  Menyalin kode aplikasi (tanpa data dan rahasia)...
robocopy "%ROOT%\agent" "%DST%\agent" /E /XD node_modules 06-viral 01-script 02-audio 03-prompt 04-gambar 05-video youtube-accounts .cache tools /XF youtube-client.json .youtube-token.json channel.json crash.log *.log description.txt upload-meta.json title.txt description-src.txt cutpoints.json timestamp.txt image_prompts.txt voiceover.mp3 video.mp4 .installed server.js /NFL /NDL /NJH /NJS >nul

for %%D in (01-script 02-audio 03-prompt 04-gambar 05-video youtube-accounts) do mkdir "%DST%\agent\%%D" 2>nul

echo  Menyalin file installer...
copy /y "%ROOT%\installer\INSTALL.bat" "%DST%\" >nul
copy /y "%ROOT%\installer\ViralVideoStudio.bat" "%DST%\" >nul
copy /y "%ROOT%\installer\PERBAIKI.bat" "%DST%\" >nul
copy /y "%ROOT%\installer\tools-dl-node.ps1" "%DST%\" >nul
copy /y "%ROOT%\installer\CARA-PAKAI.txt" "%DST%\" >nul
copy /y "%ROOT%\README.md" "%DST%\" >nul
if exist "%ROOT%\master_prompt.txt" copy /y "%ROOT%\master_prompt.txt" "%DST%\" >nul

echo  Membuat ZIP...
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path '%ROOT%\dist\ViralVideoStudio-Portable.zip') { Remove-Item '%ROOT%\dist\ViralVideoStudio-Portable.zip' -Force }; Compress-Archive -LiteralPath '%DST%' -DestinationPath '%ROOT%\dist\ViralVideoStudio-Portable.zip' -Force"

echo.
echo  Selesai: %ROOT%\dist\ViralVideoStudio-Portable.zip
dir "%ROOT%\dist\ViralVideoStudio-Portable.zip" | findstr /i zip
pause
