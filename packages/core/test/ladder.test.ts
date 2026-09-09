/**
 * The ladder sample, and what counts as one.
 *
 * This is the only outside figure the build score is ever graded against, so
 * accepting a malformed sample is the one way an invented threshold could get
 * into a codebase that has none. `{"dps": {}}` used to pass: every band
 * comparison then read `value >= undefined`, all false, and the build was
 * graded "below the 25th percentile" against nothing at all.
 */

import { describe, expect, it } from 'vitest'
import { bandFor, leagueSlugOf, validateLadder, type LadderSummary } from '../src/ninja/ladder.js'

const stat = { n: 100, p25: 50_000, median: 100_000, p75: 200_000, max: 900_000 }

const sample: LadderSummary = {
  league: 'runesofaldur',
  class: 'Deadeye',
  snapshot: '2026-01-01',
  sampleSize: 100,
  totalInPool: 4200,
  levelRange: { min: 99, max: 100 },
  dps: stat,
  ehp: null,
  pool: null,
  caveat: 'One page of 100 rows from the top of the ladder.',
}

describe('accepting a ladder sample', () => {
  it('accepts a well-formed one', () => {
    expect(validateLadder(sample)).not.toBeNull()
    expect(validateLadder(sample)!.dps).toEqual(stat)
  })

  it('rejects a stat object missing its quartiles', () => {
    // The failure that motivated this: truthy, and unusable.
    expect(validateLadder({ ...sample, dps: {}, ehp: null })).toBeNull()
  })

  it('rejects a stat whose quartiles are not numbers', () => {
    expect(validateLadder({ ...sample, dps: { ...stat, p25: '50000' }, ehp: null })).toBeNull()
  })

  it('drops one malformed figure while keeping a valid one', () => {
    const out = validateLadder({ ...sample, dps: { n: 3 }, ehp: stat })
    expect(out).not.toBeNull()
    expect(out!.dps).toBeNull()
    expect(out!.ehp).toEqual(stat)
  })

  it('rejects a sample with no caveat, since the UI renders it verbatim', () => {
    expect(validateLadder({ ...sample, caveat: '' })).toBeNull()
  })

  it('rejects nothing at all', () => {
    expect(validateLadder(null)).toBeNull()
    expect(validateLadder('a string')).toBeNull()
    expect(validateLadder({})).toBeNull()
  })
})

describe('bands', () => {
  it('places a figure against the sample it was given', () => {
    expect(bandFor(900_000, stat)).toBe('top')
    expect(bandFor(10_000, stat)).toBe('below')
  })

  it('would have graded a malformed sample as "below" — which is why one never reaches it', () => {
    // The exact mechanism the validator exists to prevent: undefined quartiles
    // fail every comparison and fall through to a real, unearned verdict.
    expect(bandFor(500_000, {} as never)).toBe('below')
  })
})

describe('league slugs', () => {
  it('derives the slug a character model carries', () => {
    expect(leagueSlugOf('Runes of Aldur')).toBe('runesofaldur')
  })
})
