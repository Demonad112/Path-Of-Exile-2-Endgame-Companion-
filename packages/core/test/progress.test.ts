/**
 * Progress snapshots.
 *
 * The question these answer is "is what I did last week working", which needs
 * history. The tests below are mostly about history NOT lying: no invented
 * baseline from a single point, no duplicate rows from re-importing, and no
 * unbounded growth in a storage budget shared with checklist and Atlas
 * progress.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { analyzeCharacter, unwrapCharModel } from '../src/analyze.js'
import { keystoneEffectsOf } from '../src/keystones/index.js'
import {
  appendSnapshot,
  diffSnapshots,
  historyFor,
  latestDiff,
  MAX_SNAPSHOTS,
  snapshotKey,
  toSnapshot,
  type CharacterSnapshot,
} from '../src/progress/index.js'
import { PassiveTree, type PassiveTreeData } from '../src/tree/index.js'

const fixturePath = fileURLToPath(new URL('./fixtures/athrynas-v43.json', import.meta.url))
const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown
const model = unwrapCharModel(raw)

const treePath = fileURLToPath(new URL('../../data/generated/passive-tree.json', import.meta.url))
const tree = new PassiveTree(JSON.parse(readFileSync(treePath, 'utf8')) as PassiveTreeData)

const analysis = await analyzeCharacter(raw, { tree })
const base = toSnapshot(analysis, '2026-07-24T00:00:00.000Z')

describe('taking a snapshot', () => {
  it('records the figures worth trending and nothing else', () => {
    expect(base).toMatchObject({
      at: '2026-07-24T00:00:00.000Z',
      key: 'Demonad112#2589/Athrynas',
      level: 86,
      life: 1448,
      energyShield: 1937,
      ward: 706,
      armour: 207,
      evasion: 6490,
      pool: 4091,
      fire: 75,
      cold: 74,
      lightning: 75,
      chaos: 18,
      dps: 110157,
      weakestHit: 3808,
      passives: 109,
    })
  })

  it('stays small — gear and mods are deliberately absent', () => {
    // Twenty of these share a storage budget with checklist and Atlas progress.
    expect(JSON.stringify(base).length).toBeLessThan(500)
    expect(Object.keys(base)).not.toContain('items')
    expect(Object.keys(base)).not.toContain('breakdowns')
  })

  it('takes the timestamp from the caller, never from the clock', () => {
    // The core is pure: a snapshot must be reproducible.
    expect(toSnapshot(analysis, '1999-01-01T00:00:00.000Z').at).toBe('1999-01-01T00:00:00.000Z')
    expect(base.updatedUtc).toBe(model.updatedUtc)
  })

  it('records the keystone-corrected pool, matching what the assessment used', () => {
    const ci = keystoneEffectsOf([{ name: 'Chaos Inoculation' }], { ...analysis.defense, life: 1 })
    const corrected = toSnapshot(analysis, base.at, ci)
    expect(corrected.pool).toBe(analysis.defense.energyShield + analysis.defense.ward)
    // The raw life figure is still recorded; only the pool is corrected.
    expect(corrected.life).toBe(1448)
  })

  it('keys history per character, not per browser', () => {
    expect(snapshotKey({ account: 'Demonad112#2589', name: 'Athrynas' })).toBe('Demonad112#2589/Athrynas')
  })
})

describe('diffing', () => {
  const later: CharacterSnapshot = { ...base, at: '2026-07-31T00:00:00.000Z', cold: 75, life: 1600, dps: 120_000 }

  it('reports only what moved', () => {
    const diff = diffSnapshots(base, later)
    expect(diff.changes.map((c) => c.field).sort()).toEqual(['cold', 'dps', 'life'])
  })

  it('marks a change in the helpful direction as an improvement', () => {
    const life = diffSnapshots(base, later).changes.find((c) => c.field === 'life')!
    expect(life).toMatchObject({ before: 1448, after: 1600, delta: 152, improved: true, unit: 'raw' })
    expect(life.percent).toBeCloseTo(10.497, 2)
  })

  it('calls out crossing the cap, which a percentage would bury', () => {
    // 74% to 75% is a one-point change that matters far more than a
    // twenty-point move in the middle of the range.
    const diff = diffSnapshots(base, later)
    expect(diff.newlyCapped).toEqual(['Cold'])
    expect(diff.newlyUncapped).toEqual([])

    const reverse = diffSnapshots(later, base)
    expect(reverse.newlyUncapped).toEqual(['Cold'])
    expect(reverse.newlyCapped).toEqual([])
  })

  it('uses the character’s own maximum, not a hardcoded 75', () => {
    // A build that raised its cap to 80 has not reached cap at 75.
    const raised = diffSnapshots({ ...base, cold: 74 }, { ...base, cold: 75 }, 80)
    expect(raised.newlyCapped).toEqual([])
  })

  it('leaves the percentage null rather than dividing by zero', () => {
    const from = { ...base, ward: 0 }
    const change = diffSnapshots(from, { ...from, ward: 500 }).changes.find((c) => c.field === 'ward')!
    expect(change.percent).toBeNull()
    expect(change.delta).toBe(500)
  })
})

describe('accumulating history', () => {
  it('does not append a row when nothing changed', () => {
    // Re-importing without having played should not fill the history with
    // identical rows — the timestamp differs, but nothing else does.
    const once = appendSnapshot([], base)
    const twice = appendSnapshot(once, { ...base, at: '2026-07-25T00:00:00.000Z' })
    expect(twice).toHaveLength(1)
    expect(twice[0]!.at).toBe(base.at)
  })

  it('appends when a figure actually moved', () => {
    const history = appendSnapshot(appendSnapshot([], base), { ...base, at: '2026-07-25T00:00:00.000Z', life: 1500 })
    expect(history).toHaveLength(2)
  })

  it('keeps characters separate', () => {
    const other: CharacterSnapshot = { ...base, key: 'Someone/Else' }
    const history = appendSnapshot(appendSnapshot([], base), other)
    expect(historyFor(history, base.key)).toHaveLength(1)
    expect(historyFor(history, 'Someone/Else')).toHaveLength(1)
  })

  it('drops the oldest past the cap', () => {
    let history: CharacterSnapshot[] = []
    for (let i = 0; i < MAX_SNAPSHOTS + 5; i++) {
      history = appendSnapshot(history, { ...base, at: `2026-07-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`, life: 1000 + i })
    }
    const mine = historyFor(history, base.key)
    expect(mine).toHaveLength(MAX_SNAPSHOTS)
    expect(mine[0]!.life).toBe(1005)
    expect(mine[mine.length - 1]!.life).toBe(1024)
  })

  it('refuses to invent a baseline from a single point', () => {
    // One point is not a trend, and rendering it as one would compare the
    // character against nothing.
    expect(latestDiff(appendSnapshot([], base), base.key)).toBeNull()
    const history = appendSnapshot(appendSnapshot([], base), { ...base, at: '2026-07-25T00:00:00.000Z', life: 1500 })
    expect(latestDiff(history, base.key)?.changes.map((c) => c.field)).toEqual(['life'])
  })
})
