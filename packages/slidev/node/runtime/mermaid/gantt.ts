import type { GanttChartOptions, GanttMarkerStyle, GanttSchedule, GanttTask, GanttTaskTag, GanttWeekday } from 'ts-charts/diagrams'
import { ganttChart, ganttDurationEnd, scheduleGantt as scheduleTasks } from 'ts-charts/diagrams'
import { readChronology } from './chronology.ts'

function isTag(value: string): value is GanttTaskTag {
  return ['active', 'done', 'crit', 'milestone', 'vert'].includes(value)
}

const weekdays: ReadonlySet<string> = new Set(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'])

function isWeekday(value: unknown): value is GanttWeekday {
  return typeof value === 'string' && weekdays.has(value)
}

function markerStyle(text: string): GanttMarkerStyle {
  const style: GanttMarkerStyle = {}
  for (const field of text.split(',')) {
    const [key, value] = field.split(':').map(part => part.trim())
    if (!value) continue
    if (key === 'stroke') style.stroke = value
    if (key === 'stroke-width' && /^\d+(?:\.\d+)?(?:px)?$/.test(value)) style.strokeWidth = Number.parseFloat(value)
    if (key === 'opacity' && /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) style.opacity = Number(value)
  }
  return style
}

function parseGantt(source: string, linksEnabled = false): GanttChartOptions | undefined {
  const chart = readChronology(source, '')
  if (!chart || chart.header !== 'gantt') return

  let dateFormat = 'YYYY-MM-DD'
  let axisFormat = ''
  let ticks = ''
  let weekend: GanttChartOptions['weekend']
  let weekday: GanttWeekday | undefined
  let topAxis: boolean | undefined
  let todayMarker: boolean | undefined
  let todayMarkerStyle: GanttMarkerStyle | undefined
  let inclusiveEndDates = false
  const exclusions: string[] = []
  const inclusions: string[] = []
  const sections: { name?: string, tasks: GanttTask[] }[] = [{ tasks: [] }]
  const links = new Map<string, string>()
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
      case 'weekday':
        if (!isWeekday(text)) return
        weekday = text
        continue
      case 'weekend':
        if (text !== 'friday' && text !== 'saturday') return
        weekend = text
        continue
      case 'todayMarker':
        todayMarker = text !== 'off'
        todayMarkerStyle = todayMarker ? markerStyle(text) : undefined
        continue
      case 'topAxis': topAxis = true; continue
      case 'inclusiveEndDates': inclusiveEndDates = true; continue
      case 'click': {
        const [, id, tail] = /^click\s+([\w.-]+)\s+(.+)$/.exec(line) ?? []
        if (!id) return
        const href = /^(?:call\s+[\w$.]+\([^)]*\)\s+)?href\s+"([^"]*)"(?:\s+call\s+[\w$.]+\([^)]*\))?$/.exec(tail)?.[1]
        if (href === undefined && !/^call\s+[\w$.]+\([^)]*\)$/.test(tail)) return
        if (linksEnabled && href) links.set(id, href)
        continue
      }
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
  if (links.size) {
    for (const section of sections)
      for (const task of section.tasks)
        if (task.id) task.href = links.get(task.id)
  }
  return { sections, title: chart.title, accessibleTitle: chart.accessibleTitle, description: chart.description, dateFormat, axisFormat, tickInterval: ticks,
    weekday, weekend, topAxis, todayMarker, todayMarkerStyle, inclusiveEndDates, excludes: exclusions, includes: inclusions }
}

export function scheduleGantt(source: string, now: number = Date.now()): GanttSchedule | undefined {
  const options = parseGantt(source)
  if (options) return scheduleTasks({ ...options, now })
}

export function gantt(source: string, idPrefix: string, options?: unknown, fallbackTitle = '', linksEnabled = false): string | undefined {
  const chart = parseGantt(source, linksEnabled)
  if (!chart) return
  const config = options && typeof options === 'object' ? options as Record<string, unknown> : {}
  const number = (key: string) => typeof config[key] === 'number' ? config[key] as number : undefined
  return ganttChart({
    ...chart, idPrefix, title: chart.title || fallbackTitle,
    axisFormat: chart.axisFormat || (typeof config.axisFormat === 'string' ? config.axisFormat : undefined),
    tickInterval: chart.tickInterval || (typeof config.tickInterval === 'string' ? config.tickInterval : undefined),
    weekday: chart.weekday ?? (isWeekday(config.weekday) ? config.weekday : undefined),
    topAxis: chart.topAxis ?? config.topAxis === true,
    todayMarker: chart.todayMarker ?? config.todayMarker !== false,
    displayMode: config.displayMode === 'compact' ? 'compact' : undefined,
    barHeight: number('barHeight'), barGap: number('barGap'), topPadding: number('topPadding'),
    leftPadding: number('leftPadding'), rightPadding: number('rightPadding'),
  })
}
