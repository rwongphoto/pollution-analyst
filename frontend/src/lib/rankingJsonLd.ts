import { SITE_URL } from "./seo";
import type { RankingRow, RankingTable } from "./types";

// One breadcrumb segment — mirrors the <Crumbs> component's CrumbItem so the
// JSON-LD BreadcrumbList is built from the exact same trail shown on the page.
export interface CrumbSegment {
  label: string;
  href?: string;  // omitted for non-link crumbs (e.g. the "Rankings" parent)
}

export interface RankingsJsonLdInput {
  pageUrl: string;          // canonical absolute URL for this rankings page
  pageTitle: string;        // Article headline / page title (no site suffix)
  pageDescription: string;
  surfaceLabel: string;     // ItemList description label (e.g. "States Rankings")
  crumbs: CrumbSegment[];   // the SAME items passed to <Crumbs> (Home auto-added)
  tables: RankingTable[];
  rowUrl: (row: RankingRow) => string;  // returns absolute URL for a row entity
}

// Generates the @graph JSON-LD for a rankings page: BreadcrumbList + Article +
// Organization + one ItemList per ranking table.
//
// The BreadcrumbList is built from the visible crumb trail (Home + the items
// passed to <Crumbs>) so the structured data always matches what users see.
// Crumbs without an href (e.g. the "Rankings" parent, which has no index page)
// are emitted as name-only ListItems — exactly the non-link rendering on the
// page; the leaf item resolves to the page's own canonical URL.
export function buildRankingsJsonLd(input: RankingsJsonLdInput) {
  const { pageUrl, pageTitle, pageDescription, surfaceLabel, crumbs, tables, rowUrl } = input;

  const trail: CrumbSegment[] = [{ label: "Home", href: "/" }, ...crumbs];
  const breadcrumbItems = trail.map((c, i) => {
    const isLast = i === trail.length - 1;
    const url = c.href ? `${SITE_URL}${c.href}` : isLast ? pageUrl : undefined;
    return {
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      ...(url ? { item: url } : {}),
    };
  });

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
        itemListElement: breadcrumbItems,
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
