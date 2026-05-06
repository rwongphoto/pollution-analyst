"use client";

import dynamic from "next/dynamic";

import type { StateMapSummary } from "@/lib/data";

const USMap = dynamic(() => import("./USMap").then((m) => m.USMap), {
  ssr: false,
  loading: () => (
    <div className="map-frame">
      <div className="map-toolbar">
        <span className="meta-mono" style={{ color: "var(--fg-3)" }}>LOADING MAP…</span>
      </div>
      <div className="map-canvas-wrap">
        <div className="map-canvas" style={{ background: "var(--bg-2)" }} aria-hidden="true" />
      </div>
    </div>
  ),
});

type Props = {
  burdens: { fips: string; total_releases_pounds: number }[];
  stateSummaries: StateMapSummary[];
};

export function USMapClient(props: Props) {
  return <USMap {...props} />;
}
