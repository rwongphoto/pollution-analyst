"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { CountySummary, FacilitySummary } from "@/lib/types";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const STYLES = {
  dark: "mapbox://styles/mapbox/dark-v11",
  light: "mapbox://styles/mapbox/light-v11",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
} as const;
type StyleKey = keyof typeof STYLES;

type DirectoryEntry = { fips?: string; total_releases_pounds?: number };

type Props = {
  stateFips: string;
  stateName: string;
  topCounties: CountySummary[];
  topFacilities: FacilitySummary[];
  // Every published county for the state. When provided, the choropleth
  // covers all of them rather than only the top 10 in `topCounties`.
  countiesDirectory?: DirectoryEntry[];
};

const PALETTE = ["#1a3a4a", "#2a5a6a", "#4a7a7a", "#c5a945", "#d97a30", "#c44545"];
const NO_DATA = "#1B2030";

function poundsLabel(p: number): string {
  if (p >= 1_000_000) return `${(p / 1_000_000).toFixed(1)}M lbs`;
  if (p >= 1_000) return `${(p / 1_000).toFixed(0)}k lbs`;
  return `${p} lbs`;
}

export function StateMap({ stateFips, stateName, topCounties, topFacilities, countiesDirectory }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [style, setStyle] = useState<StyleKey>("dark");
  const [ready, setReady] = useState(false);
  const [hover, setHover] = useState<{ name: string; pounds: number | null } | null>(null);

  // Burden-by-FIPS — prefer the full directory when available so every
  // published county shades, not just the top 10. Falls back to topCounties
  // for older payloads that haven't been re-published.
  const burdenByFips = (() => {
    const m = new Map<string, number>();
    for (const c of topCounties) m.set(c.fips, c.total_releases_pounds);
    for (const c of countiesDirectory ?? []) {
      if (c.fips != null && c.total_releases_pounds != null && !m.has(c.fips)) {
        m.set(c.fips, c.total_releases_pounds);
      }
    }
    return m;
  })();

  // Tier breakpoints derived from all known burden values for this state.
  const breakpoints = (() => {
    const sorted = [...burdenByFips.values()].sort((a, b) => a - b);
    if (sorted.length === 0) return [0, 0, 0, 0, 0];
    const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))];
    return [q(0.0), q(0.2), q(0.4), q(0.6), q(0.8)];
  })();

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLES[style],
      center: [-119.5, 37.3],
      zoom: 5,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", async () => {
      const counties = await loadCounties(stateFips);
      if (!counties || !mapRef.current) return;
      annotateCounties(counties, burdenByFips);
      addLayers(map, counties as GeoJSON.FeatureCollection, breakpoints, topFacilities);
      const bbox = computeBbox(counties as GeoJSON.FeatureCollection);
      if (bbox) map.fitBounds(bbox, { padding: 40, duration: 0 });

      // Hover behaviour
      map.on("mousemove", "counties-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const name = (f.properties?.NAME ?? "") as string;
        const burden = f.properties?.burden as number | null;
        setHover({ name: `${name} County`, pounds: burden });
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "counties-fill", () => {
        setHover(null);
        map.getCanvas().style.cursor = "";
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
      const counties = await loadCounties(stateFips);
      if (!counties) return;
      annotateCounties(counties, burdenByFips);
      addLayers(map, counties as GeoJSON.FeatureCollection, breakpoints, topFacilities);
    });
  }, [style]);

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
        <div ref={containerRef} className="map-canvas" aria-label={`${stateName} county TRI choropleth`} />
        {hover && (
          <div className="map-hover">
            <span className="meta-mono">{hover.name.toUpperCase()}</span>
            <span>{hover.pounds == null ? "no TRI data" : poundsLabel(hover.pounds)}</span>
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

// --- helpers --------------------------------------------------------------

function annotateCounties(fc: GeoJSON.FeatureCollection, burdenByFips: Map<string, number>) {
  fc.features.forEach((f) => {
    const fips = (f.id as string) ?? "";
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
async function loadCounties(stateFips: string): Promise<GeoJSON.FeatureCollection | null> {
  if (!countiesCache) {
    const res = await fetch("/geo/counties.geojson");
    if (!res.ok) return null;
    countiesCache = (await res.json()) as GeoJSON.FeatureCollection;
  }
  // Shallow-clone features for this state; rest filtered out so the choropleth
  // is scoped to in-state counties only.
  const filtered = countiesCache.features.filter((f) =>
    typeof f.id === "string" && f.id.startsWith(stateFips),
  );
  return { type: "FeatureCollection", features: filtered };
}

function computeBbox(fc: GeoJSON.FeatureCollection): [[number, number], [number, number]] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const visit = (coords: unknown) => {
      if (Array.isArray(coords)) {
        if (typeof coords[0] === "number" && typeof coords[1] === "number") {
          const [x, y] = coords as [number, number];
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        } else {
          coords.forEach(visit);
        }
      }
    };
    if (g.type === "Polygon" || g.type === "MultiPolygon") visit(g.coordinates);
  }
  if (!isFinite(minX)) return null;
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

function addLayers(
  map: mapboxgl.Map,
  counties: GeoJSON.FeatureCollection,
  breakpoints: number[],
  facilities: FacilitySummary[],
) {
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
        "fill-opacity": 0.78,
      },
    });
  }

  if (!map.getLayer("counties-line")) {
    map.addLayer({
      id: "counties-line",
      type: "line",
      source: "counties",
      paint: {
        "line-color": "rgba(255,255,255,0.18)",
        "line-width": 0.6,
      },
    });
  }

  // Facility markers (top 10), sized by recent pounds.
  const facilityFC: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: facilities
      .filter((f) => f.lat != null && f.lng != null)
      .map((f) => ({
        type: "Feature",
        properties: {
          name: f.name,
          city: f.city,
          pounds: f.total_pounds_recent,
          slug: f.slug,
          state: f.state,
        },
        geometry: { type: "Point", coordinates: [f.lng!, f.lat!] },
      })),
  };
  if (map.getSource("facilities")) {
    (map.getSource("facilities") as mapboxgl.GeoJSONSource).setData(facilityFC);
  } else {
    map.addSource("facilities", { type: "geojson", data: facilityFC });
  }
  if (!map.getLayer("facilities-circle")) {
    map.addLayer({
      id: "facilities-circle",
      type: "circle",
      source: "facilities",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["get", "pounds"],
          0, 4,
          1_000_000, 10,
          5_000_000, 16,
        ],
        "circle-color": "#FF6B6B",
        "circle-stroke-color": "#0E1116",
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.9,
      },
    });
    map.on("click", "facilities-circle", (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as { name: string; city: string; pounds: number; slug: string; state: string };
      const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      new mapboxgl.Popup({ closeButton: true, offset: 12 })
        .setLngLat(coords)
        .setHTML(
          `<div class="map-popup">
            <strong>${p.name}</strong>
            <div class="muted">${p.city ?? ""}</div>
            <div class="num-mono">${poundsLabel(p.pounds)} · TRI</div>
            <a href="/state/${p.state}/facility/${p.slug}">View facility →</a>
          </div>`,
        )
        .addTo(map);
    });
    map.on("mouseenter", "facilities-circle", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "facilities-circle", () => {
      map.getCanvas().style.cursor = "";
    });
  }
}
