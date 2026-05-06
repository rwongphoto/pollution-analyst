"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { StateMapSummary } from "@/lib/data";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const STYLES = {
  dark: "mapbox://styles/mapbox/dark-v11",
  light: "mapbox://styles/mapbox/light-v11",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
} as const;
type StyleKey = keyof typeof STYLES;

type Burden = { fips: string; total_releases_pounds: number };

type Props = {
  burdens: Burden[];
  stateSummaries: StateMapSummary[];
};

const PALETTE = ["#1a3a4a", "#2a5a6a", "#4a7a7a", "#c5a945", "#d97a30", "#c44545"];
const NO_DATA = "#1B2030";

function poundsLabel(p: number): string {
  if (p >= 1_000_000_000) return `${(p / 1_000_000_000).toFixed(2)}B lbs`;
  if (p >= 1_000_000) return `${(p / 1_000_000).toFixed(1)}M lbs`;
  if (p >= 1_000) return `${(p / 1_000).toFixed(0)}k lbs`;
  return `${p} lbs`;
}

type HoverInfo = {
  countyName: string;
  countyBurden: number | null;
  stateFips: string;
  summary: StateMapSummary | null;
};

export function USMap({ burdens, stateSummaries }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const hoveredIdRef = useRef<string | number | null>(null);
  const router = useRouter();
  const [style, setStyle] = useState<StyleKey>("dark");
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  // Lookup tables. Recomputed each render — cheap (<3K rows).
  const burdenByFips = (() => {
    const m = new Map<string, number>();
    for (const b of burdens) {
      const prior = m.get(b.fips);
      if (prior == null || prior < b.total_releases_pounds) {
        m.set(b.fips, b.total_releases_pounds);
      }
    }
    return m;
  })();

  const summaryByStateFips = (() => {
    const m = new Map<string, StateMapSummary>();
    for (const s of stateSummaries) m.set(s.fips, s);
    return m;
  })();

  // Quintile breakpoints over the national distribution. State pages use the
  // same pattern but per-state; here we shade against every published county
  // at once so cross-state comparisons are meaningful. Stops are nudged
  // strictly ascending — Mapbox `step` rejects duplicate stops and silently
  // drops the layer when they collide.
  const breakpoints = (() => {
    const sorted = [...burdenByFips.values()].sort((a, b) => a - b);
    if (sorted.length === 0) return [0, 0, 0, 0, 0];
    const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))];
    const raw = [q(0.0), q(0.2), q(0.4), q(0.6), q(0.8)];
    const fixed: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      const prior = i === 0 ? -Infinity : fixed[i - 1];
      fixed.push(raw[i] > prior ? raw[i] : prior + 1);
    }
    return fixed;
  })();

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLES[style],
      center: [-96, 38.5],
      zoom: 3.3,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", async () => {
      const counties = await loadCounties();
      if (!counties || !mapRef.current) return;
      annotateCounties(counties, burdenByFips);
      addLayers(map, counties);

      map.on("mousemove", "counties-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const fips = readFips(f);
        const stateFips = fips.slice(0, 2);
        const summary = summaryByStateFips.get(stateFips) ?? null;

        // Feature-state highlight: lift border + opacity on the hovered county.
        if (hoveredIdRef.current !== null) {
          map.setFeatureState({ source: "counties", id: hoveredIdRef.current }, { hover: false });
        }
        hoveredIdRef.current = (f.id as string | undefined) ?? null;
        if (hoveredIdRef.current !== null) {
          map.setFeatureState({ source: "counties", id: hoveredIdRef.current }, { hover: true });
        }

        const name = (f.properties?.NAME ?? "") as string;
        const burden = f.properties?.burden as number | null;
        setHover({
          countyName: `${name} County`,
          countyBurden: burden,
          stateFips,
          summary,
        });
        map.getCanvas().style.cursor = summary ? "pointer" : "default";
      });

      map.on("mouseleave", "counties-fill", () => {
        if (hoveredIdRef.current !== null) {
          map.setFeatureState({ source: "counties", id: hoveredIdRef.current }, { hover: false });
        }
        hoveredIdRef.current = null;
        setHover(null);
        map.getCanvas().style.cursor = "";
      });

      map.on("click", "counties-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const fips = readFips(f);
        const stateFips = fips.slice(0, 2);
        const summary = summaryByStateFips.get(stateFips);
        if (summary) router.push(`/state/${summary.slug}`);
      });

      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Style switching: rebuild layers after setStyle since Mapbox wipes them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setStyle(STYLES[style]);
    map.once("style.load", async () => {
      const counties = await loadCounties();
      if (!counties) return;
      annotateCounties(counties, burdenByFips);
      addLayers(map, counties);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  function addLayers(map: mapboxgl.Map, counties: GeoJSON.FeatureCollection) {
    if (map.getSource("counties")) {
      (map.getSource("counties") as mapboxgl.GeoJSONSource).setData(counties);
    } else {
      map.addSource("counties", { type: "geojson", data: counties });
    }

    if (!map.getLayer("counties-fill")) {
      map.addLayer({
        id: "counties-fill",
        type: "fill",
        source: "counties",
        paint: {
          "fill-color": [
            "case",
            ["==", ["get", "burden"], null], NO_DATA,
            ["step",
              ["get", "burden"],
              PALETTE[0],
              breakpoints[1] || 1, PALETTE[1],
              breakpoints[2] || 2, PALETTE[2],
              breakpoints[3] || 3, PALETTE[3],
              breakpoints[4] || 4, PALETTE[4],
              breakpoints[4] ? breakpoints[4] * 2 : 5, PALETTE[5],
            ],
          ],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 0.95,
            0.78,
          ],
        },
      });
    }

    if (!map.getLayer("counties-line")) {
      map.addLayer({
        id: "counties-line",
        type: "line",
        source: "counties",
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false], "rgba(255,255,255,0.65)",
            "rgba(255,255,255,0.10)",
          ],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "hover"], false], 1.5,
            0.4,
          ],
        },
      });
    }
  }

  if (!TOKEN) {
    return (
      <div className="map-frame" style={{ padding: 24 }}>
        <p className="meta-mono" style={{ color: "var(--fg-3)" }}>
          MAP UNAVAILABLE · NEXT_PUBLIC_MAPBOX_TOKEN not set in frontend/.env.local
        </p>
      </div>
    );
  }

  return (
    <div className="map-frame">
      <div className="map-toolbar">
        <span className="meta-mono">STYLE</span>
        {(Object.keys(STYLES) as StyleKey[]).map((k) => (
          <button
            key={k}
            type="button"
            className={`mt-btn ${style === k ? "active" : ""}`}
            onClick={() => setStyle(k)}
          >
            {k === "dark" ? "Dark" : k === "light" ? "Light" : "Satellite"}
          </button>
        ))}
      </div>
      <div className="map-canvas-wrap">
        <div ref={containerRef} className="map-canvas" aria-label="National county TRI choropleth" />
        {hover && hover.summary && (
          <StateHoverPanel hover={hover} />
        )}
        {hover && !hover.summary && (
          <div className="map-hover">
            <span className="meta-mono">{hover.countyName.toUpperCase()}</span>
            <span style={{ color: "var(--fg-3)" }}>state not yet ingested</span>
          </div>
        )}
      </div>
      <div className="map-legend">
        <span className="meta-mono">TRI total releases (lbs/yr)</span>
        <div className="ramp">
          {PALETTE.map((c) => (
            <span key={c} style={{ background: c }} aria-hidden="true" />
          ))}
        </div>
        <span className="meta-mono" style={{ color: "var(--fg-4)" }}>LOW → HIGH</span>
      </div>
    </div>
  );
}

// --- hover panel ----------------------------------------------------------

function StateHoverPanel({ hover }: { hover: HoverInfo }) {
  const summary = hover.summary!;
  const yoy = summary.yoy_pct_change;
  const arc = summary.long_arc_pct_change;
  const yoyDown = yoy != null && yoy < 0;
  const arcDown = arc != null && arc < 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        left: 14,
        width: 300,
        background: "rgba(14,17,22,0.95)",
        border: "1px solid var(--line-2)",
        padding: "14px 16px",
        borderRadius: "var(--r-3)",
        color: "var(--fg)",
        pointerEvents: "none",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        zIndex: 2,
      }}
    >
      <div className="kicker" style={{ color: "var(--ink-3)" }}>HOVERING</div>
      <h3
        style={{
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          fontSize: 22,
          letterSpacing: "-0.01em",
          margin: "4px 0 4px",
          color: "var(--fg)",
        }}
      >
        {summary.name}
      </h3>
      <p style={{ fontSize: 12, color: "var(--fg-3)", margin: "0 0 12px" }}>
        {hover.countyName} · {summary.reporting_year} TRI
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="stat">
          <div className="num" style={{ fontSize: 20 }}>{poundsLabel(summary.total_releases_pounds)}</div>
          <div className="label">Total releases</div>
        </div>
        <div className="stat">
          <div className="num" style={{ fontSize: 20 }}>{summary.facilities_tracked.toLocaleString()}</div>
          <div className="label">Facilities tracked</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <div className="stat">
          <div
            className="num"
            style={{
              fontSize: 18,
              color: yoy == null ? "var(--fg)" : yoyDown ? "var(--score-high)" : "var(--score-low)",
            }}
          >
            {yoy == null ? "—" : `${yoy > 0 ? "+" : ""}${yoy.toFixed(1)}%`}
          </div>
          <div className="label">YoY change</div>
        </div>
        <div className="stat">
          <div
            className="num"
            style={{
              fontSize: 18,
              color: arc == null ? "var(--fg)" : arcDown ? "var(--score-high)" : "var(--score-low)",
            }}
          >
            {arc == null ? "—" : `${arc > 0 ? "+" : ""}${arc.toFixed(0)}%`}
          </div>
          <div className="label">Since {summary.long_arc_baseline_year}</div>
        </div>
      </div>

      {hover.countyBurden != null && (
        <p style={{ fontSize: 11, color: "var(--fg-3)", margin: "12px 0 0" }}>
          {hover.countyName} alone: <span className="num-mono" style={{ color: "var(--fg-2)" }}>{poundsLabel(hover.countyBurden)}</span>
        </p>
      )}

      <div
        style={{
          marginTop: 14,
          color: "var(--fg-4)",
          fontSize: 10,
          letterSpacing: "0.08em",
          fontFamily: "var(--font-mono)",
        }}
      >
        CLICK COUNTY TO OPEN {summary.name.toUpperCase()} →
      </div>
    </div>
  );
}

// --- helpers --------------------------------------------------------------

// Mapbox normalizes numeric-looking GeoJSON ids to numbers (e.g. "01001" →
// 1001) and drops leading zeros, which broke `.slice()` in event handlers.
// Read FIPS from properties.fips (which we set ourselves below from the raw
// id) and pad defensively so leading zeros are preserved either way.
function fipsFromId(id: string | number | null | undefined): string {
  if (typeof id === "string") return id;
  if (id == null) return "";
  return String(id).padStart(5, "0");
}

function readFips(f: { id?: string | number; properties?: Record<string, unknown> | null }): string {
  const fromProps = f.properties?.fips;
  if (typeof fromProps === "string" && fromProps.length === 5) return fromProps;
  return fipsFromId((f.id as string | number | undefined) ?? null);
}

function annotateCounties(fc: GeoJSON.FeatureCollection, burdenByFips: Map<string, number>) {
  fc.features.forEach((f) => {
    const fips = fipsFromId(f.id as string | number | undefined);
    const burden = burdenByFips.get(fips);
    f.properties = {
      ...(f.properties ?? {}),
      fips,
      burden: burden ?? null,
      burden_label: burden != null ? poundsLabel(burden) : "no TRI data",
    };
  });
}

let countiesCache: GeoJSON.FeatureCollection | null = null;
async function loadCounties(): Promise<GeoJSON.FeatureCollection | null> {
  if (countiesCache) return countiesCache;
  const res = await fetch("/geo/counties.geojson");
  if (!res.ok) return null;
  countiesCache = (await res.json()) as GeoJSON.FeatureCollection;
  return countiesCache;
}
