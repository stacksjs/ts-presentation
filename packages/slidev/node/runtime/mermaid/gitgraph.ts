import type { GitCommitStyle, GitGraphDirection, GitGraphOperation, GitGraphOptions, GitHistory } from 'ts-charts/diagrams'
import { buildGitHistory as buildHistory, gitGraphChart } from 'ts-charts/diagrams'
import type { MermaidOptions } from '../authoring-setup.ts'
import { decodeDiagramEntities, diagramFontFamily, diagramPixels, maskDiagramEntities, readChronology, sizeChronologySvg } from './chronology.ts'
import { gitGraphLabelEffects, gitGraphPreset, gitGraphStyleIndex, gitGraphThemeFamily, reduxBranchColors, usesReduxBranchColors } from './gitgraph-themes.ts'
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
    for (const stop of maskDiagramEntities(mask.slice(0, end)).matchAll(/;/g)) {
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
  while (piece.lastIndex < source.length) {
    const value = piece.exec(source)
    if (!value) return
    const [, quoted, single, keyword, separator] = value
    const text = quoted ?? single
    parts.push({ value: keyword ?? separator ?? text.replace(/\\(["'\\])/g, '$1'), quoted: text !== undefined })
  }
  return parts
}

function fields(raw: Token[], permitted: string[], recover?: 'commit' | 'merge'): Map<string, string[]> | undefined {
  const result = new Map<string, string[]>()
  const allowMessage = permitted.includes('msg')
  for (let cursor = 0; cursor < raw.length;) {
    const token = raw[cursor++]
    if (allowMessage && token.quoted) {
      if (result.has('msg')) return
      result.set('msg', [decodeDiagramEntities(token.value)])
      continue
    }
    const key = token.value
    const separator = raw[cursor++]
    const value = raw[cursor++]
    if (token.quoted || !/^[\w-]+$/.test(key) || separator?.quoted || separator?.value !== ':' || !value
      || (!value.quoted && value.value === ':')) return
    if (!permitted.includes(key)) {
      if (!recover) return
      console.warn(`GitGraph ${recover} ignores unknown property "${key}"`)
      continue
    }
    if ((result.has(key) && key !== 'tag') || (key === 'msg' && !value.quoted)) return
    const values = result.get(key) ?? []
    values.push(key === 'type' || key === 'order' ? value.value : decodeDiagramEntities(value.value))
    result.set(key, values)
  }
  return result
}

function settings(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function parseGitHistory(source: string, config: Record<string, unknown>): GitGraphOptions | undefined {
  const chart = readChronology(logicalLines(source), '', { singleQuotes: true, entities: true })
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
    const first = argument && (argument.quoted || argument.value !== ':') ? decodeDiagramEntities(argument.value) : undefined
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
      operations.push({ op, commit, parent: attrs?.get('parent')?.[0] || undefined, tags: attrs?.get('tag') })
      continue
    }
    if (op === 'commit' || op === 'merge') {
      const attrs = op === 'commit'
        ? fields(fieldsForLine.slice(1), ['id', 'tag', 'type', 'msg'], op)
        : fields(rest, ['id', 'tag', 'type'], op)
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
  const mainOrder = typeof config.mainBranchOrder === 'number' && Number.isFinite(config.mainBranchOrder) ? config.mainBranchOrder : 0
  return {
    operations, title: chart.title, accessibleTitle: chart.accessibleTitle, description: chart.description,
    direction: header[1] as GitGraphDirection | undefined,
    duplicateCommitIds: 'latest',
    cherryPickSourceParent: true,
    allowMergeFromInheritedHead: false,
    mainBranchName: typeof config.mainBranchName === 'string' ? config.mainBranchName : undefined,
    mainBranchOrder: mainOrder,
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
  const family = gitGraphThemeFamily(options.theme)
  const coloredBranches = usesReduxBranchColors(options.theme)
  const dark = options.theme === 'redux-dark-color'
  const color = (key: string) => typeof variables[key] === 'string' ? variables[key] as string : undefined
  const borderColors = Array.isArray(variables.borderColorArray) && variables.borderColorArray.length
    ? variables.borderColorArray : reduxBranchColors
  const laneColor = (slot: number) => {
    const border = borderColors[slot % borderColors.length]
    return typeof border === 'string' ? border : reduxBranchColors[slot % reduxBranchColors.length]
  }
  const laneCount = 1 + chart.operations.filter(operation => operation.op === 'branch').length
  const palette = (paint: (slot: number) => string | undefined, labels = false) => Array.from({ length: laneCount }, (_, lane) =>
    paint(gitGraphStyleIndex(lane, options.theme, labels, variables.THEME_COLOR_LIMIT)))
  const nodeBorder = color('nodeBorder') ?? preset?.nodeBorder
  const symbolDetail = color(family === 'classic' ? 'primaryColor' : 'mainBkg') ?? preset?.symbolDetailColor
  const strokeWidth = diagramPixels(variables.strokeWidth) ?? preset?.strokeWidth
  const themedColor = (slot: number) => family === 'redux' ? coloredBranches && slot ? laneColor(slot) : nodeBorder
    : family === 'neo' && slot === 0 ? nodeBorder : undefined
  const colors = palette(slot => color(`git${slot}`) ?? themedColor(slot) ?? preset?.branches[slot])
  const labelBackground = typeof options.themeCSS === 'string' && options.themeCSS.trim() ? 'transparent' : undefined
  const svg = gitGraphChart({
    ...chart, idPrefix, title: chart.title || (typeof options.title === 'string' ? options.title : ''),
    fontFamily: diagramFontFamily(options.fontFamily, variables.fontFamily),
    ...gitGraphLabelEffects(options.theme, options.look, variables, strokeWidth),
    diagramPadding: chart.diagramPadding ?? (preset ? 8 : undefined),
    truncateLabels: false,
    edgeLayout: 'orthogonal',
    tagLayout: 'stacked',
    geometry: preset ? family === 'redux' ? 'compact' : 'classic' : undefined,
    branchLine: {
      color: color('commitLineColor') ?? color('lineColor') ?? preset?.railColor,
      width: strokeWidth ?? (preset ? 1 : undefined),
      pattern: preset ? family === 'classic' ? 'dotted' : 'dashed' : undefined,
    },
    edgeWidth: family === 'redux' ? strokeWidth ?? 2 : preset ? 8 : undefined,
    symbolDetailColor: symbolDetail,
    colors,
    branchLabelColors: palette(slot => color(`gitBranchLabel${slot}`) ?? color('branchLabelColor')
      ?? (family === 'redux' || (family === 'neo' && slot === 0) ? nodeBorder : preset?.branchText[slot % 8]), true),
    branchLabelBackgrounds: family === 'redux'
      ? palette(slot => coloredBranches && !dark && slot ? laneColor(slot) : symbolDetail, true)
      : family === 'neo' ? palette(() => symbolDetail, true)
        : preset ? colors : labelBackground ? colors.map(color => color ?? labelBackground) : undefined,
    branchLabelBorders: family === 'redux' ? palette(slot => themedColor(slot), true)
      : family === 'neo' ? palette(() => nodeBorder, true) : undefined,
    highlightColors: palette(slot => color(`gitInv${slot}`) ?? themedColor(slot) ?? preset?.highlights[slot]),
    background: color('background') ?? preset?.background,
    titleColor: color('titleColor') ?? color('textColor') ?? preset?.title,
    commitLabel: {
      color: color('commitLabelColor') ?? (family === 'classic' ? preset?.commit.color : nodeBorder),
      background: color('commitLabelBackground') ?? (family === 'classic' ? preset?.commit.background ?? labelBackground : labelBackground),
      fontSize: diagramPixels(variables.commitLabelFontSize) ?? preset?.commit.fontSize,
    },
    tagLabel: {
      shape: 'tag',
      color: color('tagLabelColor') ?? preset?.tag.color,
      background: color('tagLabelBackground') ?? (family === 'classic' ? preset?.tag.background ?? labelBackground : symbolDetail),
      border: color('tagLabelBorder') ?? (family === 'classic' ? preset?.tag.border : nodeBorder),
      fontSize: diagramPixels(variables.tagLabelFontSize) ?? preset?.tag.fontSize,
      holeColor: color('textColor') ?? preset?.tag.holeColor,
    },
  })
  return sizeChronologySvg(svg, config.useMaxWidth)
}
