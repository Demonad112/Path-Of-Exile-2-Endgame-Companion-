'use client'

/**
 * Optional chat about the loaded character.
 *
 * ## Where the key lives
 *
 * In the reader's own browser, in localStorage, and nowhere else. This site is a
 * static export with no server: Next inlines every `NEXT_PUBLIC_*` value into the
 * published bundle, so a key committed to repository secrets would be readable by
 * anyone who opened devtools. There is deliberately no arrangement where a
 * maintainer's key ships with the site.
 *
 * A serverless proxy holding the key server-side is supported as an alternative
 * (`NEXT_PUBLIC_CHAT_PROXY_BASE`), for anyone who wants to share access without
 * sharing a key.
 *
 * ## Why the answers are labelled
 *
 * The model is handed the figures this project derived and told to answer only
 * from them — but it can still be wrong, and it is not the analysis. Every reply
 * is marked as model-generated so it is never mistaken for a measurement, and
 * the panels above remain the authority.
 */

import { useEffect, useRef, useState } from 'react'
import {
  ChatError,
  PROVIDERS,
  SYSTEM_PROMPT,
  buildChatContext,
  buildPobChatContext,
  chat,
  type Analysis,
  type ChatMessage,
  type PobAnalysis,
  type ProviderId,
} from '@poe2/core'
import { Panel, Tag } from './ui'

const KEY_STORAGE = 'poe2-chat-key'
const PROVIDER_STORAGE = 'poe2-chat-provider'
const PROXY = (process.env.NEXT_PUBLIC_CHAT_PROXY_BASE || '').replace(/\/+$/, '')

const SUGGESTIONS = [
  'What is most likely to kill me, and what is the cheapest fix?',
  'Is my damage or my survivability the bigger problem right now?',
  'Explain why my effective health pool is misleading here.',
]

export function Chat({ analysis, pob }: { analysis?: Analysis; pob?: PobAnalysis }) {
  const [provider, setProvider] = useState<ProviderId>('gemini')
  const [apiKey, setApiKey] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const storedKey = localStorage.getItem(KEY_STORAGE)
      const storedProvider = localStorage.getItem(PROVIDER_STORAGE) as ProviderId | null
      if (storedKey) setApiKey(storedKey)
      if (storedProvider && storedProvider in PROVIDERS) setProvider(storedProvider)
    } catch {
      // Private browsing or storage disabled. The chat still works for the
      // session; the key just is not remembered.
    }
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, busy])

  const configured = Boolean(PROXY || apiKey)
  const spec = PROVIDERS[provider]

  function persist(nextKey: string, nextProvider: ProviderId) {
    setApiKey(nextKey)
    setProvider(nextProvider)
    try {
      if (nextKey) localStorage.setItem(KEY_STORAGE, nextKey)
      else localStorage.removeItem(KEY_STORAGE)
      localStorage.setItem(PROVIDER_STORAGE, nextProvider)
    } catch {
      /* storage unavailable — session-only */
    }
  }

  async function send(question: string) {
    const text = question.trim()
    if (!text || busy) return

    const next: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setBusy(true)
    setError(null)

    try {
      const context = analysis ? buildChatContext(analysis) : pob ? buildPobChatContext(pob) : ''
      const reply = await chat(
        { system: SYSTEM_PROMPT, context, messages: next },
        { provider, apiKey: apiKey || undefined, proxyUrl: PROXY || undefined },
      )
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch (err) {
      const chatErr = err as ChatError
      setError(chatErr.message)
      if (chatErr.reason === 'not-configured' || chatErr.reason === 'auth') setShowSettings(true)
      // Drop the unanswered question rather than leaving it hanging in the log.
      setMessages(messages)
    } finally {
      setBusy(false)
    }
  }

  if (!analysis && !pob) return null

  return (
    <Panel
      title="Ask about this build"
      subtitle="Optional. The model is given the figures above and told to answer only from them — it is not the analysis, and it can still be wrong."
      action={
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className="rounded-md px-2 py-1 text-[11px] text-ink-mute hover:text-ink-dim"
          aria-expanded={showSettings}
        >
          {configured ? `${spec.label} ▾` : 'Set up ▾'}
        </button>
      }
    >
      {showSettings ? (
        <div className="mb-3 rounded-lg border border-line bg-surface-sunken p-3">
          <p className="text-[11px] leading-relaxed text-ink-dim">
            Your key is stored <strong className="text-ink">in this browser only</strong> and sent straight to the
            provider. This site is a static page with no server, so it holds no key of its own — and one committed to
            the repository would end up readable in the published bundle.
          </p>

          <div className="mt-3 flex flex-wrap gap-1">
            {Object.values(PROVIDERS).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => persist(apiKey, p.id)}
                className={`rounded-md px-2 py-1 text-[11px] ${
                  provider === p.id ? 'bg-surface-raised text-ink' : 'text-ink-mute hover:text-ink-dim'
                }`}
              >
                {p.label}
                {p.hasFreeTier ? <span className="ml-1 text-good">free tier</span> : null}
              </button>
            ))}
          </div>

          <label className="mt-3 block">
            <span className="text-[11px] text-ink-mute">{spec.label} API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => persist(e.target.value, provider)}
              placeholder={PROXY ? 'Not needed — a proxy is configured' : 'Paste your key'}
              disabled={Boolean(PROXY)}
              className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink disabled:opacity-50"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="mt-1.5 text-[10px] text-ink-mute">
            Get one at{' '}
            <a href={spec.keyUrl} target="_blank" rel="noreferrer noopener" className="underline hover:text-ink-dim">
              {new URL(spec.keyUrl).hostname}
            </a>
            {apiKey ? (
              <>
                {' · '}
                <button type="button" onClick={() => persist('', provider)} className="underline hover:text-ink-dim">
                  forget this key
                </button>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {messages.length ? (
        <ul className="mb-3 space-y-2">
          {messages.map((m, i) => (
            <li
              key={i}
              className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                m.role === 'user' ? 'bg-surface-sunken text-ink' : 'border border-line bg-surface text-ink-dim'
              }`}
            >
              {m.role === 'assistant' ? (
                <div className="mb-1">
                  <Tag>model-generated · check against the panels above</Tag>
                </div>
              ) : null}
              <div className="whitespace-pre-wrap">{m.content}</div>
            </li>
          ))}
          <div ref={endRef} />
        </ul>
      ) : (
        <ul className="mb-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => send(s)}
                disabled={busy}
                className="rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-dim hover:text-ink disabled:opacity-50"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      {busy ? <p className="mb-2 text-[11px] text-ink-mute">Thinking…</p> : null}
      {error ? (
        <p className="mb-2 rounded-lg border border-warn/40 px-3 py-2 text-[11px] leading-relaxed text-warn">{error}</p>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this character…"
          aria-label="Ask about this character"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-md bg-accent px-3 py-2 text-xs font-medium text-surface disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </Panel>
  )
}
