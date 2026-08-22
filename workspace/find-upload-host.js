const https = require('https');
const url = 'https://idc.gcloud.tencent.com/dist/dolphin-d4afd11044f7ee224132.js';
https.get(url, res => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const s = Buffer.concat(chunks).toString();
    // Find baseURL
    const baseURLRx = /baseURL\s*:\s*["'`]([^"'`]+)["'`]/g;
    const m1 = [...s.matchAll(baseURLRx)].map(m=>m[1]);
    console.log('baseURL values:', [...new Set(m1)].join('\n'));

    // Find this.request assignment
    const reqRx = /this\.request\s*=\s*([^;]{0,300})/g;
    const m2 = [...s.matchAll(reqRx)].map(m=>m[1]);
    console.log('\nrequest assignments:');
    [...new Set(m2)].slice(0,5).forEach(v => console.log('  ' + v.substring(0,200)));

    // Search near initUpload
    const idx = s.indexOf('initUpload');
    if (idx >= 0) {
      const seg = s.substring(Math.max(0,idx-3000), idx+300);
      const axIdx = seg.lastIndexOf('axios');
      if (axIdx >= 0) console.log('\naxios near initUpload:\n', seg.substring(axIdx, axIdx+500));
      // Also look for 'new '
      const newIdx = seg.lastIndexOf('new ');
      if (newIdx >= 0) console.log('\nnew near initUpload:\n', seg.substring(newIdx, newIdx+300));
    }
  });
});
