const $ = id => document.getElementById(id);
const log = (m, cls) => {
  const el = $('log');
  const div = document.createElement('div');
  div.textContent = m;
  if (cls) div.className = cls;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
};

let worker = null;
let projectFiles = null;
let audioCtx = null;

async function pickFolder() {
  if (window.showDirectoryPicker) {
    try {
      const dir = await window.showDirectoryPicker();
      projectFiles = await readDirAll(dir, '');
      onProjectLoaded();
      return;
    } catch (err) { if (err.name === 'AbortError') return; }
  }
  $('fImages').click();
}

async function readDirAll(handle, base) {
  const out = [];
  for await (const entry of handle.values()) {
    if (entry.kind === 'file') out.push({ name: (base ? base + '/' : '') + entry.name, file: () => entry.getFile() });
    else out.push(...await readDirAll(entry, base ? base + '/' + entry.name : entry.name));
  }
  return out;
}

function findFile(namePart) {
  if (!projectFiles) return null;
  return projectFiles.find(f => f.name.toLowerCase().includes(namePart.toLowerCase())) || null;
}

async function onProjectLoaded() {
  const images = projectFiles.filter(f => /04-gambar/i.test(f.name) && /\.(png|jpe?g|webp)$/i.test(f.name));
  const audio = findFile('voiceover');
  const cuts = findFile('cutpoints.json');
  $('meta').innerHTML = 'Gambar: <b>' + images.length + '</b> &nbsp;|&nbsp; Audio: <b>' + (audio ? audio.name : '?') + '</b> &nbsp;|&nbsp; Cutpoints: <b>' + (cuts ? 'OK' : '?') + '</b>';
  $('btnStart').disabled = !(images.length && audio && cuts);
  window._proj = { images, audio, cuts };
}

$('btnFolder').onclick = pickFolder;
$('fImages').onchange = () => {
  const images = [...$('fImages').files].filter(f => /\.(png|jpe?g|webp)$/i.test(f.name));
  const audio = $('fAudio').files[0];
  const cuts = $('fCuts').files[0];
  const pics = images.map(f => ({ name: f.name, file: () => f }));
  window._proj = { images: pics, audio, cuts };
  $('meta').innerHTML = 'Fallback: gambar <b>' + images.length + '</b>, audio ' + (audio ? 'OK' : 'belum') + ', cutpoints ' + (cuts ? 'OK' : 'belum');
  $('btnStart').disabled = !images.length;
};

async function loadFromServer() {
  try {
    const list = await (await fetch('data-list.json')).json();
    const make = u => ({ name: u.split('/').pop(), file: () => fetch('data/' + u).then(r => r.blob()) });
    const images = list.images.map(f => make('04-gambar/' + f));
    const audio = list.audio ? make(list.audio) : null;
    const cuts = list.cuts ? make(list.cuts) : null;
    window._proj = { images, audio, cuts };
    $('meta').innerHTML = 'Mode server: gambar <b>' + images.length + '</b> &nbsp;|&nbsp; audio <b>' + (audio ? 'OK' : '?') + '</b> &nbsp;|&nbsp; cutpoints <b>' + (cuts ? 'OK' : '?') + '</b>';
    $('btnStart').disabled = !(images.length && audio && cuts);
    log('data dimuat dari server (folder proyek agent)');
  } catch (err) {
    $('meta').textContent = 'Gagal muat data server: ' + err.message;
  }
}

function sortImages(images) {
  const sorted = images.slice().sort((a, b) => {
    const n = f => {
      const m = f.name.match(/scene[_-]*(\d+)/i) || f.name.match(/(\d{5})/) || f.name.match(/\[(\d{2})-(\d{2})\]/);
      if (!m) return 0;
      if (m[1] && m[2] && /\[/.test(f.name)) return parseInt(m[1]) * 60 + parseInt(m[2]);
      return parseInt(m[1]);
    };
    return n(a) - n(b);
  });
  return sorted;
}

$('btnStart').onclick = async () => {
  const proj = window._proj;
  if (!proj || !proj.images.length) return;
  $('btnStart').disabled = true;
  $('btnAbort').disabled = false;
  $('dl').style.display = 'none';
  log('memulai...');

  worker = new Worker('worker.js');
  worker.onmessage = onWorkerMsg;
  worker.onerror = e => { log('worker error: ' + e.message, 'err'); };

  const sorted = sortImages(proj.images);
  const bitmaps = [];
  for (const f of sorted) {
    const blob = await f.file();
    const bmp = await createImageBitmap(blob);
    bitmaps.push(bmp);
  }
  log('gambar terdecode (' + bitmaps.length + ' ImageBitmap, zero-copy transfer)...');

  let chunks = [];
  if (proj.cuts) {
    const j = JSON.parse(await (await proj.cuts.file()).text());
    chunks = (j.chunks || []).filter(c => typeof c.start === 'number');
  } else {
    chunks = [];
  }

  let audioMsg = null;
  if (proj.audio) {
    const buf = await (await proj.audio.file()).arrayBuffer();
    audioCtx = audioCtx || new AudioContext();
    const audioBuf = await audioCtx.decodeAudioData(buf);
    const channels = [];
    for (let c = 0; c < audioBuf.numberOfChannels; c++) channels.push(audioBuf.getChannelData(c));
    audioMsg = { type: 'audio', channels, sampleRate: audioBuf.sampleRate };
    log('audio terdecode: ' + channels.length + ' ch @ ' + audioBuf.sampleRate + ' Hz');
  }

  worker.postMessage({ type: 'scenes', chunks, bitmaps }, bitmaps);
  if (audioMsg) worker.postMessage(audioMsg, audioMsg.channels);
  worker.postMessage({ type: 'start' });
};

let tStart = 0;
function onWorkerMsg(e) {
  const m = e.data;
  switch (m.type) {
    case 'log': log(m.msg); break;
    case 'ready':
      tStart = performance.now();
      break;
    case 'codec':
      $('sCodec').textContent = m.codec;
      log('codec dipilih: ' + m.codec + ' (' + m.hw + ')');
      break;
    case 'progress': {
      $('bar').style.width = (m.done / m.total * 100).toFixed(1) + '%';
      $('sScene').textContent = m.done + ' / ' + m.total;
      $('sSpeed').textContent = m.rt ? m.rt.toFixed(1) + 'x' : '—';
      break;
    }
    case 'done': {
      const blob = new Blob([m.buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      $('dl').href = url;
      $('dl').style.display = 'block';
      $('sSize').textContent = (blob.size / 1024 / 1024).toFixed(1) + ' MB';
      $('sScene').textContent = m.stats.frames + ' frame';
      $('bar').style.width = '100%';
      log('SELESAI: ' + blob.size / 1048576 + ' MB, ' + m.stats.frames + ' frame, openFrames=' + m.stats.openFrames + ' (0 = aman, tidak bocor)');
      $('btnStart').disabled = false;
      $('btnAbort').disabled = true;
      break;
    }
    case 'error':
      log('ERROR: ' + m.message, 'err');
      $('btnStart').disabled = false;
      $('btnAbort').disabled = true;
      break;
  }
}

$('btnAbort').onclick = () => {
  if (worker) worker.postMessage({ type: 'abort' });
  log('abort dikirim');
};

if (new URLSearchParams(location.search).get('data') === '1') loadFromServer();
