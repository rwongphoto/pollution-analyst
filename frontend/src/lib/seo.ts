import type { Metadata } from "next";

// Build a Metadata object with consistent canonical + OG + Twitter coverage.
// Each page must call this so Next.js emits a per-route canonical and
// per-route OG URL — the layout-level defaults only cover sitewide fields.
export function pageMeta(opts: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const path = opts.path.startsWith("/") ? opts.path : `/${opts.path}`;
  return {
    title: opts.title,
    description: opts.description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: path,
    },
    twitter: {
      card: "summary_large_image",
      title: opts.title,
      description: opts.description,
    },
  };
}

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pollutionanalyst.com";
