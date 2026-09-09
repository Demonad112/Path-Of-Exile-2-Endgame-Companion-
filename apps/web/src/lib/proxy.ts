/**
 * The server-side hop every poe.ninja read goes through.
 *
 * poe.ninja sends no CORS headers, so the browser cannot call it directly.
 * `services/ninja-proxy` in this repo is that hop, deployed at the URL below.
 *
 * Use the bare production alias, NOT the team-scoped one
 * (`*-obsidian-intelligenceyyc.vercel.app`): team aliases sit behind Vercel's
 * SSO and answer 302 to anonymous requests, so the app would silently fail to
 * import. Verified 2026-07-24: this alias returns 200 with
 * `access-control-allow-origin: *`.
 *
 * NEXT_PUBLIC_NINJA_PROXY_BASE overrides it if the proxy ever moves.
 *
 * The default points at the deployment that also serves /api/ladder and
 * /api/health, which the one at poe2-ninja-proxy.vercel.app does not. Both
 * answer the same ?account&league&character contract, so either works for
 * character import alone; this one is a superset. NOTE: that deployment is
 * currently built from the Poe2-endgame repository, so the copy of its source
 * in services/ninja-proxy here will drift until the Vercel project's Root
 * Directory is re-pointed at this repo.
 *
 * Lives here rather than in the import bar because the ladder comparison needs
 * the same base, and two copies of a URL are two chances to point at different
 * deployments.
 */
const DEFAULT_PROXY = 'https://poe2-endgame-ninja-proxy.vercel.app'

export const PROXY_BASE = (process.env.NEXT_PUBLIC_NINJA_PROXY_BASE || DEFAULT_PROXY).replace(/\/+$/, '')
