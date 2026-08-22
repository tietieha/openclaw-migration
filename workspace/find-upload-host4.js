const https = require('https');
const url = 'https://idc.gcloud.tencent.com/dist/dolphin-d4afd11044f7ee224132.js';
https.get(url, res => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const s = Buffer.concat(chunks).toString();

    // Find getUploadUrl function definition
    const idx = s.indexOf('"getUploadUrl"');
    if (idx >= 0) {
      console.log('=== getUploadUrl definition ===');
      console.log(s.substring(idx, idx+600));
    }

    // Also look for key:"getUploadUrl"
    const idx2 = s.indexOf('key:"getUploadUrl"');
    if (idx2 >= 0) {
      console.log('\n=== key:getUploadUrl ===');
      console.log(s.substring(idx2, idx2+600));
    }

    // Search for getUploadUrl calls to see the full pattern
    const rx = /getUploadUrl[^)]*\)/g;
    const m = [...s.matchAll(rx)];
    console.log('\ngetUploadUrl calls:');
    m.slice(0,5).forEach(m => console.log(' ', m[0].substring(0,200)));
  });
});
