'use client'

/**
 * Survivability against waystone tier and against bosses.
 *
 * The tier→area level mapping is real (64 + tier, from the waystone item bases)
 * and so is the base monster damage. What is NOT modelled is rare, unique and
 * map-modifier damage, which is what actually kills characters — so the caveat
 * sits next to the number rather than below the fold.
 */

import { useEffect, useState } from 'react'
import { analyzeContent, type DefenseSummary, type MonsterStatData } from '@poe2/core'
import { Empty, Panel } from './ui'

const DATA_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/monster-stats.json`

const COMFORT: Record<string, { bar: string; text: string; label: string }> = {
  comfortable: { bar: 'bg-good/70', text: 'text-good', label: 'comfortable' },
  thin: { bar: 'bg-warn/70', text: 'text-warn', label: 'thin' },
  dangerous: { bar: 'bg-danger/70', text: 'text-danger', label: 'dangerous' },
}

export function Headroom({ defense }: { defense: DefenseSummary }) {
  const [data, setData] = useState<MonsterStatData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(DATA_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(`returned ${res.status}`)
        return (await res.json()) as MonsterStatData
      })
      .then((d) => !cancelled && setData(d))
      .catch((err: Error) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <Panel title="Survivability by map tier">
        <Empty>Could not load the monster data ({error}).</Empty>
      </Panel>
    )
  }
  if (!data) {
    return (
      <Panel title="Survivability by map tier">
        <div className="h-20 animate-pulse rounded-lg bg-surface-sunken" />
      </Panel>
    )
  }

  const report = analyzeContent(defense, data)
  const max = Math.max(...report.tiers.map((t) => t.headroom), 1)

  return (
    <Panel
      title="Survivability by map tier"
      subtitle={
        <>
          A {report.lowestMaximumHitType} hit of{' '}
          <span className="tabular font-semibold text-ink">{report.lowestMaximumHit.toLocaleString()}</span> kills you.
          Waystone tier {report.tiers[0]?.tier}–{report.tiers.at(-1)?.tier} opens area level{' '}
          {report.tiers[0]?.areaLevel}–{report.tiers.at(-1)?.areaLevel}.
        </>
      }
    >
      <p className="mb-3 rounded-lg bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-ink-dim">
        {report.summary}
      </p>

      <ul className="space-y-1">
        {report.tiers.map((row) => {
          const tone = COMFORT[row.comfort]!
          return (
            <li key={row.tier} className="grid grid-cols-[2.5rem_1fr_3.5rem] items-center gap-2">
              <span className="tabular text-[11px] text-ink-dim">
                T{row.tier}
                <span className="ml-1 text-ink-mute">·{row.areaLevel}</span>
              </span>
              <span className="relative h-4 overflow-hidden rounded bg-surface-sunken">
                <span
                  className={`absolute inset-y-0 left-0 rounded ${tone.bar}`}
                  style={{ width: `${(row.headroom / max) * 100}%` }}
                />
                {row.maps.length ? (
                  <span className="absolute inset-y-0 left-1.5 flex items-center truncate text-[10px] text-ink-mute">
                    {row.maps.slice(0, 2).join(', ')}
                  </span>
                ) : null}
              </span>
              <span className={`tabular text-right text-[11px] font-semibold ${tone.text}`}>{row.headroom}×</span>
            </li>
          )
        })}
      </ul>

      <h3 className="mt-4 mb-1.5 text-[11px] font-medium tracking-wide text-ink-dim uppercase">Bosses</h3>
      <ul className="space-y-1">
        {report.bosses.map((boss) => {
          const tone = COMFORT[boss.comfort]!
          return (
            <li key={boss.label} className="rounded-md bg-surface-sunken px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-xs font-medium text-ink">
                  {boss.label} <span className="text-ink-mute">· level {boss.level}</span>
                </span>
                <span className={`tabular text-xs font-semibold ${tone.text}`}>
                  {boss.headroom}× <span className="text-[10px] font-normal">{tone.label}</span>
                </span>
              </div>
              <p className="mt-0.5 text-[10px] leading-relaxed text-ink-mute">{boss.note}</p>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 rounded-lg border border-warn/30 bg-warn/5 p-3">
        <h3 className="text-[11px] font-medium tracking-wide text-warn uppercase">Read this with the number</h3>
        <ul className="mt-1.5 space-y-1">
          {report.caveats.map((c) => (
            <li key={c} className="text-[11px] leading-relaxed text-ink-dim">
              {c}
            </li>
          ))}
        </ul>
      </div>

      {report.unresolved.map((u) => (
        <div key={u.question} className="mt-2 rounded-lg bg-surface-sunken p-3">
          <h3 className="text-[11px] font-medium text-ink-dim">{u.question}</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-mute">{u.missing}</p>
        </div>
      ))}
    </Panel>
  )
}
