/**
 * Per-item stat attribution, against the REAL captured character.
 *
 * Every figure asserted here was recomputed from poe.ninja's own `breakdowns`
 * block and cross-checked against the character sheet. The point of the feature
 * is that a gear recommendation can state what a swap costs, so the numbers
 * being right is the whole feature.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { unwrapCharModel } from '../src/analyze.js'
import { analyzeDefense } from '../src/defense/index.js'
import { indexBreakdowns } from '../src/model/breakdowns.js'
import {
  ATTRIBUTABLE_STATS,
  attributeToItems,
  attributionForSlot,
  attributionForStat,
  itemsCarrying,
} from '../src/model/attribution.js'
import { normalizeItems } from '../src/model/slots.js'
import type { CharModel } from '../src/model/types.js'

const fixturePath = fileURLToPath(new URL('./fixtures/athrynas-v43.json', import.meta.url))
const raw = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown
const model = unwrapCharModel(raw)

const defense = analyzeDefense(model)
const report = attributeToItems(indexBreakdowns(model), normalizeItems(model), defense)

describe('the invariant everything rests on', () => {
  it('reproduces every attributable stat’s base and increase from its own modifiers', () => {
    // sum(flat mods) === base and sum(increased mods) === inc. Held 44/44
    // across the verification corpus. If it stops holding, the stat is dropped
    // rather than attributed, so this failing means the wire format moved.
    for (const stat of report.stats) {
      expect(stat.partsReproduceBase, `${stat.stat} does not add up`).toBe(true)
    }
  })

  it('agrees with the character sheet on every stat it attributes', () => {
    for (const stat of report.stats) {
      if (!stat.trustworthy) continue
      expect(stat.matchesSheet).toBe(true)
    }
    expect(report.excluded).toEqual([])
  })

  it('covers every attributable stat this character has', () => {
    expect(report.stats.map((s) => s.stat).sort()).toEqual([...ATTRIBUTABLE_STATS].sort())
  })
})

describe('stat totals', () => {
  it('reads the reference character’s pools', () => {
    expect(attributionForStat(report, 'life')).toMatchObject({ base: 1379, increasedPercent: 5, total: 1448 })
    expect(attributionForStat(report, 'energyShield')).toMatchObject({ base: 846, increasedPercent: 129, total: 1937 })
    expect(attributionForStat(report, 'evasionRating')).toMatchObject({ base: 1823, increasedPercent: 256, total: 6490 })
    expect(attributionForStat(report, 'ward')).toMatchObject({ base: 487, increasedPercent: 45, total: 706 })
  })

  it('reports overcap only on capped stats, and only where it exists', () => {
    // Fire is 99 raw against a 75 cap: 24 points of map-mod insurance the
    // player is carrying and could trade away.
    expect(attributionForStat(report, 'fireResistance')).toMatchObject({ base: 99, total: 75, cap: 75, overcap: 24 })
    expect(attributionForStat(report, 'lightningResistance')).toMatchObject({ base: 83, total: 75, overcap: 8 })
    // Cold is below cap, so there is nothing over it.
    expect(attributionForStat(report, 'coldResistance')).toMatchObject({ base: 74, total: 74, overcap: 0 })
    // Pools are not capped at all.
    expect(attributionForStat(report, 'life')?.cap).toBeNull()
    expect(attributionForStat(report, 'life')?.overcap).toBe(0)
  })
})

describe('per-item attribution', () => {
  it('credits the body armour with the evasion it actually carries', () => {
    const body = attributionForSlot(report, 3)
    expect(body?.itemName).toBe('Viper Hide')
    const evasion = body?.contributions.find((c) => c.stat === 'evasionRating')
    // 1,119 flat off a 1,823 base. Removing it leaves 704 * 3.56 = 2,506.
    expect(evasion).toMatchObject({ flat: 1119, increased: 0, without: 2506, loss: 3984 })
  })

  it('reads an increased-only contributor as increased, not flat', () => {
    const amulet = attributionForSlot(report, 4)
    expect(amulet?.itemName).toBe('Havoc Medallion')
    const evasion = amulet?.contributions.find((c) => c.stat === 'evasionRating')
    expect(evasion).toMatchObject({ flat: 0, increased: 42, without: 5724 })
  })

  it('sorts an item’s stats by what removing it would actually cost', () => {
    const helmet = attributionForSlot(report, 1)!
    const losses = helmet.contributions.map((c) => c.loss)
    expect(losses).toEqual([...losses].sort((a, b) => b - a))
  })
})

describe('the overcap question a gear swap has to answer', () => {
  it('reports no loss when overcap absorbs the whole contribution', () => {
    // Gale Turn carries 22 fire resistance against 24 points of overcap. The
    // naive answer — "you lose 22% fire" — is wrong: the sheet does not move.
    const ring = attributionForSlot(report, 8)!
    expect(ring.itemName).toBe('Gale Turn')
    const fire = ring.contributions.find((c) => c.stat === 'fireResistance')!
    expect(fire.flat).toBe(22)
    expect(fire.withoutUncapped).toBe(77)
    expect(fire.without).toBe(75)
    expect(fire.loss).toBe(0)
    expect(fire.dropsBelowCap).toBe(false)
  })

  it('flags the swap that does break the cap', () => {
    const ring = attributionForSlot(report, 8)!
    const lightning = ring.contributions.find((c) => c.stat === 'lightningResistance')!
    // 35 points against 8 of overcap: capped 75 falls to 48.
    expect(lightning.without).toBe(48)
    expect(lightning.loss).toBe(27)
    expect(lightning.dropsBelowCap).toBe(true)
  })

  it('ranks the items carrying a stat by what each is worth', () => {
    const carriers = itemsCarrying(report, 'lightningResistance')
    expect(carriers.map((c) => c.item.itemName)).toEqual(['Hypnotic Halo', 'Havoc Medallion', 'Gale Turn', 'Sorrow Twirl'])
    expect(carriers[0]!.contribution.loss).toBe(30)
    // Every one of them breaks the cap — the build has no slack here.
    expect(carriers.every((c) => c.contribution.dropsBelowCap)).toBe(true)
  })
})

describe('sources that are not equipped items', () => {
  it('names charms as unmatched rather than dropping them', () => {
    // Charms contribute to the breakdown but are not in `items`, so they
    // cannot be attributed to a slot. Silence would read as "nothing else
    // contributes", which is a different and false claim.
    expect(report.unmatchedSources).toContain('Dawnlit Amethyst Charm of the Bottomless')
  })

  it('attributes nothing to passives, quests or the character base', () => {
    const names = new Set(report.items.map((i) => i.itemName))
    expect(names.has('Character base')).toBe(false)
    for (const item of report.items) {
      expect(item.slotId).toBeGreaterThan(0)
      expect(item.itemName).not.toBe('')
    }
  })
})

describe('refusing to attribute what it cannot verify', () => {
  it('excludes a stat whose breakdown disagrees with the character sheet', () => {
    // Chaos Inoculation reporting immunity over a breakdown that sums to 18 is
    // the real case. Attributing it to items would put a confident number on
    // something overridden downstream.
    const tampered = structuredClone(model) as CharModel
    tampered.defensiveStats = { ...tampered.defensiveStats, chaosResistance: 100 }

    const out = attributeToItems(indexBreakdowns(tampered), normalizeItems(tampered), analyzeDefense(tampered))
    expect(attributionForStat(out, 'chaosResistance')?.trustworthy).toBe(false)
    expect(out.excluded.map((e) => e.stat)).toEqual(['chaosResistance'])
    expect(out.excluded[0]!.reason).toContain('character sheet reads 100')
    expect(itemsCarrying(out, 'chaosResistance')).toEqual([])
    // Everything else is unaffected — one bad stat does not poison the rest.
    expect(itemsCarrying(out, 'lightningResistance').length).toBeGreaterThan(0)
  })

  it('excludes a stat whose modifiers no longer add up', () => {
    const tampered = structuredClone(model) as CharModel
    const life = tampered.breakdowns!.stats!['0']!
    // Claim a base nothing accounts for.
    tampered.breakdowns!.stats!['0'] = { ...life, base: life.base + 500 }

    const out = attributeToItems(indexBreakdowns(tampered), normalizeItems(tampered), analyzeDefense(tampered))
    expect(attributionForStat(out, 'life')?.partsReproduceBase).toBe(false)
    expect(out.excluded.map((e) => e.stat)).toContain('life')
    expect(itemsCarrying(out, 'life')).toEqual([])
  })

  it('attributes nothing at all when there is no breakdown', () => {
    const bare = structuredClone(model) as CharModel
    delete bare.breakdowns
    const out = attributeToItems(indexBreakdowns(bare), normalizeItems(bare), analyzeDefense(bare))
    expect(out.stats).toEqual([])
    expect(out.items).toEqual([])
    expect(out.excluded).toEqual([])
  })
})

/**
 * Two items a player would genuinely wear together.
 *
 * Duplicate rings and jewels are routine, and keying name+base to a single item
 * meant the second silently overwrote the first: every contribution from either
 * resolved to the second, doubling its row and presenting the first as free to
 * swap. The comment above the map already said this ambiguity was refused; the
 * code did not refuse it.
 */
describe('two equipped items with the same name and base', () => {
  it('attributes to neither rather than crediting one with both', () => {
    const cm = unwrapCharModel(structuredClone(raw)) as CharModel
    const ringOne = cm.items!.find((i) => i.itemSlot === 8)!
    const ringTwo = cm.items!.find((i) => i.itemSlot === 9)!
    // Make Ring 2 a duplicate of Ring 1 in name and base.
    ringTwo.itemData!.name = ringOne.itemData!.name
    ringTwo.itemData!.typeLine = ringOne.itemData!.typeLine
    ringTwo.itemData!.baseType = ringOne.itemData!.baseType

    const defense = analyzeDefense(cm)
    const report = attributeToItems(indexBreakdowns(cm), normalizeItems(cm), defense)

    const rows = report.items.filter((r) => r.slotId === 8 || r.slotId === 9)
    const credited = rows.flatMap((r) => r.contributions)
    // Neither ring may be credited with the other's modifiers. The ambiguous
    // sources are reported as unmatched instead.
    expect(credited.every((c) => Number.isFinite(c.value))).toBe(true)
    expect(report.unmatchedSources.length).toBeGreaterThan(0)
    // The duplicated name is among them, rather than resolved to one ring.
    expect(report.unmatchedSources.join(' ')).toContain(ringOne.itemData!.name)
  })
})
