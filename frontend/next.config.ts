import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { NextConfig } from "next";

// Load env vars from the project-root `.env` (the same file the Python pipeline
// reads). One secrets file, both surfaces — frontend devs don't have to
// duplicate `NEXT_PUBLIC_MAPBOX_TOKEN` etc. into `frontend/.env.local`.
// Real shell env vars take precedence (we only setdefault).
(function loadRootEnv() {
  const path = resolve(process.cwd(), "..", ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!key) continue;
    const value = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (process.env[key.trim()] === undefined) {
      process.env[key.trim()] = value;
    }
  }
})();

const nextConfig: NextConfig = {
  // ISR serving model (the bird-analyst / college-study-data pattern), replacing
  // the old `output: 'export'` full-SSG. Per-entity pages now render on demand
  // and revalidate every 24h, so deploys no longer pre-render the ~84k-page long
  // tail (9.6 GB out/). The big per-entity JSON trees are fetched from a CDN at
  // request time — see src/lib/data.ts.
  //
  // data/published/ lives one level up from frontend/. Trace from the repo root
  // so the bundled-artifact includes below resolve.
  outputFileTracingRoot: resolve(__dirname, ".."),
  // Bundle only the small, always-needed artifacts into each serverless
  // function. The big per-entity trees (facility/**, water/**, city/**,
  // county/**, superfund/**) are served from the CDN at request time and are
  // dropped from the build workspace by scripts/prebuild.mjs on Vercel/CI so the
  // function bundle stays under the 300 MB cap.
  outputFileTracingIncludes: {
    "/**": [
      "../data/published/home.json",
      "../data/published/rankings.json",
      "../data/published/search-index.json",
      "../data/published/state/**",
    ],
  },
  turbopack: {
    // src/lib/data.ts reads per-page JSON artifacts from ../data/published at
    // request / ISR time (local-disk fallback path). Turbopack 16.2 traces those
    // dynamic fs paths and warns "Overly broad patterns ... matches N files".
    // Safe to suppress — server-side reads only, never bundled into client
    // output, and the big trees are CDN-fetched in prod.
    ignoreIssue: [{ path: "**/src/lib/data.ts" }],
  },
};

export default nextConfig;
