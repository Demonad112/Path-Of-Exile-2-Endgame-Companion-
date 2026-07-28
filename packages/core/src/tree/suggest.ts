/**
 * Suggesting passive nodes for a stat the build is short on.
 *
 * This is what feeds the tree's recommended-path overlay. It is deliberately
 * mechanical: find unallocated nodes whose own stat text mentions the stat,
 * compute the real path cost from the allocated tree, and rank by value per
 * point. Node stats and path costs are both measured — nothing here estimates
 * how much a node is "worth" beyond the number printed on it.
 *
 * What it does NOT do is claim a node is the right choice. Two nodes granting
 * the same resistance may sit in completely different parts of the tree, and
 * which is correct depends on where the build is heading. The ranking is by
 * cost, and the caller is told the cost.
 */

import type { PassiveTree, TreeNode } from './index.js'
import { NODE_KIND, pathToNode } from './index.js'

export interface NodeSuggestion {
  node: TreeNode
  /** Passive points needed to reach it, including the node itself. */
  cost: number
  /** Nodes that would be allocated on the way, target last. */
  path: TreeNode[]
  /** Numeric value the node grants for the searched stat, when it prints one. */
  value: number | null
  /** value / cost, for ranking. Null when the node prints no number. */
  valuePerPoint: number | null
  /** The stat line that matched. */
  matchedStat: string
}

/** Patterns that identify a stat in node text. Keys are the stat keys used elsewhere. */
const STAT_PATTERNS: Readonly<Record<string, RegExp>> = Object.freeze({
  fireResistance: /fire resistance/i,
  coldResistance: /cold resistance/i,
  lightningResistance: /lightning resistance/i,
  chaosResistance: /chaos resistance/i,
  life: /maximum life/i,
  energyShield: /maximum energy shield/i,
  armour: /\barmour\b/i,
  evasionRating: /evasion rating/i,
  ward: /\bward\b/i,
  spirit: /\bspirit\b/i,
})

export function statPattern(stat: string): RegExp | null {
  return STAT_PATTERNS[stat] ?? null
}

export function supportedStats(): string[] {
  return Object.keys(STAT_PATTERNS)
}

function firstNumber(text: string): number | null {
  const match = /([+-]?\d+(?:\.\d+)?)/.exec(text)
  return match ? Number(match[1]) : null
}

/**
 * Stat lines that grant the bonus to something OTHER than the character.
 *
 * Without this, searching for chaos resistance surfaces "Companions have +30%
 * to Chaos Resistance" as the top result — a real node, granting a real
 * resistance, to an entity that is not you. Suggesting it as a fix for the
 * character's own weakest defence is precisely the kind of confident wrong
 * answer this project exists to avoid.
 */
const OTHER_ENTITY = /\b(companions?|minions?|totems?|allies|ally|party members?|retaliation)\b/i

/** True when the line grants its bonus to the character rather than something else. */
export function affectsCharacter(stat: string): boolean {
  return !OTHER_ENTITY.test(stat)
}

export interface SuggestOptions {
  /** Do not suggest anything costing more than this. */
  maxCost?: number
  limit?: number
  /** Restrict to notables and keystones. */
  notablesOnly?: boolean
  /** Include other classes' ascendancy wheels. Off by default — unreachable. */
  includeAscendancy?: boolean
}

/**
 * Find the cheapest unallocated nodes granting a stat.
 *
 * Returns an empty list rather than a fallback when the stat is not one this
 * module can recognise — see `supportedStats()`.
 */
export function suggestNodesForStat(
  tree: PassiveTree,
  allocated: Iterable<number>,
  stat: string,
  options: SuggestOptions = {},
): NodeSuggestion[] {
  const pattern = statPattern(stat)
  if (!pattern) return []

  const allocatedSet = new Set(allocated)
  const maxCost = options.maxCost ?? 4
  const limit = options.limit ?? 5

  const candidates: NodeSuggestion[] = []

  for (const node of tree.allNodes()) {
    if (allocatedSet.has(node.id)) continue
    if (!options.includeAscendancy && node.ascendancy) continue
    if (options.notablesOnly && node.kind !== NODE_KIND.notable && node.kind !== NODE_KIND.keystone) continue

    // Must grant the stat to the character, not to companions or minions.
    const matched = node.stats.find((s) => pattern.test(s) && affectsCharacter(s))
    if (!matched) continue

    const route = pathToNode(tree, allocatedSet, node.id)
    if (!route || route.cost === 0 || route.cost > maxCost) continue

    const value = firstNumber(matched)
    candidates.push({
      node,
      cost: route.cost,
      path: route.path,
      value,
      valuePerPoint: value !== null && route.cost > 0 ? value / route.cost : null,
      matchedStat: matched,
    })
  }

  return candidates
    .sort((a, b) => {
      // Best value per point first; nodes printing no number rank last.
      if (a.valuePerPoint !== null && b.valuePerPoint !== null) return b.valuePerPoint - a.valuePerPoint
      if (a.valuePerPoint !== null) return -1
      if (b.valuePerPoint !== null) return 1
      return a.cost - b.cost
    })
    .slice(0, limit)
}
