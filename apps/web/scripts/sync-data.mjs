/**
 * Copy the generated data artifacts into public/ so the static export ships them.
 *
 * A script rather than an inline `node -e`: that one-liner grew to three files
 * and template literals, and backticks inside an npm script inside a shell get
 * eaten before node ever sees them.
 *
 * The copies in public/ are generated and gitignored.
 */

import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const from = join(here, '..', '..', '..', 'packages', 'data', 'generated')
const to = join(here, '..', 'public')

const FILES = ['passive-tree.json', 'mod-tiers.json', 'monster-stats.json']

mkdirSync(to, { recursive: true })
for (const file of FILES) {
  const source = join(from, file)
  copyFileSync(source, join(to, file))
  process.stdout.write(`  ${file} (${(statSync(source).size / 1024 / 1024).toFixed(2)} MB)\n`)
}
