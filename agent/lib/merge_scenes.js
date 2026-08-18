const fs = require('fs');
const path = require('path');
const promptDir = path.join(__dirname, '..', '03-prompt');
const data = JSON.parse(fs.readFileSync(path.join(promptDir, 'cutpoints.json'), 'utf8'));
const chunks = data.chunks.filter(c => c && typeof c.start === 'number');
const target = 13;
const scenes = [];
let cur = null;
for (const c of chunks) {
  if (!cur) {
    cur = { start: c.start, end: c.end, texts: [c.text] };
    continue;
  }
  const dur = c.end - cur.start;
  if (dur >= target) {
    scenes.push(cur);
    cur = { start: c.start, end: c.end, texts: [c.text] };
  } else {
    cur.end = c.end;
    cur.texts.push(c.text);
  }
}
if (cur) scenes.push(cur);
const out = scenes.map((s, i) => ({
  start: s.start,
  end: s.end,
  text: s.texts.join(' ')
}));
fs.writeFileSync(path.join(promptDir, 'cutpoints.json'), JSON.stringify({ chunks: out }, null, 2), 'utf8');
const lines = out.map((s, i) => '[' + fmt(s.start) + '] ' + s.text);
function fmt(t) {
  const m = String(Math.floor(t / 60)).padStart(2, '0');
  const s = String(Math.floor(t % 60)).padStart(2, '0');
  return m + ':' + s;
}
fs.writeFileSync(path.join(promptDir, 'timestamp.txt'), lines.join('\n'), 'utf8');
process.stdout.write('scene gabung: ' + chunks.length + ' -> ' + out.length + '\n');
