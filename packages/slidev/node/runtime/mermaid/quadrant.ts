import type { QuadrantChartOptions, QuadrantPoint, QuadrantPointStyle } from 'ts-charts/diagrams'
import { quadrantChart } from 'ts-charts/diagrams'
import type { MermaidOptions } from '../authoring-setup.ts'
import { diagramPixels, readChronology } from './chronology.ts'
import { syntaxMask } from './syntax.ts'

interface Theme {
  fills: readonly string[]
  labels: readonly string[]
  border: string
  background?: string
  point?: string
}

// Quadrant palettes from Mermaid 12.3.0. See licenses/Mermaid-MIT.txt.
// Use a visible marker color when the reference's derived point color is invalid.
const dark: Theme = {
  fills: ['#1f2020', '#242525', '#292a2a', '#2e2f2f'],
  labels: ['#e0dfdf', '#dbdada', '#d6d5d5', '#d1d0d0'],
  border: '#cccccc', background: '#333333', point: '#9b8dff',
}
const redux: Theme = {
  fills: ['#ececfe', '#f1f1ff', '#f6f6ff', '#fbfbff'],
  labels: ['#28253d', '#232038', '#1e1b33', '#19162e'],
  border: '#171717',
}
const themes: Readonly<Record<string, Theme>> = {
  base: {
    fills: ['#fff4dd', '#fff9e2', '#fffee7', '#ffffec'],
    labels: ['#333333', '#2e2e2e', '#292929', '#242424'],
    border: '#eeddbb', background: '#f4f4f4',
  },
  dark,
  forest: {
    fills: ['#cde498', '#d2e99d', '#d7eea2', '#dcf3a7'],
    labels: ['#321b67', '#2d1662', '#28115d', '#230c58'],
    border: '#abb594',
  },
  neutral: {
    fills: ['#eeeeee', '#f3f3f3', '#f8f8f8', '#fdfdfd'],
    labels: ['#111111', '#0c0c0c', '#070707', '#020202'],
    border: '#d4d4d4',
  },
  neo: { fills: redux.fills, labels: ['#333333', '#2e2e2e', '#292929', '#242424'], border: '#b3b3b3' },
  'neo-dark': dark,
  redux,
  'redux-color': redux,
  'redux-dark': dark,
  'redux-dark-color': dark,
}

function parseLabel(source: string): string {
  const text = source.trim()
  const quoted = /^"((?:[^"\\]|\\.)*)"$/s.exec(text)
  const value = quoted ? quoted[1].replace(/\\(["\\])/g, '$1') : text
  // SVG labels are text, including the text content of Mermaid Markdown labels.
  return quoted && value.startsWith('\u0060') && value.endsWith('\u0060')
    ? value.slice(1, -1).replace(/(\*\*|__|\*|_|`)(.+?)\1/g, '$2').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    : value
}

function parseAxis(source: string): QuadrantChartOptions['xAxis'] {
  const arrow = /--+>/.exec(syntaxMask(source))
  if (!arrow) return [parseLabel(source)]
  const low = parseLabel(source.slice(0, arrow.index))
  const high = parseLabel(source.slice(arrow.index + arrow[0].length))
  if (!low) return
  return high ? [low, high] : [`${low} ⟶`]
}

function parseStyles(source: string): QuadrantPointStyle | undefined {
  const style: QuadrantPointStyle = {}
  if (!source) return style
  for (const field of source.split(',')) {
    const [, key, value] = /^\s*([a-z-]+)\s*:\s*(.*?)\s*$/.exec(field) ?? []
    if (key === 'color' || key === 'stroke-color') {
      if (!/^#[\da-f]{3,8}$/i.test(value) || ![4, 5, 7, 9].includes(value.length)) return
      style[key === 'color' ? 'color' : 'strokeColor'] = value
    }
    else if (key === 'radius' || key === 'stroke-width') {
      if (!(key === 'radius' ? /^\d+(?:\.\d+)?$/ : /^\d+(?:\.\d+)?px$/i).test(value)) return
      const number = diagramPixels(value)
      if (number === undefined || !Number.isFinite(number)) return
      style[key === 'radius' ? 'radius' : 'strokeWidth'] = number
    }
    else return
  }
  return style
}

function splitStatements(line: string): string[] {
  const statements: string[] = []
  let cursor = 0
  const visible = syntaxMask(line)
  const end = visible.indexOf('%%')
  const length = end < 0 ? line.length : end
  for (const delimiter of visible.slice(0, length).matchAll(/;/g)) {
    statements.push(line.slice(cursor, delimiter.index).trim())
    cursor = delimiter.index + 1
  }
  statements.push(line.slice(cursor, length).trim())
  return statements.filter(Boolean)
}

function parsePoint(row: string): (QuadrantPoint & { className?: string }) | undefined {
  const visible = syntaxMask(row)
  const endLabel = [...visible.matchAll(/:/g)].find(match => /^\s*\[/.test(row.slice(match.index + 1)))
  if (!endLabel) return
  const classStart = visible.indexOf(':::')
  const label = parseLabel(row.slice(0, classStart >= 0 ? classStart : endLabel.index))
  const className = classStart >= 0 ? row.slice(classStart + 3, endLabel.index).trim() : undefined
  if (!label || (className !== undefined && !/^\w+$/.test(className))) return
  const [, x, y, definition] = /^\s*\[\s*(\d+(?:\.\d+)?|\.\d+)\s*,\s*(\d+(?:\.\d+)?|\.\d+)\s*\]\s*(.*)$/.exec(row.slice(endLabel.index + 1)) ?? []
  if (x === undefined) return
  const style = parseStyles(definition)
  if (style) return { label, x: Number(x), y: Number(y), ...style, className }
}

export function quadrantDiagram(source: string, idPrefix: string, options: MermaidOptions = {}): string | undefined {
  const title = typeof options.title === 'string' ? options.title : ''
  const diagram = readChronology(source, title)
  if (!diagram) return
  const statements = [diagram.header, ...diagram.rows].flatMap(splitStatements)
  if (!/^quadrantChart$/i.test(statements.shift() ?? '') || statements.length > 300) return
  const quadrants = ['', '', '', '']
  const points: (QuadrantPoint & { className?: string })[] = []
  const classes = new Map<string, QuadrantPointStyle>()
  let xAxis: QuadrantChartOptions['xAxis']
  let yAxis: QuadrantChartOptions['yAxis']
  let heading = diagram.title
  for (const row of statements) {
    const [, directive = '', text = ''] = /^([-\w]+)\s+(.+)$/.exec(row) ?? []
    switch (directive.toLowerCase()) {
      case 'title': heading = text; continue
      case 'x-axis': xAxis = parseAxis(text); if (!xAxis) return; continue
      case 'y-axis': yAxis = parseAxis(text); if (!yAxis) return; continue
      case 'quadrant-1':
      case 'quadrant-2':
      case 'quadrant-3':
      case 'quadrant-4':
        quadrants[Number(directive.at(-1)) - 1] = parseLabel(text)
        continue
      case 'classdef': {
        const [, name, definition] = /^(\w+)\s+(.+)$/.exec(text) ?? []
        const style = definition && parseStyles(definition)
        if (!name || !style) return
        classes.set(name, style)
        continue
      }
    }
    const point = parsePoint(row)
    if (!point) return
    points.push(point)
  }

  const config = options.quadrantChart && typeof options.quadrantChart === 'object' ? options.quadrantChart as Record<string, unknown> : {}
  const variables = options.themeVariables && typeof options.themeVariables === 'object' ? options.themeVariables as Record<string, unknown> : {}
  const theme = typeof options.theme === 'string' && Object.hasOwn(themes, options.theme) ? themes[options.theme] : undefined
  const color = (key: string) => {
    const value = variables[key]
    if (typeof value === 'string') return /^(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value) ? `#${value}` : value
  }
  const number = (key: string) => diagramPixels(config[key])
  return quadrantChart({
    ...diagram, idPrefix, title: parseLabel(heading), quadrants, xAxis, yAxis,
    points: points.map(({ className, ...point }) => ({ ...classes.get(className ?? ''), ...point })),
    chartWidth: number('chartWidth'), chartHeight: number('chartHeight'), useMaxWidth: config.useMaxWidth !== false,
    titleFontSize: number('titleFontSize'), titlePadding: number('titlePadding'),
    quadrantPadding: number('quadrantPadding'), quadrantTextTopPadding: number('quadrantTextTopPadding'),
    quadrantLabelFontSize: number('quadrantLabelFontSize'),
    quadrantInternalBorderStrokeWidth: number('quadrantInternalBorderStrokeWidth'),
    quadrantExternalBorderStrokeWidth: number('quadrantExternalBorderStrokeWidth'),
    xAxisLabelPadding: number('xAxisLabelPadding'), xAxisLabelFontSize: number('xAxisLabelFontSize'),
    xAxisPosition: config.xAxisPosition === 'bottom' ? 'bottom' : 'top',
    yAxisLabelPadding: number('yAxisLabelPadding'), yAxisLabelFontSize: number('yAxisLabelFontSize'),
    yAxisPosition: config.yAxisPosition === 'right' ? 'right' : 'left',
    pointTextPadding: number('pointTextPadding'), pointLabelFontSize: number('pointLabelFontSize'), pointRadius: number('pointRadius'),
    palette: {
      background: color('background') ?? theme?.background,
      fills: [1, 2, 3, 4].map(index => color(`quadrant${index}Fill`) ?? theme?.fills[index - 1]),
      labels: [1, 2, 3, 4].map(index => color(`quadrant${index}TextFill`) ?? theme?.labels[index - 1]),
      point: color('quadrantPointFill') ?? theme?.point,
      pointLabel: color('quadrantPointTextFill') ?? theme?.labels[0],
      xAxis: color('quadrantXAxisTextFill') ?? theme?.labels[0],
      yAxis: color('quadrantYAxisTextFill') ?? theme?.labels[0],
      internalBorder: color('quadrantInternalBorderStrokeFill') ?? theme?.border,
      externalBorder: color('quadrantExternalBorderStrokeFill') ?? theme?.border,
      title: color('quadrantTitleFill') ?? theme?.labels[0],
    },
  })
}
