/**
 * Tool definitions.
 *
 * Every tool is a thin adapter over @poe2/core — the MCP server contains no
 * analysis logic of its own, so it and the web app agree by construction rather
 * than by two implementations being kept in step.
 *
 * Definitions live in one array so the documented tool table can be GENERATED
 * from the registry (see tool-table.ts). V1 shipped four different stale tool
 * counts across its docs; hand-maintaining that list is what caused it.
 */

import { z } from 'zod'
import {
  NODE_KIND,
  analyzeContent,
  analyzeItem,
  auditCharacter,
  decodePobExport,
  editPobTree,
  findMechanicSafe,
  findResistanceSwaps,
  findTierUpgrades,
  normalizeItems,
  summarizeSwaps,
  parseProfileUrl,
  pathToNode,
  readPlayerStats,
  rankNodesByMeasuredGain,
  resolveAllocation,
  simulateCustomMods,
  simulatePassiveNode,
  statSources,
  suggestNodesForStat,
  supportedStats,
  validateByName,
  validateSetup,
} from './deps.js'
import {
  client,
  loadCharacter,
  loadedCharacter,
  modDatabase,
  modTiers,
  monsterStats,
  passiveTree,
  pobBridge,
  requireCharacter,
} from './state.js'

export interface ToolDef {
  name: string
  title: string
  description: string
  inputSchema: z.ZodRawShape
  annotations: {
    readOnlyHint: boolean
    destructiveHint: boolean
    idempotentHint: boolean
    openWorldHint: boolean
  }
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const
const READ_ONLY_NETWORK = { ...READ_ONLY, openWorldHint: true } as const

/** Item classes a modifier can appear on, or null when it is not listed. */
function modClassesFor(db: ReturnType<typeof modDatabase>, modId: string): string[] | null {
  return db.classesForMod(modId)
}

function truncate<T>(items: T[], limit: number): { items: T[]; total: number; truncated: boolean } {
  return { items: items.slice(0, limit), total: items.length, truncated: items.length > limit }
}

export const TOOLS: ToolDef[] = [
  {
    name: 'poe2_load_character',
    title: 'Load a character',
    description:
      'Fetch a Path of Exile 2 character from poe.ninja and make it the active character for every other tool. ' +
      'Accepts either a full poe.ninja profile URL, or account plus league plus character name. Also accepts a raw ' +
      'character model JSON payload for offline use. Returns an identity and headline summary; call the more ' +
      'specific tools for detail.',
    inputSchema: {
      url: z.string().optional().describe('A poe.ninja PoE2 profile URL, e.g. https://poe.ninja/poe2/profile/Name-1234/runesofaldur/character/Char'),
      account: z.string().optional().describe('Account in Name-1234 or Name#1234 form. Used with league and character.'),
      league: z.string().optional().describe('League slug, e.g. runesofaldur or standard.'),
      character: z.string().optional().describe('Character name.'),
      json: z.string().optional().describe('A raw character model JSON payload, as an alternative to fetching.'),
    },
    annotations: READ_ONLY_NETWORK,
    handler: async (args) => {
      const { url, account, league, character, json } = args as Record<string, string | undefined>

      if (json) {
        const loaded = await loadCharacter(JSON.parse(json), 'pasted JSON')
        return summarize(loaded)
      }

      let ref = url ? parseProfileUrl(url) : null
      if (url && !ref) {
        throw new Error(
          `"${url}" is not a recognised poe.ninja PoE2 profile URL. Expected a form like ` +
            'https://poe.ninja/poe2/profile/Account-1234/league/character/Name, or pass account, league and character separately.',
        )
      }
      if (!ref) {
        if (!account || !league || !character) {
          throw new Error('Provide either a poe.ninja profile URL, or all three of account, league and character.')
        }
        ref = { account, leagueSlug: league, character }
      }
      if (!ref.leagueSlug) {
        throw new Error('That URL contains no league. Use the full profile URL, or pass league explicitly.')
      }

      const payload = await client.fetchCharacter(ref.account, ref.leagueSlug, ref.character)
      const loaded = await loadCharacter(payload, `${ref.account}/${ref.leagueSlug}/${ref.character}`)
      return summarize(loaded)
    },
  },

  {
    name: 'poe2_get_defenses',
    title: 'Get defensive analysis',
    description:
      'Defensive breakdown of the loaded character, led by the lowest maximum hit taken — the smallest single hit ' +
      'that kills. Includes per-damage-type maximum hits, resistances with over- and under-cap amounts, and the 0.5 ' +
      'mechanics deflection and ward. Also reports how far the averaged effective health pool overstates survivability.',
    inputSchema: {},
    annotations: READ_ONLY,
    handler: () => {
      const d = requireCharacter().analysis.defense
      return {
        lowestMaximumHit: d.lowestMaximumHit,
        lowestMaximumHitType: d.lowestMaximumHitType,
        effectiveHealthPool: d.effectiveHealthPool,
        ehpOverstatementRatio: d.ehpOverstatementRatio,
        note:
          d.ehpOverstatementRatio && d.ehpOverstatementRatio > 1.5
            ? `Effective health pool overstates survivability by ${d.ehpOverstatementRatio.toFixed(1)}x. Judge this build by the lowest maximum hit.`
            : null,
        maxHits: d.maxHits,
        resistances: d.resistances,
        pools: { life: d.life, energyShield: d.energyShield, ward: d.ward, chaosRawPool: d.chaosRawPool },
        mitigation: {
          armour: d.armour,
          physicalDamageReduction: d.physicalDamageReduction,
          physicalDamageReductionAgainstHit: d.physicalDamageReductionAgainstHit,
          evasion: d.evasion,
          evadeChance: d.evadeChance,
          blockChance: d.blockChance,
          deflectionRating: d.deflectionRating,
          deflectChance: d.deflectChance,
          deflectEffect: d.deflectEffect,
        },
        missingFromPayload: d.missing,
      }
    },
  },

  {
    name: 'poe2_get_skill_damage',
    title: 'Get per-skill damage',
    description:
      'Per-skill damage for the loaded character, read verbatim from poe.ninja’s computed values — never ' +
      'recalculated. Includes hit DPS, damage over time, use rate, critical strike, projectiles and the damage-type ' +
      'split. Charge-up skills report a hit rate below 1, meaning only that fraction of uses land.',
    inputSchema: {
      includeBuffs: z.boolean().optional().describe('Include buff and herald skills, which deal damage over time only. Default false.'),
    },
    annotations: READ_ONLY,
    handler: (args) => {
      const dps = requireCharacter().analysis.dps
      const skills = args.includeBuffs ? dps.skills : dps.hitSkills
      return {
        primary: dps.primary,
        skills,
        provenance: dps.provenance,
        unresolved: dps.unresolved,
      }
    },
  },

  {
    name: 'poe2_get_recommendations',
    title: 'Get ranked recommendations',
    description:
      'Ranked, quantified improvements for the loaded character, ordered by gain per unit of cost so a free ' +
      'reallocation outranks an equally-sized fix that costs currency. Each carries the concrete action, the ' +
      'measured impact, the cost, the trade-off, and an evidence trail tracing every claim back to the payload. ' +
      'Also reports what could not be determined, rather than guessing.',
    inputSchema: {},
    annotations: READ_ONLY,
    handler: () => requireCharacter().analysis.recommendations,
  },

  {
    name: 'poe2_find_stat_sources',
    title: 'Find what grants a stat',
    description:
      'Attribute a stat to the exact items, passives, quests and attributes that grant it, using poe.ninja’s own ' +
      'per-stat breakdown. This is what makes "replace this ring" able to state precisely what would be lost. ' +
      'Stat keys are names like life, energyShield, armour, evasionRating, ward, fireResistance.',
    inputSchema: {
      stat: z.string().describe('Stat key, e.g. "armour", "life", "coldResistance".'),
    },
    annotations: READ_ONLY,
    handler: (args) => {
      const { breakdowns } = requireCharacter().analysis
      const stat = String(args.stat)
      const entry = breakdowns.byKey.get(stat)
      if (!entry) {
        const available = [...breakdowns.byKey.keys()].sort()
        throw new Error(`No breakdown for "${stat}". Available stats: ${available.join(', ')}.`)
      }
      return {
        stat: entry.key,
        label: entry.label,
        total: entry.total,
        base: entry.base,
        increasedPercent: entry.inc,
        more: entry.more,
        derivation: entry.derivation,
        cap: entry.cap,
        idConfidence: entry.confidence,
        sources: statSources(breakdowns, stat).map((c) => ({
          value: c.value,
          kind: c.modKind,
          from: c.source.itemName ?? c.source.label ?? 'character base',
          sourceKind: c.source.kind,
          passiveNodeId: c.source.nodeId,
        })),
      }
    },
  },

  {
    name: 'poe2_analyze_passive_tree',
    title: 'Analyze the passive tree',
    description:
      'Passive allocation for the loaded character, resolved against the tree data. Keeps the two weapon sets ' +
      'separate — they are alternates, never additive — and reports allocated notables, keystones and jewel ' +
      'sockets. Multiple connected groups are normal and are explained rather than flagged as a broken tree.',
    inputSchema: {},
    annotations: READ_ONLY,
    handler: () => {
      const { analysis } = requireCharacter()
      const resolved = resolveAllocation(passiveTree(), analysis.passives)
      return {
        counts: {
          reportedByNinja: analysis.passives.counts,
          allocatedMainSelection: analysis.passives.mainSelectionLength,
          liveTotal: resolved.live.length,
          note: 'poe.ninja’s own passive count and the length of the allocated-node list are different numbers and are not interchangeable.',
        },
        activeWeaponSet: analysis.passives.activeSet,
        weaponSetNodeCounts: { set1: analysis.passives.set1.length, set2: analysis.passives.set2.length },
        notables: resolved.notables.map((n) => ({ id: n.id, name: n.name, stats: n.stats })),
        keystones: resolved.keystones.map((n) => ({ id: n.id, name: n.name, stats: n.stats })),
        jewelSockets: resolved.jewelSockets.map((n) => ({ id: n.id, name: n.name })),
        ascendancy: resolved.ascendancy.map((n) => ({ id: n.id, name: n.name, ascendancy: n.ascendancy })),
        groups: resolved.components.map((c) => ({ kind: c.kind, ascendancy: c.ascendancy, size: c.nodes.length })),
        unresolvedNodeIds: resolved.unresolvedIds,
      }
    },
  },

  {
    name: 'poe2_inspect_passive_node',
    title: 'Inspect a passive node',
    description:
      'Look up a passive node by id or by name, returning its stats, kind, ascendancy and neighbours. Name lookup ' +
      'is a case-insensitive substring match and returns every match, since notable names repeat across the tree.',
    inputSchema: {
      id: z.number().int().optional().describe('Node id.'),
      name: z.string().optional().describe('Node name or fragment, e.g. "Gathering Winds".'),
      limit: z.number().int().min(1).max(50).optional().describe('Maximum matches for a name search. Default 10.'),
    },
    annotations: READ_ONLY,
    handler: (args) => {
      const tree = passiveTree()
      const describe = (id: number) => {
        const node = tree.node(id)
        if (!node) return null
        return {
          id: node.id,
          name: node.name,
          kind: Object.entries(NODE_KIND).find(([, v]) => v === node.kind)?.[0] ?? 'normal',
          stats: node.stats,
          ascendancy: node.ascendancy,
          neighbours: tree.neighbours(node.id).map((n) => ({ id: n, name: tree.node(n)?.name ?? '' })),
        }
      }

      if (typeof args.id === 'number') {
        const node = describe(args.id)
        if (!node) throw new Error(`No passive node with id ${args.id} in the tree data (${tree.size} nodes).`)
        return node
      }

      const name = String(args.name ?? '').trim().toLowerCase()
      if (!name) throw new Error('Provide either an id or a name.')
      const matches = [...tree.allNodes()].filter((n) => n.name.toLowerCase().includes(name))
      const { items, total, truncated } = truncate(matches, Number(args.limit ?? 10))
      return { query: args.name, total, truncated, matches: items.map((n) => describe(n.id)) }
    },
  },

  {
    name: 'poe2_find_path_to_node',
    title: 'Find the cheapest path to a node',
    description:
      'Shortest route from the loaded character’s allocated tree to a target passive node, walking unallocated ' +
      'nodes. Returns the nodes that would need allocating and the passive-point cost. Returns a zero-cost result ' +
      'when the node is already allocated, and reports unreachable rather than guessing.',
    inputSchema: {
      nodeId: z.number().int().describe('Target passive node id.'),
    },
    annotations: READ_ONLY,
    handler: (args) => {
      const { analysis } = requireCharacter()
      const tree = passiveTree()
      const target = Number(args.nodeId)
      const node = tree.node(target)
      if (!node) throw new Error(`No passive node with id ${target} in the tree data.`)

      const result = pathToNode(tree, analysis.passives.live, target)
      if (!result) {
        return {
          target: { id: node.id, name: node.name },
          reachable: false,
          note: 'No route exists from the allocated tree to this node in the available data. Ascendancy wheels are reached through the class node and are not always linked in this data set.',
        }
      }
      return {
        target: { id: node.id, name: node.name, stats: node.stats },
        reachable: true,
        alreadyAllocated: result.cost === 0,
        cost: result.cost,
        path: result.path.map((n) => ({ id: n.id, name: n.name, stats: n.stats })),
      }
    },
  },

  {
    name: 'poe2_get_skill_setups',
    title: 'Get skill and support gem setups',
    description:
      'Every skill setup on the loaded character with its support gems, each support’s own tags, its category and ' +
      'the stats it grants — all read from the character payload rather than a gem database.',
    inputSchema: {
      skill: z.string().optional().describe('Restrict to one active skill by name.'),
    },
    annotations: READ_ONLY,
    handler: (args) => {
      const { setups } = requireCharacter()
      const wanted = args.skill ? String(args.skill).toLowerCase() : null
      const filtered = wanted ? setups.filter((s) => (s.skill ?? '').toLowerCase() === wanted) : setups
      if (wanted && !filtered.length) {
        throw new Error(
          `No setup for "${args.skill}". Available: ${setups.map((s) => s.skill).filter(Boolean).join(', ')}.`,
        )
      }
      return { setups: filtered }
    },
  },

  {
    name: 'poe2_validate_support_gems',
    title: 'Validate a support gem combination',
    description:
      'Check a set of support gems against a skill. Reports two things, both grounded in the payload rather than ' +
      'inferred: support gems sharing a category, which the game forbids within one skill, and supports whose tags ' +
      'share nothing with the skill so they have nothing to act on. Gem definitions come from the loaded character, ' +
      'so unknown gem names are reported as unknown rather than assumed valid. Validates the character’s own setups ' +
      'when no arguments are given.',
    inputSchema: {
      skill: z.string().optional().describe('Active skill name. Omit to validate every setup on the character.'),
      supports: z.array(z.string()).optional().describe('Support gem names to check against that skill.'),
    },
    annotations: READ_ONLY,
    handler: (args) => {
      const { setups, supports: known } = requireCharacter()

      if (!args.skill) {
        return {
          setups: setups.filter((s) => s.skill).map((s) => validateSetup(s)),
          note: 'Validated the character’s existing setups. Pass skill and supports to test a hypothetical combination.',
        }
      }

      const skill = String(args.skill)
      const setup = setups.find((s) => (s.skill ?? '').toLowerCase() === skill.toLowerCase())
      if (!setup) {
        throw new Error(
          `"${skill}" is not a skill on the loaded character, so its tags are unknown and nothing can be checked against it. ` +
            `Available: ${setups.map((s) => s.skill).filter(Boolean).join(', ')}.`,
        )
      }

      const names = Array.isArray(args.supports) ? (args.supports as string[]) : setup.supports.map((s) => s.name)
      const { validation, unknown } = validateByName(known, skill, setup.skillTags, names)
      return {
        ...validation,
        unknownGems: unknown,
        unknownNote: unknown.length
          ? `${unknown.join(', ')} are not among the gem definitions on this character, so they were not checked.`
          : null,
      }
    },
  },

  {
    name: 'poe2_import_pob',
    title: 'Import a Path of Building code',
    description:
      'Decode a Path of Building export code and return the build level, class and Path of Building’s own computed ' +
      'stats. Those stats are an independent second opinion on poe.ninja’s numbers — where the two agree, both are ' +
      'trustworthy; where they disagree, that is worth knowing.',
    inputSchema: {
      code: z.string().describe('A Path of Building export code (base64url + zlib).'),
    },
    annotations: READ_ONLY,
    handler: async (args) => {
      const xml = await decodePobExport(String(args.code))
      const stats = readPlayerStats(xml)
      return {
        playerStats: stats,
        statCount: Object.keys(stats).length,
        headline: {
          totalDps: stats.TotalDPS ?? null,
          life: stats.Life ?? null,
          energyShield: stats.EnergyShield ?? null,
        },
      }
    },
  },

  {
    name: 'poe2_get_pob_code',
    title: 'Get the character’s Path of Building code',
    description:
      'Return the Path of Building export code poe.ninja embeds for the loaded character, ready to paste into Path ' +
      'of Building, along with the stats it carries.',
    inputSchema: {},
    annotations: READ_ONLY,
    handler: async () => {
      const { model, analysis } = requireCharacter()
      const code = model.pathOfBuildingExport
      if (!code) {
        return { code: null, note: 'poe.ninja did not attach a Path of Building export to this character.' }
      }
      return { code, playerStats: analysis.pobStats, length: code.length }
    },
  },

  {
    name: 'poe2_cross_validate',
    title: 'Cross-validate poe.ninja against Path of Building',
    description:
      'Compare poe.ninja’s computed stats against Path of Building’s own engine and against poe.ninja’s own ' +
      'breakdown arithmetic. Disagreements are flagged rather than resolved — silently preferring one source is how ' +
      'a wrong number ships looking confident. Stats that cannot be verified are listed as such.',
    inputSchema: {},
    annotations: READ_ONLY,
    handler: () => {
      const { analysis } = requireCharacter()
      if (!analysis.reconciliation) {
        return {
          available: false,
          note: 'This character has no Path of Building export attached, so poe.ninja’s figures cannot be cross-checked against a second engine.',
        }
      }
      const r = analysis.reconciliation
      return {
        available: true,
        summary: { agree: r.matches, minor: r.minor, major: r.major, unverifiable: r.unresolved },
        disagreements: r.checks.filter((c) => c.severity === 'major' || c.severity === 'minor'),
        unverifiable: r.checks.filter((c) => c.severity === 'unresolved'),
      }
    },
  },

  {
    name: 'poe2_search_mods',
    title: 'Search item modifiers',
    description:
      'Search the game’s item modifier table by stat text or affix name, returning tiers with their real roll ranges, ' +
      'affix names, level requirements and the item classes each modifier can appear on. Tier 1 is the best. Useful ' +
      'for judging what an item could roll, or what a craft is aiming at.',
    inputSchema: {
      query: z.string().describe('Stat text or affix name, e.g. "to Strength", "Lightning Resistance", "of the Gods".'),
      kind: z
        .enum(['PREFIX', 'SUFFIX', 'IMPLICIT', 'CORRUPTED'])
        .optional()
        .describe('Restrict to one modifier kind.'),
      limit: z.number().int().min(1).max(50).optional().describe('Maximum results. Default 15.'),
    },
    annotations: READ_ONLY,
    handler: (args) => {
      const db = modDatabase()
      const opts: { kind?: string; limit?: number } = { limit: Number(args.limit ?? 15) }
      if (typeof args.kind === 'string') opts.kind = args.kind
      const results = db.search(String(args.query), opts)

      if (!results.length) {
        throw new Error(
          `No modifier matches "${args.query}". Search matches affix names and rendered stat text, e.g. "to Strength" or "increased Attack Speed".`,
        )
      }
      return {
        results: results.map((m) => ({
          id: m.id,
          affix: m.affix,
          kind: m.kind,
          levelRequirement: m.level,
          rolls: m.stats.map((s) => ({ stat: s.id, min: s.textMin, max: s.text })),
          canAppearOn: db.itemClasses.length ? (modClassesFor(db, m.id) ?? 'not listed') : 'compatibility data unavailable',
        })),
        limitation: db.limitation,
        note:
          'No tier numbers here: a tier depends on the item class, and a text search has not been given one. ' +
          'Results are ordered by required item level, strongest first. For real tiers, load a character and use ' +
          'poe2_analyze_gear, which resolves ladders against each item’s own base.',
      }
    },
  },

  {
    name: 'poe2_analyze_item_mods',
    title: 'Analyze an item’s modifier rolls',
    description:
      'Place each of an item’s modifier rolls in its tier, show how far each sits from the best possible roll, and ' +
      'check every line against the modifier pool for that item’s class. Analyses an equipped item on the loaded ' +
      'character by slot, or arbitrary mod lines with a base name. Lines absent from the tables report as unmatched ' +
      'or unknown rather than guessed at — runes, implicits and unique-only modifiers all fall in that category, and ' +
      'absence is never treated as a violation.',
    inputSchema: {
      slot: z
        .number()
        .int()
        .optional()
        .describe('Equipment slot id on the loaded character: 1 helmet, 2 gloves, 3 body, 4 amulet, 5 boots, 6 off hand, 7 main hand, 8/9 rings, 11 belt, 15/16 swap weapons.'),
      mods: z.array(z.string()).optional().describe('Modifier lines to analyse directly, instead of an equipped item.'),
      baseType: z.string().optional().describe('Base item name for the provided lines, e.g. "Militant Bow". Enables the item-class compatibility check.'),
    },
    annotations: READ_ONLY,
    handler: (args) => {
      const db = modDatabase()

      if (Array.isArray(args.mods) && args.mods.length) {
        const lines = args.mods as string[]
        const base = typeof args.baseType === 'string' ? args.baseType : null
        return {
          source: 'provided lines',
          ...db.assessAll(lines),
          compatibility: base ? db.validateItemMods(base, lines) : 'Pass baseType to check which item class these can appear on.',
        }
      }

      const { analysis } = requireCharacter()
      if (typeof args.slot !== 'number') {
        return {
          note: 'Pass a slot id to analyse an equipped item, or mods (with baseType) to analyse lines directly.',
          equipped: analysis.items.map((i) => ({ slot: i.slotId, label: i.slotLabel, name: i.name, baseType: i.baseType, active: i.active })),
        }
      }

      const item = analysis.items.find((i) => i.slotId === args.slot)
      if (!item) {
        throw new Error(
          `Nothing equipped in slot ${args.slot}. Occupied slots: ${analysis.items.map((i) => `${i.slotId} (${i.slotLabel})`).join(', ')}.`,
        )
      }
      return {
        item: { slot: item.slotId, slotLabel: item.slotLabel, name: item.name, baseType: item.baseType, itemLevel: item.itemLevel, active: item.active },
        ...db.assessAll(item.mods),
        compatibility: db.validateItemMods(item.baseType, item.mods),
      }
    },
  },

  {
    name: 'poe2_suggest_tree_routes',
    title: 'Suggest passive routes for a stat',
    description:
      'Find the cheapest unallocated passive nodes granting a stat, with the real point cost and the exact route from ' +
      'the character’s current tree. Ranked by value per point. This reports what a node costs and what it prints — ' +
      'it does not claim a node is the right choice, since that depends on where the build is heading.',
    inputSchema: {
      stat: z.string().describe('Stat key, e.g. chaosResistance, coldResistance, life, energyShield, armour, evasionRating.'),
      maxCost: z.number().int().min(1).max(10).optional().describe('Maximum passive points to spend. Default 4.'),
      notablesOnly: z.boolean().optional().describe('Only notables and keystones. Default false.'),
      limit: z.number().int().min(1).max(20).optional().describe('Maximum routes. Default 5.'),
    },
    annotations: READ_ONLY,
    handler: (args) => {
      const { analysis } = requireCharacter()
      const stat = String(args.stat)

      const options: { maxCost: number; limit: number; notablesOnly?: boolean } = {
        maxCost: Number(args.maxCost ?? 4),
        limit: Number(args.limit ?? 5),
      }
      if (typeof args.notablesOnly === 'boolean') options.notablesOnly = args.notablesOnly

      const routes = suggestNodesForStat(passiveTree(), analysis.passives.live, stat, options)

      if (!routes.length) {
        const supported = supportedStats()
        if (!supported.includes(stat)) {
          throw new Error(`"${stat}" is not a stat this can search for. Supported: ${supported.join(', ')}.`)
        }
        return {
          stat,
          routes: [],
          note: `No unallocated node granting ${stat} is within ${options.maxCost} passive points. Raise maxCost to widen the search, bearing in mind that a distant route is rarely good advice.`,
        }
      }

      return {
        stat,
        routes: routes.map((r) => ({
          node: { id: r.node.id, name: r.node.name, stats: r.node.stats },
          cost: r.cost,
          grants: r.matchedStat,
          valuePerPoint: r.valuePerPoint,
          path: r.path.map((n) => ({ id: n.id, name: n.name })),
        })),
      }
    },
  },

  {
    name: 'poe2_export_pob_with_tree',
    title: 'Export a Path of Building code with a modified tree',
    description:
      'Apply passive tree changes to the loaded character’s Path of Building export and return a new code, ready to ' +
      'paste into Path of Building. Only the tree is rewritten; items, gems, config and calc settings are preserved ' +
      'byte-for-byte, because this project does not model them. Combine with poe2_suggest_tree_routes to try a route ' +
      'out in Path of Building’s own engine.',
    inputSchema: {
      allocate: z.array(z.number().int()).optional().describe('Node ids to allocate, on top of the current tree.'),
      deallocate: z.array(z.number().int()).optional().describe('Node ids to remove.'),
      replace: z.array(z.number().int()).optional().describe('Replace the allocation outright. Takes precedence.'),
    },
    annotations: { ...READ_ONLY, idempotentHint: false },
    handler: async (args) => {
      const { model } = requireCharacter()
      const code = model.pathOfBuildingExport
      if (!code) {
        throw new Error(
          'poe.ninja did not attach a Path of Building export to this character, so there is nothing to modify.',
        )
      }

      const edit: { allocate?: number[]; deallocate?: number[]; replace?: number[] } = {}
      if (Array.isArray(args.allocate)) edit.allocate = args.allocate as number[]
      if (Array.isArray(args.deallocate)) edit.deallocate = args.deallocate as number[]
      if (Array.isArray(args.replace)) edit.replace = args.replace as number[]
      if (!edit.allocate?.length && !edit.deallocate?.length && !edit.replace) {
        throw new Error('Provide at least one of allocate, deallocate or replace.')
      }

      const tree = passiveTree()
      const result = await editPobTree(code, edit)

      return {
        code: result.code,
        added: result.added.map((id) => ({ id, name: tree.node(id)?.name ?? null })),
        removed: result.removed.map((id) => ({ id, name: tree.node(id)?.name ?? null })),
        nodeCount: { before: result.before.treeNodeIds.length, after: result.after.treeNodeIds.length },
        warnings: result.warnings,
        note: 'Only the passive tree was changed. Paste this into Path of Building to see what its engine makes of it.',
      }
    },
  },

  {
    name: 'poe2_analyze_gear',
    title: 'Analyse equipped gear, mod by mod',
    description:
      'Every modifier on every equipped item, with its affix tier, the roll inside that tier’s range, and what better ' +
      'tiers exist. Tiers are resolved against the item’s own class — T1 is the best. Crucially it separates upgrades ' +
      'achievable on the item you already own from those needing a higher item level base, because those are ' +
      'different actions at very different costs. Modifiers poe.ninja gave no id for (implicits, runes) are shown as ' +
      'text with no tier rather than guessed at.',
    inputSchema: {
      slot: z.number().int().optional().describe('One slot id only. Omit for every equipped item.'),
      includeInactive: z.boolean().optional().describe('Include the inactive weapon set. Default false — those stats are not live.'),
    },
    annotations: READ_ONLY,
    handler: (args) => {
      const { model, analysis } = requireCharacter()
      const tiers = modTiers()
      let items = normalizeItems(model)
      if (!args.includeInactive) items = items.filter((i) => i.active)
      if (args.slot !== undefined) items = items.filter((i) => i.slotId === Number(args.slot))
      if (!items.length) {
        throw new Error(
          args.slot !== undefined
            ? `Nothing equipped in slot ${args.slot}.`
            : 'No equipped items found on this character.',
        )
      }

      const analysed = items.map((i) => analyzeItem(i, tiers, analysis.defense))
      return {
        items: analysed,
        totals: {
          items: analysed.length,
          tieredMods: analysed.reduce((n, i) => n + i.mods.filter((m) => m.tier !== null).length, 0),
          atBestTier: analysed.reduce((n, i) => n + i.mods.filter((m) => m.tier === 1).length, 0),
          wastedMods: analysed.reduce((n, i) => n + i.mods.filter((m) => m.waste).length, 0),
        },
        note: 'T1 is the best tier. Tier counts are per item class — a ring and a bow have different ladders for the same stat.',
      }
    },
  },

  {
    name: 'poe2_find_gear_improvements',
    title: 'Find gear changes worth making',
    description:
      'Two kinds of concrete gear change, both grounded in the affix data rather than opinion. First, resistance ' +
      'rebalancing: modifiers granting resistance the character is already over cap on are provably wasted, and this ' +
      'names the item, the modifier, and the specific affixes that could replace it to cover what is short — ranked ' +
      'by how much of the gap each closes. Second, tier upgrades: modifiers sitting below the best tier their item ' +
      'could hold. Corrupted items are excluded from recrafting advice because their affixes cannot change.',
    inputSchema: {
      limit: z.number().int().optional().describe('Cap each list. Default 8.'),
    },
    annotations: READ_ONLY,
    handler: (args) => {
      const { model, analysis } = requireCharacter()
      const tiers = modTiers()
      const items = normalizeItems(model)
      const analysed = items.map((i) => analyzeItem(i, tiers, analysis.defense))
      const limit = Math.max(1, Number(args.limit ?? 8))

      const swaps = findResistanceSwaps(analysed, items, tiers, analysis.defense)
      const upgrades = findTierUpgrades(analysed)

      const strip = (m: { slotId: number; slotLabel: string; itemName: string; text: string; tier: number | null; tiers: number | null; upgrades: unknown[] }) => ({
        slotId: m.slotId,
        slotLabel: m.slotLabel,
        itemName: m.itemName,
        mod: m.text,
        tier: m.tier,
        ofTiers: m.tiers,
        best: m.upgrades[0],
      })

      return {
        shortfallSummary: summarizeSwaps(swaps, analysis.defense),
        resistanceSwaps: swaps.slice(0, limit),
        tierUpgrades: {
          onItemsYouOwn: upgrades.onThisItem.slice(0, limit).map(strip),
          needsHigherItemLevelBase: upgrades.needsBetterBase.slice(0, limit).map(strip),
        },
        totals: {
          resistanceSwaps: swaps.length,
          onItemsYouOwn: upgrades.onThisItem.length,
          needsHigherItemLevelBase: upgrades.needsBetterBase.length,
        },
        note:
          'Only measurable waste is reported. Resistance above the cap is provably doing nothing; whether a damage ' +
          'modifier suits a build depends on where that build is heading, which is not judged here.',
      }
    },
  },

  {
    name: 'poe2_audit_character',
    title: 'Audit the things nothing else checks',
    description:
      'Five checks over parts of the character payload the other tools never read. Socketed jewels, tiered against ' +
      'jewel spawn rules rather than gear ones. Empty rune sockets, which are free stats not taken. Levelled skill ' +
      'gems below the 20% quality cap, flagged most confidently where another copy of the same gem IS at higher ' +
      'quality. How close each attribute sits to what the gear requires — a small margin means losing one source ' +
      'unequips something. And how much spirit is reserved versus idle. Nothing here is estimated; anything needing ' +
      'the Path of Building export says so when it is absent rather than reporting zero.',
    inputSchema: {},
    annotations: READ_ONLY,
    handler: () => {
      const { model, analysis } = requireCharacter()
      let tiers: ReturnType<typeof modTiers> | null = null
      try {
        tiers = modTiers()
      } catch {
        tiers = null
      }
      const report = auditCharacter(model, tiers, analysis.pobStats)
      return {
        ...report,
        summary: {
          jewels: report.jewels.length,
          jewelMods: report.jewels.reduce((n, j) => n + j.mods.length, 0),
          emptySockets: report.emptySockets.reduce((n, s) => n + s.empty, 0),
          gemsBelowMaxQuality: report.gemQuality.length,
          tightAttributes: report.attributes.filter((a) => a.tight).map((a) => a.attribute),
          spiritIdle: report.spirit ? `${report.spirit.unreserved} of ${report.spirit.total}` : null,
        },
        note:
          'An empty socket and a sub-maximum gem quality are unambiguous improvements. Idle spirit and spare ' +
          'attributes are reported without judgement — whether they are worth spending depends on where the build ' +
          'is heading, which is not decided here.',
      }
    },
  },

  {
    name: 'poe2_survivability_headroom',
    title: 'Survivability by map tier and against bosses',
    description:
      'How the character’s smallest fatal hit compares to base monster damage at every waystone tier (1-16) and at ' +
      'the boss levels Path of Building itself uses — 82, the pinnacle boss floor, and 85, the ceiling for all ' +
      'enemies. Tier maps to area level as 64 + tier, taken from the waystone item bases. Reports the highest tier ' +
      'that is comfortable and the first that is not. The figure is against a BASE monster: rares, uniques and map ' +
      'modifiers hit considerably harder and are not modelled, so it is an upper bound rather than a safety verdict, ' +
      'and the caveats are returned alongside it so the number is never read bare.',
    inputSchema: {},
    annotations: READ_ONLY,
    handler: () => analyzeContent(requireCharacter().analysis.defense, monsterStats()),
  },

  {
    name: 'poe2_pob_status',
    title: 'Check the Path of Building bridge',
    description:
      'Report whether a live Path of Building instance is reachable, which build it has open, and what its engine ' +
      'currently computes. Everything else in this server reads poe.ninja’s numbers; this reads Path of Building’s ' +
      'own, which is what makes what-if simulation possible. Call this before the simulation tools so a connection ' +
      'problem is not mistaken for a result.',
    inputSchema: {
      includeCalcs: z.boolean().optional().describe('Also return the current computed stats. Default true.'),
    },
    annotations: { ...READ_ONLY, openWorldHint: true },
    handler: async (args) => {
      const bridge = pobBridge()
      const ping = await bridge.ping()
      if (!ping) {
        return {
          connected: false,
          reason:
            'No Path of Building instance answered on 127.0.0.1 ports 49085-49088. It must be running with the MCP ' +
            'Bridge addon installed. If it is running, check that the addon declares MCPConfig as a GLOBAL — declaring ' +
            'it local stops the TCP server binding and looks identical to Path of Building not running.',
          hint: 'Without this, damage figures come from poe.ninja only and what-if simulation is unavailable.',
        }
      }

      let calcs: Record<string, unknown> | { error: string } | null = null
      if (args.includeCalcs !== false && ping.build_loaded) {
        try {
          calcs = await bridge.getCalcs()
        } catch (err) {
          calcs = { error: (err as Error).message }
        }
      }

      return {
        connected: true,
        port: bridge.port,
        addonVersion: ping.version ?? null,
        pobVersion: ping.pob_version ?? null,
        buildLoaded: ping.build_loaded ?? false,
        buildName: ping.build_name ?? null,
        calcs,
        note: ping.build_loaded
          ? null
          : 'Path of Building is running but has no build open. Load one, or use poe2_pob_load_character.',
      }
    },
  },

  {
    name: 'poe2_pob_load_character',
    title: 'Send the loaded character to Path of Building',
    description:
      'Push the loaded character’s Path of Building export into the running Path of Building instance, so its engine ' +
      'can be used for simulation. Optionally applies passive tree changes on the way, letting a suggested route be ' +
      'tried directly. This replaces whatever build Path of Building currently has open — unsaved work there is lost.',
    inputSchema: {
      allocate: z.array(z.number().int()).optional().describe('Node ids to allocate before sending.'),
      deallocate: z.array(z.number().int()).optional().describe('Node ids to remove before sending.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    handler: async (args) => {
      const { model } = requireCharacter()
      let code = model.pathOfBuildingExport
      if (!code) {
        throw new Error(
          'poe.ninja did not attach a Path of Building export to this character, so there is nothing to send.',
        )
      }

      const allocate = (args.allocate as number[] | undefined) ?? []
      const deallocate = (args.deallocate as number[] | undefined) ?? []
      let edited: { added: number[]; removed: number[]; warnings: string[] } | null = null
      if (allocate.length || deallocate.length) {
        const result = await editPobTree(code, { allocate, deallocate })
        code = result.code
        edited = { added: result.added, removed: result.removed, warnings: result.warnings }
      }

      await pobBridge().loadBuild(code)

      return {
        loaded: true,
        character: requireCharacter().analysis.identity.name,
        treeEdits: edited,
        note:
          'Path of Building loads asynchronously. Call poe2_pob_status before reading any figure from it, rather ' +
          'than assuming the build is in place.',
      }
    },
  },

  {
    name: 'poe2_pob_simulate_node',
    title: 'Measure what a passive node is worth',
    description:
      'Allocate a passive node in the running Path of Building, measure every stat that moved, then put the tree ' +
      'back. The number comes from Path of Building’s own damage engine, so it is measured rather than estimated. ' +
      'Reports the real point cost, which is often more than one: Path of Building auto-paths, taking every node on ' +
      'the shortest route. Says explicitly whether the tree was restored — a failed restore leaves your Path of ' +
      'Building window modified.',
    inputSchema: {
      nodeId: z.number().int().describe('Passive node id to test. Get candidates from poe2_suggest_tree_routes.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args) => {
      const nodeId = Number(args.nodeId)
      const name = passiveTree().node(nodeId)?.name
      const result = await simulatePassiveNode(pobBridge(), nodeId, name)
      return { ...result, provenance: 'pob-sim' }
    },
  },

  {
    name: 'poe2_pob_simulate_mods',
    title: 'Measure what a set of modifiers is worth',
    description:
      'Apply modifiers to the running Path of Building as if they came from gear, measure every stat that moved, ' +
      'then restore what was there. This answers "what would +40 maximum life on a ring do" without owning the ring, ' +
      'and prices a gear swap in real numbers. Write modifiers the way an item does: "+40 to maximum Life", ' +
      '"25% increased Physical Damage".',
    inputSchema: {
      mods: z.array(z.string()).describe('Modifier lines, in item wording.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args) => {
      const mods = (args.mods as string[] | undefined) ?? []
      const result = await simulateCustomMods(pobBridge(), mods.map(String))
      return {
        ...result,
        provenance: 'pob-sim',
        note:
          'Path of Building accepts modifier text it understands and silently ignores the rest. A result with no ' +
          'stat changes usually means the wording was not recognised, not that the modifier is worthless.',
      }
    },
  },

  {
    name: 'poe2_pob_rank_nodes',
    title: 'Rank passive nodes by measured value',
    description:
      'Simulate each candidate passive node in the running Path of Building and rank them by the measured change per ' +
      'point spent. This is the difference between a suggestion and an answer: poe2_suggest_tree_routes ranks by what ' +
      'a node’s text says it grants, which cannot know what that is worth on this particular build. Rank by any stat ' +
      'Path of Building reports — TotalDPS by default, or Life, Armour, EnergyShield and so on. Candidates come ' +
      'either from explicit node ids, or from a stat to search the tree for. The tree is restored after each node, ' +
      'and the run stops rather than continue measuring against a build it could not restore.',
    inputSchema: {
      nodeIds: z.array(z.number().int()).optional().describe('Node ids to test. Use this or forStat.'),
      forStat: z
        .string()
        .optional()
        .describe('Find candidates granting this stat, e.g. "chaosResistance". Uses the same search as poe2_suggest_tree_routes.'),
      metric: z.string().optional().describe('Path of Building stat to rank by. Default TotalDPS.'),
      maxCandidates: z.number().int().optional().describe('Cap the number simulated. Default 6; each one costs a round trip.'),
      maxCost: z.number().int().optional().describe('With forStat: the most passive points a candidate may cost to reach. Default 4.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: async (args) => {
      const tree = passiveTree()
      const limit = Math.max(1, Number(args.maxCandidates ?? 6))

      let candidates: { id: number; name?: string }[]
      if (Array.isArray(args.nodeIds) && args.nodeIds.length) {
        candidates = (args.nodeIds as number[]).map((id) => ({ id, name: tree.node(id)?.name ?? undefined }))
      } else if (args.forStat) {
        const { passives } = requireCharacter().analysis
        const suggestions = suggestNodesForStat(tree, passives.live, String(args.forStat), {
          maxCost: Number(args.maxCost ?? 4),
          limit,
        })
        if (!suggestions.length) {
          throw new Error(
            `No reachable nodes grant "${args.forStat}" within the cost limit. Try a higher maxCost, or check the ` +
              'stat name against poe2_suggest_tree_routes.',
          )
        }
        candidates = suggestions.map((s) => ({ id: s.node.id, name: s.node.name }))
      } else {
        throw new Error('Provide either nodeIds, or forStat to search the tree for candidates.')
      }

      const report = await rankNodesByMeasuredGain(pobBridge(), candidates.slice(0, limit), {
        metric: args.metric ? String(args.metric) : undefined,
      })

      return {
        ...report,
        provenance: 'pob-sim',
        note:
          'Measured by Path of Building’s own engine on this build, not estimated. Cost includes any points the ' +
          'auto-path spent reaching the node.',
      }
    },
  },

  {
    name: 'poe2_explain_mechanic',
    title: 'Explain a PoE2 mechanic',
    description:
      'Explain a Path of Exile 2 mechanic, with the basis for each claim stated so it can be weighed. Covers armour, ' +
      'mitigation order, chaos and energy shield, maximum hit versus effective health pool, resistance caps, block, ' +
      'energy shield recharge, evasion, weapon sets, support categories, and deflection and ward. Omit the query to ' +
      'list everything covered.',
    inputSchema: {
      query: z.string().optional().describe('Mechanic id or search term, e.g. "armour" or "chaos".'),
    },
    annotations: READ_ONLY,
    handler: (args) => {
      const matches = findMechanicSafe(String(args.query ?? ''))
      if (!matches.length) {
        throw new Error(
          `Nothing covered for "${args.query}". This reference deliberately omits mechanics that have not been verified.`,
        )
      }
      return { matches }
    },
  },

  {
    name: 'poe2_health_check',
    title: 'Check server health',
    description:
      'Report which data sets are loaded, whether a character is active, whether poe.ninja is reachable and whether ' +
      'a live Path of Building is connected. Use this to distinguish a configuration problem from a genuinely empty ' +
      'result.',
    inputSchema: {
      checkNetwork: z.boolean().optional().describe('Also probe poe.ninja. Default false.'),
      checkPob: z.boolean().optional().describe('Also probe the local Path of Building bridge. Default false.'),
    },
    annotations: READ_ONLY_NETWORK,
    handler: async (args) => {
      const loaded = loadedCharacter()
      let tree: { nodes: number; edges: number } | { error: string }
      try {
        const t = passiveTree()
        tree = { nodes: t.size, edges: [...t.edgePairs()].length }
      } catch (err) {
        tree = { error: (err as Error).message }
      }

      let network: string | null = null
      if (args.checkNetwork) {
        try {
          const res = await fetch('https://poe.ninja/poe2/api/data/index-state')
          network = res.ok ? 'reachable' : `poe.ninja returned ${res.status}`
        } catch (err) {
          network = `unreachable: ${(err as Error).message}`
        }
      }

      let pob: string | null = null
      if (args.checkPob) {
        const ping = await pobBridge().ping()
        pob = ping
          ? `connected on port ${pobBridge().port}${ping.build_loaded ? `, build "${ping.build_name ?? 'unnamed'}" open` : ', no build open'}`
          : 'not running, or the addon is not installed'
      }

      return {
        toolCount: TOOLS.length,
        passiveTree: tree,
        character: loaded
          ? { loaded: true, name: loaded.analysis.identity.name, level: loaded.analysis.identity.level, source: loaded.source }
          : { loaded: false },
        poeNinja: network,
        pathOfBuilding: pob,
      }
    },
  },
]

function summarize(loaded: ReturnType<typeof loadedCharacter> extends null ? never : NonNullable<ReturnType<typeof loadedCharacter>>) {
  const { analysis } = loaded
  return {
    identity: analysis.identity,
    survivability: {
      lowestMaximumHit: analysis.defense.lowestMaximumHit,
      lowestMaximumHitType: analysis.defense.lowestMaximumHitType,
      effectiveHealthPool: analysis.defense.effectiveHealthPool,
    },
    primarySkill: analysis.dps.primary
      ? { name: analysis.dps.primary.name, dps: analysis.dps.primary.dps }
      : null,
    findingCount: analysis.recommendations.recommendations.length,
    crossValidated: analysis.pobStats !== null,
    warnings: analysis.warnings,
    source: loaded.source,
  }
}
