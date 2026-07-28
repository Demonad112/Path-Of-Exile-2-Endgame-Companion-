/**
 * Offline support.
 *
 * The point is the data artifacts: the passive tree is 604 KB and the affix
 * ladders 2 MB, and both are versioned build outputs that never change between
 * deploys. Refetching them on every visit is waste; serving them from cache
 * makes the tree and the gear panel work with no network at all.
 *
 * ## Two different caching strategies, on purpose
 *
 * **Data artifacts — cache first.** They are immutable for a given deploy, so a
 * cache hit is always correct and always faster.
 *
 * **Everything else — network first, cache as fallback.** The app shell must not
 * go stale: a user on an old cached bundle would see old analysis code against
 * new data and have no way to tell. Fresh when online, last-known when not.
 *
 * ## What is never cached
 *
 * Requests to the poe.ninja proxy. A character's stats change as they play, and
 * serving a stale sheet as if it were current is exactly the kind of quietly
 * wrong answer this project avoids. Offline means the tree and the last analysis
 * you loaded — not a stale character presented as fresh.
 */

const VERSION = 'v3'
const SHELL_CACHE = `poe2-shell-${VERSION}`
const DATA_CACHE = `poe2-data-${VERSION}`

/** Immutable per deploy. Cache-first. */
const DATA_FILES = ['/passive-tree.json', '/mod-tiers.json', '/monster-stats.json']

const isDataRequest = (url) => DATA_FILES.some((file) => url.pathname.endsWith(file))

/** Never cached — a character sheet must not be served stale. */
const isLiveRequest = (url) =>
  /ninja-proxy|poe\.ninja/.test(url.hostname) || url.pathname.includes('/api/')

self.addEventListener('install', (event) => {
  // Do not pre-fetch the data here: 2.7 MB on first visit, before the user has
  // asked for anything, on a connection that may be metered. They are cached on
  // first real use instead.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key.startsWith('poe2-') && !key.endsWith(VERSION)).map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (isLiveRequest(url)) return
  // Other origins are none of this worker's business.
  if (url.origin !== self.location.origin) return

  if (isDataRequest(url)) {
    event.respondWith(cacheFirst(request))
    return
  }

  event.respondWith(networkFirst(request))
})

async function cacheFirst(request) {
  const cache = await caches.open(DATA_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit

  const response = await fetch(request)
  // Only cache a real success. An opaque or error response cached here would
  // poison every later load with a failure that looks like data.
  if (response.ok && response.status === 200) cache.put(request, response.clone())
  return response
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok && response.status === 200) cache.put(request, response.clone())
    return response
  } catch (err) {
    const hit = await cache.match(request)
    if (hit) return hit
    // Navigations fall back to the app shell so a deep link still opens offline.
    if (request.mode === 'navigate') {
      const shell = await cache.match('./')
      if (shell) return shell
    }
    throw err
  }
}
