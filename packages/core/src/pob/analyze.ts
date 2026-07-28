/**
 * Analyse a build from a Path of Building export code alone.
 *
 * ## Why this exists instead of "Tier 3 estimation"
 *
 * The original plan called for an internal DPS estimator as a fallback, always
 * labelled `estimate`. Checked against the real data, that fallback has no
 * trigger and should not be built:
 *
 *   - The poe.ninja path resolves every damaging skill. On the reference
 *     character `dps.unresolved` is null and all four hit skills carry a
 *     computed figure; the two zeros are heralds, which genuinely only deal
 *     damage over time.
 *   - The paste path was rejecting Path of Building codes outright, with the
 *     claim that a code "does not carry the computed stats this tool reads".
 *     **That was wrong.** A code carries 106 `<PlayerStat>` values — TotalDPS
 *     109859.05, all five maximum-hit-taken figures, every resistance, life,
 *     energy shield, armour, evasion — every one of them computed by Path of
 *     Building's own engine.
 *
 * So the real gap was never a missing estimator. It was that a second source of
 * genuine numbers was being turned away at the door. Building an estimator to
 * fill a gap that does not exist would mean inventing numbers in a project whose
 * first rule is not to.
 *
 * Everything here is read, never derived. `provenance` is `pob` throughout so a
 * reader always knows which engine produced the figure, and `missing` names what
 * a code cannot supply rather than substituting a guess.
 */

import { importPobExport, type PobBuildInfo } from './export.js'
import type { DamageType } from '../model/types.js'

/** What a Path of Building code cannot tell you, stated rather than filled in. */
export interface PobGap {
  what: string
  why: string
}

export interface PobMaxHit {
  type: DamageType
  value: number
}

export interface PobResistance {
  type: 'fire' | 'cold' | 'lightning' | 'chaos'
  value: number
  max: number
  overCap: number
  underCap: number
}

export interface PobAnalysis {
  provenance: 'pob'
  identity: {
    level: number | null
    className: string | null
    ascendancy: string | null
  }
  defense: {
    lowestMaximumHit: number | null
    lowestMaximumHitType: DamageType | null
    effectiveHealthPool: number | null
    ehpOverstatementRatio: number | null
    maxHits: PobMaxHit[]
    resistances: PobResistance[]
    life: number
    energyShield: number
    mana: number
    armour: number
    evasion: number
    physicalDamageReduction: number | null
  }
  damage: {
    /** PoB's headline figure, for the skill it had selected. */
    totalDps: number | null
    combinedDps: number | null
    totalDotDps: number | null
    fullDps: number | null
    averageDamage: number | null
    speed: number | null
    critChance: number | null
    critMultiplier: number | null
  }
  passives: {
    allocated: number[]
    count: number
  }
  /** Every PlayerStat, so nothing is hidden behind the curated view above. */
  playerStats: Record<string, number>
  /** What this source cannot answer. */
  gaps: PobGap[]
}

const MAX_HIT_STATS: Record<DamageType, string> = {
  physical: 'PhysicalMaximumHitTaken',
  fire: 'FireMaximumHitTaken',
  cold: 'ColdMaximumHitTaken',
  lightning: 'LightningMaximumHitTaken',
  chaos: 'ChaosMaximumHitTaken',
}

const RESIST_STATS: Record<PobResistance['type'], string> = {
  fire: 'FireResist',
  cold: 'ColdResist',
  lightning: 'LightningResist',
  chaos: 'ChaosResist',
}

/**
 * Resistance cap.
 *
 * PoB reports the resistance value but not the cap alongside it, and the
 * over-cap stats it does emit (`FireResistOverCap`) are relative to the same 75.
 * 75 is the game default; a build that has raised its maximum resistances will
 * be understated here, which is why `gaps` says so.
 */
const DEFAULT_RESIST_CAP = 75

function num(stats: Record<string, number>, key: string): number | null {
  const value = stats[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Build an analysis from a Path of Building export code.
 *
 * Throws only when the code itself will not decode — a build with unusual stats
 * yields a report with more entries in `gaps`, never an error.
 */
export async function analyzeFromPob(code: string): Promise<PobAnalysis> {
  const build: PobBuildInfo & { xml: string } = await importPobExport(code)
  const stats = build.playerStats

  const maxHits: PobMaxHit[] = []
  for (const [type, key] of Object.entries(MAX_HIT_STATS) as [DamageType, string][]) {
    const value = num(stats, key)
    if (value !== null && value > 0) maxHits.push({ type, value })
  }
  maxHits.sort((a, b) => a.value - b.value)
  const lowest = maxHits[0] ?? null

  const resistances: PobResistance[] = []
  for (const [type, key] of Object.entries(RESIST_STATS) as [PobResistance['type'], string][]) {
    const value = num(stats, key)
    if (value === null) continue
    // PoB emits its own over-cap stat; prefer it, since it accounts for maximum
    // resistance modifiers this code cannot otherwise see.
    const reportedOver = num(stats, `${key}OverCap`)
    const overCap = reportedOver !== null ? Math.max(0, reportedOver) : Math.max(0, value - DEFAULT_RESIST_CAP)
    resistances.push({
      type,
      value,
      max: DEFAULT_RESIST_CAP,
      overCap,
      underCap: Math.max(0, DEFAULT_RESIST_CAP - value),
    })
  }

  const ehp = num(stats, 'TotalEHP')

  const gaps: PobGap[] = [
    {
      what: 'Per-skill damage',
      why:
        'A Path of Building code carries TotalDPS for the skill it had selected and nothing per-skill. ' +
        'Load the character from poe.ninja for the full matrix, or drive a live Path of Building through the bridge.',
    },
    {
      what: 'Stat attribution — which item or passive grants each point',
      why:
        'That comes from poe.ninja’s per-stat breakdowns, which a Path of Building code does not contain. ' +
        'Gear tiers and resistance rebalancing need it, so those are unavailable from a code alone.',
    },
  ]

  if (num(stats, 'Ward') === null) {
    gaps.push({
      what: 'Ward',
      why: 'Not among the exported PlayerStat values, so it is reported as absent rather than as zero.',
    })
  }
  if (num(stats, 'BlockChance') === null) {
    gaps.push({ what: 'Block chance', why: 'Not among the exported PlayerStat values.' })
  }
  if (resistances.length && resistances.every((r) => num(stats, `${RESIST_STATS[r.type]}OverCap`) === null)) {
    gaps.push({
      what: 'Raised maximum resistances',
      why: `No over-cap stats were exported, so caps are assumed to be the game default of ${DEFAULT_RESIST_CAP}%. A build that raises its maximums will read as more over-capped than it is.`,
    })
  }

  return {
    provenance: 'pob',
    identity: {
      level: build.level ?? null,
      className: build.className ?? null,
      ascendancy: build.ascendClassName ?? null,
    },
    defense: {
      lowestMaximumHit: lowest?.value ?? null,
      lowestMaximumHitType: lowest?.type ?? null,
      effectiveHealthPool: ehp,
      ehpOverstatementRatio: ehp !== null && lowest && lowest.value > 0 ? Number((ehp / lowest.value).toFixed(2)) : null,
      maxHits,
      resistances,
      life: num(stats, 'Life') ?? 0,
      energyShield: num(stats, 'EnergyShield') ?? 0,
      mana: num(stats, 'Mana') ?? 0,
      armour: num(stats, 'Armour') ?? 0,
      evasion: num(stats, 'Evasion') ?? 0,
      physicalDamageReduction: num(stats, 'PhysicalDamageReduction'),
    },
    damage: {
      totalDps: num(stats, 'TotalDPS'),
      combinedDps: num(stats, 'CombinedDPS'),
      totalDotDps: num(stats, 'TotalDotDPS'),
      fullDps: num(stats, 'FullDPS'),
      averageDamage: num(stats, 'AverageDamage'),
      speed: num(stats, 'Speed'),
      critChance: num(stats, 'CritChance'),
      critMultiplier: num(stats, 'CritMultiplier'),
    },
    passives: {
      allocated: build.treeNodeIds ?? [],
      count: build.treeNodeIds?.length ?? 0,
    },
    playerStats: stats,
    gaps,
  }
}

/** True when a pasted string looks like a Path of Building code rather than JSON. */
export function looksLikePobCode(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('[')) return false
  // base64url, no whitespace, and long enough to be a real build.
  return trimmed.length > 100 && /^[A-Za-z0-9_-]+={0,2}$/.test(trimmed)
}
