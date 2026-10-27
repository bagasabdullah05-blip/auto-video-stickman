const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const ffmpeg = require('./ffmpeg');
const { cfg, dir, resolve, fmtTime } = require('./fsutil');

function decodeToFloat32(file) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flowstt-'));
  const wav = path.join(tmp, 'decoded.wav');
  execFileSync(ffmpeg, ['-y', '-i', file, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_f32le', wav], { stdio: 'pipe' });
  const buf = fs.readFileSync(wav);
  const dataOff = buf.indexOf(Buffer.from('data')) + 8;
  const audio = buf.subarray(dataOff);
  const n = Math.floor(audio.length / 4);
  const f32 = new Float32Array(n);
  for (let i = 0; i < n; i++) f32[i] = audio.readFloatLE(i * 4);
  fs.rmSync(tmp, { recursive: true, force: true });
  return f32;
}

async function stt(inputFile, model) {
  const inputPath = resolve(inputFile);
  if (!fs.existsSync(inputPath)) throw new Error('File audio tidak ditemukan: ' + inputPath);

  process.stdout.write('  decoding audio ke 16kHz...\n');
  const audio = decodeToFloat32(inputPath);
  const dur = audio.length / 16000;
  process.stdout.write('  durasi ' + dur.toFixed(2) + ' detik\n');

  process.stdout.write('  memuat model ' + model + ' (pertama kali ~2-5 menit download)...\n');
  const { pipeline } = require('@xenova/transformers');
  const transcriber = await pipeline('automatic-speech-recognition', model);
  process.stdout.write('  mentranskripsi + deteksi jeda...\n');
  const out = await transcriber(audio, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5
  });

  const chunks = (out.chunks || []).filter(c => c.text && c.text.trim()).map(c => ({
    start: Math.round((c.timestamp[0] || 0) * 10) / 10,
    end: Math.round((c.timestamp[1] || 0) * 10) / 10,
    text: c.text.trim()
  }));

  const promptDir = dir('prompt');
  const txtPath = path.join(promptDir, 'timestamp.txt');
  const jsonPath = path.join(promptDir, 'cutpoints.json');

  const lines = chunks.map(c => fmtTime(c.start) + ' ' + c.text);
  fs.writeFileSync(txtPath, lines.join('\n'), 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify({ totalDur: dur, chunks }, null, 2), 'utf8');

  process.stdout.write('  scene terdeteksi: ' + chunks.length + '\n');
  process.stdout.write('  hasil tersimpan:\n');
  process.stdout.write('    ' + txtPath + '\n');
  process.stdout.write('    ' + jsonPath + '\n');
  return { txtPath, jsonPath, chunks };
}

module.exports = { stt };
