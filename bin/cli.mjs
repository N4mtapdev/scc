#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { stripComments, detectLanguage } from "../src/strip.mjs";
import { highlight } from "../src/highlight.mjs";
import { buildDiff, diffRowToString } from "../src/diff.mjs";
import {
  c, sym, THEMES, THEME_KEYS, setTheme, setIcons, ic, accent, gradText, gradColor, fgRgb,
  pad, truncate, tailTrunc, cols, termRows, clear, sleep, setTitle,
  fmtBytes, fmtDur, fmtDate, bar, savBar, savText, extPaint, badge, chip, kv,
  printBox, header, callout, animatedCallout, table, spinner, tasks, menu, pager, pause, ask, confirm, spark, useColor,
} from "../src/ui.mjs";

const VERSION = "1.4.0";
// Kho GitHub dùng cho lệnh cập nhật. Chạy setup-github.sh để tự điền đúng tên của bạn.
const REPO = process.env.SCC_REPO || "N4mtapdev/scc";
const BRANCH = "main";
const RAW_BASE = process.env.SCC_RAW_BASE || `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const TARBALL = process.env.SCC_TARBALL_URL || `https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}`;
const INSTALL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IS_BUNDLE = typeof __SCC_BUNDLE__ !== "undefined"; // đang chạy bản gộp dist/scc.mjs
const EXTS = new Set([
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx",
  ".css", ".scss", ".less", ".html", ".htm", ".vue", ".svelte",
]);
const IGNORE_DIRS = new Set(["node_modules", "dist", "build", "coverage", "out"]);
const CONFIG_PATH = path.join(os.homedir(), ".strip-comments.json");
const HIST_PATH = path.join(os.homedir(), ".strip-comments-history.json");
const DEFAULTS = {
  keepLicense: false, removeBlankLines: false, output: "suffix", backup: true,
  theme: "aurora", icons: "emoji", maxMB: 5, notify: false, recent: [],
};
const MAXMB_STEPS = [1, 2, 5, 10, 0];
const IS_TERMUX = !!process.env.TERMUX_VERSION || (process.env.PREFIX || "").includes("com.termux");
const TIPS = [
  "Nhấn / trong danh sách dài để lọc nhanh, nhấn ? để xem phím tắt.",
  "Chạy thử (dry run) cho bạn xem trước kết quả mà không ghi file nào.",
  "Lỡ ghi đè nhầm? Dùng Khôi phục từ backup để lấy lại bản gốc.",
  "Trong trình duyệt file, nhấn Space để chọn nhiều file rồi xử lý một lượt.",
  "Bật Thông báo khi xong để máy rung khi tác vụ dài kết thúc (cần Termux:API).",
  "Lệnh scc --doctor kiểm tra môi trường nhanh mà không cần mở menu.",
];

const MODE_LABEL = {
  suffix: "Tạo file mới (*.clean.ext)",
  overwrite: "Ghi đè file gốc",
  dir: "Xuất ra thư mục ./stripped",
};
const MODES = Object.keys(MODE_LABEL);

function applyConfig(cfg) {
  setTheme(cfg.theme);
  setIcons(cfg.icons);
}
const barW = () => (cols() < 60 ? 8 : 14);
const isCompact = () => termRows() < 26;
const isFull = () => termRows() >= 36;
const fmtNum = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/* ───────────── cấu hình, lịch sử ───────────── */
function loadConfig() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) }; }
  catch { return { ...DEFAULTS }; }
}
function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); } catch { /* bỏ qua */ }
}
const EMPTY_HIST = () => ({ totals: { runs: 0, files: 0, saved: 0, comments: 0 }, runs: [] });
function loadHist() {
  try { return { ...EMPTY_HIST(), ...JSON.parse(fs.readFileSync(HIST_PATH, "utf8")) }; }
  catch { return EMPTY_HIST(); }
}
function saveHist(h) {
  try { fs.writeFileSync(HIST_PATH, JSON.stringify(h)); } catch { /* bỏ qua */ }
}
function recordRun(sum, cfg) {
  const h = loadHist();
  h.totals.runs++;
  h.totals.files += sum.ok;
  h.totals.saved += Math.max(0, sum.before - sum.after);
  h.totals.comments += sum.comments;
  h.runs.unshift({ t: Date.now(), files: sum.ok, before: sum.before, after: sum.after, comments: sum.comments, mode: cfg.output });
  h.runs.length = Math.min(h.runs.length, 30);
  saveHist(h);
}
function addRecent(cfg, dir) {
  cfg.recent = [dir, ...(cfg.recent || []).filter((d) => d !== dir)].slice(0, 5);
  saveConfig(cfg);
}

/* ───────────── tiện ích ───────────── */
const rel = (p) => path.relative(process.cwd(), p) || p;
const shortPath = (p) => (p.startsWith(os.homedir()) ? "~" + p.slice(os.homedir().length) : p);
const expandHome = (p) => p.replace(/^~(?=$|[\\/])/, os.homedir());
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

const cmdCache = {};
function hasCmd(cmd) {
  if (!(cmd in cmdCache)) cmdCache[cmd] = spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status === 0;
  return cmdCache[cmd];
}
function notifyDone(cfg, title, text, elapsed) {
  if (!cfg.notify || elapsed < 3000) return;
  if (hasCmd("termux-notification"))
    spawnSync("termux-notification", ["--title", title, "--content", text], { timeout: 4000, stdio: "ignore" });
  if (hasCmd("termux-vibrate")) spawnSync("termux-vibrate", ["-d", "200"], { timeout: 3000, stdio: "ignore" });
}
const fail = (title, cause, hint) =>
  callout("err", title, [cause, hint ? c.gray(`→ ${hint}`) : ""].filter(Boolean));

function walk(dir, acc = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!e.name.startsWith(".") && !IGNORE_DIRS.has(e.name)) walk(p, acc);
    } else if (EXTS.has(path.extname(e.name).toLowerCase()) && !/\.(clean|min)\./.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}
function walkBak(dir, acc = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!e.name.startsWith(".") && !IGNORE_DIRS.has(e.name)) walkBak(p, acc);
    } else if (e.name.endsWith(".bak") && EXTS.has(path.extname(e.name.slice(0, -4)).toLowerCase())) {
      try {
        const st = fs.statSync(p);
        acc.push({ bak: p, orig: p.slice(0, -4), size: st.size, mtime: st.mtimeMs });
      } catch { /* bỏ qua */ }
    }
  }
  return acc;
}
function destPath(file, root, cfg) {
  if (cfg.output === "overwrite") return file;
  if (cfg.output === "dir") {
    let r = path.relative(root, file);
    if (r.startsWith("..")) r = path.basename(file);
    return path.resolve(process.cwd(), "stripped", r);
  }
  const { dir, name, ext } = path.parse(file);
  return path.join(dir, `${name}.clean${ext}`);
}

/* ───────────── xử lý hàng loạt ───────────── */
const tick = () => new Promise((r) => setImmediate(r));

function listenCancel() {
  if (!process.stdin.isTTY) return { cancelled: false, stop() {} };
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const h = { cancelled: false };
  const on = (_s, key) => {
    if (key && (key.name === "escape" || key.name === "q" || (key.ctrl && key.name === "c"))) h.cancelled = true;
  };
  process.stdin.on("keypress", on);
  h.stop = () => {
    process.stdin.off("keypress", on);
    process.stdin.setRawMode(false);
    process.stdin.pause();
  };
  return h;
}

async function processFiles(files, root, cfg, { dry = false, onProgress, cancel } = {}) {
  const result = [];
  const limit = cfg.maxMB > 0 ? cfg.maxMB * 1048576 : Infinity;
  const sizes = files.map((f) => { try { return fs.statSync(f).size; } catch { return 0; } });
  const totalBytes = sizes.reduce((a, b) => a + b, 0);
  let bytesDone = 0;
  for (let i = 0; i < files.length; i++) {
    if (cancel && cancel.cancelled) { result.cancelled = true; break; }
    const f = files[i];
    try {
      if (sizes[i] > limit) {
        result.push({ f, skipped: `quá lớn (${fmtBytes(sizes[i])})` });
      } else {
        const src = fs.readFileSync(f, "utf8");
        const stats = { comments: 0 };
        const out = stripComments(src, {
          filename: f, keepLicense: cfg.keepLicense, removeBlankLines: cfg.removeBlankLines, stats,
        });
        const dest = destPath(f, root, cfg);
        if (!dry) {
          if (cfg.output === "overwrite" && cfg.backup) fs.copyFileSync(f, `${f}.bak`);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, out);
        }
        result.push({ f, dest, before: Buffer.byteLength(src), after: Buffer.byteLength(out), comments: stats.comments });
      }
    } catch (e) {
      result.push({ f, error: e.message });
    }
    bytesDone += sizes[i];
    if (onProgress) onProgress({ i: i + 1, n: files.length, f, bytesDone, totalBytes });
    await tick();
  }
  return result;
}

function progressLine(p, t0) {
  const el = Math.max(0.001, (Date.now() - t0) / 1000);
  const rate = p.bytesDone / el;
  const eta = rate > 0 ? ((p.totalBytes - p.bytesDone) / rate) * 1000 : 0;
  const frac = p.totalBytes ? p.bytesDone / p.totalBytes : p.i / p.n;
  const parts = [bar(frac, barW()), `${Math.round(frac * 100)}%`, `${p.i}/${p.n}`];
  if (cols() >= 64) parts.push(c.gray(`${fmtBytes(rate)}/s`));
  if (p.i < p.n) parts.push(c.gray(p.i >= 3 || el > 0.5 ? `còn ~${fmtDur(eta)}` : "đang tính…"));
  if (cols() >= 84) parts.push(c.gray(rel(p.f)));
  return parts.join(" ");
}

function estimate(files, cfg) {
  const limit = cfg.maxMB > 0 ? cfg.maxMB * 1048576 : Infinity;
  const sized = files.map((f) => { let s = 0; try { s = fs.statSync(f).size; } catch { /* bỏ qua */ } return [f, s]; });
  const ok = sized.filter(([, s]) => s <= limit);
  const total = ok.reduce((a, [, s]) => a + s, 0);
  let sb = 0, sa = 0;
  const t0 = performance.now();
  for (const [f] of [...ok].sort((a, b) => a[1] - b[1])) {
    if (sb >= 200_000) break;
    try {
      const src = fs.readFileSync(f, "utf8");
      const out = stripComments(src, { filename: f, keepLicense: cfg.keepLicense, removeBlankLines: cfg.removeBlankLines });
      sb += src.length; sa += out.length;
    } catch { /* bỏ qua */ }
  }
  const ms = performance.now() - t0;
  const rate = ms > 0 && sb > 0 ? sb / ms : 0;
  return {
    used: ok.length, skipped: sized.length - ok.length, total,
    estMs: (rate ? total / rate : 0) + ok.length * 3, ratio: sb ? 1 - sa / sb : 0,
  };
}

function summarize(list) {
  const s = { ok: 0, bad: 0, skipped: 0, before: 0, after: 0, comments: 0 };
  for (const r of list) {
    if (r.error) s.bad++;
    else if (r.skipped) s.skipped++;
    else { s.ok++; s.before += r.before; s.after += r.after; s.comments += r.comments || 0; }
  }
  return s;
}

async function report(list, { dry = false, elapsed = 0, cfg = DEFAULTS } = {}) {
  const s = summarize(list);
  const frac = s.before ? 1 - s.after / s.before : 0;
  const kind = s.bad ? "err" : s.skipped || list.cancelled ? "warn" : "ok";
  const title = dry ? "Chạy thử hoàn tất" : list.cancelled ? "Đã hủy giữa chừng" : s.bad ? "Hoàn tất, có lỗi" : "Hoàn tất";
  const extra = [];
  if (s.skipped) extra.push(c.yellow(`${s.skipped} file bỏ qua vì quá lớn`));
  if (s.bad) extra.push(c.red(`${s.bad} file bị lỗi`));
  if (list.cancelled) extra.push(c.yellow("Các file còn lại chưa được xử lý"));
  if (dry) extra.push(c.gray("Chạy thử: chưa ghi file nào"));
  const mk = (p) => [
    `${c.bold(Math.round(s.ok * p))}/${list.length} file · giảm ${savText(frac, fmtBytes((s.before - s.after) * p))} (${(frac * 100 * p).toFixed(1)}%) · ${fmtNum(s.comments * p)} comment · ${fmtDur(elapsed)}`,
    ...extra,
  ];
  console.log();
  await animatedCallout(kind, title, mk);
  console.log();

  const MAXROWS = 12;
  let shown = list, hidden = 0;
  if (list.length > MAXROWS) {
    const bad = list.filter((r) => r.error || r.skipped).slice(0, 6);
    const good = list
      .filter((r) => !r.error && !r.skipped)
      .sort((a, b) => b.before - b.after - (a.before - a.after))
      .slice(0, Math.max(4, MAXROWS - bad.length));
    shown = [...bad, ...good];
    hidden = list.length - shown.length;
  }
  const wide = cols() >= 64;
  const head = wide ? ["Tệp", "Trước", "Sau", "Giảm"] : ["Tệp", "Giảm"];
  const trs = shown.filter((r) => !r.error).map((r) => {
    const name = rel(r.f);
    if (r.skipped) return wide ? [name, "", "", c.yellow("bỏ qua")] : [name, c.yellow("bỏ qua")];
    const f = r.before ? 1 - r.after / r.before : 0;
    const cell = `${savBar(f, 8)} ${savText(f, "-" + (f * 100).toFixed(0) + "%")}`;
    return wide ? [name, fmtBytes(r.before), fmtBytes(r.after), cell] : [name, cell];
  });
  if (trs.length) table(head, trs, { align: wide ? ["l", "r", "r", "l"] : ["l", "l"], firstPaint: extPaint });
  for (const r of shown.filter((x) => x.error)) {
    console.log(truncate(` ${sym.err} ${tailTrunc(rel(r.f), 28)} ${c.red(r.error)}`, cols() - 1));
  }
  if (hidden) console.log(c.gray(truncate(` … và ${hidden} file khác (hiện các file tiết kiệm nhiều nhất)`, cols() - 1)));
  if (!dry && s.ok) {
    const where =
      cfg.output === "overwrite" ? `Đã ghi đè file gốc${cfg.backup ? ", backup .bak nằm bên cạnh" : ""}`
      : cfg.output === "dir" ? "Đã ghi vào ./stripped"
      : "Đã tạo file *.clean.* bên cạnh file gốc";
    console.log(c.gray(truncate(`\n ↳ ${where}`, cols() - 1)));
  }
  return s;
}

/* ───────────── màn hình chính ───────────── */
async function splash() {
  if (!useColor || !isFull() || process.env.SCC_NO_ANIM) return;
  const art = ["╔═╗╔╦╗╦═╗╦╔═╗", "╚═╗ ║ ╠╦╝║╠═╝", "╚═╝ ╩ ╩╚═╩╩  "];
  const frames = 14;
  process.stdout.write("\x1b[?25l\n");
  for (let f = 0; f <= frames; f++) {
    const pos = (f / frames) * (art[0].length + 8) - 4;
    const lines = art.map((l, li) =>
      "  " +
      [...l].map((ch, x) => {
        const base = gradColor((x / (l.length - 1)) * 0.8 + li * 0.1);
        const d = Math.abs(x - pos + li * 2);
        const k = d < 3.5 ? 1 - d / 3.5 : 0;
        return fgRgb(base.map((v) => Math.round(v + (255 - v) * k)))(ch);
      }).join("")
    );
    if (f > 0) process.stdout.write("\x1b[3A\r");
    process.stdout.write(lines.join("\n") + "\n");
    await sleep(50);
  }
  process.stdout.write("\x1b[?25h");
}

function mainHeader(cfg, tip) {
  const h = loadHist();
  const modeBadge = cfg.output === "overwrite" ? " " + badge("GHI ĐÈ", "err") : "";
  const dot = (b) => (b ? c.green("●") : c.gray("○"));
  const vals = h.runs.slice(0, 12).reverse().map((r) => (r.before ? 1 - r.after / r.before : 0));
  const stats = `${c.bold(fmtNum(h.totals.comments))} ${c.gray("comment")}  ${c.bold(fmtBytes(h.totals.saved))} ${c.gray("tiết kiệm")}  ${c.bold(h.totals.runs)} ${c.gray("lượt")}`;
  const trend = vals.length
    ? `${spark(vals)}  ${c.gray("mức giảm qua các lần chạy gần đây")}`
    : c.gray("Chưa có lần chạy nào. Hãy bắt đầu bằng “Chọn file”.");
  if (isCompact()) {
    console.log("\n" + truncate(`${accent("▌")}${gradText(" Strip Comments")} ${c.gray("v" + VERSION)}  ${c.gray(shortPath(process.cwd()))}${modeBadge}`, cols() - 1));
    console.log(truncate(`  ${vals.length ? spark(vals) + "  " : ""}${stats}`, cols() - 1));
    console.log();
    return;
  }
  const lines = [];
  if (isFull()) {
    const art = ["╔═╗╔╦╗╦═╗╦╔═╗", "╚═╗ ║ ╠╦╝║╠═╝", "╚═╝ ╩ ╩╚═╩╩  "];
    const side = [
      c.bold("Strip Comments") + c.gray(` v${VERSION}`),
      c.gray("Xóa comment cho JS · TS · CSS · HTML"),
      c.gray("Gọn · nhanh · không cần thư viện"),
    ];
    const narrow = cols() < 52;
    art.forEach((l, i) => lines.push(gradText(l, i * 0.1) + (narrow ? "" : "   " + side[i])));
    if (narrow) lines.push(side[0]);
    lines.push(c.gray("─".repeat(Math.max(8, Math.min(cols() - 8, 64)))));
  } else {
    lines.push(`${gradText("Strip Comments")} ${c.gray("v" + VERSION)}  ${c.gray("· JS · TS · CSS · HTML")}`);
  }
  lines.push(stats, trend);
  lines.push(`${c.gray(shortPath(process.cwd()))}${modeBadge}  ${dot(cfg.keepLicense)} bản quyền ${dot(cfg.removeBlankLines)} trống ${dot(cfg.backup)} backup`);
  console.log();
  printBox(lines);
  console.log(c.gray(truncate(` ${ic("help")} Mẹo: ${tip}`, cols() - 1)));
  console.log();
}

/* ───────────── thư mục nhanh & chọn file ───────────── */
function quickDirs(cfg) {
  const home = os.homedir();
  const cands = [
    ["Thư mục hiện tại", process.cwd()],
    ["Home Termux", home],
    ["Bộ nhớ chung (storage/shared)", path.join(home, "storage", "shared")],
    ["Tải xuống (storage/downloads)", path.join(home, "storage", "downloads")],
    ["Bộ nhớ máy (/sdcard)", "/sdcard"],
    ...(cfg.recent || []).map((p) => ["Gần đây", p]),
  ];
  const seen = new Set();
  return cands.filter(([, p]) => {
    if (seen.has(p) || !isDir(p)) return false;
    seen.add(p);
    return true;
  });
}

async function chooseDir(cfg, title) {
  while (true) {
    const items = quickDirs(cfg).map(([n, p]) => ({ label: `${ic("dir")} ${n}`, hint: shortPath(p), value: { t: "dir", p } }));
    items.push({ label: "⌨ Nhập đường dẫn khác…", value: { t: "ask" }, sticky: true });
    if (IS_TERMUX && !isDir(path.join(os.homedir(), "storage"))) {
      items.push({
        label: `${ic("star")} Cấp quyền bộ nhớ`, value: { t: "perm" }, sticky: true,
        desc: "Chạy termux-setup-storage, bấm Cho phép trong hộp thoại Android",
      });
    }
    const res = await menu({ title, items });
    if (!res) return null;
    const v = res.item.value;
    if (v.t === "dir") return v.p;
    if (v.t === "ask") {
      const a = await ask("Đường dẫn: ");
      if (!a) continue;
      const p = path.resolve(expandHome(a));
      if (isDir(p)) return p;
      fail("Không tìm thấy thư mục", shortPath(p), "Kiểm tra lại đường dẫn");
      await pause("Nhấn phím bất kỳ để thử lại…");
    }
    if (v.t === "perm") {
      spawnSync("termux-setup-storage", { stdio: "inherit" });
      await pause("Xong. Nhấn phím bất kỳ để tiếp tục…");
    }
  }
}

async function pickFiles(cfg) {
  const selected = new Set();
  let dir = process.cwd();
  while (true) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { dir = path.dirname(dir); continue; }
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !IGNORE_DIRS.has(e.name))
      .map((e) => e.name).sort();
    const files = entries
      .filter((e) => e.isFile() && EXTS.has(path.extname(e.name).toLowerCase()) && !/\.(clean|min)\./.test(e.name))
      .map((e) => e.name).sort();

    const items = [];
    if (selected.size) items.push({ label: `✔ Xử lý ${selected.size} file đã chọn`, value: { t: "run" }, sticky: true, desc: "Chạy với các file đã tick" });
    items.push({ label: `${ic("all")} Xử lý cả thư mục này`, value: { t: "all" }, sticky: true, desc: "Đệ quy mọi file JS/CSS/HTML trong thư mục" });
    items.push({ label: `${ic("star")} Thư mục nhanh…`, value: { t: "quick" }, sticky: true, desc: "Nhảy tới Download, bộ nhớ máy, thư mục gần đây" });
    if (path.dirname(dir) !== dir) items.push({ label: "↑ ..", hint: "lên thư mục cha", value: { t: "up" }, sticky: true });
    for (const d of dirs) items.push({ label: `${ic("dir")} ${d}/`, value: { t: "dir", p: path.join(dir, d) } });
    for (const f of files) {
      const p = path.join(dir, f);
      let size = "";
      try { size = fmtBytes(fs.statSync(p).size); } catch { /* bỏ qua */ }
      items.push({ label: `${ic("file")} ${extPaint(f)}`, hint: size, value: { t: "file", p }, key: p, selectable: true });
    }
    const res = await menu({ title: `${ic("all")} ${shortPath(dir)}`, items, selected });
    if (!res) return null;
    const v = res.item.value;
    if (v.t === "up") dir = path.dirname(dir);
    else if (v.t === "dir") dir = v.p;
    else if (v.t === "quick") { const d = await chooseDir(cfg, "Đi tới thư mục"); if (d) dir = d; }
    else if (v.t === "file") { selected.add(v.p); return { files: [...selected], root: dir }; }
    else if (v.t === "run") return { files: [...selected], root: dir };
    else if (v.t === "all") return { files: walk(dir), root: dir };
  }
}

async function runOn(target, cfg) {
  if (!target || !target.files.length) {
    callout("warn", "Không có file để xử lý", ["Không tìm thấy file JS, CSS hoặc HTML phù hợp."]);
    return;
  }
  const est = estimate(target.files, cfg);
  console.log();
  printBox(
    kv([
      ["Số file", `${est.used}${est.skipped ? c.yellow(` (+${est.skipped} bỏ qua vì quá lớn)`) : ""} · ${fmtBytes(est.total)}`],
      ["Thời gian", `~${fmtDur(est.estMs)}`],
      ["Dự kiến giảm", `~${(est.ratio * 100).toFixed(0)}% (≈ ${fmtBytes(est.total * est.ratio)})`],
    ]).concat(c.gray("Ước tính theo mẫu nhỏ, kết quả thật có thể lệch.")),
    { title: "Ước tính" }
  );
  const danger = cfg.output === "overwrite";
  if (danger) {
    callout("warn", "Chế độ ghi đè", [
      cfg.backup ? "File gốc sẽ bị thay thế. Backup .bak được tạo bên cạnh." : c.red("File gốc sẽ bị thay thế và KHÔNG có backup."),
    ]);
  }
  console.log();

  const choice = await menu({
    title: `Chế độ: ${MODE_LABEL[cfg.output]}`,
    items: [
      { label: `${ic("run")} Chạy`, value: "run" },
      { label: `${ic("dry")} Chạy thử (không ghi file)`, value: "dry", desc: "Xem kết quả và dung lượng giảm, không thay đổi file nào" },
      { label: "Hủy", value: "cancel" },
    ],
    start: danger && !cfg.backup ? 1 : 0,
    keys: [["↑↓", "chọn"], ["⏎", "xác nhận"]],
  });
  if (!choice || choice.item.value === "cancel") { console.log(c.gray("Đã hủy.")); return; }
  const dry = choice.item.value === "dry";

  const cancel = listenCancel();
  console.log(c.gray(` ${dry ? "Chạy thử" : "Đang xử lý"}… nhấn q hoặc Esc để hủy.`));
  const t = tasks(["Quét file", "Xử lý", "Hoàn tất"]);
  t.done(0, c.gray(`${target.files.length} file`));
  const t0 = Date.now();
  t.run(1, c.gray("đang bắt đầu…"));
  const list = await processFiles(target.files, target.root, cfg, {
    dry, cancel, onProgress: (p) => t.update(1, progressLine(p, t0)),
  });
  cancel.stop();
  const elapsed = Date.now() - t0;
  const sum = summarize(list);
  if (list.cancelled) t.warn(1, c.yellow(`đã hủy sau ${list.length}/${target.files.length} file`));
  else t.done(1, c.gray(`${sum.ok} file · ${sum.comments} comment`));
  if (sum.bad) t.warn(2, c.yellow(`${sum.bad} lỗi · ${fmtDur(elapsed)}`));
  else t.done(2, c.gray(fmtDur(elapsed)));
  t.stop();

  await report(list, { dry, elapsed, cfg });
  if (!dry && sum.ok) {
    recordRun(sum, cfg);
    addRecent(cfg, target.root);
  }
  notifyDone(cfg, "Strip Comments", `Xong ${sum.ok} file, giảm ${fmtBytes(sum.before - sum.after)}`, elapsed);
  console.log();
  return sum.ok ? await offerDiffs(list, cfg, dry) : false;
}

/* ───────────── URL, clipboard, kết quả ───────────── */
const LANG_EXT = { js: ".js", css: ".css", scss: ".scss", html: ".html" };

async function loadUrl(url, { onConnect, onProgress } = {}) {
  const ctrl = new AbortController();
  let timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const total = Number(r.headers.get("content-length")) || 0;
    if (onConnect) onConnect({ status: r.status, total });
    const chunks = [];
    let received = 0;
    const t0 = Date.now();
    if (r.body && r.body.getReader) {
      const reader = r.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (received > 8_000_000) throw new Error("File quá lớn (>8 MB)");
        clearTimeout(timer);
        timer = setTimeout(() => ctrl.abort(), 20000);
        if (onProgress) onProgress({ received, total, elapsed: Date.now() - t0 });
      }
    } else {
      chunks.push(Buffer.from(await r.arrayBuffer()));
      received = chunks[0].length;
    }
    const text = new TextDecoder("utf-8").decode(Buffer.concat(chunks));
    const type = r.headers.get("content-type") || "";
    let name = "index";
    try { name = decodeURIComponent(new URL(url).pathname.split("/").pop()) || "index"; } catch { /* giữ mặc định */ }
    const ext = path.extname(name).toLowerCase();
    let lang;
    if (!EXTS.has(ext)) {
      lang = /html/i.test(type) ? "html" : /css/i.test(type) ? "css" : /javascript|ecmascript/i.test(type) ? "js" : undefined;
    }
    return { text, lang, name, bytes: received };
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "Hết thời gian chờ (20s)" : e.message);
  } finally {
    clearTimeout(timer);
  }
}

function copyToClipboard(text) {
  const cmds =
    IS_TERMUX ? [["termux-clipboard-set"]]
    : process.platform === "darwin" ? [["pbcopy"]]
    : process.platform === "win32" ? [["clip"]]
    : [["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]];
  for (const [cmd, ...args] of cmds) {
    const r = spawnSync(cmd, args, { input: text, timeout: 5000 });
    if (!r.error && r.status === 0) return true;
  }
  return false;
}

const viewLang = (language, filename, src) => {
  const l = language || detectLanguage(src, filename || "");
  return l === "scss" ? "css" : l;
};

async function viewOutput(out, lang, name) {
  const lines = out.split("\n");
  const gw = String(lines.length).length;
  await pager({
    title: `${c.bold(` ${name} `)}${c.gray(`· ${fmtNum(lines.length)} dòng · kết quả`)}`,
    total: lines.length,
    getLine: (i, hx) => `${c.gray(`${String(i + 1).padStart(gw)} │ `)}${highlight(lines[i].replace(/\t/g, "  ").slice(hx), lang)}`,
  });
}

async function viewDiff(src, opts, name) {
  const d = buildDiff(src, opts);
  if (!d.rows.some((r) => r.k === "-" || r.k === "+")) {
    callout("info", "Không có thay đổi nào để hiển thị", [c.gray(name)]);
    await pause();
    return;
  }
  await pager({
    title: `${c.bold(` ${name} `)}${c.gray(`· ${d.removed} dòng bị xóa · ${d.modified} dòng sửa${d.truncated ? ` · chỉ so sánh ${d.maxLines} dòng đầu` : ""}`)}`,
    total: d.rows.length,
    getLine: (i, hx) => diffRowToString(d.rows[i], hx, cols() - 1, d.gw),
  });
}

function originalText(r, cfg, dry) {
  try {
    if (!dry && cfg.output === "overwrite") return cfg.backup ? fs.readFileSync(`${r.f}.bak`, "utf8") : null;
    return fs.readFileSync(r.f, "utf8");
  } catch { return null; }
}

async function offerDiffs(list, cfg, dry) {
  const cands = list
    .filter((r) => !r.error && !r.skipped && r.comments > 0)
    .sort((a, b) => b.before - b.after - (a.before - a.after))
    .slice(0, 15);
  if (!cands.length) return false;
  let start = 0;
  while (true) {
    const items = [
      ...cands.map((r) => ({
        label: `${ic("diff")} ${tailTrunc(rel(r.f), Math.max(10, cols() - 30))}`,
        hint: `-${fmtBytes(r.before - r.after)}`, value: r,
      })),
      { label: "← Xong", value: null, sticky: true },
    ];
    const res = await menu({
      title: "Xem thay đổi (diff) của file nào?", items, start,
      keys: [["↑↓", "chọn"], ["⏎", "xem"], ["esc", "xong"]],
    });
    if (!res || !res.item.value) return true;
    start = res.index;
    const r = res.item.value;
    const orig = originalText(r, cfg, dry);
    if (orig == null) {
      callout("warn", "Không còn bản gốc để so sánh", [c.gray("Chế độ ghi đè không có backup.")]);
      await pause();
      continue;
    }
    await viewDiff(orig, { filename: r.f, keepLicense: cfg.keepLicense, removeBlankLines: cfg.removeBlankLines }, rel(r.f));
  }
}

async function resultActions({ src, out, comments, filename, language, cfg, defName }) {
  const b = Buffer.byteLength(src), a = Buffer.byteLength(out);
  const frac = b ? 1 - a / b : 0;
  const lang = viewLang(language, filename, src);
  const diffOpts = { language, filename, keepLicense: cfg.keepLicense, removeBlankLines: cfg.removeBlankLines };
  console.log();
  await animatedCallout("ok", "Đã xóa comment", (p) => [
    `giảm ${savText(frac, fmtBytes((b - a) * p))} (${(frac * 100 * p).toFixed(1)}%) · ${fmtNum(comments * p)} comment`,
    c.gray(`${fmtBytes(b)} → ${fmtBytes(a)}`),
  ]);
  console.log();
  const shareOk = IS_TERMUX && hasCmd("termux-share");
  let start = 0;
  while (true) {
    const items = [
      { label: `${ic("eye")} Xem kết quả`, value: "view", desc: "Cuộn xem toàn bộ, có tô màu cú pháp" },
      { label: `${ic("diff")} Xem thay đổi (diff)`, value: "diff", desc: "Đối chiếu từng dòng: đỏ là đã xóa, xanh là bản mới" },
      { label: `${ic("copy")} Sao chép vào clipboard`, value: "copy" },
      { label: `${ic("save")} Lưu ra file`, value: "save" },
      ...(shareOk ? [{ label: `${ic("share")} Chia sẻ qua ứng dụng khác`, value: "share", desc: "Gửi sang Zalo, Telegram, Ghi chú…" }] : []),
      { label: "← Quay lại menu", value: "back" },
    ];
    const res = await menu({ items, start });
    if (!res || res.item.value === "back") return;
    start = res.index;
    const v = res.item.value;
    if (v === "view") await viewOutput(out, lang, defName);
    else if (v === "diff") await viewDiff(src, diffOpts, defName);
    else if (v === "copy") {
      if (copyToClipboard(out)) callout("ok", "Đã sao chép vào clipboard");
      else fail("Không có clipboard", "Không tìm thấy lệnh sao chép trên máy này", "Termux: pkg install termux-api và cài app Termux:API");
      await pause();
    } else if (v === "save") {
      const n = await ask(`Tên file ${c.gray(`(Enter = ${defName})`)}: `);
      const p = path.resolve(expandHome(n || defName));
      try {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, out);
        callout("ok", "Đã lưu file", [c.gray(shortPath(p))]);
      } catch (e) {
        fail("Không lưu được file", e.message, "Thử lưu vào ~ hoặc ~/storage/shared");
      }
      await pause();
    } else if (v === "share") {
      const r = spawnSync("termux-share", ["-a", "send"], { input: out, timeout: 15000 });
      if (r.status === 0) callout("ok", "Đã mở hộp chia sẻ");
      else fail("Không chia sẻ được", "termux-share trả về lỗi", "Kiểm tra app Termux:API");
      await pause();
    }
  }
}

/* ───────────── các màn hình ───────────── */
async function screenFiles(cfg) {
  clear(); header(["Chọn file"]); console.log();
  const target = await pickFiles(cfg);
  if (!target) return;
  if (!(await runOn(target, cfg))) await pause();
}

async function screenFolder(cfg) {
  clear(); header(["Xử lý thư mục"]); console.log();
  const dir = await chooseDir(cfg, "Chọn thư mục cần xử lý");
  if (!dir) return;
  console.log(c.gray(`${ic("all")} ${shortPath(dir)}`));
  const sp = spinner("Đang quét file…");
  const files = walk(dir);
  sp.stop();
  if (!(await runOn({ files, root: dir }, cfg))) await pause();
}

async function screenUrl(cfg) {
  clear(); header(["Tải từ URL"]); console.log();
  const url = await ask(`${ic("url")} Nhập URL ${c.gray("(js, css, html…)")}: `);
  if (!url) return;
  console.log();
  if (!/^https?:\/\//i.test(url)) {
    fail("URL không hợp lệ", "URL phải bắt đầu bằng http:// hoặc https://", "Ví dụ: https://cdnjs.cloudflare.com/…/app.js");
    await pause();
    return;
  }
  const t = tasks(["Kết nối", "Tải xuống", "Xóa comment"]);
  let step = 0, last = 0;
  t.run(0, c.gray(truncate(url, Math.max(10, cols() - 22))));
  const t0 = Date.now();
  let data;
  try {
    data = await loadUrl(url, {
      onConnect: ({ status, total }) => {
        t.done(0, c.gray(`HTTP ${status}${total ? " · " + fmtBytes(total) : ""}`));
        t.run(1, "");
        step = 1;
      },
      onProgress: ({ received, total, elapsed }) => {
        const now = Date.now();
        if (now - last < 80) return;
        last = now;
        const rate = received / Math.max(0.001, elapsed / 1000);
        const parts = total ? [bar(received / total, barW()), `${Math.round((received / total) * 100)}%`, `${fmtBytes(received)}/${fmtBytes(total)}`] : [fmtBytes(received)];
        parts.push(c.gray(`${fmtBytes(rate)}/s`));
        if (total && received < total) parts.push(c.gray(`còn ~${fmtDur(((total - received) / rate) * 1000)}`));
        t.update(1, parts.join(" "));
      },
    });
  } catch (e) {
    t.fail(step, c.red(e.message));
    t.stop();
    console.log();
    fail("Không tải được file", e.message, "Kiểm tra mạng và URL, hoặc chạy scc --doctor");
    await pause();
    return;
  }
  t.done(1, c.gray(`${fmtBytes(data.bytes)} · ${fmtDur(Date.now() - t0)}`));
  t.run(2, c.gray(data.text.length > 200_000 ? "file lớn, có thể mất vài giây…" : ""));
  const stats = { comments: 0 };
  const t1 = Date.now();
  const out = stripComments(data.text, {
    language: data.lang, filename: data.name,
    keepLicense: cfg.keepLicense, removeBlankLines: cfg.removeBlankLines, stats,
  });
  t.done(2, c.gray(`${stats.comments} comment · ${fmtDur(Date.now() - t1)}`));
  t.stop();
  const { name, ext } = path.parse(data.name);
  await resultActions({
    src: data.text, out, comments: stats.comments, filename: data.name, language: data.lang, cfg,
    defName: `${name}.clean${ext || LANG_EXT[data.lang] || ".txt"}`,
  });
}

async function screenPaste(cfg) {
  clear(); header(["Dán code"]); console.log();
  console.log(`${c.bold(`${ic("paste")} Dán code vào đây`)}, rồi gõ ${accent(":done")} ở dòng mới ${c.gray("(hoặc Ctrl+D)")} để xử lý:\n`);
  const lines = await new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin });
    const buf = [];
    rl.on("line", (l) => (l.trim() === ":done" ? rl.close() : buf.push(l)));
    rl.on("close", () => resolve(buf));
  });
  const src = lines.join("\n");
  if (!src.trim()) { callout("warn", "Chưa có code nào để xử lý"); await pause(); return; }

  const lang = await menu({
    title: "Ngôn ngữ của đoạn code?",
    items: [
      { label: "Tự nhận diện", value: undefined },
      { label: "JavaScript / TypeScript", value: "js" },
      { label: "CSS", value: "css" },
      { label: "SCSS / Less", value: "scss" },
      { label: "HTML", value: "html" },
    ],
  });
  if (!lang) return;
  const stats = { comments: 0 };
  const out = stripComments(src, {
    language: lang.item.value, keepLicense: cfg.keepLicense, removeBlankLines: cfg.removeBlankLines, stats,
  });
  await resultActions({
    src, out, comments: stats.comments, filename: "", language: lang.item.value, cfg,
    defName: `clean-code${LANG_EXT[lang.item.value] || ".txt"}`,
  });
}

async function screenRestore(cfg) {
  clear(); header(["Khôi phục từ backup"]); console.log();
  const dir = await chooseDir(cfg, "Tìm file backup (.bak) ở đâu?");
  if (!dir) return;
  const sp = spinner("Đang tìm backup…");
  const found = walkBak(dir);
  sp.stop();
  if (!found.length) {
    callout("warn", "Không tìm thấy file .bak nào", [
      c.gray(shortPath(dir)),
      c.gray("Backup chỉ được tạo khi dùng chế độ Ghi đè (Cài đặt → Chế độ xuất)."),
    ]);
    await pause();
    return;
  }
  const selected = new Set(found.map((f) => f.bak));
  let start = 0;
  while (true) {
    const items = [
      { label: `✔ Khôi phục ${selected.size} file`, value: { t: "run" }, sticky: true, desc: "Ghi đè file hiện tại bằng bản backup" },
      ...found.map((f) => ({
        label: `${ic("restore")} ${tailTrunc(rel(f.orig), Math.max(10, cols() - 26))}`,
        hint: `${fmtBytes(f.size)} · ${fmtDate(f.mtime)}`,
        value: { t: "file" }, key: f.bak, selectable: true,
      })),
      { label: "← Hủy", value: { t: "cancel" }, sticky: true },
    ];
    const res = await menu({
      title: `Backup trong ${shortPath(dir)}`, items, selected, start,
      keys: [["space", "tick"], ["⏎", "bật/tắt · dòng đầu để khôi phục"], ["esc", "hủy"]],
    });
    if (!res || res.item.value.t === "cancel") return;
    start = res.index;
    if (res.item.value.t === "file") {
      const k = res.item.key;
      selected.has(k) ? selected.delete(k) : selected.add(k);
      continue;
    }
    if (selected.size) break;
  }
  callout("warn", "File hiện tại sẽ bị thay thế bằng bản backup", [c.gray(`${selected.size} file`)]);
  if (!(await confirm("Tiếp tục khôi phục?", { danger: true }))) { console.log(c.gray("Đã hủy.")); return; }
  const del = await menu({
    title: "Sau khi khôi phục?",
    items: [{ label: "Giữ lại file .bak", value: false }, { label: "Xóa file .bak", value: true }],
  });
  if (!del) return;
  console.log();
  let done = 0;
  for (const f of found.filter((x) => selected.has(x.bak))) {
    try {
      fs.copyFileSync(f.bak, f.orig);
      if (del.item.value) fs.unlinkSync(f.bak);
      console.log(truncate(` ${sym.ok} ${rel(f.orig)}`, cols() - 1));
      done++;
    } catch (e) {
      console.log(truncate(` ${sym.err} ${rel(f.orig)} ${c.red(e.message)}`, cols() - 1));
    }
  }
  console.log();
  callout(done === selected.size ? "ok" : "warn", `Đã khôi phục ${done}/${selected.size} file`);
  await pause();
}

async function screenHistory() {
  while (true) {
    clear(); header(["Lịch sử & thống kê"]); console.log();
    const h = loadHist();
    printBox(
      kv([
        ["Số lần chạy", String(h.totals.runs)],
        ["File đã xử lý", String(h.totals.files)],
        ["Comment đã xóa", String(h.totals.comments)],
        ["Tổng tiết kiệm", c.green(fmtBytes(h.totals.saved))],
      ]),
      { title: `${ic("stats")} Tổng quan` }
    );
    if (h.runs.length) {
      const vals = h.runs.slice(0, 14).reverse().map((r) => (r.before ? 1 - r.after / r.before : 0));
      console.log(`  ${spark(vals)}  ${c.gray("mức giảm qua các lần chạy gần đây")}`);
    }
    console.log();
    if (h.runs.length) {
      const trs = h.runs.slice(0, 8).map((r) => {
        const f = r.before ? 1 - r.after / r.before : 0;
        return [fmtDate(r.t), String(r.files), `${savBar(f, 6)} ${savText(f, "-" + (f * 100).toFixed(0) + "%")}`, fmtBytes(r.before - r.after)];
      });
      table(["Thời gian", "File", "Mức giảm", "Tiết kiệm"], trs, { align: ["l", "r", "l", "r"] });
      console.log();
    } else {
      callout("info", "Chưa có lần chạy nào", [c.gray("Hãy xử lý vài file rồi quay lại đây.")]);
      console.log();
    }
    const res = await menu({
      items: [{ label: "🗑 Xóa lịch sử", value: "clear" }, { label: "← Quay lại", value: "back" }],
    });
    if (!res || res.item.value === "back") return;
    if (await confirm("Xóa toàn bộ lịch sử và thống kê?", { danger: true })) saveHist(EMPTY_HIST());
  }
}

async function doctor({ interactive = true } = {}) {
  const checks = [];
  const add = (state, label, detail, fix) => checks.push({ state, label, detail, fix });
  const major = Number(process.versions.node.split(".")[0]);
  add(major >= 18 ? "ok" : "err", "Node.js", `v${process.versions.node}`, major >= 18 ? "" : "Cần Node 18+: pkg upgrade nodejs");
  add("ok", "Môi trường", IS_TERMUX ? "Termux (Android)" : process.platform);
  add(process.stdout.isTTY ? "ok" : "warn", "Màn hình", `${cols()}×${termRows()}`, process.stdout.isTTY ? "" : "Không phải terminal tương tác");
  const tc = /truecolor|24bit/i.test(process.env.COLORTERM || "");
  add(tc ? "ok" : "warn", "Màu 24-bit", tc ? "có" : "không rõ", tc ? "" : "Màu có thể kém đẹp, không ảnh hưởng chức năng");
  const free = os.freemem(), tot = os.totalmem();
  add(free > 300e6 ? "ok" : "warn", "RAM trống", `${fmtBytes(free)} / ${fmtBytes(tot)}`, free > 300e6 ? "" : "RAM thấp: đóng bớt app, đặt giới hạn file lớn thấp hơn");
  if (IS_TERMUX) {
    const st = isDir(path.join(os.homedir(), "storage"));
    add(st ? "ok" : "warn", "Quyền bộ nhớ", st ? "đã cấp" : "chưa cấp", st ? "" : "Chạy: termux-setup-storage");
    const have = ["termux-clipboard-set", "termux-notification", "termux-share", "termux-vibrate"].filter(hasCmd);
    add(have.length === 4 ? "ok" : "warn", "Termux:API", `${have.length}/4 lệnh`, have.length === 4 ? "" : "Cài: pkg install termux-api, và app Termux:API (F-Droid)");
  }
  try {
    const p = path.join(process.cwd(), `.scc-test-${process.pid}`);
    fs.writeFileSync(p, "x"); fs.unlinkSync(p);
    add("ok", "Ghi file", "thư mục hiện tại ghi được");
  } catch {
    add("err", "Ghi file", "thư mục hiện tại không ghi được", "Chuyển về ~ (home) hoặc ~/storage/shared");
  }
  try { fs.accessSync(os.homedir(), fs.constants.W_OK); add("ok", "Cấu hình", shortPath(CONFIG_PATH)); }
  catch { add("warn", "Cấu hình", "không lưu được cài đặt"); }

  const sp = interactive ? spinner("Đang kiểm tra mạng…") : { stop() {} };
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch("https://www.gstatic.com/generate_204", { signal: ctrl.signal });
    clearTimeout(tm);
    add(r.status < 400 ? "ok" : "warn", "Mạng", `${Date.now() - t0} ms`);
  } catch {
    add("warn", "Mạng", "không kết nối được", "Tính năng URL cần mạng; file cục bộ vẫn dùng bình thường");
  }
  sp.stop();

  const lines = [];
  for (const k of checks) {
    lines.push(`${sym[k.state]} ${c.bold(k.label)}  ${c.gray(k.detail || "")}`);
    if (k.fix) lines.push(c.gray(`   ↳ ${k.fix}`));
  }
  console.log();
  printBox(lines, { title: `${ic("doctor")} Kiểm tra môi trường` });
  const bad = checks.filter((k) => k.state === "err").length;
  const warn = checks.filter((k) => k.state === "warn").length;
  console.log();
  if (bad) callout("err", `${bad} lỗi cần xử lý`);
  else if (warn) callout("warn", `${warn} cảnh báo`, [c.gray("Vẫn dùng được bình thường.")]);
  else callout("ok", "Mọi thứ đều ổn");
}

const cmpVer = (a, b) => {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
};

async function updateBundle(remote) {
  const self = fileURLToPath(import.meta.url);
  const t = tasks(["Tải bản mới", "Kiểm tra", "Cài đặt"]);
  const tmp = path.join(os.tmpdir(), `scc-up-${process.pid}.mjs`);
  let step = 0;
  try {
    t.run(0, c.gray("đang tải…"));
    const r = await fetch(`${RAW_BASE}/dist/scc.mjs`, { redirect: "follow", signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`HTTP ${r.status} khi tải dist/scc.mjs`);
    const text = await r.text();
    fs.writeFileSync(tmp, text);
    t.done(0, c.gray(fmtBytes(Buffer.byteLength(text))));
    step = 1; t.run(1);
    if (spawnSync(process.execPath, ["--check", tmp]).status !== 0) throw new Error("bản tải về bị lỗi cú pháp, đã hủy cập nhật");
    t.done(1, c.gray("hợp lệ"));
    step = 2; t.run(2);
    fs.copyFileSync(tmp, self);
    try { fs.chmodSync(self, 0o755); } catch { /* bỏ qua */ }
    t.done(2, c.gray(shortPath(self)));
    t.stop();
    console.log();
    callout("ok", `Đã cập nhật lên v${remote}`, [c.gray("Chạy lại scc để dùng bản mới.")]);
  } catch (e) {
    t.fail(step, c.red(e.message));
    t.stop();
    console.log();
    fail("Cập nhật không thành công", e.message, "Kiểm tra mạng và tên kho GitHub");
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

async function selfUpdate({ interactive = true } = {}) {
  if (!process.env.SCC_RAW_BASE && REPO.startsWith("YOUR_" + "USER")) {
    fail("Chưa cấu hình kho GitHub", "Chưa điền tên kho trong bin/cli.mjs và chưa đặt biến SCC_REPO", "Chạy bash setup-github.sh trong thư mục dự án");
    return;
  }
  const sp = interactive ? spinner("Đang kiểm tra bản mới…") : { stop() {} };
  let remote;
  try {
    const r = await fetch(`${RAW_BASE}/package.json`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    remote = (await r.json()).version;
  } catch (e) {
    sp.stop();
    fail("Không kiểm tra được bản mới", e.message, "Kiểm tra mạng, tên kho GitHub và kho phải để chế độ public");
    return;
  }
  sp.stop();
  if (cmpVer(remote, VERSION) <= 0) {
    callout("ok", "Bạn đang dùng bản mới nhất", [c.gray(`v${VERSION}`)]);
    return;
  }
  callout("info", `Có bản mới v${remote}`, [c.gray(`Đang dùng v${VERSION}`)]);
  console.log();
  if (IS_BUNDLE) return updateBundle(remote);
  const t = tasks(["Tải bản mới", "Giải nén", "Cài đặt"]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "scc-up-"));
  let step = 0;
  try {
    t.run(0, c.gray("đang tải…"));
    const r = await fetch(TARBALL, { redirect: "follow", signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const tgz = path.join(tmp, "src.tgz");
    fs.writeFileSync(tgz, buf);
    t.done(0, c.gray(fmtBytes(buf.length)));

    step = 1; t.run(1);
    const x = spawnSync("tar", ["-xzf", tgz, "-C", tmp]);
    if (x.status !== 0) throw new Error("không giải nén được (cần lệnh tar: pkg install tar)");
    const root = fs.readdirSync(tmp, { withFileTypes: true }).find((e) => e.isDirectory());
    if (!root) throw new Error("gói tải về không hợp lệ");
    const src = path.join(tmp, root.name);
    for (const f of ["bin/cli.mjs", "src/strip.mjs", "src/ui.mjs", "src/highlight.mjs", "src/diff.mjs"]) {
      const chk = spawnSync(process.execPath, ["--check", path.join(src, f)]);
      if (chk.status !== 0) throw new Error(`${f} bị lỗi cú pháp, đã hủy cập nhật`);
    }
    t.done(1, c.gray("hợp lệ"));

    step = 2; t.run(2);
    for (const part of ["bin", "src", "package.json", "README.md", "LICENSE"]) {
      const from = path.join(src, part);
      if (fs.existsSync(from)) fs.cpSync(from, path.join(INSTALL_DIR, part), { recursive: true, force: true });
    }
    try { fs.chmodSync(path.join(INSTALL_DIR, "bin", "cli.mjs"), 0o755); } catch { /* bỏ qua */ }
    t.done(2, c.gray(shortPath(INSTALL_DIR)));
    t.stop();
    console.log();
    callout("ok", `Đã cập nhật lên v${remote}`, [c.gray("Chạy lại scc để dùng bản mới.")]);
  } catch (e) {
    t.fail(step, c.red(e.message));
    t.stop();
    console.log();
    fail("Cập nhật không thành công", e.message, "Có thể cài lại bằng lệnh install.sh trong README");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function screenSettings(cfg) {
  let start = 1;
  while (true) {
    clear(); header(["Cài đặt"]); console.log();
    const onoff = (b) => (b ? c.green("BẬT") : c.gray("TẮT"));
    const res = await menu({
      start,
      items: [
        { heading: true, label: "XỬ LÝ" },
        { label: "Giữ comment bản quyền", hint: onoff(cfg.keepLicense), desc: "Giữ /*! … */, @license, @preserve", value: "keep" },
        { label: "Xóa mọi dòng trống", hint: onoff(cfg.removeBlankLines), desc: "Làm gọn tối đa, không còn dòng trống nào", value: "blank" },
        { label: "Bỏ qua file lớn hơn", hint: accent(cfg.maxMB ? `${cfg.maxMB} MB` : "Không giới hạn"), desc: "Giữ máy yếu khỏi bị treo vì file khổng lồ", value: "max" },
        { heading: true, label: "XUẤT FILE" },
        { label: "Chế độ xuất", hint: accent(MODE_LABEL[cfg.output]), desc: "Enter để đổi: file mới → ghi đè → thư mục stripped", value: "mode" },
        { label: "Tạo backup .bak khi ghi đè", hint: onoff(cfg.backup), desc: "Chỉ có tác dụng ở chế độ ghi đè", value: "backup" },
        { heading: true, label: "THÔNG BÁO & GIAO DIỆN" },
        { label: "Thông báo khi xong", hint: onoff(cfg.notify), desc: "Rung và báo khi tác vụ chạy trên 3 giây (cần Termux:API)", value: "notify" },
        { label: `${ic("theme")} Giao diện màu`, hint: accent((THEMES[cfg.theme] || THEMES.aurora).name), desc: "Enter để đổi giữa các bảng màu", value: "theme" },
        { label: `${ic("icons")} Biểu tượng`, hint: accent(cfg.icons === "plain" ? "Đơn giản" : "Emoji"), desc: "Chọn Đơn giản nếu emoji bị lệch hoặc hiện ô vuông", value: "icons" },
        { label: "← Quay lại", value: "back", sticky: true },
      ],
    });
    if (!res || res.item.value === "back") return;
    start = res.index;
    const v = res.item.value;
    if (v === "keep") cfg.keepLicense = !cfg.keepLicense;
    if (v === "blank") cfg.removeBlankLines = !cfg.removeBlankLines;
    if (v === "backup") cfg.backup = !cfg.backup;
    if (v === "notify") cfg.notify = !cfg.notify;
    if (v === "max") cfg.maxMB = MAXMB_STEPS[(MAXMB_STEPS.indexOf(cfg.maxMB) + 1) % MAXMB_STEPS.length];
    if (v === "mode") cfg.output = MODES[(MODES.indexOf(cfg.output) + 1) % MODES.length];
    if (v === "theme") cfg.theme = THEME_KEYS[(THEME_KEYS.indexOf(cfg.theme) + 1) % THEME_KEYS.length];
    if (v === "icons") cfg.icons = cfg.icons === "plain" ? "emoji" : "plain";
    applyConfig(cfg);
    saveConfig(cfg);
  }
}

async function screenHelp() {
  clear(); header(["Trợ giúp"]); console.log();
  printBox(
    [
      `${chip("↑ ↓")} hoặc ${chip("j k")}   di chuyển`,
      `${chip("space")}           chọn nhiều file`,
      `${chip("⏎")}               xác nhận`,
      `${chip("/")}               lọc danh sách dài`,
      `${chip("?")}               xem phím tắt trong menu`,
      `${chip("esc")} hoặc ${chip("q")}    quay lại, thoát, hủy tác vụ`,
      `${chip("ctrl+c")}          thoát ngay`,
    ],
    { title: "Phím tắt" }
  );
  console.log();
  printBox(
    [
      "scc file.js                  in ra màn hình",
      "scc file.js -o out.js        ghi ra file",
      "scc src/ --out-dir           cả thư mục",
      "scc src/ --dry-run           chạy thử",
      "scc a.css --overwrite        ghi đè (.bak)",
      "scc https://x.com/app.js     tải từ URL",
      "scc --doctor                 kiểm tra môi trường",
      "scc --update                 cập nhật từ GitHub",
      c.gray("--lang  --keep-license  --no-blank  --max-mb N"),
    ],
    { title: "Dòng lệnh" }
  );
  console.log();
  console.log(c.gray(truncate("Lưu ý: công cụ đọc từng ký tự, tôn trọng chuỗi, template literal và regex. Với code quan trọng hãy tạo file mới hoặc bật backup.", cols() - 1)));
  await pause();
}

async function interactive() {
  if (!process.stdin.isTTY) {
    console.error("Chế độ menu cần chạy trong terminal tương tác. Dùng --help để xem cách dùng khác.");
    process.exit(1);
  }
  const cfg = loadConfig();
  applyConfig(cfg);
  setTitle("Strip Comments");
  process.on("exit", () => setTitle(""));
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
  let start = 1, first = true;
  while (true) {
    clear();
    if (first) { first = false; await splash(); clear(); }
    mainHeader(cfg, tip);
    const all = [
      { heading: true, label: "XỬ LÝ" },
      { label: `${ic("file")} Chọn file để xóa comment`, desc: "Duyệt thư mục, chọn một hoặc nhiều file", value: "files" },
      { label: `${ic("all")} Xử lý cả thư mục`, desc: "Đệ quy mọi file JS, CSS, HTML trong thư mục", value: "folder" },
      { label: `${ic("paste")} Dán code trực tiếp`, desc: "Dán code vào terminal rồi xử lý ngay", value: "paste" },
      { label: `${ic("url")} Tải code từ URL`, desc: "Tải file từ link, có tiến trình và ETA", value: "url" },
      { heading: true, label: "CÔNG CỤ" },
      { label: `${ic("restore")} Khôi phục từ backup`, desc: "Hoàn tác các file đã ghi đè (.bak)", value: "restore" },
      { label: `${ic("stats")} Lịch sử & thống kê`, desc: "Tổng dung lượng và comment đã dọn", value: "history" },
      { label: `${ic("doctor")} Kiểm tra môi trường`, desc: "Node, Termux:API, quyền bộ nhớ, RAM, mạng", value: "doctor" },
      { heading: true, label: "KHÁC" },
      { label: `${ic("settings")} Cài đặt`, desc: "Bản quyền, xuất, file lớn, thông báo, giao diện", value: "settings" },
      { label: `${ic("help")} Hướng dẫn & phím tắt`, desc: "Phím tắt và cách dùng dòng lệnh", value: "help" },
      { label: `${ic("update")} Cập nhật`, desc: "Kiểm tra và cài bản mới từ GitHub", value: "update" },
      { label: `${ic("exit")} Thoát`, value: "exit" },
    ];
    const items = isCompact() ? all.filter((i) => !i.heading) : all;
    const res = await menu({
      start: isCompact() ? Math.max(0, start - 1) : start,
      reserve: isCompact() ? 4 : isFull() ? 13 : 10,
      items,
    });
    if (!res || res.item.value === "exit") { console.log(gradText("Hẹn gặp lại 👋")); return; }
    start = items.indexOf(res.item) + (isCompact() ? 1 : 0);
    const v = res.item.value;
    if (v === "files") await screenFiles(cfg);
    else if (v === "folder") await screenFolder(cfg);
    else if (v === "paste") await screenPaste(cfg);
    else if (v === "url") await screenUrl(cfg);
    else if (v === "restore") await screenRestore(cfg);
    else if (v === "history") await screenHistory();
    else if (v === "doctor") { clear(); header(["Kiểm tra môi trường"]); await doctor(); await pause(); }
    else if (v === "settings") await screenSettings(cfg);
    else if (v === "help") await screenHelp();
    else if (v === "update") { clear(); header(["Cập nhật"]); console.log(); await selfUpdate(); await pause(); }
  }
}

/* ───────────── chế độ dòng lệnh ───────────── */
async function runArgs(args) {
  // CLI không đọc chế độ xuất đã lưu trong menu, tránh ghi đè file ngoài ý muốn
  const cfg = { ...loadConfig(), output: "suffix" };
  const targets = [];
  let outFile = null, lang, dry = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-o" || a === "--out") outFile = args[++i];
    else if (a === "--out-dir") cfg.output = "dir";
    else if (a === "--overwrite") cfg.output = "overwrite";
    else if (a === "--lang") lang = args[++i];
    else if (a === "--keep-license") cfg.keepLicense = true;
    else if (a === "--no-blank") cfg.removeBlankLines = true;
    else if (a === "--no-backup") cfg.backup = false;
    else if (a === "--dry-run") dry = true;
    else if (a === "--max-mb") cfg.maxMB = Number(args[++i]) || 0;
    else if (a === "--doctor") { applyConfig(cfg); return doctor({ interactive: false }); }
    else if (a === "--update") { applyConfig(cfg); return selfUpdate({ interactive: false }); }
    else if (a === "-v" || a === "--version") return console.log(VERSION);
    else if (a === "-h" || a === "--help") return screenHelpPlain();
    else if (a === "-i" || a === "--interactive") return interactive();
    else targets.push(a);
  }
  applyConfig(cfg);
  if (!targets.length) {
    console.error("Thiếu file hoặc thư mục đầu vào. Dùng --help để xem hướng dẫn.");
    process.exit(1);
  }

  const isUrl = (t) => /^https?:\/\//i.test(t);
  if (targets.some(isUrl)) {
    for (const t of targets) {
      let res;
      if (isUrl(t)) {
        let d;
        try { d = await loadUrl(t); } catch (e) { console.error(`${t}: ${e.message}`); process.exit(1); }
        res = stripComments(d.text, { language: lang || d.lang, filename: d.name, keepLicense: cfg.keepLicense, removeBlankLines: cfg.removeBlankLines });
      } else {
        res = stripComments(fs.readFileSync(t, "utf8"), { filename: t, language: lang, keepLicense: cfg.keepLicense, removeBlankLines: cfg.removeBlankLines });
      }
      if (outFile && targets.length === 1) fs.writeFileSync(outFile, res);
      else process.stdout.write(res);
    }
    return;
  }
  for (const t of targets) {
    if (!fs.existsSync(t)) { console.error(`Không tìm thấy: ${t}`); process.exit(1); }
  }

  const single = targets.length === 1 && fs.statSync(targets[0]).isFile();
  if (single && !dry && cfg.output !== "overwrite" && cfg.output !== "dir") {
    const res = stripComments(fs.readFileSync(targets[0], "utf8"), {
      filename: targets[0], language: lang,
      keepLicense: cfg.keepLicense, removeBlankLines: cfg.removeBlankLines,
    });
    if (outFile) fs.writeFileSync(outFile, res);
    else process.stdout.write(res);
    return;
  }

  const files = targets.flatMap((t) => (fs.statSync(t).isDirectory() ? walk(t) : [t]));
  const root = fs.statSync(targets[0]).isDirectory() ? targets[0] : path.dirname(targets[0]);
  const t0 = Date.now();
  const list = await processFiles(files, root, cfg, { dry });
  const sum = await report(list, { dry, elapsed: Date.now() - t0, cfg });
  if (!dry && sum.ok) recordRun(sum, cfg);
}

function screenHelpPlain() {
  console.log(`Strip Comments v${VERSION}

Chạy không tham số để mở menu tương tác.

  scc <file|thư mục|URL>... [tuỳ chọn]
    -o, --out <file>     ghi kết quả ra file (chỉ với 1 file)
    --out-dir            xuất ra ./stripped
    --overwrite          ghi đè file gốc (tạo .bak, tắt bằng --no-backup)
    --dry-run            chạy thử, không ghi file nào
    --max-mb <n>         bỏ qua file lớn hơn n MB (0 = không giới hạn)
    --lang <js|css|scss|html>
    --keep-license       giữ /*! và @license
    --no-blank           xóa mọi dòng trống
    --doctor             kiểm tra môi trường
    --update             cập nhật bản mới từ GitHub
    -i, --interactive    mở menu
    -v, --version`);
}

const args = process.argv.slice(2);
if (args.length) await runArgs(args);
else await interactive();