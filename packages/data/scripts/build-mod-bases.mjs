/**
 * Build mod-to-item-class compatibility from RePoE-fork.
 *
 * ## Correcting an earlier claim
 *
 * An earlier version of this project stated that mod-to-item-base compatibility
 * "is not derivable from the available data". That was true of the extracted
 * files in Demonad112/poe2-mcp — `type_key` looks like an index into spawn_tags
 * and is not, mapping attack speed to belts only and flat energy shield to bows
 * and to non-item tags. It was NOT true in general: RePoE-fork publishes the
 * linkage directly, and this script uses it. The old claim is retracted.
 *
 * Source: https://repoe-fork.github.io/poe2/mods_by_base.min.json
 * Shape:  { "<Item Class>": { "<tag,set>": { bases: [...], mods: {
 *            prefix|suffix|corrupted|unique: { "<family>": { "<ModId>": level } } } } } }
 *
 * Mod ids share a namespace with data/game/mods/mods.json (2,795 of RePoE's
 * 3,450 ids are present there), so this joins cleanly onto the tier artifact
 * built by build-mods.mjs. The ids RePoE has and that one lacks are mods whose
 * stats the stat-description table could not render.
 *
 * Usage: node packages/data/scripts/build-mod-bases.mjs [url-or-path]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = process.argv[2] ?? 'https://repoe-fork.github.io/poe2/mods_by_base.min.json'
const outDir = join(here, '..', 'generated')
const outPath = join(outDir, 'mod-bases.json')

const raw = /^https?:/.test(source)
  ? await fetch(source).then((r) => {
      if (!r.ok) throw new Error(`${source} returned ${r.status}`)
      return r.json()
    })
  : JSON.parse(readFileSync(source, 'utf8'))

/** Item classes that are not equippable gear; nothing here needs them. */
const SKIP = new Set([
  '',
  'Stackable Currency',
  'Currency',
  'Incubators',
  'Delve Socketable Currency',
  'Delve Stackable Socketable Currency',
  'Quest Items',
  'Map Fragments',
  'Skill Gems',
  'Support Gems',
  'Waystones',
  'Breachstones',
  'Vault Keys',
  'Atlas Upgrade Items',
  'Contracts',
  'Blueprints',
  'Expedition Logbooks',
  'Expedition Logbook',
  'Omen',
  'Memories',
  'Trial Coins',
])

/** modId -> { kinds: Set, classes: Set } */
const byMod = new Map()
const classes = new Set()

for (const [itemClass, tagSets] of Object.entries(raw)) {
  if (SKIP.has(itemClass)) continue
  classes.add(itemClass)

  for (const entry of Object.values(tagSets)) {
    for (const [kind, families] of Object.entries(entry?.mods ?? {})) {
      // `unique` mods only appear on specific uniques, not on rare crafting.
      if (kind === 'unique') continue
      for (const ids of Object.values(families ?? {})) {
        if (!ids || typeof ids !== 'object') continue
        for (const modId of Object.keys(ids)) {
          let record = byMod.get(modId)
          if (!record) byMod.set(modId, (record = { kinds: new Set(), classes: new Set() }))
          record.kinds.add(kind)
          record.classes.add(itemClass)
        }
      }
    }
  }
}

const mods = {}
for (const [modId, record] of byMod) {
  mods[modId] = { k: [...record.kinds].sort(), c: [...record.classes].sort() }
}

// --- base name -> item class ------------------------------------------------
// Needed to go from an equipped item ("Militant Bow") to the class whose mod
// pool applies ("Bows"). Without it the compatibility table cannot be reached
// from a real character.
// The two files disagree on class naming: base_items says "Bow", "Amulet",
// "Body Armour"; mods_by_base says "Bows", "Amulets", "Body Armours". Bridge
// them by trying the exact name, then a plural, then a couple of irregulars.
// Anything still unmatched is reported rather than silently dropped — an
// earlier version filtered on exact match alone and quietly lost every weapon.
const IRREGULAR = { Focus: 'Foci', Quarterstaff: 'Quarterstaves' }

function toModClass(singular) {
  if (classes.has(singular)) return singular
  const irregular = IRREGULAR[singular]
  if (irregular && classes.has(irregular)) return irregular
  for (const candidate of [`${singular}s`, `${singular}es`]) {
    if (classes.has(candidate)) return candidate
  }
  return null
}

const baseSource = 'https://repoe-fork.github.io/poe2/base_items.min.json'
const baseNameToClass = {}
const unmatchedClasses = new Set()

try {
  const baseItems = await fetch(baseSource).then((r) => {
    if (!r.ok) throw new Error(`${baseSource} returned ${r.status}`)
    return r.json()
  })
  for (const item of Object.values(baseItems)) {
    const name = item?.name
    const singular = item?.item_class
    if (typeof name !== 'string' || typeof singular !== 'string') continue
    const mapped = toModClass(singular)
    if (mapped) baseNameToClass[name] = mapped
    else unmatchedClasses.add(singular)
  }
  console.log(`base names     ${Object.keys(baseNameToClass).length} mapped to a mod-pool class`)
  if (unmatchedClasses.size) {
    console.log(`unmapped       ${unmatchedClasses.size} base_items classes have no mod pool (currency, gems, quest items and the like)`)
  }
} catch (err) {
  console.warn(`WARNING: base item names unavailable (${err.message}). Item-class lookup by base name will not work.`)
}

const artifact = {
  version: 1,
  generatedFrom: source,
  baseNamesFrom: baseSource,
  baseNameToClass,
  note:
    'Which item classes each modifier can roll on, and as prefix or suffix. Unique-only mods are excluded: they appear on specific uniques rather than through crafting. Absence of a mod id here means RePoE does not list it, not that it is illegal everywhere.',
  itemClasses: [...classes].sort(),
  modCount: Object.keys(mods).length,
  mods,
}

mkdirSync(outDir, { recursive: true })
const json = JSON.stringify(artifact)
writeFileSync(outPath, json)

console.log(`item classes   ${artifact.itemClasses.length}`)
console.log(`mods mapped    ${artifact.modCount}`)
console.log(`size           ${(json.length / 1024).toFixed(0)} KB raw · ${(gzipSync(json, { level: 9 }).length / 1024).toFixed(0)} KB gzipped`)
console.log(`written        ${outPath}`)
