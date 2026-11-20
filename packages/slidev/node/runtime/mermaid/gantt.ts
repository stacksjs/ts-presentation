import type { GanttChartOptions, GanttMarkerStyle, GanttSchedule, GanttTask, GanttTaskCallback, GanttTaskTag, GanttWeekday } from 'ts-charts/diagrams'
import { ganttChart, ganttDateParser, ganttDurationEnd, scheduleGantt as scheduleTasks } from 'ts-charts/diagrams'
import type { MermaidOptions } from '../authoring-setup.ts'
import { diagramPixels, readChronology, sizeChronologySvg } from './chronology.ts'
import { ganttTheme } from './gantt-themes.ts'

function isTag(value: string): value is GanttTaskTag {
  return ['active', 'done', 'crit', 'milestone', 'vert'].includes(value)
}

const weekdays: ReadonlySet<string> = new Set(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'])

export function isGanttHeader(line = ''): boolean {
  return /^gantt(?:\s+%%.*)?$/i.test(line)
}

function isWeekday(value: unknown): value is GanttWeekday {
  return typeof value === 'string' && weekdays.has(value)
}

function markerNumber(value: string, unit: 'px' | '%'): number | undefined {
  const numeric = value.endsWith(unit) ? value.slice(0, -unit.length) : value
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(numeric)) return
  return Number(numeric) / (unit === '%' && numeric !== value ? 100 : 1)
}

function markerStyle(text: string): GanttMarkerStyle {
  const style: GanttMarkerStyle = {}
  for (const field of text.split(/[,;](?=\s*[\w-]+\s*:)/)) {
    const [, key, value] = /^\s*([\w-]+)\s*:\s*(.+?)\s*$/.exec(field) ?? []
    if (!value) continue
    switch (key.toLowerCase()) {
      case 'stroke': style.stroke = value; break
      case 'stroke-width': style.strokeWidth = markerNumber(value, 'px'); break
      case 'opacity': style.opacity = markerNumber(value, '%'); break
      case 'stroke-opacity': style.strokeOpacity = markerNumber(value, '%'); break
      case 'stroke-dashoffset': style.strokeDashoffset = markerNumber(value, 'px'); break
      case 'stroke-linecap':
        if (value === 'round' || value === 'square' || value === 'butt') style.strokeLinecap = value
        break
      case 'stroke-dasharray': {
        const dash = value.split(/[\s,]+/).map(part => markerNumber(part, 'px') ?? NaN)
        if (value === 'none' || dash.every(Number.isFinite)) style.strokeDasharray = value === 'none' ? value : dash
        break
      }
    }
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
  const [, ids, clauses] = /^click\s+([\w.-]+(?:,[\w.-]+)*)\s+(.+)$/i.exec(line) ?? []
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

function parseGantt(source: string, now: number, options: Pick<GanttChartOptions, 'axisFormat' | 'timeZone'> & { interactionsEnabled?: boolean } = {}): GanttChartOptions | undefined {
  const chart = readChronology(source, '', { gantt: true })
  if (!chart || !isGanttHeader(chart.header)) return
  const { axisFormat: configuredAxisFormat, timeZone, interactionsEnabled } = options

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
  for (const line of chart.rows) {
    const [, directive, text = ''] = /^([^\s:]+)(?:\s*:\s*|\s+)?(.*)$/.exec(line) ?? []
    switch (directive?.toLowerCase()) {
      case 'dateformat': if (!text || text.length > 72) return; dateFormat = text; continue
      case 'axisformat': axisFormat = text; continue
      case 'tickinterval': ticks = text; continue
      case 'excludes': exclusions.push(...text.split(/[\s,]+/).filter(Boolean)); continue
      case 'includes': inclusions.push(...text.split(/[\s,]+/).filter(Boolean)); continue
      case 'section': if (!text) return; sections.push({ name: text.replace(/<\/?br(?:\s|\\t)*\/?>/gi, '<br>'), tasks: [] }); continue
      case 'weekday': {
        const day = text.toLowerCase()
        if (!isWeekday(day)) return
        weekday = day
        continue
      }
      case 'weekend': {
        const day = text.toLowerCase()
        if (day !== 'friday' && day !== 'saturday') return
        weekend = day
        continue
      }
      case 'todaymarker':
        todayMarker = text.toLowerCase() !== 'off'
        todayMarkerStyle = todayMarker ? markerStyle(text) : undefined
        continue
      case 'topaxis': topAxis = true; continue
      case 'inclusiveenddates': inclusiveEndDates = true; continue
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
    if (segments.length < 1 || segments.length > 3 || segments.slice(0, -1).some(segment => !segment)) return
    const id = segments.length === 3 ? segments.shift() : undefined
    const [start, end] = segments.length === 2 ? segments : [undefined, segments[0]]
    const task: GanttTask = { id, name, tags }
    const after = start && /^after\s+(.+)$/.exec(start)?.[1]
    const until = /^until\s+(.+)$/.exec(end)?.[1]
    if (after) task.after = after.split(/\s+/)
    else if (start) task.start = start
    if (until) task.until = until.split(/\s+/)
    else task.end = end
    sections.at(-1)!.tasks.push(task)
  }
  const parseDate = ganttDateParser(dateFormat, now, timeZone)
  const tasks = sections.flatMap(section => section.tasks)
  const taskIds = new Set(tasks.flatMap(task => task.id ? [task.id] : []))
  let nextId = 1
  for (const task of tasks) {
    if (task.id) continue
    while (taskIds.has(`task${nextId}`)) nextId++
    task.id = `task${nextId++}`
    taskIds.add(task.id)
  }
  for (const task of tasks) {
    for (const kind of ['after', 'until'] as const) {
      const unknown = task[kind]?.filter(id => !taskIds.has(id))
      if (unknown?.length) console.warn(`Gantt task "${task.name}" references unknown IDs in "${kind}": ${unknown.join(', ')}`)
    }
    // A literal suffix in dateFormat can make a date look like a duration.
    if (task.end !== undefined && parseDate(task.end) === undefined) {
      const duration = ganttDurationEnd(0, task.end)
      if (duration === undefined && task.end && task.end !== '0')
        console.warn(`Gantt task "${task.name}" has an invalid end "${task.end}". Use a date or duration such as 0d for a milestone.`)
      task.duration = duration === undefined ? '0ms' : task.end
      delete task.end
    }
    const interaction = task.id ? interactions.get(task.id) : undefined
    if (interaction) Object.assign(task, interaction)
  }
  return { sections, title: chart.title, accessibleTitle: chart.accessibleTitle, description: chart.description, dateFormat, timeZone,
    axisFormat: axisFormat || configuredAxisFormat || (dateFormat === 'D' ? '%d' : ''), tickInterval: ticks,
    weekday, weekend, topAxis, todayMarker, todayMarkerStyle, inclusiveEndDates,
    excludes: exclusions, includes: inclusions, calendarMatch: 'formatted', startDateFallback: 'iso',
    exclusionMode: 'whole-days', exclusionBands: 'ranges', fixedEndDateFormat: 'YYYY-MM-DD',
    durationMode: 'calendar', missingDependencyFallback: 'today', now }
}

export function scheduleGantt(source: string, now: number = Date.now()): GanttSchedule | undefined {
  const options = parseGantt(source, now)
  if (options) return scheduleTasks(options)
}

export function gantt(source: string, idPrefix: string, options: MermaidOptions = {}): string | undefined {
  const config = options.gantt && typeof options.gantt === 'object' ? options.gantt as Record<string, unknown> : {}
  const axisFormat = typeof config.axisFormat === 'string' ? config.axisFormat : undefined
  const timeZone = config.timeZone === 'local' ? 'local' : 'UTC'
  const chart = parseGantt(source, Date.now(), { axisFormat, timeZone, interactionsEnabled: options.securityLevel === 'loose' })
  if (!chart) return
  const variables = options.themeVariables && typeof options.themeVariables === 'object' ? options.themeVariables as Record<string, unknown> : {}
  const preset = ganttTheme(options.theme)
  const styled = typeof options.themeCSS === 'string' && !!options.themeCSS.trim()
  const number = (key: string) => diagramPixels(config[key])
  const color = (key: string) => typeof variables[key] === 'string' ? variables[key] as string : preset?.[key]
  const alternateSection = color('altSectionBkgColor')
  const sectionColors = [color('sectionBkgColor'), alternateSection, color('sectionBkgColor2'), alternateSection]
  const svg = ganttChart({
    ...chart, idPrefix, title: chart.title || (typeof options.title === 'string' ? options.title : ''),
    maxExplicitTicks: 10_000,
    tickInterval: chart.tickInterval || (typeof config.tickInterval === 'string' ? config.tickInterval : undefined),
    weekday: chart.weekday ?? (isWeekday(config.weekday) ? config.weekday : undefined),
    topAxis: chart.topAxis ?? config.topAxis === true,
    todayMarker: chart.todayMarker ?? config.todayMarker !== false,
    todayMarkerStyle: { stroke: color('todayLineColor'), ...chart.todayMarkerStyle },
    displayMode: config.displayMode === 'compact' ? 'compact' : undefined,
    taskLabelPlacement: 'bar',
    wrapTaskLabels: true,
    barHeight: number('barHeight'), barGap: number('barGap'), topPadding: number('topPadding'),
    leftPadding: number('leftPadding'), rightPadding: number('rightPadding'),
    width: number('useWidth'), titleTopMargin: number('titleTopMargin'), bottomMarginAdj: number('bottomMarginAdj'),
    gridLineStartPadding: number('gridLineStartPadding'), fontSize: number('fontSize'), sectionFontSize: number('sectionFontSize'),
    numberSectionStyles: number('numberSectionStyles') ?? (preset || styled ? 4 : 1), sectionColors,
    palette: {
      background: color('background'),
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
  return sizeChronologySvg(svg, config.useMaxWidth)
}
