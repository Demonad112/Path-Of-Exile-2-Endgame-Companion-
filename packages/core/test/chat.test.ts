/**
 * Chat grounding and transport.
 *
 * The tests that matter are about what the model is TOLD, not what it says. A
 * model handed the character's real figures and instructed not to invent any is
 * checkable; one handed nothing is a random number generator with good grammar.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { analyzeCharacter } from '../src/analyze.js'
import { analyzeFromPob } from '../src/pob/analyze.js'
import { buildChatContext, buildPobChatContext, SYSTEM_PROMPT } from '../src/chat/context.js'
import { ChatError, PROVIDERS, chat, type ChatConfig } from '../src/chat/provider.js'
import type { CharModel } from '../src/model/types.js'

const payload = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/athrynas-v43.json', import.meta.url)), 'utf8'),
)
const model: CharModel = payload.charModel ?? payload
const analysis = await analyzeCharacter(payload)
const context = buildChatContext(analysis)

describe('grounding the model', () => {
  it('puts the real headline figures in the context verbatim', () => {
    // Every number a good answer can cite must be findable here, so a reader can
    // check the reply against the panels on the page.
    expect(context).toContain('3808')
    expect(context).toContain('chaos')
    expect(context).toContain('109859')
    expect(context).toContain('Ice Shot')
    expect(context).toContain('13569')
  })

  it('states the resistance shortfalls and overcaps as facts', () => {
    expect(context).toMatch(/chaos: 18% of 75%.*57 UNDER cap/)
    expect(context).toMatch(/fire: 75% of 75%.*\+24 over cap/)
  })

  it('carries the findings this tool already derived, so the model need not invent advice', () => {
    expect(context).toContain('FINDINGS ALREADY DERIVED BY THIS TOOL')
    for (const rec of analysis.recommendations.recommendations.slice(0, 3)) {
      expect(context).toContain(rec.action)
    }
  })

  it('names what could not be determined, rather than omitting it', () => {
    // Silence about a gap invites the model to fill it.
    if (analysis.recommendations.unresolved.length) {
      expect(context).toContain('Could NOT be determined')
    }
  })

  it('never presents the inactive weapon set as live', () => {
    const inactive = analysis.items.filter((i) => !i.active)
    expect(context).toContain('active weapon set only')
    for (const item of inactive) {
      // The swap-set item must not appear in the equipped list.
      expect(context.split('## PASSIVES')[0]).not.toContain(`${item.slotLabel}: ${item.name}`)
    }
  })

  it('instructs against the failure modes this project exists to prevent', () => {
    expect(SYSTEM_PROMPT).toMatch(/NEVER invent a number/)
    expect(SYSTEM_PROMPT).toMatch(/NEVER estimate/)
    expect(SYSTEM_PROMPT).toMatch(/lowest maximum hit taken.*NOT the effective health pool/is)
    expect(SYSTEM_PROMPT).toMatch(/alternates, never additive/)
    expect(SYSTEM_PROMPT).toMatch(/Tier 1 is the BEST/)
  })

  it('grounds a Path of Building import in its own narrower facts', async () => {
    const pob = await analyzeFromPob(model.pathOfBuildingExport!)
    const pobContext = buildPobChatContext(pob)
    expect(pobContext).toContain('3808')
    expect(pobContext).toContain('THIS SOURCE CANNOT ANSWER')
    // The gaps must travel with the context, or the model will paper over them.
    expect(pobContext).toContain('Per-skill damage')
  })
})

describe('provider transport', () => {
  const request = { system: SYSTEM_PROMPT, context, messages: [{ role: 'user' as const, content: 'Am I tanky?' }] }

  function fakeFetch(handler: (url: string, init: RequestInit) => unknown, status = 200) {
    return async (input: RequestInfo | URL, init?: RequestInit) =>
      new Response(JSON.stringify(handler(String(input), init ?? {})), {
        status,
        headers: { 'content-type': 'application/json' },
      }) as Response
  }

  it('refuses clearly when nothing is configured, and explains why', async () => {
    const err = await chat(request, { provider: 'gemini' } as ChatConfig).catch((e) => e as ChatError)
    expect(err.reason).toBe('not-configured')
    // The reason is structural — a static site holds no key — so say that.
    expect(err.message).toMatch(/static export|no server/i)
    expect(err.message).toMatch(/stored only in this browser/)
  })

  it('sends the context with the question, not as a separate turn', async () => {
    let body: Record<string, unknown> = {}
    await chat(request, {
      provider: 'gemini',
      apiKey: 'k',
      fetch: fakeFetch((_u, init) => {
        body = JSON.parse(String(init.body))
        return { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }
      }),
    })
    const contents = body.contents as { parts: { text: string }[] }[]
    expect(contents[0]!.parts[0]!.text).toContain('3808')
    expect(contents[0]!.parts[0]!.text).toContain('Question: Am I tanky?')
  })

  it('reads a reply from each provider shape', async () => {
    const cases: [ChatConfig['provider'], unknown][] = [
      ['gemini', { candidates: [{ content: { parts: [{ text: 'gemini says' }] } }] }],
      ['openai', { choices: [{ message: { content: 'openai says' } }] }],
      ['anthropic', { content: [{ type: 'text', text: 'anthropic says' }] }],
    ]
    for (const [provider, reply] of cases) {
      const text = await chat(request, { provider, apiKey: 'k', fetch: fakeFetch(() => reply) })
      expect(text).toContain('says')
    }
  })

  it('distinguishes a bad key from a rate limit from a server fault', async () => {
    const cases: [number, string][] = [
      [401, 'auth'],
      [403, 'auth'],
      [429, 'rate-limit'],
      [500, 'bad-response'],
    ]
    for (const [status, reason] of cases) {
      const err = await chat(request, {
        provider: 'openai',
        apiKey: 'k',
        fetch: fakeFetch(() => ({ error: 'x' }), status),
      }).catch((e) => e as ChatError)
      expect(err.reason).toBe(reason)
    }
  })

  it('prefers a proxy over a key, so the key can stay server-side', async () => {
    let calledUrl = ''
    const text = await chat(request, {
      provider: 'gemini',
      apiKey: 'should-not-be-used',
      proxyUrl: 'https://example.test/chat',
      fetch: fakeFetch((url, init) => {
        calledUrl = url
        expect(String(init.headers && (init.headers as Record<string, string>)['x-goog-api-key'])).toBe('undefined')
        return { text: 'via proxy' }
      }),
    })
    expect(calledUrl).toBe('https://example.test/chat')
    expect(text).toBe('via proxy')
  })

  it('times out rather than hanging', async () => {
    const err = await chat(request, {
      provider: 'gemini',
      apiKey: 'k',
      timeoutMs: 20,
      fetch: () => new Promise(() => {}),
    }).catch((e) => e as ChatError)
    expect(err.reason).toBe('network')
    expect(err.message).toContain('20 ms')
  })

  it('links where to get a key for every provider it offers', () => {
    for (const spec of Object.values(PROVIDERS)) {
      expect(spec.keyUrl).toMatch(/^https:\/\//)
      expect(spec.defaultModel.length).toBeGreaterThan(0)
    }
    // Gemini has a no-cost tier, which is why it is the sensible default.
    expect(PROVIDERS.gemini.hasFreeTier).toBe(true)
  })
})
