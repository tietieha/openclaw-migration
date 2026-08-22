const https = require('https');
const url = 'https://idc.gcloud.tencent.com/dist/dolphin-d4afd11044f7ee224132.js';
https.get(url, res => {
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const s = Buffer.concat(chunks).toString();

    // Find all calls to uploader.start( 
    // The uploader is stored as t.uploader or similar
    // Search for .start( near upload code
    const rx = /uploader\.start\(([^)]{0,300})\)/g;
    const m = [...s.matchAll(rx)];
    console.log('uploader.start calls:');
    m.slice(0,10).forEach(m => console.log('  ', m[1].substring(0,200)));

    // Also search for H.default start calls
    const rx2 = /\.start\s*\(\s*([^,)]{0,100})\s*,\s*([^,)]{0,200})\s*[,)]/g;
    const m2 = [...s.matchAll(rx2)];
    // Filter ones that look like they pass a URL
    const hostCalls = m2.filter(m => m[2].includes('Host') || m[2].includes('host') || m[2].includes('getHost') || m[2].includes('upload'));
    console.log('\n.start(file, baseURL) calls:');
    hostCalls.slice(0,10).forEach(m => console.log('  arg1:', m[1].substring(0,80), '\n  arg2:', m[2].substring(0,200)));
  });
});
