import type { MermaidOptions } from '../authoring-setup.ts'
import { diagramOptionsRecord } from '../diagram-options.ts'
import { mindmapSvg } from '../mindmap.ts'
import { decodeDiagramEntities, readChronology } from './chronology.ts'

interface Item {
  id?: string
  label: string
  shape?: string
  markdown?: boolean
  classes?: string
  icon?: string
  children: Item[]
}

const delimiters = [
  ['((', '))', 'circle'],
  ['))', '((', 'bang'],
  ['{{', '}}', 'hexagon'],
  ['[', ']', 'square'],
  ['(', ')', 'rounded'],
  [')', '(', 'cloud'],
] as const

function readNode(source: string): Item | undefined {
  const [, id, clause] = /^([\w-]+)([()[{].*)$/us.exec(source) ?? []
  if (!clause) return { label: decodeDiagramEntities(source), children: [] }
  const delimiter = delimiters.find(([open]) => clause.startsWith(open))
  if (!delimiter || !clause.endsWith(delimiter[1])) return
  const [open, close, shape] = delimiter
  let label = clause.slice(open.length, -close.length).trim()
  const quoted = /^"(.*)"$/s.exec(label)
  if (quoted) label = quoted[1].replace(/\\(["\\])/g, '$1')
  const markdown = !!quoted && /^`.*`$/s.test(label)
  if (markdown) label = label.slice(1, -1)
  return { id, label: decodeDiagramEntities(label), shape, markdown, children: [] }
}

export function mindmapDiagram(source: string, marker: string, options: MermaidOptions): string | undefined {
  // A quoted Markdown label can span source lines independent of indentation.
  const combined = source.replace(/"`(?:[^`\\]|\\[\s\S])*`"/g, label => label.replace(/\r?\n/g, '#10;'))
  const chart = readChronology(combined, typeof options.title === 'string' ? options.title : '', {
    entities: true, preserveIndent: true,
  })
  if (!chart || !/^mindmap\s*;?$/i.test(chart.header)) return
  const ancestors: { indent: number, node: Item }[] = []
  let root: Item | undefined
  let last: Item | undefined
  for (const row of chart.rows) {
    const text = row.trim()
    const classNames = /^:::\s*(.*)$/.exec(text)?.[1]
    const icon = /^::icon\(([^()]*)\)$/.exec(text)?.[1]
    if (classNames !== undefined || icon !== undefined) {
      if (!last) return
      if (classNames !== undefined) last.classes = [last.classes, classNames].filter(Boolean).join(' ')
      if (icon !== undefined) last.icon = icon
      continue
    }
    const node = readNode(text.replace(/;\s*$/, ''))
    if (!node) return
    const indent = (row.match(/^[\t ]*/)?.[0] ?? '').replaceAll('\t', '    ').length
    while (ancestors.length && ancestors.at(-1)!.indent >= indent) ancestors.pop()
    const parent = ancestors.at(-1)?.node
    if (parent) parent.children.push(node)
    else if (root) return
    else root = node
    last = node
    ancestors.push({ indent, node })
  }
  if (!root) return
  const settings = diagramOptionsRecord(options.mindmap)
  return mindmapSvg({
    ...settings, root, idPrefix: marker, title: chart.title, accessibleTitle: chart.accessibleTitle, description: chart.description,
    theme: options.theme, themeVariables: options.themeVariables, fontFamily: options.fontFamily, layout: options.layout,
  })
}
