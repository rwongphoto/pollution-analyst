import type { PollutantPathway } from "@/lib/types";

export function getPathwayHealthRisk(pathway: PollutantPathway, label: string): string | null {
  const l = label.toLowerCase();
  if (l.includes("pm2.5")) {
    return "Fine inhalable particles 2.5 micrometers or smaller. They travel deep into the lungs and into the bloodstream — linked to asthma, heart disease, stroke, and premature death.";
  }
  if (l.includes("ozone")) {
    return "Ground-level ozone (smog) forms when vehicle and industrial emissions react in sunlight. Inflames the airways, triggers asthma attacks, and worsens heart and lung disease.";
  }
  if (l.includes("no₂") || l.includes("no2") || l.includes("nitrogen dioxide")) {
    return "A tailpipe and combustion gas. Concentrates near busy roads and industrial sites; raises risk of airway inflammation, asthma, and lower respiratory infections in children.";
  }
  if (l.includes("lifetime cancer risk")) {
    return "EPA-modeled added cancer cases per million residents from a lifetime of breathing local air toxics. EPA flags 100-in-a-million as elevated.";
  }
  if (l.includes("formaldehyde")) {
    return "An air toxic emitted by refineries, wood products, and combustion. EPA classifies it as a known human carcinogen — long-term inhalation raises cancer risk.";
  }
  if (l.includes("benzene")) {
    return "An air toxic from gasoline, refineries, and tobacco smoke. A known human carcinogen — chronic exposure is linked to leukemia and other blood cancers.";
  }
  switch (pathway) {
    case "tri_air":
      return "Toxic chemicals reported by industrial facilities as released into the air — fugitive leaks plus smokestack emissions. Higher pounds means more inhaled exposure for nearby residents.";
    case "tri_water":
      return "Toxic chemicals reported by industrial facilities as discharged to surface waters (rivers, lakes, the ocean). Affects fishing, recreation, and downstream drinking-water intakes.";
    case "tri_land":
      return "Toxic chemicals released to land on-site or transferred off-site for disposal — landfills, deep-well injection, and similar. Risks groundwater contamination over time.";
    case "tri_release":
      return "Total toxic chemical releases reported to EPA's Toxics Release Inventory across air, water, and land.";
    case "ghg":
      return "Greenhouse gases reported by large industrial emitters under EPA's GHGRP, in metric tons of CO₂ equivalent. Drives climate warming and the heat-related health effects that follow.";
    case "criteria_air":
      return "Common air pollutants that EPA caps under the National Ambient Air Quality Standards (NAAQS) — PM, ozone, NO₂, SO₂, CO, lead.";
    case "hazardous_air":
      return "Hazardous air pollutants — toxic chemicals tracked by EPA's AirToxScreen exposure model and linked to elevated cancer or non-cancer risk.";
    case "drinking_water":
      return "Contaminants regulated under the Safe Drinking Water Act, monitored at public water systems.";
    case "pesticide":
      return "Pesticide active ingredients tracked under EPA pesticide programs.";
    default:
      return null;
  }
}
