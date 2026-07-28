/**
 * Affix ladders, resolved per item class.
 *
 * The one thing to understand here: **a tier number is meaningless without an
 * item class**. `ColdResistance` has 16 members game-wide, but only 8 of them
 * can appear on a ring — the rest are the Hand Wraps ladder. Numbering globally
 * would tell a ring wearer they have "T9 of 16" when they have T1 of 8.
 *
 * So every query takes the item's base, and the ladder is built from the mods
 * that can actually spawn on it.
 *
 * ## T1 is the best tier
 *
 * Ordered by required item level, descending. Verified against the data rather
 * than assumed: within a group that ordering puts the biggest roll first in 97%
 * of ladders and is monotonic in level in 99.7%. The exceptions are stats where
 * a more negative value is better — reduced attribute requirements, reduced
 * bleed duration — which are monotonic too, just inverted. Roll magnitude is
 * never used to derive tier order, precisely because of those.
 */

/** Raw artifact shape, as written by build-mod-tiers.mjs. */
export interface ModTierRaw {
  /** Ladder group. */
  g: string
  /** 'p' prefix, 's' suffix. */
  t: 'p' | 's'
  /** Item level required. */
  lvl: number
  name: string | null
  /** [statId, min, max] */
  stats: [string, number, number][]
  text: string | null
  /** Ordered [tag, weight]. First match wins. */
  spawn: [string, number][]
}

/** Non-affix item mods — implicits, corrupted, unique. Renderable, never tiered. */
export interface DisplayOnlyMod {
  t: 'o'
  name: string | null
  text: string
  stats: [string, number, number][]
}

export interface ModTierData {
  version: number
  generatedFrom: string[]
  note: string
  baseTags: Record<string, string[]>
  baseClass: Record<string, string | null>
  mods: Record<string, ModTierRaw>
  displayOnly?: Record<string, DisplayOnlyMod>
}

export type AffixKind = 'prefix' | 'suffix'

export interface LadderEntry {
  id: string
  /** 1 is the best. */
  tier: number
  /** Item level needed for this tier to appear. */
  ilvl: number
  affix: string | null
  text: string | null
  stats: { id: string; min: number; max: number }[]
}

export interface Ladder {
  group: string
  kind: AffixKind
  entries: LadderEntry[]
}

function toEntry(id: string, mod: ModTierRaw, tier: number): LadderEntry {
  return {
    id,
    tier,
    ilvl: mod.lvl,
    affix: mod.name,
    text: mod.text,
    stats: mod.stats.map(([sid, min, max]) => ({ id: sid, min, max })),
  }
}

export class ModTiers {
  private readonly data: ModTierData
  /** group|kind -> ids, cached per base tag set. */
  private readonly ladderCache = new Map<string, Ladder>()

  constructor(data: ModTierData) {
    this.data = data
  }

  get modCount(): number {
    return Object.keys(this.data.mods).length
  }

  get baseCount(): number {
    return Object.keys(this.data.baseTags).length
  }

  raw(modId: string): ModTierRaw | null {
    return this.data.mods[modId] ?? null
  }

  /**
   * Renderable text for a mod that has no craftable ladder — a base implicit, a
   * corrupted mod, a unique's own line. Returning null makes the caller fall
   * back to the raw mod id, which reads as a bug to anyone looking at it.
   */
  display(modId: string): DisplayOnlyMod | null {
    return this.data.displayOnly?.[modId] ?? null
  }

  /**
   * Whether a lower number is better on this ladder.
   *
   * Derived from the ladder itself rather than a list of known stats: if T1
   * grants less than the bottom tier, the stat is one where more negative is
   * better — reduced attribute requirements, reduced bleed duration. Getting
   * this wrong reports an upgrade as a downgrade.
   */
  lowerIsBetter(ladder: Ladder, statId: string): boolean {
    const best = ladder.entries[0]?.stats.find((s) => s.id === statId)
    const worst = ladder.entries.at(-1)?.stats.find((s) => s.id === statId)
    if (!best || !worst || best.max === worst.max) return false
    return best.max < worst.max
  }

  /** Spawn tags for a base, by its display name ("Militant Bow"). */
  tagsForBase(baseName: string): string[] | null {
    return this.data.baseTags[baseName] ?? null
  }

  /** Item class for a base name ("Bow"), or null when the base is unknown. */
  classForBase(baseName: string): string | null {
    return this.data.baseClass[baseName] ?? null
  }

  /**
   * Whether a mod can appear on a base.
   *
   * Spawn weights are ORDERED and first-match-wins. `ColdResist8` lists
   * armour/ring/amulet/belt at weight 1 and then `default` at 0; a bow reaches
   * `default` first, so it cannot roll cold resistance. Asking "is any weight
   * above zero" would wrongly say yes — a bug that would validate every mod onto
   * every item.
   */
  canSpawn(modId: string, baseTags: Iterable<string>): boolean {
    const mod = this.data.mods[modId]
    if (!mod) return false
    const tags = new Set(baseTags)
    for (const [tag, weight] of mod.spawn) {
      if (tags.has(tag)) return weight > 0
    }
    // No rule matched at all. Absence of a rule is not permission.
    return false
  }

  /**
   * The full ladder for a group on one item class, best tier first.
   *
   * Returns an empty ladder rather than throwing when nothing can spawn — an
   * item class simply may not get that affix.
   */
  ladder(group: string, kind: AffixKind, baseTags: Iterable<string>): Ladder {
    const tags = [...baseTags]
    const cacheKey = `${group}|${kind}|${tags.join(',')}`
    const cached = this.ladderCache.get(cacheKey)
    if (cached) return cached

    const short = kind === 'prefix' ? 'p' : 's'
    const members: [string, ModTierRaw][] = []
    for (const [id, mod] of Object.entries(this.data.mods)) {
      if (mod.g !== group || mod.t !== short) continue
      if (!this.canSpawn(id, tags)) continue
      members.push([id, mod])
    }

    members.sort((a, b) => b[1].lvl - a[1].lvl || a[0].localeCompare(b[0]))
    const ladder: Ladder = {
      group,
      kind,
      entries: members.map(([id, mod], index) => toEntry(id, mod, index + 1)),
    }
    this.ladderCache.set(cacheKey, ladder)
    return ladder
  }

  /** The ladder a specific mod belongs to, on a specific base. */
  ladderFor(modId: string, baseTags: Iterable<string>): Ladder | null {
    const mod = this.data.mods[modId]
    if (!mod) return null
    return this.ladder(mod.g, mod.t === 'p' ? 'prefix' : 'suffix', baseTags)
  }

  /**
   * Every affix of one kind that can appear on a base, optionally filtered to
   * those granting one of a set of stat ids, and to what an item level allows.
   *
   * This is what answers "what could I put here instead" — it is deliberately
   * grounded in spawn rules rather than a curated list of good mods.
   */
  available(
    kind: AffixKind,
    baseTags: Iterable<string>,
    options: { statIds?: Iterable<string>; maxIlvl?: number } = {},
  ): LadderEntry[] {
    const tags = [...baseTags]
    const short = kind === 'prefix' ? 'p' : 's'
    const wanted = options.statIds ? new Set(options.statIds) : null
    const groups = new Map<string, LadderEntry>()

    for (const [id, mod] of Object.entries(this.data.mods)) {
      if (mod.t !== short) continue
      if (wanted && !mod.stats.some(([sid]) => wanted.has(sid))) continue
      if (options.maxIlvl !== undefined && mod.lvl > options.maxIlvl) continue
      if (!this.canSpawn(id, tags)) continue

      // Report the best reachable tier per ladder, not every rung of it.
      const ladder = this.ladder(mod.g, kind, tags)
      const entry = ladder.entries.find((e) => e.id === id)
      if (!entry) continue
      const best = groups.get(mod.g)
      if (!best || entry.tier < best.tier) groups.set(mod.g, entry)
    }

    return [...groups.values()].sort((a, b) => b.ilvl - a.ilvl)
  }
}
