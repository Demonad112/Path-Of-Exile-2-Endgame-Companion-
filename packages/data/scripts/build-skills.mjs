/**
 * Build the skill-tag artifact used by the support-gem checker.
 *
 * Source: `data/game/skill_gems/skill_gems_v2.json` from Demonad112/poe2-mcp
 * (1,373 entries extracted from the game's .datc64 files).
 *
 * WHAT THIS DOES AND DOES NOT COVER
 *
 * The ACTIVE skill side is real and rich: 778 skills carry `skillTypes`, with
 * 183 distinct tags. Ice Shot, for example, resolves to Attack / Bow / Cold /
 * Projectile / RangedAttack — exactly what a support checker needs.
 *
 * The SUPPORT side has no usable constraint data anywhere in the source repo,
 * verified across all three candidate files:
 *
 *   game/support_gems/support_gems.json   680 gems, `compatible_with` has
 *                                         exactly ONE distinct value across the
 *                                         whole file (["attack","spell"]) — it
 *                                         cannot distinguish any gem from any
 *                                         other. `tags`, `effects` and
 *                                         `max_level` are empty on all 680.
 *   complete_models/support_gems.json     551 gems, `allowed_types` and
 *                                         `excluded_types` empty on ALL of
 *                                         them; `tags` on only 169.
 *   skill_gems_v2.json                    contains ZERO support gems.
 *
 * So a true "is this combination legal" validator is not derivable from this
 * data. What IS derivable — using real skill tags plus the curated requirement
 * table in packages/core/src/gems — is "does this support actually do anything
 * for this skill". That is a narrower and honest claim, and it is what the
 * checker reports.
 *
 * Usage: node packages/data/scripts/build-skills.mjs <path-to-skill_gems_v2.json>
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sourcePath = process.argv[2] ?? '/home/user/poe2-mcp/data/game/skill_gems/skill_gems_v2.json'
const outDir = join(here, '..', 'generated')
const outPath = join(outDir, 'skills.json')

const raw = JSON.parse(readFileSync(sourcePath, 'utf8'))
const entries = raw.skills && !Array.isArray(raw.skills) ? Object.values(raw.skills) : (raw.skills ?? [])

const skills = {}
const tagCounts = new Map()

for (const entry of entries) {
  const name = entry?.name || entry?.baseTypeName
  const types = Array.isArray(entry?.skillTypes) ? entry.skillTypes : []
  if (!name || !types.length) continue

  // Later duplicates would silently clobber earlier ones; keep the richer entry.
  const existing = skills[name]
  if (existing && existing.t.length >= types.length) continue

  skills[name] = { t: types }
  if (typeof entry.castTime === 'number' && entry.castTime > 0) skills[name].c = entry.castTime
  for (const t of types) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
}

const artifact = {
  version: 1,
  generatedFrom: 'Demonad112/poe2-mcp data/game/skill_gems/skill_gems_v2.json',
  skillCount: Object.keys(skills).length,
  tagCount: tagCounts.size,
  /** Every distinct skill tag observed, most common first. */
  tags: [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t),
  skills,
}

mkdirSync(outDir, { recursive: true })
const json = JSON.stringify(artifact)
writeFileSync(outPath, json)

console.log(`source entries  ${entries.length}`)
console.log(`skills kept     ${artifact.skillCount} (those carrying skillTypes)`)
console.log(`distinct tags   ${artifact.tagCount}`)
console.log(`size            ${(json.length / 1024).toFixed(0)} KB raw · ${(gzipSync(json, { level: 9 }).length / 1024).toFixed(0)} KB gzipped`)
console.log(`written         ${outPath}`)
