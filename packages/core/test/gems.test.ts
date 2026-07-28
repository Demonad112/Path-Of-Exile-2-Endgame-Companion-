/**
 * Support-gem parsing and validation, against the real character payload.
 *
 * The rules checked here come from the payload itself — each support ships its
 * own tags, its category, and the game's stated rule that a skill cannot hold
 * two supports of the same category. Nothing is inferred from gem names, which
 * matters because PoE2 supports are not named "X Support" as in PoE1.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { unwrapCharModel } from '../src/analyze.js'
import { indexSupports, parseAllSetups, parseSkillSetup, validateByName, validateSetup } from '../src/gems/index.js'

const model = unwrapCharModel(
  JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/athrynas-v43.json', import.meta.url)), 'utf8')),
)
const setups = parseAllSetups(model.skills)
const known = indexSupports(setups)
const iceShot = setups.find((s) => s.skill === 'Ice Shot')!

describe('parsing real gem data from the payload', () => {
  it('finds every skill setup and its supports', () => {
    expect(setups.length).toBeGreaterThanOrEqual(11)
    const totalSupports = setups.reduce((n, s) => n + s.supports.length, 0)
    expect(totalSupports).toBe(47)
  })

  it('reads a support’s own tags and category', () => {
    const rapid = known.get('Rapid Attacks II')!
    expect(rapid.tags).toEqual(['Attack'])
    expect(rapid.category).toBe('Rapid Attacks')
    expect(rapid.description).toContain('Attacks')
    expect(rapid.stats.some((s) => /increased Attack Speed/i.test(s))).toBe(true)
  })

  it('strips PoE display markup rather than leaking it', () => {
    for (const support of known.values()) {
      expect(support.description ?? '').not.toMatch(/\[[A-Za-z]+\|/)
      for (const stat of support.stats) expect(stat).not.toMatch(/\[[A-Za-z]+\|/)
    }
  })

  it('handles multi-tag and untagged supports', () => {
    // Real multi-tag support.
    expect(known.get('Ice Bite II')!.tags).toEqual(['Warcry', 'Cold', 'Duration'])
    // Genuinely untagged supports exist and must not be judged.
    expect(known.get('Deliberation')!.tags).toEqual([])
    expect(known.get('Elemental Focus')!.tags).toEqual([])
  })

  it('reads the active skill’s own tags', () => {
    expect(iceShot.skillTags).toEqual(expect.arrayContaining(['Attack', 'Projectile']))
    expect(iceShot.supports).toHaveLength(5)
  })
})

describe('validating the real character', () => {
  it('finds no illegal setup — the game would not have allowed one', () => {
    for (const setup of setups) {
      const illegal = validateSetup(setup).issues.filter((i) => i.illegal)
      expect(illegal, `${setup.skill} reported an illegal setup: ${JSON.stringify(illegal)}`).toEqual([])
    }
  })

  it('accepts Ice Shot’s real support set', () => {
    const result = validateSetup(iceShot)
    expect(result.issues.filter((i) => i.illegal)).toEqual([])
  })
})

describe('catching a genuinely illegal combination', () => {
  it('rejects two supports sharing a category', () => {
    // Both are really in the "Rapid Attacks" category on this character.
    const a = known.get('Rapid Attacks II')!
    const b = { ...known.get('Rapid Attacks I') ?? a, name: 'Rapid Attacks I' }

    const result = validateSetup({ skill: 'Ice Shot', skillTags: iceShot.skillTags, supports: [a, b] })
    const violation = result.issues.find((i) => i.kind === 'duplicate-category')!

    expect(violation).toBeDefined()
    expect(violation.illegal).toBe(true)
    expect(violation.supports).toEqual(expect.arrayContaining(['Rapid Attacks II', 'Rapid Attacks I']))
    expect(violation.message).toContain('not legal')
    expect(result.valid).toBe(false)
  })
})

describe('catching a support with nothing to act on', () => {
  it('flags a Spell support on an Attack skill', () => {
    // Rapid Casting II is tagged [Spell]; Ice Shot is an Attack.
    const spellSupport = known.get('Rapid Casting II')!
    expect(spellSupport.tags).toEqual(['Spell'])

    const result = validateSetup({ skill: 'Ice Shot', skillTags: iceShot.skillTags, supports: [spellSupport] })
    const issue = result.issues.find((i) => i.kind === 'no-effect')!

    expect(issue).toBeDefined()
    // Legal to socket — it just does nothing.
    expect(issue.illegal).toBe(false)
    expect(issue.message).toContain('Spell')
  })

  it('does not judge an untagged support', () => {
    const result = validateSetup({
      skill: 'Ice Shot',
      skillTags: iceShot.skillTags,
      supports: [known.get('Deliberation')!],
    })
    expect(result.issues).toEqual([])
  })

  it('accepts a partial tag overlap', () => {
    // Ice Bite II is Warcry+Cold+Duration; Ice Shot is Cold among others.
    const result = validateSetup({
      skill: 'Ice Shot',
      skillTags: iceShot.skillTags,
      supports: [known.get('Ice Bite II')!],
    })
    expect(result.issues).toEqual([])
  })
})

describe('refusing to guess', () => {
  it('reports unknown gems instead of assuming they are fine', () => {
    const { validation, unknown } = validateByName(known, 'Ice Shot', iceShot.skillTags, [
      'Rapid Attacks II',
      'Not A Real Gem',
    ])
    expect(unknown).toEqual(['Not A Real Gem'])
    expect(validation.supports.map((s) => s.name)).toEqual(['Rapid Attacks II'])
  })

  it('states what was checked on every result', () => {
    const result = validateSetup(iceShot)
    expect(result.checked).toHaveLength(2)
    expect(result.checked.join(' ')).toMatch(/same category|Duplicate support categories/i)
  })
})
