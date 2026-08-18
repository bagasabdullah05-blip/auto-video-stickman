importScripts('lib/mp4-muxer.js');

const W = 1920, H = 1080, FPS = 30;
const scenePadding = 0.3;
let scenes = [];
let chunks = [];
let bitmaps = [];
let audioPcm = null;
let audioSampleRate = 0;
let encoder = null;
let audioEncoder = null;
let muxer = null;
let aborted = false;
let frameCount = 0;
let openFrames = 0;
let openAudio = 0;
let audioChunks = 0;
let audioBytes = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function log(msg) { postMessage({ type: 'log', msg }); }

function codecCandidates() {
  return ['avc1.640028', 'avc1.64001f', 'avc1.4d0028', 'avc1.42001f'];
}

async function pickVideoConfig() {
  for (const hw of ['prefer-hardware', 'no-preference', 'prefer-software']) {
    for (const codec of codecCandidates()) {
      const cfg = { codec, width: W, height: H, bitrate: 4_000_000, framerate: FPS, latencyMode: 'quality', hardwareAcceleration: hw };
      const s = await VideoEncoder.isConfigSupported(cfg);
      if (s.supported) return { cfg, codec, hw };
    }
  }
  throw new Error('Tidak ada konfigurasi VideoEncoder yang didukung');
}

function coverFit(ctx, bmp) {
  const sx = W / bmp.width, sy = H / bmp.height, s = Math.max(sx, sy);
  const dw = bmp.width * s, dh = bmp.height * s;
  ctx.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

function sceneDuration(i) {
  if (i < scenes.length - 1) return scenes[i + 1].start - scenes[i].start + scenePadding;
  const lastEnd = scenes[i].end || scenes[i].start + 3;
  return lastEnd - scenes[i].start + scenePadding;
}

function buildMuxer() {
  muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H },
    audio: { codec: 'aac', sampleRate: audioSampleRate, numberOfChannels: audioPcm ? audioPcm.length : 0 },
    fastStart: 'in-memory'
  });
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'scenes') {
      scenes = msg.chunks.map(c => ({ start: c.start, end: c.end }));
      bitmaps = msg.bitmaps;
      chunks = msg.chunks;
      postMessage({ type: 'ready', total: scenes.length });
      return;
    }
    if (msg.type === 'audio') {
      audioPcm = msg.channels;
      audioSampleRate = msg.sampleRate;
      let mx = 0;
      for (let c = 0; c < audioPcm.length; c++) {
        for (let i = 0; i < audioPcm[c].length; i++) {
          const v = Math.abs(audioPcm[c][i]);
          if (v > mx) mx = v;
        }
      }
      postMessage({ type: 'log', msg: 'audio PCM diterima: ' + audioPcm.length + ' ch @ ' + audioSampleRate + ' Hz, len=' + audioPcm[0].length + ', max=' + mx });
      return;
    }
    if (msg.type === 'start') { await run(); return; }
    if (msg.type === 'abort') {
      aborted = true;
      if (encoder) { try { encoder.close(); } catch {} }
      if (audioEncoder) { try { audioEncoder.close(); } catch {} }
      postMessage({ type: 'log', msg: 'dibatalkan' });
    }
  } catch (err) {
    postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};

async function run() {
  if (!scenes.length) throw new Error('Belum ada scene');
  const t0 = performance.now();
  const { cfg, codec, hw } = await pickVideoConfig();
  log('video codec: ' + codec + ' (' + hw + ')');
  postMessage({ type: 'codec', codec, hw });

  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: false });

  buildMuxer();

  const chunksOut = [];
  encoder = new VideoEncoder({
    output: (chunk, meta) => {
      chunksOut.push([chunk, meta]);
      muxer.addVideoChunk(chunk, meta);
    },
    error: (err) => { if (!aborted) postMessage({ type: 'error', message: 'video encoder: ' + err.message }); }
  });
  encoder.configure(cfg);

  let audioDone = audioPcm ? setupAudioEncoder() : Promise.resolve();

  const total = scenes.length;
  const outChunks = [];
  let baseTs = null;

  for (let i = 0; i < total; i++) {
    if (aborted) break;
    const bmp = bitmaps[i];
    ctx.clearRect(0, 0, W, H);
    coverFit(ctx, bmp);
    const durSec = sceneDuration(i);
    const ts = Math.round(scenes[i].start * 1e6);
    if (baseTs === null) baseTs = ts;
    const frame = new VideoFrame(canvas, { timestamp: ts, duration: Math.round(durSec * 1e6) });
    openFrames++;
    frameCount++;
    while (encoder.encodeQueueSize > 4 && !aborted) await sleep(1);
    await encoder.encode(frame);
    frame.close();
    openFrames--;
    if (bmp) { bmp.close(); bitmaps[i] = null; }

    if ((i + 1) % 5 === 0 || i === total - 1) {
      const elapsed = (performance.now() - t0) / 1000;
      postMessage({
        type: 'progress',
        done: i + 1, total,
        fps: (i + 1) / elapsed,
        rt: (scenes[i].start + durSec) / elapsed
      });
    }
  }

  if (aborted) return;

  await audioDone;
  await encoder.flush();
  encoder.close();
  encoder = null;

  if (audioEncoder) {
    await audioEncoder.flush();
    audioEncoder.close();
    audioEncoder = null;
  }

  muxer.finalize();
  const buffer = muxer.target.buffer;

  log('audio stat: chunks=' + audioChunks + ' bytes=' + audioBytes);
  log('leak check: openFrames=' + openFrames + ' openAudio=' + openAudio + ' frameCount=' + frameCount);
  postMessage({ type: 'done', buffer, stats: { frames: frameCount, openFrames, openAudio, codec } });
}

function setupAudioEncoder() {
  const t0 = performance.now();
  const chunksOut = [];
  audioChunks = 0;
  audioBytes = 0;
  audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      chunksOut.push([chunk, meta]);
      muxer.addAudioChunk(chunk, meta);
      audioBytes += chunk.byteLength;
      audioChunks++;
    },    error: (err) => { if (!aborted) postMessage({ type: 'error', message: 'audio encoder: ' + err.message }); }
  });
  const bitrate = audioSampleRate >= 44100 ? 128_000 : 64_000;
  audioEncoder.configure({
    codec: 'mp4a.40.2',
    sampleRate: audioSampleRate,
    numberOfChannels: audioPcm.length,
    bitrate
  });

  const nFrames = audioPcm[0].length;
  const nCh = audioPcm.length;
  const planar = nCh === 1 ? audioPcm[0] : new Float32Array(nFrames * nCh);
  if (nCh > 1) {
    for (let c = 0; c < nCh; c++) planar.set(audioPcm[c], c * nFrames);
  }
  const chunk = 4096;
  const enqueue = async (start) => {
    if (aborted) return;
    const n = Math.min(chunk, nFrames - start);
    if (n <= 0) return;
    const data = new AudioData({
      format: 'f32-planar',
      sampleRate: audioSampleRate,
      numberOfFrames: n,
      numberOfChannels: nCh,
      timestamp: Math.round(start / audioSampleRate * 1e6),
      data: planar.subarray(start, start + n)
    });
    openAudio++;
    while (audioEncoder.encodeQueueSize > 8 && !aborted) await sleep(1);
    await audioEncoder.encode(data);
    data.close();
    openAudio--;
    await enqueue(start + chunk);
  };
  return enqueue(0);
}
