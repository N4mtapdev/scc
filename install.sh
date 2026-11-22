#!/usr/bin/env bash
# Cài Strip Comments CLI từ GitHub (Termux, Linux, macOS):
#   curl -fsSL https://raw.githubusercontent.com/N4mtapdev/scc/main/install.sh | bash
# Biến tùy chọn: SCC_REPO=user/repo  SCC_BRANCH=main  SCC_DIR=~/.scc
set -euo pipefail

REPO="${SCC_REPO:-N4mtapdev/scc}"
BRANCH="${SCC_BRANCH:-main}"
DEST="${SCC_DIR:-$HOME/.scc}"
URL="${SCC_TARBALL_URL:-https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH}"

say() { printf '%s\n' "$*"; }
die() { printf '✘ %s\n' "$*" >&2; exit 1; }

if [ -z "${SCC_TARBALL_URL:-}" ]; then
  PH="YOUR_""USER"
  case "$REPO" in "$PH"/*) die "Chưa cấu hình tên kho GitHub. Đặt SCC_REPO=tên/kho hoặc chạy setup-github.sh trước." ;; esac
fi

command -v node >/dev/null 2>&1 || die "Chưa có Node.js. Termux: pkg install nodejs"
[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -ge 18 ] || die "Cần Node.js 18 trở lên (đang dùng $(node -v))."
command -v tar >/dev/null 2>&1 || die "Thiếu lệnh tar. Termux: pkg install tar"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say "↓ Đang tải $REPO ($BRANCH)…"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$URL" -o "$TMP/src.tgz" || die "Không tải được. Kiểm tra mạng, tên kho và kho phải để chế độ public."
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$TMP/src.tgz" "$URL" || die "Không tải được. Kiểm tra mạng, tên kho và kho phải để chế độ public."
else
  die "Cần curl hoặc wget. Termux: pkg install curl"
fi

tar -xzf "$TMP/src.tgz" -C "$TMP" || die "Gói tải về không hợp lệ."
ROOT="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
[ -n "$ROOT" ] && [ -f "$ROOT/bin/cli.mjs" ] || die "Không thấy bin/cli.mjs trong gói tải về."

for f in bin/cli.mjs src/strip.mjs src/ui.mjs src/highlight.mjs src/diff.mjs; do
  node --check "$ROOT/$f" 2>/dev/null || die "$f bị lỗi cú pháp, đã hủy cài đặt."
done

rm -rf "$DEST.new"
mkdir -p "$DEST.new"
cp -R "$ROOT"/. "$DEST.new"/
rm -rf "$DEST"
mv "$DEST.new" "$DEST"
chmod +x "$DEST/bin/cli.mjs"

if [ -n "${PREFIX:-}" ] && [ -d "$PREFIX/bin" ]; then BIN="$PREFIX/bin"; else BIN="$HOME/.local/bin"; fi
mkdir -p "$BIN"
SH="$(command -v sh)"
cat > "$BIN/scc" <<WRAP
#!$SH
exec node "$DEST/bin/cli.mjs" "\$@"
WRAP
chmod +x "$BIN/scc"

VER="$("$BIN/scc" -v 2>/dev/null || true)"
say "✔ Đã cài Strip Comments ${VER:+v$VER} vào $DEST"
say "✔ Lệnh: $BIN/scc"
case ":$PATH:" in
  *":$BIN:"*) say "→ Gõ: scc" ;;
  *) say "→ Thêm vào PATH rồi mở lại terminal:  echo 'export PATH=\"$BIN:\$PATH\"' >> ~/.bashrc" ;;
esac
say "→ Cập nhật sau này: scc --update"