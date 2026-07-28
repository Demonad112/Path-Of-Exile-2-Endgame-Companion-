#!/usr/bin/env node
/**
 * PoE2 Build Analyzer MCP server.
 *
 * stdio transport, for local use from Claude Desktop or any MCP client. Every
 * tool is a thin adapter over @poe2/core; there is no analysis logic here.
 *
 * IMPORTANT: nothing may write to stdout except the protocol itself — stdio
 * transport uses it as the message channel, and a stray console.log corrupts
 * the stream. Diagnostics go to stderr.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { TOOLS } from './tools.js'

const server = new McpServer({
  name: 'poe2-build-analyzer',
  version: '0.1.0',
})

for (const tool of TOOLS) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
    },
    async (args: Record<string, unknown>) => {
      try {
        const result = await tool.handler(args ?? {})
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      } catch (error) {
        // Surface the message to the model rather than throwing: an actionable
        // error it can read and correct beats an opaque protocol failure.
        return {
          content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
          isError: true,
        }
      }
    },
  )
}

const transport = new StdioServerTransport()
await server.connect(transport)
process.stderr.write(`poe2-build-analyzer MCP server ready with ${TOOLS.length} tools\n`)
