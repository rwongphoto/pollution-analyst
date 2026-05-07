// Walks `out/` after `next build` and emits a sitemap index + per-section
// sitemaps into both `out/` (for the current export) and `public/` (so the
// next build picks them up before generation overwrites this run's output).
//
// Sharded at 25k URLs/file, half the 50k protocol cap, leaving room for
// growth without re-sharding.
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "..", "out");
const PUBLIC_DIR = resolve(HERE, "..", "public");

const SITE = "https://www.pollutionanalyst.com";
const MAX_PER_FILE = 25000;
const SKIP = new Set(["404.html", "_not-found.html"]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "_next") continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (name.endsWith(".html") && !SKIP.has(name)) yield { path: p, mtime: s.mtime };
  }
}

function urlFor(htmlPath) {
  let rel = relative(OUT_DIR, htmlPath).replaceAll("\\", "/").replace(/\.html$/, "");
  if (rel === "index") return "/";
  if (rel.endsWith("/index")) rel = rel.slice(0, -"/index".length);
  return "/" + rel;
}

function classify(urlPath) {
  if (urlPath === "/") return { kind: "core", changefreq: "daily", priority: "1.0" };
  if (urlPath === "/methodology" || urlPath === "/legal") return { kind: "core", changefreq: "monthly", priority: "0.5" };
  if (urlPath.startsWith("/rankings")) return { kind: "core", changefreq: "weekly", priority: "0.8" };
  if (/^\/state\/[a-z]{2}$/.test(urlPath)) return { kind: "core", changefreq: "weekly", priority: "0.8" };
  const m = /^\/state\/[a-z]{2}\/(city|county|facility|superfund|water)\//.exec(urlPath);
  if (m) {
    const kindMap = { city: "cities", county: "counties", facility: "facilities", superfund: "superfund", water: "water" };
    return { kind: kindMap[m[1]], changefreq: "monthly", priority: "0.6" };
  }
  return null;
}

const buckets = {};
for (const { path: p, mtime } of walk(OUT_DIR)) {
  const u = urlFor(p);
  const c = classify(u);
  if (!c) continue;
  (buckets[c.kind] ??= []).push({
    loc: SITE + u,
    lastmod: mtime.toISOString().slice(0, 10),
    changefreq: c.changefreq,
    priority: c.priority,
  });
}

function writeBoth(filename, xml) {
  for (const dir of [OUT_DIR, PUBLIC_DIR]) writeFileSync(join(dir, filename), xml);
}

function urlsetXml(entries) {
  const body = entries
    .map(
      (e) =>
        `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

const today = new Date().toISOString().slice(0, 10);
const indexEntries = [];
const order = ["core", "cities", "counties", "facilities", "superfund", "water"];

for (const kind of order) {
  const items = buckets[kind];
  if (!items?.length) continue;
  items.sort((a, b) => a.loc.localeCompare(b.loc));
  if (items.length <= MAX_PER_FILE) {
    const filename = `sitemap-${kind}.xml`;
    writeBoth(filename, urlsetXml(items));
    indexEntries.push({ filename, lastmod: today });
  } else {
    const chunks = Math.ceil(items.length / MAX_PER_FILE);
    for (let i = 0; i < chunks; i++) {
      const slice = items.slice(i * MAX_PER_FILE, (i + 1) * MAX_PER_FILE);
      const filename = `sitemap-${kind}-${i + 1}.xml`;
      writeBoth(filename, urlsetXml(slice));
      indexEntries.push({ filename, lastmod: today });
    }
  }
}

const indexBody = indexEntries
  .map((e) => `  <sitemap>\n    <loc>${SITE}/${e.filename}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n  </sitemap>`)
  .join("\n");
const indexXml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexBody}\n</sitemapindex>\n`;
writeBoth("sitemap.xml", indexXml);

const total = Object.values(buckets).reduce((n, arr) => n + arr.length, 0);
console.log(`Wrote sitemap.xml + ${indexEntries.length} child sitemap(s) → ${total} URLs`);
for (const k of order) if (buckets[k]) console.log(`  ${k}: ${buckets[k].length}`);
