/**
 * Verify the analysis-changing panels actually RENDER, by driving a real browser.
 *
 * These five features change what the tool CONCLUDES rather than how it looks,
 * so "the component compiles" and "the reader sees the conclusion" are further
 * apart than usual. Each assertion below reads a number out of the rendered DOM
 * and checks it against the figure the core computes for the same character.
 *
 * Deliberately silent on the ladder comparison: that hop goes to a live proxy,
 * so asserting on it would make this script fail for a network reason rather
 * than a code one. Its absence is itself checked instead — the damage half must
 * read "not assessed" rather than being graded against nothing.
 *
 * Usage: node scripts/verify-phase2-ui.mjs [baseUrl] [outDir]
 */

import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { watchConsole } from './console-errors.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3210'
const outDir = process.argv[3] ?? join(here, '..', 'screenshots')
const fixture = readFileSync(join(here, '..', 'packages', 'core', 'test', 'fixtures', 'athrynas-v43.json'), 'utf8')

const failures = []
mkdirSync(outDir, { recursive: true })

const explicitPath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch(existsSync(explicitPath) ? { executablePath: explicitPath } : {})

/** A section located by its heading, the way a reader finds it. */
function panel(page, name) {
  return page.locator('section', { has: page.getByRole('heading', { name, exact: true }) })
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const consoleErrors = watchConsole(page, baseUrl)

  await page.goto(`${baseUrl}/character/`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('tab', { name: 'Paste data' }).click()
  await page.getByLabel('Character model JSON or Path of Building code').fill(fixture)
  await page.getByRole('button', { name: 'Analyse pasted data' }).click()
  await page.getByRole('heading', { name: 'Athrynas', level: 2 }).waitFor({ timeout: 20_000 })

  // --- assessment -----------------------------------------------------------
  const assessment = panel(page, 'Assessment')
  await assessment.waitFor({ timeout: 20_000 })
  // The tree loads asynchronously and the analysis re-runs when it lands, so
  // wait for a figure that only exists once it has.
  await page.waitForFunction(() => !document.body.innerText.includes('Loading passive tree'), { timeout: 30_000 })

  const assessmentText = await assessment.innerText()
  // No ladder sample, so the headline is the interval defence alone justifies
  // rather than a single letter. `defence / 0.5` used to render a confident C
  // here, and on a build with perfect defences it rendered an A.
  if (!/D[–-]B/.test(assessmentText) || !/0\.15[–-]0\.65/.test(assessmentText)) {
    failures.push(`assessment did not render the D-B range: ${assessmentText.slice(0, 200)}`)
  }
  // Both one-shot risks, not just the lowest. Naming only chaos hid the
  // physical gap, which is the more dangerous of the two in maps.
  if (!/Chaos 3,808/.test(assessmentText) || !/Physical 4,264/.test(assessmentText)) {
    failures.push('assessment did not name both one-shot risks')
  }
  if (!/Cold 74% of 75%/.test(assessmentText)) {
    failures.push('assessment did not name the uncapped cold resistance against its own maximum')
  }
  // No ladder sample reached the page, so damage must be absent, not zero.
  if (!/not assessed/.test(assessmentText)) {
    failures.push('the damage half was scored despite no ladder sample')
  }
  if (!/combined life \+ energy shield \+ ward/.test(assessmentText)) {
    failures.push('the pool is not labelled by what it actually contains')
  }
  await assessment.screenshot({ path: join(outDir, 'assessment.png') })
  console.log('assessment: D-B at 0.15-0.65, both one-shot risks named, damage left unassessed')

  // --- Path of Building configuration caveat --------------------------------
  const damage = panel(page, 'Damage')
  const damageText = await damage.innerText()
  if (!/not a boss/.test(damageText) || !/all buffs and charges assumed active/.test(damageText)) {
    failures.push(`damage panel did not state what the figure was computed under: ${damageText.slice(-300)}`)
  }
  if (!/6 conditions hold/.test(damageText)) {
    failures.push('damage panel did not count the conditionals the figure assumes')
  }
  if (!/Not a single-target number/.test(damageText)) {
    failures.push('damage panel did not warn against reading a non-boss figure as pinnacle damage')
  }
  await damage.screenshot({ path: join(outDir, 'damage-config.png') })
  console.log('damage: non-boss, EFFECTIVE buffs and 6 conditionals stated on the figure')

  // --- per-item attribution -------------------------------------------------
  const attribution = panel(page, 'What each item is holding up')
  await attribution.scrollIntoViewIfNeeded()
  const ring = attribution.getByRole('button', { name: /Gale Turn/ })
  if (!(await ring.count())) {
    failures.push('the ring carrying resistances does not appear in the attribution panel')
  } else {
    await ring.click()
    await page.waitForTimeout(150)
    const text = await attribution.innerText()
    // The distinction the feature exists for, both halves visible on one item.
    if (!/overcap absorbs all 22%/.test(text)) {
      failures.push('the overcapped contribution is not shown as costing nothing')
    }
    if (!/48%/.test(text) || !/breaks cap/.test(text)) {
      failures.push('the cap-breaking contribution is not shown falling to 48%')
    }
    await attribution.screenshot({ path: join(outDir, 'attribution.png') })
    console.log('attribution: fire costs nothing behind overcap, lightning drops 75% to 48% and breaks cap')
  }

  // --- progress -------------------------------------------------------------
  const progress = panel(page, 'Progress')
  const progressText = await progress.innerText()
  if (!/1 snapshot/.test(progressText)) {
    failures.push(`the first import was not recorded: ${progressText.slice(0, 200)}`)
  }
  // One point is not a trend, and must not be drawn as one.
  if (!/not a trend|recorded for the first time/.test(progressText)) {
    failures.push('progress compared a single snapshot against an invented baseline')
  }
  console.log('progress: first import recorded, nothing compared against it yet')

  // --- the page still behaves ----------------------------------------------
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  if (overflow) failures.push('the page scrolls horizontally at 1280px')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(200)
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  if (mobileOverflow) failures.push('the page scrolls horizontally at 390px')

  if (consoleErrors.own.length) failures.push(`console errors: ${consoleErrors.own.slice(0, 3).join(' | ')}`)
  console.log('layout: no horizontal overflow at 1280px or 390px, no console errors')
  if (consoleErrors.external.length) {
    // Expected on a machine with no route to the ladder proxy. The assertion
    // that matters — the damage half reading "not assessed" — already passed.
    console.log(`  (${consoleErrors.external.length} third-party request failure(s), which the page degrades around)`)
  }
} finally {
  await browser.close()
}

if (failures.length) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\nPhase 2 panels verified in a real browser.')
