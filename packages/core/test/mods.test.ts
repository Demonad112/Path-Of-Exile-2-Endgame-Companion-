/**
 * Text-keyed mod database: roll assessment, and the things it refuses to answer.
 *
 * Tier numbers used to live here and were removed after being proven wrong: a
 * tier is meaningless without an item class. These tests now assert that it
 * SAYS so rather than guessing. Tiers are covered in gear.test.ts, against a
 * real base.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { ModDatabase, modSkeleton, modValues, type ModData } from '../src/mods/index.js'
import { unwrapCharModel } from '../src/analyze.js'
import { normalizeItems } from '../src/model/slots.js'

const db = new ModDatabase(
  JSON.parse(readFileSync(fileURLToPath(new URL('../../data/generated/mods.json', import.meta.url)), 'utf8')) as ModData,
)
const model = unwrapCharModel(
  JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/athrynas-v43.json', import.meta.url)), 'utf8')),
)

describe('normalising mod text', () => {
  it('reduces a line to a comparable skeleton', () => {
    // The sign is absorbed into the number token deliberately: an affix renders
    // its minimum and maximum rolls separately, and both must reduce to the
    // same skeleton for the index to find them.
    expect(modSkeleton('+38% to Lightning Resistance')).toBe('#% to lightning resistance')
    expect(modSkeleton('+12 to Strength')).toBe(modSkeleton('+34 to Strength'))
    expect(modSkeleton('+12 to Strength')).toBe(modSkeleton('-12 to Strength'))
  })

  it('strips PoE display markup', () => {
    expect(modSkeleton('+38% to [Resistances|Lightning Resistance]')).toBe('#% to lightning resistance')
  })

  it('keeps genuinely different phrasings apart', () => {
    // "+X% to" and "X% increased" are different mods and must not collide.
    expect(modSkeleton('+38% to Fire Resistance')).not.toBe(modSkeleton('38% increased Fire Resistance'))
  })

  it('extracts the numbers in order', () => {
    expect(modValues('Adds 5 to 12 Fire Damage')).toEqual([5, 12])
    expect(modValues('+38% to Lightning Resistance')).toEqual([38])
  })
})

describe('affix ladders from real game data', () => {
  it('loads the database', () => {
    expect(db.size).toBeGreaterThan(12_000)
  })

  it('finds the real strength affix ladder', () => {
    const results = db.search('to Strength', { kind: 'SUFFIX', limit: 5 })
    expect(results.length).toBeGreaterThan(0)
    const best = results[0]!
    // No tier number: that needs an item class, which a text search has not
    // been given. The highest item level requirement is what it can honestly
    // rank by.
    expect(best.tier).toBeUndefined()
    expect(best.level).toBeGreaterThan(0)
    expect(best.affix).toBe('of the Gods')
    expect(best.level).toBe(81)
  })

  it('ranks the strongest rungs first, by item level', () => {
    const results = db.search('to Strength', { kind: 'SUFFIX', limit: 5 })
    const levels = results.map((r) => r.level)
    expect([...levels].sort((a, b) => b - a)).toEqual(levels)
  })
})

describe('assessing a real roll', () => {
  it('places a roll in its affix window', () => {
    const result = db.assess('+35 to Strength')
    expect(result.matched).not.toBeNull()
    // Position in the window is real; a tier number is not claimed.
    expect(result.matched!.positionInTier).toBeGreaterThanOrEqual(0)
    expect(result.matched!.positionInTier).toBeLessThanOrEqual(1)
    expect(result.note).toMatch(/depends on the item class/)
    expect(result.matched!.min).toBeLessThanOrEqual(35)
    expect(result.matched!.max).toBeGreaterThanOrEqual(35)
  })

  it('reports the best roll the affix family can produce', () => {
    const low = db.assess('+6 to Strength')
    expect(low.matched).not.toBeNull()
    expect(low.matched!.bestPossible).toBeGreaterThan(low.matched!.max)
  })

  it('assesses the reference character’s real gear', () => {
    const items = normalizeItems(model)
    const belt = items.find((i) => i.slotId === 11)!
    expect(belt.name).toBe('Golem Tether')

    const analysis = db.assessAll(belt.mods)
    expect(analysis.mods).toHaveLength(belt.mods.length)
    // Real gear should match a meaningful share of its lines.
    expect(analysis.matched).toBeGreaterThan(0)
    for (const mod of analysis.mods) {
      if (!mod.matched) expect(mod.note).toBeTruthy()
      else expect(mod.matched.max).toBeGreaterThanOrEqual(mod.matched.min)
    }
  })
})

describe('refusing to guess', () => {
  it('returns no match for a line it does not recognise', () => {
    const result = db.assess('Grants Something That Does Not Exist')
    expect(result.matched).toBeNull()
    expect(result.note).toContain('No affix in the database')
  })

  it('says so when a stat is known but the value fits no roll window', () => {
    const result = db.assess('+99999 to Strength')
    expect(result.matched).toBeNull()
    expect(result.note).toMatch(/outside every known roll window/)
  })

  it('says base compatibility is uncovered when no compatibility data is loaded', () => {
    // `db` is built from the roll-window table alone. Compatibility comes from
    // a second source (see below) and must not be implied when absent.
    const analysis = db.assessAll(['+35 to Strength'])
    expect(analysis.limitation).toMatch(/compatibility lives in mod-bases\.json/i)

    const result = db.validateItemMods('Militant Bow', ['+35 to Strength'])
    expect(result.itemClass).toBeNull()
    expect(result.violations).toEqual([])
    expect(result.note).toMatch(/not provided/i)
  })
})

// --- base compatibility, from RePoE-fork ------------------------------------
// This corrects an earlier claim in this project that mod-to-base compatibility
// was underivable. It was underivable from ONE data set, not in general.
const withBases = new ModDatabase(
  JSON.parse(readFileSync(fileURLToPath(new URL('../../data/generated/mods.json', import.meta.url)), 'utf8')),
  JSON.parse(readFileSync(fileURLToPath(new URL('../../data/generated/mod-bases.json', import.meta.url)), 'utf8')),
)

describe('item class compatibility', () => {
  it('resolves the reference character’s real bases to their mod pools', () => {
    expect(withBases.classForBase('Militant Bow')).toBe('Bows')
    expect(withBases.classForBase('Solar Amulet')).toBe('Amulets')
    expect(withBases.classForBase('Volant Quiver')).toBe('Quivers')
    expect(withBases.classForBase('Runeforged Jungle Tiara')).toBe('Helmets')
  })

  it('accepts the real mods on a real item', () => {
    const items = normalizeItems(model)
    const bow = items.find((i) => i.slotId === 7)!
    expect(bow.baseType).toBe('Militant Bow')

    const result = withBases.validateItemMods(bow.baseType, bow.mods)
    expect(result.itemClass).toBe('Bows')
    // The item exists in game, so nothing on it may be reported as illegal.
    expect(result.violations, JSON.stringify(result.violations)).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('catches a mod on the wrong class', () => {
    // Additional arrow chance is listed for Bows only.
    const result = withBases.validateItemMods('Solar Amulet', ['30% chance to gain an additional Arrow'])
    const violation = result.violations[0]
    if (violation) {
      expect(violation.legality).toBe('wrong-class')
      expect(violation.allowedOn).toContain('Bows')
      expect(violation.message).toContain('not in the Amulets mod pool')
    }
  })

  it('reports unlisted mods as unknown rather than as violations', () => {
    const result = withBases.validateItemMods('Solar Amulet', ['Completely Made Up Modifier'])
    expect(result.violations).toEqual([])
    expect(result.unknown).toHaveLength(1)
    expect(result.unknown[0]!.legality).toBe('unknown')
    expect(result.unknown[0]!.message).toMatch(/nothing is claimed/)
  })

  it('says so when the base itself is unknown', () => {
    const result = withBases.validateItemMods('Not A Real Base', ['+35 to Strength'])
    expect(result.itemClass).toBeNull()
    expect(result.note).toContain('Could not resolve')
    expect(result.violations).toEqual([])
  })
})
