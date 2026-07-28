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

## Layout

| | |
|---|---|
| `packages/core` | Pure analysis. No I/O, no framework — `fetch` and the Path of Building transport are injected. 235 tests. |
| `packages/data` | Generated game data artifacts and the scripts that extract them. See [PROVENANCE.md](packages/data/PROVENANCE.md). |
| `apps/web` | Static Next.js export on GitHub Pages. Five routes. |
| `apps/mcp` | 28-tool Model Context Protocol server over stdio. See [TOOLS.md](apps/mcp/TOOLS.md). |
| `services/ninja-proxy` | Serverless functions. Needed because poe.ninja sends no CORS headers. |

**The invariant:** neither app contains analysis logic. Both import
`packages/core`. A predecessor project vendored a duplicate analyser into its
web app, so the app and the MCP server could only agree by coincidence. Do not
break this.

## Routes

- `/` — landing page and progress summary.
- `/character` — paste a poe.ninja profile URL or a Path of Building code and
  get ranked findings, defence led by the smallest hit that kills, per-skill
  damage, per-item modifier tiers, a rendered passive tree, and
  cross-validation against Path of Building's own engine.
- `/checklist` — progression roadmap from campaign end through the full
  301-point Atlas tree, with benchmark gates and common-mistake warnings.
- `/atlas` — ordered Atlas cluster allocation, memory forks, and per-mechanic
  priority lists. This tracks *allocation sequence*, not the in-game tree's
  layout — the source guides carry no node-graph data.
- `/dashboard` — ranked farming strategies, a strategy-picker quiz, pinnacle
  boss requirements, and current meta builds.

Checklist, Atlas and dashboard progress is stored client-side in
`localStorage`. Static reference content lives in hand-edited files under
`apps/web/src/data/`; records that are unverified or that conflict across
sources carry a `SourceRef` and render as a badge.

## How this repository came to be

It merges two predecessors:

- [`Demonad112/POE2-MCP-V2`](https://github.com/Demonad112/POE2-MCP-V2) — the
  analysis core, the presentation, and the MCP server.
- [`Demonad112/Poe2-endgame`](https://github.com/Demonad112/Poe2-endgame) — the
  reference routes, the shell, and the proxy's ladder and health endpoints.

The merge is staged. This first stage carries the whole of the analyser and the
whole of the reference site into one app with one design language. Endgame's
keystone corroboration, per-item stat attribution, build score, progress
snapshots and Path of Building config caveats land in `packages/core` in the
next stage — they are the parts that change what the analysis *says*, and they
are kept separate so that change is reviewable on its own.

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
npm test                           # 235 tests
npm run build                      # core -> dist, then the web static export
node scripts/verify-mcp.mjs        # drives the real MCP binary over stdio
npm run tools -w @poe2/mcp         # regenerates TOOLS.md; CI fails if stale
```

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
