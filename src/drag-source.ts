import type { DragKind, DragPosition } from './drag.ts'
import { dragKey, dragPositionText, parseDragPosition } from './drag.ts'
import type { Slide } from './parser.ts'
import { slideSourceOf } from './parser.ts'
import { describeDrag, htmlTag, prepareSlideHtml } from './slide-html.ts'
import type { WritableSnippet } from './snippet-write.ts'
import { snippetRevision, snippetToken, writeDeckFile } from './snippet-write.ts'

const maxDeckBytes = 2_000_000

type Edit = { start: number, end: number, replacement: (position: DragPosition) => string }
export interface WritableDrag extends WritableSnippet {
  kind: DragKind
  edit: Edit
}

interface DragDocument {
  path: string
  root: string
  source: string
  revision: string
  file: string
  secret: string
  lines: number[]
  rawIndex: (normalized: number) => number
}

/** Map parser offsets to the original file, including a BOM and mixed newline sequences. */
export function dragDocument(path: string, root: string, source: string, secret: string): DragDocument {
  const bom = Number(source.startsWith('\uFEFF'))
  const lines = [0]
  const removed: number[] = []
  for (const match of source.matchAll(/\r?\n/g)) {
    if (match[0].length === 2) removed.push(match.index - removed.length - bom)
    lines.push(match.index + match[0].length - removed.length - bom)
  }
  function rawIndex(normalized: number): number {
    let left = 0
    let right = removed.length
    while (left < right) {
      const middle = (left + right) >>> 1
      if (removed[middle] < normalized) left = middle + 1
      else right = middle
    }
    return normalized + left + bom
  }
  const revision = snippetRevision(source)
  const file = snippetToken(secret, path)
  return { path, root, source, revision, file, secret, lines, rawIndex }
}

function namedEdit(doc: DragDocument, slide: NonNullable<ReturnType<typeof slideSourceOf>>, name: string, kind: DragKind, positions: unknown): Edit | undefined {
  const { lines, rawIndex, source } = doc
  const { matter, bodyLine } = slide
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const positionText = (position: DragPosition) => `'${dragPositionText(position, kind)}'`
  const entry = (position: DragPosition, indent = '  ') => `${indent}'${name}': ${positionText(position)}${newline}`
  if (!matter) {
    const start = rawIndex(lines[bodyLine])
    return { start, end: start, replacement: position => `---${newline}dragPos:${newline}${entry(position)}---${newline}` }
  }

  const begin = rawIndex(lines[matter.start + 1])
  const close = rawIndex(lines[matter.end])
  const yaml = source.slice(begin, close)
  const heading = /^(?:dragPos|'dragPos'|"dragPos"):[ \t]*(#[^\r\n]*)?\r?$/m.exec(yaml)
  if (!heading) {
    // Flow mappings and aliases can be read, while editing requires an identifiable key.
    if (positions !== undefined || /^(?:dragPos|'dragPos'|"dragPos"):/m.test(yaml)) return
    return { start: close, end: close, replacement: position => `dragPos:${newline}${entry(position)}` }
  }
  const afterHeading = yaml.indexOf('\n', heading.index) + 1
  const rows = [...yaml.slice(afterHeading).matchAll(/[^\r\n]+(?:\r?\n|$)/g)]
  const boundary = rows.findIndex(row => /^[^ \t#\r\n]/.test(row[0]))
  const body = boundary === -1 ? rows : rows.slice(0, boundary)
  const data = body.filter(row => row[0].trim() && !row[0].trimStart().startsWith('#'))
  const indent = data.length ? Math.min(...data.map(row => /^ */.exec(row[0])![0].length)) : 2
  if (!indent) return
  for (const row of data) {
    const fields = /^( +)(?:'([^']+)'|"([^"]+)"|([\w.-]+))[ \t]*:[ \t]*((?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|\[[^\]\r\n]*\]|[^#\r\n]*?))[ \t]*(?:#[^\r\n]*)?(?:\r?\n)?$/.exec(row[0])
    if (!fields || fields[1].length !== indent || (fields[2] ?? fields[3] ?? fields[4]) !== name) continue
    const raw = fields[5]
    if (!raw || /^[|>&*!{]/.test(raw)) return
    const field = /^[^:]+:[ \t]*/.exec(row[0])![0]
    const start = begin + afterHeading + row.index + field.length
    return { start, end: start + raw.length, replacement: positionText }
  }
  if (positions && (typeof positions !== 'object' || Array.isArray(positions) || Object.hasOwn(positions, name))) return
  // Insert first in the mapping, without moving any existing keys or comments.
  const start = begin + afterHeading
  return { start, end: start, replacement: position => entry(position, ' '.repeat(indent)) }
}

/**
 * Use Bun's Markdown parser to distinguish real tags from identical examples in
 * inline code, indented code, fences, and comments. Only confirmed tags get a
 * source token in the deck that is sent to the client.
 */
export function bindDragSources(
  doc: DragDocument,
  slide: Slide,
  sourceSlide: Slide,
  authoredIndex: number,
  files: Map<string, WritableDrag>,
): string {
  const { content } = slide
  if (content.length > maxDeckBytes || doc.source.length > maxDeckBytes || !/v-?drag/i.test(content)) return content
  const range = slideSourceOf(sourceSlide)
  if (!range) return content
  const base = doc.lines[range.bodyLine] + range.leading
  const candidates = [...content.matchAll(htmlTag)].flatMap((tag) => {
    if (tag[1] || !/v-?drag/i.test(tag[0])) return []
    const descriptor = describeDrag(tag[2], tag[3])
    if (!descriptor) return []
    const at = tag.index + tag[0].length - (/\/>$/.test(tag[0]) ? 2 : 1)
    return [{ tag, descriptor, at }]
  })
  if (!candidates.length) return content

  function insertTags(get: (candidate: typeof candidates[number], index: number) => string): string {
    let cursor = 0
    const parts = candidates.map((item, index) => {
      const part = content.slice(cursor, item.at) + get(item, index)
      cursor = item.at
      return part
    })
    return parts.join('') + content.slice(cursor)
  }
  const marker = `data-drag-probe-${doc.file.slice(0, 12)}`
  const probe = new RegExp(` ${marker}="(\\d+)"`)
  const shadow = insertTags((_, index) => ` ${marker}="${index}"`)
  const rendered = prepareSlideHtml(Bun.markdown.html(shadow), () => undefined, 0).html
  const active = new Set([...rendered.matchAll(htmlTag)].flatMap(([tag]) => {
    if (!tag.includes(' data-presentation-drag=')) return []
    const index = probe.exec(tag)?.[1]
    return index === undefined ? [] : [Number(index)]
  }))

  return insertTags(({ tag, descriptor, at }, index) => {
    if (!active.has(index)) return ''
    const { original, kind, prop } = descriptor
    const name = original && dragKey(original.value)
    const tagStart = tag.index + 1 + tag[2].length
    const start = original ? tagStart + original.offset + original.source.length - original.source.trimStart().length : at
    const end = original ? tagStart + original.offset + original.source.length : at
    const edit: Edit | undefined = name
      ? slide.frontmatter?.dragPos === sourceSlide.frontmatter?.dragPos ? namedEdit(doc, range, name, kind, slide.frontmatter?.dragPos) : undefined
      : {
          start: doc.rawIndex(base + start), end: doc.rawIndex(base + end),
          replacement: position => `${original ? '' : ' '}${prop}="${dragPositionText(position, kind, prop !== 'pos')}"`,
        }
    if (!edit) return ''
    const key = name ? `name:${name}:${kind}` : `tag:${index}`
    const token = snippetToken(doc.secret, `${doc.path}\0${authoredIndex}\0${key}`)
    files.set(token, { path: doc.path, root: doc.root, revision: doc.revision, kind, edit })
    return ` data-drag-token="${token}" data-drag-file="${doc.file}" data-drag-revision="${doc.revision}"`
  })
}

export function saveDrag(files: ReadonlyMap<string, WritableDrag>, input: unknown): Response | Promise<Response> {
  if (!input || typeof input !== 'object') return new Response('Invalid position', { status: 400 })
  const { token, revision, position } = input as Record<string, unknown>
  if (typeof token !== 'string' || typeof revision !== 'string' || !Array.isArray(position))
    return new Response('Invalid position', { status: 400 })
  const file = files.get(token)
  if (!file) return new Response('Position is unavailable', { status: 404 })
  const parsed = parseDragPosition(position, file.kind)
  if (!parsed) return new Response('Invalid position', { status: 400 })
  const { edit } = file
  return writeDeckFile(file, revision, maxDeckBytes, 'slide source', source =>
    source.slice(0, edit.start) + edit.replacement(parsed) + source.slice(edit.end))
}
