import type { MermaidOptions } from '../authoring-setup.ts'
import { diagramOptionsRecord } from '../diagram-options.ts'
import { treemapSvg } from '../treemap.ts'
import { decodeDiagramEntities, readChronology } from './chronology.ts'
import { syntaxMask } from './syntax.ts'

interface Item {
  label: string
  value?: number
  className?: string
  children?: Item[]
}

function classStyle(source: string): Record<string, string> {
  const style: Record<string, string> = Object.create(null)
  const mask = syntaxMask(source, true)
  let start = 0
  const separators = [...mask.matchAll(/,/g)].map(match => match.index)
  for (const end of [...separators, source.length]) {
    const field = source.slice(start, end)
    const [, key, value] = /^\s*([a-z-]+)\s*:\s*(.*?)\s*$/.exec(field) ?? []
    if (key && value) style[key] = value
    start = end + 1
  }
  return style
}

export function treemapDiagram(source: string, marker: string, options: MermaidOptions): string | undefined {
  const chart = readChronology(source, typeof options.title === 'string' ? options.title : '', {
    singleQuotes: true, entities: true, preserveIndent: true,
  })
  if (!chart || !/^treemap(?:-beta)?\s*;?$/i.test(chart.header)) return
  const nodes: Item[] = []
  const parent: { indent: number, node: Item }[] = [{ indent: -1, node: { label: 'Treemap', children: nodes } }]
  const classes = new Map<string, Record<string, string>>()
  for (const row of chart.rows) {
    const text = row.trim().replace(/;$/, '').trimEnd()
    const [, classId, declarations] = /^classDef\s+([\w-]+)\s+(.+)$/.exec(text) ?? []
    if (classId) {
      classes.set(classId, { ...classes.get(classId), ...classStyle(declarations) })
      continue
    }
    const match = /^(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')(?:\s*[:,]\s*([\d.,_]+))?(?:\s*:::\s*([\w-]+))?$/.exec(text)
    if (!match) return
    const [, double, single, raw, className] = match
    const label = decodeDiagramEntities((double ?? single).replace(/\\(["'\\])/g, '$1'))
    const indent = (row.match(/^[ \t]*/)?.[0] ?? '').replaceAll('\t', '    ').length
    const node: Item = { label, className }
    if (raw === undefined) node.children = []
    else {
      if (!/^(?:\d+(?:[,_]\d+)*(?:\.\d+)?|\.\d+)$/.test(raw)) return
      node.value = Number(raw.replace(/[,_]/g, ''))
    }
    while (parent.at(-1)!.indent >= indent) parent.pop()
    const siblings = parent.at(-1)!.node.children
    if (!siblings) return
    siblings.push(node)
    parent.push({ indent, node })
  }
  return treemapSvg({
    ...diagramOptionsRecord(options.treemap),
    nodes, idPrefix: marker, title: chart.title, accessibleTitle: chart.accessibleTitle, description: chart.description,
    theme: options.theme, themeVariables: options.themeVariables, fontFamily: options.fontFamily,
  }, classes)
}
