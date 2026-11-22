import { extname } from "node:path";

const KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete",
  "void", "throw", "case", "do", "else", "yield", "await",
]);

const isLicense = (c, o) =>
  o.keepLicense && (/^\/\*!/.test(c) || /@license|@preserve/.test(c));

function strip(s, o) {
  let i = 0;
  const n = s.length;

  // Kết quả được dựng theo từng dòng: `done` chứa các dòng đã hoàn tất,
  // `cur` là dòng đang viết. Trạng thái của dòng (ký tự cuối, có toàn khoảng
  // trắng không, bao nhiêu khoảng trắng ở cuối) được theo dõi bằng biến riêng,
  // nên không bao giờ phải đọc lại hay sao chép cả chuỗi lớn: thời gian chạy tuyến tính.
  function code(stopAtBrace) {
    const done = [];
    let cur = "", last = "", blank = true, trail = 0;
    let depth = 0, prev = "", word = "", inId = false;

    const track = (str) => {
      if (!str) return;
      last = str[str.length - 1];
      let t = 0;
      while (t < str.length && (str[str.length - 1 - t] === " " || str[str.length - 1 - t] === "\t")) t++;
      if (t === str.length) trail += t;
      else { trail = t; blank = false; }
    };
    const newLine = () => { cur = ""; last = ""; blank = true; trail = 0; };

    const emit = (str) => {
      let k = str.indexOf("\n");
      if (k < 0) { cur += str; track(str); return; }
      let from = 0;
      while (k >= 0) {
        done.push(cur + str.slice(from, k + 1));
        newLine();
        from = k + 1;
        k = str.indexOf("\n", from);
      }
      const rest = str.slice(from);
      cur += rest;
      track(rest);
    };
    const emitCh = (ch) => {
      if (ch === "\n") { done.push(cur + "\n"); newLine(); return; }
      cur += ch;
      last = ch;
      if (ch === " " || ch === "\t") trail++;
      else { trail = 0; blank = false; }
    };

    // Sau khi xóa một comment: nếu cả dòng chỉ có comment thì bỏ luôn dòng,
    // nếu comment nằm cuối dòng thì cắt khoảng trắng thừa phía trước.
    const eol = () => {
      let j = i;
      while (j < n && (s[j] === " " || s[j] === "\t" || s[j] === "\r")) j++;
      if (blank) {
        if (j >= n) { newLine(); return; }
        if (s[j] === "\n") { i = j + 1; newLine(); }
      } else if (j >= n || s[j] === "\n") {
        i = j;
        if (trail) {
          cur = cur.slice(0, cur.length - trail);
          trail = 0;
          last = cur.length ? cur[cur.length - 1] : "";
        }
      }
    };

    while (i < n) {
      const c = s[i], d = s[i + 1];

      // Đường nhanh: chạy qua các ký tự thường và nối cả đoạn một lần.
      if (c !== "/" && c !== '"' && c !== "'" && c !== "`" && c !== "{" && c !== "}" && c !== "\n") {
        let j = i;
        while (j < n) {
          const ch = s[j];
          if (ch === "/" || ch === '"' || ch === "'" || ch === "`" || ch === "{" || ch === "}" || ch === "\n") break;
          const cc = ch.charCodeAt(0);
          if (cc <= 32 || (cc > 127 && /\s/.test(ch))) { j++; continue; }
          if ((cc >= 48 && cc <= 57) || (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || cc === 95 || cc === 36) {
            word = inId ? word + ch : ch;
            inId = true;
            prev = "a";
          } else {
            word = ""; inId = false; prev = ch;
          }
          j++;
        }
        const chunk = s.slice(i, j);
        cur += chunk;
        track(chunk);
        i = j;
        continue;
      }

      if (o.line && c === "/" && d === "/" && !(o.urlGuard && (s[i - 1] === ":" || s[i - 1] === "("))) {
        while (i < n && s[i] !== "\n") i++;
        if (o.stats) o.stats.comments++;
        eol();
        continue;
      }

      if (c === "/" && d === "*") {
        const e = s.indexOf("*/", i + 2);
        const end = e < 0 ? n : e + 2;
        const comment = s.slice(i, end);
        if (isLicense(comment, o)) {
          emit(comment);
          i = end;
          continue;
        }
        i = end;
        if (o.stats) o.stats.comments++;
        const after = s[i] || "";
        if (/[\w$]/.test(last) && /[\w$]/.test(after)) {
          cur += " ";
          track(" ");
          continue;
        }
        eol();
        continue;
      }

      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n && s[j] !== c) {
          if (s[j] === "\\") j++;
          else if (s[j] === "\n" && !o.line) break;
          j++;
        }
        emit(s.slice(i, j + 1));
        i = j + 1;
        prev = '"'; word = ""; inId = false;
        continue;
      }

      if (o.template && c === "`") {
        emit("`");
        i++;
        while (i < n && s[i] !== "`") {
          if (s[i] === "\\") { emit(s.slice(i, i + 2)); i += 2; continue; }
          if (s[i] === "$" && s[i + 1] === "{") {
            emit("${");
            i += 2;
            emit(code(true));
            emit("}");
            continue;
          }
          emitCh(s[i++]);
        }
        emit("`");
        i++;
        prev = '"'; word = ""; inId = false;
        continue;
      }

      if (o.regex && c === "/") {
        const canStartRegex =
          prev === "" ||
          "(,=:[!&|?{};+-*%<>~^".includes(prev) ||
          (prev === "a" && KEYWORDS.has(word));
        if (canStartRegex) {
          let j = i + 1, inClass = false;
          while (j < n) {
            const ch = s[j];
            if (ch === "\\") j++;
            else if (ch === "[") inClass = true;
            else if (ch === "]") inClass = false;
            else if (ch === "/" && !inClass) break;
            else if (ch === "\n") break;
            j++;
          }
          if (s[j] === "/") {
            j++;
            while (j < n && /[a-z]/i.test(s[j])) j++;
            emit(s.slice(i, j));
            i = j;
            prev = '"'; word = ""; inId = false;
            continue;
          }
        }
      }

      if (stopAtBrace) {
        if (c === "{") depth++;
        else if (c === "}") {
          if (depth === 0) { i++; return done.join("") + cur; }
          depth--;
        }
      }

      emitCh(c);
      i++;
      if (c === "\n") continue;
      word = ""; inId = false; prev = c;
    }
    return done.join("") + cur;
  }

  return code(false);
}

export function stripCss(source, opts = {}) {
  return strip(source, { ...opts, line: false, template: false, regex: false });
}

export function stripScss(source, opts = {}) {
  return strip(source, { ...opts, line: true, urlGuard: true, template: false, regex: false });
}

export function stripJs(source, opts = {}) {
  return strip(source, { ...opts, line: true, template: true, regex: true });
}

export function stripHtml(source, opts = {}) {
  const held = [];
  let s = source.replace(
    /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi,
    (_, tag, attrs, body) => {
      const isData = /type\s*=\s*["']?(text\/(template|html|x-)|application\/(json|ld\+json))/i.test(attrs);
      const result =
        tag.toLowerCase() === "style"
          ? (/lang\s*=\s*["']?(scss|less|sass)/i.test(attrs) ? stripScss : stripCss)(body, opts)
        : isData ? body
        : stripJs(body, opts);
      held.push(`<${tag}${attrs}>${result}</${tag}>`);
      return `\u0001${held.length - 1}\u0001`;
    }
  );

  const keep = (c) =>
    /^<!--\[if|^<!\[endif|^<!--!/.test(c) ||
    (opts.keepLicense && /@license|@preserve/.test(c));

  const drop = () => { if (opts.stats) opts.stats.comments++; return ""; };
  s = s.replace(/^[ \t]*(<!--(?:(?!-->)[\s\S])*-->)[ \t]*(?:\r?\n|$)/gm, (m, c) => (keep(c) ? m : drop()));
  s = s.replace(/<!--[\s\S]*?-->/g, (c) => (keep(c) ? c : drop()));
  return s.replace(/\u0001(\d+)\u0001/g, (_, k) => held[+k]);
}

export function detectLanguage(source, filename = "") {
  const ext = extname(filename).toLowerCase();
  if ([".html", ".htm", ".vue", ".svelte"].includes(ext)) return "html";
  if (ext === ".css") return "css";
  if ([".scss", ".less"].includes(ext)) return "scss";
  if ([".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx"].includes(ext)) return "js";

  const t = source.trim();
  if (/^<(!doctype|html|head|body|div|section|main|!--|script|style|[a-z][\w-]*[\s>])/i.test(t)) return "html";
  if (
    !/\b(function|const|let|var|=>|import|export|return|class)\b/.test(t) &&
    /[^{}]+\{[^{}]*:[^{}]*\}/.test(t)
  ) return "css";
  return "js";
}

/**
 * @param {string} source
 * @param {{ language?: "html"|"css"|"scss"|"js", filename?: string, stats?: {comments:number},
 *           keepLicense?: boolean, removeBlankLines?: boolean }} [opts]
 */
export function stripComments(source, opts = {}) {
  const lang = opts.language ?? detectLanguage(source, opts.filename);
  const fn = { html: stripHtml, css: stripCss, scss: stripScss, js: stripJs }[lang] ?? stripJs;
  let out = fn(source, opts).replace(/[ \t]+$/gm, "");
  if (opts.removeBlankLines) {
    out = out.replace(/^\s*\n/gm, "").replace(/\n\s*$/, "\n");
  }
  return out;
}