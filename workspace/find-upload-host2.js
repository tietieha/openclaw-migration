const https = require('https');
const url = 'https://idc.gcloud.tencent.com/dist/dolphin-d4afd11044f7ee224132.js';
https.get(url, res => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const s = Buffer.concat(chunks).toString();

    // Find 'new H.default({' construction to understand what 'a' is in baseURL:a
    // Search for the uploader class constructor
    const idx = s.indexOf('new H.default({time');
    if (idx >= 0) {
      // Look backwards for where this is called (find the enclosing function)
      const seg = s.substring(Math.max(0,idx-2000), idx+500);
      console.log('=== context around new H.default ===');
      console.log(seg);
    }

    // Also find where cancelToken + baseURL is constructed
    const idx2 = s.indexOf('baseURL:a');
    if (idx2 >= 0) {
      console.log('\n=== baseURL:a context ===');
      console.log(s.substring(Math.max(0,idx2-500), idx2+300));
    }
  });
});
