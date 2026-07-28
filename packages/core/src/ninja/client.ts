/**
 * poe.ninja PoE2 API client.
 *
 * The core stays pure: `fetch` is INJECTED, never imported. That is what lets
 * the MCP server call poe.ninja directly (server-side, no CORS) while the web
 * app routes the same code through a proxy, with both sharing this logic.
 *
 * ## Why a proxy is needed in the browser
 * Measured 2026-07-24: poe.ninja sends NO `Access-Control-Allow-Origin` header
 * on any /poe2/api endpoint, and `OPTIONS` returns 405. A browser cannot call
 * it directly at all. Public CORS proxies additionally choke on the SSE first
 * hop because they buffer the stream.
 *
 * ## The two-step fetch
 * Every character read is: SSE endpoint -> `data: {"version":N}` -> then the
 * model endpoint at that version. The version is not guessable.
 */

import type { CharModelResponse } from '../model/types.js'
import { normalizeAccount } from './url.js'

export interface ResponseLike {
  ok: boolean
  status: number
  text(): Promise<string>
  json(): Promise<unknown>
  /** Present on real fetch. Required to read an SSE stream without hanging. */
  body?: ReadableStream<Uint8Array> | null
}

export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<ResponseLike>

export type NinjaErrorReason = 'not-found' | 'network' | 'cors' | 'bad-response' | 'timeout'

export class NinjaError extends Error {
  override name = 'NinjaError'
  constructor(
    readonly reason: NinjaErrorReason,
    message: string,
  ) {
    super(message)
  }
}

export interface NinjaClientOptions {
  fetch: FetchLike
  /**
   * Base for direct poe.ninja calls. Server-side only — a browser cannot use
   * this (no CORS).
   */
  baseUrl?: string
  /**
   * Proxy base for browser use. When set, character reads go to
   * `{proxyBaseUrl}/api/character?account=&league=&character=` and the SSE hop
   * happens server-side inside the proxy.
   */
  proxyBaseUrl?: string
  timeoutMs?: number
}

const DEFAULT_BASE = 'https://poe.ninja'
const DEFAULT_TIMEOUT = 20_000

/** Extract the payload of the first `data:` line, or null if the stream ends. */
function firstDataLine(buffer: string): string | null {
  const line = buffer.split('\n').find((l) => l.startsWith('data:'))
  return line ? line.slice(5).trim() : null
}

/**
 * Read a never-closing SSE stream just far enough to get its first data frame,
 * then cancel it. Cancelling matters: leaving the reader open holds the socket
 * for the life of the process.
 */
async function readFirstDataFrame(body: ReadableStream<Uint8Array>): Promise<string | null> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return firstDataLine(buffer)
      buffer += decoder.decode(value, { stream: true })
      const frame = firstDataLine(buffer)
      // Only accept a frame once it is complete — it may be split across chunks.
      if (frame !== null && buffer.includes('\n')) return frame
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
}

/** Fallback for fetch implementations that expose no body stream (test doubles). */
async function readFirstDataFrameFromText(res: ResponseLike): Promise<string | null> {
  return firstDataLine(await res.text())
}

export class NinjaClient {
  private readonly fetch: FetchLike
  private readonly baseUrl: string
  private readonly proxyBaseUrl: string | null
  private readonly timeoutMs: number

  constructor(opts: NinjaClientOptions) {
    this.fetch = opts.fetch
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '')
    this.proxyBaseUrl = opts.proxyBaseUrl ? opts.proxyBaseUrl.replace(/\/+$/, '') : null
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT
  }

  private async get(url: string): Promise<ResponseLike> {
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(this.timeoutMs) : undefined
    try {
      return await this.fetch(url, signal ? { signal } : {})
    } catch (err) {
      const name = (err as { name?: string })?.name
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new NinjaError('timeout', `Request to ${url} timed out after ${this.timeoutMs}ms.`)
      }
      // A fetch that never yields a Response gives no status to inspect. The
      // cause differs by mode, so don't assert one: blaming CORS when the
      // import service is simply down sends the user to fix the wrong thing.
      throw new NinjaError(
        'cors',
        this.proxyBaseUrl
          ? 'Could not reach the import service. It may be down or unreachable from your network — pasting the character data works without it.'
          : `Could not reach ${url}. In a browser this is poe.ninja's CORS policy, which requires a proxy; on a server it is a network failure.`,
      )
    }
  }

  /**
   * Read the `version` number from an SSE endpoint.
   *
   * CRITICAL: this stream never closes on its own — poe.ninja holds it open and
   * emits keep-alive frames indefinitely. Awaiting the whole body (`res.text()`)
   * therefore hangs until the request times out. Read incrementally instead and
   * stop the moment the first `data:` frame arrives.
   */
  private async readVersion(url: string): Promise<number> {
    const res = await this.get(url)
    if (res.status === 404) throw new NinjaError('not-found', 'poe.ninja has no record of that account or character.')
    if (!res.ok) throw new NinjaError('bad-response', `poe.ninja returned ${res.status} for the version stream.`)

    const frame = res.body ? await readFirstDataFrame(res.body) : await readFirstDataFrameFromText(res)
    if (frame === null) throw new NinjaError('bad-response', 'The version stream carried no data frame.')

    let parsed: { version?: unknown }
    try {
      parsed = JSON.parse(frame) as { version?: unknown }
    } catch {
      throw new NinjaError('bad-response', 'The version frame was not valid JSON.')
    }
    if (typeof parsed.version !== 'number') {
      throw new NinjaError('not-found', 'poe.ninja returned no version — the profile may be private or unindexed.')
    }
    return parsed.version
  }

  /** List an account's characters. Server-side only (no proxy route for this). */
  async listCharacters(account: string): Promise<unknown[]> {
    const acct = encodeURIComponent(normalizeAccount(account))
    const version = await this.readVersion(`${this.baseUrl}/poe2/api/events/characters/${acct}`)
    const res = await this.get(`${this.baseUrl}/poe2/api/profile/characters/${acct}/${version}`)
    if (!res.ok) throw new NinjaError('bad-response', `poe.ninja returned ${res.status} for the character list.`)
    const json = await res.json()
    return Array.isArray(json) ? json : []
  }

  /**
   * Fetch one character's full model.
   *
   * Uses the proxy when configured (browser), otherwise the direct two-step
   * fetch (server).
   */
  async fetchCharacter(account: string, league: string, character: string): Promise<CharModelResponse> {
    const acct = normalizeAccount(account)

    if (this.proxyBaseUrl) {
      const url =
        `${this.proxyBaseUrl}/api/character?account=${encodeURIComponent(acct)}` +
        `&league=${encodeURIComponent(league)}&character=${encodeURIComponent(character)}`
      const res = await this.get(url)
      if (res.status === 404) {
        let detail = 'Character not found — check the profile is public and the name is correct.'
        try {
          const body = (await res.json()) as { error?: unknown }
          if (typeof body?.error === 'string') detail = body.error
        } catch {
          /* non-JSON body; keep the default */
        }
        throw new NinjaError('not-found', detail)
      }
      if (!res.ok) throw new NinjaError('bad-response', `The import service returned ${res.status}.`)
      return (await res.json()) as CharModelResponse
    }

    const e = (s: string) => encodeURIComponent(s)
    const version = await this.readVersion(
      `${this.baseUrl}/poe2/api/events/character/${e(acct)}/${e(league)}/${e(character)}`,
    )
    const res = await this.get(
      `${this.baseUrl}/poe2/api/profile/characters/${e(acct)}/${e(league)}/${e(character)}/model/${version}`,
    )
    if (!res.ok) throw new NinjaError('bad-response', `poe.ninja returned ${res.status} for the character model.`)
    return (await res.json()) as CharModelResponse
  }
}
