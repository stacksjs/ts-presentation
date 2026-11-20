import type { GanttChartOptions, GanttMarkerStyle, GanttSchedule, GanttTask, GanttTaskCallback, GanttTaskTag, GanttWeekday } from 'ts-charts/diagrams'
import { ganttChart, ganttDurationEnd, scheduleGantt as scheduleTasks } from 'ts-charts/diagrams'
import { diagramPixels, readChronology } from './chronology.ts'

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

function splitCallbackArgs(raw: string): string[] | undefined {
  if (!raw.trim()) return []
  const token = /\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^,'"]*?))\s*(,|$)/gy
  const args: string[] = []
  while (token.lastIndex < raw.length) {
    const match = token.exec(raw)
    if (!match) return
    const [, double, single, bare, separator] = match
    args.push((double ?? single ?? bare.trim()).replace(/\\(["'\\])/g, '$1'))
    if (!separator) break
    if (token.lastIndex === raw.length) args.push('')
  }
  return args
}

interface TaskInteraction { href?: string, callback?: GanttTaskCallback }

function parseClick(line: string): { ids: string[], interaction: TaskInteraction } | undefined {
  const [, ids, clauses] = /^click\s+([\w.-]+(?:,[\w.-]+)*)\s+(.+)$/.exec(line) ?? []
  if (!ids) return
  const interaction: TaskInteraction = {}
  let remaining = clauses
  while (remaining) {
    const command = /^(?:href\s+"((?:[^"\\]|\\.)*)"|call\s+([a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*)\s*\(((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^"'()])*)\))(?=\s|$)/i.exec(remaining)
    if (!command) return
    const [clause, href, name, raw] = command
    if (href !== undefined) {
      if (interaction.href !== undefined) return
      interaction.href = href.replace(/\\(["\\])/g, '$1')
    }
    else {
      if (interaction.callback) return
      const args = splitCallbackArgs(raw)
      if (!args) return
      interaction.callback = { name, args }
    }
    remaining = remaining.slice(clause.length).trimStart()
  }
  return { ids: ids.split(','), interaction }
}

function parseGantt(source: string, interactionsEnabled = false): GanttChartOptions | undefined {
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
  const interactions = new Map<string, TaskInteraction>()
  let generatedIds = 0
  for (const line of chart.rows) {
    const [, directive, text = ''] = /^(\S+)(?:\s+(.+))?$/.exec(line) ?? []
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
        const action = parseClick(line)
        if (!action) return
        if (interactionsEnabled) {
          for (const id of action.ids) interactions.set(id, { ...interactions.get(id), ...action.interaction })
        }
        continue
      }
    }
    const [, name, spec] = /^(.+?)\s*:\s*(.+)$/.exec(line) ?? []
    if (!name) return
    const segments = spec.split(',').map(part => part.trim())
    const tags: GanttTaskTag[] = []
    while (isTag(segments[0])) tags.push(segments.shift() as GanttTaskTag)
    if (segments.length < 1 || segments.length > 3 || segments.some(segment => !segment)) return
    const id = segments.length === 3 ? segments.shift()! : `task${++generatedIds}`
    const [start, end] = segments.length === 2 ? segments : [undefined, segments[0]]
    const task: GanttTask = { id, name, tags }
    const after = start && /^after\s+(.+)$/.exec(start)?.[1]
    const until = /^until\s+(.+)$/.exec(end)?.[1]
    if (after) task.after = after.split(/\s+/)
    else if (start) task.start = start
    if (until) task.until = until.split(/\s+/)
    else if (ganttDurationEnd(0, end) !== undefined) task.duration = end
    else task.end = end
    sections.at(-1)!.tasks.push(task)
  }
  if (interactions.size) {
    for (const section of sections)
      for (const task of section.tasks)
        if (task.id) Object.assign(task, interactions.get(task.id))
  }
  return { sections, title: chart.title, accessibleTitle: chart.accessibleTitle, description: chart.description, dateFormat, axisFormat, tickInterval: ticks,
    weekday, weekend, topAxis, todayMarker, todayMarkerStyle, inclusiveEndDates, excludes: exclusions, includes: inclusions, exclusionMode: 'whole-days' }
}

export function scheduleGantt(source: string, now: number = Date.now()): GanttSchedule | undefined {
  const options = parseGantt(source)
  if (options) return scheduleTasks({ ...options, now })
}

export function gantt(source: string, idPrefix: string, options?: unknown, fallbackTitle = '', interactionsEnabled = false, theme?: unknown): string | undefined {
  const chart = parseGantt(source, interactionsEnabled)
  if (!chart) return
  const config = options && typeof options === 'object' ? options as Record<string, unknown> : {}
  const variables = theme && typeof theme === 'object' ? theme as Record<string, unknown> : {}
  const number = (key: string) => diagramPixels(config[key])
  const color = (key: string) => typeof variables[key] === 'string' ? variables[key] as string : undefined
  const alternateSection = color('altSectionBkgColor')
  const sectionColors = [color('sectionBkgColor'), alternateSection, color('sectionBkgColor2'), alternateSection]
  return ganttChart({
    ...chart, idPrefix, title: chart.title || fallbackTitle,
    axisFormat: chart.axisFormat || (typeof config.axisFormat === 'string' ? config.axisFormat : undefined),
    tickInterval: chart.tickInterval || (typeof config.tickInterval === 'string' ? config.tickInterval : undefined),
    weekday: chart.weekday ?? (isWeekday(config.weekday) ? config.weekday : undefined),
    topAxis: chart.topAxis ?? config.topAxis === true,
    todayMarker: chart.todayMarker ?? config.todayMarker !== false,
    todayMarkerStyle: { stroke: color('todayLineColor'), ...chart.todayMarkerStyle },
    displayMode: config.displayMode === 'compact' ? 'compact' : undefined,
    barHeight: number('barHeight'), barGap: number('barGap'), topPadding: number('topPadding'),
    leftPadding: number('leftPadding'), rightPadding: number('rightPadding'),
    width: number('useWidth'), titleTopMargin: number('titleTopMargin'), bottomMarginAdj: number('bottomMarginAdj'),
    gridLineStartPadding: number('gridLineStartPadding'), fontSize: number('fontSize'), sectionFontSize: number('sectionFontSize'),
    numberSectionStyles: number('numberSectionStyles') ?? 1, sectionColors,
    palette: {
      task: { fill: color('taskBkgColor'), border: color('taskBorderColor') },
      active: { fill: color('activeTaskBkgColor'), border: color('activeTaskBorderColor') },
      done: { fill: color('doneTaskBkgColor'), border: color('doneTaskBorderColor') },
      critical: { fill: color('critBkgColor'), border: color('critBorderColor') },
      insideText: color('taskTextColor'), statusText: color('taskTextDarkColor'),
      outsideText: color('taskTextOutsideColor'), clickableText: color('taskTextClickableColor'),
      title: color('titleColor') ?? color('textColor'), sectionText: color('titleColor'),
      grid: color('gridColor'), axisText: color('textColor'),
      excluded: color('excludeBkgColor'), reference: color('vertLineColor'),
    },
  })
}
