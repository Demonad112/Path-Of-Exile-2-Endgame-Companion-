/**
 * PoE2 0.5 mechanics reference.
 *
 * Every entry states something verified — either a constant locked by a unit
 * test in packages/core, or a property of the live payload measured directly.
 * Nothing here is folklore. When a mechanic is not understood well enough to
 * state, it is left out rather than approximated.
 */

export interface Mechanic {
  id: string
  title: string
  summary: string
  detail: string
  /** How this was established, so a reader can weigh it. */
  basis: string
}

export const MECHANICS: readonly Mechanic[] = Object.freeze([
  {
    id: 'armour',
    title: 'Armour and physical damage reduction',
    summary: 'Reduction depends on the size of the hit: DR = armour / (armour + 10 × hit), capped at 90%.',
    detail:
      'Armour scales badly until it is large, and its value depends entirely on what it is defending against. ' +
      '1,000 armour stops 50% of a 100 damage hit but only 9% of a 1,000 damage hit. This is why a modest armour ' +
      'value can look adequate against a damage-taken average and still leave a thin one-shot vector. Partial ' +
      'investment is the worst of both worlds: either commit enough for the curve to matter, or treat armour as a ' +
      'non-defence and rely on evasion, energy shield and resistances.',
    basis: 'Formula locked by unit test; reproduces the 2% reduction poe.ninja reports for 207 armour on the reference character.',
  },
  {
    id: 'mitigation-order',
    title: 'Order of mitigation',
    summary: 'Evasion → block → armour → resistances. Armour applies BEFORE resistances, reversed from PoE1.',
    detail:
      'The ordering matters when reasoning about which layer to invest in. Because armour applies before ' +
      'resistances for physical damage, the two are multiplicative rather than competing.',
    basis: 'Ordering locked by unit test in packages/core/src/defense/constants.ts.',
  },
  {
    id: 'chaos-energy-shield',
    title: 'Chaos damage and energy shield',
    summary: 'Chaos removes twice as much energy shield as it deals. It does not bypass energy shield as in PoE1.',
    detail:
      'Each point of energy shield is therefore worth half a point of effective pool against chaos. The raw chaos ' +
      'pool is life + energy shield / 2. On a character leaning on energy shield, this is often why chaos is the ' +
      'thinnest damage type despite a large nominal pool.',
    basis: 'Multiplier locked by unit test; consistent with chaos being the lowest max hit on the reference character.',
  },
  {
    id: 'max-hit-vs-ehp',
    title: 'Maximum hit taken versus effective health pool',
    summary: 'Lead with the lowest maximum hit taken. Effective health pool averages across damage types and overstates safety.',
    detail:
      'Effective health pool is an average, so a single thin vector disappears into it. On the reference character ' +
      'EHP reads 13,569 while a 3,808 chaos hit is fatal — a 3.5x overstatement, and the difference between ' +
      '"tanky" and "dies to one slam". poe.ninja reports lowestMaximumHitTaken directly; use it.',
    basis: 'Measured on the live payload: effectiveHealthPool 13,569 against lowestMaximumHitTaken 3,808.',
  },
  {
    id: 'resistances',
    title: 'Resistance caps',
    summary: 'Resistances cap at 75% by default and can be raised to a hard ceiling of 90%.',
    detail:
      'Points above the cap do nothing except buffer against resistance-reducing map modifiers. A character with ' +
      'one resistance overcapped and another below cap is misallocated: the points already exist on the sheet, ' +
      'they are simply in the wrong place, and moving them costs nothing.',
    basis: 'Caps locked by unit test; poe.ninja reports per-element overcap directly.',
  },
  {
    id: 'block',
    title: 'Block chance',
    summary: 'Block caps at 50% in PoE2, not PoE1’s 75%.',
    detail: 'Build plans ported from PoE1 that assume a 75% block cap will overestimate this layer substantially.',
    basis: 'Cap locked by unit test.',
  },
  {
    id: 'energy-shield-recharge',
    title: 'Energy shield recharge',
    summary: 'Recharges at 12.5% of maximum per second after a 4 second delay.',
    detail:
      'The delay is shortened by "faster start of recharge": delay = 400 / (100 + faster%), so 100% faster start ' +
      'halves it to 2 seconds. Recharge is interrupted by taking damage, which is why it is a between-packs ' +
      'defence rather than a sustain one.',
    basis: 'Rate and delay formula locked by unit test.',
  },
  {
    id: 'evasion',
    title: 'Evasion',
    summary: 'evade% = 100 − (accuracy × 1.25 × 100) / (accuracy + evasion × 0.3), clamped to 5–100%.',
    detail:
      'Evasion is checked against the attacker’s accuracy, so its value falls as enemy accuracy rises with area ' +
      'level. It is also all-or-nothing per hit, which makes it unreliable against single large hits compared with ' +
      'flat mitigation.',
    basis: 'Formula locked by unit test.',
  },
  {
    id: 'weapon-sets',
    title: 'Weapon sets',
    summary: 'Sets 1 and 2 are alternates, for both items and passives. Exactly one is live. Never sum them.',
    detail:
      'Items carry a numeric slot: 6 and 7 belong to set 1, 15 and 16 to set 2. Passives are also per-set. ' +
      'useSecondWeaponSet says which is live; the other set contributes nothing at all. Summing them inflates the ' +
      'apparent passive count and credits inactive gear to the build.',
    basis: 'Measured on the live payload: 103 main + 16 + 16 allocated passives, of which only main + the active set apply.',
  },
  {
    id: 'support-categories',
    title: 'Support gem categories',
    summary: 'A skill cannot hold two support gems of the same category.',
    detail:
      'Every support gem carries a category, and the constraint is stated on the gem itself: "You cannot have ' +
      'multiple Support Gems of the same Category socketed within one Skill." Separately, a support whose tags ' +
      'share nothing with the skill’s is legal but does nothing — a Spell support on an Attack skill, for example.',
    basis: 'Rule quoted from the gem description text in the live payload; categories and tags read from the same source.',
  },
  {
    id: 'deflection',
    title: 'Deflection and ward',
    summary: 'Two 0.5 defensive mechanics reported by poe.ninja: a deflection rating with its own chance and effect, and ward.',
    detail:
      'Both appear in defensiveStats (deflectionRating, deflectChance, deflectEffect, ward) and are read directly ' +
      'rather than modelled. Their exact interaction with the other mitigation layers is not stated here because ' +
      'it has not been verified.',
    basis: 'Read from the live payload. Interaction with other layers deliberately not claimed.',
  },
])

export function findMechanic(query: string): Mechanic[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...MECHANICS]
  const exact = MECHANICS.find((m) => m.id === q)
  if (exact) return [exact]
  return MECHANICS.filter(
    (m) =>
      m.id.includes(q) ||
      m.title.toLowerCase().includes(q) ||
      m.summary.toLowerCase().includes(q) ||
      m.detail.toLowerCase().includes(q),
  )
}
