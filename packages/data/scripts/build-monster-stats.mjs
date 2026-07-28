/**
 * Build the monster/area artifact backing the survivability-versus-content view.
 *
 * Sources:
 *   https://repoe-fork.github.io/poe2/default_monster_stats.min.json
 *   https://repoe-fork.github.io/pob-data/poe2/WorldAreas.min.json
 *
 * ## A correction
 *
 * An earlier version of this script asserted that map tier is not derivable,
 * because WorldAreas carries no tier field and its 158 endgame maps use only six
 * distinct levels. That was a real observation and the wrong conclusion: I had
 * looked in one place.
 *
 * Waystones are ITEMS. `base_items.json` carries `Waystone (Tier 1..16)` with
 * item_class `Map` and a `drop_level`, and for tiers 2-16 that level equals
 * **64 + tier** exactly. Tier 1 lists 58 — that is where the item starts
 * dropping in the late campaign, not the map's own level — and 64 + 1 = 65,
 * which WorldAreas independently confirms as a real map area level.
 *
 * Corroboration, all from separate places in the data:
 *   - drop_level == 64 + tier for all 15 of tiers 2-16
 *   - WorldAreas' real map levels 65/74/75/79/80 are exactly tiers 1/10/11/15/16
 *   - the highest waystone, T16, sits at 80, the highest map level in WorldAreas
 *   - Misc.mapLevelLifeMult is keyed 66-90, starting one above T1
 *
 * ## Boss levels come from Path of Building's own configuration
 *
 * Quoted from PathOfBuildingCommunity/PathOfBuilding-PoE2,
 * src/Modules/ConfigOptions.lua, the `enemyLevel` tooltip:
 *
 *   "The maximum level for normal enemies and all bosses is 85."
 *   "The default level of normal enemies and bosses scales with player level
 *    unless manually set."
 *   "The default and minimum level for pinnacle bosses and uber pinnacle bosses
 *    is 82."
 *
 * These are constants in prose rather than a data file, so they are written out
 * here with their source rather than scraped.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'generated')
const cacheDir = join(outDir, '.cache')

const SOURCES = {
  monsters: 'https://repoe-fork.github.io/poe2/default_monster_stats.min.json',
  areas: 'https://repoe-fork.github.io/pob-data/poe2/WorldAreas.min.json',
  bases: 'https://repoe-fork.github.io/poe2/base_items.min.json',
}

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

const [monsters, areas, bases] = await Promise.all(Object.entries(SOURCES).map(([n, u]) => load(n, u)))

const physicalDamage = {}
for (const [level, stats] of Object.entries(monsters)) {
  if (typeof stats?.physical_damage === 'number') physicalDamage[level] = stats.physical_damage
}

const mapsByLevel = {}
for (const area of Object.values(areas)) {
  if (!area?.isMap || !(area.level > 0)) continue
  const key = String(area.level)
  ;(mapsByLevel[key] ??= []).push(area.baseName ?? area.name)
}
for (const key of Object.keys(mapsByLevel)) {
  mapsByLevel[key] = [...new Set(mapsByLevel[key])].sort().slice(0, 6)
}

// --- waystone tier -> area level ---------------------------------------------
const tiers = []
for (const base of Object.values(bases)) {
  const match = /^Waystone \(Tier (\d+)\)$/.exec(base?.name ?? '')
  if (!match || base.item_class !== 'Map') continue
  const tier = Number(match[1])
  const areaLevel = 64 + tier
  tiers.push({
    tier,
    areaLevel,
    // Recorded so the one mismatch stays visible rather than looking like a bug.
    dropLevel: base.drop_level,
    dropLevelMatches: base.drop_level === areaLevel,
  })
}
tiers.sort((a, b) => a.tier - b.tier)

const mismatched = tiers.filter((t) => !t.dropLevelMatches)
if (mismatched.length > 1) {
  throw new Error(
    `Expected at most one waystone whose drop level differs from 64 + tier (T1, which drops in the campaign). ` +
      `Got ${mismatched.length}: ${mismatched.map((t) => `T${t.tier}@${t.dropLevel}`).join(', ')}. ` +
      'The area-level formula may no longer hold — re-derive it before trusting this artifact.',
  )
}

/**
 * Enemy level reference points, quoted from Path of Building's enemyLevel
 * tooltip. Prose constants, so they are written out with their source.
 */
const enemyLevels = {
  source:
    'PathOfBuildingCommunity/PathOfBuilding-PoE2, src/Modules/ConfigOptions.lua, enemyLevel tooltip',
  maxNormalAndBoss: 85,
  pinnacleMinimum: 82,
  note: 'Normal enemies and bosses default to the player level unless set. Pinnacle and uber pinnacle bosses are at least 82.',
}

const artifact = {
  version: 1,
  generatedFrom: Object.values(SOURCES).join(' + '),
  limitation:
    'Map tier maps to area level as 64 + tier, matching every waystone base drop level for tiers 2-16 and ' +
    'corroborated by WorldAreas. Monster damage is for a BASE monster of that level: rare and unique monsters and ' +
    'map modifiers scale it further, and those multipliers are not modelled here.',
  physicalDamage,
  tiers,
  enemyLevels,
  mapLevels: Object.keys(mapsByLevel).map(Number).sort((a, b) => a - b),
  mapsByLevel,
}

mkdirSync(outDir, { recursive: true })
const json = JSON.stringify(artifact)
writeFileSync(join(outDir, 'monster-stats.json'), json)

console.log(`monster levels     ${Object.keys(physicalDamage).length}`)
console.log(`waystone tiers     T${tiers[0]?.tier}-T${tiers.at(-1)?.tier} -> area level ${tiers[0]?.areaLevel}-${tiers.at(-1)?.areaLevel} (64 + tier)`)
console.log(`  drop level agrees ${tiers.filter((t) => t.dropLevelMatches).length}/${tiers.length} (T1 drops in the campaign at ${tiers[0]?.dropLevel})`)
console.log(`boss levels        pinnacle min ${enemyLevels.pinnacleMinimum}, cap ${enemyLevels.maxNormalAndBoss}`)
console.log(`map area levels    ${artifact.mapLevels.join(', ')} (from WorldAreas, for corroboration)`)
console.log(`size               ${(json.length / 1024).toFixed(1)} KB raw · ${(gzipSync(json, { level: 9 }).length / 1024).toFixed(1)} KB gzipped`)
console.log(`written            ${join(outDir, 'monster-stats.json')}`)
