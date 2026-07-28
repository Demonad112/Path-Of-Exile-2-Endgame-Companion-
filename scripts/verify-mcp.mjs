/**
 * Drive the built MCP server over stdio with real protocol messages.
 *
 * Spawns the actual binary an MCP client would spawn, completes the initialize
 * handshake, lists tools, and calls a representative set against the real
 * committed character — asserting the values that come back are the real ones.
 *
 * Uses the fixture via poe2_load_character's `json` parameter so it needs no
 * network and stays deterministic.
 *
 * Usage: node scripts/verify-mcp.mjs
 */

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

const fixture = readFileSync('packages/core/test/fixtures/athrynas-v43.json', 'utf8')
const failures = []

const child = spawn('node', ['apps/mcp/dist/index.js'], { stdio: ['pipe', 'pipe', 'pipe'] })
child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`))

let buffer = ''
const pending = new Map()
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString()
  let index
  while ((index = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    if (!line) continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      failures.push(`server emitted non-JSON on stdout, which corrupts the protocol stream: ${line.slice(0, 120)}`)
      continue
    }
    const resolve = pending.get(message.id)
    if (resolve) {
      pending.delete(message.id)
      resolve(message)
    }
  }
})

let nextId = 1
function send(method, params) {
  const id = nextId++
  const promise = new Promise((resolve, reject) => {
    pending.set(id, resolve)
    setTimeout(() => reject(new Error(`timed out waiting for ${method}`)), 30_000)
  })
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
  return promise
}

/** Call a tool and parse the JSON payload it returns. */
async function callTool(name, args = {}) {
  const response = await send('tools/call', { name, arguments: args })
  const text = response.result?.content?.[0]?.text ?? ''
  if (response.result?.isError) return { error: text }
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

// --- handshake --------------------------------------------------------------
const init = await send('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'verify-mcp', version: '1.0.0' },
})
if (init.result?.serverInfo?.name !== 'poe2-build-analyzer') {
  failures.push(`unexpected server identity: ${JSON.stringify(init.result?.serverInfo)}`)
}
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
console.log(`handshake: ${init.result?.serverInfo?.name} v${init.result?.serverInfo?.version}`)

// --- tool listing -----------------------------------------------------------
const list = await send('tools/list', {})
const tools = list.result?.tools ?? []
console.log(`tools/list: ${tools.length} tools`)
if (tools.length < 18) failures.push(`expected at least 14 tools, got ${tools.length}`)
for (const tool of tools) {
  if (!tool.description || tool.description.length < 40) failures.push(`${tool.name} has a thin description`)
  if (!tool.name.startsWith('poe2_')) failures.push(`${tool.name} is missing the poe2_ prefix`)
}

// --- operating before a character is loaded ---------------------------------
const early = await callTool('poe2_get_defenses')
if (!early.error?.includes('poe2_load_character')) {
  failures.push(`calling a tool with no character loaded should name the fix; got: ${JSON.stringify(early).slice(0, 160)}`)
} else {
  console.log('no-character error: names the tool to call')
}

// --- load the real character ------------------------------------------------
const loaded = await callTool('poe2_load_character', { json: fixture })
if (loaded.identity?.name !== 'Athrynas' || loaded.identity?.level !== 86) {
  failures.push(`load returned wrong identity: ${JSON.stringify(loaded.identity)}`)
} else {
  console.log(`load: ${loaded.identity.name} level ${loaded.identity.level} ${loaded.identity.className}`)
}

// --- defences ---------------------------------------------------------------
const defenses = await callTool('poe2_get_defenses')
if (defenses.lowestMaximumHit !== 3808 || defenses.lowestMaximumHitType !== 'chaos') {
  failures.push(`defences wrong: ${JSON.stringify({ h: defenses.lowestMaximumHit, t: defenses.lowestMaximumHitType })}`)
}
if (!defenses.note?.includes('overstates')) failures.push('defences did not warn that EHP overstates survivability')
console.log(`defenses: lowest max hit ${defenses.lowestMaximumHit} (${defenses.lowestMaximumHitType})`)

// --- damage -----------------------------------------------------------------
const damage = await callTool('poe2_get_skill_damage')
if (damage.primary?.name !== 'Ice Shot' || damage.primary?.dps !== 109859) {
  failures.push(`damage wrong: ${JSON.stringify(damage.primary)}`)
}
console.log(`damage: ${damage.primary?.name} ${damage.primary?.dps}`)

// --- attribution ------------------------------------------------------------
const armour = await callTool('poe2_find_stat_sources', { stat: 'armour' })
if (armour.total !== 207 || armour.sources?.length !== 3) {
  failures.push(`armour attribution wrong: ${JSON.stringify(armour).slice(0, 200)}`)
}
if (!armour.sources?.some((s) => s.from === 'Golem Tether')) {
  failures.push('armour attribution did not name the real item granting it')
}
console.log(`stat sources: armour ${armour.total} from ${armour.sources?.length} sources incl. ${armour.sources?.[0]?.from}`)

// An unknown stat must list the real options rather than return nothing.
const bogus = await callTool('poe2_find_stat_sources', { stat: 'notAStat' })
if (!bogus.error?.includes('Available stats')) failures.push('unknown stat did not list available stats')

// --- passive tree -----------------------------------------------------------
const tree = await callTool('poe2_analyze_passive_tree')
if (tree.counts?.allocatedMainSelection !== 103 || tree.counts?.reportedByNinja?.passives !== 109) {
  failures.push(`tree counts wrong: ${JSON.stringify(tree.counts)}`)
}
if (tree.groups?.length !== 3) failures.push(`expected 3 allocation groups, got ${tree.groups?.length}`)
console.log(`tree: ${tree.counts?.liveTotal} live nodes, ${tree.groups?.length} groups, ${tree.notables?.length} notables`)

// --- support gems -----------------------------------------------------------
const gems = await callTool('poe2_validate_support_gems')
const illegal = (gems.setups ?? []).flatMap((s) => s.issues.filter((i) => i.illegal))
if (illegal.length) failures.push(`real character reported illegal setups: ${JSON.stringify(illegal).slice(0, 200)}`)
console.log(`support gems: ${gems.setups?.length} setups validated, ${illegal.length} illegal`)

// A genuinely illegal combination must be caught.
const dup = await callTool('poe2_validate_support_gems', {
  skill: 'Ice Shot',
  supports: ['Rapid Attacks II', 'Rapid Attacks I'],
})
if (!dup.issues?.some((i) => i.kind === 'duplicate-category' && i.illegal)) {
  failures.push(`duplicate category not caught: ${JSON.stringify(dup).slice(0, 250)}`)
} else {
  console.log('support gems: duplicate category correctly rejected')
}

// --- cross-validation -------------------------------------------------------
const cross = await callTool('poe2_cross_validate')
if (!cross.available || cross.summary?.major !== 0) {
  failures.push(`cross-validation unexpected: ${JSON.stringify(cross.summary)}`)
}
console.log(`cross-validate: ${cross.summary?.agree} agree, ${cross.summary?.major} major disagreements`)

// --- recommendations --------------------------------------------------------
const recs = await callTool('poe2_get_recommendations')
const ids = (recs.recommendations ?? []).map((r) => r.id)
for (const expected of ['one-shot-chaos', 'anoint-unused', 'weapon-ilvl-lag']) {
  if (!ids.includes(expected)) failures.push(`recommendations missing ${expected}`)
}

// The affix data is loaded server-side, so the vague resistance findings must
// have been replaced by specific ones naming the item and the affix.
if (ids.includes('res-chaos-under-cap') || ids.includes('res-cold-under-cap')) {
  failures.push('a generic resistance finding survived alongside the gear data that supersedes it')
}
const chaosSwap = (recs.recommendations ?? []).find((r) => r.id === 'gear-swap-chaos')
if (!chaosSwap) {
  failures.push('no concrete chaos gear swap was produced')
} else {
  if (!/Hypnotic Halo/.test(chaosSwap.action)) failures.push(`swap does not name the item: ${chaosSwap.action}`)
  if (!/of Bameth/.test(chaosSwap.action)) failures.push(`swap does not name the affix: ${chaosSwap.action}`)
  if (chaosSwap.impact?.to > 75) failures.push('swap claims to push a resistance past its cap')
  // The chaos gap is 57 points; the cold gap is 1. Closing more must rank higher.
  const coldSwap = (recs.recommendations ?? []).find((r) => r.id === 'gear-swap-cold')
  if (coldSwap && coldSwap.score >= chaosSwap.score) {
    failures.push('a 1-point cold fix outranks a 27-point chaos fix')
  }
}
// A tier gap means a mod COULD be bigger, not that bigger helps. Ranking them
// produced "improve armour +208" beside "armour is a non-defence at 207".
if (ids.some((id) => id.startsWith('gear-tier-'))) {
  failures.push('tier upgrades are being ranked as recommendations')
}
console.log(`recommendations: ${ids.length} findings — ${ids.slice(0, 3).join(', ')}…`)
console.log(`  concrete swap: ${chaosSwap?.action?.slice(0, 96)}…`)

// --- mechanics --------------------------------------------------------------
const mech = await callTool('poe2_explain_mechanic', { query: 'armour' })
if (!mech.matches?.[0]?.basis) failures.push('mechanic entry lacks a stated basis')
console.log(`mechanics: "${mech.matches?.[0]?.title}"`)

// --- mod database -----------------------------------------------------------
const mods = await callTool('poe2_search_mods', { query: 'to Strength', kind: 'SUFFIX', limit: 3 })
if (mods.results?.[0]?.affix !== 'of the Gods' || mods.results[0].levelRequirement !== 81) {
  failures.push(`mod search wrong: ${JSON.stringify(mods.results?.[0])}`)
}
// A text search has no item class, so it must NOT claim a tier — that was the
// bug: global tier numbers were inverted in a third of families.
if ('tier' in (mods.results?.[0] ?? {})) {
  failures.push('text mod search is claiming a tier without an item class')
}
if (!/depends on the item class/.test(mods.note ?? '')) {
  failures.push('mod search does not explain why no tier is given')
}
if (!Array.isArray(mods.results?.[0]?.canAppearOn)) {
  failures.push(`mod search did not report item-class compatibility: ${JSON.stringify(mods.results?.[0]?.canAppearOn)}`)
}
console.log(
  `mods: "${mods.results?.[0]?.affix}" tier ${mods.results?.[0]?.tier}, on ${mods.results?.[0]?.canAppearOn?.length} classes`,
)

const itemMods = await callTool('poe2_analyze_item_mods', { slot: 7 })
if (itemMods.item?.baseType !== 'Militant Bow' || typeof itemMods.matched !== 'number') {
  failures.push(`item mod analysis wrong: ${JSON.stringify(itemMods.item)}`)
}
// The item exists in game, so nothing on it may be reported as illegal.
if (itemMods.compatibility?.itemClass !== 'Bows') {
  failures.push(`base class not resolved: ${JSON.stringify(itemMods.compatibility?.itemClass)}`)
}
if (itemMods.compatibility?.violations?.length) {
  failures.push(`real equipped item reported illegal mods: ${JSON.stringify(itemMods.compatibility.violations).slice(0, 200)}`)
}
console.log(
  `item mods: ${itemMods.item?.name} (${itemMods.compatibility?.itemClass}) — ${itemMods.matched} tiered, ${itemMods.compatibility?.violations?.length} illegal`,
)

// A mod on the wrong class must be caught.
const wrongClass = await callTool('poe2_analyze_item_mods', {
  baseType: 'Solar Amulet',
  mods: ['30% chance to gain an additional Arrow'],
})
if (wrongClass.compatibility?.violations?.length) {
  console.log(`item mods: wrong-class mod rejected — ${wrongClass.compatibility.violations[0].message.slice(0, 90)}`)
} else if (wrongClass.compatibility?.unknown?.length) {
  console.log('item mods: that line is unlisted, so reported as unknown rather than a violation')
} else {
  failures.push('a bow-only mod on an amulet was neither rejected nor reported unknown')
}

// --- tree routes ------------------------------------------------------------
const routes = await callTool('poe2_suggest_tree_routes', { stat: 'chaosResistance', maxCost: 4 })
if (!routes.routes?.length) {
  failures.push(`no chaos resistance routes found: ${JSON.stringify(routes).slice(0, 200)}`)
} else {
  const first = routes.routes[0]
  if (first.path.length !== first.cost) failures.push('route path length disagrees with its stated cost')
  if (!/chaos resistance/i.test(first.grants)) failures.push(`route grants wrong stat: ${first.grants}`)
  console.log(`routes: "${first.node.name}" for ${first.cost} points — ${first.grants}`)
}

const badStat = await callTool('poe2_suggest_tree_routes', { stat: 'notAStat' })
if (!badStat.error?.includes('Supported')) failures.push('unknown stat did not list supported stats')

// --- PoB export with a modified tree ---------------------------------------
const target = routes.routes?.[0]?.path?.[0]?.id
if (typeof target === 'number') {
  const exported = await callTool('poe2_export_pob_with_tree', { allocate: [target] })
  if (!exported.code || exported.nodeCount?.after !== exported.nodeCount?.before + 1) {
    failures.push(`pob export wrong: ${JSON.stringify(exported).slice(0, 200)}`)
  }
  if (exported.added?.[0]?.id !== target) failures.push('pob export did not report the node it added')
  console.log(`pob export: added "${exported.added?.[0]?.name}", ${exported.nodeCount?.before} -> ${exported.nodeCount?.after} nodes`)
}

const emptyEdit = await callTool('poe2_export_pob_with_tree', {})
if (!emptyEdit.error?.includes('at least one')) failures.push('empty pob edit was not rejected')

// --- gear ---------------------------------------------------------------------
const gear = await callTool('poe2_analyze_gear', { slot: 7 })
const bow = gear.items?.[0]
const phys = bow?.mods?.find((m) => m.id === 'LocalIncreasedPhysicalDamagePercent7')
if (bow?.itemLevel !== 76 || phys?.tier !== 2 || phys?.tiers !== 8) {
  failures.push(`gear tiers wrong: ${JSON.stringify({ ilvl: bow?.itemLevel, tier: phys?.tier, of: phys?.tiers })}`)
}
// T1 physical damage needs ilvl 82 and the bow is 76, so it is NOT reachable
// here — that split is the whole point of the feature.
if (phys?.upgrades?.[0]?.reachableOnThisItem !== false || phys?.upgrades?.[0]?.ilvl !== 82) {
  failures.push(`gear should report T1 phys as needing a better base: ${JSON.stringify(phys?.upgrades?.[0])}`)
}
const dex = bow?.mods?.find((m) => m.id === 'Dexterity7')
if (dex?.upgrades?.[0]?.reachableOnThisItem !== true) {
  failures.push('gear should report T1 dexterity as reachable on this ilvl 76 bow')
}
console.log(`gear: ${bow?.name} ilvl ${bow?.itemLevel} — phys T${phys?.tier}/${phys?.tiers}, T1 needs ilvl ${phys?.upgrades?.[0]?.ilvl}`)

const improve = await callTool('poe2_find_gear_improvements')
const swap = improve.resistanceSwaps?.[0]
if (!swap || !/above the cap/.test(swap.replace?.reason ?? '')) {
  failures.push(`expected a resistance swap justified by overcap: ${JSON.stringify(swap).slice(0, 200)}`)
}
if (swap?.candidates?.[0]?.statId !== 'base_chaos_damage_resistance_%') {
  failures.push(`swap should lead with chaos (57 short) not cold (1 short): ${swap?.candidates?.[0]?.statId}`)
}
console.log(
  `gear swaps: ${improve.totals?.resistanceSwaps} found — replace "${swap?.replace?.text}" with T${swap?.candidates?.[0]?.tier} '${swap?.candidates?.[0]?.affix}'`,
)

const headroom = await callTool('poe2_survivability_headroom')
if (headroom.lowestMaximumHit !== 3808 || headroom.tiers?.length !== 16) {
  failures.push(`headroom wrong: ${JSON.stringify(headroom).slice(0, 220)}`)
}
// Tier maps to area level as 64 + tier, from the waystone item bases.
const t16 = headroom.tiers?.find((t) => t.tier === 16)
if (t16?.areaLevel !== 80 || t16?.baseMonsterHit !== 334) {
  failures.push(`tier 16 should be area level 80 at 334 base damage: ${JSON.stringify(t16)}`)
}
// PoB's own reference levels.
if (!headroom.bosses?.some((b) => b.level === 82) || !headroom.bosses?.some((b) => b.level === 85)) {
  failures.push(`boss reference levels missing: ${JSON.stringify(headroom.bosses)}`)
}
// The base figure must never read as a safety verdict.
if (!/upper bound, not a safety verdict/.test(headroom.caveats?.[0] ?? '')) {
  failures.push('headroom does not qualify the base-monster figure')
}
console.log(
  `headroom: ${headroom.lowestMaximumHit} ${headroom.lowestMaximumHitType} — comfortable to T${headroom.highestComfortableTier}, ` +
    `${t16?.headroom}x at T16, ${headroom.bosses?.find((b) => b.level === 85)?.headroom}x vs a level-85 boss`,
)

// --- audit ------------------------------------------------------------------
const audit = await callTool('poe2_audit_character')

// Jewel affixes are RePoE domain `misc`; filtering to `item` left all three
// jewels and their twelve modifiers invisible.
if (audit.jewels?.length !== 3) failures.push(`expected 3 jewels, got ${audit.jewels?.length}`)
const jewelMods = (audit.jewels ?? []).flatMap((j) => j.mods ?? [])
if (jewelMods.some((m) => m.tier === null)) {
  failures.push('a jewel modifier failed to resolve a tier')
}
if (jewelMods.some((m) => m.text === m.id)) failures.push('a jewel modifier rendered as its raw mod id')

// Two points of strength headroom: losing one source unequips something.
const str = (audit.attributes ?? []).find((a) => a.attribute === 'strength')
if (str?.have !== 47 || str?.required !== 45 || str?.tight !== true) {
  failures.push(`strength headroom wrong: ${JSON.stringify(str)}`)
}
if (audit.attributes?.[0]?.attribute !== 'strength') {
  failures.push('the tightest attribute is not reported first')
}

if (audit.spirit?.total !== 159 || audit.spirit?.unreserved !== 79) {
  failures.push(`spirit wrong: ${JSON.stringify(audit.spirit)}`)
}

// Support gems report level 0 / quality 0 by convention; flagging them would
// mark every support on every character.
const flaggedSupports = (audit.gemQuality ?? []).filter((g) => /Rapid Attacks|Deliberation|Longshot/.test(g.gem))
if (flaggedSupports.length) failures.push(`support gems wrongly flagged as unqualited: ${flaggedSupports.length}`)
if ((audit.gemQuality ?? []).some((g) => /unknown/i.test(g.skill))) {
  failures.push('a gem is attributed to an "unknown skill"')
}
console.log(
  `audit: ${audit.summary?.jewels} jewels (${audit.summary?.jewelMods} mods), ` +
    `${audit.summary?.gemsBelowMaxQuality} gems under 20% quality, ` +
    `strength headroom ${str?.headroom}, spirit idle ${audit.summary?.spiritIdle}`,
)

// --- Path of Building bridge ------------------------------------------------
// No Path of Building runs in CI, and that is the point: the interesting
// assertion is that the bridge degrades into an explanation rather than an
// exception or — worse — a plausible-looking zero.
const pob = await callTool('poe2_pob_status')
if (pob.connected !== false) {
  failures.push(`pob status claimed a connection with no Path of Building running: ${JSON.stringify(pob).slice(0, 200)}`)
}
if (!pob.reason?.includes('MCPConfig')) {
  failures.push('pob status did not mention the MCPConfig gotcha, which is indistinguishable from PoB being closed')
}

const sim = await callTool('poe2_pob_simulate_node', { nodeId: 1 })
if (!sim.error || !/Path of Building/i.test(sim.error)) {
  failures.push(`pob simulation should fail readably with no PoB running, got: ${JSON.stringify(sim).slice(0, 200)}`)
}
console.log('pob bridge: absent PoB reported as unreachable, not as a result')

// --- health -----------------------------------------------------------------
const health = await callTool('poe2_health_check')
if (health.passiveTree?.nodes !== 4975 || !health.character?.loaded) {
  failures.push(`health check wrong: ${JSON.stringify(health).slice(0, 200)}`)
}
console.log(`health: ${health.toolCount} tools, ${health.passiveTree?.nodes} tree nodes, character loaded`)

child.kill()

if (failures.length) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\nMCP server verified over stdio.')
