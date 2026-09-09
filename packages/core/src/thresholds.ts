/**
 * Every "is this number good?" judgement in one place.
 *
 * These are the only constants in the codebase that encode an OPINION. Nothing
 * here is a game constant — `defense/constants.ts` holds those, and they are
 * derived from the game's own formulas. What lives here is a set of judgement
 * calls about when a figure is worth telling a player about, and anything that
 * renders a verdict imports from here so one number cannot draw three different
 * conclusions on one screen.
 *
 * The predecessor learned this the hard way: 18% chaos resistance rendered as a
 * healthy green bar (>= 0), a warning in the build assessment (< 30) and "12%
 * short" in the resistance advice (target 30) — three verdicts on one number.
 *
 * Deliberately ABSENT: DPS bands. Damage is graded against figures actually
 * observed on the ladder (see ninja/ladder.ts), and where no sample is
 * available the offence half of the assessment is left unscored rather than
 * measured against invented cutoffs.
 */

import type { ResistanceState } from './defense/index.js'

/**
 * Chaos resistance has no cap-driven breakpoint in PoE2 the way the elements
 * do, so this is a target rather than a cap: below it, chaos damage is worth
 * actively fixing. A judgement call, not a game constant — every surface that
 * acts on it says so.
 */
export const CHAOS_TARGET = 30

/** Below this, chaos resistance is actively dangerous rather than merely low. */
export const CHAOS_CRITICAL = 0

/** Combined defensive pool bands, in points of life + energy shield + ward. */
export const POOL_GOOD = 6000
export const POOL_THIN = 4000

/**
 * A maximum-hit-taken value below this fraction of the character's best is a
 * one-shot risk worth flagging.
 *
 * Applied to EVERY damage type, not only the single lowest. On the reference
 * character physical (4,264) sat under the threshold alongside chaos (3,808)
 * and went unreported — the more dangerous miss of the two, since physical hits
 * are far more common in maps than chaos hits.
 */
export const ONE_SHOT_RATIO = 0.4

/**
 * Below this, critical strikes contribute so little that scaling them is not
 * the lever — expressed as a damage multiplier over never critting, so 1.15
 * means "crit is adding 15%".
 *
 * This is a judgement call about when the split between crit chance and crit
 * multiplier has stopped paying, NOT a DPS band. The distinction matters: it
 * grades a build against its own arithmetic rather than against an outside
 * figure nobody measured, which is why it can live here when a DPS cutoff
 * could not.
 */
export const CRIT_UNINVESTED = 1.15

/**
 * Above this share of a skill's damage, the skill is driven by damage over
 * time and hit-scaling advice would send it the wrong way.
 */
export const DOT_DOMINANT = 0.6

/**
 * Smallest damage gain from reaching full hit chance that is worth raising, in
 * percent. Below it the finding is technically true and practically noise.
 */
export const ACCURACY_MIN_GAIN = 3

/**
 * The target a resistance is judged against.
 *
 * Elemental resistances use the character's OWN maximum as poe.ninja reports
 * it, not a hardcoded 75 — a build that has raised its cap to 80 is not at cap
 * at 75, and saying otherwise would call a real gap closed.
 */
export function targetFor(res: Pick<ResistanceState, 'type' | 'max'>): number {
  return res.type === 'chaos' ? CHAOS_TARGET : res.max
}

/** Whether a resistance clears its target. */
export function isHealthy(res: Pick<ResistanceState, 'type' | 'max' | 'value'>): boolean {
  return res.value >= targetFor(res)
}
