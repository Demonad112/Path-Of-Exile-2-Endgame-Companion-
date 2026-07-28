import type { RoadmapStep } from "@/lib/types";
import { atlasSource, strategySource } from "./sourceMeta";

export const roadmapSteps: RoadmapStep[] = [
  {
    id: "step-campaign-end",
    order: 1,
    phase: "campaign-end",
    title: "Finish campaign, enter the Ziggurat Refuge",
    description:
      "Open the Waygate, clear the first map to its boss, and talk to Doryani and Farrow to start quests. Set up your hideout and the Verisium Anvil.",
    source: strategySource(),
  },
  {
    id: "step-hilda-contract",
    order: 2,
    phase: "campaign-end",
    title: "Hilda's Camp — first Beast Contract only",
    description:
      "Unlocks a 25% chance to upgrade a Normal Map Boss into a Powerful Map Boss (drops a Waystone one tier higher instead of same-tier). One point — take it immediately, this is your core Waystone sustain engine.",
    benchmarkGateIds: ["b-waystone-breakpoints"],
    source: atlasSource(),
  },
  {
    id: "step-precursor-tower",
    order: 3,
    phase: "precursor-fortress",
    title: "Rush the first Precursor Tower",
    description:
      "Precursor Tower → Ancient Gateway → Burning Monolith, grabbing guaranteed trial keys en route. Buy Honour Resistance relics for the Trial of Sekhemas (aim for a full 75% Honour Resistance set).",
    source: atlasSource(),
  },
  {
    id: "step-gateways",
    order: 4,
    phase: "precursor-fortress",
    title: "Light both Gateway beacons",
    description:
      "East Gateway (kill Precursor Refiner) → West Gateway (kill Precursor Separator) → both beacons lit.",
    source: atlasSource(),
  },
  {
    id: "step-enigma-chambers",
    order: 5,
    phase: "precursor-fortress",
    title: "Enigma Chambers → Crisis Fragments",
    description:
      "Requires Tier 10 Waystones minimum. Kill both Enigma Chamber bosses (Precursor Refiner, Precursor Separator) to unlock Crisis Fragments and Arbiter of Ash access.",
    benchmarkGateIds: ["b-enigma-t10"],
    source: atlasSource(),
  },
  {
    id: "step-sustain-cluster",
    order: 6,
    phase: "precursor-fortress",
    title: "Allocate the sustain/tablet-unlock cluster",
    description:
      "Allocate in this exact order — this block is 100% sustain-and-tablet-unlock focused. Eons of Domination unlocks Overseer Tablets; Atop the World unlocks generic Precursor Tablet drops while maxing Waystone drop chance.",
    actionItems: [
      "Trapped Subordinate",
      "Pathkeepers",
      "Eons of Domination",
      "Valuable Paths",
      "The Chosen Path: Essences",
      "The Journey Ahead: Effectiveness",
      "Archaeological Interest",
      "Expanding Hordes",
      "Atop the World",
    ],
    relatedMistakeIds: ["m-difficulty-nodes"],
    source: atlasSource(),
  },
  {
    id: "step-arbiter-of-ash",
    order: 7,
    phase: "arbiter-of-ash",
    title: "Kill Arbiter of Ash",
    description:
      "Assemble 3 Crisis Fragments from three Citadels (Doryani/Stone, Jamanra/Copper, Count Geonor/Iron), place them in the Burning Monolith. ~5M HP standard, 22M+ uber; hard 55% phase transition, fire-heavy.",
    source: strategySource(),
  },
  {
    id: "step-t11-park",
    order: 8,
    phase: "t11-checkpoint",
    title: "Grind T11 as the key gearing checkpoint",
    description:
      "T11 waystones are area level 75 — enough for tier-1 flat damage, tier-1/2 life rolls, tier-2 resistance rolls, +3 amulet rolls, and level-18 gems. This is the single biggest efficiency lever in the whole guide — don't rush T15 undergeared.",
    benchmarkGateIds: ["b-t11-gear-floor", "b-waystone-5mod"],
    relatedMistakeIds: ["m-rush-t15", "m-defenses-before-tiers"],
    source: atlasSource(),
  },
  {
    id: "step-doryani-revival",
    order: 9,
    phase: "t11-checkpoint",
    title: "Take one Doryani point for the extra revival",
    description: "Clear the nearest corrupted-zone nexus to unlock it.",
    source: atlasSource(),
  },
  {
    id: "step-delirium-part1",
    order: 10,
    phase: "t11-checkpoint",
    title: "Delirium Part 1 only — amulet anointing unlock",
    description:
      "Path to the Withered Willow, kill 5 map bosses with delirium mirror fog active to unlock amulet anointing, then clear the first 4 passive-point maps for more liquid emotion drops. Otherwise just pass through mirrors incidentally — don't push Delirium further yet, it's the hardest mechanic and is sequenced last.",
    source: atlasSource(),
  },
  {
    id: "step-abyss-breach",
    order: 11,
    phase: "t11-checkpoint",
    title: "Layer Abyss, then Breach, while mapping",
    description:
      "Canonical opener: Abyss full clear (universal currency, Desecrated Bones, Omens at the Well of Souls, kill Kulemak), then Breach full clear (jewellery and catalysts at the Monastery, kill Xesht) — best for early gearing, especially belts. Abyss → Ritual is a valid alternative.",
    relatedMistakeIds: ["m-golden-rule-tablets-while-questing"],
    source: strategySource(),
  },
  {
    id: "step-level85-ascendancy",
    order: 12,
    phase: "t11-checkpoint",
    title: "Hit level 85+, finish your 4th Ascendancy",
    description:
      "Farm T11 for a low-tier 4-trial Barya before the pinnacle push.",
    benchmarkGateIds: ["b-level85-ascendancy"],
    source: strategySource(),
  },
  {
    id: "step-find-halls",
    order: 13,
    phase: "arbiter-of-divinity-loop",
    title: "Find Matriarch Hall + Patriarch Hall",
    description:
      "Look for the smooth orange beam on the Atlas map — they usually spawn near each other. Clearing them drops Origin Cradle and Origin Spark.",
    source: atlasSource(),
  },
  {
    id: "step-kill-divinity",
    order: 14,
    phase: "arbiter-of-divinity-loop",
    title: "Kill Arbiter of Divinity",
    description:
      "Turn both Origin Cradle and Origin Spark in at the Engine Room (Origin Tower) for the Origin Core → carry it to the top → kill Arbiter of Divinity.",
    benchmarkGateIds: ["b-pinnacle-readiness"],
    source: atlasSource(),
  },
  {
    id: "step-cardinal-device",
    order: 15,
    phase: "arbiter-of-divinity-loop",
    title: "Hit a Cardinal Device",
    description:
      "Auto-completes a Fortress region (~40 points; start bottom-left) — this is why you don't need to manually clear every Fortress node.",
    source: atlasSource(),
  },
  {
    id: "step-memory-forks",
    order: 16,
    phase: "arbiter-of-divinity-loop",
    title: "Allocate the top-of-tree passives and memory forks",
    description:
      "Reverse Transcription → Rogue Exile cluster → essence/magic-monster paths → Mountain Mastery: Tablets, then the three memory forks. These top-of-tree passives scale your Waystone and tablet modifiers — grab them immediately after the first Arbiter of Divinity kill.",
    actionItems: [
      "Top-left fork: Risk and Reward, Enigmatic Intensification, Memories of the Vaal/Maraketh",
      "Top-right fork: Controlled Climates, Hard-Won Treasures, Memories of the Ezomytes/Karui",
      "Top fork: Desert Mastery: Effectiveness, Curiously Durable Stone, Partial Translation",
    ],
    source: atlasSource(),
  },
  {
    id: "step-repeat-divinity-loop",
    order: 17,
    phase: "arbiter-of-divinity-loop",
    title: "Repeat the Halls → Divinity → Cardinal Device loop 5 times total",
    description:
      "Spec Doryani's exploration branch (Stitch the Flesh, Hidden Patterns, Remnants of the Greatness) and path outward from newly-unlocked wall towers in one direction only — don't run random maps. Save high-Waystone-drop-chance tablets/stones for this phase.",
    source: atlasSource(),
  },
  {
    id: "step-close-out-tree",
    order: 18,
    phase: "full-tree",
    title: "Close out the remaining tree",
    description:
      "Remaining points after the 5th cycle go to generic quantity/rarity/pack-size, then finish out mechanic sub-trees you still want. Recommended close-out order: Ritual → Vaal Temple → Delirium (hardest last). Past ~120 points, allocation order stops mattering much.",
    relatedMistakeIds: ["m-spread-atlas-points"],
    source: atlasSource(),
  },
  {
    id: "step-juiced-loop",
    order: 19,
    phase: "juiced-farming",
    title: "Commit to a juiced single-mechanic farming loop",
    description:
      "Run city-biome T15/T16 maps with matched tablets and the right Master (Hilda for boss rushes, Jado for unique hunts, Doryani for safety/biome control), and start pinnacle farming.",
    relatedMistakeIds: ["m-master-swap", "m-burn-tablets-early"],
    source: strategySource(),
  },
];
