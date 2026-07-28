/**
 * Tree graph tests, run against the real shipped artifact and the real
 * character allocation.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { PassiveTree, NODE_KIND, pathToNode, resolveAllocation, type PassiveTreeData } from '../src/tree/index.js'
import { normalizePassives } from '../src/model/passives.js'
import { unwrapCharModel } from '../src/analyze.js'

const treeData = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../data/generated/passive-tree.json', import.meta.url)), 'utf8'),
) as PassiveTreeData
const tree = new PassiveTree(treeData)

const model = unwrapCharModel(
  JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/athrynas-v43.json', import.meta.url)), 'utf8')),
)
const allocation = normalizePassives(model)
const resolved = resolveAllocation(tree, allocation)

describe('tree data', () => {
  it('loads every node and edge', () => {
    expect(tree.size).toBe(4975)
    expect([...tree.edgePairs()]).toHaveLength(5887)
  })

  it('treats connections as undirected', () => {
    // The source stores them directed: 5,888 entries, of which exactly one is
    // reciprocated and one is a self-loop (dropped), leaving 5,887 real edges.
    // After loading, every edge must traverse both ways.
    for (const [a, b] of tree.edgePairs()) {
      expect(tree.neighbours(a)).toContain(b)
      expect(tree.neighbours(b)).toContain(a)
    }
  })

  it('classifies node kinds', () => {
    const all = [...tree.allNodes()]
    expect(all.filter((n) => n.kind === NODE_KIND.notable)).toHaveLength(968)
    expect(all.filter((n) => n.kind === NODE_KIND.keystone)).toHaveLength(30)
    expect(all.filter((n) => n.kind === NODE_KIND.jewel)).toHaveLength(12)
    expect(all.filter((n) => n.kind === NODE_KIND.start)).toHaveLength(6)
  })

  it('tags ascendancy nodes by icon, covering all 19 classes', () => {
    // `is_ascendancy` marks only the 17 class nodes, and the graph is a single
    // connected component, so neither flag nor structure identifies these.
    const ascendancyNodes = [...tree.allNodes()].filter((n) => n.ascendancy !== null)
    expect(ascendancyNodes).toHaveLength(353)
    expect(tree.ascendancies).toHaveLength(19)
    expect(tree.ascendancies).toContain('Deadeye')
    expect(tree.node(30)).toMatchObject({ name: 'Gathering Winds', ascendancy: 'Deadeye', kind: NODE_KIND.notable })
  })

  it('excludes ascendancy wheels from the main extent used for framing', () => {
    expect(tree.mainExtent.maxX).toBeLessThan(tree.extent.maxX)
    expect(tree.mainExtent.maxY).toBeLessThan(tree.extent.maxY)
  })
})

describe('resolving the real allocation', () => {
  it('resolves every allocated id — nothing is missing from the data set', () => {
    expect(resolved.unresolvedIds).toEqual([])
    expect(resolved.live).toHaveLength(119) // 103 main + 16 from the active set
  })

  it('separates ascendancy from main-tree allocation', () => {
    expect(resolved.ascendancy.map((n) => n.ascendancy)).toEqual(Array(9).fill('Deadeye'))
    expect(resolved.mainTree).toHaveLength(resolved.live.length - resolved.ascendancy.length)
  })

  it('never sums the two weapon sets', () => {
    expect(resolved.main).toHaveLength(103)
    expect(resolved.set1).toHaveLength(16)
    expect(resolved.set2).toHaveLength(16)
    // Set 1 is live (useSecondWeaponSet is false), so set 2 is excluded.
    expect(resolved.live).toHaveLength(103 + 16)
  })

  it('finds the allocated notables and keystones', () => {
    expect(resolved.notables.length).toBeGreaterThan(0)
    // poe.ninja reports 0 keystones for this character.
    expect(resolved.keystones).toHaveLength(0)
    expect(model.keystones).toEqual([])
  })

  it('explains the allocation groups instead of warning about a broken tree', () => {
    // V1 emitted "disconnected tree" warnings constantly. Multiple groups are
    // normal: the ascendancy wheel is reached through the class node, and this
    // data set does not carry every link. The game forbids a genuinely broken
    // tree, so the groups are described rather than flagged.
    expect(resolved.components).toHaveLength(3)

    const [mainTree, ascendancy, detached] = resolved.components
    expect(mainTree).toMatchObject({ kind: 'main-tree', ascendancy: null })
    expect(mainTree!.nodes).toHaveLength(105)

    expect(ascendancy).toMatchObject({ kind: 'ascendancy', ascendancy: 'Deadeye' })
    expect(ascendancy!.nodes).toHaveLength(10)

    expect(detached).toMatchObject({ kind: 'detached' })
    expect(detached!.nodes).toHaveLength(4)

    // Every allocated node belongs to exactly one group.
    const total = resolved.components.reduce((sum, c) => sum + c.nodes.length, 0)
    expect(total).toBe(resolved.live.length)
  })
})

describe('path finding', () => {
  it('returns zero cost for an already-allocated node', () => {
    const target = resolved.live[0]!.id
    expect(pathToNode(tree, allocation.live, target)).toEqual({ path: [], cost: 0 })
  })

  it('finds the cheapest route to an unallocated notable', () => {
    const allocated = new Set(allocation.live)
    const target = [...tree.allNodes()].find(
      (n) => n.kind === NODE_KIND.notable && !allocated.has(n.id) && n.ascendancy === null,
    )!

    const result = pathToNode(tree, allocation.live, target.id)
    expect(result).not.toBeNull()
    expect(result!.cost).toBe(result!.path.length)
    // The target is the destination, so it ends the path.
    expect(result!.path.at(-1)!.id).toBe(target.id)
    // Nothing already allocated should appear in the cost.
    expect(result!.path.every((n) => !allocated.has(n.id))).toBe(true)
    // The first step must touch the existing tree.
    const firstStep = result!.path[0]!
    expect(tree.neighbours(firstStep.id).some((n) => allocated.has(n))).toBe(true)
  })

  it('returns null for an unknown node rather than an empty path', () => {
    expect(pathToNode(tree, allocation.live, 99_999_999)).toBeNull()
  })
})
