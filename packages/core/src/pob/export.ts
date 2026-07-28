/**
 * Path of Building export decoding.
 *
 * `charModel.pathOfBuildingExport` is a base64url + zlib blob wrapping PoB's
 * own XML. It matters for two reasons:
 *
 *  1. Round-tripping a build into PoB.
 *  2. It carries PoB's OWN computed `<PlayerStat>` values, which are an
 *     INDEPENDENT second opinion on poe.ninja's numbers. On the reference
 *     character PoB's `TotalDPS` reads 109859.05 against poe.ninja's 109,859 —
 *     they agree, which is exactly what makes disagreement meaningful. The
 *     reconciliation harness uses this rather than trusting either blindly.
 *
 * Not used for stats V1-style: V1's `importer._extract_stats` was a placeholder
 * that returned a note dict and computed nothing.
 *
 * Decoding is dependency-free and works in both Node and the browser: Node has
 * `zlib` but the browser does not, so inflation goes through
 * `DecompressionStream('deflate')` where available.
 */

/** Parsing quirks recorded so they aren't rediscovered:
 *  - `<Item>` elements have NO slot attribute. Join `<ItemSet><Slot itemId=>`
 *    on the item's `id` to learn where it is equipped.
 *  - The item NAME is the line AFTER the "Rarity:" line, not the first line.
 */

export class PobDecodeError extends Error {
  override name = 'PobDecodeError'
}

/** base64url -> standard base64, padded. */
function toStandardBase64(code: string): string {
  const compact = code.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  return compact + '='.repeat((4 - (compact.length % 4)) % 4)
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  // Node without atob (shouldn't happen on >=22, but keep it total).
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'function') {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }
  const { inflateSync } = await import('node:zlib')
  return new Uint8Array(inflateSync(bytes))
}

/** Decode a PoB export code to its raw XML. */
export async function decodePobExport(code: string): Promise<string> {
  if (typeof code !== 'string' || !code.trim()) {
    throw new PobDecodeError('Empty Path of Building export code.')
  }
  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(toStandardBase64(code))
  } catch {
    throw new PobDecodeError('Export code is not valid base64.')
  }
  let xml: string
  try {
    const inflated = await inflate(bytes)
    xml = new TextDecoder('utf-8').decode(inflated)
  } catch {
    throw new PobDecodeError('Export code did not inflate — it may be truncated or not a PoB code.')
  }
  if (!xml.includes('<PathOfBuilding')) {
    throw new PobDecodeError('Decoded payload is not a Path of Building document.')
  }
  return xml
}

/**
 * PoB's own computed stats, read straight out of the XML.
 *
 * Deliberately regex-based rather than DOM-based: `<PlayerStat>` elements are
 * flat self-closing tags, and this must run identically in Node (no DOMParser)
 * and the browser.
 */
export function readPlayerStats(xml: string): Record<string, number> {
  const out: Record<string, number> = {}
  const re = /<PlayerStat\s+stat="([^"]+)"\s+value="([^"]*)"\s*\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const key = m[1]
    const raw = m[2]
    if (!key || raw === undefined) continue
    const value = Number(raw)
    if (Number.isFinite(value)) out[key] = value
  }
  return out
}

export interface PobBuildInfo {
  level: number | null
  className: string | null
  ascendClassName: string | null
  /** PoB's own computed stats — the independent second opinion. */
  playerStats: Record<string, number>
  /** Number of allocated tree nodes PoB lists, when a spec URL is present. */
  treeNodeIds: number[]
}

function attr(xml: string, tag: string, name: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`)
  const m = re.exec(xml)
  return m?.[1] ?? null
}

/**
 * Extract the parts of a PoB document we actually use. Anything absent comes
 * back null rather than defaulted — a missing level must be reported, not
 * silently rendered as 0.
 */
export function parsePobXml(xml: string): PobBuildInfo {
  const levelRaw = attr(xml, 'Build', 'level')
  const level = levelRaw !== null && Number.isFinite(Number(levelRaw)) ? Number(levelRaw) : null

  const nodesAttr = attr(xml, 'Spec', 'nodes')
  const treeNodeIds = nodesAttr
    ? nodesAttr
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n >= 0)
    : []

  return {
    level,
    className: attr(xml, 'Build', 'className'),
    ascendClassName: attr(xml, 'Build', 'ascendClassName'),
    playerStats: readPlayerStats(xml),
    treeNodeIds,
  }
}

/** Convenience: decode and parse in one step. */
export async function importPobExport(code: string): Promise<PobBuildInfo & { xml: string }> {
  const xml = await decodePobExport(code)
  return { ...parsePobXml(xml), xml }
}
