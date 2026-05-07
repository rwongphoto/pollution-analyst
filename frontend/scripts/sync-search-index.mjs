// Prebuild step: copy ../data/published/search-index.json into public/ so
// Next's static export ships it as /search-index.json. The pipeline writes
// it once per publish run; this script keeps the frontend mirror in sync
// without committing the generated artifact to git.

import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "..", "data", "published", "search-index.json");
const DEST = join(ROOT, "public", "search-index.json");

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

if (!(await exists(SRC))) {
  console.warn(`[sync-search-index] missing ${SRC} — run the publish pipeline first; build will continue without a search index`);
  process.exit(0);
}

await mkdir(dirname(DEST), { recursive: true });
await copyFile(SRC, DEST);
const size = (await stat(DEST)).size;
console.log(`[sync-search-index] ${SRC} → ${DEST} (${(size / 1024).toFixed(1)} KB)`);
