import type { CommonMistake } from "@/lib/types";
import { atlasSource, strategySource } from "./sourceMeta";

export const commonMistakes: CommonMistake[] = [
  {
    id: "m-defenses-before-tiers",
    title: "Pushing map tiers before defenses are ready",
    description:
      "Endgame is a survival check, not just a DPS check — gear resistances and life before chasing higher Waystone tiers.",
    appliesToStage: ["roadmap", "dashboard"],
    source: strategySource(),
  },
  {
    id: "m-spread-atlas-points",
    title: "Spreading Atlas points across multiple mechanics",
    description:
      "Payoff nodes sit deep in each sub-tree (9-12 nodes in). Half-investing two mechanics nets ~60% of one full investment, not 200% — specialize in one at a time.",
    appliesToStage: ["roadmap", "atlas"],
    source: strategySource(),
  },
  {
    id: "m-ignore-waystone-sustain",
    title: "Ignoring Waystone sustain",
    description:
      "Spending every good Waystone without securing sustain nodes/backups stalls your progression entirely.",
    appliesToStage: ["roadmap"],
    source: strategySource(),
  },
  {
    id: "m-rush-t15",
    title: "Rushing T15 when T11 already gives ~95% of loot value",
    description:
      "T15 (item level 82) rarely improves on T11 (item level 75) rolls, which are already high-weight — the extra risk isn't worth it until you're geared.",
    appliesToStage: ["roadmap"],
    source: strategySource(),
  },
  {
    id: "m-skip-fortress",
    title: "Skipping Fortress progression",
    description:
      "The Precursor Fortress is your Atlas-point engine, not a side mechanic — don't neglect it in favor of farming loops.",
    appliesToStage: ["roadmap", "atlas"],
    source: atlasSource(),
  },
  {
    id: "m-master-swap",
    title: "Not swapping Masters per activity",
    description:
      "Running empty maps without the right Master (Jado/Doryani/Hilda) for the activity wastes monster-scaling and reward nodes.",
    appliesToStage: ["dashboard"],
    source: strategySource(),
  },
  {
    id: "m-burn-tablets-early",
    title: "Burning good tablets before towers/Atlas are ready",
    description:
      "Mixing tablet types across mechanics in one session, or spending high-roll tablets before your setup can use them, wastes their value.",
    appliesToStage: ["atlas", "dashboard"],
    source: strategySource(),
  },
  {
    id: "m-overstack-rarity",
    title: "Over-stacking rarity at the cost of damage/defense",
    description:
      "Also applies to over-Runeforging high item-level gear — on ilvl 56+ gear, Runic Ward conversion is a trade against your existing defenses, not a pure freebie.",
    appliesToStage: ["dashboard"],
    source: strategySource(),
  },
  {
    id: "m-corrupt-last-map",
    title: "Corrupting your last good T15",
    description:
      "Only corrupt surplus Waystones — Vaal Orb corruption has under a 5% success chance to reach T16 and can downgrade to T14.",
    appliesToStage: ["dashboard"],
    source: strategySource(),
  },
  {
    id: "m-difficulty-nodes",
    title: "Taking multi-choice Atlas nodes that raise difficulty beyond your build",
    description:
      "Monster Effectiveness nodes scale all non-deterministic drops but also make monsters stronger — skip them entirely if your build can't handle the difficulty jump.",
    appliesToStage: ["atlas"],
    source: atlasSource(),
  },
  {
    id: "m-golden-rule-tablets-while-questing",
    title: "Running a mechanic's own tablets while questing it",
    description:
      "Tablets add more of the mechanic into the map, which slows down finishing that mechanic's quest and killing its boss. Applies to Abyss, Breach, and Ritual alike — quest first, juice after.",
    appliesToStage: ["atlas", "roadmap"],
    relatedMechanics: ["abyss", "breach", "ritual"],
    source: atlasSource(),
  },
];
