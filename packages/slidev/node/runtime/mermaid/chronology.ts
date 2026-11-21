import { syntaxMask } from './syntax.ts'

const diagramEntity = /#(\d+|[a-zA-Z][a-zA-Z0-9]*);/g
const legacyEntityEncoding = new TextDecoder('windows-1252')

export function decodeDiagramEntities(text: string): string {
  return text.replace(diagramEntity, (source, name: string) => {
    if (/^\d/.test(name)) {
      const code = Number(name)
      if (code >= 0x80 && code <= 0x9F) return legacyEntityEncoding.decode(Uint8Array.of(code))
      if (code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF) || code === 0xFFFE || code === 0xFFFF
        || (code < 0x20 && code !== 0x9 && code !== 0xA && code !== 0xD)) return '\uFFFD'
      return String.fromCodePoint(code)
    }
    // Pass a single entity to Bun's character reference decoder so diagram
    // text around it never passes through Markdown formatting.
    const entity = `&${name};`
    const decoded = Bun.markdown.render(entity, {})
    return decoded === entity ? source : decoded
  })
}

export function maskDiagramEntities(text: string): string {
  return text.replace(diagramEntity, entity => ' '.repeat(entity.length))
}

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

export function diagramFontFamily(config: unknown, theme: unknown): string | undefined {
  return [theme, config].find((value): value is string => typeof value === 'string' && !!value.trim())
}

export function sizeChronologySvg(svg: string | undefined, useMaxWidth: unknown): string | undefined {
  if (useMaxWidth !== false) return svg
  return svg?.replace(/^(<svg\b[^>]*\bviewBox="0 0 ([\d.]+) ([\d.]+)")/, '$1 width="$2" height="$3"')
}

export function readChronology(source: string | readonly string[], title: string, syntax: { singleQuotes?: boolean, gantt?: boolean, entities?: boolean, preserveIndent?: boolean } = {}): Chronology | undefined {
  const lines = typeof source === 'string' ? source.split(/\r?\n/) : source
  const header = lines.findIndex(line => line.trim() && !/^\s*(?:%%|#)/.test(line))
  if (header < 0) return
  const chart: Chronology = { title, header: lines[header].trim(), accessibleTitle: '', description: '', rows: [] }
  let description: string[] | undefined
  for (const rawLine of lines.slice(header + 1)) {
    const line = rawLine.trim()
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
    // Gantt axis formats use %% as a literal percent directive.
    const literalPercent = syntax.gantt && /^axisFormat[\s:]/i.test(line)
    const comment = literalPercent ? -1 : syntaxMask(line, syntax.singleQuotes).indexOf('%%')
    const row = (comment < 0 ? line : line.slice(0, comment)).trim()
    if (!row || (row.startsWith('#') && (!syntax.gantt || !row.includes(':')))) continue
    const title = /^title\s+(.+)$/i.exec(row)?.[1]
    const accTitle = /^accTitle\s*:\s*(.*)$/i.exec(row)?.[1]
    const accDesc = /^accDescr\s*:\s*(.*)$/i.exec(row)?.[1]
    if (title) chart.title = title
    else if (accTitle !== undefined) chart.accessibleTitle = accTitle
    else if (accDesc !== undefined) chart.description = accDesc
    else chart.rows.push(syntax.preserveIndent ? (rawLine.match(/^[\t ]*/)?.[0] ?? '') + row : row)
  }
  if (description) return
  if (syntax.entities) {
    chart.title = decodeDiagramEntities(chart.title)
    chart.accessibleTitle = decodeDiagramEntities(chart.accessibleTitle)
    chart.description = decodeDiagramEntities(chart.description)
  }
  return chart
}
