# Test fixtures

## `athrynas-v43.json`

A **real** captured character model — not a synthetic stub. V1's only fixture
was `tests/fixtures/poe_ninja/synthetic_lvl90.json`, a defence-only stub whose
own note asked to be replaced with a real capture. This is that replacement.

| | |
|---|---|
| Character | Athrynas |
| Account | `Demonad112-2589` |
| League | Runes of Aldur (`runesofaldur`) |
| Class | Deadeye (Ranger) |
| Level | 86 |
| Model version | 43 |
| Size | 388,435 bytes |
| Captured | 2026-07-24 |

Fetched with the documented two-step read:

```
GET https://poe.ninja/poe2/api/events/character/Demonad112-2589/runesofaldur/Athrynas
    -> data: {"version":43}
GET https://poe.ninja/poe2/api/profile/characters/Demonad112-2589/runesofaldur/Athrynas/model/43
```

Stored verbatim, including the `{type, charModel}` envelope. Do not reformat
or prune it — its value is being exactly what the API returned.

### Why this character

It exercises nearly every edge case the analyser has to survive:

- **Sparse per-skill damage blocks.** Snipe carries `hitRate` (0.771); ordinary
  attacks omit the key entirely. Heralds report `dps: 0` with `dotDps` only.
- **Meta gems with no name.** Four `skills[]` entries (Mirage Archer, Freezing
  Mark, Ice-Tipped Arrows, Mirage Deadeye) carry a `dps` block with no `name`.
- **Both weapon sets populated.** `useSecondWeaponSet: false` with items in
  slots 15/16 and 16 passives allocated to each set — the exact shape V1
  mis-summed as a single 135-node tree.
- **A resistance misallocation.** Cold at 74 (one short of cap) while fire sits
  24 points *over* cap.
- **EHP that lies.** 13,569 effective health pool against a 3,808 chaos
  one-shot threshold — a 3.5x overstatement.
- **A full `breakdowns` block.** 35 stats, 46 sources, covering every source
  type (base, passive, item, attribute, quest, derived).
- **An attached PoB export** for independent cross-validation.
