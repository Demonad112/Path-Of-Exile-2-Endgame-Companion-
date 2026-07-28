import type { BenchmarkGate } from "@/lib/types";
import { atlasSource, strategySource } from "./sourceMeta";

export const benchmarkGates: BenchmarkGate[] = [
  {
    id: "b-t11-gear-floor",
    label:
      "Park at T11 (area level 75) to gear and resist-cap before pushing further — it gives ~95% of loot value with far less risk than jumping to T15.",
    severity: "hard-gate",
    appliesBeforeStepId: "step-t11-checkpoint",
    source: strategySource(),
  },
  {
    id: "b-waystone-5mod",
    label:
      "Sustain 5-mod Waystones (~80% same-tier replacement chance) before investing further into a mechanic sub-tree.",
    severity: "soft-guideline",
    source: strategySource(),
  },
  {
    id: "b-pinnacle-readiness",
    label:
      "5,000+ life and 80%+ relevant resistances before Olroth/Simulacrum/Arbiter-tier pinnacles.",
    severity: "hard-gate",
    source: strategySource(),
  },
  {
    id: "b-level85-ascendancy",
    label:
      "Reach level 85+ and finish your 4th Ascendancy (low-tier 4-trial Barya from T11) before the Arbiter of Divinity pinnacle push.",
    severity: "hard-gate",
    source: strategySource(),
  },
  {
    id: "b-enigma-t10",
    label: "Enigma Chambers require Tier 10 Waystones minimum.",
    severity: "hard-gate",
    source: atlasSource(),
  },
  {
    id: "b-waystone-breakpoints",
    label:
      "Waystone breakpoints gate progression at Tier 6, 11, and 14 — buy a backup stone one tier below your best from Doryani right after crossing each one.",
    severity: "soft-guideline",
    source: atlasSource(),
  },
];
