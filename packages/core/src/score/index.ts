/**
 * The build assessment — one score, and the reasons behind it.
 *
 * Every other panel answers "what is this number?". This one answers "is this
 * build in good shape?", which is the question a player actually asks, and it
 * is the easiest place in the codebase to lie. Two rules keep it honest:
 *
 *  1. **Nothing is graded against a threshold nobody measured.** Defence is
 *     scored against bands declared in `thresholds.ts` and labelled as
 *     judgement calls. Offence is scored ONLY against figures observed on the
 *     ladder; with no sample, the offence half is dropped and the remainder
 *     rescaled, so a build is never punished for data we don't have.
 *  2. **Keystones can invalidate a verdict, so they are applied first.**
 *     Calling a Chaos Inoculation build "thin on life" or "short on chaos
 *     resistance" is not a harsh verdict, it is a wrong one.
 */

import type { DefenseSummary } from '../defense/index.js'
import type { DpsSummary } from '../dps/index.js'
import { effectiveArmour, effectivePool, NO_KEYSTONE_EFFECTS, type KeystoneEffects } from '../keystones/index.js'
import { bandFor, describeLadderSample, type LadderStat, type LadderSummary } from '../ninja/ladder.js'
import type { PobConfig } from '../pob/config.js'
import { CHAOS_CRITICAL, CHAOS_TARGET, isHealthy, ONE_SHOT_RATIO, POOL_GOOD, POOL_THIN } from '../thresholds.js'

export type Severity = 'critical' | 'warning'

export interface Weakness {
  text: string
  severity: Severity
}

export type BuildTier = 'A' | 'B' | 'C' | 'D'

export interface BuildAssessment {
  /** 0-1. Rescaled when offence could not be assessed — see `offence`. */
  score: number
  tier: BuildTier
  /** One sentence naming the limiting factor. */
  note: string
  strengths: string[]
  weaknesses: Weakness[]
  /** The defensive half, out of 0.5. */
  defence: number
  /** The offensive half, out of 0.5. Null when it could not be assessed. */
  offence: number | null
  /** Why offence went unscored, when it did. */
  offenceUnscoredReason: string | null
  /** The keystone-corrected pool the score used, and what it excludes. */
  pool: { total: number; label: string; excluded: string[] }
  /** Caveats that qualify the verdict without changing it. */
  caveats: string[]
}

export interface BuildAssessmentInput {
  defense: DefenseSummary
  dps: DpsSummary
  /** Keystone corrections. Omit for the neutral, uncorrected reading. */
  keystones?: KeystoneEffects
  /**
   * The configuration the attached Path of Building export was saved with.
   * Used only to qualify the damage figure, never to change it.
   */
  pobConfig?: PobConfig | null
  /**
   * Whether poe.ninja's damage figure and Path of Building's agree. The config
   * above describes what PoB computed; it may only be applied to poe.ninja's
   * number when the two are the same number.
   */
  pobDpsAgrees?: boolean
  /** Observed ladder figures to grade damage against. */
  ladder?: LadderSummary | null
}

/** The damage figure the assessment grades: the best skill that actually hits. */
function primaryDps(dps: DpsSummary): number {
  return dps.primary?.totalDps ?? 0
}

function gradeOffence(dps: number, stat: LadderStat): number {
  // Quartiles of the observed sample, not invented cutoffs.
  const band = bandFor(dps, stat)
  if (band === 'top' || band === 'p75') return 0.5
  if (band === 'median') return 0.4
  if (band === 'p25') return 0.28
  return 0.15
}

export function assessBuild(input: BuildAssessmentInput): BuildAssessment {
  const { defense, dps } = input
  const keystones = input.keystones ?? NO_KEYSTONE_EFFECTS
  const ladder = input.ladder ?? null

  const strengths: string[] = []
  const weaknesses: Weakness[] = []
  const caveats: string[] = []

  // --- Defensive pool ------------------------------------------------------
  // Named by what it actually contains: a keystone may have converted life or
  // energy shield away, in which case calling the total "life + ES + ward"
  // credits the build with a buffer it does not have.
  const pool = effectivePool(defense, keystones)
  const poolLabel = `combined ${pool.parts.join(' + ')}`

  if (pool.total > POOL_GOOD) {
    strengths.push(`Healthy defensive pool (${pool.total.toLocaleString()} ${poolLabel})`)
  } else if (pool.total < POOL_THIN) {
    weaknesses.push({
      text: `Thin defensive pool — ${pool.total.toLocaleString()} ${poolLabel}`,
      severity: 'critical',
    })
  }
  if (pool.excluded.length) {
    caveats.push(
      `${pool.excluded.join(' and ')} ${pool.excluded.length === 1 ? 'is' : 'are'} excluded from the pool: an allocated keystone has converted ${pool.excluded.length === 1 ? 'it' : 'them'} away.`,
    )
  }

  // --- Resistances ---------------------------------------------------------
  const elemental = defense.resistances.filter((r) => r.type !== 'chaos')
  const uncapped = elemental.filter((r) => !isHealthy(r))
  if (elemental.length && uncapped.length === 0) {
    strengths.push(
      `All three elemental resistances at their maximum (${elemental.map((r) => `${r.max}%`).join(' / ')})`,
    )
  } else if (uncapped.length) {
    weaknesses.push({
      text: `Uncapped elemental resistance (${uncapped
        .map((r) => `${r.type[0]!.toUpperCase()}${r.type.slice(1)} ${r.value}% of ${r.max}%`)
        .join(', ')})`,
      severity: 'critical',
    })
  }

  const chaos = defense.resistances.find((r) => r.type === 'chaos')
  if (keystones.chaosImmune) {
    strengths.push('Immune to chaos damage and bleeding — chaos resistance is moot')
  } else if (chaos && chaos.value < CHAOS_CRITICAL) {
    weaknesses.push({ text: `Negative chaos resistance (${chaos.value}%)`, severity: 'critical' })
  } else if (chaos && chaos.value < CHAOS_TARGET) {
    weaknesses.push({
      text: `Low chaos resistance (${chaos.value}%, against a ${CHAOS_TARGET}% target)`,
      severity: 'warning',
    })
  }

  // --- Layered mitigation --------------------------------------------------
  // Under Iron Reflexes evasion has become armour, so it neither avoids hits
  // nor leaves the build short on armour — both judgements below would
  // otherwise be backwards.
  const armour = effectiveArmour(defense, keystones)
  if (defense.evasion > 4000) {
    strengths.push(
      keystones.evasionIsArmour
        ? `${defense.evasion.toLocaleString()} evasion converted to armour is a real mitigation layer`
        : `${defense.evasion.toLocaleString()} evasion is a real mitigation layer`,
    )
  }
  if (defense.ward > 0) {
    strengths.push(`${defense.ward.toLocaleString()} ward adds a recovering buffer over life and energy shield`)
  }
  if (armour < 500 && defense.blockChance < 20) {
    weaknesses.push({
      text: 'Little armour or block — leaning on evasion and resistances alone',
      severity: 'warning',
    })
  }

  // --- One-shot risk -------------------------------------------------------
  // A build can look healthy on paper and still be deleted by a damage type it
  // has no answer to. EVERY type under the threshold is reported, not just the
  // single lowest: on the reference character chaos (3,808) and physical
  // (4,264) both sat under it, and naming only the minimum hid the physical
  // gap — the more dangerous of the two, since physical hits are far more
  // common in maps than chaos hits.
  const hits = defense.maxHits.filter((h) => h.value > 0)
  const best = hits.reduce((max, h) => Math.max(max, h.value), 0)
  const atRisk = hits
    .filter((h) => !(keystones.chaosImmune && h.type === 'chaos'))
    .filter((h) => h.value < best * ONE_SHOT_RATIO)
    .sort((a, b) => a.value - b.value)

  if (best > 0 && atRisk.length > 0) {
    const named = atRisk
      .map((h) => `${h.type[0]!.toUpperCase()}${h.type.slice(1)} ${h.value.toLocaleString()}`)
      .join(', ')
    weaknesses.push({
      text:
        atRisk.length === 1
          ? `${named} is the one-shot risk — the largest survivable hit of that type is only ${atRisk[0]!.value.toLocaleString()} against ${best.toLocaleString()} at best`
          : `${atRisk.length} one-shot risks — ${named}, against ${best.toLocaleString()} at best`,
      severity: 'warning',
    })
  }

  // --- Offence -------------------------------------------------------------
  // Graded only against numbers actually observed. Without a ladder sample
  // there is no defensible threshold, so nothing is claimed about damage.
  const damage = primaryDps(dps)
  const ladderDps = ladder?.dps ?? null

  let offence: number | null = null
  let offenceUnscoredReason: string | null = null

  if (damage <= 0) {
    offenceUnscoredReason =
      dps.unresolved ??
      'poe.ninja reported no skill that deals hit damage for this character, so there is nothing to grade.'
  } else if (!ladderDps) {
    offenceUnscoredReason =
      'No ladder sample was available for this league and ascendancy, and this codebase does not carry invented damage thresholds to fall back on.'
  } else {
    offence = gradeOffence(damage, ladderDps)
    const basis = describeLadderSample(ladder!)
    const shown = `${Math.round(damage).toLocaleString()} DPS on ${dps.primary!.name}`
    if (damage >= ladderDps.p75) {
      strengths.push(`Strong damage — ${shown}, upper quarter of ${basis}`)
    } else if (damage < ladderDps.p25) {
      weaknesses.push({
        text: `${shown} — below every quartile of ${basis}, which run ${ladderDps.p25.toLocaleString()} at the 25th percentile`,
        severity: 'warning',
      })
    }
    caveats.push(ladder!.caveat)
  }

  // The PoB configuration describes what PoB computed. It may only be applied
  // to poe.ninja's damage figure when the two agree that they are the same
  // number — otherwise the caveat would be attached to the wrong figure.
  const config = input.pobConfig ?? null
  if (config && config.inputCount > 0) {
    if (input.pobDpsAgrees === true && !config.versusBoss) {
      caveats.push(
        'The damage figure was not calculated against a boss, so it should not be read as single-target or pinnacle damage.',
      )
    }
    if (input.pobDpsAgrees === true && config.buffMode === 'effective') {
      caveats.push('The damage figure assumes every buff and charge is active.')
    }
    if (input.pobDpsAgrees === false) {
      caveats.push(
        'The attached Path of Building export was saved with its own configuration, but its damage figure disagrees with poe.ninja’s, so that configuration does not describe the number scored here.',
      )
    }
  }

  for (const unverified of keystones.unverified) {
    caveats.push(
      `${unverified.keystone} is allocated but its effect is not corroborated — ${unverified.reason}. Its corrections were not applied.`,
    )
  }

  // --- Score ---------------------------------------------------------------
  // Defence and offence are weighted evenly at 0.5 each.
  let defence = 0
  if (pool.total > POOL_GOOD) defence += 0.3
  else if (pool.total >= POOL_THIN) defence += 0.15
  if (elemental.length && uncapped.length === 0) defence += 0.15
  // Chaos immunity earns the chaos credit outright — it is strictly better than
  // any resistance value, so scoring it as a miss would penalise it.
  if (keystones.chaosImmune || (chaos && chaos.value >= CHAOS_TARGET)) defence += 0.05

  const raw = offence === null ? defence / 0.5 : defence + offence
  const score = Math.round(Math.min(1, Math.max(0, raw)) * 100) / 100
  const tier: BuildTier = score >= 0.75 ? 'A' : score >= 0.5 ? 'B' : score >= 0.3 ? 'C' : 'D'

  let note: string
  if (uncapped.length) {
    note = 'Uncapped elemental resistances are the biggest thing holding this back.'
  } else if (pool.total < POOL_THIN) {
    note = `Resistances are handled — the ${pool.total.toLocaleString()} ${poolLabel} is the limiting factor.`
  } else if (offence === null) {
    note = `Scored on defences only — ${offenceUnscoredReason}`
  } else if (ladderDps && damage < ladderDps.median) {
    note = 'Defences hold up; damage is the weaker half of this build.'
  } else {
    note = 'No glaring gaps in defences or damage.'
  }

  if (strengths.length === 0) strengths.push('No standout strengths detected')
  if (weaknesses.length === 0) weaknesses.push({ text: 'No major gaps detected', severity: 'warning' })

  return {
    score,
    tier,
    note,
    strengths,
    weaknesses,
    defence,
    offence,
    offenceUnscoredReason,
    pool: { total: pool.total, label: poolLabel, excluded: pool.excluded },
    caveats,
  }
}
