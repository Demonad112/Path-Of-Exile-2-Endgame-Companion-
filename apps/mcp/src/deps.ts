/**
 * Single import surface for everything the tools use.
 *
 * Keeps tools.ts free of import noise, and makes the boundary explicit: if
 * something is not re-exported here, the tool layer is not reaching into it.
 */

export {
  ATTRIBUTABLE_STATS,
  NODE_KIND,
  analyzeContent,
  analyzeItem,
  attributionForSlot,
  attributionForStat,
  auditCharacter,
  PobBridge,
  PobBridgeError,
  decodePobExport,
  describePobConfig,
  editPobTree,
  findResistanceSwaps,
  findTierUpgrades,
  itemsCarrying,
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
  type AttributableStat,
} from '@poe2/core'

import { findMechanic, type Mechanic } from './mechanics.js'

/** Empty query lists everything rather than erroring. */
export function findMechanicSafe(query: string): Mechanic[] {
  return findMechanic(query)
}
