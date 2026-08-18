const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { cfg, dir } = require('./lib/fsutil');

const PORT = 5000;

function getFolderStatus() {
  const result = {};
  for (const [key, folder] of Object.entries(cfg().folders)) {
    const d = dir(key);
    if (!fs.existsSync(d)) { result[key] = { count: 0, files: [] }; continue; }
    const files = fs.readdirSync(d).filter(f => !f.startsWith('.'));
    result[key] = { count: files.length, files: files.slice(0, 10) };
  }
  return result;
}

function runCommand(cmd, args) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd: path.join(__dirname), shell: true });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => resolve({ code, stdout, stderr }));
    proc.on('error', e => resolve({ code: 1, stdout: '', stderr: e.message }));
  });
}

const HTML = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Auto Video Stickman — Dashboard</title>
<style>
:root{--bg:#0c0e14;--card:#151824;--border:#252b3d;--text:#e9ebf2;--muted:#9aa2b5;--blue:#4f8cff;--green:#3ddc84;--orange:#ffa24c;--red:#ff6b6b;--purple:#b07bff;--cyan:#35e0c8}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',Arial,sans-serif;min-height:100vh}
.topbar{background:linear-gradient(135deg,#16213e,#0f3460);padding:16px 24px;display:flex;align-items:center;gap:14px;border-bottom:2px solid var(--red)}
.topbar h1{font-size:18px;color:#fff;flex:1}
.topbar .status-dot{width:10px;height:10px;border-radius:50%;background:var(--green)}
.wrap{max-width:1100px;margin:0 auto;padding:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px;transition:transform .15s}
.card:hover{transform:translateY(-2px)}
.card-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.card-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900}
.card-title{font-size:15px;font-weight:700}
.card-title small{display:block;font-size:11px;color:var(--muted);font-weight:400}
.card-body{font-size:13px;color:var(--muted);line-height:1.6}
.card-body b{color:var(--text)}
.btn{display:inline-block;padding:10px 20px;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;margin-top:12px;transition:opacity .15s}
.btn:hover{opacity:.85}
.btn-blue{background:var(--blue);color:#fff}
.btn-green{background:var(--green);color:#08130c}
.btn-orange{background:var(--orange);color:#08130c}
.btn-purple{background:var(--purple);color:#fff}
.btn-red{background:var(--red);color:#fff}
.btn-cyan{background:var(--cyan);color:#08130c}
.btn:disabled{opacity:.4;cursor:not-allowed}
.status-bar{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px 20px;margin-bottom:16px;display:flex;gap:20px;flex-wrap:wrap}
.status-item{font-size:12px;color:var(--muted)}
.status-item b{color:var(--text);font-size:14px}
.log-panel{background:#0f0f1a;border:1px solid var(--border);border-radius:14px;padding:16px;margin-top:16px}
.log-panel h3{font-size:13px;color:var(--cyan);margin-bottom:10px}
.log-box{background:#0a0a14;border:1px solid var(--border);border-radius:8px;padding:12px;height:260px;overflow-y:auto;font-family:Consolas,monospace;font-size:12px;line-height:1.7;color:var(--muted);white-space:pre-wrap;word-break:break-all}
.log-box .ok{color:var(--green)}.log-box .err{color:var(--red)}.log-box .info{color:var(--blue)}.log-box .warn{color:var(--orange)}
.input-row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.input-row input,.input-row select{background:#10131d;color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;flex:1;min-width:120px}
.input-row input:focus,.input-row select:focus{outline:none;border-color:var(--blue)}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100;align-items:center;justify-content:center}
.modal-overlay.show{display:flex}
.modal{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:24px;width:90%;max-width:500px}
.modal h3{margin-bottom:12px;font-size:16px}
.modal textarea{width:100%;background:#10131d;color:var(--text);border:1px solid var(--border);border-radius:8px;padding:10px;font-family:Consolas,monospace;font-size:12px;min-height:120px;resize:vertical}
.modal .btn-row{display:flex;gap:8px;margin-top:12px;justify-content:flex-end}
.file-list{margin-top:8px;font-size:11.5px;color:var(--muted);line-height:1.6}
</style>
</head>
<body>
<div class="topbar">
  <div class="status-dot"></div>
  <h1>&#9641; Auto Video Stickman — Dashboard</h1>
</div>
<div class="wrap">
  <div class="status-bar" id="statusBar"></div>
  <div class="grid" id="grid"></div>
  <div class="log-panel">
    <h3>&#9654; Log Aktivitas</h3>
    <div class="log-box" id="logBox">Siap. Pilih langkah dari panel di atas.</div>
  </div>
</div>

<div class="modal-overlay" id="modalScript">
  <div class="modal">
    <h3>&#9998; Paste Script Narasi</h3>
    <p style="font-size:12px;color:var(--muted);margin-bottom:10px">Tempel hasil script dari AI (plain text). Simpan otomatis ke folder 01-script.</p>
    <input id="scriptName" placeholder="Nama file: script_topik.txt" style="width:100%;background:#10131d;color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:8px">
    <textarea id="scriptContent" placeholder="Tempel script di sini..."></textarea>
    <div class="btn-row">
      <button class="btn btn-orange" onclick="closeModal('modalScript')">Batal</button>
      <button class="btn btn-green" onclick="saveScript()">Simpan</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modalVoices">
  <div class="modal">
    <h3>&#127908; Ganti Suara</h3>
    <p style="font-size:12px;color:var(--muted);margin-bottom:10px">Pilih suara untuk voice-over. Perubahan disimpan otomatis.</p>
    <select id="voiceSelect" style="width:100%;background:#10131d;color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;min-height:200px"></select>
    <div class="btn-row">
      <button class="btn btn-orange" onclick="closeModal('modalVoices')">Batal</button>
      <button class="btn btn-green" onclick="applyVoice()">Simpan</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modalPrompts">
  <div class="modal">
    <h3>&#127912; Prompt Gambar</h3>
    <p style="font-size:12px;color:var(--muted);margin-bottom:10px">1 baris = 1 prompt. Pisahkan tiap prompt dengan 1 baris kosong.</p>
    <textarea id="promptContent" placeholder="Tempel prompt gambar di sini..." style="min-height:200px"></textarea>
    <div class="btn-row">
      <button class="btn btn-orange" onclick="closeModal('modalPrompts')">Batal</button>
      <button class="btn btn-green" onclick="savePrompts()">Simpan</button>
    </div>
  </div>
</div>

<script>
const CARDS = [
  { icon:'1', color:'var(--blue)', title:'Script', sub:'Tulis narasi', id:'script',
    desc:'<b>Langkah 1:</b> Generate script pakai AI (Claude/ChatGPT), lalu paste di sini.',
    actions:[{label:'Paste Script',cls:'btn-blue',fn:'openModalScript'},{label:'Lihat Folder',cls:'btn-orange',fn:'openFolder("01-script")'}]},
  { icon:'2', color:'var(--purple)', title:'Suara (TTS)', sub:'Text to Speech', id:'tts',
    desc:'<b>Langkah 2:</b> Ubah script jadi audio MP3. Ganti suara di config.',
    actions:[{label:'Generate Suara',cls:'btn-purple',fn:'runTTS()'},{label:'Ganti Suara',cls:'btn-orange',fn:'loadVoices()'},{label:'Lihat Folder',cls:'btn-orange',fn:'openFolder("02-audio")'}]},
  { icon:'3', color:'var(--cyan)', title:'Timestamp (STT)', sub:'Transkrip + Jeda', id:'stt',
    desc:'<b>Langkah 3:</b> Deteksi jeda suara → timestamp per kalimat = 1 scene.',
    actions:[{label:'Generate Timestamp',cls:'btn-cyan',fn:'runSTT()'},{label:'Lihat Folder',cls:'btn-orange',fn:'openFolder("03-prompt")'}]},
  { icon:'4', color:'var(--orange)', title:'Prompt Gambar', sub:'Image Prompts', id:'prompts',
    desc:'<b>Langkah 4:</b> Paste prompt gambar dari AI untuk tiap scene.',
    actions:[{label:'Paste Prompt',cls:'btn-orange',fn:'openModalPrompts()'},{label:'Lihat Folder',cls:'btn-orange',fn:'openFolder("03-prompt")'}]},
  { icon:'5', color:'var(--green)', title:'Gambar', sub:'Google Flow + Zappy', id:'images',
    desc:'<b>Langkah 5:</b> Generate gambar di Google Flow pakai Zappy Flow (manual).',
    actions:[{label:'Panduan Generate',cls:'btn-green',fn:'showImageGuide()'},{label:'Lihat Folder',cls:'btn-orange',fn:'openFolder("04-gambar")'}]},
  { icon:'6', color:'var(--red)', title:'Rakit Video', sub:'Audio + Gambar = Video', id:'assemble',
    desc:'<b>Langkah 6:</b> Gabungkan gambar + audio jadi video MP4.',
    actions:[{label:'Rakit Video',cls:'btn-red',fn:'runAssemble()'},{label:'Lihat Folder',cls:'btn-orange',fn:'openFolder("05-video")'}]},
];

let currentLog = '';

function log(msg, cls) {
  const box = document.getElementById('logBox');
  const d = document.createElement('span');
  if (cls) d.className = cls;
  d.textContent = msg + '\\n';
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

function clearLog() {
  document.getElementById('logBox').innerHTML = '';
}

async function api(path) {
  const r = await fetch(path);
  return r.json();
}

function renderStatus(data) {
  const bar = document.getElementById('statusBar');
  const cfg = data.config;
  const folders = data.folders;
  let html = '<div class="status-item">Suara: <b>' + cfg.voice + '</b></div>';
  for (const [k, v] of Object.entries(folders)) {
    html += '<div class="status-item">' + k + ': <b>' + v.count + ' file</b></div>';
  }
  bar.innerHTML = html;
}

function renderCards() {
  const grid = document.getElementById('grid');
  grid.innerHTML = CARDS.map(c => {
    const acts = c.actions.map(a => '<button class="btn ' + a.cls + '" onclick="' + a.fn + '">' + a.label + '</button>').join('');
    return '<div class="card"><div class="card-head"><div class="card-icon" style="background:' + c.color + ';color:#08130c">' + c.icon + '</div><div class="card-title">' + c.title + '<small>' + c.sub + '</small></div></div><div class="card-body">' + c.desc + '</div>' + acts + '</div>';
  }).join('');
}

function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function openModalScript() {
  document.getElementById('scriptName').value = '';
  document.getElementById('scriptContent').value = '';
  openModal('modalScript');
}

async function saveScript() {
  const name = document.getElementById('scriptName').value.trim();
  const content = document.getElementById('scriptContent').value;
  if (!name || !content) { alert('Nama file dan script harus diisi.'); return; }
  clearLog(); log('[~] Menyimpan script...', 'info');
  const r = await fetch('/api/save-script', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, content}) });
  const d = await r.json();
  if (d.ok) { log('[OK] Script tersimpan: ' + d.path, 'ok'); closeModal('modalScript'); refreshStatus(); }
  else { log('[!] Gagal: ' + d.error, 'err'); }
}

async function loadVoices() {
  clearLog(); log('[~] Memuat daftar suara...', 'info');
  const r = await api('/api/voices');
  const sel = document.getElementById('voiceSelect');
  sel.innerHTML = r.voices.map(v => '<option value="' + v.id + '">' + v.id + ' — ' + v.nama + '</option>').join('');
  openModal('modalVoices');
}

async function applyVoice() {
  const voice = document.getElementById('voiceSelect').value;
  clearLog(); log('[~] Menyimpan suara: ' + voice, 'info');
  const r = await fetch('/api/set-voice', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({voice}) });
  const d = await r.json();
  if (d.ok) { log('[OK] Suara diubah ke: ' + voice, 'ok'); closeModal('modalVoices'); refreshStatus(); }
}

async function runTTS() {
  clearLog(); log('[~] Menjalankan TTS...', 'info');
  log('[~] Ini mungkin butuh beberapa menit...', 'warn');
  const r = await fetch('/api/run-tts');
  const d = await r.json();
  if (d.ok) { log('[OK] Audio berhasil dibuat!', 'ok'); log(d.output, ''); }
  else { log('[!] Error: ' + d.error, 'err'); log(d.output || '', ''); }
  refreshStatus();
}

async function runSTT() {
  clearLog(); log('[~] Menjalankan STT (transkripsi)...', 'info');
  log('[~] Ini mungkin butuh beberapa menit...', 'warn');
  const r = await fetch('/api/run-stt');
  const d = await r.json();
  if (d.ok) { log('[OK] Timestamp & cutpoints berhasil dibuat!', 'ok'); log(d.output, ''); }
  else { log('[!] Error: ' + d.error, 'err'); log(d.output || '', ''); }
  refreshStatus();
}

function openModalPrompts() {
  document.getElementById('promptContent').value = '';
  openModal('modalPrompts');
}

async function savePrompts() {
  const content = document.getElementById('promptContent').value;
  if (!content) { alert('Prompt harus diisi.'); return; }
  clearLog(); log('[~] Menyimpan prompt gambar...', 'info');
  const r = await fetch('/api/save-prompts', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({content}) });
  const d = await r.json();
  if (d.ok) { log('[OK] Prompt tersimpan: ' + d.path, 'ok'); closeModal('modalPrompts'); refreshStatus(); }
  else { log('[!] Gagal: ' + d.error, 'err'); }
}

async function showImageGuide() {
  clearLog();
  log('=== PANDUAN GENERATE GAMBAR ===', 'info');
  log('1. Buka flow.google.com → project baru', '');
  log('2. Matikan Agent mode', '');
  log('3. Pilih mode Image, aspect ratio 16:9, output 1', '');
  log('4. Pilih model Nano Banana 2', '');
  log('5. Buka ekstensi Zappy Flow (developer: zappywala.ai)', '');
  log('6. Tempel semua prompt dari file 03-prompt/image_prompts.txt', '');
  log('7. Set folder download ke: 04-gambar', '');
  log('8. Klik Generate — jangan tutup tab sampai selesai', '');
  log('', '');
  log('Setelah semua gambar selesai, jalankan "Rakit Video".', 'warn');
}

async function runAssemble() {
  clearLog(); log('[~] Merakit video...', 'info');
  log('[~] Ini mungkin butuh beberapa menit tergantung jumlah scene...', 'warn');
  const r = await fetch('/api/run-assemble');
  const d = await r.json();
  if (d.ok) { log('[OK] Video berhasil dibuat!', 'ok'); log(d.output, ''); }
  else { log('[!] Error: ' + d.error, 'err'); log(d.output || '', ''); }
  refreshStatus();
}

function openFolder(name) { fetch('/api/open-folder/' + name); log('[~] Membuka folder ' + name + '...', 'info'); }

async function refreshStatus() {
  const d = await api('/api/status');
  renderStatus(d);
}

renderCards();
refreshStatus();
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  if (url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ config: cfg(), folders: getFolderStatus() }));
    return;
  }

  if (url.pathname === '/api/voices') {
    const { listAll } = require('./lib/voices');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ voices: listAll() }));
    return;
  }

  if (url.pathname === '/api/set-voice' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { voice } = JSON.parse(body);
        const cfgPath = path.join(__dirname, 'config.json');
        const cfgData = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        cfgData.voice = voice;
        fs.writeFileSync(cfgPath, JSON.stringify(cfgData, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (url.pathname === '/api/save-script' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { name, content } = JSON.parse(body);
        const filePath = path.join(dir('script'), name);
        fs.writeFileSync(filePath, content, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: filePath }));
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (url.pathname === '/api/save-prompts' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { content } = JSON.parse(body);
        const filePath = path.join(dir('prompt'), 'image_prompts.txt');
        fs.writeFileSync(filePath, content, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, path: filePath }));
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (url.pathname === '/api/run-tts') {
    const scriptFiles = fs.readdirSync(dir('script')).filter(f => f.endsWith('.txt'));
    if (scriptFiles.length === 0) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Tidak ada file script di 01-script/. Paste script terlebih dahulu.' }));
      return;
    }
    const input = path.join(dir('script'), scriptFiles[scriptFiles.length - 1]);
    const r = await runCommand('node', ['run.js', 'tts', '--input', input]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: r.code === 0, output: r.stdout + r.stderr }));
    return;
  }

  if (url.pathname === '/api/run-stt') {
    const audioFile = path.join(dir('audio'), 'voiceover.mp3');
    if (!fs.existsSync(audioFile)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'File voiceover.mp3 belum ada di 02-audio/. Jalankan TTS terlebih dahulu.' }));
      return;
    }
    const r = await runCommand('node', ['run.js', 'stt', '--input', audioFile]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: r.code === 0, output: r.stdout + r.stderr }));
    return;
  }

  if (url.pathname === '/api/run-assemble') {
    const audioFile = path.join(dir('audio'), 'voiceover.mp3');
    if (!fs.existsSync(audioFile)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'File voiceover.mp3 belum ada di 02-audio/. Jalankan TTS terlebih dahulu.' }));
      return;
    }
    const r = await runCommand('node', ['run.js', 'assemble', '--audio', audioFile]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: r.code === 0, output: r.stdout + r.stderr }));
    return;
  }

  if (url.pathname.startsWith('/api/open-folder/')) {
    const folderName = url.pathname.split('/').pop();
    const folderPath = dir(folderName);
    if (fs.existsSync(folderPath)) {
      spawn('explorer', [folderPath], { detached: true, stdio: 'ignore' }).unref();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('Dashboard berjalan di: http://localhost:' + PORT);
  console.log('Tekan Ctrl+C untuk berhenti.');
  spawn('cmd', ['/c', 'start', 'http://localhost:' + PORT], { detached: true, stdio: 'ignore' }).unref();
});
