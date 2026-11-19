import { realpath } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { within } from './assets.ts'

interface Snippet {
  source: string
  file: string
  region?: string
  language: string
  info: string
  indent: string
}

const directive = /^([ \t]*(?:>\s*)*)<<<[ \t]*(?:"([^"]+)"|'([^']+)'|([^\s{]+))(.*)$/
const fence = /^([ \t]*(?:>\s*)*)(`{3,}|~{3,})(.*)$/
const regionMarker = /^\s*(?:(?:\/\/|<!--|\/\*|--|::|@?REM|\(\*)\s*#?|#(?:pragma\s+)?)\s*(end\s*)?region\b\s*(.*?)(?:\s*(?:-->|\*\/|\*\)))?\s*$/i

function extractRegion(source: string, name: string): string {
  const lines = source.split(/\r?\n/)
  const start = lines.findIndex((line) => {
    const match = regionMarker.exec(line)
    return match && !match[1] && match[2] === name
  })
  if (start < 0) return source
  const content = []
  let depth = 1
  for (const line of lines.slice(start + 1)) {
    const match = regionMarker.exec(line)
    if (!match) content.push(line)
    else if (!match[1]) depth++
    else if (--depth === 0) {
      let indentation = Infinity
      for (const row of content) {
        if (row.trim()) indentation = Math.min(indentation, /^\s*/.exec(row)![0].length)
      }
      return content.map(line => Number.isFinite(indentation) ? line.slice(indentation) : line).join('\n')
    }
  }
  return source
}

/** Ported from Slidev's snippet resolver. The filesystem path stays inside the deck root. */
export async function resolveSnippet(line: string, root: string, entry: string): Promise<Snippet | undefined> {
  const [, indent, double, single, bare, suffix] = directive.exec(line) ?? []
  const fileRef = double ?? single ?? bare
  if (!fileRef) return
  const [, path, region] = /^(.*?)(?:#([\w-]+))?$/.exec(fileRef)!
  const [, languageOverride, meta] = /^(?:\s+([\w+#.-]+))?\s*((?:\[.*|\{.*)?)\s*$/.exec(suffix) ?? []
  if (meta === undefined) return
  const requested = path.startsWith('@/') ? resolve(root, path.slice(2)) : resolve(dirname(entry), path)
  if (!within(root, requested)) throw new Error(`Code snippet path escapes the project root: ${fileRef}`)
  const file = await realpath(requested).catch(() => undefined)
  if (!file) throw new Error(`Code snippet path not found: ${fileRef}`)
  if (!within(root, file) && !within(await realpath(root), file)) throw new Error(`Code snippet path escapes the project root: ${fileRef}`)
  const input = Bun.file(file)
  const stat = await input.stat()
  if (!stat.isFile()) throw new Error(`Code snippet path is not a file: ${fileRef}`)
  if (stat.size > 1024 * 1024) throw new Error(`Code snippet is too large: ${fileRef}`)
  const source = await input.text()
  return {
    source: region ? extractRegion(source, region) : source,
    file, region, language: languageOverride || extname(path).slice(1) || 'text', info: meta, indent,
  }
}

export async function expandSnippets(
  source: string,
  root: string,
  entry: string,
  observe: (file: string) => Promise<unknown>,
  writable?: (path: string, source: string) => string | undefined,
): Promise<string> {
  if (!source.includes('<<<')) return source
  const rows: string[] = []
  let outer = ''
  let inner = ''
  let magic = false
  let rawHtml = ''
  let comment = false
  for (const row of source.split('\n')) {
    const line = row.trimStart()
    const opening = fence.exec(row)
    if (rawHtml || comment) {
      rows.push(row)
      if (rawHtml && new RegExp(`</${rawHtml}(?:\\s|>)`, 'i').test(row)) rawHtml = ''
      if (comment && row.includes('-->')) comment = false
      continue
    }
    if (opening) {
      const [, , marker, info] = opening
      if (!outer) {
        outer = marker
        magic = /^(?:md|markdown)\s+magic-move\b/.test(info.trim())
      }
      else if (inner) {
        if (inner[0] === marker[0] && marker.length >= inner.length && !info.trim()) inner = ''
      }
      else if (outer[0] === marker[0] && marker.length >= outer.length && !info.trim()) {
        outer = ''
        magic = false
      }
      else if (magic) inner = marker
      rows.push(row)
      continue
    }
    if (!outer) {
      const tag = /^<(pre|script|style|code)\b/i.exec(line)?.[1]
      if (tag && !new RegExp(`</${tag}(?:\\s|>)`, 'i').test(row)) rawHtml = tag
      if (line.startsWith('<!--') && !line.includes('-->')) comment = true
    }
    const resolved = (!outer || (magic && !inner)) && line.includes('<<<') ? await resolveSnippet(row, root, entry) : undefined
    if (!resolved) {
      rows.push(row)
      continue
    }
    await observe(resolved.file)
    let info = resolved.info
    if (/\{monaco-write\}/.test(info)) {
      const editable = /^(?:js|javascript|ts|typescript)$/i.test(resolved.language)
      const token = editable && !magic && !resolved.region ? writable?.(resolved.file, resolved.source) : undefined
      info = info.replace(/\{monaco-write\}/, token ? `{tpSnippet:'${token}'}` : '{monaco}')
    }
    const character = outer[0] === '`' ? '~' : '`'
    let longest = 2
    for (const run of resolved.source.matchAll(character === '`' ? /`+/g : /~+/g)) longest = Math.max(longest, run[0].length)
    const marker = character.repeat(longest + 1)
    const { indent } = resolved
    rows.push(`${indent}${marker}${resolved.language} ${info}`.trimEnd())
    for (const line of resolved.source.replace(/\r?\n$/, '').split(/\r?\n/)) rows.push(indent + line)
    rows.push(indent + marker)
  }
  return rows.join('\n')
}
