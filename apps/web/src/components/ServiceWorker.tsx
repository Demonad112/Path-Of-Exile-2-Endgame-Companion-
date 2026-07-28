'use client'

/**
 * Register the offline worker.
 *
 * Deliberately silent: registration failing is not something a reader can act
 * on, and an error banner about caching would be noise over the analysis they
 * came for. It is logged for anyone with devtools open.
 *
 * Registration is skipped on localhost so a stale worker never serves an old
 * bundle during development — the single most confusing failure mode a service
 * worker has.
 */

import { useEffect } from 'react'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return

    navigator.serviceWorker
      .register(`${BASE}/sw.js`, { scope: `${BASE}/` })
      .catch((err: Error) => console.warn('Offline support unavailable:', err.message))
  }, [])

  return null
}
