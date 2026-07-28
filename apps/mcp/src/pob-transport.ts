/**
 * Node TCP transport for the Path of Building bridge.
 *
 * `@poe2/core` defines the protocol and knows nothing about sockets — a socket
 * does not exist in the browser build, and keeping I/O out of core is what makes
 * the protocol testable without a running Path of Building. This is the other
 * half: one connection per request, which is what the addon expects.
 */

import { Socket } from 'node:net'
import type { PobTransport } from '@poe2/core'

const HOST = '127.0.0.1'

/**
 * Send one request and read the reply, then close.
 *
 * The addon terminates its reply with a newline and does not keep the socket
 * open for a second request, so the read finishes on either the newline or the
 * close — whichever arrives first. Waiting only for the close would hang on a
 * future addon version that pools connections; waiting only for the newline
 * would hang on a reply that lacks one.
 */
export const tcpTransport: PobTransport = (port, payload, timeoutMs) =>
  new Promise<string>((resolve, reject) => {
    const socket = new Socket()
    let buffer = ''
    let settled = false

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      socket.destroy()
      fn()
    }

    socket.setTimeout(timeoutMs)
    socket.once('timeout', () =>
      finish(() =>
        reject(new Error(`Path of Building did not answer on port ${port} within ${timeoutMs} ms`)),
      ),
    )
    socket.once('error', (err) => finish(() => reject(err)))

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      if (buffer.includes('\n')) finish(() => resolve(buffer))
    })

    socket.once('close', () =>
      finish(() =>
        buffer ? resolve(buffer) : reject(new Error(`Path of Building closed the connection on port ${port} without replying`)),
      ),
    )

    socket.connect(port, HOST, () => socket.write(payload))
  })
