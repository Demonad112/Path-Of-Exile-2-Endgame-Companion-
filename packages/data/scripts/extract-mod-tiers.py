#!/usr/bin/env python3
"""
Rebuild public/data/modTiers.v2.json from RePoE's PoE2 mod dump.

    python3 scripts/extract-mod-tiers.py

Why v2 exists
-------------
v1 was built by splitting a mod id into "family" + "tier" with a regex that
anchored the tier digits at end-of-string. PoE2 mod ids are not shaped that
way: RePoE keys mods as `LocalIncreasedEvasionAndEnergyShield5_` and
`LocalBaseEvasionRatingAndEnergyShield7___`, where the trailing underscores
are part of the key. Every such mod failed the split and was dropped, which
left *gaps inside families* — 39 of v1's 567 families were non-contiguous.

That is not cosmetic. `bestRowForIlvl` picks the highest row an item level
allows, so a missing top tier makes the audit report "already at the best
tier" when a better one exists. Verified against a real character: a boot
enchant rolled 79% `local_evasion_and_energy_shield_+%`, and v1's ladder for
that family jumped from t4 (56-67) straight to t6 (80-91) — 79 sat in a gap
where the dropped `...5_` mod (68-79) belongs.

RePoE already publishes the family grouping as a `type` field on every mod,
so no id parsing is needed at all. v2 groups by `type`, carries the mod id on
each row so the client can look a mod up directly, and keeps the affix name
per row rather than per family — 286 of 579 families use more than one affix
name across their tiers, so a single family-level name is wrong for half of
them.
"""

import json
import os
import sys
import urllib.request

SOURCE = "https://repoe-fork.github.io/poe2/mods.min.json"
OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "public",
    "data",
    "modTiers.v2.json",
)

# Domains whose mods occupy an affix slot on a piece of equipment. "item" is
# the ordinary prefix/suffix pool; "desecrated" is the separate desecration
# pool, which poe.ninja reports as its own mod category and which also takes
# an affix slot.
DOMAINS = {"item", "desecrated"}
GENERATION_TYPES = {"prefix", "suffix"}


def fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "poe2-endgame/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


def build(mods: dict) -> dict:
    families: dict[str, dict] = {}
    skipped_no_type = 0

    for mod_id, mod in mods.items():
        if mod.get("domain") not in DOMAINS:
            continue
        if mod.get("generation_type") not in GENERATION_TYPES:
            continue
        stats = mod.get("stats") or []
        if not stats:
            continue
        family = mod.get("type")
        if not family:
            skipped_no_type += 1
            continue

        # A family is keyed by (type, generation_type): the same type name can
        # appear as both a prefix and a suffix, and merging those would rank
        # two unrelated ladders against each other.
        key = f"{family}|{mod['generation_type'][0]}"
        entry = families.setdefault(key, {"g": mod["generation_type"], "t": []})
        entry["t"].append(
            {
                "d": mod_id,
                "a": mod.get("name") or None,
                "i": int(mod.get("required_level") or 0),
                "s": [
                    [s["id"], s.get("min"), s.get("max")]
                    for s in stats
                    if s.get("id")
                ],
            }
        )

    # Ascending required level, so index order matches power order and the
    # client's display-tier ranking stays a simple count.
    for entry in families.values():
        entry["t"].sort(key=lambda r: (r["i"], r["d"]))

    if skipped_no_type:
        print(f"  warning: {skipped_no_type} mods had no type and were skipped")
    return families


def main() -> int:
    print(f"fetching {SOURCE} ...")
    mods = fetch(SOURCE)
    print(f"  {len(mods)} mods in dump")

    families = build(mods)
    rows = sum(len(f["t"]) for f in families.values())
    print(f"  {len(families)} families, {rows} tier rows")

    # Every mod id must be unique across the table, or a client lookup keyed by
    # mod id would silently resolve to whichever family it happened to hit.
    seen: dict[str, str] = {}
    for key, fam in families.items():
        for row in fam["t"]:
            if row["d"] in seen:
                print(f"  ERROR: duplicate mod id {row['d']} in {seen[row['d']]} and {key}")
                return 1
            seen[row["d"]] = key

    gappy = 0
    for fam in families.values():
        levels = [r["i"] for r in fam["t"]]
        if levels != sorted(levels):
            gappy += 1
    if gappy:
        print(f"  ERROR: {gappy} families are not level-ordered")
        return 1

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(families, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {OUT} ({os.path.getsize(OUT) / 1024:.0f}KB, {len(seen)} mod ids)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
