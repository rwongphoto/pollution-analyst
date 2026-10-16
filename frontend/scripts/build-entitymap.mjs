// EntityMap v1.0 (https://entitymap.org/how): content/entitymap.json is the
// hand-authored source of truth. This step validates it, stamps the derived
// fields, and writes both published files to public/ (served at the site root):
//   - public/entitymap.json  — the machine-readable map
//   - public/entitymap.html  — crawlable rendering of the same JSON
// Both outputs are generated, never edited — edit the source and rebuild.
//
// Derived at build time so they can't drift from the root:
//   - `generated`            — build timestamp (spec: update on every rebuild)
//   - chunk `publisher`      — copied from publisher.name (must match exactly)
//   - chunk `retrieved`      — build timestamp
//
// Invalid source throws, which fails the build — a broken map should not ship.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(__dirname, "..");
const SOURCE = join(FRONTEND, "content", "entitymap.json");
const PUBLIC = join(FRONTEND, "public");

const TIER1 = ["INSTANCE_OF", "PART_OF", "INCLUDES", "DEPENDS_ON", "REQUIRES", "MEASURES", "PRODUCED_BY", "REGULATED_BY", "AUTHORED_BY", "AFFILIATED_WITH", "COVERS"];
const TIER2 = ["RELATES_TO", "PRECEDES", "ENABLES", "PREVENTS", "CONFLICTS_WITH", "DESCRIBED_BY", "OFFERS"];
const TIER3 = ["IMPROVES", "DEGRADES", "LEADS_TO", "SUITED_FOR", "TARGETS", "ACHIEVES"];
const TYPES = ["Concept", "ProprietaryTerm"];
const MAX_CHUNKS = 5;
const MAX_CHUNK_CHARS = 600;

function validate(map) {
  const errors = [];
  const warnings = [];
  for (const key of ["version", "schema", "publisher", "entities"]) {
    if (map[key] == null) errors.push(`root: missing \`${key}\``);
  }
  if (!map.publisher?.name || !map.publisher?.url) errors.push("root: publisher needs `name` and `url`");

  const custom = map.vocabulary?.predicates ?? [];
  const allowed = new Set([...TIER1, ...TIER2, ...TIER3, ...custom]);
  const ids = new Set();
  const chunkIds = new Set();
  let relations = 0;
  let relatesTo = 0;

  for (const e of map.entities ?? []) {
    const at = e.entityId ?? e.name ?? "(unnamed entity)";
    for (const key of ["entityId", "@type", "name", "description"]) {
      if (!e[key]) errors.push(`${at}: missing \`${key}\``);
    }
    if (ids.has(e.entityId)) errors.push(`${at}: duplicate entityId`);
    ids.add(e.entityId);
    if (e["@type"] && !TYPES.includes(e["@type"])) errors.push(`${at}: @type must be one of ${TYPES.join(", ")}`);

    const chunks = e.hasChunks ?? [];
    if (chunks.length < 1 || chunks.length > MAX_CHUNKS) errors.push(`${at}: needs 1–${MAX_CHUNKS} chunks (has ${chunks.length})`);
    for (const c of chunks) {
      for (const key of ["chunkId", "text", "sourceUrl", "pageTitle"]) {
        if (!c[key]) errors.push(`${at}/${c.chunkId ?? "?"}: chunk missing \`${key}\``);
      }
      if (chunkIds.has(c.chunkId)) errors.push(`${at}/${c.chunkId}: duplicate chunkId`);
      chunkIds.add(c.chunkId);
      if ((c.text ?? "").length > MAX_CHUNK_CHARS) errors.push(`${at}/${c.chunkId}: chunk text over ${MAX_CHUNK_CHARS} chars`);
      if (c.publisher && c.publisher !== map.publisher?.name) errors.push(`${at}/${c.chunkId}: chunk publisher must match publisher.name (or be omitted)`);
    }

    for (const r of e.relations ?? []) {
      relations++;
      if (r.predicate === "RELATES_TO") relatesTo++;
      if (!allowed.has(r.predicate)) errors.push(`${at}: unknown predicate ${r.predicate}`);
      if (TIER3.includes(r.predicate) && !["declared", "inferred"].includes(r.confidence)) {
        errors.push(`${at}: Tier 3 predicate ${r.predicate} needs confidence "declared" or "inferred"`);
      }
      if (!r.targetName) errors.push(`${at}: relation ${r.predicate} missing targetName`);
      if (!r.targetId === !r.targetUri) errors.push(`${at}: relation ${r.predicate} needs exactly one of targetId / targetUri`);
    }
  }
  for (const e of map.entities ?? []) {
    for (const r of e.relations ?? []) {
      if (r.targetId && !ids.has(r.targetId)) errors.push(`${e.entityId}: targetId ${r.targetId} does not resolve`);
    }
  }
  if (relations && relatesTo / relations > 0.2) {
    warnings.push(`RELATES_TO is ${Math.round((100 * relatesTo) / relations)}% of relations (spec warns above 20%)`);
  }
  return { errors, warnings };
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// JSON inside <script> must not be able to close the tag.
const jsonForScript = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
const predicateLabel = (p) => p.toLowerCase().replace(/_/g, " ");

function renderHtml(map) {
  const site = map.publisher.url.replace(/\/$/, "");
  const pageUrl = `${site}/entitymap.html`;
  const byId = new Map(map.entities.map((e) => [e.entityId, e]));

  const entityJsonLd = (e) => ({
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    "@id": `${pageUrl}#${e.entityId}`,
    name: e.name,
    ...(e.alternateName ? { alternateName: e.alternateName } : {}),
    description: e.description,
    ...(e.sameAs ? { sameAs: e.sameAs } : {}),
    url: `${pageUrl}#${e.entityId}`,
    inDefinedTermSet: { "@type": "DefinedTermSet", name: `${map.publisher.name} EntityMap`, url: pageUrl },
    subjectOf: [...new Set(e.hasChunks.map((c) => c.sourceUrl))].map((u) => ({ "@type": "WebPage", url: u })),
  });

  const relationItem = (r) => {
    const target = r.targetId
      ? `<a href="#${esc(r.targetId)}">${esc(byId.get(r.targetId).name)}</a>`
      : `<a href="${esc(r.targetUri)}" rel="noreferrer">${esc(r.targetName)}</a>`;
    return `<li><span class="pred">${esc(predicateLabel(r.predicate))}</span> ${target}</li>`;
  };

  const entitySection = (e) => `
    <section class="entity" id="${esc(e.entityId)}">
      <script type="application/ld+json">${jsonForScript(entityJsonLd(e))}</script>
      <p class="kind">${e["@type"] === "ProprietaryTerm" ? "Pollution Analyst term" : "Concept"}${e.alternateName ? ` · ${esc(e.alternateName)}` : ""}</p>
      <h2>${esc(e.name)}</h2>
      <p class="desc">${esc(e.description)}</p>
      ${e.sameAs ? `<p class="same">Same as: <a href="${esc(e.sameAs)}" rel="noreferrer">${esc(e.sameAs.replace(/^https?:\/\//, ""))}</a></p>` : ""}
      ${e.relations?.length ? `<ul class="rels">${e.relations.map(relationItem).join("")}</ul>` : ""}
      ${e.hasChunks
        .map(
          (c) => `
      <blockquote id="${esc(c.chunkId)}" data-publisher="${esc(c.publisher)}" cite="${esc(c.sourceUrl)}">
        <p>${esc(c.text)}</p>
        <cite><a href="${esc(c.sourceUrl)}">${esc(c.pageTitle)}</a> - published by ${esc(c.publisher)}</cite>
      </blockquote>`,
        )
        .join("")}
    </section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Entity Map | ${esc(map.publisher.name)}</title>
<meta name="description" content="The concepts ${esc(map.publisher.name)} uses to explain federal pollution data — defined in our own words, with source passages from our methodology and guides.">
<link rel="canonical" href="${esc(pageUrl)}">
<link rel="alternate" type="application/json" href="${esc(site)}/entitymap.json">
<link rel="entitymap" type="application/json" href="${esc(site)}/entitymap.json">
<link rel="icon" href="/favicon.ico">
<style>
  :root { --bg: #fbfaf7; --fg: #1d1d1b; --muted: #5f5e58; --rule: #e3e0d8; --accent: #2f5d50; --quote: #f2efe8; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { --bg: #141412; --fg: #ecebe6; --muted: #a3a29b; --rule: #2e2d29; --accent: #8cc2b0; --quote: #1d1c19; }
  }
  :root[data-theme="dark"] { --bg: #141412; --fg: #ecebe6; --muted: #a3a29b; --rule: #2e2d29; --accent: #8cc2b0; --quote: #1d1c19; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 40px 16px 80px; }
  a { color: var(--accent); }
  h1 { font-size: 2rem; line-height: 1.2; margin: 8px 0 12px; }
  h2 { font-size: 1.35rem; margin: 4px 0 8px; }
  .home { font-size: 14px; }
  .lede, .meta, .kind, .same, cite { color: var(--muted); }
  .meta { font-size: 13px; }
  nav.toc { columns: 2 220px; margin: 24px 0 8px; padding: 0; font-size: 15px; }
  nav.toc a { display: block; padding: 2px 0; }
  .entity { border-top: 1px solid var(--rule); padding-top: 28px; margin-top: 28px; }
  .kind { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; margin: 0; }
  .same { font-size: 13px; overflow-wrap: anywhere; }
  .rels { list-style: none; padding: 0; margin: 12px 0; font-size: 14px; }
  .pred { color: var(--muted); }
  blockquote { margin: 14px 0; padding: 12px 16px; background: var(--quote); border-left: 3px solid var(--accent); }
  blockquote p { margin: 0 0 6px; }
  cite { font-size: 13px; font-style: normal; }
</style>
</head>
<body>
<main>
  <p class="home"><a href="${esc(site)}/">← ${esc(map.publisher.name)}</a></p>
  <h1>Entity Map</h1>
  <p class="lede">The concepts ${esc(map.publisher.name)} uses to explain federal pollution data, defined the way we use them. Each entry quotes the passages on our site where the concept is explained. This page is generated from <a href="${esc(site)}/entitymap.json">entitymap.json</a> (<a href="https://entitymap.org/spec/v1.0" rel="noreferrer">EntityMap v${esc(map.version)}</a>).</p>
  <p class="meta">Generated ${esc(map.generated.slice(0, 10))} · ${map.entities.length} entities</p>
  <nav class="toc" aria-label="Entities">
    ${map.entities.map((e) => `<a href="#${esc(e.entityId)}">${esc(e.name)}</a>`).join("\n    ")}
  </nav>
  ${map.entities.map(entitySection).join("\n")}
</main>
</body>
</html>
`;
}

export function buildEntityMap() {
  const source = JSON.parse(readFileSync(SOURCE, "utf8"));
  const { errors, warnings } = validate(source);
  for (const w of warnings) console.warn(`entitymap: warning — ${w}`);
  if (errors.length) {
    throw new Error(`entitymap: ${errors.length} validation error(s) in content/entitymap.json:\n  ${errors.join("\n  ")}`);
  }

  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const { version, schema, verificationStatus, publisher, vocabulary, entities } = source;
  const map = {
    version,
    schema,
    ...(verificationStatus ? { verificationStatus } : {}),
    publisher,
    generated: now,
    ...(vocabulary ? { vocabulary } : {}),
    entities: entities.map((e) => ({
      ...e,
      hasChunks: e.hasChunks.map((c) => ({ ...c, publisher: publisher.name, retrieved: c.retrieved ?? now })),
    })),
  };

  writeFileSync(join(PUBLIC, "entitymap.json"), `${JSON.stringify(map, null, 2)}\n`);
  writeFileSync(join(PUBLIC, "entitymap.html"), renderHtml(map));
  console.log(`entitymap: ${map.entities.length} entities → public/entitymap.json + public/entitymap.html`);
}

if (import.meta.url === `file://${process.argv[1]}`) buildEntityMap();
