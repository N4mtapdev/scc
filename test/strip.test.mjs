import { test } from "node:test";
import assert from "node:assert/strict";
import { stripComments, detectLanguage } from "../src/strip.mjs";
import { buildDiff } from "../src/diff.mjs";
import { bundle } from "../scripts/build.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const DIST = path.join(ROOT, "dist", "scc.mjs");

const js = (s, o = {}) => stripComments(s, { language: "js", ...o });

test("xóa // và /* */ trong JS", () => {
  assert.equal(js("// a\nlet x = 1; /* b */\n"), "let x = 1;\n");
});

test("giữ // nằm trong chuỗi, URL và regex", () => {
  const src = 'const u = "http://x.com//y"; // t\nconst r = /ab+\\/c*/g;\n';
  assert.equal(js(src), 'const u = "http://x.com//y";\nconst r = /ab+\\/c*/g;\n');
});

test("giữ nội dung template literal, xóa comment trong ${}", () => {
  assert.equal(js("const m = `a // b ${1 /* c */ + 2}`;"), "const m = `a // b ${1  + 2}`;");
});

test("nối hai định danh khi comment nằm giữa", () => {
  assert.equal(js("a/**/b"), "a b");
});

test("giữ comment bản quyền khi bật tùy chọn", () => {
  assert.equal(js("/*! MIT */\n// x\nlet a;\n", { keepLicense: true }), "/*! MIT */\nlet a;\n");
});

test("CSS: giữ url(//...) và chuỗi chứa comment", () => {
  const out = stripComments("a{background:url(//cdn/x.png); /* c */}\nb::after{content:\"/* k */\"}", { language: "css" });
  assert.equal(out, 'a{background:url(//cdn/x.png); }\nb::after{content:"/* k */"}');
});

test("SCSS: xóa // nhưng không đụng url(//...)", () => {
  const out = stripComments(".a{background:url(//cdn/x.png); // i\n}", { language: "scss" });
  assert.equal(out, ".a{background:url(//cdn/x.png);\n}");
});

test("HTML: xóa comment, giữ thẻ giữa hai comment và comment điều kiện", () => {
  const out = stripComments("<!-- a --><p>x</p><!-- b -->\n<!--[if IE]><p>ie</p><![endif]-->\n", { language: "html" });
  assert.equal(out, "<p>x</p>\n<!--[if IE]><p>ie</p><![endif]-->\n");
});

test("HTML: xử lý riêng <script> và <style>", () => {
  const out = stripComments("<style>/* s */a{b:c}</style><script>// z\nlet q=1;</script>", { language: "html" });
  assert.equal(out, "<style>a{b:c}</style><script>let q=1;</script>");
});

test("đếm số comment đã xóa", () => {
  const stats = { comments: 0 };
  js("// a\nlet x=1; /* b */\n/* c */", { stats });
  assert.equal(stats.comments, 3);
});

test("nhận diện ngôn ngữ", () => {
  assert.equal(detectLanguage("", "a.scss"), "scss");
  assert.equal(detectLanguage("<div></div>"), "html");
  assert.equal(detectLanguage("a{color:red}"), "css");
  assert.equal(detectLanguage("const a = 1;"), "js");
});

test("tuyến tính: file ~3 MB nhiều comment xử lý dưới 5 giây", () => {
  const src = Array.from({ length: 100000 }, (_, i) => `// c${i}\nvar x${i} = ${i}; /* z */\n`).join("");
  const t0 = performance.now();
  const out = js(src);
  assert.ok(performance.now() - t0 < 5000, "quá chậm");
  assert.ok(!out.includes("//") && !out.includes("/*"));
});

test("diff đếm đúng dòng xóa và dòng sửa", () => {
  const d = buildDiff("// h\nconst a = 1; // t\nlet b;\n", { language: "js" });
  assert.equal(d.removed, 1);
  assert.equal(d.modified, 1);
});

test("dist/scc.mjs là bản build mới nhất (chạy node scripts/build.mjs nếu lỗi)", () => {
  assert.equal(fs.readFileSync(DIST, "utf8"), bundle());
});

test("phiên bản trong cli.mjs khớp package.json", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const cli = fs.readFileSync(path.join(ROOT, "bin", "cli.mjs"), "utf8");
  assert.match(cli, new RegExp(`const VERSION = "${pkg.version.replace(/\./g, "\\.")}"`));
});

test("bản gộp chạy độc lập và xóa comment đúng", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scc-t-"));
  const file = path.join(dir, "a.js");
  fs.writeFileSync(file, '// c\nconst u = "http://x//y"; /* b */\n');
  const r = spawnSync(process.execPath, [DIST, file], { encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, 'const u = "http://x//y";\n');
  const v = spawnSync(process.execPath, [DIST, "--version"], { encoding: "utf8" });
  assert.match(v.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

for (const script of ["run.sh", "install.sh"]) {
  const runIt = (repo) =>
    spawnSync("bash", [path.join(ROOT, script)], {
      encoding: "utf8", timeout: 30000,
      env: { ...process.env, SCC_REPO: repo, SCC_CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "scc-c-")), SCC_DIR: path.join(os.tmpdir(), "scc-i-" + process.pid), HOME: os.tmpdir() },
    });

  test(`${script}: đã có tên kho thì không báo "chưa cấu hình" (chỉ lỗi tải nếu không có mạng)`, () => {
    const r = runIt("some-user/some-repo");
    assert.ok(!/Chưa cấu hình/.test(r.stderr + r.stdout), r.stderr);
  });

  test(`${script}: tên kho còn là chỗ trống thì báo rõ ràng và dừng`, () => {
    const r = runIt("YOUR_" + "USER/strip-comments-cli");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Chưa cấu hình tên kho/);
  });
}