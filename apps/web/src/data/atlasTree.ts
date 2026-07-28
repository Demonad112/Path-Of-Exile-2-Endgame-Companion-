import type { AtlasCluster, MemoryFork } from "@/lib/types";
import { atlasSource, strategySource } from "./sourceMeta";

/**
 * `order` is the recommended allocation sequence within a cluster's `group`,
 * NOT a spatial/pixel position — no real node-graph coordinates exist in the
 * source material (the Mobalytics interactive tree-planner pages this guide
 * draws on didn't extract as structured data, only their written notes did).
 */
export const atlasClusters: AtlasCluster[] = [
  // --- Main-path sequencing: pre-Arbiter of Ash sustain cluster ---
  {
    id: "cluster-trapped-subordinate",
    name: "Trapped Subordinate",
    order: 1,
    group: "early-progression",
    description: "First node in the pre-Ash sustain/tablet-unlock block.",
    source: atlasSource(),
  },
  {
    id: "cluster-pathkeepers",
    name: "Pathkeepers",
    order: 2,
    group: "early-progression",
    description: "+15% Waystone quantity — core sustain node.",
    source: atlasSource(),
  },
  {
    id: "cluster-eons-of-domination",
    name: "Eons of Domination",
    order: 3,
    group: "early-progression",
    description:
      "Unlocks Overseer Tablets — slot immediately on any map node without a powerful boss to force Waystone-tier progression.",
    source: atlasSource(),
  },
  {
    id: "cluster-valuable-paths",
    name: "Valuable Paths",
    order: 4,
    group: "early-progression",
    description: "Part of the rare-monster/sustain cluster.",
    source: atlasSource(),
  },
  {
    id: "cluster-chosen-path-essences",
    name: "The Chosen Path: Essences",
    order: 5,
    group: "early-progression",
    description: "Essence-focused sustain node.",
    source: atlasSource(),
  },
  {
    id: "cluster-journey-ahead-effectiveness",
    name: "The Journey Ahead: Effectiveness",
    order: 6,
    group: "early-progression",
    description:
      "Monster Effectiveness node — scales all non-deterministic drops (currency, items, Waystones) but makes monsters stronger. Take it by default unless your character can't handle the difficulty jump.",
    killGated: false,
    source: atlasSource(),
  },
  {
    id: "cluster-archaeological-interest",
    name: "Archaeological Interest",
    order: 7,
    group: "early-progression",
    description: "Part of the rare-monster/sustain cluster.",
    source: atlasSource(),
  },
  {
    id: "cluster-expanding-hordes",
    name: "Expanding Hordes",
    order: 8,
    group: "early-progression",
    description: "Part of the rare-monster/sustain cluster.",
    source: atlasSource(),
  },
  {
    id: "cluster-atop-the-world",
    name: "Atop the World",
    order: 9,
    group: "early-progression",
    description:
      "Unlocks generic Precursor Tablet drops while maxing Waystone drop chance. Last node before killing Arbiter of Ash.",
    source: atlasSource(),
  },

  // --- Main-path sequencing: post-Arbiter of Divinity, pre-memory-fork ---
  {
    id: "cluster-reverse-transcription",
    name: "Reverse Transcription",
    order: 10,
    group: "early-progression",
    description: "First node allocated after the first Arbiter of Divinity kill.",
    source: atlasSource(),
  },
  {
    id: "cluster-rogue-exile",
    name: "Competing Explorers / Competitive Archaeology (Rogue Exile cluster)",
    order: 11,
    group: "early-progression",
    description: "Rogue Exile cluster, pathed toward corrupted-zone passives.",
    source: atlasSource(),
  },
  {
    id: "cluster-essence-corrupted-zone",
    name: "Essence nodes → corrupted-zone passives",
    order: 12,
    group: "early-progression",
    description: "Essence path into corrupted-zone passives.",
    source: atlasSource(),
  },
  {
    id: "cluster-magic-monster-cleansed-area",
    name: "Magic-monster path → cleansed-area passives",
    order: 13,
    group: "early-progression",
    description: "Magic-monster path into cleansed-area passives.",
    source: atlasSource(),
  },
  {
    id: "cluster-mountain-mastery-tablets",
    name: "Mountain Mastery: Tablets",
    order: 14,
    group: "early-progression",
    description:
      "Final node before the three memory forks — scales tablet modifiers broadly.",
    source: atlasSource(),
  },

  // --- General / late-game clusters ---
  {
    id: "cluster-doryani-exploration",
    name: "Doryani's exploration branch",
    order: 1,
    group: "general",
    description:
      "Stitch the Flesh, Hidden Patterns, Remnants of the Greatness — spec this and path outward from newly-unlocked wall towers in one direction only (don't run random maps) to find the next Halls pair faster, across all 5 Arbiter of Divinity cycles.",
    source: atlasSource(),
  },
  {
    id: "cluster-generic-quantity-rarity",
    name: "Generic quantity/rarity/pack-size",
    order: 2,
    group: "general",
    description:
      "Remaining points after the 5th Arbiter of Divinity cycle go here before finishing out mechanic sub-trees.",
    source: atlasSource(),
  },
  {
    id: "cluster-closeout-sequencing",
    name: "Mechanic close-out order",
    order: 3,
    group: "general",
    description:
      "Recommended order: Ritual → Vaal Temple → Delirium (hardest last). Past ~120 total points, allocation order stops mattering much.",
    source: atlasSource(),
  },

  // --- Mechanic sub-trees: Breach (Genesis Tree / Keepers of the Flame) ---
  {
    id: "cluster-breach-banded-fruit",
    name: "Breeding Program: Banded Fruit",
    order: 1,
    group: "mechanic-subtree",
    mechanic: "breach",
    description: "First Breach sub-tree priority.",
    source: atlasSource(),
  },
  {
    id: "cluster-breach-diverse-control",
    name: "Diverse Control",
    order: 2,
    group: "mechanic-subtree",
    mechanic: "breach",
    description: "Second Breach sub-tree priority.",
    source: atlasSource(),
  },
  {
    id: "cluster-breach-monster-count",
    name: "Breach monster-count nodes",
    order: 3,
    group: "mechanic-subtree",
    mechanic: "breach",
    description: "Increases monster count in breach encounters for more Hiveblood.",
    source: atlasSource(),
  },
  {
    id: "cluster-breach-sole-purpose",
    name: "Sole Purpose: Destruction",
    order: 4,
    group: "mechanic-subtree",
    mechanic: "breach",
    description: "More Ailith abilities that spawn extra monsters.",
    source: atlasSource(),
  },

  // --- Mechanic sub-trees: Abyss ---
  {
    id: "cluster-abyss-shadow-of-undeath",
    name: "Shadow of Undeath",
    order: 1,
    group: "mechanic-subtree",
    mechanic: "abyss",
    description: "Core Abyss sub-tree node.",
    source: strategySource(),
  },
  {
    id: "cluster-abyss-lightless-legions",
    name: "Lightless Legions",
    order: 2,
    group: "mechanic-subtree",
    mechanic: "abyss",
    description: "Core Abyss sub-tree node.",
    source: strategySource(),
  },
  {
    id: "cluster-abyss-rogue-exile",
    name: "Rogue Exile nodes (Abyss)",
    order: 3,
    group: "mechanic-subtree",
    mechanic: "abyss",
    description: "Rogue Exile nodes paired with Abyss tablets.",
    source: strategySource(),
  },
  {
    id: "cluster-abyss-balance-of-power",
    name: "Balance of Power: Ulaman",
    order: 4,
    group: "mechanic-subtree",
    mechanic: "abyss",
    description:
      "Prefer over From Below/Sprawling Rupture while questing Abyss — avoid inflating encounter size/duration until the quest is done.",
    source: atlasSource(),
  },

  // --- Mechanic sub-trees: Delirium (two-part quest) ---
  {
    id: "cluster-delirium-part1-willow",
    name: "Part 1: Withered Willow — amulet anointing",
    order: 1,
    group: "mechanic-subtree",
    mechanic: "delirium",
    description:
      "Do at T11, mid-progression. Kill 5 map bosses with delirium mirror fog active to unlock amulet anointing.",
    source: atlasSource(),
  },
  {
    id: "cluster-delirium-part1-emotions",
    name: "Part 1: \"I know your childhood fears...\"",
    order: 2,
    group: "mechanic-subtree",
    mechanic: "delirium",
    description:
      "Clear the first 4 passive-point maps for more liquid emotion drops, then pass through mirrors incidentally until you have enough for a decent anoint.",
    source: atlasSource(),
  },
  {
    id: "cluster-delirium-part2-simulacrum",
    name: "Part 2: Grand Mirror → Simulacrum → Tangmazu",
    order: 3,
    group: "mechanic-subtree",
    mechanic: "delirium",
    description:
      "Save for last — hardest mechanic. Kill the map boss's mirrored copy alongside the original, spread fog to spawn a Simulacrum (7-stage fight), then bring the Raven's Reflection key to the Withered Willow to fight Tangmazu for the remaining tree points.",
    source: atlasSource(),
  },

  // --- Mechanic sub-trees: Ritual ---
  {
    id: "cluster-ritual-subtree",
    name: "Ritual sub-tree — Tribute deferral",
    order: 1,
    group: "mechanic-subtree",
    mechanic: "ritual",
    description: "Defer Tribute to fish Omens/chase uniques.",
    source: strategySource(),
  },
  {
    id: "cluster-ritual-tablet-reroll",
    name: "Tablet mod: rerolling favours costs 20-30% reduced tribute",
    order: 2,
    group: "mechanic-subtree",
    mechanic: "ritual",
    description: "Mandatory tablet modifier — aim for 28-30% if running only one.",
    source: atlasSource(),
  },
  {
    id: "cluster-ritual-tablet-sacrifice",
    name: "Tablet mod: sacrificed monsters grant 18-30% increased tribute",
    order: 3,
    group: "mechanic-subtree",
    mechanic: "ritual",
    description: "Secondary tablet modifier priority.",
    source: atlasSource(),
  },
  {
    id: "cluster-ritual-tablet-omens",
    name: "Tablet mod: favours 35-70% increased chance to be Omens",
    order: 4,
    group: "mechanic-subtree",
    mechanic: "ritual",
    description: "Tablet modifier priority for Omen-focused setups.",
    source: atlasSource(),
  },

  // --- Mechanic sub-trees: Expedition (flagged version conflict) ---
  {
    id: "cluster-expedition-atlas-tree",
    name: "Expedition Atlas Passive Tree",
    order: 1,
    group: "mechanic-subtree",
    mechanic: "expedition",
    description:
      "0.5.4 'Grand Expedition' patch notes describe a dedicated Expedition Atlas tree (e.g. 'Feeling Lucky?' for Liquid Verisium), but this contradicts an earlier source claiming Expedition has no tree at all.",
    source: atlasSource({
      verified: "conflicting",
      note: "Asmodeus's guide (pre-0.5.4) says Expedition has no Atlas tree; the 0.5.4 'Grand Expedition' patch notes say one was added. Verify in-game before planning around either claim.",
    }),
  },
];

export const memoryForks: MemoryFork[] = [
  {
    id: "fork-top-left",
    branch: "top-left",
    title: "Top-Left Fork",
    nodes: [
      "Risk and Reward",
      "Enigmatic Intensification",
      "Memories of the Vaal/Maraketh",
    ],
    description:
      "One of three top-of-tree memory forks unlocked after the first Arbiter of Divinity kill. These scale your Waystone and tablet modifiers and are some of the highest-impact points in the whole tree.",
    source: atlasSource(),
  },
  {
    id: "fork-top-right",
    branch: "top-right",
    title: "Top-Right Fork",
    nodes: [
      "Controlled Climates",
      "Hard-Won Treasures",
      "Memories of the Ezomytes/Karui",
    ],
    description:
      "One of three top-of-tree memory forks unlocked after the first Arbiter of Divinity kill.",
    source: atlasSource(),
  },
  {
    id: "fork-top",
    branch: "top",
    title: "Top Fork",
    nodes: [
      "Desert Mastery: Effectiveness",
      "Curiously Durable Stone",
      "Partial Translation",
    ],
    description:
      "One of three top-of-tree memory forks unlocked after the first Arbiter of Divinity kill.",
    source: atlasSource(),
  },
];
