/**
 * Generate the documented tool table FROM the registry.
 *
 * V1 shipped four different tool counts across its README, architecture doc,
 * changelog and a docstring — all hand-maintained, all wrong in different ways.
 * The only reliable fix is to not write the list by hand.
 *
 * Run: npm run tools -w @poe2/mcp   (writes apps/mcp/TOOLS.md)
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TOOLS } from './tools.js'

const here = dirname(fileURLToPath(import.meta.url))
const outPath = join(here, '..', 'TOOLS.md')

/** First sentence, for the summary column. */
function firstSentence(text: string): string {
  const match = /^(.*?[.!?])(\s|$)/.exec(text.replace(/\s+/g, ' '))
  return (match?.[1] ?? text).trim()
}

const rows = TOOLS.map((tool) => {
  const params = Object.keys(tool.inputSchema)
  // Marked from the annotation, so the docs cannot claim read-only for a tool
  // that is not — the bridge tools drive the user's real Path of Building.
  const effect = tool.annotations.readOnlyHint ? '' : ' ⚠️'
  return `| \`${tool.name}\`${effect} | ${firstSentence(tool.description)} | ${params.length ? params.map((p) => `\`${p}\``).join(', ') : '—'} |`
}).join('\n')

const writers = TOOLS.filter((t) => !t.annotations.readOnlyHint)
const scope = writers.length
  ? `${TOOLS.length} tools. ${TOOLS.length - writers.length} are read-only; ${writers.length} marked ⚠️ act on a ` +
    `running Path of Building on this machine (${writers.map((t) => `\`${t.name}\``).join(', ')}). Nothing here ever ` +
    'writes to a game account, a file, or poe.ninja.'
  : `${TOOLS.length} tools, all read-only.`

const detail = TOOLS.map((tool) => {
  const params = Object.entries(tool.inputSchema)
    .map(([name, schema]) => {
      const description = (schema as { description?: string }).description ?? ''
      const optional = (schema as { isOptional?: () => boolean }).isOptional?.() ? ' *(optional)*' : ''
      return `- \`${name}\`${optional} — ${description}`
    })
    .join('\n')

  return `### \`${tool.name}\`\n\n**${tool.title}**\n\n${tool.description}\n\n${params || '_No parameters._'}\n`
}).join('\n')

const content = `<!--
  GENERATED FILE — do not edit by hand.
  Regenerate with: npm run tools -w @poe2/mcp
-->

# Tools

${scope}

| Tool | Purpose | Parameters |
|---|---|---|
${rows}

Every tool is a thin adapter over \`@poe2/core\`. The MCP server contains no
analysis logic of its own, so it and the web app return the same numbers by
construction rather than by two implementations being kept in step.

## Detail

${detail}
`

writeFileSync(outPath, content)
process.stderr.write(`wrote ${outPath} (${TOOLS.length} tools)\n`)
