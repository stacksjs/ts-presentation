import { path } from 'ts-charts/path'
import { escapeHtml } from '../html.ts'
import { diagramSvg, svgText } from './svg.ts'

const palette = ['#659dd5', '#e7b567', '#78c2a5', '#b6a0d8', '#db8993', '#68bdc4', '#b5c578', '#e59772']

export function pieDiagram(source: string, settings?: unknown, defaultTitle = ''): string | undefined {
  const rows = source.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('%%'))
  const header = /^(?:pie)(\s+showData)?(?:\s+title\s+(.+))?\s*$/.exec(rows.shift() ?? '')
  if (!header) return
  let title = header[2] ?? defaultTitle
  const data = []
  for (const row of rows) {
    if (/^title\s+/.test(row)) { title = row.slice(6).trim(); continue }
    const [, label, amount] = /^"([^"]+)"\s*:\s*(\d+(?:\.\d+)?)$/.exec(row) ?? []
    if (!label || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return
    data.push({ label, value: Number(amount) })
  }
  const total = data.reduce((sum, item) => sum + item.value, 0)
  if (!data.length || data.length > 40 || !Number.isFinite(total)) return
  const settingsObject = settings && typeof settings === 'object' ? settings as Record<string, unknown> : {}
  const donut = typeof settingsObject.donutHole === 'number' ? Math.min(0.9, Math.max(0, settingsObject.donutHole)) : 0
  const labelRadius = typeof settingsObject.textPosition === 'number' && Number.isFinite(settingsObject.textPosition)
    ? Math.max(donut, Math.min(1, settingsObject.textPosition)) : Math.max(0.7, (donut + 1) / 2)
  const side = settingsObject.legendPosition === 'left' ? 'left' : settingsObject.legendPosition === 'bottom' ? 'bottom' : 'right'
  const radius = 130
  const offset = title ? 56 : 26
  const legendWidth = Math.max(...data.map(item => (item.label.length + (header[1] ? String(item.value).length + 3 : 0)) * 8 + 50))
  const chartWidth = radius * 2 + 52
  const width = side === 'bottom' ? Math.max(chartWidth, legendWidth + 20) : chartWidth + legendWidth
  const left = side === 'left' ? legendWidth : 0
  const chartX = side === 'bottom' ? width / 2 : left + chartWidth / 2
  const chartY = offset + radius
  const legendHeight = data.length * 25
  const legendX = side === 'bottom' ? (width - legendWidth) / 2 + 10 : side === 'left' ? 15 : chartWidth + 2
  const legendY = side === 'bottom' ? chartY + radius + 24 : Math.max(offset, chartY - legendHeight / 2)
  const height = Math.max(chartY + radius + 24, legendY + legendHeight + 12)
  let angle = -Math.PI / 2
  const wedges = data.map((slice, index) => {
    const percent = slice.value / total * 100
    const color = palette[index % palette.length]
    const end = angle + Math.PI * 2 * percent / 100
    const center = (angle + end) / 2
    const shape = path()
    shape.arc(0, 0, radius, angle, end)
    if (donut > 0) shape.arc(0, 0, radius * donut, end, angle, true)
    else shape.lineTo(0, 0)
    shape.closePath()
    angle = end
    const highlighted = settingsObject.highlightSlice === slice.label
    const title = escapeHtml(`${slice.label}: ${slice.value}`)
    const text = percent >= 5 ? svgText(`${Math.round(percent)}%`, Math.cos(center) * radius * labelRadius, Math.sin(center) * radius * labelRadius, 'diagram-pie-percent') : ''
    return `<g class="diagram-pie-slice${highlighted ? ' diagram-pie-highlight' : ''}"><title>${title}</title><path d="${shape}" fill="${color}"/>${text}</g>`
  }).join('')
  const legend = data.map((item, index) => {
    const y = legendY + index * 25
    const label = header[1] ? `${item.label} [${item.value}]` : item.label
    return `<rect x="${legendX}" y="${y}" width="15" height="15" rx="2" fill="${palette[index % palette.length]}"/>${svgText(label, legendX + 24, y + 8, '', 'start')}`
  }).join('')
  return diagramSvg(title || 'Pie chart', width, height, (title ? svgText(title, width / 2, 25, 'diagram-title') : '') + `<g transform="translate(${chartX} ${chartY})">${wedges}</g>${legend}`)
}
