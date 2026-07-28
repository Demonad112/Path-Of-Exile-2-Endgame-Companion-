'use client'

/**
 * What a Path of Building code alone can tell you.
 *
 * Fewer panels than a poe.ninja import, and every figure in them is real —
 * Path of Building's own engine computed all 106 of them. The gaps are listed
 * explicitly rather than rendered as empty panels, because "this source cannot
 * answer that" and "this build has none" look identical otherwise.
 */

import type { PobAnalysis } from '@poe2/core'
import { Hero, Panel, Stat, Tag, fmt } from './ui'

export function PobAnalysisView({ analysis }: { analysis: PobAnalysis }) {
  const d = analysis.defense
  const overstates = d.ehpOverstatementRatio !== null && d.ehpOverstatementRatio > 1.5

  return (
    <div className="grid gap-4">
      <Panel
        title="Imported from a Path of Building code"
        subtitle="Every figure below is Path of Building's own, read from the code — nothing here is estimated."
        action={<Tag tone="accent">source: Path of Building</Tag>}
      >
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="text-lg font-semibold text-ink">
            Level {analysis.identity.level ?? '?'} {analysis.identity.ascendancy ?? analysis.identity.className ?? ''}
          </h2>
          <span className="text-xs text-ink-mute">{analysis.passives.count} passives allocated</span>
        </div>
      </Panel>

      <Panel
        title="Survivability"
        subtitle="Led by the smallest hit that kills, not by an averaged pool."
      >
        {d.lowestMaximumHit !== null ? (
          <Hero
            value={fmt(d.lowestMaximumHit)}
            label={`smallest fatal ${d.lowestMaximumHitType ?? ''} hit`}
          />
        ) : null}

        {overstates ? (
          <p className="mt-2 rounded-lg bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-warn">
            The effective health pool of {fmt(d.effectiveHealthPool)} overstates survivability by{' '}
            {d.ehpOverstatementRatio!.toFixed(1)}×. Judge this build by the figure above.
          </p>
        ) : null}

        <ul className="mt-3 space-y-1">
          {d.maxHits.map((hit) => (
            <li key={hit.type} className="grid grid-cols-[5rem_1fr_4.5rem] items-center gap-2">
              <span className="text-[11px] text-ink-dim capitalize">{hit.type}</span>
              <span className="relative h-3 overflow-hidden rounded bg-surface-sunken">
                <span
                  className={`absolute inset-y-0 left-0 rounded ${hit.value === d.lowestMaximumHit ? 'bg-danger/70' : 'bg-accent/60'}`}
                  style={{ width: `${(hit.value / d.maxHits.at(-1)!.value) * 100}%` }}
                />
              </span>
              <span className="tabular text-right text-[11px] text-ink">{fmt(hit.value)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Life" value={fmt(d.life)} />
          <Stat label="Energy shield" value={fmt(d.energyShield)} />
          <Stat label="Armour" value={fmt(d.armour)} />
          <Stat label="Evasion" value={fmt(d.evasion)} />
        </div>

        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {d.resistances.map((res) => (
            <li key={res.type} className="rounded-lg bg-surface-sunken px-3 py-2">
              <div className="text-[11px] text-ink-mute capitalize">{res.type}</div>
              <div
                className={`tabular mt-0.5 text-lg font-semibold ${res.underCap > 0 ? 'text-danger' : 'text-ink'}`}
              >
                {res.value}%
              </div>
              <div className="text-[10px] text-ink-mute">
                {res.underCap > 0 ? `${res.underCap}% under cap` : res.overCap > 0 ? `+${res.overCap}% over` : 'at cap'}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Damage"
        subtitle="Path of Building's figure for the skill it had selected when the code was copied."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Total DPS" value={fmt(analysis.damage.totalDps)} />
          <Stat label="Damage over time" value={fmt(analysis.damage.totalDotDps)} />
          <Stat label="Average hit" value={fmt(analysis.damage.averageDamage)} />
          <Stat label="Uses per second" value={analysis.damage.speed?.toFixed(2) ?? '—'} />
        </div>
      </Panel>

      <Panel
        title="What a code cannot tell you"
        subtitle="Listed rather than left as empty panels, so a gap in the source is never mistaken for a gap in the build."
      >
        <ul className="space-y-2">
          {analysis.gaps.map((gap) => (
            <li key={gap.what} className="rounded-lg bg-surface-sunken px-3 py-2">
              <div className="text-xs font-medium text-ink">{gap.what}</div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-mute">{gap.why}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-dim">
          Import the same character from poe.ninja for per-skill damage, gear modifier tiers and stat attribution.
        </p>
      </Panel>

      <details className="rounded-xl border border-line bg-surface-raised">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">
          All {Object.keys(analysis.playerStats).length} exported values
        </summary>
        <div className="max-h-96 overflow-auto border-t border-line p-4">
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {Object.entries(analysis.playerStats)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => (
                <li key={key} className="flex justify-between gap-3 text-[11px]">
                  <span className="truncate text-ink-mute">{key}</span>
                  <span className="tabular shrink-0 text-ink-dim">
                    {Number.isInteger(value) ? value : value.toFixed(2)}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      </details>
    </div>
  )
}
