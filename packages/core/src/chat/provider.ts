/**
 * Provider-agnostic chat, behind one interface.
 *
 * ## Where the key lives, and why
 *
 * This app is a **static export on GitHub Pages**. There is no server. Next
 * inlines every `NEXT_PUBLIC_*` value into the JavaScript bundle at build time,
 * so an API key put in repository secrets and exposed that way would be sitting
 * in the published bundle for anyone to read. That is not a hypothetical: it is
 * what would happen.
 *
 * So there are exactly two safe arrangements, and both are supported:
 *
 *   1. **The reader's own key, held in their own browser.** Nothing is committed,
 *      nothing is deployed, and the key never leaves the machine that typed it.
 *      This is the default because it needs no infrastructure.
 *   2. **A serverless proxy holding the key server-side**, the same shape as
 *      `services/ninja-proxy`. Set `proxyUrl` and no key is handled here at all.
 *
 * There is deliberately no third option where a maintainer's key ships with the
 * site.
 *
 * `fetch` is injected, as everywhere else in core.
 */

export type ProviderId = 'gemini' | 'openai' | 'anthropic'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  system: string
  context: string
  messages: ChatMessage[]
}

export interface ChatConfig {
  provider: ProviderId
  /** The reader's own key. Omit when using a proxy. */
  apiKey?: string
  /** A server-side endpoint holding the key. Takes precedence over apiKey. */
  proxyUrl?: string
  model?: string
  fetch?: typeof globalThis.fetch
  /** Milliseconds. */
  timeoutMs?: number
}

export class ChatError extends Error {
  override name = 'ChatError'
  constructor(
    readonly reason: 'not-configured' | 'auth' | 'rate-limit' | 'network' | 'bad-response' | 'refused',
    message: string,
  ) {
    super(message)
  }
}

export interface ProviderSpec {
  id: ProviderId
  label: string
  defaultModel: string
  /** Where a reader gets a key, so the UI can link it rather than assume. */
  keyUrl: string
  /** True when the provider has a no-cost tier at time of writing. */
  hasFreeTier: boolean
}

export const PROVIDERS: Readonly<Record<ProviderId, ProviderSpec>> = Object.freeze({
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.0-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    hasFreeTier: true,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    hasFreeTier: false,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-sonnet-4-5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    hasFreeTier: false,
  },
})

/** Prompt shape sent to whichever provider is configured. */
function composeUserTurns(request: ChatRequest): ChatMessage[] {
  const [first, ...rest] = request.messages
  if (!first) return []
  // The context rides with the first user turn rather than the system prompt:
  // every provider supports it there, and it keeps the system prompt identical
  // across providers so behaviour does not drift between them.
  return [{ role: 'user', content: `CONTEXT — the character's real, computed figures:\n\n${request.context}\n\n---\n\nQuestion: ${first.content}` }, ...rest]
}

async function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ChatError('network', `${what} did not respond within ${ms} ms.`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function classify(status: number, body: string): ChatError {
  if (status === 401 || status === 403) {
    return new ChatError('auth', 'The API key was rejected. Check it is correct and still active.')
  }
  if (status === 429) {
    return new ChatError('rate-limit', 'Rate limited by the provider. Wait a moment and try again.')
  }
  return new ChatError('bad-response', `The provider returned ${status}: ${body.slice(0, 200)}`)
}

/**
 * Send one turn and return the reply.
 *
 * Throws `ChatError('not-configured')` rather than failing obscurely when no key
 * or proxy is set — that is the normal state, not an error worth alarming about.
 */
export async function chat(request: ChatRequest, config: ChatConfig): Promise<string> {
  const doFetch = config.fetch ?? globalThis.fetch
  const timeoutMs = config.timeoutMs ?? 45_000
  const spec = PROVIDERS[config.provider]
  const model = config.model || spec.defaultModel
  const messages = composeUserTurns(request)

  if (!messages.length) throw new ChatError('refused', 'No question was asked.')

  if (!config.proxyUrl && !config.apiKey) {
    throw new ChatError(
      'not-configured',
      'No API key is set. This site is a static export with no server, so it holds no key of its own — add your own key, which is stored only in this browser.',
    )
  }

  // A proxy keeps the key server-side; the request shape is this project's, not
  // any provider's, so the proxy can route it wherever it likes.
  if (config.proxyUrl) {
    const res = await withTimeout(
      doFetch(config.proxyUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: config.provider, model, system: request.system, messages }),
      }),
      timeoutMs,
      'The chat proxy',
    )
    if (!res.ok) throw classify(res.status, await res.text().catch(() => ''))
    const data = (await res.json()) as { text?: string }
    if (typeof data.text !== 'string') throw new ChatError('bad-response', 'The proxy did not return a text field.')
    return data.text
  }

  const key = config.apiKey!
  switch (config.provider) {
    case 'gemini': {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
      const res = await withTimeout(
        doFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.system }] },
            contents: messages.map((m) => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }],
            })),
            generationConfig: { temperature: 0.2 },
          }),
        }),
        timeoutMs,
        'Gemini',
      )
      if (!res.ok) throw classify(res.status, await res.text().catch(() => ''))
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
      }
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
      if (!text) throw new ChatError('bad-response', 'Gemini returned no text. It may have blocked the response.')
      return text
    }

    case 'openai': {
      const res = await withTimeout(
        doFetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            messages: [{ role: 'system', content: request.system }, ...messages],
          }),
        }),
        timeoutMs,
        'OpenAI',
      )
      if (!res.ok) throw classify(res.status, await res.text().catch(() => ''))
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      const text = data.choices?.[0]?.message?.content
      if (!text) throw new ChatError('bad-response', 'OpenAI returned no message content.')
      return text
    }

    case 'anthropic': {
      const res = await withTimeout(
        doFetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            // Required for a browser to call the API directly at all.
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({ model, max_tokens: 2048, temperature: 0.2, system: request.system, messages }),
        }),
        timeoutMs,
        'Anthropic',
      )
      if (!res.ok) throw classify(res.status, await res.text().catch(() => ''))
      const data = (await res.json()) as { content?: { type: string; text?: string }[] }
      const text = data.content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
      if (!text) throw new ChatError('bad-response', 'Anthropic returned no text block.')
      return text
    }
  }
}
