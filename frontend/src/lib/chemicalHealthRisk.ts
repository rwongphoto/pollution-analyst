/**
 * Brief, sourced health-risk summaries for the chemicals that appear as
 * "Top chemical" in TRI rollups. Lookup is normalized so "Lead",
 * "Lead compounds", and "Lead And Lead Compounds" all hit the same entry.
 *
 * Framings stay descriptive (population-level, agency-classified) — the site
 * does not give individual medical advice.
 */

const RISKS: Record<string, string> = {
  // — Metals
  lead: "Neurotoxin. Even low childhood exposure impairs cognitive development; chronic adult exposure damages kidneys and the cardiovascular system. (EPA, ATSDR)",
  mercury: "Neurotoxin. Methylmercury bioaccumulates up the food chain and damages the developing nervous system. (EPA, ATSDR)",
  chromium: "Hexavalent chromium (Cr-VI) is an IARC Group 1 carcinogen via inhalation, causing lung cancer; trivalent chromium is far less toxic. (IARC, EPA)",
  nickel: "Nickel compounds are IARC Group 1 carcinogens; inhalation exposure raises lung and nasal cancer risk. (IARC)",
  manganese: "Excess inhalation can cause manganism, a Parkinson-like neurological disorder. (ATSDR)",
  copper: "Inhaled copper fumes cause metal-fume fever; chronic ingestion above EPA's 1.3 mg/L action level damages the liver. (EPA)",
  zinc: "Generally low acute toxicity. Chronic high-dose exposure disrupts copper absorption and immune function. (ATSDR)",
  barium: "Soluble barium compounds are toxic if ingested, affecting the heart, kidneys, and nervous system. Insoluble forms (e.g. barium sulfate) are far less toxic. (EPA)",
  silver: "Chronic exposure can cause argyria — irreversible blue-grey skin discoloration. Generally low systemic toxicity. (ATSDR)",
  vanadium: "Respiratory irritant. Chronic high exposure causes 'green tongue' and bronchitis. (NIOSH)",
  aluminum: "Inhaled aluminum fumes can cause lung scarring (aluminosis); high cumulative exposure has been linked to neurological effects. (NIOSH)",
  "aluminum oxide": "Fibrous forms can damage the lungs similar to other particulate dusts. (NIOSH)",
  "molybdenum trioxide": "IARC Group 2B possible carcinogen; respiratory irritant. (IARC)",

  // — Acids and inorganic gases
  "hydrochloric acid": "Aerosolized HCl is a corrosive respiratory irritant; chronic exposure damages teeth and respiratory tissue. (NIOSH)",
  "sulfuric acid": "Acid mists are an IARC Group 1 carcinogen via inhalation (laryngeal cancer) and corrosive on contact. (IARC)",
  "nitric acid": "Strong corrosive irritant to skin, eyes, and the respiratory tract. (NIOSH)",
  ammonia: "Severe respiratory and eye irritant; high concentrations cause chemical burns to lung tissue. (EPA)",
  chlorine: "Strong respiratory irritant; high exposure causes pulmonary edema. (CDC)",
  "hydrogen sulfide": "Acutely toxic at high concentrations (paralyzes the olfactory nerve, then respiratory failure); chronic low-level exposure causes eye and respiratory irritation. (NIOSH)",
  "hydrogen cyanide": "Acutely lethal at high doses by blocking cellular respiration; chronic low-dose exposure damages the thyroid and nervous system. (EPA, ATSDR)",
  cyanide: "Acutely lethal at high doses by blocking cellular respiration; chronic low-dose exposure damages the thyroid and nervous system. (EPA, ATSDR)",
  chloropicrin: "Severe lung irritant; used historically as a chemical weapon. (NIOSH)",
  "peracetic acid": "Strong respiratory and eye irritant; corrosive at high concentrations. (NIOSH)",
  "sulfuryl fluoride": "Acutely toxic by inhalation; potent greenhouse gas. (EPA)",

  // — Aromatic / VOC
  benzene: "IARC Group 1 carcinogen. Long-term inhalation causes leukemia and bone-marrow disorders. (IARC, EPA)",
  toluene: "Central-nervous-system depressant. Chronic high exposure causes hearing loss and developmental effects. (EPA, ATSDR)",
  xylene: "Eye, skin, and respiratory irritant; central-nervous-system effects from chronic exposure. (EPA)",
  ethylbenzene: "IARC Group 2B possible carcinogen; eye and respiratory irritant. (IARC)",
  styrene: "IARC Group 2A probable carcinogen; central-nervous-system effects from inhalation. (IARC, EPA)",
  naphthalene: "IARC Group 2B possible carcinogen; causes hemolytic anemia, especially in infants. (IARC)",
  "1,2,4-trimethylbenzene": "Eye, skin, and respiratory irritant; high exposure causes nervous-system effects. (ATSDR)",
  "polycyclic aromatic": "PAH class includes IARC Group 1 carcinogens (e.g., benzo[a]pyrene); long-term exposure raises cancer risk. (IARC, EPA)",
  "benzo[g,h,i]perylene": "Polycyclic aromatic hydrocarbon. The PAH class includes known and probable carcinogens. (EPA)",

  // — Aldehydes / amines / amides
  formaldehyde: "IARC Group 1 carcinogen. Linked to nasopharyngeal cancer; irritates the eyes, nose, and respiratory tract at low concentrations. (IARC, EPA)",
  acetaldehyde: "IARC Group 2B possible carcinogen (Group 1 in connection with alcohol consumption); eye and respiratory irritant. (IARC)",
  acrylamide: "IARC Group 2A probable human carcinogen; neurotoxic at occupational exposure levels. (IARC)",
  acetonitrile: "Metabolizes to cyanide in the body; high exposure causes nausea, weakness, and respiratory effects. (ATSDR)",
  diethanolamine: "Skin and eye irritant. Reacts with nitrites to form nitrosamines (probable carcinogens). (NIOSH)",
  "n,n-dimethylformamide": "Hepatotoxin; absorbed through skin; IARC Group 2A probable carcinogen. (IARC)",
  "n-methyl-2-pyrrolidone": "Reproductive and developmental toxicant; absorbed through skin. (EPA)",
  catechol: "Skin, eye, and respiratory irritant; suspected carcinogen at high doses. (NIOSH)",
  phenol: "Corrosive on contact; absorbed through skin; high exposure damages kidneys, liver, and the central nervous system. (NIOSH)",

  // — Halogenated solvents
  dichloromethane: "IARC Group 2A probable carcinogen; central-nervous-system depressant; banned for most consumer paint-stripper uses. (IARC, EPA)",
  tetrachloroethylene: "IARC Group 2A probable carcinogen; central-nervous-system effects; common dry-cleaning solvent. (IARC, EPA)",
  "1,2-dichloroethylene": "Eye and respiratory irritant; high exposure depresses the central nervous system. (ATSDR)",
  "bromotrifluoromethane": "Low acute toxicity; primarily an ozone-depleting substance phased out under the Montreal Protocol. (EPA)",
  "chlorodifluoromethane": "Asphyxiant in confined spaces; ozone-depleting substance phased out under the Montreal Protocol. (EPA)",

  // — Alcohols / ketones / esters
  methanol: "Acutely toxic if ingested or inhaled. Metabolizes to formaldehyde and formic acid, causing blindness and metabolic acidosis. (EPA)",
  "ethylene glycol": "Acutely toxic if ingested. Metabolizes to compounds that cause kidney failure. (EPA)",
  "n-butyl alcohol": "Eye and respiratory irritant; high exposure causes hearing loss and central-nervous-system effects. (NIOSH)",
  "sec-butyl alcohol": "Eye and respiratory irritant; central-nervous-system depressant at high exposure. (NIOSH)",
  "n-hexane": "Peripheral neurotoxin. Chronic exposure causes numbness and paralysis in the extremities. (ATSDR)",
  "methyl isobutyl ketone": "Eye, skin, and respiratory irritant; central-nervous-system depressant at high exposure. (NIOSH)",
  "methyl methacrylate": "Skin and respiratory sensitizer; can trigger occupational asthma and dermatitis. (OSHA)",
  "vinyl acetate": "IARC Group 2B possible carcinogen; eye and respiratory irritant. (IARC)",
  ethylene: "Simple asphyxiant at high concentrations; precursor to many polymers; low direct toxicity. (NIOSH)",
  propylene: "Simple asphyxiant; low direct toxicity at typical exposure levels. (NIOSH)",
  "ethylene oxide": "IARC Group 1 carcinogen. Causes lymphoid and breast cancers; potent mutagen. (IARC, EPA)",

  // — Isocyanates / sensitizers
  diisocyanates: "Leading cause of occupational asthma; severe respiratory sensitizers. (OSHA)",
  "toluene diisocyanate": "Severe respiratory sensitizer; leading cause of occupational asthma; IARC Group 2B. (IARC, OSHA)",
  "triglycidyl isocyanurate": "Skin and respiratory sensitizer; suspected mutagen. (OSHA)",

  // — Nitrogen / agricultural / glycol ethers
  nitrate: "Drinking-water nitrate causes methemoglobinemia ('blue-baby syndrome') in infants; EPA MCL is 10 mg/L as N. (EPA)",
  "certain glycol ethers": "Reproductive toxicants; some cause testicular damage and developmental harm. (EPA)",
  nitrapyrin: "Pesticide (nitrification inhibitor); EPA classifies as 'likely to be carcinogenic to humans.' (EPA)",
  "nonylphenol ethoxylates": "Endocrine disruptors; surfactants that degrade into persistent estrogenic nonylphenol. (EPA)",

  // — Persistent / bioaccumulative
  "asbestos": "IARC Group 1 carcinogen. Causes mesothelioma, lung cancer, and asbestosis. (IARC, EPA)",
  "dioxin and dioxin-like": "TCDD is an IARC Group 1 carcinogen and one of the most toxic compounds known; bioaccumulates and causes immune, reproductive, and developmental effects. (IARC, EPA)",
  "di(2-ethylhexyl) phthalate": "IARC Group 2B possible carcinogen; endocrine disruptor; reproductive toxicant. (IARC, EPA)",
  "4,4'-isopropylidenediphenol": "Bisphenol A (BPA). Endocrine disruptor that mimics estrogen; regulated for use in food contact and infant products. (EPA, FDA)",
  "tetrabromobisphenol a": "Brominated flame retardant; suspected endocrine disruptor; persists in the environment. (EPA)",
  "lithium bis[(trifluoromethyl)sulfonyl] azanide": "Battery-electrolyte fluorochemical with limited human-health data; treated as a per/poly-fluoroalkyl substance with environmental-persistence concerns. (EPA)",
};

const ALIASES: Record<string, string> = {
  "barium sulfate": "barium",
  "lead acetate": "lead",
  "chromium iii": "chromium",
  "chromium vi": "chromium",
  "nitrate compounds": "nitrate",
  "polycyclic aromatic compounds": "polycyclic aromatic",
  "dioxin and dioxin-like compounds": "dioxin and dioxin-like",
  "aluminum oxide fibrous": "aluminum oxide",
  "aluminum oxide fibrous forms": "aluminum oxide",
};

function normalize(name: string): string {
  let s = name.toLowerCase();
  // Strip parentheticals (and unmatched leading parens that hug a word).
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/[()]/g, " ");
  // Strip "and X compounds" trailing phrase ("Lead and Lead Compounds" → "lead").
  s = s.replace(/\s+and\s+[a-z0-9'\-,\[\]]+\s+compounds\s*$/i, "");
  // Strip trailing bare "compounds".
  s = s.replace(/\s+compounds\s*$/i, "");
  // Collapse whitespace.
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function getChemicalHealthRisk(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = normalize(name);
  if (RISKS[key]) return RISKS[key];
  const aliased = ALIASES[key];
  if (aliased && RISKS[aliased]) return RISKS[aliased];
  // Fall back: try the first word (handles "Aluminum (fume or dust)" → "aluminum"
  // already, plus things like "Mercury vapor" → "mercury").
  const head = key.split(/\s+/)[0];
  if (head && RISKS[head]) return RISKS[head];
  return null;
}
