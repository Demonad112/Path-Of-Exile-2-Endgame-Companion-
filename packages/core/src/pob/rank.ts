/**
 * Rank candidate passive nodes by what Path of Building actually measures.
 *
 * `suggestNodesForStat` ranks by what a node's text *says* it grants, divided by
 * the points to reach it. That is honest but shallow: a node printing "+12%
 * increased Physical Damage" may be worth far more or far less than one printing
 * "+15%", depending on everything else on the character. Only the damage engine
 * knows which.
 *
 * So: take the candidates, simulate each in the live Path of Building, and rank
 * by the measured result per point spent. This is the difference between a
 * suggestion and an answer.
 *
 * ## Why this runs one at a time
 *
 * There is one Path of Building and one build open in it. Simulations are
 * sequential by necessity, and each must land back on the same baseline as the
 * last or the comparison is meaningless.
 *
 * ## Why a failed revert stops everything
 *
 * If one simulation cannot undo itself, every later measurement is taken against
 * a tree that is no longer the character's. Those numbers would look completely
 * ordinary and be quietly wrong — the exact failure this project exists to
 * avoid. The run halts, says which node dirtied the tree, and returns what it
 * had measured up to that point rather than discarding it.
 */

import {
  PobBridge,
  PobBridgeError,
  simulatePassiveNode,
  type SimulationResult,
  type StatDelta,
} from './bridge.js'

/** PoB's headline damage figure. */
export const DEFAULT_METRIC = 'TotalDPS'

export interface NodeCandidate {
  id: number
  name?: string
}

export interface RankedNode {
  nodeId: number
  name: string | null
  /** The metric's movement. Null when PoB reported no change to it. */
  measured: StatDelta | null
  /** Points actually spent, including any the auto-path took. */
  points: number
  /** Metric delta per point. The ranking key. Null when unmeasurable. */
  perPoint: number | null
  costDetail: string
  /** Everything else that moved — a node can help damage and hurt defence. */
  sideEffects: StatDelta[]
  warnings: string[]
}

export interface SkippedNode {
  nodeId: number
  name: string | null
  reason: string
}

export interface RankReport {
  metric: string
  /** Metric value before anything was touched. */
  baseline: number | null
  /** Measurable candidates, best gain per point first. */
  ranked: RankedNode[]
  /** Candidates that could not be measured, each saying why. */
  skipped: SkippedNode[]
  /**
   * True when the run stopped early. When set, `ranked` is partial and
   * `warnings` says what went wrong.
   */
  halted: boolean
  warnings: string[]
}

/** Side effects worth surfacing: a real move in something other than the metric. */
function sideEffectsOf(result: SimulationResult, metric: string): StatDelta[] {
  return result.changed.filter((d) => d.stat !== metric)
}

/**
 * Simulate each candidate and rank by measured gain per point.
 *
 * Nodes already allocated, unreachable, or that PoB refuses are skipped with the
 * reason rather than silently dropped — "this node is not in the list" and "this
 * node is worthless" must not look the same.
 */
export async function rankNodesByMeasuredGain(
  bridge: PobBridge,
  candidates: NodeCandidate[],
  options: { metric?: string } = {},
): Promise<RankReport> {
  const metric = options.metric ?? DEFAULT_METRIC
  const warnings: string[] = []
  const ranked: RankedNode[] = []
  const skipped: SkippedNode[] = []

  if (candidates.length === 0) {
    return { metric, baseline: null, ranked, skipped, halted: false, warnings: ['No candidate nodes were given.'] }
  }

  // The baseline serves two purposes: it is what every delta is relative to,
  // and re-reading it at the end detects drift the per-node reverts missed.
  const baselineCalcs = await bridge.getCalcs()
  const baselineRaw = baselineCalcs[metric]
  const baseline = typeof baselineRaw === 'number' ? baselineRaw : null

  if (baseline === null) {
    const numeric = Object.entries(baselineCalcs)
      .filter(([, v]) => typeof v === 'number')
      .map(([k]) => k)
    return {
      metric,
      baseline: null,
      ranked,
      skipped,
      halted: true,
      warnings: [
        `Path of Building does not report a numeric "${metric}", so there is nothing to rank by. ` +
          `It currently reports: ${numeric.join(', ')}.`,
      ],
    }
  }

  let halted = false
  for (const candidate of candidates) {
    let result: SimulationResult
    try {
      result = await simulatePassiveNode(bridge, candidate.id, candidate.name)
    } catch (err) {
      const reason = err instanceof PobBridgeError ? err.message : (err as Error).message
      skipped.push({ nodeId: candidate.id, name: candidate.name ?? null, reason })
      // A connection that has dropped will not come back within this run, and
      // retrying it 30 more times helps nobody.
      if (err instanceof PobBridgeError && err.reason === 'not-running') {
        warnings.push('Lost the connection to Path of Building part-way through. Results below are partial.')
        halted = true
        break
      }
      continue
    }

    const measured = result.changed.find((d) => d.stat === metric) ?? null
    const points = result.cost?.points ?? 1

    ranked.push({
      nodeId: candidate.id,
      name: candidate.name ?? null,
      measured,
      points,
      perPoint: measured && points > 0 ? measured.delta / points : null,
      costDetail: result.cost?.detail ?? 'cost not reported',
      sideEffects: sideEffectsOf(result, metric),
      warnings: result.warnings,
    })

    if (!result.reverted) {
      warnings.push(
        `Stopped after node ${candidate.id}: the tree could not be restored, so every later measurement would be ` +
          'taken against a build that is no longer yours. Fix your Path of Building window before re-running.',
        ...result.warnings,
      )
      halted = true
      break
    }
  }

  // Drift check. Every individual revert may have verified clean and the total
  // still be off — PoB recalculates asynchronously, and an unrelated setting
  // could have moved. Cheap to check, and silent drift is what makes a whole
  // ranking quietly wrong.
  if (!halted) {
    try {
      const finalRaw = (await bridge.getCalcs())[metric]
      if (typeof finalRaw === 'number' && finalRaw !== baseline) {
        warnings.push(
          `${metric} read ${baseline} before the run and ${finalRaw} after, so Path of Building did not end up where ` +
            'it started. Treat the ranking below as indicative and re-check in Path of Building directly.',
        )
      }
    } catch (err) {
      warnings.push(`Could not re-check the baseline afterwards: ${(err as Error).message}`)
    }
  }

  ranked.sort((a, b) => (b.perPoint ?? -Infinity) - (a.perPoint ?? -Infinity))

  const flat = ranked.filter((r) => r.perPoint === null || r.perPoint === 0)
  if (flat.length && flat.length === ranked.length) {
    warnings.push(
      `None of the ${ranked.length} nodes moved ${metric} at all. That is a real answer — for this build they are ` +
        'worth nothing on that metric — but check the metric is the one you meant.',
    )
  }

  return { metric, baseline, ranked, skipped, halted, warnings }
}
