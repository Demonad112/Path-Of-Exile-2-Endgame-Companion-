/**
 * Verify the URL-import path end-to-end in a real browser.
 *
 * Covers everything the paste path does not: URL parsing, the proxy fetch, the
 * error branch on a 404, and rendering the result. Points at the local
 * stand-in proxy (scripts/mock-proxy.mjs) so it runs without external network
 * access and stays deterministic.
 *
 * Usage:
 *   node scripts/mock-proxy.mjs &
 *   NEXT_PUBLIC_NINJA_PROXY_BASE=http://127.0.0.1:3211 npm run build -w @poe2/web
 *   node scripts/verify-url-import.mjs
 */

import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { watchConsole } from './console-errors.mjs'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3210/character/'
const PROFILE = 'https://poe.ninja/poe2/profile/Demonad112-2589/runesofaldur/character/Athrynas'
const MISSING = 'https://poe.ninja/poe2/profile/Demonad112-2589/runesofaldur/character/NoSuchCharacter'

const explicitPath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch(existsSync(explicitPath) ? { executablePath: explicitPath } : {})
const failures = []

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' })
  const page = await context.newPage()
  const errors = watchConsole(page, baseUrl)
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  return { context, page, errors }
}

// --- happy path -------------------------------------------------------------
{
  const { context, page, errors } = await newPage()
  await page.getByLabel('poe.ninja character URL').fill(PROFILE)
  await page.getByRole('button', { name: 'Analyse' }).click()
  await page.getByRole('heading', { name: 'Athrynas', level: 2 }).waitFor({ timeout: 30_000 })

  // The ladder sample arrives after the first render and the analysis re-runs
  // with it, so wait for the scored verdict rather than racing it.
  await page.getByText('upper quarter of the top 100 Deadeyes').waitFor({ timeout: 30_000 })

  const body = await page.locator('body').innerText()
  for (const [what, text] of [
    ['lowest max hit', '3,808'],
    ['level', 'Level 86'],
    ['primary skill', 'Ice Shot'],
    ['weapon', 'Loath Bane'],
    ['EHP', '13,569'],
    // With a sample to grade against, the damage half must actually be scored —
    // this is the branch the paste path never reaches.
    ['scored damage', '0.50 of 0.50'],
    ['ladder caveat', 'Top-of-ladder sample only'],
  ]) {
    if (!body.includes(text)) failures.push(`url import: missing ${what} (${text})`)
  }
  if (/not assessed/.test(body)) failures.push('url import: damage was left unscored despite a ladder sample')
  if (errors.own.length) failures.push(`url import: console errors: ${errors.own.join(' | ')}`)

  await page.screenshot({ path: 'screenshots/url-import.jpg', fullPage: true, type: 'jpeg', quality: 70 })
  console.log('url import: analysed and rendered')
  await context.close()
}

// --- a character the proxy does not have ------------------------------------
{
  const { context, page } = await newPage()
  await page.getByLabel('poe.ninja character URL').fill(MISSING)
  await page.getByRole('button', { name: 'Analyse' }).click()
  const alert = page.locator('[role=alert]').first()
  await alert.waitFor({ timeout: 30_000 })
  const text = await alert.innerText()
  if (!/not found/i.test(text)) failures.push(`404 path: unhelpful message: ${text}`)
  console.log('url import: 404 surfaces a useful message')
  await context.close()
}

// --- a URL that isn't a poe.ninja profile -----------------------------------
{
  const { context, page } = await newPage()
  await page.getByLabel('poe.ninja character URL').fill('https://example.com/not-a-profile')
  await page.getByRole('button', { name: 'Analyse' }).click()
  const text = await page.locator('[role=alert]').first().innerText()
  if (!/does not look like/i.test(text)) failures.push(`bad url: unhelpful message: ${text}`)
  console.log('url import: unrecognised URL rejected before any network call')
  await context.close()
}

await browser.close()

if (failures.length) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\nURL import verified end-to-end.')
