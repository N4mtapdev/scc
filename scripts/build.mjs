#!/usr/bin/env node
// Gộp bin/cli.mjs và src/*.mjs thành một file dist/scc.mjs để chạy trực tiếp từ URL raw của GitHub.
//   node scripts/build.mjs           tạo/cập nhật dist/scc.mjs
//   node scripts/build.mjs --check   báo lỗi nếu dist/scc.mjs chưa được build mới nhất
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULES = [["strip", "src/strip.mjs"], ["ui", "src/ui.mjs"], ["highlight", "src/highlight.mjs"], ["diff", "src/diff.mjs"]];
const ENTRY = "bin/cli.mjs";
const OUT = path.join(ROOT, "dist", "scc.mjs");

const IMPORT_RE = /^import\s+([\s\S]*?)\s+from\s+["']((?:node:|\.)[^"']*)["'];?[ \t]*$/gm;
const alias = (mod) => "__" + mod.replace(/[^A-Za-z0-9]/g, "_");

function transform(file, { wrap, name }) {
  let src = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/^#!.*\n/, "");
  const nodeMods = new Set();
  const decls = [];
  src = src.replace(IMPORT_RE, (_m, spec, from) => {
    spec = spec.trim();
    let target;
    if (from.startsWith("node:")) { nodeMods.add(from); target = alias(from); }
    else {
      const key = path.basename(from, ".mjs");
      if (!MODULES.some(([k]) => k === key)) throw new Error(`Không biết module ${from} trong ${file}`);
      target = `__m.${key}`;
    }
    const isNode = from.startsWith("node:");
    if (spec.startsWith("{")) decls.push(`const ${spec.replace(/\s+as\s+/g, ": ")} = ${target};`);
    else if (spec.startsWith("* as ")) decls.push(`const ${spec.slice(5).trim()} = ${target};`);
    else decls.push(`const ${spec} = ${target}${isNode ? ".default" : ""};`);
    return "";
  });
  const names = [];
  src = src.replace(/^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (_m, kw, id) => {
    names.push(id);
    return `${kw} ${id}`;
  });
  if (/^export\s/m.test(src)) throw new Error(`${file}: có kiểu export chưa được hỗ trợ`);
  const body = `${decls.join("\n")}\n${src.trim()}\n`;
  const code = wrap ? `__m.${name} = (() => {\n${body}return { ${names.join(", ")} };\n})();\n` : body;
  return { code, nodeMods };
}

export function bundle() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const allNode = new Set();
  const parts = [];
  for (const [name, file] of MODULES) {
    const r = transform(file, { wrap: true, name });
    r.nodeMods.forEach((m) => allNode.add(m));
    parts.push(`// ── ${file}\n${r.code}`);
  }
  const entry = transform(ENTRY, { wrap: false });
  entry.nodeMods.forEach((m) => allNode.add(m));
  const imports = [...allNode].sort().map((m) => `import * as ${alias(m)} from "${m}";`).join("\n");
  return [
    "#!/usr/bin/env node",
    `// Strip Comments CLI v${pkg.version}: bản gộp một file, tạo bởi scripts/build.mjs. Đừng sửa trực tiếp.`,
    imports,
    "const __SCC_BUNDLE__ = true;",
    "const __m = {};",
    "",
    parts.join("\n"),
    `// ── ${ENTRY}`,
    entry.code,
  ].join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const out = bundle();
  if (process.argv.includes("--check")) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (cur !== out) { console.error("✘ dist/scc.mjs chưa mới nhất. Chạy: node scripts/build.mjs"); process.exit(1); }
    console.log("✔ dist/scc.mjs đã mới nhất");
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, out);
    console.log(`✔ Đã tạo dist/scc.mjs (${(Buffer.byteLength(out) / 1024).toFixed(1)} KB)`);
  }
}