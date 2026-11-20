import { syntaxMask } from './syntax.ts'

export interface Chronology {
  header: string
  title: string
  accessibleTitle: string
  description: string
  rows: string[]
}

export function diagramPixels(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^\d+(?:\.\d+)?(?:px)?$/i.test(value.trim())) return Number.parseFloat(value)
}

export function readChronology(source: string, title: string, singleQuotes = false): Chronology | undefined {
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
    const comment = syntaxMask(line, singleQuotes).indexOf('%%')
    const row = (comment < 0 ? line : line.slice(0, comment)).trim()
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
