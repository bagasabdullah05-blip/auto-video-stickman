# AGENTS.md — Flow Video Agent (otomatis)

Sistem di folder ini: pipeline pembuatan video edukasi, semuanya
GRATIS. Agent opencode berperan menggantikan "Claude" di alur video tutorial
(WVT2FCjhDDY), dan menjalankan tool lokal untuk suara, timestamp, dan rakit video.

## Alur kerja (voiceover DULU, scene KEDUA)

1. **SCRIPT** — agent (opencode) menghasilkan script pakai `master_prompt.txt`
   (file di folder induk). Simpan hasil ke `agent/01-script/script_[topik].txt`.
   Gunakan tahap-tahap di master prompt: 5 ide -> pilih -> script -> dst.
2. **SUARA (TTS)** — `node run.js tts --input 01-script/script_x.txt`
   Output default: `02-audio/voiceover.mp3`. Ganti suara via `--voice`.
3. **TIMESTAMP (STT)** — `node run.js stt --input 02-audio/voiceover.mp3`
   Menghasilkan `03-prompt/timestamp.txt` ([mm:ss] per kalimat) dan
   `cutpoints.json`. Setiap kalimat = 1 scene.
4. **PROMPT GAMBAR** — agent (opencode) membaca `timestamp.txt` lalu menulis
   `03-prompt/image_prompts.txt`: 1 baris = 1 prompt gambar untuk 1 scene,
   dipisah 1 baris kosong, format prompt mengikuti master prompt (style anchor
   + style lock). Prompt dibuat lewat agent, bukan script.
5. **GAMBAR — STOP DI SINI, TUNGGU USER.** Mode manual Google Flow + Zappy
   (user generate di browser lalu paste ke `04-gambar/`). Agent BERHENTI dan
   memberi tahu user bahwa gambar dibuat manual. User boleh juga memakai API:
   `node run.js images --api --prompts ...`. Output di `04-gambar/`.
   Setelah user selesai paste, agent memeriksa file (jumlah, ekstensi), lalu
   menamai ulang ke `scene_0001.jpg` dst sesuai urutan timestamp
   (`03-prompt/timestamp.txt`) SEBELUM merakit video.
   CATATAN USER: saat ini user membuat gambar via Google Flow/Zappy dan menamai
   file dengan format `[mm-ss]_...`, misal `[00-00]_Hand-drawn_2D_doo.jpg`.
6. **RAKIT VIDEO** — `node run.js assemble --audio 02-audio/voiceover.mp3`
   Output: `05-video/video.mp4`. Mesin DEFAULT = **WebCodecs**
   (`--engine webcodecs`): render OffscreenCanvas di Web Worker + VideoEncoder/
   AudioEncoder HW di headless Edge, sangat cepat (ratusan x real-time).
   Fallback ffmpeg: `--engine ffmpeg`. Log proses: `05-video/webcodecs.log`.
7. **DESKRIPSI** — `node run.js describe` membuat `05-video/description.txt`
   (hook + ringkasan + chapters dari timestamp + hashtag) dan
   `05-video/upload-meta.json` (judul, tags, kategori Edukasi).
8. **YOUTUBE** — butuh `youtube-client.json` (OAuth Desktop app) + `node run.js
   youtube auth` sekali. Upload: `node run.js youtube upload --video
   05-video/video.mp4 [--privacy ...] [--publish-at "..."]`. Ubah metadata:
   `node run.js youtube update --id VIDEO_ID [...]`. Jadwal otomatis memaksa
   status private sampai waktu tayang.

## Perintah tool

- `node run.js status` — lihat isi folder kerja.
- `node run.js voices` — daftar suara; ubah pilihan di `config.json` -> `voice`.
- Opsi `--help` menampilkan panduan lengkap.

## Aturan agent

- Selalu jawab dalam Bahasa Indonesia.
- Script/narasi dan prompt gambar ditulis sendiri oleh agent (bukan tool), sesuai
  `master_prompt.txt` dan isi `timestamp.txt` / `cutpoints.json`.
- Jangan jalankan tool dari folder selain `agent\` (path relatif tool memakai
  folder agent sebagai basis).
- Setiap file script yang dibuat = plain text, nama `script_[topik].txt`.
- Beritahu user alur selanjutnya setelah satu tahap selesai.
- Saat tahap GAMBAR (manual) tiba, BERHENTI dan tunggu user paste gambar ke
  `04-gambar/`. Jangan lanjut ke rakit video sebelum user selesai.
- Rename gambar user ke `scene_XXXX.jpg` terurut sesuai timestamp sebelum
  `node run.js assemble` (tool membaca angka terakhir di nama file).
- Setelah selesai merakit, beritahu hasil (durasi, ukuran, lokasi video).
- Tidak perlu git commit.
