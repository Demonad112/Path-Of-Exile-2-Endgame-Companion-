/**
 * Verify the passive tree renders and responds, in a real browser.
 *
 * A painted canvas proves nothing on its own — these check that the tree is
 * actually drawn, that hovering a real allocated node produces a tooltip with
 * that node's real stats, and that pan and zoom change the view.
 *
 * Usage: node scripts/verify-tree.mjs [baseUrl]
 */

import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3210/'
const fixture = readFileSync('packages/core/test/fixtures/athrynas-v43.json', 'utf8')
const tree = JSON.parse(readFileSync('packages/data/generated/passive-tree.json', 'utf8'))
const model = JSON.parse(fixture).charModel

const explicitPath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch(existsSync(explicitPath) ? { executablePath: explicitPath } : {})
const failures = []

const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto(baseUrl, { waitUntil: 'networkidle' })
await page.getByRole('tab', { name: 'Paste data' }).click()
await page.getByLabel('Character model JSON').fill(fixture)
await page.getByRole('button', { name: 'Analyse pasted data' }).click()
await page.getByRole('heading', { name: 'Athrynas', level: 2 }).waitFor({ timeout: 30_000 })

const canvas = page.locator('canvas')
await canvas.waitFor({ timeout: 30_000 })
// The tree sits well below the fold. page.mouse works in VIEWPORT coordinates,
// so without scrolling first every synthetic move lands off-screen and the
// canvas receives no pointer events at all.
await canvas.scrollIntoViewIfNeeded()
await page.waitForTimeout(1500)

// --- the canvas is actually painted ----------------------------------------
const paint = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  const g = c.getContext('2d')
  const d = g.getImageData(0, 0, c.width, c.height).data
  let painted = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 8) painted++
  return painted / (d.length / 4)
})
if (paint < 0.02) failures.push(`canvas is nearly blank (${(paint * 100).toFixed(1)}% painted)`)
console.log(`canvas painted: ${(paint * 100).toFixed(1)}%`)

// --- hovering an allocated node shows its real stats ------------------------
// Pick a real allocated notable and compute where it lands on screen, using the
// same transform the renderer uses.
const allocated = model.passiveSelection
// Pick a MAIN-TREE notable: the default view frames the main tree, so an
// ascendancy node may sit outside the swept area.
const notable = allocated
  .map((id) => ({ id, n: tree.nodes[String(id)] }))
  .find((x) => x.n && x.n.k === 1 && x.n.s?.length && !x.n.a)
if (!notable) {
  failures.push('fixture has no allocated notable with stats — cannot test the tooltip')
} else {
  const box = await canvas.boundingBox()
  // Read the live viewport by probing: move to the node's expected position for
  // a set of candidate transforms is fragile, so instead sweep the canvas for
  // the tooltip naming this node.
  let found = false
  const step = 12
  outer: for (let y = 20; y < box.height - 20 && !found; y += step) {
    for (let x = 20; x < box.width - 20; x += step) {
      await page.mouse.move(box.x + x, box.y + y)
      const tip = page.locator('div.pointer-events-none').first()
      if (await tip.isVisible().catch(() => false)) {
        const text = await tip.innerText()
        if (text.includes(notable.n.n)) {
          found = true
          const missingStat = notable.n.s.find((s) => !text.includes(s.slice(0, 24)))
          if (missingStat) failures.push(`tooltip for ${notable.n.n} omitted a stat: ${missingStat}`)
          console.log(`tooltip: found "${notable.n.n}" with its real stats`)
          break outer
        }
      }
    }
  }
  if (!found) failures.push(`never found a tooltip for allocated notable "${notable.n.n}"`)
}

// --- zoom changes the view --------------------------------------------------
const before = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  return c.getContext('2d').getImageData(0, 0, c.width, c.height).data.join(',').length
})
await page.getByRole('button', { name: 'Zoom in' }).click()
await page.waitForTimeout(500)
const after = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  return c.getContext('2d').getImageData(0, 0, c.width, c.height).data.join(',').length
})
if (before === after) failures.push('zoom in did not change what is drawn')
else console.log('zoom: view changed')

// --- pan changes the view ---------------------------------------------------
const box = await canvas.boundingBox()
const beforePan = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  return c.getContext('2d').getImageData(0, 0, 200, 200).data.join(',')
})
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2 - 90, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(400)
const afterPan = await page.evaluate(() => {
  const c = document.querySelector('canvas')
  return c.getContext('2d').getImageData(0, 0, 200, 200).data.join(',')
})
if (beforePan === afterPan) failures.push('dragging did not pan the tree')
else console.log('pan: view changed')

// --- weapon-set toggle ------------------------------------------------------
await page.getByLabel(/Show weapon set/).check()
await page.waitForTimeout(400)
console.log('weapon-set toggle: accepted')

if (errors.length) failures.push(`console errors: ${errors.slice(0, 4).join(' | ')}`)

await browser.close()

if (failures.length) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\nPassive tree verified.')
