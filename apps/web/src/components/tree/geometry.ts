/**
 * Viewport maths for the passive tree.
 *
 * Kept apart from the React component so it can be reasoned about — and tested
 * — without a DOM.
 */

import type { Extent } from '@poe2/core'

export interface Viewport {
  /** Tree-space point at the centre of the canvas. */
  cx: number
  cy: number
  /** Canvas pixels per tree unit. */
  scale: number
}

export const MIN_SCALE = 0.004
export const MAX_SCALE = 0.35

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/** Frame an extent in a canvas of the given size, with margin as a fraction. */
export function fitExtent(extent: Extent, width: number, height: number, margin = 0.12): Viewport {
  const spanX = Math.max(1, extent.maxX - extent.minX)
  const spanY = Math.max(1, extent.maxY - extent.minY)
  const scale = clampScale(Math.min(width / spanX, height / spanY) * (1 - margin))
  return {
    cx: (extent.minX + extent.maxX) / 2,
    cy: (extent.minY + extent.maxY) / 2,
    scale,
  }
}

/** Bounding box of a set of points, padded in tree units. */
export function extentOf(points: Array<{ x: number; y: number }>, pad = 900): Extent | null {
  if (!points.length) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad }
}

export function treeToScreen(x: number, y: number, vp: Viewport, width: number, height: number) {
  return {
    x: (x - vp.cx) * vp.scale + width / 2,
    y: (y - vp.cy) * vp.scale + height / 2,
  }
}

export function screenToTree(sx: number, sy: number, vp: Viewport, width: number, height: number) {
  return {
    x: (sx - width / 2) / vp.scale + vp.cx,
    y: (sy - height / 2) / vp.scale + vp.cy,
  }
}

/**
 * Zoom about a fixed screen point, so the tree position under the cursor (or
 * pinch centre) stays put.
 */
export function zoomAt(vp: Viewport, factor: number, sx: number, sy: number, width: number, height: number): Viewport {
  const nextScale = clampScale(vp.scale * factor)
  if (nextScale === vp.scale) return vp
  const before = screenToTree(sx, sy, vp, width, height)
  const after = screenToTree(sx, sy, { ...vp, scale: nextScale }, width, height)
  return {
    scale: nextScale,
    cx: vp.cx + (before.x - after.x),
    cy: vp.cy + (before.y - after.y),
  }
}

/** Tree-space rectangle currently visible, padded so marks aren't clipped. */
export function visibleBounds(vp: Viewport, width: number, height: number, pad = 60): Extent {
  const halfW = (width / 2 + pad) / vp.scale
  const halfH = (height / 2 + pad) / vp.scale
  return { minX: vp.cx - halfW, maxX: vp.cx + halfW, minY: vp.cy - halfH, maxY: vp.cy + halfH }
}
