/**
 * Measured node ranking.
 *
 * The interesting cases are all failure cases. A ranking that works when
 * everything works is not where wrong numbers come from — they come from a run
 * that half-worked and reported as if it hadn't.
 */

import { describe, expect, it } from 'vitest'
import { PobBridge, type PobTransport } from '../src/pob/bridge.js'
import { rankNodesByMeasuredGain } from '../src/pob/rank.js'

/**
 * A fake PoB where each node is worth a fixed amount, so the expected ranking
 * is known independently of the code under test.
 */
class RankablePob {
  allocated = new Set<number>([1])
  /** node id -> DPS it adds when allocated. */
  worth = new Map<number, number>()
  /** node id -> nodes auto-pathed through to reach it. */
  paths = new Map<number, number[]>()
  /** Nodes whose deallocation silently does nothing. */
  stuck = new Set<number>()
  /** Methods that should error, mapped to the message. */
  fail = new Map<string, string>()
  /** Once true, every call fails as if PoB closed. */
  dead = false
  /** Reported instead of TotalDPS, to test a missing metric. */
  metricName = 'TotalDPS'
  /** Added to every reading after this many, to fake unrelated drift. */
  driftAfterReads: number | null = null
  private reads = 0

  transport: PobTransport = async (_port, payload) => {
    if (this.dead) throw new Error('ECONNREFUSED')
    const req = JSON.parse(payload) as { id: number; method: string; params: Record<string, unknown> }

    const failure = this.fail.get(req.method)
    if (failure) {
      return `${JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: -1, message: failure } })}\n`
    }
    return `${JSON.stringify({ jsonrpc: '2.0', id: req.id, result: this.handle(req.method, req.params) })}\n`
  }

  private dps(): number {
    let total = 1000
    for (const id of this.allocated) total += this.worth.get(id) ?? 0
    return total
  }

  private handle(method: string, params: Record<string, unknown>): unknown {
    switch (method) {
      case 'get_passive_tree':
        return {
          totalPoints: this.allocated.size,
          nodes: [...this.allocated].map((id) => ({ id, name: `Node ${id}` })),
        }

      case 'set_passive_node': {
        const id = params.node_id as number
        if (params.allocate) {
          for (const step of this.paths.get(id) ?? []) this.allocated.add(step)
          this.allocated.add(id)
        } else if (!this.stuck.has(id)) {
          this.allocated.delete(id)
        }
        return { success: true }
      }

      case 'get_calcs': {
        this.reads += 1
        const drifted = this.driftAfterReads !== null && this.reads > this.driftAfterReads
        const out: Record<string, unknown> = { class: 'Ranger', Life: 1448 }
        out[this.metricName] = this.dps() + (drifted ? 77 : 0)
        return out
      }

      default:
        return { success: true }
    }
  }
}

function bridgeFor(pob: RankablePob): PobBridge {
  return new PobBridge({ transport: pob.transport })
}

describe('rankNodesByMeasuredGain', () => {
  it('ranks by measured gain per point, not by raw gain', async () => {
    const pob = new RankablePob()
    // 10 is worth more outright, but 11 is adjacent and 10 costs three points.
    pob.worth.set(10, 900)
    pob.paths.set(10, [80, 81])
    pob.worth.set(11, 400)

    const report = await rankNodesByMeasuredGain(bridgeFor(pob), [
      { id: 10, name: 'Far Notable' },
      { id: 11, name: 'Adjacent Notable' },
    ])

    expect(report.baseline).toBe(1000)
    expect(report.ranked.map((r) => r.nodeId)).toEqual([11, 10])
    expect(report.ranked[0]).toMatchObject({ name: 'Adjacent Notable', points: 1, perPoint: 400 })
    // 900 across three points is 300 each — worse than the smaller adjacent node.
    expect(report.ranked[1]).toMatchObject({ points: 3, perPoint: 300 })
    expect(report.halted).toBe(false)
  })

  it('measures each node against the same baseline', async () => {
    const pob = new RankablePob()
    pob.worth.set(10, 500)
    pob.worth.set(11, 300)

    const report = await rankNodesByMeasuredGain(bridgeFor(pob), [{ id: 10 }, { id: 11 }])

    // If node 10 had been left allocated, node 11 would measure from 1500.
    for (const r of report.ranked) expect(r.measured?.before).toBe(1000)
  })

  it('stops the run when a node cannot be reverted, rather than measuring against a dirty tree', async () => {
    const pob = new RankablePob()
    pob.worth.set(10, 500)
    pob.worth.set(11, 300)
    pob.stuck.add(10)

    const report = await rankNodesByMeasuredGain(bridgeFor(pob), [{ id: 10 }, { id: 11 }])

    expect(report.halted).toBe(true)
    // Node 10's measurement was valid — it is taken before the failed undo — so
    // it is kept. Node 11 is never attempted.
    expect(report.ranked.map((r) => r.nodeId)).toEqual([10])
    expect(report.warnings.join(' ')).toContain('no longer yours')
  })

  it('skips an already-allocated node with a reason instead of dropping it', async () => {
    const pob = new RankablePob()
    pob.worth.set(11, 300)

    const report = await rankNodesByMeasuredGain(bridgeFor(pob), [{ id: 1 }, { id: 11 }])

    expect(report.ranked.map((r) => r.nodeId)).toEqual([11])
    expect(report.skipped).toHaveLength(1)
    expect(report.skipped[0]!.reason).toContain('already allocated')
    // A skip is not a halt — the rest of the run is still worth doing.
    expect(report.halted).toBe(false)
  })

  it('stops immediately when the connection drops, instead of retrying every node', async () => {
    const pob = new RankablePob()
    pob.worth.set(10, 500)
    const bridge = bridgeFor(pob)

    let seen = 0
    const watching = new PobBridge({
      transport: async (port, payload, timeout) => {
        const req = JSON.parse(payload) as { method: string }
        if (req.method === 'get_passive_tree' && ++seen > 1) pob.dead = true
        return pob.transport(port, payload, timeout)
      },
    })

    const report = await rankNodesByMeasuredGain(watching, [{ id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }])

    expect(report.halted).toBe(true)
    expect(report.warnings.join(' ')).toContain('Lost the connection')
    // Three candidates remained; only the one that hit the dead connection is
    // reported, not all of them.
    expect(report.skipped).toHaveLength(1)
    expect(bridge).toBeDefined()
  })

  it('refuses to rank by a metric Path of Building does not report', async () => {
    const pob = new RankablePob()
    const report = await rankNodesByMeasuredGain(bridgeFor(pob), [{ id: 10 }], { metric: 'Nonsense' })

    expect(report.halted).toBe(true)
    expect(report.ranked).toEqual([])
    expect(report.warnings[0]).toContain('does not report a numeric "Nonsense"')
    // Naming what it does report is what makes the error fixable.
    expect(report.warnings[0]).toContain('TotalDPS')
  })

  it('ranks by any metric PoB reports, not just damage', async () => {
    const pob = new RankablePob()
    pob.metricName = 'Armour'
    pob.worth.set(10, 250)

    const report = await rankNodesByMeasuredGain(bridgeFor(pob), [{ id: 10 }], { metric: 'Armour' })
    expect(report.ranked[0]).toMatchObject({ perPoint: 250 })
  })

  it('reports side effects separately from the metric', async () => {
    const pob = new RankablePob()
    pob.worth.set(10, 500)
    const report = await rankNodesByMeasuredGain(bridgeFor(pob), [{ id: 10 }])

    expect(report.ranked[0]!.measured?.stat).toBe('TotalDPS')
    // Life did not move on this fake, so there is nothing to report — the point
    // is that the metric is never duplicated into the side-effect list.
    expect(report.ranked[0]!.sideEffects.map((d) => d.stat)).not.toContain('TotalDPS')
  })

  it('says plainly when nothing helped, rather than returning a ranking of zeroes', async () => {
    const pob = new RankablePob() // no node is worth anything
    const report = await rankNodesByMeasuredGain(bridgeFor(pob), [{ id: 10 }, { id: 11 }])

    expect(report.ranked).toHaveLength(2)
    expect(report.ranked.every((r) => r.perPoint === 0 || r.perPoint === null)).toBe(true)
    expect(report.warnings.join(' ')).toContain('worth nothing on that metric')
  })

  it('catches drift that every individual revert reported clean', async () => {
    const pob = new RankablePob()
    pob.worth.set(10, 500)
    // Every per-node revert verifies against the tree and passes; the metric
    // moves anyway, which is what the end-of-run baseline re-read is for.
    pob.driftAfterReads = 3

    const report = await rankNodesByMeasuredGain(bridgeFor(pob), [{ id: 10 }])

    expect(report.ranked[0]!.warnings).toEqual([])
    expect(report.warnings.join(' ')).toContain('did not end up where it started')
    expect(report.warnings.join(' ')).toContain('1000')
  })

  it('returns a stated reason for an empty candidate list', async () => {
    const pob = new RankablePob()
    const report = await rankNodesByMeasuredGain(bridgeFor(pob), [])
    expect(report.warnings).toEqual(['No candidate nodes were given.'])
    expect(report.halted).toBe(false)
  })
})
