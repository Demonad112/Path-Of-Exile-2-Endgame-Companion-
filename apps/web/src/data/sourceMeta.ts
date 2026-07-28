import type { SourceRef } from "@/lib/types";

export const SOURCE_DOCS = {
  "atlas-tree-fundamentals": {
    title: "PoE 2 (0.5) — Atlas Tree Fundamentals & Progression + Endgame Mechanic Guides",
    builtFrom: "Mobalytics creator guides (Asmodeus, Fubgun, ds_lily, Lolcohol)",
    asOf: "July 2026",
  },
  "strategy-guide": {
    title:
      'Path of Exile 2 — League 0.5 "Return of the Ancients" Endgame Strategy Guide',
    builtFrom: "Community farming-strategy and meta aggregation",
    asOf: "2026-07-19",
  },
} as const;

/** Known cross-document conflicts, surfaced via SourceRef.note on affected records. */
export const KNOWN_CONFLICTS = [
  {
    id: "expedition-atlas-tree-existence",
    summary:
      "Asmodeus's guide (pre-0.5.4) says Expedition has no Atlas passive tree. The 0.5.4 'Grand Expedition' patch notes say a dedicated Expedition Atlas Passive Tree was added. Treat 'no tree' as outdated pending in-game confirmation.",
  },
] as const;

export function atlasSource(
  overrides: Partial<SourceRef> = {}
): SourceRef {
  return {
    sourceDoc: "atlas-tree-fundamentals",
    asOfPatch: "0.5.4",
    verified: "confirmed",
    ...overrides,
  };
}

export function strategySource(
  overrides: Partial<SourceRef> = {}
): SourceRef {
  return {
    sourceDoc: "strategy-guide",
    asOfPatch: "0.5.4b",
    verified: "confirmed",
    ...overrides,
  };
}
