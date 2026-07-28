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
