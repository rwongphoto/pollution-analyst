"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Brand } from "./Brand";

type Active =
  | "home"
  | "facility"
  | "city"
  | "water"
  | "county"
  | "state"
  | "method"
  | "rankings-counties"
  | "rankings-cities"
  | "rankings-facilities"
  | undefined;

const NAV: { key: Active; href: string; label: string }[] = [
  { key: "state", href: "/state/ca", label: "States" },
  { key: "rankings-counties", href: "/rankings/counties", label: "Counties" },
  { key: "rankings-cities", href: "/rankings/cities", label: "Cities" },
  { key: "rankings-facilities", href: "/rankings/facilities", label: "Facilities" },
  { key: "method", href: "/methodology", label: "Methodology" },
];

export function SiteHeader({ active }: { active?: Active }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <header className={`site-header ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="wrap row">
        <Brand />
        <nav className="site-nav" aria-label="Primary" id="site-nav">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={active === item.key ? "active" : ""}
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <Link href="/methodology" className="btn btn-primary btn-sm cta-desktop">
            How it works<span style={{ marginLeft: 4 }}>→</span>
          </Link>
          <button
            type="button"
            className="nav-toggle"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="site-nav"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <span className="nav-toggle-bars" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
