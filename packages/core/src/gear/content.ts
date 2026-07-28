/**
 * Survivability against map tier and against bosses.
 *
 * ## A correction
 *
 * An earlier version of this module refused to name a map tier, on the grounds
 * that no tier data existed. That was based on `WorldAreas.json`, which carries
 * no tier field and only six distinct map levels — a real observation, and the
 * wrong conclusion, because I had looked in one place.
 *
 * Waystones are items. `base_items.json` lists `Waystone (Tier 1..16)` with a
 * drop level equal to **64 + tier** for every tier from 2 to 16, and WorldAreas
 * independently confirms those levels. The mapping was there all along.
 *
 * ## What is measured, and what is still not
 *
 * Headroom is the character's smallest fatal hit divided by base monster damage
 * at that area level. Both sides of that are real.
 *
 * What is NOT modelled: rare and unique monster damage multipliers, and map
 * modifiers. Those scale the incoming hit well past the base figure, so the
 * headroom here is an upper bound on a normal monster — never a verdict that a
 * tier is safe. Boss rows carry the same caveat: PoB gives their LEVEL, which is
 * what scales base damage, but a boss's own attack multipliers are its own.
 */

import type { DefenseSummary } from '../defense/index.js'

/** Waystone tier and the area level it opens. */
export interface TierEntry {
  tier: number
  areaLevel: number
  dropLevel: number
  /** False only for tier 1, which drops in the campaign below its own level. */
  dropLevelMatches: boolean
}

export interface EnemyLevels {
  source: string
  /** Ceiling for normal enemies and all bosses. */
  maxNormalAndBoss: number
  /** Floor for pinnacle and uber pinnacle bosses. */
  pinnacleMinimum: number
  note: string
}

export interface MonsterStatData {
  version: number
  generatedFrom: string
  limitation: string
  /** areaLevel -> base physical damage */
  physicalDamage: Record<string, number>
  tiers: TierEntry[]
  enemyLevels: EnemyLevels
  mapLevels: number[]
  mapsByLevel: Record<string, string[]>
}

/** How comfortable a given headroom is. Thresholds are stated, not hidden. */
export type Comfort = 'comfortable' | 'thin' | 'dangerous'

export const COMFORT_THRESHOLDS = {
  /** At or above this many base hits survived, call it comfortable. */
  comfortable: 12,
  /** Below this, one unlucky rare hit is lethal. */
  dangerous: 6,
} as const

function comfortOf(headroom: number): Comfort {
  if (headroom >= COMFORT_THRESHOLDS.comfortable) return 'comfortable'
  if (headroom < COMFORT_THRESHOLDS.dangerous) return 'dangerous'
  return 'thin'
}

export interface TierRow {
  tier: number
  areaLevel: number
  baseMonsterHit: number
  /** Base monster hits survived. */
  headroom: number
  comfort: Comfort
  maps: string[]
}

export interface BossRow {
  label: string
  level: number
  baseMonsterHit: number
  headroom: number
  comfort: Comfort
  note: string
}

export interface ContentReport {
  lowestMaximumHit: number
  lowestMaximumHitType: string
  /** Waystone tiers, lowest first. */
  tiers: TierRow[]
  /** Boss reference points from Path of Building's own configuration. */
  bosses: BossRow[]
  /**
   * The highest tier still comfortable, and the first that is dangerous.
   * Null when no tier qualifies.
   */
  highestComfortableTier: number | null
  firstDangerousTier: number | null
  /** One honest sentence. */
  summary: string
  caveats: string[]
  unresolved: { question: string; missing: string }[]
}

export function analyzeContent(defense: DefenseSummary, data: MonsterStatData): ContentReport {
  const lowest = defense.lowestMaximumHit ?? 0
  const type = defense.lowestMaximumHitType ?? 'unknown'
  const damageAt = (level: number) => data.physicalDamage[String(level)] ?? null

  const tiers: TierRow[] = []
  for (const entry of data.tiers ?? []) {
    const hit = damageAt(entry.areaLevel)
    if (hit === null || hit <= 0) continue
    const headroom = Number((lowest / hit).toFixed(1))
    tiers.push({
      tier: entry.tier,
      areaLevel: entry.areaLevel,
      baseMonsterHit: Math.round(hit),
      headroom,
      comfort: comfortOf(headroom),
      maps: data.mapsByLevel?.[String(entry.areaLevel)] ?? [],
    })
  }

  const bosses: BossRow[] = []
  const bossPoints: [string, number, string][] = [
    [
      'Pinnacle boss',
      data.enemyLevels?.pinnacleMinimum ?? 82,
      'The floor for pinnacle and uber pinnacle bosses. They cannot be lower than this even at low character level.',
    ],
    [
      'Highest-level boss',
      data.enemyLevels?.maxNormalAndBoss ?? 85,
      'The ceiling for normal enemies and all bosses. Nothing in the game scales past this level.',
    ],
  ]
  for (const [label, level, note] of bossPoints) {
    const hit = damageAt(level)
    if (hit === null || hit <= 0) continue
    const headroom = Number((lowest / hit).toFixed(1))
    bosses.push({ label, level, baseMonsterHit: Math.round(hit), headroom, comfort: comfortOf(headroom), note })
  }

  const comfortable = tiers.filter((t) => t.comfort === 'comfortable')
  const dangerous = tiers.filter((t) => t.comfort === 'dangerous')
  const highestComfortableTier = comfortable.length ? Math.max(...comfortable.map((t) => t.tier)) : null
  const firstDangerousTier = dangerous.length ? Math.min(...dangerous.map((t) => t.tier)) : null

  const top = tiers.at(-1)
  const summary =
    highestComfortableTier === null
      ? `A ${type} hit of ${lowest.toLocaleString()} kills this character, which is thin against a base monster even at tier 1. Survivability is the constraint, not the content.`
      : top && highestComfortableTier >= top.tier
        ? `Against BASE monsters this character has ${top.headroom}x headroom at tier ${top.tier}, the highest waystone. Base monsters are not what kills characters at this level — rares, uniques and map modifiers are, and those multipliers are not modelled here.`
        : `Against BASE monsters this character is comfortable to tier ${highestComfortableTier}` +
          (firstDangerousTier !== null ? `, and thin from tier ${firstDangerousTier}` : '') +
          `. That is against a normal monster; rares, uniques and map modifiers hit considerably harder.`

  return {
    lowestMaximumHit: lowest,
    lowestMaximumHitType: type,
    tiers,
    bosses,
    highestComfortableTier,
    firstDangerousTier,
    summary,
    caveats: [
      'Measured against a BASE monster of that area level. Rare and unique monsters and map modifiers scale damage well past this, and those multipliers are not modelled here — so these figures are an upper bound, not a safety verdict.',
      `Headroom is against ${type} damage, the type that kills this character soonest. Other damage types have more room.`,
      'Base monster damage is physical. A character whose weakest defence is elemental or chaos has less real headroom than the physical figure suggests.',
      `Comfortable means surviving ${COMFORT_THRESHOLDS.comfortable} base hits or more; dangerous means fewer than ${COMFORT_THRESHOLDS.dangerous}. Those thresholds are this project's judgement, not a game constant.`,
    ],
    unresolved: [
      {
        question: 'How much harder does a specific rare, unique or map modifier hit?',
        missing:
          'Monster damage multipliers per rarity and per map modifier are not in the data used here. Only the base ' +
          'monster figure for the area level is derived, so a boss row states its LEVEL rather than its damage.',
      },
    ],
  }
}
