/**
 * Single import surface for everything the tools use.
 *
 * Keeps tools.ts free of import noise, and makes the boundary explicit: if
 * something is not re-exported here, the tool layer is not reaching into it.
 */

export {
  NODE_KIND,
  analyzeContent,
  analyzeItem,
  auditCharacter,
  PobBridge,
  PobBridgeError,
  decodePobExport,
  editPobTree,
  findResistanceSwaps,
  findTierUpgrades,
  normalizeItems,
  parseProfileUrl,
  pathToNode,
  readPlayerStats,
  rankNodesByMeasuredGain,
  resolveAllocation,
  simulateCustomMods,
  simulatePassiveNode,
  statSources,
  suggestNodesForStat,
  summarizeSwaps,
  supportedStats,
  validateByName,
  validateSetup,
} from '@poe2/core'

import { findMechanic, type Mechanic } from './mechanics.js'

/** Empty query lists everything rather than erroring. */
export function findMechanicSafe(query: string): Mechanic[] {
  return findMechanic(query)
}
