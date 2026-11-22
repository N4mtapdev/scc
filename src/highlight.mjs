// Tô màu cú pháp nhẹ cho một dòng code (JS/TS, CSS/SCSS, HTML). Chỉ để xem trước.
import { fgRgb, useColor } from "./ui.mjs";

const P = {
  kw: fgRgb([198, 120, 221]),
  str: fgRgb([152, 195, 121]),
  num: fgRgb([209, 154, 102]),
  fn: fgRgb([97, 175, 239]),
  prop: fgRgb([86, 182, 194]),
  tag: fgRgb([224, 108, 117]),
  attr: fgRgb([209, 154, 102]),
  cmt: fgRgb([110, 118, 133]),
};

const KW = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while", "do", "switch", "case", "break",
  "continue", "new", "class", "extends", "import", "export", "from", "default", "async", "await", "try", "catch",
  "finally", "throw", "typeof", "instanceof", "in", "of", "this", "null", "undefined", "true", "false", "void",
  "delete", "yield", "static", "get", "set", "interface", "type", "enum", "public", "private", "readonly",
]);

const JS_RE = /(\s+)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\/\/.*|\/\*.*?(?:\*\/|$))|(\b\d[\w.]*)|([A-Za-z_$][\w$]*)|(.)/gy;
const CSS_RE = /(\s+)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|(\/\*.*?(?:\*\/|$))|(#[0-9a-fA-F]{3,8}\b)|(-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b)|(@[\w-]+)|([\w-]+)(?=\s*:)|([.#]?[\w-]+)|(.)/gy;
const HTML_RE = /(<\/?)([A-Za-z][\w:-]*)|(<!--.*?(?:-->|$))|("[^"]*"?|'[^']*'?)|([\w:@.-]+)(?==)|(\/?>)|(\s+)|(.)/gy;

function run(re, line, onMatch) {
  re.lastIndex = 0;
  let out = "", m;
  while (re.lastIndex < line.length && (m = re.exec(line))) out += onMatch(m, line, re.lastIndex);
  return out;
}

function hlJs(line) {
  return run(JS_RE, line, (m, src, end) => {
    if (m[1]) return m[1];
    if (m[2]) return P.str(m[2]);
    if (m[3]) return P.cmt(m[3]);
    if (m[4]) return P.num(m[4]);
    if (m[5]) {
      if (KW.has(m[5])) return P.kw(m[5]);
      if (/^\s*\(/.test(src.slice(end))) return P.fn(m[5]);
      return m[5];
    }
    return m[6];
  });
}

function hlCss(line) {
  return run(CSS_RE, line, (m) => {
    if (m[1]) return m[1];
    if (m[2]) return P.str(m[2]);
    if (m[3]) return P.cmt(m[3]);
    if (m[4] || m[5]) return P.num(m[4] || m[5]);
    if (m[6]) return P.kw(m[6]);
    if (m[7]) return P.prop(m[7]);
    if (m[8]) return m[8];
    return m[9];
  });
}

function hlHtml(line) {
  return run(HTML_RE, line, (m) => {
    if (m[1]) return P.tag(m[1] + m[2]);
    if (m[3]) return P.cmt(m[3]);
    if (m[4]) return P.str(m[4]);
    if (m[5]) return P.attr(m[5]);
    if (m[6]) return P.tag(m[6]);
    return m[7] || m[8];
  });
}

export function highlight(line, lang = "js") {
  if (!useColor || !line) return line;
  try {
    if (lang === "css" || lang === "scss") return hlCss(line);
    if (lang === "html") return hlHtml(line);
    return hlJs(line);
  } catch {
    return line;
  }
}