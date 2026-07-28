/**
 * Build the slim passive-tree artifact shipped to the web app.
 *
 * Source: `data/psg_passive_nodes.json` from Demonad112/poe2-mcp — 4,975 nodes,
 * 2.06 MB. The full file carries fields the renderer never reads. Slimming it
 * and shortening the keys brings it to roughly 170 KB gzipped, small enough to
 * serve as a static asset with no cold-start fetch.
 *
 * Two things this script fixes, both verified against the source:
 *
 * 1. **Connections are stored DIRECTED.** Of 5,888 stored connection entries
 *    only one is reciprocated. Drawing edges straight from the field would
 *    render each link once with an arbitrary owner, which is fine, but any
 *    graph walk (path finding, connectivity) needs both directions. The output
 *    carries a de-duplicated UNDIRECTED edge list.
 *
 * 2. **`is_ascendancy` does not mean "is an ascendancy passive".** It marks the
 *    17 ascendancy CLASS nodes ("Deadeye", "Titan", ...), not the ~355 passives
 *    on the ascendancy wheels. Structural detection does not work either: the
 *    whole graph is a single connected component, so the wheels are linked to
 *    the main tree. The reliable signal is the icon path, whose subfolder names
 *    the ascendancy (`passives/DeadEye/...`) across 19 classes.
 *
 * Usage: node packages/data/scripts/build-tree.mjs <path-to-psg_passive_nodes.json>
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sourcePath = process.argv[2] ?? '/home/user/poe2-mcp/data/psg_passive_nodes.json'
const outDir = join(here, '..', 'generated')
const outPath = join(outDir, 'passive-tree.json')

const raw = JSON.parse(readFileSync(sourcePath, 'utf8'))

/** Node kinds, ordered by visual weight. */
const KIND = { normal: 0, notable: 1, keystone: 2, jewel: 3, start: 4 }

const CLASS_STARTS = {
  47175: 'Warrior',
  50459: 'Ranger',
  54447: 'Sorceress',
  50986: 'Mercenary',
  61525: 'Druid',
  44683: 'Monk',
}

// --- undirected edge set ----------------------------------------------------
const adjacency = new Map()
let selfLoops = 0
function link(a, b) {
  if (!adjacency.has(a)) adjacency.set(a, new Set())
  if (!adjacency.has(b)) adjacency.set(b, new Set())
  // The source contains one self-loop (node 35653, "Grenade Damage"). It draws
  // nothing and would make an edge count disagree with itself, so drop it.
  if (a === b) {
    selfLoops++
    return
  }
  adjacency.get(a).add(b)
  adjacency.get(b).add(a)
}

for (const [key, node] of Object.entries(raw)) {
  const id = Number(key)
  if (!adjacency.has(id)) adjacency.set(id, new Set())
  for (const other of node.connections ?? []) link(id, Number(other))
}

const edges = []
const seen = new Set()
for (const [a, neighbours] of adjacency) {
  for (const b of neighbours) {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push(a, b)
  }
}

// --- ascendancy tagging -----------------------------------------------------
// The icon subfolder names the ascendancy class. This is the only reliable
// signal: `is_ascendancy` marks class nodes only, and the graph is a single
// connected component so the wheels cannot be separated structurally.
const ASCENDANCY_ICON = /passives\/([A-Za-z]+)\//
const ASCENDANCY_DISPLAY = {
  DeadEye: 'Deadeye',
  Inquistitor: 'Inquisitor',
  SmithofKitava: 'Smith of Kitava',
  AcolyteofChayula: 'Acolyte of Chayula',
  PathFinder: 'Pathfinder',
  Ascendants: 'Ascendant',
}
/** Icon subfolders that are ordinary passive art, not an ascendancy. */
const NOT_ASCENDANCY = new Set(['passives'])

function ascendancyOf(node) {
  const match = ASCENDANCY_ICON.exec(node.icon ?? '')
  if (!match) return null
  const raw = match[1]
  if (NOT_ASCENDANCY.has(raw)) return null
  return ASCENDANCY_DISPLAY[raw] ?? raw
}

// --- nodes ------------------------------------------------------------------
const nodes = {}
let minX = Infinity
let maxX = -Infinity
let minY = Infinity
let maxY = -Infinity
// The main tree's own extent, excluding the peripheral ascendancy wheels —
// the renderer frames against this rather than the full span.
let mainMinX = Infinity
let mainMaxX = -Infinity
let mainMinY = Infinity
let mainMaxY = -Infinity
const ascendancies = new Set()

for (const [key, node] of Object.entries(raw)) {
  const id = Number(key)
  const name = node.name ?? ''
  const x = Math.round(node.x)
  const y = Math.round(node.y)

  let kind = KIND.normal
  if (CLASS_STARTS[id]) kind = KIND.start
  else if (name.includes('Jewel Socket')) kind = KIND.jewel
  else if (node.is_keystone) kind = KIND.keystone
  else if (node.is_notable) kind = KIND.notable

  const entry = { x, y, n: name, k: kind, g: node.group_id ?? 0 }
  const stats = (node.stats ?? []).filter((s) => typeof s === 'string' && s.length)
  if (stats.length) entry.s = stats

  const ascendancy = ascendancyOf(node)
  if (ascendancy) {
    entry.a = ascendancy
    ascendancies.add(ascendancy)
  }
  // The ascendancy CLASS node itself (`is_ascendancy`), e.g. "Deadeye".
  if (node.is_ascendancy) entry.c = 1

  nodes[id] = entry

  if (x < minX) minX = x
  if (x > maxX) maxX = x
  if (y < minY) minY = y
  if (y > maxY) maxY = y
  if (!ascendancy) {
    if (x < mainMinX) mainMinX = x
    if (x > mainMaxX) mainMaxX = x
    if (y < mainMinY) mainMinY = y
    if (y > mainMaxY) mainMaxY = y
  }
}

const artifact = {
  version: 1,
  treeName: 'PassiveTree-0.5',
  generatedFrom: 'Demonad112/poe2-mcp data/psg_passive_nodes.json',
  nodeCount: Object.keys(nodes).length,
  edgeCount: edges.length / 2,
  extent: { minX, maxX, minY, maxY },
  /** Excludes the peripheral ascendancy wheels. Frame against this. */
  mainExtent: { minX: mainMinX, maxX: mainMaxX, minY: mainMinY, maxY: mainMaxY },
  classStarts: CLASS_STARTS,
  ascendancies: [...ascendancies].sort(),
  kinds: KIND,
  /** Flat pairs: [a0, b0, a1, b1, ...]. Undirected, de-duplicated. */
  edges,
  nodes,
}

mkdirSync(outDir, { recursive: true })
const json = JSON.stringify(artifact)
writeFileSync(outPath, json)

const ascNodes = Object.values(nodes).filter((n) => n.a).length
console.log(`nodes        ${artifact.nodeCount}`)
console.log(`edges        ${artifact.edgeCount} (undirected, de-duplicated, ${selfLoops} self-loop dropped)`)
console.log(`ascendancy   ${ascNodes} nodes across ${artifact.ascendancies.length} classes`)
console.log(`notables     ${Object.values(nodes).filter((n) => n.k === KIND.notable).length}`)
console.log(`keystones    ${Object.values(nodes).filter((n) => n.k === KIND.keystone).length}`)
console.log(`jewels       ${Object.values(nodes).filter((n) => n.k === KIND.jewel).length}`)
console.log(`extent       x ${minX}..${maxX}  y ${minY}..${maxY}`)
console.log(`size         ${(json.length / 1024).toFixed(0)} KB raw · ${(gzipSync(json, { level: 9 }).length / 1024).toFixed(0)} KB gzipped`)
console.log(`written      ${outPath}`)
