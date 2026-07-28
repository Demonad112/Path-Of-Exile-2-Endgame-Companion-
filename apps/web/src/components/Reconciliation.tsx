'use client'

import { useState } from 'react'
import type { ReconciliationReport } from '@poe2/core'
import { Panel, Tag, fmt } from './ui'

/**
 * Surfaces agreement and disagreement between poe.ninja, Path of Building, and
 * our own arithmetic. It never picks a winner — silently preferring one source
 * is how a wrong number ships looking confident.
 */
export function Reconciliation({ report }: { report: ReconciliationReport }) {
  const [open, setOpen] = useState(false)
  const interesting = report.checks.filter((c) => c.severity === 'major' || c.severity === 'minor')
  const shown = open ? report.checks : interesting
  // Stats where one side simply had nothing to compare. Surfaced explicitly so
  // "everything agrees" is never read as "everything was checked".
  const unverifiable = report.checks.filter((c) => c.severity === 'unresolved' && c.other === null)

  return (
    <Panel
      title="Cross-validation"
      subtitle="poe.ninja’s numbers checked against Path of Building’s own engine and against poe.ninja’s own breakdown arithmetic."
      action={
        <div className="flex flex-wrap gap-1.5">
          <Tag tone="good">{report.matches} agree</Tag>
          {report.minor ? <Tag tone="warn">{report.minor} minor</Tag> : null}
          {report.major ? <Tag tone="danger">{report.major} major</Tag> : null}
          {report.unresolved ? <Tag>{report.unresolved} unverifiable</Tag> : null}
        </div>
      }
    >
      {interesting.length === 0 ? (
        <>
          <p className="text-sm leading-relaxed text-good">
            Every stat that could be checked agrees across sources.
            {report.unresolved > 0
              ? ` ${report.unresolved} could not be verified — listed below rather than assumed correct.`
              : ''}
          </p>
          {unverifiable.length ? (
            <ul className="mt-3 space-y-2">
              {unverifiable.map((c) => (
                <li key={c.stat} className="rounded-lg bg-surface-sunken px-3 py-2">
                  <span className="font-mono text-xs text-ink">{c.stat}</span>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-mute">{c.note}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <ul className="space-y-2">
          {shown.map((c) => (
            <li key={c.stat} className="rounded-lg bg-surface-sunken px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-xs text-ink">{c.stat}</span>
                <span className="tabular text-xs text-ink-dim">
                  {fmt(c.ninja)} vs {c.other === null ? 'n/a' : fmt(c.other)}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-mute">{c.note}</p>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 text-xs text-accent transition-opacity hover:opacity-80"
      >
        {open ? 'Show only disagreements' : `Show all ${report.checks.length} checks`}
      </button>
    </Panel>
  )
}
