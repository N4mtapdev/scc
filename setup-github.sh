#!/usr/bin/env bash
# Điền tên GitHub của bạn vào các file, tạo commit và đẩy code lên GitHub.
#   bash setup-github.sh
# Biến tùy chọn: GH_USER=ten  GH_REPO=ten-kho  GH_NO_PUSH=1 (chỉ commit, không đẩy)
set -euo pipefail
cd "$(dirname "$0")"

die() { printf '✘ %s\n' "$*" >&2; exit 1; }
command -v git >/dev/null 2>&1 || die "Chưa có git. Termux: pkg install git"

DEFAULT_USER="N4mtapdev"; DEFAULT_REPO="scc"
GH_USER="${GH_USER:-}"
GH_REPO="${GH_REPO:-}"
if [ -z "$GH_USER" ]; then
  if [ -t 0 ]; then read -r -p "Tên tài khoản GitHub [$DEFAULT_USER]: " GH_USER || true; fi
  GH_USER="${GH_USER:-$DEFAULT_USER}"
fi
if [ -z "$GH_REPO" ]; then
  if [ -t 0 ]; then read -r -p "Tên kho [$DEFAULT_REPO]: " GH_REPO || true; fi
  GH_REPO="${GH_REPO:-$DEFAULT_REPO}"
fi

echo "→ Điền $GH_USER/$GH_REPO vào các file…"
for f in README.md package.json install.sh run.sh bin/cli.mjs; do
  [ -f "$f" ] || continue
  sed -i.bak "s#YOUR_USER/strip-comments-cli#$GH_USER/$GH_REPO#g; s#N4mtapdev/scc#$GH_USER/$GH_REPO#g" "$f"
  rm -f "$f.bak"
done

if command -v node >/dev/null 2>&1 && [ -f scripts/build.mjs ]; then
  node scripts/build.mjs >/dev/null && echo "✔ Đã dựng lại dist/scc.mjs với tên kho của bạn"
else
  echo "! Không có node nên chưa dựng được dist/scc.mjs. Cài nodejs rồi chạy: node scripts/build.mjs"
fi

if [ ! -d .git ]; then git init -q -b main; fi
git config user.name  >/dev/null 2>&1 || git config user.name  "$GH_USER"
git config user.email >/dev/null 2>&1 || git config user.email "$GH_USER@users.noreply.github.com"
git add -A
if ! git diff --cached --quiet; then
  git commit -q -m "Strip Comments CLI v$(node -p "require('./package.json').version" 2>/dev/null || echo 1)"
  echo "✔ Đã tạo commit"
fi

if [ "${GH_NO_PUSH:-}" = "1" ]; then echo "→ Bỏ qua bước đẩy code (GH_NO_PUSH=1)"; exit 0; fi

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh repo create "$GH_USER/$GH_REPO" --public --source=. --remote=origin --push \
    --description "CLI tương tác xóa comment JS/TS/CSS/HTML, chạy tốt trên Termux" \
    || die "Không tạo được kho. Có thể kho đã tồn tại: chạy git remote add origin ... rồi git push -u origin main"
else
  cat <<MSG

Chưa có GitHub CLI (gh) hoặc chưa đăng nhập. Làm một trong hai cách:

  Cách 1 (nhanh): pkg install gh && gh auth login   (rồi chạy lại: bash setup-github.sh)

  Cách 2 (thủ công):
    1. Vào https://github.com/new, tạo kho tên "$GH_REPO", để chế độ Public,
       KHÔNG tick thêm README hay .gitignore.
    2. Chạy:
         git remote add origin https://github.com/$GH_USER/$GH_REPO.git
         git push -u origin main
       (GitHub sẽ hỏi tên đăng nhập và Personal Access Token thay cho mật khẩu)

Khi push xong, link raw để chạy ngay sẽ là:
   bash <(curl -fsSL https://raw.githubusercontent.com/$GH_USER/$GH_REPO/main/run.sh)
MSG
  exit 0
fi

RAW="https://raw.githubusercontent.com/$GH_USER/$GH_REPO/main"
echo
echo "✔ Đã đẩy code lên https://github.com/$GH_USER/$GH_REPO"
echo
echo "→ Chạy ngay không cần cài (dùng link raw):"
echo "   bash <(curl -fsSL $RAW/run.sh)"
echo "→ Hoặc cài hẳn:"
echo "   curl -fsSL $RAW/install.sh | bash"