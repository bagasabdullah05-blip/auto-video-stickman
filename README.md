# Viral Video Studio

Toolkit **gratis** untuk membuat video YouTube edukasi: dari paket ZIP (gambar + suara)
menjadi video jadi, deskripsi otomatis, lalu upload + jadwal ke YouTube.

## Untuk Tim / PC Baru

Unduh installer dari halaman **Releases**:

https://github.com/bagasabdullah05-blip/auto-video-stickman/releases/latest

Cara pakai:

1. Ekstrak `ViralVideoStudio-Portable.zip`
2. Klik 2x `ViralVideoStudio.bat` (atau `INSTALL.bat`)
3. Tunggu sekali saja (5-15 menit, otomatis unduh Node.js + ffmpeg + sharp)
4. Aplikasi terbuka; berikutnya cukup klik ikon **Viral Video Studio** di Desktop

Tidak perlu memasang Node.js, ffmpeg, atau DLL apa pun secara manual.

## Isi yang dipasang otomatis

- Node.js 22 portable (di `tools\node`, tidak mengubah sistem)
- ffmpeg (gabung audio + mesin rakit cadangan)
- sharp (gambar + thumbnail YouTube)
- whisper (timestamp otomatis), suara Edge TTS

## Alur di aplikasi

1. **Akun YouTube** - tempel OAuth Client, Hubungkan
2. **Buat Materi** - buka link Gemini, unduh paket ZIP
3. **Paket ZIP** - pilih ZIP, Rakit Video (atau OTOMATIS)
4. **Deskripsi** - judul + deskripsi + chapters otomatis
5. **Upload** - privasi, jadwal tayang, thumbnail
6. **Video Tayang** - daftar video di channel

## Struktur

```
agent/       kode aplikasi (run.js, StudioApp.ps1, lib/)
installer/   INSTALL.bat, launcher, unduh Node, panduan
dist/        hasil build installer (tidak di-commit)
```

## Build installer sendiri

```
installer\BUILD-INSTALLER.bat
```

Hasil: `dist\ViralVideoStudio-Portable.zip`

## Instal manual (development)

```
git clone https://github.com/bagasabdullah05-blip/auto-video-stickman.git
cd auto-video-stickman\agent
npm install
node tools-setup.js --repair
node run.js status
```

## Kebutuhan

- Windows 10/11 64-bit
- Internet saat instalasi dan upload
- Microsoft Edge / Google Chrome (sudah ada di Windows; kalau tidak ada otomatis pakai ffmpeg)
