/**
 * Verify the gear panels actually RENDER, by driving a real browser.
 *
 * The generic screenshot script asserts the headline numbers reached the page.
 * This one goes further into the gear feature specifically: it expands an item
 * card and checks the tier data is in the DOM, because "the component compiles"
 * and "the reader can see a tier" are different claims.
 *
 * Usage: node scripts/verify-gear-ui.mjs [baseUrl] [outDir]
 */

import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const baseUrl = process.argv[2] ?? 'http://localhost:3210'
const outDir = process.argv[3] ?? join(here, '..', 'screenshots')
const fixture = readFileSync(join(here, '..', 'packages', 'core', 'test', 'fixtures', 'athrynas-v43.json'), 'utf8')

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

  // Paste the real character in, the same way a user would.
  await page.getByRole('tab', { name: 'Paste data' }).click()
  await page.getByLabel('Character model JSON').fill(fixture)
  await page.getByRole('button', { name: 'Analyse pasted data' }).click()
  await page.getByRole('heading', { name: 'Athrynas', level: 2 }).waitFor({ timeout: 20_000 })

  // --- the gear panel loads its own data, so wait for it specifically --------
  const gearPanel = page.locator('section', { has: page.getByRole('heading', { name: 'Gear modifiers' }) })
  await gearPanel.waitFor({ timeout: 20000 })
  await page.waitForFunction(
    () => !document.body.innerText.includes('Loading the affix data'),
    { timeout: 30000 },
  )

  // --- expand the bow and read its tiers ------------------------------------
  const bowCard = gearPanel.getByRole('button', { name: /Loath Bane/ })
  if (!(await bowCard.count())) {
    failures.push('the bow does not appear in the gear panel')
  } else {
    await bowCard.scrollIntoViewIfNeeded()
    await bowCard.click()
    await page.waitForTimeout(200)

    const text = await gearPanel.innerText()

    // The real values, asserted in the RENDERED DOM rather than inferred.
    if (!/T2\/8/.test(text)) failures.push('expanded bow does not show the T2/8 physical damage tier')
    if (!/ilvl 76/.test(text)) failures.push('expanded bow does not show its item level')
    if (!/needs an item level 82 base/.test(text)) {
      failures.push('bow does not explain that T1 physical damage needs an ilvl 82 base')
    }
    if (!/achievable on this item/i.test(text)) {
      failures.push('bow does not show the reachable-upgrade case (T1 dexterity at ilvl 74)')
    }
    // The implicit used to render as its raw mod id.
    if (/RingImplicitFireResistance/.test(await page.locator('body').innerText())) {
      failures.push('an implicit is rendering as its raw mod id instead of readable text')
    }
    console.log('gear panel: bow expanded, tiers and ilvl gating rendered')
  }

  await gearPanel.screenshot({ path: join(outDir, 'gear-modifiers.png') })

  // --- the findings list must become concrete once the affix data lands ------
  // It renders before the 2 MB artifact arrives, so the enrichment is a second
  // pass. If it never happened, the reader is left with "source resistance from
  // gear" while the panel below names the exact item.
  const findings = page.locator('section', { has: page.getByRole('heading', { name: /recommend|finding/i }) })
  if (await findings.count()) {
    await findings.first().scrollIntoViewIfNeeded()
    const fText = await findings.first().innerText()
    if (!/Hypnotic Halo|of Bameth/.test(fText)) {
      failures.push(`findings did not become concrete after the affix data loaded: ${fText.slice(0, 200)}`)
    }
    if (/Raise chaos resistance by 57% to reach/.test(fText)) {
      failures.push('the vague chaos finding survived alongside the specific one')
    }
    await findings.first().screenshot({ path: join(outDir, 'findings-enriched.png') })
    console.log('findings: named the item and affix after the affix data loaded')
  } else {
    failures.push('the recommendations panel did not render')
  }

  // --- resistance swaps -----------------------------------------------------
  const swapPanel = page.locator('section', { has: page.getByRole('heading', { name: 'Resistance rebalancing' }) })
  if (await swapPanel.count()) {
    const swapText = await swapPanel.innerText()
    if (!/above the cap/.test(swapText)) failures.push('swap panel does not justify the swap by overcap')
    if (!/closes \d+ of the gap/.test(swapText)) failures.push('swap panel does not quantify what a candidate closes')
    await swapPanel.scrollIntoViewIfNeeded()
    await swapPanel.screenshot({ path: join(outDir, 'gear-swaps.png') })
    console.log('swap panel: overcap justification and quantified candidates rendered')
  } else {
    failures.push('the resistance rebalancing panel did not render')
  }

  // --- headroom, and the refusal to name a map tier -------------------------
  const headroom = page.locator('section', { has: page.getByRole('heading', { name: 'Survivability by map tier' }) })
  await headroom.waitFor({ timeout: 15000 })
  const hText = await headroom.innerText()
  if (!/3,808/.test(hText) || !/chaos/.test(hText)) {
    failures.push(`headroom panel missing the real lowest max hit: ${hText.slice(0, 120)}`)
  }
  if (!/T16/.test(hText) || !/T1\b/.test(hText)) failures.push('headroom panel does not render the waystone tiers')
  if (!/level 82/.test(hText) || !/level 85/.test(hText)) {
    failures.push("headroom panel does not render Path of Building's boss reference levels")
  }
  if (!/upper bound, not a safety verdict/.test(hText)) {
    failures.push('headroom panel presents the base-monster figure without qualifying it')
  }
  await headroom.scrollIntoViewIfNeeded()
  await headroom.screenshot({ path: join(outDir, 'headroom.png') })
  console.log('headroom panel: tiers, boss levels and caveats all rendered')

  // --- the detail checks ----------------------------------------------------
  const audit = page.locator('section', { has: page.getByRole('heading', { name: 'Detail checks' }) })
  await audit.waitFor({ timeout: 15000 })
  await audit.scrollIntoViewIfNeeded()
  const aText = await audit.innerText()

  // Jewel affixes are RePoE domain `misc`; filtering to `item` left all three
  // jewels invisible, so their presence IS the regression test.
  if (!/Eagle Scar|Glyph Eye|Rapture Bloom/.test(aText)) failures.push('jewels did not render')
  if (!/increased Damage with Bows/.test(aText)) failures.push('jewel modifier text did not resolve')
  if (/Jewel[A-Z]/.test(aText)) failures.push('a jewel modifier rendered as its raw mod id')

  if (!/Another copy of this gem is at 20%/.test(aText)) {
    failures.push('gem quality check did not point at the higher-quality copy')
  }
  if (!/47 against 45 required/.test(aText)) failures.push('attribute headroom did not render the real numbers')
  if (!/unequippable/.test(aText)) failures.push('a 2-point strength margin was not flagged as tight')
  if (!/80 reserved of 159/.test(aText)) failures.push('spirit reservation did not render')
  // Idle spirit is a number, not a verdict.
  if (!/this is a number, not a verdict/.test(aText)) failures.push('idle spirit is presented without its caveat')

  await audit.screenshot({ path: join(outDir, 'audit.png') })
  console.log('detail checks: jewels, gem quality, attribute headroom and spirit all rendered')

  // --- no horizontal overflow at mobile width -------------------------------
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  const overflow = await page.evaluate(() => {
    const wide = [...document.querySelectorAll('section')].filter((el) => el.scrollWidth > document.documentElement.clientWidth)
    return wide.map((el) => `${el.querySelector('h2')?.textContent ?? '?'}: ${el.scrollWidth}px`)
  })
  if (overflow.length) failures.push(`horizontal overflow at 390px: ${overflow.join(', ')}`)
  else console.log('mobile 390px: no panel overflows the viewport')

  await page.screenshot({ path: join(outDir, 'gear-mobile.png'), fullPage: false })

  if (consoleErrors.length) failures.push(`console errors: ${consoleErrors.slice(0, 3).join(' | ')}`)
} finally {
  await browser.close()
}

if (failures.length) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\nGear UI verified in a real browser.')
