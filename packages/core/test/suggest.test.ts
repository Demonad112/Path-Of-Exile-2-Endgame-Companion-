/**
 * Node suggestions — what feeds the tree's recommended-path overlay.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { PassiveTree, type PassiveTreeData } from '../src/tree/index.js'
import { affectsCharacter, suggestNodesForStat, supportedStats } from '../src/tree/suggest.js'
import { normalizePassives } from '../src/model/passives.js'
import { unwrapCharModel } from '../src/analyze.js'

const tree = new PassiveTree(
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../data/generated/passive-tree.json', import.meta.url)), 'utf8'),
  ) as PassiveTreeData,
)
const model = unwrapCharModel(
  JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/athrynas-v43.json', import.meta.url)), 'utf8')),
)
const allocation = normalizePassives(model)

describe('suggesting nodes for a stat', () => {
  it('finds reachable chaos resistance nodes for the character’s weakest defence', () => {
    const suggestions = suggestNodesForStat(tree, allocation.live, 'chaosResistance', { maxCost: 4 })
    expect(suggestions.length).toBeGreaterThan(0)

    for (const s of suggestions) {
      // Every suggestion must be genuinely unallocated and genuinely reachable.
      expect(allocation.live).not.toContain(s.node.id)
      expect(s.cost).toBeGreaterThan(0)
      expect(s.cost).toBeLessThanOrEqual(4)
      expect(s.path).toHaveLength(s.cost)
      expect(s.path.at(-1)!.id).toBe(s.node.id)
      // The claim must be backed by the node's own printed text.
      expect(s.matchedStat.toLowerCase()).toContain('chaos resistance')
    }
  })

  it('ranks by value per point', () => {
    const suggestions = suggestNodesForStat(tree, allocation.live, 'coldResistance', { maxCost: 5 })
    const rated = suggestions.filter((s) => s.valuePerPoint !== null).map((s) => s.valuePerPoint!)
    expect([...rated].sort((a, b) => b - a)).toEqual(rated)
  })

  it('respects the cost ceiling', () => {
    const cheap = suggestNodesForStat(tree, allocation.live, 'life', { maxCost: 1 })
    for (const s of cheap) expect(s.cost).toBe(1)
  })

  it('can restrict to notables', () => {
    const notables = suggestNodesForStat(tree, allocation.live, 'life', { maxCost: 6, notablesOnly: true })
    for (const s of notables) expect([1, 2]).toContain(s.node.kind)
  })

  it('excludes other classes’ ascendancy wheels by default', () => {
    const suggestions = suggestNodesForStat(tree, allocation.live, 'life', { maxCost: 6, limit: 50 })
    for (const s of suggestions) expect(s.node.ascendancy).toBeNull()
  })
})

describe('refusing to guess', () => {
  it('returns nothing for a stat it cannot recognise', () => {
    expect(suggestNodesForStat(tree, allocation.live, 'notAStat')).toEqual([])
    expect(supportedStats()).not.toContain('notAStat')
  })

  it('names the stats it does support', () => {
    expect(supportedStats()).toEqual(
      expect.arrayContaining(['chaosResistance', 'coldResistance', 'life', 'energyShield']),
    )
  })
})

describe('not suggesting bonuses that go to something else', () => {
  it('excludes nodes granting the stat to companions or minions', () => {
    // "Companions have +30% to Chaos Resistance" is a real node granting a real
    // resistance — to an entity that is not the character. Offering it as a fix
    // for the character's own weakest defence would be confidently wrong.
    const suggestions = suggestNodesForStat(tree, allocation.live, 'chaosResistance', { maxCost: 6, limit: 50 })
    for (const s of suggestions) {
      expect(s.matchedStat).not.toMatch(/companion|minion|totem|all(y|ies)/i)
    }
  })

  it('classifies stat lines by who they affect', () => {
    expect(affectsCharacter('+12% to Chaos Resistance')).toBe(true)
    expect(affectsCharacter('Companions have +30% to Chaos Resistance')).toBe(false)
    expect(affectsCharacter('Minions have +15% to Cold Resistance')).toBe(false)
  })
})
