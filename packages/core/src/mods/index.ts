/**
 * Item modifier database, keyed by mod TEXT.
 *
 * Affix names, roll windows, and which item classes each modifier can appear on.
 * Used when a mod line is all you have — a pasted item, a typed line. When a
 * character is loaded, prefer `gear/`: poe.ninja ships the actual mod id on every
 * equipped item, which is exact where text matching is a guess.
 *
 * ## No tier numbers here
 *
 * They were removed after being proven wrong twice. A tier is meaningless
 * without an item class: `ColdResistance` has 16 members game-wide and 8 on a
 * ring, so a global number tells a ring wearer "T9 of 16" when they have T1 of
 * 8. Tiers live in `gear/tiers.ts`, resolved against a base. See
 * packages/data/scripts/build-mods.mjs for the full investigation.
 *
 * ## A correction
 *
 * An earlier version of this module stated that mod-to-item-base compatibility
 * "is not in the data" and refused to offer a legality check. That was true of
 * the extracted files it was looking at — in those, `type_key` looks like an
 * index into spawn_tags and is not, mapping attack speed to belts only and flat
 * energy shield to bows and to non-item tags like `Claw_onhit_audio`.
 *
 * It was wrong as a general claim. RePoE-fork publishes the linkage directly,
 * per item class and split by prefix and suffix, and its modifier ids share a
 * namespace with the tier table. So compatibility IS checkable, and
 * `validateItemMods` below does it. The earlier claim is retracted.
 *
 * ## What is still not claimed
 *
 * Absence from the compatibility table means RePoE does not list that modifier,
 * not that it is illegal everywhere — so an unlisted mod reports as `unknown`
 * rather than as a violation. Item level requirements, influence, and crafting
 * restrictions beyond the class pool are not modelled.
 */

export interface ModStat {
  id: string
  min: number
  max: number
  /** Rendered at the maximum roll. */
  text: string
  /** Rendered at the minimum roll. */
  textMin: string
}

export interface ModEntry {
  id: string
  /** Affix name, e.g. "of the Gods". Null for implicits and some corrupted mods. */
  affix: string | null
  kind: string
  level: number
  stats: ModStat[]
  /**
   * Deliberately absent: a tier is meaningless without an item class.
   * `ColdResistance` has 16 members game-wide and 8 on a ring, so a global
   * number would tell a ring wearer "T9 of 16" when they have T1 of 8.
   * Use `ModTiers` in `gear/`, which resolves ladders against a base.
   */
  tier?: never
  tiers?: never
}

export interface ModData {
  version: number
  modCount: number
  limitation: string
  mods: ModEntry[]
}

/**
 * Reduce a mod line to a shape that can be compared across rolls:
 * "+38% to Lightning Resistance" -> "+#% to lightning resistance".
 */
export function modSkeleton(text: string): string {
  return text
    .replace(/\[(?:[^\]|]+\|)?([^\]]+)\]/g, '$1')
    .replace(/[+-]?\d+(?:\.\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Every number in a mod line, in order. */
export function modValues(text: string): number[] {
  return (text.match(/[+-]?\d+(?:\.\d+)?/g) ?? []).map(Number)
}

export interface RollAssessment {
  /** Where the roll sits in this affix's window, 0 (minimum) to 1 (maximum). */
  positionInTier: number | null
  affix: string | null
  /** This tier's window. */
  min: number
  max: number
  /** The best roll any tier of this affix family can produce. */
  bestPossible: number
  level: number
}

/**
 * A mod line assessed from its TEXT alone.
 *
 * Used for pasted or typed mod lines, where there is nothing else to go on.
 * When a character is loaded, prefer `analyzeItem` in `gear/` — poe.ninja ships
 * the actual mod id on every equipped item, which is exact where text matching
 * is a guess.
 */
export interface TextModAnalysis {
  text: string
  /** Null when the line matches nothing in the database. */
  matched: RollAssessment | null
  note: string | null
}

/** Mod-to-item-class compatibility, from RePoE-fork. */
export interface ModBaseData {
  version: number
  itemClasses: string[]
  /** Base item name -> the item class whose mod pool applies. */
  baseNameToClass: Record<string, string>
  /** modId -> { k: kinds (prefix/suffix), c: item classes }. */
  mods: Record<string, { k: string[]; c: string[] }>
}

export type ModLegality = 'ok' | 'wrong-class' | 'unknown'

export interface ModCheck {
  text: string
  modId: string | null
  legality: ModLegality
  /** Item classes this mod can appear on. Empty when unknown. */
  allowedOn: string[]
  kinds: string[]
  message: string
}

export interface ItemModValidation {
  itemClass: string | null
  checks: ModCheck[]
  violations: ModCheck[]
  unknown: ModCheck[]
  valid: boolean
  note: string
}

export class ModDatabase {
  private readonly bySkeleton = new Map<string, ModEntry[]>()
  private readonly baseData: ModBaseData | null
  readonly limitation: string
  readonly size: number

  constructor(data: ModData, baseData?: ModBaseData) {
    this.baseData = baseData ?? null
    this.limitation = baseData
      ? 'Compatibility covers which item class a modifier can appear on. Absence from the table means it is not listed, not that it is illegal — those report as unknown. Item level, influence and crafting restrictions beyond the class pool are not modelled.'
      : data.limitation
    this.size = data.mods.length
    for (const mod of data.mods) {
      for (const stat of mod.stats) {
        // Index on both bounds: a stat whose min and max render differently
        // (e.g. sign changes) must be findable either way.
        for (const key of new Set([modSkeleton(stat.text), modSkeleton(stat.textMin)])) {
          const list = this.bySkeleton.get(key) ?? []
          if (!list.includes(mod)) list.push(mod)
          this.bySkeleton.set(key, list)
        }
      }
    }
  }

  /** Free-text search over affix names and rendered stat text. */
  search(query: string, opts: { kind?: string; limit?: number } = {}): ModEntry[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const limit = opts.limit ?? 25
    const out: ModEntry[] = []

    for (const list of this.bySkeleton.values()) {
      for (const mod of list) {
        if (out.includes(mod)) continue
        if (opts.kind && mod.kind !== opts.kind) continue
        const haystack = `${mod.affix ?? ''} ${mod.stats.map((s) => s.text).join(' ')}`.toLowerCase()
        if (!haystack.includes(q)) continue
        out.push(mod)
        if (out.length >= limit * 4) break
      }
      if (out.length >= limit * 4) break
    }

    // Highest item level first — the strongest rungs are what a crafter cares
    // about. Not called "tier" because that needs an item class.
    return out.sort((a, b) => b.level - a.level).slice(0, limit)
  }

  /**
   * Assess a single mod line from an item.
   *
   * Returns `matched: null` rather than a guess when the line has no
   * counterpart in the database — many lines are runes, corrupted implicits or
   * unique-only mods that this table does not carry.
   */
  assess(text: string): TextModAnalysis {
    const skeleton = modSkeleton(text)
    const candidates = this.bySkeleton.get(skeleton)
    if (!candidates?.length) {
      return {
        text,
        matched: null,
        note: 'No affix in the database renders to this line. It may be a rune, a unique-only modifier, or a stat this data set does not describe.',
      }
    }

    const values = modValues(text)
    const value = values[0]
    if (value === undefined) {
      return { text, matched: null, note: 'This line carries no numeric roll to place in a window.' }
    }

    // Rungs whose window contains the roll. Several overlap, so prefer the one
    // demanding the highest item level — that is the strongest affix it could
    // be. Which TIER that is depends on the item class, which text alone does
    // not carry, so no tier number is claimed here.
    const family = candidates
      .filter((m) => m.stats.length === values.length)
      .sort((a, b) => b.level - a.level)
    const pool = family.length ? family : candidates

    const fits = pool.filter((m) => {
      const stat = m.stats[0]
      return stat && value >= Math.min(stat.min, stat.max) && value <= Math.max(stat.min, stat.max)
    })
    const chosen = fits[0] ?? null

    const bestPossible = Math.max(...pool.map((m) => Math.max(m.stats[0]!.min, m.stats[0]!.max)))

    if (!chosen) {
      return {
        text,
        matched: null,
        note: `The stat is recognised but ${value} falls outside every known roll window for it, which usually means the value is modified by quality, a rune, or an increase from elsewhere on the character.`,
      }
    }

    const stat = chosen.stats[0]!
    const low = Math.min(stat.min, stat.max)
    const high = Math.max(stat.min, stat.max)
    const span = high - low

    return {
      text,
      matched: {
        positionInTier: span > 0 ? (value - low) / span : null,
        affix: chosen.affix,
        min: low,
        max: high,
        bestPossible,
        level: chosen.level,
      },
      note:
        'Tier is not reported: it depends on the item class, which a mod line alone does not carry. ' +
        'Load a character and use the gear tools, or pass a base type, for a real tier.',
    }
  }

  /** The item class whose mod pool applies to a base, e.g. "Militant Bow" -> "Bows". */
  classForBase(baseName: string): string | null {
    if (!this.baseData) return null
    return this.baseData.baseNameToClass[baseName.trim()] ?? null
  }

  get itemClasses(): string[] {
    return this.baseData?.itemClasses ?? []
  }

  /** Item classes a modifier can appear on. Null when it is not listed. */
  classesForMod(modId: string): string[] | null {
    return this.baseData?.mods[modId]?.c ?? null
  }

  /**
   * Check each of an item's mod lines against the pool for its class.
   *
   * A line reports `wrong-class` only when the modifier is positively listed
   * for other classes and not this one. Anything the table does not carry
   * reports `unknown` — absence is not evidence of illegality.
   */
  validateItemMods(baseName: string, lines: string[]): ItemModValidation {
    const itemClass = this.classForBase(baseName)

    if (!this.baseData || !itemClass) {
      const checks: ModCheck[] = lines.map((text) => ({
        text,
        modId: null,
        legality: 'unknown' as const,
        allowedOn: [],
        kinds: [],
        message: this.baseData
          ? `"${baseName}" is not a base this data set knows, so the mod pool that applies to it is unknown.`
          : 'No compatibility data is loaded, so nothing can be checked.',
      }))
      return {
        itemClass: null,
        checks,
        violations: [],
        unknown: checks,
        valid: true,
        note: this.baseData
          ? `Could not resolve "${baseName}" to an item class, so no line was checked.`
          : 'Compatibility data was not provided to this database.',
      }
    }

    const checks: ModCheck[] = lines.map((text) => {
      const candidates = this.bySkeleton.get(modSkeleton(text)) ?? []
      // Prefer a candidate the table actually knows about.
      const known = candidates.find((m) => this.baseData!.mods[m.id])
      const entry = known ? this.baseData!.mods[known.id]! : null

      if (!entry) {
        return {
          text,
          modId: known?.id ?? candidates[0]?.id ?? null,
          legality: 'unknown' as const,
          allowedOn: [],
          kinds: [],
          message:
            'This line is not in the compatibility table. It may be a rune, an implicit, a corrupted or unique-only modifier, or simply unlisted — so nothing is claimed about it.',
        }
      }

      const allowed = entry.c.includes(itemClass)
      return {
        text,
        modId: known!.id,
        legality: allowed ? ('ok' as const) : ('wrong-class' as const),
        allowedOn: entry.c,
        kinds: entry.k,
        message: allowed
          ? `${known!.id} can appear on ${itemClass} as a ${entry.k.join(' or ')}.`
          : `${known!.id} is not in the ${itemClass} mod pool. It is listed for ${entry.c.slice(0, 6).join(', ')}${entry.c.length > 6 ? ` and ${entry.c.length - 6} more` : ''}.`,
      }
    })

    const violations = checks.filter((c) => c.legality === 'wrong-class')
    return {
      itemClass,
      checks,
      violations,
      unknown: checks.filter((c) => c.legality === 'unknown'),
      valid: violations.length === 0,
      note: this.limitation,
    }
  }

  /** Assess every mod line on an item. */
  assessAll(lines: string[]): {
    mods: TextModAnalysis[]
    matched: number
    unmatched: number
    limitation: string
  } {
    const mods = lines.map((line) => this.assess(line))
    return {
      mods,
      matched: mods.filter((m) => m.matched).length,
      unmatched: mods.filter((m) => !m.matched).length,
      limitation: this.limitation,
    }
  }
}
