/**
 * The path the site is served under.
 *
 * Empty locally, `/<repo>` on GitHub Pages. Kept as an indirection rather than
 * read inline because every asset URL built in a client component depends on
 * it, and Next only inlines `NEXT_PUBLIC_`-prefixed values into client
 * bundles — reading `GITHUB_ACTIONS` here would yield `undefined` and produce
 * root-relative URLs that 404 in production. See apps/web/next.config.ts.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
