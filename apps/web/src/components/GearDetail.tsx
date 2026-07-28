'use client'

/**
 * Per-item modifier detail: what is on each item, how good it is, what to change.
 *
 * The affix data is 260 KB gzipped, so it is fetched on demand rather than on
 * page load — a reader who only wants the DPS matrix should not pay for it.
 * Until it arrives the panel says what it is waiting for instead of rendering an
 * empty shell.
 *
 * ## What gets highlighted, and on what grounds
 *
 * Only measurable waste is called out. Resistance above the cap is provable from
 * the character sheet: fire 24% over means at least 24 points of the fire
 * modifiers are doing nothing. Whether a damage modifier suits the build is a
 * judgement about where that build is heading, and is not made here.
 */

import { useMemo, useState } from 'react'
import {
  analyzeItem,
  findResistanceSwaps,
  findTierUpgrades,
  summarizeSwaps,
  type DefenseSummary,
  type EquippedItem,
  type ItemAnalysis,
  type ItemModAnalysis,
  type LocatedMod,
} from '@poe2/core'
import type { ModTiersState } from '@/lib/useModTiers'
import { Empty, Panel, Tag } from './ui'

/** T1 is the best. Colour carries that, but never alone — the label says T1. */
function tierTone(tier: number | null, of: number | null): string {
  if (tier === null) return 'text-ink-mute'
  if (tier === 1) return 'text-good'
  if (of !== null && tier <= Math.max(2, Math.ceil(of / 3))) return 'text-ink'
  return 'text-ink-dim'
}

function RollBar({ mod }: { mod: ItemModAnalysis }) {
  const roll = mod.rolled[0]
  if (!roll || roll.quality === null) return null
  const pct = Math.round(roll.quality * 100)
  return (
    <span className="inline-flex items-center gap-1.5" title={`Rolled ${roll.value} in ${roll.min}–${roll.max}`}>
      <span className="relative h-1 w-10 overflow-hidden rounded-full bg-surface-sunken">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${Math.max(3, pct)}%` }}
        />
      </span>
      <span className="tabular text-[10px] text-ink-mute">{pct}%</span>
    </span>
  )
}

function ModRow({ mod }: { mod: ItemModAnalysis }) {
  const best = mod.upgrades[0]
  const reachable = mod.upgrades.find((u) => u.reachableOnThisItem)

  return (
    <li
      className={`rounded-md px-2 py-1.5 ${mod.waste ? 'bg-warn/10 ring-1 ring-warn/30' : 'odd:bg-surface-sunken/40'}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`tabular w-11 shrink-0 text-[11px] font-semibold ${tierTone(mod.tier, mod.tiers)}`}>
          {mod.tier !== null ? `T${mod.tier}/${mod.tiers}` : '—'}
        </span>
        <span className="min-w-0 flex-1 text-xs text-ink">{mod.text}</span>
        <RollBar mod={mod} />
      </div>

      {mod.affix ? (
        <div className="mt-0.5 pl-13 text-[10px] text-ink-mute">
          {mod.affix}
          {mod.ilvlRequired !== null ? ` · needs item level ${mod.ilvlRequired}` : ''}
        </div>
      ) : null}

      {mod.waste ? (
        <p className="mt-1 pl-13 text-[11px] leading-relaxed text-warn">{mod.waste.reason}</p>
      ) : null}

      {best ? (
        <p className="mt-1 pl-13 text-[11px] leading-relaxed text-ink-dim">
          {reachable ? (
            <>
              <span className="text-good">T{reachable.tier} is achievable on this item</span>
              {reachable.gain !== null ? ` — up to ${reachable.gain} more` : ''}
              {reachable.affix ? ` ("${reachable.affix}")` : ''}
            </>
          ) : (
            <>
              T{best.tier} exists but needs an item level {best.ilvl} base — this one is{' '}
              <span className="text-warn">too low to hold it</span>
            </>
          )}
        </p>
      ) : null}
    </li>
  )
}

function ItemCard({ item }: { item: ItemAnalysis }) {
  const [open, setOpen] = useState(false)
  const wasted = item.mods.filter((m) => m.waste).length
  const upgradable = item.mods.filter((m) => m.upgrades.some((u) => u.reachableOnThisItem)).length

  return (
    <li className="rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2 text-left"
      >
        <span className="min-w-0">
          <span className="text-xs font-medium text-ink">{item.name}</span>
          <span className="ml-2 text-[11px] text-ink-mute">
            {item.slotLabel} · {item.baseType}
            {item.itemLevel !== null ? ` · ilvl ${item.itemLevel}` : ''}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {item.corrupted ? <Tag tone="danger">corrupted</Tag> : null}
          {wasted ? <Tag tone="warn">{wasted} wasted</Tag> : null}
          {upgradable ? <Tag tone="accent">{upgradable} upgradable</Tag> : null}
          {item.tierProfile ? (
            <span className="tabular text-[10px] text-ink-mute">avg T{item.tierProfile.mean}</span>
          ) : null}
          <span className="text-ink-mute" aria-hidden>
            {open ? '−' : '+'}
          </span>
        </span>
      </button>

      {open ? (
        <ul className="space-y-1 border-t border-line px-2 py-2">
          {item.mods.map((mod, i) => (
            <ModRow key={`${mod.id ?? 'text'}-${i}`} mod={mod} />
          ))}
          {item.warnings.map((w) => (
            <li key={w} className="px-2 py-1 text-[11px] text-ink-mute">
              {w}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function GearDetail({
  items,
  defense,
  state,
}: {
  items: EquippedItem[]
  defense: DefenseSummary
  /** Loaded once at page level so this panel and the findings list agree. */
  state: ModTiersState
}) {
  const result = useMemo(() => {
    if (state.status !== 'ready') return null
    const active = items.filter((i) => i.active)
    const analysed = active.map((i) => analyzeItem(i, state.tiers, defense))
    const swaps = findResistanceSwaps(analysed, active, state.tiers, defense)
    return {
      analysed,
      swaps,
      shortfalls: summarizeSwaps(swaps, defense),
      upgrades: findTierUpgrades(analysed),
    }
  }, [state, items, defense])

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <Panel title="Gear modifiers" subtitle="Loading the affix data…">
        <div className="h-24 animate-pulse rounded-lg bg-surface-sunken" />
      </Panel>
    )
  }

  if (state.status === 'error') {
    return (
      <Panel title="Gear modifiers">
        <Empty>
          Could not load the affix data ({state.message}), so modifier tiers are unavailable. Everything else on this
          page is unaffected.
        </Empty>
      </Panel>
    )
  }

  if (!result?.analysed.length) {
    return (
      <Panel title="Gear modifiers">
        <Empty>No equipped items to analyse.</Empty>
      </Panel>
    )
  }

  const { analysed, swaps, upgrades, shortfalls } = result

  return (
    <div className="grid gap-4">
      <Panel
        title="Gear modifiers"
        subtitle="Tier 1 is the best roll. Tiers are counted against each item's own class, so a ring and a bow have different ladders for the same stat."
      >
        <ul className="space-y-1.5">
          {analysed.map((item) => (
            <ItemCard key={item.slotId} item={item} />
          ))}
        </ul>
      </Panel>

      {swaps.length ? (
        <Panel
          title="Resistance rebalancing"
          subtitle="Modifiers granting resistance you are already over cap on, and what could replace them. Ranked by how much of your actual shortfall each closes."
        >
          {shortfalls.length ? (
            <ul className="mb-3 space-y-1.5">
              {shortfalls.map((s) => (
                <li key={s.stat} className="rounded-lg bg-surface-sunken px-3 py-2">
                  <span className="text-xs font-medium text-ink">
                    {s.type} is {s.shortfall}% short
                  </span>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-dim">{s.note}</p>
                </li>
              ))}
            </ul>
          ) : null}

          <ul className="space-y-2.5">
            {swaps.slice(0, 6).map((swap, i) => (
              <li key={`${swap.slotId}-${i}`} className="rounded-lg border border-line bg-surface p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-xs font-medium text-ink">{swap.itemName}</span>
                  <span className="text-[11px] text-ink-mute">{swap.slotLabel}</span>
                </div>
                <p className="mt-1.5 text-xs text-ink-dim">
                  <span className="text-warn line-through decoration-warn/50">{swap.replace.text}</span>
                  {swap.replace.tier !== null ? (
                    <span className="tabular ml-1.5 text-[10px] text-ink-mute">T{swap.replace.tier}</span>
                  ) : null}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-mute">{swap.replace.reason}</p>

                <ul className="mt-2 space-y-1">
                  {swap.candidates.slice(0, 3).map((c) => (
                    <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
                      <span className="text-good" aria-hidden>
                        →
                      </span>
                      <span className="tabular font-semibold text-ink">T{c.tier}</span>
                      <span className="text-ink-dim">{c.text ?? c.affix}</span>
                      <span className="text-ink-mute">
                        closes {c.closesShortfall} of the gap
                        {c.reachableOnThisItem ? '' : ` · needs an item level ${c.ilvl} base`}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] text-ink-mute">{swap.cost}</p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {upgrades.onThisItem.length || upgrades.needsBetterBase.length ? (
        <Panel
          title="Tier upgrades"
          subtitle="Split by whether the item you already own can hold the better tier — recrafting a ring you have is a different action from buying a new one."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <UpgradeList
              title={`Achievable on items you own (${upgrades.onThisItem.length})`}
              tone="good"
              rows={upgrades.onThisItem.slice(0, 8)}
            />
            <UpgradeList
              title={`Need a higher item level base (${upgrades.needsBetterBase.length})`}
              tone="warn"
              rows={upgrades.needsBetterBase.slice(0, 8)}
            />
          </div>
        </Panel>
      ) : null}
    </div>
  )
}

function UpgradeList({
  title,
  tone,
  rows,
}: {
  title: string
  tone: 'good' | 'warn'
  rows: LocatedMod[]
}) {
  return (
    <div className="min-w-0">
      <h3 className={`mb-1.5 text-[11px] font-medium tracking-wide uppercase text-${tone}`}>{title}</h3>
      {rows.length ? (
        <ul className="space-y-1">
          {rows.map((mod, i) => {
            const target = mod.upgrades.find((u) => u.reachableOnThisItem) ?? mod.upgrades[0]!
            return (
              <li key={`${mod.slotId}-${mod.id}-${i}`} className="rounded-md bg-surface-sunken/50 px-2 py-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="tabular text-[11px] font-semibold text-ink-dim">
                    T{mod.tier}→T{target.tier}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{mod.text}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-ink-mute">
                  {mod.itemName} · {mod.slotLabel}
                  {target.reachableOnThisItem
                    ? target.gain !== null
                      ? ` · up to ${target.gain} more`
                      : ''
                    : ` · needs item level ${target.ilvl}`}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-[11px] text-ink-mute">Nothing in this category.</p>
      )}
    </div>
  )
}
