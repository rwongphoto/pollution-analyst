const EJ_RISKS: Record<string, string> = {
  "PM2.5 (fine particulate)":
    "Fine inhalable particles 2.5 micrometers or smaller. They travel deep into the lungs and into the bloodstream — linked to asthma, heart disease, stroke, and premature death.",
  "Ozone":
    "Ground-level ozone (smog) inflames the airways. Even short exposures trigger asthma attacks and worsen chronic lung and heart disease.",
  "Nitrogen dioxide (NO₂)":
    "A tailpipe and combustion gas. Concentrates near busy roads and industrial sites; raises risk of airway inflammation, asthma, and lower respiratory infections in children.",
  "Diesel particulate":
    "Soot from diesel engines (trucks, trains, ports, construction). EPA classifies it as a likely human carcinogen and a major driver of childhood asthma near freight corridors.",
  "Toxic releases (RSEI)":
    "EPA's Risk-Screening Environmental Indicators score — weights TRI chemical releases by toxicity, where they go, and how many people are nearby. Higher means greater modeled cancer and chronic-health risk.",
  "Traffic proximity":
    "Population-weighted distance to high-volume roads. Living close to heavy traffic raises exposure to PM2.5, NO₂, and diesel exhaust — and the cardiovascular and asthma risks that follow.",
  "Lead-paint risk (pre-1960 housing)":
    "Share of housing built before 1960, when lead-based paint was common. Dust from deteriorating paint is the leading cause of childhood lead poisoning, which permanently impairs cognitive development.",
  "Superfund site proximity":
    "Population-weighted distance to NPL Superfund sites — the most contaminated waste sites in the country. Nearby groundwater, soil, and air can carry industrial solvents, metals, and other long-lived contaminants.",
  "RMP-facility proximity":
    "Distance to facilities holding chemicals at quantities large enough to require an EPA Risk Management Plan (refineries, fertilizer plants, etc.). These pose acute exposure risk during accidental releases.",
  "Hazardous-waste site proximity":
    "Distance to RCRA hazardous-waste handlers (treatment, storage, disposal facilities). Indicates potential exposure to industrial chemicals in air, soil, and groundwater.",
  "Underground storage tanks":
    "Density of underground tanks (gasoline, heating oil, industrial fluids). Leaking tanks are a leading source of benzene and other volatile organic compounds in groundwater drinking-water supplies.",
  "NPDES wastewater proximity":
    "Distance to permitted industrial wastewater dischargers. Closer proximity raises exposure to pollutants released into surface waters used for fishing, recreation, and downstream drinking-water intakes.",
  "Drinking-water non-compliance":
    "EPA score for public water systems with health-based Safe Drinking Water Act violations. Higher means more residents on systems that recently exceeded safe limits for contaminants like lead, arsenic, or nitrate.",
};

export function getEjIndicatorRisk(label: string): string | null {
  return EJ_RISKS[label] ?? null;
}
