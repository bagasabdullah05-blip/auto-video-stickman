const { execFileSync } = require('child_process');
const path = require('path');
const ffmpeg = require('./ffmpeg');
const base = path.join(__dirname, '..');
const outDir = path.join(base, '04-gambar');
const fs = require('fs');
fs.mkdirSync(outDir, { recursive: true });
const colors = ['0x2b2b3a', '0x3a2b2b', '0x2b3a2b', '0x2b2b5a', '0x5a2b2b', '0x2b5a2b', '0x5a2b3a', '0x3a5a2b'];
const font = 'C\\:/Windows/Fonts/arial.ttf';
for (let i = 1; i <= 92; i++) {
  const n = String(i).padStart(4, '0');
  const out = path.join(outDir, 'scene_' + n + '.png');
  execFileSync(ffmpeg, [
    '-y', '-f', 'lavfi', '-i', 'color=c=' + colors[(i - 1) % colors.length] + ':s=1920x1080',
    '-vf', "drawtext=text='SCENE " + i + "':fontfile=" + font + ':fontsize=140:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2',
    '-frames:v', '1', '-update', '1', out
  ], { stdio: 'pipe' });
  process.stdout.write('  ' + n + '\n');
}
process.stdout.write('selesai: ' + fs.readdirSync(outDir).length + ' gambar\n');
