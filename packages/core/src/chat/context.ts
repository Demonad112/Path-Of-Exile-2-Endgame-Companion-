/**
 * Ground a language model in the character's real numbers.
 *
 * ## The problem this solves
 *
 * A language model asked "is my build tanky?" will produce a confident,
 * plausible, and frequently invented answer. That is the exact failure this
 * project exists to avoid, and bolting a chat box onto it without care would
 * undo the rest of the work.
 *
 * So the model is never asked to compute anything. It is handed the figures this
 * project already derived — every one of them read from poe.ninja or Path of
 * Building — and instructed to answer only from them, and to say when the
 * context does not contain an answer.
 *
 * That does not make it reliable. It makes it *checkable*: every number in a
 * good answer appears verbatim in the context below, so a reader can verify one
 * against the panels on the page. The UI labels the output as model-generated
 * for the same reason.
 */

import type { Analysis } from '../analyze.js'
import type { PobAnalysis } from '../pob/analyze.js'

export const SYSTEM_PROMPT = `You are a Path of Exile 2 build analysis assistant embedded in a tool that reads a character's real, computed statistics.

RULES, in order of importance:

1. NEVER invent a number. Every figure you state must appear in the CONTEXT below. If a number is not there, say plainly that the tool did not resolve it, and name what is missing.
2. NEVER estimate DPS, effective health, or any derived statistic yourself. The context already contains what the game's own data and Path of Building computed. Arithmetic on those numbers is fine; inventing new ones is not.
3. Lead survivability with the lowest maximum hit taken, NOT the effective health pool. EHP averages across damage types and typically overstates the one-shot threshold by three times or more.
4. Weapon sets are alternates, never additive. Never sum stats from both.
5. Tier 1 is the BEST affix tier. A tier number is only meaningful against an item class.
6. When asked something the context cannot answer, say so and point at the tool that can — the passive tree panel, the gear panel, or the Path of Building bridge for what-if simulation.
7. Be concise and specific. Quote the actual figures. Do not pad with general Path of Exile advice the context does not support.`

export interface ChatContextOptions {
  /** Cap the rendered context. Long contexts cost money and add little. */
  maxItems?: number
}

function line(label: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  return `${label}: ${value}`
}

/** Render a full poe.ninja analysis as compact, factual context. */
export function buildChatContext(analysis: Analysis, options: ChatContextOptions = {}): string {
  const maxItems = options.maxItems ?? 12
  const d = analysis.defense
  const parts: string[] = []

  parts.push(
    [
      '## CHARACTER',
      line('Name', analysis.identity.name),
      line('Level', analysis.identity.level),
      line('Class', analysis.identity.className),
      line('League', analysis.identity.league),
      'Source: poe.ninja (all figures below are computed by the game data, not by this tool)',
    ]
      .filter(Boolean)
      .join('\n'),
  )

  parts.push(
    [
      '## SURVIVABILITY',
      line('Lowest maximum hit taken (the smallest single hit that kills)', `${d.lowestMaximumHit} ${d.lowestMaximumHitType ?? ''}`),
      line('Effective health pool (averaged — do NOT lead with this)', d.effectiveHealthPool),
      d.ehpOverstatementRatio ? `EHP overstates survivability by ${d.ehpOverstatementRatio}x` : null,
      line('Life', d.life),
      line('Energy shield', d.energyShield),
      line('Ward', d.ward || null),
      line('Armour', d.armour),
      line('Physical damage reduction', d.physicalDamageReduction !== null ? `${d.physicalDamageReduction}%` : null),
      line('Evasion', d.evasion),
      line('Evade chance', d.evadeChance ? `${d.evadeChance}%` : null),
      line('Block chance', d.blockChance ? `${d.blockChance}%` : null),
      line('Deflection rating', d.deflectionRating || null),
      '',
      'Maximum hit taken per damage type:',
      ...d.maxHits.map((h) => `  ${h.type}: ${h.value}`),
      '',
      'Resistances (cap shown; over/under cap stated):',
      ...d.resistances.map(
        (r) =>
          `  ${r.type}: ${r.value}% of ${r.max}%` +
          (r.overCap > 0 ? ` (+${r.overCap} over cap — wasted)` : '') +
          (r.underCap > 0 ? ` (${r.underCap} UNDER cap)` : ''),
      ),
      d.missing.length ? `\nNot present in the payload: ${d.missing.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  parts.push(
    [
      '## DAMAGE',
      `Read verbatim from poe.ninja's computed per-skill values. Provenance: ${analysis.dps.provenance}.`,
      ...analysis.dps.skills.map(
        (s) =>
          `  ${s.name}: ${s.dps} dps` +
          (s.dotDps ? `, ${s.dotDps} damage over time` : '') +
          (s.isDotOnly ? ' (damage over time only)' : '') +
          (s.hitRate !== null && s.hitRate < 1 ? `, hit rate ${s.hitRate}` : ''),
      ),
      analysis.dps.unresolved ? `Unresolved: ${analysis.dps.unresolved}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  const active = analysis.items.filter((i) => i.active).slice(0, maxItems)
  parts.push(
    [
      '## EQUIPPED (active weapon set only — sets are alternates, never additive)',
      ...active.map(
        (i) => `  ${i.slotLabel}: ${i.name} (${i.baseType})` + (i.itemLevel !== null ? `, item level ${i.itemLevel}` : ''),
      ),
    ].join('\n'),
  )

  parts.push(
    [
      '## PASSIVES',
      line('Allocated node ids in the main selection', analysis.passives.mainSelectionLength),
      line('Count reported by poe.ninja (a different measure — do not conflate)', analysis.passives.counts.passives),
      line('Ascendancy', analysis.passives.counts.ascendancy),
      line('Anoints', analysis.passives.counts.anoints),
      line('Active weapon set', analysis.passives.activeSet),
    ]
      .filter(Boolean)
      .join('\n'),
  )

  const recs = analysis.recommendations
  parts.push(
    [
      '## FINDINGS ALREADY DERIVED BY THIS TOOL',
      'These are ranked by gain per unit of cost. Prefer them over inventing your own advice.',
      ...recs.recommendations.slice(0, maxItems).map((r) => {
        const impact = r.impact ? ` [${r.impact.stat}: ${r.impact.from} -> ${r.impact.to}]` : ''
        return `  - ${r.action}${impact} (cost: ${r.cost.detail})` + (r.tradeoff ? ` (trade-off: ${r.tradeoff})` : '')
      }),
      recs.unresolved.length
        ? '\nCould NOT be determined (say so rather than guessing):\n' +
          recs.unresolved.map((u) => `  - ${u.question} — missing: ${u.missing}`).join('\n')
        : null,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  if (analysis.warnings.length) {
    parts.push(`## WARNINGS\n${analysis.warnings.map((w) => `  - ${w}`).join('\n')}`)
  }

  return parts.join('\n\n')
}

/** Render a Path-of-Building-sourced analysis. Fewer facts, same rules. */
export function buildPobChatContext(analysis: PobAnalysis): string {
  const d = analysis.defense
  return [
    '## CHARACTER',
    `Level ${analysis.identity.level ?? '?'} ${analysis.identity.ascendancy ?? analysis.identity.className ?? ''}`,
    'Source: a Path of Building export code. Every figure is Path of Building\'s own computation.',
    '',
    '## SURVIVABILITY',
    `Lowest maximum hit taken: ${d.lowestMaximumHit} ${d.lowestMaximumHitType ?? ''}`,
    `Effective health pool (averaged — do NOT lead with this): ${d.effectiveHealthPool}`,
    `Life ${d.life}, energy shield ${d.energyShield}, armour ${d.armour}, evasion ${d.evasion}`,
    ...d.resistances.map(
      (r) =>
        `  ${r.type}: ${r.value}% of ${r.max}%` +
        (r.overCap > 0 ? ` (+${r.overCap} over)` : '') +
        (r.underCap > 0 ? ` (${r.underCap} UNDER cap)` : ''),
    ),
    '',
    '## DAMAGE',
    `Total DPS ${analysis.damage.totalDps} (for the skill Path of Building had selected — there is no per-skill breakdown in a code)`,
    '',
    '## PASSIVES',
    `${analysis.passives.count} nodes allocated`,
    '',
    '## THIS SOURCE CANNOT ANSWER',
    ...analysis.gaps.map((g) => `  - ${g.what}: ${g.why}`),
  ].join('\n')
}
