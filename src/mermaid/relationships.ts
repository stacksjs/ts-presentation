import { edgePath, layeredLayout } from 'ts-charts/layered'
import { arrows, diagramSvg, svgText } from './svg.ts'

const directions = { TD: 'down', TB: 'down', BT: 'up', LR: 'right', RL: 'left' } as const
const classRelation = /^([\w$-]+)\s*(?:"([^"]+)"\s*)?(<\||[<*o])?(--|\.\.)(\|>|[>*o])?\s*(?:"([^"]+)"\s*)?([\w$-]+)\s*(?::\s*(.+))?$/
const entityRelation = /^("[^"]+"|[\w-]+)\s+(\|\||\|o|[}][o|])(--|\.\.)(\|\||o\||[o|][{])\s+("[^"]+"|[\w-]+)\s*:\s*(.+)$/
const erEnds: Record<string, string> = { '||': 'one', '|o': 'zero-one', 'o|': 'zero-one', '}|': 'many', '|{': 'many', '}o': 'zero-many', 'o{': 'zero-many' }
const classEnds: Record<string, string> = { '<': 'arrow', '>': 'arrow', '<|': 'triangle', '|>': 'triangle', '*': 'composition', o: 'aggregation' }

interface Card { name: string, fields: string[], operations: string[], annotation?: string }
interface Relation { source: string, target: string, label: string, start?: string, end?: string, dashed: boolean, leftCount?: string, rightCount?: string }

function markers(id: string): string {
  const geometry = {
    triangle: '<path class="diagram-marker-open" d="M4 1L16 7L4 13Z"/>',
    composition: '<path class="diagram-marker-solid" d="M2 7L9 2L16 7L9 12Z"/>',
    aggregation: '<path class="diagram-marker-open" d="M2 7L9 2L16 7L9 12Z"/>',
    one: '<path class="diagram-edge" d="M7 2v10m5-10v10"/>',
    'zero-one': '<path class="diagram-edge" d="M12 2v10"/><circle class="diagram-marker-open" cx="6" cy="7" r="3"/>',
    many: '<path class="diagram-edge" d="M4 2v10m4-5 8-5m-8 5 8 5"/>',
    'zero-many': '<path class="diagram-edge" d="M8 7l8-5M8 7l8 5"/><circle class="diagram-marker-open" cx="4" cy="7" r="3"/>',
  }
  return `<defs>${Object.entries(geometry).map(([kind, svg]) =>
    `<marker id="${id}-${kind}" viewBox="0 0 17 14" refX="16" refY="7" markerWidth="17" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto-start-reverse">${svg}</marker>`,
  ).join('')}</defs>`
}

export function relationshipsDiagram(source: string, marker: string): string | undefined {
  const rows = source.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('%%'))
  const language = rows.shift()
  if (language !== 'classDiagram' && language !== 'erDiagram') return
  const entity = language === 'erDiagram'
  let title = entity ? 'Entity relationship diagram' : 'Class diagram'
  let direction: keyof typeof directions = 'TB'
  const cards = new Map<string, Card>()
  const edges: Relation[] = []
  let open: Card | undefined
  function card(id: string, name?: string): Card {
    const clean = id.replace(/^"|"$/g, '')
    const record = cards.get(clean) ?? { name: clean, fields: [], operations: [] }
    if (name) record.name = name
    cards.set(clean, record)
    return record
  }
  function member(record: Card, value: string): void {
    const annotation = /^<<(.+)>>$/.exec(value)
    if (annotation) record.annotation = annotation[1]
    else if (!entity && value.includes('(')) record.operations.push(value)
    else record.fields.push(value)
  }

  for (const row of rows) {
    if (open) {
      if (row === '}') open = undefined
      else member(open, row)
      continue
    }
    const [, dir] = /^direction\s+(TB|TD|BT|LR|RL)$/.exec(row) ?? []
    if (dir) { direction = dir as keyof typeof directions; continue }
    if (row.startsWith('accTitle:')) { title = row.slice(9).trim(); continue }
    if (entity) {
      const relation = entityRelation.exec(row)
      if (relation) {
        const [, from, left, line, right, to, label] = relation
        card(from)
        card(to)
        edges.push({ source: from.replace(/^"|"$/g, ''), target: to.replace(/^"|"$/g, ''), label, start: erEnds[left], end: erEnds[right], dashed: line === '..' })
        continue
      }
      const [, id, alias, body] = /^("[^"]+"|[\w-]+)(?:\s*\["?([^"\]]+)"?\])?(?:\s*([{]))?$/.exec(row) ?? []
      if (!id) return
      const record = card(id, alias)
      if (body) open = record
      continue
    }
    const relation = classRelation.exec(row)
    if (relation) {
      const [, from, leftCount, left, line, right, rightCount, to, label] = relation
      card(from)
      card(to)
      edges.push({ source: from, target: to, label: label ?? '', start: classEnds[left], end: classEnds[right], dashed: line === '..', leftCount, rightCount })
      continue
    }
    const declaration = /^class\s+([\w$-]+)(?:\s*\["?([^"\]]+)"?\])?(?:\s*([{]))?$/.exec(row)
    if (declaration) {
      const record = card(declaration[1], declaration[2])
      if (declaration[3]) open = record
      continue
    }
    const [, id, value] = /^([\w$-]+)\s*:\s*(.+)$/.exec(row) ?? []
    if (!id) return
    member(card(id), value)
  }
  if (open || !cards.size || cards.size > 100 || edges.length > 300) return

  const layout = layeredLayout({
    nodes: [...cards].map(([id, record]) => ({
      id,
      width: Math.max(132, ...[record.name, record.annotation ?? '', ...record.fields, ...record.operations].map(text => text.length * 8 + 35)),
      height: 46 + (record.annotation ? 19 : 0) + (record.fields.length + record.operations.length) * 22 + (record.operations.length && record.fields.length ? 9 : 0),
    })),
    edges,
  }, { direction: directions[direction], padding: 26, layerGap: 92, nodeGap: 40 })

  const edgeIndex = new Map<string, Relation[]>()
  for (const edge of edges) {
    const key = `${edge.source}\0${edge.target}`
    const list = edgeIndex.get(key) ?? []
    list.push(edge)
    edgeIndex.set(key, list)
  }
  const markerName = (tip: string) => tip === 'arrow' ? marker : `${marker}-${tip}`
  const links = layout.edges.map((edge) => {
    const entry = edgeIndex.get(`${edge.source}\0${edge.target}`)?.shift()
    if (!entry || edge.points.length < 2) return ''
    const path = edgePath(edge.points, { direction: directions[direction], curve: 'orthogonal' })
    const start = entry.start ? ` marker-start="url(#${markerName(entry.start)})"` : ''
    const end = entry.end ? ` marker-end="url(#${markerName(entry.end)})"` : ''
    const first = edge.points[0]
    const last = edge.points.at(-1)!
    const center = edge.points[Math.floor(edge.points.length / 2)] ?? first
    const before = edge.points[Math.max(0, Math.floor(edge.points.length / 2) - 1)]
    const label = entry.label ? svgText(entry.label, (center.x + before.x) / 2 + (center.x === before.x ? 8 : 0), (center.y + before.y) / 2 - 9, 'diagram-edge-label', center.x === before.x ? 'start' : 'middle') : ''
    const multiplicity = (value: string | undefined, point: { x: number, y: number }, other: { x: number, y: number }) =>
      value ? svgText(value, point.x + Math.sign(other.x - point.x) * 18 + 10, point.y + Math.sign(other.y - point.y) * 18 - 10, 'diagram-edge-label') : ''
    return `<path class="diagram-edge${entry.dashed ? ' diagram-edge-dotted' : ''}" d="${path}"${start}${end}/>${label}${multiplicity(entry.leftCount, first, edge.points[1])}${multiplicity(entry.rightCount, last, edge.points.at(-2)!)}`
  })
  const nodes = layout.nodes.map((node) => {
    const record = cards.get(node.id)!
    const { x, y, width, height } = node
    const center = x + width / 2
    let row = y + 6
    const annotation = record.annotation ? svgText(`«${record.annotation}»`, center, row += 12, 'diagram-card-annotation') : ''
    const title = svgText(record.name, center, row += 19, 'diagram-card-title')
    const separator = () => `<line class="diagram-card-divider" x1="${x}" x2="${x + width}" y1="${row += 13}" y2="${row}"/>`
    function members(values: string[]): string {
      if (!values.length) return ''
      return separator() + values.map(value => svgText(value, x + 12, row += 22, 'diagram-card-member', 'start')).join('')
    }
    return `<g class="diagram-card diagram-node"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6"/>${annotation}${title}${members(record.fields)}${members(record.operations)}</g>`
  })
  return diagramSvg(title, layout.width, layout.height, arrows(marker) + markers(marker) + links.join('') + nodes.join(''))
}
