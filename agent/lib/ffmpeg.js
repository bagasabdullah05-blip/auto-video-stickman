const fs = require('fs');
const path = require('path');

function candidates() {
  const list = [];
  try {
    const p = require('ffmpeg-static');
    if (p) list.push(p);
  } catch (e) {}
  list.push(path.join(__dirname, '..', 'tools', 'ffmpeg', 'ffmpeg.exe'));
  list.push(path.join(__dirname, '..', 'tools', 'ffmpeg.exe'));
  return list;
}

function findFfmpeg() {
  for (const c of candidates()) {
    try {
      if (c && fs.existsSync(c)) return c;
    } catch (e) {}
  }
  return 'ffmpeg';
}

module.exports = findFfmpeg();
module.exports.findFfmpeg = findFfmpeg;
