import type { XYChartOptions, XYPoint, XYSeries } from 'ts-charts/diagrams'
import { xyChart } from 'ts-charts/diagrams'
import type { MermaidOptions } from '../authoring-setup.ts'
import { diagramPixels, readChronology } from './chronology.ts'

type Settings = Readonly<Record<string, unknown>>
type CategoryAxis = NonNullable<XYChartOptions['xAxis']>

const number = /[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/
const word = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,[\]"']+/
const titleOnly = new RegExp(`^(?:${word.source})$`)
const quoted = /^(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)')$/
const dataList = new RegExp(`^(?:(${word.source})\\s+)?\\[([\\s\\S]*)\\]$`)
const range = new RegExp(`^(?:(${word.source})\\s+)?(${number.source})\\s*-->\\s*(${number.source})$`)

function settings(value: unknown): Settings {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Settings : {}
}

function text(value = ''): string {
  const match = quoted.exec(value)
  return match ? (match[1] ?? match[2]).replace(/\\(["'\\])/g, '$1') : value
}

function readList<T>(source: string, field: RegExp, parse: (token: RegExpExecArray) => T | undefined): T[] | undefined {
  const token = new RegExp(`\\s*${field.source}\\s*(?:,|$)`, 'y')
  const line = source.trim()
  if (line.endsWith(',')) return
  const entries: T[] = []
  while (token.lastIndex < line.length) {
    const value = token.exec(line)
    if (!value) return
    const item = parse(value)
    if (item === undefined) return
    entries.push(item)
    if (entries.length > 400) return
  }
  if (entries.length) return entries
}

const categoryField = new RegExp(`(${word.source})`)
const pointField = new RegExp(`(${number.source})(?:\\s+(${word.source}))?`)

function axis(source: string, canCategorize: boolean): CategoryAxis | undefined {
  const numeric = range.exec(source)
  if (numeric) {
    const domain = [Number(numeric[2]), Number(numeric[3])] as const
    if (!domain.every(Number.isFinite) || domain[0] >= domain[1]) return
    return { title: text(numeric[1]), domain }
  }
  const categorical = dataList.exec(source)
  if (categorical && canCategorize) {
    const labels = readList(categorical[2], categoryField, token => text(token[1]).trim() || undefined)
    if (labels) return { title: text(categorical[1]), categories: labels }
  }
  else if (titleOnly.test(source)) return { title: text(source) }
}

function parseSeries(kind: XYSeries['type'], source: string): XYSeries | undefined {
  const match = dataList.exec(source)
  if (!match) return
  const values = readList<XYPoint>(match[2], pointField, (token) => {
    const value = Number(token[1])
    if (!Number.isFinite(value) || (token[2] && !quoted.test(token[2]))) return
    return { value, label: token[2] ? text(token[2]) : undefined }
  })
  if (values) return { type: kind, label: text(match[1]), values }
}

function themeColor(theme: Settings, key: string): string | undefined {
  return typeof theme[key] === 'string' ? theme[key] : undefined
}

function axisStyle(config: Settings, name: 'xAxis' | 'yAxis', data: CategoryAxis | undefined, theme: Settings): CategoryAxis {
  const style = settings(config[name])
  return {
    ...style, ...data,
    labelColor: themeColor(theme, `${name}LabelColor`),
    titleColor: themeColor(theme, `${name}TitleColor`),
    tickColor: themeColor(theme, `${name}TickColor`),
    lineColor: themeColor(theme, `${name}LineColor`),
  }
}

export function xyDiagram(source: string, marker: string, options: MermaidOptions): string | undefined {
  const chart = readChronology(source, '', { singleQuotes: true })
  if (!chart) return
  const header = /^xychart(?:-beta)?(?:\s+(vertical|horizontal))?$/.exec(chart.header)
  if (!header) return
  const config = settings(options.xyChart)
  const theme = settings(settings(options.themeVariables).xyChart)
  const series: XYSeries[] = []
  let xAxis: CategoryAxis | undefined
  let yAxis: CategoryAxis | undefined
  for (const row of chart.rows) {
    const [, command, value] = /^(x-axis|y-axis|bar|line)\s+(.+)$/.exec(row) ?? []
    if (command === 'x-axis') {
      if (xAxis) return
      xAxis = axis(value, true)
      if (!xAxis) return
    }
    else if (command === 'y-axis') {
      if (yAxis) return
      yAxis = axis(value, false)
      if (!yAxis) return
    }
    else if (command === 'bar' || command === 'line') {
      const item = parseSeries(command, value)
      if (!item) return
      series.push(item)
    }
    else return
  }
  const orientation = header[1] ?? config.chartOrientation
  const colors = themeColor(theme, 'plotColorPalette')?.split(',').map(color => color.trim())
  return xyChart({
    ...config, series, idPrefix: marker, title: text(chart.title) || (typeof options.title === 'string' ? options.title : ''),
    description: chart.description, accessibleTitle: text(chart.accessibleTitle),
    xAxis: axisStyle(config, 'xAxis', xAxis, theme), yAxis: axisStyle(config, 'yAxis', yAxis, theme),
    orientation: orientation === 'horizontal' ? 'horizontal' : 'vertical',
    width: diagramPixels(config.width), height: diagramPixels(config.height), colors,
    backgroundColor: themeColor(theme, 'backgroundColor'), titleColor: themeColor(theme, 'titleColor'),
    dataLabelColor: themeColor(theme, 'dataLabelColor'), legendTextColor: themeColor(theme, 'legendTextColor'),
  })
}
