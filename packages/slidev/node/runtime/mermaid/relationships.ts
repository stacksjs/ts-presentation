import type { RelationshipEdge, RelationshipMarker } from 'ts-charts/diagrams'
import { relationshipChart } from 'ts-charts/diagrams'

const directions = { TD: 'down', TB: 'down', BT: 'up', LR: 'right', RL: 'left' } as const
const classRelation = /^([\w$-]+)\s*(?:"([^"]+)"\s*)?(<\||[<*o])?(--|\.\.)(\|>|[>*o])?\s*(?:"([^"]+)"\s*)?([\w$-]+)\s*(?::\s*(.+))?$/
const entityRelation = /^("[^"]+"|[\w-]+)\s+(\|\||\|o|[}][o|])(--|\.\.)(\|\||o\||[o|][{])\s+("[^"]+"|[\w-]+)\s*:\s*(.+)$/
const erEnds: Partial<Record<string, RelationshipMarker>> = { '||': 'one', '|o': 'zero-one', 'o|': 'zero-one', '}|': 'many', '|{': 'many', '}o': 'zero-many', 'o{': 'zero-many' }
const classEnds: Partial<Record<string, RelationshipMarker>> = { '<': 'arrow', '>': 'arrow', '<|': 'triangle', '|>': 'triangle', '*': 'composition', o: 'aggregation' }

interface Card { id: string, name: string, fields: string[], operations: string[], annotation?: string }
export function relationshipsDiagram(source: string, marker: string): string | undefined {
  const rows = source.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('%%'))
  const language = rows.shift()
  if (language !== 'classDiagram' && language !== 'erDiagram') return
  const entity = language === 'erDiagram'
  let accessibleTitle: string | undefined
  let direction: keyof typeof directions = 'TB'
  const cards = new Map<string, Card>()
  const edges: RelationshipEdge[] = []
  let open: Card | undefined
  function card(id: string, name?: string): Card {
    const clean = id.replace(/^"|"$/g, '')
    const record = cards.get(clean) ?? { id: clean, name: clean, fields: [], operations: [] }
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
    if (row.startsWith('accTitle:')) { accessibleTitle = row.slice(9).trim(); continue }
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
  if (open) return
  return relationshipChart({ cards: [...cards.values()], edges, kind: entity ? 'er' : 'class',
    direction: directions[direction], accessibleTitle, idPrefix: marker })
}
