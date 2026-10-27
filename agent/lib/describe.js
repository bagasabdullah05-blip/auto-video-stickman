const fs = require('fs');
const path = require('path');
const { cfg, dir, resolve } = require('./fsutil');

const MAX_CHAPTERS = 20;

function readLines(p) {
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function newestScript(scriptDir) {
  const files = fs.readdirSync(scriptDir).filter(f => f.toLowerCase().endsWith('.txt'));
  if (!files.length) throw new Error('Tidak ada file script di ' + scriptDir);
  files.sort((a, b) => fs.statSync(path.join(scriptDir, b)).mtimeMs - fs.statSync(path.join(scriptDir, a)).mtimeMs);
  return path.join(scriptDir, files[0]);
}

function parseTimestamp(p) {
  return readLines(p).map(line => {
    const m = line.match(/\[(\d{1,3}):(\d{2})\]\s*(.*)/);
    if (!m) return null;
    return { sec: parseInt(m[1], 10) * 60 + parseInt(m[2], 10), text: (m[3] || '').trim() };
  }).filter(Boolean);
}

function fmtChapter(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return (h > 0 ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
}

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function firstWords(s, n) {
  const w = s.split(/\s+/).filter(Boolean);
  let t = w.slice(0, n).join(' ');
  if (w.length > n) t += '...';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function buildChapters(stamps, paragraphs) {
  const chapters = [{ sec: 0, label: 'Intro' }];
  for (const para of paragraphs) {
    if (para.length < 60) continue;
    const key = norm(para).slice(0, 40);
    if (!key) continue;
    const hit = stamps.find(s => norm(s.text).startsWith(key) || (key.length > 15 && norm(s.text).includes(key)));
    if (!hit || hit.sec <= chapters[chapters.length - 1].sec) continue;
    chapters.push({ sec: hit.sec, label: firstWords(para, 6) });
    if (chapters.length >= MAX_CHAPTERS) break;
  }
  if (chapters.length < 3 && stamps.length > 2) {
    const step = Math.max(1, Math.floor(stamps.length / 8));
    for (let i = step; i < stamps.length && chapters.length < 10; i += step) {
      if (stamps[i].sec > chapters[chapters.length - 1].sec) {
        chapters.push({ sec: stamps[i].sec, label: firstWords(stamps[i].text, 6) });
      }
    }
  }
  return chapters;
}

function extractTags(title, script) {
  const stop = new Set(('yang dan dari untuk dengan ini itu adalah sebuah sebagai pada kita kamu mereka saya apa siapa mana kapan bagaimana tidak ada oleh ke di atau tapi juga akan telah sudah bisa harus agar supaya ' +
    'the and from with that this these those have has had does doesn don isnt wasnt werent what when where which while your youre they them their then than into just like over such only also very more most some every something anything everything nothing thing things much many still even back your our its ' +
    'about between through during before after above below other another each both while because until again once here there').split(' '));
  const words = norm(title + ' ' + script).split(' ').filter(w => w.length > 4 && !stop.has(w) && !/(.)\1\1/.test(w));
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
  const base = ['video edukasi', 'konten edukasi', 'video viral', 'edukasi'];
  return [...new Set([...top, ...base])].slice(0, 12);
}

function describe(scriptFile, outFile, opt) {
  opt = opt || {};
  const stampPath = opt.stamp ? resolve(opt.stamp) : path.join(dir('prompt'), 'timestamp.txt');
  if (!fs.existsSync(stampPath)) throw new Error('timestamp.txt belum ada. Jalankan: node run.js stt --input 02-audio/voiceover.mp3');
  const scriptPath = scriptFile ? resolve(scriptFile) : newestScript(dir('script'));
  const script = fs.readFileSync(scriptPath, 'utf8').replace(/\r/g, '').trim();
  if (!script) throw new Error('File script kosong: ' + scriptPath);
  const stamps = parseTimestamp(stampPath);
  if (!stamps.length) throw new Error('timestamp.txt tidak bisa dibaca.');
  const paragraphs = script.split(/\n\s*\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

  let cp = { totalDur: 0 };
  try { cp = JSON.parse(fs.readFileSync(opt.cut ? resolve(opt.cut) : path.join(dir('prompt'), 'cutpoints.json'), 'utf8')); } catch {}

  let packTitle = null;
  if (opt.titleFile) {
    try { packTitle = fs.readFileSync(resolve(opt.titleFile), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || null; } catch {}
  }
  let packDesc = null;
  if (opt.descFile) {
    try { packDesc = fs.readFileSync(resolve(opt.descFile), 'utf8').replace(/\r/g, '').trim() || null; } catch {}
  }
  const hook = (script.match(/[^.!?]+[.!?]/g) || [script.slice(0, 160)]).slice(0, 2).join(' ').trim();
  const summary = paragraphs[0].length > 420 ? paragraphs[0].slice(0, 417) + '...' : paragraphs[0];
  const chapters = buildChapters(stamps, paragraphs);
  const slugTitle = path.basename(scriptPath, '.txt').replace(/^script_/, '').replace(/_/g, ' ');
  const rawTitle = (opt.title || packTitle || paragraphs[0].split(/[.!?]/)[0] || slugTitle).trim();
  const shortTitle = rawTitle.length > 95 ? rawTitle.slice(0, 92) + '...' : rawTitle;
  const suffix = opt.channel ? ' | ' + opt.channel : '';
  const titles = packTitle
    ? [packTitle.slice(0, 100)]
    : [shortTitle + suffix, shortTitle + ' (Video Edukasi)' + suffix, shortTitle.charAt(0).toUpperCase() + shortTitle.slice(1) + suffix];
  const tags = extractTags(shortTitle, script);
  const hashtags = tags.slice(0, 6).map(t => '#' + t.replace(/\s+/g, '')).join(' ');

  const lines = [];
  if (packDesc) {
    lines.push(packDesc);
    lines.push('');
  } else {
    lines.push(hook);
    lines.push('');
    lines.push(summary);
    lines.push('');
  }
  const packHasChapters = packDesc ? /^\[\d{1,3}:\d{2}\]/m.test(packDesc) : false;
  if (!packHasChapters) {
    lines.push('TIMESTAMPS / CHAPTERS:');
    for (const c of chapters) lines.push(fmtChapter(c.sec) + ' ' + c.label);
    lines.push('');
  }
  lines.push('Video edukasi. Narasi lengkap per scene mengikuti timestamp audio.');
  lines.push('');
  lines.push(hashtags);

  const out = outFile ? resolve(outFile) : path.join(dir('video'), 'description.txt');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines.join('\n'), 'utf8');

  const meta = {
    title: titles[0].slice(0, 100),
    titleOptions: titles.map(t => t.slice(0, 100)),
    description: lines.join('\n'),
    tags,
    categoryId: '27',
    privacyStatus: 'unlisted',
    publishAt: null,
    sourceScript: path.basename(scriptPath),
    scenes: stamps.length,
    durationSec: Math.round(cp.totalDur || (stamps.length ? stamps[stamps.length - 1].sec : 0))
  };
  fs.writeFileSync(path.join(path.dirname(out), 'upload-meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  return out;
}

module.exports = { describe };
