const log = m => { console.log(m); fetch('/log', { method: 'POST', body: String(m) }).catch(() => {}); };

function sortImages(images) {
  return images.slice().sort((a, b) => {
    const n = f => {
      const m = f.name.match(/scene[_-]*(\d+)/i) || f.name.match(/(\d{5})/) || f.name.match(/\[(\d{2})-(\d{2})\]/);
      if (!m) return 0;
      if (m[1] && m[2] && /\[/.test(f.name)) return parseInt(m[1]) * 60 + parseInt(m[2]);
      return parseInt(m[1]);
    };
    return n(a) - n(b);
  });
}

async function main() {
  log('mulai');
  const list = await (await fetch('data-list.json')).json();
  const make = u => ({ name: u.split('/').pop(), file: () => fetch('data/' + u).then(r => r.blob()) });
  const images = list.images.map(f => make('04-gambar/' + f));
  const audio = list.audio ? make(list.audio) : null;
  const cuts = list.cuts ? make(list.cuts) : null;
  log('data: ' + images.length + ' gambar, audio=' + !!audio + ', cuts=' + !!cuts);

  const sorted = sortImages(images);
  const bitmaps = [];
  for (let i = 0; i < sorted.length; i++) {
    bitmaps.push(await createImageBitmap(await sorted[i].file()));
    if ((i + 1) % 20 === 0) log('decode gambar ' + (i + 1) + '/' + sorted.length);
  }
  log('semua gambar terdecode: ' + bitmaps.length);

  let chunks = [];
  if (cuts) chunks = (JSON.parse(await (await cuts.file()).text()).chunks || []).filter(c => typeof c.start === 'number');
  log('cutpoints: ' + chunks.length);

  let audioMsg = null;
  if (audio) {
    const buf = await (await audio.file()).arrayBuffer();
    const ctx = new AudioContext();
    const ab = await ctx.decodeAudioData(buf);
    const channels = [];
    for (let c = 0; c < ab.numberOfChannels; c++) channels.push(ab.getChannelData(c));
    audioMsg = { type: 'audio', channels, sampleRate: ab.sampleRate };
    log('audio terdecode: ' + channels.length + ' ch @ ' + ab.sampleRate);
  } else {
    log('PERINGATAN: tanpa audio');
  }

  const worker = new Worker('worker.js');
  worker.onerror = e => { log('worker ERROR: ' + e.message); fail(); };
  worker.onmessage = async (ev) => {
    const m = ev.data;
    if (m.type === 'log') log(m.msg);
    if (m.type === 'codec') log('codec: ' + m.codec + ' (' + m.hw + ')');
    if (m.type === 'progress') {
      if (m.done % 10 === 0 || m.done === m.total) log('progress ' + m.done + '/' + m.total + ' rt=' + (m.rt ? m.rt.toFixed(1) : '?') + 'x');
    }
    if (m.type === 'error') { log('ERROR: ' + m.message); fail(); }
    if (m.type === 'done') {
      log('ENCODE SELESAI: ' + m.stats.frames + ' frame, openFrames=' + m.stats.openFrames);
      const res = await fetch('/save', { method: 'POST', body: m.buffer });
      log('SAVE: ' + await res.text());
      worker.terminate();
      try { window.close(); } catch {}
    }
  };
  function fail() { worker.terminate(); try { window.close(); } catch {} }

  log('kirim scene ke worker (' + bitmaps.length + ' bitmap)...');
  const ok = bitmaps.every(b => b instanceof ImageBitmap);
  log('cek bitmap: semua ImageBitmap = ' + ok);
  worker.postMessage({ type: 'scenes', chunks, bitmaps }, bitmaps);
  log('scene terkirim');
  if (audioMsg) {
    log('kirim audio ke worker (' + audioMsg.channels.length + ' ch, transfer ' + audioMsg.channels.length + ' Float32Array)...');
    worker.postMessage(audioMsg, audioMsg.channels.map(c => c.buffer));
    log('audio terkirim');
  }
  worker.postMessage({ type: 'start' });
  log('start dikirim');
}

main().catch(e => { log('main ERROR: ' + e.message); });
