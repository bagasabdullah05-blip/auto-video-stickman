const VOICES = {
  en: [
    { id: 'en-US-AndrewMultilingualNeural', nama: 'Andrew (US, pria)', info: '⭐ paling natural, tenang, cocok narasi panjang' },
    { id: 'en-US-BrianMultilingualNeural', nama: 'Brian (US, pria)', info: '⭐ smooth, hangat, low-fatigue' },
    { id: 'en-US-EmmaMultilingualNeural', nama: 'Emma (US, wanita)', info: '⭐ lembut, cocok storytelling' },
    { id: 'en-US-RogerNeural', nama: 'Roger (US, pria)', info: '⭐ tenang, stabil, direkomendasikan komunitas' },
    { id: 'en-US-DavisNeural', nama: 'Davis (US, pria)', info: '⭐ deep voice, santai, cocok relaxation' },
    { id: 'en-US-ChristopherNeural', nama: 'Christopher (US, pria)', info: 'natural, tenang, tegas' },
    { id: 'en-US-AriaNeural', nama: 'Aria (US, wanita)', info: 'warm, smooth, low-fatigue' },
    { id: 'en-GB-RyanNeural', nama: 'Ryan (UK, pria)', info: 'aksen Inggris, smooth' },
    { id: 'en-US-GuyNeural', nama: 'Guy (US, pria)', info: 'suara pria ceria' },
    { id: 'en-US-EricNeural', nama: 'Eric (US, pria)', info: 'suara pria tegas' },
    { id: 'en-IN-PrabhatNeural', nama: 'Prabhat (India, pria)', info: 'paling mirip gaya Raunak' },
    { id: 'en-IN-DhruvNeural', nama: 'Dhruv (India, pria)', info: 'alternatif India pria' },
    { id: 'en-AU-WilliamNeural', nama: 'William (AU, pria)', info: 'aksen Australia' },
    { id: 'en-US-MichelleNeural', nama: 'Michelle (US, wanita)', info: 'suara wanita ceria' }
  ],
  id: [
    { id: 'id-ID-ArdiNeural', nama: 'Ardi (Indonesia, pria)', info: 'suara Indonesia pria' },
    { id: 'id-ID-GadisNeural', nama: 'Gadis (Indonesia, wanita)', info: 'suara Indonesia wanita' }
  ]
};

function listAll() {
  const rows = [];
  for (const k of Object.keys(VOICES)) {
    for (const v of VOICES[k]) rows.push(v);
  }
  return rows;
}

function isValid(id) {
  return listAll().some(v => v.id === id);
}

module.exports = { VOICES, listAll, isValid };
