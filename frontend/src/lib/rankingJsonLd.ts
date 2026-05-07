import { SITE_URL } from "./seo";
import type { RankingRow, RankingTable } from "./types";

export interface RankingsJsonLdInput {
  pageUrl: string;          // canonical absolute URL for this rankings page
  pageTitle: string;        // Article headline / page title (no site suffix)
  pageDescription: string;
  surfaceLabel: string;     // breadcrumb leaf label (e.g. "States Rankings")
  tables: RankingTable[];
  rowUrl: (row: RankingRow) => string;  // returns absolute URL for a row entity
}

// Generates the @graph JSON-LD for a rankings page: BreadcrumbList + Article +
// Organization + one ItemList per ranking table. The "Rankings" parent crumb
// has no URL (no /rankings index page) so it's skipped per Google's rule that
// every BreadcrumbList item must be a URL.
export function buildRankingsJsonLd(input: RankingsJsonLdInput) {
  const { pageUrl, pageTitle, pageDescription, surfaceLabel, tables, rowUrl } = input;

  const itemLists = tables.map((t) => {
    const directionWord = t.direction === "most" ? "highest" : "lowest";
    return {
      "@type": "ItemList",
      "@id": `${pageUrl}#${t.lane}-${t.direction}`,
      name: `${t.label} — ${directionWord}`,
      description: `Top ${t.rows.length} ${surfaceLabel.toLowerCase().replace(" rankings", "")} by ${t.label.toLowerCase()} (${t.units}), ${directionWord} first.`,
      numberOfItems: t.rows.length,
      itemListOrder: t.direction === "most"
        ? "https://schema.org/ItemListOrderDescending"
        : "https://schema.org/ItemListOrderAscending",
      itemListElement: t.rows.map((r) => ({
        "@type": "ListItem",
        position: r.rank,
        url: rowUrl(r),
        name: r.name,
      })),
    };
  });

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: surfaceLabel, item: pageUrl },
        ],
      },
      {
        "@type": "Article",
        mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
        headline: pageTitle,
        description: pageDescription,
        image: `${SITE_URL}/icon.png`,
        publisher: {
          "@type": "Organization",
          name: "Pollution Analyst",
          url: SITE_URL,
        },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/`,
        name: "Pollution Analyst",
        url: `${SITE_URL}/`,
        logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.png` },
      },
      ...itemLists,
    ],
  };
}
