# Strip Comments CLI

Công cụ dòng lệnh có **menu mũi tên** (kiểu Gemini CLI) để xóa toàn bộ comment trong code **JS, TS, CSS, SCSS/Less, HTML**. Không cần cài thư viện nào, chỉ cần Node.js.

## Tính năng

- Menu tương tác: di chuyển bằng phím mũi tên, Enter để chọn, dòng đang chọn được tô sáng kèm mô tả ngắn bên dưới.
- **Giao diện chuyên nghiệp:** tiêu đề có đường dẫn màn hình (breadcrumb), thanh phím tắt dạng nhãn ở cuối mỗi menu, nhóm mục có tiêu đề, khung viền bo tròn, hộp cảnh báo màu (thành công, cảnh báo, lỗi), bảng kết quả căn cột.
- **Danh sách tác vụ trực tiếp** khi xử lý (Quét → Xử lý → Hoàn tất) và khi tải URL (Kết nối → Tải xuống → Xóa comment), mỗi bước có trạng thái, tiến trình và thời gian.
- **Lọc nhanh bằng phím `/`** (không phân biệt hoa thường và dấu tiếng Việt, gõ "thu" vẫn ra "thư mục") và **bảng trợ giúp bằng phím `?`** trong mọi menu.
- Giao diện tự co theo độ rộng và chiều cao màn hình (vừa cả điện thoại), tự vẽ lại khi bàn phím ảo bật hoặc tắt.
- 3 bảng màu (Aurora, Forest, Sunset) và chế độ biểu tượng đơn giản nếu emoji bị lệch.
- Xử lý **từ file** (chọn một hoặc nhiều file), **cả thư mục** (đệ quy), **dán code trực tiếp** và **tải từ URL**.
- Giữ nguyên chuỗi, template literal và regex, không xóa nhầm `//` trong `"http://..."`.
- Với HTML, xử lý riêng phần bên trong `<script>` và `<style>`.
- Tùy chọn giữ comment bản quyền (`/*! ... */`, `@license`, `@preserve`) và xóa dòng trống.
- Ba chế độ xuất: tạo file mới, ghi đè (có backup `.bak`), hoặc xuất ra thư mục riêng.
- **Tiến trình và ước tính:** trước khi chạy hiện số file, dung lượng, thời gian dự kiến và mức giảm dự kiến. Khi chạy có thanh tiến trình chuyển màu, tốc độ và thời gian còn lại (ETA), nhấn `q` hoặc `Esc` để hủy giữa chừng.
- **Chạy thử (dry run):** xem kết quả và dung lượng giảm mà không ghi file nào.
- **Khôi phục từ backup:** hoàn tác các file đã ghi đè bằng `.bak`.
- **Lịch sử và thống kê:** tổng số lần chạy, file, comment đã xóa, dung lượng tiết kiệm.
- **Thư mục nhanh:** nhảy tới bộ nhớ chung, Tải xuống, `/sdcard`, thư mục gần đây; cấp quyền bộ nhớ Termux ngay trong menu.
- **Tải URL có tiến trình:** hiện dung lượng, tốc độ và ETA khi tải.
- **Thông báo khi xong (Termux:API):** rung và báo khi tác vụ chạy lâu, tiện khi bạn chuyển sang app khác.
- **Giới hạn file lớn:** tự bỏ qua file quá cỡ để máy yếu không bị treo.
- **Kiểm tra môi trường:** kiểm tra Node, quyền bộ nhớ, Termux:API, RAM, mạng và gợi ý cách sửa.
- **Đếm comment đã xóa** cho từng lần chạy.
- Chạy được trên Linux, macOS, Windows và **Termux (Android)**.
- Dùng được như lệnh thường (không menu) để đưa vào script.

## Yêu cầu

- Node.js **18 trở lên** (cần `fetch` có sẵn cho tính năng URL).

## Cài đặt

### Chạy thẳng từ link raw của GitHub (không cần cài)

Repo có sẵn bản gộp một file `dist/scc.mjs` và launcher `run.sh`, nên chỉ cần link raw là chạy được. Với repo `N4mtapdev/scc`:

```bash
# Mở menu tương tác
bash <(curl -fsSL https://raw.githubusercontent.com/N4mtapdev/scc/main/run.sh)

# Xử lý file ngay, có kèm tham số
bash <(curl -fsSL https://raw.githubusercontent.com/N4mtapdev/scc/main/run.sh) src/ --dry-run
```

`run.sh` tải bản gộp về `~/.cache/scc`, kiểm tra cú pháp rồi chạy, và dùng lại bản đã tải trong 1 giờ cho nhanh (đổi bằng `SCC_TTL=0` để luôn tải mới). Mất mạng thì dùng bản đã lưu. Cú pháp `bash <(…)` có trong bash và Termux; nếu shell của bạn không hỗ trợ thì tải về rồi chạy:

```bash
curl -fsSL https://raw.githubusercontent.com/N4mtapdev/scc/main/dist/scc.mjs -o scc.mjs
node scc.mjs            # menu
node scc.mjs file.js    # xử lý file
```

**Lưu ý:** link raw chỉ hoạt động sau khi code đã được đẩy lên `N4mtapdev/scc` (xem mục "Đưa lên GitHub") và kho để chế độ Public. Nếu bạn fork hoặc đổi tên kho, chạy `bash setup-github.sh` để điền lại tên và dựng lại `dist/scc.mjs`, hoặc dùng tạm biến môi trường: `SCC_REPO=tên/kho bash <(curl -fsSL …/run.sh)`.

### Cài từ GitHub (khuyên dùng)

Sau khi code được đưa lên GitHub (xem mục "Đưa lên GitHub" bên dưới), ai cũng cài được bằng một dòng, cả trên Termux:

```bash
pkg install nodejs curl tar          # chỉ cần trên Termux
curl -fsSL https://raw.githubusercontent.com/N4mtapdev/scc/main/install.sh | bash
```

Script tải mã nguồn về `~/.scc`, kiểm tra cú pháp rồi tạo lệnh `scc` (không cần npm, không dính lỗi quyền thực thi trên bộ nhớ chia sẻ). Sau này cập nhật bằng:

```bash
scc --update
```

Các cách khác:

```bash
npx github:N4mtapdev/scc                 # chạy ngay, không cài
npm install -g github:N4mtapdev/scc      # cài toàn cục (cần git)
git clone https://github.com/N4mtapdev/scc && node scc/bin/cli.mjs
```

Kho phải để chế độ **Public** thì các lệnh trên mới tải được.

### Máy tính

```bash
cd scc
node bin/cli.mjs        # mở menu
```

Muốn gọi bằng lệnh ngắn ở bất kỳ đâu:

```bash
npm link
scc                     # hoặc: strip-comments
```

### Termux (Android)

Cách nhanh nhất: tải 4 file `cli.mjs`, `strip.mjs`, `ui.mjs`, `package.json` cùng `install-termux.sh` về thư mục Download, rồi chạy:

```bash
termux-setup-storage
bash ~/storage/downloads/install-termux.sh
```

Script tự chép file vào `~/scc`, cấp quyền chạy và tạo lệnh `scc`. Hoặc cài thủ công:

```bash
pkg update && pkg install nodejs
termux-setup-storage            # cho phép đọc file trong bộ nhớ máy (~/storage/shared)
pkg install termux-api          # tùy chọn: để nút "Sao chép" hoạt động
cd scc
node bin/cli.mjs
```

Nút "Sao chép vào clipboard" trên Termux cần cài thêm app **Termux:API** (từ F-Droid). Nếu không có, bạn vẫn dùng "Lưu ra file" bình thường.

## Dùng với menu

Chạy `node bin/cli.mjs` (hoặc `scc`) không kèm tham số:

| Mục | Chức năng |
| --- | --- |
| 📄 Chọn file để xóa comment | Duyệt thư mục, bấm **Space** để chọn nhiều file, **Enter** để xử lý |
| 📁 Xử lý cả thư mục | Nhập đường dẫn, xử lý đệ quy mọi file được hỗ trợ |
| 📋 Dán code trực tiếp | Dán code, gõ `:done` ở dòng mới (hoặc Ctrl+D) để xử lý |
| 🌐 Tải code từ URL | Nhập URL, tải về (có tiến trình, ETA) rồi xóa comment |
| 🔙 Khôi phục từ backup | Tìm file `.bak`, chọn và khôi phục về bản gốc |
| 📊 Lịch sử & thống kê | Tổng dung lượng và comment đã dọn, các lần chạy gần đây |
| 🩺 Kiểm tra môi trường | Node, quyền bộ nhớ, Termux:API, RAM, mạng |
| 🔧 Cài đặt | Bản quyền, dòng trống, chế độ xuất, backup, giao diện màu, biểu tượng. Được lưu lại cho lần sau |
| ❓ Hướng dẫn & phím tắt | Xem nhanh cách dùng |
| 🚪 Thoát | Thoát chương trình |

Với **dán code** và **URL**, sau khi xử lý bạn có thể **sao chép vào clipboard** hoặc **lưu ra file**. Kết quả dài hơn 40 dòng chỉ hiện 30 dòng đầu để gọn màn hình, hãy dùng sao chép hoặc lưu để lấy bản đầy đủ.

### Phím tắt

| Phím | Tác dụng |
| --- | --- |
| `↑` `↓` hoặc `k` `j` | Di chuyển |
| `PgUp` `PgDn` `Home` `End` | Nhảy nhanh trong danh sách dài |
| `Space` | Chọn/bỏ chọn file (trong trình duyệt file) |
| `/` | Lọc danh sách (Esc để xóa lọc) |
| `?` | Mở bảng phím tắt của menu hiện tại |
| `Enter` | Xác nhận |
| `Esc` hoặc `q` | Quay lại / thoát |
| `Ctrl+C` | Thoát ngay |

Trên Termux, nếu bàn phím ảo thiếu mũi tên thì dùng `j`/`k` hoặc hàng phím phụ của Termux.

## Dùng dòng lệnh (không menu)

```bash
scc <file|thư mục|URL>... [tùy chọn]
```

Ví dụ:

```bash
scc app.js                         # in kết quả ra màn hình
scc app.js -o app.min-free.js      # ghi ra file
scc app.js > sach.js               # chuyển hướng
scc src/                           # cả thư mục, tạo file *.clean.*
scc src/ --out-dir                 # xuất ra ./stripped, giữ cấu trúc thư mục
scc a.css b.html --overwrite       # ghi đè file gốc (tự tạo .bak)
scc https://site.com/app.js        # tải từ URL
scc page.html --keep-license --no-blank
```

### Tùy chọn

| Tùy chọn | Ý nghĩa |
| --- | --- |
| `-o`, `--out <file>` | Ghi kết quả ra file (khi chỉ có 1 file/URL) |
| `--out-dir` | Xuất ra thư mục `./stripped` |
| `--overwrite` | Ghi đè file gốc |
| `--no-backup` | Không tạo `.bak` khi ghi đè |
| `--lang <js\|css\|scss\|html>` | Chỉ định ngôn ngữ thay vì tự nhận diện |
| `--keep-license` | Giữ `/*! */`, `@license`, `@preserve` |
| `--no-blank` | Xóa mọi dòng trống |
| `--dry-run` | Chạy thử, không ghi file nào |
| `--max-mb <n>` | Bỏ qua file lớn hơn n MB (0 = không giới hạn) |
| `--doctor` | Kiểm tra môi trường |
| `-i`, `--interactive` | Mở menu |
| `-v`, `--version` | Xem phiên bản |
| `-h`, `--help` | Xem trợ giúp |

**Hành vi mặc định:**
- Một file hoặc URL: in ra màn hình (stdout).
- Nhiều file hoặc thư mục: tạo file mới `ten.clean.ext` bên cạnh file gốc.
- Chế độ dòng lệnh **không đọc** chế độ xuất đã lưu trong menu, để tránh ghi đè file ngoài ý muốn.

## Hiệu năng và máy yếu

- Bộ xử lý chạy **tuyến tính**: file 5,5 MB với 300.000 comment mất khoảng 0,2 giây, file minified một dòng 2,7 MB khoảng 0,1 giây (đo trên máy tính, điện thoại sẽ chậm hơn vài lần).
- Xử lý hàng loạt nhường lượt giữa các file nên giao diện không bị đơ và bấm `q`/`Esc` hủy được ngay.
- Mặc định bỏ qua file lớn hơn 5 MB, chỉnh trong Cài đặt hoặc bằng `--max-mb`.
- Danh sách kết quả quá dài sẽ chỉ hiện các file tiết kiệm nhiều nhất, phần còn lại gộp thành một dòng.
- Trên màn hình thấp (dưới 28 dòng) menu tự chuyển sang bố cục gọn.
- Hiệu ứng mở đầu ngắn (khoảng 0,7 giây) tự tắt khi màn hình nhỏ. Đặt biến `SCC_NO_ANIM=1` để tắt hẳn, hoặc `NO_COLOR=1` để tắt màu.

## Chế độ xuất (trong Cài đặt)

| Chế độ | Kết quả |
| --- | --- |
| Tạo file mới (mặc định) | `app.js` → `app.clean.js` |
| Ghi đè file gốc | Ghi thẳng vào `app.js`, tạo `app.js.bak` nếu bật backup |
| Xuất ra thư mục | `./stripped/...` giữ nguyên cấu trúc thư mục con |

Chế độ ghi đè luôn hỏi xác nhận trước khi chạy.

## Cấu hình

Cài đặt trong menu được lưu tại `~/.strip-comments.json`:

```json
{
  "keepLicense": false,
  "removeBlankLines": false,
  "output": "suffix",
  "backup": true,
  "theme": "aurora",
  "icons": "emoji",
  "maxMB": 5,
  "notify": false,
  "recent": []
}
```

`output` nhận `suffix`, `overwrite` hoặc `dir`. `theme` nhận `aurora`, `forest` hoặc `sunset`. `icons` nhận `emoji` hoặc `plain`. `maxMB` là ngưỡng bỏ qua file lớn (0 = không giới hạn). Lịch sử được lưu riêng ở `~/.strip-comments-history.json`. Xóa file này để quay về mặc định.

## Định dạng được hỗ trợ

| Loại | Đuôi file | Loại comment được xóa |
| --- | --- | --- |
| JavaScript / TypeScript | `.js` `.mjs` `.cjs` `.jsx` `.ts` `.tsx` | `//` và `/* */` |
| CSS | `.css` | `/* */` |
| SCSS / Less | `.scss` `.less` | `//` và `/* */` |
| HTML | `.html` `.htm` `.vue` `.svelte` | `<!-- -->`, cùng comment trong `<script>` và `<style>` |

Khi xử lý thư mục, công cụ tự bỏ qua: `node_modules`, `dist`, `build`, `coverage`, `out`, các thư mục bắt đầu bằng dấu chấm (như `.git`), và các file đã có `.clean.` hoặc `.min.` trong tên.

Với HTML, các comment điều kiện `<!--[if IE]>` luôn được giữ, và các thẻ `<script type="application/ld+json">` hay template không bị đụng tới.

## Dùng như thư viện

`src/strip.mjs` có thể import độc lập:

```js
import { stripComments } from "./src/strip.mjs";

const sach = stripComments(code, {
  language: "js",            // "js" | "css" | "scss" | "html" (bỏ trống = tự nhận diện)
  filename: "app.js",        // gợi ý nhận diện theo đuôi file
  keepLicense: true,
  removeBlankLines: false,
});
```

Các hàm khác: `stripJs`, `stripCss`, `stripScss`, `stripHtml`, `detectLanguage`.

## Cấu trúc dự án

```
scc/
├── bin/
│   └── cli.mjs        # menu, trình duyệt file, CLI, URL, clipboard
├── src/
│   ├── strip.mjs      # lõi xử lý comment, không phụ thuộc gì
│   ├── ui.mjs         # thành phần giao diện dùng chung: menu, bảng, khung, tác vụ, trình xem cuộn
│   ├── highlight.mjs  # tô màu cú pháp cho phần xem kết quả
│   └── diff.mjs       # so sánh từng dòng giữa code gốc và code đã xóa comment
├── test/              # test tự động (npm test)
├── dist/scc.mjs       # bản gộp một file, dùng cho link raw (tạo bằng node scripts/build.mjs)
├── scripts/build.mjs  # gộp bin/ và src/ thành dist/scc.mjs
├── run.sh             # chạy thẳng từ link raw, không cần cài
├── install.sh         # cài từ GitHub bằng một dòng lệnh
├── setup-github.sh    # điền tên GitHub, commit và đẩy code lên
├── install-local.sh   # cài từ các file đã tải về thư mục Download
├── .github/workflows/ # CI chạy test trên Node 18, 20, 22
├── package.json       # khai báo lệnh strip-comments / scc
└── README.md
```

## Hạn chế cần biết

- Công cụ đọc code từng ký tự và nhận diện regex bằng quy tắc ước lượng, nên vài trường hợp hiếm có thể sai. Với code quan trọng hãy dùng chế độ tạo file mới hoặc bật backup, rồi kiểm tra lại.
- Khi comment nằm giữa dòng, có thể còn sót một khoảng trắng thừa. Không ảnh hưởng chức năng.
- Code trong thuộc tính HTML như `onclick="..."` không được xử lý.
- `.vue` và `.svelte` được xử lý như HTML, nên các khối `<script>`/`<style>` bên trong vẫn được dọn, nhưng cú pháp riêng của framework thì không được hiểu sâu.
- Trong SCSS/Less, `//` đứng ngay sau `:` hoặc `(` được coi là một phần của URL, không phải comment.
- Tính năng URL chỉ tải trang công khai, chưa hỗ trợ đăng nhập hay header tùy chỉnh. Giới hạn 8 MB và chờ tối đa 20 giây.
- Giao diện dùng emoji mặc định, một số font trên điện thoại có thể hiển thị lệch. Đổi sang biểu tượng Đơn giản trong Cài đặt để khắc phục.

## Xử lý sự cố

| Vấn đề | Cách xử lý |
| --- | --- |
| `Chế độ menu cần chạy trong terminal tương tác` | Chạy trực tiếp trong terminal, không chuyển hướng stdin |
| Không thấy file trong bộ nhớ máy (Termux) | Chạy `termux-setup-storage`, rồi vào `~/storage/shared` |
| Nút "Sao chép" báo không có clipboard | Cài `pkg install termux-api` và app Termux:API (Termux), hoặc `xclip`/`wl-copy` (Linux) |
| Không tải được URL | Kiểm tra mạng và đảm bảo URL bắt đầu bằng `http://` hoặc `https://` |
| Emoji bị lệch hoặc hiện ô vuông | Vào Cài đặt, đổi **Biểu tượng** sang Đơn giản |
| Không có thông báo, sao chép, chia sẻ | Chạy 🩺 Kiểm tra môi trường, cài `termux-api` và app Termux:API |
| File lớn bị bỏ qua | Tăng ngưỡng trong Cài đặt hoặc dùng `--max-mb 0` |
| Lỡ ghi đè nhầm | Dùng 🔙 Khôi phục từ backup (cần đã bật backup) |
| Menu bị lệch dòng | Thu nhỏ cỡ chữ hoặc mở rộng cửa sổ terminal |
| Không thấy màu | Terminal cần hỗ trợ màu 24-bit. Kiểm tra biến `NO_COLOR` chưa được đặt |

## Đưa lên GitHub

Dành cho người duy trì dự án. Trong thư mục dự án chạy:

```bash
pkg install git gh                 # Termux (máy tính: cài git và GitHub CLI)
gh auth login                      # đăng nhập GitHub một lần
bash setup-github.sh
```

Script mặc định dùng `N4mtapdev/scc` (bấm Enter hai lần để đồng ý, hoặc nhập tên khác nếu bạn fork). Nó tự điền tên vào README, `package.json`, `install.sh`, `run.sh` và `bin/cli.mjs`, dựng lại `dist/scc.mjs`, tạo commit, tạo kho Public rồi đẩy code lên. Nếu chưa có `gh`, script in sẵn các bước thủ công (tạo kho trên github.com rồi `git push`).

Mỗi lần có thay đổi: tăng `version` trong `package.json` và hằng `VERSION` trong `bin/cli.mjs`, chạy `node scripts/build.mjs` để dựng lại bản gộp, rồi `git add -A && git commit -m "..." && git push`. Người dùng chạy `scc --update` sẽ nhận bản mới. Chạy `npm test` để kiểm tra trước khi đẩy, và workflow `.github/workflows/ci.yml` sẽ tự chạy test trên Node 18, 20, 22 sau mỗi lần push.

## Giấy phép

MIT