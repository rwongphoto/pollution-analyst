"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { FacilitySummary } from "@/lib/types";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const STYLES = {
  dark: "mapbox://styles/mapbox/dark-v11",
  light: "mapbox://styles/mapbox/light-v11",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
} as const;
type StyleKey = keyof typeof STYLES;

type Props = {
  countyFips: string;
  countyName: string;
  facilities: FacilitySummary[];
};

function poundsLabel(p: number): string {
  if (p >= 1_000_000) return `${(p / 1_000_000).toFixed(1)}M lbs`;
  if (p >= 1_000) return `${(p / 1_000).toFixed(0)}k lbs`;
  return `${p} lbs`;
}

export function CountyMap({ countyFips, countyName, facilities }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [style, setStyle] = useState<StyleKey>("dark");
  const [ready, setReady] = useState(false);

  const placeable = facilities.filter((f) => f.lat != null && f.lng != null);
  const noPoints = placeable.length === 0;

  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLES[style],
      center: [-98, 38],
      zoom: 3,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", async () => {
      const polygon = await loadCountyPolygon(countyFips);
      if (!mapRef.current) return;
      addLayers(map, polygon, placeable);
      const bbox = polygon ? polygonBbox(polygon) : facilityBbox(placeable);
      if (bbox) map.fitBounds(bbox, { padding: 60, duration: 0, maxZoom: 12 });
      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setStyle(STYLES[style]);
    map.once("style.load", async () => {
      const polygon = await loadCountyPolygon(countyFips);
      addLayers(map, polygon, placeable);
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
        <span className="spacer" style={{ flex: 1 }} />
        <span className="meta-mono" style={{ color: "var(--fg-3)" }}>
          {placeable.length} TRI {placeable.length === 1 ? "facility" : "facilities"} · {countyName}
        </span>
      </div>
      <div className="map-canvas-wrap">
        <div ref={containerRef} className="map-canvas small" aria-label={`${countyName} facility map`} />
        {noPoints && (
          <div className="map-empty">
            <p className="meta-mono">NO FACILITY COORDINATES IN PUBLISHED DATA</p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- helpers --------------------------------------------------------------

let countiesCache: GeoJSON.FeatureCollection | null = null;
async function loadCountyPolygon(fips: string): Promise<GeoJSON.Feature | null> {
  if (!countiesCache) {
    const res = await fetch("/geo/counties.geojson");
    if (!res.ok) return null;
    countiesCache = (await res.json()) as GeoJSON.FeatureCollection;
  }
  return countiesCache.features.find((f) => f.id === fips) ?? null;
}

function polygonBbox(feature: GeoJSON.Feature): [[number, number], [number, number]] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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
  const g = feature.geometry;
  if (g && (g.type === "Polygon" || g.type === "MultiPolygon")) visit(g.coordinates);
  if (!isFinite(minX)) return null;
  return [[minX, minY], [maxX, maxY]];
}

function facilityBbox(facilities: FacilitySummary[]): [[number, number], [number, number]] | null {
  if (facilities.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of facilities) {
    if (f.lng == null || f.lat == null) continue;
    if (f.lng < minX) minX = f.lng;
    if (f.lat < minY) minY = f.lat;
    if (f.lng > maxX) maxX = f.lng;
    if (f.lat > maxY) maxY = f.lat;
  }
  if (!isFinite(minX)) return null;
  return [[minX, minY], [maxX, maxY]];
}

function addLayers(
  map: mapboxgl.Map,
  polygon: GeoJSON.Feature | null,
  facilities: FacilitySummary[],
) {
  if (polygon) {
    const fc: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [polygon] };
    if (map.getSource("county")) {
      (map.getSource("county") as mapboxgl.GeoJSONSource).setData(fc);
    } else {
      map.addSource("county", { type: "geojson", data: fc });
    }
    if (!map.getLayer("county-fill")) {
      map.addLayer({
        id: "county-fill",
        type: "fill",
        source: "county",
        paint: {
          "fill-color": "#3B82F6",
          "fill-opacity": 0.08,
        },
      });
    }
    if (!map.getLayer("county-line")) {
      map.addLayer({
        id: "county-line",
        type: "line",
        source: "county",
        paint: {
          "line-color": "#3B82F6",
          "line-width": 1.6,
          "line-dasharray": [2, 2],
        },
      });
    }
  }

  const facilityFC: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: facilities.map((f) => ({
      type: "Feature",
      properties: {
        name: f.name,
        parent: f.parent_company,
        city: f.city,
        pounds: f.total_pounds_recent,
        slug: f.slug,
        state: f.state,
        chemical: f.top_chemical,
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
          0, 5,
          500_000, 10,
          2_500_000, 18,
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
      const p = f.properties as {
        name: string; parent: string | null; city: string; pounds: number;
        slug: string; state: string; chemical: string;
      };
      const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      new mapboxgl.Popup({ closeButton: true, offset: 12 })
        .setLngLat(coords)
        .setHTML(
          `<div class="map-popup">
            <strong>${p.name}</strong>
            ${p.parent ? `<div class="muted">${p.parent}</div>` : ""}
            <div class="muted">${p.city ?? ""}</div>
            <div class="num-mono">${poundsLabel(p.pounds)} · TRI</div>
            <div class="muted" style="font-size:11px">Top chemical: ${p.chemical}</div>
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
