import { relative } from 'node:path'
import type { MarkdownDocument } from './markdown-source.ts'
import { maxDeckSourceBytes } from './markdown-source.ts'
import type { Slide } from '../../../parser/src/deck.ts'
import { parseDeck, slideSourceOf } from '../../../parser/src/deck.ts'
import type { WritableSnippet } from './snippet-write.ts'
import { snippetToken, writeDeckFile } from './snippet-write.ts'
import type { EditorSource } from '../../../types/src/dev-protocol.ts'

export const maxSlideEditLength: number = 128_000

export interface WritableSlide extends WritableSnippet {
  token: string
  document: string
  start: number
  end: number
  inheritedHeadmatter?: Record<string, unknown>
}

export function bindSlideSource(doc: MarkdownDocument, slide: Slide, index: number): WritableSlide | undefined {
  const range = slideSourceOf(slide)
  if (!range) return
  const start = doc.rawIndex(doc.lines[range.matter?.start ?? range.bodyLine])
  const end = range.endLine < doc.lines.length ? doc.rawIndex(doc.lines[range.endLine]) : doc.source.length
  if (end - start > maxSlideEditLength) return
  return {
    token: snippetToken(doc.secret, `slide\0${doc.path}\0${index}${doc.inheritedHeadmatter?.comark ? '\0comark' : ''}`),
    document: doc.source, start, end, path: doc.path, root: doc.root, revision: doc.revision, inheritedHeadmatter: doc.inheritedHeadmatter,
  }
}

export function readSlideSource(file: WritableSlide): EditorSource {
  return {
    token: file.token, revision: file.revision,
    path: relative(file.root, file.path),
    source: file.document.slice(file.start, file.end).replace(/\r\n/g, '\n'),
  }
}

export async function saveSlideSource(files: ReadonlyMap<string, WritableSlide>, input: unknown): Promise<Response> {
  if (!input || typeof input !== 'object') return new Response('Invalid slide edit.', { status: 400 })
  const { token, revision, source } = input as Record<string, unknown>
  if (typeof token !== 'string' || typeof revision !== 'string' || typeof source !== 'string'
    || source.length > maxSlideEditLength || source.includes('\0'))
    return new Response('Invalid slide edit.', { status: 400 })
  const file = files.get(token)
  if (!file) return new Response('This slide source is unavailable.', { status: 404 })
  if (file.revision !== revision) return new Response('Source changed on disk. Copy your draft before reloading it.', { status: 409 })

  const original = file.document.slice(file.start, file.end)
  const newline = original.includes('\r\n') || (!original.includes('\n') && file.document.includes('\r\n')) ? '\r\n' : '\n'
  const normalized = source.replace(/\r\n/g, '\n')
  let replacement = normalized === original.replace(/\r\n/g, '\n') ? original : normalized.replace(/\n/g, newline)
  if (replacement && !replacement.endsWith('\n') && (original.endsWith('\n') || file.end < file.document.length))
    replacement += newline
  const modified = file.document.slice(0, file.start) + replacement + file.document.slice(file.end)
  if (Buffer.byteLength(modified, 'utf8') > maxDeckSourceBytes)
    return new Response('The edited Markdown file is too large.', { status: 422 })
  if (modified !== file.document) {
    try { parseDeck(modified, file.inheritedHeadmatter) }
    catch (error) {
      return new Response(error instanceof Error ? error.message : 'Invalid slide Markdown.', { status: 422 })
    }
  }
  const response = await writeDeckFile(file, revision, maxDeckSourceBytes, 'slide source', () => modified)
  if (response.ok) return Response.json({ revision: await response.text() })
  return response
}
