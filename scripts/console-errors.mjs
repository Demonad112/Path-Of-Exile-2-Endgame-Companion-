/**
 * Collect console errors that are this app's fault.
 *
 * The character page now calls the ladder proxy on every import, and a machine
 * with no route to that host logs `Failed to load resource` for it. That is a
 * network condition, not a defect: the code already treats a failed ladder
 * fetch as "no sample", and the assessment panel says so in words. Failing a
 * render check on it would make these scripts pass or fail by connectivity.
 *
 * So a console message originating from a URL on another host is recorded
 * separately and reported, not failed on. Everything from this app's own
 * origin — including every uncaught exception, which has no cross-origin
 * excuse — still counts.
 *
 * The degradation itself is not taken on trust: `verify-phase2-ui.mjs` asserts
 * the damage half reads "not assessed" rather than being graded against
 * nothing, which is the behaviour a missing sample is supposed to produce.
 */

/**
 * @param {import('playwright').Page} page
 * @param {string} baseUrl the app's own origin
 * @returns {{ own: string[], external: string[] }} live arrays, filled as the page runs
 */
export function watchConsole(page, baseUrl) {
  const origin = new URL(baseUrl).origin
  const own = []
  const external = []

  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const from = message.location()?.url ?? ''
    let sameOrigin = true
    try {
      if (from) sameOrigin = new URL(from).origin === origin
    } catch {
      sameOrigin = true
    }
    ;(sameOrigin ? own : external).push(`${message.text()}${from ? ` (${from})` : ''}`)
  })

  // An uncaught exception is always this app's, wherever the script came from.
  page.on('pageerror', (err) => own.push(String(err)))

  return { own, external }
}
