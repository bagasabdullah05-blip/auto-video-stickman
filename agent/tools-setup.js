const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const REPAIR = process.argv.includes('--repair');
const FFMPEG_FALLBACK = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';

const hasil = [];

function catat(nama, ok, detail) {
  hasil.push({ nama, ok, detail: detail || '' });
  console.log((ok ? '  [OK]   ' : '  [GAGAL] ') + nama + (detail ? ' - ' + detail : ''));
}

function coba(fn) {
  try { return fn(); } catch (e) { return e; }
}

function pastikanFolder() {
  const list = ['01-script', '02-audio', '03-prompt', '04-gambar', '05-video', '06-viral', 'youtube-accounts', 'tools'];
  const kurang = [];
  for (const d of list) {
    const p = path.join(ROOT, d);
    if (!fs.existsSync(p)) {
      kurang.push(d);
      fs.mkdirSync(p, { recursive: true });
    }
  }
  const bisaTulis = coba(() => { const t = path.join(ROOT, '.tulis-test'); fs.writeFileSync(t, 'ok'); fs.unlinkSync(t); return true; });
  catat('Folder kerja', !(bisaTulis instanceof Error), (kurang.length ? 'dibuat: ' + kurang.join(', ') : 'lengkap') + (bisaTulis instanceof Error ? ' (folder tidak bisa ditulis)' : ''));
}

function pastikanConfig() {
  const p = path.join(ROOT, 'config.json');
  if (fs.existsSync(p)) {
    const c = coba(() => JSON.parse(fs.readFileSync(p, 'utf8')));
    catat('config.json', !(c instanceof Error), c instanceof Error ? 'tidak terbaca' : 'ada');
    return;
  }
  if (REPAIR) {
    const def = {
      voice: 'en-IN-PrabhatNeural',
      whisperModel: 'Xenova/whisper-base.en',
      videoFps: 30,
      scenePadding: 0.3,
      api: { geminiKey: '' },
      folders: { script: '01-script', audio: '02-audio', prompt: '03-prompt', images: '04-gambar', video: '05-video' }
    };
    fs.writeFileSync(p, JSON.stringify(def, null, 2));
    catat('config.json', true, 'dibuat default');
  } else {
    catat('config.json', false, 'tidak ada');
  }
}

function cekSharp() {
  const r = coba(() => require('sharp'));
  if (r instanceof Error) {
    catat('sharp (resize gambar/thumbnail)', false, r.message.split('\n')[0]);
    return false;
  }
  return true;
}

async function ujiSharp() {
  const sharp = require('sharp');
  const buf = await sharp({ create: { width: 16, height: 9, channels: 3, background: '#123456' } })
    .resize(1280, 720, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer();
  if (buf.length < 500) throw new Error('hasil resize tidak wajar');
  catat('sharp (resize gambar/thumbnail)', true, 'tes 1280x720 OK');
}

function cekFfmpeg() {
  let bin = null;
  const r = coba(() => require('./lib/ffmpeg'));
  if (!(r instanceof Error)) bin = r;
  if (!bin) {
    catat('ffmpeg (gabung audio + mesin cadangan)', false, 'tidak ditemukan');
    return false;
  }
  const v = coba(() => execFileSync(bin, ['-version'], { encoding: 'utf8' }));
  if (v instanceof Error) {
    catat('ffmpeg (gabung audio + mesin cadangan)', false, 'tidak bisa dijalankan: ' + bin);
    return false;
  }
  catat('ffmpeg (gabung audio + mesin cadangan)', true, v.split('\n')[0].slice(0, 46));
  return true;
}

function cekModul(nama, label) {
  const r = coba(() => require(nama));
  catat(label, !(r instanceof Error), r instanceof Error ? r.message.split('\n')[0] : 'ada');
  return !(r instanceof Error);
}

function cekBrowser() {
  const r = coba(() => require('./lib/webcodecs').findBrowser());
  const ok = !(r instanceof Error) && !!r;
  catat('Edge/Chrome (mesin cepat)', ok, ok ? path.basename(r) : 'tidak ada -> otomatis pakai ffmpeg (lebih lambat)');
  return ok;
}

function npmRunnable() {
  return coba(() => execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { encoding: 'utf8', shell: true })) instanceof Error ? false : true;
}

function npm(extra) {
  const bin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try {
    const out = execFileSync(bin, ['install', '--no-audit', '--no-fund'].concat(extra), { cwd: ROOT, encoding: 'utf8', shell: true, stdio: 'pipe' });
    return out;
  } catch (e) {
    return e;
  }
}

async function download(url, tujuan, sisa) {
  if (sisa === undefined) sisa = 6;
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'ViralVideoStudio-Installer' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && sisa > 0) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return download(next, tujuan, sisa - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const total = Number(res.headers['content-length'] || 0);
      let sudah = 0;
      const f = fs.createWriteStream(tujuan);
      res.on('data', d => {
        sudah += d.length;
        if (total) process.stdout.write('\r  mengunduh ' + Math.round(sudah / total * 100) + '% (' + Math.round(total / 1048576) + ' MB)   ');
      });
      res.pipe(f);
      f.on('finish', () => { process.stdout.write('\r'); f.close(() => resolve(tujuan)); });
      f.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(300000, () => req.destroy(new Error('timeout')));
  });
}

async function repairFfmpeg() {
  const installJs = path.join(ROOT, 'node_modules', 'ffmpeg-static', 'install.js');
  if (fs.existsSync(installJs)) {
    console.log('  mencoba ambil ulang ffmpeg dari paket...');
    const r = coba(() => execFileSync(process.execPath, [installJs], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }));
    if (!(r instanceof Error) && cekFfmpeg()) return true;
  }
  console.log('  mengunduh ffmpeg langsung (sekitar 100 MB)...');
  const tmp = path.join(os.tmpdir(), 'vvs-ffmpeg.zip');
  const tools = path.join(ROOT, 'tools');
  fs.mkdirSync(tools, { recursive: true });
  try {
    await download(FFMPEG_FALLBACK, tmp);
    const extract = path.join(tools, 'ffmpeg-extract');
    if (fs.existsSync(extract)) fs.rmSync(extract, { recursive: true, force: true });
    execFileSync('powershell', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath "' + tmp + '" -DestinationPath "' + extract + '" -Force'], { stdio: 'pipe' });
    const found = [];
    (function walk(d) {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) walk(p);
        else if (/^ffmpeg\.exe$/i.test(f.name)) found.push(p);
      }
    })(extract);
    if (!found.length) throw new Error('ffmpeg.exe tidak ada di arsip');
    const dest = path.join(tools, 'ffmpeg');
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(found[0], path.join(dest, 'ffmpeg.exe'));
    fs.rmSync(extract, { recursive: true, force: true });
    fs.rmSync(tmp, { force: true });
    return cekFfmpeg();
  } catch (e) {
    catat('Unduh ffmpeg cadangan', false, e.message);
    return false;
  }
}

async function main() {
  console.log('\n  Pemeriksaan komponen Viral Video Studio');
  console.log('  ========================================');
  pastikanFolder();
  pastikanConfig();

  let sharpOk = cekSharp();
  if (!sharpOk && REPAIR && npmRunnable()) {
    console.log('  memperbaiki sharp...');
    npm(['rebuild', 'sharp', '--foreground-scripts']);
    sharpOk = cekSharp();
    if (!sharpOk) {
      npm(['--dangerously-allow-all-scripts']);
      sharpOk = cekSharp();
    }
  }
  if (sharpOk) await ujiSharp();

  let ffmpegOk = cekFfmpeg();
  if (!ffmpegOk && REPAIR) {
    if (npmRunnable()) npm(['rebuild', 'ffmpeg-static', '--foreground-scripts']);
    ffmpegOk = cekFfmpeg();
    if (!ffmpegOk) ffmpegOk = await repairFfmpeg();
  }

  cekModul('msedge-tts', 'msedge-tts (suara Edge)');
  cekModul('@xenova/transformers', 'whisper (timestamp)');
  const browserOk = cekBrowser();

  const wajib = hasil.filter(h => !/Edge\/Chrome/.test(h.nama));
  const gagal = wajib.filter(h => !h.ok);
  console.log('  ========================================');
  if (!gagal.length) {
    console.log('  SEMUA KOMPONEN SIAP' + (browserOk ? '' : ' (tanpa mesin cepat, tetap bisa rakit)'));
  } else {
    console.log('  BELUM SIAP: ' + gagal.map(h => h.nama).join(', '));
  }
  console.log('');
  process.exitCode = gagal.length ? 1 : 0;
}

main().catch(e => {
  console.error('  ERROR: ' + e.message);
  process.exitCode = 1;
});
