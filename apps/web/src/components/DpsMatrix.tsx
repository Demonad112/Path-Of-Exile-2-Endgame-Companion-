'use client'

import { useState } from 'react'
import type { DpsSummary, SkillDamage } from '@poe2/core'
import { Empty, Panel, Tag, fmt, fmtCompact } from './ui'

const DMG_VAR: Record<string, string> = {
  physical: 'var(--dmg-physical)',
  fire: 'var(--dmg-fire)',
  cold: 'var(--dmg-cold)',
  lightning: 'var(--dmg-lightning)',
  chaos: 'var(--dmg-chaos)',
}

const TYPE_ORDER = ['physical', 'fire', 'cold', 'lightning', 'chaos'] as const

/**
 * Damage-type split as a stacked bar.
 *
 * A 2px surface gap separates segments, and segments at or above 12% carry an
 * inline label — so the split is readable without relying on colour, which also
 * discharges the light-mode contrast warning on the aqua and yellow steps.
 */
function SplitBar({ skill }: { skill: SkillDamage }) {
  const split = skill.damageSplit.length ? skill.damageSplit : skill.dotSplit
  if (!split.length) return <span className="text-xs text-ink-mute">—</span>

  return (
    <div className="flex h-5 w-full min-w-[8rem] gap-[2px] overflow-hidden rounded-sm">
      {[...split]
        .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))
        .map((s) => (
          <div
            key={s.type}
            title={`${s.type}: ${s.percent}%`}
            className="flex items-center justify-center overflow-hidden rounded-[3px] text-[10px] font-medium"
            style={{
              width: `${s.percent}%`,
              background: DMG_VAR[s.type],
              color: s.type === 'lightning' || s.type === 'physical' ? '#0b0b0d' : '#ffffff',
            }}
          >
            {s.percent >= 12 ? `${s.percent}%` : ''}
          </div>
        ))}
    </div>
  )
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {TYPE_ORDER.map((t) => (
        <li key={t} className="flex items-center gap-1.5 text-[11px] text-ink-dim">
          <span aria-hidden className="inline-block size-2 rounded-[2px]" style={{ background: DMG_VAR[t] }} />
          {t[0]!.toUpperCase() + t.slice(1)}
        </li>
      ))}
    </ul>
  )
}

function SkillRow({ s, isPrimary }: { s: SkillDamage; isPrimary: boolean }) {
  return (
    <tr className="border-t border-line align-middle">
      <th scope="row" className="py-2.5 pr-3 text-left font-normal">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-sm ${isPrimary ? 'font-semibold text-ink' : 'text-ink'}`}>{s.name}</span>
          {isPrimary ? <Tag tone="accent">primary</Tag> : null}
          {s.isDotOnly ? <Tag>dot only</Tag> : null}
        </div>
        {s.gems.length ? (
          <div className="mt-0.5 truncate text-[11px] text-ink-mute" title={s.gems.join(' · ')}>
            {s.gems.slice(0, 3).join(' · ')}
            {s.gems.length > 3 ? ` +${s.gems.length - 3}` : ''}
          </div>
        ) : null}
      </th>
      <td className="tabular py-2.5 pr-3 text-right text-sm font-semibold text-ink">{fmtCompact(s.dps)}</td>
      <td className="tabular py-2.5 pr-3 text-right text-sm text-ink-dim">{s.dotDps ? fmtCompact(s.dotDps) : '—'}</td>
      <td className="tabular py-2.5 pr-3 text-right text-sm text-ink-dim">
        {s.rate !== null ? `${s.rate.toFixed(2)}/s` : '—'}
        {s.hitRate !== null ? (
          <div className="text-[11px] text-warn" title="Charge-up skill: only this fraction of uses land">
            ×{s.hitRate.toFixed(2)} hit rate
          </div>
        ) : null}
      </td>
      <td className="tabular py-2.5 pr-3 text-right text-sm text-ink-dim">
        {s.critChance !== null ? `${s.critChance}%` : '—'}
        {s.critMultiplier !== null ? <div className="text-[11px] text-ink-mute">×{s.critMultiplier}</div> : null}
      </td>
      <td className="tabular py-2.5 pr-3 text-right text-sm text-ink-dim">{s.projectiles ?? '—'}</td>
      <td className="w-[34%] min-w-[9rem] py-2.5">
        <SplitBar skill={s} />
      </td>
    </tr>
  )
}

export function DpsMatrix({ dps }: { dps: DpsSummary }) {
  const [showAll, setShowAll] = useState(false)

  if (dps.unresolved) {
    return (
      <Panel title="Damage" subtitle="Read from poe.ninja’s computed per-skill data.">
        <Empty>{dps.unresolved}</Empty>
      </Panel>
    )
  }

  const rows = showAll ? dps.skills : dps.hitSkills
  const hidden = dps.skills.length - rows.length

  return (
    <Panel
      title="Damage"
      subtitle="Read verbatim from poe.ninja’s computed per-skill data — not recalculated."
      action={<Legend />}
    >
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className="w-full min-w-[46rem] border-collapse">
          <caption className="sr-only">
            Per-skill damage. Columns: skill, hit DPS, damage over time, use rate, critical strike, projectiles, and
            damage type split.
          </caption>
          <thead>
            <tr className="text-[11px] tracking-wide text-ink-mute uppercase">
              <th scope="col" className="pb-2 text-left font-medium">
                Skill
              </th>
              <th scope="col" className="pb-2 pr-3 text-right font-medium">
                DPS
              </th>
              <th scope="col" className="pb-2 pr-3 text-right font-medium">
                DoT
              </th>
              <th scope="col" className="pb-2 pr-3 text-right font-medium">
                Rate
              </th>
              <th scope="col" className="pb-2 pr-3 text-right font-medium">
                Crit
              </th>
              <th scope="col" className="pb-2 pr-3 text-right font-medium">
                Proj
              </th>
              <th scope="col" className="pb-2 text-left font-medium">
                Damage split
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <SkillRow key={s.name} s={s} isPrimary={s.name === dps.primary?.name} />
            ))}
          </tbody>
        </table>
      </div>

      {hidden > 0 || showAll ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 text-xs text-accent transition-opacity hover:opacity-80"
        >
          {showAll
            ? 'Show attacking skills only'
            : `Show ${hidden} buff / herald skill${hidden === 1 ? '' : 's'} (damage over time only)`}
        </button>
      ) : null}

      <p className="mt-3 text-[11px] leading-relaxed text-ink-mute">
        Charge-up skills report a hit rate below 1 — only that fraction of uses land, so their effective rate is lower
        than the raw figure. Buff and herald skills report 0 hit DPS by design.
      </p>
    </Panel>
  )
}
