/**
 * Support-gem inspection and validation.
 *
 * ## Where the rules come from
 *
 * V1's extracted gem files carry no usable support constraints — checked across
 * all three candidates: `compatible_with` has exactly ONE distinct value across
 * all 680 gems, `allowed_types`/`excluded_types` are empty on all 551 entries of
 * the richer file, and the skill-gem extract contains zero supports.
 *
 * But the character payload carries the real thing. Every socketed support gem
 * ships with:
 *
 *   properties[0].name  "[SupportGem|Support], [Attack]"   ← the support's tags
 *   properties[1]       [SupportGemCategory|Category] = "Rapid Attacks"
 *   descrText           "...You cannot have multiple Support Gems of the same
 *                        Category socketed within one Skill."
 *   secDescrText        "Supports [Attack|Attacks], causing them to attack faster."
 *
 * That yields two checks that are grounded rather than invented:
 *
 * 1. **Duplicate category — a real legality violation.** The constraint is
 *    stated by the game in the gem's own description text, not inferred.
 * 2. **Tag mismatch — a support with nothing to act on.** Both the support's
 *    tags and the skill's tags come from the payload, so this is a measurement.
 *
 * Anything beyond those two is not claimed. Note PoE2 supports are NOT named
 * "X Support" as in PoE1 — they are `Fork`, `Impact`, `Concentrated Area`,
 * `Elemental Focus` — so name-pattern rules ported from PoE1 would silently
 * match nothing.
 */

import type { NinjaItemData, NinjaSkill } from '../model/types.js'

/** Strips PoE's `[Display|Text]` markup down to the display text. */
const TAG_PATTERN = /\[(?:[A-Za-z]+\|)?([A-Za-z ]+)\]/g

export interface SupportGem {
  name: string
  /** Tags the support carries, e.g. ['Attack'] or ['Warcry','Cold','Duration']. */
  tags: string[]
  /**
   * Support category. Two supports sharing one within a single skill is an
   * illegal setup — the game says so in the gem's own description.
   */
  category: string | null
  /** Plain-English summary from the gem, colour markup stripped. */
  description: string | null
  /** Stat lines the support grants. */
  stats: string[]
}

export interface SkillSetup {
  /** Active skill name. Null for meta/trigger containers that carry no active gem. */
  skill: string | null
  /** The active skill's own tags, read from its gem. */
  skillTags: string[]
  supports: SupportGem[]
}

function stripMarkup(text: string): string {
  return text.replace(TAG_PATTERN, '$1').replace(/\^x[0-9A-Fa-f]{6}/g, '').trim()
}

function tagsFromPropertyName(name: string): string[] {
  const out: string[] = []
  for (const match of name.matchAll(TAG_PATTERN)) {
    const tag = match[1]?.trim()
    // "Support" is the marker that this IS a support, not a property it acts on.
    if (tag && tag !== 'Support') out.push(tag)
  }
  return out
}

/**
 * A gem's tag line is the property that is nothing but bracketed tags and
 * carries no values.
 *
 * Detected structurally rather than by marker text, because active and support
 * gems format it differently:
 *   support  "[SupportGem|Support], [Attack]"
 *   active   "[Attack], [Projectile], [Cold], [Repeat|Repeatable]"
 * The active form has no marker at all. Requiring empty `values` is what
 * separates the tag line from `[Quality]`, which looks similar but carries
 * `[["+20%", 1]]`.
 */
const TAG_LINE = /^\s*\[[^\]]+\](\s*,\s*\[[^\]]+\])*\s*$/

/** Read a gem's tags and category out of its `properties` block. */
export function parseGem(data: NinjaItemData | undefined): { tags: string[]; category: string | null } {
  const properties = (data as { properties?: Array<{ name?: string; values?: unknown[] }> } | undefined)?.properties
  if (!Array.isArray(properties)) return { tags: [], category: null }

  let tags: string[] = []
  let category: string | null = null

  for (const property of properties) {
    const name = typeof property?.name === 'string' ? property.name : ''
    const hasValues = Array.isArray(property.values) && property.values.length > 0

    if (!tags.length && !hasValues && TAG_LINE.test(name)) {
      tags = tagsFromPropertyName(name)
    }
    if (name.includes('SupportGemCategory')) {
      const first = Array.isArray(property.values) ? property.values[0] : null
      const value = Array.isArray(first) ? first[0] : null
      if (typeof value === 'string' && value) category = value
    }
  }
  return { tags, category }
}

function gemStats(data: NinjaItemData | undefined): string[] {
  const tabs = (data as { gemTabs?: Array<{ pages?: Array<{ stats?: unknown }> }> } | undefined)?.gemTabs
  if (!Array.isArray(tabs)) return []
  const out: string[] = []
  for (const tab of tabs) {
    for (const page of tab?.pages ?? []) {
      if (Array.isArray(page?.stats)) {
        for (const stat of page.stats) if (typeof stat === 'string' && stat) out.push(stripMarkup(stat))
      }
    }
  }
  return out
}

/** Parse one entry of `charModel.skills[]` into an active skill plus its supports. */
export function parseSkillSetup(skill: NinjaSkill): SkillSetup {
  const gems = Array.isArray(skill?.allGems) ? skill.allGems : []
  let active: string | null = null
  let skillTags: string[] = []
  const supports: SupportGem[] = []

  for (const gem of gems) {
    const data = gem?.itemData
    const isSupport = (data as { support?: boolean } | undefined)?.support === true
    const name = gem?.name ?? data?.name ?? ''
    if (!name) continue

    const { tags, category } = parseGem(data)

    if (isSupport) {
      const descr = (data as { secDescrText?: string } | undefined)?.secDescrText
      supports.push({
        name,
        tags,
        category,
        description: typeof descr === 'string' && descr ? stripMarkup(descr) : null,
        stats: gemStats(data),
      })
    } else if (active === null) {
      active = name
      skillTags = tags
    }
  }

  return { skill: active, skillTags, supports }
}

export function parseAllSetups(skills: NinjaSkill[] | undefined): SkillSetup[] {
  return (Array.isArray(skills) ? skills : []).map(parseSkillSetup).filter((s) => s.supports.length > 0 || s.skill)
}

export type IssueKind = 'duplicate-category' | 'no-effect'

export interface SupportIssue {
  kind: IssueKind
  /** True only for `duplicate-category`, which the game itself forbids. */
  illegal: boolean
  supports: string[]
  message: string
}

export interface SetupValidation {
  skill: string | null
  skillTags: string[]
  supports: SupportGem[]
  issues: SupportIssue[]
  /** True when no rule this module can check is broken. */
  valid: boolean
  /** What was and was not checked, stated so the result cannot be over-read. */
  checked: string[]
}

const CHECKED = [
  'Duplicate support categories within one skill — the game forbids this and states it on every support gem.',
  'Supports whose tags share nothing with the skill, which therefore have nothing to act on.',
]

/**
 * Validate one skill setup.
 *
 * Only the two grounded checks above are performed. A support whose tags are
 * empty carries no requirement and is not judged — several real supports
 * (Deliberation, Elemental Focus, Efficiency) are genuinely untagged.
 */
export function validateSetup(setup: SkillSetup): SetupValidation {
  const issues: SupportIssue[] = []

  // --- duplicate category: an actual illegal configuration ------------------
  const byCategory = new Map<string, string[]>()
  for (const support of setup.supports) {
    if (!support.category) continue
    const list = byCategory.get(support.category) ?? []
    list.push(support.name)
    byCategory.set(support.category, list)
  }
  for (const [category, names] of byCategory) {
    if (names.length < 2) continue
    issues.push({
      kind: 'duplicate-category',
      illegal: true,
      supports: names,
      message: `${names.join(' and ')} are both in the "${category}" category. A skill cannot hold two supports of the same category, so this setup is not legal in game.`,
    })
  }

  // --- tag mismatch: legal, but doing nothing -------------------------------
  const skillTagSet = new Set(setup.skillTags)
  if (skillTagSet.size) {
    for (const support of setup.supports) {
      if (!support.tags.length) continue
      if (support.tags.some((t) => skillTagSet.has(t))) continue
      issues.push({
        kind: 'no-effect',
        illegal: false,
        supports: [support.name],
        message: `${support.name} is tagged ${support.tags.join(', ')}, but ${setup.skill ?? 'this skill'} is ${setup.skillTags.join(', ')}. Nothing overlaps, so the support has nothing to act on here.`,
      })
    }
  }

  return {
    skill: setup.skill,
    skillTags: setup.skillTags,
    supports: setup.supports,
    issues,
    valid: issues.length === 0,
    checked: CHECKED,
  }
}

/**
 * Validate a proposed combination given by name, using gem definitions
 * harvested from a character payload.
 *
 * Returns `null` when a named gem is not among the known definitions — an
 * unknown gem cannot be checked, and saying so beats assuming it is fine.
 */
export function validateByName(
  known: Map<string, SupportGem>,
  skill: string,
  skillTags: string[],
  supportNames: string[],
): { validation: SetupValidation; unknown: string[] } {
  const unknown: string[] = []
  const supports: SupportGem[] = []
  for (const name of supportNames) {
    const gem = known.get(name) ?? known.get(name.toLowerCase())
    if (gem) supports.push(gem)
    else unknown.push(name)
  }
  return { validation: validateSetup({ skill, skillTags, supports }), unknown }
}

/** Index every support gem definition seen in a payload, keyed by name. */
export function indexSupports(setups: SkillSetup[]): Map<string, SupportGem> {
  const out = new Map<string, SupportGem>()
  for (const setup of setups) {
    for (const support of setup.supports) {
      if (!out.has(support.name)) out.set(support.name, support)
    }
  }
  return out
}
