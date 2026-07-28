/**
 * poe.ninja character proxy.
 *
 * WHY THIS EXISTS
 * Measured 2026-07-24: poe.ninja's PoE2 API sends NO `Access-Control-Allow-Origin`
 * header on any endpoint, and `OPTIONS` returns 405. A browser therefore cannot
 * call it directly at all. Public CORS proxies don't help either, because the
 * first hop is a Server-Sent Events stream that they buffer and choke on.
 *
 * So this runs the two-step SSE -> model fetch server-side and returns the raw
 * `{type, charModel}` JSON with permissive CORS headers.
 *
 * All data handled here is public. There is no auth, no secret, and nothing is
 * stored. Deploy it once and point NEXT_PUBLIC_NINJA_PROXY_BASE at it.
 *
 * Runtime-agnostic: works as a Vercel serverless function as-is. See
 * ../README.md for the Cloudflare Workers variant.
 */

const NINJA = 'https://poe.ninja'
const TIMEOUT_MS = 20_000

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

/**
 * Read the first `data:` frame from an SSE stream and return its `version`.
 *
 * The stream never closes on its own, so we read incrementally and abort the
 * moment we have what we need. Buffering the whole body would hang.
 */
async function readVersion(url, signal) {
  const upstream = await fetch(url, { signal, headers: { accept: 'text/event-stream' } })
  if (upstream.status === 404) return { error: 'not-found' }
  if (!upstream.ok || !upstream.body) return { error: `upstream ${upstream.status}` }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const line = buffer.split('\n').find((l) => l.startsWith('data:'))
      if (!line) continue

      try {
        const parsed = JSON.parse(line.slice(5).trim())
        if (typeof parsed.version === 'number') return { version: parsed.version }
        // poe.ninja answers with a frame carrying no version when the profile
        // is private or has never been indexed.
        return { error: 'not-found' }
      } catch {
        // Frame split across chunks — keep reading.
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }

  return { error: 'no version frame' }
}

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' })

  const { account, league, character } = req.query ?? {}
  if (!account || !league || !character) {
    return res.status(400).json({ error: 'account, league and character are all required.' })
  }

  const e = encodeURIComponent
  // poe.ninja renders accounts as Name#1234 but its API path wants Name-1234.
  const acct = String(account).replace('#', '-')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const versionResult = await readVersion(
      `${NINJA}/poe2/api/events/character/${e(acct)}/${e(league)}/${e(character)}`,
      controller.signal,
    )

    if (versionResult.error === 'not-found') {
      return res
        .status(404)
        .json({ error: 'poe.ninja has no indexed record of that character. Check the profile is public.' })
    }
    if (versionResult.error) {
      return res.status(502).json({ error: `Could not read the character version (${versionResult.error}).` })
    }

    const modelUrl = `${NINJA}/poe2/api/profile/characters/${e(acct)}/${e(league)}/${e(character)}/model/${versionResult.version}`
    const model = await fetch(modelUrl, { signal: controller.signal })
    if (model.status === 404) return res.status(404).json({ error: 'Character model not found.' })
    if (!model.ok) return res.status(502).json({ error: `poe.ninja returned ${model.status} for the model.` })

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600')
    return res.status(200).send(await model.text())
  } catch (err) {
    const aborted = err?.name === 'AbortError'
    return res
      .status(aborted ? 504 : 502)
      .json({ error: aborted ? 'poe.ninja took too long to respond.' : `Upstream request failed: ${err?.message}` })
  } finally {
    clearTimeout(timer)
  }
}
