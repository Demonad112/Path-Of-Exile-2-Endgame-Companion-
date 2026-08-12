/**
 * The join between the recommendations engine and the gear analyser.
 *
 * Both were producing advice about the same problem without knowing about each
 * other — the duplication this project was rebuilt to avoid. These tests lock
 * the join, and the two judgement calls made while building it.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { analyzeCharacter } from '../src/analyze.js'
import { ModTiers, type ModTierData } from '../src/gear/tiers.js'

const payload = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/athrynas-v43.json', import.meta.url)), 'utf8'),
)
const tiers = new ModTiers(
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../data/generated/mod-tiers.json', import.meta.url)), 'utf8'),
  ) as ModTierData,
)

const plain = await analyzeCharacter(payload)
const enriched = await analyzeCharacter(payload, { tiers })

const ids = (a: typeof plain) => a.recommendations.recommendations.map((r) => r.id)

describe('enriching recommendations with gear data', () => {
  it('leaves the findings untouched when no affix data is supplied', () => {
    // The 2 MB artifact is optional; without it the original findings stand.
    expect(ids(plain)).toContain('res-chaos-under-cap')
    expect(ids(plain).some((id) => id.startsWith('gear-'))).toBe(false)
  })

  it('replaces the vague resistance finding with a specific one', () => {
    // "Source 57% chaos resistance from gear, a rune, or a passive" becomes a
    // named item, a named affix, and a real roll range.
    expect(ids(enriched)).not.toContain('res-chaos-under-cap')
    expect(ids(enriched)).toContain('gear-swap-chaos')

    const swap = enriched.recommendations.recommendations.find((r) => r.id === 'gear-swap-chaos')!
    expect(swap.action).toContain('Hypnotic Halo')
    expect(swap.action).toMatch(/of Bameth/)
    expect(swap.action).toMatch(/24-27%/)
  })

  it('shows the same problem once, not twice', () => {
    const chaosEntries = ids(enriched).filter((id) => /chaos/.test(id) && /res-|gear-swap/.test(id))
    expect(chaosEntries).toEqual(['gear-swap-chaos'])
  })

  it('traces every claim to a source', () => {
    const swap = enriched.recommendations.recommendations.find((r) => r.id === 'gear-swap-chaos')!
    const kinds = swap.evidence.map((e) => e.kind)
    expect(kinds).toContain('stat')
    expect(kinds).toContain('item')
    expect(kinds).toContain('breakdown')
    // The impact must land inside the cap, never past it.
    expect(swap.impact!.to).toBeLessThanOrEqual(75)
    expect(swap.impact!.delta).toBeGreaterThan(0)
  })

  it('ranks by points closed, not by fraction of its own gap', () => {
    // The first attempt normalised by the gap, so closing 1 point of a 1-point
    // cold gap scored a perfect 1.0 and outranked closing 27 points of a
    // 57-point chaos hole. Absolute magnitude is what matters.
    const recs = enriched.recommendations.recommendations
    const chaos = recs.find((r) => r.id === 'gear-swap-chaos')!
    const cold = recs.find((r) => r.id === 'gear-swap-cold')
    if (cold) expect(chaos.score).toBeGreaterThan(cold.score)
  })

  it('does NOT recommend a tier upgrade the engine calls pointless', () => {
    // Ranking tier gaps mechanically produced "improve armour ... +208" beside
    // the engine's own "armour is a non-defence at 207". A tier gap says a mod
    // COULD be bigger, not that bigger would help.
    expect(ids(enriched)).toContain('armour-negligible')
    for (const rec of enriched.recommendations.recommendations) {
      expect(rec.id).not.toMatch(/^gear-tier-/)
      if (/armour/i.test(rec.action)) expect(rec.id).toBe('armour-negligible')
    }
  })

  it('keeps every finding the gear pass has nothing to say about', () => {
    for (const id of ['one-shot-chaos', 'anoint-unused', 'weapon-ilvl-lag', 'weapon-set-idle']) {
      expect(ids(enriched)).toContain(id)
    }
  })

  it('stays sorted by score', () => {
    const scores = enriched.recommendations.recommendations.map((r) => r.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })
})

describe('not presenting a bound as an outcome', () => {
  it('labels the one-shot impact as a ceiling, not a prediction', () => {
    const rec = enriched.recommendations.recommendations.find((r) => r.id === 'one-shot-chaos')!
    // `to` is the strongest vector's max hit — what this one would reach if it
    // matched, not what closing the resistance gap actually delivers.
    expect(rec.impact!.label).toMatch(/ceiling/i)
    expect(rec.rationale).toMatch(/CEILING/)
  })

  it('says why the ceiling is unreachable for chaos specifically', () => {
    const rec = enriched.recommendations.recommendations.find((r) => r.id === 'one-shot-chaos')!
    // Chaos drains energy shield at 2x, which this project already models —
    // so a capped chaos resistance still leaves it the thinnest vector.
    expect(rec.rationale).toMatch(/twice the rate|2x/)
    expect(rec.rationale).toMatch(/cannot fully/)
  })
})

/**
 * Unused affix slots.
 *
 * The one gear finding that needs no judgement about the build's direction: an
 * empty slot gives nothing whatever the character is scaling. That is exactly
 * what separates it from a tier upgrade, which this module refuses to rank for
 * the reasons its own header sets out at length.
 */
function withItemPatched(slotId: number, patch: Record<string, unknown>) {
  const clone = structuredClone(payload)
  const cm = clone.charModel ?? clone
  const item = cm.items.find((i: { itemSlot: number }) => i.itemSlot === slotId)
  Object.assign(item.itemData, patch)
  return clone
}

const openAffixes = enriched.recommendations.recommendations.find((r) => r.id === 'gear-open-affixes')!

describe('unused affix slots', () => {
  it('reports one finding for the whole kit, not one per item', () => {
    // Ten items have room. Ten recommendations saying so would bury every other
    // finding on the page.
    expect(
      enriched.recommendations.recommendations.filter((r) => r.id.startsWith('gear-open-affixes')),
    ).toHaveLength(1)
  })

  it('counts the slots against the budget they belong to', () => {
    // 10 active craftable items, 3 prefixes and 3 suffixes each, 50 filled.
    expect(openAffixes.rationale).toContain('10 active items')
    expect(openAffixes.rationale).toContain('50 of a possible 60')
    expect(openAffixes.impact!.delta).toBe(10)
    expect(openAffixes.impact!.significance).toBeCloseTo(10 / 60, 6)
  })

  it('leads with the emptiest item', () => {
    // Loath Bane carries one prefix against a budget of three, and is the main
    // hand — already flagged separately for lagging the rest of the kit.
    expect(openAffixes.action).toContain('Loath Bane')
    expect(openAffixes.action).toContain('2 prefixes')
  })

  it('ignores the idle weapon set', () => {
    // Rapture Blast and Eagle Arrow have room too, and crafting into a set the
    // character is not using is not an improvement.
    const text = openAffixes.action + openAffixes.rationale + openAffixes.evidence.map((e) => e.note).join(' ')
    expect(text).not.toContain('Rapture Blast')
    expect(text).not.toContain('Eagle Arrow')
  })

  it('ignores an item that cannot be modified', async () => {
    // A corrupted item's slots are not open in any useful sense.
    const analysis = await analyzeCharacter(withItemPatched(1, { corrupted: true }), { tiers })
    const rec = analysis.recommendations.recommendations.find((r) => r.id === 'gear-open-affixes')!
    expect(rec.rationale).toContain('9 active items')
    expect(rec.rationale).toContain('of a possible 54')
  })

  it('ignores rarities with no craftable affix budget', async () => {
    // A unique's modifiers are fixed by the item, so "one suffix open" is
    // meaningless on it.
    const analysis = await analyzeCharacter(withItemPatched(1, { rarity: 'Unique' }), { tiers })
    const rec = analysis.recommendations.recommendations.find((r) => r.id === 'gear-open-affixes')!
    expect(rec.rationale).toContain('9 active items')
    expect(rec.rationale).toContain('of a possible 54')
  })

  it('says nothing at all when every slot is full', async () => {
    // Absent is not zero, but neither is it a finding: with no room anywhere
    // there is nothing to report.
    const clone = structuredClone(payload)
    const cm = clone.charModel ?? clone
    for (const item of cm.items) item.itemData.corrupted = true
    const analysis = await analyzeCharacter(clone, { tiers })
    expect(analysis.recommendations.recommendations.map((r) => r.id)).not.toContain('gear-open-affixes')
  })
})

describe('when the affix data cannot classify a modifier', () => {
  /** Give the helmet one explicit modifier the ladder data has never seen. */
  function withUnknownMod() {
    const clone = structuredClone(payload)
    const cm = clone.charModel ?? clone
    const helmet = cm.items.find((i: { itemSlot: number }) => i.itemSlot === 1)
    helmet.itemData.mods.explicit.push({ id: 'NotARealModIdFromAnyPatch', stats: {} })
    return clone
  }

  it('drops the item from the count rather than inventing an open slot', async () => {
    // `affixCounts` can only count mods it could classify, so subtracting from
    // capacity here would report a slot that is in fact occupied. The count
    // would be a floor, and a floor presented as a total is the failure this
    // project exists to avoid.
    const analysis = await analyzeCharacter(withUnknownMod(), { tiers })
    const rec = analysis.recommendations.recommendations.find((r) => r.id === 'gear-open-affixes')!
    expect(rec.rationale).toContain('9 active items')
    expect(rec.rationale).toContain('of a possible 54')
  })

  it('names the item it left out, so the total does not read as complete', async () => {
    // Suppression is never silent anywhere else in this codebase either.
    const analysis = await analyzeCharacter(withUnknownMod(), { tiers })
    const rec = analysis.recommendations.recommendations.find((r) => r.id === 'gear-open-affixes')!
    const notes = rec.evidence.map((e) => e.note).join(' ')
    expect(notes).toContain('Hypnotic Halo')
    expect(notes).toMatch(/cannot classify/)
  })
})
