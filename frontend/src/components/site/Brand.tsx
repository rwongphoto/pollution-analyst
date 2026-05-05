import Link from "next/link";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link href="/" className="brand" style={{ fontSize: small ? 17 : 19 }}>
      Pollution Analyst<span className="dot">.</span><em>ai</em>
    </Link>
  );
}
