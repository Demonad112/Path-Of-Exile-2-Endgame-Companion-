/**
 * Per-stat, per-source attribution — `charModel.breakdowns`.
 *
 * V1 mentioned this field in two comments and never read it. It is the single
 * richest thing in the payload: for every stat it gives the flat base, the
 * increased total, and the exact item / passive node / quest / attribute that
 * contributed each point. It is the foundation for honest "if you change X you
 * gain Y" advice, and for stating what a gear swap actually costs.
 *
 * ## Wire shape
 * `stats` is keyed by NUMERIC STAT ID as a string ("0", "4", "26") — not by
 * name. The id map below was derived empirically by matching `total` (and,
 * where totals collide, `base`) against `defensiveStats` on a live capture.
 * Ids that read zero on that capture are genuinely unresolved and are reported
 * as `stat_22`-style placeholders rather than guessed.
 *
 * ## Verified arithmetic
 *   total = round(base * (1 + inc/100) * more)
 * Confirmed against three independent stats on the reference character:
 *   life   1379 * 1.05 = 1447.95 -> 1448
 *   armour  143 * 1.45 =  207.35 ->  207
 *   ES      846 * 2.29 = 1937.34 -> 1937
 */

import type { CharModel, NinjaBreakdownStat, NinjaBreakdowns } from './types.js'

/** How confident we are that a stat id means what we say it means. */
export type IdConfidence =
  /** The value uniquely identified this stat on a live capture. */
  | 'confirmed'
  /** Value matched a group; position within the group is conventional. */
  | 'inferred'

export interface StatIdDef {
  key: string
  label: string
  confidence: IdConfidence
}

/**
 * Empirically derived stat id map.
 *
 * Resistances 14-17 are `confirmed` rather than `inferred` because their
 * *base* values disambiguate them even though several totals read 75:
 * fire base 99 = 75 + 24 overcap, lightning base 83 = 75 + 8, cold 74,
 * chaos 18 — each matches exactly one entry in `defensiveStats`.
 *
 * Ids 22, 23 and 30-37 read 0 with no mods on every capture so far. They are
 * intentionally absent: an unmapped id surfaces as `stat_22`, never a guess.
 */
export const STAT_IDS: Readonly<Record<number, StatIdDef>> = Object.freeze({
  0: { key: 'life', label: 'Life', confidence: 'confirmed' },
  1: { key: 'mana', label: 'Mana', confidence: 'confirmed' },
  2: { key: 'energyShield', label: 'Energy Shield', confidence: 'confirmed' },
  3: { key: 'spirit', label: 'Spirit', confidence: 'confirmed' },
  4: { key: 'armour', label: 'Armour', confidence: 'confirmed' },
  5: { key: 'evasionRating', label: 'Evasion Rating', confidence: 'confirmed' },
  6: { key: 'strength', label: 'Strength', confidence: 'confirmed' },
  7: { key: 'dexterity', label: 'Dexterity', confidence: 'confirmed' },
  8: { key: 'intelligence', label: 'Intelligence', confidence: 'confirmed' },
  9: { key: 'movementSpeed', label: 'Movement Speed', confidence: 'confirmed' },
  10: { key: 'itemRarity', label: 'Item Rarity', confidence: 'confirmed' },
  11: { key: 'enduranceCharges', label: 'Endurance Charges', confidence: 'inferred' },
  12: { key: 'frenzyCharges', label: 'Frenzy Charges', confidence: 'inferred' },
  13: { key: 'powerCharges', label: 'Power Charges', confidence: 'inferred' },
  14: { key: 'fireResistance', label: 'Fire Resistance', confidence: 'confirmed' },
  15: { key: 'coldResistance', label: 'Cold Resistance', confidence: 'confirmed' },
  16: { key: 'lightningResistance', label: 'Lightning Resistance', confidence: 'confirmed' },
  17: { key: 'chaosResistance', label: 'Chaos Resistance', confidence: 'confirmed' },
  18: { key: 'fireResistanceMax', label: 'Max Fire Resistance', confidence: 'inferred' },
  19: { key: 'coldResistanceMax', label: 'Max Cold Resistance', confidence: 'inferred' },
  20: { key: 'lightningResistanceMax', label: 'Max Lightning Resistance', confidence: 'inferred' },
  21: { key: 'chaosResistanceMax', label: 'Max Chaos Resistance', confidence: 'inferred' },
  24: { key: 'deflectEffect', label: 'Deflect Effect', confidence: 'confirmed' },
  25: { key: 'deflectionRating', label: 'Deflection Rating', confidence: 'confirmed' },
  26: { key: 'ward', label: 'Ward', confidence: 'confirmed' },
})

/** Where a contribution came from. */
export type SourceKind = 'base' | 'passive' | 'item' | 'attribute' | 'quest' | 'derived' | 'unknown'

const SOURCE_KINDS: Readonly<Record<number, SourceKind>> = Object.freeze({
  0: 'base',
  1: 'passive',
  2: 'item',
  5: 'attribute',
  7: 'quest',
  8: 'derived',
})

/** How a contribution applies. */
export type ModKind = 'flat' | 'increased' | 'unknown'

const MOD_KINDS: Readonly<Record<number, ModKind>> = Object.freeze({
  0: 'flat',
  1: 'increased',
})

export interface StatSource {
  kind: SourceKind
  /** Raw numeric type from the payload, kept for unmapped kinds. */
  typeId: number
  /** Display label, colour codes stripped. Empty for the base entry. */
  label: string
  /** For `passive` sources the label is a node id; parsed out here. */
  nodeId: number | null
  /** For `item` sources, the "Name, Base Type" label split apart. */
  itemName: string | null
  itemBaseType: string | null
}

export interface StatContribution {
  modKind: ModKind
  modTypeId: number
  /** Flat amount, or percentage points of `increased`. */
  value: number
  source: StatSource
}

/**
 * How a stat's `total` relates to its parts. The base formula does NOT apply
 * universally, and pretending otherwise produces false drift reports.
 */
export type Derivation =
  /** total = base * (1 + inc/100) * more. Confirmed on life, armour and
   *  energy shield — all `basePercent: false`. The common case. */
  | 'accumulated'
  /** As above, then clamped to a maximum (resistances). */
  | 'capped'
  /**
   * A `basePercent` stat combining a non-zero `inc`. The combining rule for
   * these is NOT confirmed: on the reference character `movementSpeed`
   * (base -3, inc 49, total 144) fits (100 + base) * (1 + inc/100) = 144.53,
   * while `itemRarity` (base 0, inc 63, total 63) does not — that formula
   * would give 163. Two observations, two behaviours, so no rule is asserted.
   */
  | 'percent-compound'
  /** Non-zero total with no contributing mods — poe.ninja did not expose how
   *  this value was derived (observed on `deflectEffect`). Not checkable. */
  | 'derived'
  /** Zero throughout. Nothing to verify. */
  | 'empty'

/** Stats that clamp to a maximum, and the stat key holding that maximum. */
export const CAPPED_STATS: Readonly<Record<string, string>> = Object.freeze({
  fireResistance: 'fireResistanceMax',
  coldResistance: 'coldResistanceMax',
  lightningResistance: 'lightningResistanceMax',
  chaosResistance: 'chaosResistanceMax',
})

export interface StatBreakdown {
  statId: number
  /** Mapped key, or `stat_{id}` when the id is unmapped. */
  key: string
  label: string
  /** Null when the id is unmapped — the caller must not treat it as known. */
  confidence: IdConfidence | null
  base: number
  inc: number
  more: number
  total: number
  basePercent: boolean
  contributions: StatContribution[]
  /** Set during indexing, once sibling stats (caps) are resolvable. */
  derivation: Derivation
  /** The cap applied, for `capped` stats. Null otherwise. */
  cap: number | null
}

/** PoE embeds colour codes like `^x88FFFF` in some source labels. */
function stripColourCodes(s: string): string {
  return s.replace(/\^x[0-9A-Fa-f]{6}/g, '').replace(/\^[0-9]/g, '').trim()
}

function parseSources(raw: NinjaBreakdowns['sources']): StatSource[] {
  const list = Array.isArray(raw) ? raw : []
  return list.map((entry) => {
    const typeId = Array.isArray(entry) && typeof entry[0] === 'number' ? entry[0] : -1
    const rawLabel = Array.isArray(entry) && typeof entry[1] === 'string' ? entry[1] : ''
    const label = stripColourCodes(rawLabel)
    const kind = SOURCE_KINDS[typeId] ?? 'unknown'

    let nodeId: number | null = null
    if (kind === 'passive' && /^\d+$/.test(label)) nodeId = Number(label)

    let itemName: string | null = null
    let itemBaseType: string | null = null
    if (kind === 'item') {
      const comma = label.indexOf(', ')
      if (comma > 0) {
        itemName = label.slice(0, comma)
        itemBaseType = label.slice(comma + 2)
      } else if (label) {
        itemName = label
      }
    }

    return { kind, typeId, label, nodeId, itemName, itemBaseType }
  })
}

const UNKNOWN_SOURCE: StatSource = {
  kind: 'unknown',
  typeId: -1,
  label: '',
  nodeId: null,
  itemName: null,
  itemBaseType: null,
}

function buildStat(statId: number, stat: NinjaBreakdownStat, sources: StatSource[]): StatBreakdown {
  const def = STAT_IDS[statId]
  const mods = Array.isArray(stat.mods) ? stat.mods : []

  return {
    statId,
    key: def?.key ?? `stat_${statId}`,
    label: def?.label ?? `Unmapped stat ${statId}`,
    confidence: def?.confidence ?? null,
    base: stat.base ?? 0,
    inc: stat.inc ?? 0,
    more: stat.more ?? 1,
    total: stat.total ?? 0,
    basePercent: stat.basePercent === true,
    contributions: mods.map(([modTypeId, value, sourceIndex]) => ({
      modKind: MOD_KINDS[modTypeId] ?? 'unknown',
      modTypeId,
      value,
      source: sources[sourceIndex] ?? UNKNOWN_SOURCE,
    })),
    // Resolved in a second pass, once sibling stats are indexed.
    derivation: 'accumulated',
    cap: null,
  }
}

/**
 * Classify each stat's derivation. Requires the full set, because a capped
 * stat's cap lives in a sibling stat.
 */
function classifyDerivations(all: StatBreakdown[]): void {
  const byKey = new Map(all.map((s) => [s.key, s]))

  for (const stat of all) {
    const capKey = CAPPED_STATS[stat.key]
    if (capKey) {
      const cap = byKey.get(capKey)?.total ?? null
      if (cap !== null) {
        stat.derivation = 'capped'
        stat.cap = cap
        continue
      }
    }

    if (stat.total === 0 && stat.base === 0 && stat.contributions.length === 0) {
      stat.derivation = 'empty'
      continue
    }

    // Percentage-based stats that also carry an `increased` component combine
    // by a rule we have not confirmed. Say so rather than assert one.
    if (stat.basePercent && stat.inc !== 0) {
      stat.derivation = 'percent-compound'
      continue
    }

    // A non-zero total with nothing contributing to it means poe.ninja
    // computed the value somewhere we cannot see. Observed on `deflectEffect`
    // (total 40, base 0, no mods). Claiming drift here would be a false alarm.
    if (stat.total !== 0 && stat.base === 0 && stat.contributions.length === 0) {
      stat.derivation = 'derived'
      continue
    }

    stat.derivation = 'accumulated'
  }
}

export interface TotalVerification {
  /** What the parts imply. Null when the stat isn't checkable. */
  expected: number | null
  actual: number
  /** True when they agree, or when the stat is not checkable. */
  agrees: boolean
  /** Set when the stat cannot be verified, explaining why. */
  uncheckableReason: string | null
}

/**
 * Verify a stat's stated total against its own parts, respecting derivation.
 *
 * This is what makes the reconciliation harness trustworthy: it distinguishes
 * "these numbers disagree" from "this number cannot be checked".
 */
export function verifyTotal(stat: StatBreakdown): TotalVerification {
  if (stat.derivation === 'empty') {
    return { expected: 0, actual: stat.total, agrees: stat.total === 0, uncheckableReason: null }
  }
  if (stat.derivation === 'derived') {
    return {
      expected: null,
      actual: stat.total,
      agrees: true,
      uncheckableReason: `poe.ninja reports ${stat.label} as ${stat.total} but lists no contributing modifiers, so the value cannot be recomputed from the breakdown.`,
    }
  }
  if (stat.derivation === 'percent-compound') {
    return {
      expected: null,
      actual: stat.total,
      agrees: true,
      uncheckableReason: `${stat.label} is a percentage stat with an increased component (base ${stat.base}, increased ${stat.inc}). The rule combining these is not confirmed, so the total is reported as poe.ninja gives it and not independently checked.`,
    }
  }

  const raw = computeTotal(stat.base, stat.inc, stat.more)
  const expected = stat.derivation === 'capped' && stat.cap !== null ? Math.min(raw, stat.cap) : raw
  return { expected, actual: stat.total, agrees: expected === stat.total, uncheckableReason: null }
}

export interface BreakdownIndex {
  /** Keyed by mapped key (`life`) or `stat_{id}` placeholder. */
  byKey: Map<string, StatBreakdown>
  byId: Map<number, StatBreakdown>
  all: StatBreakdown[]
  sources: StatSource[]
  /** Ids present in the payload with no entry in STAT_IDS. Surfaced, not hidden. */
  unmappedIds: number[]
}

export function indexBreakdowns(model: Pick<CharModel, 'breakdowns'>): BreakdownIndex {
  const raw = model.breakdowns ?? {}
  const sources = parseSources(raw.sources)
  const stats = raw.stats ?? {}

  const all: StatBreakdown[] = []
  const unmappedIds: number[] = []

  for (const [k, v] of Object.entries(stats)) {
    const id = Number(k)
    if (!Number.isInteger(id) || !v) continue
    if (!STAT_IDS[id]) unmappedIds.push(id)
    all.push(buildStat(id, v, sources))
  }

  all.sort((a, b) => a.statId - b.statId)
  classifyDerivations(all)

  return {
    byKey: new Map(all.map((s) => [s.key, s])),
    byId: new Map(all.map((s) => [s.statId, s])),
    all,
    sources,
    unmappedIds: unmappedIds.sort((a, b) => a - b),
  }
}

/**
 * Recompute a stat's total from its parts, per the verified formula.
 * Used by the reconciliation harness to flag drift, and by the recommendation
 * engine to project the effect of adding flat or increased value.
 */
export function computeTotal(base: number, inc: number, more: number): number {
  return Math.round(base * (1 + inc / 100) * (more || 1))
}

/**
 * Project the new total if `deltaFlat` flat and `deltaInc` increased were
 * added. Returns null when the stat isn't present — callers must report the
 * gap rather than assume zero.
 */
export function projectStat(
  index: BreakdownIndex,
  key: string,
  deltaFlat: number,
  deltaInc: number,
): { from: number; to: number; delta: number } | null {
  const stat = index.byKey.get(key)
  if (!stat) return null
  const to = computeTotal(stat.base + deltaFlat, stat.inc + deltaInc, stat.more)
  return { from: stat.total, to, delta: to - stat.total }
}

/**
 * Every source contributing to a stat, largest first — this is what
 * `find_stat_sources` answers and what makes "replace this ring" able to state
 * exactly what is lost.
 */
export function statSources(index: BreakdownIndex, key: string): StatContribution[] {
  const stat = index.byKey.get(key)
  if (!stat) return []
  return [...stat.contributions].sort((a, b) => b.value - a.value)
}
