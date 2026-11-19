import { escapeHtml } from '../html.ts'
import { diagramSvg, labelLines, svgText } from './svg.ts'

export interface Chronology {
  header: string
  title: string
  accessibleTitle: string
  description: string
  rows: string[]
}

const colors = ['#8dbcf2', '#fed194', '#9ad9c0', '#c6adeb', '#f5a9b2', '#8cdae0',
  '#cddd8c', '#ffb696', '#9fb1ec', '#e4b5dd', '#b5d2ef', '#a7d6a3']
export const chronologyInk = '#122434'

export function safeColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^(?:#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})|[a-z]{1,24})$/i.test(value) ? value : undefined
}

export function chronologyColor(index: number): string {
  return colors[index % colors.length]
}

export function readChronology(source: string, title: string): Chronology | undefined {
  const lines = source.split(/\r?\n/).map(line => line.trim())
  const header = lines.findIndex(line => line && !/^(?:%%|#)/.test(line))
  if (header < 0) return
  const chart: Chronology = { title, header: lines[header], accessibleTitle: '', description: '', rows: [] }
  let description: string[] | undefined
  for (const line of lines.slice(header + 1)) {
    const open = /^accDescr\s*\{\s*(.*)$/i.exec(line)
    if (open && !description) description = [open[1]]
    else if (description) description.push(line)
    if (description) {
      if (line.endsWith('}')) {
        chart.description = description.join(' ').slice(0, -1).trim().replace(/\s+/g, ' ')
        description = undefined
      }
      continue
    }
    const row = line.replace(/\s+%%.*$/, '').trim()
    if (!row || /^(?:%%|#)/.test(row)) continue
    const title = /^title\s+(.+)$/i.exec(row)?.[1]
    const accTitle = /^accTitle\s*:\s*(.*)$/i.exec(row)?.[1]
    const accDesc = /^accDescr\s*:\s*(.*)$/i.exec(row)?.[1]
    if (title) chart.title = title
    else if (accTitle !== undefined) chart.accessibleTitle = accTitle
    else if (accDesc !== undefined) chart.description = accDesc
    else chart.rows.push(row)
  }
  return description ? undefined : chart
}

export function wrappedLabel(label: string, limit: number): string[] {
  return labelLines(label).flatMap((line) => {
    let current = ''
    const wrapped: string[] = []
    for (const word of line.trim().split(/\s+/)) {
      if (current && current.length + word.length + 1 > limit) {
        wrapped.push(current)
        current = ''
      }
      const letters = Array.from(word)
      while (letters.length > limit) wrapped.push(letters.splice(0, limit).join(''))
      current += (current ? ' ' : '') + letters.join('')
    }
    return [...wrapped, current]
  })
}

export function chronologySvg(chart: Chronology, marker: string, kind: string, width: number, height: number, body: string): string {
  const id = escapeHtml(marker)
  const title = chart.title ? svgText(chart.title, width / 2, 20, 'diagram-title') : ''
  const accessibleTitle = chart.accessibleTitle ? `<title id="${id}-title">${escapeHtml(chart.accessibleTitle)}</title>` : ''
  const description = chart.description ? `<desc id="${id}-description">${escapeHtml(chart.description)}</desc>` : ''
  const label = chart.accessibleTitle || chart.title || kind
  return diagramSvg(label, width, height, accessibleTitle + description + title + body)
    .replace('role="img"', `role="img"${accessibleTitle ? ` aria-labelledby="${id}-title"` : ''}${description ? ` aria-describedby="${id}-description"` : ''}`)
}
