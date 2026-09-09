/**
 * The Path of Building configuration a DPS figure was computed under.
 *
 * The predecessor asserted these figures came from "PoB's default config (no
 * custom boss/buff settings applied)". The reference character's own export
 * disproves that twice over, and the first test here is that claim being
 * falsified by real data.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { analyzeCharacter, unwrapCharModel } from '../src/analyze.js'
import { decodePobExport } from '../src/pob/export.js'
import { describePobConfig, isBossDps, NO_POB_CONFIG, readPobConfig, readPobInputs } from '../src/pob/config.js'
import { PassiveTree, type PassiveTreeData } from '../src/tree/index.js'

const fixturePath = fileURLToPath(new URL('./fixtures/athrynas-v43.json', import.meta.url))
const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown
const model = unwrapCharModel(raw)
const xml = await decodePobExport(model.pathOfBuildingExport!)
const config = readPobConfig(xml)

const treePath = fileURLToPath(new URL('../../data/generated/passive-tree.json', import.meta.url))
const tree = new PassiveTree(JSON.parse(readFileSync(treePath, 'utf8')) as PassiveTreeData)

describe('the reference character’s real export', () => {
  it('carries 20 saved inputs, not PoB defaults', () => {
    expect(config.inputCount).toBe(20)
  })

  it('was not computed against a boss', () => {
    expect(config.versusBoss).toBe(false)
    expect(config.bossSetting).toBeNull()
    expect(isBossDps(config)).toBe(false)
  })

  it('assumes every buff and charge is active', () => {
    expect(config.buffMode).toBe('effective')
  })

  it('assumes six damage-relevant conditions hold', () => {
    expect(config.conditionals).toEqual([
      'enemy is bleeding',
      'enemy is chilled',
      'enemy is ignited',
      'you are moving',
      'you have been hit recently',
      'you have crit recently',
    ])
    expect(config.unlabelledConditionals).toEqual([])
  })

  it('describes what the number actually represents', () => {
    const sentence = describePobConfig(config)
    expect(sentence).toContain('not a boss')
    expect(sentence).toContain('all buffs and charges assumed active')
    expect(sentence).toContain('6 conditions hold (')
  })
})

describe('parsing', () => {
  it('reads all three attribute forms PoB writes', () => {
    const inputs = readPobInputs(
      '<Calcs><Input name="a" boolean="true"/><Input name="b" number="4"/><Input name="c" string="COMBAT"/></Calcs>',
    )
    expect(inputs.get('a')).toBe('true')
    expect(inputs.get('b')).toBe('4')
    expect(inputs.get('c')).toBe('COMBAT')
  })

  it('survives an angle bracket inside a value', () => {
    // The reason this is regex-over-quoted-attributes rather than a scan to the
    // next '>': PoB writes stat text into `string=` values. A `[^>]*` scan
    // truncates on the first bracket and silently loses every input after it.
    const inputs = readPobInputs(
      '<Input name="first" string="Life > 50%"/><Input name="second" boolean="true"/>',
    )
    expect(inputs.get('first')).toBe('Life > 50%')
    expect(inputs.get('second')).toBe('true')
  })

  it('survives a newline inside a value, which the real export contains', () => {
    expect(readPobInputs(xml).get('questAct 2Valley of the TitansMedallion')).toContain('\n')
  })

  it('decodes XML entities', () => {
    expect(readPobInputs('<Input name="x" string="Tawhoa&apos;s Test &amp; more"/>').get('x')).toBe(
      "Tawhoa's Test & more",
    )
  })

  it('ignores inputs with no name', () => {
    expect(readPobInputs('<Input boolean="true"/>').size).toBe(0)
  })
})

describe('boss detection', () => {
  it('recognises any of PoB’s boss keys and names which one said so', () => {
    for (const key of ['enemyIsBoss', 'conditionEnemyBoss', 'enemyIsBossType', 'bossSkillEffect']) {
      const found = readPobConfig(`<Input name="${key}" boolean="true"/>`)
      expect(found.versusBoss).toBe(true)
      expect(found.bossSetting).toBe(key)
    }
  })

  it('treats PoB’s off values as off', () => {
    for (const value of ['false', 'NONE', '']) {
      expect(readPobConfig(`<Input name="enemyIsBossType" string="${value}"/>`).versusBoss).toBe(false)
    }
  })
})

describe('conditionals', () => {
  it('names a conditional it has no label for rather than hiding it', () => {
    // An unrecognised conditional still inflates the number. Dropping it would
    // understate the caveat, which is the failure this whole module addresses.
    const found = readPobConfig('<Input name="conditionSomethingNewInPatch7" boolean="true"/>')
    expect(found.conditionals).toEqual([])
    expect(found.unlabelledConditionals).toEqual(['conditionSomethingNewInPatch7'])
    expect(describePobConfig(found)).toContain('1 condition holds (conditionSomethingNewInPatch7)')
  })

  it('ignores conditionals that are switched off', () => {
    expect(readPobConfig('<Input name="conditionMoving" boolean="false"/>').conditionals).toEqual([])
  })

  it('collects non-zero multipliers and drops zero ones', () => {
    const found = readPobConfig(
      '<Input name="multiplierNearbyEnemies" number="3"/><Input name="multiplierRageStacks" number="0"/>',
    )
    expect(found.multipliers).toEqual([{ name: 'multiplierNearbyEnemies', value: 3 }])
  })
})

describe('an export with no configuration', () => {
  it('says none was saved rather than calling it default', () => {
    // "No configuration was saved" and "the defaults were used" are different
    // claims, and only the first is supported by an empty <Calcs>.
    const empty = readPobConfig('<PathOfBuilding></PathOfBuilding>')
    expect(empty).toEqual(NO_POB_CONFIG)
    expect(describePobConfig(empty)).toContain('saved no Path of Building configuration')
    expect(describePobConfig(null)).toContain('saved no Path of Building configuration')
  })
})

describe('through the full analysis', () => {
  it('carries the config alongside the stats it qualifies', async () => {
    const analysis = await analyzeCharacter(raw, { tree })
    expect(analysis.pobConfig).toEqual(config)
    expect(analysis.pobStats?.TotalDPS).toBeCloseTo(109859.05, 1)
  })

  it('caveats the damage figure only because poe.ninja and PoB agree on it', async () => {
    const analysis = await analyzeCharacter(raw, { tree })
    // The config describes what PoB computed. It may be attached to poe.ninja's
    // number only because the reconciliation says they are the same number.
    const dpsCheck = analysis.reconciliation!.checks.find((c) => c.stat.startsWith('dps:'))!
    expect(dpsCheck.severity).toBe('match')
    expect(analysis.assessment.caveats).toContain(
      'The damage figure was not calculated against a boss, so it should not be read as single-target or pinnacle damage.',
    )
    expect(analysis.assessment.caveats).toContain('The damage figure assumes every buff and charge is active.')
  })

  it('reports no config when there is no export to read one from', async () => {
    const bare = structuredClone(model)
    delete bare.pathOfBuildingExport
    const analysis = await analyzeCharacter(bare, { tree })
    expect(analysis.pobConfig).toBeNull()
    expect(analysis.assessment.caveats).toEqual([])
  })
})
