import { chmod, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { within } from './assets.ts'
import { maxCodeLength } from './compile-code.ts'

export interface WritableSnippet {
  path: string
  root: string
  revision: string
}

export function snippetToken(secret: string, path: string): string {
  return Bun.CryptoHasher.hash('sha256', `${secret}\0${path}`, 'hex')
}

export function snippetRevision(source: string): string {
  return Bun.CryptoHasher.hash('sha256', source, 'hex')
}

const writes = new Set<string>()

export async function saveSnippet(
  files: ReadonlyMap<string, WritableSnippet>,
  input: unknown,
): Promise<Response> {
  if (!input || typeof input !== 'object') return new Response('Invalid snippet update', { status: 400 })
  const { token, revision, source } = input as Record<string, unknown>
  if (typeof token !== 'string' || typeof revision !== 'string' || typeof source !== 'string' || source.length > maxCodeLength)
    return new Response('Invalid snippet update', { status: 400 })
  const file = files.get(token)
  if (!file) return new Response('Snippet is unavailable', { status: 404 })
  return writeDeckFile(file, revision, maxCodeLength * 4, 'snippet', (previous) => {
    const newline = previous.includes('\r\n') ? '\r\n' : '\n'
    return source.replace(/\r?\n/g, newline) + (previous.endsWith('\n') && !source.endsWith('\n') ? newline : '')
  })
}

export async function writeDeckFile(
  file: WritableSnippet,
  revision: string,
  maxSize: number,
  subject: string,
  update: (source: string) => string | undefined,
): Promise<Response> {
  const stale = () => new Response(`The ${subject} changed on disk. Reload the slide before saving.`, { status: 409 })
  if (file.revision !== revision) return stale()
  if (writes.has(file.path)) return stale()
  writes.add(file.path)
  const staged = join(dirname(file.path), `.presentation-${randomBytes(16).toString('hex')}.tmp`)
  try {
    const actual = await realpath(file.path)
    if (actual !== file.path || !within(file.root, actual)) return stale()
    const metadata = await stat(actual)
    if (!metadata.isFile() || metadata.size > maxSize) return stale()
    const previous = await readFile(actual, 'utf8')
    if (snippetRevision(previous) !== revision) return stale()
    const saved = update(previous)
    if (saved === undefined) return stale()
    if (saved === previous) return new Response(revision)
    await writeFile(staged, saved, { mode: metadata.mode & 0o777, flag: 'wx' })
    await chmod(staged, metadata.mode & 0o777)
    if (await realpath(file.path) !== file.path || await readFile(file.path, 'utf8') !== previous) return stale()
    await rename(staged, file.path)
    return new Response(snippetRevision(saved))
  }
  catch {
    return new Response(`Could not save the ${subject}`, { status: 409 })
  }
  finally {
    await rm(staged, { force: true }).catch(() => undefined)
    writes.delete(file.path)
  }
}
