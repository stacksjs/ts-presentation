import type { GitCommitStyle, GitGraphDirection, GitGraphOperation, GitGraphOptions, GitHistory } from 'ts-charts/diagrams'
import { buildGitHistory as buildHistory, gitGraphChart } from 'ts-charts/diagrams'
import type { MermaidOptions } from '../authoring-setup.ts'
import { diagramPixels, readChronology, sizeChronologySvg } from './chronology.ts'
import { gitGraphPreset } from './gitgraph-themes.ts'
import { syntaxMask } from './syntax.ts'

function logicalLines(source: string): string[] {
  const tokens = /^[ \t]*(?:(?:title\b|acc(?:Title|Descr)[ \t]*:)[^\r\n]*|accDescr[ \t]*\{[^}]*\})|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(?:%%|^[ \t]*#)[^\r\n]*|(\r?\n)/gim
  const lines: string[] = []
  let start = 0
  for (const match of source.matchAll(tokens)) {
    if (!match[1]) continue
    lines.push(source.slice(start, match.index))
    start = match.index + match[0].length
  }
  lines.push(source.slice(start))
  return lines
}

function commands(lines: string[]): string[] {
  return lines.flatMap((line) => {
    const mask = syntaxMask(line, true)
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

interface Token { value: string, quoted: boolean }

function lex(source: string): Token[] | undefined {
  const parts: Token[] = []
  const piece = /\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s:"']+)|(:))/gy
  while (source.slice(piece.lastIndex).trim()) {
    const value = piece.exec(source)
    if (!value) return
    const [, quoted, single, keyword, separator] = value
    const text = quoted ?? single
    parts.push({ value: keyword ?? separator ?? text.replace(/\\(["'\\])/g, '$1'), quoted: text !== undefined })
  }
  return parts
}

function fields(raw: Token[], permitted: string[]): Map<string, string[]> | undefined {
  const result = new Map<string, string[]>()
  const allowMessage = permitted.includes('msg')
  for (let cursor = 0; cursor < raw.length;) {
    const token = raw[cursor++]
    if (allowMessage && token.quoted) {
      if (result.has('msg')) return
      result.set('msg', [token.value])
      continue
    }
    const key = token.value
    const separator = raw[cursor++]
    const value = raw[cursor++]
    if (token.quoted || !permitted.includes(key) || separator?.quoted || separator?.value !== ':' || !value) return
    if ((result.has(key) && key !== 'tag') || (key === 'msg' && !value.quoted)) return
    const values = result.get(key) ?? []
    values.push(value.value)
    result.set(key, values)
  }
  return result
}

function settings(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function parseGitHistory(source: string, config: Record<string, unknown>): GitGraphOptions | undefined {
  const chart = readChronology(logicalLines(source), '', { singleQuotes: true })
  if (!chart) return
  const rows = commands([chart.header, ...chart.rows])
  const header = /^gitGraph(?:\s+(LR|TB|BT))?\s*:?$/.exec(rows.shift() ?? '')
  if (!header || rows.length > 450) return
  const operations: GitGraphOperation[] = []
  for (const row of rows) {
    const fieldsForLine = lex(row)
    if (!fieldsForLine?.length || fieldsForLine[0].quoted) return
    const [command, argument, ...rest] = fieldsForLine
    const op = command.value
    const first = argument?.value
    if (op === 'branch') {
      const attrs = fields(rest, ['order'])
      const order = attrs?.get('order')?.[0]
      if (!attrs || !first || (order !== undefined && (!/^-?\d+$/.test(order) || !Number.isSafeInteger(Number(order))))) return
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
      const attrs = op === 'commit'
        ? fields(fieldsForLine.slice(1), ['id', 'tag', 'type', 'msg'])
        : fields(rest, ['id', 'tag', 'type'])
      if (!attrs) return
      const commit = { id: attrs.get('id')?.[0] || undefined, tags: attrs.get('tag'), style: attrs.get('type')?.[0] as GitCommitStyle | undefined }
      if (op === 'merge') {
        if (!first) return
        operations.push({ op, branch: first, ...commit })
      }
      else operations.push({ op, message: attrs.get('msg')?.[0], ...commit })
      continue
    }
    return
  }
  // Imported diagrams give undeclared orders fractional positions based on
  // declaration order. Pass integer ranks to the native renderer.
  const mainOrder = typeof config.mainBranchOrder === 'number' && Number.isFinite(config.mainBranchOrder) ? config.mainBranchOrder : 0
  const branches = operations.filter(operation => operation.op === 'branch')
  const ordered = [{ branch: undefined, order: mainOrder }, ...branches.map((branch, index) => ({
    branch, order: branch.order ?? Number(`0.${index + 1}`),
  }))].sort((a, b) => a.order - b.order)
  for (const [index, { branch }] of ordered.entries()) {
    if (branch) branch.order = index
  }
  return {
    operations, title: chart.title, accessibleTitle: chart.accessibleTitle, description: chart.description,
    direction: header[1] as GitGraphDirection | undefined,
    duplicateCommitIds: 'latest',
    mainBranchName: typeof config.mainBranchName === 'string' ? config.mainBranchName : undefined,
    mainBranchOrder: ordered.findIndex(({ branch }) => !branch),
    titleTopMargin: diagramPixels(config.titleTopMargin),
    diagramPadding: diagramPixels(config.diagramPadding),
    parallelCommits: Boolean(config.parallelCommits), showBranches: config.showBranches !== false, showCommitLabel: config.showCommitLabel !== false,
    rotateCommitLabel: config.rotateCommitLabel !== false, showGeneratedOperationLabels: false,
  }
}

export function buildGitHistory(source: string, options?: unknown): GitHistory | undefined {
  const chart = parseGitHistory(source, settings(options))
  if (chart) return buildHistory(chart)
}

export function gitGraph(source: string, idPrefix: string, options: MermaidOptions = {}): string | undefined {
  const config = settings(options.gitGraph)
  const chart = parseGitHistory(source, config)
  if (!chart) return
  const variables = settings(options.themeVariables)
  const preset = gitGraphPreset(options.theme)
  const color = (key: string) => typeof variables[key] === 'string' ? variables[key] as string : undefined
  const palette = (prefix: string, defaults?: readonly string[], fallback?: string) =>
    Array.from({ length: 8 }, (_, index) => color(`${prefix}${index}`) ?? fallback ?? defaults?.[index])
  const colors = palette('git', preset?.branches)
  const labelBackground = typeof options.themeCSS === 'string' && options.themeCSS.trim() ? 'transparent' : undefined
  const svg = gitGraphChart({
    ...chart, idPrefix, title: chart.title || (typeof options.title === 'string' ? options.title : ''),
    truncateLabels: false,
    colors,
    branchLabelColors: palette('gitBranchLabel', preset?.branchText, color('branchLabelColor')),
    branchLabelBackgrounds: preset ? colors : labelBackground ? colors.map(color => color ?? labelBackground) : undefined,
    highlightColors: palette('gitInv', preset?.highlights),
    background: color('background') ?? preset?.background,
    titleColor: color('titleColor') ?? color('textColor') ?? preset?.title,
    commitLabel: {
      color: color('commitLabelColor') ?? preset?.commit.color,
      background: color('commitLabelBackground') ?? preset?.commit.background ?? labelBackground,
      fontSize: diagramPixels(variables.commitLabelFontSize) ?? preset?.commit.fontSize,
    },
    tagLabel: {
      color: color('tagLabelColor') ?? preset?.tag.color,
      background: color('tagLabelBackground') ?? preset?.tag.background ?? labelBackground,
      border: color('tagLabelBorder') ?? preset?.tag.border,
      fontSize: diagramPixels(variables.tagLabelFontSize) ?? preset?.tag.fontSize,
    },
  })
  return sizeChronologySvg(svg, config.useMaxWidth)
}
