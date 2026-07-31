'use client'

/**
 * What each equipped item is actually holding up.
 *
 * The gear panel says what is on an item. This says what happens without it,
 * which is the question a swap actually poses — and the two used to be
 * unconnected, so the tool would recommend re-rolling a ring while the
 * resistance panel reported that resistance as fine.
 *
 * The distinction that carries the panel: losing a modifier is not the same as
 * losing the stat. A ring granting 22% fire resistance on a build carrying 24
 * points of overcap costs nothing on the character sheet, and a build with no
 * overcap loses every point. Both cases appear on the reference character.
 */

import { useState } from 'react'
import type { AttributionReport, ItemAttribution, ItemStatContribution } from '@poe2/core'
import { Empty, Panel, Tag, fmt } from './ui'

const PERCENT_STATS = new Set(['fireResistance', 'coldResistance', 'lightningResistance', 'chaosResistance'])

function suffixFor(stat: string): string {
  return PERCENT_STATS.has(stat) ? '%' : ''
}

function ContributionRow({ c }: { c: ItemStatContribution }) {
  const suffix = suffixFor(c.stat)
  const granted = [
    c.flat ? `+${fmt(c.flat)}${suffix}` : null,
    c.increased ? `${c.increased > 0 ? '+' : ''}${fmt(c.increased)}% increased` : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <li className="rounded-md px-2 py-1.5 odd:bg-surface-sunken/40">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="min-w-0 flex-1 text-xs text-ink">{c.label}</span>
        <span className="tabular text-[11px] text-ink-dim">{granted}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[11px] text-ink-mute">
        {c.loss === 0 ? (
          <span className="text-good">
            Removing it costs nothing on the sheet — overcap absorbs all {fmt(c.flat)}
            {suffix}.
          </span>
        ) : (
          <span>
            Without it the sheet reads{' '}
            <span className="tabular font-semibold text-ink-dim">
              {fmt(c.without)}
              {suffix}
            </span>{' '}
            <span className={c.dropsBelowCap ? 'text-danger' : ''}>
              (−{fmt(c.loss)}
              {suffix})
            </span>
          </span>
        )}
        {c.dropsBelowCap ? <Tag tone="danger">breaks cap</Tag> : null}
      </div>
    </li>
  )
}

function ItemRow({ item }: { item: ItemAttribution }) {
  const [open, setOpen] = useState(false)
  const breaking = item.contributions.filter((c) => c.dropsBelowCap).length
  const free = item.contributions.filter((c) => c.loss === 0).length

  return (
    <li className="rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2 text-left"
      >
        <span className="min-w-0">
          <span className="text-xs font-medium text-ink">{item.itemName}</span>
          <span className="ml-2 text-[11px] text-ink-mute">
            {item.slotLabel} · carries {item.contributions.length}{' '}
            {item.contributions.length === 1 ? 'stat' : 'stats'}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {item.active ? null : <Tag>inactive set</Tag>}
          {breaking ? <Tag tone="danger">{breaking} would break cap</Tag> : null}
          {free ? <Tag tone="good">{free} free to drop</Tag> : null}
          <span className="text-ink-mute" aria-hidden>
            {open ? '−' : '+'}
          </span>
        </span>
      </button>

      {open ? (
        <ul className="space-y-1 border-t border-line px-2 py-2">
          {item.contributions.map((c) => (
            <ContributionRow key={c.stat} c={c} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function Attribution({ report }: { report: AttributionReport }) {
  return (
    <Panel
      title="What each item is holding up"
      subtitle="Read from poe.ninja's own per-stat attribution. “Without it” is what the character sheet would show, cap applied — so a modifier covered by overcap correctly costs nothing."
    >
      {report.items.length ? (
        <ul className="space-y-1.5">
          {report.items.map((item) => (
            <ItemRow key={item.slotId} item={item} />
          ))}
        </ul>
      ) : (
        <Empty>No equipped item could be credited with a stat from this payload.</Empty>
      )}

      {report.excluded.length ? (
        <div className="mt-4 rounded-lg border border-line bg-surface-sunken p-4">
          <h3 className="text-[11px] font-medium tracking-wide text-ink-dim uppercase">Not attributed</h3>
          <p className="mt-1 text-[11px] text-ink-mute">
            An attribution that disagrees with the number on screen is worse than none, so these were left out.
          </p>
          <ul className="mt-2 space-y-2">
            {report.excluded.map((e) => (
              <li key={e.stat}>
                <div className="text-xs font-medium text-ink-dim">{e.label}</div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-ink-mute">{e.reason}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.unmatchedSources.length ? (
        <p className="mt-3 text-[11px] leading-relaxed text-ink-mute">
          Also contributing, but not equipped gear so not shown above: {report.unmatchedSources.join(', ')}.
        </p>
      ) : null}
    </Panel>
  )
}
