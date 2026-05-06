import { getChemicalHealthRisk } from "@/lib/chemicalHealthRisk";

export function ChemicalCell({ name }: { name: string | null | undefined }) {
  if (!name) return null;
  const risk = getChemicalHealthRisk(name);
  if (!risk) return <>{name}</>;
  return (
    <span className="chem-tip" tabIndex={0} aria-describedby="chem-tip-desc">
      <span className="chem-tip__name">{name}</span>
      <span className="chem-tip__pop" role="tooltip">
        <span className="chem-tip__heading">Health risk</span>
        {risk}
      </span>
    </span>
  );
}
