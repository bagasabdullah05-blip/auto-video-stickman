const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const ffmpeg = require('./ffmpeg');
const { cfg, dir, resolve } = require('./fsutil');

function listImages(imgDir) {
  const exts = ['.png', '.jpg', '.jpeg', '.webp'];
  return fs.readdirSync(imgDir)
    .filter(f => exts.includes(path.extname(f).toLowerCase()))
    .map(f => {
      const m = f.match(/(\d+)(?!.*\d)/);
      return { file: path.join(imgDir, f), num: m ? parseInt(m[1], 10) : 0 };
    })
    .sort((a, b) => a.num - b.num)
    .map(x => x.file);
}

function loadCutpoints() {
  const p = path.join(dir('prompt'), 'cutpoints.json');
  if (!fs.existsSync(p)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return (j.chunks || []).filter(c => c && typeof c.start === 'number');
  } catch { return null; }
}

function buildScenes(images, chunks) {
  const n = Math.min(images.length, chunks.length);
  if (n === 0) throw new Error('Tidak ada gambar di folder 04-gambar, atau tidak ada data timestamp.');
  const scenes = [];
  for (let i = 0; i < n; i++) {
    const dur = i === n - 1
      ? Math.max(0.5, (chunks[i].end || chunks[i].start + 3) - chunks[i].start + cfg().scenePadding)
      : Math.max(0.5, chunks[i + 1].start - chunks[i].start + cfg().scenePadding);
    scenes.push({ file: images[i], dur: Math.round(dur * 1000) / 1000 });
  }
  return scenes;
}

function assemble(audioFile, imageDir, outFile) {
  const audio = resolve(audioFile);
  const out = resolve(outFile);
  const images = listImages(imageDir);
  if (!images.length) throw new Error('Folder gambar kosong: ' + imageDir);
  const chunks = loadCutpoints();
  const scenes = buildScenes(images, chunks);
  if (chunks && chunks.length > images.length) {
    process.stdout.write('  Peringatan: scene ' + chunks.length + ' tapi gambar hanya ' + images.length + '. Video lebih pendek dari audio.\n');
  }
  process.stdout.write('  scene yang dirakit: ' + scenes.length + '\n');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flowasm-'));
  const w = 1920, h = 1080, fps = cfg().videoFps;
  const inputs = [];
  const filters = [];
  const labels = [];

  scenes.forEach((s, i) => {
    inputs.push('-loop', '1', '-t', String(s.dur), '-i', s.file);
    const v = 'v' + i;
    labels.push('[' + v + ']');
    filters.push(
      '[' + i + ':v]scale=' + w + ':' + h + ':force_original_aspect_ratio=decrease,' +
      'pad=' + w + ':' + h + ':(ow-iw)/2:(oh-ih)/2,setsar=1,fps=' + fps + '[' + v + ']'
    );
  });
  filters.push(labels.join('') + 'concat=n=' + scenes.length + ':v=1:a=0[vout]');

  const silent = path.join(tmp, 'silent.mp4');
  execFileSync(ffmpeg, [
    '-y', ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[vout]', '-r', String(fps), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    silent
  ], { stdio: 'pipe' });

  process.stdout.write('  menggabungkan audio...\n');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync(ffmpeg, [
    '-y', '-i', silent, '-i', audio,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-shortest', '-movflags', '+faststart', out
  ], { stdio: 'pipe' });
  fs.rmSync(tmp, { recursive: true, force: true });
  return out;
}

module.exports = { assemble, listImages };
