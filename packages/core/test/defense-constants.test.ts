/**
 * Locks the PoE2 0.5 defence constants.
 *
 * These differ from PoE1 in ways that have burned real builds. A refactor that
 * quietly restores a PoE1 value should fail here loudly.
 */

import { describe, expect, it } from 'vitest'
import {
  ARMOUR_DR_CAP,
  BLOCK_CAP,
  CHAOS_ES_MULTIPLIER,
  ES_RECHARGE_DELAY_SECONDS,
  ES_RECHARGE_RATE,
  EVADE_CHANCE_MAX,
  EVADE_CHANCE_MIN,
  MITIGATION_ORDER,
  RES_CAP_DEFAULT,
  RES_CAP_HARD,
  armourDamageReduction,
  chaosRawPool,
  effectiveResistance,
  esRechargeDelay,
  esRechargePerSecond,
  evadeChance,
} from '../src/defense/constants.js'

describe('caps', () => {
  it('caps block at 50%, not PoE1’s 75%', () => {
    expect(BLOCK_CAP).toBe(50)
  })

  it('caps resistances at 75% with a 90% hard ceiling', () => {
    expect(RES_CAP_DEFAULT).toBe(75)
    expect(RES_CAP_HARD).toBe(90)
    expect(effectiveResistance(80)).toBe(75)
    expect(effectiveResistance(80, 90)).toBe(80)
    expect(effectiveResistance(60)).toBe(60)
  })

  it('caps armour damage reduction at 90%', () => {
    expect(ARMOUR_DR_CAP).toBe(90)
    // A colossal armour value against a tiny hit still cannot exceed the cap.
    expect(armourDamageReduction(1_000_000, 1)).toBe(90)
  })
})

describe('armour is hit-size dependent', () => {
  it('follows A / (A + 10 * hit)', () => {
    // 1000 armour vs a 100 hit: 1000 / (1000 + 1000) = 50%
    expect(armourDamageReduction(1000, 100)).toBeCloseTo(50, 6)
    // 1000 armour vs a 1000 hit: 1000 / (1000 + 10000) = 9.09%
    expect(armourDamageReduction(1000, 1000)).toBeCloseTo(9.0909, 3)
  })

  it('gives the same near-zero result the reference character sees', () => {
    // 207 armour against the 924 hit poe.ninja modelled -> ~2%, matching the
    // 2% poe.ninja itself reports.
    expect(Math.round(armourDamageReduction(207, 924))).toBe(2)
  })

  it('is zero without armour or without a hit', () => {
    expect(armourDamageReduction(0, 500)).toBe(0)
    expect(armourDamageReduction(500, 0)).toBe(0)
  })
})

describe('evasion', () => {
  it('follows 100 - (acc * 1.25 * 100) / (acc + eva * 0.3)', () => {
    const evasion = 6490
    const accuracy = 2114
    const expected = 100 - (accuracy * 1.25 * 100) / (accuracy + evasion * 0.3)
    expect(evadeChance(evasion, accuracy)).toBeCloseTo(expected, 6)
  })

  it('clamps to the 5-100 window', () => {
    expect(evadeChance(0, 100_000)).toBe(EVADE_CHANCE_MIN)
    expect(evadeChance(1_000_000, 1)).toBeLessThanOrEqual(EVADE_CHANCE_MAX)
    expect(evadeChance(100, 0)).toBe(EVADE_CHANCE_MAX)
  })
})

describe('energy shield', () => {
  it('recharges 12.5% per second after a 4 second delay', () => {
    expect(ES_RECHARGE_RATE).toBe(0.125)
    expect(ES_RECHARGE_DELAY_SECONDS).toBe(4)
    expect(esRechargePerSecond(2000)).toBe(250)
    expect(esRechargePerSecond(2000, 50)).toBe(375)
  })

  it('shortens the delay with faster start of recharge', () => {
    expect(esRechargeDelay(0)).toBeCloseTo(4, 6)
    expect(esRechargeDelay(100)).toBeCloseTo(2, 6)
  })
})

describe('chaos', () => {
  it('removes 2x energy shield rather than bypassing it', () => {
    expect(CHAOS_ES_MULTIPLIER).toBe(2)
    // Each point of ES is worth half a point of pool against chaos.
    expect(chaosRawPool(1000, 2000)).toBe(2000)
    expect(chaosRawPool(1448, 1937)).toBe(1448 + 968.5)
  })
})

describe('mitigation order', () => {
  it('applies armour BEFORE resistances, reversed from PoE1', () => {
    expect([...MITIGATION_ORDER]).toEqual(['evasion', 'block', 'armour', 'resistance'])
    expect(MITIGATION_ORDER.indexOf('armour')).toBeLessThan(MITIGATION_ORDER.indexOf('resistance'))
  })
})
