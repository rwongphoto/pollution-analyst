export type LaneOverride = {
  label: string;
  tooltip?: { heading: string; body: string };
};

export const LANE_OVERRIDES: Record<string, LaneOverride> = {
  pm25_annual: {
    label: "PM2.5 Annual Mean",
    tooltip: {
      heading: "What is PM2.5?",
      body: "Fine inhalable particles 2.5 micrometers or smaller — about 1/30th the width of a human hair. They travel deep into the lungs and into the bloodstream, and are linked to asthma, heart disease, stroke, and premature death.",
    },
  },
  cancer_risk: {
    label: "Lifetime Cancer Risk (All Pollutants)",
    tooltip: {
      heading: "What this means",
      body: "EPA-modeled added cancer cases per million residents from a lifetime of breathing local air toxics (AirToxScreen). EPA flags 100-in-a-million as elevated.",
    },
  },
  tri_air: {
    label: "TRI Air Releases",
    tooltip: {
      heading: "What this means",
      body: "Toxic chemicals reported by industrial facilities as released to the air — fugitive leaks plus smokestack emissions. Higher pounds means more inhaled exposure for nearby residents. Self-reported under EPA's Toxics Release Inventory.",
    },
  },
  tri_total: {
    label: "Total TRI Releases (Air + Water + Land)",
    tooltip: {
      heading: "What this means",
      body: "All toxic chemical releases reported to EPA's Toxics Release Inventory across air, water, and on-site/off-site land disposal. A broader exposure footprint than air alone.",
    },
  },
  tri_water: {
    label: "TRI Water Releases",
    tooltip: {
      heading: "What this means",
      body: "Toxic chemicals discharged to surface waters — rivers, lakes, and other receiving streams — reported under EPA's Toxics Release Inventory. Drives downstream contamination of drinking-water intakes, fisheries, and recreation.",
    },
  },
  tri_land: {
    label: "TRI Land Releases",
    tooltip: {
      heading: "What this means",
      body: "Toxic chemicals released to land — on-site landfills, surface impoundments, land application, and underground injection — plus off-site transfers for disposal. Drives long-term soil and groundwater contamination risk.",
    },
  },
  ghg: {
    label: "Greenhouse Gases (GHGRP)",
    tooltip: {
      heading: "What this means",
      body: "Greenhouse gases reported by large industrial emitters under EPA's Greenhouse Gas Reporting Program, in metric tons of CO₂ equivalent. Drives climate warming and the heat-related health effects that follow.",
    },
  },
  contaminants: {
    label: "Most Contaminants Reported",
    tooltip: {
      heading: "What this means",
      body: "Distinct contaminants of concern logged for the site under EPA's Superfund Enterprise Management System (SEMS). A larger count signals a more chemically complex contamination footprint — not necessarily higher mass — across groundwater, soil, sediment, and surface-water media.",
    },
  },
  water_linkage: {
    label: "Most Nearby Groundwater Utilities",
    tooltip: {
      heading: "What this means",
      body: "Public water systems drawing groundwater within roughly 5 miles of the NPL site. Distance is computed from site coordinates to served-city centroids — coarse on purpose. A non-zero count means downstream drinking-water exposure is at least geographically plausible.",
    },
  },
};

export const LANE_METHODOLOGY: Record<string, string> = {
  pm25_annual: "/methodology#taxonomy",
  cancer_risk: "/methodology#taxonomy",
  tri_air: "/methodology#tri",
  tri_water: "/methodology#tri",
  tri_land: "/methodology#tri",
  tri_total: "/methodology#tri",
  ghg: "/methodology#taxonomy",
  contaminants: "/methodology#superfund",
  water_linkage: "/methodology#superfund",
};

// Short labels for the JumpStrip on each /rankings/* page. Most/least tables
// for the same lane share one entry — the strip is per-metric, not per-table.
export const LANE_JUMP_LABEL: Record<string, string> = {
  tri_total: "Total TRI",
  tri_air: "TRI Air",
  tri_water: "TRI Water",
  tri_land: "TRI Land",
  pm25_annual: "PM2.5",
  cancer_risk: "Cancer Risk",
  ghg: "GHG",
  contaminants: "Contaminants",
  water_linkage: "Groundwater",
};
