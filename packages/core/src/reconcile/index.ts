/**
 * Reconciliation harness.
 *
 * CORRECTNESS RULE: poe.ninja's computed stats are authoritative, but we do NOT
 * silently prefer either source. When our local Tier 3 formulas, or PoB's own
 * exported `PlayerStat` values, disagree with poe.ninja, that disagreement is
 * FLAGGED and surfaced. Silently picking a winner is how a wrong number ships
 * looking confident.
 *
 * A drift report is a feature, not a test failure: it tells the user which
 * numbers to distrust.
 */

import type { CharModel } from '../model/types.js'
import { analyzeDefense } from '../defense/index.js'
import { analyzeDps } from '../dps/index.js'
import { indexBreakdowns, verifyTotal } from '../model/breakdowns.js'

export type DriftSeverity = 'match' | 'minor' | 'major'

export interface DriftCheck {
  stat: string
  /** What poe.ninja says. */
  ninja: number | null
  /** What the other source says. */
  other: number | null
  otherSource: 'pob-export' | 'local-formula' | 'breakdown-arithmetic'
  /** |other - ninja| / |ninja|, or null when either side is missing. */
  relativeDelta: number | null
  severity: DriftSeverity | 'unresolved'
  note: string
}

/** Below this the two sources are treated as agreeing (rounding differences). */
const MINOR_THRESHOLD = 0.005
/** Above this the disagreement is worth surfacing prominently. */
const MAJOR_THRESHOLD = 0.05

function classify(ninja: number | null, other: number | null): { severity: DriftCheck['severity']; relativeDelta: number | null } {
  if (ninja === null || other === null) return { severity: 'unresolved', relativeDelta: null }
  if (ninja === 0 && other === 0) return { severity: 'match', relativeDelta: 0 }
  const denom = Math.abs(ninja) || Math.abs(other)
  const rel = Math.abs(other - ninja) / denom
  if (rel <= MINOR_THRESHOLD) return { severity: 'match', relativeDelta: rel }
  if (rel <= MAJOR_THRESHOLD) return { severity: 'minor', relativeDelta: rel }
  return { severity: 'major', relativeDelta: rel }
}

function check(
  stat: string,
  ninja: number | null,
  other: number | null,
  otherSource: DriftCheck['otherSource'],
  note = '',
): DriftCheck {
  const { severity, relativeDelta } = classify(ninja, other)
  return {
    stat,
    ninja,
    other,
    otherSource,
    relativeDelta,
    severity,
    note:
      note ||
      (severity === 'unresolved'
        ? 'One side did not report this stat; no comparison possible.'
        : severity === 'match'
          ? 'Sources agree.'
          : 'Sources disagree — treat this number with caution.'),
  }
}

export interface ReconciliationReport {
  checks: DriftCheck[]
  matches: number
  minor: number
  major: number
  unresolved: number
  /** True when nothing disagreed materially. */
  clean: boolean
}

/**
 * Compare poe.ninja's numbers against PoB's exported PlayerStat values and
 * against our own arithmetic over `breakdowns`.
 *
 * `pobStats` comes from `readPlayerStats(decodePobExport(...))`. Pass an empty
 * object when no export is available — the checks then report `unresolved`
 * rather than fabricating a comparison.
 */
export function reconcile(model: CharModel, pobStats: Record<string, number> = {}): ReconciliationReport {
  const defense = analyzeDefense(model)
  const dps = analyzeDps(model)
  const breakdowns = indexBreakdowns(model)
  const checks: DriftCheck[] = []

  const pob = (key: string): number | null =>
    typeof pobStats[key] === 'number' && Number.isFinite(pobStats[key]) ? pobStats[key] : null

  // --- poe.ninja vs Path of Building's own engine -------------------------
  if (dps.primary) {
    checks.push(
      check(
        `dps:${dps.primary.name}`,
        dps.primary.dps,
        pob('TotalDPS'),
        'pob-export',
        'poe.ninja per-skill DPS vs the TotalDPS PoB computed for the same build.',
      ),
    )
  }
  checks.push(check('life', defense.life, pob('Life'), 'pob-export'))
  checks.push(check('energyShield', defense.energyShield, pob('EnergyShield'), 'pob-export'))
  checks.push(check('armour', defense.armour, pob('Armour'), 'pob-export'))
  checks.push(check('evasion', defense.evasion, pob('Evasion'), 'pob-export'))

  for (const [statKey, pobKey] of [
    ['physicalMaximumHit', 'PhysicalMaximumHitTaken'],
    ['fireMaximumHit', 'FireMaximumHitTaken'],
    ['coldMaximumHit', 'ColdMaximumHitTaken'],
    ['lightningMaximumHit', 'LightningMaximumHitTaken'],
    ['chaosMaximumHit', 'ChaosMaximumHitTaken'],
  ] as const) {
    const type = statKey.replace('MaximumHit', '')
    const ninjaValue = defense.maxHits.find((m) => m.type === type)?.value ?? null
    checks.push(check(statKey, ninjaValue, pob(pobKey), 'pob-export'))
  }

  // --- poe.ninja's own totals vs its own breakdown parts ------------------
  // A mismatch here means our reading of the breakdown wire format has
  // drifted, which is worth knowing loudly. `verifyTotal` accounts for capped
  // resistances and for stats poe.ninja derives without listing modifiers, so
  // an unverifiable stat reports `unresolved` rather than a false alarm.
  for (const stat of breakdowns.all) {
    if (stat.derivation === 'empty') continue
    const verification = verifyTotal(stat)
    checks.push(
      check(
        `breakdown:${stat.key}`,
        stat.total,
        verification.expected,
        'breakdown-arithmetic',
        verification.uncheckableReason ??
          (stat.derivation === 'capped'
            ? `poe.ninja’s stated total vs base x (1 + inc/100) x more, clamped to the ${stat.cap} cap.`
            : 'poe.ninja’s stated total vs base x (1 + inc/100) x more recomputed from its own parts.'),
      ),
    )
  }

  const matches = checks.filter((c) => c.severity === 'match').length
  const minor = checks.filter((c) => c.severity === 'minor').length
  const major = checks.filter((c) => c.severity === 'major').length
  const unresolved = checks.filter((c) => c.severity === 'unresolved').length

  return { checks, matches, minor, major, unresolved, clean: major === 0 && minor === 0 }
}
