import { snippetRevision, snippetToken } from './snippet-write.ts'

export const maxDeckSourceBytes: number = 2_000_000

export interface MarkdownDocument {
  path: string
  root: string
  source: string
  revision: string
  file: string
  secret: string
  inheritedHeadmatter?: Record<string, unknown>
  lines: number[]
  rawIndex: (normalized: number) => number
}

/** Map parser offsets to the original file, including a BOM and mixed newline sequences. */
export function markdownDocument(path: string, root: string, source: string, secret: string, inheritedHeadmatter?: Record<string, unknown>): MarkdownDocument {
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
  return { path, root, source, revision, file, secret, lines, rawIndex, inheritedHeadmatter }
}
