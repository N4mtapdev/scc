// Thư viện giao diện terminal dùng chung: màu, khung, bảng, tác vụ, menu...
// Không phụ thuộc gói ngoài.
import readline from "node:readline";

// Phím Esc phản hồi gần như tức thì (mặc định Node chờ 500ms để phân biệt với mũi tên)
readline.emitKeypressEvents(process.stdin, { escapeCodeTimeout: 80 });

/* ───────────── màu & chủ đề ───────────── */
export const useColor = !!(process.stdout.isTTY && !process.env.NO_COLOR);
const sgr = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const fgRgb = (rgb) => (s) => (useColor ? `\x1b[38;2;${rgb.join(";")}m${s}\x1b[0m` : String(s));
const bgFg = (bg, fg, bold = true) => (s) =>
  useColor ? `\x1b[48;2;${bg.join(";")}m\x1b[38;2;${fg.join(";")}m${bold ? "\x1b[1m" : ""}${s}\x1b[0m` : String(s);

const TONE = {
  ok: [74, 222, 128], warn: [251, 191, 36], err: [248, 113, 113],
  info: [96, 165, 250], mute: [148, 163, 184],
};
export const c = {
  bold: sgr("1"), dim: sgr("2"), italic: sgr("3"),
  green: fgRgb(TONE.ok), yellow: fgRgb(TONE.warn), red: fgRgb(TONE.err),
  cyan: fgRgb(TONE.info), gray: sgr("90"),
};
export const sym = {
  ok: c.green("✔"), warn: c.yellow("▲"), err: c.red("✖"), info: c.cyan("●"),
};

export const THEMES = {
  aurora: { name: "Aurora (xanh → tím)", from: [96, 165, 250], to: [217, 120, 255] },
  forest: { name: "Forest (lục → lam)", from: [74, 222, 128], to: [34, 211, 238] },
  sunset: { name: "Sunset (vàng → hồng)", from: [251, 191, 36], to: [244, 63, 94] },
  ocean: { name: "Ocean (lam → chàm)", from: [56, 189, 248], to: [129, 140, 248] },
  rose: { name: "Rose (hồng → cam)", from: [244, 114, 182], to: [251, 146, 60] },
  mono: { name: "Mono (xám → trắng)", from: [140, 150, 165], to: [235, 238, 245] },
};
export const THEME_KEYS = Object.keys(THEMES);
let theme = THEMES.aurora;
export const setTheme = (key) => { theme = THEMES[key] || THEMES.aurora; };

const ICONS = {
  file: ["📄", "▪"], dir: ["📁", "▸"], all: ["📂", "◈"], paste: ["📋", "✎"],
  url: ["🌐", "↗"], settings: ["🔧", "≡"], help: ["💡", "?"], exit: ["🚪", "×"],
  copy: ["📋", "»"], save: ["💾", "▣"], theme: ["🎨", "◐"], icons: ["🔣", "◇"],
  restore: ["🔙", "↺"], update: ["🆕", "↑"], stats: ["📊", "▤"], doctor: ["🩺", "+"], star: ["⭐", "*"],
  share: ["📤", "↑"], dry: ["👁", "○"], run: ["▶", "▶"], eye: ["👁", "◉"], diff: ["🔍", "±"],
};
let iconMode = 0;
export const setIcons = (mode) => { iconMode = mode === "plain" ? 1 : 0; };
export const ic = (k) => ICONS[k][iconMode];

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
export const clamp01 = (f) => Math.max(0, Math.min(1, f));
export const gradColor = (t) => theme.from.map((v, i) => lerp(v, theme.to[i], clamp01(t)));
export const accent = (s) => fgRgb(gradColor(0.5))(s);
export const gradText = (text, offset = 0) => {
  const chars = [...text];
  return chars
    .map((ch, i) => fgRgb(gradColor(offset + (chars.length > 1 ? (i / (chars.length - 1)) * 0.8 : 0)))(ch))
    .join("");
};
export const selBg = (s) => {
  if (!useColor) return s;
  const chars = [...s];
  const last = Math.max(1, chars.length - 1);
  return chars
    .map((ch, i) => `\x1b[48;2;${gradColor(0.1 + 0.55 * (i / last)).join(";")}m\x1b[38;2;12;12;24m\x1b[1m${ch}`)
    .join("") + "\x1b[0m";
};

/* ───────────── đo độ rộng, cắt chuỗi ───────────── */
const ANSI_G = /\x1b\[[0-9;?]*[A-Za-z]/g;
const ANSI_Y = /\x1b\[[0-9;?]*[A-Za-z]/y;
export const plain = (s) => String(s).replace(ANSI_G, "");
const cw = (ch) => {
  const cp = ch.codePointAt(0);
  if (cp === 0xfe0f || cp === 0x200d) return 0;
  if (cp >= 0x1f000 || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xff00 && cp <= 0xff60)) return 2;
  return 1;
};
export const vlen = (s) => { let n = 0; for (const ch of plain(s)) n += cw(ch); return n; };
export const pad = (s, n) => s + " ".repeat(Math.max(0, n - vlen(s)));
export const padL = (s, n) => " ".repeat(Math.max(0, n - vlen(s))) + s;
export const cols = () => Math.max(30, process.stdout.columns || 80);
export const termRows = () => process.stdout.rows || 24;
export const clear = () => process.stdout.write("\x1b[2J\x1b[H");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const setTitle = (t) => { if (process.stdout.isTTY) process.stdout.write(`\x1b]0;${t}\x07`); };

export function truncate(s, max) {
  if (vlen(s) <= max) return s;
  let out = "", w = 0, i = 0;
  while (i < s.length) {
    ANSI_Y.lastIndex = i;
    const m = ANSI_Y.exec(s);
    if (m) { out += m[0]; i += m[0].length; continue; }
    const ch = String.fromCodePoint(s.codePointAt(i));
    if (w + cw(ch) > max - 1) break;
    out += ch; w += cw(ch); i += ch.length;
  }
  return out + "…" + (useColor ? "\x1b[0m" : "");
}
export const tailTrunc = (s, w) => (vlen(s) <= w ? s : "…" + [...s].slice(-(w - 1)).join(""));

/* ───────────── định dạng số liệu ───────────── */
export const fmtBytes = (n) =>
  n < 1024 ? `${Math.round(n)} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`;
export function fmtDur(ms) {
  if (ms < 950) return "<1s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}p ${String(s % 60).padStart(2, "0")}s`;
}
export const fmtDate = (t) => {
  const d = new Date(t), p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* ───────────── thanh, huy hiệu, phím ───────────── */
const PARTS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];
function barWith(f, w, colorAt) {
  const total = clamp01(f) * w;
  let full = Math.floor(total + 1e-9);
  let eighth = Math.round((total - full) * 8);
  if (eighth === 8) { full++; eighth = 0; }
  if (iconMode !== 0) { full = Math.round(total); eighth = 0; }
  let out = "";
  for (let i = 0; i < full; i++) out += colorAt(i)("█");
  let used = full;
  if (eighth > 0) { out += colorAt(full)(PARTS[eighth]); used++; }
  return out + c.gray("░".repeat(Math.max(0, w - used)));
}
export const bar = (f, w = 12) => barWith(f, w, (i) => fgRgb(gradColor(w > 1 ? i / (w - 1) : 0)));
const savRgb = (f) => (f >= 0.3 ? TONE.ok : f >= 0.1 ? TONE.warn : TONE.mute);
export const savBar = (f, w = 8) => barWith(f, w, () => fgRgb(savRgb(f)));
export const savText = (f, t) => fgRgb(savRgb(f))(t);

const SPARK = "▁▂▃▄▅▆▇█";
export function spark(values, width = values.length) {
  const v = values.slice(-width);
  if (!v.length) return "";
  const min = Math.min(...v, 0), max = Math.max(...v);
  return v
    .map((x, i) => fgRgb(gradColor(v.length > 1 ? i / (v.length - 1) : 0))(SPARK[Math.min(7, Math.round(((x - min) / (max - min || 1)) * 7))]))
    .join("");
}
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

const EXT_RGB = {
  ".js": [247, 223, 30], ".mjs": [247, 223, 30], ".cjs": [247, 223, 30],
  ".ts": [78, 154, 235], ".tsx": [78, 154, 235], ".jsx": [97, 218, 251],
  ".css": [66, 165, 245], ".scss": [236, 64, 122], ".less": [120, 144, 200],
  ".html": [255, 138, 61], ".htm": [255, 138, 61], ".vue": [66, 211, 146], ".svelte": [255, 94, 40],
};
export const extPaint = (name) => {
  const m = /\.[^./\\]+$/.exec(name);
  const rgb = m && EXT_RGB[m[0].toLowerCase()];
  return rgb ? fgRgb(rgb)(name) : name;
};

export const chip = (t) => (useColor ? bgFg([55, 60, 75], [225, 230, 240], false)(` ${t} `) : `[${t}]`);
export const badge = (t, kind = "info") => {
  const bg = kind === "ok" ? TONE.ok : kind === "warn" ? TONE.warn : kind === "err" ? TONE.err : kind === "mute" ? TONE.mute : gradColor(0.4);
  return useColor ? bgFg(bg, [15, 15, 25])(` ${t} `) : `[${t}]`;
};

export function keybar(pairs, right = "", width = cols() - 1) {
  const build = (ps) => ps.map(([k, l]) => `${chip(k)} ${c.gray(l)}`).join("  ");
  const r = right ? c.gray(right) : "";
  const ps = [...pairs];
  while (ps.length > 1 && vlen(build(ps)) + (r ? vlen(r) + 2 : 0) > width) ps.pop();
  const left = build(ps);
  const gap = Math.max(1, width - vlen(left) - vlen(r));
  return truncate(left + (r ? " ".repeat(gap) + r : ""), width);
}

export const kv = (pairs, labelW) => {
  const w = labelW ?? Math.max(...pairs.map(([k]) => vlen(k)));
  return pairs.map(([k, v]) => `${c.gray(pad(k, w))}  ${v}`);
};

/* ───────────── khung, tiêu đề, callout, bảng ───────────── */
export function printBox(lines, { title = "" } = {}) {
  const inner = Math.min(cols() - 5, 68);
  const total = inner + 4;
  const g = (ch, x) => fgRgb(gradColor(x / Math.max(1, total - 1)))(ch);
  const tw = title ? vlen(title) + 2 : 0;
  let top = g("╭", 0) + g("─", 1) + (title ? " " + c.bold(title) + " " : "");
  const startX = 2 + tw;
  for (let k = 0; k < inner + 1 - tw; k++) top += g("─", startX + k);
  console.log(top + g("╮", total - 1));
  for (const l of lines) console.log(g("│", 0) + " " + pad(truncate(l, inner), inner) + " " + g("│", total - 1));
  let bottom = g("╰", 0);
  for (let k = 1; k <= inner + 2; k++) bottom += g("─", k);
  console.log(bottom + g("╯", total - 1));
}

export function header(parts = []) {
  const crumbs = parts.map((p, i) => (i === parts.length - 1 ? c.bold(p) : c.gray(p))).join(c.gray(" › "));
  console.log("\n" + truncate(`${accent("▌")}${gradText(" Strip Comments")}${parts.length ? c.gray("  ›  ") + crumbs : ""}`, cols() - 1));
  console.log(c.gray("─".repeat(Math.min(cols() - 1, 64))));
}

export function callout(kind, title, lines = [], { overwrite = false } = {}) {
  const col = { ok: c.green, warn: c.yellow, err: c.red, info: c.cyan }[kind] || c.cyan;
  const side = col("▌");
  const pre = overwrite ? "\x1b[2K" : "";
  console.log(pre + truncate(`${side} ${sym[kind] || sym.info} ${c.bold(title)}`, cols() - 1));
  for (const l of lines) console.log(pre + truncate(`${side}   ${l}`, cols() - 1));
}

// Hiện hộp thông báo với số liệu chạy dần từ 0 đến giá trị cuối (mk(p) trả về các dòng, p từ 0 đến 1)
export async function animatedCallout(kind, title, mk, { frames = 12, ms = 32 } = {}) {
  if (!process.stdout.isTTY || process.env.SCC_NO_ANIM) { callout(kind, title, mk(1)); return; }
  const n = 1 + mk(1).length;
  for (let f = 0; f <= frames; f++) {
    if (f > 0) process.stdout.write(`\x1b[${n}A\r`);
    callout(kind, title, mk(easeOut(f / frames)), { overwrite: true });
    if (f < frames) await sleep(ms);
  }
}

export function table(head, rowsData, { align = [], firstPaint = (s) => s, max = Math.min(cols() - 2, 78) } = {}) {
  const n = head.length;
  const w = head.map((h, i) => Math.max(vlen(h), ...rowsData.map((r) => vlen(r[i] ?? ""))));
  const gap = 2;
  const over = 1 + w.reduce((a, b) => a + b, 0) + gap * (n - 1) - max;
  if (over > 0) w[0] = Math.max(8, w[0] - over);
  const fit = (s, i) => (i === 0 ? tailTrunc(String(s), w[0]) : truncate(String(s), w[i]));
  const cell = (s, i, paint) => {
    let t = fit(s, i);
    if (paint && i === 0) t = firstPaint(t);
    return align[i] === "r" ? padL(t, w[i]) : pad(t, w[i]);
  };
  const total = w.reduce((a, b) => a + b, 0) + gap * (n - 1);
  console.log(c.gray(" " + head.map((h, i) => cell(h, i, false)).join(" ".repeat(gap))));
  console.log(c.gray(" " + "─".repeat(total)));
  for (const r of rowsData) console.log(truncate(" " + head.map((_, i) => cell(r[i] ?? "", i, true)).join(" ".repeat(gap)), cols() - 1));
}

/* ───────────── spinner & danh sách tác vụ ───────────── */
const FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
const spinFrame = (i) => fgRgb(gradColor((Math.sin(i / 5) + 1) / 2))(FRAMES[i % FRAMES.length]);

export function spinner(text) {
  if (!process.stdout.isTTY) return { stop(msg) { if (msg) console.log(msg); } };
  let i = 0;
  const t0 = Date.now();
  process.stdout.write("\x1b[?25l");
  const t = setInterval(() => {
    const el = (Date.now() - t0) / 1000;
    process.stdout.write(`\r\x1b[2K${truncate(`${spinFrame(i++)} ${text} ${c.gray(el.toFixed(1) + "s")}`, cols() - 1)}`);
  }, 120);
  return {
    stop(msg) {
      clearInterval(t);
      process.stdout.write("\r\x1b[2K\x1b[?25h");
      if (msg) console.log(msg);
    },
  };
}

export function tasks(labels) {
  const out = process.stdout;
  const live = !!out.isTTY;
  const items = labels.map((label) => ({ label, st: "pending", detail: "" }));
  const lw = Math.max(...labels.map(vlen));
  let frame = 0, timer = null, lastLines = 0;
  const icon = (st) =>
    st === "done" ? c.green("✔") : st === "warn" ? c.yellow("▲") : st === "fail" ? c.red("✖")
    : st === "run" ? spinFrame(frame) : c.gray("○");
  const lines = () =>
    items.map((it) =>
      truncate(` ${icon(it.st)} ${it.st === "pending" ? c.gray(pad(it.label, lw)) : c.bold(pad(it.label, lw))}  ${it.detail}`, cols() - 1)
    );
  const draw = () => {
    if (!live) return;
    const L = lines();
    if (lastLines) out.write(`\x1b[${lastLines}A\r\x1b[0J`);
    out.write(L.join("\n") + "\n");
    lastLines = L.length;
  };
  const set = (i, st, detail) => {
    items[i].st = st;
    if (detail !== undefined) items[i].detail = detail;
    if (st === "run" && live && !timer) {
      out.write("\x1b[?25l");
      timer = setInterval(() => { frame++; draw(); }, 100);
    }
    if (!live && st !== "run") console.log(`${plain(icon(st))} ${items[i].label} ${plain(items[i].detail)}`);
    draw();
  };
  return {
    run: (i, d) => set(i, "run", d),
    update: (i, d) => { items[i].detail = d; },
    done: (i, d) => set(i, "done", d),
    warn: (i, d) => set(i, "warn", d),
    fail: (i, d) => set(i, "fail", d),
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      draw();
      if (live) out.write("\x1b[?25h");
    },
  };
}

/* ───────────── nhập liệu: menu, hỏi, xác nhận ───────────── */
export function menu({ title, items, selected = null, start = 0, keys, reserve = 0 }) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const out = process.stdout;
    const hasDesc = items.some((i) => i.desc);
    const navCount = items.filter((i) => !i.heading).length;
    let query = "", filtering = false, showHelp = false;
    let vis = items.slice();
    let top = 0, lastLines = 0;

    // Lọc không phân biệt hoa thường và dấu tiếng Việt (gõ "thu" vẫn thấy "thư mục")
    const fold = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
    const recompute = () => {
      const q = fold(query);
      vis = q ? items.filter((it) => it.sticky || (!it.heading && fold(plain(it.label)).includes(q))) : items.slice();
    };
    const firstNav = (from, dir) => {
      for (let k = 0; k < vis.length; k++) {
        const j = (from + dir * k + vis.length * 2) % vis.length;
        if (!vis[j].heading) return j;
      }
      return 0;
    };
    const step = (d) => {
      if (!vis.length) return;
      let j = vis.length > 0 ? idx : 0;
      for (let k = 0; k < vis.length; k++) {
        j = (j + d + vis.length) % vis.length;
        if (!vis[j].heading) { idx = j; return; }
      }
    };
    let idx = firstNav(Math.max(0, vis.indexOf(items[Math.min(start, items.length - 1)])), 1);

    readline.emitKeypressEvents(stdin);
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    out.write("\x1b[?25l");

    const keyPairs = () => {
      if (keys) return keys;
      const p = [["↑↓", "chọn"]];
      if (selected) p.push(["space", "tick"]);
      p.push(["⏎", "xác nhận"], ["esc", query || filtering ? "xóa lọc" : "quay lại"]);
      if (!filtering && navCount > 7) p.push(["/", "lọc"]);
      p.push(["?", "trợ giúp"]);
      return p;
    };

    const render = () => {
      const W = cols();
      const bw = Math.min(W - 2, 64);
      const lines = [];
      if (showHelp) {
        lines.push(c.bold("Phím tắt"));
        for (const [k, d] of [
          ["↑ ↓  j k", "di chuyển"], ["PgUp PgDn", "nhảy trang"], ["space", "chọn / bỏ chọn (nếu có)"],
          ["⏎", "xác nhận"], ["/", "lọc danh sách"], ["esc  q", "quay lại"], ["ctrl+c", "thoát ngay"],
        ]) lines.push(`  ${chip(k)} ${c.gray(d)}`);
        lines.push(c.gray("Nhấn ? hoặc Esc để đóng"));
      } else {
        const pg = Math.max(3, Math.min(vis.length || 1, termRows() - reserve - (3 + (hasDesc ? 1 : 0) + (title ? 1 : 0) + (query || filtering ? 1 : 0)), 16));
        if (idx < top) top = idx;
        if (idx >= top + pg) top = idx - pg + 1;
        top = Math.max(0, Math.min(top, Math.max(0, vis.length - pg)));
        if (title) lines.push(c.bold(title));
        if (query || filtering) {
          lines.push(`${accent("/")} ${query}${filtering ? accent("▌") : ""}  ${c.gray(`${vis.filter((i) => !i.heading).length} kết quả`)}`);
        }
        if (!vis.length) lines.push(c.gray("  Không có mục nào khớp"));
        for (let i = top; i < Math.min(vis.length, top + pg); i++) {
          const it = vis[i];
          if (it.heading) {
            const label = ` ${it.label} `;
            lines.push("  " + c.gray("──") + gradText(label) + c.gray("─".repeat(Math.max(2, Math.min(W - 2, 44) - 4 - vlen(label)))));
            continue;
          }
          const on = i === idx;
          const isSel = selected && it.selectable && selected.has(it.key);
          const mk = selected && it.selectable ? (isSel ? "◉ " : "○ ") : "";
          if (on) {
            const raw = ` ❯ ${mk}${plain(it.label)}${it.hint ? "  " + plain(it.hint) : ""}`;
            lines.push(selBg(pad(truncate(raw, bw), bw)));
          } else {
            const hn = it.hint ? "  " + (/\x1b/.test(it.hint) ? it.hint : c.gray(it.hint)) : "";
            lines.push(`   ${mk ? (isSel ? c.green(mk) : c.gray(mk)) : ""}${it.label}${hn}`);
          }
        }
        if (vis[idx] && vis[idx].desc) lines.push(c.gray(`  ╰ ${vis[idx].desc}`));
        const navVis = vis.filter((i) => !i.heading);
        const pos = navVis.indexOf(vis[idx]) + 1;
        const right = [selected && selected.size ? `${selected.size} đã chọn` : "", navVis.length > 1 && pos > 0 ? `${pos}/${navVis.length}` : ""]
          .filter(Boolean).join(" · ");
        lines.push(keybar(keyPairs(), right));
      }
      if (lastLines) out.write(`\x1b[${lastLines}A\r\x1b[0J`);
      out.write(lines.map((l) => truncate(l, W - 1)).join("\n") + "\n");
      lastLines = lines.length;
    };

    const finish = (val) => {
      stdin.off("keypress", onKey);
      out.off("resize", render);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      if (lastLines) out.write(`\x1b[${lastLines}A\r\x1b[0J`);
      out.write("\x1b[?25h");
      resolve(val);
    };
    const choose = () => {
      const it = vis[idx];
      if (it && !it.heading) finish({ item: it, index: items.indexOf(it) });
    };

    const onKey = (str, key) => {
      if (!key) return;
      if (key.ctrl && key.name === "c") { out.write("\x1b[?25h\n"); process.exit(0); }

      if (showHelp) {
        if (key.name === "escape" || key.name === "return" || str === "?" || key.name === "q") showHelp = false;
        return render();
      }
      if (filtering) {
        if (key.name === "escape") { query = ""; filtering = false; recompute(); idx = firstNav(0, 1); }
        else if (key.name === "return") { filtering = false; return choose(); }
        else if (key.name === "backspace") { query = [...query].slice(0, -1).join(""); recompute(); idx = firstNav(0, 1); }
        else if (key.name === "up") step(-1);
        else if (key.name === "down") step(1);
        else if (str && !key.ctrl && !key.meta && str.charCodeAt(0) >= 32) { query += str; recompute(); idx = firstNav(0, 1); }
        return render();
      }

      const n = vis.length;
      if (key.name === "up" || key.name === "k") step(-1);
      else if (key.name === "down" || key.name === "j") step(1);
      else if (key.name === "pageup") idx = firstNav(Math.max(0, idx - 8), 1);
      else if (key.name === "pagedown") idx = firstNav(Math.min(n - 1, idx + 8), -1);
      else if (key.name === "home") idx = firstNav(0, 1);
      else if (key.name === "end") idx = firstNav(n - 1, -1);
      else if (str === "/" && !keys) { filtering = true; }
      else if (str === "?") showHelp = true;
      else if (key.name === "space" && selected) {
        const it = vis[idx];
        if (it && it.selectable) selected.has(it.key) ? selected.delete(it.key) : selected.add(it.key);
      } else if (key.name === "return") return choose();
      else if (key.name === "escape" || key.name === "q") {
        if (query) { query = ""; recompute(); idx = firstNav(0, 1); }
        else return finish(null);
      }
      render();
    };

    stdin.on("keypress", onKey);
    out.on("resize", render);
    render();
  });
}

export function pause(msg = "Nhấn phím bất kỳ để quay lại menu…") {
  return new Promise((resolve) => {
    console.log("\n" + c.gray(msg));
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("keypress", (_s, key) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      if (key && key.ctrl && key.name === "c") process.exit(0);
      resolve();
    });
  });
}

export function ask(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); resolve(a.trim()); });
  });
}

export async function confirm(title, { danger = false, yes = "Có, tiếp tục", no = "Hủy" } = {}) {
  const res = await menu({
    title,
    items: [{ label: yes, value: true }, { label: no, value: false }],
    start: danger ? 1 : 0,
    keys: [["↑↓", "chọn"], ["⏎", "xác nhận"]],
  });
  return res?.item.value ?? false;
}

/* ───────────── trình xem cuộn (kiểu less) ───────────── */
export function pager({ title = "", total, getLine }) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const out = process.stdout;
    let top = 0, hx = 0, lastLines = 0;
    const height = () => Math.max(4, Math.min(total, termRows() - 4));
    const maxTop = () => Math.max(0, total - height());

    readline.emitKeypressEvents(stdin);
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    out.write("\x1b[?25l");

    const render = () => {
      const W = cols();
      const h = height();
      top = Math.max(0, Math.min(top, maxTop()));
      const lines = [];
      if (title) lines.push(truncate(title, W - 1));
      for (let i = top; i < top + h; i++) lines.push(truncate(getLine(i, hx), W - 1));
      lines.push(keybar([["↑↓", "cuộn"], ["PgUp/Dn", "trang"], ["←→", "ngang"], ["g/G", "đầu/cuối"], ["q", "đóng"]],
        `${top + 1}–${top + h}/${total}`));
      if (lastLines) out.write(`\x1b[${lastLines}A\r\x1b[0J`);
      out.write(lines.join("\n") + "\n");
      lastLines = lines.length;
    };
    const finish = () => {
      stdin.off("keypress", onKey);
      out.off("resize", render);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      if (lastLines) out.write(`\x1b[${lastLines}A\r\x1b[0J`);
      out.write("\x1b[?25h");
      resolve();
    };
    const onKey = (str, key) => {
      if (!key) return;
      if (key.ctrl && key.name === "c") { out.write("\x1b[?25h\n"); process.exit(0); }
      const page = Math.max(1, height() - 1);
      if (key.name === "up" || key.name === "k") top--;
      else if (key.name === "down" || key.name === "j") top++;
      else if (key.name === "pagedown" || key.name === "space" || key.name === "f") top += page;
      else if (key.name === "pageup" || key.name === "b") top -= page;
      else if (key.name === "home" || str === "g") top = 0;
      else if (key.name === "end" || str === "G") top = maxTop();
      else if (key.name === "left" || key.name === "h") hx = Math.max(0, hx - 10);
      else if (key.name === "right" || key.name === "l") hx += 10;
      else if (key.name === "escape" || key.name === "q" || key.name === "return") return finish();
      render();
    };
    stdin.on("keypress", onKey);
    out.on("resize", render);
    render();
  });
}