# ninja-proxy

A single serverless function that fetches a poe.ninja PoE2 character server-side
and returns it with CORS headers.

## Why it's needed

Measured against the live API on 2026-07-24:

```
$ curl -sI -H "Origin: https://demonad112.github.io" \
    "https://poe.ninja/poe2/api/profile/characters/.../model/43"
HTTP/2 200
content-type: application/json; charset=utf-8
# ...and no access-control-allow-origin header at all

$ curl -sI -X OPTIONS -H "Origin: https://demonad112.github.io" \
    "https://poe.ninja/poe2/api/data/index-state"
HTTP/2 405
```

No CORS header, and preflight is rejected. **A browser cannot call poe.ninja
directly.** Generic CORS proxies don't solve it either: reading a character
requires first consuming a Server-Sent Events stream to learn the model version,
and public proxies buffer that stream instead of streaming it, so the request
hangs.

This function does the two-step read server-side and hands back the raw payload.

## Contract

```
GET /api/character?account=Name-1234&league=runesofaldur&character=Athrynas
→ 200 { "type": "found", "charModel": { … } }
→ 404 { "error": "…" }   character unknown, private, or unindexed
→ 502 { "error": "…" }   poe.ninja failed
→ 504 { "error": "…" }   poe.ninja timed out
```

All data is public. No authentication, no secrets, nothing persisted.

## Deployed at

**https://poe2-ninja-proxy.vercel.app** — this is the app's default.

Use the bare production alias. The team-scoped alias
(`poe2-ninja-proxy-obsidian-intelligenceyyc.vercel.app`) sits behind Vercel SSO
and answers `302` to anonymous requests, so the app would silently fail to
import through it. Same trap applies to preview deployment URLs — only the
production alias is public.

```
$ curl -sI -H "Origin: https://demonad112.github.io" \
    "https://poe2-ninja-proxy.vercel.app/api/character?account=Demonad112-2589&league=runesofaldur&character=Athrynas"
HTTP/2 200
access-control-allow-origin: *
content-type: application/json; charset=utf-8   # 407 KB charModel
```

## Redeploying

Deploy it anywhere that runs a JS function, then point the web app at it.

### Vercel

1. Import this repository as a new Vercel project.
2. Set **Root Directory** to `services/ninja-proxy`.
3. Deploy. Test the **production alias** — preview URLs are SSO-walled and
   return 401.

### Cloudflare Workers

The handler uses `req.query` / `res.status`. For Workers, wrap it:

```js
export default {
  async fetch(request) {
    const url = new URL(request.url)
    // ...map url.searchParams to req.query and use Response instead of res
  },
}
```

### Wiring it up

Set `NEXT_PUBLIC_NINJA_PROXY_BASE` (no trailing slash) for the web app — as a
repository variable for the GitHub Pages workflow:

```
Settings → Secrets and variables → Actions → Variables
NEXT_PUBLIC_NINJA_PROXY_BASE = https://your-proxy.vercel.app
```

Until it is set, the web app runs in **paste-only mode**: URL import shows a
clear "no import service configured" message and directs the user to paste
character JSON instead, which needs no server at all.
