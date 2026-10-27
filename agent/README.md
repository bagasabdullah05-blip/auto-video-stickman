# Flow Video Agent — Toolkit Video Otomatis (Gratis)

Pipeline otomatis pembuatan video edukasi, mengikuti alur video
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
node run.js describe [--script <f>] [--title <t>] [--channel <nama>]
node run.js youtube auth
node run.js youtube upload --video <f> [--privacy ...] [--publish-at "..."]
node run.js youtube update --id <vid> [--title ...] [--publish-at "..."]
```

## Deskripsi & upload YouTube

7. **Deskripsi (copywriting)** — buat otomatis dari timestamp + script:
   ```bash
   node run.js describe
   ```
   Output: `05-video/description.txt` (hook + ringkasan + chapters
   `0:00 ...` + hashtag) dan `05-video/upload-meta.json` (judul, tags,
   kategori Edukasi) yang otomatis dipakai saat upload.
8. **Konek YouTube** — sekali saja (atau lewat tab 1 aplikasi, ada panduannya):
   1. `console.cloud.google.com` → buat Project baru.
   2. API & Services → Library → **YouTube Data API v3** → Enable.
   3. OAuth consent screen → External → isi App name + email → tambah
      email sendiri di Test users.
   4. Credentials → Create OAuth client ID → tipe **Desktop app**.
   5. Simpan sebagai `agent/youtube-client.json`:
      `{"client_id":"...","client_secret":"..."}`.
   6. `node run.js youtube auth` → buka URL → Allow. Token tersimpan lokal.
   7. Cek: `node run.js youtube doctor`. Multi-akun: tambah `--account nama`
      di perintah auth/upload/update; daftar: `node run.js youtube accounts`.
      Jika "unverified app": Advanced → Go to ... (aman, project sendiri).
9. **Upload + jadwal tayang**:
   ```bash
   node run.js youtube upload --video 05-video/video.mp4 --privacy unlisted
   node run.js youtube upload --video 05-video/video.mp4 --publish-at "2026-10-05T17:00:00+07:00"
   ```
   Judul/deskripsi/tags diambil dari `upload-meta.json` (hasil `describe`).
   Jadwal (`publish-at`) otomatis memaksa status private sampai tayang.
   Ubah metadata video yang sudah naik:
   ```bash
   node run.js youtube update --id VIDEO_ID --title "Judul baru" --privacy public
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
