# @poe2/mcp

MCP server exposing the Path of Exile 2 build analyser over stdio.

Every tool is a thin adapter over `@poe2/core`. The server contains no analysis
logic of its own — it and the web app return the same numbers because they read
the same module, not because two implementations are kept in step.

See [TOOLS.md](./TOOLS.md) for the tool reference. **That file is generated from
the registry** (`npm run tools -w @poe2/mcp`). V1 shipped four different tool
counts across its README, architecture doc, changelog and a docstring; the only
reliable fix is to not write the list by hand.

## Setup

```bash
npm install
npm run build -w @poe2/mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

- macOS `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "poe2": {
      "command": "node",
      "args": ["/absolute/path/to/POE2-MCP-V2/apps/mcp/dist/index.js"]
    }
  }
}
```

Use an absolute path, and restart Claude Desktop afterwards. Verify with
`poe2_health_check`, which reports the tool count, whether the passive tree data
loaded, and — with `checkNetwork: true` — whether poe.ninja is reachable.

## Typical session

```
poe2_load_character  url: https://poe.ninja/poe2/profile/Demonad112-2589/runesofaldur/character/Athrynas
poe2_get_recommendations
poe2_find_stat_sources  stat: armour
poe2_find_path_to_node  nodeId: 12345
```

`poe2_load_character` sets the active character; every other tool reads it. The
payload is ~400 KB and the fetch involves an SSE version hop, so it is loaded
once rather than per call. Tools called before it fail with a message naming the
tool to call, rather than returning empty results.

It also accepts a raw payload via `json`, which needs no network at all.

## Design notes

**No CORS proxy here.** The server talks to poe.ninja directly, which the
browser cannot do — poe.ninja sends no `Access-Control-Allow-Origin` header and
rejects preflight. That is why `services/ninja-proxy` exists for the web app and
is irrelevant to this server.

**stdout is the protocol channel.** Nothing may write to it except MCP messages;
a stray `console.log` corrupts the stream. Diagnostics go to stderr, and
`scripts/verify-mcp.mjs` fails the build if anything non-JSON appears on stdout.

**Errors are returned, not thrown.** A tool that fails returns `isError` with a
readable message, so the model can correct itself rather than seeing an opaque
protocol failure. Messages name the fix: an unknown stat lists the available
stats, an unknown skill lists the character's skills.

**Only the bridge tools have effects.** Twenty of the twenty-four read data and
nothing else. The four marked ⚠️ in TOOLS.md drive a Path of Building instance
running on this machine. None of them touches a game account, a file, or
poe.ninja.

## The Path of Building bridge

Everything else in this server reports what poe.ninja computed. The bridge
reports what Path of Building computes — which is the only way to answer "what
would this node be worth" with a measured number rather than an estimate.

It works by driving the real application: apply a change, read the new figures,
put it back. Two consequences follow, and both are handled rather than hoped
away.

**Path of Building auto-paths.** `AllocNode` takes the whole shortest route to a
node, so asking for one node can spend several points. That is reported as the
real cost — and it means the undo has to remove every node that appeared, not
just the one requested.

**A revert that fails leaves your build modified.** So it is verified, not
assumed: the tree is re-read afterwards and compared against the original set.
`reverted: false` means exactly that, with the offending node ids named. The
custom-modifier box is treated the same way — whatever you already had in it is
captured and restored, never cleared.

### Suggested versus measured

`poe2_suggest_tree_routes` ranks nodes by what their text *says* they grant,
divided by the points to reach them. That is honest, and it is shallow: a node
printing "+12% increased Physical Damage" can be worth more or less than one
printing "+15%", depending on everything else on the character. Only the damage
engine knows which.

`poe2_pob_rank_nodes` answers it. It simulates each candidate and ranks by the
**measured** change per point — against any stat PoB reports, not just damage.
Feed it node ids, or a stat to search the tree for.

If a node cannot be restored part-way through, the run **stops**. Every later
measurement would otherwise be taken against a tree that is no longer yours —
numbers that look completely ordinary and are quietly wrong. It returns what it
had, says which node dirtied the tree, and re-checks the baseline at the end to
catch drift the individual reverts missed.

### Setup

1. Install the MCP Bridge addon into Path of Building (from
   [Demonad112/poe2-mcp](https://github.com/Demonad112/poe2-mcp), `pob_addon/`).
2. In the addon's config, **`MCPConfig` must be a global.** Declaring it `local`
   stops the TCP server binding, and the failure is indistinguishable from Path
   of Building not running at all.
3. Start Path of Building and open a build.

The bridge listens on `127.0.0.1:49085`, falling back through 49086-49088. It is
localhost-only and nothing here changes that.

### Verifying the bridge

**This is the one part of the project not verified end to end.** The protocol is
tested against a fake that reproduces the addon's real quirks — 30 tests across
`pob-bridge.test.ts` and `pob-rank.test.ts` — and CI asserts that an absent Path
of Building is reported as unreachable rather than as a zero. But no Path of
Building runs in CI, so:

```
poe2_pob_status
poe2_load_character       url: <your poe.ninja profile URL>
poe2_pob_load_character
poe2_pob_simulate_node    nodeId: <an id from poe2_suggest_tree_routes>
poe2_pob_rank_nodes       forStat: chaosResistance   metric: ChaosResist
```

Three things are worth checking by eye, because a passing tool call does not
prove them:

- `poe2_pob_status` reports the build name you actually have open.
- After `poe2_pob_simulate_node`, your Path of Building tree looks **exactly**
  as it did before. The tool claims `reverted: true` only after re-reading the
  tree, but the window in front of you is the real check.
- The `cost.points` figure matches what Path of Building charges you if you
  allocate that node by hand.

## What the tools will not tell you

- **Support gem legality beyond category conflicts.** The game's stated rule —
  no two supports of the same category in one skill — is checked, along with
  supports whose tags share nothing with the skill. Nothing else is claimed,
  because nothing else is derivable: the extracted gem databases carry no usable
  constraints, and inventing rules is exactly the failure this project avoids.
- **Modifier restrictions beyond the item class.** `poe2_analyze_item_mods`
  checks each line against the mod pool for that item's class, using data from
  RePoE-fork. Item level requirements, influence, and crafting restrictions
  beyond the class pool are not modelled — and a modifier the table does not
  list reports as `unknown`, never as a violation, because absence is not
  evidence of illegality.
- **Whether a passive node is the *right* choice.**
  `poe2_suggest_tree_routes` reports what a node costs and what it prints,
  ranked by value per point. Which node suits a build depends on where that
  build is heading, and that is not something this can measure.
- **Ladder comparison.** Cut deliberately. poe.ninja's builds API ignores
  per-skill sort keys and filter parameters, and reports DPS only as a lossy
  display string.
- **Whether Path of Building understood a modifier.** `poe2_pob_simulate_mods`
  passes text to PoB's custom-modifier box, which accepts what it recognises and
  silently ignores the rest. A result with no stat changes usually means the
  wording was not recognised. That is reported as a caveat on every result,
  because it cannot be distinguished from a genuinely worthless modifier.

## Verifying

```bash
node scripts/verify-mcp.mjs
```

Spawns the real binary, completes the initialise handshake, lists tools, and
calls a representative set against the committed character — asserting the
values that come back are the real ones (lowest max hit 3,808 chaos; Ice Shot
109,859; armour 207 from Golem Tether; 3 allocation groups; a duplicate support
category correctly rejected). Runs in CI.
