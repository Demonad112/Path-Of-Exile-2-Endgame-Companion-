'use client'

import { useState } from 'react'
import { NinjaClient, NinjaError, looksLikePobCode, parseProfileUrl } from '@poe2/core'
import { PROXY_BASE } from '@/lib/proxy'

const EXAMPLE = 'https://poe.ninja/poe2/profile/Demonad112-2589/runesofaldur/character/Athrynas'

export type ImportResult =
  | { ok: true; kind: 'ninja'; data: unknown }
  /** A Path of Building export code. Fewer stats, all of them real. */
  | { ok: true; kind: 'pob'; code: string }
  | { ok: false; error: string; canPaste: boolean }

export function ImportBar({
  onResult,
  busy,
  setBusy,
}: {
  onResult: (r: ImportResult) => void
  busy: boolean
  setBusy: (b: boolean) => void
}) {
  const [mode, setMode] = useState<'url' | 'paste'>('url')
  const [url, setUrl] = useState('')
  const [paste, setPaste] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function importUrl(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const ref = parseProfileUrl(url)
    if (!ref) {
      setError('That does not look like a poe.ninja PoE2 character URL. Expected something like the example below.')
      return
    }
    if (!ref.leagueSlug) {
      setError('That URL has no league in it. Use the full profile URL, which includes the league.')
      return
    }
    setBusy(true)
    try {
      const client = new NinjaClient({ fetch: (i, init) => fetch(i, init), proxyBaseUrl: PROXY_BASE })
      const data = await client.fetchCharacter(ref.account, ref.leagueSlug, ref.character)
      onResult({ ok: true, kind: 'ninja', data })
    } catch (err) {
      const message =
        err instanceof NinjaError
          ? err.message
          : `Import failed: ${(err as Error).message ?? 'unknown error'}`
      setError(message)
      onResult({ ok: false, error: message, canPaste: true })
    } finally {
      setBusy(false)
    }
  }

  function importPaste(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const text = paste.trim()
    if (!text) {
      setError('Paste a character model JSON or a Path of Building export code.')
      return
    }
    // A Path of Building code is a second real source, not a lesser one: it
    // carries 106 computed PlayerStat values including every maximum-hit-taken
    // figure. This used to be rejected on the false claim that it carried none.
    if (looksLikePobCode(text)) {
      onResult({ ok: true, kind: 'pob', code: text })
      return
    }

    try {
      onResult({ ok: true, kind: 'ninja', data: JSON.parse(text) })
    } catch {
      setError(
        'That is neither valid JSON nor a Path of Building export code. Paste either the full response from ' +
          'poe.ninja’s character model endpoint, or a Path of Building code copied with its Share button.',
      )
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface-raised p-4 sm:p-5">
      <div
        className="mb-3 flex gap-1 text-xs"
        role="tablist"
        aria-label="Import method"
      >
        {(['url', 'paste'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            type="button"
            onClick={() => {
              setMode(m)
              setError(null)
            }}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              mode === m ? 'bg-surface-sunken text-ink' : 'text-ink-mute hover:text-ink-dim'
            }`}
          >
            {m === 'url' ? 'poe.ninja URL' : 'Paste data'}
          </button>
        ))}
      </div>

      {mode === 'url' ? (
        <form onSubmit={importUrl} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://poe.ninja/poe2/profile/Account-1234/league/character/Name"
            aria-label="poe.ninja character URL"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-mute"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-[#0b0b0d] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Analysing…' : 'Analyse'}
          </button>
        </form>
      ) : (
        <form onSubmit={importPaste} className="flex flex-col gap-2">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={4}
            placeholder='Paste a character model JSON, or a Path of Building export code'
            aria-label="Character model JSON or Path of Building code"
            className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-xs text-ink placeholder:text-ink-mute"
          />
          <button
            type="submit"
            disabled={busy}
            className="self-start rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-[#0b0b0d] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Analyse pasted data
          </button>
        </form>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-xs leading-relaxed text-danger">
          {error}
        </p>
      ) : null}

      <p className="mt-2 text-[11px] leading-relaxed text-ink-mute">
        {mode === 'url' ? (
          <>
            Example:{' '}
            <button
              type="button"
              onClick={() => setUrl(EXAMPLE)}
              className="text-accent underline underline-offset-2 transition-opacity hover:opacity-80"
            >
              {EXAMPLE}
            </button>
            {' '}
            — fetched through a small proxy, because poe.ninja blocks direct browser requests. If it is unavailable,
            paste the data instead.
          </>
        ) : (
          'Works entirely in your browser with no server. Everything below is computed locally from what you paste.'
        )}
      </p>
    </div>
  )
}
