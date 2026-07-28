/**
 * The recommendations engine.
 *
 * Each rule below must ground every number it emits in the payload — a
 * `breakdowns` contribution, a `defensiveStats` field, an item's own ilvl.
 * Where a number cannot be derived, the rule emits an `Unresolved` naming what
 * is missing instead of guessing.
 *
 * Rules are ranked by impact significance divided by cost weight, so a free
 * fix always outranks an equal-sized fix that costs an exalt.
 */

import type { CharModel } from '../model/types.js'
import { analyzeDefense, type DefenseSummary } from '../defense/index.js'
import { analyzeDps, type DpsSummary } from '../dps/index.js'
import { indexBreakdowns, projectStat, statSources, type BreakdownIndex } from '../model/breakdowns.js'
import { normalizePassives, inactiveSetNodes, type PassiveAllocation } from '../model/passives.js'
import { normalizeItems, type EquippedItem } from '../model/slots.js'
import type { Cost, Evidence, Impact, Recommendation, RecommendationReport, Unresolved } from './types.js'

export * from './types.js'
export * from './gear.js'

/** Relative cost weights used for ranking. Free work is worth doing first. */
const COST_WEIGHT: Record<Cost['kind'], number> = {
  free: 1,
  passive: 2,
  gear: 4,
  currency: 5,
  unknown: 6,
}

function score(impact: Impact | null, cost: Cost): number {
  // Findings without a quantifiable impact rank last among actionable items —
  // they are real, but a measured gain always outranks an unmeasured one.
  if (!impact) return 0
  const weight = COST_WEIGHT[cost.kind] * Math.max(1, cost.amount)
  return impact.significance / weight
}

function make(
  r: Omit<Recommendation, 'score'>,
): Recommendation {
  return { ...r, score: score(r.impact, r.cost) }
}

interface Context {
  model: CharModel
  defense: DefenseSummary
  dps: DpsSummary
  breakdowns: BreakdownIndex
  passives: PassiveAllocation
  items: EquippedItem[]
}

// ---------------------------------------------------------------------------
// Rule: resistances below cap, especially while another is overcapped.
// ---------------------------------------------------------------------------
function resistanceRules(ctx: Context): Recommendation[] {
  const out: Recommendation[] = []
  const under = ctx.defense.resistances.filter((r) => r.underCap > 0)
  const over = ctx.defense.resistances.filter((r) => r.overCap > 0)

  for (const res of under) {
    const capitalised = res.type[0]!.toUpperCase() + res.type.slice(1)
    const evidence: Evidence[] = [
      {
        kind: 'stat',
        stat: `${res.type}Resistance`,
        value: res.value,
        note: `${capitalised} resistance is ${res.value}% against a cap of ${res.max}%.`,
      },
    ]

    // A resistance sitting below cap while another is overcapped is pure
    // misallocation: the points already exist on the character sheet.
    const donor = over.find((o) => o.overCap >= res.underCap)
    const partialDonor = donor ?? over.slice().sort((a, b) => b.overCap - a.overCap)[0]

    let tradeoff: string | null = null
    let cost: Cost = {
      kind: 'gear',
      amount: 1,
      currencyTier: 'low',
      detail: `Source ${res.underCap}% ${res.type} resistance from gear, a rune, or a passive.`,
    }

    if (partialDonor) {
      const covered = Math.min(partialDonor.overCap, res.underCap)
      evidence.push({
        kind: 'stat',
        stat: `${partialDonor.type}ResistanceOverCap`,
        value: partialDonor.overCap,
        note: `${partialDonor.type[0]!.toUpperCase()}${partialDonor.type.slice(1)} resistance is ${partialDonor.overCap}% above its cap — those points do nothing.`,
      })
      if (covered >= res.underCap) {
        cost = {
          kind: 'free',
          amount: 0,
          detail: `Reallocate ${covered}% from overcapped ${partialDonor.type} resistance. No new gear required.`,
        }
        tradeoff = `${partialDonor.overCap - covered}% of ${partialDonor.type} overcap remains as a buffer against resistance-reducing map modifiers.`
      } else {
        cost = {
          kind: 'gear',
          amount: 1,
          currencyTier: 'low',
          detail: `Reallocating the ${covered}% of overcapped ${partialDonor.type} resistance covers part of the gap; the remaining ${res.underCap - covered}% needs a new source.`,
        }
      }
    }

    // Contributing sources tell us what a swap would actually cost.
    const sources = statSources(ctx.breakdowns, `${res.type}Resistance`)
    for (const c of sources.slice(0, 3)) {
      if (!c.source.label) continue
      evidence.push({
        kind: 'breakdown',
        stat: `${res.type}Resistance`,
        source: c.source.itemName ?? c.source.label,
        value: c.value,
        note: `${c.value}% ${c.modKind === 'flat' ? 'from' : 'increased by'} ${c.source.itemName ?? c.source.label}.`,
      })
    }

    const impact: Impact = {
      stat: `${res.type}Resistance`,
      label: `${capitalised} Resistance`,
      from: res.value,
      to: res.max,
      delta: res.underCap,
      unit: 'percent',
      // A point of missing resistance matters more the closer it is to cap
      // being the only gap; normalise against the full 75-point cap.
      significance: Math.min(1, res.underCap / res.max) + (cost.kind === 'free' ? 0.15 : 0),
    }

    out.push(
      make({
        id: `res-${res.type}-under-cap`,
        category: 'survivability',
        action: `Raise ${res.type} resistance by ${res.underCap}% to reach the ${res.max}% cap.`,
        rationale:
          cost.kind === 'free'
            ? `${capitalised} resistance is ${res.underCap}% short of cap while ${partialDonor!.type} resistance is ${partialDonor!.overCap}% over it. The points are already on the character — they are in the wrong place.`
            : `${capitalised} resistance is ${res.underCap}% short of the ${res.max}% cap, so every ${res.type} hit lands harder than it needs to.`,
        impact,
        cost,
        tradeoff,
        evidence,
        provenance: 'ninja',
      }),
    )
  }

  return out
}

// ---------------------------------------------------------------------------
// Rule: the lowest max hit is the one-shot vector, and EHP hides it.
// ---------------------------------------------------------------------------
function oneShotRule(ctx: Context): Recommendation[] {
  const d = ctx.defense
  if (d.lowestMaximumHit === null || d.maxHits.length < 2) return []

  const lowest = d.maxHits[0]!
  const highest = d.maxHits[d.maxHits.length - 1]!
  // Only worth flagging when one vector is meaningfully thinner than the rest.
  if (lowest.ratioToHighest < 1.5) return []

  const evidence: Evidence[] = [
    {
      kind: 'stat',
      stat: 'lowestMaximumHitTaken',
      value: d.lowestMaximumHit,
      note: `A single ${lowest.type} hit of ${d.lowestMaximumHit.toLocaleString()} kills. The safest vector (${highest.type}) survives ${highest.value.toLocaleString()} — ${lowest.ratioToHighest.toFixed(1)}x more.`,
    },
  ]

  if (d.effectiveHealthPool !== null && d.ehpOverstatementRatio !== null && d.ehpOverstatementRatio > 1.5) {
    evidence.push({
      kind: 'stat',
      stat: 'effectiveHealthPool',
      value: d.effectiveHealthPool,
      note: `Effective health pool reads ${d.effectiveHealthPool.toLocaleString()}, overstating the true one-shot threshold by ${d.ehpOverstatementRatio.toFixed(1)}x. Do not use it to judge this build's safety.`,
    })
  }

  const res = d.resistances.find((r) => r.type === lowest.type)
  const cost: Cost =
    res && res.underCap > 0
      ? { kind: 'gear', amount: 1, currencyTier: 'low', detail: `Close the ${res.underCap}% ${lowest.type} resistance gap first — it is the cheapest lever on this vector.` }
      : { kind: 'gear', amount: 1, currencyTier: 'moderate', detail: `Add maximum life, energy shield, or ${lowest.type}-specific mitigation.` }

  if (res) {
    evidence.push({
      kind: 'stat',
      stat: `${lowest.type}Resistance`,
      value: res.value,
      note: `${lowest.type[0]!.toUpperCase()}${lowest.type.slice(1)} resistance is ${res.value}% (cap ${res.max}%).`,
    })
  }

  return [
    make({
      id: `one-shot-${lowest.type}`,
      category: 'survivability',
      action: `Shore up ${lowest.type} mitigation — it is this build's one-shot vector at ${d.lowestMaximumHit.toLocaleString()} damage.`,
      rationale:
        `${lowest.type[0]!.toUpperCase()}${lowest.type.slice(1)} has the lowest maximum survivable hit of any damage type, ` +
        `${lowest.ratioToHighest.toFixed(1)}x below the strongest. The figure opposite is the CEILING — what this vector ` +
        `would reach if it matched the safest one` +
        (lowest.type === 'chaos'
          ? ', which chaos cannot fully do here: it drains energy shield at twice the rate, so a capped resistance still leaves it the thinnest vector.'
          : '.'),
      impact: {
        stat: 'lowestMaximumHitTaken',
        // Named a ceiling because that is what it is. `highest.value` is what
        // this vector would reach if it matched the safest damage type, not a
        // predicted outcome — and for chaos it is not even attainable, since
        // chaos drains energy shield at 2x. Presenting a bound as a result is
        // the same failure as inventing a number.
        label: 'Lowest maximum hit taken — ceiling if fully closed',
        from: d.lowestMaximumHit,
        to: highest.value,
        delta: highest.value - d.lowestMaximumHit,
        unit: 'flat',
        significance: Math.min(1, (lowest.ratioToHighest - 1) / 3),
      },
      cost,
      tradeoff: null,
      evidence,
      provenance: 'ninja',
    }),
  ]
}

// ---------------------------------------------------------------------------
// Rule: armour so low it provides almost no physical mitigation.
// ---------------------------------------------------------------------------
function armourRule(ctx: Context): Recommendation[] {
  const d = ctx.defense
  const dr = d.physicalDamageReduction
  if (dr === null || dr >= 15) return []

  const evidence: Evidence[] = [
    {
      kind: 'stat',
      stat: 'armour',
      value: d.armour,
      note:
        d.physicalDamageReductionAgainstHit !== null
          ? `${d.armour.toLocaleString()} armour yields ${dr}% physical damage reduction against the ${d.physicalDamageReductionAgainstHit.toLocaleString()} hit poe.ninja models.`
          : `${d.armour.toLocaleString()} armour yields ${dr}% physical damage reduction.`,
    },
  ]

  const physHit = d.maxHits.find((m) => m.type === 'physical')
  if (physHit) {
    evidence.push({
      kind: 'stat',
      stat: 'physicalMaximumHitTaken',
      value: physHit.value,
      note: `Maximum survivable physical hit is ${physHit.value.toLocaleString()}${physHit.isLowest ? ' — the lowest of any type' : `, rank ${d.maxHits.indexOf(physHit) + 1} of ${d.maxHits.length}`}.`,
    })
  }

  for (const c of statSources(ctx.breakdowns, 'armour').slice(0, 3)) {
    if (!c.source.label) continue
    evidence.push({
      kind: 'breakdown',
      stat: 'armour',
      source: c.source.itemName ?? c.source.label,
      value: c.value,
      note: `${c.value}${c.modKind === 'increased' ? '% increased' : ' flat'} armour from ${c.source.itemName ?? c.source.label}.`,
    })
  }

  return [
    make({
      id: 'armour-negligible',
      category: 'survivability',
      action: `Treat armour as a non-defence at ${d.armour.toLocaleString()} — rely on evasion, energy shield and resistances, or commit to armour properly.`,
      rationale: `${d.armour.toLocaleString()} armour reduces physical damage by only ${dr}%. Partial investment in armour is the worst of both worlds; the stat scales badly until it is large.`,
      // No impact figure: the honest target armour value cannot be derived from
      // this payload, and rendering the current 2% as a "gain" would read as
      // though the advice makes the build worse.
      impact: null,
      cost: {
        kind: 'unknown',
        amount: 1,
        currencyTier: 'unknown',
        detail:
          'Either drop armour from gear priorities entirely, or invest enough for the curve to matter. Which is right depends on the archetype, not on the sheet.',
      },
      tradeoff:
        'Abandoning armour concedes physical mitigation permanently; committing to it competes with evasion and energy shield for the same gear affixes.',
      evidence,
      provenance: 'ninja',
    }),
  ]
}

// ---------------------------------------------------------------------------
// Rule: unspent anoints. Free power sitting untouched.
// ---------------------------------------------------------------------------
function anointRule(ctx: Context): Recommendation[] {
  const counts = ctx.passives.counts
  if (typeof counts.anoints !== 'number' || counts.anoints > 0) return []
  const level = ctx.model.level
  if (typeof level !== 'number' || level < 30) return []

  const amulet = ctx.items.find((i) => i.slotId === 4)

  const evidence: Evidence[] = [
    { kind: 'passive', count: 0, note: `poe.ninja reports 0 anoints allocated at level ${level}.` },
  ]
  if (amulet) {
    evidence.push({
      kind: 'item',
      slotId: amulet.slotId,
      slotLabel: amulet.slotLabel,
      itemName: amulet.name,
      note: `${amulet.name} (${amulet.baseType}) is equipped and can carry an anoint.`,
    })
  }

  return [
    make({
      id: 'anoint-unused',
      category: 'efficiency',
      action: 'Anoint the amulet — the slot is empty.',
      rationale: `No anoint is allocated at level ${level}. An anoint grants a passive notable without spending a skill point, so an empty one is strictly wasted power.`,
      impact: {
        stat: 'anoints',
        label: 'Anoints Used',
        from: 0,
        to: 1,
        delta: 1,
        unit: 'points',
        significance: 0.45,
      },
      cost: {
        kind: 'currency',
        amount: 1,
        currencyTier: 'low',
        detail: 'Three distilled emotions applied to the amulet. Cost varies with the notable chosen.',
      },
      tradeoff: 'Anoints are replaceable, so the only real cost is the currency spent.',
      evidence,
      provenance: 'ninja',
    }),
  ]
}

// ---------------------------------------------------------------------------
// Rule: the weapon lags the rest of the kit. Weapon damage multiplies
// everything for martial builds.
// ---------------------------------------------------------------------------
function weaponTierRule(ctx: Context): Recommendation[] {
  const active = ctx.items.filter((i) => i.active && i.itemLevel !== null)
  if (active.length < 3) return []

  const weapon = active.find((i) => i.slotId === 7 || i.slotId === 15)
  if (!weapon || weapon.itemLevel === null) return []

  const others = active.filter((i) => i.slotId !== weapon.slotId && i.itemLevel !== null)
  if (!others.length) return []

  const median = [...others.map((i) => i.itemLevel!)].sort((a, b) => a - b)[Math.floor(others.length / 2)]!
  const gap = median - weapon.itemLevel
  if (gap < 4) return []

  return [
    make({
      id: 'weapon-ilvl-lag',
      category: 'damage',
      action: `Upgrade the main hand — ${weapon.name} is item level ${weapon.itemLevel}, ${gap} below the rest of the kit.`,
      rationale: `Weapon damage multiplies every skill that uses it, so the weapon is the highest-leverage slot on a martial build. At ilvl ${weapon.itemLevel} it cannot roll the top affix tiers the ilvl-${median} armour pieces already carry.`,
      impact: {
        stat: 'weaponItemLevel',
        label: 'Main Hand Item Level',
        from: weapon.itemLevel,
        to: median,
        delta: gap,
        unit: 'points',
        significance: Math.min(1, gap / 20),
      },
      cost: {
        kind: 'gear',
        amount: 1,
        currencyTier: 'moderate',
        detail: `Replace or recraft the main hand at item level ${median} or above.`,
      },
      tradeoff: `${weapon.name}'s existing mods are lost. Check which of them the build depends on before replacing it.`,
      evidence: [
        {
          kind: 'item',
          slotId: weapon.slotId,
          slotLabel: weapon.slotLabel,
          itemName: weapon.name,
          note: `${weapon.name} (${weapon.baseType}), item level ${weapon.itemLevel}.`,
        },
        ...others.slice(0, 3).map(
          (i): Evidence => ({
            kind: 'item',
            slotId: i.slotId,
            slotLabel: i.slotLabel,
            itemName: i.name,
            note: `${i.slotLabel}: ${i.name}, item level ${i.itemLevel}.`,
          }),
        ),
        ...(ctx.dps.primary
          ? [
              {
                kind: 'skill' as const,
                skill: ctx.dps.primary.name,
                dps: ctx.dps.primary.totalDps,
                note: `${ctx.dps.primary.name} currently does ${Math.round(ctx.dps.primary.totalDps).toLocaleString()} DPS and scales directly with weapon damage.`,
              },
            ]
          : []),
      ],
      provenance: 'ninja',
    }),
  ]
}

// ---------------------------------------------------------------------------
// Rule: a swap weapon set that may be idle. ASK — a swap set can be deliberate.
// ---------------------------------------------------------------------------
function idleWeaponSetRule(ctx: Context): Recommendation[] {
  const idle = inactiveSetNodes(ctx.passives)
  if (!idle.length) return []

  const inactiveSet = ctx.passives.activeSet === 2 ? 1 : 2
  const inactiveItems = ctx.items.filter((i) => i.weaponSet === inactiveSet)

  const evidence: Evidence[] = [
    {
      kind: 'passive',
      count: idle.length,
      note: `${idle.length} passive points are allocated to weapon set ${inactiveSet}, which is not the active set.`,
    },
    ...inactiveItems.map(
      (i): Evidence => ({
        kind: 'item',
        slotId: i.slotId,
        slotLabel: i.slotLabel,
        itemName: i.name,
        note: `${i.slotLabel} (set ${inactiveSet}): ${i.name}${i.itemLevel !== null ? `, item level ${i.itemLevel}` : ''}.`,
      }),
    ),
  ]

  return [
    make({
      id: 'weapon-set-idle',
      category: 'question',
      action: `Confirm whether weapon set ${inactiveSet} is still in use — ${idle.length} passive points are committed to it.`,
      rationale: `Weapon set ${ctx.passives.activeSet} is active, but set ${inactiveSet} holds ${idle.length} allocated passives${inactiveItems.length ? ` and ${inactiveItems.length} equipped item${inactiveItems.length === 1 ? '' : 's'}` : ''}. A swap set can be entirely deliberate, so this is a question rather than a finding.`,
      impact: null,
      cost: { kind: 'free', amount: 0, detail: 'Costs nothing to check.' },
      tradeoff:
        'If the set is genuinely unused those points can be reclaimed. If it is a real swap — for a movement skill, a boss-only setup, or a totem — leave it alone.',
      evidence,
      provenance: 'ninja',
    }),
  ]
}

// ---------------------------------------------------------------------------
// Unresolved: things worth knowing that this payload cannot answer.
// ---------------------------------------------------------------------------
function collectUnresolved(ctx: Context): Unresolved[] {
  const out: Unresolved[] = []

  if (ctx.dps.unresolved) {
    out.push({ id: 'dps-missing', question: 'What does each skill actually do?', missing: ctx.dps.unresolved })
  }

  if (ctx.defense.physicalDamageReductionAgainstHit === null && ctx.defense.armour > 0) {
    out.push({
      id: 'armour-hit-size',
      question: 'How much physical damage does armour actually stop?',
      missing:
        'poe.ninja did not report the hit size its damage-reduction figure was computed against. Armour mitigation is hit-size dependent, so a single percentage cannot be projected to other hit sizes without it.',
    })
  }

  if (ctx.breakdowns.unmappedIds.length) {
    out.push({
      id: 'unmapped-stat-ids',
      question: 'What are the remaining breakdown stats?',
      missing: `poe.ninja's breakdown carries stat ids ${ctx.breakdowns.unmappedIds.join(', ')} that this build reads as zero, so they cannot be identified from this character. They are reported as stat_<id> rather than guessed.`,
    })
  }

  if (!ctx.model.pathOfBuildingExport) {
    out.push({
      id: 'no-pob-export',
      question: 'Do poe.ninja and Path of Building agree on these numbers?',
      missing:
        'This character has no Path of Building export attached, so poe.ninja’s figures cannot be cross-checked against a second engine.',
    })
  }

  return out
}

const RULES = [resistanceRules, oneShotRule, armourRule, anointRule, weaponTierRule, idleWeaponSetRule] as const

export function recommend(model: CharModel): RecommendationReport {
  const ctx: Context = {
    model,
    defense: analyzeDefense(model),
    dps: analyzeDps(model),
    breakdowns: indexBreakdowns(model),
    passives: normalizePassives(model),
    items: normalizeItems(model),
  }

  const recommendations = RULES.flatMap((rule) => rule(ctx)).sort((a, b) => b.score - a.score)
  const unresolved = collectUnresolved(ctx)

  // Questions aren't findings — a build with only questions is a sound build.
  const actionable = recommendations.filter((r) => r.category !== 'question')
  const buildIsSound = actionable.length === 0

  return {
    recommendations,
    unresolved,
    buildIsSound,
    summary: buildIsSound
      ? 'No actionable weaknesses found. Resistances are capped, no damage type stands out as a one-shot vector, and gear is consistent. This build is in good shape.'
      : `${actionable.length} actionable ${actionable.length === 1 ? 'improvement' : 'improvements'} found, ranked by gain per unit of cost.`,
  }
}

/** Re-exported so callers can project stats without reaching into model/. */
export { projectStat }
