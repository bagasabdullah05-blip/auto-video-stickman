# Flow Video Agent — Toolkit Video Stick Man (Gratis)

Pipeline otomatis pembuatan video stick man doodle edukatif, mengikuti alur video
tutorial populer. Semua komponen **gratis tanpa API key** (TTS, STT, rakit video).
Gambar bisa dibuat manual (Google Flow + Zappy) atau via API Gemini (opsional).

Struktur alur: **Script → Suara (TTS) → Timestamp (STT) → Prompt → Gambar → Rakit video**.

## Persyaratan

- Node.js 18+ (sudah dipakai di proyek ini)
- Microsoft Edge atau Google Chrome (dipakai mesin rakit WebCodecs)
- Koneksi internet pada pemakaian pertama (unduh model Whisper & library TTS)

## Instalasi

```bash
cd agent
npm install
```

Semua perintah dijalankan dari folder `agent\`.

## Alur kerja

1. **Script** — tulis narasi sendiri (plain text), simpan ke `01-script/script_[topik].txt`.
2. **Suara (TTS)** — ubah script jadi audio MP3:
   ```bash
   node run.js tts --input 01-script/script_mengapa_takut_gelap.txt
   ```
   Output: `02-audio/voiceover.mp3`. Ganti suara dengan `--voice <id>`.
3. **Timestamp (STT)** — transkripsi audio + hitung per-kalimat:
   ```bash
   node run.js stt --input 02-audio/voiceover.mp3
   ```
   Output: `03-prompt/timestamp.txt` (timestamp per kalimat) dan `cutpoints.json`.
   Setiap kalimat = 1 scene. Model default: `Xenova/whisper-base.en`.
4. **Prompt gambar** — buat file `03-prompt/image_prompts.txt`: 1 baris = 1 prompt
   untuk 1 scene, dipisah 1 baris kosong. (Bisa ditulis agent opencode.)
5. **Gambar** — pilih salah satu mode:
   - **Manual (default)** — `node run.js images` menampilkan panduan Google Flow +
     Zappy. User generate di browser lalu paste gambar ke `04-gambar/`. Beri nama
     `[mm-ss]_...` atau `scene_XXXX.jpg` sesuai urutan timestamp.
   - **API Gemini** — butuh key:
     ```bash
     node run.js images --api --prompts 03-prompt/image_prompts.txt
     ```
     (Isi `config.json` -> `api.geminiKey` atau pakai `--key`.)
6. **Rakit video** — gabungkan gambar + audio + cutpoints:
   ```bash
   node run.js assemble --audio 02-audio/voiceover.mp3
   ```
   Output: `05-video/video.mp4`. Jika file sudah ada, hasil baru otomatis
   diberi nomor versi (`video_2.mp4`, `video_3.mp4`, dst) tanpa menimpa.
   Untuk menimpa secara sengaja, gunakan `--out` eksplisit.

## Perintah CLI

```text
node run.js status                      Lihat isi semua folder kerja
node run.js voices                      Daftar suara Edge TTS
node run.js tts --input <file> [--voice <id>] [--out <file>]
node run.js stt --input <file> [--model <id>]
node run.js images                      Mode manual (panduan Google Flow + Zappy)
node run.js images --api --prompts <f>  Mode API Gemini [--key <k>] [--model <id>]
node run.js assemble --audio <file> [--out <file>] [--engine <mesin>]
```

## Mesin rakit video

- `--engine webcodecs` (**default**) — render OffscreenCanvas di Web Worker +
  VideoEncoder/AudioEncoder perangkat keras lewat headless Edge/Chrome. Sangat
  cepat (ratusan kali real-time), hasil H.264 1080p + AAC.
- `--engine ffmpeg` — fallback berbasis CPU (lebih lambat).

Log proses WebCodecs tersimpan di `05-video/webcodecs.log`.

## Struktur folder

```text
01-script/   Script narasi
02-audio/    Voiceover MP3 hasil TTS
03-prompt/   timestamp.txt, cutpoints.json, image_prompts.txt
04-gambar/   Gambar scene (scene_0001.jpg, dst)
05-video/    Hasil akhir video.mp4 + log
lib/         Modul tool (tts, stt, images, assemble, webcodecs, dll)
webcodecs/   Mesin WebCodecs (server + worker + halaman)
```

## Konfigurasi

Semua pengaturan di `config.json`:

| Kunci | Fungsi |
| --- | --- |
| `voice` | Suara TTS (default `en-IN-PrabhatNeural`) |
| `rate`, `pitch`, `volume` | Parameter suara TTS |
| `whisperModel` | Model STT Whisper |
| `videoFps` | FPS video |
| `folders` | Nama folder kerja |
| `api.geminiKey` | (opsional) Kunci API Gemini untuk generate gambar |

## Catatan

- Tanpa koneksi internet? Hanya rakit video yang tetap jalan (offline penuh);
  TTS/STT butuh internet.
- Saat tahap gambar manual tiba, agent berhenti dan menunggu gambar dipaste
  user ke `04-gambar/` sebelum merakit.
