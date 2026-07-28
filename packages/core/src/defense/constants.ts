/**
 * PoE2 0.5 defence constants and formulas.
 *
 * These differ from PoE1 in ways that matter. They are locked by unit tests so
 * a future refactor can't quietly drift them.
 *
 * IMPORTANT: poe.ninja is the authority. Everything here is Tier 3 — used for
 * projection ("what if armour were 2000?") and for the reconciliation harness
 * that FLAGS disagreement. It never overrides a value poe.ninja computed.
 */

/** Resistances cap at 75% by default; raisable to a hard ceiling of 90%. */
export const RES_CAP_DEFAULT = 75
export const RES_CAP_HARD = 90

/** Block caps at 50% in PoE2, not PoE1's 75%. */
export const BLOCK_CAP = 50

/** Physical damage reduction from armour caps at 90%. */
export const ARMOUR_DR_CAP = 90

/** Evade chance is clamped to this window; it is never 0% or a guaranteed hit. */
export const EVADE_CHANCE_MIN = 5
export const EVADE_CHANCE_MAX = 100

/** Energy shield recharges at 12.5% of maximum per second... */
export const ES_RECHARGE_RATE = 0.125
/** ...after a 4 second delay, shortened by "faster start of recharge". */
export const ES_RECHARGE_DELAY_SECONDS = 4
/** Numerator in `delay = 400 / (100 + faster%)`, which yields 4s at 0%. */
export const ES_RECHARGE_DELAY_NUMERATOR = 400

/**
 * Chaos damage removes twice as much energy shield as it deals — it does not
 * bypass ES as it did in PoE1. So the raw chaos pool is life + ES/2.
 */
export const CHAOS_ES_MULTIPLIER = 2

/**
 * Mitigation layer order. Armour applies BEFORE resistances for physical,
 * which is reversed relative to PoE1.
 */
export const MITIGATION_ORDER = ['evasion', 'block', 'armour', 'resistance'] as const

/**
 * Physical damage reduction from armour against a hit of a given size.
 *
 * DR = armour / (armour + 10 * rawHit), capped at 90%.
 * Hit-size dependent: armour that trivialises small hits does little against
 * big ones, which is why a low armour value can look adequate on a damage-taken
 * average and still leave a thin one-shot vector.
 */
export function armourDamageReduction(armour: number, rawHit: number): number {
  if (armour <= 0 || rawHit <= 0) return 0
  const dr = (armour / (armour + 10 * rawHit)) * 100
  return Math.min(dr, ARMOUR_DR_CAP)
}

/**
 * Chance to evade an attack.
 *
 * evade = 100 - (accuracy * 1.25 * 100) / (accuracy + evasion * 0.3)
 * clamped to [5, 100].
 */
export function evadeChance(evasion: number, accuracy: number): number {
  if (accuracy <= 0) return EVADE_CHANCE_MAX
  const denominator = accuracy + evasion * 0.3
  if (denominator <= 0) return EVADE_CHANCE_MIN
  const hitChance = (accuracy * 1.25 * 100) / denominator
  return Math.min(EVADE_CHANCE_MAX, Math.max(EVADE_CHANCE_MIN, 100 - hitChance))
}

/** Energy shield recharge delay in seconds, given "% faster start of recharge". */
export function esRechargeDelay(fasterStartPercent = 0): number {
  return ES_RECHARGE_DELAY_NUMERATOR / (100 + fasterStartPercent)
}

/** Energy shield restored per second while recharging. */
export function esRechargePerSecond(maxEnergyShield: number, increasedRate = 0): number {
  return maxEnergyShield * ES_RECHARGE_RATE * (1 + increasedRate / 100)
}

/**
 * Raw pool against chaos damage. Chaos drains ES at 2x, so each point of ES is
 * worth half a point of effective pool.
 */
export function chaosRawPool(life: number, energyShield: number): number {
  return life + energyShield / CHAOS_ES_MULTIPLIER
}

/** Clamp a resistance value to its maximum. */
export function effectiveResistance(value: number, max = RES_CAP_DEFAULT): number {
  return Math.min(value, max)
}
