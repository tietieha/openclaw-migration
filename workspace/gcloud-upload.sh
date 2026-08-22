#!/usr/bin/env bash
# ================================================================
# GCloud Dolphin APK 上传脚本
#
# 用法:
#   bash gcloud-upload.sh <apk路径> <版本号>
#
# 示例 (Git Bash):
#   bash gcloud-upload.sh "/f/Tmp/homm/app.apk" "0.1.0003.0"
#
# 依赖: curl, python3 (或 python), node (仅首次登录时用)
# ================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ──────────────────────────────────────────────────────────────
#  CONFIG — 首次使用前填写，或通过环境变量传入
# ──────────────────────────────────────────────────────────────
QQ="${GCLOUD_QQ:-YOUR_QQ}"          # ← 填 QQ 号
PASS="${GCLOUD_PASS:-YOUR_PASS}"    # ← 填 QQ 密码
GAME_ID=468150469
PRODUCT_ID=1001108                  # 内部开发-Android
REGION_ID=2100                      # 上海
CHUNK_SIZE=$((5 * 1024 * 1024))    # 5 MB / 分片
BASE_URL="https://idc.gcloud.tencent.com"
COOKIE_FILE="${SCRIPT_DIR}/.gcloud-cookies.json"
# ──────────────────────────────────────────────────────────────

TMP_DIR="/tmp/gcloud_$$"
mkdir -p "$TMP_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT

# ── Python 检测 ────────────────────────────────────────────────
PYTHON=$(command -v python3 2>/dev/null || command -v python 2>/dev/null || true)
[[ -z "$PYTHON" ]] && { echo "❌ 需要 Python 3 (python3 或 python)"; exit 1; }

# ── 工具函数 ───────────────────────────────────────────────────

die() { printf "\n❌ %s\n" "$*" >&2; exit 1; }

log()  { printf "   %s\n" "$*"; }
logr() { printf "   %s\r" "$*"; }  # 覆写同行

# 文件大小
filesize() {
  stat -c%s "$1" 2>/dev/null || stat -f%z "$1" 2>/dev/null || \
  wc -c < "$1" | tr -d ' '
}

# MD5 — 优先 md5sum，其次 certutil（Windows）
md5_file() {
  if command -v md5sum &>/dev/null; then
    md5sum "$1" | cut -d' ' -f1
  else
    certutil -hashfile "$(cygpath -w "$1" 2>/dev/null || echo "$1")" MD5 2>/dev/null \
      | sed -n '2p' | tr -d ' \r\n'
  fi
}

# g_tk = 累加哈希（seed=5381）
g_tk() {
  KEY="$1" "$PYTHON" - <<'PY'
import os
key = os.environ["KEY"]
n = 5381
for c in key:
    n = (n + (n << 5) + ord(c)) & 0xFFFFFFFF
print(n & 0x7FFFFFFF)
PY
}

# 从 cookies JSON 读取单个字段
get_cookie() {
  FIELD="$1" CFILE="$COOKIE_FILE" "$PYTHON" - <<'PY'
import json, os
d = json.load(open(os.environ["CFILE"]))
print(d.get(os.environ["FIELD"], ""))
PY
}

# 拼接 Cookie 头
cookie_str() {
  CFILE="$COOKIE_FILE" "$PYTHON" - <<'PY'
import json, os
d = json.load(open(os.environ["CFILE"]))
print("; ".join(f"{k}={v}" for k, v in d.items()))
PY
}

# URL 编码
url_encode() {
  VAL="$1" "$PYTHON" -c "import urllib.parse,os; print(urllib.parse.quote(os.environ['VAL']))"
}

# 检查 API 响应 code==0，否则报错
check_resp() {
  local resp="$1" label="$2"
  local code
  code=$(printf '%s' "$resp" | "$PYTHON" -c "import json,sys; d=json.load(sys.stdin); print(d.get('code','ERR'))" 2>/dev/null || echo ERR)
  [[ "$code" == "0" ]] || die "${label} 失败: $resp"
}

# ── Playwright 自动登录 ────────────────────────────────────────

do_login() {
  echo "🔑 Session 过期，启动 Edge 重新登录..."

  local login_mjs="$TMP_DIR/login.mjs"
  # 将 QQ/PASS/路径通过环境变量传入，避免特殊字符转义问题
  cat > "$login_mjs" << 'JSEOF'
import fs   from 'fs';
import path from 'path';

const QQ        = process.env.LOGIN_QQ;
const PASS      = process.env.LOGIN_PASS;
const CFILE     = process.env.LOGIN_CFILE;
const GAME_ID   = process.env.LOGIN_GAME_ID;

const edgePaths = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

let { chromium } = await import('playwright').catch(() =>
  import(path.join(process.env.APPDATA||'', 'npm/node_modules/playwright'))
);

let executablePath;
for (const p of edgePaths) { if (fs.existsSync(p)) { executablePath = p; break; } }

const browser = await chromium.launch({ headless: false, executablePath, args: ['--start-maximized'] });
const ctx     = await browser.newContext({ viewport: null });
const page    = await ctx.newPage();

try {
  await page.goto(`https://console.gcloud.tencent.com/dolphin/channel/${GAME_ID}`);
  await page.waitForLoadState('domcontentloaded');

  if (/ptlogin|xlogin|\/login/i.test(page.url())) {
    process.stderr.write('   → 填写登录信息...\n');
    const qqField = page.locator('#u, #uin, input[name="u"]').first();
    await qqField.waitFor({ timeout: 15000 }).catch(() => {});
    await qqField.fill(QQ);
    const pwField = page.locator('#p, input[type="password"]').first();
    await pwField.fill(PASS);
    const btn = page.locator('#login_button, .btn-login, [type="submit"]').first();
    if (await btn.count() > 0) await btn.click(); else await pwField.press('Enter');
    process.stderr.write('   → 遇验证码请手动处理，等待最多 90s...\n');
    await page.waitForURL(/idc\.gcloud|console\.gcloud/, { timeout: 90000 });
  }

  const rawA = await ctx.cookies('https://idc.gcloud.tencent.com');
  const rawB = await ctx.cookies('https://console.gcloud.tencent.com');
  const map  = {};
  for (const c of [...rawA, ...rawB]) map[c.name] = c.value;
  if (!map.GCLOUD_SESSIONKEY) throw new Error('未找到 GCLOUD_SESSIONKEY，请确认登录成功');
  fs.writeFileSync(CFILE, JSON.stringify(map, null, 2));
  process.stderr.write('   ✅ 登录成功，Cookies 已缓存。\n\n');
} finally {
  await browser.close();
}
JSEOF

  LOGIN_QQ="$QQ" LOGIN_PASS="$PASS" \
  LOGIN_CFILE="$COOKIE_FILE" LOGIN_GAME_ID="$GAME_ID" \
    node "$login_mjs" || die "登录失败，请检查账号/密码"
}

# Cookie 有效性探测
check_auth() {
  [[ -f "$COOKIE_FILE" ]] || return 1
  local sk; sk=$(get_cookie GCLOUD_SESSIONKEY)
  [[ -z "$sk" ]] && return 1
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Cookie: $(cookie_str)" \
    --max-time 8 \
    "${BASE_URL}/dolphin/channel/${GAME_ID}" 2>/dev/null || echo 0)
  [[ "$code" -gt 0 && "$code" -lt 400 && "$code" != "302" ]]
}

# ── API 封装 ───────────────────────────────────────────────────

# 构造 ?g_tk=...&gcloudID=... 查询串
query_string() {
  local sk; sk=$(get_cookie GCLOUD_SESSIONKEY)
  local pid; pid=$(get_cookie platformID)
  [[ -z "$pid" ]] && pid=$(get_cookie GCLOUD_ID)
  local tk; tk=$(g_tk "$sk")
  local pid_enc; pid_enc=$(url_encode "$pid")
  echo "g_tk=${tk}&gcloudID=${pid_enc}"
}

post_json() {
  local ep="$1" body="$2"
  curl -s -X POST "${BASE_URL}${ep}?$(query_string)" \
    -H "Content-Type: application/json" \
    -H "Cookie: $(cookie_str)" \
    -H "Origin: ${BASE_URL}" \
    -H "Referer: ${BASE_URL}/" \
    --data "$body"
}

post_form() {
  local ep="$1"; shift
  curl -s -X POST "${BASE_URL}${ep}?$(query_string)" \
    -H "Cookie: $(cookie_str)" \
    -H "Origin: ${BASE_URL}" \
    -H "Referer: ${BASE_URL}/" \
    "$@"
}

# ── 主流程 ─────────────────────────────────────────────────────

main() {
  local apk_path="$1" version="$2"

  [[ -f "$apk_path" ]] || die "文件不存在: $apk_path"

  local file_size; file_size=$(filesize "$apk_path")
  local filename;  filename=$(basename "$apk_path")
  local total_chunks=$(( (file_size + CHUNK_SIZE - 1) / CHUNK_SIZE ))
  local size_mb;   size_mb=$(awk "BEGIN { printf \"%.1f\", $file_size/1048576 }")

  printf "\n🚀 GCloud Dolphin APK 上传\n"
  printf "   文件: %s\n"   "$filename"
  printf "   大小: %s MB\n" "$size_mb"
  printf "   版本: %s\n"   "$version"
  printf "   分片: %d × %d MB\n\n" "$total_chunks" "$((CHUNK_SIZE/1048576))"

  # 1. 认证
  if ! check_auth; then
    do_login
  else
    echo "🍪 使用已缓存的 Cookies"
    echo ""
  fi

  # 2. MD5
  echo "🔍 计算文件 MD5（1.5GB ≈ 30-60s，请耐心等待）..."
  local filemd5; filemd5=$(md5_file "$apk_path")
  log "MD5: $filemd5"
  echo ""

  # 3. newTask
  echo "📋 创建上传任务..."
  local nt_resp
  nt_resp=$(post_json "/uploadfile/newTask" \
    "{\"gameid\":${GAME_ID},\"productid\":${PRODUCT_ID},\"regionid\":${REGION_ID},\
\"versionstr\":\"${version}\",\"versionType\":0,\"updatetype\":1,\"cdnflag\":1,\
\"filename\":\"${filename}\",\"filemd5\":\"${filemd5}\",\"filesize\":${file_size}}")
  check_resp "$nt_resp" "newTask"
  local task_id
  task_id=$(printf '%s' "$nt_resp" | "$PYTHON" -c \
    "import json,sys; print(json.load(sys.stdin)['data']['UploadTaskID'])")
  log "TaskID: $task_id"

  # 4. init
  echo "🔧 初始化分片..."
  local init_resp
  init_resp=$(post_json "/uploadfile/init" \
    "{\"taskId\":\"${task_id}\",\"chunkSize\":${CHUNK_SIZE},\"totalChunks\":${total_chunks}}")
  check_resp "$init_resp" "init"

  # 5. 切片并上传
  echo "📤 开始上传 ($total_chunks 个分片)..."
  split -b "$CHUNK_SIZE" "$apk_path" "$TMP_DIR/chunk_"

  local i=1
  for chunk_file in "$TMP_DIR"/chunk_*; do
    local csz; csz=$(filesize "$chunk_file")
    local cr
    cr=$(post_form "/uploadfile/chunk" \
      -F "taskId=${task_id}" \
      -F "chunkId=${i}" \
      -F "totalChunks=${total_chunks}" \
      -F "chunkSize=${csz}" \
      -F "file=@${chunk_file};type=application/octet-stream")
    check_resp "$cr" "chunk $i"

    local done_bytes=$(( i * CHUNK_SIZE < file_size ? i * CHUNK_SIZE : file_size ))
    local pct;  pct=$(awk  "BEGIN { printf \"%.1f\", $done_bytes*100/$file_size }")
    local dmb;  dmb=$(awk  "BEGIN { printf \"%d\",   $done_bytes/1048576 }")
    logr "进度: ${pct}%  (${dmb}/${size_mb%.*} MB)  分片 ${i}/${total_chunks}   "
    i=$((i+1))
  done
  printf "\n   ✅ 所有分片上传完成\n\n"

  # 6. complete
  echo "✔  通知服务器合并文件..."
  local cmp_resp
  cmp_resp=$(post_json "/uploadfile/complete" "{\"taskId\":\"${task_id}\"}")
  check_resp "$cmp_resp" "complete"

  # 7. 轮询 MD5 校验
  echo "⏳ 等待服务器 MD5 校验（最多 5 分钟）..."
  local deadline=$(( $(date +%s) + 300 ))
  while (( $(date +%s) < deadline )); do
    local sr
    sr=$(post_json "/uploadfile/getUploadStatus" "{\"taskId\":\"${task_id}\"}")
    local st
    st=$(printf '%s' "$sr" | "$PYTHON" -c \
      "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('status', d.get('status','...')))" 2>/dev/null || echo "...")
    logr "状态: ${st}          "
    if echo "$st" | grep -qiE 'MD5_VALIDATED|SUCCESS|COMPLETED'; then
      printf "\n   ✅ 校验通过！\n"; break
    fi
    if echo "$st" | grep -qiE 'FAILED|ERROR'; then
      die "服务器校验失败: $sr"
    fi
    sleep 3
  done

  printf "\n🎉 完成！版本 %s 已提交至 GCloud Dolphin。\n" "$version"
  printf "   ⚠  记得前往控制台将「普通用户」设为「不可用」后再预发布：\n"
  printf "   https://console.gcloud.tencent.com/dolphin/channel/%s\n\n" "$GAME_ID"
}

# ── 入口 ───────────────────────────────────────────────────────
if [[ $# -lt 2 ]]; then
  echo "用法: bash gcloud-upload.sh <apk路径> <版本号>"
  echo "示例: bash gcloud-upload.sh \"/f/Tmp/homm/app.apk\" \"0.1.0003.0\""
  exit 1
fi

main "$1" "$2"
