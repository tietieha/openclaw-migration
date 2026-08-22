// GCloud Dolphin chunked APK upload script
// upload host: idcapi.gcloud.tencent.com
import fs from 'fs';
import https from 'https';
import path from 'path';
import crypto from 'crypto';

// ─── Config ───────────────────────────────────────────────
const FILE_PATH = 'C:\\Users\\leon\\.openclaw\\media\\inbound\\homm_20260818_msdk_0.1.0003.0_release_426.shell.signed.apk';
const UPLOAD_TASK_ID = 'MDAwMDAwMTF42jMxszA0NTAxs9Q1NDIwMzc0AwAfFQNw';
const G_TK = '1244640251';
const GCLOUD_ID_COOKIE = 'QQ_693034722337';
const GCLOUD_SESSIONKEY = '86Q6GdCLxUaiFGaHx1K8R25yHFydQ970';
const PLATFORM_ID = 'QQ_693034722337,86Q6GdCLxUaiFGaHx1K8R25yHFydQ970';
const COOKIE = `GCLOUD_ID=${GCLOUD_ID_COOKIE}; GCLOUD_SESSIONKEY=${GCLOUD_SESSIONKEY}; platformID=${encodeURIComponent(PLATFORM_ID)}; foreign1_468150469=2100`;
const API_HOST = 'idcapi.gcloud.tencent.com';
const BASE_PATH = '/uploadfile';
const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
// ──────────────────────────────────────────────────────────

const GCLOUD_ID_PARAM = encodeURIComponent(PLATFORM_ID);

function httpPost(urlPath, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const isBuffer = Buffer.isBuffer(body);
    const headers = {
      'Cookie': COOKIE,
      'Origin': 'https://idc.gcloud.tencent.com',
      'Referer': 'https://idc.gcloud.tencent.com/',
      ...extraHeaders,
    };
    if (!isBuffer && !extraHeaders['Content-Type']) {
      headers['Content-Type'] = 'application/json';
      body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    if (body) {
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const options = {
      hostname: API_HOST,
      path: urlPath,
      method: 'POST',
      headers,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }); }
        catch { resolve({ status: res.statusCode, body: text }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function httpPostMultipart(urlPath, fields, fileBuffer) {
  return new Promise((resolve, reject) => {
    const boundary = `----Boundary${Date.now().toString(16)}`;
    const parts = [];

    for (const [k, v] of Object.entries(fields)) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    }
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="chunk"\r\nContent-Type: application/octet-stream\r\n\r\n`));
    parts.push(fileBuffer);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);
    const options = {
      hostname: API_HOST,
      path: urlPath,
      method: 'POST',
      headers: {
        'Cookie': COOKIE,
        'Origin': 'https://idc.gcloud.tencent.com',
        'Referer': 'https://idc.gcloud.tencent.com/',
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }); }
        catch { resolve({ status: res.statusCode, body: text }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpGet(urlPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      path: urlPath,
      method: 'GET',
      headers: {
        'Cookie': COOKIE,
        'Referer': 'https://idc.gcloud.tencent.com/',
      },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }); }
        catch { resolve({ status: res.statusCode, body: text }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const taskId = UPLOAD_TASK_ID;
  const fileMd5 = process.argv[2];
  if (!fileMd5) { console.error('Usage: node dolphin-upload.mjs <md5>'); process.exit(1); }

  const stat = fs.statSync(FILE_PATH);
  const fileSize = stat.size;
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

  console.log(`File: ${path.basename(FILE_PATH)}`);
  console.log(`Size: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Chunks: ${totalChunks} × ${CHUNK_SIZE / 1024 / 1024}MB`);
  console.log(`TaskID: ${taskId}`);
  console.log(`MD5: ${fileMd5}`);
  console.log(`Upload host: https://${API_HOST}`);

  // Step 1: init
  console.log('\n[1/4] Initializing upload...');
  const initPath = `${BASE_PATH}/init?gcloudID=${GCLOUD_ID_PARAM}`;
  const initRes = await httpPost(initPath, JSON.stringify({ taskId }), { 'Content-Type': 'application/json' });
  console.log('init:', JSON.stringify(initRes.body));
  if (initRes.body?.code !== 0) {
    console.error('Init failed!'); process.exit(1);
  }

  // Step 2: upload chunks
  console.log('\n[2/4] Uploading chunks...');
  const chunkPath = `${BASE_PATH}/chunk?gcloudID=${GCLOUD_ID_PARAM}`;
  const fd = fs.openSync(FILE_PATH, 'r');
  const buf = Buffer.alloc(CHUNK_SIZE);
  let uploaded = 0;
  const startTime = Date.now();

  for (let i = 0; i < totalChunks; i++) {
    const bytesRead = fs.readSync(fd, buf, 0, CHUNK_SIZE, i * CHUNK_SIZE);
    const chunk = buf.slice(0, bytesRead);

    let attempts = 0;
    let ok = false;
    while (attempts < 3 && !ok) {
      try {
        const res = await httpPostMultipart(
          chunkPath,
          { taskId, chunkId: i, chunkSize: CHUNK_SIZE, totalChunks },
          chunk
        );
        if (res.status === 200 && (res.body?.code === 0 || res.body?.code === undefined)) {
          ok = true;
        } else {
          console.warn(`\n  chunk ${i} bad response: ${JSON.stringify(res.body).substring(0,100)}, retry ${attempts+1}`);
        }
      } catch (e) {
        console.warn(`\n  chunk ${i} error: ${e.message}, retry ${attempts+1}`);
      }
      if (!ok) { attempts++; await sleep(2000 * attempts); }
    }
    if (!ok) { fs.closeSync(fd); console.error(`\nchunk ${i} failed after 3 attempts`); process.exit(1); }

    uploaded += bytesRead;
    const pct = (uploaded / fileSize * 100).toFixed(1);
    const elapsed = (Date.now() - startTime) / 1000;
    const speed = (uploaded / 1024 / 1024 / elapsed).toFixed(1);
    const remaining = ((fileSize - uploaded) / 1024 / 1024 / (uploaded / 1024 / 1024 / elapsed)).toFixed(0);
    process.stdout.write(`\r  ${pct}% (${i+1}/${totalChunks})  ${speed}MB/s  ETA ${remaining}s     `);
  }
  fs.closeSync(fd);
  console.log('\n  All chunks uploaded!');

  // Step 3: complete
  console.log('\n[3/4] Sending complete...');
  const completePath = `${BASE_PATH}/complete?gcloudID=${GCLOUD_ID_PARAM}`;
  const completeBody = JSON.stringify({
    taskId,
    type: 'application/vnd.android.package-archive',
    size: fileSize,
    totalChunks,
    md5: fileMd5
  });
  const completeRes = await httpPost(completePath, completeBody, { 'Content-Type': 'application/json' });
  console.log('complete:', JSON.stringify(completeRes.body));

  // Step 4: poll status
  console.log('\n[4/4] Waiting for MD5 validation...');
  const statusPath = `${BASE_PATH}/getUploadStatus?taskId=${encodeURIComponent(taskId)}&gcloudID=${GCLOUD_ID_PARAM}`;
  for (let i = 0; i < 120; i++) {
    await sleep(3000);
    const statusRes = await httpGet(statusPath);
    const period = statusRes.body?.data?.period;
    process.stdout.write(`\r  Status: ${period || JSON.stringify(statusRes.body).substring(0,60)}   `);
    if (period === 'MD5_VALIDATED') {
      console.log('\n✅ Upload complete! MD5 validated.');
      process.exit(0);
    }
    if (period === 'MD5_CALC_ERROR' || period === 'MD5_VALIDATE_ERROR') {
      console.error(`\n❌ Upload failed: ${period}`);
      process.exit(1);
    }
  }
  console.error('\n❌ Timeout waiting for MD5 validation.');
  process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
