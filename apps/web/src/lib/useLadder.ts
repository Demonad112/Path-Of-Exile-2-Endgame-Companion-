'use client'

/**
 * Fetch the ladder sample this character's damage is graded against.
 *
 * Entirely best-effort. Failure is silent by design: the assessment already
 * knows how to leave offence unscored and say so, which is strictly better than
 * grading damage against a threshold nobody measured. So this hook never
 * surfaces an error — it just returns null, and the assessment explains itself.
 */

import { useEffect, useState } from 'react'
import { fetchLadder, type LadderSummary } from '@poe2/core'
import { PROXY_BASE } from './proxy'

export function useLadder(league: string | null, ascendancy: string | null): LadderSummary | null {
  const [summary, setSummary] = useState<LadderSummary | null>(null)

  useEffect(() => {
    if (!league) {
      setSummary(null)
      return
    }
    let cancelled = false
    void fetchLadder({
      fetch: (input, init) => fetch(input, init),
      proxyBaseUrl: PROXY_BASE,
      league,
      ...(ascendancy ? { ascendancy } : {}),
    }).then((next) => {
      if (!cancelled) setSummary(next)
    })
    return () => {
      cancelled = true
    }
  }, [league, ascendancy])

  return summary
}
