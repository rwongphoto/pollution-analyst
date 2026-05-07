import type { UtilityOwnerType } from "./types";

export const OWNER_TYPE_LABEL: Record<UtilityOwnerType, string> = {
  local: "Municipal",
  mixed: "Mixed",
  tribal: "Tribal",
  private: "Private",
  state: "State-owned",
  federal: "Federal",
};

export function ownerTypeLabel(t: UtilityOwnerType | null | undefined): string | null {
  if (!t) return null;
  return OWNER_TYPE_LABEL[t] ?? null;
}
