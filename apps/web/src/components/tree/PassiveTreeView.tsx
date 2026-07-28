'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PassiveAllocation, PassiveTree, TreeNode } from '@poe2/core'
import { resolveAllocation, suggestNodesForStat, supportedStats } from '@poe2/core'
import { Tag } from '../ui'
import { clampScale, extentOf, fitExtent, zoomAt, type Viewport } from './geometry'
import { hitTest, renderTree, type TreePalette } from './render'

function readPalette(el: HTMLElement): TreePalette {
  const s = getComputedStyle(el)
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
  return {
    dimEdge: v('--line', '#26262c'),
    dimNode: v('--ink-mute', '#6f6c66'),
    edge: v('--accent', '#e3b341'),
    node: v('--ink-dim', '#a8a49c'),
    notable: v('--accent', '#e3b341'),
    keystone: v('--dmg-chaos', '#9085e9'),
    jewel: v('--dmg-cold', '#3987e5'),
    start: v('--good', '#199e70'),
    ascendancy: v('--dmg-fire', '#d95926'),
    highlight: v('--dmg-cold', '#3987e5'),
    surface: v('--surface-raised', '#141417'),
    text: v('--ink', '#f2ede4'),
  }
}

export interface WeakStat {
  key: string
  label: string
  shortfall: string
}

export interface PassiveTreeViewProps {
  tree: PassiveTree
  allocation: PassiveAllocation
  /** Stats the analysis found short, best first. Drives the route picker. */
  weakStats?: WeakStat[]
  className?: string
}

export function PassiveTreeView({ tree, allocation, weakStats = [], className = '' }: PassiveTreeViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [viewport, setViewport] = useState<Viewport | null>(null)
  const [hovered, setHovered] = useState<TreeNode | null>(null)
  const [pointer, setPointer] = useState({ x: 0, y: 0 })
  const [showSwapSet, setShowSwapSet] = useState(false)
  const [showAllAscendancies, setShowAllAscendancies] = useState(false)

  const resolved = useMemo(() => resolveAllocation(tree, allocation), [tree, allocation])

  const activeIds = useMemo(() => new Set(allocation.live), [allocation])
  const swapIds = useMemo(() => {
    const inactive = allocation.activeSet === 2 ? allocation.set1 : allocation.set2
    return new Set(inactive.filter((id) => !activeIds.has(id)))
  }, [allocation, activeIds])
  /**
   * Routes to nodes granting a stat the build is short on. Computed on demand
   * rather than up front: it walks the whole 4,975-node tree per stat.
   */
  const [routeStat, setRouteStat] = useState<string | null>(null)
  const [routeIndex, setRouteIndex] = useState(0)

  const routes = useMemo(() => {
    if (!routeStat) return []
    return suggestNodesForStat(tree, allocation.live, routeStat, { maxCost: 4, limit: 5 })
  }, [tree, allocation.live, routeStat])

  /** Only offer stats this module can actually search for. */
  const routable = useMemo(() => {
    const supported = new Set(supportedStats())
    return weakStats.filter((s) => supported.has(s.key))
  }, [weakStats])

  const activeRoute = routes[routeIndex] ?? null
  const highlightIds = useMemo(
    () => new Set(activeRoute ? activeRoute.path.map((n) => n.id) : []),
    [activeRoute],
  )

  /** The character's own ascendancy, so other classes' wheels stay hidden. */
  const ownAscendancy = resolved.ascendancy[0]?.ascendancy ?? null

  // --- sizing ---------------------------------------------------------------
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect
      setSize({ width: Math.round(r.width), height: Math.round(r.height) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const fitToAllocation = useCallback(() => {
    if (!size.width || !size.height) return
    // Frame the allocated nodes, not the whole tree: the full extent is mostly
    // empty space and other classes' wheels.
    const extent = extentOf(resolved.mainTree.length ? resolved.mainTree : [...tree.allNodes()])
    if (extent) setViewport(fitExtent(extent, size.width, size.height))
  }, [resolved.mainTree, size.width, size.height, tree])

  useEffect(() => {
    if (viewport === null) fitToAllocation()
  }, [viewport, fitToAllocation])

  // Frame a chosen route: a glowing path off-screen helps nobody.
  useEffect(() => {
    if (!activeRoute || !size.width || !size.height) return
    const extent = extentOf(activeRoute.path, 1400)
    if (extent) setViewport(fitExtent(extent, size.width, size.height))
  }, [activeRoute, size.width, size.height])

  // --- painting -------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap || !viewport || !size.width || !size.height) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size.width * dpr
    canvas.height = size.height * dpr
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    renderTree(ctx, {
      tree,
      viewport,
      width: size.width,
      height: size.height,
      palette: readPalette(wrap),
      allocated: activeIds,
      inactive: showSwapSet ? swapIds : new Set(),
      highlighted: highlightIds,
      hovered: hovered?.id ?? null,
      visibleAscendancy: ownAscendancy,
      showAllAscendancies,
    })
  }, [
    tree,
    viewport,
    size,
    activeIds,
    swapIds,
    showSwapSet,
    highlightIds,
    hovered,
    ownAscendancy,
    showAllAscendancies,
  ])

  // --- interaction ----------------------------------------------------------
  const dragRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const pinchRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchDistance = useRef(0)

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pinchRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinchRef.current.size === 2) {
      const [a, b] = [...pinchRef.current.values()]
      pinchDistance.current = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      dragRef.current = null
      return
    }
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!viewport) return
    const rect = e.currentTarget.getBoundingClientRect()

    if (pinchRef.current.has(e.pointerId)) pinchRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    // Two fingers: pinch to zoom about the midpoint.
    if (pinchRef.current.size === 2) {
      const [a, b] = [...pinchRef.current.values()]
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      if (pinchDistance.current > 0 && distance > 0) {
        const midX = (a!.x + b!.x) / 2 - rect.left
        const midY = (a!.y + b!.y) / 2 - rect.top
        setViewport((vp) =>
          vp ? zoomAt(vp, distance / pinchDistance.current, midX, midY, size.width, size.height) : vp,
        )
      }
      pinchDistance.current = distance
      return
    }

    const drag = dragRef.current
    if (drag && drag.id === e.pointerId) {
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true
      drag.x = e.clientX
      drag.y = e.clientY
      setViewport((vp) => (vp ? { ...vp, cx: vp.cx - dx / vp.scale, cy: vp.cy - dy / vp.scale } : vp))
      return
    }

    // Hover: mouse only. On touch the tooltip follows a tap instead.
    if (e.pointerType === 'mouse') {
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      setPointer({ x: sx, y: sy })
      setHovered(
        hitTest(tree, sx, sy, viewport, size.width, size.height, {
          visibleAscendancy: ownAscendancy,
          showAllAscendancies,
        }),
      )
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pinchRef.current.delete(e.pointerId)
    if (pinchRef.current.size < 2) pinchDistance.current = 0

    const drag = dragRef.current
    dragRef.current = null
    if (!viewport || !drag || drag.id !== e.pointerId) return

    // A tap that didn't pan selects the node under the finger.
    if (!drag.moved && e.pointerType !== 'mouse') {
      const rect = e.currentTarget.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      setPointer({ x: sx, y: sy })
      setHovered(
        hitTest(tree, sx, sy, viewport, size.width, size.height, {
          visibleAscendancy: ownAscendancy,
          showAllAscendancies,
        }),
      )
    }
  }

  // Wheel zoom. Registered natively so it can be non-passive and preventDefault
  // — React's synthetic onWheel is passive and cannot stop page scroll.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * 0.0015)
      setViewport((vp) =>
        vp ? zoomAt(vp, factor, e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height) : vp,
      )
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = (factor: number) =>
    setViewport((vp) => (vp ? zoomAt(vp, factor, size.width / 2, size.height / 2, size.width, size.height) : vp))

  const stats = {
    allocated: resolved.live.length,
    notables: resolved.notables.length,
    keystones: resolved.keystones.length,
    jewels: resolved.jewelSockets.length,
  }

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Tag tone="accent">{stats.allocated} allocated</Tag>
        <Tag>{stats.notables} notables</Tag>
        {stats.keystones ? <Tag>{stats.keystones} keystones</Tag> : null}
        {stats.jewels ? <Tag>{stats.jewels} jewel sockets</Tag> : null}
        {ownAscendancy ? <Tag tone="warn">{ownAscendancy}</Tag> : null}
      </div>

      <div
        ref={wrapRef}
        className="relative h-[26rem] w-full touch-none overflow-hidden rounded-lg border border-line bg-surface-sunken select-none sm:h-[34rem]"
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => setHovered(null)}
          role="img"
          aria-label={`Passive tree: ${stats.allocated} allocated nodes including ${stats.notables} notables. Drag to pan, scroll or pinch to zoom.`}
        />

        {/* Controls */}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => zoomBy(1.35)}
            aria-label="Zoom in"
            className="size-8 rounded-md border border-line bg-surface-raised/90 text-sm text-ink-dim backdrop-blur transition-colors hover:text-ink"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.35)}
            aria-label="Zoom out"
            className="size-8 rounded-md border border-line bg-surface-raised/90 text-sm text-ink-dim backdrop-blur transition-colors hover:text-ink"
          >
            −
          </button>
          <button
            type="button"
            onClick={fitToAllocation}
            aria-label="Fit to allocated nodes"
            title="Fit to allocated nodes"
            className="size-8 rounded-md border border-line bg-surface-raised/90 text-[10px] text-ink-dim backdrop-blur transition-colors hover:text-ink"
          >
            fit
          </button>
        </div>

        {/* Tooltip */}
        {hovered ? (
          <div
            className="pointer-events-none absolute z-10 max-w-[15rem] rounded-lg border border-line bg-surface-raised/95 p-2.5 shadow-lg backdrop-blur"
            style={{
              left: Math.min(Math.max(8, pointer.x + 14), Math.max(8, size.width - 250)),
              top: Math.min(Math.max(8, pointer.y + 14), Math.max(8, size.height - 130)),
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold text-ink">{hovered.name || `Node ${hovered.id}`}</span>
              {activeIds.has(hovered.id) ? <Tag tone="good">taken</Tag> : null}
            </div>
            {hovered.ascendancy ? (
              <div className="mt-0.5 text-[10px] text-warn">{hovered.ascendancy}</div>
            ) : null}
            {hovered.stats.length ? (
              <ul className="mt-1.5 space-y-0.5">
                {hovered.stats.map((s, i) => (
                  <li key={i} className="text-[11px] leading-snug text-ink-dim">
                    {s}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[11px] text-ink-mute">No stats recorded for this node.</p>
            )}
          </div>
        ) : null}
      </div>

      {routable.length ? (
        <div className="mt-3 rounded-lg border border-line bg-surface-sunken p-3">
          <h3 className="text-xs font-medium tracking-wide text-ink-dim uppercase">Routes to what you’re short on</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-mute">
            Cheapest unallocated nodes granting the stat, with the real point cost. Ranked by value per point — not a
            claim that a node is the right choice, only what it costs to reach.
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {routable.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setRouteStat(routeStat === s.key ? null : s.key)
                  setRouteIndex(0)
                }}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  routeStat === s.key
                    ? 'border-[var(--dmg-cold)] text-[var(--dmg-cold)]'
                    : 'border-line text-ink-dim hover:text-ink'
                }`}
              >
                {s.label} <span className="text-ink-mute">{s.shortfall}</span>
              </button>
            ))}
          </div>

          {routeStat && !routes.length ? (
            <p className="mt-2 text-[11px] leading-relaxed text-warn">
              No unallocated node granting that stat is within 4 passive points of the current tree. Widening the
              search would return routes too expensive to be useful advice.
            </p>
          ) : null}

          {routes.length ? (
            <ul className="mt-2 space-y-1">
              {routes.map((r, i) => (
                <li key={r.node.id}>
                  <button
                    type="button"
                    onClick={() => setRouteIndex(i)}
                    className={`flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                      i === routeIndex ? 'bg-surface-raised text-ink' : 'text-ink-dim hover:text-ink'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {r.node.name}
                      <span className="ml-1.5 text-[11px] text-ink-mute">{r.matchedStat}</span>
                    </span>
                    <span className="tabular shrink-0 text-[11px] text-accent">
                      {r.cost} {r.cost === 1 ? 'point' : 'points'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-1.5 text-[11px] text-ink-dim">
          <input
            type="checkbox"
            checked={showSwapSet}
            onChange={(e) => setShowSwapSet(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Show weapon set {allocation.activeSet === 1 ? 2 : 1} (inactive)
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-ink-dim">
          <input
            type="checkbox"
            checked={showAllAscendancies}
            onChange={(e) => setShowAllAscendancies(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Show all ascendancy wheels
        </label>
      </div>

      <Legend />

      {resolved.unresolvedIds.length ? (
        <p className="mt-2 text-[11px] leading-relaxed text-warn">
          {resolved.unresolvedIds.length} allocated node
          {resolved.unresolvedIds.length === 1 ? '' : 's'} are not present in this tree data set and cannot be drawn.
          This is a gap in the data, not a problem with the build — the game does not allow an invalid tree.
        </p>
      ) : null}

      {resolved.components.length > 1 ? (
        <p className="mt-2 text-[11px] leading-relaxed text-ink-mute">
          The allocation forms {resolved.components.length} groups:{' '}
          {resolved.components
            .map((c) => `${c.nodes.length} ${c.kind === 'ascendancy' ? `on the ${c.ascendancy} wheel` : c.kind === 'main-tree' ? 'on the main tree' : 'in a cluster this data set does not link'}`)
            .join(', ')}
          . Separate groups are normal and do not mean the tree is broken.
        </p>
      ) : null}
    </div>
  )
}

function Legend() {
  const items = [
    { label: 'Notable', className: 'bg-accent', size: 'size-2.5' },
    { label: 'Keystone', className: 'bg-[var(--dmg-chaos)]', size: 'size-3' },
    { label: 'Jewel socket', className: 'bg-[var(--dmg-cold)]', size: 'size-2.5' },
    { label: 'Ascendancy', className: 'bg-[var(--dmg-fire)]', size: 'size-2.5' },
    { label: 'Class start', className: 'bg-good', size: 'size-2.5' },
  ]
  return (
    <ul className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-[11px] text-ink-mute">
          <span aria-hidden className={`inline-block rounded-full ${i.size} ${i.className}`} />
          {i.label}
        </li>
      ))}
    </ul>
  )
}
