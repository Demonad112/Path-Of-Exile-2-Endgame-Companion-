/**
 * Drive the built web app with the real captured character and screenshot it.
 *
 * Render correctness is not inferred from code — this loads the actual static
 * export in a real browser, pastes the real 388 KB charModel, and captures the
 * result at mobile and desktop widths.
 *
 * Usage: node scripts/screenshot.mjs [baseUrl] [outDir]
 */

import { chromium } from 'playwright'
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3210/'
const outDir = process.argv[3] ?? join(here, '..', 'screenshots')
const fixture = readFileSync(join(here, '..', 'packages/core/test/fixtures/athrynas-v43.json'), 'utf8')

mkdirSync(outDir, { recursive: true })

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]

// Prefer the environment's preinstalled Chromium when present: its build number
// may not match whatever playwright version npm resolved, and downloading a
// second copy is wasteful. CHROMIUM_PATH overrides for other machines.
const explicitPath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch(
  existsSync(explicitPath) ? { executablePath: explicitPath } : {},
)
const failures = []

for (const vp of VIEWPORTS) {
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      colorScheme: theme === 'dark' ? 'dark' : 'light',
    })
    const page = await context.newPage()

    const consoleErrors = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push(String(e)))

    await page.goto(baseUrl, { waitUntil: 'networkidle' })

    // Empty state, before any import.
    if (theme === 'dark') {
      await page.screenshot({ path: join(outDir, `${vp.name}-empty.png`), fullPage: true })
    }

    // Paste the real character model and analyse it.
    await page.getByRole('tab', { name: 'Paste data' }).click()
    await page.getByLabel('Character model JSON').fill(fixture)
    await page.getByRole('button', { name: 'Analyse pasted data' }).click()

    // The character heading only appears once analysis has completed.
    await page.getByRole('heading', { name: 'Athrynas', level: 2 }).waitFor({ timeout: 20_000 })

    await page.screenshot({ path: join(outDir, `${vp.name}-${theme}.png`), fullPage: true })

    // Assert the headline numbers actually reached the DOM.
    const body = await page.locator('body').innerText()
    const expectations = [
      ['lowest max hit', '3,808'],
      ['character level', 'Level 86'],
      ['EHP', '13,569'],
      ['cold resistance', '74'],
      ['primary skill', 'Ice Shot'],
      ['weapon', 'Loath Bane'],
    ]
    for (const [what, text] of expectations) {
      if (!body.includes(text)) failures.push(`${vp.name}/${theme}: missing ${what} (${text})`)
    }

    // Horizontal page scroll is a layout bug — wide content must scroll inside
    // its own container, never the body.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    if (overflow) failures.push(`${vp.name}/${theme}: page scrolls horizontally`)

    if (consoleErrors.length) failures.push(`${vp.name}/${theme}: console errors: ${consoleErrors.join(' | ')}`)

    console.log(`captured ${vp.name}/${theme}`)
    await context.close()
  }
}

await browser.close()

if (failures.length) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\nAll render assertions passed.')
