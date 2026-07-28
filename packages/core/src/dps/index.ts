/**
 * Tier 1 DPS — read poe.ninja's computed per-skill damage.
 *
 * This is the whole point of V2. poe.ninja ships a fully computed damage block
 * at `charModel.skills[i].dps[0]`. V1 never read it and instead exposed a
 * `calculate_character_dps` tool demanding ~15 caller-supplied modifiers to
 * reconstruct a number that arrived free. That tool is not ported.
 *
 * Nothing in this module computes damage. It reads, labels, and shapes.
 */

import type { CharModel, DamageType, NinjaSkill, NinjaSkillDps, Provenance } from '../model/types.js'
import { DAMAGE_TYPES } from '../model/types.js'

export interface DamageSplit {
  type: DamageType
  /** Percent of the hit, as poe.ninja reports it. */
  percent: number
}

export interface SkillDamage {
  name: string
  /** Hit DPS. 0 for buffs/heralds, which carry only damage over time. */
  dps: number
  dotDps: number
  /** dps + dotDps. The number to rank by. */
  totalDps: number
  /** True when the skill only ticks damage over time (herald, curse, aura). */
  isDotOnly: boolean

  /** Uses per second. Null when poe.ninja omitted it. */
  rate: number | null
  /**
   * Fraction of `rate` that lands, for charge-up skills. Observed 0.771 on
   * Snipe and absent on ordinary attacks. Null means "not applicable", NOT 1.
   */
  hitRate: number | null
  /** Effective uses per second once hitRate is applied. Null when unknown. */
  effectiveRate: number | null

  critChance: number | null
  critMultiplier: number | null
  hitChance: number | null
  projectiles: number | null
  forks: number | null
  aoeRadius: number | null

  /** Hit damage split. Empty when poe.ninja omitted it. */
  damageSplit: DamageSplit[]
  dotSplit: DamageSplit[]
  /** The single largest damage type, or null when the split is unknown. */
  dominantType: DamageType | null

  provenance: Provenance
  /** Support/meta gems socketed alongside, when the payload lists them. */
  gems: string[]
}

export interface DpsSummary {
  skills: SkillDamage[]
  /** Highest-total-DPS skill that actually hits. Null when none do. */
  primary: SkillDamage | null
  /** Skills that hit, ranked. */
  hitSkills: SkillDamage[]
  /** Buffs/heralds/auras — dot-only. */
  supportSkills: SkillDamage[]
  provenance: Provenance
  /** Populated when the payload carried no usable damage block at all. */
  unresolved: string | null
}

function splitOf(raw: number[] | undefined): DamageSplit[] {
  if (!Array.isArray(raw)) return []
  const out: DamageSplit[] = []
  for (let i = 0; i < DAMAGE_TYPES.length; i++) {
    const type = DAMAGE_TYPES[i]
    const percent = raw[i]
    if (type && typeof percent === 'number' && percent > 0) out.push({ type, percent })
  }
  return out.sort((a, b) => b.percent - a.percent)
}

function readNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function gemNames(skill: NinjaSkill): string[] {
  if (!Array.isArray(skill.allGems)) return []
  return skill.allGems
    .map((g) => g?.name ?? g?.itemData?.name ?? '')
    .filter((n): n is string => typeof n === 'string' && n.length > 0)
}

function toSkillDamage(entry: NinjaSkillDps, skill: NinjaSkill): SkillDamage | null {
  // Meta/trigger setups (Mirage Archer, Freezing Mark) carry a dps block with
  // no name. They are gem containers, not castable skills — skip rather than
  // inventing a label for them.
  const name = typeof entry.name === 'string' ? entry.name.trim() : ''
  if (!name) return null

  const dps = readNumber(entry.dps) ?? 0
  const dotDps = readNumber(entry.dotDps) ?? 0
  const rate = readNumber(entry.rate)
  const hitRate = readNumber(entry.hitRate)
  const damageSplit = splitOf(entry.damageTypes)
  const dotSplit = splitOf(entry.dotDamageTypes)

  return {
    name,
    dps,
    dotDps,
    totalDps: dps + dotDps,
    isDotOnly: dps === 0 && dotDps > 0,
    rate,
    hitRate,
    effectiveRate: rate !== null ? (hitRate !== null ? rate * hitRate : rate) : null,
    critChance: readNumber(entry.critChance),
    critMultiplier: readNumber(entry.critMultiplier),
    hitChance: readNumber(entry.hitChance),
    projectiles: readNumber(entry.projectiles),
    forks: readNumber(entry.forks),
    aoeRadius: readNumber(entry.aoeRadius),
    damageSplit,
    dotSplit,
    dominantType: damageSplit[0]?.type ?? dotSplit[0]?.type ?? null,
    provenance: 'ninja',
    gems: gemNames(skill),
  }
}

export function analyzeDps(model: Pick<CharModel, 'skills'>): DpsSummary {
  const raw = Array.isArray(model.skills) ? model.skills : []
  const skills: SkillDamage[] = []

  for (const skill of raw) {
    const block = Array.isArray(skill?.dps) ? skill.dps[0] : undefined
    if (!block) continue
    const parsed = toSkillDamage(block, skill)
    if (parsed) skills.push(parsed)
  }

  skills.sort((a, b) => b.totalDps - a.totalDps)

  const hitSkills = skills.filter((s) => !s.isDotOnly && s.dps > 0)
  const supportSkills = skills.filter((s) => s.isDotOnly)

  return {
    skills,
    primary: hitSkills[0] ?? null,
    hitSkills,
    supportSkills,
    provenance: 'ninja',
    unresolved: skills.length
      ? null
      : 'poe.ninja returned no per-skill damage block for this character. This usually means the profile has not been indexed since the last skill change.',
  }
}
