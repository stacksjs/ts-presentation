import type { GitCommitStyle, GitGraphDirection, GitGraphOperation, GitGraphOptions, GitHistory } from 'ts-charts/diagrams'
import { buildGitHistory as buildHistory, gitGraphChart } from 'ts-charts/diagrams'
import type { MermaidOptions } from '../authoring-setup.ts'
import { diagramPixels, readChronology } from './chronology.ts'
import { gitGraphPreset } from './gitgraph-themes.ts'
import { syntaxMask } from './syntax.ts'

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
  const chart = readChronology(source, '')
  if (!chart) return
  const rows = commands([chart.header, ...chart.rows].join('\n'))
  const header = /^gitGraph(?:\s+(LR|TB|BT))?\s*:?$/.exec(rows.shift() ?? '')
  if (!header || rows.length > 450) return
  const config = settings(options)
  const operations: GitGraphOperation[] = []
  for (const row of rows) {
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
    operations, title: chart.title, accessibleTitle: chart.accessibleTitle, description: chart.description,
    direction: header[1] as GitGraphDirection | undefined,
    mainBranchName: typeof config.mainBranchName === 'string' ? config.mainBranchName : undefined,
    mainBranchOrder: typeof config.mainBranchOrder === 'number' ? config.mainBranchOrder : undefined,
    titleTopMargin: diagramPixels(config.titleTopMargin),
    parallelCommits: Boolean(config.parallelCommits), showBranches: config.showBranches !== false, showCommitLabel: config.showCommitLabel !== false,
    rotateCommitLabel: config.rotateCommitLabel !== false,
  }
}

export function buildGitHistory(source: string, options?: unknown): GitHistory | undefined {
  const chart = parseGitHistory(source, options)
  if (chart) return buildHistory(chart)
}

export function gitGraph(source: string, idPrefix: string, options: MermaidOptions = {}): string | undefined {
  const chart = parseGitHistory(source, options.gitGraph)
  if (!chart) return
  const variables = settings(options.themeVariables)
  const preset = gitGraphPreset(options.theme)
  const color = (key: string) => typeof variables[key] === 'string' ? variables[key] as string : undefined
  const palette = (prefix: string, defaults?: readonly string[], fallback?: string) =>
    Array.from({ length: 8 }, (_, index) => color(`${prefix}${index}`) ?? fallback ?? defaults?.[index])
  const colors = palette('git', preset?.branches)
  return gitGraphChart({
    ...chart, idPrefix, title: chart.title || (typeof options.title === 'string' ? options.title : ''),
    colors,
    branchLabelColors: palette('gitBranchLabel', preset?.branchText, color('branchLabelColor')),
    branchLabelBackgrounds: preset ? colors : undefined,
    highlightColors: palette('gitInv', preset?.highlights),
    background: color('background') ?? preset?.background,
    titleColor: color('titleColor') ?? color('textColor') ?? preset?.title,
    commitLabel: {
      color: color('commitLabelColor') ?? preset?.commit.color,
      background: color('commitLabelBackground') ?? preset?.commit.background,
      fontSize: diagramPixels(variables.commitLabelFontSize) ?? preset?.commit.fontSize,
    },
    tagLabel: {
      color: color('tagLabelColor') ?? preset?.tag.color,
      background: color('tagLabelBackground') ?? preset?.tag.background,
      border: color('tagLabelBorder') ?? preset?.tag.border,
      fontSize: diagramPixels(variables.tagLabelFontSize) ?? preset?.tag.fontSize,
    },
  })
}
