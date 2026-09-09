/**
 * Keystone corroboration.
 *
 * The load-bearing test here is `verify`: a keystone allocated on the tree is
 * NOT proof it is doing anything, and applying its corrections when the
 * character's stats contradict it is the failure this whole module exists to
 * prevent.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { analyzeCharacter, unwrapCharModel } from '../src/analyze.js'
import { analyzeDefense, type DefenseSummary } from '../src/defense/index.js'
import {
  effectiveArmour,
  effectivePool,
  hasKeystoneRule,
  keystoneEffectsOf,
  NO_KEYSTONE_EFFECTS,
} from '../src/keystones/index.js'
import { NODE_KIND, PassiveTree, type PassiveTreeData } from '../src/tree/index.js'
import type { CharModel } from '../src/model/types.js'

const fixturePath = fileURLToPath(new URL('./fixtures/athrynas-v43.json', import.meta.url))
const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown
const model = unwrapCharModel(raw)
const defense = analyzeDefense(model)

const treePath = fileURLToPath(new URL('../../data/generated/passive-tree.json', import.meta.url))
const tree = new PassiveTree(JSON.parse(readFileSync(treePath, 'utf8')) as PassiveTreeData)

/** Node ids for keystones, read out of the shipped artifact rather than typed. */
const keystoneIds = new Map<string, number>()
for (const node of tree.allNodes()) {
  if (node.kind === NODE_KIND.keystone) keystoneIds.set(node.name, node.id)
}

/** A defence summary with only the fields the verifiers read. */
function stats(over: Partial<DefenseSummary>): DefenseSummary {
  return { ...defense, ...over }
}

describe('rule coverage', () => {
  it('names only keystones that exist in the shipped tree data', () => {
    // A typo in a rule key disables that correction silently: the keystone
    // resolves on the tree, the rule never matches, and the analysis quietly
    // states a conclusion the keystone forbids.
    const ruled = [
      'Chaos Inoculation',
      'Eldritch Battery',
      'Iron Reflexes',
      'Resolute Technique',
      'Avatar of Fire',
      'Necromantic Talisman',
      'Mind Over Matter',
      'Blood Magic',
      "Zealot's Oath",
      'Eternal Youth',
      'Trusted Kinship',
      "Giant's Blood",
      'Glancing Blows',
      'Bulwark',
      'Hollow Palm Technique',
      'Unwavering Stance',
      'Vaal Pact',
    ]
    for (const name of ruled) {
      expect(hasKeystoneRule(name), `${name} has no rule`).toBe(true)
      expect(keystoneIds.has(name), `${name} is not a keystone in the tree data`).toBe(true)
    }
  })

  it('leaves keystones without a rule alone rather than guessing', () => {
    expect(hasKeystoneRule('Pain Attunement')).toBe(false)
    const effects = keystoneEffectsOf([{ name: 'Pain Attunement' }], defense)
    expect(effects.notes).toEqual([])
    expect(effects.unverified).toEqual([])
    expect(effects.applied).toEqual([])
  })
})

describe('corroboration', () => {
  it('applies Chaos Inoculation when life reads 1', () => {
    const effects = keystoneEffectsOf([{ name: 'Chaos Inoculation' }], stats({ life: 1 }))
    expect(effects.chaosImmune).toBe(true)
    expect(effects.lifeIsNegligible).toBe(true)
    expect(effects.unverified).toEqual([])
    expect(effects.applied).toEqual(['Chaos Inoculation'])
  })

  it('refuses Chaos Inoculation when the character plainly has life', () => {
    // The case that motivated this: a real ladder character with the node
    // allocated in its only active spec while both poe.ninja and PoB reported
    // 1,823 life and 54% chaos resistance.
    const effects = keystoneEffectsOf([{ name: 'Chaos Inoculation' }], stats({ life: 1823 }))
    expect(effects.chaosImmune).toBe(false)
    expect(effects.lifeIsNegligible).toBe(false)
    expect(effects.notes).toEqual([])
    expect(effects.applied).toEqual([])
    expect(effects.unverified).toHaveLength(1)
    expect(effects.unverified[0]!.keystone).toBe('Chaos Inoculation')
    expect(effects.unverified[0]!.reason).toContain('1,823')
  })

  it('refuses Eldritch Battery while energy shield is still on the sheet', () => {
    const effects = keystoneEffectsOf([{ name: 'Eldritch Battery' }], stats({ energyShield: 1937 }))
    expect(effects.esNotDefensive).toBe(false)
    expect(effects.unverified[0]!.reason).toContain('1,937')
  })

  it('refuses Iron Reflexes while evasion is still on the sheet', () => {
    const effects = keystoneEffectsOf([{ name: 'Iron Reflexes' }], stats({ evasion: 6490 }))
    expect(effects.evasionIsArmour).toBe(false)
    expect(effects.unverified[0]!.reason).toContain('6,490')
  })

  it('applies unverifiable keystones, which have nothing to check against', () => {
    // Resolute Technique changes crit behaviour, which no defensive stat
    // exposes. Withholding it for want of a check it cannot fail would be a
    // different kind of wrong.
    const effects = keystoneEffectsOf([{ name: 'Resolute Technique' }], defense)
    expect(effects.neverCrits).toBe(true)
    expect(effects.applied).toEqual(['Resolute Technique'])
  })

  it('applies effects with no stats at all, since nothing can be contradicted', () => {
    const effects = keystoneEffectsOf([{ name: 'Chaos Inoculation' }])
    expect(effects.chaosImmune).toBe(true)
    expect(effects.unverified).toEqual([])
  })

  it('folds several keystones and sorts the output', () => {
    const effects = keystoneEffectsOf(
      [{ name: 'Vaal Pact' }, { name: 'Avatar of Fire' }, { name: 'Blood Magic' }],
      defense,
    )
    expect(effects.fireOnly).toBe(true)
    expect(effects.notes.map((n) => n.keystone)).toEqual(['Avatar of Fire', 'Blood Magic', 'Vaal Pact'])
  })
})

describe('effective pool', () => {
  const pools = { life: 1000, energyShield: 2000, ward: 300 }

  it('sums everything with no corrections', () => {
    const pool = effectivePool({ ...defense, ...pools }, NO_KEYSTONE_EFFECTS)
    expect(pool.total).toBe(3300)
    expect(pool.excluded).toEqual([])
    expect(pool.parts).toEqual(['life', 'energy shield', 'ward'])
  })

  it('drops life under Chaos Inoculation and names what it dropped', () => {
    const effects = keystoneEffectsOf([{ name: 'Chaos Inoculation' }], stats({ life: 1 }))
    const pool = effectivePool({ ...defense, ...pools }, effects)
    expect(pool.total).toBe(2300)
    expect(pool.excluded).toEqual(['life'])
    expect(pool.parts).toEqual(['energy shield', 'ward'])
  })

  it('drops energy shield under Eldritch Battery', () => {
    const effects = keystoneEffectsOf([{ name: 'Eldritch Battery' }], stats({ energyShield: 0 }))
    const pool = effectivePool({ ...defense, ...pools }, effects)
    expect(pool.total).toBe(1300)
    expect(pool.excluded).toEqual(['energy shield'])
  })

  it('defaults to the uncorrected reading', () => {
    expect(effectivePool({ ...defense, ...pools }).total).toBe(3300)
  })
})

describe('effective armour', () => {
  it('adds converted evasion only under Iron Reflexes', () => {
    const source = { armour: 200, evasion: 6000 }
    expect(effectiveArmour(source)).toBe(200)
    const effects = keystoneEffectsOf([{ name: 'Iron Reflexes' }], stats({ evasion: 0 }))
    expect(effects.evasionIsArmour).toBe(true)
    expect(effectiveArmour(source, effects)).toBe(6200)
  })
})

describe('through the full analysis', () => {
  it('reports no keystone corrections on a character with none allocated', async () => {
    const analysis = await analyzeCharacter(raw, { tree })
    expect(analysis.keystones.applied).toEqual([])
    expect(analysis.keystones.unverified).toEqual([])
    expect(analysis.recommendations.suppressed).toEqual([])
  })

  it('stays neutral when no tree is supplied, rather than guessing', async () => {
    const analysis = await analyzeCharacter(raw)
    expect(analysis.keystones).toEqual(NO_KEYSTONE_EFFECTS)
  })

  it('suppresses chaos findings — with a reason — on a corroborated CI build', async () => {
    // Synthesised from the real character: allocate the real Chaos Inoculation
    // node and make the sheet agree with it, which is what corroboration means.
    const ci = structuredClone(model) as CharModel
    const allocated = Array.isArray(ci.passiveSelection) ? ci.passiveSelection : []
    ci.passiveSelection = [...allocated, keystoneIds.get('Chaos Inoculation')!]
    ci.defensiveStats = { ...ci.defensiveStats, life: 1, chaosResistance: -40 }

    const analysis = await analyzeCharacter(ci, { tree })
    expect(analysis.keystones.chaosImmune).toBe(true)
    expect(analysis.keystones.lifeIsNegligible).toBe(true)

    // Not merely absent — absent WITH a reason. A finding that vanishes
    // silently is indistinguishable from one the engine never spotted.
    expect(analysis.recommendations.recommendations.map((r) => r.id)).not.toContain('res-chaos-under-cap')
    const suppressed = analysis.recommendations.suppressed.find((s) => s.id === 'res-chaos-under-cap')
    expect(suppressed?.keystone).toBe('Chaos Inoculation')
    expect(suppressed?.reason).toContain('immunity to chaos damage')

    // And the pool must not credit the life the keystone took away.
    expect(analysis.assessment.pool.excluded).toEqual(['life'])
    expect(analysis.assessment.strengths).toContain(
      'Immune to chaos damage and bleeding — chaos resistance is moot',
    )
  })

  it('warns instead of correcting when the sheet contradicts the keystone', async () => {
    const ci = structuredClone(model) as CharModel
    const allocated = Array.isArray(ci.passiveSelection) ? ci.passiveSelection : []
    ci.passiveSelection = [...allocated, keystoneIds.get('Chaos Inoculation')!]
    // Life left untouched at 1,448 — the keystone says it must be 1.

    const analysis = await analyzeCharacter(ci, { tree })
    expect(analysis.keystones.chaosImmune).toBe(false)
    expect(analysis.keystones.unverified.map((u) => u.keystone)).toEqual(['Chaos Inoculation'])
    expect(analysis.warnings.some((w) => w.includes('Chaos Inoculation'))).toBe(true)
    // Chaos advice survives, because nothing established that it should not.
    expect(analysis.recommendations.suppressed).toEqual([])
  })
})
