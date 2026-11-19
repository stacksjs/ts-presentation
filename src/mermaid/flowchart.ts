import { edgePath, layeredLayout } from 'ts-charts/layered'
import { escapeHtml } from '../html.ts'
import { arrows, diagramSvg, labelLines, svgText, syntaxMask } from './svg.ts'

const directions = { TD: 'down', TB: 'down', BT: 'up', LR: 'right', RL: 'left' } as const
type Direction = keyof typeof directions
type Shape = 'rect' | 'round' | 'diamond' | 'circle' | 'stadium' | 'database' | 'double' | 'hexagon' | 'state'
type Arrow = 'arrow' | 'circle' | 'cross' | 'none'
interface ChartNode { label: string, shape: Shape }
interface ChartEdge { source: string, target: string, label: string, style: 'dotted' | 'thick' | 'normal', start: Arrow, end: Arrow }
interface Cluster { label: string, members: Set<string>, depth: number }

const shapes: [string, string, Shape][] = [
  ['[(', ')]', 'database'], ['([', '])', 'stadium'], ['[[', ']]', 'double'], ['((', '))', 'circle'],
  ['{{', '}}', 'hexagon'], ['[', ']', 'rect'], ['(', ')', 'round'], ['{', '}', 'diamond'],
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

function svgStyle(value: string): string {
  const properties: string[] = []
  for (const definition of value.split(',')) {
    const [, name, color] = /^(fill|stroke|color|stroke-width|stroke-dasharray)\s*:\s*(.+)$/.exec(definition.trim()) ?? []
    if (!name) continue
    const safe = name === 'stroke-width' || name === 'stroke-dasharray'
      ? /^[\d. ]+(?:px)?$/.test(color)
      : /^(?:#[\da-f]{3,8}|[a-z]{1,24})$/i.test(color)
    if (safe) properties.push(`--diagram-${name}:${color}`)
  }
  return properties.join(';')
}

function shapeMarkup(node: ChartNode, x: number, y: number, w: number, h: number): string {
  const cx = x + w / 2
  const cy = y + h / 2
  const rect = (rx: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`
  switch (node.shape) {
    case 'diamond':
      return `<polygon points="${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}"/>`
    case 'circle':
    case 'state':
      return `<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}"/>`
    case 'stadium':
      return rect(h / 2)
    case 'database':
      return `<path d="M${x} ${y + 9}a${w / 2} 9 0 0 1 ${w} 0v${h - 18}a${w / 2} 9 0 0 1 -${w} 0z M${x} ${y + 9}a${w / 2} 9 0 0 0 ${w} 0"/>`
    case 'double':
      return rect(4) + `<path d="M${x + 8} ${y}v${h}M${x + w - 8} ${y}v${h}"/>`
    case 'hexagon':
      return `<polygon points="${x + 16},${y} ${x + w - 16},${y} ${x + w},${cy} ${x + w - 16},${y + h} ${x + 16},${y + h} ${x},${cy}"/>`
    default:
      return rect(node.shape === 'round' ? 12 : 4)
  }
}

export function flowchart(source: string, marker: string): string | undefined {
  const rows = statements(source)
  const header = rows.shift() ?? ''
  const [, flowDirection] = /^(?:flowchart|graph)(?:\s+(TD|TB|LR|RL|BT))?$/.exec(header) ?? []
  const state = /^stateDiagram(?:-v2)?$/.test(header)
  if (!state && !/^(?:flowchart|graph)(?:\s+(?:TD|TB|LR|RL|BT))?$/.test(header)) return
  let direction = (flowDirection ?? 'TB') as Direction
  let title = state ? 'State diagram' : 'Flowchart'
  const nodes = new Map<string, ChartNode>()
  const edges: ChartEdge[] = []
  const clusters: Cluster[] = []
  const nesting: Cluster[] = []
  const classes = new Map<string, string>()
  const styles = new Map<string, string>()
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
    else if (!nodes.has(fullId)) nodes.set(fullId, { label: fullId, shape: state ? 'round' : 'rect' })
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
      title = statement.slice(9).trim()
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
        nodes.set(id, { label: alias[1], shape: 'round' })
        continue
      }
      const colon = syntaxMask(row).indexOf(':')
      if (colon >= 0) {
        stateLabel = row.slice(colon + 1).trim()
        row = row.slice(0, colon).trim()
        if (!row.includes('-->')) {
          const id = node(row)
          if (!id) return
          nodes.set(id, { label: stateLabel, shape: 'round' })
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
      const end: Arrow = expression.endsWith('>') ? 'arrow' : expression.endsWith('x') ? 'cross' : expression.endsWith('o') ? 'circle' : 'none'
      const to = nodeSet(rest, false)
      if (!to) return
      for (const source of from) {
        for (const target of to) edges.push({ source, target, label, style, start: expression.startsWith('<') ? 'arrow' : 'none', end })
      }
      if (edges.length > 600) return
      from = to
    }
  }
  if (nesting.length || !nodes.size || nodes.size > 180) return

  const orientation = directions[direction]
  const layout = layeredLayout({
    nodes: [...nodes].map(([id, item]) => {
      const lines = labelLines(item.label)
      const width = Math.max(88, ...lines.map(line => line.length * 8 + (item.shape === 'diamond' ? 52 : 35)))
      const height = Math.max(item.shape === 'diamond' ? 74 : 48, lines.length * 16 + 26)
      if (item.shape === 'state') return { id, width: 26, height: 26 }
      if (item.shape === 'circle') return { id, width, height: width }
      return { id, width, height }
    }),
    edges,
  }, { direction: orientation, padding: clusters.length ? 48 + Math.max(...clusters.map(group => group.depth)) * 12 : 20, layerGap: 62, nodeGap: 36 })

  const boxesById = new Map(layout.nodes.map(box => [box.id, box]))
  const backdrops = clusters.map((group) => {
    const members = [...group.members].map(id => boxesById.get(id)).filter(box => box !== undefined)
    if (!members.length) return ''
    const inset = 16 + Math.max(0, ...clusters.map(cluster => cluster.depth - group.depth)) * 10
    const x = Math.min(...members.map(box => box.x)) - inset
    const y = Math.min(...members.map(box => box.y)) - inset - 13
    const right = Math.max(...members.map(box => box.x + box.width)) + inset
    const bottom = Math.max(...members.map(box => box.y + box.height)) + inset
    return `<g class="diagram-cluster"><rect x="${x}" y="${y}" width="${right - x}" height="${bottom - y}" rx="8"/>${svgText(group.label, x + 12, y + 16, 'diagram-cluster-label', 'start')}</g>`
  })
  const descriptions = new Map<string, ChartEdge[]>()
  for (const edge of edges) {
    const key = `${edge.source}\0${edge.target}`
    const list = descriptions.get(key) ?? []
    list.push(edge)
    descriptions.set(key, list)
  }
  const tip = (kind: Arrow) => kind === 'arrow' ? marker : `${marker}-${kind}`
  const connectors = layout.edges.map((edge) => {
    const item = descriptions.get(`${edge.source}\0${edge.target}`)?.shift()
    if (!item) return ''
    const shape = edgePath(edge.points, { direction: orientation, curve: 'orthogonal' })
    const start = item.start !== 'none' ? ` marker-start="url(#${tip(item.start)})"` : ''
    const end = item.end !== 'none' ? ` marker-end="url(#${tip(item.end)})"` : ''
    const center = Math.floor(edge.points.length / 2)
    const left = edge.points[Math.max(0, center - 1)]
    const right = edge.points[center] ?? left
    const label = item.label && left && right ? svgText(item.label, (left.x + right.x) / 2, (left.y + right.y) / 2 - 10, 'diagram-edge-label') : ''
    return `<path class="diagram-edge diagram-edge-${item.style}" d="${shape}"${start}${end}/>${label}`
  })
  const boxes = layout.nodes.map((box) => {
    const item = nodes.get(box.id)!
    const { x, y, width, height } = box
    const style = [classes.get(assignments.get(box.id) ?? 'default'), styles.get(box.id)].filter(Boolean).join(';')
    const label = svgText(item.label, x + width / 2, y + height / 2, 'diagram-node-label')
    return `<g class="diagram-node diagram-node-${item.shape}"${style ? ` style="${escapeHtml(style)}"` : ''}>${shapeMarkup(item, x, y, width, height)}${label}</g>`
  })
  return diagramSvg(title, layout.width, layout.height, arrows(marker) + backdrops.join('') + connectors.join('') + boxes.join(''))
}
