#!/usr/bin/env bash
# Cài Strip Comments CLI vào Termux từ các file đã tải về máy.
# Cách dùng:  bash install-termux.sh [thư mục chứa file đã tải]
set -u

DEST="${SCC_DIR:-$HOME/scc}"
SEARCH_DIRS=("$HOME/storage/downloads" "/sdcard/Download" "$HOME/storage/shared/Download" "$PWD")
[ $# -gt 0 ] && SEARCH_DIRS=("$1" "${SEARCH_DIRS[@]}")

if ! command -v node >/dev/null 2>&1; then
  echo "✘ Chưa có Node.js. Chạy: pkg install nodejs"
  exit 1
fi

if [ ! -d "$HOME/storage" ] && [ ! -d "${1:-/nonexistent}" ]; then
  echo "! Chưa cấp quyền bộ nhớ. Chạy: termux-setup-storage (bấm Cho phép) rồi chạy lại script này."
fi

# Tìm file mới nhất theo tên, chấp nhận cả tên trình duyệt đổi khi tải trùng: "cli (1).mjs", "cli-1.mjs"
find_newest() {
  local base="$1" ext="$2" d f name best="" bt=0 t
  local re="^${base}( ?\([0-9]+\)|-[0-9]+)?\.${ext}$"
  for d in "${SEARCH_DIRS[@]}"; do
    [ -d "$d" ] || continue
    for f in "$d"/*; do
      [ -f "$f" ] || continue
      name="${f##*/}"
      [[ "$name" =~ $re ]] || continue
      t=$(stat -c %Y "$f" 2>/dev/null || echo 0)
      if [ "$t" -gt "$bt" ]; then bt=$t; best="$f"; fi
    done
  done
  printf '%s' "$best"
}

FAIL=0
place() {  # tên_gốc đuôi đích bắt_buộc
  local f
  f=$(find_newest "$1" "$2")
  if [ -z "$f" ]; then
    if [ "$4" = "1" ]; then echo "✘ Không tìm thấy $1.$2 trong các thư mục tải về"; FAIL=1; fi
    return
  fi
  mkdir -p "$(dirname "$3")"
  cp -f "$f" "$3"
  echo "✔ ${3#$HOME/}  ←  $f"
}

echo "Cài vào: $DEST"
place cli mjs "$DEST/bin/cli.mjs" 1
place strip mjs "$DEST/src/strip.mjs" 1
place ui mjs "$DEST/src/ui.mjs" 1
place highlight mjs "$DEST/src/highlight.mjs" 1
place diff mjs "$DEST/src/diff.mjs" 1
place package json "$DEST/package.json" 1
place README md "$DEST/README.md" 0

if [ "$FAIL" -ne 0 ]; then
  echo
  echo "Hãy tải đủ 6 file (cli.mjs, strip.mjs, ui.mjs, highlight.mjs, diff.mjs, package.json) về thư mục Download,"
  echo "hoặc chạy: bash install-termux.sh /đường/dẫn/thư/mục/chứa/file"
  exit 1
fi

for f in "$DEST/bin/cli.mjs" "$DEST/src/strip.mjs" "$DEST/src/ui.mjs" "$DEST/src/highlight.mjs" "$DEST/src/diff.mjs"; do
  if ! node --check "$f" 2>/dev/null; then
    echo "✘ $f bị lỗi cú pháp, có thể tải thiếu hoặc hỏng. Hãy tải lại file này."
    exit 1
  fi
done

chmod +x "$DEST/bin/cli.mjs"
cd "$DEST" || exit 1
if npm link >/dev/null 2>&1 && command -v scc >/dev/null 2>&1 && scc -v >/dev/null 2>&1; then
  echo "✔ Đã tạo lệnh scc"
else
  # Dự phòng: dùng alias nếu npm link không chạy được
  sed -i '/alias scc=/d' "$HOME/.bashrc" 2>/dev/null
  echo "alias scc='node $DEST/bin/cli.mjs'" >> "$HOME/.bashrc"
  echo "✔ Đã thêm alias scc vào ~/.bashrc (chạy: source ~/.bashrc, hoặc mở lại Termux)"
fi

echo
echo "Xong. Gõ: scc"