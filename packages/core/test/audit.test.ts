/**
 * Checks over payload the rest of the analysis never read.
 *
 * Every number here was read off the real character before the test was written.
 * Strength really is 47 against a requirement of 45; the jewels really are three
 * Emeralds; spirit really is 159 with 79 unreserved.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { importPobExport } from '../src/pob/export.js'
import { ModTiers, type ModTierData } from '../src/gear/tiers.js'
import {
  MAX_GEM_QUALITY,
  TIGHT_ATTRIBUTE_MARGIN,
  auditAttributes,
  auditCharacter,
  auditGemQuality,
  auditSpirit,
  findEmptySockets,
} from '../src/gear/audit.js'
import { normalizeItems } from '../src/model/slots.js'
import type { CharModel } from '../src/model/types.js'

const payload = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/athrynas-v43.json', import.meta.url)), 'utf8'),
)
const model: CharModel = payload.charModel ?? payload
const tiers = new ModTiers(
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../data/generated/mod-tiers.json', import.meta.url)), 'utf8'),
  ) as ModTierData,
)
const pob = await importPobExport(model.pathOfBuildingExport!)
const audit = auditCharacter(model, tiers, pob.playerStats)

describe('jewels', () => {
  it('resolves jewel modifiers, which the item-domain filter used to drop', () => {
    // Jewel affixes are RePoE domain `misc`, not `item`. Filtering to `item`
    // left all twelve of these unresolvable and the jewels invisible.
    expect(audit.jewels).toHaveLength(3)
    for (const jewel of audit.jewels) {
      expect(jewel.baseType).toBe('Emerald')
      expect(jewel.mods.length).toBeGreaterThan(0)
      for (const mod of jewel.mods) {
        expect(mod.tier).not.toBeNull()
        expect(mod.text).not.toBe(mod.id)
      }
    }
  })

  it('tiers a jewel against jewel spawn rules, not gear ones', () => {
    const bowDamage = audit.jewels.flatMap((j) => j.mods).filter((m) => m.id === 'JewelBowDamage')
    expect(bowDamage.length).toBe(3)
    // JewelBowDamage spawns on `dexjewel`, which an Emerald carries.
    expect(tiers.canSpawn('JewelBowDamage', tiers.tagsForBase('Emerald')!)).toBe(true)
    // …and not on a bow, despite the name.
    expect(tiers.canSpawn('JewelBowDamage', tiers.tagsForBase('Militant Bow')!)).toBe(false)
  })

  it('never calls a jewel modifier wasted', () => {
    // Overcap waste is a gear-swap concept: it assumes a competing affix slot to
    // trade the modifier for. A jewel has none, so the claim would not hold.
    for (const mod of audit.jewels.flatMap((j) => j.mods)) {
      expect(mod.waste).toBeNull()
    }
  })
})

describe('empty sockets', () => {
  it('reports none when every socket is filled', () => {
    // Six items carry sockets on this character and all are filled.
    expect(audit.emptySockets).toEqual([])
  })

  it('counts an empty socket when one exists', () => {
    const items = normalizeItems(model)
    const withHole = items.map((item) =>
      item.slotId === 7
        ? {
            ...item,
            raw: {
              ...item.raw,
              itemData: { ...item.raw.itemData!, sockets: [{}, {}], socketedItems: [{}] },
            },
          }
        : item,
    ) as typeof items

    const found = findEmptySockets(withHole)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ slotId: 7, sockets: 2, filled: 1, empty: 1 })
  })
})

describe('gem quality', () => {
  it('flags levelled gems below maximum quality', () => {
    expect(MAX_GEM_QUALITY).toBe(20)
    const names = audit.gemQuality.map((g) => g.gem)
    // Two Ice Shot copies sit at 0% while a third is at 20%.
    expect(names.filter((n) => n === 'Ice Shot')).toHaveLength(2)
    for (const gem of audit.gemQuality) expect(gem.quality).toBeLessThan(MAX_GEM_QUALITY)
  })

  it('proves the gem can be qualited by pointing at another copy', () => {
    const iceShot = audit.gemQuality.find((g) => g.gem === 'Ice Shot')!
    expect(iceShot.bestElsewhere).toBe(20)
  })

  it('ignores support gems, which report level 0 and quality 0 by convention', () => {
    // Treating those as unqualited would flag every support on every character.
    const supports = ['Rapid Attacks II', 'Deliberation', 'Longshot II', 'Ice Bite II']
    for (const name of supports) {
      expect(audit.gemQuality.some((g) => g.gem === name)).toBe(false)
    }
  })

  it('names a triggered setup by its own gem rather than "unknown"', () => {
    // Five of eleven setups carry no dps block — Marks, Mirage Archer — and were
    // all rendering as "unknown skill".
    for (const gem of audit.gemQuality) {
      expect(gem.skill).not.toMatch(/unknown/i)
    }
    expect(audit.gemQuality.some((g) => g.skill === 'Mirage Archer')).toBe(true)
  })
})

describe('attribute headroom', () => {
  it('reports how close each attribute is to its requirement', () => {
    const str = audit.attributes.find((a) => a.attribute === 'strength')!
    expect(str).toMatchObject({ have: 47, required: 45, headroom: 2 })
    // Two points spare: losing any strength source unequips something.
    expect(str.tight).toBe(true)
    expect(TIGHT_ATTRIBUTE_MARGIN).toBe(10)
  })

  it('puts the tightest attribute first', () => {
    const headrooms = audit.attributes.map((a) => a.headroom)
    expect([...headrooms].sort((a, b) => a - b)).toEqual(headrooms)
    expect(audit.attributes[0]!.attribute).toBe('strength')
  })

  it('does not call excess dexterity waste', () => {
    // 93 points over requirement, but dexterity grants accuracy and evasion —
    // calling it waste would be a judgement about build direction.
    const dex = audit.attributes.find((a) => a.attribute === 'dexterity')!
    expect(dex.headroom).toBe(93)
    expect(dex.tight).toBe(false)
    expect(JSON.stringify(dex)).not.toMatch(/waste|excess/i)
  })

  it('returns nothing rather than guessing when the export is absent', () => {
    // poe.ninja reports attributes but not what the gear requires.
    expect(auditAttributes(null)).toEqual([])
  })
})

describe('spirit reservation', () => {
  it('reports reserved and unreserved spirit', () => {
    expect(audit.spirit).toMatchObject({ total: 159, reserved: 80, unreserved: 79 })
    expect(audit.spirit!.unreservedPercent).toBeCloseTo(49.7, 1)
  })

  it('needs the export, and says so rather than reporting zero', () => {
    expect(auditSpirit(null)).toBeNull()
    const withoutPob = auditCharacter(model, tiers, null)
    expect(withoutPob.spirit).toBeNull()
    expect(withoutPob.unavailable.join(' ')).toMatch(/spirit/i)
    expect(withoutPob.unavailable.join(' ')).toMatch(/Path of Building export/)
  })
})

describe('degrading without data', () => {
  it('still checks what it can when the affix data is missing', () => {
    const partial = auditCharacter(model, null, pob.playerStats)
    expect(partial.jewels).toEqual([])
    expect(partial.unavailable.join(' ')).toMatch(/Jewel modifier tiers/)
    // Sockets, gem quality, attributes and spirit need no affix data.
    expect(partial.gemQuality.length).toBeGreaterThan(0)
    expect(partial.attributes.length).toBe(3)
    expect(partial.spirit).not.toBeNull()
  })

  it('reports nothing unavailable when everything is present', () => {
    expect(audit.unavailable).toEqual([])
  })

  it('survives a payload with none of these fields', () => {
    const empty = auditCharacter({ skills: [], items: [] } as unknown as CharModel, tiers, null)
    expect(empty.jewels).toEqual([])
    expect(empty.emptySockets).toEqual([])
    expect(empty.gemQuality).toEqual([])
    expect(empty.spirit).toBeNull()
  })
})

describe('gem quality without a model', () => {
  it('returns an empty list rather than throwing', () => {
    expect(auditGemQuality({} as CharModel)).toEqual([])
  })
})
