/**
 * A stand-in for services/ninja-proxy that serves the committed fixture.
 *
 * Lets the browser exercise the whole URL-import path — parse URL, fetch via
 * proxy, analyse, render — without external network access. Used by
 * `scripts/verify-url-import.mjs`.
 *
 * Usage: node scripts/mock-proxy.mjs [port]
 */

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const port = Number(process.argv[2] ?? 3211)
const fixture = readFileSync(join(here, '..', 'packages/core/test/fixtures/athrynas-v43.json'), 'utf8')

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }

  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)

  // The ladder sample the build assessment grades damage against. Quartiles are
  // placed so the fixture's 109,859 DPS lands in the upper quarter, which makes
  // the scored branch observable — with no sample at all the offence half is
  // left unscored, and a verification that only ever saw that branch would
  // never exercise the grading.
  if (url.pathname.startsWith('/api/ladder')) {
    const league = url.searchParams.get('league')
    if (!league) {
      res.writeHead(400, { 'content-type': 'application/json' }).end('{"error":"league is required"}')
      return
    }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(
      JSON.stringify({
        league,
        class: url.searchParams.get('class'),
        snapshot: 'mock',
        sampleSize: 100,
        totalInPool: 4213,
        levelRange: { min: 98, max: 100 },
        dps: { n: 100, p25: 20000, median: 50000, p75: 100000, max: 3000000 },
        ehp: null,
        pool: null,
        caveat:
          "Top-of-ladder sample only. poe.ninja's builds search returns a single page and ignores pagination, so these figures describe the highest-ranked builds matching the filter, not the player population.",
      }),
    )
    return
  }

  if (!url.pathname.startsWith('/api/character')) {
    res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}')
    return
  }

  // Mirror the real contract: all three parameters are required.
  for (const key of ['account', 'league', 'character']) {
    if (!url.searchParams.get(key)) {
      res.writeHead(400, { 'content-type': 'application/json' }).end(`{"error":"${key} is required"}`)
      return
    }
  }

  // Only the fixture's character is known, so anything else is a real 404 —
  // which also exercises the app's not-found handling.
  if (url.searchParams.get('character') !== 'Athrynas') {
    res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"Character not found."}')
    return
  }

  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(fixture)
}).listen(port, '127.0.0.1', () => console.log(`mock ninja-proxy on http://127.0.0.1:${port}`))
