'use client'

/**
 * Load the passive tree once, for the whole page.
 *
 * This used to live inside the tree panel, which was fine until the analysis
 * itself started needing it: keystone NAMES come from this artifact, and
 * without them a Chaos Inoculation build reads as an ordinary one — thin on
 * life, short on chaos resistance, neither of which is true.
 *
 * So the tree is no longer just something to draw. It is an input to the
 * analysis, and the drawing and the analysis have to be looking at the same
 * copy of it.
 *
 * Loaded on demand rather than at page load: ~600 KB raw, about 147 KB over the
 * wire, and no route outside the character page needs it.
 */

import { useEffect, useState } from 'react'
import { PassiveTree, type PassiveTreeData } from '@poe2/core'

const DATA_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/passive-tree.json`

export type PassiveTreeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; tree: PassiveTree }
  | { status: 'error'; message: string }

// Module-level, so a remount does not refetch and the panel and the analysis
// cannot end up holding two different parses of the same file.
let cached: PassiveTree | null = null
let inFlight: Promise<PassiveTree> | null = null

export function loadPassiveTree(): Promise<PassiveTree> {
  if (cached) return Promise.resolve(cached)
  if (inFlight) return inFlight
  inFlight = fetch(DATA_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`the tree data returned ${r.status}`)
      return r.json() as Promise<PassiveTreeData>
    })
    .then((data) => {
      cached = new PassiveTree(data)
      return cached
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

export function usePassiveTree(enabled: boolean): PassiveTreeState {
  const [state, setState] = useState<PassiveTreeState>(cached ? { status: 'ready', tree: cached } : { status: 'idle' })

  useEffect(() => {
    if (!enabled || state.status === 'ready') return
    let cancelled = false
    setState({ status: 'loading' })

    loadPassiveTree()
      .then((tree) => {
        if (!cancelled) setState({ status: 'ready', tree })
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: 'error', message: err.message })
      })

    return () => {
      cancelled = true
    }
  }, [enabled, state.status])

  return state
}
