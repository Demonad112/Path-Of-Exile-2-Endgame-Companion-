'use client'

/**
 * Progress since the last import.
 *
 * Every other panel answers "where are you now". This one answers "did the last
 * change help", which is the question a player improving a character actually
 * repeats — and which nothing here could answer before, because nothing was
 * kept.
 *
 * With a single import there is nothing to compare against, and the panel says
 * so rather than drawing a flat line against an invented baseline.
 */

import type { CharacterHistory } from '@/lib/useCharacterHistory'
import type { MetricDelta } from '@poe2/core'
import { Panel, Tag, fmt } from './ui'

function when(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function DeltaRow({ change }: { change: MetricDelta }) {
  const suffix = change.unit === 'percent' ? '%' : ''
  const sign = change.delta > 0 ? '+' : ''

  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md px-2 py-1.5 odd:bg-surface-sunken/40">
      <span className="min-w-0 flex-1 text-xs text-ink">{change.label}</span>
      <span className="tabular text-[11px] text-ink-mute">
        {fmt(change.before)}
        {suffix}
      </span>
      <span aria-hidden className="text-[11px] text-ink-mute">
        →
      </span>
      <span className="tabular text-[11px] font-semibold text-ink-dim">
        {fmt(change.after)}
        {suffix}
      </span>
      <span className={`tabular w-20 text-right text-[11px] ${change.improved ? 'text-good' : 'text-danger'}`}>
        {sign}
        {fmt(change.delta)}
        {suffix}
        {change.percent !== null ? ` (${sign}${change.percent.toFixed(0)}%)` : ''}
      </span>
    </li>
  )
}

export function Progress({ history }: { history: CharacterHistory }) {
  const { snapshots, diff } = history

  return (
    <Panel
      title="Progress"
      subtitle="Kept locally, in this browser only. One row per import, and only when a figure actually moved."
      action={
        <span className="text-[11px] text-ink-mute">
          {snapshots.length} {snapshots.length === 1 ? 'snapshot' : 'snapshots'}
        </span>
      }
    >
      {!diff ? (
        <p className="max-w-prose text-xs leading-relaxed text-ink-mute">
          {snapshots.length === 0
            ? 'This character has just been recorded for the first time. Import it again after making a change and the difference will be shown here.'
            : 'Only one snapshot so far. A single point is not a trend, so nothing is compared yet — import again after making a change.'}
        </p>
      ) : (
        <>
          <p className="text-[11px] text-ink-mute">
            Comparing {when(diff.from.at)} with {when(diff.to.at)}.
          </p>

          {diff.newlyCapped.length || diff.newlyUncapped.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {diff.newlyCapped.map((r) => (
                <Tag key={r} tone="good">
                  {r} reached cap
                </Tag>
              ))}
              {diff.newlyUncapped.map((r) => (
                <Tag key={r} tone="danger">
                  {r} fell below cap
                </Tag>
              ))}
            </div>
          ) : null}

          {diff.changes.length ? (
            <ul className="mt-3 space-y-0.5">
              {diff.changes.map((c) => (
                <DeltaRow key={c.field} change={c} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-ink-mute">Nothing moved between these two imports.</p>
          )}
        </>
      )}
    </Panel>
  )
}
