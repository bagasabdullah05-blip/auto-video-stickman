const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA = process.env.DATA_DIR || 'C:\\Users\\user\\Documents\\Flow Video Stickman\\agent';
const PORT = process.env.PORT || 8000;
const OUT_FILE = process.env.OUT_FILE || '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp'
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath.startsWith('/data/')) {
    const file = path.join(DATA, urlPath.slice('/data/'.length));
    if (!file.startsWith(DATA)) { res.writeHead(403); return res.end('Forbidden'); }
    return fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not Found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  }
  if (urlPath === '/data-list.json') {
    const list = { images: [], audio: null, cuts: null };
    try {
      const imgDir = path.join(DATA, '04-gambar');
      for (const f of fs.readdirSync(imgDir)) {
        if (/\.(png|jpe?g|webp)$/i.test(f)) list.images.push(f);
      }
      const audio = ['02-audio', '02-audio'].map(d => path.join(DATA, d)).find(d => fs.existsSync(d));
      if (audio) {
        const a = fs.readdirSync(audio).find(f => /\.(mp3|m4a|wav|ogg)$/i.test(f));
        if (a) list.audio = '02-audio/' + a;
      }
      const cuts = path.join(DATA, '03-prompt', 'cutpoints.json');
      if (fs.existsSync(cuts)) list.cuts = '03-prompt/cutpoints.json';
    } catch (e) { list.error = String(e); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(list));
  }
  if (urlPath === '/log' && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const line = Buffer.concat(chunks).toString('utf8');
      const logPath = path.join(DATA, '05-video', 'webcodecs.log');
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, new Date().toISOString() + ' ' + line + '\n');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });
    return;
  }
  if (urlPath === '/save' && req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const target = OUT_FILE || path.join(DATA, '05-video', 'video.mp4');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, Buffer.concat(chunks));
      process.env.__SAVED = '1';
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK ' + Buffer.concat(chunks).length);
    });
    return;
  }
  if (urlPath === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ saved: process.env.__SAVED === '1' }));
  }
  const file = path.join(ROOT, urlPath);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('WebCodecs Encoder: http://localhost:' + PORT);
});
