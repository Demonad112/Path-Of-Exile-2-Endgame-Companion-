/**
 * Gear analysis: what is on each item, how good it is, and what to change.
 *
 * ## The key discovery this rests on
 *
 * poe.ninja ships the MOD ID on every item — `itemData.mods.explicit[].id` is
 * `LocalIncreasedPhysicalDamagePercent7`, not a string to be pattern-matched.
 * It ships the rolled values alongside it. So none of this guesses at what a
 * mod line means: the id joins straight to the affix ladder, and the rolled
 * value sits inside a known range.
 *
 * Mod lines with no id — implicits, runes, corrupted mods — are reported as
 * text with `tier: null`. Unknown is stated, never inferred.
 *
 * ## What "worth having" means here
 *
 * A mod is only ever called wasted when the waste is MEASURABLE. Resistance
 * above the cap is the clean case: the character sheet says fire is 24% over
 * cap, so at least 24 points of the fire resistance on the gear are doing
 * nothing, and the mod granting them is provably improvable. That is a fact
 * about the build, not an opinion about the mod.
 *
 * Everything else — "is spell damage worth having on an attack build" — is a
 * judgement about where a build is heading, and is deliberately NOT made. The
 * project's rule holds: a confident wrong answer is worse than no answer.
 */

import type { DefenseSummary } from '../defense/index.js'
import type { NinjaItemData } from '../model/types.js'
import type { EquippedItem } from '../model/slots.js'
import type { AffixKind, LadderEntry, ModTiers } from './tiers.js'

/** Resistance stat ids, as they appear in the mod data. */
export const RESIST_STAT: Readonly<Record<string, string>> = Object.freeze({
  fire: 'base_fire_damage_resistance_%',
  cold: 'base_cold_damage_resistance_%',
  lightning: 'base_lightning_damage_resistance_%',
  chaos: 'base_chaos_damage_resistance_%',
})

const ALL_ELEMENTAL_RESIST = 'base_resist_all_elements_%'

export interface RolledStat {
  id: string
  value: number
  /** The tier's range. Null when the mod is unknown to the data. */
  min: number | null
  max: number | null
  /**
   * Where the roll sits in its range, 0-1. Null when unknown, or when the
   * range is a single value and there is nothing to be better or worse than.
   */
  quality: number | null
}

export interface UpgradeOption {
  /** The better tier. */
  tier: number
  ilvl: number
  affix: string | null
  text: string | null
  /**
   * True when the equipped item's own level allows this tier. False means a new
   * base is needed — which is a different, more expensive action.
   */
  reachableOnThisItem: boolean
  /**
   * Size of the improvement on the mod's first stat, best case. Always
   * positive — see `lowerIsBetter` for which direction that is.
   */
  gain: number | null
  /** True on ladders that improve downward, like reduced attribute requirements. */
  lowerIsBetter: boolean
}

export interface ItemModAnalysis {
  /** Mod id, when poe.ninja supplied one. */
  id: string | null
  /** Where this line came from. */
  source: 'explicit' | 'implicit' | 'crafted' | 'desecrated' | 'rune' | 'enchant' | 'other'
  kind: AffixKind | null
  affix: string | null
  text: string
  /** 1 is best. Null when the mod is not in the craftable ladder data. */
  tier: number | null
  /** Ladder length ON THIS ITEM CLASS. */
  tiers: number | null
  ilvlRequired: number | null
  rolled: RolledStat[]
  /** Better tiers, best first. Empty when already T1. */
  upgrades: UpgradeOption[]
  /**
   * Points of this mod that are provably doing nothing, with the reason.
   * Null when nothing measurable is wasted.
   */
  waste: { amount: number; stat: string; reason: string } | null
  /** Why no tier could be resolved. Null when it was. */
  unresolved: string | null
}

export interface ItemAnalysis {
  slotId: number
  slotLabel: string
  name: string
  baseType: string
  itemClass: string | null
  itemLevel: number | null
  rarity: string
  corrupted: boolean
  active: boolean
  mods: ItemModAnalysis[]
  /** Affix slots in use, from the mods that are real prefixes/suffixes. */
  affixCounts: { prefix: number; suffix: number }
  /**
   * Highest tier reachable on this base at this item level, versus what is on
   * it. Null when the item has no tiered mods to compare.
   */
  tierProfile: { best: number; worst: number; mean: number } | null
  warnings: string[]
}

/** A mod together with the item it sits on, so a list of them is actionable. */
export type LocatedMod = ItemModAnalysis & {
  slotId: number
  slotLabel: string
  itemName: string
}

/** A concrete "change this to that" on one item. */
export interface GearSwap {
  slotId: number
  slotLabel: string
  itemName: string
  /** The mod to remove. */
  replace: { id: string | null; text: string; tier: number | null; reason: string }
  /** What to put there instead, best reachable first. */
  candidates: {
    id: string
    tier: number
    ilvl: number
    affix: string | null
    text: string | null
    statId: string
    min: number
    max: number
    reachableOnThisItem: boolean
    /** Points of the shortfall this would close. */
    closesShortfall: number
  }[]
  /** What the swap costs, stated plainly. */
  cost: string
}

// ---------------------------------------------------------------------------

/**
 * Strip Path of Exile display markup: "[EnergyShield|Energy Shield]" becomes
 * "Energy Shield", "[Gain]" becomes "Gain".
 *
 * poe.ninja passes this through verbatim, so rune and implicit lines arrive
 * looking like "[ShamanOnlyMods|Bonded]: 8% chance...". Readable text is the
 * whole point of showing the line.
 */
export function stripModMarkup(text: string): string {
  return text.replace(/\[(?:[^\]|]+\|)?([^\]]+)\]/g, '$1')
}

function quality(value: number, min: number, max: number): number | null {
  if (max === min) return null
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

/** Pull the id-carrying mod entries out of a raw poe.ninja item. */
function structuredMods(item: EquippedItem): { id: string; stats: Record<string, number>; source: ItemModAnalysis['source'] }[] {
  const raw = (item.raw as { itemData?: { mods?: Record<string, unknown> } }).itemData?.mods
  if (!raw || typeof raw !== 'object') return []

  const sourceOf = (key: string): ItemModAnalysis['source'] =>
    key === 'explicit' || key === 'crafted' || key === 'desecrated' || key === 'implicit' ? (key as ItemModAnalysis['source']) : 'other'

  const out: { id: string; stats: Record<string, number>; source: ItemModAnalysis['source'] }[] = []
  for (const [key, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      const id = (entry as { id?: unknown }).id
      if (typeof id !== 'string') continue
      const stats = (entry as { stats?: Record<string, number> }).stats ?? {}
      out.push({ id, stats, source: sourceOf(key) })
    }
  }
  return out
}

/**
 * How much of a resistance mod is provably wasted.
 *
 * Only counts against the OVERCAP, and only up to what this mod contributes.
 * A mod granting 30% fire on a character 24% over cap wastes 24 of it, not 30 —
 * removing the whole mod would drop below cap.
 */
function wasteFor(
  stats: RolledStat[],
  defense: DefenseSummary | null,
): { amount: number; stat: string; reason: string } | null {
  if (!defense) return null

  for (const stat of stats) {
    const type = Object.entries(RESIST_STAT).find(([, id]) => id === stat.id)?.[0]
    const isAllEle = stat.id === ALL_ELEMENTAL_RESIST
    if (!type && !isAllEle) continue

    // For all-elemental, the binding constraint is the SMALLEST overcap among
    // the three — that is how much could be given up without dropping anything
    // below cap.
    const types = isAllEle ? ['fire', 'cold', 'lightning'] : [type!]
    const overcaps = types.map((t) => defense.resistances.find((r) => r.type === t)?.overCap ?? 0)
    if (overcaps.some((o) => o <= 0)) continue

    const overcap = Math.min(...overcaps)
    const amount = Math.min(overcap, stat.value)
    if (amount <= 0) continue

    const label = isAllEle ? 'all elemental resistances' : `${type} resistance`
    return {
      amount,
      stat: stat.id,
      reason:
        `${label} is ${overcap}% above the cap, and this mod grants ${stat.value}%. ` +
        `At least ${amount}% of it is doing nothing.`,
    }
  }
  return null
}

// ---------------------------------------------------------------------------

/** Analyse one equipped item against the affix ladders for its base. */
export function analyzeItem(
  item: EquippedItem,
  tiers: ModTiers,
  defense: DefenseSummary | null = null,
): ItemAnalysis {
  const warnings: string[] = []
  const baseTags = tiers.tagsForBase(item.baseType)
  const itemClass = tiers.classForBase(item.baseType)

  if (!baseTags) {
    warnings.push(
      `"${item.baseType}" is not in the base item data, so no tier can be resolved for anything on this item. ` +
        'That is a gap in the data, not a fault with the item.',
    )
  }

  const structured = structuredMods(item)
  const mods: ItemModAnalysis[] = []

  for (const entry of structured) {
    const raw = tiers.raw(entry.id)
    const ladder = baseTags ? tiers.ladderFor(entry.id, baseTags) : null
    const position = ladder?.entries.find((e) => e.id === entry.id) ?? null

    const rolled: RolledStat[] = Object.entries(entry.stats).map(([id, value]) => {
      const range = position?.stats.find((s) => s.id === id) ?? raw?.stats.find(([sid]) => sid === id)
      const min = range ? ('min' in range ? range.min : range[1]) : null
      const max = range ? ('max' in range ? range.max : range[2]) : null
      return {
        id,
        value,
        min,
        max,
        quality: min !== null && max !== null ? quality(value, min, max) : null,
      }
    })

    const displayed = raw ? null : tiers.display(entry.id)

    let unresolved: string | null = null
    if (displayed) {
      unresolved =
        'This is an implicit, corrupted or unique modifier, not a craftable affix, so it has no tier ladder.'
    } else if (!raw) {
      unresolved = `Mod "${entry.id}" is not in the craftable affix data — it may be a unique, corrupted or league mod.`
    } else if (!baseTags) {
      unresolved = `The base "${item.baseType}" is unknown, so this mod's ladder cannot be resolved.`
    } else if (!position) {
      unresolved =
        `"${entry.id}" is a real affix but does not spawn on ${itemClass ?? item.baseType} by the spawn rules, ` +
        'so it has no tier here. It may have been added by crafting or corruption.'
    }

    const upgrades: UpgradeOption[] = []
    if (position && ladder) {
      const firstStat = rolled[0]
      // Some ladders improve DOWNWARD — reduced attribute requirements goes
      // -15 -> -35 as tiers get better. Derived from the ladder rather than a
      // hardcoded stat list, because getting it wrong reports an upgrade as a
      // loss.
      const inverted = firstStat ? tiers.lowerIsBetter(ladder, firstStat.id) : false
      for (const better of ladder.entries.filter((e) => e.tier < position.tier)) {
        const betterStat = better.stats.find((s) => s.id === firstStat?.id)
        const best = betterStat ? (inverted ? betterStat.min : betterStat.max) : null
        upgrades.push({
          tier: better.tier,
          ilvl: better.ilvl,
          affix: better.affix,
          text: better.text,
          reachableOnThisItem: item.itemLevel !== null && item.itemLevel >= better.ilvl,
          // Always the size of the improvement, never a signed delta that
          // reads as negative for an inverted ladder.
          gain: best !== null && firstStat ? Math.abs(best - firstStat.value) : null,
          lowerIsBetter: inverted,
        })
      }
    }

    mods.push({
      id: entry.id,
      source: entry.source,
      kind: raw ? (raw.t === 'p' ? 'prefix' : 'suffix') : null,
      affix: raw?.name ?? displayed?.name ?? null,
      text: stripModMarkup(position?.text ?? raw?.text ?? displayed?.text ?? entry.id),
      tier: position?.tier ?? null,
      tiers: ladder?.entries.length ?? null,
      ilvlRequired: raw?.lvl ?? null,
      rolled,
      upgrades,
      waste: wasteFor(rolled, defense),
      unresolved,
    })
  }

  // Text-only lines, so the item view shows everything the game does.
  //
  // Read from their own payload keys rather than diffed against the structured
  // list: structured entries carry TEMPLATE text with ranges
  // ("+(41-45)% to Cold Resistance") while these carry ROLLED text ("+43% ..."),
  // so the two never compare equal and any text-based dedup would duplicate
  // every mod on the item.
  const itemData = item.raw.itemData
  const TEXT_ONLY = [
    ['implicitMods', 'implicit'],
    ['runeMods', 'rune'],
    ['enchantMods', 'enchant'],
  ] as const satisfies readonly (readonly [keyof NinjaItemData, ItemModAnalysis['source']])[]
  for (const [key, source] of TEXT_ONLY) {
    const lines = itemData?.[key]
    if (!Array.isArray(lines)) continue
    for (const line of lines) {
      if (typeof line !== 'string') continue
      mods.push({
        id: null,
        source,
        kind: null,
        affix: null,
        text: stripModMarkup(line),
        tier: null,
        tiers: null,
        ilvlRequired: null,
        rolled: [],
        upgrades: [],
        waste: null,
        unresolved: source + ' lines carry no mod id, so they cannot be tiered.',
      })
    }
  }

  const tiered = mods.filter((m) => m.tier !== null).map((m) => m.tier!)
  const affixCounts = {
    prefix: mods.filter((m) => m.kind === 'prefix' && m.source === 'explicit').length,
    suffix: mods.filter((m) => m.kind === 'suffix' && m.source === 'explicit').length,
  }

  if (item.itemLevel === null) {
    warnings.push('This item has no item level in the payload, so tier reachability cannot be judged.')
  }

  return {
    slotId: item.slotId,
    slotLabel: item.slotLabel,
    name: item.name,
    baseType: item.baseType,
    itemClass,
    itemLevel: item.itemLevel,
    rarity: item.rarity,
    corrupted: item.corrupted,
    active: item.active,
    mods,
    affixCounts,
    tierProfile: tiered.length
      ? {
          best: Math.min(...tiered),
          worst: Math.max(...tiered),
          mean: Number((tiered.reduce((a, b) => a + b, 0) / tiered.length).toFixed(2)),
        }
      : null,
    warnings,
  }
}

/**
 * Find swaps that trade a provably-wasted mod for one the build actually needs.
 *
 * This is the "your fire is 24% overcapped and your chaos is short" case, made
 * concrete: it names the item, the mod on it that is wasted, and the specific
 * affixes that could replace it — filtered to what can spawn on that base, and
 * split by whether the item's own level allows them.
 */
export function findResistanceSwaps(
  items: ItemAnalysis[],
  rawItems: EquippedItem[],
  tiers: ModTiers,
  defense: DefenseSummary,
): GearSwap[] {
  const shortfalls = defense.resistances
    .filter((r) => r.underCap > 0)
    .sort((a, b) => b.underCap - a.underCap)
  if (!shortfalls.length) return []

  // How badly each wanted stat is needed, so a 57-point chaos shortfall
  // outranks a 1-point cold one. Without this, candidates sort by tier and the
  // biggest gap gets buried under a cosmetic one.
  const need = new Map<string, number>()
  for (const r of shortfalls) {
    const id = RESIST_STAT[r.type]
    if (id) need.set(id, r.underCap)
  }
  const wantedStats = [...need.keys()]
  if (!wantedStats.length) return []

  const swaps: GearSwap[] = []

  for (const item of items) {
    if (!item.active) continue
    const raw = rawItems.find((i) => i.slotId === item.slotId)
    const baseTags = raw ? tiers.tagsForBase(raw.baseType) : null
    if (!baseTags) continue

    for (const mod of item.mods) {
      if (!mod.waste || !mod.kind) continue

      // Only offer what this item can actually hold: same affix kind, spawnable
      // on this base. Reachability at the item's own level is reported rather
      // than filtered, because "you need a higher base" is itself the answer.
      const options = tiers
        .available(mod.kind, baseTags, { statIds: wantedStats })
        .map((entry) => {
          // Pick the stat this candidate grants that the build needs MOST.
          const stat = entry.stats
            .filter((s) => need.has(s.id))
            .sort((x, y) => need.get(y.id)! - need.get(x.id)!)[0]!
          return {
            id: entry.id,
            tier: entry.tier,
            ilvl: entry.ilvl,
            affix: entry.affix,
            text: entry.text,
            statId: stat.id,
            min: stat.min,
            max: stat.max,
            reachableOnThisItem: item.itemLevel !== null && item.itemLevel >= entry.ilvl,
            /** How much of the shortfall this closes, capped at what is missing. */
            closesShortfall: Math.min(need.get(stat.id)!, stat.max),
          }
        })
        .sort(
          (a, b) =>
            Number(b.reachableOnThisItem) - Number(a.reachableOnThisItem) ||
            b.closesShortfall - a.closesShortfall ||
            a.tier - b.tier,
        )

      if (!options.length) continue

      swaps.push({
        slotId: item.slotId,
        slotLabel: item.slotLabel,
        itemName: item.name,
        replace: {
          id: mod.id,
          text: mod.text,
          tier: mod.tier,
          reason: mod.waste.reason,
        },
        candidates: options.slice(0, 4),
        cost: item.corrupted
          ? 'This item is corrupted, so its affixes cannot be changed. The swap needs a replacement item.'
          : `Recrafting one ${mod.kind} on ${item.name}. The rest of the item is unaffected.`,
      })
    }
  }

  // Biggest measurable waste first.
  return swaps.sort((a, b) => {
    const wasteOf = (s: GearSwap) =>
      items.flatMap((i) => i.mods).find((m) => m.id === s.replace.id)?.waste?.amount ?? 0
    return wasteOf(b) - wasteOf(a)
  })
}

/**
 * How many of the proposed swaps it would actually take to close each gap.
 *
 * Without this the list reads as if every swap closes the whole shortfall
 * independently — six entries each saying "closes 27 of the gap" against a
 * 57-point gap implies 162 points of fixing, which is nonsense. Swaps are
 * cumulative, so the honest statement is how many are ENOUGH.
 */
export function summarizeSwaps(
  swaps: GearSwap[],
  defense: DefenseSummary,
): { stat: string; type: string; shortfall: number; swapsNeeded: number | null; note: string }[] {
  const out = []

  for (const res of defense.resistances.filter((r) => r.underCap > 0)) {
    const statId = RESIST_STAT[res.type]
    if (!statId) continue

    // Best available candidate per swap, for this stat only. Each item can
    // contribute at most one — they are separate affix slots on separate items.
    const perSwap = swaps
      .map((s) => s.candidates.filter((c) => c.statId === statId && c.reachableOnThisItem)[0]?.max ?? 0)
      .filter((v) => v > 0)
      .sort((a, b) => b - a)

    let running = 0
    let needed: number | null = null
    for (let i = 0; i < perSwap.length; i++) {
      running += perSwap[i]!
      if (running >= res.underCap) {
        needed = i + 1
        break
      }
    }

    out.push({
      stat: statId,
      type: res.type,
      shortfall: res.underCap,
      swapsNeeded: needed,
      note:
        needed !== null
          ? `${needed} of these swap${needed === 1 ? '' : 's'} would cover the ${res.underCap}% ${res.type} shortfall. The rest are spare capacity, not extra need.`
          : perSwap.length
            ? `All ${perSwap.length} available swaps together give ${running}%, short of the ${res.underCap}% needed. ${res.type} resistance also needs a source outside these items.`
            : `No wasted modifier on your gear can be traded for ${res.type} resistance. It needs a new item, a passive, or a rune.`,
    })
  }

  return out.sort((a, b) => b.shortfall - a.shortfall)
}

/**
 * Mods sitting below the best tier their own item could hold.
 *
 * Deliberately split from the "needs a better base" case: upgrading a suffix on
 * the ring you already own is a different action from buying a new ring, and
 * conflating them is how a recommendation becomes unactionable.
 */
export function findTierUpgrades(items: ItemAnalysis[]): {
  onThisItem: LocatedMod[]
  needsBetterBase: LocatedMod[]
} {
  const onThisItem: LocatedMod[] = []
  const needsBetterBase: LocatedMod[] = []

  for (const item of items) {
    if (!item.active || item.corrupted) continue
    for (const mod of item.mods) {
      if (!mod.upgrades.length) continue
      const decorated = { ...mod, slotId: item.slotId, slotLabel: item.slotLabel, itemName: item.name }
      if (mod.upgrades.some((u) => u.reachableOnThisItem)) onThisItem.push(decorated)
      else needsBetterBase.push(decorated)
    }
  }

  const byGain = (a: ItemModAnalysis, b: ItemModAnalysis) =>
    (b.upgrades[0]?.gain ?? 0) - (a.upgrades[0]?.gain ?? 0)
  onThisItem.sort(byGain)
  needsBetterBase.sort(byGain)
  return { onThisItem, needsBetterBase }
}
