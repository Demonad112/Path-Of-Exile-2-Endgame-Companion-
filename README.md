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

This repository merges two earlier projects:

- [`Demonad112/POE2-MCP-V2`](https://github.com/Demonad112/POE2-MCP-V2) — the
  analysis core, the web presentation, and a Model Context Protocol server.
- [`Demonad112/Poe2-endgame`](https://github.com/Demonad112/Poe2-endgame) — the
  keystone corroboration, per-item stat attribution, progress tracking, and the
  static reference routes.

## Two rules that shape everything here

1. **Never recompute what poe.ninja already computed.** Its payload ships
   fully-calculated per-skill DPS and dozens of defensive stats. They are read,
   not re-derived.
2. **Never invent a number.** Where a value cannot be established from the
   data, the output says exactly what is missing instead of guessing.

## Status

Scaffolding. The merge lands on `claude/poe2-mcp-endgame-merge-2t8vvw`.

## Licence

MIT. See [LICENSE](LICENSE).
