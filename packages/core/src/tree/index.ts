/**
 * Passive tree graph.
 *
 * The tree data is loaded by the caller (the web app fetches it as a static
 * asset) and passed in — the core stays free of I/O.
 *
 * CORRECTNESS RULE: the stored `connections` are DIRECTED — of 5,888 entries
 * only one is reciprocated. The shipped artifact therefore carries an
 * undirected, de-duplicated edge list, and everything here walks that.
 *
 * On "disconnected tree" warnings: V1 emitted them constantly. They were nearly
 * always missing ascendancy node ids in its local database rather than a real
 * problem — the game will not allow a broken tree. This module reports
 * unresolved ids explicitly instead, naming what is missing.
 */

import type { PassiveAllocation } from '../model/passives.js'

export type NodeKind = 0 | 1 | 2 | 3 | 4

export const NODE_KIND = {
  normal: 0,
  notable: 1,
  keystone: 2,
  jewel: 3,
  start: 4,
} as const satisfies Record<string, NodeKind>

/** A node as it appears in the shipped artifact. Keys are short by design. */
export interface TreeNodeRaw {
  x: number
  y: number
  /** Name. */
  n: string
  /** Kind. */
  k: NodeKind
  /** Group id. */
  g: number
  /** Stat lines. */
  s?: string[]
  /** Ascendancy class name, when this node belongs to an ascendancy wheel. */
  a?: string
  /** 1 when this is the ascendancy class node itself. */
  c?: 1
}

export interface PassiveTreeData {
  version: number
  treeName: string
  nodeCount: number
  edgeCount: number
  extent: Extent
  mainExtent: Extent
  classStarts: Record<string, string>
  ascendancies: string[]
  /** Flat undirected pairs: [a0, b0, a1, b1, ...]. */
  edges: number[]
  nodes: Record<string, TreeNodeRaw>
}

export interface Extent {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface TreeNode {
  id: number
  x: number
  y: number
  name: string
  kind: NodeKind
  groupId: number
  stats: string[]
  /** Null for main-tree nodes. */
  ascendancy: string | null
  isAscendancyClassNode: boolean
}

function toNode(id: number, raw: TreeNodeRaw): TreeNode {
  return {
    id,
    x: raw.x,
    y: raw.y,
    name: raw.n,
    kind: raw.k,
    groupId: raw.g,
    stats: raw.s ?? [],
    ascendancy: raw.a ?? null,
    isAscendancyClassNode: raw.c === 1,
  }
}

export class PassiveTree {
  private readonly nodes = new Map<number, TreeNode>()
  private readonly adjacency = new Map<number, number[]>()

  readonly extent: Extent
  readonly mainExtent: Extent
  readonly treeName: string
  readonly ascendancies: string[]
  readonly classStarts: Map<number, string>

  constructor(data: PassiveTreeData) {
    for (const [key, raw] of Object.entries(data.nodes ?? {})) {
      const id = Number(key)
      if (Number.isInteger(id)) this.nodes.set(id, toNode(id, raw))
    }

    const edges = data.edges ?? []
    for (let i = 0; i + 1 < edges.length; i += 2) {
      const a = edges[i]!
      const b = edges[i + 1]!
      let listA = this.adjacency.get(a)
      if (!listA) this.adjacency.set(a, (listA = []))
      listA.push(b)
      let listB = this.adjacency.get(b)
      if (!listB) this.adjacency.set(b, (listB = []))
      listB.push(a)
    }

    this.extent = data.extent
    this.mainExtent = data.mainExtent ?? data.extent
    this.treeName = data.treeName
    this.ascendancies = data.ascendancies ?? []
    this.classStarts = new Map(Object.entries(data.classStarts ?? {}).map(([k, v]) => [Number(k), v]))
  }

  get size(): number {
    return this.nodes.size
  }

  node(id: number): TreeNode | null {
    return this.nodes.get(id) ?? null
  }

  neighbours(id: number): number[] {
    return this.adjacency.get(id) ?? []
  }

  /** Every edge as an [a, b] pair. Undirected; each pair appears once. */
  *edgePairs(): Generator<[number, number]> {
    for (const [a, neighbours] of this.adjacency) {
      for (const b of neighbours) if (a < b) yield [a, b]
    }
  }

  allNodes(): IterableIterator<TreeNode> {
    return this.nodes.values()
  }
}

export interface ResolvedAllocation {
  /** Nodes resolved against the tree, for the live weapon set. */
  live: TreeNode[]
  main: TreeNode[]
  set1: TreeNode[]
  set2: TreeNode[]
  /** Allocated on the ascendancy wheels. */
  ascendancy: TreeNode[]
  /** Allocated on the main tree, excluding ascendancy. */
  mainTree: TreeNode[]
  notables: TreeNode[]
  keystones: TreeNode[]
  jewelSockets: TreeNode[]
  /**
   * Allocated ids with no entry in the tree data. NOT a broken build — the game
   * would not allow one. It means this data set is missing those nodes, and
   * that is what gets reported.
   */
  unresolvedIds: number[]
  /**
   * Connected groups within the live allocation, largest first.
   *
   * More than one is NORMAL and must never be reported as a broken build. On
   * the reference character the live allocation forms three groups: the main
   * tree (105), the Deadeye ascendancy wheel (10), and a small cluster (4) this
   * data set does not link to the rest. The game does not permit a genuinely
   * disconnected tree, so extra groups mean the data is missing links — which
   * is what gets said.
   */
  components: AllocationComponent[]
}

export interface AllocationComponent {
  kind: 'main-tree' | 'ascendancy' | 'detached'
  /** Ascendancy class name for `ascendancy` groups. */
  ascendancy: string | null
  nodes: TreeNode[]
}

function resolve(tree: PassiveTree, ids: number[]): { found: TreeNode[]; missing: number[] } {
  const found: TreeNode[] = []
  const missing: number[] = []
  for (const id of ids) {
    const node = tree.node(id)
    if (node) found.push(node)
    else missing.push(id)
  }
  return { found, missing }
}

/** Group allocated ids into connected clusters, largest first. */
function findComponents(tree: PassiveTree, ids: number[]): AllocationComponent[] {
  const remaining = new Set(ids.filter((id) => tree.node(id) !== null))
  const groups: TreeNode[][] = []

  while (remaining.size) {
    const start: number = remaining.values().next().value!
    remaining.delete(start)
    const group = [start]
    const stack = [start]
    while (stack.length) {
      const current = stack.pop()!
      for (const next of tree.neighbours(current)) {
        if (!remaining.has(next)) continue
        remaining.delete(next)
        group.push(next)
        stack.push(next)
      }
    }
    groups.push(group.map((id) => tree.node(id)!))
  }

  groups.sort((a, b) => b.length - a.length)

  return groups.map((nodes, index) => {
    const ascendancy = nodes.find((n) => n.ascendancy !== null)?.ascendancy ?? null
    // The largest non-ascendancy group is the main tree; anything else the data
    // failed to link is `detached`, not broken.
    const kind: AllocationComponent['kind'] = ascendancy ? 'ascendancy' : index === 0 ? 'main-tree' : 'detached'
    return { kind, ascendancy, nodes }
  })
}

/**
 * Resolve a character's allocation against the tree.
 *
 * Respects the weapon-set rule: `live` is main plus the ACTIVE set only, never
 * all three summed.
 */
export function resolveAllocation(tree: PassiveTree, allocation: PassiveAllocation): ResolvedAllocation {
  const live = resolve(tree, allocation.live)
  const main = resolve(tree, allocation.main)
  const set1 = resolve(tree, allocation.set1)
  const set2 = resolve(tree, allocation.set2)

  const ascendancy = live.found.filter((n) => n.ascendancy !== null)
  const mainTree = live.found.filter((n) => n.ascendancy === null)

  return {
    live: live.found,
    main: main.found,
    set1: set1.found,
    set2: set2.found,
    ascendancy,
    mainTree,
    notables: live.found.filter((n) => n.kind === NODE_KIND.notable),
    keystones: live.found.filter((n) => n.kind === NODE_KIND.keystone),
    jewelSockets: live.found.filter((n) => n.kind === NODE_KIND.jewel),
    unresolvedIds: live.missing,
    components: findComponents(tree, allocation.live),
  }
}

/**
 * Shortest path from any allocated node to `target`, walking unallocated nodes.
 *
 * Returns the nodes that would need allocating, target last — so `length` is
 * the passive-point cost. Returns null when the target is unreachable or
 * already allocated (the caller must distinguish those, so `cost` is 0 only in
 * the already-allocated case).
 */
export function pathToNode(
  tree: PassiveTree,
  allocatedIds: Iterable<number>,
  target: number,
): { path: TreeNode[]; cost: number } | null {
  const allocated = new Set(allocatedIds)
  if (!tree.node(target)) return null
  if (allocated.has(target)) return { path: [], cost: 0 }

  // Breadth-first from the whole allocated frontier at once, so the result is
  // the cheapest route from anywhere on the current tree.
  const previous = new Map<number, number>()
  const visited = new Set<number>(allocated)
  let frontier = [...allocated]
  if (!frontier.length) return null

  while (frontier.length) {
    const next: number[] = []
    for (const current of frontier) {
      for (const neighbour of tree.neighbours(current)) {
        if (visited.has(neighbour)) continue
        visited.add(neighbour)
        previous.set(neighbour, current)
        if (neighbour === target) {
          const path: TreeNode[] = []
          let step: number | undefined = target
          while (step !== undefined && !allocated.has(step)) {
            const node = tree.node(step)
            if (node) path.unshift(node)
            step = previous.get(step)
          }
          return { path, cost: path.length }
        }
        next.push(neighbour)
      }
    }
    frontier = next
  }
  return null
}
