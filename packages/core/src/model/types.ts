/**
 * Domain types for a poe.ninja PoE2 character model.
 *
 * These describe the RAW payload shape as verified against a live capture
 * (Demonad112-2589/Athrynas, model v43, 388,435 bytes, 2026-07-24). Fields are
 * optional wherever the live payload was observed to omit them — poe.ninja's
 * per-skill `dps[0]` object in particular has a sparse key set that varies by
 * skill (`hitRate` appears on charge-up skills like Snipe and nowhere else).
 *
 * Nothing here is computed. Normalized/derived shapes live alongside the
 * modules that produce them.
 */

/** How a number reached the user. Never mix tiers silently. */
export type Provenance =
  /** Tier 1: read verbatim from poe.ninja's computed payload. Authoritative. */
  | 'ninja'
  /** Tier 2: produced by driving a live Path of Building instance. */
  | 'pob-sim'
  /** Tier 2: read from the PoB export blob poe.ninja embeds. */
  | 'pob-export'
  /** Tier 3: computed by this codebase. MUST be surfaced as an estimate. */
  | 'estimate'

/** A value that knows where it came from. */
export interface Sourced<T> {
  value: T
  provenance: Provenance
}

/** Damage type order used by every `damageTypes`-style tuple poe.ninja emits. */
export const DAMAGE_TYPES = ['physical', 'fire', 'cold', 'lightning', 'chaos'] as const
export type DamageType = (typeof DAMAGE_TYPES)[number]

/**
 * poe.ninja's per-skill computed damage block, `charModel.skills[i].dps[0]`.
 *
 * This is the number V1 never read and instead tried to recompute from ~15
 * caller-supplied modifiers. It arrives free. Read it.
 */
export interface NinjaSkillDps {
  /** Absent on meta/trigger gem setups (Mirage Archer, Freezing Mark, ...). */
  name?: string
  /** Hit DPS. Exactly 0 for buff/herald skills, which carry only `dotDps`. */
  dps?: number
  /** Damage-over-time DPS. Present even when `dps` is 0. */
  dotDps?: number
  /** Percent split over DAMAGE_TYPES. Sums to ~100. */
  damageTypes?: number[]
  dotDamageTypes?: number[]
  /** `[totalDps, phys%, fire%, cold%, lightning%, chaos%, kind]`. */
  damage?: number[]
  /** Uses per second. */
  rate?: number
  rateKind?: number
  /**
   * Fraction of `rate` that actually lands, for charge-up skills.
   * Observed 0.771 on Snipe; absent entirely on normal attacks.
   */
  hitRate?: number
  /** Percent, pre-effective (5 means 5%). */
  critChance?: number
  /** Multiplier, not percent (2.48 means 248%). */
  critMultiplier?: number
  hitChance?: number
  projectiles?: number
  forks?: number
  aoeRadius?: number
}

export interface NinjaGem {
  name?: string
  itemData?: NinjaItemData
}

export interface NinjaSkill {
  /** Present on real skills; meta/trigger setups carry only `allGems`. */
  dps?: NinjaSkillDps[]
  allGems?: NinjaGem[]
}

/**
 * Item payload. Note the nesting: ilvl/name/rarity live on `itemData`, NOT on
 * the wrapper. V1 read them off the wrapper and got undefined.
 */
export interface NinjaItemData {
  name?: string
  typeLine?: string
  baseType?: string
  ilvl?: number
  frameType?: number
  frameTypeId?: string
  rarity?: string
  corrupted?: boolean
  identified?: boolean
  explicitMods?: string[]
  implicitMods?: string[]
  runeMods?: string[]
  enchantMods?: string[]
  desecratedMods?: string[]
  bondedMods?: string[]
  fracturedMods?: string[]
  craftedMods?: string[]
  utilityMods?: string[]
  grantedSkills?: unknown[]
  sockets?: unknown[]
  socketedItems?: NinjaItemData[]
  properties?: unknown[]
  requirements?: unknown[]
  icon?: string
  id?: string
}

export interface NinjaItem {
  /** Numeric slot. See model/slots.ts — this is NOT `inventoryId`. */
  itemSlot: number
  itemData: NinjaItemData
}

/**
 * The 46 defensive stats poe.ninja computes. `deflect*` and `ward` are 0.5
 * mechanics V1 had no concept of.
 */
export interface NinjaDefensiveStats {
  life?: number
  energyShield?: number
  ward?: number
  mana?: number
  spirit?: number
  movementSpeed?: number
  lifeRegen?: number

  evasionRating?: number
  evadeChance?: number
  evadeChanceMax?: number
  baseEvadeChance?: number
  enemyAccuracy?: number

  armour?: number
  damageReductions?: Partial<
    Record<
      DamageType,
      {
        value?: number
        max?: number
        effectiveAppliedArmour?: number
        base?: number
        takenDamage?: number
      } | null
    >
  >

  deflectChance?: number
  deflectChanceMax?: number
  deflectionRating?: number
  deflectEffect?: number
  blockChance?: number

  strength?: number
  dexterity?: number
  intelligence?: number
  enduranceCharges?: number
  frenzyCharges?: number
  powerCharges?: number

  /**
   * Averaged effective pool. Overstates survivability — on the reference
   * character it reads 13,569 while a 3,808 chaos hit kills (~3.5x).
   * Lead with `lowestMaximumHitTaken` instead.
   */
  effectiveHealthPool?: number
  physicalMaximumHitTaken?: number
  fireMaximumHitTaken?: number
  coldMaximumHitTaken?: number
  lightningMaximumHitTaken?: number
  chaosMaximumHitTaken?: number
  /** The number that actually kills you. This is the survivability headline. */
  lowestMaximumHitTaken?: number

  fireResistance?: number
  fireResistanceMax?: number
  fireResistanceOverCap?: number
  coldResistance?: number
  coldResistanceMax?: number
  coldResistanceOverCap?: number
  lightningResistance?: number
  lightningResistanceMax?: number
  lightningResistanceOverCap?: number
  chaosResistance?: number
  chaosResistanceMax?: number
  chaosResistanceOverCap?: number

  itemRarity?: number
  physicalTakenAs?: Partial<Record<DamageType, number>>
}

/**
 * Per-stat, per-source attribution. `stats` is keyed by NUMERIC STAT ID as a
 * string ("0", "4", "26"), not by name — see model/breakdowns.ts for the
 * empirically derived id map.
 */
export interface NinjaBreakdowns {
  /** `[sourceType, label]`. Index 0 is the bare `[0]` base entry. */
  sources?: Array<[number] | [number, string]>
  stats?: Record<string, NinjaBreakdownStat>
}

export interface NinjaBreakdownStat {
  base: number
  inc: number
  more: number
  total: number
  basePercent: boolean
  /** `[modType, value, sourceIndex]` into `sources`. */
  mods: Array<[number, number, number]>
}

export interface NinjaPassiveCounts {
  /** Note: this is NOT `passiveSelection.length`. On the reference character
   *  this reads 109 while the selection array holds 103. */
  passives?: number
  anoints?: number
  ascendancy?: number
  bonusPassives?: number
}

/** The root payload: `GET .../model/{version}` returns `{ type, charModel }`. */
export interface CharModel {
  account?: string
  name?: string
  league?: string
  level?: number
  /** Ascendancy name, e.g. "Deadeye". */
  class?: string
  /** Numeric base class index, e.g. 1. Not a name. */
  baseClass?: number
  passiveTreeName?: string

  defensiveStats?: NinjaDefensiveStats
  breakdowns?: NinjaBreakdowns
  skills?: NinjaSkill[]
  items?: NinjaItem[]
  jewels?: unknown[]
  flasks?: unknown[]
  keystones?: unknown[]

  /**
   * Allocated main-tree node ids. Weapon-set trees are ALTERNATES, not
   * additions — never sum these three arrays.
   */
  passiveSelection?: number[] | { allocated_nodes?: number[] }
  passiveSelectionSet1?: number[]
  passiveSelectionSet2?: number[]
  passiveCounts?: NinjaPassiveCounts
  /** Which weapon set is live. Slots 15/16 are inactive when false. */
  useSecondWeaponSet?: boolean

  /** base64url + zlib + XML. Decoded by pob/export.ts. */
  pathOfBuildingExport?: string

  status?: unknown
  questStats?: unknown
  enableBondedMods?: boolean
  updatedUtc?: string
  lastSeenUtc?: string
  lastCheckedUtc?: string
}

export interface CharModelResponse {
  type?: string
  charModel?: CharModel
}
