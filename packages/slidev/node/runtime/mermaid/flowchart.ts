import type { FlowchartEdge, FlowchartMarker, FlowchartShape, FlowchartStyle } from 'ts-charts/diagrams'
import { flowchartDiagram } from 'ts-charts/diagrams'
import { syntaxMask } from './syntax.ts'

const directions = { TD: 'down', TB: 'down', BT: 'up', LR: 'right', RL: 'left' } as const
type Direction = keyof typeof directions
interface ChartNode { label: string, shape: FlowchartShape }
interface Cluster { label: string, members: Set<string>, depth: number }

const shapes: [string, string, FlowchartShape][] = [
  ['[(', ')]', 'database'], ['([', '])', 'stadium'], ['[[', ']]', 'double'], ['((', '))', 'circle'],
  ['{{', '}}', 'hexagon'], ['[', ']', 'box'], ['(', ')', 'rounded'], ['{', '}', 'diamond'],
]
const edgeToken = /(?:--\s+\S.*?\s+-->|-\.\s+\S.*?\s+\.->|==\s+\S.*?\s+==>|<-->|--+>|-\.->|==+>|--+[ox]|---+|-\.-|===+)/g

function statements(source: string): string[] {
  const rows: string[] = []
  for (const line of source.split('\n')) {
    const mask = syntaxMask(line)
    const comment = mask.indexOf('%%')
    const end = comment < 0 ? line.length : comment
    let start = 0
    for (const match of mask.slice(0, end).matchAll(/;/g)) {
      rows.push(line.slice(start, match.index).trim())
      start = match.index + 1
    }
    rows.push(line.slice(start, end).trim())
  }
  return rows.filter(Boolean)
}

function svgStyle(value: string): FlowchartStyle {
  const style: FlowchartStyle = {}
  for (const definition of value.split(',')) {
    const [, key, setting] = /^(fill|stroke|color|stroke-width|stroke-dasharray)\s*:\s*(.+)$/.exec(definition.trim()) ?? []
    switch (key) {
      case 'fill':
      case 'stroke':
      case 'color':
        style[key] = setting
        break
      case 'stroke-width':
        if (/^[\d.]+(?:px)?$/.test(setting)) style.strokeWidth = Number.parseFloat(setting)
        break
      case 'stroke-dasharray':
        style.strokeDasharray = setting
        break
    }
  }
  return style
}

export function flowchart(source: string, marker: string): string | undefined {
  const rows = statements(source)
  const header = rows.shift() ?? ''
  const [, flowDirection] = /^(?:flowchart|graph)(?:\s+(TD|TB|LR|RL|BT))?$/.exec(header) ?? []
  const state = /^stateDiagram(?:-v2)?$/.test(header)
  if (!state && !/^(?:flowchart|graph)(?:\s+(?:TD|TB|LR|RL|BT))?$/.test(header)) return
  let direction = (flowDirection ?? 'TB') as Direction
  let accessibleTitle: string | undefined
  const nodes = new Map<string, ChartNode>()
  const edges: FlowchartEdge[] = []
  const clusters: Cluster[] = []
  const nesting: Cluster[] = []
  const classes = new Map<string, FlowchartStyle>()
  const styles = new Map<string, FlowchartStyle>()
  const assignments = new Map<string, string>()

  function node(value: string, from = false): string | undefined {
    value = value.trim()
    if (state && value === '[*]') {
      const id = from ? '$start' : '$end'
      nodes.set(id, { label: '', shape: 'state' })
      return id
    }
    const [, fullId, description, assigned] = /^([\w-]+)\s*(.*?)(?::::([\w-]+))?$/.exec(value) ?? []
    if (!fullId) return
    const body = description.trim()
    if (body) {
      const shape = shapes.find(([open, close]) => body.startsWith(open) && body.endsWith(close))
      if (!shape) return
      const [open, close, kind] = shape
      nodes.set(fullId, { label: body.slice(open.length, -close.length), shape: kind })
    }
    else if (!nodes.has(fullId)) nodes.set(fullId, { label: fullId, shape: state ? 'rounded' : 'box' })
    if (assigned) assignments.set(fullId, assigned)
    for (const group of nesting) group.members.add(fullId)
    return fullId
  }

  function nodeSet(value: string, from: boolean): string[] | undefined {
    const result: string[] = []
    let start = 0
    for (const match of syntaxMask(value).matchAll(/&|$/g)) {
      const id = node(value.slice(start, match.index), from)
      if (!id) return
      result.push(id)
      start = match.index + 1
    }
    return result
  }

  for (const statement of rows) {
    const [, dir] = /^direction\s+(TD|TB|LR|RL|BT)$/.exec(statement) ?? []
    if (dir) {
      if (!nesting.length) direction = dir as Direction
      continue
    }
    if (statement.startsWith('accTitle:')) {
      accessibleTitle = statement.slice(9).trim()
      continue
    }
    const [, groupName, groupLabel] = /^subgraph\s+([^[]+?)(?:\s*\[(.+)\])?$/.exec(statement) ?? []
    if (groupName) {
      if (nesting.length >= 8) return
      const group = { label: groupLabel ?? groupName, members: new Set<string>(), depth: nesting.length }
      clusters.push(group)
      nesting.push(group)
      continue
    }
    if (statement === 'end') {
      if (!nesting.pop()) return
      continue
    }
    const [, styling, classId, declarations] = /^(classDef|style)\s+([\w,-]+)\s+(.+)$/.exec(statement) ?? []
    if (styling) {
      const target = styling === 'classDef' ? classes : styles
      for (const id of classId.split(',')) target.set(id, svgStyle(declarations))
      continue
    }
    const [, named, className] = /^class\s+([\w, -]+)\s+([\w-]+)$/.exec(statement) ?? []
    if (named) {
      for (const id of named.split(',')) assignments.set(id.trim(), className)
      continue
    }

    let row = statement
    let stateLabel = ''
    if (state) {
      const alias = /^state\s+"([^"]+)"\s+as\s+([\w-]+)$/.exec(row)
      if (alias) {
        const id = node(alias[2])
        if (!id) return
        nodes.set(id, { label: alias[1], shape: 'rounded' })
        continue
      }
      const colon = syntaxMask(row).indexOf(':')
      if (colon >= 0) {
        stateLabel = row.slice(colon + 1).trim()
        row = row.slice(0, colon).trim()
        if (!row.includes('-->')) {
          const id = node(row)
          if (!id) return
          nodes.set(id, { label: stateLabel, shape: 'rounded' })
          continue
        }
      }
    }

    const matches = [...syntaxMask(row).matchAll(edgeToken)].filter(match => match.index !== undefined)
    if (!matches.length) {
      if (!node(row)) return
      continue
    }
    const first = nodeSet(row.slice(0, matches[0].index), true)
    if (!first) return
    let from = first
    for (const [index, match] of matches.entries()) {
      const expression = row.slice(match.index, match.index + match[0].length)
      const style = expression.startsWith('-.') ? 'dotted' : expression.startsWith('=') ? 'thick' : 'normal'
      let rest = row.slice(match.index + match[0].length, matches[index + 1]?.index).trim()
      const inPipe = /^\|([^|]*)\|\s*/.exec(rest)
      if (inPipe) rest = rest.slice(inPipe[0].length)
      const label = inPipe?.[1] ?? /^(?:--|-\.(?:\s*)|==)\s+(.+?)\s+(?:-->|\.->|==>)$/.exec(expression)?.[1] ?? stateLabel
      const end: FlowchartMarker = expression.endsWith('>') ? 'arrow' : expression.endsWith('x') ? 'cross' : expression.endsWith('o') ? 'circle' : 'none'
      const to = nodeSet(rest, false)
      if (!to) return
      for (const source of from) {
        for (const target of to) edges.push({ from: source, to: target, label, style, start: expression.startsWith('<') ? 'arrow' : 'none', end })
      }
      if (edges.length > 600) return
      from = to
    }
  }
  if (nesting.length) return
  return flowchartDiagram({
    nodes: [...nodes].map(([id, item]) => ({
      id, ...item, style: { ...classes.get(assignments.get(id) ?? 'default'), ...styles.get(id) },
    })),
    edges,
    groups: clusters.filter(group => group.members.size).map(group => ({ ...group, members: [...group.members] })),
    kind: state ? 'state' : 'flowchart',
    idPrefix: marker,
    direction: directions[direction],
    routing: 'orthogonal',
    accessibleTitle,
  })
}
