const fs = require('fs');
const path = require('path');
const { cfg, dir, resolve } = require('./fsutil');

function listScenes() {
  const promptDir = dir('prompt');
  const cutPath = path.join(promptDir, 'cutpoints.json');
  if (!fs.existsSync(cutPath)) return [];
  const data = JSON.parse(fs.readFileSync(cutPath, 'utf8'));
  return data.chunks || [];
}

function prepareManual() {
  const gambarDir = dir('gambar');
  const scenes = listScenes();
  const ref = path.join(gambarDir, 'scenes.txt');
  const lines = scenes.map((c, i) => 'scene_' + String(i + 1).padStart(4, '0') + ' -> mulai ' + c.start + 's');
  fs.writeFileSync(ref, lines.join('\n'), 'utf8');
  return { gambarDir, ref, count: scenes.length };
}

async function generateAPI(promptsFile, outDir, key, model) {
  if (!key) throw new Error('Belum ada API key Gemini. Isi config.json -> api.geminiKey (ambil gratis di aistudio.google.com). Atau pakai mode manual.');
  const file = resolve(promptsFile);
  if (!fs.existsSync(file)) throw new Error('File prompt tidak ditemukan: ' + file);
  const prompts = fs.readFileSync(file, 'utf8').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
  fs.mkdirSync(outDir, { recursive: true });
  process.stdout.write('  total ' + prompts.length + ' prompt\n');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key;
  let ok = 0, fail = 0;
  for (let i = 0; i < prompts.length; i++) {
    const label = String(i + 1).padStart(4, '0');
    process.stdout.write('  [' + (i + 1) + '/' + prompts.length + '] ' + label + ' ...\n');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompts[i] }] }] })
      });
      const j = await res.json();
      const parts = j.candidates?.[0]?.content?.parts || [];
      const img = parts.find(p => p.inlineData && p.inlineData.data);
      if (!img) throw new Error('Tidak ada gambar di respons: ' + JSON.stringify(j).slice(0, 200));
      fs.writeFileSync(path.join(outDir, 'scene_' + label + '.png'), Buffer.from(img.inlineData.data, 'base64'));
      ok++;
    } catch (e) {
      fail++;
      process.stdout.write('    GAGAL: ' + e.message + '\n');
    }
    await new Promise(r => setTimeout(r, 2500));
  }
  process.stdout.write('  selesai: ' + ok + ' berhasil, ' + fail + ' gagal.\n');
  return { ok, fail };
}

module.exports = { prepareManual, generateAPI, listScenes };
