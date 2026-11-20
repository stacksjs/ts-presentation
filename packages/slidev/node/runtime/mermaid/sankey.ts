import type { SankeyChartOptions, SankeyLink } from 'ts-charts/diagrams'
import { sankeyChart } from 'ts-charts/diagrams'
import type { MermaidOptions } from '../authoring-setup.ts'
import { diagramPixels } from './chronology.ts'

const heading = /^(?:(?:[ \t]*%%[^\r\n]*)?[ \t]*\r?\n)*[ \t]*sankey(?:-beta)?[ \t]*(?:\r?\n|$)/
const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?(?:[ \t]+%%[^\r\n]*)?$/

interface SankeyData {
  links: SankeyLink[]
  title?: string
  accessibleTitle?: string
  description?: string
}

function settings(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function parseRows(source: string): SankeyData | undefined {
  const header = heading.exec(source)
  if (!header) return
  const chart: SankeyData = { links: [] }
  const blank = /[ \t]*(?:%%[^\r\n]*)?(?:\r?\n|$)/y
  const field = /[ \t]*(?:"((?:[^"]|"")*)"|([^",\r\n]*?))[ \t]*(,|\r?\n|$)/y
  const metadata = /[ \t]*(?:(accTitle|accDescr)[ \t]*:[ \t]*([^,\r\n]+)|title[ \t]+([^,\r\n]+)|accDescr[ \t]*\{([^}]+)\}[ \t]*)(?:\r?\n|$)/y
  let offset = header[0].length

  function readField(delimiter: ',' | 'end'): string | undefined {
    field.lastIndex = offset
    const result = field.exec(source)
    if (!result || (delimiter === ',' ? result[3] !== ',' : result[3] === ',') || field.lastIndex === offset) return
    offset = field.lastIndex
    return (result[1]?.replaceAll('""', '"') ?? result[2]).trim()
  }

  while (offset < source.length) {
    blank.lastIndex = offset
    if (blank.test(source)) {
      offset = blank.lastIndex
      continue
    }
    metadata.lastIndex = offset
    const fields = metadata.exec(source)
    if (fields) {
      const text = (fields[2] ?? fields[3] ?? fields[4]).trim().replace(/^"|"$/g, '')
      if (fields[1] === 'accTitle') chart.accessibleTitle = text
      else if (fields[1] === 'accDescr' || fields[4]) chart.description = text
      else chart.title = text
      offset = metadata.lastIndex
      continue
    }
    const sourceId = readField(',')
    const target = readField(',')
    const rawValue = readField('end')
    if (!sourceId || !target || !rawValue || !numeric.test(rawValue)) return
    const value = Number(rawValue.split('%%', 1)[0])
    if (!Number.isFinite(value) || value < 0) return
    chart.links.push({ source: sourceId, target, value })
  }
  if (chart.links.length) return chart
}

export function sankey(source: string, idPrefix: string, options: MermaidOptions): string | undefined {
  const chart = parseRows(source)
  if (!chart) return
  const config = settings(options.sankey)
  const alignment = config.nodeAlignment
  const colors = settings(config.nodeColors)
  const appearance: SankeyChartOptions = {
    ...chart,
    idPrefix,
    title: chart.title || (typeof options.title === 'string' ? options.title : undefined),
    width: diagramPixels(config.width),
    height: diagramPixels(config.height),
    nodeWidth: diagramPixels(config.nodeWidth),
    nodePadding: diagramPixels(config.nodePadding),
    nodeAlignment: alignment === 'left' || alignment === 'right' || alignment === 'center' ? alignment : 'justify',
    labelStyle: config.labelStyle === 'outlined' ? 'outlined' : 'legacy',
    linkColor: typeof config.linkColor === 'string' ? config.linkColor : undefined,
    linkOpacity: typeof config.linkOpacity === 'number' ? config.linkOpacity : undefined,
    nodeColors: Object.fromEntries(Object.entries(colors).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
    showValues: config.showValues !== false,
    useMaxWidth: config.useMaxWidth !== false,
    prefix: typeof config.prefix === 'string' ? config.prefix : undefined,
    suffix: typeof config.suffix === 'string' ? config.suffix : undefined,
  }
  return sankeyChart(appearance)
}
