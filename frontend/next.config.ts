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
  output: "export",
  turbopack: {
    // src/lib/data.ts reads per-page JSON artifacts from ../data/published at
    // SSG time. Turbopack 16.2 traces those dynamic fs paths and warns
    // "Overly broad patterns ... matches N files". Safe to suppress: with
    // `output: 'export'` there is no server bundle for the JSON to over-bundle
    // into — only rendered HTML ships.
    ignoreIssue: [{ path: "**/src/lib/data.ts" }],
  },
};

export default nextConfig;
