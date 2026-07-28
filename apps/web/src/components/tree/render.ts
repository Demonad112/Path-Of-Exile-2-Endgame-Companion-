/**
 * Canvas painter for the passive tree.
 *
 * Canvas rather than SVG: 4,975 nodes and 5,887 edges as DOM elements is
 * sluggish to pan on a phone. Everything is drawn per frame, culled to the
 * visible bounds.
 *
 * Draw order matters — later layers must read as "on top":
 *   dim edges -> dim nodes -> allocated edges -> allocated nodes -> highlights
 */

import type { PassiveTree, TreeNode } from '@poe2/core'
import { NODE_KIND } from '@poe2/core'
import { treeToScreen, visibleBounds, type Viewport } from './geometry'

export interface TreePalette {
  dimEdge: string
  dimNode: string
  edge: string
  node: string
  notable: string
  keystone: string
  jewel: string
  start: string
  ascendancy: string
  highlight: string
  surface: string
  text: string
}

export interface RenderOptions {
  tree: PassiveTree
  viewport: Viewport
  width: number
  height: number
  palette: TreePalette
  /** Allocated and live. */
  allocated: Set<number>
  /** Allocated on the inactive weapon set — drawn distinctly, never as live. */
  inactive: Set<number>
  /** Route the engine suggests, drawn glowing on top. */
  highlighted: Set<number>
  hovered: number | null
  /** Hide the peripheral ascendancy wheels of other classes. */
  visibleAscendancy: string | null
  showAllAscendancies: boolean
}

/** Radius in screen pixels for a node kind, before zoom scaling. */
function baseRadius(kind: TreeNode['kind'], allocated: boolean): number {
  switch (kind) {
    case NODE_KIND.keystone:
      return 9
    case NODE_KIND.start:
      return 8
    case NODE_KIND.notable:
      return 6
    case NODE_KIND.jewel:
      return 5.5
    default:
      return allocated ? 3.4 : 2.6
  }
}

/**
 * Node radius scales with zoom but stays legible and never swamps the view.
 *
 * Unallocated marks are drawn smaller as well as fainter: 4,975 nodes at full
 * size read as noise and bury the ~119 that matter.
 */
function radiusFor(kind: TreeNode['kind'], allocated: boolean, scale: number): number {
  const zoomFactor = Math.min(1.7, Math.max(0.5, scale / 0.035))
  return baseRadius(kind, allocated) * zoomFactor * (allocated ? 1 : 0.62)
}

/** Unallocated marks recede; notables stay findable, plain passives nearly vanish. */
function dimAlpha(kind: TreeNode['kind']): number {
  return kind === NODE_KIND.normal ? 0.22 : 0.42
}

function colourFor(node: TreeNode, palette: TreePalette): string {
  if (node.ascendancy) return palette.ascendancy
  switch (node.kind) {
    case NODE_KIND.keystone:
      return palette.keystone
    case NODE_KIND.notable:
      return palette.notable
    case NODE_KIND.jewel:
      return palette.jewel
    case NODE_KIND.start:
      return palette.start
    default:
      return palette.node
  }
}

function isVisible(node: TreeNode, opts: RenderOptions): boolean {
  if (!node.ascendancy) return true
  if (opts.showAllAscendancies) return true
  return node.ascendancy === opts.visibleAscendancy
}

export function renderTree(ctx: CanvasRenderingContext2D, opts: RenderOptions): void {
  const { tree, viewport: vp, width, height, palette } = opts
  const bounds = visibleBounds(vp, width, height)

  ctx.clearRect(0, 0, width, height)

  const inView = (n: TreeNode) =>
    n.x >= bounds.minX && n.x <= bounds.maxX && n.y >= bounds.minY && n.y <= bounds.maxY

  // --- edges ----------------------------------------------------------------
  const liveEdges: Array<[TreeNode, TreeNode]> = []
  const highlightEdges: Array<[TreeNode, TreeNode]> = []

  ctx.lineWidth = Math.max(0.6, 1.2 * Math.min(1.8, vp.scale / 0.03))
  ctx.strokeStyle = palette.dimEdge
  ctx.beginPath()
  for (const [a, b] of tree.edgePairs()) {
    const na = tree.node(a)
    const nb = tree.node(b)
    if (!na || !nb) continue
    if (!inView(na) && !inView(nb)) continue
    if (!isVisible(na, opts) || !isVisible(nb, opts)) continue

    const bothAllocated = opts.allocated.has(a) && opts.allocated.has(b)
    const bothHighlighted = opts.highlighted.has(a) && opts.highlighted.has(b)
    if (bothHighlighted) {
      highlightEdges.push([na, nb])
      continue
    }
    if (bothAllocated) {
      liveEdges.push([na, nb])
      continue
    }

    const pa = treeToScreen(na.x, na.y, vp, width, height)
    const pb = treeToScreen(nb.x, nb.y, vp, width, height)
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
  }
  ctx.stroke()

  // --- unallocated nodes ----------------------------------------------------
  ctx.fillStyle = palette.dimNode
  for (const node of tree.allNodes()) {
    if (opts.allocated.has(node.id) || opts.highlighted.has(node.id)) continue
    if (!inView(node) || !isVisible(node, opts)) continue

    const p = treeToScreen(node.x, node.y, vp, width, height)
    const r = radiusFor(node.kind, false, vp.scale)
    ctx.globalAlpha = dimAlpha(node.kind)
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // --- allocated edges ------------------------------------------------------
  ctx.strokeStyle = palette.edge
  ctx.lineWidth = Math.max(1.4, 2.4 * Math.min(1.8, vp.scale / 0.03))
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const [na, nb] of liveEdges) {
    const pa = treeToScreen(na.x, na.y, vp, width, height)
    const pb = treeToScreen(nb.x, nb.y, vp, width, height)
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pb.x, pb.y)
  }
  ctx.stroke()

  // --- inactive weapon-set nodes -------------------------------------------
  // Drawn as hollow rings: allocated, but contributing nothing right now.
  ctx.lineWidth = 1.6
  for (const id of opts.inactive) {
    const node = tree.node(id)
    if (!node || !inView(node) || !isVisible(node, opts)) continue
    const p = treeToScreen(node.x, node.y, vp, width, height)
    const r = radiusFor(node.kind, true, vp.scale)
    ctx.strokeStyle = colourFor(node, palette)
    ctx.globalAlpha = 0.65
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // --- allocated nodes ------------------------------------------------------
  for (const id of opts.allocated) {
    const node = tree.node(id)
    if (!node || !inView(node) || !isVisible(node, opts)) continue

    const p = treeToScreen(node.x, node.y, vp, width, height)
    const r = radiusFor(node.kind, true, vp.scale)

    // A surface ring separates overlapping marks.
    ctx.fillStyle = palette.surface
    ctx.beginPath()
    ctx.arc(p.x, p.y, r + 1.6, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = colourFor(node, palette)
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fill()

    // Keystones get an inner cut so they read as a distinct class at a glance.
    if (node.kind === NODE_KIND.keystone) {
      ctx.fillStyle = palette.surface
      ctx.beginPath()
      ctx.arc(p.x, p.y, r * 0.42, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // --- suggested route ------------------------------------------------------
  if (opts.highlighted.size) {
    ctx.save()
    ctx.strokeStyle = palette.highlight
    ctx.shadowColor = palette.highlight
    ctx.shadowBlur = 12
    ctx.lineWidth = Math.max(2, 3 * Math.min(1.8, vp.scale / 0.03))
    ctx.beginPath()
    for (const [na, nb] of highlightEdges) {
      const pa = treeToScreen(na.x, na.y, vp, width, height)
      const pb = treeToScreen(nb.x, nb.y, vp, width, height)
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
    }
    ctx.stroke()

    ctx.fillStyle = palette.highlight
    for (const id of opts.highlighted) {
      const node = tree.node(id)
      if (!node || !inView(node)) continue
      const p = treeToScreen(node.x, node.y, vp, width, height)
      ctx.beginPath()
      ctx.arc(p.x, p.y, radiusFor(node.kind, true, vp.scale) + 1, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  // --- hover ----------------------------------------------------------------
  if (opts.hovered !== null) {
    const node = tree.node(opts.hovered)
    if (node) {
      const p = treeToScreen(node.x, node.y, vp, width, height)
      ctx.strokeStyle = palette.text
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(p.x, p.y, radiusFor(node.kind, true, vp.scale) + 4, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // --- class start labels ---------------------------------------------------
  // Only once zoomed out enough for them to orient rather than clutter, and
  // only where the whole label fits on the canvas. `inView` works in tree space
  // with padding, so a node just off the edge would otherwise draw a clipped,
  // overlapping label against the frame.
  if (vp.scale < 0.02 && width > 320) {
    ctx.fillStyle = palette.text
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.globalAlpha = 0.8
    for (const [id, label] of tree.classStarts) {
      const node = tree.node(id)
      if (!node) continue
      const p = treeToScreen(node.x, node.y, vp, width, height)
      const halfLabel = ctx.measureText(label).width / 2 + 4
      if (p.x - halfLabel < 0 || p.x + halfLabel > width) continue
      if (p.y - 24 < 0 || p.y > height) continue
      ctx.fillText(label, p.x, p.y - 14)
    }
    ctx.globalAlpha = 1
  }
}

/**
 * Nearest node to a screen point, within a generous radius.
 *
 * The threshold is deliberately larger than the drawn mark — touch targets must
 * exceed what the eye sees, and small passives are only a few pixels wide.
 */
export function hitTest(
  tree: PassiveTree,
  sx: number,
  sy: number,
  vp: Viewport,
  width: number,
  height: number,
  opts: Pick<RenderOptions, 'visibleAscendancy' | 'showAllAscendancies'>,
): TreeNode | null {
  const threshold = 18
  const bounds = visibleBounds(vp, width, height)
  let best: TreeNode | null = null
  let bestDistance = threshold * threshold

  for (const node of tree.allNodes()) {
    if (node.x < bounds.minX || node.x > bounds.maxX || node.y < bounds.minY || node.y > bounds.maxY) continue
    if (node.ascendancy && !opts.showAllAscendancies && node.ascendancy !== opts.visibleAscendancy) continue

    const p = treeToScreen(node.x, node.y, vp, width, height)
    const dx = p.x - sx
    const dy = p.y - sy
    const distance = dx * dx + dy * dy
    if (distance > bestDistance) continue
    // Prefer the more significant node when two overlap.
    if (distance === bestDistance && best && node.kind <= best.kind) continue
    bestDistance = distance
    best = node
  }
  return best
}
