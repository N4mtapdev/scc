#!/usr/bin/env bash
# Chạy Strip Comments trực tiếp từ GitHub, không cần cài:
#   bash <(curl -fsSL https://raw.githubusercontent.com/N4mtapdev/scc/main/run.sh)
#   bash <(curl -fsSL https://raw.githubusercontent.com/N4mtapdev/scc/main/run.sh) file.js --dry-run
# Biến tùy chọn: SCC_REPO=user/repo  SCC_BRANCH=main  SCC_TTL=3600 (giây dùng lại bản đã tải, 0 = luôn tải mới)
set -euo pipefail

REPO="${SCC_REPO:-N4mtapdev/scc}"
BRANCH="${SCC_BRANCH:-main}"
URL="${SCC_BUNDLE_URL:-https://raw.githubusercontent.com/$REPO/$BRANCH/dist/scc.mjs}"
CACHE_DIR="${SCC_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/scc}"
FILE="$CACHE_DIR/scc.mjs"
TTL="${SCC_TTL:-3600}"

die() { printf '✘ %s\n' "$*" >&2; exit 1; }

if [ -z "${SCC_BUNDLE_URL:-}" ]; then
  PH="YOUR_""USER"
  case "$REPO" in "$PH"/*) die "Chưa cấu hình tên kho GitHub. Đặt: SCC_REPO=tên/kho bash <(curl -fsSL …/run.sh)" ;; esac
fi
command -v node >/dev/null 2>&1 || die "Chưa có Node.js. Termux: pkg install nodejs"
[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -ge 18 ] || die "Cần Node.js 18 trở lên (đang dùng $(node -v))."

mkdir -p "$CACHE_DIR"
fresh=0
if [ -f "$FILE" ] && [ "$TTL" -gt 0 ]; then
  mtime="$(stat -c %Y "$FILE" 2>/dev/null || stat -f %m "$FILE" 2>/dev/null || echo 0)"
  [ $(( $(date +%s) - mtime )) -lt "$TTL" ] && fresh=1
fi

if [ "$fresh" -eq 0 ]; then
  TMP="$CACHE_DIR/.dl-$$.mjs"
  trap 'rm -f "$TMP"' EXIT
  got=0
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$URL" -o "$TMP" 2>/dev/null && got=1
  elif command -v wget >/dev/null 2>&1; then wget -qO "$TMP" "$URL" 2>/dev/null && got=1
  else die "Cần curl hoặc wget. Termux: pkg install curl"; fi
  if [ "$got" -eq 1 ] && node --check "$TMP" 2>/dev/null; then
    mv -f "$TMP" "$FILE"
  elif [ -f "$FILE" ]; then
    echo "! Không tải được bản mới, dùng bản đã lưu." >&2
  else
    die "Không tải được $URL. Kiểm tra mạng, tên kho, nhánh và kho phải để chế độ public."
  fi
fi

export SCC_REPO="$REPO"
exec node "$FILE" "$@"