# Path of Exile 2 Endgame Companion

> Unofficial, fan-made, and not affiliated with, endorsed by, or sponsored by
> Grinding Gear Games. Path of Exile and Path of Exile 2 are trademarks of
> Grinding Gear Games. All game content, mechanic names, and terminology
> referenced here belong to their respective owners; this repository contains
> only original code and community-sourced strategy notes.

A Path of Exile 2 character analyser and endgame companion. It reads
poe.ninja's own computed character data and turns it into ranked, quantified,
evidence-backed findings, alongside a progression checklist, an Atlas
allocation planner, and a farming dashboard.

## Two rules that shape everything here

1. **Never recompute what poe.ninja already computed.** Its payload ships
   fully-calculated per-skill DPS and dozens of defensive stats. They are read,
   not re-derived.
2. **Never invent a number.** Where a value cannot be established from the
   data, the output says exactly what is missing instead of guessing.

Two consequences that surprise people, both deliberate:

- **The build score's damage half is often blank.** Damage is graded only
  against figures observed on the ladder. With no sample the offence half is
  left unscored and the remainder rescaled, rather than measured against
  thresholds nobody established. There are no DPS constants in this codebase.
- **A keystone is not trusted because it is allocated.** A node appearing in an
  allocated list is not proof it is doing anything — a real ladder character
  carried Chaos Inoculation while reporting 1,823 life and 54% chaos
  resistance, the exact figures the keystone forbids. Where a keystone's effect
  is visible in stats already held, it must be observed before any of its
  corrections apply.

## Layout

| | |
|---|---|
| `packages/core` | Pure analysis. No I/O, no framework — `fetch` and the Path of Building transport are injected. 327 tests. |
| `packages/data` | Generated game data artifacts and the scripts that extract them. See [PROVENANCE.md](packages/data/PROVENANCE.md). |
| `apps/web` | Static Next.js export on GitHub Pages. Five routes. |
| `apps/mcp` | 30-tool Model Context Protocol server over stdio. See [TOOLS.md](apps/mcp/TOOLS.md). |
| `services/ninja-proxy` | Serverless functions. Needed because poe.ninja sends no CORS headers. |

**The invariant:** neither app contains analysis logic. Both import
`packages/core`. A predecessor project vendored a duplicate analyser into its
web app, so the app and the MCP server could only agree by coincidence. Do not
break this.

## Routes

- `/` — landing page and progress summary.
- `/character` — paste a poe.ninja profile URL or a Path of Building code and
  get an overall assessment, ranked findings, defence led by the smallest hit
  that kills, per-skill damage with the configuration it was computed under,
  what each equipped item is holding up and what a swap would cost, per-item
  modifier tiers, a rendered passive tree, progress since the last import, and
  cross-validation against Path of Building's own engine.
- `/checklist` — progression roadmap from campaign end through the full
  301-point Atlas tree, with benchmark gates and common-mistake warnings.
- `/atlas` — ordered Atlas cluster allocation, memory forks, and per-mechanic
  priority lists. This tracks *allocation sequence*, not the in-game tree's
  layout — the source guides carry no node-graph data.
- `/dashboard` — ranked farming strategies, a strategy-picker quiz, pinnacle
  boss requirements, and current meta builds.

Checklist, Atlas and dashboard progress is stored client-side in
`localStorage`, alongside up to twenty character snapshots per character —
figures only, never gear or modifiers, so history cannot crowd out the rest.
Static reference content lives in hand-edited files under
`apps/web/src/data/`; records that are unverified or that conflict across
sources carry a `SourceRef` and render as a badge.

## How this repository came to be

It merges two predecessors:

- [`Demonad112/POE2-MCP-V2`](https://github.com/Demonad112/POE2-MCP-V2) — the
  analysis core, the presentation, and the MCP server.
- [`Demonad112/Poe2-endgame`](https://github.com/Demonad112/Poe2-endgame) — the
  reference routes, the shell, and the proxy's ladder and health endpoints.

The merge was staged, in two parts:

1. Both projects carried whole into one app with one design language. Nothing
   about what the analysis concluded changed, which left the analyser's existing
   tests as an untouched control.
2. The five parts of `Poe2-endgame` that change what the analysis *says* —
   keystone corroboration, per-item stat attribution, the build score, progress
   snapshots and Path of Building config caveats — rebuilt on top of the merged
   core. Kept separate so that change was reviewable on its own.

## The poe.ninja proxy

The site is static, but character import cannot talk to poe.ninja from a
browser: poe.ninja sends no CORS headers, `OPTIONS` returns 405, and the first
hop of its character API is an SSE stream that public CORS proxies choke on.
`services/ninja-proxy/` performs the same two-step SSE-version → model fetch
server-side. It forwards only public profile data, needs no credentials, and
stores nothing.

The base URL is overridable with `NEXT_PUBLIC_NINJA_PROXY_BASE` (no trailing
slash). If the proxy is unreachable the UI falls back to pasting the character
JSON by hand, so the feature degrades rather than breaking.

## Development

```bash
npm install
npm run dev            # http://localhost:3000
```

Verification, all of which should pass before any change is called done:

```bash
npm run typecheck                  # builds core first; the script handles it
npm test                           # 327 tests
npm run build                      # core -> dist, then the web static export
node scripts/verify-mcp.mjs        # drives the real MCP binary over stdio
npm run tools -w @poe2/mcp         # regenerates TOOLS.md; CI fails if stale
```

The render checks drive a real browser against the built export, and each
defaults to `http://127.0.0.1:3210/character/`. Serve `apps/web/out` there
first, then:

```bash
node scripts/screenshot.mjs        # both themes, 1280px and 390px
node scripts/verify-phase2-ui.mjs  # assessment, config caveat, attribution, progress
node scripts/verify-gear-ui.mjs    # modifier tiers, swaps, headroom
node scripts/verify-tree.mjs       # the rendered passive tree
node scripts/verify-extras.mjs     # PoB-code import, chat, service worker
```

`scripts/verify-url-import.mjs` needs the local stand-in proxy and a build
pointed at it — its own header gives the three commands.

A console error whose URL is on another host is reported but not failed on: the
character page calls the ladder proxy on every import, and a machine with no
route to it would otherwise fail these checks for a network reason. That the
page degrades correctly without a sample is asserted separately, by name.

A local `next build` produces root-relative assets, because `basePath` is
applied only under GitHub Actions. Serve `out/` at the **root** locally, and
use a threaded server — `python3 -m http.server` is single-threaded and
silently drops parallel chunk requests, which looks exactly like a broken
build.

## Deployment

`.github/workflows/deploy.yml` builds and publishes `apps/web/out` to GitHub
Pages on every push to `main`. `basePath` is derived from `GITHUB_REPOSITORY`,
so renaming the repository needs no code change.

## Licence

MIT. See [LICENSE](LICENSE).
