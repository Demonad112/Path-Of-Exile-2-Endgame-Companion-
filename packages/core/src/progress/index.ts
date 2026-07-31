/**
 * Progress snapshots — is what you did last week working?
 *
 * Every other panel answers "where are you now". None of them answered the
 * question a player improving a character actually repeats, which is whether
 * the last change helped. That needs history, and history needs something small
 * enough to keep.
 *
 * Deliberately NOT a stored `Analysis`: gear, mods and breakdowns make one
 * character hundreds of kilobytes, and keeping twenty of those would put real
 * pressure on a storage budget shared with checklist and Atlas progress. These
 * are the figures worth trending, and nothing else.
 *
 * Pure, like the rest of the core: the timestamp is passed in rather than read
 * from the clock, so a snapshot is reproducible and testable.
 */

import type { Analysis } from '../analyze.js'
import { effectivePool, NO_KEYSTONE_EFFECTS, type KeystoneEffects } from '../keystones/index.js'
import { isHealthy } from '../thresholds.js'

/** A compact record of what a character's numbers were at one point in time. */
export interface CharacterSnapshot {
  /** ISO timestamp this snapshot was taken. */
  at: string
  /** When poe.ninja last reindexed the character. Null when it did not say. */
  updatedUtc: string | null
  /** account/name — history is per character, not per browser. */
  key: string
  level: number
  life: number
  energyShield: number
  ward: number
  armour: number
  evasion: number
  /** Keystone-corrected defensive pool, matching what the assessment used. */
  pool: number
  /** poe.ninja's averaged effective health pool. Trended, never led with. */
  ehp: number
  fire: number
  cold: number
  lightning: number
  chaos: number
  /** Best hitting skill's total DPS. 0 when none was reported. */
  dps: number
  /** Lowest maximum hit taken across damage types; 0 when unknown. */
  weakestHit: number
  /** Allocated passives, as poe.ninja counts them. */
  passives: number
}

/** How many snapshots to keep per character before dropping the oldest. */
export const MAX_SNAPSHOTS = 20

export function snapshotKey(identity: Pick<Analysis['identity'], 'account' | 'name'>): string {
  return `${identity.account}/${identity.name}`
}

export function toSnapshot(
  analysis: Pick<Analysis, 'identity' | 'defense' | 'dps' | 'passives'>,
  at: string,
  keystones: KeystoneEffects = NO_KEYSTONE_EFFECTS,
): CharacterSnapshot {
  const { identity, defense, dps, passives } = analysis
  const res = (type: string): number => defense.resistances.find((r) => r.type === type)?.value ?? 0
  const hits = defense.maxHits.map((h) => h.value).filter((v) => v > 0)

  return {
    at,
    updatedUtc: identity.updatedUtc,
    key: snapshotKey(identity),
    level: identity.level ?? 0,
    life: defense.life,
    energyShield: defense.energyShield,
    ward: defense.ward,
    armour: defense.armour,
    evasion: defense.evasion,
    pool: effectivePool(defense, keystones).total,
    ehp: defense.effectiveHealthPool ?? 0,
    fire: res('fire'),
    cold: res('cold'),
    lightning: res('lightning'),
    chaos: res('chaos'),
    dps: Math.round(dps.primary?.totalDps ?? 0),
    weakestHit: hits.length ? Math.min(...hits) : 0,
    passives: passives.counts.passives ?? passives.mainSelectionLength,
  }
}

/** Whether a change in this metric is an improvement. */
type Direction = 'higher' | 'lower'

export interface MetricDelta {
  field: keyof CharacterSnapshot
  label: string
  before: number
  after: number
  delta: number
  /** True when the change moved in the helpful direction. */
  improved: boolean
  /** Percent change. Null when `before` was 0 and no percentage is defined. */
  percent: number | null
  /** Resistances read as percentages; everything else is a raw figure. */
  unit: 'percent' | 'raw'
}

const METRICS: ReadonlyArray<{
  field: keyof CharacterSnapshot
  label: string
  dir: Direction
  unit: 'percent' | 'raw'
}> = Object.freeze([
  { field: 'level', label: 'Level', dir: 'higher', unit: 'raw' },
  { field: 'pool', label: 'Defensive pool', dir: 'higher', unit: 'raw' },
  { field: 'weakestHit', label: 'Weakest maximum hit', dir: 'higher', unit: 'raw' },
  { field: 'ehp', label: 'Effective health pool', dir: 'higher', unit: 'raw' },
  { field: 'life', label: 'Life', dir: 'higher', unit: 'raw' },
  { field: 'energyShield', label: 'Energy Shield', dir: 'higher', unit: 'raw' },
  { field: 'ward', label: 'Ward', dir: 'higher', unit: 'raw' },
  { field: 'evasion', label: 'Evasion', dir: 'higher', unit: 'raw' },
  { field: 'armour', label: 'Armour', dir: 'higher', unit: 'raw' },
  { field: 'dps', label: 'Damage', dir: 'higher', unit: 'raw' },
  { field: 'fire', label: 'Fire Resistance', dir: 'higher', unit: 'percent' },
  { field: 'cold', label: 'Cold Resistance', dir: 'higher', unit: 'percent' },
  { field: 'lightning', label: 'Lightning Resistance', dir: 'higher', unit: 'percent' },
  { field: 'chaos', label: 'Chaos Resistance', dir: 'higher', unit: 'percent' },
  { field: 'passives', label: 'Passive points', dir: 'higher', unit: 'raw' },
])

export interface SnapshotDiff {
  from: CharacterSnapshot
  to: CharacterSnapshot
  /** Only metrics that actually moved, largest relative change first. */
  changes: MetricDelta[]
  /** Elemental resistances that newly reached their cap between the two. */
  newlyCapped: string[]
  /** Elemental resistances that fell below their cap between the two. */
  newlyUncapped: string[]
}

const ELEMENTS: ReadonlyArray<{ field: keyof CharacterSnapshot; type: 'fire' | 'cold' | 'lightning'; label: string }> =
  Object.freeze([
    { field: 'fire', type: 'fire', label: 'Fire' },
    { field: 'cold', type: 'cold', label: 'Cold' },
    { field: 'lightning', type: 'lightning', label: 'Lightning' },
  ])

/**
 * Compare two snapshots.
 *
 * `resistanceMax` is the character's own maximum as poe.ninja reports it, not a
 * hardcoded 75 — a build that raised its cap to 80 has not "reached cap" at 75,
 * and saying so would report a gap as closed.
 */
export function diffSnapshots(
  from: CharacterSnapshot,
  to: CharacterSnapshot,
  resistanceMax = 75,
): SnapshotDiff {
  const changes: MetricDelta[] = []

  for (const { field, label, dir, unit } of METRICS) {
    const before = from[field]
    const after = to[field]
    if (typeof before !== 'number' || typeof after !== 'number') continue
    if (before === after) continue
    const delta = after - before
    changes.push({
      field,
      label,
      before,
      after,
      delta,
      improved: dir === 'higher' ? delta > 0 : delta < 0,
      percent: before !== 0 ? (delta / Math.abs(before)) * 100 : null,
      unit,
    })
  }

  changes.sort((a, b) => Math.abs(b.percent ?? 0) - Math.abs(a.percent ?? 0))

  // Crossing the cap is worth calling out separately: 74% to 75% is a one-point
  // change that matters far more than a twenty-point move mid-range.
  const newlyCapped: string[] = []
  const newlyUncapped: string[] = []
  for (const { field, type, label } of ELEMENTS) {
    const before = from[field] as number
    const after = to[field] as number
    const wasCapped = isHealthy({ type, value: before, max: resistanceMax })
    const isCapped = isHealthy({ type, value: after, max: resistanceMax })
    if (!wasCapped && isCapped) newlyCapped.push(label)
    if (wasCapped && !isCapped) newlyUncapped.push(label)
  }

  return { from, to, changes, newlyCapped, newlyUncapped }
}

/**
 * Append a snapshot, dropping a duplicate of the most recent one and trimming
 * to MAX_SNAPSHOTS. Re-importing without having played should not fill the
 * history with identical rows.
 */
export function appendSnapshot(history: CharacterSnapshot[], next: CharacterSnapshot): CharacterSnapshot[] {
  const mine = history.filter((s) => s.key === next.key)
  const others = history.filter((s) => s.key !== next.key)
  const last = mine[mine.length - 1]

  const unchanged =
    last !== undefined &&
    (Object.keys(next) as Array<keyof CharacterSnapshot>)
      .filter((k) => k !== 'at' && k !== 'updatedUtc')
      .every((k) => last[k] === next[k])

  const updated = unchanged ? mine : [...mine, next].slice(-MAX_SNAPSHOTS)
  return [...others, ...updated]
}

/** This character's snapshots, oldest first. */
export function historyFor(history: CharacterSnapshot[], key: string): CharacterSnapshot[] {
  return history.filter((s) => s.key === key)
}

/**
 * The change since the previous snapshot of this character, or null when there
 * is only one — a single point is not a trend, and rendering it as one would
 * invent a baseline.
 */
export function latestDiff(
  history: CharacterSnapshot[],
  key: string,
  resistanceMax = 75,
): SnapshotDiff | null {
  const mine = historyFor(history, key)
  if (mine.length < 2) return null
  return diffSnapshots(mine[mine.length - 2]!, mine[mine.length - 1]!, resistanceMax)
}
