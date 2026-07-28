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
