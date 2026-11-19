import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export function within(root: string, path: string): boolean {
  const inside = relative(root, path)
  return inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside)
}

export async function asset(root: string, path: string, request?: Request): Promise<Response> {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('\0'))
    return new Response('Not found', { status: 404 })
  const file = await realpath(resolve(root, `.${path}`)).catch(() => undefined)
  if (file && within(root, file)) {
    const item = Bun.file(file)
    if (await item.exists() && (await item.stat()).isFile()) {
      const headers = new Headers({ 'Content-Type': item.type, 'Accept-Ranges': 'bytes' })
      const body = request?.method === 'HEAD' ? null : item
      const range = request?.method === 'GET' && !request.headers.has('if-range') ? request.headers.get('range') : null
      const match = range && /^bytes=(\d*)-(\d*)$/i.exec(range)
      if (!match || (!match[1] && !match[2])) {
        headers.set('Content-Length', String(item.size))
        return new Response(body, { headers })
      }
      const start = match[1] ? Number(match[1]) : Math.max(0, item.size - Number(match[2]))
      const end = Math.min(match[1] && match[2] ? Number(match[2]) : item.size - 1, item.size - 1)
      if (start > end) {
        headers.set('Content-Range', `bytes */${item.size}`)
        return new Response(null, { status: 416, headers })
      }
      headers.set('Content-Range', `bytes ${start}-${end}/${item.size}`)
      headers.set('Content-Length', String(end - start + 1))
      return new Response(item.slice(start, end + 1, item.type), { status: 206, headers })
    }
  }
  return new Response('Not found', { status: 404 })
}
