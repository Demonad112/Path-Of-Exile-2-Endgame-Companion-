'use client'

import type { PassiveAllocation } from '@poe2/core'
import type { PassiveTreeState } from '@/lib/usePassiveTree'
import { Panel } from '../ui'
import { PassiveTreeView } from './PassiveTreeView'

/**
 * The tree artifact is loaded at page level rather than here.
 *
 * It stopped being only something to draw once keystone names became an input
 * to the analysis: the panel and the analysis must be looking at the same copy,
 * and two fetches of the same file into two components is how that drifts.
 */
export function TreePanel({
  allocation,
  state,
  weakStats = [],
}: {
  allocation: PassiveAllocation
  /** Loaded once at page level, so the drawing and the analysis agree. */
  state: PassiveTreeState
  /**
   * Stats the analysis found the build short on, best first. Drives the
   * route-suggestion picker — see PassiveTreeView.
   */
  weakStats?: Array<{ key: string; label: string; shortfall: string }>
}) {
  const tree = state.status === 'ready' ? state.tree : null
  const error = state.status === 'error' ? state.message : null

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
