# Visual design notes

Dark-first, information-dense, and deliberately restrained: the goal is a page
that is *informative without being overbearing*. Density comes from ranking and
hierarchy, not from showing everything at once.

## Hierarchy

The page answers three questions in order:

1. **What will kill me?** — a single hero number, `lowestMaximumHitTaken`, in the
   danger colour, with the EHP overstatement stated beneath it.
2. **What should I do about it?** — ranked findings, each with impact, cost and
   trade-off visible without interaction; evidence one click away.
3. **What are the details?** — defence stats, gear, the DPS matrix,
   cross-validation.

Evidence trails, buff skills, and the full cross-validation list are all
collapsed by default. Everything is available; nothing shouts.

## Colour

The damage-type palette is **validated, not chosen by eye**. It was run through
the `dataviz` skill's six-check validator against both surfaces:

| Type | Light | Dark |
|---|---|---|
| Physical | `#1baf7a` | `#199e70` |
| Fire | `#eb6834` | `#d95926` |
| Cold | `#2a78d6` | `#3987e5` |
| Lightning | `#eda100` | `#c98500` |
| Chaos | `#4a3aa7` | `#9085e9` |

```
$ node scripts/validate_palette.js "#199e70,#d95926,#3987e5,#c98500,#9085e9" --mode dark
  [PASS] Lightness band · Chroma floor · CVD separation (worst adjacent ΔE 9.4)
  [PASS] Normal-vision floor (ΔE 26.5) · Contrast vs surface
  → ALL CHECKS PASS
```

Two consequences to preserve if these are ever changed:

- **Physical is aqua, not grey.** Every neutral candidate failed the chroma floor
  — a near-grey series colour reads as gridline, not data. Semantics lost to
  legibility here, and the legend plus direct labels carry identity anyway.
- **Light mode has a contrast WARN** on the aqua and yellow steps. The validator
  permits this only with *relief*: every damage-split segment at or above 12%
  carries an inline percentage label, and every bar is directly labelled. Do not
  remove those labels.

Fire and lightning are never adjacent in a stacked bar — the fixed damage-type
order puts cold between them, which is the pair the validator flags under
all-pairs comparison.

## Marks

- Damage-split segments are separated by a 2px surface gap, with 4px rounded
  ends on the data end of every bar.
- Grid, axes and rules are recessive; text uses ink tokens, never a series
  colour, so identity always rests on a mark beside the text.
- Max-hit bars are sorted thinnest-first, so the killing vector is read first.

## Theme

Dark by default. The viewer's toggle stamps `data-theme` on the root and wins
over the OS preference in both directions; a bootstrap script applies the stored
choice before paint so a light preference never flashes dark.

## Responsiveness

Panels are single-column below `lg`. Wide content — the DPS matrix — scrolls
inside its own `overflow-x-auto` container; **the page body never scrolls
horizontally**, and `scripts/screenshot.mjs` asserts this at 390px.

Every panel carries `min-w-0`. Without it a grid child defaults to
`min-width: auto`, refuses to shrink below its content, and pushes the whole page
into horizontal scroll — which is exactly the bug the screenshot check caught.

## Loading

Analysis takes a moment: a 388 KB payload plus a zlib inflate for the PoB
cross-check. The skeleton mirrors the final layout so nothing jumps when real
content lands, and it respects `prefers-reduced-motion`.
