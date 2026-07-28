/**
 * Live Path of Building bridge — Tier 2 of the DPS strategy.
 *
 * PoB has a real damage engine. Rather than reimplementing it, drive it: apply
 * a change, ask PoB what happened, put it back. That is the only honest way to
 * answer "what if I allocate this node" with a number that is not an estimate.
 *
 * ## Protocol
 *
 * JSON-RPC 2.0 over raw TCP to 127.0.0.1:49085 (falling back to 49086-49088),
 * newline-delimited, one request per connection. The MCP Bridge addon must be
 * installed in Path of Building for anything here to work.
 *
 * ## Transport is injected
 *
 * Core stays free of I/O, and a TCP socket does not exist in a browser anyway.
 * `apps/mcp` supplies a Node transport; tests supply a fake. That also means the
 * protocol logic is testable without a running Path of Building — which matters,
 * because this cannot be verified in CI.
 *
 * ## Two addon behaviours that the obvious client gets wrong
 *
 * Both were read out of the addon's Lua, not assumed:
 *
 * 1. **`set_custom_mods` takes a string, not a list.** It assigns straight to
 *    `configTab.input.customMods`, which is PoB's multi-line text box. Sending
 *    an array puts a Lua table where a string belongs. Mods are joined here.
 *
 * 2. **`set_passive_node` auto-paths.** PoB's `AllocNode` allocates the whole
 *    shortest path to the node, so asking for one node can spend several points.
 *    That makes the point cost measurable — but it also means deallocating just
 *    the requested node leaves the path allocated. Reverts therefore diff the
 *    allocated set and undo everything that appeared, then re-read the tree to
 *    confirm. `reverted` is only true when the sets actually match again.
 *
 * ## Installation gotcha, recorded so it is not rediscovered
 *
 * In the addon's config, `MCPConfig` must be a GLOBAL. Declaring it `local`
 * silently prevents the TCP server from ever binding, and the failure looks
 * exactly like "PoB is not running".
 */

export const POB_DEFAULT_PORTS = [49085, 49086, 49087, 49088] as const

/** Sends one newline-delimited JSON-RPC request and returns the raw reply. */
export type PobTransport = (port: number, payload: string, timeoutMs: number) => Promise<string>

export type PobErrorReason = 'not-running' | 'timeout' | 'bad-response' | 'command-failed'

export class PobBridgeError extends Error {
  override name = 'PobBridgeError'
  constructor(
    readonly reason: PobErrorReason,
    message: string,
  ) {
    super(message)
  }
}

const NOT_RUNNING =
  'Could not reach Path of Building on 127.0.0.1 (ports ' +
  POB_DEFAULT_PORTS.join(', ') +
  '). Check that Path of Building is running with the MCP Bridge addon installed. If it is, confirm the addon declares MCPConfig as a GLOBAL — declaring it local silently stops the TCP server binding, which looks identical to PoB not running.'

export interface PobBridgeOptions {
  transport: PobTransport
  ports?: readonly number[]
  timeoutMs?: number
}

/** What `ping` reports. Fields are whatever the addon sends; none are relied on. */
export interface PobPing {
  status?: string
  version?: string
  pob_version?: string
  build_loaded?: boolean
  build_name?: string | null
  uptime?: number
}

/** The allocated tree, as PoB currently has it. */
export interface PobTreeSnapshot {
  nodeIds: number[]
  totalPoints: number
  className: string | null
  ascendancy: string | null
  names: Map<number, string>
}

export class PobBridge {
  private readonly transport: PobTransport
  private readonly ports: readonly number[]
  private readonly timeoutMs: number
  private requestId = 0
  /** The port that last answered, tried first next time. */
  private preferredPort: number | null = null

  constructor(options: PobBridgeOptions) {
    this.transport = options.transport
    this.ports = options.ports ?? POB_DEFAULT_PORTS
    this.timeoutMs = options.timeoutMs ?? 5000
  }

  /** The port that answered most recently, or null if nothing has answered. */
  get port(): number | null {
    return this.preferredPort
  }

  /** Call one RPC method, trying each port until one answers. */
  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    this.requestId += 1
    const payload = `${JSON.stringify({ jsonrpc: '2.0', id: this.requestId, method, params })}\n`

    const order = this.preferredPort
      ? [this.preferredPort, ...this.ports.filter((p) => p !== this.preferredPort)]
      : [...this.ports]

    let lastError: unknown = null
    for (const port of order) {
      let raw: string
      try {
        raw = await this.transport(port, payload, this.timeoutMs)
      } catch (err) {
        lastError = err
        continue
      }

      this.preferredPort = port

      let response: { result?: unknown; error?: { message?: string; code?: number } }
      try {
        // The addon answers with a single JSON object terminated by a newline.
        const firstLine = raw.split('\n').find((l) => l.trim().startsWith('{'))
        if (!firstLine) throw new Error('no JSON object in reply')
        response = JSON.parse(firstLine)
      } catch (err) {
        throw new PobBridgeError(
          'bad-response',
          `Path of Building replied on port ${port} with something that is not JSON-RPC: ${(err as Error).message}`,
        )
      }

      if (response.error) {
        throw new PobBridgeError(
          'command-failed',
          `Path of Building rejected "${method}": ${response.error.message ?? 'no message given'}`,
        )
      }
      return response.result as T
    }

    const detail = lastError instanceof Error ? ` (${lastError.message})` : ''
    throw new PobBridgeError('not-running', `${NOT_RUNNING}${detail}`)
  }

  /** Health check. Never throws — returns null when PoB is unreachable. */
  async ping(): Promise<PobPing | null> {
    try {
      return await this.call<PobPing>('ping')
    } catch {
      return null
    }
  }

  /** Load a Path of Building export code into the running instance. */
  async loadBuild(code: string): Promise<unknown> {
    return this.call('load_build_direct', { code })
  }

  async recalculate(): Promise<unknown> {
    return this.call('recalculate')
  }

  /** PoB's computed output. This is the authoritative Tier 2 number. */
  async getCalcs(): Promise<Record<string, unknown>> {
    return this.call('get_calcs')
  }

  async getFullDps(): Promise<Record<string, unknown>> {
    return this.call('get_full_dps')
  }

  /**
   * Allocate or deallocate a node.
   *
   * Allocation auto-paths: PoB walks the shortest route from the allocated tree
   * and takes every node on it. Read the tree afterwards to learn what that
   * actually cost.
   */
  async setPassiveNode(nodeId: number, allocate: boolean): Promise<unknown> {
    return this.call('set_passive_node', { node_id: nodeId, allocate })
  }

  async getPassiveTree(): Promise<PobTreeSnapshot> {
    const raw = await this.call<{
      nodes?: { id?: number; name?: string }[]
      totalPoints?: number
      class?: string
      ascendancy?: string
    }>('get_passive_tree')

    const names = new Map<number, string>()
    const nodeIds: number[] = []
    for (const node of raw.nodes ?? []) {
      if (typeof node?.id !== 'number') continue
      nodeIds.push(node.id)
      if (node.name) names.set(node.id, node.name)
    }

    return {
      nodeIds,
      totalPoints: raw.totalPoints ?? nodeIds.length,
      className: raw.class ?? null,
      ascendancy: raw.ascendancy ?? null,
      names,
    }
  }

  async resetTree(): Promise<unknown> {
    return this.call('reset_tree')
  }

  /** PoB's custom-modifier box, as one string with a modifier per line. */
  async getCustomMods(): Promise<string> {
    const raw = await this.call<{ mods?: unknown }>('get_custom_mods')
    return typeof raw?.mods === 'string' ? raw.mods : ''
  }

  /** Accepts lines or a ready-made string; the addon requires a string. */
  async setCustomMods(mods: string | string[]): Promise<unknown> {
    return this.call('set_custom_mods', { mods: Array.isArray(mods) ? mods.join('\n') : mods })
  }

  async getStatBreakdown(stat: string): Promise<unknown> {
    return this.call('get_stat_breakdown', { stat })
  }
}

/** One stat that moved. */
export interface StatDelta {
  stat: string
  before: number
  after: number
  delta: number
  /** Fractional change. Null when `before` is 0, since the ratio is undefined. */
  percent: number | null
}

export interface SimulationResult {
  /** What was changed, in plain terms. */
  change: string
  /** Stats that moved, largest relative change first. */
  changed: StatDelta[]
  /** Headline damage figure, when PoB reported one. */
  totalDps: StatDelta | null
  /** What the change cost, when it is measurable. Passive points, here. */
  cost: { kind: 'passive'; points: number; detail: string } | null
  /**
   * True only when PoB was verified to be back in its original state — not
   * merely when the undo command was sent.
   */
  reverted: boolean
  /** Anything that went wrong but did not stop the simulation. */
  warnings: string[]
}

/**
 * Stats always diffed, even if PoB reports them unchanged elsewhere in the
 * payload. Everything numeric that moved is included regardless; this list only
 * fixes the ordering anchor for the headline figures.
 */
const HEADLINE_STATS = new Set([
  'TotalDPS',
  'CombinedDPS',
  'AverageDamage',
  'Speed',
  'Life',
  'EnergyShield',
  'Armour',
  'Evasion',
  'FireResist',
  'ColdResist',
  'LightningResist',
  'ChaosResist',
])

function diffStats(before: Record<string, unknown>, after: Record<string, unknown>): StatDelta[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const out: StatDelta[] = []

  for (const stat of keys) {
    const a = before[stat]
    const b = after[stat]
    // get_calcs mixes numbers with strings (class, ascendancy). Only numbers
    // can be diffed, and a stat appearing on one side only is not a delta.
    if (typeof a !== 'number' || typeof b !== 'number') continue
    if (a === b) continue
    out.push({ stat, before: a, after: b, delta: b - a, percent: a !== 0 ? (b - a) / Math.abs(a) : null })
  }

  return out.sort((x, y) => {
    const rank = (d: StatDelta) => (HEADLINE_STATS.has(d.stat) ? 1 : 0)
    if (rank(y) !== rank(x)) return rank(y) - rank(x)
    return Math.abs(y.percent ?? 0) - Math.abs(x.percent ?? 0)
  })
}

function findDps(deltas: StatDelta[]): StatDelta | null {
  return deltas.find((d) => d.stat === 'TotalDPS') ?? deltas.find((d) => d.stat === 'CombinedDPS') ?? null
}

/**
 * Allocate a node, measure, then put the tree back exactly as it was.
 *
 * The revert matters: this drives the user's actual Path of Building window, so
 * leaving it modified would silently corrupt their build. Because PoB auto-paths
 * on allocation, the undo removes every node that appeared — and then re-reads
 * the tree to check. A revert that did not take is reported loudly rather than
 * assumed.
 */
export async function simulatePassiveNode(
  bridge: PobBridge,
  nodeId: number,
  nodeName?: string,
): Promise<SimulationResult> {
  const warnings: string[] = []

  const beforeTree = await bridge.getPassiveTree()
  const beforeIds = new Set(beforeTree.nodeIds)
  if (beforeIds.has(nodeId)) {
    throw new PobBridgeError(
      'command-failed',
      `Node ${nodeId} is already allocated in Path of Building, so allocating it would measure nothing. Deallocate it there first, or simulate a different node.`,
    )
  }

  const before = await bridge.getCalcs()
  await bridge.setPassiveNode(nodeId, true)
  await bridge.recalculate()
  const after = await bridge.getCalcs()
  const afterTree = await bridge.getPassiveTree()

  const added = afterTree.nodeIds.filter((id) => !beforeIds.has(id))
  const label = nodeName ?? afterTree.names.get(nodeId) ?? beforeTree.names.get(nodeId) ?? null
  const title = label ? `${label} (node ${nodeId})` : `node ${nodeId}`

  const pathNodes = added.filter((id) => id !== nodeId)
  const cost = {
    kind: 'passive' as const,
    points: added.length,
    detail:
      pathNodes.length > 0
        ? `${added.length} points — the node itself plus ${pathNodes.length} on the path to reach it (${pathNodes
            .map((id) => afterTree.names.get(id) ?? String(id))
            .join(', ')})`
        : `${added.length} point, already adjacent to the allocated tree`,
  }

  // Undo. The requested node goes first: PoB's DeallocNode also removes nodes
  // that depend on it, so leading with the leaf keeps the tree valid throughout.
  const undoOrder = [nodeId, ...pathNodes.slice().reverse()]
  let reverted = false
  try {
    for (const id of undoOrder) {
      await bridge.setPassiveNode(id, false)
    }
    await bridge.recalculate()

    const restored = await bridge.getPassiveTree()
    const restoredIds = new Set(restored.nodeIds)
    const stillAllocated = added.filter((id) => restoredIds.has(id))
    const lost = beforeTree.nodeIds.filter((id) => !restoredIds.has(id))

    if (stillAllocated.length === 0 && lost.length === 0) {
      reverted = true
    } else {
      warnings.push(
        'The tree did not return to its original state. ' +
          (stillAllocated.length ? `Still allocated: ${stillAllocated.join(', ')}. ` : '') +
          (lost.length ? `No longer allocated: ${lost.join(', ')}. ` : '') +
          'Fix this in your Path of Building window before trusting further readings.',
      )
    }
  } catch (err) {
    warnings.push(
      `Allocated ${title} but could not undo it: ${(err as Error).message}. Your Path of Building window still has these nodes allocated — remove them there before trusting further readings.`,
    )
  }

  const changed = diffStats(before, after)
  return {
    change: `Allocate ${title}`,
    changed,
    totalDps: findDps(changed),
    cost,
    reverted,
    warnings,
  }
}

/**
 * Measure what a set of custom modifiers is worth.
 *
 * Custom mods answer "what would +40 life on a ring do" without owning the ring.
 * Whatever was already in PoB's custom-modifier box is captured first and put
 * back afterwards — clearing it would silently discard the user's own entries.
 */
export async function simulateCustomMods(bridge: PobBridge, mods: string[]): Promise<SimulationResult> {
  const warnings: string[] = []
  if (mods.length === 0) {
    throw new PobBridgeError('command-failed', 'No modifiers given, so there is nothing to measure.')
  }

  let previous = ''
  try {
    previous = await bridge.getCustomMods()
  } catch (err) {
    warnings.push(
      `Could not read the existing custom modifiers first (${(err as Error).message}), so any you had set will be cleared rather than restored.`,
    )
  }

  const combined = previous ? `${previous}\n${mods.join('\n')}` : mods.join('\n')

  const before = await bridge.getCalcs()
  await bridge.setCustomMods(combined)
  await bridge.recalculate()
  const after = await bridge.getCalcs()

  let reverted = false
  try {
    await bridge.setCustomMods(previous)
    await bridge.recalculate()
    const restored = await bridge.getCustomMods()
    if (restored === previous) {
      reverted = true
    } else {
      warnings.push(
        "Path of Building's custom modifier box did not return to its previous contents. Check it before trusting further readings.",
      )
    }
  } catch (err) {
    warnings.push(
      `Applied the modifiers but could not restore the previous ones: ${(err as Error).message}. Your Path of Building window still has them set.`,
    )
  }

  const changed = diffStats(before, after)
  return {
    change: `Add ${mods.length} custom modifier${mods.length === 1 ? '' : 's'}: ${mods.join('; ')}`,
    changed,
    totalDps: findDps(changed),
    // Custom mods stand in for gear that does not exist yet, so there is no cost
    // to measure. Saying so beats inventing one.
    cost: null,
    reverted,
    warnings,
  }
}
