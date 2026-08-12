/**
 * The offence rules.
 *
 * The predecessor carried `DPS_STRONG / DPS_OK / DPS_LOW` and this codebase
 * deliberately does not. These tests exist to prove the replacement is a
 * different kind of thing: every figure below is arithmetic on the character's
 * own numbers, so the assertions are exact rather than banded, and each rule is
 * checked for staying SILENT as carefully as for firing.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { analyzeCharacter } from '../src/analyze.js'
import { analyzeDps, type SkillDamage } from '../src/dps/index.js'
import { normalizeItems } from '../src/model/slots.js'
import {
  accuracyRule,
  critInvestmentRule,
  critModsOn,
  dotArchetypeRule,
  dotShare,
  effectiveCritMultiplier,
} from '../src/recommend/offence.js'
import type { CharModel } from '../src/model/types.js'

const payload = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/athrynas-v43.json', import.meta.url)), 'utf8'),
)
const model = (payload.charModel ?? payload) as CharModel
const dps = analyzeDps(model)
const items = normalizeItems(model)
const ctx = { dps, items }

/** A minimal skill, so a rule can be aimed at one condition at a time. */
function skill(over: Partial<SkillDamage> = {}): SkillDamage {
  return {
    name: 'Test Skill',
    dps: 100_000,
    dotDps: 0,
    totalDps: 100_000,
    isDotOnly: false,
    rate: 1,
    hitRate: null,
    effectiveRate: 1,
    critChance: 5,
    critMultiplier: 2.48,
    hitChance: 100,
    projectiles: null,
    forks: null,
    aoeRadius: null,
    damageSplit: [],
    dotSplit: [],
    dominantType: null,
    provenance: 'ninja',
    gems: [],
    ...over,
  }
}

function withPrimary(s: SkillDamage) {
  return { dps: { ...dps, primary: s, hitSkills: [s] }, items }
}

describe('effective crit multiplier', () => {
  it('is 1 + chance x (multiplier - 1)', () => {
    // The reference character: 5% chance at 2.48x is 7.4% more damage, not 148%.
    // This single number is what makes "5% crit chance" mean something.
    expect(effectiveCritMultiplier(skill())).toBeCloseTo(1.074, 5)
  })

  it('scales with chance, not with the multiplier alone', () => {
    // The same 2.48x multiplier at 40% chance is worth eight times as much.
    expect(effectiveCritMultiplier(skill({ critChance: 40 }))).toBeCloseTo(1.592, 5)
  })

  it('reports null rather than a number when the figures are missing', () => {
    expect(effectiveCritMultiplier(skill({ critChance: null }))).toBeNull()
    expect(effectiveCritMultiplier(skill({ critMultiplier: null }))).toBeNull()
  })

  it('treats a multiplier at or below 1 as unpopulated, not as "crits do nothing"', () => {
    // poe.ninja omits the field on some skills. A 1.0 there would otherwise be
    // read as a build whose crits deal normal damage, which is a real claim.
    expect(effectiveCritMultiplier(skill({ critMultiplier: 1 }))).toBeNull()
    expect(effectiveCritMultiplier(skill({ critChance: 0 }))).toBeNull()
  })
})

describe('crit modifiers on gear', () => {
  it('counts only the active weapon set', () => {
    // The reference character carries four crit modifiers, three of them on the
    // idle set. Counting all four would describe a kit nobody is wearing.
    const mods = critModsOn(items)
    expect(mods.multiplierMods).toHaveLength(1)
    expect(mods.multiplierMods[0]!.item.name).toBe('Brood Dart')
    expect(mods.additiveMultiplierPoints).toBe(37)
  })

  it('never folds a local increased-crit-chance roll into multiplier points', () => {
    // Rapture Blast carries `local_critical_strike_chance: 186`. That is a
    // different quantity, and adding 186 points of "multiplier" would produce a
    // confidently wrong number.
    const mods = critModsOn(items)
    expect(mods.additiveMultiplierPoints).toBe(37)
    expect(mods.multiplierMods.every((m) => m.points === 37)).toBe(true)
  })
})

describe('the crit investment rule', () => {
  const found = critInvestmentRule(ctx)

  it('fires on a build sitting at base crit chance', () => {
    expect(found).toHaveLength(1)
    expect(found[0]!.id).toBe('dps-crit-uninvested')
    expect(found[0]!.category).toBe('damage')
  })

  it('states what crit is currently returning, to one decimal', () => {
    expect(found[0]!.action).toContain('7.4%')
    expect(found[0]!.rationale).toContain('one hit in 20')
  })

  it('prices the modifier the character is actually carrying', () => {
    // +37% multiplier at 5% chance: 1.074 / 1.0555 - 1 = 1.75%. This is the
    // figure that makes the finding concrete instead of a lecture.
    const note = found[0]!.evidence.map((e) => e.note).join(' ')
    expect(note).toContain('Brood Dart')
    expect(note).toContain('+37%')
    expect(note).toMatch(/worth 1\.8% more damage/)
  })

  it('names no impact, because the better alternative is not derivable', () => {
    // What committing to crit would yield depends on reachable chance, and what
    // a replacement affix would give depends on the build's direction — the
    // judgement this project declines to make.
    expect(found[0]!.impact).toBeNull()
    expect(found[0]!.cost.kind).toBe('unknown')
  })

  it('stays silent once crit is genuinely invested in', () => {
    // 40% chance at 2.48x is 1.592 — well past the point where scaling it is
    // the wrong advice.
    expect(critInvestmentRule(withPrimary(skill({ critChance: 40 })))).toHaveLength(0)
  })

  it('stays silent on a damage-over-time build', () => {
    // Crit does not apply to damage over time, so this advice would point a DoT
    // build in exactly the wrong direction.
    const dot = skill({ dps: 10_000, dotDps: 90_000, totalDps: 100_000 })
    expect(critInvestmentRule(withPrimary(dot))).toHaveLength(0)
  })

  it('stays silent when poe.ninja reported no crit figures', () => {
    expect(critInvestmentRule(withPrimary(skill({ critChance: null })))).toHaveLength(0)
  })
})

describe('the accuracy rule', () => {
  it('stays silent at full hit chance', () => {
    // The reference character hits 100% of the time. A rule that fired here
    // would be inventing a problem.
    expect(dps.primary!.hitChance).toBe(100)
    expect(accuracyRule(ctx)).toHaveLength(0)
  })

  it('computes the gain as exactly 100/hitChance - 1', () => {
    // 92% hit chance is a 8.7% damage gain: 100/92 = 1.0870.
    const found = accuracyRule(withPrimary(skill({ hitChance: 92 })))
    expect(found).toHaveLength(1)
    expect(found[0]!.action).toContain('8.7%')
    expect(found[0]!.impact!.to).toBeCloseTo(108_695.65, 1)
    expect(found[0]!.impact!.significance).toBeCloseTo(0.08, 5)
  })

  it('ignores a gap too small to be worth acting on', () => {
    // 99% hit chance is a 1.0% gain — true, and noise.
    expect(accuracyRule(withPrimary(skill({ hitChance: 99 })))).toHaveLength(0)
  })

  it('reports null hit chance as unknown rather than as a miss', () => {
    expect(accuracyRule(withPrimary(skill({ hitChance: null })))).toHaveLength(0)
  })
})

describe('the damage-over-time rule', () => {
  it('fires once ticking damage dominates', () => {
    const dot = skill({ dps: 30_000, dotDps: 70_000, totalDps: 100_000 })
    const found = dotArchetypeRule(withPrimary(dot))
    expect(found).toHaveLength(1)
    expect(found[0]!.action).toContain('70%')
    // No gain is projected: which ailment modifiers this build can reach is not
    // in the payload.
    expect(found[0]!.impact).toBeNull()
  })

  it('stays silent on a hit-driven build', () => {
    // The reference character's damage is 99.7% hits.
    expect(dotShare(dps.primary!)).toBeLessThan(0.01)
    expect(dotArchetypeRule(ctx)).toHaveLength(0)
  })
})

describe('offence findings reaching the full analysis', () => {
  it('appear alongside the defensive ones', async () => {
    const analysis = await analyzeCharacter(payload)
    const ids = analysis.recommendations.recommendations.map((r) => r.id)
    expect(ids).toContain('dps-crit-uninvested')
    // And the rules that should not fire on this character do not.
    expect(ids).not.toContain('dps-accuracy')
    expect(ids).not.toContain('dps-dot-dominant')
  })

  it('needs no Path of Building export', async () => {
    // Every input comes from poe.ninja's own per-skill block, so the finding
    // survives a character with no export attached.
    const { pathOfBuildingExport: _drop, ...withoutExport } = model
    const analysis = await analyzeCharacter(withoutExport)
    expect(analysis.pobStats).toBeNull()
    expect(analysis.recommendations.recommendations.map((r) => r.id)).toContain('dps-crit-uninvested')
  })
})
