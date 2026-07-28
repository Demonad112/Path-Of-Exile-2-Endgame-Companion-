/**
 * poe.ninja profile URL parsing.
 *
 * Adapted from the working implementation in Demonad112/Poe2-endgame
 * (src/lib/characterImport/parseProfileUrl.ts), which already handles the URL
 * shapes poe.ninja actually emits.
 *
 * League SLUGS are what the API wants, not display names.
 */

export interface ProfileRef {
  account: string
  /** League slug, e.g. `runesofaldur`. Null when the URL omitted it. */
  leagueSlug: string | null
  character: string
}

/** Display name -> API slug. Verified against /poe2/api/data/index-state. */
export const LEAGUE_SLUGS: Readonly<Record<string, string>> = Object.freeze({
  'runes of aldur': 'runesofaldur',
  'hc runes of aldur': 'runesofaldurhc',
  'ssf runes of aldur': 'runesofaldurssf',
  'fate of the vaal': 'vaal',
  'hc fate of the vaal': 'vaalhc',
  abyss: 'abyss',
  dawn: 'dawn',
  standard: 'standard',
  hardcore: 'hardcore',
})

export function leagueSlug(nameOrSlug: string): string {
  const key = nameOrSlug.trim().toLowerCase()
  return LEAGUE_SLUGS[key] ?? key.replace(/[^a-z0-9]/g, '')
}

const PATTERNS: Array<{ re: RegExp; order: Array<keyof ProfileRef> }> = [
  // /poe2/profile/{account}/{league}/character/{name}
  {
    re: /poe\.ninja\/poe2\/profile\/([^/?#\s]+)\/([^/?#\s]+)\/character\/([^/?#\s]+)/,
    order: ['account', 'leagueSlug', 'character'],
  },
  // /poe2/profile/{account}/character/{name}
  { re: /poe\.ninja\/poe2\/profile\/([^/?#\s]+)\/character\/([^/?#\s]+)/, order: ['account', 'character'] },
  // /poe2/builds/{league}/character/{account}/{name}
  {
    re: /poe\.ninja\/poe2\/builds\/([^/?#\s]+)\/character\/([^/?#\s]+)\/([^/?#\s]+)/,
    order: ['leagueSlug', 'account', 'character'],
  },
  // /poe2/builds/character/{account}/{name}
  { re: /poe\.ninja\/poe2\/builds\/character\/([^/?#\s]+)\/([^/?#\s]+)/, order: ['account', 'character'] },
]

/**
 * Parse any recognised poe.ninja profile URL. Returns null rather than a
 * partially-guessed reference when nothing matches.
 */
export function parseProfileUrl(input: string): ProfileRef | null {
  if (typeof input !== 'string' || !input.trim()) return null
  const text = input.trim()

  for (const { re, order } of PATTERNS) {
    const m = re.exec(text)
    if (!m) continue
    const ref: ProfileRef = { account: '', leagueSlug: null, character: '' }
    order.forEach((key, i) => {
      const raw = m[i + 1]
      if (raw === undefined) return
      const value = safeDecode(raw)
      if (key === 'leagueSlug') ref.leagueSlug = leagueSlug(value)
      else ref[key] = value
    })
    if (ref.account && ref.character) return ref
  }
  return null
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * poe.ninja renders accounts as `Name#1234` but the API path wants
 * `Name-1234`.
 */
export function normalizeAccount(account: string): string {
  return account.trim().replace('#', '-')
}
