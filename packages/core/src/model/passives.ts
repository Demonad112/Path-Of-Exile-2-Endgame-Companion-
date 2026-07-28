/**
 * Passive tree normalization — THE single place that resolves node ids.
 *
 * CORRECTNESS RULE (shipped bug in V1, hit twice): `passiveSelection` arrives
 * as a flat list of ids from the PoB export path, but as a dict
 * `{ allocated_nodes, total_points, ... }` from the profile-API fallback path.
 * Normalize once, centrally. Nothing else in the codebase may touch the raw
 * field.
 *
 * CORRECTNESS RULE: the three selections are ALTERNATES. V1 summed
 * 103 + 16 + 16 = 135 and reported it as one tree. Trust `passiveCounts` for
 * headline totals and keep the sets separate everywhere else.
 */

import type { CharModel, NinjaPassiveCounts } from './types.js'
import type { WeaponSet } from './slots.js'
import { activeWeaponSet } from './slots.js'

/** Shape of the profile-API fallback variant. */
interface PassiveSelectionDict {
  allocated_nodes?: number[]
  [k: string]: unknown
}

/**
 * The one normalizer. Accepts either wire shape and always returns a
 * deduplicated, sorted id list.
 */
export function normalizePassiveIds(raw: unknown): number[] {
  let ids: unknown
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    ids = (raw as PassiveSelectionDict).allocated_nodes
  } else {
    ids = raw
  }
  if (!Array.isArray(ids)) return []

  const out = new Set<number>()
  for (const v of ids) {
    const n = typeof v === 'number' ? v : Number(v)
    if (Number.isInteger(n) && n >= 0) out.add(n)
  }
  return [...out].sort((a, b) => a - b)
}

export interface PassiveAllocation {
  /** Main tree — allocated regardless of which weapon set is live. */
  main: number[]
  /** Weapon-set-1-only nodes. Live when `activeSet === 1`. */
  set1: number[]
  /** Weapon-set-2-only nodes. Live when `activeSet === 2`. */
  set2: number[]
  activeSet: WeaponSet
  /**
   * main + the active set's nodes. This is the tree that is actually live.
   * Never main + set1 + set2.
   */
  live: number[]
  /**
   * poe.ninja's own counts. `counts.passives` is NOT `main.length` — on the
   * reference character it reads 109 against a 103-entry selection array.
   * Both are reported; neither is silently substituted for the other.
   */
  counts: NinjaPassiveCounts
  /** `main.length`, stated separately so callers never conflate the two. */
  mainSelectionLength: number
}

export function normalizePassives(
  model: Pick<
    CharModel,
    'passiveSelection' | 'passiveSelectionSet1' | 'passiveSelectionSet2' | 'passiveCounts' | 'useSecondWeaponSet'
  >,
): PassiveAllocation {
  const main = normalizePassiveIds(model.passiveSelection)
  const set1 = normalizePassiveIds(model.passiveSelectionSet1)
  const set2 = normalizePassiveIds(model.passiveSelectionSet2)
  const activeSet = activeWeaponSet(model)
  const activeExtra = activeSet === 2 ? set2 : set1

  return {
    main,
    set1,
    set2,
    activeSet,
    live: [...new Set([...main, ...activeExtra])].sort((a, b) => a - b),
    counts: model.passiveCounts ?? {},
    mainSelectionLength: main.length,
  }
}

/**
 * Nodes unique to the inactive weapon set — allocated but contributing
 * nothing right now. A non-empty result on a character with
 * `useSecondWeaponSet: false` is worth surfacing, but only as a question:
 * a swap set can be deliberate.
 */
export function inactiveSetNodes(alloc: PassiveAllocation): number[] {
  const inactive = alloc.activeSet === 2 ? alloc.set1 : alloc.set2
  const liveSet = new Set(alloc.live)
  return inactive.filter((id) => !liveSet.has(id))
}
