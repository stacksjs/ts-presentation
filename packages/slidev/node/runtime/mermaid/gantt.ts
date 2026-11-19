import type { GanttChartOptions, GanttSchedule, GanttTask, GanttTaskTag } from 'ts-charts/diagrams'
import { ganttChart, ganttDurationEnd, scheduleGantt as scheduleTasks } from 'ts-charts/diagrams'
import { readChronology } from './chronology.ts'

function isTag(value: string): value is GanttTaskTag {
  return ['active', 'done', 'crit', 'milestone', 'vert'].includes(value)
}

function parseGantt(source: string): GanttChartOptions | undefined {
  const code = source.split(/\r?\n/).map(line => line.split('%%', 1)[0]).join('\n')
  const chart = readChronology(code, '')
  if (!chart || chart.header !== 'gantt') return

  let dateFormat = 'YYYY-MM-DD'
  let axisFormat = ''
  let ticks = ''
  let weekend: GanttChartOptions['weekend']
  let topAxis = false
  let todayMarker = true
  let inclusiveEndDates = false
  const exclusions: string[] = []
  const inclusions: string[] = []
  const sections: { name?: string, tasks: GanttTask[] }[] = [{ tasks: [] }]
  for (const line of chart.rows) {
    const [directive, ...words] = line.split(/\s+/)
    const text = words.join(' ')
    switch (directive) {
      case 'dateFormat': if (!text || text.length > 72) return; dateFormat = text; continue
      case 'axisFormat': axisFormat = text; continue
      case 'tickInterval': ticks = text; continue
      case 'excludes': exclusions.push(...text.split(/[\s,]+/).filter(Boolean)); continue
      case 'includes': inclusions.push(...text.split(/[\s,]+/).filter(Boolean)); continue
      case 'section': if (!text) return; sections.push({ name: text, tasks: [] }); continue
      case 'weekend':
        if (text !== 'friday' && text !== 'saturday') return
        weekend = text
        continue
      case 'todayMarker': todayMarker = text !== 'off'; continue
      case 'topAxis': topAxis = true; continue
      case 'inclusiveEndDates': inclusiveEndDates = true; continue
    }
    const [, name, spec] = /^(.+?)\s*:\s*(.+)$/.exec(line) ?? []
    if (!name) return
    const segments = spec.split(',').map(part => part.trim())
    const tags: GanttTaskTag[] = []
    while (isTag(segments[0])) tags.push(segments.shift() as GanttTaskTag)
    if (segments.length < 1 || segments.length > 3 || segments.some(segment => !segment)) return
    const id = segments.length === 3 ? segments.shift()! : undefined
    const [start, end] = segments.length === 2 ? segments : [undefined, segments[0]]
    const task: GanttTask = { id, name, tags }
    if (start?.startsWith('after ')) task.after = start.slice(6).trim().split(/\s+/)
    else if (start) task.start = start
    if (end.startsWith('until ')) task.until = end.slice(6).trim().split(/\s+/)
    else if (ganttDurationEnd(0, end) !== undefined) task.duration = end
    else task.end = end
    sections.at(-1)!.tasks.push(task)
  }
  return { sections, title: chart.title, accessibleTitle: chart.accessibleTitle, description: chart.description, dateFormat, axisFormat, tickInterval: ticks,
    weekend, topAxis, todayMarker, inclusiveEndDates, excludes: exclusions, includes: inclusions }
}

export function scheduleGantt(source: string, now: number = Date.now()): GanttSchedule | undefined {
  const options = parseGantt(source)
  if (options) return scheduleTasks({ ...options, now })
}

export function gantt(source: string, idPrefix: string, options?: unknown, fallbackTitle = ''): string | undefined {
  const chart = parseGantt(source)
  if (!chart) return
  const config = options && typeof options === 'object' ? options as Record<string, unknown> : {}
  return ganttChart({ ...chart, idPrefix, title: chart.title || fallbackTitle,
    displayMode: config.displayMode === 'compact' ? 'compact' : undefined })
}
