// Postbuild cleanup: remove Next 16 RSC / segment-cache `.txt` sidecars from
// the static export. Each prerendered page emits a sibling `slug.txt` plus a
// `slug/__next.*.txt` directory used for partial client-side prefetching. On a
// 50k-page site they're ~60% of the build output (~6.5 GB) and tipped Vercel's
// publish-step copy over its disk limit. Without them, `<Link>` navigations
// fall back to a full HTML load via Next's nav-failure-handler — first-paint
// and SEO are unaffected.
//
// We touch both `out/` (the static-export root) and `.next/output/static/`
// (the intermediate Vercel reads from) so the cleanup applies whichever
// surface the platform copies. `_next/` is left untouched — it holds JS/CSS
// chunks that share no `.txt` files anyway.

import { readdir, rm, stat } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = [
  join(ROOT, "out"),
  join(ROOT, ".next", "output", "static"),
];

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function walk(dir, files = [], dirs = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return { files, dirs };
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "_next") continue;
      dirs.push(full);
      await walk(full, files, dirs);
    } else if (e.isFile() && e.name.endsWith(".txt")) {
      files.push(full);
    }
  }
  return { files, dirs };
}

async function strip(root) {
  if (!(await exists(root))) return { txt: 0, txtBytes: 0, emptied: 0 };
  const { files, dirs } = await walk(root);
  let txtBytes = 0;
  for (const f of files) {
    try { txtBytes += (await stat(f)).size; } catch {}
    await rm(f, { force: true });
  }
  let emptied = 0;
  for (const d of dirs.sort((a, b) => b.length - a.length)) {
    try {
      const remaining = await readdir(d);
      if (remaining.length === 0) {
        await rm(d, { recursive: false });
        emptied++;
      }
    } catch {}
  }
  return { txt: files.length, txtBytes, emptied };
}

const fmt = (n) => (n / (1024 * 1024)).toFixed(1) + " MB";

for (const t of TARGETS) {
  const r = await strip(t);
  if (r.txt === 0 && r.emptied === 0) {
    if (await exists(t)) console.log(`[strip-rsc] ${t}: nothing to strip`);
    continue;
  }
  console.log(
    `[strip-rsc] ${t}: removed ${r.txt} .txt files (${fmt(r.txtBytes)}), pruned ${r.emptied} empty dirs`,
  );
}
