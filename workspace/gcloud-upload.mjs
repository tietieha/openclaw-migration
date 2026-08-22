#!/usr/bin/env node
/**
 * GCloud Dolphin APK 上传脚本
 *
 * 用法:
 *   node gcloud-upload.mjs <apk路径> <版本号>
 *
 * 示例:
 *   node gcloud-upload.mjs "F:\Tmp\homm\app.apk" "0.1.0003.0"
 *
 * 首次使用: 编辑下方 CONFIG 的 qq / pass，或设置环境变量 GCLOUD_QQ / GCLOUD_PASS
 * 后续使用: Cookies 自动缓存，无需重复登录
 */

import fs   from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════
//  CONFIG — 首次使用前填写
// ═══════════════════════════════════════════════
const CFG = {
  qq:        process.env.GCLOUD_QQ   || 'YOUR_QQ',      // ← QQ 号
  pass:      process.env.GCLOUD_PASS || 'YOUR_PASS',    // ← QQ 密码
  gameId:    468150469,
  productId: 1001108,   // 内部开发-Android
  regionId:  2100,      // 上海
  chunkSize: 5 * 1024 * 1024,                           // 5MB / 分片
  cookieFile: path.join(__dirname, '.gcloud-cookies.json'),
  baseUrl:   'https://idc.gcloud.tencent.com',
};
// ═══════════════════════════════════════════════

// ─── 工具函数 ───────────────────────────────────

/** g_tk = getCSRFToken(sessionKey)：累加哈希，seed=5381 */
function gTk(sessionKey) {
  let n = 5381;
  for (let i = 0; i < sessionKey.length; i++) {
    n += (n << 5) + sessionKey.charCodeAt(i);
  }
  return (n & 0x7fffffff) >>> 0;
}

/** 计算文件 MD5（流式，不占内存） */
function md5File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const s = fs.createReadStream(filePath);
    s.on('data', d => hash.update(d));
    s.on('end',  () => resolve(hash.digest('hex')));
    s.on('error', reject);
  });
}

/** 从文件加载缓存 Cookies */
function loadCookies() {
  try { return JSON.parse(fs.readFileSync(CFG.cookieFile, 'utf8')); }
  catch { return null; }
}

function saveCookies(c) {
  fs.writeFileSync(CFG.cookieFile, JSON.stringify(c, null, 2));
}

function cookieStr(c) {
  return Object.entries(c).map(([k,v]) => `${k}=${v}`).join('; ');
}

// ─── Playwright 自动登录 ─────────────────────────

async function loginViaPlaywright() {
  console.log('🔑 Session 已过期，正在启动 Edge 重新登录...');

  const { chromium } = await import('playwright').catch(() =>
    import(path.join(__dirname, 'node_modules', 'playwright'))
  );

  // 优先使用系统 Edge
  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  let executablePath;
  for (const p of edgePaths) {
    if (fs.existsSync(p)) { executablePath = p; break; }
  }

  const browser = await chromium.launch({ headless: false, executablePath, args: ['--start-maximized'] });
  const ctx = await browser.newContext({ viewport: null });
  const page = await ctx.newPage();

  try {
    const consoleUrl = `https://console.gcloud.tencent.com/dolphin/channel/${CFG.gameId}`;
    await page.goto(consoleUrl);
    await page.waitForLoadState('domcontentloaded');

    // 检查是否跳转到登录页
    const url = page.url();
    if (url.includes('ptlogin') || url.includes('xlogin') || url.includes('/login')) {
      console.log('   → 检测到登录页，填写账号信息...');

      // QQ 号输入框
      const qqSel = '#u, #uin, input[name="u"], input[name="uin"]';
      const qqField = page.locator(qqSel).first();
      await qqField.waitFor({ timeout: 15000 }).catch(() => {});
      await qqField.fill(CFG.qq);

      // 密码输入框（fill 会触发 JS 加密事件）
      const pwField = page.locator('#p, input[type="password"]').first();
      await pwField.fill(CFG.pass);

      // 提交
      const loginBtn = page.locator('#login_button, .btn-login, [type="submit"]').first();
      if (await loginBtn.count() > 0) {
        await loginBtn.click();
      } else {
        await pwField.press('Enter');
      }

      // 等待跳回控制台（如遇验证码/安全验证，用户手动操作，最多等 90 秒）
      console.log('   → 等待登录完成（遇到验证码请手动通过，最多等 90s）...');
      await page.waitForURL(/idc\.gcloud|console\.gcloud/, { timeout: 90000 });
    }

    // 提取所需 Cookies
    const rawA = await ctx.cookies('https://idc.gcloud.tencent.com');
    const rawB = await ctx.cookies('https://console.gcloud.tencent.com');
    const map = {};
    for (const c of [...rawA, ...rawB]) map[c.name] = c.value;

    if (!map.GCLOUD_SESSIONKEY) throw new Error('登录后未找到 GCLOUD_SESSIONKEY，请检查账号密码');
    saveCookies(map);
    console.log('   ✅ 登录成功，Cookies 已缓存。\n');
    return map;
  } finally {
    await browser.close();
  }
}

// ─── API 封装 ────────────────────────────────────

async function post(endpoint, bodyOrFd, cookies, isForm = false) {
  const sk = cookies.GCLOUD_SESSIONKEY || '';
  const pid = cookies.platformID || cookies.GCLOUD_ID || '';
  const url = `${CFG.baseUrl}${endpoint}?g_tk=${gTk(sk)}&gcloudID=${encodeURIComponent(pid)}`;

  const opts = {
    method: 'POST',
    headers: {
      Cookie: cookieStr(cookies),
      Origin:  'https://idc.gcloud.tencent.com',
      Referer: 'https://idc.gcloud.tencent.com/',
    },
  };

  if (isForm) {
    opts.body = bodyOrFd; // FormData — 浏览器/Node 自动加 multipart header
  } else {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(bodyOrFd);
  }

  const res = await fetch(url, opts);
  const text = await res.text();

  // Session 过期时返回 302 或 401
  if (res.status === 302 || res.status === 401 || res.status === 403) {
    throw Object.assign(new Error('SESSION_EXPIRED'), { sessionExpired: true });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

  try { return JSON.parse(text); }
  catch { throw new Error(`非 JSON 响应: ${text.slice(0, 200)}`); }
}

async function newTask(cookies, version, filename, filemd5, filesize) {
  console.log('📋 创建上传任务...');
  const d = await post('/uploadfile/newTask', {
    gameid:      CFG.gameId,
    productid:   CFG.productId,
    regionid:    CFG.regionId,
    versionstr:  version,
    versionType: 0,    // 0=APK, 1=资源包
    updatetype:  1,
    cdnflag:     1,
    filename,
    filemd5,
    filesize,
  }, cookies);
  if (d.code !== 0) throw new Error(`newTask 失败: ${JSON.stringify(d)}`);
  console.log(`   UploadTaskID: ${d.data.UploadTaskID}`);
  return d.data;
}

async function initUpload(cookies, taskId, chunkSize, totalChunks) {
  console.log('🔧 初始化分片...');
  const d = await post('/uploadfile/init', { taskId, chunkSize, totalChunks }, cookies);
  if (d.code !== 0) throw new Error(`init 失败: ${JSON.stringify(d)}`);
  return d.data;
}

async function uploadChunk(cookies, taskId, chunkId, chunkBuf, totalChunks) {
  const fd = new FormData();
  fd.append('taskId',      taskId);
  fd.append('chunkId',     String(chunkId));
  fd.append('totalChunks', String(totalChunks));
  fd.append('chunkSize',   String(chunkBuf.length));
  fd.append('file', new Blob([chunkBuf], { type: 'application/octet-stream' }), `chunk_${chunkId}`);

  const d = await post('/uploadfile/chunk', fd, cookies, true);
  if (d.code !== 0) throw new Error(`chunk ${chunkId} 失败: ${JSON.stringify(d)}`);
  return d;
}

async function completeUpload(cookies, taskId) {
  console.log('\n✔  通知服务器合并文件...');
  const d = await post('/uploadfile/complete', { taskId }, cookies);
  if (d.code !== 0) throw new Error(`complete 失败: ${JSON.stringify(d)}`);
  return d;
}

async function pollStatus(cookies, taskId, maxMs = 300000) {
  console.log('⏳ 等待 MD5 校验...');
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const d = await post('/uploadfile/getUploadStatus', { taskId }, cookies);
    const st = d?.data?.status || d?.status || '(unknown)';
    process.stdout.write(`   状态: ${st}          \r`);
    if (/MD5_VALIDATED|SUCCESS|COMPLETED/i.test(st)) {
      console.log('\n   ✅ 校验通过！');
      return d;
    }
    if (/FAILED|ERROR/i.test(st)) throw new Error(`服务器校验失败: ${JSON.stringify(d)}`);
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('等待超时（5 分钟），请前往控制台手动检查');
}

// ─── 主流程 ───────────────────────────────────────

async function main() {
  const [,, apkPath, version] = process.argv;
  if (!apkPath || !version) {
    console.error('用法: node gcloud-upload.mjs <apk路径> <版本号>\n'
                + '示例: node gcloud-upload.mjs "F:\\Tmp\\app.apk" "0.1.0003.0"');
    process.exit(1);
  }

  if (!fs.existsSync(apkPath)) {
    console.error(`文件不存在: ${apkPath}`); process.exit(1);
  }

  const stat       = fs.statSync(apkPath);
  const fileSize   = stat.size;
  const filename   = path.basename(apkPath);
  const totalChunks = Math.ceil(fileSize / CFG.chunkSize);

  console.log(`\n🚀 GCloud Dolphin APK 上传`);
  console.log(`   文件: ${filename}`);
  console.log(`   大小: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`   版本: ${version}`);
  console.log(`   分片: ${totalChunks} × ${CFG.chunkSize / 1024 / 1024} MB\n`);

  // 1. 加载 / 刷新 Cookies
  let cookies = loadCookies();
  let authed  = false;

  if (cookies?.GCLOUD_SESSIONKEY) {
    try {
      // 轻量探测：请求 newTask 前先 ping
      const r = await fetch(`${CFG.baseUrl}/dolphin/api/ping?g_tk=${gTk(cookies.GCLOUD_SESSIONKEY)}`, {
        headers: { Cookie: cookieStr(cookies) }, redirect: 'manual',
      });
      authed = r.status < 400;
    } catch { authed = false; }
  }

  if (!authed) cookies = await loginViaPlaywright();
  else console.log('🍪 使用已缓存的 Cookies\n');

  // 2. 计算 MD5（1.5GB ≈ 30s）
  console.log('🔍 计算文件 MD5（大文件约需 30-60s，请耐心等待）...');
  const filemd5 = await md5File(apkPath);
  console.log(`   MD5: ${filemd5}\n`);

  // ── 以下步骤遇到 SESSION_EXPIRED 时自动重登一次 ──
  let retried = false;
  const withRetry = async (fn) => {
    try { return await fn(); }
    catch (e) {
      if (e.sessionExpired && !retried) {
        retried = true;
        console.log('\n⚠  Session 过期，重新登录...');
        cookies = await loginViaPlaywright();
        return fn();
      }
      throw e;
    }
  };

  // 3. newTask
  const taskData = await withRetry(() => newTask(cookies, version, filename, filemd5, fileSize));
  const taskId   = taskData.UploadTaskID;

  // 4. init
  await withRetry(() => initUpload(cookies, taskId, CFG.chunkSize, totalChunks));

  // 5. 逐分片上传
  console.log(`\n📤 开始上传 (${totalChunks} 个分片)...`);
  const fh = fs.openSync(apkPath, 'r');
  try {
    for (let i = 0; i < totalChunks; i++) {
      const offset = i * CFG.chunkSize;
      const size   = Math.min(CFG.chunkSize, fileSize - offset);
      const buf    = Buffer.alloc(size);
      fs.readSync(fh, buf, 0, size, offset);

      await withRetry(() => uploadChunk(cookies, taskId, i + 1, buf, totalChunks));

      const uploaded = Math.min((i + 1) * CFG.chunkSize, fileSize);
      const pct = (uploaded / fileSize * 100).toFixed(1);
      process.stdout.write(
        `   进度: ${pct}%  (${(uploaded/1024/1024).toFixed(0)}/${Math.round(fileSize/1024/1024)} MB)  分片 ${i+1}/${totalChunks}   \r`
      );
    }
  } finally {
    fs.closeSync(fh);
  }
  console.log(`\n   ✅ 所有分片上传完成\n`);

  // 6. complete
  await withRetry(() => completeUpload(cookies, taskId));

  // 7. 轮询校验
  await withRetry(() => pollStatus(cookies, taskId));

  console.log(`\n🎉 完成！版本 ${version} 已提交至 GCloud Dolphin。`);
  console.log(`   ⚠  记得前往控制台将「普通用户」设为「不可用」后再预发布：`);
  console.log(`   https://console.gcloud.tencent.com/dolphin/channel/${CFG.gameId}\n`);
}

main().catch(err => {
  console.error('\n❌ 错误:', err.message || err);
  process.exit(1);
});
