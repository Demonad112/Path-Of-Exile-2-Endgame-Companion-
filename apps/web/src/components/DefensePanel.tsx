'use client'

import type { DefenseSummary } from '@poe2/core'
import { Hero, Panel, Stat, Tag, fmt } from './ui'

const DMG_VAR: Record<string, string> = {
  physical: 'var(--dmg-physical)',
  fire: 'var(--dmg-fire)',
  cold: 'var(--dmg-cold)',
  lightning: 'var(--dmg-lightning)',
  chaos: 'var(--dmg-chaos)',
}

function cap(s: string) {
  return s[0]!.toUpperCase() + s.slice(1)
}

/**
 * Max-hit bars.
 *
 * Form: magnitude by category -> horizontal bars, sorted thinnest-first so the
 * killing vector is the first thing read. Every bar is directly labelled, so
 * identity never rests on colour alone.
 */
function MaxHitBars({ d }: { d: DefenseSummary }) {
  if (!d.maxHits.length) return null
  const max = Math.max(...d.maxHits.map((m) => m.value))

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-medium tracking-wide text-ink-dim uppercase">Maximum survivable hit</h3>
        <span className="text-[11px] text-ink-mute">by damage type</span>
      </div>
      <ul className="space-y-2">
        {d.maxHits.map((m) => (
          <li key={m.type}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs text-ink">
                <span
                  aria-hidden
                  className="inline-block size-2 shrink-0 rounded-[2px]"
                  style={{ background: DMG_VAR[m.type] }}
                />
                {cap(m.type)}
                {m.isLowest ? <Tag tone="danger">kills first</Tag> : null}
              </span>
              <span className="tabular text-xs font-semibold text-ink">{fmt(m.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-sm bg-surface-sunken">
              <div
                className="h-full rounded-r-[4px]"
                style={{ width: `${Math.max(1.5, (m.value / max) * 100)}%`, background: DMG_VAR[m.type] }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Resistances({ d }: { d: DefenseSummary }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-medium tracking-wide text-ink-dim uppercase">Resistances</h3>
      <ul className="space-y-2">
        {d.resistances.map((r) => {
          const pct = Math.max(0, Math.min(100, (r.value / r.max) * 100))
          return (
            <li key={r.type}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 text-ink">
                  <span
                    aria-hidden
                    className="inline-block size-2 shrink-0 rounded-[2px]"
                    style={{ background: DMG_VAR[r.type] }}
                  />
                  {cap(r.type)}
                </span>
                <span className="tabular flex items-center gap-1.5">
                  <span className={r.capped ? 'text-ink' : 'text-danger font-semibold'}>
                    {r.value}
                    <span className="text-ink-mute">/{r.max}</span>
                  </span>
                  {r.overCap > 0 ? <Tag tone="warn">+{r.overCap} wasted</Tag> : null}
                  {r.underCap > 0 ? <Tag tone="danger">−{r.underCap}</Tag> : null}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-sm bg-surface-sunken">
                <div
                  className="h-full rounded-r-[4px]"
                  style={{ width: `${Math.max(1.5, pct)}%`, background: DMG_VAR[r.type] }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function DefensePanel({ d }: { d: DefenseSummary }) {
  const overstates = d.ehpOverstatementRatio !== null && d.ehpOverstatementRatio > 1.5

  return (
    <Panel
      title="Defence"
      subtitle="Led by the smallest hit that kills — not by an averaged pool."
    >
      <div className="space-y-5">
        <Hero
          tone="danger"
          label={`Lowest maximum hit${d.lowestMaximumHitType ? ` · ${cap(d.lowestMaximumHitType)}` : ''}`}
          value={fmt(d.lowestMaximumHit)}
          caption={
            overstates ? (
              <>
                Effective health pool reads <span className="tabular text-ink">{fmt(d.effectiveHealthPool)}</span>,
                overstating survivability by{' '}
                <span className="tabular text-warn">{d.ehpOverstatementRatio!.toFixed(1)}×</span>. A single{' '}
                {d.lowestMaximumHitType} hit of {fmt(d.lowestMaximumHit)} is fatal.
              </>
            ) : (
              <>
                Effective health pool: <span className="tabular text-ink">{fmt(d.effectiveHealthPool)}</span>.
              </>
            )
          }
        />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Life" value={fmt(d.life)} />
          <Stat label="Energy Shield" value={fmt(d.energyShield)} />
          <Stat label="Ward" value={fmt(d.ward)} hint="0.5 mechanic" />
          <Stat label="Evasion" value={fmt(d.evasion)} hint={`${fmt(d.evadeChance)}% evade`} />
          <Stat
            label="Armour"
            value={fmt(d.armour)}
            tone={d.physicalDamageReduction !== null && d.physicalDamageReduction < 10 ? 'warn' : 'default'}
            hint={d.physicalDamageReduction !== null ? `${d.physicalDamageReduction}% phys reduction` : undefined}
          />
          <Stat
            label="Deflection"
            value={fmt(d.deflectionRating)}
            hint={`${fmt(d.deflectChance)}% · ${fmt(d.deflectEffect)}% effect`}
          />
        </div>

        <MaxHitBars d={d} />
        <Resistances d={d} />

        <p className="text-[11px] leading-relaxed text-ink-mute">
          Chaos removes twice as much energy shield as it deals, so the raw chaos pool is{' '}
          <span className="tabular">{fmt(d.chaosRawPool)}</span> (life + half energy shield). Block caps at 50% in
          PoE2; resistances at 75%.
        </p>
      </div>
    </Panel>
  )
}
