'use client'

import type { EquippedItem, PassiveAllocation } from '@poe2/core'
import { Panel, Tag, fmt } from './ui'

export function GearPanel({ items, passives }: { items: EquippedItem[]; passives: PassiveAllocation }) {
  const active = items.filter((i) => i.active)
  const inactive = items.filter((i) => !i.active)
  const levels = active.map((i) => i.itemLevel).filter((l): l is number => l !== null)
  const minIlvl = levels.length ? Math.min(...levels) : null

  return (
    <Panel
      title="Gear & tree"
      subtitle={
        <>
          Weapon sets are alternates, never additive. Set {passives.activeSet} is live.
        </>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-surface-sunken px-3 py-2">
          <div className="text-[11px] text-ink-mute">Passives (poe.ninja)</div>
          <div className="tabular mt-1 text-lg font-semibold text-ink">{fmt(passives.counts.passives)}</div>
          <div className="mt-0.5 text-[11px] text-ink-mute">{passives.mainSelectionLength} allocated node ids</div>
        </div>
        <div className="rounded-lg bg-surface-sunken px-3 py-2">
          <div className="text-[11px] text-ink-mute">Ascendancy</div>
          <div className="tabular mt-1 text-lg font-semibold text-ink">{fmt(passives.counts.ascendancy)}</div>
        </div>
        <div className="rounded-lg bg-surface-sunken px-3 py-2">
          <div className="text-[11px] text-ink-mute">Anoints</div>
          <div
            className={`tabular mt-1 text-lg font-semibold ${passives.counts.anoints ? 'text-ink' : 'text-warn'}`}
          >
            {fmt(passives.counts.anoints)}
          </div>
        </div>
        <div className="rounded-lg bg-surface-sunken px-3 py-2">
          <div className="text-[11px] text-ink-mute">Weapon-set nodes</div>
          <div className="tabular mt-1 text-lg font-semibold text-ink">
            {passives.set1.length} / {passives.set2.length}
          </div>
          <div className="mt-0.5 text-[11px] text-ink-mute">set 1 / set 2</div>
        </div>
      </div>

      <ul className="space-y-1.5">
        {active.map((i) => (
          <ItemRow key={`${i.slotId}`} item={i} lowest={i.itemLevel !== null && i.itemLevel === minIlvl} />
        ))}
      </ul>

      {inactive.length ? (
        <div className="mt-4">
          <h3 className="mb-1.5 text-xs font-medium tracking-wide text-ink-dim uppercase">
            Inactive weapon set {passives.activeSet === 1 ? 2 : 1}
          </h3>
          <p className="mb-2 text-[11px] text-ink-mute">
            Equipped but contributing nothing to the live build. These stats are never credited above.
          </p>
          <ul className="space-y-1.5 opacity-60">
            {inactive.map((i) => (
              <ItemRow key={`${i.slotId}`} item={i} lowest={false} />
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  )
}

function ItemRow({ item, lowest }: { item: EquippedItem; lowest: boolean }) {
  return (
    <li className="flex items-baseline gap-3 rounded-lg bg-surface-sunken px-3 py-2 text-sm">
      <span className="w-20 shrink-0 truncate text-[11px] text-ink-mute">{item.slotLabel}</span>
      <span className="min-w-0 flex-1 truncate text-ink" title={`${item.name} — ${item.baseType}`}>
        {item.name}
        <span className="ml-1.5 text-[11px] text-ink-mute">{item.baseType}</span>
      </span>
      {lowest ? <Tag tone="warn">lowest ilvl</Tag> : null}
      <span className="tabular shrink-0 text-xs text-ink-dim">
        {item.itemLevel !== null ? `i${item.itemLevel}` : '—'}
      </span>
    </li>
  )
}
