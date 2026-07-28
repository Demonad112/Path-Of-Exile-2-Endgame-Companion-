'use client'

/**
 * Load the affix ladders once, for the whole page.
 *
 * This used to live inside the gear panel, which was fine until the
 * recommendations engine started needing it too — the panel that names the
 * wasted modifier and the list that ranks fixing it must agree, and two fetches
 * of the same 2 MB artifact to feed two components is how they drift.
 *
 * Loaded on demand rather than at page load: a reader who only wants the DPS
 * matrix should not pay 260 KB gzipped for affix data they never see.
 */

import { useEffect, useState } from 'react'
import { ModTiers, type ModTierData } from '@poe2/core'

const DATA_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/mod-tiers.json`

export type ModTiersState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; tiers: ModTiers }
  | { status: 'error'; message: string }

export function useModTiers(enabled: boolean): ModTiersState {
  const [state, setState] = useState<ModTiersState>({ status: 'idle' })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setState({ status: 'loading' })

    fetch(DATA_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(`the affix data returned ${res.status}`)
        return (await res.json()) as ModTierData
      })
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', tiers: new ModTiers(data) })
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: 'error', message: err.message })
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return state
}
