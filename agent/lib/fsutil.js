const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

function cfg() { return CFG; }

function dir(name) {
  const rel = CFG.folders[name];
  const abs = path.join(ROOT, rel || name);
  fs.mkdirSync(abs, { recursive: true });
  return abs;
}

function resolve(p) {
  if (!p) return null;
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return '[' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0') + ']';
}

function parseStamp(line) {
  const m = line.match(/\[(\d{1,2}):(\d{2})\]/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function argValue(args, name, def) {
  const i = args.indexOf('--' + name);
  if (i === -1 || i + 1 >= args.length) return def;
  return args[i + 1];
}

function hasFlag(args, name) {
  return args.includes('--' + name);
}

function ensureExt(p, ext) {
  return path.extname(p) ? p : p + ext;
}

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'video';
}

module.exports = { cfg, dir, resolve, fmtTime, parseStamp, argValue, hasFlag, ensureExt, slugify, ROOT };
