/**
 * Encoding a Path of Building export.
 *
 * The inverse of pob/export.ts: XML -> zlib deflate -> base64url. Used to hand
 * a MODIFIED build back to Path of Building — change the allocated tree, then
 * re-encode so the result can be pasted straight in.
 *
 * ## Why this edits rather than generates
 *
 * A PoB document carries far more than this project models: item sets, skill
 * gem levels and qualities, config toggles, calc settings. Generating one from
 * scratch would mean inventing all of that. So encoding always starts from a
 * real exported document and edits the parts we actually understand, leaving
 * everything else byte-for-byte intact. What we cannot model, we do not touch.
 */

import { decodePobExport, parsePobXml, type PobBuildInfo } from './export.js'

export class PobEncodeError extends Error {
  override name = 'PobEncodeError'
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = ''
    // Chunked to avoid blowing the argument limit on large builds.
    const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
    }
    return btoa(binary)
  }
  return Buffer.from(bytes).toString('base64')
}

/** Standard base64 -> the URL-safe form Path of Building expects. */
function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_')
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'function') {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }
  const { deflateSync } = await import('node:zlib')
  return new Uint8Array(deflateSync(bytes))
}

/** Encode a Path of Building XML document back into an export code. */
export async function encodePobExport(xml: string): Promise<string> {
  if (!xml.includes('<PathOfBuilding')) {
    throw new PobEncodeError('Refusing to encode: this is not a Path of Building document.')
  }
  const deflated = await deflate(new TextEncoder().encode(xml))
  return toBase64Url(bytesToBase64(deflated))
}

export interface TreeEdit {
  /** Node ids to allocate, on top of what the build already has. */
  allocate?: number[]
  /** Node ids to remove. */
  deallocate?: number[]
  /** Replace the allocation outright. Takes precedence over the two above. */
  replace?: number[]
}

export interface PobEditResult {
  code: string
  xml: string
  before: PobBuildInfo
  after: PobBuildInfo
  /** Node ids added and removed, after de-duplication. */
  added: number[]
  removed: number[]
  /** Anything asked for that could not be done, said plainly. */
  warnings: string[]
}

/**
 * Apply a tree edit to an existing export code and re-encode it.
 *
 * Only the `<Spec nodes="...">` attribute is rewritten. Everything else in the
 * document is preserved exactly, because this project does not model it.
 */
export async function editPobTree(code: string, edit: TreeEdit): Promise<PobEditResult> {
  const xml = await decodePobExport(code)
  const before = parsePobXml(xml)
  const warnings: string[] = []

  const current = new Set(before.treeNodeIds)
  const original = new Set(current)

  if (edit.replace) {
    current.clear()
    for (const id of edit.replace) current.add(id)
  } else {
    for (const id of edit.deallocate ?? []) {
      if (!current.delete(id)) warnings.push(`Node ${id} was asked to be removed but was not allocated.`)
    }
    for (const id of edit.allocate ?? []) {
      if (current.has(id)) warnings.push(`Node ${id} was asked to be allocated but already was.`)
      current.add(id)
    }
  }

  const next = [...current].sort((a, b) => a - b)

  // Rewrite only the nodes attribute of the first <Spec>. A build can carry
  // several specs (tree variants); editing all of them would silently change
  // trees the caller never mentioned.
  const specPattern = /(<Spec\b[^>]*\bnodes=")([^"]*)(")/
  if (!specPattern.test(xml)) {
    throw new PobEncodeError(
      'This export has no <Spec nodes="..."> attribute to edit, so the passive tree cannot be rewritten.',
    )
  }
  const nextXml = xml.replace(specPattern, `$1${next.join(',')}$3`)

  const added = next.filter((id) => !original.has(id))
  const removed = [...original].filter((id) => !current.has(id)).sort((a, b) => a - b)

  if (/<Spec\b/g.test(xml) && (xml.match(/<Spec\b/g)?.length ?? 0) > 1) {
    warnings.push(
      'This build carries more than one tree spec; only the first was edited, since changing the others was not asked for.',
    )
  }

  return {
    code: await encodePobExport(nextXml),
    xml: nextXml,
    before,
    after: parsePobXml(nextXml),
    added,
    removed,
    warnings,
  }
}
