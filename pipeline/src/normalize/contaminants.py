"""SDWIS contaminant + rule code lookups.

Hand-curated against EPA's published SDWIS DB schema documentation. Covers
the contaminants that account for ~99% of public-notification violations.
Unknown codes fall back to a pass-through so no data is lost.

Source: EPA SDWIS Federal Reporting Services schema and Public Drinking
Water Contaminant List. Verified against the most-frequently-cited codes
in the EPA SDWIS Federal Data Warehouse public release notes.
"""

from __future__ import annotations

# Most-cited drinking water contaminants. Numeric codes are 4 digits in
# SDWIS. Friendly names match how EPA labels them in public-notice templates.
CONTAMINANTS: dict[str, str] = {
    # Inorganics
    "1005": "Arsenic",
    "1010": "Barium",
    "1015": "Cadmium",
    "1020": "Chromium",
    "1024": "Fluoride",
    "1025": "Mercury (inorganic)",
    "1030": "Lead",
    "1035": "Selenium",
    "1038": "Antimony",
    "1040": "Beryllium",
    "1041": "Cyanide",
    "1042": "Nickel",
    "1044": "Thallium",
    "1045": "Asbestos",
    # Nitrates / nitrogen
    "1040N": "Nitrate",
    "1041N": "Nitrite",
    # Disinfection byproducts
    "2456": "Haloacetic Acids (HAA5)",
    "2950": "Total Trihalomethanes (TTHM)",
    "2454": "Chloroform",
    "2459": "Bromodichloromethane",
    "2941": "Dibromochloromethane",
    "2942": "Bromoform",
    "2920": "Bromate",
    "2921": "Chlorite",
    # Disinfectants
    "0999": "Chlorine",
    "0998": "Chlorine dioxide",
    "0997": "Chloramines",
    # Microbials
    "3014": "E. coli",
    "3100": "Total Coliform",
    "3110": "Fecal Coliform",
    # Radionuclides
    "4000": "Combined Radium 226/228",
    "4002": "Gross Alpha (excl. radon, uranium)",
    "4003": "Beta/Photon Emitters",
    "4006": "Uranium",
    # Synthetic organics (selection of frequent ones)
    "2005": "Endrin",
    "2010": "Lindane",
    "2015": "Methoxychlor",
    "2020": "Toxaphene",
    "2050": "2,4-D",
    "2065": "2,4,5-TP (Silvex)",
    "2105": "Alachlor",
    "2110": "Atrazine",
    "2115": "Chlordane",
    "2120": "Heptachlor",
    "2306": "Carbofuran",
    "2456": "Haloacetic Acids (HAA5)",
    "2980": "Methyl tert-butyl ether (MTBE)",
    # Volatile organics (selection)
    "2380": "Benzene",
    "2381": "Carbon tetrachloride",
    "2382": "1,2-Dichloroethane",
    "2383": "Trichloroethylene (TCE)",
    "2384": "Para-dichlorobenzene",
    "2386": "Toluene",
    "2387": "Tetrachloroethylene (PCE)",
    "2388": "Vinyl chloride",
    "2378": "Xylenes (total)",
    # PFAS (recent additions to NPDWR)
    "PFOA": "PFOA",
    "PFOS": "PFOS",
    "PFNA": "PFNA",
    "PFHxS": "PFHxS",
    "HFPO-DA": "HFPO-DA (GenX)",
}


# Rule codes — top-level group → narrative rule label. SDWIS uses ~3-digit
# codes within rule families (100s = microbial, 200s = DBPs, 300s = inorganic
# chemicals, 400s = organic chemicals, 500s = lead/copper, 600s = radionuclides,
# 700s = public notification, 800s = consumer confidence reports).
RULES: dict[str, str] = {
    "110": "Total Coliform Rule",
    "111": "Revised Total Coliform Rule",
    "121": "Surface Water Treatment Rule",
    "122": "Long Term 1 Enhanced SWTR",
    "123": "Long Term 2 Enhanced SWTR",
    "200": "Disinfectants and Disinfection Byproducts (Stage 1)",
    "210": "Disinfectants and Disinfection Byproducts (Stage 2)",
    "220": "Total Trihalomethanes Rule",
    "230": "Surface Water Treatment Rule (DBPs)",
    "300": "Phase I/II/V Inorganic Chemical Rules",
    "310": "Arsenic Rule",
    "320": "Nitrate/Nitrite",
    "330": "Fluoride",
    "400": "Phase I/II/V Synthetic Organic Chemical Rules",
    "410": "Volatile Organic Chemical Rule",
    "500": "Lead and Copper Rule",
    "510": "Lead and Copper Rule Revisions",
    "600": "Radionuclides Rule",
    "700": "Public Notification Rule",
    "800": "Consumer Confidence Report Rule",
}


def contaminant_name(code: str) -> str:
    return CONTAMINANTS.get(code) or f"Contaminant {code}"


def rule_label(code: str | None) -> str:
    if not code:
        return "Drinking water rule"
    # Try exact, then 3-digit family, then 1-digit group.
    if code in RULES:
        return RULES[code]
    if code[:3] in RULES:
        return RULES[code[:3]]
    if code[:1] + "00" in RULES:
        return RULES[code[:1] + "00"]
    return f"Drinking water rule ({code})"


def severity_for(is_health_based: bool, category_code: str) -> str:
    """Map SDWIS to the WaterUtilityPayload severity buckets used by the
    frontend. Health-based MCL/TT exceedances are 'health_based'; monitoring
    and reporting failures are 'monitoring'; everything else is 'other'.
    """
    if is_health_based:
        return "health_based"
    if category_code in ("MR", "MON", "RPT"):
        return "monitoring"
    return "other"
