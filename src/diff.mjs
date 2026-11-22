// So sánh từng dòng giữa code gốc và code đã xóa comment (kiểu git diff).
import { stripComments } from "./strip.mjs";
import { useColor, vlen } from "./ui.mjs";

// LCS theo dòng, dùng cho đoạn đầu của file (đủ để xem trước các thay đổi)
export function lineDiffOps(a, b) {
  const n = a.length, m = b.length, w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push(["=", i, j]); i++; j++; }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { ops.push(["-", i]); i++; }
    else { ops.push(["+", j]); j++; }
  }
  while (i < n) ops.push(["-", i++]);
  while (j < m) ops.push(["+", j++]);
  return ops;
}

export function buildDiff(src, opts, { maxLines = 500, context = 2 } = {}) {
  const all = src.split("\n");
  const truncated = all.length > maxLines;
  const aLines = truncated ? all.slice(0, maxLines) : all;
  const bLines = stripComments(aLines.join("\n"), opts).split("\n");
  const ops = lineDiffOps(aLines, bLines);

  // giữ lại dòng không đổi nằm gần chỗ thay đổi
  const near = new Array(ops.length).fill(false);
  let lastChange = -Infinity;
  for (let k = 0; k < ops.length; k++) {
    if (ops[k][0] !== "=") lastChange = k;
    if (k - lastChange <= context) near[k] = true;
  }
  lastChange = Infinity;
  for (let k = ops.length - 1; k >= 0; k--) {
    if (ops[k][0] !== "=") lastChange = k;
    if (lastChange - k <= context) near[k] = true;
  }

  const rows = [];
  let removed = 0, modified = 0, skipped = 0;
  const flushSkip = () => { if (skipped) { rows.push({ k: "sep", skipped }); skipped = 0; } };
  for (let k = 0; k < ops.length;) {
    const [t] = ops[k];
    if (t === "=") {
      if (near[k]) { flushSkip(); rows.push({ k: "=", n: ops[k][1] + 1, text: aLines[ops[k][1]] }); }
      else skipped++;
      k++;
      continue;
    }
    flushSkip();
    const dels = [], adds = [];
    while (k < ops.length && ops[k][0] === "-") dels.push(ops[k++][1]);
    while (k < ops.length && ops[k][0] === "+") adds.push(ops[k++][1]);
    const tails = dels.map((di, idx) => {
      if (idx >= adds.length) return -1;
      const o = aLines[di], nw = bLines[adds[idx]].replace(/\s+$/, "");
      return nw && o.startsWith(nw) && o.length > nw.length ? nw.length : -1;
    });
    dels.forEach((di, idx) => rows.push({ k: "-", n: di + 1, text: aLines[di], tail: tails[idx] }));
    adds.forEach((ai) => rows.push({ k: "+", n: ai + 1, text: bLines[ai] }));
    modified += Math.min(dels.length, adds.length);
    removed += Math.max(0, dels.length - adds.length);
  }
  flushSkip();
  const gw = String(Math.max(aLines.length, bLines.length)).length;
  return { rows, removed, modified, truncated, maxLines, gw };
}

const BG_DEL = [64, 26, 30], BG_ADD = [22, 58, 36];
const fgbg = (bg, fg) => `\x1b[48;2;${bg.join(";")}m\x1b[38;2;${fg.join(";")}m`;
const clip = (s, w) => { const a = [...s]; return a.length > w ? a.slice(0, Math.max(0, w - 1)).join("") + "…" : s; };

export function diffRowToString(row, hx, width, gw) {
  const W = Math.max(10, width);
  if (row.k === "sep") return `\x1b[90m  ⋯ ${row.skipped} dòng không đổi\x1b[0m`.replace(/\x1b\[[0-9;]*m/g, (m) => (useColor ? m : ""));
  const num = String(row.n).padStart(gw);
  const avail = Math.max(4, W - gw - 4);
  const text = row.text.replace(/\t/g, "  ");
  const body = hx ? text.slice(hx) : text;
  if (!useColor) return `${num} ${row.k === "=" ? " " : row.k} ${clip(body, avail)}`;
  if (row.k === "=") return `\x1b[90m${num}   ${clip(body, avail)}\x1b[0m`;
  const sign = row.k;
  const bg = row.k === "-" ? BG_DEL : BG_ADD;
  const fg = row.k === "-" ? [236, 170, 170] : [165, 236, 185];
  const hot = row.k === "-" ? [255, 120, 120] : fg;
  let content;
  if (row.k === "-" && row.tail >= 0) {
    const split = Math.max(0, row.tail - hx);
    const head = clip(body.slice(0, split), avail);
    const tail = clip(body.slice(split), Math.max(0, avail - vlen(head)));
    content = `${head}\x1b[1m\x1b[38;2;${hot.join(";")}m${tail}\x1b[22m\x1b[38;2;${fg.join(";")}m`;
  } else {
    content = clip(body, avail);
  }
  const used = gw + 3 + vlen(content);
  return `${fgbg(bg, fg)}${num} ${sign} ${content}${" ".repeat(Math.max(0, W - used))}\x1b[0m`;
}