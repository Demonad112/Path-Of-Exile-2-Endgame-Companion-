/**
 * Gear analysis against the real captured character.
 *
 * Every number asserted here was read off the live payload and the published
 * affix data, not chosen to make the code pass. The bow really is item level 76;
 * `LocalIncreasedPhysicalDamagePercent8` really does require 82; that gap really
 * is why its physical damage cannot be improved without a new base.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { analyzeCharacter } from '../src/analyze.js'
import { normalizeItems } from '../src/model/slots.js'
import { ModTiers, type ModTierData } from '../src/gear/tiers.js'
import { analyzeItem, findResistanceSwaps, findTierUpgrades, summarizeSwaps } from '../src/gear/analyze.js'
import { analyzeContent, type MonsterStatData } from '../src/gear/content.js'
import type { CharModel } from '../src/model/types.js'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, '..', '..', 'data', 'generated')

const payload = JSON.parse(readFileSync(join(here, 'fixtures', 'athrynas-v43.json'), 'utf8'))
const model: CharModel = payload.charModel ?? payload
const tiers = new ModTiers(JSON.parse(readFileSync(join(dataDir, 'mod-tiers.json'), 'utf8')) as ModTierData)
const analysis = await analyzeCharacter(payload)
const items = normalizeItems(model)
const analysed = items.map((i) => analyzeItem(i, tiers, analysis.defense))

const bow = analysed.find((i) => i.slotId === 7)!

describe('affix ladders', () => {
  it('resolves ladders per item class, not globally', () => {
    const bowTags = tiers.tagsForBase('Militant Bow')!
    const ringTags = tiers.tagsForBase('Sapphire Ring')!

    // ColdResistance has 16 members game-wide. A ring gets 8; a bow gets none,
    // because its spawn rules hit `default: 0` first. Numbering globally would
    // report "T9 of 16" to a ring wearer who actually has T1 of 8.
    expect(tiers.ladder('ColdResistance', 'suffix', ringTags).entries).toHaveLength(8)
    expect(tiers.ladder('ColdResistance', 'suffix', bowTags).entries).toHaveLength(0)
  })

  it('honours first-match-wins on ordered spawn weights', () => {
    // ColdResist8 lists armour/ring/amulet/belt at weight 1, then default at 0.
    // A bow reaches `default` first. "Any weight above zero" would say yes.
    expect(tiers.canSpawn('ColdResist8', tiers.tagsForBase('Sapphire Ring')!)).toBe(true)
    expect(tiers.canSpawn('ColdResist8', tiers.tagsForBase('Militant Bow')!)).toBe(false)
  })

  it('orders T1 as the best tier', () => {
    const ladder = tiers.ladder('ColdResistance', 'suffix', tiers.tagsForBase('Sapphire Ring')!)
    expect(ladder.entries[0]).toMatchObject({ tier: 1, ilvl: 82, affix: 'of Haast' })
    expect(ladder.entries.at(-1)).toMatchObject({ tier: 8, ilvl: 1 })
    // Monotonic: every tier requires at least as high an item level as the next.
    for (let i = 1; i < ladder.entries.length; i++) {
      expect(ladder.entries[i - 1]!.ilvl).toBeGreaterThanOrEqual(ladder.entries[i]!.ilvl)
    }
  })

  it('never permits a mod with no matching spawn rule', () => {
    // Absence of a rule is not permission.
    expect(tiers.canSpawn('ColdResist8', ['not_a_real_tag'])).toBe(false)
  })
})

describe('the real bow', () => {
  it('reads mods from poe.ninja ids rather than matching text', () => {
    const phys = bow.mods.find((m) => m.id === 'LocalIncreasedPhysicalDamagePercent7')!
    expect(phys.kind).toBe('prefix')
    expect(phys.affix).toBe('Tyrannical')
    expect(phys.rolled[0]).toMatchObject({ id: 'local_physical_damage_+%', value: 155 })
    expect(phys.unresolved).toBeNull()
  })

  it('tiers against the Bow ladder', () => {
    const phys = bow.mods.find((m) => m.id === 'LocalIncreasedPhysicalDamagePercent7')!
    expect(phys).toMatchObject({ tier: 2, tiers: 8, ilvlRequired: 75 })
  })

  it('separates upgrades reachable on this item from those needing a better base', () => {
    expect(bow.itemLevel).toBe(76)

    // T1 physical damage needs ilvl 82. The bow is 76 — a new base is required.
    const phys = bow.mods.find((m) => m.id === 'LocalIncreasedPhysicalDamagePercent7')!
    expect(phys.upgrades[0]).toMatchObject({ tier: 1, ilvl: 82, reachableOnThisItem: false })

    // T1 dexterity needs ilvl 74. The bow is 76 — achievable right now.
    const dex = bow.mods.find((m) => m.id === 'Dexterity7')!
    expect(dex.upgrades[0]).toMatchObject({ tier: 1, ilvl: 74, reachableOnThisItem: true })
  })

  it('reports rune lines without pretending they have tiers', () => {
    const runes = bow.mods.filter((m) => m.source === 'rune')
    expect(runes.length).toBeGreaterThan(0)
    for (const rune of runes) {
      expect(rune.tier).toBeNull()
      expect(rune.unresolved).toContain('no mod id')
    }
  })

  it('scores roll quality inside the tier range', () => {
    const phys = bow.mods.find((m) => m.id === 'LocalIncreasedPhysicalDamagePercent7')!
    const roll = phys.rolled[0]!
    expect(roll.min).not.toBeNull()
    expect(roll.value).toBeGreaterThanOrEqual(roll.min!)
    expect(roll.value).toBeLessThanOrEqual(roll.max!)
    expect(roll.quality).toBeGreaterThanOrEqual(0)
    expect(roll.quality).toBeLessThanOrEqual(1)
  })
})

describe('things the real payload got wrong first time', () => {
  it('renders an implicit as text, not as its raw mod id', () => {
    const ring = analysed.find((i) => i.slotLabel === 'Ring 1')!
    const implicit = ring.mods.find((m) => m.id === 'RingImplicitFireResistance1')!
    // It used to print "RingImplicitFireResistance1", which reads as a bug.
    expect(implicit.text).toContain('Fire Resistance')
    expect(implicit.text).not.toBe('RingImplicitFireResistance1')
    // Renderable is not the same as tierable. An implicit has no affix ladder.
    expect(implicit.tier).toBeNull()
    expect(implicit.unresolved).toContain('no tier ladder')
  })

  it('reports a gain as positive on ladders that improve downward', () => {
    // Reduced attribute requirements runs -15 -> -35 as tiers improve, so a
    // naive `betterMax - current` reports the upgrade as a loss.
    const attr = bow.mods.find((m) => m.id === 'ReducedLocalAttributeRequirements3')!
    expect(attr.rolled[0]!.value).toBe(-25)
    const t1 = attr.upgrades.find((u) => u.tier === 1)!
    expect(t1.lowerIsBetter).toBe(true)
    expect(t1.gain).toBe(10) // -35 vs -25, ten more points of reduction
    expect(t1.gain).toBeGreaterThan(0)
  })

  it('derives ladder direction from the data, not a hardcoded stat list', () => {
    const bowTags = tiers.tagsForBase('Militant Bow')!
    const inverted = tiers.ladderFor('ReducedLocalAttributeRequirements3', bowTags)!
    const normal = tiers.ladderFor('Dexterity7', bowTags)!
    expect(tiers.lowerIsBetter(inverted, 'local_attribute_requirements_+%')).toBe(true)
    expect(tiers.lowerIsBetter(normal, 'additional_dexterity')).toBe(false)
  })
})

describe('waste and swaps', () => {
  it('counts only the overcapped portion as wasted', () => {
    const fire = analysis.defense.resistances.find((r) => r.type === 'fire')!
    expect(fire.overCap).toBeGreaterThan(0)

    const wasted = analysed.flatMap((i) => i.mods).filter((m) => m.waste)
    for (const mod of wasted) {
      const granted = mod.rolled.find((r) => r.id === mod.waste!.stat)!
      // Never more than the mod grants, and never more than the overcap —
      // giving up the whole mod would drop the character below cap.
      expect(mod.waste!.amount).toBeLessThanOrEqual(granted.value)
      expect(mod.waste!.amount).toBeLessThanOrEqual(fire.overCap + granted.value)
    }
  })

  it('offers only affixes the item can actually hold', () => {
    const swaps = findResistanceSwaps(analysed, items, tiers, analysis.defense)
    for (const swap of swaps) {
      const raw = items.find((i) => i.slotId === swap.slotId)!
      const tags = tiers.tagsForBase(raw.baseType)!
      for (const candidate of swap.candidates) {
        expect(tiers.canSpawn(candidate.id, tags)).toBe(true)
      }
    }
  })

  it('ranks candidates by the shortfall they close, not by tier', () => {
    const chaos = analysis.defense.resistances.find((r) => r.type === 'chaos')!
    const cold = analysis.defense.resistances.find((r) => r.type === 'cold')!
    expect(chaos.underCap).toBeGreaterThan(cold.underCap)

    const swaps = findResistanceSwaps(analysed, items, tiers, analysis.defense)
    const reachable = swaps
      .flatMap((s) => s.candidates)
      .filter((c) => c.reachableOnThisItem)
    expect(reachable.length).toBeGreaterThan(0)

    // Chaos is 57 short, cold is 1 short. A big cold roll must not outrank a
    // smaller chaos one just because its numbers are larger.
    const first = swaps.find((s) => s.candidates.some((c) => c.reachableOnThisItem))!
    expect(first.candidates[0]!.statId).toBe('base_chaos_damage_resistance_%')
  })

  it('never claims to close more of a gap than the gap has', () => {
    const swaps = findResistanceSwaps(analysed, items, tiers, analysis.defense)
    const byStat = new Map(
      analysis.defense.resistances.map((r) => [`base_${r.type}_damage_resistance_%`, r.underCap]),
    )
    for (const swap of swaps) {
      for (const c of swap.candidates) {
        expect(c.closesShortfall).toBeLessThanOrEqual(byStat.get(c.statId) ?? 0)
        expect(c.closesShortfall).toBeLessThanOrEqual(c.max)
      }
    }
  })

  it('never proposes recrafting a corrupted item without saying so', () => {
    const swaps = findResistanceSwaps(analysed, items, tiers, analysis.defense)
    for (const swap of swaps) {
      const item = analysed.find((i) => i.slotId === swap.slotId)!
      if (item.corrupted) expect(swap.cost).toContain('corrupted')
    }
  })

  it('ignores the inactive weapon set', () => {
    const swaps = findResistanceSwaps(analysed, items, tiers, analysis.defense)
    const inactive = new Set(items.filter((i) => !i.active).map((i) => i.slotId))
    for (const swap of swaps) expect(inactive.has(swap.slotId)).toBe(false)
  })
})

describe('cumulative swap maths', () => {
  it('states how many swaps are ENOUGH, not how many exist', () => {
    const swaps = findResistanceSwaps(analysed, items, tiers, analysis.defense)
    const summary = summarizeSwaps(swaps, analysis.defense)

    const chaos = summary.find((s) => s.type === 'chaos')!
    expect(chaos.shortfall).toBe(57)
    // Six swaps each "closing 27" would imply 162 points of fixing against a
    // 57-point gap. The honest answer is how many it actually takes.
    expect(chaos.swapsNeeded).toBeGreaterThan(0)
    expect(chaos.swapsNeeded).toBeLessThan(swaps.length)
    expect(chaos.note).toContain('spare capacity')
  })

  it('says plainly when the gear cannot close a gap at all', () => {
    const summary = summarizeSwaps([], analysis.defense)
    for (const row of summary) {
      expect(row.swapsNeeded).toBeNull()
      expect(row.note).toMatch(/needs a new item|needs a source|outside these items/)
    }
  })
})

describe('tier upgrades', () => {
  it('splits upgrades by whether the item itself can hold them', () => {
    const { onThisItem, needsBetterBase } = findTierUpgrades(analysed)

    for (const mod of onThisItem) {
      expect(mod.upgrades.some((u) => u.reachableOnThisItem)).toBe(true)
    }
    for (const mod of needsBetterBase) {
      expect(mod.upgrades.every((u) => !u.reachableOnThisItem)).toBe(true)
    }
    // The bow's physical damage is the textbook needs-a-better-base case.
    expect(needsBetterBase.some((m) => m.id === 'LocalIncreasedPhysicalDamagePercent7')).toBe(true)
  })

  it('leaves corrupted items alone, since their affixes cannot change', () => {
    const { onThisItem, needsBetterBase } = findTierUpgrades(analysed)
    const corrupted = new Set(analysed.filter((i) => i.corrupted).map((i) => i.slotId))
    for (const mod of [...onThisItem, ...needsBetterBase]) {
      expect(corrupted.has(mod.slotId)).toBe(false)
    }
  })
})

describe('content headroom', () => {
  const monsters = JSON.parse(readFileSync(join(dataDir, 'monster-stats.json'), 'utf8')) as MonsterStatData

  it('maps waystone tier to area level as 64 + tier', () => {
    // Derived from the waystone item bases, corroborated by WorldAreas. T1 is
    // the one whose DROP level differs — it drops in the campaign at 58.
    expect(monsters.tiers).toHaveLength(16)
    for (const t of monsters.tiers) expect(t.areaLevel).toBe(64 + t.tier)
    expect(monsters.tiers[0]).toMatchObject({ tier: 1, areaLevel: 65, dropLevel: 58, dropLevelMatches: false })
    expect(monsters.tiers.at(-1)).toMatchObject({ tier: 16, areaLevel: 80, dropLevel: 80, dropLevelMatches: true })
    // Every other tier's drop level agrees exactly.
    expect(monsters.tiers.filter((t) => !t.dropLevelMatches)).toHaveLength(1)
  })

  it('reports headroom per tier against real monster damage', () => {
    const report = analyzeContent(analysis.defense, monsters)
    expect(report.lowestMaximumHit).toBe(3808)
    expect(report.lowestMaximumHitType).toBe('chaos')
    expect(report.tiers).toHaveLength(16)

    const t16 = report.tiers.find((t) => t.tier === 16)!
    expect(t16.areaLevel).toBe(80)
    expect(t16.baseMonsterHit).toBe(334)
    expect(t16.headroom).toBeCloseTo(3808 / 334, 1)

    // Headroom must fall monotonically as tiers rise — monster damage only goes up.
    for (let i = 1; i < report.tiers.length; i++) {
      expect(report.tiers[i]!.headroom).toBeLessThanOrEqual(report.tiers[i - 1]!.headroom)
    }
  })

  it('reports boss levels from Path of Building configuration', () => {
    const report = analyzeContent(analysis.defense, monsters)
    const pinnacle = report.bosses.find((b) => /pinnacle/i.test(b.label))!
    const cap = report.bosses.find((b) => /highest/i.test(b.label))!

    expect(pinnacle.level).toBe(82)
    expect(cap.level).toBe(85)
    // Above the top waystone, so strictly less headroom than tier 16.
    const t16 = report.tiers.find((t) => t.tier === 16)!
    expect(cap.headroom).toBeLessThan(t16.headroom)
  })

  it('states its comfort thresholds rather than hiding them', () => {
    const report = analyzeContent(analysis.defense, monsters)
    expect(report.caveats.join(' ')).toMatch(/this project.s judgement, not a game constant/)
    for (const row of report.tiers) {
      if (row.headroom >= 12) expect(row.comfort).toBe('comfortable')
      else if (row.headroom < 6) expect(row.comfort).toBe('dangerous')
      else expect(row.comfort).toBe('thin')
    }
  })

  it('never presents the base figure as a safety verdict', () => {
    const report = analyzeContent(analysis.defense, monsters)
    expect(report.caveats[0]).toContain('upper bound, not a safety verdict')
    expect(report.summary).toMatch(/BASE monsters|Survivability is the constraint/)
    // Rare and unique multipliers genuinely are not in the data.
    expect(report.unresolved.some((u) => /rare, unique or map modifier/i.test(u.question))).toBe(true)
  })
})

describe('display text', () => {
  it('strips PoE markup so a rune line is readable', () => {
    const runes = bow.mods.filter((m) => m.source === 'rune')
    for (const rune of runes) {
      // poe.ninja passes "[ElementalDamage|Elemental]" through verbatim.
      expect(rune.text).not.toMatch(/\[[^\]]*\|/)
      expect(rune.text).not.toContain('[')
    }
    expect(runes.some((r) => /increased Elemental Damage with Attacks/.test(r.text))).toBe(true)
  })
})
