import type { MermaidOptions } from '../authoring-setup.ts'
import { chronologyColor, chronologyInk, chronologySvg, readChronology, safeColor, wrappedLabel } from './chronology.ts'
import { arrows, svgTextLines } from './svg.ts'

interface Period { label: string, events: string[] }
interface Section { name: string, periods: Period[] }

function timelineSections(rows: string[]): Section[] | undefined {
  const sections: Section[] = [{ name: '', periods: [] }]
  let current: Period | undefined
  let count = 0
  for (const row of rows) {
    const section = /^section\s+(.+)$/i.exec(row)
    if (section) {
      sections.push({ name: section[1], periods: [] })
      current = undefined
      continue
    }
    if (row.endsWith(':')) return
    const [period, ...events] = row.split(/:\s+/).map(value => value.trim())
    if (events.some(event => !event)) return
    if (period) {
      current = { label: period, events: [] }
      sections.at(-1)!.periods.push(current)
      count++
    }
    if (!current) return
    current.events.push(...events)
    count += events.length
    if (count > 300) return
  }
  return sections.filter(section => section.periods.length)
}

const itemWidth = 164
const eventWidth = 244
const outer = 16
const gap = 12

function timelineCard(label: string[], x: number, y: number, width: number, height: number, color: string, foreground: string, type: string): string {
  return `<g class="diagram-timeline-${type}" style="--chronology-fill:${color};--chronology-ink:${foreground}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6"/>${svgTextLines(label, x + width / 2, y + height / 2)}</g>`
}

export function timeline(source: string, marker: string, options: MermaidOptions): string | undefined {
  const chart = readChronology(source, typeof options.title === 'string' ? options.title : '')
  const header = /^timeline(?:\s+(LR|TD))?$/i.exec(chart?.header ?? '')
  if (!chart || !header) return
  const sections = timelineSections(chart.rows)
  if (!sections?.length) return
  const settings = options.timeline as Record<string, unknown> | undefined
  const vars = options.themeVariables as Record<string, unknown> | undefined
  const direction = header[1] ?? settings?.direction
  const vertical = typeof direction === 'string' && direction.toUpperCase() === 'TD'
  const hasSections = sections.some(section => section.name)
  let width = vertical ? itemWidth + eventWidth + outer * 4 + gap : outer * 2
  let height = outer * 2
  const top = chart.title ? 40 : outer
  let x = outer
  let y = top
  let paletteIndex = 0
  const groupLabelHeight = hasSections
    ? Math.max(...sections.map(section => 14 + 16 * wrappedLabel(section.name,
      Math.max(12, Math.floor((vertical ? width - outer * 2 : section.periods.length * (itemWidth + gap) - gap) / 8))).length))
    : 0
  const periodHeights = sections.flatMap(section => section.periods.map(period => 16 + wrappedLabel(period.label, 19).length * 16))
  const periodHeight = Math.max(42, ...periodHeights)
  const pieces = []
  for (const section of sections) {
    const sectionColor = paletteIndex
    const color = (index: number) => safeColor(vars?.[`cScale${index % 12}`]) ?? chronologyColor(index)
    const foreground = (index: number) => safeColor(vars?.[`cScaleLabel${index % 12}`]) ?? chronologyInk
    if (section.name) {
      const sectionWidth = vertical ? width - outer * 2 : section.periods.length * (itemWidth + gap) - gap
      pieces.push(timelineCard(wrappedLabel(section.name, Math.max(12, Math.floor(sectionWidth / 8))),
        x, y, sectionWidth, groupLabelHeight, color(sectionColor), foreground(sectionColor), 'section'))
    }
    if (vertical && section.name) y += groupLabelHeight + gap
    for (const period of section.periods) {
      const index = hasSections ? sectionColor : settings?.disableMulticolor === true ? 0 : paletteIndex++
      const fill = color(index)
      const ink = foreground(index)
      const startY = vertical ? y : y + (hasSections ? groupLabelHeight + gap : 0)
      const periodLines = wrappedLabel(period.label, 19)
      const events = period.events.map(event => wrappedLabel(event, vertical ? 28 : 19))
      const periodX = vertical ? x + outer + gap : x
      pieces.push(timelineCard(periodLines, periodX, startY, itemWidth, periodHeight, fill, ink, 'period'))
      const firstEventY = vertical ? startY : startY + periodHeight + gap * 2
      let eventY = firstEventY
      const eventX = vertical ? periodX + itemWidth + gap : x
      for (const lines of events) {
        const eventHeight = 16 + lines.length * 16
        if (vertical) {
          const center = eventY + eventHeight / 2
          pieces.push(`<path class="diagram-chronology-guide" d="M${periodX + itemWidth} ${startY + periodHeight / 2}H${eventX - 5}V${center}H${eventX}"/>`)
        }
        pieces.push(timelineCard(lines, eventX, eventY, vertical ? eventWidth : itemWidth, eventHeight, fill, ink, 'event'))
        eventY += eventHeight + 6
      }
      if (vertical) {
        pieces.push(`<path class="diagram-chronology-guide" d="M${x + 8} ${startY + periodHeight / 2}H${periodX}"/>`)
        y = Math.max(startY + periodHeight, eventY - 6) + gap
      }
      else {
        if (events.length) pieces.push(`<path class="diagram-chronology-guide" d="M${x + itemWidth / 2} ${startY + periodHeight}V${firstEventY}"/>`)
        height = Math.max(height, eventY, firstEventY + 8)
        x += itemWidth + gap
      }
    }
    if (hasSections) paletteIndex++
    if (!vertical && hasSections) x += 4
  }
  const safeMarker = /^[\w-]+$/.test(marker) ? marker : 'timeline-arrow'
  if (vertical) height = y + outer
  else width = x + outer
  const baselineY = top + (hasSections ? groupLabelHeight + gap : 0) + periodHeight + gap
  const axis = vertical ? `M${outer + 8} ${top}V${height - 10}` : ` M8 ${baselineY}H${width - 8}`
  const body = `<g data-diagram-kind="timeline" data-direction="${vertical ? 'TD' : 'LR'}">${arrows(safeMarker)}<path class="diagram-chronology-axis" d="${axis.trim()}" marker-end="url(#${safeMarker})"/>${pieces.join('')}</g>`
  return chronologySvg(chart, safeMarker, 'Timeline', width, height, body)
}
