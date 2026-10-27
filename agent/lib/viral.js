const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpeg = require('./ffmpeg');
const { cfg, dir, resolve } = require('./fsutil');

function walkFiles(d, out) {
  out = out || [];
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

function listPairs(packDir) {
  const files = walkFiles(packDir);
  const images = {};
  const voices = {};
  for (const p of files) {
    const f = path.basename(p);
    let m = f.match(/^(\d+)_image_.*\.(png|jpg|jpeg|webp)$/i) || f.match(/^Scene_(\d+)_\[(\d+)\]\.(png|jpg|jpeg|webp)$/i);
    if (m) { images[m[1]] = p; continue; }
    m = f.match(/^(\d+)_voice_.*\.(wav|mp3|m4a)$/i) || f.match(/^Scene_(\d+)_\[(\d+)\]\.(wav|mp3|m4a)$/i);
    if (m) voices[m[1]] = p;
  }
  const keys = Object.keys(voices).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const out = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    let img = images[k];
    let borrowed = null;
    if (!img) {
      for (let j = i - 1; j >= 0; j--) {
        if (images[keys[j]]) { img = images[keys[j]]; borrowed = keys[j]; break; }
      }
    }
    if (img) out.push({ key: k, image: img, voice: voices[k], borrowed });
  }
  return out;
}

function wavDuration(p) {
  try {
    const b = fs.readFileSync(p);
    if (b.toString('ascii', 0, 4) !== 'RIFF') return null;
    let off = 12;
    let byteRate = 0;
    while (off + 8 <= b.length) {
      const id = b.toString('ascii', off, off + 4);
      const size = b.readUInt32LE(off + 4);
      if (id === 'fmt ' && off + 20 <= b.length) byteRate = b.readUInt32LE(off + 12);
      if (id === 'data') return byteRate ? size / byteRate : null;
      if (size <= 0 || off + 8 + size > b.length + 1024) break;
      off += 8 + size;
    }
  } catch {}
  return null;
}

function probeDuration(p) {
  try {
    execFileSync(ffmpeg, ['-i', p], { stdio: 'pipe' });
  } catch (e) {
    const out = String((e.stderr || '') + (e.stdout || ''));
    const m = out.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    if (m) return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) + parseFloat(m[3]);
  }
  return null;
}

function audioDuration(p) {
  if (p.toLowerCase().endsWith('.wav')) {
    const d = wavDuration(p);
    if (d) return d;
  }
  return probeDuration(p);
}

function packScript(packDir) {
  const files = fs.readdirSync(packDir).filter(f => /script.*\.txt$/i.test(f));
  if (!files.length) return null;
  return path.join(packDir, files[0]);
}

function packText(packDir, kind) {
  const re = kind === 'title' ? /title/i : /descrip|deskripsi/i;
  try {
    const hit = walkFiles(packDir).find(p => {
      const f = path.basename(p);
      return /\.txt$/i.test(f) && re.test(f) && !/(^|[^a-z])script|timeline/i.test(f);
    });
    return hit || null;
  } catch { return null; }
}

function packThumbnail(packDir) {
  try {
    const hit = walkFiles(packDir).find(p => {
      const f = path.basename(p);
      return /\.(png|jpg|jpeg|webp)$/i.test(f) && /thumb|cover|poster|sampul/i.test(f);
    });
    return hit || null;
  } catch { return null; }
}

async function stageThumbnail(src, dest) {
  const sharp = require('sharp');
  const buf = await sharp(src).resize(1280, 720, { fit: 'cover' }).jpeg({ quality: 88 }).toBuffer();
  if (buf.length > 1900000) {
    const buf2 = await sharp(src).resize(1280, 720, { fit: 'cover' }).jpeg({ quality: 75 }).toBuffer();
    fs.writeFileSync(dest, buf2.length <= 1900000 ? buf2 : buf);
  } else {
    fs.writeFileSync(dest, buf);
  }
  return dest;
}

function readFirstLine(p) {
  try {
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    return lines.length ? lines[0].slice(0, 100) : null;
  } catch { return null; }
}

function packJudul(packDir) {
  try {
    const files = walkFiles(packDir).filter(p => /\.txt$/i.test(p) && /judul.*deskripsi|deskripsi.*youtube|metadata/i.test(path.basename(p)));
    if (!files.length) return null;
    const text = fs.readFileSync(files[0], 'utf8').replace(/\r/g, '');
    let title = null;
    let m = text.match(/^\*\*TITLE:\*\*\s*(.+)$/m);
    if (m) title = m[1].trim();
    if (!title) {
      m = text.match(/^TOPIK\s*\/\s*JUDUL:\s*(.+)$/m);
      if (m) {
        title = m[1].trim();
        if (!title) {
          const lines = text.split('\n');
          const i = lines.findIndex(l => /^TOPIK\s*\/\s*JUDUL:/i.test(l));
          if (i !== -1 && lines[i + 1]) title = lines[i + 1].trim();
        }
      }
    }
    let desc = null;
    const hi = text.search(/^\*\*HOOK/m);
    if (hi !== -1) {
      desc = text.slice(hi).split('\n')
        .filter(l => !/^=+$/.test(l.trim()))
        .join('\n').replace(/\*\*/g, '').trim();
    }
    return { file: files[0], title: title ? title.slice(0, 100) : null, desc };
  } catch { return null; }
}

function viralInfo(packDir) {
  const pairs = listPairs(packDir);
  let total = 0;
  for (const s of pairs) {
    const d = audioDuration(s.voice);
    if (d) total += d;
  }
  const jm = packJudul(packDir);
  const titleFile = packText(packDir, 'title');
  const descFile = (jm && jm.desc) ? jm.file : packText(packDir, 'desc');
  return {
    scenes: pairs.length, estSec: Math.round(total), script: packScript(packDir),
    titleFile, descFile, thumbnail: packThumbnail(packDir),
    title: (jm && jm.title) || (titleFile ? readFirstLine(titleFile) : null) || packTopic(packDir)
  };
}

function packTopic(packDir) {
  const script = packScript(packDir);
  if (!script) return path.basename(packDir);
  try {
    const text = fs.readFileSync(script, 'utf8');
    const m = text.match(/Topik:\s*(.+)/);
    if (m) return m[1].trim().slice(0, 80);
  } catch {}
  return path.basename(packDir);
}

function packStampLines(packDir) {
  const script = packScript(packDir);
  if (!script) return [];
  return fs.readFileSync(script, 'utf8').split(/\r?\n/)
    .map(s => s.trim()).filter(s => /^\[\d{1,3}:\d{2}\]/.test(s));
}

async function stageViral(packDir, stageDir, opt) {
  opt = opt || {};
  const pairs = listPairs(packDir);
  if (!pairs.length) throw new Error('Tidak ada pasangan image+voice di: ' + packDir);
  const scenes = opt.limit ? pairs.slice(0, opt.limit) : pairs;

  const gDir = path.join(stageDir, '04-gambar');
  const aDir = path.join(stageDir, '02-audio');
  const pDir = path.join(stageDir, '03-prompt');
  const sDir = path.join(stageDir, '01-script');
  const vDir = path.join(stageDir, '05-video');
  for (const d of [gDir, aDir, pDir, sDir, vDir]) fs.mkdirSync(d, { recursive: true });

  const ext = f => (/\.(jpg|jpeg)$/i.test(f) ? '.jpg' : path.extname(f).toLowerCase()) || '.jpg';
  const chunks = [];
  let t = 0;
  const wavList = [];
  scenes.forEach((s, i) => {
    if (s.borrowed) process.stdout.write('  scene ' + s.key + ': gambar dipinjam dari scene ' + s.borrowed + '\n');
    const name = 'scene_' + String(i + 1).padStart(4, '0') + ext(s.image);
    fs.copyFileSync(s.image, path.join(gDir, name));
    const dur = audioDuration(s.voice);
    if (!dur) throw new Error('Durasi audio tidak terbaca: ' + s.voice);
    chunks.push({ start: Math.round(t * 1000) / 1000, end: Math.round((t + dur) * 1000) / 1000 });
    t += dur;
    wavList.push("file '" + s.voice.replace(/'/g, "'\\''") + "'");
  });

  const listFile = path.join(aDir, 'join.txt');
  fs.writeFileSync(listFile, wavList.join('\n'), 'utf8');
  const joined = path.join(aDir, 'voiceover.mp3');
  execFileSync(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '64k', joined], { stdio: 'pipe' });
  try { fs.unlinkSync(listFile); } catch {}

  fs.writeFileSync(path.join(pDir, 'cutpoints.json'),
    JSON.stringify({ totalDur: Math.round(t * 1000) / 1000, chunks }, null, 1), 'utf8');

  const jm = packJudul(packDir);
  if (jm && jm.title) fs.writeFileSync(path.join(vDir, 'title.txt'), jm.title + '\n', 'utf8');
  else {
    const tf = packText(packDir, 'title');
    if (tf) fs.copyFileSync(tf, path.join(vDir, 'title.txt'));
  }
  if (jm && jm.desc) fs.writeFileSync(path.join(vDir, 'description-src.txt'), jm.desc + '\n', 'utf8');
  else {
    const df = packText(packDir, 'desc');
    if (df) fs.copyFileSync(df, path.join(vDir, 'description-src.txt'));
  }

  const stamps = packStampLines(packDir).slice(0, scenes.length);
  if (stamps.length) fs.writeFileSync(path.join(pDir, 'timestamp.txt'), stamps.join('\n') + '\n', 'utf8');
  const sentences = stamps.map(l => l.replace(/^\[\d{1,3}:\d{2}\]\s*/, ''));
  if (sentences.length) {
    const paras = [];
    for (let i = 0; i < sentences.length; i += 8) paras.push(sentences.slice(i, i + 8).join(' '));
    const slug = packTopic(packDir).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'viral';
    fs.writeFileSync(path.join(sDir, 'script_' + slug + '.txt'), paras.join('\n\n') + '\n', 'utf8');
  }
  const th = packThumbnail(packDir);
  let thumbOut = null;
  if (th) {
    thumbOut = path.join(vDir, 'thumbnail.jpg');
    await stageThumbnail(th, thumbOut);
    process.stdout.write('  thumbnail: ' + path.basename(th) + '\n');
  }
  process.stdout.write('  staging: ' + scenes.length + ' scene, ' + Math.floor(t / 60) + ' mnt ' + Math.round(t % 60) + ' dtk -> ' + stageDir + '\n');
  return { stageDir, scenes: scenes.length, totalDur: t, thumbnail: thumbOut };
}

async function assembleViralWebcodecs(packDir, outFile, opt) {
  opt = opt || {};
  const base = path.basename(packDir).replace(/\.zip$/i, '');
  const stageDir = path.join(path.dirname(resolve('05-video')), '06-viral', base + (opt.limit ? '_p' + opt.limit : ''));
  const st = await stageViral(packDir, stageDir, opt);
  const { assembleWebcodecs } = require('./webcodecs');
  const audio = path.join(stageDir, '02-audio', 'voiceover.mp3');
  const r = await assembleWebcodecs(audio, resolve(outFile), stageDir);
  return { file: r, ...st };
}

function assembleViralFfmpeg(packDir, outFile, opt) {
  opt = opt || {};
  const fps = opt.fps || cfg().videoFps || 30;
  const W = opt.w || 1920;
  const H = opt.h || 1080;
  const pairs = listPairs(packDir);
  if (!pairs.length) throw new Error('Tidak ada pasangan image+voice di: ' + packDir);
  const scenes = opt.limit ? pairs.slice(0, opt.limit) : pairs;
  process.stdout.write('  scene: ' + scenes.length + ' dari ' + pairs.length + '\n');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'viral-'));
  const list = [];
  try {
    scenes.forEach((s, i) => {
      const dur = audioDuration(s.voice);
      if (!dur) throw new Error('Durasi audio tidak terbaca: ' + s.voice);
      const seg = path.join(tmp, 'seg' + String(i).padStart(4, '0') + '.mp4');
      execFileSync(ffmpeg, [
        '-y', '-loop', '1', '-framerate', String(fps), '-i', s.image,
        '-i', s.voice, '-map', '0:v', '-map', '1:a',
        '-vf', 'scale=' + W + ':' + H + ':force_original_aspect_ratio=decrease,pad=' + W + ':' + H + ':(ow-iw)/2:(oh-ih)/2,setsar=1,fps=' + fps,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', seg
      ], { stdio: 'pipe' });
      list.push("file '" + seg.replace(/'/g, "'\\''") + "'");
      if ((i + 1) % 10 === 0 || i + 1 === scenes.length) process.stdout.write('  progres: ' + (i + 1) + '/' + scenes.length + '\n');
    });
    const listFile = path.join(tmp, 'list.txt');
    fs.writeFileSync(listFile, list.join('\n'), 'utf8');
    const out = resolve(outFile);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    execFileSync(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', out], { stdio: 'pipe' });
    const total = scenes.reduce((a, s) => a + (audioDuration(s.voice) || 0), 0);
    return { file: out, scenes: scenes.length, estSec: Math.round(total) };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

function assembleViral(packDir, outFile, opt) {
  opt = opt || {};
  if ((opt.engine || 'webcodecs') === 'webcodecs') {
    let ok = true;
    try { ok = require('./webcodecs').hasBrowser(); } catch (e) { ok = false; }
    if (ok) return assembleViralWebcodecs(packDir, outFile, opt);
    process.stdout.write('  Edge/Chrome tidak ada -> memakai mesin ffmpeg (lebih lambat)\n');
  }
  return Promise.resolve(assembleViralFfmpeg(packDir, outFile, opt));
}

module.exports = { listPairs, viralInfo, assembleViral, assembleViralWebcodecs, assembleViralFfmpeg, stageViral, packThumbnail, packJudul };
