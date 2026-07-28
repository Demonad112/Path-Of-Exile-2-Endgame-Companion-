/**
 * Analysis from a Path of Building code alone.
 *
 * The values asserted here are cross-checked against poe.ninja's own figures for
 * the same character. That agreement is the point: this is a second real source,
 * not an estimate, and it is what makes "Tier 3 estimation" unnecessary.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { analyzeCharacter } from '../src/analyze.js'
import { analyzeFromPob, looksLikePobCode } from '../src/pob/analyze.js'
import type { CharModel } from '../src/model/types.js'

const payload = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/athrynas-v43.json', import.meta.url)), 'utf8'),
)
const model: CharModel = payload.charModel ?? payload
const ninja = await analyzeCharacter(payload)
const pob = await analyzeFromPob(model.pathOfBuildingExport!)

describe('analysing from a Path of Building code', () => {
  it('reads the identity the code carries', () => {
    expect(pob.identity).toMatchObject({ level: 86, className: 'Ranger', ascendancy: 'Deadeye' })
    expect(pob.provenance).toBe('pob')
  })

  it('agrees with poe.ninja on the survivability headline', () => {
    // Two independent engines, the same number. That agreement is what makes a
    // disagreement meaningful.
    expect(pob.defense.lowestMaximumHit).toBe(3808)
    expect(pob.defense.lowestMaximumHitType).toBe('chaos')
    expect(pob.defense.lowestMaximumHit).toBe(ninja.defense.lowestMaximumHit)
    expect(pob.defense.lowestMaximumHitType).toBe(ninja.defense.lowestMaximumHitType)
  })

  it('agrees on pools, mitigation and resistances', () => {
    expect(pob.defense.life).toBe(ninja.defense.life)
    expect(pob.defense.energyShield).toBe(ninja.defense.energyShield)
    expect(pob.defense.armour).toBe(ninja.defense.armour)
    expect(Math.round(pob.defense.effectiveHealthPool!)).toBe(ninja.defense.effectiveHealthPool)

    for (const res of pob.defense.resistances) {
      const theirs = ninja.defense.resistances.find((r) => r.type === res.type)!
      expect(res.value).toBe(theirs.value)
    }
  })

  it('reports damage as PoB computed it', () => {
    expect(pob.damage.totalDps).toBeCloseTo(109859.05, 1)
    // poe.ninja rounds; PoB does not. Same number.
    expect(Math.round(pob.damage.totalDps!)).toBe(ninja.dps.primary!.dps)
  })

  it('recovers the allocated tree', () => {
    expect(pob.passives.count).toBe(136)
    expect(pob.passives.allocated).toContain(50459) // Ranger start
  })

  it('names what a code cannot answer instead of filling it in', () => {
    const gaps = pob.gaps.map((g) => g.what.toLowerCase()).join(' | ')
    // Per-skill damage genuinely is not in a code — PoB exports one TotalDPS.
    expect(gaps).toContain('per-skill damage')
    // Attribution needs poe.ninja's breakdowns, so gear analysis is unavailable.
    expect(gaps).toContain('attribution')
    // Ward is absent from the export, and absent is not zero.
    expect(gaps).toContain('ward')
    for (const gap of pob.gaps) expect(gap.why.length).toBeGreaterThan(20)
  })

  it('exposes every PlayerStat, so the curated view hides nothing', () => {
    expect(Object.keys(pob.playerStats).length).toBeGreaterThan(100)
    expect(pob.playerStats.TotalDPS).toBeCloseTo(109859.05, 1)
  })
})

describe('recognising a pasted code', () => {
  it('accepts a real Path of Building code', () => {
    expect(looksLikePobCode(model.pathOfBuildingExport!)).toBe(true)
  })

  it('rejects JSON, so the paste box routes it to the character-model path', () => {
    expect(looksLikePobCode('{"charModel":{}}')).toBe(false)
    expect(looksLikePobCode('[1,2,3]')).toBe(false)
  })

  it('rejects short or non-base64url text rather than trying to decode it', () => {
    expect(looksLikePobCode('hello')).toBe(false)
    expect(looksLikePobCode('')).toBe(false)
    expect(looksLikePobCode('a'.repeat(150) + ' has spaces')).toBe(false)
  })
})
