import { sequenceChart } from 'ts-charts/diagrams'
import type { SequenceEvent, SequenceParticipant } from 'ts-charts/diagrams'

const participant = /^(actor|participant)\s+(?:"([^"]+)"|([\w-]+))(?:\s+as\s+(?:"([^"]+)"|([\w-]+)))?$/i
const message = /^(?:"([^"]+)"|([\w-]+))\s*(-->>?|->>?|<<?--|<<?-)\s*(?:"([^"]+)"|([\w-]+))(?:\s*:\s*(.*))?$/
const note = /^note\s+(left of|right of|over)\s+([\w-]+(?:\s*,\s*[\w-]+)?)\s*:\s*(.*)$/i

/** Keep sequence diagrams local and leave other PlantUML grammars as source. */
export function renderPlantUml(source: string, marker: string): string | undefined {
  if (source.length > 30_000) return
  const lines = source.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith("'"))
  if (!/^@startuml(?:\s+.+)?$/i.test(lines[0] ?? '') || !/^@enduml$/i.test(lines.at(-1) ?? '')) return
  const participants = new Map<string, SequenceParticipant>()
  const events: SequenceEvent[] = []
  let title: string | undefined
  let numbered = false
  let groups = 0

  function mention(id: string): void {
    if (!participants.has(id)) participants.set(id, { id })
  }

  for (const line of lines.slice(1, -1)) {
    const entry = participant.exec(line)
    if (entry) {
      const [, kind, display, bare, quotedAlias, alias] = entry
      const id = alias ?? bare ?? display
      participants.set(id, { id, name: quotedAlias ?? display ?? bare, actor: kind.toLowerCase() === 'actor' })
      continue
    }
    const arrow = message.exec(line)
    if (arrow) {
      const [, leftName, leftId, direction, rightName, rightId, label = ''] = arrow
      const left = leftId ?? leftName
      const right = rightId ?? rightName
      mention(left)
      mention(right)
      const [from, to] = direction.startsWith('<') ? [right, left] : [left, right]
      events.push({ kind: 'message', from, to, label, arrow: 'arrow', dashed: direction.includes('--') })
      continue
    }
    const hint = note.exec(line)
    if (hint) {
      const ids = hint[2].split(/\s*,\s*/)
      ids.forEach(mention)
      events.push({ kind: 'note', position: hint[1].toLowerCase() as 'left of' | 'right of' | 'over', ids, label: hint[3] })
      continue
    }
    const activation = /^(activate|deactivate)\s+([\w-]+)$/i.exec(line)
    if (activation) {
      mention(activation[2])
      events.push({ kind: activation[1].toLowerCase() as 'activate' | 'deactivate', id: activation[2] })
      continue
    }
    if (/^title\s+/i.test(line)) { title = line.slice(6).trim(); continue }
    if (/^autonumber$/i.test(line)) { numbered = true; continue }
    if (/^(?:alt|opt|loop|par|break|critical|group)(?:\s|$)/i.test(line)) {
      groups++
      events.push({ kind: 'section', title: line })
      continue
    }
    if (groups && /^else(?:\s|$)/i.test(line)) { events.push({ kind: 'branch', title: line }); continue }
    if (groups && /^end$/i.test(line)) { groups--; events.push({ kind: 'end' }); continue }
    return
  }
  if (!participants.size || participants.size > 28 || events.length > 200 || groups) return
  return sequenceChart({ participants: [...participants.values()], events, numbered, title, idPrefix: marker })
}
