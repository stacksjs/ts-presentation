import { hierarchy, treemap } from '@ts-charts/hierarchy'
import { color } from 'ts-charts/color'
import { format, formatSpecifier } from 'ts-charts/format'
import { diagramOptionsRecord } from './diagram-options.ts'
import { escapeHtml } from './html.ts'
import { diagramPixels } from './mermaid/chronology.ts'

interface TreemapNode {
  label: string
  value?: number
  children?: TreemapNode[]
  className?: string
  style?: Readonly<Record<string, unknown>>
}

const defaultColors = ['#b8b4ef', '#9ed3d3', '#edc590', '#c4d5a2', '#e4adbe', '#adc5e8']
const palettes: Readonly<Record<string, readonly string[]>> = {
  forest: ['#b6cd89', '#96c1ad', '#e1c48e', '#b9c5a0', '#d1a8ae', '#abc6cf'],
  neutral: ['#bec1c8', '#d9d9de', '#b1b6c0', '#d0d2d7', '#a1a8b4', '#c7c9cf'],
  dark: ['#9186dd', '#6ab6ba', '#d8a971', '#a9bc85', '#ce8da3', '#819ed7'],
}

function boundedPixels(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const pixels = diagramPixels(value)
  return pixels === undefined || !Number.isFinite(pixels) ? fallback : Math.min(maximum, Math.max(minimum, pixels))
}

function paint(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 120) return
  if (value === 'none') return value
  const parsed = color(value)
  if (parsed) return parsed.opacity === 1 ? parsed.formatHex() : parsed.formatRgb()
}

function tree(value: unknown): TreemapNode {
  let count = 0
  function node(value: unknown, depth: number): TreemapNode {
    const record = diagramOptionsRecord(value)
    if (!record || depth > 24 || ++count > 1000 || typeof record.label !== 'string' || !record.label.trim() || record.label.length > 1600)
      throw new Error('Invalid treemap node')
    const className = typeof record.className === 'string' && /^[\w-]+$/.test(record.className) ? record.className : undefined
    const data: TreemapNode = { label: record.label, className, style: diagramOptionsRecord(record.style) }
    if (Array.isArray(record.children) && record.value === undefined)
      data.children = record.children.map(child => node(child, depth + 1))
    else if (record.children === undefined && typeof record.value === 'number' && Number.isFinite(record.value) && record.value >= 0)
      data.value = record.value
    else throw new Error('Treemap leaves require a nonnegative value')
    return data
  }
  return node({ label: 'Treemap', children: value }, 0)
}

function valueFormatter(value: unknown): (number: number) => string {
  if (typeof value !== 'string' || value.length > 48) return format(',')
  try {
    const specifier = formatSpecifier(value === '$0,0' ? '$,' : value || ',')
    if ((specifier.width ?? 0) > 48 || (specifier.precision ?? 0) > 20) return format(',')
    return format(specifier.toString())
  }
  catch { return format(',') }
}

function fittedLines(label: string, width: number, height: number, size: number): string[] {
  const columns = Math.floor((width - 12) / (size * 0.65))
  const rows = Math.floor(height / (size * 1.18))
  if (columns < 1 || rows < 1) return []
  const words = label.trim().split(/\s+/u).flatMap((word) => {
    const characters = Array.from(word)
    const parts: string[] = []
    for (let start = 0; start < characters.length; start += columns) parts.push(characters.slice(start, start + columns).join(''))
    return parts
  })
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const combined = line ? `${line} ${word}` : word
    if (line && Array.from(combined).length > columns) {
      lines.push(line)
      if (lines.length === rows) {
        lines[rows - 1] = Array.from(line).slice(0, columns - 1).join('') + '…'
        return lines
      }
      line = word
    }
    else line = combined
  }
  if (line) lines.push(line)
  return lines
}

export function treemapSvg(options: Readonly<Record<string, unknown>>, classes?: ReadonlyMap<string, Readonly<Record<string, unknown>>>): string | undefined {
  const root = hierarchy(tree(options.nodes), node => node.children)
    .sum(node => node.value ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  const total = root.value ?? 0
  if (!Number.isFinite(total) || total <= 0) return
  const values = new Map(root.descendants().map(node => [node, node.value ?? 0]))
  // Squarification uses squared weights, so normalize before tiling.
  root.eachBefore(node => { node.value = (node.value ?? 0) / total })
  const width = boundedPixels(options.width, boundedPixels(options.nodeWidth, 96, 8, 400) * 10, 80, 4096)
  const height = boundedPixels(options.height, boundedPixels(options.nodeHeight, 50, 8, 400) * 10, 80, 4096)
  const padding = boundedPixels(options.diagramPadding, 8, 0, 512)
  const gap = boundedPixels(options.padding, 10, 0, 64)
  const border = boundedPixels(options.borderWidth, 1, 0, 12)
  const labelSize = boundedPixels(options.labelFontSize, 14, 6, 72)
  const valueSize = boundedPixels(options.valueFontSize, 12, 6, 64)
  const header = Math.max(labelSize, valueSize) * 1.6 + 6
  const showValues = options.showValues !== false
  const formatted = valueFormatter(options.valueFormat)
  const title = typeof options.title === 'string' ? options.title : ''
  const accessibleTitle = typeof options.accessibleTitle === 'string' && options.accessibleTitle || title || 'Treemap'
  const description = typeof options.description === 'string' ? options.description : ''
  const marker = typeof options.idPrefix === 'string' ? options.idPrefix.replace(/[^\w-]/g, '-') : 'chart'
  const id = `tp-treemap-${marker}`
  const themeValue = typeof options.theme === 'string' ? options.theme : ''
  const themeName = themeValue.includes('dark') ? 'dark' : themeValue
  const colors = Object.hasOwn(palettes, themeName) ? palettes[themeName] : defaultColors
  const theme = diagramOptionsRecord(options.themeVariables)
  const background = paint(theme?.background) ?? (themeName === 'dark' ? '#242631' : '#fdfdff')
  const ink = paint(theme?.textColor) ?? (themeName === 'dark' ? '#f5f4fc' : '#222536')
  const font = [theme?.fontFamily, options.fontFamily].find((value): value is string =>
    typeof value === 'string' && /^[\p{L}\p{N}\s"',_-]{1,140}$/u.test(value))
  const titleHeight = title ? 34 : 0
  const viewWidth = width + padding * 2
  const viewHeight = height + padding * 2 + titleHeight
  const fixed = options.useMaxWidth === false ? ` width="${viewWidth}" height="${viewHeight}"` : ''
  const layout = treemap<TreemapNode>().size([width, height]).round(true)
    .paddingInner(gap).paddingOuter(node => node.depth ? Math.min(gap / 2, 6) : 0)
    .paddingTop(node => node.depth ? header : 0)(root)
  const slots = new Map<unknown, number>()
  const body: string[] = []
  for (const [index, node] of layout.descendants().slice(1).entries()) {
    const x = node.x0 ?? 0
    const y = node.y0 ?? 0
    const w = (node.x1 ?? 0) - x
    const h = (node.y1 ?? 0) - y
    const group = Boolean(node.children)
    const key = group || node.parent === root ? node : node.parent
    if (!slots.has(key)) slots.set(key, slots.size % 12)
    const slot = slots.get(key)!
    const { label, className } = node.data
    const style = { ...(className && classes?.get(className)), ...node.data.style }
    const value = values.get(node) ?? 0
    const cell = paint(theme?.[`cScale${slot}`]) ?? colors[slot % colors.length]
    const customFill = paint(style.fill)
    const fill = customFill ?? cell
    const stroke = paint(style.stroke) ?? paint(theme?.[`cScalePeer${slot}`]) ?? cell
    const labelColor = paint(style.color) ?? paint(theme?.[`cScaleLabel${slot}`]) ?? ink
    const weight = boundedPixels(style['stroke-width'], border, 0, 12)
    const fillOpacity = boundedPixels(style['fill-opacity'], customFill ? 1 : group ? 0.34 : 0.24, 0, 1)
    const opacity = boundedPixels(style.opacity, 1, 0, 1)
    const textSize = boundedPixels(style['font-size'], labelSize, 6, 72)
    const name = escapeHtml(label)
    const formattedValue = formatted(value)
    const displayValue = escapeHtml(formattedValue)
    const groupClass = group ? 'treemapSectionGroup diagram-treemap-group' : 'treemapLeafGroup diagram-treemap-item'
    const shapeClass = group ? 'treemapSection' : 'treemapLeaf'
    const clip = `${id}-clip-${index}`
    const headerHeight = Math.min(h, header)
    const showNumber = showValues && w >= 34 && (group ? w >= 124 : h >= valueSize + textSize + 9)
    const numberWidth = showNumber && group ? Math.max(32, Array.from(formattedValue).length * valueSize * 0.65 + 8) : 0
    const labelHeight = group ? headerHeight : h - (showNumber ? valueSize + 5 : 0)
    const lines = fittedLines(label, w - numberWidth, group ? Math.min(labelHeight, textSize * 1.2) : labelHeight - 6, textSize)
    const lineHeight = textSize * 1.18
    const firstLine = (labelHeight - lines.length * lineHeight) / 2 + lineHeight * 0.72
    const textX = group ? 6 : w / 2
    const anchor = group ? 'start' : 'middle'
    const labelClass = group ? 'treemapSectionLabel' : 'treemapLabel'
    const valueClass = group ? 'treemapSectionValue' : 'treemapValue'
    body.push(`<g class="${groupClass}${className ? ` ${className}` : ''}" data-treemap-label="${name}" data-treemap-value="${value}" data-treemap-depth="${node.depth}" transform="translate(${x},${y})" opacity="${opacity}">
      <title>${name}${showValues ? `: ${displayValue}` : ''}</title>
      <rect class="${shapeClass}" width="${w}" height="${h}" style="fill:${fill};fill-opacity:${fillOpacity};stroke:${stroke};stroke-width:${weight}"/>
      ${group && headerHeight ? `<rect class="treemapSectionHeader" width="${w}" height="${headerHeight}" style="fill:${fill};fill-opacity:${fillOpacity}"/>` : ''}
      <clipPath id="${clip}"><rect width="${w}" height="${h}"/></clipPath>
      <g clip-path="url(#${clip})">
        ${lines.length ? `<text class="${labelClass}" text-anchor="${anchor}" style="fill:${labelColor};font-size:${textSize}px"${group ? ' font-weight="bold"' : ''}>${lines.map((line, i) =>
          `<tspan x="${textX}" y="${firstLine + lineHeight * i}">${escapeHtml(line)}</tspan>`).join('')}</text>` : ''}
        ${showNumber ? `<text class="${valueClass}" x="${group ? w - 7 : w / 2}" y="${group ? headerHeight / 2 + valueSize / 3 : h - 5}" text-anchor="${group ? 'end' : 'middle'}" style="fill:${labelColor};font-size:${valueSize}px">${displayValue}</text>` : ''}
      </g>
    </g>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" data-diagram-kind="treemap" role="img" viewBox="0 0 ${viewWidth} ${viewHeight}"${fixed} aria-labelledby="${id}-title"${description ? ` aria-describedby="${id}-desc"` : ''}${font ? ` font-family="${escapeHtml(font)}"` : ''}>
    <title id="${id}-title">${escapeHtml(accessibleTitle)}</title>
    ${description ? `<desc id="${id}-desc">${escapeHtml(description)}</desc>` : ''}
    <rect width="${viewWidth}" height="${viewHeight}" style="fill:${background}"/>
    ${title ? `<text class="diagram-title treemapTitle" x="${viewWidth / 2}" y="${padding + 22}" text-anchor="middle" style="fill:${ink};font-size:20px">${escapeHtml(title)}</text>` : ''}
    <g class="treemapContainer" transform="translate(${padding},${padding + titleHeight})">${body.join('')}</g>
  </svg>`
}
