const path = require('path');
const fs = require('fs');
const { cfg, dir, argValue, hasFlag } = require('./lib/fsutil');
const { listAll } = require('./lib/voices');

const USAGE = `
Pipeline video stick man - toolkit otomatis (gratis)

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

CONTOH:
  node run.js status
  node run.js tts --input 01-script/script_mengapa_takut_gelap.txt
  node run.js stt --input 02-audio/voiceover.mp3
  node run.js images
  node run.js assemble --audio 02-audio/voiceover.mp3
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
    default:
      console.log('Perintah tidak dikenal: ' + cmd);
      console.log(USAGE);
  }
}

main().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
