/**
 * The configuration a Path of Building export was saved with.
 *
 * PoB stores its Configuration tab as `<Input>` elements under `<Calcs>`. Those
 * inputs are part of what produced the `<PlayerStat>` values everything else
 * reads, so they are the difference between "this build does 110k DPS" and
 * "this build does 110k DPS against a non-boss enemy that is chilled, ignited
 * and bleeding, while you are moving, have crit recently and have been hit
 * recently, with every buff and charge assumed active".
 *
 * The predecessor asserted these figures came from "PoB's default config (no
 * custom boss/buff settings applied)". On the reference character that was
 * wrong twice over: 20 inputs were set, six of them damage-relevant
 * conditionals, buff mode was EFFECTIVE, and no boss setting existed at all —
 * so the number was both inflated by conditionals and not a boss number, while
 * the assessment used it to judge pinnacle-boss viability.
 *
 * Parsing is regex-based, not DOM-based, for the same reason `readPlayerStats`
 * is: this must run identically in Node (no DOMParser) and the browser.
 */

/**
 * Inputs that raise damage by assuming something is true about the enemy or the
 * player at the moment of the hit. Label is how PoB presents it.
 */
const CONDITIONAL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  conditionEnemyChilled: 'enemy is chilled',
  conditionEnemyFrozen: 'enemy is frozen',
  conditionEnemyShocked: 'enemy is shocked',
  conditionEnemyIgnited: 'enemy is ignited',
  conditionEnemyBleeding: 'enemy is bleeding',
  conditionEnemyPoisoned: 'enemy is poisoned',
  conditionEnemyMaimed: 'enemy is maimed',
  conditionEnemyBlinded: 'enemy is blinded',
  conditionEnemyCursed: 'enemy is cursed',
  conditionEnemyIntimidated: 'enemy is intimidated',
  conditionEnemyCoveredInAsh: 'enemy is covered in ash',
  conditionEnemyRareOrUnique: 'enemy is rare or unique',
  conditionCritRecently: 'you have crit recently',
  conditionKilledRecently: 'you have killed recently',
  conditionMoving: 'you are moving',
  conditionStationary: 'you are stationary',
  conditionBeenHitRecently: 'you have been hit recently',
  conditionLeeching: 'you are leeching',
  conditionOnConsecratedGround: 'you are on consecrated ground',
  conditionFullLife: 'you are on full life',
  conditionLowLife: 'you are on low life',
  conditionUsingFlask: 'a flask is active',
})

/** Inputs that mean "this is being calculated against a boss". */
const BOSS_KEYS = ['enemyIsBoss', 'conditionEnemyBoss', 'enemyIsBossType', 'bossSkillEffect'] as const

/** Values PoB writes for "this setting is off". */
const OFF_VALUES = new Set(['false', 'NONE', 'None', ''])

export type BuffMode = 'unbuffed' | 'combat' | 'effective'

export interface PobMultiplier {
  name: string
  value: number
}

export interface PobConfig {
  /** How many `<Input>` elements the export carried. 0 means none were saved. */
  inputCount: number
  /** True when any boss setting is on. */
  versusBoss: boolean
  /** Which input said so, so the claim is traceable. Null when none did. */
  bossSetting: string | null
  /**
   * PoB's buff mode. EFFECTIVE assumes every buff and charge is up, which is
   * the most optimistic of the three. Null when the export did not say.
   */
  buffMode: BuffMode | null
  /** Damage-relevant conditionals that are switched on, in prose. */
  conditionals: string[]
  /**
   * Conditionals that are on but whose meaning this codebase does not carry a
   * label for. Named rather than dropped — an unrecognised conditional still
   * inflates the number, and hiding it would understate the caveat.
   */
  unlabelledConditionals: string[]
  /** Enemy-count and similar multipliers with a non-zero value. */
  multipliers: PobMultiplier[]
}

const NO_STRINGS = Object.freeze([] as string[]) as string[]
const NO_MULTIPLIERS = Object.freeze([] as PobMultiplier[]) as PobMultiplier[]

/** The empty result, for an export with no `<Calcs>` section at all. */
export const NO_POB_CONFIG: Readonly<PobConfig> = Object.freeze({
  inputCount: 0,
  versusBoss: false,
  bossSetting: null,
  buffMode: null,
  conditionals: NO_STRINGS,
  unlabelledConditionals: NO_STRINGS,
  multipliers: NO_MULTIPLIERS,
})

const XML_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
})

function decodeEntities(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m)
}

/**
 * Match an `<Input>` element by its quoted attributes rather than by scanning
 * to the next `>`. PoB writes stat text into `string=` values, and that text
 * can contain both newlines and angle brackets — a `[^>]*` scan would truncate
 * on the latter and silently lose every input after it.
 */
const INPUT_RE = /<Input\s+((?:[A-Za-z_][\w:.-]*\s*=\s*"[^"]*"\s*)+)\/?>/g
const ATTR_RE = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g

/** Every `<Input name=... value=...>` in the document, as a name -> value map. */
export function readPobInputs(xml: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const match of xml.matchAll(INPUT_RE)) {
    const attrs = new Map<string, string>()
    for (const attr of match[1]!.matchAll(ATTR_RE)) attrs.set(attr[1]!, decodeEntities(attr[2]!))
    const name = attrs.get('name')
    if (!name) continue
    // PoB writes exactly one of these three per input.
    const value = attrs.get('boolean') ?? attrs.get('number') ?? attrs.get('string')
    if (value !== undefined) out.set(name, value)
  }
  return out
}

/**
 * Read the config an export was saved with.
 *
 * Best-effort: an export with no `<Input>` elements yields a config reporting
 * zero inputs, which reads as "no configuration was saved" rather than as
 * "default" — the two are not the same claim.
 */
export function readPobConfig(xml: string): PobConfig {
  const inputs = readPobInputs(xml)

  const conditionals: string[] = []
  const unlabelled: string[] = []
  const multipliers: PobMultiplier[] = []

  for (const [name, value] of inputs) {
    if (name.startsWith('condition') && value === 'true') {
      const label = CONDITIONAL_LABELS[name]
      if (label) conditionals.push(label)
      else unlabelled.push(name)
      continue
    }
    if (name.startsWith('multiplier')) {
      const n = Number(value)
      if (Number.isFinite(n) && n !== 0) multipliers.push({ name, value: n })
    }
  }

  const bossSetting =
    BOSS_KEYS.find((k) => {
      const v = inputs.get(k)
      return v !== undefined && !OFF_VALUES.has(v)
    }) ?? null

  const raw = inputs.get('misc_buffMode')
  const buffMode: BuffMode | null =
    raw === 'EFFECTIVE' ? 'effective' : raw === 'COMBAT' ? 'combat' : raw === 'UNBUFFED' ? 'unbuffed' : null

  return {
    inputCount: inputs.size,
    versusBoss: bossSetting !== null,
    bossSetting,
    buffMode,
    conditionals: conditionals.sort(),
    unlabelledConditionals: unlabelled.sort(),
    multipliers: multipliers.sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/**
 * One sentence describing what a DPS figure from this export actually
 * represents, for use anywhere such a number is shown or judged.
 */
export function describePobConfig(config: PobConfig | null | undefined): string {
  if (!config || config.inputCount === 0) {
    return 'This export saved no Path of Building configuration, so the damage figures use PoB’s defaults.'
  }

  const parts: string[] = [
    config.versusBoss ? 'calculated against a boss' : 'calculated against a normal enemy, not a boss',
  ]

  if (config.buffMode === 'effective') parts.push('with all buffs and charges assumed active')
  else if (config.buffMode === 'unbuffed') parts.push('with buffs excluded')

  const conditionCount = config.conditionals.length + config.unlabelledConditionals.length
  if (conditionCount > 0) {
    const named = [...config.conditionals, ...config.unlabelledConditionals].join(', ')
    const plural = conditionCount === 1 ? 'condition holds' : 'conditions hold'
    parts.push(`assuming ${conditionCount} ${plural} (${named})`)
  }

  return `These figures were ${parts.join(', ')}.`
}

/**
 * Whether a DPS figure from this export can honestly be read as a boss number.
 *
 * Separated from the prose because it drives a decision, not a display: the
 * build assessment must not grade single-target damage as pinnacle-ready off a
 * number PoB computed against a white mob.
 */
export function isBossDps(config: PobConfig | null | undefined): boolean {
  return config?.versusBoss === true
}
