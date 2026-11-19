import type { GitCommitStyle, GitGraphDirection, GitGraphOperation, GitGraphOptions, GitHistory } from 'ts-charts/diagrams'
import { buildGitHistory as buildHistory, gitGraphChart } from 'ts-charts/diagrams'
import { syntaxMask } from './svg.ts'

function commands(source: string): string[] {
  return source.split(/\r?\n/).flatMap((line) => {
    const mask = syntaxMask(line)
    const comment = mask.indexOf('%%')
    const end = comment < 0 ? line.length : comment
    let cursor = 0
    const parts: string[] = []
    for (const stop of mask.slice(0, end).matchAll(/;/g)) {
      parts.push(line.slice(cursor, stop.index).trim())
      cursor = stop.index + 1
    }
    parts.push(line.slice(cursor, end).trim())
    return parts.filter(Boolean)
  })
}

function lex(source: string): string[] | undefined {
  const parts: string[] = []
  const piece = /\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s:"']+)|(:))/gy
  while (source.slice(piece.lastIndex).trim()) {
    const value = piece.exec(source)
    if (!value) return
    const [, quoted, single, keyword, separator] = value
    parts.push(keyword ?? separator ?? (quoted ?? single).replace(/\\(["'\\])/g, '$1'))
  }
  return parts
}

function fields(raw: string[], permitted: string[]): Map<string, string[]> | undefined {
  if (raw.length % 3 !== 0) return
  const result = new Map<string, string[]>()
  for (let cursor = 0; cursor < raw.length; cursor += 3) {
    const [key, sep, value] = raw.slice(cursor, cursor + 3)
    if (!permitted.includes(key) || sep !== ':' || (result.has(key) && key !== 'tag')) return
    const values = result.get(key) ?? []
    values.push(value)
    result.set(key, values)
  }
  return result
}

function settings(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function parseGitHistory(source: string, options?: unknown): GitGraphOptions | undefined {
  const rows = commands(source)
  const header = /^gitGraph(?:\s+(LR|TB|BT))?\s*:?$/.exec(rows.shift() ?? '')
  if (!header || rows.length > 450) return
  const config = settings(options)
  let accessibleTitle = ''
  let description = ''
  const operations: GitGraphOperation[] = []
  for (const row of rows) {
    if (row.startsWith('accTitle:')) { accessibleTitle = row.slice(9).trim(); continue }
    if (row.startsWith('accDescr:')) { description = row.slice(9).trim(); continue }
    const fieldsForLine = lex(row)
    if (!fieldsForLine) return
    const [op, first, ...rest] = fieldsForLine
    if (op === 'branch') {
      const attrs = fields(rest, ['order'])
      const order = attrs?.get('order')?.[0]
      if (!attrs || !first || (order !== undefined && !/^-?\d+$/.test(order))) return
      operations.push({ op, name: first, order: order === undefined ? undefined : Number(order) })
      continue
    }
    if (op === 'checkout' || op === 'switch') {
      if (!first || rest.length) return
      operations.push({ op: 'checkout', name: first })
      continue
    }
    if (op === 'cherry-pick') {
      const attrs = fields(fieldsForLine.slice(1), ['id', 'parent', 'tag'])
      const commit = attrs?.get('id')?.[0]
      if (!commit) return
      operations.push({ op, commit, parent: attrs?.get('parent')?.[0], tags: attrs?.get('tag') })
      continue
    }
    if (op === 'commit' || op === 'merge') {
      const attrs = fields(op === 'commit' ? fieldsForLine.slice(1) : rest, ['id', 'tag', 'type'])
      if (!attrs) return
      const commit = { id: attrs.get('id')?.[0], tags: attrs.get('tag'), style: attrs.get('type')?.[0] as GitCommitStyle | undefined }
      operations.push(op === 'merge' ? { op, branch: first, ...commit } : { op, ...commit })
      continue
    }
    return
  }
  return {
    operations, accessibleTitle, description, direction: header[1] as GitGraphDirection | undefined,
    mainBranchName: typeof config.mainBranchName === 'string' ? config.mainBranchName : undefined,
    mainBranchOrder: typeof config.mainBranchOrder === 'number' ? config.mainBranchOrder : undefined,
    parallelCommits: Boolean(config.parallelCommits), showBranches: config.showBranches !== false, showCommitLabel: config.showCommitLabel !== false,
  }
}

export function buildGitHistory(source: string, options?: unknown): GitHistory | undefined {
  const chart = parseGitHistory(source, options)
  if (chart) return buildHistory(chart)
}

export function gitGraph(source: string, idPrefix: string, options?: unknown, theme?: unknown, fallbackTitle = ''): string | undefined {
  const chart = parseGitHistory(source, options)
  if (!chart) return
  const variables = settings(theme)
  const colors = Array.from({ length: 8 }, (_, index) => {
    const color = variables[`git${index}`]
    return typeof color === 'string' ? color : undefined
  })
  return gitGraphChart({ ...chart, idPrefix, title: fallbackTitle, colors })
}
