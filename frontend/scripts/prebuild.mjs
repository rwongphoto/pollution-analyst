// Prebuild (and predev): the bird-analyst pattern, adapted for one repo.
//   1. Copy the search index into public/ so the client nav search can fetch it.
//   2. Walk data/published/ to emit sharded XML sitemaps + a sitemap index into
//      public/ (no full `out/` export to walk anymore under ISR).
//   3. Write a tiny data/published/_site-counts.json the homepage reads for its
//      headline counts — it survives step 4, unlike the per-entity trees.
//   4. On Vercel/CI, drop the big per-entity trees from the build workspace so
//      Next's tracer can't bust the 300 MB function cap. They stay committed in
//      git, so raw.githubusercontent still serves them at request time
//      (see src/lib/data.ts).
//
// Replaces sync-search-index.mjs (prebuild) and generate-sitemap.mjs /
// strip-rsc-sidecars.mjs (postbuild), which depended on a full `output: 'export'`
// build.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(__dirname, "..");
const PUBLISHED = resolve(FRONTEND, "..", "data", "published");
const PUBLIC = join(FRONTEND, "public");
const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pollutionanalyst.com").replace(/\/$/, "");
const MAX_PER_FILE = 25000; // half the 50k sitemap-protocol cap, room to grow
const BIG_TREES = ["facility", "water", "city", "county", "superfund"];

if (!existsSync(PUBLISHED)) {
  console.error(`prebuild: ${PUBLISHED} not found — run the publish pipeline first`);
  process.exit(1);
}

mkdirSync(PUBLIC, { recursive: true });

// ---- 1. search index → public/ ----
const searchIndex = join(PUBLISHED, "search-index.json");
if (existsSync(searchIndex)) {
  copyFileSync(searchIndex, join(PUBLIC, "search-index.json"));
} else {
  console.warn("prebuild: search-index.json missing — build continues without nav search");
}

// ---- 2/3. walk tree → sitemap URL buckets + headline counts ----
const slugsIn = (dir) =>
  existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
    : [];
const xmlEscape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const stateSlugs = slugsIn(join(PUBLISHED, "state"));
const buckets = {
  // Static + per-state pages (all pre-rendered at build, so always in the map).
  core: [
    "/",
    "/methodology",
    "/legal",
    "/rankings/states",
    "/rankings/counties",
    "/rankings/cities",
    "/rankings/facilities",
    "/rankings/superfund",
    ...stateSlugs.map((s) => `/state/${s}`),
  ],
};
const counts = { states: stateSlugs.length };

for (const kind of BIG_TREES) {
  const root = join(PUBLISHED, kind);
  const urls = [];
  if (existsSync(root)) {
    for (const st of readdirSync(root)) {
      for (const slug of slugsIn(join(root, st))) urls.push(`/state/${st}/${kind}/${slug}`);
    }
  }
  buckets[kind] = urls;
  counts[kind] = urls.length;
}

// ---- write sharded sitemaps + index to public/ ----
const today = new Date().toISOString().slice(0, 10);
const urlsetXml = (paths) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map((p) => `  <url><loc>${xmlEscape(SITE + p)}</loc></url>`)
    .join("\n")}\n</urlset>\n`;

// Sitemap filename labels — kept plural to match the previously published
// (and search-engine-indexed) shard names. `core` and `superfund`/`water` are
// unchanged from the old generate-sitemap.mjs.
const LABEL = {
  core: "core",
  city: "cities",
  county: "counties",
  facility: "facilities",
  superfund: "superfund",
  water: "water",
};
const order = ["core", "city", "county", "facility", "superfund", "water"];
const indexFiles = [];
for (const kind of order) {
  const items = (buckets[kind] ?? []).slice().sort();
  if (!items.length) continue;
  const label = LABEL[kind];
  const shards = Math.ceil(items.length / MAX_PER_FILE);
  for (let i = 0; i < shards; i++) {
    const slice = items.slice(i * MAX_PER_FILE, (i + 1) * MAX_PER_FILE);
    const name = shards === 1 ? `sitemap-${label}.xml` : `sitemap-${label}-${i + 1}.xml`;
    writeFileSync(join(PUBLIC, name), urlsetXml(slice));
    indexFiles.push(name);
  }
}
writeFileSync(
  join(PUBLIC, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexFiles
    .map((f) => `  <sitemap><loc>${SITE}/${f}</loc><lastmod>${today}</lastmod></sitemap>`)
    .join("\n")}\n</sitemapindex>\n`,
);

// ---- 3. counts for the homepage (written before the deletion below) ----
writeFileSync(join(PUBLISHED, "_site-counts.json"), `${JSON.stringify(counts)}\n`);

const total = order.reduce((n, k) => n + (buckets[k]?.length ?? 0), 0);
console.log(
  `prebuild: search index copied; ${indexFiles.length} sitemap shard(s), ${total} URLs; counts ${JSON.stringify(counts)}`,
);

// ---- 4. shrink the function bundle on Vercel/CI ----
if (process.env.VERCEL || process.env.CI) {
  for (const kind of BIG_TREES) {
    const target = join(PUBLISHED, kind);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  }
  console.log("prebuild: (Vercel/CI) big per-entity trees dropped from workspace — served via CDN");
}
