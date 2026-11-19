import type { McpHandler } from './server.ts'
import { rpcError } from './server.ts'

/** Streamable HTTP with JSON replies and no server-initiated event stream. */
export async function handleMcpHttp(request: Request, handle: McpHandler): Promise<Response> {
  const url = new URL(request.url)
  const origin = request.headers.get('Origin')
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || (origin !== null && origin !== url.origin))
    return new Response('Forbidden', { status: 403 })
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? ''))
    return new Response('Expected application/json', { status: 415 })
  const headers = { 'Cache-Control': 'no-store' }
  let message: unknown
  try { message = await request.json() }
  catch { return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400, headers }) }
  const reply = await handle(message)
  return reply
    ? Response.json(reply, { headers })
    : new Response(null, { status: 202, headers })
}
