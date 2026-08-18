# Auto Video Stickman

Toolkit **gratis** untuk membuat video YouTube animasi stickman doodle edukatif — dari script sampai upload, tanpa bayar.

## Cara Install (Windows)

1. Klik kanan `setup.bat` → **Run as administrator**
2. Tunggu sampai selesai (otomatis install Node.js + dependencies)
3. Panduan akan terbuka di browser — ikuti langkahnya

## Cara Install Manual

```
git clone https://github.com/bagasabdullah05-blip/auto-video-stickman.git
cd auto-video-stickman\agent
npm install
node run.js status
```

## Yang Dibutuhkan

- Windows 10/11
- Internet (untuk install awal + generate gambar/suara)
- Browser Chrome atau Edge

## Fitur

| Fitur | Status |
|-------|--------|
| Script (AI) | Gratis |
| Suara / TTS | Gratis (Edge TTS) |
| Timestamp / STT | Gratis (Whisper) |
| Prompt gambar (AI) | Gratis |
| Generate gambar | Gratis (Google Flow + Zappy) |
| Rakit video | Gratis (WebCodecs) |
| Metadata YouTube | Gratis (AI) |

## Folder Kerja

```
01-script/    Script narasi
02-audio/     Voiceover MP3
03-prompt/    Timestamp + prompt gambar
04-gambar/    Gambar scene
05-video/     Video hasil akhir
```

## Lisensi

Free to use. Dibuat untuk komunitas creator pemula.
