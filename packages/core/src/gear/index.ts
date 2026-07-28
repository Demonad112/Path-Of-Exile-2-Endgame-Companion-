/**
 * Gear analysis — what is on each item, how good it is, and what to change.
 *
 * Rests on a fact about the payload that V1 never used: poe.ninja ships the MOD
 * ID on every item, so nothing here pattern-matches mod text to guess meaning.
 */

export * from './tiers.js'
export * from './analyze.js'
export * from './audit.js'
export * from './content.js'
