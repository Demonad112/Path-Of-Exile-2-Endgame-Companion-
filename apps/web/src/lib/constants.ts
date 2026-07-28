export const CURRENT_PATCH = "0.5.4b";
export const LEAGUE_NAME = "Runes of Aldur";

export const MECHANIC_LABELS: Record<string, string> = {
  breach: "Breach",
  abyss: "Abyss",
  delirium: "Delirium",
  ritual: "Ritual",
  expedition: "Expedition",
};

/**
 * Five mechanics needing five distinguishable hues.
 *
 * These reuse the damage-type palette rather than introducing a second
 * categorical scale. That palette is the only one in this project validated
 * against BOTH surfaces (see docs/DESIGN.md — six checks, chroma floor and
 * pairwise separation), and a mechanic chip has the same job a damage-split
 * segment does: be told apart at a glance. Naming a mechanic after a damage
 * type is a coincidence of the token names, not a claim about the game — the
 * chips carry their mechanic's name as text, so the colour never has to
 * carry the meaning alone.
 */
export const MECHANIC_COLORS: Record<string, string> = {
  breach: "bg-chaos/20 text-chaos border-chaos/40",
  abyss: "bg-physical/20 text-physical border-physical/40",
  delirium: "bg-cold/20 text-cold border-cold/40",
  ritual: "bg-fire/20 text-fire border-fire/40",
  expedition: "bg-lightning/20 text-lightning border-lightning/40",
};

export const ROADMAP_PHASE_LABELS: Record<string, string> = {
  "campaign-end": "Campaign End",
  "precursor-fortress": "Precursor Fortress",
  "arbiter-of-ash": "Arbiter of Ash",
  "t11-checkpoint": "T11 Gearing Checkpoint",
  "arbiter-of-divinity-loop": "Arbiter of Divinity Loop",
  "full-tree": "Full 301-Point Tree",
  "juiced-farming": "Juiced Farming Loop",
};
