'use client'

import { useState } from 'react'
import type { Cost, Evidence, Recommendation, RecommendationReport } from '@poe2/core'
import { Panel, Tag, fmt } from './ui'

const CATEGORY_TONE = {
  survivability: 'danger',
  damage: 'accent',
  efficiency: 'good',
  gear: 'warn',
  question: 'default',
} as const

const COST_LABEL: Record<Cost['kind'], string> = {
  free: 'Free',
  passive: 'Passive points',
  gear: 'Gear slot',
  currency: 'Currency',
  unknown: 'Cost unclear',
}

function costTone(kind: Cost['kind']) {
  return kind === 'free' ? 'good' : kind === 'unknown' ? 'default' : 'warn'
}

function EvidenceLine({ e }: { e: Evidence }) {
  return (
    <li className="flex gap-2 text-[11px] leading-relaxed text-ink-dim">
      <span aria-hidden className="mt-[0.35rem] size-1 shrink-0 rounded-full bg-ink-mute" />
      <span>{e.note}</span>
    </li>
  )
}

function ImpactBar({ r }: { r: Recommendation }) {
  if (!r.impact) return null
  const { from, to, delta, unit, label } = r.impact
  const suffix = unit === 'percent' ? '%' : ''
  const improving = delta > 0

  return (
    <div className="rounded-lg bg-surface-sunken px-3 py-2">
      <div className="text-[11px] text-ink-mute">{label}</div>
      <div className="tabular mt-0.5 flex items-baseline gap-2 text-sm">
        <span className="text-ink-dim">
          {fmt(from)}
          {suffix}
        </span>
        <span aria-hidden className="text-ink-mute">
          →
        </span>
        <span className="font-semibold text-ink">
          {fmt(to)}
          {suffix}
        </span>
        <span className={improving ? 'text-good' : 'text-ink-mute'}>
          ({improving ? '+' : ''}
          {fmt(delta)}
          {suffix})
        </span>
      </div>
    </div>
  )
}

function Card({ r, rank }: { r: Recommendation; rank: number }) {
  const [open, setOpen] = useState(false)
  const isQuestion = r.category === 'question'

  return (
    <li className="rounded-xl border border-line bg-surface-raised">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="tabular mt-0.5 w-5 shrink-0 text-right text-xs font-semibold text-ink-mute"
          >
            {isQuestion ? '?' : rank}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <Tag tone={CATEGORY_TONE[r.category]}>{r.category}</Tag>
              <Tag tone={costTone(r.cost.kind)}>
                {COST_LABEL[r.cost.kind]}
                {r.cost.amount > 0 ? ` · ${r.cost.amount}` : ''}
                {r.cost.currencyTier && r.cost.currencyTier !== 'unknown' ? ` · ${r.cost.currencyTier}` : ''}
              </Tag>
            </div>
            <h3 className="text-sm leading-snug font-semibold text-balance text-ink">{r.action}</h3>
            <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-ink-dim">{r.rationale}</p>
          </div>
        </div>

        <div className="mt-3 grid gap-2 pl-8 sm:grid-cols-2">
          <ImpactBar r={r} />
          <div className="rounded-lg bg-surface-sunken px-3 py-2">
            <div className="text-[11px] text-ink-mute">Cost</div>
            <div className="mt-0.5 text-xs leading-relaxed text-ink-dim">{r.cost.detail}</div>
          </div>
        </div>

        {r.tradeoff ? (
          <p className="mt-2 pl-8 text-[11px] leading-relaxed text-ink-mute">
            <span className="text-ink-dim">Trade-off:</span> {r.tradeoff}
          </p>
        ) : null}

        <div className="mt-2 pl-8">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="text-[11px] text-accent transition-opacity hover:opacity-80"
          >
            {open ? 'Hide evidence' : `Evidence (${r.evidence.length})`}
          </button>
          {open ? (
            <ul className="mt-2 space-y-1.5 border-l border-line pl-3">
              {r.evidence.map((e, i) => (
                <EvidenceLine key={i} e={e} />
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  )
}

export function Recommendations({ report }: { report: RecommendationReport }) {
  const actionable = report.recommendations.filter((r) => r.category !== 'question')
  const questions = report.recommendations.filter((r) => r.category === 'question')

  return (
    <Panel
      title="Findings"
      subtitle="Ranked by gain per unit of cost. Every claim traces to data in the character payload."
    >
      {report.buildIsSound ? (
        <p className="rounded-lg bg-surface-sunken px-4 py-5 text-sm leading-relaxed text-good">{report.summary}</p>
      ) : (
        <ul className="space-y-3">
          {actionable.map((r, i) => (
            <Card key={r.id} r={r} rank={i + 1} />
          ))}
        </ul>
      )}

      {questions.length ? (
        <div className="mt-5">
          <h3 className="mb-2 text-xs font-medium tracking-wide text-ink-dim uppercase">Worth checking</h3>
          <ul className="space-y-3">
            {questions.map((r) => (
              <Card key={r.id} r={r} rank={0} />
            ))}
          </ul>
        </div>
      ) : null}

      {report.unresolved.length ? (
        <div className="mt-5 rounded-lg border border-line bg-surface-sunken p-4">
          <h3 className="text-xs font-medium tracking-wide text-ink-dim uppercase">Could not be determined</h3>
          <p className="mt-1 text-[11px] text-ink-mute">
            Stated rather than guessed — a wrong number is worse than a missing one.
          </p>
          <ul className="mt-3 space-y-3">
            {report.unresolved.map((u) => (
              <li key={u.id}>
                <div className="text-xs font-medium text-ink-dim">{u.question}</div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-ink-mute">{u.missing}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  )
}
