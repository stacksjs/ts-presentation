import { escapeHtml } from '../html.ts'
import { dayMs, durationEnd, ganttAxisDate, ganttDateParser, ganttTicks, weekdays } from './gantt-time.ts'
import { diagramSvg, svgText } from './svg.ts'

const taskTags = new Set(['active', 'done', 'crit', 'milestone', 'vert'])
const maxTasks = 180

interface TaskDefinition {
  name: string
  section: number
  id: string
  from: string
  to: string
  tags: string[]
  index: number
}

interface Task extends TaskDefinition {
  start: number
  end: number
}

interface Schedule {
  tasks: Task[]
  sections: string[]
  title: string
  axisFormat: string
  ticks: string
  topAxis: boolean
  todayMarker: boolean
  isExcluded: (date: number) => boolean
}

/** Resolve tasks as a dependency graph so that until/after can refer forward. */
export function scheduleGantt(source: string, now: number = Date.now()): Schedule | undefined {
  const rows = source.split(/\r?\n/).map(line => line.split('%%', 1)[0].trim()).filter(Boolean)
  if (rows.shift() !== 'gantt') return

  let title = ''
  let dateFormat = 'YYYY-MM-DD'
  let axisFormat = ''
  let ticks = ''
  let weekend = 6
  let topAxis = false
  let todayMarker = true
  let inclusiveEndDates = false
  const exclusions: string[] = []
  const inclusions: string[] = []
  const sections = ['']
  const byId = new Map<string, TaskDefinition>()
  const definitions: TaskDefinition[] = []
  for (const line of rows) {
    const [directive, ...words] = line.split(/\s+/)
    const text = words.join(' ')
    switch (directive) {
      case 'title': title = text; continue
      case 'dateFormat': if (!text || text.length > 72) return; dateFormat = text; continue
      case 'axisFormat': axisFormat = text; continue
      case 'tickInterval': ticks = text; continue
      case 'excludes': exclusions.push(...text.split(/[\s,]+/).filter(Boolean)); continue
      case 'includes': inclusions.push(...text.split(/[\s,]+/).filter(Boolean)); continue
      case 'section': if (!text) return; sections.push(text); continue
      case 'weekend':
        if (text !== 'friday' && text !== 'saturday') return
        weekend = text === 'friday' ? 5 : 6
        continue
      case 'todayMarker': todayMarker = text !== 'off'; continue
      case 'topAxis': topAxis = true; continue
      case 'inclusiveEndDates': inclusiveEndDates = true; continue
      case 'accTitle:': if (!title) title = text; continue
      case 'accDescr:': continue
    }
    const [, name, spec] = /^(.+?)\s*:\s*(.+)$/.exec(line) ?? []
    if (!name || definitions.length >= maxTasks) return
    const segments = spec.split(',').map(part => part.trim())
    const tags: string[] = []
    while (taskTags.has(segments[0])) tags.push(segments.shift()!)
    if (segments.length < 1 || segments.length > 3 || segments.some(segment => !segment)) return
    const id = segments.length === 3 ? segments.shift()! : ''
    if (id && (!/^[\w.-]+$/.test(id) || byId.has(id))) return
    const definition: TaskDefinition = { name, section: sections.length - 1, id, from: segments.length === 2 ? segments[0] : '', to: segments.at(-1)!, tags, index: definitions.length }
    if (id) byId.set(id, definition)
    definitions.push(definition)
  }
  if (!definitions.length) return

  const parseDate = ganttDateParser(dateFormat)
  if (!axisFormat) axisFormat = /[Hh]|^X|^x/.test(dateFormat) ? '%H:%M' : '%b %d'
  const dayOf = (time: number) => Math.floor(time / dayMs) * dayMs
  const excludedDates = new Set<number>()
  const includedDates = new Set<number>()
  const excludedWeekdays = new Set<number>()
  for (const item of exclusions) {
    const name = item.toLowerCase()
    if (name === 'weekends') {
      excludedWeekdays.add(weekend)
      excludedWeekdays.add((weekend + 1) % 7)
    }
    else if (weekdays.includes(name)) excludedWeekdays.add(weekdays.indexOf(name))
    else {
      const date = parseDate(item)
      if (date === undefined) return
      excludedDates.add(dayOf(date))
    }
  }
  for (const item of inclusions) {
    const date = parseDate(item)
    if (date === undefined) return
    includedDates.add(dayOf(date))
  }
  const isExcluded = (value: number) => {
    const day = dayOf(value)
    return !includedDates.has(day) && (excludedDates.has(day) || excludedWeekdays.has(new Date(day).getUTCDay()))
  }
  function applyDuration(start: number, target: number): number | undefined {
    if (target === start || (!excludedDates.size && !excludedWeekdays.size)) return target
    let remaining = target - start
    let cursor = start
    for (let days = 0; days < 20_000; days++) {
      const next = dayOf(cursor) + dayMs
      if (!isExcluded(cursor)) {
        const available = next - cursor
        if (remaining <= available) return cursor + remaining
        remaining -= available
      }
      cursor = next
    }
  }

  const values = new Map<string, number>()
  const calculating = new Set<string>()
  function resolve(task: TaskDefinition, endpoint: 'start' | 'end'): number | undefined {
    const key = `${task.index}:${endpoint}`
    if (values.has(key)) return values.get(key)
    if (calculating.has(key)) return
    calculating.add(key)
    const value = endpoint === 'start' ? start(task) : end(task)
    calculating.delete(key)
    if (value !== undefined && Number.isFinite(new Date(value).valueOf())) {
      values.set(key, value)
      return value
    }
  }
  function dependency(spec: string, endpoint: 'start' | 'end'): number | undefined {
    const references = spec.trim().split(/\s+/)
    const times = references.map((id) => {
      const task = byId.get(id)
      return task ? resolve(task, endpoint) : undefined
    })
    if (times.some(time => time === undefined)) return
    return endpoint === 'end' ? Math.max(...times as number[]) : Math.min(...times as number[])
  }
  function start(task: TaskDefinition): number | undefined {
    if (task.from.startsWith('after ')) return dependency(task.from.slice(6), 'end')
    if (task.from) return parseDate(task.from)
    const previous = definitions[task.index - 1]
    return previous ? resolve(previous, 'end') : dayOf(now)
  }
  function end(task: TaskDefinition): number | undefined {
    if (task.to.startsWith('until ')) return dependency(task.to.slice(6), 'start')
    const start = resolve(task, 'start')
    if (start === undefined) return
    const target = durationEnd(start, task.to)
    if (target !== undefined) return applyDuration(start, target)
    const explicit = parseDate(task.to)
    return explicit === undefined ? undefined : explicit + (inclusiveEndDates ? dayMs : 0)
  }
  const tasks: Task[] = []
  for (const task of definitions) {
    const start = resolve(task, 'start')
    const end = resolve(task, 'end')
    if (start === undefined || end === undefined || end < start) return
    tasks.push({ ...task, start, end })
  }
  return { tasks, sections, title, axisFormat, ticks, topAxis, todayMarker, isExcluded }
}

export function gantt(source: string, options?: unknown, fallbackTitle = ''): string | undefined {
  const now = Date.now()
  const schedule = scheduleGantt(source, now)
  if (!schedule) return
  const { tasks, sections, axisFormat, ticks, isExcluded } = schedule
  const config = options && typeof options === 'object' ? options as Record<string, unknown> : {}
  const compact = config.displayMode === 'compact'
  const title = schedule.title || fallbackTitle
  const visibleTasks = tasks.filter(task => !task.tags.includes('vert'))
  const labelWidth = compact ? 140 : Math.max(132, Math.min(288, Math.max(0, ...visibleTasks.map(task => task.name.length * 7)) + 28))
  const plotWidth = 710
  const x0 = labelWidth
  const width = x0 + plotWidth + 30
  const top = title ? 55 : 23
  const rowHeight = 34
  const start = Math.min(...tasks.map(task => task.start))
  const latest = Math.max(...tasks.map(task => task.end))
  const end = latest > start ? latest + Math.max(1, (latest - start) / 12) : start + dayMs
  if (!Number.isFinite(new Date(end).valueOf())) return
  const xAt = (time: number) => x0 + 12 + (time - start) / (end - start) * (plotWidth - 24)
  const taskY = new Map<Task, number>()
  const groups: string[] = []
  let y = top + (schedule.topAxis ? 20 : 0)
  for (const [index, section] of sections.entries()) {
    const children = visibleTasks.filter(task => task.section === index)
    if (!children.length) continue
    const sectionTop = y
    if (section) y += 28
    // Only reuse a lane after the previous bar (or milestone) has cleared it.
    const lanes: number[] = []
    const ordered = compact ? [...children].sort((a, b) => a.start - b.start) : children
    for (const [row, task] of ordered.entries()) {
      let lane = compact ? lanes.findIndex(last => last < task.start) : row
      if (lane === -1) lane = lanes.length
      lanes[lane] = task.end
      taskY.set(task, y + (lane + 0.5) * rowHeight)
    }
    y += lanes.length * rowHeight
    groups.push(`<g class="diagram-gantt-section"><rect class="diagram-gantt-band" x="9" y="${sectionTop}" width="${width - 18}" height="${y - sectionTop}" rx="4"/>${section ? svgText(section, 20, sectionTop + 14, 'diagram-gantt-section-label', 'start') : ''}</g>`)
    y += 6
  }
  const bottom = Math.max(top + 33, y)
  const bands: string[] = []
  // At extremely broad date ranges individual exclusion days are too narrow to show.
  if ((end - start) / dayMs <= 180) {
    for (let day = Math.floor(start / dayMs) * dayMs; day < end; day += dayMs) {
      if (!isExcluded(day)) continue
      const left = xAt(Math.max(start, day))
      const right = xAt(Math.min(end, day + dayMs))
      bands.push(`<rect class="diagram-gantt-excluded" x="${left}" y="${top}" width="${right - left}" height="${bottom - top}"/>`)
    }
  }
  const grid = ganttTicks(start, end, ticks).map((time) => {
    const x = xAt(time)
    const label = ganttAxisDate(time, axisFormat)
    return `<path class="diagram-gantt-grid" d="M${x} ${top}V${bottom}"/>${svgText(label, x, bottom + 13, 'diagram-gantt-tick')}${schedule.topAxis ? svgText(label, x, top + 8, 'diagram-gantt-tick') : ''}`
  })
  const markers = tasks.filter(task => task.tags.includes('vert')).map(task => {
    const x = xAt(task.start + (task.end - task.start) / 2)
    return `<path class="diagram-gantt-reference" d="M${x} ${top}V${bottom}"><title>${escapeHtml(task.name)}</title></path>`
  })
  if (schedule.todayMarker && now >= start && now <= end) {
    const x = xAt(now)
    markers.push(`<path class="diagram-gantt-today" d="M${x} ${top}V${bottom}"><title>Today</title></path>`)
  }
  const bars = visibleTasks.map((task) => {
    const center = taskY.get(task)!
    const left = xAt(task.start)
    const right = xAt(task.end)
    const date = (stamp: number) => new Date(stamp).toISOString()
    const kind = task.tags.map(tag => `diagram-gantt-${tag}`).join(' ')
    const middle = (left + right) / 2
    const shape = task.tags.includes('milestone')
      ? `<path class="diagram-gantt-milestone-shape" d="M${middle} ${center - 8}L${middle + 8} ${center}L${middle} ${center + 8}L${middle - 8} ${center}Z"/>`
      : `<rect class="diagram-gantt-bar" x="${left}" y="${center - 8}" width="${Math.max(2, right - left)}" height="16" rx="4"/>`
    const max = compact ? Math.max(8, Math.floor((width - right - 18) / 7)) : Math.floor((labelWidth - 22) / 7)
    const name = task.name.length > max ? `${task.name.slice(0, max - 1)}…` : task.name
    return `<g class="diagram-gantt-task${kind ? ` ${kind}` : ''}" data-task-id="${escapeHtml(task.id)}" data-task-start="${date(task.start)}" data-task-end="${date(task.end)}"><title>${escapeHtml(task.name)} (${date(task.start)} to ${date(task.end)})</title>${shape}${svgText(name, compact ? right + 13 : 20, center, 'diagram-gantt-label', 'start')}</g>`
  })
  const heading = title ? svgText(title, width / 2, 23, 'diagram-title') : ''
  return diagramSvg(title || 'Gantt chart', width, bottom + 31, heading + groups.join('') + bands.join('') + grid.join('') + markers.join('') + bars.join(''))
}
