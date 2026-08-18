const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const TOOL = path.join(__dirname, '..', 'webcodecs');
const DATA = path.join(__dirname, '..');

function findBrowser() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  return candidates.find(f => fs.existsSync(f)) || null;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = require('net').createServer();
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
    srv.on('error', reject);
  });
}

function waitServer(port, timeoutMs) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (Date.now() - t0 > timeoutMs) return reject(new Error('Server tidak mau jalan'));
      const req = http.get({ host: '127.0.0.1', port, path: '/status', timeout: 1500 }, res => {
        res.resume(); resolve(true);
      });
      req.on('error', () => setTimeout(tick, 300));
    };
    tick();
  });
}

function waitSaved(port, timeoutMs) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (Date.now() - t0 > timeoutMs) return reject(new Error('Timeout menunggu hasil encode'));
      http.get({ host: '127.0.0.1', port, path: '/status', timeout: 1500 }, res => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          try {
            if (JSON.parse(body).saved) return resolve(true);
          } catch {}
          setTimeout(tick, 1500);
        });
      }).on('error', () => setTimeout(tick, 1500));
    };
    tick();
  });
}

function startServer(port, outFile) {
  const child = spawn('node', [path.join(TOOL, 'server.js')], {
    env: { ...process.env, PORT: String(port), DATA_DIR: DATA, OUT_FILE: outFile },
    stdio: 'pipe'
  });
  return child;
}

function openBrowser(browser, port) {
  const url = 'http://127.0.0.1:' + port + '/auto.html';
  return spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--use-angle=default', '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,720', '--mute-audio', url
  ], { stdio: 'pipe' });
}

async function assembleWebcodecs(audioFile, outFile) {
  const browser = findBrowser();
  if (!browser) throw new Error('Tidak ada Edge/Chrome untuk mesin WebCodecs');

  const port = await getFreePort();
  const server = startServer(port, outFile);
  console.log('  mesin: WebCodecs (headless ' + path.basename(browser) + ')\n  port: ' + port);

  try {
    await waitServer(port, 15000);
    const child = openBrowser(browser, port);
    child.stdout.on('data', d => { const s = String(d).trim(); if (s) console.log('  [browser] ' + s); });
    child.stderr.on('data', d => { const s = String(d).trim(); if (/error|fail/i.test(s)) console.log('  [browser!] ' + s); });
    await waitSaved(port, 900000);

    console.log('  menunggu file selesai ditulis...');
    await new Promise(r => setTimeout(r, 1500));
    try { child.kill(); } catch {}
    return outFile;
  } finally {
    try { server.kill(); } catch {}
  }
}

module.exports = { assembleWebcodecs };
