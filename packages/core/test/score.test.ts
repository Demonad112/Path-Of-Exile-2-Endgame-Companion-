/**
 * The build assessment.
 *
 * This is the easiest place in the codebase to lie, so most of what is asserted
 * here is about what the assessment REFUSES to say: no damage verdict without a
 * measured sample, no chaos verdict on a chaos-immune build, no pool credit for
 * a pool a keystone converted away.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { analyzeCharacter, unwrapCharModel } from '../src/analyze.js'
import { analyzeDefense } from '../src/defense/index.js'
import { analyzeDps } from '../src/dps/index.js'
import { keystoneEffectsOf } from '../src/keystones/index.js'
import { assessBuild } from '../src/score/index.js'
import { bandFor, describeLadderSample, leagueSlugOf, type LadderSummary } from '../src/ninja/ladder.js'
import { PassiveTree, type PassiveTreeData } from '../src/tree/index.js'

const fixturePath = fileURLToPath(new URL('./fixtures/athrynas-v43.json', import.meta.url))
const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown
const model = unwrapCharModel(raw)
const defense = analyzeDefense(model)
const dps = analyzeDps(model)

const treePath = fileURLToPath(new URL('../../data/generated/passive-tree.json', import.meta.url))
const tree = new PassiveTree(JSON.parse(readFileSync(treePath, 'utf8')) as PassiveTreeData)

/** A ladder sample shaped like the proxy's, with the reference character's
 *  109,859 DPS deliberately placed in a known band. */
function ladder(over: Partial<LadderSummary['dps']> = {}): LadderSummary {
  return {
    league: 'runesofaldur',
    class: 'Deadeye',
    snapshot: 'test',
    sampleSize: 100,
    totalInPool: 4213,
    levelRange: { min: 98, max: 100 },
    dps: { n: 100, p25: 200_000, median: 400_000, p75: 900_000, max: 3_000_000, ...over },
    ehp: null,
    pool: null,
    caveat: 'Top-of-ladder sample only.',
  }
}

describe('the reference character', () => {
  const assessment = assessBuild({ defense, dps })

  it('names the one-shot risks poe.ninja’s own figures expose', () => {
    // Both, not just the minimum. Naming only chaos hid the physical gap, which
    // is the more dangerous of the two since physical hits are far more common.
    const risk = assessment.weaknesses.find((w) => w.text.includes('one-shot'))!
    expect(risk.text).toContain('Chaos 3,808')
    expect(risk.text).toContain('Physical 4,264')
    expect(risk.text).toContain('14,611')
  })

  it('reports the cold resistance gap as critical', () => {
    const uncapped = assessment.weaknesses.find((w) => w.text.startsWith('Uncapped'))!
    expect(uncapped.text).toContain('Cold 74% of 75%')
    expect(uncapped.severity).toBe('critical')
  })

  it('sums the pool from life, energy shield and ward', () => {
    expect(assessment.pool.total).toBe(1448 + 1937 + 706)
    expect(assessment.pool.label).toBe('combined life + energy shield + ward')
    expect(assessment.pool.excluded).toEqual([])
  })
})

describe('offence is never graded against invented thresholds', () => {
  it('leaves offence unscored with no ladder sample, and says why', () => {
    const assessment = assessBuild({ defense, dps })
    expect(assessment.offence).toBeNull()
    expect(assessment.offenceUnscoredReason).toContain('No ladder sample')
    // Nothing about damage may appear in either column.
    expect(assessment.strengths.some((s) => s.includes('damage'))).toBe(false)
    expect(assessment.weaknesses.some((w) => w.text.includes('DPS'))).toBe(false)
  })

  it('names the missing sample in the note once defences are not the story', () => {
    // The note names the LIMITING factor, so on this character it leads with
    // the uncapped cold resistance. Cap it and the unscored offence surfaces.
    expect(assessBuild({ defense, dps }).note).toContain('Uncapped elemental resistances')

    const capped = {
      ...defense,
      resistances: defense.resistances.map((r) =>
        r.type === 'chaos' ? r : { ...r, value: r.max, underCap: 0, capped: true },
      ),
      life: 5000,
    }
    const assessment = assessBuild({ defense: capped, dps })
    expect(assessment.note).toContain('Scored on defences only')
    expect(assessment.note).toContain('No ladder sample')
  })

  it('rescales rather than punishing a build for data we do not have', () => {
    const unscored = assessBuild({ defense, dps })
    // Defence alone is 0.15; rescaled over the 0.5 defence half that is 0.30.
    expect(unscored.defence).toBe(0.15)
    expect(unscored.score).toBe(0.3)
  })

  it('grades against the sample once there is one', () => {
    const strong = assessBuild({ defense, dps, ladder: ladder({ p75: 100_000, median: 50_000, p25: 20_000 }) })
    expect(strong.offence).toBe(0.5)
    expect(strong.score).toBe(0.65)
    expect(strong.strengths.some((s) => s.includes('upper quarter of the top 100 Deadeyes'))).toBe(true)

    const weak = assessBuild({ defense, dps, ladder: ladder() })
    expect(weak.offence).toBe(0.15)
    expect(weak.weaknesses.some((w) => w.text.includes('below every quartile'))).toBe(true)
  })

  it('carries the sample’s own caveat rather than restating it', () => {
    const assessment = assessBuild({ defense, dps, ladder: ladder() })
    expect(assessment.caveats).toContain('Top-of-ladder sample only.')
  })

  it('leaves offence unscored when no skill deals hit damage', () => {
    const noDamage = analyzeDps({ skills: [] })
    const assessment = assessBuild({ defense, dps: noDamage, ladder: ladder() })
    expect(assessment.offence).toBeNull()
    expect(assessment.offenceUnscoredReason).toContain('not been indexed')
  })
})

describe('keystone corrections', () => {
  const ciDefense = { ...defense, life: 1 }
  const ci = keystoneEffectsOf([{ name: 'Chaos Inoculation' }], ciDefense)

  it('excludes life from the pool and labels the total honestly', () => {
    const assessment = assessBuild({ defense: ciDefense, dps, keystones: ci })
    expect(assessment.pool.total).toBe(1937 + 706)
    expect(assessment.pool.label).toBe('combined energy shield + ward')
    expect(assessment.pool.excluded).toEqual(['life'])
    expect(assessment.caveats.some((c) => c.includes('converted'))).toBe(true)
  })

  it('says nothing about chaos resistance, high or low', () => {
    const assessment = assessBuild({ defense: { ...ciDefense }, dps, keystones: ci })
    expect(assessment.weaknesses.some((w) => w.text.includes('chaos resistance'))).toBe(false)
    expect(assessment.strengths).toContain('Immune to chaos damage and bleeding — chaos resistance is moot')
  })

  it('drops chaos from the one-shot risks it cannot be', () => {
    const assessment = assessBuild({ defense: ciDefense, dps, keystones: ci })
    const risk = assessment.weaknesses.find((w) => w.text.includes('one-shot'))
    expect(risk?.text).not.toContain('Chaos')
    expect(risk?.text).toContain('Physical 4,264')
  })

  it('credits chaos immunity in the score rather than scoring it as a miss', () => {
    const uncorrected = assessBuild({ defense: ciDefense, dps })
    const corrected = assessBuild({ defense: ciDefense, dps, keystones: ci })
    // 18% chaos resistance misses the 30% target; immunity is strictly better.
    expect(corrected.defence).toBe(uncorrected.defence + 0.05)
  })

  it('surfaces an uncorroborated keystone as a caveat, not a correction', () => {
    const contradicted = keystoneEffectsOf([{ name: 'Chaos Inoculation' }], defense)
    const assessment = assessBuild({ defense, dps, keystones: contradicted })
    expect(assessment.pool.excluded).toEqual([])
    expect(assessment.caveats.some((c) => c.includes('not corroborated'))).toBe(true)
  })

  it('counts converted evasion as armour under Iron Reflexes', () => {
    const converted = { ...defense, armour: 300, evasion: 0, blockChance: 0 }
    const ir = keystoneEffectsOf([{ name: 'Iron Reflexes' }], converted)
    expect(ir.evasionIsArmour).toBe(true)
    // 300 armour with no block would normally read as "little armour or block".
    const withEvasion = assessBuild({ defense: { ...converted, evasion: 6000 }, dps, keystones: ir })
    expect(withEvasion.weaknesses.some((w) => w.text.startsWith('Little armour'))).toBe(false)
  })
})

describe('the Path of Building configuration caveat', () => {
  const config = {
    inputCount: 20,
    versusBoss: false,
    bossSetting: null,
    buffMode: 'effective' as const,
    conditionals: ['enemy is chilled'],
    unlabelledConditionals: [],
    multipliers: [],
  }

  it('qualifies the damage figure when the two engines agree it is the same number', () => {
    const assessment = assessBuild({ defense, dps, pobConfig: config, pobDpsAgrees: true })
    expect(assessment.caveats).toContain(
      'The damage figure was not calculated against a boss, so it should not be read as single-target or pinnacle damage.',
    )
  })

  it('refuses to attach the caveat to a figure PoB disagrees with', () => {
    // The config describes what PoB computed. Attaching it to a number PoB does
    // not produce would caveat the wrong figure.
    const assessment = assessBuild({ defense, dps, pobConfig: config, pobDpsAgrees: false })
    expect(assessment.caveats.some((c) => c.includes('not calculated against a boss'))).toBe(false)
    expect(assessment.caveats.some((c) => c.includes('does not describe the number scored here'))).toBe(true)
  })

  it('says nothing when there is nothing to compare', () => {
    expect(assessBuild({ defense, dps, pobConfig: config }).caveats).toEqual([])
  })
})

describe('tiers', () => {
  it('bands the score without inventing a fifth grade', () => {
    const grade = (score: number) => (score >= 0.75 ? 'A' : score >= 0.5 ? 'B' : score >= 0.3 ? 'C' : 'D')
    for (const [score, tier] of [
      [1, 'A'],
      [0.75, 'A'],
      [0.74, 'B'],
      [0.5, 'B'],
      [0.3, 'C'],
      [0.29, 'D'],
    ] as const) {
      expect(grade(score)).toBe(tier)
    }
    expect(assessBuild({ defense, dps }).tier).toBe('C')
  })
})

describe('ladder helpers', () => {
  it('slugs a league name the way poe.ninja does', () => {
    expect(leagueSlugOf('Runes of Aldur')).toBe('runesofaldur')
    expect(leagueSlugOf('Hardcore SSF')).toBe('hardcoressf')
  })

  it('describes the sample as a sample, never as a population', () => {
    const described = describeLadderSample(ladder())
    expect(described).toBe('the top 100 Deadeyes in runesofaldur')
    expect(described).not.toContain('percentile')
  })

  it('bands a value against the quartiles', () => {
    const stat = ladder().dps!
    expect(bandFor(3_000_000, stat)).toBe('top')
    expect(bandFor(1_000_000, stat)).toBe('p75')
    expect(bandFor(500_000, stat)).toBe('median')
    expect(bandFor(250_000, stat)).toBe('p25')
    expect(bandFor(100, stat)).toBe('below')
  })
})

describe('through the full analysis', () => {
  it('assesses the character with the same figures the panels show', async () => {
    const analysis = await analyzeCharacter(raw, { tree })
    expect(analysis.assessment.pool.total).toBe(
      analysis.defense.life + analysis.defense.energyShield + analysis.defense.ward,
    )
    expect(analysis.assessment.tier).toBe('C')
    expect(analysis.assessment.offence).toBeNull()
  })

  it('scores offence once a ladder sample is passed in', async () => {
    const analysis = await analyzeCharacter(raw, { tree, ladder: ladder({ p75: 100_000 }) })
    expect(analysis.assessment.offence).toBe(0.5)
  })
})
