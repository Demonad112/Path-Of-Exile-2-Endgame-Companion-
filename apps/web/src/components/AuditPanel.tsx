'use client'

/**
 * Five checks over parts of the payload no other panel reads.
 *
 * Ordered by how unambiguous each is. An empty socket and a sub-maximum gem
 * quality are improvements regardless of build direction. Idle spirit and spare
 * attributes are reported as facts without a verdict, because whether they are
 * worth spending depends on where the build is heading.
 */

import { useMemo } from 'react'
import {
  MAX_GEM_QUALITY,
  auditCharacter,
  type CharModel,
  type ItemAnalysis,
} from '@poe2/core'
import type { ModTiersState } from '@/lib/useModTiers'
import { Empty, Panel, Tag, fmt } from './ui'

export function AuditPanel({
  model,
  pobStats,
  state,
}: {
  model: CharModel
  pobStats: Record<string, number> | null
  state: ModTiersState
}) {
  const report = useMemo(
    () => auditCharacter(model, state.status === 'ready' ? state.tiers : null, pobStats),
    [model, pobStats, state],
  )

  const nothingFound =
    !report.jewels.length &&
    !report.emptySockets.length &&
    !report.gemQuality.length &&
    !report.attributes.length &&
    !report.spirit

  if (nothingFound) {
    return (
      <Panel title="Detail checks">
        <Empty>Nothing to report — no jewels, sockets, or gem data in this payload.</Empty>
      </Panel>
    )
  }

  return (
    <Panel
      title="Detail checks"
      subtitle="Parts of the payload the panels above don't read. Nothing here is estimated."
    >
      <div className="grid gap-4">
        {report.emptySockets.length ? (
          <section>
            <h3 className="mb-1.5 text-[11px] font-medium tracking-wide text-warn uppercase">
              Empty rune sockets — free stats not taken
            </h3>
            <ul className="space-y-1">
              {report.emptySockets.map((s) => (
                <li key={s.slotId} className="rounded-md bg-warn/10 px-3 py-2 text-[11px] text-ink">
                  <span className="font-medium">{s.itemName}</span>
                  <span className="ml-2 text-ink-mute">
                    {s.slotLabel} · {s.empty} of {s.sockets} socket{s.sockets === 1 ? '' : 's'} empty
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {report.gemQuality.length ? (
          <section>
            <h3 className="mb-1.5 text-[11px] font-medium tracking-wide text-ink-dim uppercase">
              Gems below {MAX_GEM_QUALITY}% quality ({report.gemQuality.length})
            </h3>
            <ul className="space-y-1">
              {report.gemQuality.map((g, i) => (
                <li
                  key={`${g.skill}-${g.gem}-${i}`}
                  className="flex flex-wrap items-baseline gap-x-2 rounded-md bg-surface-sunken px-3 py-1.5 text-[11px]"
                >
                  <span className="font-medium text-ink">{g.gem}</span>
                  <span className="text-ink-mute">in {g.skill}</span>
                  <span className="tabular ml-auto text-ink-dim">
                    level {g.level} · {g.quality}%
                  </span>
                  {g.bestElsewhere !== null ? (
                    <span className="w-full text-[10px] text-warn">
                      Another copy of this gem is at {g.bestElsewhere}%, so this one can be too.
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {report.jewels.length ? (
          <section>
            <h3 className="mb-1.5 text-[11px] font-medium tracking-wide text-ink-dim uppercase">
              Socketed jewels ({report.jewels.length})
            </h3>
            <ul className="space-y-1.5">
              {report.jewels.map((jewel) => (
                <JewelCard key={jewel.slotId} jewel={jewel} />
              ))}
            </ul>
          </section>
        ) : null}

        {report.attributes.length ? (
          <section>
            <h3 className="mb-1.5 text-[11px] font-medium tracking-wide text-ink-dim uppercase">
              Attribute headroom
            </h3>
            <ul className="space-y-1">
              {report.attributes.map((a) => (
                <li
                  key={a.attribute}
                  className={`flex flex-wrap items-baseline gap-x-2 rounded-md px-3 py-1.5 text-[11px] ${
                    a.tight ? 'bg-warn/10 ring-1 ring-warn/30' : 'bg-surface-sunken'
                  }`}
                >
                  <span className="font-medium text-ink capitalize">{a.attribute}</span>
                  <span className="tabular text-ink-dim">
                    {fmt(a.have)} against {fmt(a.required)} required
                  </span>
                  <span className={`tabular ml-auto font-semibold ${a.tight ? 'text-warn' : 'text-ink-dim'}`}>
                    {a.headroom >= 0 ? '+' : ''}
                    {fmt(a.headroom)} spare
                  </span>
                  {a.tight ? (
                    <span className="w-full text-[10px] text-warn">
                      Losing one source of {a.attribute} would leave something unequippable.
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {report.spirit ? (
          <section>
            <h3 className="mb-1.5 text-[11px] font-medium tracking-wide text-ink-dim uppercase">Spirit</h3>
            <div className="rounded-md bg-surface-sunken px-3 py-2">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-ink">
                  <span className="tabular font-semibold">{fmt(report.spirit.reserved)}</span> reserved of{' '}
                  <span className="tabular">{fmt(report.spirit.total)}</span>
                </span>
                <span className="tabular text-ink-dim">{report.spirit.unreservedPercent}% idle</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded bg-surface">
                <div
                  className="h-full rounded bg-accent/70"
                  style={{ width: `${100 - report.spirit.unreservedPercent}%` }}
                />
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-ink-mute">
                {fmt(report.spirit.unreserved)} spirit is unreserved. Whether that is worth spending depends on
                whether a buff you want fits in it — this is a number, not a verdict.
              </p>
            </div>
          </section>
        ) : null}

        {report.unavailable.length ? (
          <section className="rounded-lg bg-surface-sunken p-3">
            <h3 className="text-[11px] font-medium text-ink-dim">Could not be checked</h3>
            <ul className="mt-1 space-y-1">
              {report.unavailable.map((u) => (
                <li key={u} className="text-[11px] leading-relaxed text-ink-mute">
                  {u}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Panel>
  )
}

function JewelCard({ jewel }: { jewel: ItemAnalysis }) {
  return (
    <li className="rounded-lg border border-line bg-surface px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-xs font-medium text-ink">{jewel.name}</span>
        <span className="text-[11px] text-ink-mute">
          {jewel.baseType}
          {jewel.tierProfile ? ` · avg T${jewel.tierProfile.mean}` : ''}
        </span>
      </div>
      <ul className="mt-1 space-y-0.5">
        {jewel.mods.map((mod, i) => (
          <li key={`${mod.id ?? i}`} className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
            <span
              className={`tabular w-11 shrink-0 font-semibold ${mod.tier === 1 ? 'text-good' : 'text-ink-dim'}`}
            >
              {mod.tier !== null ? `T${mod.tier}/${mod.tiers}` : '—'}
            </span>
            <span className="min-w-0 flex-1 text-ink-dim">{mod.text}</span>
          </li>
        ))}
      </ul>
    </li>
  )
}
