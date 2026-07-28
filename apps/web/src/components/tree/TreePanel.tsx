'use client'

import { useEffect, useState } from 'react'
import { PassiveTree, type PassiveAllocation, type PassiveTreeData } from '@poe2/core'
import { Panel } from '../ui'
import { PassiveTreeView } from './PassiveTreeView'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/**
 * The tree artifact is ~600 KB (about 147 KB over the wire) and only matters
 * once a character is loaded, so it is fetched on demand and kept for the
 * session rather than bundled into the initial payload.
 */
let cached: PassiveTree | null = null
let inFlight: Promise<PassiveTree> | null = null

function loadTree(): Promise<PassiveTree> {
  if (cached) return Promise.resolve(cached)
  if (inFlight) return inFlight
  inFlight = fetch(`${basePath}/passive-tree.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`tree data returned ${r.status}`)
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

export function TreePanel({
  allocation,
  weakStats = [],
}: {
  allocation: PassiveAllocation
  /**
   * Stats the analysis found the build short on, best first. Drives the
   * route-suggestion picker — see PassiveTreeView.
   */
  weakStats?: Array<{ key: string; label: string; shortfall: string }>
}) {
  const [tree, setTree] = useState<PassiveTree | null>(cached)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (tree) return
    let live = true
    loadTree()
      .then((t) => live && setTree(t))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [tree])

  return (
    <Panel
      title="Passive tree"
      subtitle="Allocated path highlit; the rest dimmed. Drag to pan, scroll or pinch to zoom, hover or tap a node for its stats."
    >
      {error ? (
        <p className="py-8 text-center text-sm text-warn">
          The passive tree data could not be loaded ({error}), so the tree cannot be drawn. Everything else on this
          page is unaffected.
        </p>
      ) : tree ? (
        <PassiveTreeView tree={tree} allocation={allocation} weakStats={weakStats} />
      ) : (
        <div className="skeleton h-[26rem] w-full rounded-lg sm:h-[34rem]" aria-busy="true">
          <span className="sr-only">Loading passive tree…</span>
        </div>
      )}
    </Panel>
  )
}
