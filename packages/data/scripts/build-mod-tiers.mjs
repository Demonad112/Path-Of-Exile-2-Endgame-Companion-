/**
 * Build the mod TIER artifact: real affix ladders, per item class, with the
 * item level each tier needs.
 *
 * Sources, both from RePoE-fork:
 *   https://repoe-fork.github.io/poe2/mods.min.json           16,678 mods
 *   https://repoe-fork.github.io/pob-data/poe2/ModItem.min.json  PoB's own view
 *   https://repoe-fork.github.io/poe2/base_items.min.json     base -> tags
 *
 * ## Why this replaces the tier numbers in mods.json
 *
 * build-mods.mjs grouped tier families by `stat_id | generation_type`. That is
 * WRONG, and measurably so: 375 of 1,103 families had a "tier 1" rolling lower
 * than their bottom tier. The cause is that unrelated affix ladders share a
 * stat id. `base_resist_all_elements_%` as a SUFFIX covers both the real
 * all-resistance ladder and `HandWrapsArmourAppliesToElementalDamage1-5`
 * ("of Covering", "of Sheathing", …), which is a Hand Wraps mod that happens to
 * touch the same stat. Grouped together, they produce nonsense tiers.
 *
 * RePoE publishes the ladder key directly as `groups`, so none of that has to be
 * inferred. pob-data publishes the same thing as `group`, and where the two
 * differ pob-data is MORE specific — it splits `AlliesInPresenceAllResistances`
 * out of `AllResistances`, which matters for exactly the reason the companion
 * passive-node bug mattered: a mod that buffs your allies is not a mod that
 * buffs you. pob-data's group wins when present.
 *
 * ## Jewels live in the `misc` domain
 *
 * Jewel affixes are not domain `item` — they are `misc`, with spawn tags like
 * `dexjewel` that match the jewel base's own tags (an Emerald carries
 * ["jewel","dexjewel","default"]). Filtering to domain `item` alone left every
 * jewel modifier unresolvable, which is why three socketed jewels carrying
 * twelve real modifiers were invisible to the analysis. Both domains are kept,
 * and the per-class ladder logic works unchanged because the join is on tags.
 *
 * ## Tiers are per item class, not global
 *
 * `ColdResistance` has 16 members across the game, but only 8 can appear on a
 * ring — the rest are the Hand Wraps ladder. Numbering tiers globally would tell
 * a ring wearer they have "T9 of 16" when they have T1 of 8. So the artifact
 * carries spawn tags per mod and the ladder is resolved against the item's own
 * base tags at query time.
 *
 * Spawn weights are ordered and FIRST MATCH WINS — `ColdResist8` lists
 * armour/ring/amulet/belt at weight 1 then `default` at 0, so a bow (whose tags
 * reach `default` first) cannot roll it. Checking "is any weight > 0" instead
 * would wrongly say yes.
 *
 * ## T1 is the best
 *
 * Confirmed against the data rather than assumed: within a group, ordering by
 * `required_level` descending puts the biggest roll first in 97% of families,
 * and is monotonic in level in 99.7%. The exceptions are stats where a more
 * negative number is better (reduced attribute requirements, reduced bleed
 * duration), which are monotonic too — just inverted. Level order is therefore
 * the tier order, and roll magnitude is never used to derive it.
 *
 * Usage: node packages/data/scripts/build-mod-tiers.mjs [cacheDir]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'generated')
const cacheDir = process.argv[2] ?? join(outDir, '.cache')

const SOURCES = {
  mods: 'https://repoe-fork.github.io/poe2/mods.min.json',
  bases: 'https://repoe-fork.github.io/poe2/base_items.min.json',
  pobMods: 'https://repoe-fork.github.io/pob-data/poe2/ModItem.min.json',
}

/** Fetch once, cache on disk — these are tens of megabytes. */
async function load(name, url) {
  mkdirSync(cacheDir, { recursive: true })
  const path = join(cacheDir, `${name}.json`)
  if (!existsSync(path)) {
    process.stderr.write(`fetching ${url}\n`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url} returned ${res.status}`)
    writeFileSync(path, await res.text())
  }
  return JSON.parse(readFileSync(path, 'utf8'))
}

const [mods, bases, pobMods] = await Promise.all(
  Object.entries(SOURCES).map(([name, url]) => load(name, url)),
)

// --- base name -> spawn tags -------------------------------------------------
// Keyed by display name because that is what a character payload carries
// ("Militant Bow"), not the metadata path.
const baseTags = {}
const baseClass = {}
for (const entry of Object.values(bases)) {
  if (!entry?.name || !Array.isArray(entry.tags)) continue
  // Later duplicates are higher-tier bases of the same name; tags match.
  if (!baseTags[entry.name]) {
    baseTags[entry.name] = entry.tags
    baseClass[entry.name] = entry.item_class ?? null
  }
}

// --- mods --------------------------------------------------------------------
const out = {}
let skippedDomain = 0
let skippedEssence = 0
let skippedNoGroup = 0

/**
 * Non-affix item mods, kept for DISPLAY ONLY.
 *
 * Base implicits live under generation type `unique` alongside actual unique-item
 * mods — `RingImplicitFireResistance1` is classified that way. Without them, a
 * ring's implicit renders as its raw mod id, which looks like a bug and tells the
 * reader nothing. They are stored with kind `o` so they can never be tiered:
 * an implicit is not a prefix or a suffix and has no craftable ladder here.
 */
const DISPLAY_ONLY = new Set(['unique', 'corrupted'])
const displayOnly = {}

/** `item` covers gear; `misc` is where jewel affixes live. */
const KEPT_DOMAINS = new Set(['item', 'misc'])

for (const [id, mod] of Object.entries(mods)) {
  if (!KEPT_DOMAINS.has(mod.domain)) {
    skippedDomain++
    continue
  }
  if (mod.generation_type !== 'prefix' && mod.generation_type !== 'suffix') {
    if (DISPLAY_ONLY.has(mod.generation_type) && (pobMods[id]?.['1'] || mod.text)) {
      displayOnly[id] = {
        t: 'o',
        name: mod.name || null,
        text: pobMods[id]?.['1'] ?? mod.text,
        stats: (mod.stats ?? []).map((s) => [s.id, s.min, s.max]),
      }
    }
    skippedDomain++
    continue
  }
  // Essence mods do not appear through normal crafting, so including them would
  // let an item validate against a tier it can never actually reach.
  if (mod.is_essence_only) {
    skippedEssence++
    continue
  }

  const group = pobMods[id]?.group ?? mod.groups?.[0]
  if (!group) {
    skippedNoGroup++
    continue
  }

  // Ordered, first-match-wins. Kept verbatim rather than reduced to a tag list,
  // because a trailing `default: 0` is what makes most mods class-specific.
  const spawn = (mod.spawn_weights ?? []).map((w) => [w.tag, w.weight])

  out[id] = {
    g: group,
    t: mod.generation_type === 'prefix' ? 'p' : 's',
    lvl: mod.required_level ?? 0,
    name: mod.name || null,
    // The rolled stat ids are what a character payload reports, so they are the
    // join key for "what did this mod actually give me".
    stats: (mod.stats ?? []).map((s) => [s.id, s.min, s.max]),
    text: pobMods[id]?.['1'] ?? mod.text ?? null,
    spawn,
  }
}

const artifact = {
  version: 1,
  generatedFrom: Object.values(SOURCES),
  note:
    'Ladders are keyed by group and resolved per item class at query time — spawn weights are ordered and ' +
    'first-match-wins. T1 is the highest tier, ordered by required_level descending.',
  baseTags,
  baseClass,
  mods: out,
  displayOnly,
}

mkdirSync(outDir, { recursive: true })
const json = JSON.stringify(artifact)
writeFileSync(join(outDir, 'mod-tiers.json'), json)

// --- report ------------------------------------------------------------------
const groups = new Set(Object.values(out).map((m) => `${m.g}|${m.t}`))
console.log(`source mods        ${Object.keys(mods).length}`)
console.log(`  wrong domain     ${skippedDomain} (not a craftable item prefix/suffix)`)
console.log(`  essence only     ${skippedEssence} (not reachable by normal crafting)`)
console.log(`  no group         ${skippedNoGroup}`)
const jewelMods = Object.entries(out).filter(([id]) => mods[id]?.domain === 'misc').length
console.log(`kept               ${Object.keys(out).length} across ${groups.size} ladders`)
console.log(`  of which jewel   ${jewelMods} (domain misc — these were previously dropped entirely)`)
console.log(`display-only mods  ${Object.keys(displayOnly).length} (implicits, corrupted, unique — never tiered)`)
console.log(`bases              ${Object.keys(baseTags).length} names with spawn tags`)
console.log(
  `size               ${(json.length / 1024 / 1024).toFixed(2)} MB raw · ${(gzipSync(json, { level: 9 }).length / 1024 / 1024).toFixed(2)} MB gzipped`,
)
console.log(`written            ${join(outDir, 'mod-tiers.json')}`)
