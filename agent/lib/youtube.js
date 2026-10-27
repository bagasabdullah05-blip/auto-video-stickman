const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { resolve, ROOT } = require('./fsutil');

const CLIENT_FILE = path.join(ROOT, 'youtube-client.json');
const TOKEN_FILE = path.join(ROOT, '.youtube-token.json');
const ACCT_DIR = path.join(ROOT, 'youtube-accounts');
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.force-ssl'].join(' ');

function acct(name) {
  if (!name || name === 'default') return { name: 'default', clientFile: CLIENT_FILE, tokenFile: TOKEN_FILE };
  const d = path.join(ACCT_DIR, name);
  fs.mkdirSync(d, { recursive: true });
  return { name, clientFile: path.join(d, 'client.json'), tokenFile: path.join(d, 'token.json'), fallbackClient: CLIENT_FILE };
}

function listAccounts() {
  const out = [{ name: 'default', connected: fs.existsSync(TOKEN_FILE) }];
  if (fs.existsSync(ACCT_DIR)) {
    for (const d of fs.readdirSync(ACCT_DIR)) {
      const full = path.join(ACCT_DIR, d);
      if (fs.statSync(full).isDirectory()) out.push({ name: d, connected: fs.existsSync(path.join(full, 'token.json')) });
    }
  }
  return out;
}

function loadClient(store) {
  let file = store.clientFile;
  if (!fs.existsSync(file) && store.fallbackClient && fs.existsSync(store.fallbackClient)) file = store.fallbackClient;
  if (!fs.existsSync(file)) {
    throw new Error('Client YouTube untuk akun "' + store.name + '" belum ada.\nBuat OAuth Client (Desktop app) di Google Cloud Console, lalu simpan sebagai:\n  ' + store.clientFile + '\nFormat: {"client_id":"...","client_secret":"..."}');
  }
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!j.client_id || !j.client_secret) throw new Error(file + ' harus berisi client_id dan client_secret.');
  return j;
}

function loadToken(store) {
  if (!fs.existsSync(store.tokenFile)) return null;
  try { return JSON.parse(fs.readFileSync(store.tokenFile, 'utf8')); } catch { return null; }
}

function saveToken(store, t) {
  fs.mkdirSync(path.dirname(store.tokenFile), { recursive: true });
  fs.writeFileSync(store.tokenFile, JSON.stringify(t, null, 2), 'utf8');
}

function postForm(host, reqPath, params) {
  const body = new URLSearchParams(params).toString();
  return new Promise((resolveP, reject) => {
    const req = https.request({ host, path: reqPath, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } },
      res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode + ': ' + (j.error_description || j.error || data)));
            resolveP(j);
          } catch (e) { reject(new Error('Respon bukan JSON: ' + data.slice(0, 200))); }
        });
      });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function refreshAccess(client, store, token) {
  if (!token || !token.refresh_token) throw new Error('Akun "' + store.name + '" belum login. Jalankan: node run.js youtube auth --account ' + store.name);
  const j = await postForm('oauth2.googleapis.com', '/token', {
    client_id: client.client_id, client_secret: client.client_secret,
    refresh_token: token.refresh_token, grant_type: 'refresh_token'
  });
  const next = { ...token, access_token: j.access_token, expiry_date: Date.now() + (j.expires_in || 3600) * 1000 };
  saveToken(store, next);
  return next;
}

async function ensureToken(client, store) {
  let token = loadToken(store);
  if (!token) throw new Error('Akun "' + store.name + '" belum login. Jalankan: node run.js youtube auth --account ' + store.name);
  if (!token.expiry_date || Date.now() > token.expiry_date - 60000) token = await refreshAccess(client, store, token);
  return token;
}

function api(method, reqPath, token, body, extraHeaders) {
  const payload = body ? (Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))) : null;
  return new Promise((resolveP, reject) => {
    const req = https.request({ host: 'www.googleapis.com', path: reqPath, method,
      headers: { Authorization: 'Bearer ' + token.access_token,
        ...(payload && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}),
        ...(payload ? { 'Content-Length': payload.length } : {}), ...(extraHeaders || {}) } },
      res => {
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          let j = null;
          try { j = JSON.parse(buf.toString('utf8')); } catch {}
          if (res.statusCode >= 400) {
            const msg = (j && j.error && j.error.message) || buf.toString('utf8').slice(0, 300);
            const err = new Error('YouTube API HTTP ' + res.statusCode + ': ' + msg);
            err.statusCode = res.statusCode;
            return reject(err);
          }
          resolveP({ statusCode: res.statusCode, headers: res.headers, json: j, raw: buf });
        });
      });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function apiRetry(method, reqPath, client, store, body, extraHeaders) {
  let token = await ensureToken(client, store);
  try {
    return await api(method, reqPath, token, body, extraHeaders);
  } catch (e) {
    if (e.statusCode === 401 && loadToken(store) && loadToken(store).refresh_token) {
      token = await refreshAccess(client, store, loadToken(store));
      return await api(method, reqPath, token, body, extraHeaders);
    }
    throw e;
  }
}

function freePort() {
  return new Promise((resolveP, reject) => {
    const srv = require('net').createServer();
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolveP(p)); });
    srv.on('error', reject);
  });
}

async function cmdAuth(opt) {
  opt = opt || {};
  const store = acct(opt.account);
  const client = loadClient(store);
  const port = await freePort();
  const redirect = 'http://127.0.0.1:' + port + '/';
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: client.client_id, redirect_uri: redirect, response_type: 'code',
    scope: SCOPES, access_type: 'offline', prompt: 'consent'
  }).toString();
  console.log('Buka URL ini di browser, login, lalu klik Allow:\n\n  ' + url + '\n');
  const code = await new Promise((resolveP, reject) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x/');
      if (u.searchParams.get('code')) {
        const c = u.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html', 'Connection': 'close' });
        res.end('<h3>Login berhasil. Kembali ke aplikasi.</h3>', () => { try { req.socket.destroy(); } catch {} });
        try { srv.close(); } catch {}
        try { clearTimeout(timer); } catch {}
        resolveP(c);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h3>Gagal: ' + (u.searchParams.get('error') || 'tidak ada kode') + '</h3>');
      }
    });
    srv.listen(port, '127.0.0.1');
    const timer = setTimeout(() => { try { srv.close(); } catch {} reject(new Error('Timeout menunggu login (10 menit).')); }, 600000);
    srv.once('close', () => clearTimeout(timer));
  });
  const j = await postForm('oauth2.googleapis.com', '/token', {
    code, client_id: client.client_id, client_secret: client.client_secret,
    redirect_uri: redirect, grant_type: 'authorization_code'
  });
  saveToken(store, { access_token: j.access_token, refresh_token: j.refresh_token, expiry_date: Date.now() + (j.expires_in || 3600) * 1000 });
  const me = await apiRetry('GET', '/youtube/v3/channels?part=id,snippet&mine=true', client, store);
  const ch = me.json.items && me.json.items[0];
  if (ch) {
    try { fs.writeFileSync(path.join(path.dirname(store.tokenFile), 'channel.json'), JSON.stringify({ id: ch.id, title: ch.snippet.title }, null, 1)); } catch {}
  }
  return 'Akun "' + store.name + '" login tersimpan. Channel: ' + (ch ? ch.snippet.title + ' (' + ch.id + ')' : '(tidak terbaca)');
}

function readMeta(videoDir) {
  const p = path.join(videoDir, 'upload-meta.json');
  if (fs.existsSync(p)) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {} }
  return {};
}

async function startResumable(client, store, meta, size) {
  const r = await apiRetry('POST', '/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', client, store,
    { snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: meta.categoryId || '27' },
      status: { privacyStatus: meta.privacyStatus || 'unlisted', ...(meta.publishAt ? { publishAt: meta.publishAt } : {}), selfDeclaredMadeForKids: false } },
    { 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/mp4' });
  const loc = r.headers.location;
  if (!loc) throw new Error('Server tidak memberi upload URL.');
  return loc;
}

function putFile(sessionUrl, file, token, onProgress) {
  return new Promise((resolveP, reject) => {
    const size = fs.statSync(file).size;
    const u = new URL(sessionUrl);
    const req = https.request({ host: u.host, path: u.pathname + u.search, method: 'PUT',
      headers: { Authorization: 'Bearer ' + token.access_token, 'Content-Length': size, 'Content-Type': 'video/mp4' } },
      res => {
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          let j = null;
          try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}
          if (res.statusCode >= 400) return reject(new Error('Upload HTTP ' + res.statusCode + ': ' + ((j && j.error && j.error.message) || 'gagal')));
          resolveP(j);
        });
      });
    req.on('error', reject);
    let sent = 0;
    const stream = fs.createReadStream(file);
    stream.on('data', d => { sent += d.length; if (onProgress) onProgress(sent, size); });
    stream.on('error', reject);
    stream.pipe(req);
  });
}

async function cmdUpload(videoFile, opt) {
  opt = opt || {};
  const store = acct(opt.account);
  const client = loadClient(store);
  const file = resolve(videoFile);
  if (!file || !fs.existsSync(file)) throw new Error('File video tidak ada: ' + videoFile);
  const size = fs.statSync(file).size;
  if (!size) throw new Error('File video kosong.');

  const meta = { ...readMeta(path.dirname(file)), ...(opt.meta || {}) };
  if (opt.title) meta.title = opt.title;
  if (opt.descriptionFile) meta.description = fs.readFileSync(resolve(opt.descriptionFile), 'utf8');
  else if (opt.description) meta.description = opt.description;
  if (opt.tags) meta.tags = String(opt.tags).split(',').map(s => s.trim()).filter(Boolean);
  if (!meta.title) meta.title = path.basename(file, path.extname(file));
  meta.title = String(meta.title).slice(0, 100);
  if (opt.publishAt) {
    meta.publishAt = opt.publishAt;
    if (meta.privacyStatus !== 'private') {
      meta.privacyStatus = 'private';
      console.log('  (jadwal publish butuh status private -> dipaksa private)');
    }
  } else if (opt.privacy) meta.privacyStatus = opt.privacy;
  if (!meta.description) meta.description = '';

  console.log('Akun: ' + store.name + '\nUpload: ' + file + ' (' + (size / 1048576).toFixed(1) + ' MB)\n  judul: ' + meta.title + '\n  privasi: ' + (meta.privacyStatus || 'unlisted') + (meta.publishAt ? '\n  tayang: ' + meta.publishAt : ''));
  const sessionUrl = await startResumable(client, store, meta, size);
  let last = 0;
  const done = await putFile(sessionUrl, file, await ensureToken(client, store), (sent, total) => {
    const pct = Math.floor(sent / total * 100);
    if (pct - last >= 10) { last = pct; process.stdout.write('  progres: ' + pct + '%\n'); }
  });
  const id = done && done.id;
  if (!id) throw new Error('Upload selesai tapi ID video tidak terbaca.');
  let out = 'https://www.youtube.com/watch?v=' + id + (meta.publishAt ? ' (terjadwal: ' + meta.publishAt + ')' : '');
  if (opt.thumbnail) {
    try {
      await cmdThumbnail(id, opt.thumbnail, opt);
      out += ' + thumbnail';
    } catch (e) {
      out += '\n  (thumbnail gagal: ' + e.message.slice(0, 160) + ' — pastikan channel terverifikasi nomor HP)';
    }
  }
  return out;
}

async function cmdThumbnail(videoId, imageFile, opt) {
  opt = opt || {};
  const store = acct(opt.account);
  const client = loadClient(store);
  const file = resolve(imageFile);
  if (!file || !fs.existsSync(file)) throw new Error('File thumbnail tidak ada: ' + imageFile);
  const buf = fs.readFileSync(file);
  if (buf.length > 2000000) throw new Error('Thumbnail ' + Math.round(buf.length / 1024) + 'KB melebihi batas 2MB YouTube.');
  await apiRetry('POST', '/upload/youtube/v3/thumbnails/set?videoId=' + encodeURIComponent(videoId), client, store, buf, { 'Content-Type': 'application/octet-stream' });
  return 'Thumbnail terpasang: https://www.youtube.com/watch?v=' + videoId;
}

async function cmdUpdate(videoId, opt) {
  opt = opt || {};
  const store = acct(opt.account);
  const client = loadClient(store);
  const cur = await apiRetry('GET', '/youtube/v3/videos?part=snippet,status&id=' + encodeURIComponent(videoId), client, store);
  const item = cur.json.items && cur.json.items[0];
  if (!item) throw new Error('Video tidak ditemukan: ' + videoId);
  const snippet = { ...item.snippet };
  const status = { ...item.status };
  if (opt.title) snippet.title = String(opt.title).slice(0, 100);
  if (opt.descriptionFile) snippet.description = fs.readFileSync(resolve(opt.descriptionFile), 'utf8');
  else if (opt.description) snippet.description = opt.description;
  if (opt.tags) snippet.tags = String(opt.tags).split(',').map(s => s.trim()).filter(Boolean);
  if (opt.category) snippet.categoryId = opt.category;
  if (opt.publishAt) { status.publishAt = opt.publishAt; status.privacyStatus = 'private'; }
  else if (opt.privacy) status.privacyStatus = opt.privacy;
  delete snippet.thumbnails;
  const r = await apiRetry('PUT', '/youtube/v3/videos?part=snippet,status', client, store, { id: videoId, snippet, status });
  return 'Terupdate: https://www.youtube.com/watch?v=' + r.json.id + ' [' + r.json.status.privacyStatus + (r.json.status.publishAt ? ', tayang ' + r.json.status.publishAt : '') + ']';
}

async function cmdDoctor(opt) {
  opt = opt || {};
  const store = acct(opt.account);
  const out = ['Akun: ' + store.name];
  let client = null;
  try {
    client = loadClient(store);
    out.push('[OK] Client ID terbaca.');
  } catch (e) {
    out.push('[GAGAL] Client: ' + e.message.split('\n')[0]);
    out.push('  Solusi: buka tab 1, isi Client ID + Secret, klik Simpan Client.');
    return out.join('\n');
  }
  const token = loadToken(store);
  if (!token) {
    out.push('[GAGAL] Belum login (token tidak ada).');
    out.push('  Solusi: klik Hubungkan Akun, selesaikan login di browser.');
    return out.join('\n');
  }
  out.push('[OK] Token login ada.');
  try {
    const me = await apiRetry('GET', '/youtube/v3/channels?part=id,snippet&mine=true', client, store);
    const ch = me.json.items && me.json.items[0];
    if (ch) out.push('[OK] Channel: ' + ch.snippet.title + ' (' + ch.id + ')');
    else out.push('[GAGAL] API menjawab tapi channel tidak terbaca. Coba Hubungkan ulang.');
  } catch (e) {
    out.push('[GAGAL] API: ' + e.message.slice(0, 200));
    out.push('  Solusi: pastikan internet aktif & YouTube Data API v3 enabled, lalu Hubungkan ulang.');
  }
  return out.join('\n');
}

async function cmdVideos(opt) {
  opt = opt || {};
  const store = acct(opt.account);
  const client = loadClient(store);
  const max = Math.max(1, Math.min(50, parseInt(opt.max, 10) || 25));
  const me = await apiRetry('GET', '/youtube/v3/channels?part=contentDetails&mine=true', client, store);
  const ch = me.json.items && me.json.items[0];
  const uploads = ch && ch.contentDetails && ch.contentDetails.relatedPlaylists && ch.contentDetails.relatedPlaylists.uploads;
  if (!uploads) throw new Error('Playlist uploads tidak terbaca.');
  const pl = await apiRetry('GET', '/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=' + uploads + '&maxResults=' + max, client, store);
  const items = (pl.json.items || []).map(it => ({
    id: it.contentDetails.videoId,
    title: it.snippet.title,
    publishedAt: it.snippet.publishedAt
  }));
  let status = {};
  if (items.length) {
    const ids = items.map(i => i.id).join(',');
    const vs = await apiRetry('GET', '/youtube/v3/videos?part=status&id=' + ids, client, store);
    for (const v of (vs.json.items || [])) status[v.id] = { privacy: v.status.privacyStatus, publishAt: v.status.publishAt || null };
  }
  const rows = items.map(i => ({ ...i, ...(status[i.id] || { privacy: '-', publishAt: null }) }));
  if (opt.json) return JSON.stringify(rows);
  return rows.map(r => {
    const t = new Date(r.publishedAt);
    const d = String(t.getDate()).padStart(2, '0') + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + t.getFullYear();
    const extra = r.publishAt && r.privacy === 'private' ? ' | tayang ' + r.publishAt.slice(0, 16).replace('T', ' ') : '';
    return '[' + r.privacy + '] ' + d + '  ' + r.title + extra + '\n  https://www.youtube.com/watch?v=' + r.id;
  }).join('\n');
}

function cmdAccounts() {
  const list = listAccounts().map(a => {
    let ch = '';
    try {
      const f = a.name === 'default' ? path.join(ROOT, 'channel.json') : path.join(ACCT_DIR, a.name, 'channel.json');
      if (fs.existsSync(f)) ch = ' - ' + JSON.parse(fs.readFileSync(f, 'utf8')).title;
    } catch {}
    return (a.connected ? '[login] ' : '[keluar] ') + a.name + ch;
  });
  return list.join('\n');
}

module.exports = { cmdAuth, cmdUpload, cmdUpdate, cmdAccounts, cmdDoctor, cmdVideos, cmdThumbnail, listAccounts, acct };
