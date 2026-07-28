/**
 * Encoding a Path of Building export, and round-tripping a tree edit.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { unwrapCharModel } from '../src/analyze.js'
import { decodePobExport, parsePobXml, readPlayerStats } from '../src/pob/export.js'
import { editPobTree, encodePobExport, PobEncodeError } from '../src/pob/build.js'

const model = unwrapCharModel(
  JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/athrynas-v43.json', import.meta.url)), 'utf8')),
)
const code = model.pathOfBuildingExport!

describe('round-tripping', () => {
  it('re-encodes to something that decodes back identically', async () => {
    const xml = await decodePobExport(code)
    const reencoded = await encodePobExport(xml)
    expect(await decodePobExport(reencoded)).toBe(xml)
  })

  it('preserves Path of Building’s own computed stats through the round trip', async () => {
    const xml = await decodePobExport(code)
    const stats = readPlayerStats(await decodePobExport(await encodePobExport(xml)))
    expect(stats.TotalDPS).toBeCloseTo(109859.05, 1)
  })

  it('refuses to encode something that is not a Path of Building document', async () => {
    await expect(encodePobExport('<html>nope</html>')).rejects.toBeInstanceOf(PobEncodeError)
  })
})

describe('editing the tree', () => {
  it('allocates nodes and reports exactly what changed', async () => {
    const before = parsePobXml(await decodePobExport(code))
    const newNode = 999_001

    const result = await editPobTree(code, { allocate: [newNode] })
    expect(result.added).toEqual([newNode])
    expect(result.removed).toEqual([])
    expect(result.after.treeNodeIds).toHaveLength(before.treeNodeIds.length + 1)
    expect(result.after.treeNodeIds).toContain(newNode)

    // The produced code must be a real, decodable export.
    expect(parsePobXml(await decodePobExport(result.code)).treeNodeIds).toContain(newNode)
  })

  it('deallocates nodes', async () => {
    const before = parsePobXml(await decodePobExport(code))
    const target = before.treeNodeIds[0]!

    const result = await editPobTree(code, { deallocate: [target] })
    expect(result.removed).toEqual([target])
    expect(result.after.treeNodeIds).not.toContain(target)
  })

  it('replaces the allocation outright', async () => {
    const result = await editPobTree(code, { replace: [1, 2, 3] })
    expect(result.after.treeNodeIds).toEqual([1, 2, 3])
  })

  it('warns rather than silently ignoring an impossible edit', async () => {
    const before = parsePobXml(await decodePobExport(code))
    const alreadyAllocated = before.treeNodeIds[0]!

    const result = await editPobTree(code, { allocate: [alreadyAllocated], deallocate: [999_999] })
    expect(result.warnings.some((w) => w.includes('already'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('was not allocated'))).toBe(true)
  })

  it('changes only the tree, leaving the rest of the document intact', async () => {
    const xml = await decodePobExport(code)
    const result = await editPobTree(code, { allocate: [999_002] })

    // Everything PoB computed and configured must survive untouched — this
    // project does not model it and must not rewrite it.
    const strip = (s: string) => s.replace(/<Spec\b[^>]*>/, '')
    expect(strip(result.xml)).toBe(strip(xml))
    expect(readPlayerStats(result.xml)).toEqual(readPlayerStats(xml))
  })
})
