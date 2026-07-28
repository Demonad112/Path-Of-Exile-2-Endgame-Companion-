/**
 * The recommendations engine must reproduce the findings a careful human made
 * by hand on the reference character — quantified, costed, and evidenced.
 *
 * It must also refuse to invent numbers.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { unwrapCharModel } from '../src/analyze.js'
import { recommend } from '../src/recommend/index.js'
import type { CharModel } from '../src/model/types.js'

const fixturePath = fileURLToPath(new URL('./fixtures/athrynas-v43.json', import.meta.url))
const model = unwrapCharModel(JSON.parse(readFileSync(fixturePath, 'utf8')))
const report = recommend(model)
const byId = new Map(report.recommendations.map((r) => [r.id, r]))

describe('reproduces the known findings', () => {
  it('catches cold resistance one point below cap', () => {
    const r = byId.get('res-cold-under-cap')
    expect(r).toBeDefined()
    expect(r!.impact).toMatchObject({ from: 74, to: 75, delta: 1, unit: 'percent' })
  })

  it('recognises the cold gap is free to fix because fire is overcapped', () => {
    const r = byId.get('res-cold-under-cap')!
    // Fire is +24 over cap; cold needs 1. The points already exist.
    expect(r.cost.kind).toBe('free')
    expect(r.cost.amount).toBe(0)
    expect(r.evidence.some((e) => e.kind === 'stat' && e.stat === 'fireResistanceOverCap')).toBe(true)
  })

  it('identifies chaos as the one-shot vector', () => {
    const r = byId.get('one-shot-chaos')
    expect(r).toBeDefined()
    expect(r!.impact!.from).toBe(3808)
    expect(r!.category).toBe('survivability')
  })

  it('states that EHP overstates survivability rather than quoting it', () => {
    const r = byId.get('one-shot-chaos')!
    const ehpEvidence = r.evidence.find((e) => e.kind === 'stat' && e.stat === 'effectiveHealthPool')
    expect(ehpEvidence).toBeDefined()
    expect(ehpEvidence!.note).toMatch(/overstat/i)
  })

  it('flags armour as negligible mitigation', () => {
    const r = byId.get('armour-negligible')
    expect(r).toBeDefined()
    // No impact figure: an honest target armour value cannot be derived from
    // the payload, and showing the current 2% as a delta would read as though
    // the advice makes the build worse.
    expect(r!.impact).toBeNull()
    // The advice must still be grounded in the actual armour value.
    expect(r!.evidence.some((e) => e.kind === 'stat' && e.stat === 'armour' && e.value === 207)).toBe(true)
    expect(r!.rationale).toContain('207')
  })

  it('flags the unused anoint at level 86', () => {
    const r = byId.get('anoint-unused')
    expect(r).toBeDefined()
    expect(r!.category).toBe('efficiency')
    // Evidence must name the actual amulet, not "your amulet".
    expect(r!.evidence.some((e) => e.kind === 'item' && e.itemName === 'Havoc Medallion')).toBe(true)
  })

  it('flags the ilvl-76 weapon lagging the ilvl-82 armour', () => {
    const r = byId.get('weapon-ilvl-lag')
    expect(r).toBeDefined()
    expect(r!.impact!.from).toBe(76)
    expect(r!.impact!.to).toBeGreaterThanOrEqual(81)
    expect(r!.evidence.some((e) => e.kind === 'item' && e.itemName === 'Loath Bane')).toBe(true)
    // It must state what replacing the weapon costs.
    expect(r!.tradeoff).toMatch(/Loath Bane/)
  })

  it('ASKS about the possibly-idle weapon set rather than asserting', () => {
    const r = byId.get('weapon-set-idle')
    expect(r).toBeDefined()
    expect(r!.category).toBe('question')
    // A question carries no impact claim.
    expect(r!.impact).toBeNull()
    expect(r!.action).toMatch(/confirm/i)
    expect(r!.tradeoff).toMatch(/deliberate|swap|leave it alone/i)
  })
})

describe('ranking', () => {
  it('ranks by gain per unit of cost, so the free fix leads', () => {
    const scores = report.recommendations.map((r) => r.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
    // The free cold-resistance reallocation must outrank the moderate-cost
    // weapon upgrade despite being a smaller absolute change.
    expect(byId.get('res-cold-under-cap')!.score).toBeGreaterThan(byId.get('weapon-ilvl-lag')!.score)
  })

  it('does not call a build with real findings sound', () => {
    expect(report.buildIsSound).toBe(false)
    expect(report.summary).toMatch(/actionable/)
  })
})

describe('honesty', () => {
  it('grounds every recommendation in evidence', () => {
    for (const r of report.recommendations) {
      expect(r.evidence.length, `${r.id} has no evidence`).toBeGreaterThan(0)
      expect(r.provenance).toBe('ninja')
    }
  })

  it('never emits an impact without a real measured pair', () => {
    for (const r of report.recommendations) {
      if (!r.impact) continue
      expect(Number.isFinite(r.impact.from)).toBe(true)
      expect(Number.isFinite(r.impact.to)).toBe(true)
      expect(r.impact.delta).toBe(r.impact.to - r.impact.from)
    }
  })

  it('reports what it could not determine instead of guessing', () => {
    const ids = report.unresolved.map((u) => u.id)
    // 10 breakdown stat ids read zero on this character and cannot be named.
    expect(ids).toContain('unmapped-stat-ids')
    for (const u of report.unresolved) {
      expect(u.missing.length).toBeGreaterThan(20)
    }
  })

  it('says a clean build is clean rather than padding', () => {
    // A character with capped resistances, even max hits, real armour, an
    // anoint and a consistent kit should yield nothing actionable.
    const healthy: CharModel = {
      level: 90,
      class: 'Deadeye',
      useSecondWeaponSet: false,
      passiveCounts: { passives: 100, anoints: 1, ascendancy: 8, bonusPassives: 0 },
      passiveSelection: [1, 2, 3],
      passiveSelectionSet1: [],
      passiveSelectionSet2: [],
      defensiveStats: {
        life: 3000,
        energyShield: 1000,
        armour: 12_000,
        damageReductions: { physical: { value: 55, takenDamage: 1000 } },
        effectiveHealthPool: 40_000,
        lowestMaximumHitTaken: 9500,
        physicalMaximumHitTaken: 9500,
        fireMaximumHitTaken: 10_000,
        coldMaximumHitTaken: 10_000,
        lightningMaximumHitTaken: 10_000,
        chaosMaximumHitTaken: 9800,
        fireResistance: 75,
        fireResistanceMax: 75,
        fireResistanceOverCap: 10,
        coldResistance: 75,
        coldResistanceMax: 75,
        coldResistanceOverCap: 5,
        lightningResistance: 75,
        lightningResistanceMax: 75,
        lightningResistanceOverCap: 5,
        chaosResistance: 75,
        chaosResistanceMax: 75,
        chaosResistanceOverCap: 0,
      },
      items: [
        { itemSlot: 7, itemData: { name: 'Good Bow', typeLine: 'Militant Bow', ilvl: 82, frameType: 2 } },
        { itemSlot: 3, itemData: { name: 'Good Chest', typeLine: 'Jacket', ilvl: 82, frameType: 2 } },
        { itemSlot: 1, itemData: { name: 'Good Helm', typeLine: 'Tiara', ilvl: 82, frameType: 2 } },
        { itemSlot: 4, itemData: { name: 'Good Amulet', typeLine: 'Solar Amulet', ilvl: 82, frameType: 2 } },
      ],
    }

    const clean = recommend(healthy)
    expect(clean.buildIsSound).toBe(true)
    expect(clean.summary).toMatch(/good shape/)
  })
})
