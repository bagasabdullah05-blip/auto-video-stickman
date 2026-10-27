const path = require('path');
const fs = require('fs');
const { cfg, dir, argValue, hasFlag } = require('./lib/fsutil');
const { listAll } = require('./lib/voices');

const USAGE = `
Viral Video Studio - toolkit video otomatis (gratis)

PENGGUNAAN:
  node run.js <perintah> [opsi]

PERINTAH:
  status                      Lihat isi semua folder kerja
  voices                      Daftar suara Edge TTS yang tersedia
  tts     --input <file>      Ubah script teks -> audio mp3
          [--voice <id>]      Suara (default dari config.json)
          [--out <file>]      File output (default 02-audio/voiceover.mp3)
  stt     --input <file>      Ubah audio -> transkrip + timestamp + cutpoints
          [--model <id>]      Model Whisper (default Xenova/whisper-tiny)
                              -> 03-prompt/timestamp.txt + cutpoints.json
  images                      Mode MANUAL Google Flow + Zappy (siapkan scene)
          --api --prompts <f> Mode API Gemini (butuh api.geminiKey di config)
          [--key <key>]       Bisa langsung lewat CLI
          [--model <id>]      Model gambar (default dari config)
  assemble --audio <file>     Rakit video: gambar(04) + audio + cutpoints
           [--out <file>]      File output (default 05-video/video.mp4)
           [--engine <mesin>]  Mesin rakit: webcodecs (default, cepat, HW encoder)
                               | ffmpeg (CPU)
  describe [--script <file>]  Buat deskripsi + chapters YouTube dari timestamp
           [--out <file>]      -> 05-video/description.txt + upload-meta.json
           [--title <judul>]   [--channel <nama>]
           [--stamp <file>]    [--cut <file>]  Timestamp/cutpoints kustom
           [--title-file <f>]  [--desc-file <f>]  Judul/deskripsi dari file
  viral --dir <folder>        Rakit paket viral (NNN_image_* + NNN_voice_*)
           [--out <file>]      File output (default 05-video/<nama-paket>.mp4)
           [--limit <n>]       Coba N scene pertama saja
           [--engine <mesin>]  Mesin rakit: webcodecs (default, detik) | ffmpeg
           [--info]            Tampilkan info paket tanpa merakit
  youtube accounts            Daftar akun YouTube (login/keluar)
  youtube doctor              Cek koneksi akun (client, token, channel, API)
  youtube videos              Daftar video di channel [--max 25] [--json]
  youtube auth                Login Google (buka URL di browser, token tersimpan lokal)
           [--account <nama>] Pilih akun (default: akun utama)
  youtube upload --video <f>  Upload + set judul/deskripsi/jadwal tayang
           [--title <t>] [--description <teks> | --description-file <f>]
           [--tags a,b,c] [--privacy public|unlisted|private]
           [--publish-at "2026-10-05T17:00:00+07:00"]
           [--account <nama>]  Upload pakai akun tertentu
           [--thumbnail <f>]   Pasang thumbnail (JPG/PNG, maks 2MB)
  youtube thumbnail --id <vid> --image <f>  Pasang/ganti thumbnail video
  youtube update --id <vid>   Ubah judul/deskripsi/privasi/jadwal video
           [opsi teks sama seperti upload]

CONTOH:
  node run.js status
  node run.js tts --input 01-script/script_mengapa_takut_gelap.txt
  node run.js stt --input 02-audio/voiceover.mp3
  node run.js images
  node run.js assemble --audio 02-audio/voiceover.mp3
  node run.js describe
  node run.js youtube auth
  node run.js   youtube upload --video 05-video/video.mp4 --privacy unlisted
  node run.js youtube update --id VIDEO_ID --publish-at "2026-10-05T17:00:00+07:00"
  node run.js viral --dir "C:/paket/Viral_Explainer_Assets_xxx"
`;

function cmdStatus() {
  const rows = Object.keys(cfg().folders);
  for (const k of rows) {
    const d = dir(k);
    const files = fs.readdirSync(d).filter(f => !f.startsWith('.'));
    const size = files.reduce((s, f) => s + (fs.statSync(path.join(d, f)).size || 0), 0);
    console.log('  ' + k.padEnd(8) + files.length + ' file   ' + (size / 1024).toFixed(0) + ' KB   ' + d);
  }
  const cfgv = cfg().voice;
  console.log('  suara    ' + cfgv);
}

function cmdVoices() {
  console.log('Suara tersedia (set via config.json -> voice):');
  for (const v of listAll()) {
    console.log('  ' + v.id.padEnd(28) + v.nama.padEnd(26) + v.info);
  }
}

async function cmdTts(args) {
  const input = argValue(args, 'input', null);
  if (!input) { console.log(USAGE); throw new Error('Perintah tts butuh --input <file script>'); }
  const voice = argValue(args, 'voice', cfg().voice);
  const out = argValue(args, 'out', path.join(dir('audio'), 'voiceover.mp3'));
  console.log('TTS: ' + input + '\n  suara: ' + voice + '\n  output: ' + out);
  const { tts } = require('./lib/tts');
  const r = await tts(input, out, voice, cfg().rate, cfg().pitch, cfg().volume);
  console.log('SELESAI: ' + r);
}

async function cmdStt(args) {
  const input = argValue(args, 'input', null);
  if (!input) { console.log(USAGE); throw new Error('Perintah stt butuh --input <file audio>'); }
  const model = argValue(args, 'model', cfg().whisperModel);
  console.log('STT: ' + input + '\n  model: ' + model);
  const { stt } = require('./lib/stt');
  await stt(input, model);
  console.log('SELESAI: transkrip + cutpoint tersimpan di folder 03-prompt');
}

async function cmdImages(args) {
  if (hasFlag(args, 'api')) {
    const prompts = argValue(args, 'prompts', path.join(dir('prompt'), 'image_prompts.txt'));
    const key = argValue(args, 'key', cfg().api.geminiKey);
    const model = argValue(args, 'model', cfg().api.geminiModel);
    console.log('GENERATE GAMBAR (API Gemini): ' + model + '\n  prompt: ' + prompts);
    const { generateAPI } = require('./lib/images');
    const r = await generateAPI(prompts, dir('gambar'), key, model);
    console.log('SELESAI: ' + r.ok + ' gambar di ' + dir('gambar'));
  } else {
    const { prepareManual } = require('./lib/images');
    const { count, gambarDir, ref } = prepareManual();
    console.log('MODE MANUAL (Google Flow + Zappy)');
    console.log('  1. Pastikan file prompt gambar siap di 03-prompt (1 prompt per baris, pisah 1 baris kosong).');
    console.log('  2. Buka flow.google.com -> project baru -> Agent mode OFF -> mode Image -> 16:9 -> output 1 -> model Nano Banana 2.');
    console.log('  3. Buka ekstensi Zappy Flow (zappywala.ai), pastikan "Connected to Google Flow" & "Agent mode off".');
    console.log('  4. Tempel/upload file prompt -> matikan "include serial number" -> set folder download ke:');
    console.log('     ' + gambarDir);
    console.log('  5. Klik Generate. JANGAN tutup tab/browser/ekstensi sampai selesai.');
    console.log('  Reference scene (' + count + '): ' + ref);
    console.log('  6. Selesai -> jalankan: node run.js assemble --audio 02-audio/voiceover.mp3');
  }
}

function freeOutName(out, explicitOut) {
  if (explicitOut) return out;
  if (!fs.existsSync(out)) return out;
  const dirname = path.dirname(out);
  const ext = path.extname(out);
  const base = path.basename(out, ext);
  let i = 2;
  while (fs.existsSync(path.join(dirname, base + '_' + i + ext))) i++;
  return path.join(dirname, base + '_' + i + ext);
}

async function cmdAssemble(args) {
  const audio = argValue(args, 'audio', path.join(dir('audio'), 'voiceover.mp3'));
  const outRaw = argValue(args, 'out', path.join(dir('video'), 'video.mp4'));
  const engine = argValue(args, 'engine', 'webcodecs');
  const out = freeOutName(outRaw, hasFlag(args, 'out'));
  console.log('RAKIT VIDEO\n  audio: ' + audio + '\n  gambar: ' + dir('gambar') + '\n  output: ' + out + '\n  mesin: ' + engine);
  if (out !== outRaw) console.log('  (file lama tetap ada; hasil baru di atas)');
  if (engine === 'webcodecs') {
    const { assembleWebcodecs } = require('./lib/webcodecs');
    const r = await assembleWebcodecs(audio, out);
    console.log('SELESAI: ' + r);
    return;
  }
  const { assemble } = require('./lib/assemble');
  const r = assemble(audio, dir('gambar'), out);
  console.log('SELESAI: ' + r);
}

async function cmdDescribe(args) {
  const script = argValue(args, 'script', null);
  const out = argValue(args, 'out', null);
  const title = argValue(args, 'title', null);
  const channel = argValue(args, 'channel', null);
  const stamp = argValue(args, 'stamp', null);
  const cut = argValue(args, 'cut', null);
  const titleFile = argValue(args, 'title-file', null);
  const descFile = argValue(args, 'desc-file', null);
  const { describe } = require('./lib/describe');
  const r = describe(script, out, { title, channel, stamp, cut, titleFile, descFile });
  console.log('SELESAI: ' + r + ' (+ upload-meta.json)');
}

async function cmdYoutube(args) {
  const sub = args[0];
  const rest = args.slice(1);
  const { cmdAuth, cmdUpload, cmdUpdate, cmdAccounts, cmdDoctor, cmdVideos, cmdThumbnail } = require('./lib/youtube');
  const account = argValue(rest, 'account', null);
  if (sub === 'accounts') {
    console.log(cmdAccounts());
    return;
  }
  if (sub === 'videos') {
    console.log(await cmdVideos({ account, max: argValue(rest, 'max', '25'), json: hasFlag(rest, 'json') }));
    return;
  }
  if (sub === 'doctor') {
    console.log(await cmdDoctor({ account }));
    return;
  }
  if (sub === 'auth') {
    console.log(await cmdAuth({ account }));
    return;
  }
  if (sub === 'upload') {
    const video = argValue(rest, 'video', null);
    if (!video) { console.log(USAGE); throw new Error('Perintah youtube upload butuh --video <file>'); }
    const r = await cmdUpload(video, {
      account,
      title: argValue(rest, 'title', null),
      description: argValue(rest, 'description', null),
      descriptionFile: argValue(rest, 'description-file', null),
      tags: argValue(rest, 'tags', null),
      privacy: argValue(rest, 'privacy', null),
      publishAt: argValue(rest, 'publish-at', null),
      thumbnail: argValue(rest, 'thumbnail', null)
    });
    console.log('SELESAI: ' + r);
    return;
  }
  if (sub === 'thumbnail') {
    const id = argValue(rest, 'id', null);
    const image = argValue(rest, 'image', null);
    if (!id || !image) { console.log(USAGE); throw new Error('Perintah youtube thumbnail butuh --id <videoId> --image <file>'); }
    console.log('SELESAI: ' + await cmdThumbnail(id, image, { account }));
    return;
  }
  if (sub === 'update') {
    const id = argValue(rest, 'id', null);
    if (!id) { console.log(USAGE); throw new Error('Perintah youtube update butuh --id <videoId>'); }
    const r = await cmdUpdate(id, {
      account,
      title: argValue(rest, 'title', null),
      description: argValue(rest, 'description', null),
      descriptionFile: argValue(rest, 'description-file', null),
      tags: argValue(rest, 'tags', null),
      privacy: argValue(rest, 'privacy', null),
      publishAt: argValue(rest, 'publish-at', null),
      category: argValue(rest, 'category', null)
    });
    console.log('SELESAI: ' + r);
    return;
  }
  console.log(USAGE);
  throw new Error('Sub-perintah youtube: accounts | doctor | auth | upload | update | videos | thumbnail');
}

async function cmdViral(args) {
  const { viralInfo, assembleViral } = require('./lib/viral');
  const packDir = argValue(args, 'dir', null);
  if (!packDir) { console.log(USAGE); throw new Error('Perintah viral butuh --dir <folder paket>'); }
  const path = require('path');
  const fs = require('fs');
  const abs = path.isAbsolute(packDir) ? packDir : path.join(process.cwd(), packDir);
  if (!fs.existsSync(abs)) throw new Error('Folder tidak ada: ' + packDir);
  const info = viralInfo(abs);
  console.log('PAKET: ' + abs + '\n  scene: ' + info.scenes + '\n  estimasi durasi: ' + Math.floor(info.estSec / 60) + ' mnt ' + (info.estSec % 60) + ' dtk' +
    '\n  judul: ' + (info.title || '-') + '\n  deskripsi: ' + (info.descFile ? 'ada' : '-') + '\n  thumbnail: ' + (info.thumbnail ? 'ada' : '-'));
  if (hasFlag(args, 'info')) return;
  const base = path.basename(abs).replace(/\.zip$/i, '');
  const outRaw = argValue(args, 'out', path.join(dir('video'), base + '.mp4'));
  const out = freeOutName(outRaw, hasFlag(args, 'out'));
  const limit = parseInt(argValue(args, 'limit', '0'), 10) || 0;
  const engine = argValue(args, 'engine', 'webcodecs');
  console.log('  mesin: ' + engine);
  const r = await assembleViral(abs, out, { engine, ...(limit ? { limit } : {}) });
  console.log('SELESAI: ' + r.file + ' (' + r.scenes + ' scene)');
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') { console.log(USAGE); return; }
  switch (cmd) {
    case 'status': cmdStatus(); break;
    case 'voices': cmdVoices(); break;
    case 'tts': await cmdTts(args.slice(1)); break;
    case 'stt': await cmdStt(args.slice(1)); break;
    case 'images': await cmdImages(args.slice(1)); break;
    case 'assemble': await cmdAssemble(args.slice(1)); break;
    case 'describe': await cmdDescribe(args.slice(1)); break;
    case 'viral': await cmdViral(args.slice(1)); break;
    case 'youtube': await cmdYoutube(args.slice(1)); break;
    default:
      console.log('Perintah tidak dikenal: ' + cmd);
      console.log(USAGE);
  }
}

main().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
