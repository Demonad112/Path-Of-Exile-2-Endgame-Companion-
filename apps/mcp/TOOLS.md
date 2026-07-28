<!--
  GENERATED FILE — do not edit by hand.
  Regenerate with: npm run tools -w @poe2/mcp
-->

# Tools

28 tools. 24 are read-only; 4 marked ⚠️ act on a running Path of Building on this machine (`poe2_pob_load_character`, `poe2_pob_simulate_node`, `poe2_pob_simulate_mods`, `poe2_pob_rank_nodes`). Nothing here ever writes to a game account, a file, or poe.ninja.

| Tool | Purpose | Parameters |
|---|---|---|
| `poe2_load_character` | Fetch a Path of Exile 2 character from poe.ninja and make it the active character for every other tool. | `url`, `account`, `league`, `character`, `json` |
| `poe2_get_defenses` | Defensive breakdown of the loaded character, led by the lowest maximum hit taken — the smallest single hit that kills. | — |
| `poe2_get_skill_damage` | Per-skill damage for the loaded character, read verbatim from poe.ninja’s computed values — never recalculated. | `includeBuffs` |
| `poe2_get_recommendations` | Ranked, quantified improvements for the loaded character, ordered by gain per unit of cost so a free reallocation outranks an equally-sized fix that costs currency. | — |
| `poe2_find_stat_sources` | Attribute a stat to the exact items, passives, quests and attributes that grant it, using poe.ninja’s own per-stat breakdown. | `stat` |
| `poe2_analyze_passive_tree` | Passive allocation for the loaded character, resolved against the tree data. | — |
| `poe2_inspect_passive_node` | Look up a passive node by id or by name, returning its stats, kind, ascendancy and neighbours. | `id`, `name`, `limit` |
| `poe2_find_path_to_node` | Shortest route from the loaded character’s allocated tree to a target passive node, walking unallocated nodes. | `nodeId` |
| `poe2_get_skill_setups` | Every skill setup on the loaded character with its support gems, each support’s own tags, its category and the stats it grants — all read from the character payload rather than a gem database. | `skill` |
| `poe2_validate_support_gems` | Check a set of support gems against a skill. | `skill`, `supports` |
| `poe2_import_pob` | Decode a Path of Building export code and return the build level, class and Path of Building’s own computed stats. | `code` |
| `poe2_get_pob_code` | Return the Path of Building export code poe.ninja embeds for the loaded character, ready to paste into Path of Building, along with the stats it carries. | — |
| `poe2_cross_validate` | Compare poe.ninja’s computed stats against Path of Building’s own engine and against poe.ninja’s own breakdown arithmetic. | — |
| `poe2_search_mods` | Search the game’s item modifier table by stat text or affix name, returning tiers with their real roll ranges, affix names, level requirements and the item classes each modifier can appear on. | `query`, `kind`, `limit` |
| `poe2_analyze_item_mods` | Place each of an item’s modifier rolls in its tier, show how far each sits from the best possible roll, and check every line against the modifier pool for that item’s class. | `slot`, `mods`, `baseType` |
| `poe2_suggest_tree_routes` | Find the cheapest unallocated passive nodes granting a stat, with the real point cost and the exact route from the character’s current tree. | `stat`, `maxCost`, `notablesOnly`, `limit` |
| `poe2_export_pob_with_tree` | Apply passive tree changes to the loaded character’s Path of Building export and return a new code, ready to paste into Path of Building. | `allocate`, `deallocate`, `replace` |
| `poe2_analyze_gear` | Every modifier on every equipped item, with its affix tier, the roll inside that tier’s range, and what better tiers exist. | `slot`, `includeInactive` |
| `poe2_find_gear_improvements` | Two kinds of concrete gear change, both grounded in the affix data rather than opinion. | `limit` |
| `poe2_audit_character` | Five checks over parts of the character payload the other tools never read. | — |
| `poe2_survivability_headroom` | How the character’s smallest fatal hit compares to base monster damage at every waystone tier (1-16) and at the boss levels Path of Building itself uses — 82, the pinnacle boss floor, and 85, the ceiling for all enemies. | — |
| `poe2_pob_status` | Report whether a live Path of Building instance is reachable, which build it has open, and what its engine currently computes. | `includeCalcs` |
| `poe2_pob_load_character` ⚠️ | Push the loaded character’s Path of Building export into the running Path of Building instance, so its engine can be used for simulation. | `allocate`, `deallocate` |
| `poe2_pob_simulate_node` ⚠️ | Allocate a passive node in the running Path of Building, measure every stat that moved, then put the tree back. | `nodeId` |
| `poe2_pob_simulate_mods` ⚠️ | Apply modifiers to the running Path of Building as if they came from gear, measure every stat that moved, then restore what was there. | `mods` |
| `poe2_pob_rank_nodes` ⚠️ | Simulate each candidate passive node in the running Path of Building and rank them by the measured change per point spent. | `nodeIds`, `forStat`, `metric`, `maxCandidates`, `maxCost` |
| `poe2_explain_mechanic` | Explain a Path of Exile 2 mechanic, with the basis for each claim stated so it can be weighed. | `query` |
| `poe2_health_check` | Report which data sets are loaded, whether a character is active, whether poe.ninja is reachable and whether a live Path of Building is connected. | `checkNetwork`, `checkPob` |

Every tool is a thin adapter over `@poe2/core`. The MCP server contains no
analysis logic of its own, so it and the web app return the same numbers by
construction rather than by two implementations being kept in step.

## Detail

### `poe2_load_character`

**Load a character**

Fetch a Path of Exile 2 character from poe.ninja and make it the active character for every other tool. Accepts either a full poe.ninja profile URL, or account plus league plus character name. Also accepts a raw character model JSON payload for offline use. Returns an identity and headline summary; call the more specific tools for detail.

- `url` *(optional)* — A poe.ninja PoE2 profile URL, e.g. https://poe.ninja/poe2/profile/Name-1234/runesofaldur/character/Char
- `account` *(optional)* — Account in Name-1234 or Name#1234 form. Used with league and character.
- `league` *(optional)* — League slug, e.g. runesofaldur or standard.
- `character` *(optional)* — Character name.
- `json` *(optional)* — A raw character model JSON payload, as an alternative to fetching.

### `poe2_get_defenses`

**Get defensive analysis**

Defensive breakdown of the loaded character, led by the lowest maximum hit taken — the smallest single hit that kills. Includes per-damage-type maximum hits, resistances with over- and under-cap amounts, and the 0.5 mechanics deflection and ward. Also reports how far the averaged effective health pool overstates survivability.

_No parameters._

### `poe2_get_skill_damage`

**Get per-skill damage**

Per-skill damage for the loaded character, read verbatim from poe.ninja’s computed values — never recalculated. Includes hit DPS, damage over time, use rate, critical strike, projectiles and the damage-type split. Charge-up skills report a hit rate below 1, meaning only that fraction of uses land.

- `includeBuffs` *(optional)* — Include buff and herald skills, which deal damage over time only. Default false.

### `poe2_get_recommendations`

**Get ranked recommendations**

Ranked, quantified improvements for the loaded character, ordered by gain per unit of cost so a free reallocation outranks an equally-sized fix that costs currency. Each carries the concrete action, the measured impact, the cost, the trade-off, and an evidence trail tracing every claim back to the payload. Also reports what could not be determined, rather than guessing.

_No parameters._

### `poe2_find_stat_sources`

**Find what grants a stat**

Attribute a stat to the exact items, passives, quests and attributes that grant it, using poe.ninja’s own per-stat breakdown. This is what makes "replace this ring" able to state precisely what would be lost. Stat keys are names like life, energyShield, armour, evasionRating, ward, fireResistance.

- `stat` — Stat key, e.g. "armour", "life", "coldResistance".

### `poe2_analyze_passive_tree`

**Analyze the passive tree**

Passive allocation for the loaded character, resolved against the tree data. Keeps the two weapon sets separate — they are alternates, never additive — and reports allocated notables, keystones and jewel sockets. Multiple connected groups are normal and are explained rather than flagged as a broken tree.

_No parameters._

### `poe2_inspect_passive_node`

**Inspect a passive node**

Look up a passive node by id or by name, returning its stats, kind, ascendancy and neighbours. Name lookup is a case-insensitive substring match and returns every match, since notable names repeat across the tree.

- `id` *(optional)* — Node id.
- `name` *(optional)* — Node name or fragment, e.g. "Gathering Winds".
- `limit` *(optional)* — Maximum matches for a name search. Default 10.

### `poe2_find_path_to_node`

**Find the cheapest path to a node**

Shortest route from the loaded character’s allocated tree to a target passive node, walking unallocated nodes. Returns the nodes that would need allocating and the passive-point cost. Returns a zero-cost result when the node is already allocated, and reports unreachable rather than guessing.

- `nodeId` — Target passive node id.

### `poe2_get_skill_setups`

**Get skill and support gem setups**

Every skill setup on the loaded character with its support gems, each support’s own tags, its category and the stats it grants — all read from the character payload rather than a gem database.

- `skill` *(optional)* — Restrict to one active skill by name.

### `poe2_validate_support_gems`

**Validate a support gem combination**

Check a set of support gems against a skill. Reports two things, both grounded in the payload rather than inferred: support gems sharing a category, which the game forbids within one skill, and supports whose tags share nothing with the skill so they have nothing to act on. Gem definitions come from the loaded character, so unknown gem names are reported as unknown rather than assumed valid. Validates the character’s own setups when no arguments are given.

- `skill` *(optional)* — Active skill name. Omit to validate every setup on the character.
- `supports` *(optional)* — Support gem names to check against that skill.

### `poe2_import_pob`

**Import a Path of Building code**

Decode a Path of Building export code and return the build level, class and Path of Building’s own computed stats. Those stats are an independent second opinion on poe.ninja’s numbers — where the two agree, both are trustworthy; where they disagree, that is worth knowing.

- `code` — A Path of Building export code (base64url + zlib).

### `poe2_get_pob_code`

**Get the character’s Path of Building code**

Return the Path of Building export code poe.ninja embeds for the loaded character, ready to paste into Path of Building, along with the stats it carries.

_No parameters._

### `poe2_cross_validate`

**Cross-validate poe.ninja against Path of Building**

Compare poe.ninja’s computed stats against Path of Building’s own engine and against poe.ninja’s own breakdown arithmetic. Disagreements are flagged rather than resolved — silently preferring one source is how a wrong number ships looking confident. Stats that cannot be verified are listed as such.

_No parameters._

### `poe2_search_mods`

**Search item modifiers**

Search the game’s item modifier table by stat text or affix name, returning tiers with their real roll ranges, affix names, level requirements and the item classes each modifier can appear on. Tier 1 is the best. Useful for judging what an item could roll, or what a craft is aiming at.

- `query` — Stat text or affix name, e.g. "to Strength", "Lightning Resistance", "of the Gods".
- `kind` *(optional)* — Restrict to one modifier kind.
- `limit` *(optional)* — Maximum results. Default 15.

### `poe2_analyze_item_mods`

**Analyze an item’s modifier rolls**

Place each of an item’s modifier rolls in its tier, show how far each sits from the best possible roll, and check every line against the modifier pool for that item’s class. Analyses an equipped item on the loaded character by slot, or arbitrary mod lines with a base name. Lines absent from the tables report as unmatched or unknown rather than guessed at — runes, implicits and unique-only modifiers all fall in that category, and absence is never treated as a violation.

- `slot` *(optional)* — Equipment slot id on the loaded character: 1 helmet, 2 gloves, 3 body, 4 amulet, 5 boots, 6 off hand, 7 main hand, 8/9 rings, 11 belt, 15/16 swap weapons.
- `mods` *(optional)* — Modifier lines to analyse directly, instead of an equipped item.
- `baseType` *(optional)* — Base item name for the provided lines, e.g. "Militant Bow". Enables the item-class compatibility check.

### `poe2_suggest_tree_routes`

**Suggest passive routes for a stat**

Find the cheapest unallocated passive nodes granting a stat, with the real point cost and the exact route from the character’s current tree. Ranked by value per point. This reports what a node costs and what it prints — it does not claim a node is the right choice, since that depends on where the build is heading.

- `stat` — Stat key, e.g. chaosResistance, coldResistance, life, energyShield, armour, evasionRating.
- `maxCost` *(optional)* — Maximum passive points to spend. Default 4.
- `notablesOnly` *(optional)* — Only notables and keystones. Default false.
- `limit` *(optional)* — Maximum routes. Default 5.

### `poe2_export_pob_with_tree`

**Export a Path of Building code with a modified tree**

Apply passive tree changes to the loaded character’s Path of Building export and return a new code, ready to paste into Path of Building. Only the tree is rewritten; items, gems, config and calc settings are preserved byte-for-byte, because this project does not model them. Combine with poe2_suggest_tree_routes to try a route out in Path of Building’s own engine.

- `allocate` *(optional)* — Node ids to allocate, on top of the current tree.
- `deallocate` *(optional)* — Node ids to remove.
- `replace` *(optional)* — Replace the allocation outright. Takes precedence.

### `poe2_analyze_gear`

**Analyse equipped gear, mod by mod**

Every modifier on every equipped item, with its affix tier, the roll inside that tier’s range, and what better tiers exist. Tiers are resolved against the item’s own class — T1 is the best. Crucially it separates upgrades achievable on the item you already own from those needing a higher item level base, because those are different actions at very different costs. Modifiers poe.ninja gave no id for (implicits, runes) are shown as text with no tier rather than guessed at.

- `slot` *(optional)* — One slot id only. Omit for every equipped item.
- `includeInactive` *(optional)* — Include the inactive weapon set. Default false — those stats are not live.

### `poe2_find_gear_improvements`

**Find gear changes worth making**

Two kinds of concrete gear change, both grounded in the affix data rather than opinion. First, resistance rebalancing: modifiers granting resistance the character is already over cap on are provably wasted, and this names the item, the modifier, and the specific affixes that could replace it to cover what is short — ranked by how much of the gap each closes. Second, tier upgrades: modifiers sitting below the best tier their item could hold. Corrupted items are excluded from recrafting advice because their affixes cannot change.

- `limit` *(optional)* — Cap each list. Default 8.

### `poe2_audit_character`

**Audit the things nothing else checks**

Five checks over parts of the character payload the other tools never read. Socketed jewels, tiered against jewel spawn rules rather than gear ones. Empty rune sockets, which are free stats not taken. Levelled skill gems below the 20% quality cap, flagged most confidently where another copy of the same gem IS at higher quality. How close each attribute sits to what the gear requires — a small margin means losing one source unequips something. And how much spirit is reserved versus idle. Nothing here is estimated; anything needing the Path of Building export says so when it is absent rather than reporting zero.

_No parameters._

### `poe2_survivability_headroom`

**Survivability by map tier and against bosses**

How the character’s smallest fatal hit compares to base monster damage at every waystone tier (1-16) and at the boss levels Path of Building itself uses — 82, the pinnacle boss floor, and 85, the ceiling for all enemies. Tier maps to area level as 64 + tier, taken from the waystone item bases. Reports the highest tier that is comfortable and the first that is not. The figure is against a BASE monster: rares, uniques and map modifiers hit considerably harder and are not modelled, so it is an upper bound rather than a safety verdict, and the caveats are returned alongside it so the number is never read bare.

_No parameters._

### `poe2_pob_status`

**Check the Path of Building bridge**

Report whether a live Path of Building instance is reachable, which build it has open, and what its engine currently computes. Everything else in this server reads poe.ninja’s numbers; this reads Path of Building’s own, which is what makes what-if simulation possible. Call this before the simulation tools so a connection problem is not mistaken for a result.

- `includeCalcs` *(optional)* — Also return the current computed stats. Default true.

### `poe2_pob_load_character`

**Send the loaded character to Path of Building**

Push the loaded character’s Path of Building export into the running Path of Building instance, so its engine can be used for simulation. Optionally applies passive tree changes on the way, letting a suggested route be tried directly. This replaces whatever build Path of Building currently has open — unsaved work there is lost.

- `allocate` *(optional)* — Node ids to allocate before sending.
- `deallocate` *(optional)* — Node ids to remove before sending.

### `poe2_pob_simulate_node`

**Measure what a passive node is worth**

Allocate a passive node in the running Path of Building, measure every stat that moved, then put the tree back. The number comes from Path of Building’s own damage engine, so it is measured rather than estimated. Reports the real point cost, which is often more than one: Path of Building auto-paths, taking every node on the shortest route. Says explicitly whether the tree was restored — a failed restore leaves your Path of Building window modified.

- `nodeId` — Passive node id to test. Get candidates from poe2_suggest_tree_routes.

### `poe2_pob_simulate_mods`

**Measure what a set of modifiers is worth**

Apply modifiers to the running Path of Building as if they came from gear, measure every stat that moved, then restore what was there. This answers "what would +40 maximum life on a ring do" without owning the ring, and prices a gear swap in real numbers. Write modifiers the way an item does: "+40 to maximum Life", "25% increased Physical Damage".

- `mods` — Modifier lines, in item wording.

### `poe2_pob_rank_nodes`

**Rank passive nodes by measured value**

Simulate each candidate passive node in the running Path of Building and rank them by the measured change per point spent. This is the difference between a suggestion and an answer: poe2_suggest_tree_routes ranks by what a node’s text says it grants, which cannot know what that is worth on this particular build. Rank by any stat Path of Building reports — TotalDPS by default, or Life, Armour, EnergyShield and so on. Candidates come either from explicit node ids, or from a stat to search the tree for. The tree is restored after each node, and the run stops rather than continue measuring against a build it could not restore.

- `nodeIds` *(optional)* — Node ids to test. Use this or forStat.
- `forStat` *(optional)* — Find candidates granting this stat, e.g. "chaosResistance". Uses the same search as poe2_suggest_tree_routes.
- `metric` *(optional)* — Path of Building stat to rank by. Default TotalDPS.
- `maxCandidates` *(optional)* — Cap the number simulated. Default 6; each one costs a round trip.
- `maxCost` *(optional)* — With forStat: the most passive points a candidate may cost to reach. Default 4.

### `poe2_explain_mechanic`

**Explain a PoE2 mechanic**

Explain a Path of Exile 2 mechanic, with the basis for each claim stated so it can be weighed. Covers armour, mitigation order, chaos and energy shield, maximum hit versus effective health pool, resistance caps, block, energy shield recharge, evasion, weapon sets, support categories, and deflection and ward. Omit the query to list everything covered.

- `query` *(optional)* — Mechanic id or search term, e.g. "armour" or "chaos".

### `poe2_health_check`

**Check server health**

Report which data sets are loaded, whether a character is active, whether poe.ninja is reachable and whether a live Path of Building is connected. Use this to distinguish a configuration problem from a genuinely empty result.

- `checkNetwork` *(optional)* — Also probe poe.ninja. Default false.
- `checkPob` *(optional)* — Also probe the local Path of Building bridge. Default false.

