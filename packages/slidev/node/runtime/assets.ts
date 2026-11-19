import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

export function within(root: string, path: string): boolean {
  const inside = relative(root, path)
  return inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside)
}

export async function asset(root: string, path: string): Promise<Response> {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('\0'))
    return new Response('Not found', { status: 404 })
  const file = await realpath(resolve(root, `.${path}`)).catch(() => undefined)
  if (file && within(root, file)) {
    const item = Bun.file(file)
    if (await item.exists() && (await item.stat()).isFile()) {
      return new Response(item, { headers: { 'Content-Type': item.type } })
    }
  }
  return new Response('Not found', { status: 404 })
}
