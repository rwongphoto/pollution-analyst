import Link from "next/link";

export function Brand({ small = false }: { small?: boolean }) {
  const markSize = small ? 18 : 20;
  return (
    <Link href="/" className="brand" style={{ fontSize: small ? 17 : 19 }}>
      <BrandMark size={markSize} />
      Pollution Analyst
    </Link>
  );
}

function BrandMark({ size }: { size: number }) {
  return (
    <svg
      className="brand-mark"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="brand-mark-smoke" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#E6B450" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="#D97A30" stopOpacity="0.85" />
          <stop offset="1" stopColor="#C44545" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <g>
        <circle cx="14" cy="20" r="3.0" fill="url(#brand-mark-smoke)" opacity="0.55" />
        <circle cx="18" cy="14" r="3.8" fill="url(#brand-mark-smoke)" opacity="0.75" />
        <circle cx="13" cy="11" r="2.6" fill="url(#brand-mark-smoke)" opacity="0.6" />
        <circle cx="32" cy="8" r="4.6" fill="url(#brand-mark-smoke)" opacity="0.85" />
        <circle cx="38" cy="13" r="3.4" fill="url(#brand-mark-smoke)" opacity="0.7" />
        <circle cx="26" cy="13" r="3.2" fill="url(#brand-mark-smoke)" opacity="0.65" />
        <circle cx="50" cy="18" r="3.2" fill="url(#brand-mark-smoke)" opacity="0.6" />
        <circle cx="46" cy="13" r="3.6" fill="url(#brand-mark-smoke)" opacity="0.75" />
        <circle cx="54" cy="13" r="2.4" fill="url(#brand-mark-smoke)" opacity="0.55" />
      </g>
      <g fill="currentColor">
        <rect x="11" y="22" width="8" height="34" rx="1.2" />
        <rect x="9" y="22" width="12" height="2.6" rx="0.6" />
        <rect x="28" y="18" width="10" height="38" rx="1.4" />
        <rect x="26" y="18" width="14" height="3" rx="0.7" />
        <rect x="46" y="22" width="8" height="34" rx="1.2" />
        <rect x="44" y="22" width="12" height="2.6" rx="0.6" />
      </g>
    </svg>
  );
}
