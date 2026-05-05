import Link from "next/link";

export type CrumbItem = { label: string; href?: string };

// Sitewide breadcrumbs. Last item has no href and renders as the
// "you are here" element. The wrap div matches the design pattern
// (no extra margin — the calling page chooses where to slot it).
//
// "Home" is auto-prepended on every breadcrumb so callers don't have to
// remember it. Pass `omitHome` if you genuinely don't want it (e.g. on
// the home page itself).
export function Crumbs({
  items,
  omitHome = false,
}: {
  items: CrumbItem[];
  omitHome?: boolean;
}) {
  const fullItems: CrumbItem[] = omitHome ? items : [{ label: "Home", href: "/" }, ...items];
  return (
    <nav className="wrap" aria-label="Breadcrumb">
      <ol className="crumbs">
        {fullItems.map((it, i) => (
          <li key={i}>
            {i > 0 && <span className="sep" aria-hidden="true">/</span>}
            {it.href ? (
              <Link href={it.href}>{it.label}</Link>
            ) : (
              <span className="here" aria-current="page">{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
