/**
 * Offence rules.
 *
 * Damage was the one part of this analyser that diagnosed without prescribing.
 * The defensive rules name an item, a modifier, a tier and an amount; the
 * offence side reported a DPS figure and stopped. These rules close that gap
 * without reintroducing what was deliberately removed.
 *
 * ## Why these are allowed to exist when DPS bands are not
 *
 * `DPS_STRONG / DPS_OK / DPS_LOW` were dropped because they graded a character
 * against a figure nobody measured. Every finding here is instead ARITHMETIC ON
 * THE CHARACTER'S OWN NUMBERS:
 *
 * - Missing 8% of your attacks costs exactly `100/92 - 1` of your damage.
 * - Crit at 5% chance and 2.48x multiplier contributes exactly
 *   `1 + 0.05 x 1.48 = 1.074`, i.e. 7.4%.
 *
 * Those hold whatever a "good" DPS figure is for a given patch, and they stay
 * true if the ladder is unreachable. No constant here is a damage target.
 *
 * ## What they will not say
 *
 * None of these claims a replacement modifier would be better. A crit multiplier
 * returning 1.8% is a measurement; "flat damage there would beat it" is a
 * judgement about where the build is heading, and `recommend/gear.ts` already
 * explains at length why this project declines to make that call. The findings
 * state what a modifier is currently worth and leave the choice with the reader.
 *
 * Everything reads poe.ninja's own per-skill block, so — like the build score —
 * none of it requires a Path of Building export.
 */

import type { DpsSummary, SkillDamage } from '../dps/index.js'
import { structuredMods } from '../gear/analyze.js'
import type { EquippedItem } from '../model/slots.js'
import { ACCURACY_MIN_GAIN, CRIT_UNINVESTED, DOT_DOMINANT } from '../thresholds.js'
import type { Cost, Evidence, Impact, Recommendation } from './types.js'

/** Cost weights, mirrored from the engine so ranking stays consistent. */
const COST_WEIGHT = { free: 1, passive: 2, gear: 4, currency: 5, unknown: 6 } as const

function score(impact: Impact | null, cost: Cost): number {
  if (!impact) return 0
  return impact.significance / (COST_WEIGHT[cost.kind] * Math.max(1, cost.amount))
}

function make(r: Omit<Recommendation, 'score'>): Recommendation {
  return { ...r, score: score(r.impact, r.cost) }
}

/**
 * The narrow slice of the engine's context these rules read.
 *
 * Declared structurally rather than importing the engine's `Context`, so this
 * module stays a leaf and the two files cannot form a cycle.
 */
export interface OffenceContext {
  dps: DpsSummary
  items: EquippedItem[]
}

/**
 * What critting is worth, as a multiplier over never critting.
 *
 * `1 + chance x (multiplier - 1)`. At 5% chance and 2.48x this is 1.074, which
 * is the number that makes "5% crit chance" mean something: crit multiplier
 * modifiers scale only that 7.4%. The same modifiers at 40% chance would be
 * worth having.
 *
 * Null when poe.ninja omitted either figure, or when the multiplier is at or
 * below 1 — which means it was not populated rather than that crits do nothing.
 */
export function effectiveCritMultiplier(skill: SkillDamage): number | null {
  const chance = skill.critChance
  const multiplier = skill.critMultiplier
  if (chance === null || multiplier === null) return null
  if (multiplier <= 1 || chance <= 0) return null
  return 1 + (chance / 100) * (multiplier - 1)
}

/** Share of a skill's damage that ticks rather than hits, 0-1. */
export function dotShare(skill: SkillDamage): number {
  return skill.totalDps > 0 ? Math.min(1, skill.dotDps / skill.totalDps) : 0
}

/**
 * Crit modifiers on gear that is actually in use.
 *
 * Restricted to the active weapon set and to the sources a player chose and can
 * change. The reference character makes the point: it carries four crit
 * modifiers, but three sit on the idle weapon set, so advice built on all four
 * would describe a kit nobody is wearing.
 *
 * `additiveMultiplierPoints` counts ONLY stats that add percentage points to
 * the multiplier (`..._critical_strike_multiplier_+`). A weapon's local
 * `increased critical strike chance` is a different quantity and is recorded as
 * a chance modifier, never folded into multiplier arithmetic.
 */
export interface CritModSummary {
  multiplierMods: { item: EquippedItem; id: string; points: number }[]
  chanceModCount: number
  /** Total percentage points of crit multiplier from active gear. */
  additiveMultiplierPoints: number
}

const CHANGEABLE = new Set(['explicit', 'crafted', 'desecrated'])

export function critModsOn(items: EquippedItem[]): CritModSummary {
  const multiplierMods: CritModSummary['multiplierMods'] = []
  let chanceModCount = 0
  let additiveMultiplierPoints = 0

  for (const item of items) {
    if (!item.active) continue
    for (const mod of structuredMods(item)) {
      if (!CHANGEABLE.has(mod.source)) continue
      for (const [statId, value] of Object.entries(mod.stats)) {
        if (!/critical/i.test(statId)) continue
        if (/critical_strike_multiplier_\+$/.test(statId) && Number.isFinite(value)) {
          multiplierMods.push({ item, id: mod.id, points: value })
          additiveMultiplierPoints += value
        } else if (/chance/i.test(statId)) {
          chanceModCount += 1
        }
      }
    }
  }

  return { multiplierMods, chanceModCount, additiveMultiplierPoints }
}

// ---------------------------------------------------------------------------
// Rule: attacks that miss. The cheapest damage in the game, and exactly
// computable — every point of hit chance is damage that simply did not happen.
// ---------------------------------------------------------------------------
export function accuracyRule(ctx: OffenceContext): Recommendation[] {
  const skill = ctx.dps.primary
  if (!skill || skill.hitChance === null) return []
  const hitChance = skill.hitChance
  if (hitChance <= 0 || hitChance >= 100) return []

  // Accuracy scales HIT damage only. On a skill that also ticks, `100/hitChance
  // - 1` is the gain on the hit half and overstates the gain on the skill —
  // 25% on a skill that is 70% damage over time is really 7.5%. So the figure
  // quoted is always against the skill's total, which collapses to the hit-only
  // figure when there is no damage over time.
  const missing = 100 - hitChance
  const projectedHit = skill.dps * (100 / hitChance)
  const projectedTotal = projectedHit + skill.dotDps
  if (skill.totalDps <= 0) return []
  const gain = (projectedTotal / skill.totalDps - 1) * 100
  if (gain < ACCURACY_MIN_GAIN) return []

  const ticks = dotShare(skill)
  const evidence: Evidence[] = [
    {
      kind: 'skill',
      skill: skill.name,
      dps: skill.totalDps,
      note: `${skill.name} hits ${hitChance.toFixed(1)}% of the time, so ${missing.toFixed(1)}% of its attacks deal nothing.`,
    },
  ]

  if (ticks > 0.01) {
    evidence.push({
      kind: 'skill',
      skill: skill.name,
      dps: skill.dotDps,
      note:
        `${Math.round(ticks * 100)}% of ${skill.name}'s damage ticks rather than hits and is unaffected by accuracy, ` +
        `so the gain quoted is against the skill's total rather than its hit damage alone.`,
    })
  }

  // Every other hitting skill shares the character's accuracy, so naming them
  // shows this is a build-wide loss rather than one skill's problem.
  const alsoAffected = ctx.dps.hitSkills.filter((s) => s !== skill && s.hitChance !== null && s.hitChance < 100)
  for (const other of alsoAffected.slice(0, 3)) {
    evidence.push({
      kind: 'skill',
      skill: other.name,
      dps: other.totalDps,
      note: `${other.name} also hits only ${other.hitChance!.toFixed(1)}% of the time.`,
    })
  }

  return [
    make({
      id: 'dps-accuracy',
      category: 'damage',
      action: `Raise accuracy to reach 100% hit chance — worth about ${gain.toFixed(1)}% more damage on ${skill.name}.`,
      rationale:
        `${skill.name} lands ${hitChance.toFixed(1)}% of its attacks, so ${missing.toFixed(1)}% of them deal nothing at all. ` +
        `Closing that is a ${gain.toFixed(1)}% gain on the skill's damage by arithmetic alone — no scaling, no conditions` +
        (alsoAffected.length ? `, and it applies to all ${alsoAffected.length + 1} of this build's hitting skills.` : '.'),
      impact: {
        stat: 'hitChance',
        label: `${skill.name} damage at full accuracy`,
        from: skill.totalDps,
        to: projectedTotal,
        delta: projectedTotal - skill.totalDps,
        unit: 'flat',
        // The share of this skill's reachable damage currently being missed.
        // Bounded 0-1 by construction, and it accounts for the ticking half
        // rather than a damage figure divided by a cutoff nobody established.
        significance: (projectedTotal - skill.totalDps) / projectedTotal,
      },
      cost: {
        kind: 'gear',
        amount: 1,
        currencyTier: 'low',
        detail: 'Accuracy Rating on rings, gloves or an amulet, or an accuracy passive. It is one of the cheaper affixes to source.',
      },
      tradeoff: 'An accuracy affix occupies a slot that could hold damage or defence instead.',
      evidence,
      provenance: 'ninja',
    }),
  ]
}

// ---------------------------------------------------------------------------
// Rule: crit is half-invested — chance and multiplier only pay together.
// ---------------------------------------------------------------------------
export function critInvestmentRule(ctx: OffenceContext): Recommendation[] {
  const skill = ctx.dps.primary
  if (!skill) return []

  // A damage-over-time skill is scaled by ailment and duration modifiers, so
  // crit advice would point it in the wrong direction entirely.
  if (dotShare(skill) >= DOT_DOMINANT) return []

  const effective = effectiveCritMultiplier(skill)
  if (effective === null || effective >= CRIT_UNINVESTED) return []

  const contribution = (effective - 1) * 100
  const mods = critModsOn(ctx.items)

  const evidence: Evidence[] = [
    {
      kind: 'skill',
      skill: skill.name,
      dps: skill.totalDps,
      note:
        `At ${skill.critChance!.toFixed(1)}% critical strike chance and ${skill.critMultiplier!.toFixed(2)}x damage, ` +
        `critical strikes add about ${contribution.toFixed(1)}% to ${skill.name}'s damage.`,
    },
  ]

  // What the crit modifiers already on the kit are actually returning. This is
  // the figure that makes the finding concrete rather than a lecture: remove
  // their points from the multiplier and recompute the same expression.
  let modContribution: number | null = null
  const reducedMultiplier = skill.critMultiplier! - mods.additiveMultiplierPoints / 100
  if (mods.multiplierMods.length && reducedMultiplier > 1) {
    const without = 1 + (skill.critChance! / 100) * (reducedMultiplier - 1)
    modContribution = (effective / without - 1) * 100
    for (const mod of mods.multiplierMods) {
      evidence.push({
        kind: 'item',
        slotId: mod.item.slotId,
        slotLabel: mod.item.slotLabel,
        itemName: mod.item.name,
        note: `${mod.item.name} carries +${mod.points}% critical damage bonus.`,
      })
    }
    evidence.push({
      kind: 'stat',
      stat: 'criticalStrikeMultiplier',
      value: mods.additiveMultiplierPoints,
      note:
        mods.multiplierMods.length === 1
          ? `The critical-damage modifier on your active gear adds ${mods.additiveMultiplierPoints}% multiplier, which at ` +
            `${skill.critChance!.toFixed(1)}% chance is worth ${modContribution.toFixed(1)}% more damage.`
          : `The ${mods.multiplierMods.length} critical-damage modifiers on your active gear add ` +
            `${mods.additiveMultiplierPoints}% multiplier between them, which at ${skill.critChance!.toFixed(1)}% chance is worth ` +
            `${modContribution.toFixed(1)}% more damage.`,
    })
  }

  const carryingMultiplier = mods.multiplierMods.length > 0

  return [
    make({
      id: 'dps-crit-uninvested',
      category: 'damage',
      action: carryingMultiplier
        ? `Commit to critical strike chance or stop paying for critical damage — at ${skill.critChance!.toFixed(1)}% chance, crit adds only ${contribution.toFixed(1)}% to your damage.`
        : `Decide whether this build uses critical strikes — at ${skill.critChance!.toFixed(1)}% chance and ${skill.critMultiplier!.toFixed(2)}x, crit adds only ${contribution.toFixed(1)}% to your damage.`,
      rationale:
        `Critical strikes multiply damage only as often as they happen. ${skill.name} crits ${skill.critChance!.toFixed(1)}% of the time, ` +
        `so the ${skill.critMultiplier!.toFixed(2)}x multiplier applies to one hit in ${Math.round(100 / skill.critChance!)} and returns ` +
        `${contribution.toFixed(1)}% overall` +
        (modContribution !== null
          ? `. Of that, ${modContribution.toFixed(1)}% comes from critical-damage modifiers on your gear, which scale the smaller half of the pair.`
          : '. Chance and multiplier only pay together; half-investing is the one option that never does.'),
      // No impact figure. What committing to crit would yield depends on how much
      // chance is reachable, and what a replacement modifier would give depends
      // on where the build is heading — the same judgement `recommend/gear.ts`
      // declines to make about tier upgrades. The measurements are in the
      // evidence; the decision stays with the reader.
      impact: null,
      cost: {
        kind: 'unknown',
        amount: 1,
        currencyTier: 'unknown',
        detail: carryingMultiplier
          ? 'Either source critical strike chance until the multiplier you already carry pays, or recraft those modifiers into something that does not depend on critting.'
          : 'Either source critical strike chance and multiplier together, or scale flat and increased damage and treat crit as incidental.',
      },
      tradeoff:
        'Committing to crit competes with flat and increased damage for the same affixes; abandoning it makes any critical-damage modifier you keep close to inert.',
      evidence,
      provenance: 'ninja',
    }),
  ]
}

// ---------------------------------------------------------------------------
// Rule: the build ticks rather than hits, so hit-scaling advice misleads.
// ---------------------------------------------------------------------------
export function dotArchetypeRule(ctx: OffenceContext): Recommendation[] {
  const skill = ctx.dps.primary
  if (!skill) return []
  const share = dotShare(skill)
  if (share < DOT_DOMINANT) return []

  return [
    make({
      id: 'dps-dot-dominant',
      category: 'damage',
      action: `Scale the ailment or degeneration itself — ${Math.round(share * 100)}% of ${skill.name}'s damage is damage over time, not hits.`,
      rationale:
        `${Math.round(share * 100)}% of ${skill.name}'s ${Math.round(skill.totalDps).toLocaleString()} damage comes from damage over time. ` +
        `Hit damage, critical strikes and attack speed scale the other ${Math.round((1 - share) * 100)}%, so modifiers aimed at them do ` +
        `comparatively little here.`,
      // Which ailment modifiers this build can reach is not derivable from the
      // payload, so no gain is projected — the finding redirects effort rather
      // than promising an amount.
      impact: null,
      cost: {
        kind: 'unknown',
        amount: 1,
        currencyTier: 'unknown',
        detail: 'Re-aim gear and passive investment at ailment effect, damage-over-time multipliers and duration rather than hit damage.',
      },
      tradeoff:
        'Damage over time ignores accuracy and critical strikes entirely, so any investment already made in those is what is being written off.',
      evidence: [
        {
          kind: 'skill',
          skill: skill.name,
          dps: skill.totalDps,
          note: `${skill.name}: ${Math.round(skill.dotDps).toLocaleString()} of ${Math.round(skill.totalDps).toLocaleString()} damage per second is damage over time.`,
        },
      ],
      provenance: 'ninja',
    }),
  ]
}

/** Every offence rule, in the order they are applied. */
export const OFFENCE_RULES = [accuracyRule, critInvestmentRule, dotArchetypeRule] as const
