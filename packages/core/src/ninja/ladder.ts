/**
 * Ladder reference figures — what the best builds of a class actually run.
 *
 * This exists to retire invented constants. The damage verdict used to be
 * graded against DPS_STRONG / DPS_OK / DPS_LOW, three thresholds chosen with no
 * evidence behind them. These are observed instead.
 *
 * ## What the data can and cannot support
 * Measured, not assumed: poe.ninja's builds search returns ONE page of 100 rows
 * and ignores every pagination parameter (skip, offset, page, from, start all
 * return the identical page). Those rows are the TOP of the ladder and are
 * essentially all level 100.
 *
 * So this supports "the best builds of your class run X" and does NOT support
 * "you are in the Nth percentile of players". Nothing here — and nothing
 * consuming it — is allowed to phrase it the second way, which is why the band
 * labels below talk about the sample rather than about players.
 *
 * The hop needs a proxy for two reasons: poe.ninja's builds endpoints moved to
 * protobuf with no published schema (the proxy decodes it schema-lessly), and
 * they carry the same CORS wall as the character endpoint. See
 * `services/ninja-proxy/api/ladder.js`.
 */

import type { FetchLike } from './client.js'

export interface LadderStat {
  /** Rows that carried this figure. */
  n: number
  p25: number
  median: number
  p75: number
  max: number
}

export interface LadderSummary {
  league: string
  /** Ascendancy the sample was filtered to, or null for all classes. */
  class: string | null
  snapshot: string
  /** Rows in the sample — one page, not the whole ladder. */
  sampleSize: number
  /** Builds matching the filter in total. NOT the sample size. */
  totalInPool: number | null
  levelRange: { min: number; max: number } | null
  dps: LadderStat | null
  ehp: LadderStat | null
  pool: LadderStat | null
  /** The proxy's own statement of what this sample is. Show it, don't restate it. */
  caveat: string
}

/**
 * poe.ninja's league slug, derived from the league name a character model
 * carries ("Runes of Aldur" -> "runesofaldur").
 */
export function leagueSlugOf(league: string): string {
  return league.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * How the sample is described in prose, e.g. "the top 100 Deadeyes in Runes of
 * Aldur". Built from what the response actually says rather than assumed.
 */
export function describeLadderSample(summary: LadderSummary): string {
  const who = summary.class ? `${summary.class}s` : 'builds'
  return `the top ${summary.sampleSize} ${who} in ${summary.league}`
}

/**
 * Where a value sits against the sampled builds.
 *
 * Deliberately a band label rather than a percentile: with a top-of-ladder
 * sample, "below p25" means "under the weakest of the best", which is a very
 * different claim from "bottom quartile of players".
 */
export type LadderBand = 'below' | 'p25' | 'median' | 'p75' | 'top'

export function bandFor(value: number, stat: LadderStat): LadderBand {
  if (value >= stat.max) return 'top'
  if (value >= stat.p75) return 'p75'
  if (value >= stat.median) return 'median'
  if (value >= stat.p25) return 'p25'
  return 'below'
}

export const BAND_LABEL: Readonly<Record<LadderBand, string>> = Object.freeze({
  below: 'below the sampled range',
  p25: 'in the lower quarter of the sample',
  median: 'around the middle of the sample',
  p75: 'in the upper quarter of the sample',
  top: 'at the top of the sample',
})

export interface LadderRequest {
  fetch: FetchLike
  /** Proxy base, e.g. `https://…vercel.app`. The hop cannot go direct. */
  proxyBaseUrl: string
  league: string
  /** Ascendancy to narrow the sample to, e.g. "Deadeye". */
  ascendancy?: string
  timeoutMs?: number
}

/**
 * Fetch top-of-ladder figures, optionally narrowed to one ascendancy.
 *
 * Best-effort by design: any failure returns null and the caller omits the
 * comparison rather than falling back to invented numbers. A build is never
 * graded against a threshold nobody measured.
 */
export async function fetchLadder(req: LadderRequest): Promise<LadderSummary | null> {
  const league = leagueSlugOf(req.league)
  if (!league) return null

  const params = new URLSearchParams({ league })
  if (req.ascendancy) params.set('class', req.ascendancy)
  const base = req.proxyBaseUrl.replace(/\/+$/, '')

  try {
    const signal =
      typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(req.timeoutMs ?? 15_000) : undefined
    const res = await req.fetch(`${base}/api/ladder?${params}`, signal ? { signal } : {})
    if (!res.ok) return null
    const data = (await res.json()) as LadderSummary | null
    // A response with neither figure carries nothing worth comparing against.
    return data && (data.dps || data.ehp) ? data : null
  } catch {
    return null
  }
}
