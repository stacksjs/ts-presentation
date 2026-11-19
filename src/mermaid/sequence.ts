import { arrows, diagramSvg, labelLines, svgText } from './svg.ts'

interface Participant { name: string, actor: boolean }
interface Activity { id: string, start: number, offset: number }
interface Section { kind: string, title: string, top: number, depth: number }
type Event =
  | { kind: 'message', from: string, to: string, arrow: string, label: string, change: 'start' | 'end' | undefined }
  | { kind: 'note', ids: string[], position: string, label: string }
  | { kind: 'activate' | 'deactivate', id: string }
  | { kind: 'section' | 'branch', title: string }
  | { kind: 'end' }

export function sequence(source: string, marker: string): string | undefined {
  const rows = source.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('%%'))
  if (rows.shift() !== 'sequenceDiagram') return
  const participants = new Map<string, Participant>()
  const events: Event[] = []
  let title = 'Sequence diagram'
  let numbered = false
  function mention(id: string): void {
    if (!participants.has(id)) participants.set(id, { name: id, actor: false })
  }
  for (const row of rows) {
    const declaration = /^(participant|actor)\s+([\w-]+)(?:\s+as\s+(.+))?$/.exec(row)
    if (declaration) {
      participants.set(declaration[2], { name: declaration[3] ?? declaration[2], actor: declaration[1] === 'actor' })
      continue
    }
    const message = /^([\w-]+?)\s*(<<-->>|<<->>|-->>|->>|--x|-x|--\)|-\)|-->|->)\s*([+-])?\s*([\w-]+)\s*:\s*(.*)$/.exec(row)
    if (message) {
      const [, from, arrow, activation, to, label] = message
      mention(from)
      mention(to)
      events.push({ kind: 'message', from, to, arrow, label, change: activation === '+' ? 'start' : activation === '-' ? 'end' : undefined })
      continue
    }
    const note = /^Note\s+(left of|right of|over)\s+([\w-]+(?:\s*,\s*[\w-]+)?)\s*:\s*(.*)$/i.exec(row)
    if (note) {
      const ids = note[2].split(/\s*,\s*/)
      ids.forEach(mention)
      events.push({ kind: 'note', position: note[1].toLowerCase(), ids, label: note[3] })
      continue
    }
    const activation = /^(activate|deactivate)\s+([\w-]+)$/.exec(row)
    if (activation) {
      mention(activation[2])
      events.push({ kind: activation[1] as 'activate' | 'deactivate', id: activation[2] })
      continue
    }
    if (row === 'autonumber') { numbered = true; continue }
    if (row.startsWith('title ') || row.startsWith('accTitle:')) {
      title = row.slice(row.startsWith('title ') ? 6 : 9).trim()
      continue
    }
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

  const names = [...participants]
  const span = Math.max(172, ...names.map(([, participant]) => Math.max(...labelLines(participant.name).map(line => line.length)) * 8 + 60))
  const longestMessage = Math.max(0, ...events.map(event => 'label' in event ? Math.max(...labelLines(event.label).map(line => line.length)) : 0))
  const column = Math.max(span, Math.min(490, longestMessage * 7 + 38))
  const margin = column / 2 + 48
  const width = margin * 2 + (names.length - 1) * column
  const xOf = new Map(names.map(([id], index) => [id, margin + index * column]))
  let y = 113
  let number = 1
  const foreground: string[] = []
  const sectionBoxes: string[] = []
  const activeBars: string[] = []
  const sections: Section[] = []
  const activity: Activity[] = []

  function finish(id: string, bottom: number): void {
    const index = activity.findLastIndex(item => item.id === id)
    if (index < 0) return
    const [bar] = activity.splice(index, 1)
    const x = xOf.get(id)! - 5 + bar.offset
    activeBars.push(`<rect class="diagram-activation" x="${x}" y="${bar.start}" width="10" height="${Math.max(8, bottom - bar.start)}"/>`)
  }
  function activate(id: string, top: number): void {
    activity.push({ id, start: top, offset: activity.filter(entry => entry.id === id).length * 6 })
  }
  for (const event of events) {
    if (event.kind === 'activate' || event.kind === 'deactivate') {
      if (event.kind === 'activate') activate(event.id, y - 13)
      else finish(event.id, y - 13)
      continue
    }
    if (event.kind === 'section') {
      if (sections.length >= 8) return
      const [kind, ...description] = event.title.split(/\s+/)
      sections.push({ kind, title: description.join(' '), top: y - 12, depth: sections.length })
      y += 33
      continue
    }
    if (event.kind === 'branch') {
      const section = sections.at(-1)
      if (!section) return
      const x = 12 + section.depth * 12
      foreground.push(`<path class="diagram-edge diagram-edge-dotted" d="M${x} ${y}H${width - x}"/>${svgText(event.title, x + 8, y + 12, 'diagram-cluster-label', 'start')}`)
      y += 35
      continue
    }
    if (event.kind === 'end') {
      const section = sections.pop()
      if (!section) return
      const x = 12 + section.depth * 12
      sectionBoxes.unshift(`<g class="diagram-sequence-section"><rect x="${x}" y="${section.top}" width="${width - x * 2}" height="${y - section.top}" rx="4"/>${svgText(`${section.kind} ${section.title}`.trim(), x + 9, section.top + 12, 'diagram-cluster-label', 'start')}</g>`)
      y += 21
      continue
    }
    if (event.kind === 'note') {
      const noteWidth = Math.max(90, ...labelLines(event.label).map(line => line.length * 7 + 24))
      const first = xOf.get(event.ids[0])!
      const last = xOf.get(event.ids.at(-1)!)!
      const preferred = event.position === 'left of' ? first - noteWidth - 18 : event.position === 'right of' ? first + 18 : (first + last - noteWidth) / 2
      const x = Math.max(6, Math.min(width - noteWidth - 6, preferred))
      const height = labelLines(event.label).length * 16 + 13
      foreground.push(`<g class="diagram-sequence-note"><rect x="${x}" y="${y}" width="${noteWidth}" height="${height}" rx="4"/>${svgText(event.label, x + noteWidth / 2, y + height / 2)}</g>`)
      y += height + 23
      continue
    }
    if (event.kind !== 'message') continue
    const from = xOf.get(event.from)!
    const to = xOf.get(event.to)!
    const label = numbered ? `${number++}. ${event.label}` : event.label
    const labelHeight = labelLines(label).length * 16
    const line = y + labelHeight + 4
    const self = from === to
    const d = self ? `M${from} ${line}h37v19h-37` : `M${from} ${line}H${to}`
    const end = event.arrow.endsWith('x') ? ` marker-end="url(#${marker}-cross)"` : />>|\)$/.test(event.arrow) ? ` marker-end="url(#${marker})"` : ''
    const start = event.arrow.startsWith('<<') ? ` marker-start="url(#${marker})"` : ''
    if (event.change === 'start') activate(event.to, line)
    if (event.change === 'end') finish(event.from, line)
    foreground.push(`<path class="diagram-edge${event.arrow.includes('--') ? ' diagram-edge-dotted' : ''}" d="${d}"${start}${end}/>${svgText(label, self ? from + 46 : (from + to) / 2, y + labelHeight / 2, 'diagram-edge-label', self ? 'start' : 'middle')}`)
    y = line + (self ? 45 : 29)
  }
  if (sections.length) return
  const bottom = y + 9
  for (const entry of [...activity]) finish(entry.id, bottom)
  const lifelines = names.map(([id, participant]) => {
    const x = xOf.get(id)!
    const actor = participant.actor
      ? `<path class="diagram-edge" d="M${x} 22v20m-11 -15h22m-11 15l-10 12m10 -12l10 12"/><circle class="diagram-cross" cx="${x}" cy="15" r="7"/>`
      : `<rect class="diagram-participant" x="${x - span / 2 + 10}" y="17" width="${span - 20}" height="64" rx="6"/>`
    return `<path class="diagram-lifeline" d="M${x} ${actor ? 88 : 81}V${bottom}"/>${actor}${svgText(participant.name, x, actor ? 71 : 49)}`
  })
  return diagramSvg(title, width, bottom + 21, arrows(marker) + sectionBoxes.join('') + lifelines.join('') + activeBars.join('') + foreground.join(''))
}
