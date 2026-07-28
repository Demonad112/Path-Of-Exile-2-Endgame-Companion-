/**
 * Verify the three late additions actually work in a browser:
 * Path of Building code import, the chat panel, and the offline worker.
 *
 * The PoB path is the one worth driving hardest — it is a whole second import
 * route, and until now the app rejected it outright on a false claim.
 *
 * Usage: node scripts/verify-extras.mjs [baseUrl] [outDir]
 */

import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = process.argv[2] ?? 'http://localhost:3210'
const outDir = process.argv[3] ?? join(here, '..', 'screenshots')

const payload = JSON.parse(
  readFileSync(join(here, '..', 'packages', 'core', 'test', 'fixtures', 'athrynas-v43.json'), 'utf8'),
)
const pobCode = (payload.charModel ?? payload).pathOfBuildingExport

const failures = []
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const consoleErrors = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))

  await page.goto(baseUrl, { waitUntil: 'networkidle' })

  // --- Path of Building code import ------------------------------------------
  await page.getByRole('tab', { name: 'Paste data' }).click()
  await page.getByLabel(/Path of Building code/i).fill(pobCode)
  await page.getByRole('button', { name: 'Analyse pasted data' }).click()

  const pobPanel = page.locator('section', {
    has: page.getByRole('heading', { name: 'Imported from a Path of Building code' }),
  })
  await pobPanel.waitFor({ timeout: 20_000 })

  const body = await page.locator('main').innerText()

  // The same numbers poe.ninja reports, from a completely different source.
  if (!/3,808/.test(body)) failures.push('PoB import does not show the real lowest maximum hit (3,808)')
  if (!/109,859/.test(body)) failures.push('PoB import does not show the real total DPS (109,859)')
  if (!/Level 86/.test(body)) failures.push('PoB import does not show the level')
  if (!/Deadeye/.test(body)) failures.push('PoB import does not show the ascendancy')
  // The gaps must be visible, or a missing panel reads as a missing stat.
  if (!/What a code cannot tell you/i.test(body)) failures.push('PoB import does not list what the source cannot answer')
  if (!/Per-skill damage/i.test(body)) failures.push('PoB import does not name the per-skill damage gap')
  console.log('PoB import: 3,808 chaos and 109,859 DPS from a code alone, with its gaps stated')

  await pobPanel.screenshot({ path: join(outDir, 'pob-import.png') })

  // --- chat, unconfigured ----------------------------------------------------
  const chatPanel = page.locator('section', { has: page.getByRole('heading', { name: 'Ask about this build' }) })
  if (!(await chatPanel.count())) {
    failures.push('the chat panel did not render')
  } else {
    await chatPanel.scrollIntoViewIfNeeded()
    await chatPanel.getByRole('button', { name: /Set up|Gemini/ }).click()
    const chatText = await chatPanel.innerText()
    // The key-handling explanation is the whole point — it must be visible
    // before anyone types a key, not buried in a doc.
    if (!/in this browser only/i.test(chatText)) failures.push('chat does not say the key stays in the browser')
    if (!/no server/i.test(chatText)) failures.push('chat does not explain why the site holds no key')
    if (!/free tier/i.test(chatText)) failures.push('chat does not mark which provider has a free tier')
    await chatPanel.screenshot({ path: join(outDir, 'chat.png') })
    console.log('chat panel: key handling explained before any key is entered')
  }

  // --- the offline worker ships and parses -----------------------------------
  const sw = await page.evaluate(async (base) => {
    const res = await fetch(`${base}/sw.js`)
    return { status: res.status, body: await res.text() }
  }, baseUrl.replace(/\/+$/, ''))
  if (sw.status !== 200) failures.push(`sw.js is not served: HTTP ${sw.status}`)
  if (!/poe2-data-/.test(sw.body)) failures.push('sw.js does not define the data cache')
  // A cached character sheet presented as current would be a wrong answer.
  if (!/isLiveRequest/.test(sw.body)) failures.push('sw.js does not exclude live character requests from caching')
  console.log('service worker: served, caches data, never caches a character sheet')

  if (consoleErrors.length) failures.push(`console errors: ${consoleErrors.slice(0, 3).join(' | ')}`)
} finally {
  await browser.close()
}

if (failures.length) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\nPoB import, chat and offline worker verified in a real browser.')
