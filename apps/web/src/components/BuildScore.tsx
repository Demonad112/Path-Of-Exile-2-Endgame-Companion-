'use client'

/**
 * The overall verdict.
 *
 * A single letter is the most confident thing on this page, so most of what
 * follows is about not overstating it: the two halves are shown separately, an
 * unscored offence half is drawn as absent rather than as zero, and every
 * caveat that qualifies the number sits directly under it instead of in a
 * tooltip nobody opens.
 */

import type { BuildAssessment, KeystoneEffects } from '@poe2/core'
import { Panel, Tag, fmt } from './ui'

const TIER_TONE: Record<BuildAssessment['tier'], string> = {
  A: 'text-good',
  B: 'text-ink',
  C: 'text-warn',
  D: 'text-danger',
}

function Half({ label, value, of, unscored }: { label: string; value: number | null; of: number; unscored?: string }) {
  const pct = value === null ? 0 : Math.round((value / of) * 100)
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium tracking-wide text-ink-dim uppercase">{label}</span>
        <span className="tabular text-[11px] text-ink-mute">
          {value === null ? 'not assessed' : `${value.toFixed(2)} of ${of.toFixed(2)}`}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        {value === null ? (
          // Drawn as absent, not as zero. A build is never punished for data
          // that was unavailable, and the bar must not imply it was.
          <div className="h-full w-full bg-[repeating-linear-gradient(45deg,var(--color-line)_0_4px,transparent_4px_8px)]" />
        ) : (
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, pct)}%` }} />
        )}
      </div>
      {unscored ? <p className="mt-1.5 text-[11px] leading-relaxed text-ink-mute">{unscored}</p> : null}
    </div>
  )
}

export function BuildScore({ assessment, keystones }: { assessment: BuildAssessment; keystones: KeystoneEffects }) {
  const critical = assessment.weaknesses.filter((w) => w.severity === 'critical')
  const warnings = assessment.weaknesses.filter((w) => w.severity === 'warning')

  return (
    <Panel
      title="Assessment"
      subtitle="Defence and damage weighted evenly. Damage is graded only against figures observed on the ladder — never against invented thresholds."
      action={
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl leading-none font-semibold ${TIER_TONE[assessment.tier]}`}>
            {assessment.tier}
          </span>
          <span className="tabular text-sm text-ink-dim">{assessment.score.toFixed(2)}</span>
        </div>
      }
    >
      <p className="max-w-prose text-sm leading-relaxed text-balance text-ink">{assessment.note}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Half label="Defence" value={assessment.defence} of={0.5} />
        <Half
          label="Damage"
          value={assessment.offence}
          of={0.5}
          {...(assessment.offenceUnscoredReason ? { unscored: assessment.offenceUnscoredReason } : {})}
        />
      </div>

      {/*
        The pool the score was computed from, always shown — not only when it
        crosses a band and lands in one of the columns below. Naming its parts
        is the point: a keystone may have converted life or energy shield away,
        and calling the total "life + ES + ward" regardless would credit the
        build with a buffer it does not have.
      */}
      <p className="mt-3 text-[11px] leading-relaxed text-ink-mute">
        Defensive pool{' '}
        <span className="tabular font-semibold text-ink-dim">{fmt(assessment.pool.total)}</span> —{' '}
        {assessment.pool.label}
        {assessment.pool.excluded.length ? (
          <>
            , with {assessment.pool.excluded.join(' and ')} excluded by an allocated keystone
          </>
        ) : null}
        .
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <h3 className="mb-2 text-[11px] font-medium tracking-wide text-good uppercase">Holding up</h3>
          <ul className="space-y-1.5">
            {assessment.strengths.map((s) => (
              <li key={s} className="flex gap-2 text-xs leading-relaxed text-ink-dim">
                <span aria-hidden className="mt-[0.4rem] size-1 shrink-0 rounded-full bg-good" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          <h3 className="mb-2 text-[11px] font-medium tracking-wide text-warn uppercase">Gaps</h3>
          <ul className="space-y-1.5">
            {[...critical, ...warnings].map((w) => (
              <li key={w.text} className="flex gap-2 text-xs leading-relaxed text-ink-dim">
                <span
                  aria-hidden
                  className={`mt-[0.4rem] size-1 shrink-0 rounded-full ${w.severity === 'critical' ? 'bg-danger' : 'bg-warn'}`}
                />
                <span>
                  {w.text}
                  {w.severity === 'critical' ? (
                    <span className="ml-1.5 align-middle">
                      <Tag tone="danger">critical</Tag>
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {assessment.caveats.length ? (
        <div className="mt-5 rounded-lg border border-line bg-surface-sunken p-4">
          <h3 className="text-[11px] font-medium tracking-wide text-ink-dim uppercase">
            What this verdict assumes
          </h3>
          <ul className="mt-2 space-y-1.5">
            {assessment.caveats.map((c) => (
              <li key={c} className="text-[11px] leading-relaxed text-ink-mute">
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {keystones.notes.length ? (
        <div className="mt-4">
          <h3 className="mb-2 text-[11px] font-medium tracking-wide text-ink-dim uppercase">
            Keystones changing how this reads
          </h3>
          <ul className="space-y-2">
            {keystones.notes.map((n) => (
              <li key={n.keystone} className="rounded-lg bg-surface-sunken px-3 py-2">
                <span className="text-xs font-medium text-ink">{n.keystone}</span>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-dim">{n.text}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {keystones.unverified.length ? (
        <div className="mt-4 rounded-lg border border-warn/40 p-4">
          <h3 className="text-[11px] font-medium tracking-wide text-warn uppercase">Allocated but not in effect</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-mute">
            These keystones are on the tree, but this character&rsquo;s own stats contradict them, so none of their
            corrections were applied. poe.ninja may not have reindexed since the tree changed.
          </p>
          <ul className="mt-2 space-y-1.5">
            {keystones.unverified.map((u) => (
              <li key={u.keystone} className="text-[11px] leading-relaxed text-ink-dim">
                <span className="font-medium text-ink">{u.keystone}</span> — {u.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  )
}
