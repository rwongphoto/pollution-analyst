// JumpStrip helper for the /rankings/* pages. Each lane gets one entry —
// the "most" table anchors the metric and the matching "least" table sits
// directly below it on the page, so a per-lane jump (rather than per-table)
// keeps the strip scannable when both directions are present.

import { LANE_JUMP_LABEL } from "./rankingLanes";
import type { JumpItem } from "@/components/site/JumpStrip";
import type { RankingTable } from "./types";

export function buildRankingJumpItems(tables: RankingTable[]): JumpItem[] {
  const seen = new Set<string>();
  const items: JumpItem[] = [];
  for (const t of tables) {
    if (seen.has(t.lane)) continue;
    seen.add(t.lane);
    const label = LANE_JUMP_LABEL[t.lane] ?? t.label;
    items.push({ id: `${t.lane}-${t.direction}`, label });
  }
  return items;
}
