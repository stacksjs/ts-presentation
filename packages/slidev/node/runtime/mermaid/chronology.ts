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

export function sizeChronologySvg(svg: string | undefined, useMaxWidth: unknown): string | undefined {
  if (useMaxWidth !== false) return svg
  return svg?.replace(/^(<svg\b[^>]*\bviewBox="0 0 ([\d.]+) ([\d.]+)")/, '$1 width="$2" height="$3"')
}

export function readChronology(source: string | readonly string[], title: string, syntax: { singleQuotes?: boolean, hashTaskNames?: boolean } = {}): Chronology | undefined {
  const lines = (typeof source === 'string' ? source.split(/\r?\n/) : source).map(line => line.trim())
  const header = lines.findIndex(line => line && !/^(?:%%|#)/.test(line))
  if (header < 0) return
  const chart: Chronology = { title, header: lines[header], accessibleTitle: '', description: '', rows: [] }
  let description: string[] | undefined
  for (const line of lines.slice(header + 1)) {
    const open = /^accDescr\s*\{\s*([\s\S]*)$/i.exec(line)
    if (open && !description) description = [open[1]]
    else if (description) description.push(line)
    if (description) {
      if (line.endsWith('}')) {
        chart.description = description.join(' ').slice(0, -1).trim().replace(/\s+/g, ' ')
        description = undefined
      }
      continue
    }
    const comment = syntaxMask(line, syntax.singleQuotes).indexOf('%%')
    const row = (comment < 0 ? line : line.slice(0, comment)).trim()
    if (!row || (row.startsWith('#') && (!syntax.hashTaskNames || !row.includes(':')))) continue
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
