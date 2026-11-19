import type { SequenceEvent, SequenceParticipant } from 'ts-charts/diagrams'
import { sequenceChart } from 'ts-charts/diagrams'

export function sequence(source: string, marker: string): string | undefined {
  const rows = source.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('%%'))
  if (rows.shift() !== 'sequenceDiagram') return
  const participants = new Map<string, SequenceParticipant>()
  const events: SequenceEvent[] = []
  let title: string | undefined
  let accessibleTitle: string | undefined
  let numbered = false
  function mention(id: string): void {
    if (!participants.has(id)) participants.set(id, { id })
  }
  for (const row of rows) {
    const declaration = /^(participant|actor)\s+([\w-]+)(?:\s+as\s+(.+))?$/.exec(row)
    if (declaration) {
      participants.set(declaration[2], { id: declaration[2], name: declaration[3] ?? declaration[2], actor: declaration[1] === 'actor' })
      continue
    }
    const message = /^([\w-]+?)\s*(<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->)\s*([+-])?\s*([\w-]+)\s*:\s*(.*)$/.exec(row)
    if (message) {
      const [, from, arrow, activation, to, label] = message
      mention(from)
      mention(to)
      const tip = arrow.endsWith('x') ? 'cross' : arrow.startsWith('<<') ? 'both' : />>|\)$/.test(arrow) ? 'arrow' : 'none'
      events.push({ kind: 'message', from, to, arrow: tip, dashed: arrow.includes('--'), label, change: activation === '+' ? 'start' : activation === '-' ? 'end' : undefined })
      continue
    }
    const note = /^Note\s+(left of|right of|over)\s+([\w-]+(?:\s*,\s*[\w-]+)?)\s*:\s*(.*)$/i.exec(row)
    if (note) {
      const ids = note[2].split(/\s*,\s*/)
      ids.forEach(mention)
      events.push({ kind: 'note', position: note[1].toLowerCase() as 'left of' | 'right of' | 'over', ids, label: note[3] })
      continue
    }
    const activation = /^(activate|deactivate)\s+([\w-]+)$/.exec(row)
    if (activation) {
      mention(activation[2])
      events.push({ kind: activation[1] as 'activate' | 'deactivate', id: activation[2] })
      continue
    }
    if (row === 'autonumber') { numbered = true; continue }
    if (row.startsWith('title ')) { title = row.slice(6).trim(); continue }
    if (row.startsWith('accTitle:')) { accessibleTitle = row.slice(9).trim(); continue }
    if (/^(?:alt|opt|loop|par|critical|break)(?:\s|$)/.test(row)) {
      events.push({ kind: 'section', title: row })
      continue
    }
    if (/^(?:else|and|option)(?:\s|$)/.test(row)) {
      events.push({ kind: 'branch', title: row })
      continue
    }
    if (row === 'end') { events.push({ kind: 'end' }); continue }
    return
  }
  if (!participants.size || participants.size > 28 || events.length > 200) return

  return sequenceChart({ participants: [...participants.values()], events, numbered, title, accessibleTitle, idPrefix: marker })
}
