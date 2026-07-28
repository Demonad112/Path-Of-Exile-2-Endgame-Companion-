import type { NextConfig } from 'next'

/**
 * Static export for GitHub Pages.
 *
 * `basePath` is applied only in CI, so `npm run dev` serves from `/` locally
 * while the deployed site lives under the repository name. It is DERIVED from
 * `GITHUB_REPOSITORY` rather than written out: both projects this repo merges
 * hardcoded their own repo name here, and this one's name is long enough that
 * renaming it is plausible. Deriving it means a rename needs no code change,
 * and a wrong value can never silently ship — the assets simply resolve
 * against whatever repository actually built them.
 *
 * `NEXT_PUBLIC_BASE_PATH` is re-exported because Next only inlines
 * `process.env` into client bundles for `NEXT_PUBLIC_`-prefixed names. A
 * client component reading `GITHUB_ACTIONS` directly gets `undefined` and
 * builds root-relative URLs that 404 in production.
 *
 * There are no API routes by design: GitHub Pages serves static files only.
 * The poe.ninja fetch goes through services/ninja-proxy instead, because
 * poe.ninja sends no CORS headers and 405s preflight — a browser cannot call
 * it directly. See services/ninja-proxy/README.md.
 */
const isCI = process.env.GITHUB_ACTIONS === 'true'
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''
const basePath = isCI && repo ? `/${repo}` : ''

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
}

export default nextConfig
