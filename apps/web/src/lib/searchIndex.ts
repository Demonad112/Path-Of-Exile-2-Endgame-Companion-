import { roadmapSteps } from "@/data/roadmap";
import { atlasClusters, memoryForks } from "@/data/atlasTree";
import { farmingStrategies } from "@/data/strategies";
import { pinnacleBosses } from "@/data/bosses";
import { metaBuilds } from "@/data/metaBuilds";
import { commonMistakes } from "@/data/commonMistakes";
import type { Stage } from "@/lib/types";

export type SearchCategory =
  | "Checklist"
  | "Atlas"
  | "Strategy"
  | "Boss"
  | "Build"
  | "Mistake"
  | "Character";

export interface SearchEntry {
  id: string;
  title: string;
  subtitle: string;
  category: SearchCategory;
  href: string;
}

// WarningPanel only renders a mistake on pages matching its appliesToStage,
// so the search result has to link to a page where the mistake's `id` will
// actually be present in the DOM — not every mistake applies to "roadmap".
const STAGE_HREF: Record<Stage, string> = {
  roadmap: "/checklist",
  atlas: "/atlas",
  dashboard: "/dashboard",
};
function hrefForMistake(stages: Stage[]): string {
  return STAGE_HREF[stages[0]] ?? "/checklist";
}

export const searchIndex: SearchEntry[] = [
  {
    id: "character-import",
    title: "Character Import & Analysis",
    subtitle:
      "Paste a poe.ninja profile URL to see defenses, skills, and gear",
    category: "Character",
    href: "/character",
  },
  ...roadmapSteps.map((s): SearchEntry => ({
    id: s.id,
    title: s.title,
    subtitle: s.description,
    category: "Checklist",
    href: "/checklist",
  })),
  ...atlasClusters.map((c): SearchEntry => ({
    id: c.id,
    title: c.name,
    subtitle: c.description,
    category: "Atlas",
    // Mechanic sub-tree clusters only exist in the DOM for the currently
    // active tab in MechanicSubTreeList, so carry the target mechanic
    // through as a query param the tab picker reads on mount.
    href: c.group === "mechanic-subtree" && c.mechanic
      ? `/atlas?mechanic=${c.mechanic}`
      : "/atlas",
  })),
  ...memoryForks.map((f): SearchEntry => ({
    id: f.id,
    title: f.title,
    subtitle: f.description,
    category: "Atlas",
    href: "/atlas",
  })),
  ...farmingStrategies.map((s): SearchEntry => ({
    id: s.id,
    title: s.name,
    subtitle: s.expectedReturn,
    category: "Strategy",
    href: "/dashboard",
  })),
  ...pinnacleBosses.map((b): SearchEntry => ({
    id: b.id,
    title: b.name,
    subtitle: b.notes ?? b.gatingRequirements[0] ?? "",
    category: "Boss",
    href: "/dashboard",
  })),
  ...metaBuilds.map((m): SearchEntry => ({
    id: m.id,
    title: m.name,
    subtitle: m.role,
    category: "Build",
    href: "/dashboard",
  })),
  ...commonMistakes.map((m): SearchEntry => ({
    id: m.id,
    title: m.title,
    subtitle: m.description,
    category: "Mistake",
    href: hrefForMistake(m.appliesToStage),
  })),
];
