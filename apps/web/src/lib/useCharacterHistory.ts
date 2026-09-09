'use client'

/**
 * Character history, persisted locally.
 *
 * Records one compact snapshot per import and answers "is what I did last week
 * working". Two rules keep it honest:
 *
 *  - A snapshot is only appended when a figure actually moved. Re-importing
 *    without having played must not fill the history with identical rows.
 *  - The timestamp is stamped here, not in the core. The analysis is pure and
 *    reproducible; reading the clock is this layer's job.
 */

import { useEffect, useSyncExternalStore } from 'react'
import {
  appendSnapshot,
  historyFor,
  latestDiff,
  snapshotKey,
  toSnapshot,
  type Analysis,
  type CharacterSnapshot,
  type SnapshotDiff,
} from '@poe2/core'
import { getServerSnapshot, getSnapshot, setPersistedState, subscribe } from './storage'

export interface CharacterHistory {
  /** This character's snapshots, oldest first. */
  snapshots: CharacterSnapshot[]
  /** The change since the previous snapshot. Null until there are two. */
  diff: SnapshotDiff | null
}

/**
 * Record `analysis` and return this character's history.
 *
 * Pass null while the analysis is still provisional. The caller must not hand
 * over a reading taken before the passive tree resolved: without it no keystone
 * correction has been applied, so the recorded pool could credit a build with
 * life a keystone fixed at 1 — and then record the corrected figure a moment
 * later as a second row, inventing a change the player never made.
 */
export function useCharacterHistory(analysis: Analysis | null): CharacterHistory {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    if (!analysis) return
    // Guard on the account/name being present: an analysis with neither would
    // key every character to the same empty string and merge their histories.
    if (!analysis.identity.account || !analysis.identity.name) return

    const next = toSnapshot(analysis, new Date().toISOString(), analysis.keystones)
    setPersistedState((prev) => {
      const snapshots = appendSnapshot(prev.character.snapshots, next)
      // `appendSnapshot` hands back the same array when the figures have not
      // moved. Returning `prev` unchanged then keeps the store from serialising
      // the whole persisted state to localStorage and waking every subscriber —
      // which it otherwise did on each of the several analysis passes one import
      // performs as the affix data, tree and ladder arrive.
      if (snapshots === prev.character.snapshots) return prev
      return { ...prev, character: { ...prev.character, snapshots } }
    })
  }, [analysis])

  if (!analysis) return { snapshots: [], diff: null }

  const key = snapshotKey(analysis.identity)
  // Every element's own maximum. Reading fire's and applying it to all three
  // announced "Cold reached cap" on a build whose cold maximum is 80 and whose
  // cold resistance had only reached 76.
  const maxOf = (type: string) => analysis.defense.resistances.find((r) => r.type === type)?.max ?? 75
  const resistanceMax = {
    fire: maxOf('fire'),
    cold: maxOf('cold'),
    lightning: maxOf('lightning'),
  }

  return {
    snapshots: historyFor(state.character.snapshots, key),
    diff: latestDiff(state.character.snapshots, key, resistanceMax),
  }
}
