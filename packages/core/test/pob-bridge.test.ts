/**
 * PoB bridge tests.
 *
 * There is no Path of Building in CI, so the transport is faked — but the fake
 * reproduces the two addon behaviours that a naive client gets wrong (custom
 * mods are a string; allocation auto-paths), because those are exactly what the
 * bridge exists to handle. A fake that behaved the way the obvious client
 * assumes would test nothing.
 *
 * This is mock coverage of the protocol, not verification against real PoB.
 * That verification is the user's, and the README says so.
 */

import { describe, expect, it } from 'vitest'
import {
  POB_DEFAULT_PORTS,
  PobBridge,
  PobBridgeError,
  simulateCustomMods,
  simulatePassiveNode,
  type PobTransport,
} from '../src/pob/bridge.js'

interface Call {
  port: number
  method: string
  params: Record<string, unknown>
}

/** A fake Path of Building that behaves the way the addon actually does. */
class FakePob {
  calls: Call[] = []
  /** Ports this fake answers on. Anything else refuses the connection. */
  listenOn: number[] = [49085]
  /** Tree state: node id -> the path it would auto-allocate to reach it. */
  allocated = new Set<number>([1, 2, 3])
  paths = new Map<number, number[]>([[50, [40, 41]]])
  names = new Map<number, string>([
    [40, 'Path Node A'],
    [41, 'Path Node B'],
    [50, 'Golem Tether'],
  ])
  customMods = ''
  /** Bonus DPS per allocated node, so the diff has something to find. */
  dpsPerNode = 1000
  /** Set to make a method fail. */
  fail = new Map<string, string>()
  /** When set, deallocation silently does nothing — the broken-revert case. */
  ignoreDeallocate = false

  transport: PobTransport = async (port, payload) => {
    if (!this.listenOn.includes(port)) {
      throw new Error(`ECONNREFUSED 127.0.0.1:${port}`)
    }
    const request = JSON.parse(payload) as { id: number; method: string; params: Record<string, unknown> }
    this.calls.push({ port, method: request.method, params: request.params })

    const failure = this.fail.get(request.method)
    if (failure) {
      return `${JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -1, message: failure } })}\n`
    }

    return `${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: this.handle(request.method, request.params) })}\n`
  }

  private handle(method: string, params: Record<string, unknown>): unknown {
    switch (method) {
      case 'ping':
        return { status: 'ok', version: '1.0.0', pob_version: '2.51.0', build_loaded: true, build_name: 'Athrynas' }

      case 'get_passive_tree':
        return {
          class: 'Ranger',
          ascendancy: 'Deadeye',
          totalPoints: this.allocated.size,
          nodes: [...this.allocated].map((id) => ({ id, name: this.names.get(id) ?? `Node ${id}` })),
        }

      case 'set_passive_node': {
        const id = params.node_id as number
        if (params.allocate) {
          // PoB's AllocNode takes the whole shortest path, not just the node.
          for (const step of this.paths.get(id) ?? []) this.allocated.add(step)
          this.allocated.add(id)
        } else if (!this.ignoreDeallocate) {
          this.allocated.delete(id)
        }
        return { success: true, allocated_points: this.allocated.size }
      }

      case 'get_custom_mods':
        return { mods: this.customMods }

      case 'set_custom_mods': {
        // The addon assigns straight into a text box. Anything but a string is
        // a client bug, so the fake refuses it rather than coercing.
        if (typeof params.mods !== 'string') {
          throw new Error(`set_custom_mods expects a string, got ${typeof params.mods}`)
        }
        this.customMods = params.mods
        return { success: true }
      }

      case 'recalculate':
        return { success: true }

      case 'get_calcs': {
        const modBonus = this.customMods.split('\n').filter(Boolean).length * 500
        return {
          level: 86,
          class: 'Ranger',
          ascendancy: 'Deadeye',
          TotalDPS: 100000 + this.allocated.size * this.dpsPerNode + modBonus,
          Life: 1448,
          Armour: 207,
          FireResist: 75,
        }
      }

      default:
        return { success: true }
    }
  }
}

function bridgeFor(pob: FakePob): PobBridge {
  return new PobBridge({ transport: pob.transport, timeoutMs: 100 })
}

describe('PobBridge transport', () => {
  it('sends newline-terminated JSON-RPC 2.0 with an incrementing id', async () => {
    const pob = new FakePob()
    const sent: string[] = []
    const bridge = new PobBridge({
      transport: async (port, payload, timeout) => {
        sent.push(payload)
        return pob.transport(port, payload, timeout)
      },
    })

    await bridge.ping()
    await bridge.recalculate()

    expect(sent).toHaveLength(2)
    for (const payload of sent) expect(payload.endsWith('\n')).toBe(true)
    expect(JSON.parse(sent[0]!)).toMatchObject({ jsonrpc: '2.0', id: 1, method: 'ping', params: {} })
    expect(JSON.parse(sent[1]!)).toMatchObject({ jsonrpc: '2.0', id: 2, method: 'recalculate' })
  })

  it('falls back through the default ports and then sticks to the one that answered', async () => {
    const pob = new FakePob()
    pob.listenOn = [49087]
    const bridge = bridgeFor(pob)

    await bridge.ping()
    expect(pob.calls.map((c) => c.port)).toEqual([49087])
    expect(bridge.port).toBe(49087)

    // 49085 and 49086 refused, so they never reached the fake. The next call
    // must not pay that cost again.
    pob.calls = []
    await bridge.recalculate()
    expect(pob.calls.map((c) => c.port)).toEqual([49087])
  })

  it('tries every default port before giving up', async () => {
    const attempted: number[] = []
    const bridge = new PobBridge({
      transport: async (port) => {
        attempted.push(port)
        throw new Error('ECONNREFUSED')
      },
    })

    await expect(bridge.recalculate()).rejects.toThrow(PobBridgeError)
    expect(attempted).toEqual([...POB_DEFAULT_PORTS])
  })

  it('reports an unreachable PoB as not-running, and names the MCPConfig gotcha', async () => {
    const bridge = new PobBridge({ transport: async () => Promise.reject(new Error('ECONNREFUSED')) })
    const err = await bridge.recalculate().catch((e) => e as PobBridgeError)

    expect(err).toBeInstanceOf(PobBridgeError)
    expect(err.reason).toBe('not-running')
    // The failure mode is indistinguishable from a local MCPConfig, so the
    // message has to mention it or the user has no way to tell them apart.
    expect(err.message).toContain('GLOBAL')
    expect(err.message).toContain('ECONNREFUSED')
  })

  it('distinguishes a rejected command from an unreachable PoB', async () => {
    const pob = new FakePob()
    pob.fail.set('get_calcs', 'No build loaded')
    const err = await bridgeFor(pob)
      .getCalcs()
      .catch((e) => e as PobBridgeError)

    expect(err.reason).toBe('command-failed')
    expect(err.message).toContain('No build loaded')
  })

  it('reports a non-JSON reply as bad-response rather than crashing', async () => {
    const bridge = new PobBridge({ transport: async () => '<html>404</html>' })
    const err = await bridge.recalculate().catch((e) => e as PobBridgeError)

    expect(err.reason).toBe('bad-response')
  })

  it('ping returns null instead of throwing when PoB is not there', async () => {
    const bridge = new PobBridge({ transport: async () => Promise.reject(new Error('nope')) })
    expect(await bridge.ping()).toBeNull()
  })

  it('sends custom mods as a newline-joined string, because the addon assigns it to a text box', async () => {
    const pob = new FakePob()
    await bridgeFor(pob).setCustomMods(['+40 to maximum Life', '+12% to Cold Resistance'])

    const call = pob.calls.find((c) => c.method === 'set_custom_mods')!
    expect(call.params.mods).toBe('+40 to maximum Life\n+12% to Cold Resistance')
  })
})

describe('simulatePassiveNode', () => {
  it('measures the change and counts the auto-pathed points as cost', async () => {
    const pob = new FakePob()
    const result = await simulatePassiveNode(bridgeFor(pob), 50)

    // Three nodes allocated (40, 41, 50) at 1000 DPS each.
    expect(result.totalDps).toMatchObject({ before: 103000, after: 106000, delta: 3000 })
    expect(result.change).toBe('Allocate Golem Tether (node 50)')

    // PoB auto-pathed, so the honest cost is 3 points, not 1.
    expect(result.cost).toMatchObject({ kind: 'passive', points: 3 })
    expect(result.cost!.detail).toContain('Path Node A')
  })

  it('restores the tree exactly, including the auto-pathed nodes', async () => {
    const pob = new FakePob()
    const before = [...pob.allocated].sort()

    const result = await simulatePassiveNode(bridgeFor(pob), 50)

    expect(result.reverted).toBe(true)
    expect(result.warnings).toEqual([])
    expect([...pob.allocated].sort()).toEqual(before)
  })

  it('says so loudly when the revert did not take', async () => {
    const pob = new FakePob()
    pob.ignoreDeallocate = true

    const result = await simulatePassiveNode(bridgeFor(pob), 50)

    // The undo commands all "succeeded"; only re-reading the tree catches it.
    expect(result.reverted).toBe(false)
    expect(result.warnings.join(' ')).toContain('did not return to its original state')
    expect(result.warnings.join(' ')).toContain('Still allocated')
    // The measurement is still returned — it is correct, PoB is just dirty.
    expect(result.totalDps?.delta).toBe(3000)
  })

  it('warns when the undo command itself fails', async () => {
    const pob = new FakePob()

    // Drop the connection on deallocation only, so the allocation lands and the
    // undo cannot — the case where PoB is left genuinely dirty.
    const original = pob.transport
    const guarded: PobTransport = async (port, payload, timeout) => {
      const request = JSON.parse(payload) as { method: string; params: { allocate?: boolean } }
      if (request.method === 'set_passive_node' && !request.params.allocate) {
        throw new Error('socket closed')
      }
      return original(port, payload, timeout)
    }

    const result = await simulatePassiveNode(new PobBridge({ transport: guarded }), 50)
    expect(result.reverted).toBe(false)
    expect(result.warnings.join(' ')).toContain('could not undo it')
    expect(result.warnings.join(' ')).toContain('remove them there')
  })

  it('refuses to measure a node that is already allocated', async () => {
    const pob = new FakePob()
    const err = await simulatePassiveNode(bridgeFor(pob), 1).catch((e) => e as PobBridgeError)

    expect(err).toBeInstanceOf(PobBridgeError)
    expect(err.message).toContain('already allocated')
  })

  it('reports a single point when the node is already adjacent', async () => {
    const pob = new FakePob()
    const result = await simulatePassiveNode(bridgeFor(pob), 99) // no path entry

    expect(result.cost).toMatchObject({ points: 1 })
    expect(result.cost!.detail).toContain('already adjacent')
  })

  it('ignores non-numeric fields in the calcs payload', async () => {
    const pob = new FakePob()
    const result = await simulatePassiveNode(bridgeFor(pob), 50)

    // class and ascendancy are strings; level is a number that did not move.
    expect(result.changed.map((d) => d.stat)).toEqual(['TotalDPS'])
  })
})

describe('simulateCustomMods', () => {
  it('measures the modifiers and reports no cost, because there is none to measure', async () => {
    const pob = new FakePob()
    const result = await simulateCustomMods(bridgeFor(pob), ['+40 to maximum Life'])

    expect(result.totalDps?.delta).toBe(500)
    expect(result.cost).toBeNull()
    expect(result.reverted).toBe(true)
  })

  it("preserves modifiers the user already had, rather than clearing the box", async () => {
    const pob = new FakePob()
    pob.customMods = '+25% to Critical Damage Bonus'

    const result = await simulateCustomMods(bridgeFor(pob), ['+40 to maximum Life'])

    // Measured on top of what was there, and put back exactly.
    expect(result.reverted).toBe(true)
    expect(pob.customMods).toBe('+25% to Critical Damage Bonus')

    const applied = pob.calls.filter((c) => c.method === 'set_custom_mods').map((c) => c.params.mods)
    expect(applied[0]).toBe('+25% to Critical Damage Bonus\n+40 to maximum Life')
    expect(applied[1]).toBe('+25% to Critical Damage Bonus')
  })

  it('warns when the previous modifiers could not be read first', async () => {
    const pob = new FakePob()
    pob.fail.set('get_custom_mods', 'No build loaded')

    const result = await simulateCustomMods(bridgeFor(pob), ['+40 to maximum Life'])
    expect(result.warnings.join(' ')).toContain('will be cleared rather than restored')
  })

  it('refuses an empty modifier list', async () => {
    const pob = new FakePob()
    await expect(simulateCustomMods(bridgeFor(pob), [])).rejects.toThrow('nothing to measure')
  })
})
