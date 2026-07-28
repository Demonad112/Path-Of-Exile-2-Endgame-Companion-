/**
 * Checks over parts of the payload nothing else reads.
 *
 * Each of these exists because the data was already there and no panel looked at
 * it. None of them estimates: a socket is empty or it is not, a gem's quality is
 * a number the payload states, an attribute requirement is printed on the item.
 *
 * ## Where each figure comes from
 *
 * Jewels, sockets and gem quality come from the poe.ninja payload directly.
 * Attribute headroom and spirit reservation come from the Path of Building
 * export embedded in that same payload — poe.ninja reports total spirit but not
 * how much is reserved, and reports attributes but not what the gear requires.
 * Where the export is absent, those two report `null` rather than a guess.
 */

import type { CharModel, NinjaItem } from '../model/types.js'
import { normalizeItems, type EquippedItem } from '../model/slots.js'
import { analyzeItem, type ItemAnalysis } from './analyze.js'
import type { ModTiers } from './tiers.js'

// ---------------------------------------------------------------------------
// Jewels
// ---------------------------------------------------------------------------

/**
 * Socketed jewels, tiered against their own base.
 *
 * Jewel affixes live in RePoE's `misc` domain with spawn tags like `dexjewel`,
 * matching the base's tags (an Emerald carries `dexjewel`). They were absent
 * from the affix artifact entirely until that domain was included, which is why
 * three jewels carrying twelve real modifiers were invisible.
 */
export function analyzeJewels(model: CharModel, tiers: ModTiers): ItemAnalysis[] {
  const jewels = (model as { jewels?: NinjaItem[] }).jewels
  if (!Array.isArray(jewels)) return []

  return jewels.map((raw, index) => {
    const data = raw.itemData
    const item: EquippedItem = {
      // Jewels carry itemSlot 12 for all of them, so the index disambiguates.
      slotId: 1200 + index,
      slotLabel: `Jewel ${index + 1}`,
      active: true,
      name: data?.name || data?.typeLine || `Jewel ${index + 1}`,
      baseType: data?.baseType || data?.typeLine || '',
      itemLevel: data?.ilvl ?? null,
      rarity: data?.frameType === 3 ? 'Unique' : data?.frameType === 2 ? 'Rare' : 'Magic',
      corrupted: Boolean(data?.corrupted),
      mods: [...(data?.explicitMods ?? []), ...(data?.implicitMods ?? [])],
      raw,
    }
    // Defence is not passed: a jewel granting resistance is not "wasted" in the
    // way a gear suffix is, because a jewel has no competing affix slot to trade
    // it for. Overcap waste is a gear-swap concept.
    return analyzeItem(item, tiers, null)
  })
}

// ---------------------------------------------------------------------------
// Empty rune sockets
// ---------------------------------------------------------------------------

export interface SocketReport {
  slotId: number
  slotLabel: string
  itemName: string
  sockets: number
  filled: number
  empty: number
}

/**
 * Sockets with nothing in them.
 *
 * An empty socket is free stats not taken — one of the few things in this whole
 * analysis that is unambiguously an improvement regardless of build direction.
 */
export function findEmptySockets(items: EquippedItem[]): SocketReport[] {
  const out: SocketReport[] = []

  for (const item of items) {
    if (!item.active) continue
    const data = item.raw.itemData
    const sockets = Array.isArray(data?.sockets) ? data.sockets.length : 0
    if (sockets === 0) continue
    const filled = Array.isArray(data?.socketedItems) ? data.socketedItems.length : 0
    const empty = sockets - filled
    if (empty <= 0) continue

    out.push({
      slotId: item.slotId,
      slotLabel: item.slotLabel,
      itemName: item.name,
      sockets,
      filled,
      empty,
    })
  }

  return out.sort((a, b) => b.empty - a.empty)
}

// ---------------------------------------------------------------------------
// Gem quality
// ---------------------------------------------------------------------------

export interface GemQualityReport {
  skill: string
  gem: string
  level: number
  quality: number
  /** The best quality seen on another copy of the same gem, when there is one. */
  bestElsewhere: number | null
}

/** Quality caps at 20% in Path of Exile 2. */
export const MAX_GEM_QUALITY = 20

/**
 * Active skill gems below maximum quality.
 *
 * Only gems with a level are considered. Support gems in this payload report
 * level 0 and quality 0 — that is how they are represented, not a finding, and
 * treating them as unqualited would flag every support on every character.
 */
export function auditGemQuality(model: CharModel): GemQualityReport[] {
  const out: GemQualityReport[] = []
  const bestByName = new Map<string, number>()

  const skills = Array.isArray(model.skills) ? model.skills : []
  for (const setup of skills) {
    for (const gem of (setup as { allGems?: { name?: string; level?: number; quality?: number }[] }).allGems ?? []) {
      if (!gem?.name || !(gem.level && gem.level > 0)) continue
      bestByName.set(gem.name, Math.max(bestByName.get(gem.name) ?? 0, gem.quality ?? 0))
    }
  }

  for (const setup of skills) {
    const gems = (setup as { allGems?: { name?: string; level?: number; quality?: number }[] }).allGems ?? []
    const block = Array.isArray((setup as { dps?: { name?: string }[] }).dps)
      ? (setup as { dps: { name?: string }[] }).dps[0]
      : undefined
    // Triggered setups — a Mark, a Mirage Archer — carry no dps block, so the
    // first levelled gem names them. Falling back to "unknown skill" made five
    // of eleven setups unidentifiable in the output.
    const skillName = block?.name ?? gems.find((g) => g?.name && (g.level ?? 0) > 0)?.name ?? 'unnamed setup'

    for (const gem of gems) {
      if (!gem?.name || !(gem.level && gem.level > 0)) continue
      const quality = gem.quality ?? 0
      if (quality >= MAX_GEM_QUALITY) continue

      const best = bestByName.get(gem.name) ?? 0
      out.push({
        skill: skillName,
        gem: gem.name,
        level: gem.level,
        quality,
        // Another copy at higher quality is the strongest signal: it proves the
        // gem CAN be qualited and that this copy was simply not.
        bestElsewhere: best > quality ? best : null,
      })
    }
  }

  return out.sort((a, b) => (b.bestElsewhere ?? 0) - (a.bestElsewhere ?? 0) || a.quality - b.quality)
}

// ---------------------------------------------------------------------------
// Attribute headroom
// ---------------------------------------------------------------------------

export interface AttributeHeadroom {
  attribute: 'strength' | 'dexterity' | 'intelligence'
  have: number
  required: number
  /** Points above the requirement. Negative means something is unequippable. */
  headroom: number
  /** True when losing a single modest source would break a requirement. */
  tight: boolean
}

/** Below this many points spare, one lost source can unequip an item. */
export const TIGHT_ATTRIBUTE_MARGIN = 10

/**
 * How close the character is to failing an attribute requirement.
 *
 * Requires the Path of Building export, which carries both the totals and the
 * aggregate requirement (`Str`/`ReqStr`). poe.ninja reports attributes but not
 * what the gear demands, so without the export this returns an empty list rather
 * than comparing against a number it does not have.
 *
 * Deliberately not reported: "you have too much dexterity". Excess attributes
 * often do real work — dexterity grants accuracy and evasion — so calling them
 * waste would be a judgement about build direction, not a measurement.
 */
export function auditAttributes(pobStats: Record<string, number> | null): AttributeHeadroom[] {
  if (!pobStats) return []

  const pairs: [AttributeHeadroom['attribute'], string, string][] = [
    ['strength', 'Str', 'ReqStr'],
    ['dexterity', 'Dex', 'ReqDex'],
    ['intelligence', 'Int', 'ReqInt'],
  ]

  const out: AttributeHeadroom[] = []
  for (const [attribute, haveKey, reqKey] of pairs) {
    const have = pobStats[haveKey]
    const required = pobStats[reqKey]
    if (typeof have !== 'number' || typeof required !== 'number') continue
    const headroom = have - required
    out.push({ attribute, have, required, headroom, tight: headroom < TIGHT_ATTRIBUTE_MARGIN })
  }

  return out.sort((a, b) => a.headroom - b.headroom)
}

// ---------------------------------------------------------------------------
// Spirit reservation
// ---------------------------------------------------------------------------

export interface SpiritReport {
  total: number
  reserved: number
  unreserved: number
  unreservedPercent: number
}

/**
 * Spirit not being used.
 *
 * Spirit reserves persistent buffs; anything unreserved is capacity sitting
 * idle. Like attribute headroom this comes from the Path of Building export —
 * poe.ninja reports the total but never the reserved portion.
 *
 * Whether idle spirit is a *problem* depends on whether a worthwhile buff exists
 * to spend it on, which is not judged here. The number is reported; the reader
 * decides.
 */
export function auditSpirit(pobStats: Record<string, number> | null): SpiritReport | null {
  if (!pobStats) return null
  const total = pobStats.Spirit
  const unreserved = pobStats.SpiritUnreserved
  if (typeof total !== 'number' || typeof unreserved !== 'number' || total <= 0) return null

  return {
    total,
    reserved: total - unreserved,
    unreserved,
    unreservedPercent: Number(((unreserved / total) * 100).toFixed(1)),
  }
}

// ---------------------------------------------------------------------------

export interface AuditReport {
  jewels: ItemAnalysis[]
  emptySockets: SocketReport[]
  gemQuality: GemQualityReport[]
  attributes: AttributeHeadroom[]
  spirit: SpiritReport | null
  /** What could not be checked, and why. */
  unavailable: string[]
}

/** Everything above, in one pass. */
export function auditCharacter(
  model: CharModel,
  tiers: ModTiers | null,
  pobStats: Record<string, number> | null,
): AuditReport {
  const unavailable: string[] = []
  if (!tiers) unavailable.push('Jewel modifier tiers need the affix data, which is not loaded.')
  if (!pobStats) {
    unavailable.push(
      'Attribute headroom and spirit reservation need the Path of Building export, which this character has none of. ' +
        'poe.ninja reports attributes and total spirit but neither what the gear requires nor what is reserved.',
    )
  }

  return {
    jewels: tiers ? analyzeJewels(model, tiers) : [],
    emptySockets: findEmptySockets(normalizeItems(model)),
    gemQuality: auditGemQuality(model),
    attributes: auditAttributes(pobStats),
    spirit: auditSpirit(pobStats),
    unavailable,
  }
}
