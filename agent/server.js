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
<title>Viral Video Studio — Dashboard</title>
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
  <h1>&#9641; Viral Video Studio — Dashboard</h1>
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

<div class="modal-overlay" id="modalTTS">
  <div class="modal">
    <h3>&#127908; Generate Suara (TTS)</h3>
    <p style="font-size:12px;color:var(--muted);margin-bottom:6px">Pilih suara yang cocok dengan mood konten video kamu.</p>
    <div id="voiceCards" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0;max-height:300px;overflow-y:auto"></div>
    <div style="font-size:11px;color:var(--muted);margin-top:6px">Suara saat ini: <b id="currentVoice" style="color:var(--text)"></b></div>
    <div class="btn-row">
      <button class="btn btn-orange" onclick="closeModal('modalTTS')">Batal</button>
      <button class="btn btn-purple" onclick="runTTSFromModal()">Generate Suara</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modalMetadata">
  <div class="modal" style="max-width:650px">
    <h3>&#128200; Generate Metadata YouTube</h3>
    <p style="font-size:12px;color:var(--muted);margin-bottom:8px">Tempel script video kamu. Sistem akan generate judul viral, deskripsi, dan tags SEO mengikuti pola master prompt.</p>
    <textarea id="metadataScript" placeholder="Tempel script narasi di sini..." style="min-height:140px"></textarea>
    <div class="btn-row">
      <button class="btn btn-orange" onclick="closeModal('modalMetadata')">Batal</button>
      <button class="btn btn-cyan" onclick="generateMetadata()">Generate Metadata</button>
    </div>
    <div id="metadataResult" style="display:none;margin-top:16px">
      <div style="font-size:13px;font-weight:700;color:var(--cyan);margin-bottom:8px">&#9989; Hasil Metadata</div>
      <div style="margin-bottom:10px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">VIRAL VIDEO TITLE</div>
        <div id="metaTitle" style="background:#10131d;border:1px solid var(--border);border-radius:8px;padding:10px;font-size:13px;color:var(--text);cursor:pointer" onclick="copyText('metaTitle')" title="Klik untuk salin"></div>
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">VIDEO DESCRIPTION</div>
        <div id="metaDesc" style="background:#10131d;border:1px solid var(--border);border-radius:8px;padding:10px;font-size:12px;color:var(--text);white-space:pre-wrap;line-height:1.6;cursor:pointer;max-height:200px;overflow-y:auto" onclick="copyText('metaDesc')" title="Klik untuk salin"></div>
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">VIRAL VIDEO TAGS (comma-separated)</div>
        <div id="metaTags" style="background:#10131d;border:1px solid var(--border);border-radius:8px;padding:10px;font-size:12px;color:var(--text);cursor:pointer" onclick="copyText('metaTags')" title="Klik untuk salin"></div>
      </div>
      <div style="font-size:11px;color:var(--green);background:rgba(61,220,132,.06);border:1px dashed rgba(61,220,132,.3);border-radius:8px;padding:8px 12px;line-height:1.5">
        <b>Metadata siap!</b> Klik tiap kotak untuk salin. Paste ke YouTube Studio: judul di title, deskripsi di description, tags di Tags field.
      </div>
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

<div class="modal-overlay" id="modalZip">
  <div class="modal" style="max-width:600px">
    <h3>&#128230; Upload Paket Viral (ZIP)</h3>
    <p style="font-size:12px;color:var(--muted);margin-bottom:10px">ZIP berisi <b style="color:var(--text)">NNN_image_*.png + NNN_voice_*.wav</b> per scene (hasil dari Gemini / Buat Materi).</p>
    <input type="file" id="zipFile" accept=".zip" style="width:100%;background:#10131d;color:var(--text);border:1px solid var(--border);border-radius:8px;padding:10px;font-size:12px">
    <div id="zipProgress" style="display:none;margin-top:10px;background:#10131d;border-radius:8px;overflow:hidden"><div id="zipBar" style="height:10px;width:0%;background:var(--orange)"></div></div>
    <div id="zipInfo" style="display:none;margin-top:12px;font-size:12px;color:var(--muted);line-height:1.8"></div>
    <div id="zipResult" style="display:none;margin-top:12px"></div>
    <div class="btn-row">
      <button class="btn btn-orange" onclick="closeModal('modalZip')">Tutup</button>
      <button class="btn btn-green" id="btnRakit" onclick="runViral()" style="display:none">Rakit Video (WebCodecs)</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modalYT">
  <div class="modal" style="max-width:600px">
    <h3>&#9654; Setting Akun YouTube</h3>
    <div id="ytStatusBox" style="font-size:12px;color:var(--muted);margin-bottom:12px;line-height:1.7">Memeriksa status...</div>
    <div style="font-size:11px;color:var(--muted);margin-bottom:4px">CLIENT ID (dari Google Cloud Console &rarr; OAuth Desktop app)</div>
    <input id="ytClientId" placeholder="xxx.apps.googleusercontent.com" style="width:100%;background:#10131d;color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:8px">
    <div style="font-size:11px;color:var(--muted);margin-bottom:4px">CLIENT SECRET</div>
    <input id="ytClientSecret" placeholder="GOCSPX-..." style="width:100%;background:#10131d;color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:8px">
    <div id="ytAuthBox" style="display:none;margin-top:10px;font-size:12px;line-height:1.7"></div>
    <div class="btn-row">
      <button class="btn btn-orange" onclick="closeModal('modalYT')">Tutup</button>
      <button class="btn btn-blue" onclick="saveYTClient()">Simpan</button>
      <button class="btn btn-red" onclick="ytAuthStart()">Hubungkan Akun</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="modalPublish">
  <div class="modal" style="max-width:650px">
    <h3>&#128228; Deskripsi &amp; Upload YouTube</h3>
    <div style="font-size:11px;color:var(--muted);margin-bottom:4px">VIDEO</div>
    <input id="pubVideo" readonly style="width:100%;background:#10131d;color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:8px">
    <div style="font-size:11px;color:var(--muted);margin-bottom:4px">JUDUL</div>
    <input id="pubTitle" style="width:100%;background:#10131d;color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:8px">
    <div style="font-size:11px;color:var(--muted);margin-bottom:4px">DESKRIPSI (otomatis dari timestamp &mdash; boleh diedit)</div>
    <textarea id="pubDesc" style="min-height:140px"></textarea>
    <div class="input-row">
      <select id="pubPrivacy"><option value="unlisted">Unlisted (tidak publik)</option><option value="private">Private</option><option value="public">Public</option></select>
      <input id="pubAt" type="datetime-local" title="Jadwal tayang (opsional)">
    </div>
    <p style="font-size:11px;color:var(--muted);margin-top:6px">Jadwal tayang otomatis memaksa status private sampai waktunya tiba.</p>
    <div id="pubResult" style="display:none;margin-top:10px;font-size:12px"></div>
    <div class="btn-row">
      <button class="btn btn-orange" onclick="closeModal('modalPublish')">Tutup</button>
      <button class="btn btn-cyan" onclick="runDescribeStage()">1. Buat Deskripsi</button>
      <button class="btn btn-red" onclick="ytUpload()">2. Upload</button>
    </div>
  </div>
</div>

<script>
const CARDS = [
  { icon:'1', color:'var(--blue)', title:'Script', sub:'Tulis narasi', id:'script',
    desc:'<b>Langkah 1:</b> Generate script pakai AI (Claude/ChatGPT), lalu paste di sini.',
    actions:[{label:'Paste Script',cls:'btn-blue',fn:'openModalScript'},{label:'Lihat Folder',cls:'btn-orange',fn:'openFolder("01-script")'}]},
  { icon:'2', color:'var(--purple)', title:'Suara (TTS)', sub:'Text to Speech', id:'tts',
    desc:'<b>Langkah 2:</b> Ubah script jadi audio MP3. Pilih suara sesuai mood konten.',
    actions:[{label:'Generate Suara',cls:'btn-purple',fn:'openModalTTS()'},{label:'Lihat Folder',cls:'btn-orange',fn:'openFolder("02-audio")'}]},
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
  { icon:'7', color:'var(--cyan)', title:'Metadata YouTube', sub:'Judul + Deskripsi + Tags', id:'metadata',
    desc:'<b>Langkah 7:</b> Generate judul viral, deskripsi, dan tags SEO dari script.',
    actions:[{label:'Generate Metadata',cls:'btn-cyan',fn:'openModalMetadata()'},{label:'Lihat Folder',cls:'btn-orange',fn:'openFolder("05-video")'}]},
  { icon:'&#128230;', color:'var(--orange)', title:'Paket Viral (ZIP)', sub:'Upload &rarr; Rakit', id:'zip',
    desc:'<b>Mode cepat:</b> upload ZIP aset (image + voice per scene) lalu rakit via WebCodecs dalam hitungan detik.',
    actions:[{label:'Upload ZIP',cls:'btn-orange',fn:'openModalZip()'},{label:'Lihat Hasil',cls:'btn-green',fn:'openFolder("05-video")'}]},
  { icon:'&#9654;', color:'var(--red)', title:'YouTube', sub:'Konek + Upload + Jadwal', id:'yt',
    desc:'<b>Posting otomatis:</b> hubungkan akun, upload video, set deskripsi & jadwal tayang.',
    actions:[{label:'Setting Akun',cls:'btn-red',fn:'openModalYT()'},{label:'Cek Status',cls:'btn-blue',fn:'ytStatus()'}]},
  { icon:'&#10024;', color:'var(--purple)', title:'Buat Materi', sub:'Script + Gambar + Suara', id:'materi',
    desc:'<b>Langkah 0:</b> buat paket materi (script, image, voice) di Gemini, unduh ZIP-nya lalu upload di kartu Paket Viral.',
    actions:[{label:'Buka Gemini',cls:'btn-purple',fn:'openMateri()'}]},
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

let selectedVoice = '';
const VOICE_MOODS = {
  'en-US-AndrewMultilingualNeural': { mood:'Tenang & Reflektif', cocok:'Sejarah, psikologi, evolusi, filosofi' },
  'en-US-BrianMultilingualNeural': { mood:'Hangat & Grounding', cocok:'Sains, fakta, pengantar tidur' },
  'en-US-EmmaMultilingualNeural': { mood:'Lembut & Intimate', cocok:'Cerita personal, emosional, relationship' },
  'en-US-RogerNeural': { mood:'Stabil & Tegas', cocok:'Listicle, "5 hal yang...", edukasi' },
  'en-US-ChristopherNeural': { mood:'Natural & Serius', cocok:'Mystery, conspiracy, teori' },
  'en-US-AriaNeural': { mood:'Warm & Smooth', cocok:'Narasi wanita, lifestyle, self-care' },
  'en-GB-RyanNeural': { mood:'Elegan (British)', cocok:'Sejarah Eropa, klasik, budaya' },
  'en-US-DavisNeural': { mood:'Deep & Santai', cocok:'Sleep story, relaxation, meditasi' },
  'en-US-GuyNeural': { mood:'Ceria & Energik', cocok:'Fun facts, hiburan, trending' },
  'en-US-EricNeural': { mood:'Tegas & Jelas', cocok:'Tutorial, how-to, penjelasan' },
  'en-IN-PrabhatNeural': { mood:'India, Natural', cocok:'Gaya Raunak, narasi India' },
  'en-IN-DhruvNeural': { mood:'India, Alternatif', cocok:'Alternatif pria India' },
  'en-AU-WilliamNeural': { mood:'Australia', cocok:'Aksen Australia, casual' },
  'en-US-MichelleNeural': { mood:'Ceria (Wanita)', cocok:'Lifestyle, tips, trending' },
  'id-ID-ArdiNeural': { mood:'Indonesia (Pria)', cocok:'Konten Bahasa Indonesia' },
  'id-ID-GadisNeural': { mood:'Indonesia (Wanita)', cocok:'Konten Bahasa Indonesia' }
};

async function openModalTTS() {
  const r = await api('/api/voices');
  const cfg = await api('/api/status');
  selectedVoice = cfg.config.voice;
  const container = document.getElementById('voiceCards');
  container.innerHTML = r.voices.map(v => {
    const m = VOICE_MOODS[v.id] || { mood:'-', cocok:'-' };
    const sel = v.id === selectedVoice ? 'border:2px solid var(--purple);background:#1a1535' : '';
    return '<div onclick="pickVoice(\\''+v.id+'\\')" style="cursor:pointer;padding:10px;border-radius:10px;border:1px solid var(--border);background:#10131d;'+sel+'" id="vc-'+v.id.replace(/[^a-zA-Z]/g,'')+'">'+
      '<div style="font-size:12px;font-weight:700;color:var(--text)">'+v.nama+'</div>'+
      '<div style="font-size:10.5px;color:var(--purple);margin-top:2px">'+m.mood+'</div>'+
      '<div style="font-size:10.5px;color:var(--muted);margin-top:2px">'+m.cocok+'</div>'+
    '</div>';
  }).join('');
  document.getElementById('currentVoice').textContent = selectedVoice;
  openModal('modalTTS');
}

function pickVoice(id) {
  selectedVoice = id;
  document.querySelectorAll('#voiceCards > div').forEach(el => {
    el.style.border = '1px solid var(--border)';
    el.style.background = '#10131d';
  });
  const sel = document.getElementById('vc-' + id.replace(/[^a-zA-Z]/g,''));
  if (sel) { sel.style.border = '2px solid var(--purple)'; sel.style.background = '#1a1535'; }
  document.getElementById('currentVoice').textContent = id;
}

async function runTTSFromModal() {
  if (!selectedVoice) { alert('Pilih suara terlebih dahulu.'); return; }
  closeModal('modalTTS');
  clearLog(); log('[~] Menjalankan TTS dengan suara: ' + selectedVoice, 'info');
  log('[~] Ini mungkin butuh beberapa menit...', 'warn');
  const r = await fetch('/api/run-tts?voice=' + encodeURIComponent(selectedVoice));
  const d = await r.json();
  if (d.ok) { log('[OK] Audio berhasil dibuat dengan suara: ' + selectedVoice, 'ok'); log(d.output, ''); }
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

function openModalMetadata() {
  document.getElementById('metadataScript').value = '';
  document.getElementById('metadataResult').style.display = 'none';
  openModal('modalMetadata');
}

function extractKeywords(text) {
  const stop = new Set('the a an is are was were be been being have has had do does did will would shall should may might can could of in to for on with at by from as into through during before after above below between out off over under again further then once here there when where why how all both each few more most other some such no not only own same so than too very s that this these those i me my we our you your he him his she her it its they them their what which who whom if about because but and or nor so yet still also just than more most much many well really going get got make made things thing way back even still'.split(' '));
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3 && !stop.has(w));
  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  return Object.entries(freq).sort((a,b) => b[1] - a[1]).slice(0, 20).map(e => e[0]);
}

function generateMetadata() {
  const script = document.getElementById('metadataScript').value.trim();
  if (!script) { alert('Script harus diisi.'); return; }

  const kw = extractKeywords(script);
  const topic = kw.slice(0, 5).join(' ');
  const sentences = script.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const firstLines = sentences.slice(0, 3).map(s => s.trim()).join('. ');

  const titlePatterns = [
    'What Ancient Humans Knew About ' + (kw[0] || 'Life'),
    'Why You Can\'t Stop ' + (kw[0] || 'Thinking'),
    'The Hidden Truth About ' + (kw[0] || 'Your Brain'),
    'What If We Are All ' + (kw[1] || 'Wrong'),
    'You Never Noticed This About ' + (kw[0] || 'Your Body'),
    'The Real Reason You ' + (kw[0] || 'Feel') + ' This Way',
    'What ' + (kw[0] || 'Science') + ' Says About ' + (kw[1] || 'You'),
    'Why Your Brain ' + (kw[0] || 'Lies') + ' To You Every Day',
  ];
  const title = titlePatterns[Math.floor(Math.random() * titlePatterns.length)];
  const finalTitle = title.length > 70 ? title.substring(0, 67) + '...' : title;

  const hashtags = kw.slice(0, 15).map(w => '#' + w).join(' ');
  const desc = firstLines + '.\n\nIn this video, you\'ll discover the surprising truth about ' + topic + '. What you think you know is only the surface.\n\nIf this changed your perspective, hit like, drop a comment, and subscribe for more deep dives into the human experience.\n\n' + hashtags;

  const broadTags = ['human evolution', 'psychology', 'anthropology', 'history', 'brain science', 'ancient humans', 'human behavior', 'neuroscience', 'science documentary', 'educational', 'mind explained', 'body language', 'sleep science', 'evolution explained', 'ancient history'];
  const specificTags = kw.map(w => w.replace(/_/g, ' '));
  const allTags = [...broadTags, ...specificTags].slice(0, 35);
  const tags = allTags.join(', ');

  document.getElementById('metaTitle').textContent = finalTitle;
  document.getElementById('metaDesc').textContent = desc;
  document.getElementById('metaTags').textContent = tags;
  document.getElementById('metadataResult').style.display = 'block';
  log('[OK] Metadata berhasil di-generate dari ' + kw.length + ' keyword.', 'ok');
}

function copyText(id) {
  const text = document.getElementById(id).textContent;
  navigator.clipboard.writeText(text).then(() => {
    const el = document.getElementById(id);
    const orig = el.style.borderColor;
    el.style.borderColor = 'var(--green)';
    setTimeout(() => { el.style.borderColor = orig; }, 800);
  });
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

const MATERI_URL = 'https://share.gemini.google/ygcOmHjXk8lR';
function openMateri() { window.open(MATERI_URL, '_blank'); log('[~] Membuka Gemini pembuat materi di tab baru.', 'info'); log('Buat paket di Gemini, unduh ZIP-nya, lalu upload via kartu Paket Viral.', 'warn'); }

let currentPack = '';
let currentStage = '';

function openModalZip() {
  document.getElementById('zipFile').value = '';
  document.getElementById('zipProgress').style.display = 'none';
  document.getElementById('zipBar').style.width = '0%';
  document.getElementById('zipInfo').style.display = 'none';
  document.getElementById('zipResult').style.display = 'none';
  document.getElementById('btnRakit').style.display = 'none';
  currentPack = '';
  openModal('modalZip');
}

async function uploadZip() {
  const inp = document.getElementById('zipFile');
  if (!inp.files.length) return;
  const fd = new FormData();
  fd.append('zip', inp.files[0]);
  document.getElementById('zipProgress').style.display = 'block';
  document.getElementById('zipInfo').style.display = 'none';
  document.getElementById('zipResult').style.display = 'none';
  log('[~] Mengupload ' + inp.files[0].name + '...', 'info');
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload-zip');
  xhr.upload.onprogress = e => {
    if (e.lengthComputable) document.getElementById('zipBar').style.width = Math.round(e.loaded / e.total * 100) + '%';
  };
  xhr.onload = () => {
    let d = {};
    try { d = JSON.parse(xhr.responseText); } catch (e) { d = { ok: false, error: 'Respon server tidak valid.' }; }
    if (!d.ok) { log('[!] Upload gagal: ' + d.error, 'err'); return; }
    currentPack = d.pack;
    document.getElementById('zipBar').style.width = '100%';
    const box = document.getElementById('zipInfo');
    box.style.display = 'block';
    box.innerHTML = 'Topik: <b>' + d.topic + '</b><br>Scene: <b>' + d.scenes + '</b> &nbsp; Estimasi: <b>' + d.durasi + '</b>';
    document.getElementById('btnRakit').style.display = '';
    log('[OK] Paket siap: ' + d.scenes + ' scene (' + d.durasi + ')', 'ok');
  };
  xhr.onerror = () => log('[!] Upload gagal (koneksi).', 'err');
  xhr.send(fd);
}
document.addEventListener('change', e => { if (e.target && e.target.id === 'zipFile') uploadZip(); });

async function pollJob(id, done) {
  const d = await (await fetch('/api/job/' + id)).json();
  if (d.running) { setTimeout(() => pollJob(id, done), 2000); return; }
  done(d);
}

async function runViral() {
  if (!currentPack) { alert('Upload ZIP dulu.'); return; }
  const btn = document.getElementById('btnRakit');
  btn.disabled = true;
  clearLog(); log('[~] Merakit video via WebCodecs...', 'info');
  const r = await (await fetch('/api/run-viral', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pack: currentPack }) })).json();
  if (!r.ok) { log('[!] Gagal: ' + r.error, 'err'); btn.disabled = false; return; }
  log('[~] Job ' + r.id + ' berjalan. Menunggu selesai...', 'warn');
  pollJob(r.id, d => {
    btn.disabled = false;
    log(d.log, '');
    if (d.code === 0) {
      log('[OK] Video jadi: ' + d.video, 'ok');
      const box = document.getElementById('zipResult');
      box.style.display = 'block';
      box.innerHTML = '<div style="font-size:12px;color:var(--green);margin-bottom:8px"><b>Video selesai!</b> ' + d.video + ' (' + d.scenes + ' scene)</div>' +
        '<button class="btn btn-cyan" onclick="openPublish(\\'' + d.video.replace(/\\/g, '\\\\') + '\\',\\'' + d.stage.replace(/\\/g, '\\\\') + '\\')">Deskripsi &amp; Upload</button> ' +
        '<button class="btn btn-blue" onclick="window.open(\\'/video/' + d.videoFile + '\\',\\'_blank\\')">Putar / Unduh</button>';
    } else {
      log('[!] Rakit gagal (kode ' + d.code + ').', 'err');
    }
    refreshStatus();
  });
}

function openPublish(video, stage) {
  document.getElementById('pubVideo').value = video;
  document.getElementById('pubTitle').value = '';
  document.getElementById('pubDesc').value = '';
  document.getElementById('pubResult').style.display = 'none';
  currentStage = stage;
  closeModal('modalZip');
  openModal('modalPublish');
}

async function runDescribeStage() {
  clearLog(); log('[~] Membuat deskripsi dari timestamp...', 'info');
  const r = await (await fetch('/api/run-describe', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ stage: currentStage }) })).json();
  if (!r.ok) { log('[!] Gagal: ' + r.error, 'err'); return; }
  document.getElementById('pubDesc').value = r.description;
  document.getElementById('pubTitle').value = r.title;
  log('[OK] Deskripsi + chapters dibuat dari ' + r.scenes + ' timestamp.', 'ok');
}

async function ytUpload() {
  const video = document.getElementById('pubVideo').value;
  const title = document.getElementById('pubTitle').value.trim();
  const description = document.getElementById('pubDesc').value;
  const privacy = document.getElementById('pubPrivacy').value;
  const at = document.getElementById('pubAt').value;
  if (!video || !title) { alert('Video dan judul harus diisi (buat deskripsi dulu).'); return; }
  clearLog(); log('[~] Mengupload ke YouTube...', 'info');
  const r = await (await fetch('/api/yt-upload', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ video, title, description, privacy, publishAt: at }) })).json();
  if (!r.ok) { log('[!] Gagal: ' + r.error, 'err'); return; }
  log('[~] Job ' + r.id + ' berjalan...', 'warn');
  pollJob(r.id, d => {
    log(d.log, '');
    const box = document.getElementById('pubResult');
    box.style.display = 'block';
    box.innerHTML = d.code === 0 ? '<span style="color:var(--green)"><b>Berhasil tayang!</b> ' + d.url + '</span>' : '<span style="color:var(--red)">Upload gagal (kode ' + d.code + ').</span>';
  });
}

async function openModalYT() {
  document.getElementById('ytAuthBox').style.display = 'none';
  openModal('modalYT');
  await ytStatus();
}

async function ytStatus() {
  const box = document.getElementById('ytStatusBox');
  if (box) box.textContent = 'Memeriksa status...';
  const d = await (await fetch('/api/yt-status')).json();
  const html = 'Client ID: <b>' + (d.hasClient ? 'terpasang' : 'belum ada') + '</b><br>Akun: <b>' + (d.connected ? d.channel : 'belum terhubung') + '</b>';
  if (box) box.innerHTML = html;
  log('[~] YouTube: client=' + (d.hasClient ? 'OK' : '-') + ', akun=' + (d.connected ? d.channel : '-'), 'info');
}

async function saveYTClient() {
  const client_id = document.getElementById('ytClientId').value.trim();
  const client_secret = document.getElementById('ytClientSecret').value.trim();
  if (!client_id || !client_secret) { alert('Client ID dan Secret harus diisi.'); return; }
  const r = await (await fetch('/api/yt-client', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ client_id, client_secret }) })).json();
  if (r.ok) { log('[OK] Client tersimpan.', 'ok'); ytStatus(); }
  else log('[!] Gagal: ' + r.error, 'err');
}

async function ytAuthStart() {
  const box = document.getElementById('ytAuthBox');
  box.style.display = 'block';
  box.innerHTML = 'Meminta URL login...';
  const r = await (await fetch('/api/yt-auth-start', { method:'POST' })).json();
  if (!r.ok) { box.innerHTML = 'Gagal: ' + r.error; return; }
  const check = async () => {
    const s = await (await fetch('/api/yt-auth-start')).json();
    if (s.url) {
      box.innerHTML = '1. Buka link ini di browser:<br><a href="' + s.url + '" target="_blank" style="color:var(--cyan);word-break:break-all">' + s.url + '</a><br>2. Login &amp; klik Allow, lalu tunggu status berubah.';
      const poll = setInterval(async () => {
        const st = await (await fetch('/api/yt-status')).json();
        if (st.connected) { clearInterval(poll); box.innerHTML = 'Terhubung: <b>' + st.channel + '</b>'; ytStatus(); }
      }, 3000);
    } else if (!s.done) setTimeout(check, 1500);
    else box.innerHTML = 'Gagal: ' + (s.error || 'tidak diketahui');
  };
  check();
}

async function refreshStatus() {
  const d = await api('/api/status');
  renderStatus(d);
}

renderCards();
refreshStatus();
</script>
</body>
</html>`;

const jobs = {};
let jobSeq = 0;
let authState = { url: '', done: false, error: '' };

function startJob(label, cmd, args) {
  const id = 'job' + (++jobSeq) + '_' + Date.now();
  const proc = spawn(cmd, args, { cwd: __dirname });
  const j = { label, running: true, code: null, log: '', video: '', stage: '', videoFile: '', scenes: 0 };
  jobs[id] = j;
  proc.stdout.on('data', d => { j.log += d.toString(); });
  proc.stderr.on('data', d => { j.log += d.toString(); });
  proc.on('close', code => { j.running = false; j.code = code; });
  proc.on('error', e => { j.running = false; j.code = 1; j.log += 'ERROR: ' + e.message; });
  return id;
}

function readJson(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); } });
  });
}

function execv(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = '';
    p.stderr.on('data', d => err += d.toString());
    p.on('close', code => code === 0 ? resolve(true) : reject(new Error(err.slice(-400) || ('kode ' + code))));
    p.on('error', e => reject(e));
  });
}

function saveMultipart(req, destDir) {
  return new Promise((resolve, reject) => {
    const m = (req.headers['content-type'] || '').match(/boundary=([^;]+)/);
    if (!m) return reject(new Error('Bukan form multipart.'));
    const boundary = Buffer.from('--' + m[1].trim());
    const keep = boundary.length + 8;
    let buf = Buffer.alloc(0);
    let phase = 0;
    let out = null;
    let filename = 'upload.zip';
    let filepath = '';
    req.on('data', c => {
      buf = Buffer.concat([buf, c]);
      if (phase === 0) {
        const hi = buf.indexOf(Buffer.from('\r\n\r\n'));
        if (hi === -1) return;
        const fm = buf.slice(0, hi).toString('utf8').match(/filename="([^"]+)"/);
        if (fm) filename = fm[1].split(/[\\/]/).pop() || filename;
        fs.mkdirSync(destDir, { recursive: true });
        filepath = path.join(destDir, filename);
        out = fs.createWriteStream(filepath);
        buf = buf.slice(hi + 4);
        phase = 1;
      }
      if (phase === 1 && buf.length > keep) {
        out.write(buf.slice(0, buf.length - keep));
        buf = buf.slice(buf.length - keep);
      }
    });
    req.on('end', () => {
      if (phase !== 1) return reject(new Error('Upload kosong.'));
      const idx = buf.indexOf(boundary);
      const end = idx === -1 ? buf.length : idx - 2;
      if (end > 0) out.write(buf.slice(0, end));
      out.end(() => resolve({ filename, filepath }));
    });
    req.on('error', reject);
  });
}

function freeServerOut(out) {
  if (!fs.existsSync(out)) return out;
  const ext = path.extname(out);
  const base = out.slice(0, -ext.length);
  let i = 2;
  while (fs.existsSync(base + '_' + i + ext)) i++;
  return base + '_' + i + ext;
}

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
    const voice = url.searchParams.get('voice');
    const args = ['run.js', 'tts', '--input', input];
    if (voice) args.push('--voice', voice);
    const r = await runCommand('node', args);
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

  if (url.pathname === '/api/upload-zip' && req.method === 'POST') {
    try {
      const upDir = path.join(__dirname, '06-viral', '_uploads');
      const { filename, filepath } = await saveMultipart(req, upDir);
      const base = path.basename(filename, '.zip');
      const packDir = path.join(__dirname, '06-viral', '_pack', base);
      await execv('powershell', ['-NoProfile', '-Command', 'Expand-Archive -LiteralPath "' + filepath + '" -DestinationPath "' + packDir + '" -Force']);
      const { viralInfo, packTopic } = require('./lib/viral');
      const info = viralInfo(packDir);
      if (!info.scenes) throw new Error('ZIP tidak berisi pasangan NNN_image_* + NNN_voice_*.');
      const secs = info.estSec;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, pack: packDir, topic: packTopic(packDir), scenes: info.scenes, durasi: Math.floor(secs / 60) + ' mnt ' + (secs % 60) + ' dtk' }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  if (url.pathname === '/api/run-viral' && req.method === 'POST') {
    const body = await readJson(req);
    try {
      if (!body.pack) throw new Error('Pack belum diupload.');
      const base = path.basename(body.pack);
      const out = freeServerOut(path.join(dir('video'), base + '.mp4'));
      const id = startJob('viral', 'node', ['run.js', 'viral', '--dir', body.pack, '--out', out]);
      jobs[id].video = out;
      jobs[id].stage = path.join(__dirname, '06-viral', base);
      jobs[id].videoFile = path.basename(out);
      const { viralInfo } = require('./lib/viral');
      jobs[id].scenes = viralInfo(body.pack).scenes;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  if (url.pathname.startsWith('/api/job/')) {
    const id = url.pathname.split('/').pop();
    const j = jobs[id];
    if (!j) { res.writeHead(404); res.end('Not found'); return; }
    let outUrl = '';
    if (!j.running && j.code === 0 && j.label === 'youtube-upload') {
      const m = j.log.match(/youtube\.com\/watch\?v=[\w-]+/);
      if (m) outUrl = 'https://' + m[0];
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ running: j.running, code: j.code, log: j.log.slice(-6000), video: j.video || '', stage: j.stage || '', videoFile: j.videoFile || '', scenes: j.scenes || 0, url: outUrl }));
    return;
  }

  if (url.pathname === '/api/yt-status') {
    const hasClient = fs.existsSync(path.join(__dirname, 'youtube-client.json'));
    const connected = fs.existsSync(path.join(__dirname, '.youtube-token.json'));
    let channel = '';
    for (const j of Object.values(jobs)) {
      const m = j.log.match(/Channel:\s*(.+?)\s*\(/);
      if (m) channel = m[1];
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ hasClient, connected, channel: channel || (connected ? 'terhubung' : '') }));
    return;
  }

  if (url.pathname === '/api/yt-client' && req.method === 'POST') {
    const body = await readJson(req);
    try {
      if (!body.client_id || !body.client_secret) throw new Error('Client ID dan Secret wajib diisi.');
      fs.writeFileSync(path.join(__dirname, 'youtube-client.json'), JSON.stringify({ client_id: body.client_id, client_secret: body.client_secret }, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  if (url.pathname === '/api/yt-auth-start' && req.method === 'POST') {
    try {
      if (!fs.existsSync(path.join(__dirname, 'youtube-client.json'))) throw new Error('Simpan Client ID/Secret dulu.');
      authState = { url: '', done: false, error: '' };
      const proc = spawn('node', ['run.js', 'youtube', 'auth'], { cwd: __dirname });
      let out = '';
      proc.stdout.on('data', d => {
        out += d.toString();
        const m = out.match(/https?:\/\/[^\s'"]+/);
        if (m) authState.url = m[0];
      });
      proc.stderr.on('data', d => { out += d.toString(); });
      proc.on('close', code => {
        authState.done = true;
        if (code !== 0) authState.error = out.slice(-500);
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  if (url.pathname === '/api/yt-auth-start' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ url: authState.url, done: authState.done, error: authState.error }));
    return;
  }

  if (url.pathname === '/api/run-describe' && req.method === 'POST') {
    const body = await readJson(req);
    try {
      if (!body.stage) throw new Error('Stage tidak dikenal.');
      const { describe } = require('./lib/describe');
      const scriptDir = path.join(body.stage, '01-script');
      const scriptFiles = fs.readdirSync(scriptDir).filter(f => f.endsWith('.txt'));
      if (!scriptFiles.length) throw new Error('Script tidak ada di stage.');
      const out = path.join(body.stage, '05-video', 'description.txt');
      describe(path.join(scriptDir, scriptFiles[0]), out, {
        stamp: path.join(body.stage, '03-prompt', 'timestamp.txt'),
        cut: path.join(body.stage, '03-prompt', 'cutpoints.json')
      });
      const meta = JSON.parse(fs.readFileSync(path.join(body.stage, '05-video', 'upload-meta.json'), 'utf8'));
      const stamps = fs.readFileSync(path.join(body.stage, '03-prompt', 'timestamp.txt'), 'utf8').split('\n').filter(Boolean).length;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, title: meta.title, description: meta.description, scenes: stamps }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  if (url.pathname === '/api/yt-upload' && req.method === 'POST') {
    const body = await readJson(req);
    try {
      if (!body.video || !body.title) throw new Error('Video dan judul wajib diisi.');
      const args = ['run.js', 'youtube', 'upload', '--video', body.video, '--title', body.title, '--privacy', body.privacy || 'unlisted'];
      if (body.description) args.push('--description', body.description);
      if (body.publishAt) args.push('--publish-at', new Date(body.publishAt).toISOString());
      const id = startJob('youtube-upload', 'node', args);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  if (url.pathname.startsWith('/video/')) {
    const name = path.basename(url.pathname.slice('/video/'.length));
    const file = path.join(dir('video'), name);
    if (!name.toLowerCase().endsWith('.mp4') || !fs.existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }
    const stat = fs.statSync(file);
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': stat.size, 'Content-Disposition': 'attachment; filename="' + name + '"' });
    fs.createReadStream(file).pipe(res);
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
