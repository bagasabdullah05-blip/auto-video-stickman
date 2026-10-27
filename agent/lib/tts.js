const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const ffmpeg = require('./ffmpeg');
const { cfg, dir, resolve } = require('./fsutil');
const { isValid } = require('./voices');

function splitChunks(text, max = 3000) {
  const paras = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const chunks = [];
  let cur = '';
  for (const p of paras) {
    if ((cur + '\n' + p).length > max && cur) { chunks.push(cur); cur = p; }
    else cur = cur ? cur + '\n' + p : p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function tts(inputFile, outFile, voice, rate, pitch, volume) {
  const inputPath = resolve(inputFile);
  const outPath = resolve(outFile);
  if (!fs.existsSync(inputPath)) throw new Error('File script tidak ditemukan: ' + inputPath);
  const text = fs.readFileSync(inputPath, 'utf8').trim();
  if (!text) throw new Error('File script kosong.');
  if (!isValid(voice)) {
    throw new Error('Voice tidak dikenal: ' + voice + '. Jalankan: node run.js voices');
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flowtts-'));
  const mp3s = [];
  const chunks = splitChunks(text);
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  for (let i = 0; i < chunks.length; i++) {
    process.stdout.write('  [tts ' + (i + 1) + '/' + chunks.length + '] memproses ' + chunks[i].length + ' karakter...\n');
    const f = path.join(tmp, 'chunk_' + String(i).padStart(3, '0') + '.mp3');
    const r = await tts.toFile(tmp, chunks[i], { rate, pitch, volume });
    fs.renameSync(r.audioFilePath, f);
    mp3s.push(f);
  }

  process.stdout.write('  menggabungkan ' + mp3s.length + ' bagian audio...\n');
  const listFile = path.join(tmp, 'list.txt');
  fs.writeFileSync(listFile, mp3s.map(m => "file '" + m.replace(/\\/g, '/') + "'").join('\n'), 'utf8');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  execFileSync(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outPath], { stdio: 'pipe' });
  fs.rmSync(tmp, { recursive: true, force: true });
  return outPath;
}

module.exports = { tts, splitChunks };
