import { timelineChart } from 'ts-charts/diagrams'
import type { MermaidOptions } from '../authoring-setup.ts'
import { readChronology } from './chronology.ts'

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

export function timeline(source: string, marker: string, options: MermaidOptions): string | undefined {
  const chart = readChronology(source, typeof options.title === 'string' ? options.title : '')
  const header = /^timeline(?:\s+(LR|TD))?$/i.exec(chart?.header ?? '')
  if (!chart || !header) return
  const sections = timelineSections(chart.rows)
  if (!sections?.length) return
  const settings = options.timeline as Record<string, unknown> | undefined
  const vars = options.themeVariables as Record<string, unknown> | undefined
  const direction = header[1] ?? settings?.direction
  const palette = (key: string) => Array.from({ length: 12 }, (_, index) => {
    const color = vars?.[`${key}${index}`]
    return typeof color === 'string' ? color : undefined
  })
  return timelineChart({
    title: chart.title, accessibleTitle: chart.accessibleTitle, description: chart.description, idPrefix: marker,
    sections, direction: typeof direction === 'string' && direction.toUpperCase() === 'TD' ? 'TD' : 'LR',
    multicolor: settings?.disableMulticolor !== true, colors: palette('cScale'), labelColors: palette('cScaleLabel'),
  })
}
