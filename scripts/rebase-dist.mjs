// Rewrites root-absolute URLs in the built site so it can be served from a
// sub-path (GitHub Pages project site). Source keeps "/..." paths so the
// production domain build stays untouched.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";

const base = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!base) {
  console.error("usage: node scripts/rebase-dist.mjs /sub-path");
  process.exit(1);
}

const dist = new URL("../dist/", import.meta.url).pathname;
const exts = new Set([".html", ".css", ".js", ".xml", ".json", ".txt"]);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

let changed = 0;
for await (const file of walk(dist)) {
  if (!exts.has(extname(file))) continue;
  const original = await readFile(file, "utf8");
  const next = original
    .replace(/((?:href|src|action|content|poster)=")\/(?!\/)/g, `$1${base}/`)
    .replace(/(url\(\s*['"]?)\/(?!\/)/g, `$1${base}/`)
    .replace(/(\bsrcset=")([^"]+)"/g, (m, p, set) =>
      `${p}${set.replace(/(^|,\s*)\/(?!\/)/g, `$1${base}/`)}"`,
    );
  if (next !== original) {
    await writeFile(file, next);
    changed++;
  }
}
console.log(`rebase-dist: prefixed ${changed} file(s) with ${base}`);
