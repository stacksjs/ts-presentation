import { expect, spyOn, test } from 'bun:test'
import { renderChart } from '../packages/slidev/node/runtime/charts.ts'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { mermaid, renderMermaid } from '../packages/slidev/node/runtime/diagram.ts'
import { scheduleGantt } from '../packages/slidev/node/runtime/mermaid/gantt.ts'
import { ganttDateParser } from 'ts-charts/diagrams'
import { buildGitHistory } from '../packages/slidev/node/runtime/mermaid/gitgraph.ts'
import { parseDeck, renderDeck } from '../packages/slidev/node/runtime/index.ts'

// Fixtures exercise the documented Mermaid Gantt and GitGraph syntax through the native renderer.
const project = `gantt
  title Release plan
  dateFormat DD-MM-YYYY
  axisFormat %b %d
  tickInterval 1day
  excludes weekends
  todayMarker off
  section Build
    First pass             :done, first, 06-03-2026, 1d
    Fixes                 :active, fixes, after first, 2d
  section Review
    Review window         :window, after first, until ship
    Ship                  :milestone, ship, 13-03-2026, 0d
`

test('schedules Gantt task dependencies and excludes nonworking days', () => {
  const schedule = scheduleGantt(project)
  expect(schedule?.sections).toEqual(['', 'Build', 'Review'])
  const tasks = schedule?.tasks.map(task => [task.id, new Date(task.start).toISOString().slice(0, 10), new Date(task.end).toISOString().slice(0, 10)])
  expect(tasks).toEqual([['first', '2026-03-06', '2026-03-09'], ['fixes', '2026-03-09', '2026-03-11'],
    ['window', '2026-03-09', '2026-03-13'], ['ship', '2026-03-13', '2026-03-13']])
  const svg = mermaid(project, 'release-gantt')
  expect(svg).toContain('aria-label="Release plan"')
  expect(svg).toContain('diagram-gantt-milestone-shape')
  expect(svg?.match(/class="diagram-gantt-excluded"/g)).toHaveLength(1)
  expect(svg).toContain('data-excluded-start="2026-03-07" data-excluded-end="2026-03-09"')
  expect(svg).toContain('data-task-id="fixes" data-task-start="2026-03-09T00:00:00.000Z"')
  expect(svg).toContain('data-task-bar-end="2026-03-07T00:00:00.000Z"')
  expect(svg).not.toContain('diagram-gantt-today')
})

test('keeps authored daily ticks across long imported Gantt schedules', async () => {
  const source = `gantt
topAxis
tickInterval 1day
todayMarker off
Release :release, 2026-01-01, 90d`
  const deck = parseDeck(['# Dense schedule', '', '~~~mermaid', source, '~~~'].join('\n'))
  const html = await renderDeck(deck)
  expect(html.match(/class="diagram-gantt-tick-group"/g)).toHaveLength(196)
  expect(html.match(/<title>2026-02-17<\/title>/g)).toHaveLength(2)
  expect(html.match(/<title>2026-04-01<\/title>/g)).toHaveLength(2)
  expect(html.match(/class="diagram-gantt-tick"/g)!.length).toBeLessThan(196)
  const overlyDense = mermaid(source.replace('1day', '1second'), 'bounded-schedule')!
  expect(overlyDense.match(/class="diagram-gantt-tick-group"/g)!.length).toBeLessThan(60)
})

test('renders Gantt exclusion bands across a multi-year schedule', () => {
  const source = `gantt
excludes weekends
includes 2024-01-07
Release :release, 2024-01-05, 2029-12-05`
  const svg = mermaid(source, 'multi-year')
  expect(svg).toContain('data-excluded-start="2024-01-06" data-excluded-end="2024-01-07"')
  expect(svg).toContain('data-excluded-start="2029-12-01" data-excluded-end="2029-12-03"')
  const longer = mermaid(source.replace('2029-12-05', '2030-01-05'), 'six-years')
  expect(longer).toContain('data-task-id="release"')
  expect(longer).not.toContain('class="diagram-gantt-excluded"')
})

test('renders taskless Gantt directives and opts into the host calendar in frontmatter', async () => {
  const empty = mermaid('gantt\ntickInterval 1week\nweekday monday', 'empty-schedule')
  expect(empty).toContain('data-diagram-kind="gantt"')
  expect(empty).not.toMatch(/data-task-id=|Infinity|NaN/)

  const module = new URL('../packages/slidev/node/runtime/diagram.ts', import.meta.url).pathname
  const schedule = 'gantt\naxisFormat %H:%M\ntickInterval 1day\nDST change :change, 2020-11-01, 1d'
  const local = ['---', 'config:', '  gantt:', '    timeZone: local', '---', schedule].join('\n')
  const code = `
    import { renderMermaid } from ${JSON.stringify(module)}
    const local = await renderMermaid(${JSON.stringify(local)}, 'local-calendar')
    const utc = await renderMermaid(${JSON.stringify(schedule)}, 'utc-calendar')
    console.log(JSON.stringify({ local, utc }))
  `
  const child = Bun.spawn([process.execPath, '-e', code], {
    env: { ...process.env, TZ: 'America/Los_Angeles' }, stdout: 'pipe', stderr: 'pipe',
  })
  const [status, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  if (status) throw new Error(stderr)
  const charts = JSON.parse(stdout)
  expect(charts.local).toContain('data-task-start="2020-11-01T07:00:00.000Z" data-task-end="2020-11-02T08:00:00.000Z"')
  expect(charts.local).toContain('<title>00:00</title>')
  expect(charts.local).not.toContain('<title>08:00</title>')
  expect(charts.utc).toContain('data-task-start="2020-11-01T00:00:00.000Z" data-task-end="2020-11-02T00:00:00.000Z"')
})

test('honors the custom work week, split holidays, and inclusion overrides in Gantt imports', () => {
  const source = `gantt
dateFormat DD-MM-YYYY
weekend friday
excludes weekends
excludes 08-03-2026 %% Team holiday
includes 07-03-2026
Draft :draft, 05-03-2026, 1d
Review :review, after draft, 2d
Deadline :deadline, 05-03-2026, 08-03-2026
Follow-up window :window, after draft, until followup
Follow-up :milestone, followup, 10-03-2026, 0d`
  const march = (day: number) => Date.UTC(2026, 2, day)
  expect(scheduleGantt(source)?.tasks.map(({ id, start, end, barEnd }) => [id, start, end, barEnd])).toEqual([
    ['draft', march(5), march(7), march(6)],
    ['review', march(7), march(10), undefined],
    ['deadline', march(5), march(10), undefined],
    ['window', march(7), march(11), undefined],
    ['followup', march(10), march(10), undefined],
  ])
})

test('keeps ISO deadlines fixed and adjusts until endpoints for excluded days', () => {
  const source = `gantt
dateFormat YYYY-MM-DD
inclusiveEndDates
excludes weekends
todayMarker off
Fixed deadline :fixed, 2026-03-06, 2026-03-07
Review window :review, 2026-03-06, until ship
Ship :milestone, ship, 2026-03-07, 0d
Follow-up :next, after fixed review, 1d`
  const march = (day: number) => Date.UTC(2026, 2, day)
  expect(scheduleGantt(source)?.tasks.map(({ id, start, end, barEnd }) => [id, start, end, barEnd])).toEqual([
    ['fixed', march(6), march(8), undefined],
    ['review', march(6), march(9), march(7)],
    ['ship', march(7), march(7), undefined],
    ['next', march(9), march(10), undefined],
  ])
  const svg = mermaid(source, 'adjusted-endpoints')
  expect(svg).toContain('data-task-id="review" data-task-start="2026-03-06T00:00:00.000Z" data-task-end="2026-03-09T00:00:00.000Z" data-task-bar-end="2026-03-07T00:00:00.000Z"')
})

test('accepts mixed-case Gantt directives and preserves date formats and task IDs', () => {
  const source = `GANTT %% imported schedule
DATEFORMAT :DD-MM-YYYY
AxisFormat %b %d
TICKINTERVAL 1day
EXCLUDES weekends
WEEKEND FRIDAY
Weekday MONDAY
TODAYMARKER Off
topAXIS
SECTION Review
Draft :draftA, 05-03-2026, 1d
Publish :ship, after draftA, 1d
CLICK draftA HREF "#Review"`
  const svg = mermaid(source, 'case-gantt', { securityLevel: 'loose' })
  expect(svg).toContain('data-task-id="draftA"')
  expect(svg).toContain('href="#Review"')
  expect(svg).toContain('data-task-start="2026-03-08T00:00:00.000Z"')
  expect(svg).not.toContain('diagram-gantt-today')
})

test('uses strict input dates, validates dependencies and supports timezone offsets', () => {
  const iso = ganttDateParser('YYYY-MM-DD HH:mm Z')
  expect(iso('2026-02-30 03:15 -0800')).toBeUndefined()
  expect(new Date(iso('2026-03-04 03:15 -0800')!).toISOString()).toBe('2026-03-04T11:15:00.000Z')
  expect(mermaid('gantt\nA :a, after b, 1d\nB :b, after a, 1d', 'cycle')).toBeUndefined()
})

test('accepts validated ISO Gantt starts with custom date formats and keeps ends format-specific', async () => {
  const warning = spyOn(console, 'warn').mockImplementation(() => {})
  const reference = Date.UTC(2026, 2, 1)
  const source = `gantt
dateFormat DD-MM-YYYY
todayMarker off
Legacy start :legacy, 2026-3-2, 2d
Timestamp start :stamp, 2026-03-03T12:34:56.7-0500, 1h
Strict end :strict, 2026-03-06, 2026-03-07
Formatted end :formatted, 2026-03-06, 07-03-2026`
  try {
    expect(scheduleGantt(source, reference)?.tasks.map(({ start, end }) => [new Date(start).toISOString(), new Date(end).toISOString()])).toEqual([
      ['2026-03-02T00:00:00.000Z', '2026-03-04T00:00:00.000Z'],
      ['2026-03-03T17:34:56.700Z', '2026-03-03T18:34:56.700Z'],
      ['2026-03-06T00:00:00.000Z', '2026-03-06T00:00:00.000Z'],
      ['2026-03-06T00:00:00.000Z', '2026-03-07T00:00:00.000Z'],
    ])
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('has an invalid end "2026-03-07"'))
    const html = await renderDeck(parseDeck(['~~~mermaid', source, '~~~'].join('\n')))
    expect(html).toContain('data-task-id="stamp" data-task-start="2026-03-03T17:34:56.700Z"')
    for (const invalid of ['2026-02-30', '2026-03-03T24:10', '2026-03-03T12:00+28:00', '202304']) {
      expect(scheduleGantt(`gantt\ndateFormat DD-MM-YYYY\nTask :${invalid}, 2d`, reference)).toBeUndefined()
    }
  }
  finally { warning.mockRestore() }
})

test('applies partial Gantt calendar tokens across the scheduled span', () => {
  const source = `gantt
dateFormat D
excludes 15
includes 2026-02-15
todayMarker off
Long window :work, 2026-01-30, 45d`
  const reference = Date.UTC(2026, 3, 8)
  const schedule = scheduleGantt(source, reference)
  expect(schedule?.tasks[0].end).toBe(Date.UTC(2026, 2, 17))
  expect(schedule?.isExcluded(Date.UTC(2026, 1, 15))).toBe(false)
  expect(schedule?.isExcluded(Date.UTC(2026, 2, 15))).toBe(true)
  expect(schedule?.isExcluded(Date.UTC(2026, 3, 15))).toBe(true)
  expect(mermaid(source, 'partial-holidays')?.match(/class="diagram-gantt-excluded"/g)).toHaveLength(1)
})

// Based on Mermaid 12.3.0 Gantt parser and rendering fixtures (MIT).
test('imports multiline Gantt sections, repeated reference markers, and legacy exclusion lists', () => {
  const source = String.raw`gantt
excludes weekdays, 2026-03-09
section Review<br\t/>and publish
Review :review, 2026-03-08, 1d
Marker :vert, milestone, marker, 2026-03-10,
Marker :vert, milestone, marker, 2026-03-10,
Ship :ship, after review marker, 1d`
  const schedule = scheduleGantt(source)
  expect(schedule?.tasks.at(-1)?.start).toBe(Date.UTC(2026, 2, 10))
  expect(schedule?.tasks[1].end).toBe(schedule?.tasks[1].start)
  const svg = mermaid(source, 'schedule', { gantt: { useMaxWidth: false, useWidth: 640 } })
  expect(svg).toMatch(/<svg\b[^>]*viewBox="0 0 640 ([\d.]+)" width="640" height="\1"/)
  expect(svg).toMatch(/class="diagram-gantt-section-label"[^>]*><tspan[^>]*>Review<\/tspan><tspan[^>]*>and publish<\/tspan>/)
  expect(svg?.match(/class="diagram-gantt-reference-label"/g)).toHaveLength(1)
})

test('pads legacy ISO start dates and warns about invalid Gantt milestones', () => {
  const source = `gantt
Past work :past, 202-12-1, 7d
Milestone :milestone, 2026-01-01, missingDuration`
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const schedule = scheduleGantt(source)
    expect(new Date(schedule!.tasks[0].start).toISOString()).toBe('0202-12-01T00:00:00.000Z')
    expect(schedule?.tasks[1].end).toBe(schedule?.tasks[1].start)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missingDuration'))
  }
  finally { warn.mockRestore() }
})

// From Mermaid's Gantt fixtures for literal punctuation in task names (MIT).
test('preserves leading hash and semicolon task labels and their dependency dates', () => {
  const source = [
    'gantt',
    '  # existing whole-line comment',
    '  section Review #1',
    '  #A task with a hashtag :a1, 2014-01-01, 30d',
    '  ;A task with a semicolon :a2, after a1, 20d',
    '  # Review the release :a3, after a2, 2d %% explanatory comment',
  ].join('\n')
  const tasks = scheduleGantt(source)?.tasks
  expect(tasks?.map(({ id, name, start }) => [id, name, new Date(start).toISOString().slice(0, 10)])).toEqual([
    ['a1', '#A task with a hashtag', '2014-01-01'],
    ['a2', ';A task with a semicolon', '2014-01-31'],
    ['a3', '# Review the release', '2014-02-20'],
  ])
  const svg = mermaid(source, 'punctuation')
  expect(svg).toContain('>Review #1</tspan>')
  expect(svg).toContain('>#A task with a hashtag</tspan>')
  expect(svg).toContain('>;A task with a semicolon</tspan>')
  expect(svg).toContain('># Review the release</tspan>')
})

test('diagnoses unknown imported Gantt dependencies and renders the remaining schedule', async () => {
  const source = `gantt
Review :review, after missing draft prior, 1d
Window :window, 2026-03-01, until missing draft prior
Fallback :fallback, after unknown, 1d
Draft :draft, 2026-03-02, 1d
Prior draft :prior, 2026-03-03, 3d`
  const march = (day: number) => Date.UTC(2026, 2, day)
  const warning = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    expect(scheduleGantt(source, march(10) + 15_000)?.tasks.slice(0, 3).map(({ start, end }) => [start, end])).toEqual([
      [march(6), march(7)], [march(1), march(2)], [march(10), march(11)],
    ])
    expect(warning.mock.calls.map(([message]) => message)).toEqual([
      'Gantt task "Review" references unknown IDs in "after": missing',
      'Gantt task "Window" references unknown IDs in "until": missing',
      'Gantt task "Fallback" references unknown IDs in "after": unknown',
    ])
    const html = await renderDeck(parseDeck(['# Roadmap', '', '~~~mermaid', source, '~~~'].join('\n')))
    expect(html).toContain('data-task-id="review" data-task-start="2026-03-06T00:00:00.000Z"')
    expect(html).toContain('data-task-id="window" data-task-start="2026-03-01T00:00:00.000Z" data-task-end="2026-03-02T00:00:00.000Z"')
    expect(html).toContain('data-task-id="fallback"')
  }
  finally { warning.mockRestore() }
})

test('renders seconds-only Gantt input and honors fractional calendar durations', () => {
  const timing = `gantt
dateFormat ss
tickInterval 10second
todayMarker off
Request :request, 0, 20
Retry :retry, after request, 0.5s`
  const now = Date.UTC(2026, 2, 6, 14)
  const midnight = Date.UTC(2026, 2, 6)
  const schedule = scheduleGantt(timing, now)!
  expect(schedule.tasks.map(task => [task.start - midnight, task.end - midnight])).toEqual([[0, 20_000], [20_000, 20_500]])
  expect(mermaid(timing, 'elapsed')).toMatch(/>00<\/tspan>.*>10<\/tspan>.*>20<\/tspan>/s)

  const calendar = `gantt
dateFormat YYYY-MM-DD
Window :window, 2024-02-29, 1.5d
Calendar follow-up :followup, after window, 0.5w`
  expect(scheduleGantt(calendar)?.tasks.map(task => new Date(task.end).toISOString())).toEqual([
    '2024-03-02T00:00:00.000Z', '2024-03-06T00:00:00.000Z',
  ])
})

test('imports subsecond times and distinguishes literal date suffixes from durations', async () => {
  const now = Date.UTC(2026, 2, 6, 8)
  const timings = `gantt
dateFormat HH:mm:ss.SS
axisFormat %S.%L
tickInterval 10millisecond
Sample :sample, 08:00:00.01, 50ms
Check :check, after sample, 08:00:00.09`
  expect(scheduleGantt(timings, now)?.tasks.map(({ start, end }) => [start, end])).toEqual([
    [now + 10, now + 60], [now + 60, now + 90],
  ])
  const dated = `gantt
Window :window, 06d, 08d
Review :review, after window, 1h
dateFormat DD[d]`
  expect(scheduleGantt(dated, now)?.tasks.map(({ start, end }) => [start, end])).toEqual([
    [Date.UTC(2026, 2, 6), Date.UTC(2026, 2, 8)],
    [Date.UTC(2026, 2, 8), Date.UTC(2026, 2, 8, 1)],
  ])
  const deck = parseDeck(['# Sample window', '', '~~~mermaid', timings, '~~~'].join('\n'))
  const html = await renderDeck(deck)
  expect(html).toMatch(/data-task-id="sample" data-task-start="\d{4}-\d{2}-\d{2}T08:00:00\.010Z"/)
  expect(html).toContain('>00.090</tspan>')
})

test('preserves large explicit millisecond ticks and clips calendar dependencies to Date precision', async () => {
  const source = `gantt
dateFormat YYYY-MM-DD HH:mm:ss.SSS
axisFormat %S.%L
tickInterval 1500millisecond
topAxis
todayMarker off
Start :start, 2026-01-01 00:00:00.000, 0.6ms
Next :next, after start, 0.6ms
Window :window, after next, 5000.6ms`
  const start = Date.UTC(2026, 0, 1)
  expect(scheduleGantt(source)?.tasks.map(task => [task.start - start, task.end - start])).toEqual([
    [0, 0], [0, 0], [0, 5000],
  ])
  const deck = parseDeck(['# Timing', '', '~~~mermaid', source, '~~~'].join('\n'))
  const html = await renderDeck(deck)
  const labels = [...html.matchAll(/class="diagram-gantt-tick-group"><title>([^<]+)<\/title>/g)].map(match => match[1])
  expect(labels).toEqual([
    '00.000', '01.500', '03.000', '04.500',
    '00.000', '01.500', '03.000', '04.500',
  ])
})

test('renders calendar-aligned Gantt ticks and keeps tasks with invalid end dates at their start', async () => {
  const source = `gantt
dateFormat YYYY-MM-DD
axisFormat %b
tickInterval 3month
todayMarker off
Planning :plan, 2026-02-15, 3dX
Delivery :delivery, after plan, 2026-11-01`
  const schedule = scheduleGantt(source)
  expect(schedule?.tasks.map(({ start, end }) => [start, end])).toEqual([
    [Date.UTC(2026, 1, 15), Date.UTC(2026, 1, 15)],
    [Date.UTC(2026, 1, 15), Date.UTC(2026, 10, 1)],
  ])
  expect(scheduleGantt('gantt\ndateFormat D\nReview :2, 4', Date.UTC(2026, 2, 1))?.axisFormat).toBe('%d')
  const deck = parseDeck(['# Calendar', '', '~~~mermaid', source, '~~~'].join('\n'))
  const html = await renderDeck(deck)
  expect([...html.matchAll(/class="diagram-gantt-tick"[^>]*><tspan[^>]*>(\w+)<\/tspan>/g)].map(match => match[1])).toEqual(['Apr', 'Jul', 'Oct'])
  expect(html).toContain('data-task-id="plan" data-task-start="2026-02-15T00:00:00.000Z" data-task-end="2026-02-15T00:00:00.000Z"')
})

test('honors configured Gantt axis labels with day-only date input', () => {
  const source = `gantt
dateFormat D
todayMarker off
tickInterval 1day
Example :example, 4, 6`
  const defaults = mermaid(source, 'day-labels')
  expect(defaults).toContain('>04</tspan>')
  const configured = { gantt: { axisFormat: 'day %d' } }
  expect(mermaid(source, 'formatted-day-labels', configured)).toContain('>day 04</tspan>')
  expect(mermaid(source.replace('dateFormat D', 'dateFormat D\naxisFormat date %d'), 'explicit-day-labels', configured)).toContain('>date 04</tspan>')
})

test('uses automatic Gantt task IDs for dependencies and task links', () => {
  const source = `gantt
dateFormat DD/MM/YYYY
excludes 2026-03-07
Draft :06/03/2026, 1d
Review :review, after task1, 1d
Ship :after review, 1d
click task2 href "#notes"`
  const schedule = scheduleGantt(source)!
  expect(schedule.tasks.map(task => [task.id, task.start, task.end])).toEqual([
    ['task1', Date.UTC(2026, 2, 6), Date.UTC(2026, 2, 8)],
    ['review', Date.UTC(2026, 2, 8), Date.UTC(2026, 2, 9)],
    ['task2', Date.UTC(2026, 2, 9), Date.UTC(2026, 2, 10)],
  ])
  expect(mermaid(source, 'gantt', { securityLevel: 'loose' })).toMatch(/href="#notes"[^>]*><g[^>]*data-task-id="task2"/)
})

test('allocates automatic Gantt IDs around explicit IDs across sections', () => {
  const source = `gantt
Draft :2026-03-06, 1d
section Review
Primary review :task1, after task2, 1d
Send status :after task1, 1d
Retain record :task3, after task4, 1d
click task2 href "#draft"
click task1 href "#review"`
  const tasks = scheduleGantt(source)?.tasks
  expect(tasks?.map(task => [task.id, new Date(task.start).getUTCDate()])).toEqual([
    ['task2', 6], ['task1', 7], ['task4', 8], ['task3', 9],
  ])
  const svg = mermaid(source, 'unique-id', { securityLevel: 'loose' })!
  expect(svg).toMatch(/href="#draft"[^>]*><g[^>]*data-task-id="task2"/)
  expect(svg).toMatch(/href="#review"[^>]*><g[^>]*data-task-id="task1"/)
})

const history = `gitGraph LR:
  commit id: "base"
  branch "feature/review" order: 3
  commit id:"work; review" type:HIGHLIGHT
  switch main
  commit id: "other" type: REVERSE
  cherry-pick id: "work; review"
  merge "feature/review" id: "release" tag: "v1.0" tag: "stable"
`

test('dispatches gitGraph when its header and first commit share a line', () => {
  const svg = mermaid('gitGraph; commit id: "first; draft"; commit id: "publish"', 'history')!
  expect(svg).toContain('data-commit-id="first; draft"')
  expect(svg).toContain('data-parent-ids="first; draft"')
})

test('imports GitGraph branch-only diagrams and warns while retaining repeated commit IDs', () => {
  const svg = mermaid('gitGraph\nbranch review\nswitch review', 'empty-history')
  expect(svg).toContain('>review</tspan>')
  expect(buildGitHistory('gitGraph\nbranch review\ncheckout review')?.currentBranch).toBe('review')

  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const source = 'gitGraph\ncommit id:""\ncommit id:"review"\ncommit id:"review" msg:"new draft"'
    const history = buildGitHistory(source)
    expect(history?.commits.map(commit => commit.id)).toEqual(['c1', 'review', 'review'])
    expect(history?.commits[2].parents[0]).toBe(history?.commits[1])
    expect(warn).toHaveBeenCalledWith('Commit ID review already exists')
    expect(mermaid(source, 'repeated')?.match(/data-commit-id="review"/g)).toHaveLength(2)
  }
  finally { warn.mockRestore() }
})

test('renders a GitGraph header and preserves explicit IDs across the deck compiler', async () => {
  const plans = 'gitGraph TB:\naccTitle: Planned releases'
  const initial = mermaid(plans, 'planned', { gitGraph: { mainBranchName: 'stable', useMaxWidth: false } })
  expect(initial).toMatch(/viewBox="0 0 ([\d.]+) ([\d.]+)" width="\1" height="\2"/)
  expect(initial).toContain('Planned releases')
  expect(initial).toContain('>stable</tspan>')
  expect(initial).not.toContain('data-commit-id=')

  const commits = 'gitGraph\ncommit\nbranch review\ncommit id:"c2"\ncheckout main\nmerge review id:"c1"\ncommit'
  expect(buildGitHistory(commits)?.commits.map(commit => [commit.id, commit.parents.map(parent => parent.id)])).toEqual([
    ['c3', []], ['c2', ['c3']], ['c1', ['c3', 'c2']], ['c4', ['c1']],
  ])
  const deck = parseDeck([
    '# Planned releases', '', '~~~mermaid', plans, '~~~', '', '---', '', '# Review',
    '', '~~~mermaid', commits, '~~~',
  ].join('\n'))
  const html = await renderDeck(deck)
  expect(html.match(/data-diagram-kind="gitgraph"/g)).toHaveLength(2)
  expect(html).toContain('data-commit-id="c1" data-parent-ids="c3, c2"')
})

test('places bottom-to-top GitGraph branch names below their first commits', async () => {
  const source = `gitGraph BT:
commit id:"root"
branch "review<br>and support"
commit id:"draft"`
  const html = await renderDeck(parseDeck(['# Review history', '', '~~~mermaid', source, '~~~'].join('\n')))
  const rootY = Number(/data-commit-id="root".*?<circle[^>]+cy="([\d.]+)"/.exec(html)?.[1])
  const names = [...html.matchAll(/<text[^>]+y="([\d.]+)" class="diagram-git-branch-label"[^>]*>/g)]
  expect(names).toHaveLength(2)
  for (const [, y] of names) expect(Number(y)).toBeGreaterThan(rootY)
  expect(html).toMatch(/>review<\/tspan><tspan[^>]*>and support<\/tspan>/)
})

test('builds GitGraph branch history with merge parents, tags, and cherry-picks', () => {
  const graph = buildGitHistory(history, { parallelCommits: true })
  expect(graph?.commits.map(commit => [commit.id, commit.rank])).toEqual([
    ['base', 0], ['work; review', 1], ['other', 1], ['c4', 2], ['release', 3],
  ])
  expect(graph?.commits.at(-1)?.parents.map(parent => parent.id)).toEqual(['c4', 'work; review'])
  expect(graph?.commits[3].parents.map(parent => parent.id)).toEqual(['other', 'work; review'])
  expect(graph?.commits[3].picked).toBe('work; review')
  expect(graph?.commits[3].message).toBe('cherry-picked work; review into main')
  expect(graph?.commits[4].tags).toEqual(['v1.0', 'stable'])
  const svg = mermaid(history, 'release-history', { gitGraph: { showCommitLabel: false } })
  expect(svg).toContain('data-commit-id="release" data-parent-ids="c4, work; review"')
  expect(svg).toContain('>v1.0</tspan>')
  expect(svg).toContain('>stable</tspan>')
  expect(svg).not.toContain('class="diagram-git-label"')
})

test('supports directed GitGraph layout and checks cherry-pick merge parents', async () => {
  const branched = history + '  branch maintenance\n  commit id: "maintenance"\n'
  expect(buildGitHistory(branched + '  cherry-pick id: "release"\n')).toBeUndefined()
  expect(buildGitHistory(branched + '  cherry-pick id: "release" parent: "base"\n')).toBeUndefined()
  expect(buildGitHistory(branched + '  cherry-pick id: "release" parent: "c4"\n')?.commits.at(-1)?.picked).toBe('release')
  const picked = mermaid(branched + '  cherry-pick id: "release" parent: "c4"\n', 'provenance')!
  expect(picked).toMatch(/stroke-dasharray="5 3" data-from-commit="release" data-to-commit="c7"/)
  expect(picked).toContain('data-parent-ids="maintenance, release" data-picked-id="release" data-picked-parent="c4"')
  expect(picked).toContain('cherry-pick:release|parent:c4')
  const noTag = branched + '  cherry-pick id: "release" parent: "c4" tag: ""\n'
  expect(buildGitHistory(noTag)?.commits.at(-1)?.tags).toEqual([])
  const oneTag = mermaid(noTag.trimEnd() + ' tag: "backport"', 'custom-tag')
  expect(oneTag).toContain('>backport</tspan>')
  expect(oneTag).not.toContain('· backport')
  const input = `# Timelines\n\n\`\`\`mermaid\n${history.replace('LR:', 'BT:')}\`\`\``
  const html = await renderDeck(parseDeck(input))
  expect(html).toContain('viewBox="0 0 ')
  expect(html).toContain('diagram-git-node diagram-git-merge')
  expect(html).not.toContain('language-mermaid')
})

const routedHistory = `commit id:"root"
branch review
commit id:"patch"
commit id:"next-draft"
checkout main
commit id:"test"
commit id:"publish"
cherry-pick id:"patch"
branch maintenance
commit id:"maintenance"
cherry-pick id:"c6" parent:"patch"`

test('uses cherry-pick source parents when validating later picks', () => {
  const graph = buildGitHistory(`gitGraph\n${routedHistory}`)
  expect(graph?.commits[5].parents.map(parent => parent.id)).toEqual(['publish', 'patch'])
  expect(graph?.commits.at(-1)?.parents.map(parent => parent.id)).toEqual(['maintenance', 'c6'])
  expect(graph?.commits.at(-1)?.pickedParent).toBe('patch')
  expect(buildGitHistory(`gitGraph\n${routedHistory.replace('parent:"patch"', 'parent:"next-draft"')}`)).toBeUndefined()
})

test('rejects GitGraph merges from the original branch of an inherited head', () => {
  const graph = `gitGraph
commit id:"root"
branch review
checkout main
commit id:"advance"
checkout review
merge main id:"merged"`
  expect(buildGitHistory(graph)).toBeUndefined()
  const withReviewCommit = graph.replace('branch review', 'branch review\ncommit id:"draft"')
  expect(buildGitHistory(withReviewCommit)?.commits.at(-1)?.parents.map(parent => parent.id)).toEqual(['draft', 'advance'])
})

test('imports GitGraph commit messages and keeps explicit merge symbols in the built deck', async () => {
  const graph = String.raw`gitGraph TB:
commit id:"base" msg:"Begin \"review\": phase 1"
branch "feature/review"
commit 'Fix; verify 100%% complete' id:"fix" type:REVERSE %% outside comment
checkout main
merge "feature/review" id:"approved" type:NORMAL tag:"ready"`
  const parsed = buildGitHistory(graph)
  expect(parsed?.commits.map(({ id, message, symbol }) => [id, message, symbol])).toEqual([
    ['base', 'Begin "review": phase 1', 'NORMAL'],
    ['fix', 'Fix; verify 100%% complete', 'REVERSE'],
    ['approved', 'merged branch feature/review into main', 'NORMAL'],
  ])
  expect(parsed?.commits.at(-1)?.parents.map(parent => parent.id)).toEqual(['base', 'fix'])
  const input = ['# Review workflow', '', '~~~mermaid', graph, '~~~'].join('\n')
  const html = await renderDeck(parseDeck(input))
  expect(html).toContain('data-commit-message="Begin &quot;review&quot;: phase 1"')
  expect(html).toContain('data-commit-message="Fix; verify 100%% complete"')
  expect(html).toContain('data-commit-message="merged branch feature/review into main"')
  expect(html).toContain('diagram-git-reverse-mark')
  expect(html).toMatch(/data-commit-id="approved" data-parent-ids="base, fix"[^>]*><title>[^<]*<\/title><circle[^>]*\/><g transform=/)
  expect(buildGitHistory('gitGraph\ncommit msg:bare-message')).toBeUndefined()
  expect(buildGitHistory('gitGraph\ncommit "first" msg:"second"')).toBeUndefined()
})

test('imports GitGraph labels for commits and explicit merge IDs while keeping operation metadata', () => {
  const graph = `gitGraph
commit id:"root"
branch review
commit id:"patch"
checkout main
cherry-pick id:"patch"
merge review
checkout review
commit id:"docs"
checkout main
merge review id:"release"`
  const svg = mermaid(graph, 'operations')!
  const labels = [...svg.matchAll(/class="diagram-git-label"[^>]*><tspan[^>]*>([^<]+)/g)].map(match => match[1])
  expect(labels).toEqual(['root', 'patch', 'docs', 'release'])
  expect(svg).toContain('>cherry-pick:patch</tspan>')
  expect(svg).toContain('data-commit-id="c4" data-parent-ids="c3, patch"')
  expect(svg).toContain('data-commit-id="release" data-parent-ids="c4, docs"')
})

test('native Gantt YAML and compatibility syntax render the same schedule', () => {
  const yaml = `type: gantt
accessibleTitle: Delivery steps
description: The preview comes before release.
todayMarker: false
taskLabelPlacement: bar
wrapTaskLabels: true
sections:
  - name: Release
    tasks:
      - { id: preview, name: Preview, start: '2026-03-06', duration: 1d }
      - { id: publish, name: Publish, after: [preview], duration: 0d, tags: [milestone] }
`
  const legacy = `gantt
accTitle:Delivery steps
accDescr {
  The preview comes before release.
}
todayMarker off
section Release
  Preview :preview, 2026-03-06, 1d
  Publish :milestone, publish, after preview, 0d
`
  const native = renderChart(yaml, 'release')
  expect(native).toContain('aria-describedby="release-description"')
  expect(native).toBe(mermaid(legacy, 'release'))
})

test('native Git history YAML and compatibility syntax render the same branch graph', () => {
  const yaml = `type: gitgraph
direction: BT
rotateCommitLabel: true
edgeLayout: orthogonal
tagLabel: { shape: tag }
operations:
  - { op: commit, id: start }
  - { op: branch, name: test, order: 3 }
  - { op: commit, id: proof }
  - { op: checkout, name: main }
  - { op: merge, branch: test, id: release, tags: [v1.0] }
`
  const legacy = `gitGraph BT:
commit id:"start"
branch test order:3
commit id:"proof"
checkout main
merge test id:"release" tag:"v1.0"
`
  const native = renderChart(yaml, 'history')
  expect(native).toContain('data-commit-id="release" data-parent-ids="start, proof"')
  expect(native).toBe(mermaid(legacy, 'history'))
})

test('imports Gantt layout options and routes enabled task links to a slide reveal', async () => {
  const today = new Date().toISOString().slice(0, 10)
  const source = `gantt
axisFormat %A
tickInterval 1week
weekday monday
todayMarker stroke-width:5px,stroke:#058,opacity:.5
Delivery :task, ${today}, 14d
Next :unsafe, after task, 1d
click task href "#review/1"
click unsafe href "javascript:alert(1)"`
  const options = { gantt: { topAxis: true, barHeight: 30, barGap: 8, leftPadding: 112, rightPadding: 40 } }
  const plain = mermaid(source, 'plain', options)
  expect(plain).toContain('viewBox="0 0 862 ')
  expect(plain).toContain('style="stroke:#058;stroke-width:5px;opacity:0.5"')
  expect(plain).toMatch(/class="diagram-gantt-bar"[^>]*height="30"/)
  expect(plain?.match(/>Monday<\/tspan>/g)?.length).toBeGreaterThanOrEqual(4)
  expect(plain).not.toContain('<a ')
  const loose = mermaid(source, 'linked', { ...options, securityLevel: 'loose' })
  expect(loose).toContain('href="#review/1"')
  expect(loose).not.toContain('javascript:')
  const frontmatter = ['---', 'config:', '  gantt:', '    barHeight: 20', '---', source].join('\n')
  const override = mermaid(frontmatter, 'override', options)
  expect(override).toContain('viewBox="0 0 862 ')
  expect(override).toMatch(/class="diagram-gantt-bar"[^>]*height="20"/)
  const deck = [
    '---', 'mermaid:', '  securityLevel: loose', '---', '', '# Schedule',
    '', '```mermaid', source, '```',
    '', '---', 'routeAlias: review', '---', '', '# Review', '', '<p v-click>Details</p>',
  ].join('\n')
  expect(await renderDeck(parseDeck(deck))).toContain('<a href="#slide-2" data-slide-link="2" data-slide-click="1" class="diagram-gantt-link"')
})

test('imports GitGraph rotation, fixed dimensions, and multiline accessible descriptions', () => {
  const graph = `gitGraph:
  accTitle: Release history
  accDescr {
    Main and review lanes
    converge ahead of release.
  }
  commit id: "prepare the release notes"
  branch review
  commit id: "apply reviewer corrections" tag:"v1"`
  const defaultSvg = mermaid(graph, 'rotation')
  expect(defaultSvg).not.toMatch(/viewBox="[^"]+" width=/)
  expect(defaultSvg).toContain('aria-describedby="rotation-description"')
  expect(defaultSvg).toContain('<desc id="rotation-description">Main and review lanes converge ahead of release.</desc>')
  expect(defaultSvg).toMatch(/rotate\(45 /)
  expect(defaultSvg).toContain('>apply reviewer corrections</tspan>')
  const frontmatter = ['---', 'config:', '  gitGraph:', '    rotateCommitLabel: false', '    useMaxWidth: false', '---', graph].join('\n')
  const horizontal = mermaid(frontmatter, 'horizontal')
  expect(horizontal).toMatch(/^<svg\b[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)" width="\1" height="\2"/)
  expect(horizontal).not.toContain('rotate(')
  expect(horizontal).toContain('>v1</tspan>')
})

// Based on Mermaid 12.3.0's GitGraph multiline branch-label fixture (MIT).
test('keeps multiline quoted GitGraph names through branch and merge commands', async () => {
  const graph = `gitGraph LR:
  title Team's release
  accDescr {
    The review's history
    includes a merge.
  }
  commit id: "base" %% ignore an unmatched quote: "
  branch "Feature A
  Review %% ongoing; verify"
  commit id: "work"
  checkout main
  merge "Feature A
  Review %% ongoing; verify" id: "merge"; commit id: "done"`
  expect(buildGitHistory(graph)?.commits.map(commit => [commit.id, commit.parents.map(parent => parent.id)])).toEqual([
    ['base', []], ['work', ['base']], ['merge', ['base', 'work']], ['done', ['merge']],
  ])
  const deck = ['# Release history', '', '~~~mermaid', '---', 'config:', '  theme: forest', '---', graph, '~~~'].join('\n')
  const html = await renderDeck(parseDeck(deck))
  expect(html).toMatch(/class="diagram-git-branch-label-box"[^>]*height="36"[^>]*fill="#7aff32"/)
  expect(html).toMatch(/class="diagram-git-branch-label"[^>]*><tspan[^>]*>Feature A<\/tspan><tspan[^>]*>Review %% ongoing; verify<\/tspan>/)
  expect(html).toContain('data-commit-id="merge" data-parent-ids="base, work"')
  expect(html).toContain('Team&#39;s release</tspan>')
  expect(html).toContain('The review&#39;s history includes a merge.</desc>')
})

test('imports Gantt compact frontmatter, dimensions, fonts, and themed section bands', () => {
  const source = `---
    displayMode: compact
    config:
# Gantt and theme settings
      note: "
        Folded text before the chart settings.
        "
      gantt:
        useWidth: 460
        fontSize: 18
        sectionFontSize: 20
        gridLineStartPadding: 14
        titleTopMargin: 28
        numberSectionStyles: 2
      themeVariables:
        sectionBkgColor: '#4a6072'
        altSectionBkgColor: '#a06528'
---
gantt
title Overview
todayMarker off
section Prepare
  Draft :draft, 2026-03-01, 1d
  Review :review, 2026-03-03, 1d
section Ship
  Publish :publish, after review, 1d`
  const svg = mermaid(source, 'styled-gantt')!
  expect(svg).toContain('viewBox="0 0 460 ')
  expect(svg).toMatch(/y="28" class="diagram-title"/)
  expect(svg).toMatch(/class="diagram-gantt-label"[^>]*style="font-size:18px;"/)
  expect(svg).toMatch(/class="diagram-gantt-section-label"[^>]*style="font-size:20px;"/)
  expect(svg).toContain('style="fill:#4a6072;opacity:0.2"')
  expect(svg).toContain('style="fill:#a06528;opacity:0.2"')
  expect(svg).toMatch(/<line class="diagram-gantt-grid"[^>]*y1="14"/)
  const height = (html: string) => Number(/viewBox="0 0 460 ([\d.]+)/.exec(html)?.[1])
  expect(height(svg)).toBeLessThan(height(mermaid(source.replace('    displayMode: compact\n', ''), 'ordinary-gantt')!))
})

test('preserves literal YAML blocks when folding nested diagram options', () => {
  const source = `---
title: |-
  Team: "urgent
    review"
config:
  themeCSS: "
    .taskText { font-weight: bold; }
    "
  gantt:
    useWidth: 540
---
gantt
Review :2026-03-01, 1d`
  const svg = mermaid(source, 'literal-title')
  expect(svg).toContain('aria-label="Team: &quot;urgent\n  review&quot;"')
  expect(svg).toContain('viewBox="0 0 540 ')
})

test('scopes diagram CSS, preserves CSS strings, and keeps local animation names distinct', async () => {
  const source = 'gitGraph\ncommit id:"review"'
  const themeCSS = [
    '@import "other.css";',
    '@font-face { font-family: example; src: local("demo"); }',
    '@keyframes pulse { to { opacity: .5; } }',
    '.commit, .diagram-git-dot { animation: pulse 1s; content: "</style>"; }',
  ].join('\n')
  const first = await renderMermaid(source, 'first', undefined, { themeCSS })
  const second = await renderMermaid(source, 'second', undefined, { themeCSS })
  expect(first).toContain('id="tp-diagram-first"')
  expect(first?.match(/\.diagram-git-dot:is\(#tp-diagram-first, #tp-diagram-first \*\)/g)).toHaveLength(2)
  expect(first).toContain('@keyframes tp-diagram-first-pulse')
  expect(first).toContain('animation: tp-diagram-first-pulse')
  expect(second).toContain('@keyframes tp-diagram-second-pulse')
  expect(first?.match(/<\/style>/g)).toHaveLength(1)
  expect(first).not.toContain('@import')
  expect(first).not.toContain('@font-face')
})

test('uses theme-specific indices for GitGraph rails and commit symbols', () => {
  const graph = ['gitGraph', 'commit id:"root"', ...Array.from({ length: 8 }, (_, index) => [
    'checkout main', `branch lane${index + 1}`, `commit id:"work${index + 1}"`,
  ]).flat()].join('\n')
  const css = { themeCSS: '.branch-label8, .commit1 { fill: red }' }
  const stock = mermaid(graph, 'stock', css)!
  const redux = mermaid(graph, 'redux', { ...css, theme: 'redux-color' })!
  expect(stock).toMatch(/data-git-branch-index="8" data-git-style-index="0"><title>lane8/)
  expect(stock).toMatch(/data-commit-id="work8"[^>]*data-git-style-index="0"/)
  expect(redux).toMatch(/data-git-branch-index="8" data-git-style-index="8"><title>lane8/)
  expect(redux).toMatch(/data-commit-id="work8"[^>]*data-git-style-index="1"/)
  expect(redux).toMatch(/<title>lane8<\/title>.*?class="diagram-git-branch-label-box"[^>]*fill="#818cf8"/)
  expect(redux).toMatch(/data-commit-id="work8"[^>]*>.*?<circle class="diagram-git-dot"[^>]*fill="#2dd4bf"/)
})

test('applies Mermaid Gantt status colors, reference labels, and full date axis directives', () => {
  const source = [
    '---',
    'config:',
    '  themeVariables:',
    '    taskBkgColor: "#224466"',
    '    taskBorderColor: "#2288bb"',
    '    activeTaskBkgColor: "#994466"',
    '    doneTaskBkgColor: "#336655"',
    '    critBkgColor: "#aa5533"',
    '    critBorderColor: "#cc2211"',
    '    titleColor: "#cceeff"',
    '    textColor: "#ffeedd"',
    '    gridColor: "#887766"',
    '    taskTextOutsideColor: "#ddeeff"',
    '    vertLineColor: "#bb8866"',
    '---',
    'gantt',
    '  title Review schedule',
    '  axisFormat %G-W%V  %-d',
    '  tickInterval 1day',
    '  section Deliverables',
    '    Baseline : base, 2026-01-04, 1d',
    '    Active : active, crit, activeTask, after\tbase, 1d',
    '    Done : done, crit, doneTask, 2026-01-04, 2d',
    '    Critical : crit, criticalTask, 2026-01-05, 1d',
    '    Review prep : prep, 2026-01-05, 1h',
    '    Review opens : vert, opens, 2026-01-05, 2d',
  ].join('\n')
  const svg = mermaid(source, 'schedule-theme')!
  expect(svg).toContain('style="fill:#224466;stroke:#2288bb;stroke-width:2px"')
  expect(svg).toContain('style="fill:#994466;stroke:#cc2211;stroke-width:2px"')
  expect(svg).toContain('style="fill:#336655;stroke:#cc2211;stroke-width:2px"')
  expect(svg).toContain('style="fill:#aa5533;stroke:#cc2211;stroke-width:2px"')
  expect(svg).toMatch(/class="diagram-title"[^>]*style="fill:#cceeff;"/)
  expect(svg).toMatch(/class="diagram-gantt-section-label"[^>]*style="fill:#cceeff;"/)
  expect(svg).toMatch(/class="diagram-gantt-label"[^>]*style="fill:#ddeeff;"/)
  expect(svg).toMatch(/class="diagram-gantt-grid"[^>]*style="stroke:#887766"/)
  expect(svg).toMatch(/class="diagram-gantt-tick"[^>]*style="fill:#ffeedd;"[^>]*><tspan[^>]*>2026-W02  5</)
  expect(svg).toMatch(/class="diagram-gantt-reference-label"[^>]*style="fill:#bb8866;[^"]*"[^>]*><tspan[^>]*>Review opens</)
  expect(svg).toContain('data-task-id="activeTask" data-task-start="2026-01-05T00:00:00.000Z"')
})

test('preserves literal percent axis formats and imports Gantt marker stroke properties', () => {
  const now = spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 2, 9))
  const source = `gantt
axisFormat %Y-%%-%d
tickInterval 1day
%% Skip this whole line
todayMarker stroke:rgb(16, 128, 90), stroke-width:1.5px, opacity:80%, stroke-opacity:.6, stroke-dasharray:5, 3px, stroke-dashoffset:-1px, stroke-linecap:round
Build : build, 2026-03-06, 8d`
  try {
    const svg = mermaid(source, 'styled-today')!
    expect(svg).toContain('>2026-%-09</tspan>')
    expect(svg).toMatch(/class="diagram-gantt-today"[^>]*style="stroke:rgb\(16, 128, 90\);stroke-width:1.5px;opacity:0.8;stroke-opacity:0.6;stroke-dasharray:5 3;stroke-dashoffset:-1;stroke-linecap:round"/)
    expect(svg).not.toContain('Skip this whole line')
    const off = mermaid(source.replace(/^todayMarker.*$/m, 'todayMarker off'), 'no-today')
    expect(off).toContain('>2026-%-09</tspan>')
    expect(off).not.toContain('diagram-gantt-today')
  }
  finally { now.mockRestore() }
})

// Adapted from Mermaid's GitGraph parser recovery fixtures (MIT).
test('reports unknown GitGraph properties and retains known commit and merge fields', () => {
  const warning = spyOn(console, 'warn').mockImplementation(() => {})
  const source = `gitGraph
commit id:"A" msg:"Root" oops:"ignored; %% comment"
branch feature
commit id:"B"
checkout main
merge feature random:"ignored" id:"M" tag:"release" type:HIGHLIGHT`
  try {
    const history = buildGitHistory(source)
    expect(history?.commits.map(commit => [commit.id, commit.message, commit.symbol, commit.tags])).toEqual([
      ['A', 'Root', 'NORMAL', []], ['B', undefined, 'NORMAL', []],
      ['M', 'merged branch feature into main', 'HIGHLIGHT', ['release']],
    ])
    expect(warning.mock.calls).toEqual([
      ['GitGraph commit ignores unknown property "oops"'], ['GitGraph merge ignores unknown property "random"'],
    ])
    expect(mermaid(source, 'recovered-graph')).toContain('data-commit-id="M"')
    expect(buildGitHistory('gitGraph\ncommit id::')).toBeUndefined()
    expect(buildGitHistory('gitGraph\ncommit id:"one" id:"two"')).toBeUndefined()
    expect(buildGitHistory('gitGraph\nbranch feature order:xyz')).toBeUndefined()
  }
  finally { warning.mockRestore() }
})

const themedSchedule = `gantt
title Delivery schedule
todayMarker off
section Prepare
  Draft :draft, 2026-01-01, 5d
section Review
  Completed work :done, long, 2026-01-01, 8d
section Ship
  Notes :done, short, 2026-01-02, 5m`

test('uses named Mermaid Gantt palettes for backgrounds, section bands, and task states', () => {
  const expected = [
    ['base', '#f4f4f4', '#fff4dd', '#d3d3d3', '#fff4dd'],
    ['default', '#ffffff', '#8a90dd', '#d3d3d3', '#fff400'],
    ['dark', '#333333', '#595c5c', '#d3d3d3', '#eae8d9'],
    ['forest', '#ffffff', '#487e3a', '#d3d3d3', '#6eaa49'],
    ['neutral', '#ffffff', '#707070', '#bbbbbb', '#bdbdbd'],
    ['neo', '#ffffff', '#ececfe', '#d3d3d3', '#ececfe'],
    ['neo-dark', '#333333', '#1f2020', '#584343', '#1f2020'],
    ['redux', '#ffffff', '#ececfe', '#d3d3d3', '#ececfe'],
    ['redux-color', '#ffffff', '#ececfe', '#d3d3d3', '#46ecd5'],
    ['redux-dark', '#333333', '#1f2020', '#38383e', '#1f2020'],
    ['redux-dark-color', '#333333', '#1f2020', '#38383e', '#46ecd5'],
  ]
  for (const [theme, background, taskFill, doneFill, thirdSection] of expected) {
    const svg = mermaid(themedSchedule, 'palette', { theme })!
    expect(svg).toContain(`style="--diagram-background:${background}"`)
    expect(svg).toMatch(new RegExp(`data-task-id="draft"[^>]*>[^]*?class="diagram-gantt-bar"[^>]*style="fill:${taskFill};`))
    expect(svg).toMatch(new RegExp(`data-task-id="long"[^>]*>[^]*?class="diagram-gantt-bar"[^>]*style="fill:${doneFill};`))
    expect([...svg.matchAll(/class="diagram-gantt-band"[^>]*style="fill:([^;]+)/g)].map(match => match[1]).at(2)).toBe(thirdSection)
  }
  const source = '---\nconfig:\n  theme: dark\n  themeVariables:\n    taskBkgColor: "#224466"\n---\n' + themedSchedule
  const override = mermaid(source, 'palette', { theme: 'forest', themeVariables: { background: '#101820' } })!
  expect(override).toContain('data-diagram-theme="dark"')
  expect(override).toContain('style="--diagram-background:#101820"')
  expect(override).toContain('style="fill:#224466;stroke:#ffffff;stroke-width:2px"')
  expect(override).toContain('style="fill:#d3d3d3;stroke:#808080;stroke-width:2px"')
})

test('applies imported Gantt label placement and GitGraph padding in a rendered deck', async () => {
  const markdown = [
    '# Project chronology', '',
    '~~~mermaid', 'gantt', 'todayMarker off',
    'Schedule :wide, 2026-01-01, 8d',
    'Late checkpoint :milestone, check, 2026-01-09, 0d', '~~~', '',
    '~~~mermaid', '---', 'config:', '  gitGraph:', '    diagramPadding: 36', '    useMaxWidth: false', '---',
    'gitGraph TB:', 'commit id:"review"', '~~~',
  ].join('\n')
  const html = await renderDeck(parseDeck(markdown))
  expect(html).toMatch(/data-task-id="wide"[^>]*>.*?class="diagram-gantt-label" text-anchor="middle"/)
  expect(html).toMatch(/data-task-id="check"[^>]*>.*?class="diagram-gantt-label" text-anchor="end"/)
  expect(html).toContain('data-diagram-kind="gitgraph" transform="translate(36 36)"')
  const graph = html.match(/<svg\b[^>]*aria-label="Git graph"[^>]*>/)?.[0] ?? ''
  expect(graph).toMatch(/viewBox="0 0 ([\d.]+) ([\d.]+)" width="\1" height="\2"/)
  expect(html).toContain('data-commit-id="review"')
})

test('maps imported GitGraph palette and label styles onto structured charts', () => {
  const source = `---
config:
  gitGraph:
    rotateCommitLabel: false
  themeVariables:
    git0: '#28536b'
    gitBranchLabel0: '#ead99b'
    gitInv0: '#77aa66'
    commitLabelColor: '#173652'
    commitLabelBackground: '#d9eef6'
    commitLabelFontSize: '18px'
    tagLabelColor: '#370b16'
    tagLabelBackground: '#f7c4ca'
    tagLabelBorder: '#db8492'
    tagLabelFontSize: '14px'
    textColor: '#234567'
---
gitGraph
  commit id:"first" type:HIGHLIGHT tag:"v1"
  commit id:"second"`
  const native = `type: gitgraph
rotateCommitLabel: false
edgeLayout: orthogonal
colors: ['#28536b']
branchLabelColors: ['#ead99b']
highlightColors: ['#77aa66']
commitLabel: { color: '#173652', background: '#d9eef6', fontSize: 18 }
tagLabel: { shape: tag, color: '#370b16', background: '#f7c4ca', border: '#db8492', fontSize: 14, holeColor: '#234567' }
titleColor: '#234567'
operations:
  - { op: commit, id: first, style: HIGHLIGHT, tags: [v1] }
  - { op: commit, id: second }`
  const svg = mermaid(source, 'styled-git')
  expect(svg).toContain('fill="#77aa66"')
  expect(svg).toContain('style="fill:#173652;font-size:18px;"')
  expect(svg).toContain('fill="#f7c4ca" stroke="#db8492"')
  expect(svg).toMatch(/class="diagram-git-tag-hole"[^>]*fill="#234567"/)
  expect(svg).toBe(renderChart(native, 'styled-git'))
})

test('applies every named Mermaid GitGraph preset and lets diagram colors override it', () => {
  const graph = `gitGraph
    commit id:"root"
    branch review
    commit id:"ready" tag:"v1"
    checkout main
    merge review id:"shared" type:HIGHLIGHT`
  const presets = [
    ['base', '#f4f4f4', '#ffcb5e'],
    ['default', '#ffffff', '#0000ec'],
    ['forest', '#ffffff', '#9bc834'],
    ['neutral', '#ffffff', '#b4b4b4'],
    ['dark', '#333333', '#797d7d'],
    ['neo', '#ffffff', '#ffffff'],
    ['neo-dark', '#333333', '#2a2020'],
    ['redux', '#ffffff', '#ffffff'],
    ['redux-color', '#ffffff', '#ffffff'],
    ['redux-dark', '#333333', '#111113'],
    ['redux-dark-color', '#333333', '#111113'],
  ]
  for (const [theme, background, branch] of presets) {
    const svg = mermaid(graph, 'preset', { theme })!
    expect(svg).toContain(`data-diagram-theme="${theme}"`)
    expect(svg).toContain('data-diagram-kind="gitgraph" transform="translate(8 8)"')
    expect(svg).toContain(`style="--diagram-background:${background}"`)
    expect(svg).toMatch(new RegExp(`class="diagram-git-branch-label-box"[^>]*fill="${branch}"`))
    expect(svg).toContain('data-commit-id="shared" data-parent-ids="root, ready"')
  }

  const styled = [
    '---',
    'title: Release history',
    'config:',
    '  theme: dark',
    '  themeVariables:',
    '    git0: "#112233"',
    '    gitBranchLabel0: "#ddeeff"',
    '    gitInv0: "#aabbcc"',
    '    tagLabelBorder: "#ffcc66"',
    '---',
    graph,
  ].join('\n')
  const svg = mermaid(styled, 'palette-overrides', { theme: 'forest', themeVariables: { commitLabelFontSize: '14px' } })!
  expect(svg).toContain('data-diagram-theme="dark"')
  expect(svg).toMatch(/class="diagram-title"[^>]*style="fill:#f9fffe;"/)
  expect(svg).toMatch(/class="diagram-git-branch-label-box"[^>]*fill="#112233"/)
  expect(svg).toMatch(/class="diagram-git-branch-label"[^>]*style="fill:#ddeeff;"/)
  expect(svg).toMatch(/class="diagram-git-dot"[^>]*fill="#aabbcc"/)
  expect(svg).toMatch(/class="diagram-git-label"[^>]*style="fill:#b8b6b6;font-size:14px;"/)
  expect(svg).toMatch(/class="diagram-git-tag-box"[^>]*fill="#1f2020" stroke="#ffcc66"/)
})

test('renders themed GitGraph symbols, rails, and distinct Redux branch colors', () => {
  const source = `gitGraph
commit id:"root"
branch review
commit id:"ready" type:REVERSE tag:"v1"
checkout main
merge review id:"released"`
  for (const direction of ['LR', 'TB', 'BT']) {
    const graph = source.replace('gitGraph', `gitGraph ${direction}:`)
    const stock = mermaid(graph, 'classic-themes', { theme: 'forest' })!
    const redux = mermaid(graph, 'redux-themes', { theme: 'redux' })!
    const colored = mermaid(graph, 'redux-color-themes', { theme: 'redux-color' })!
    const dark = mermaid(graph, 'redux-dark-color-themes', { theme: 'redux-dark-color' })!
    expect(stock).toMatch(/<title>review<\/title><path[^>]*stroke="#000000" stroke-width="1" stroke-dasharray="2"/)
    expect(stock).toMatch(/data-commit-id="ready"[^>]*>.*?<circle class="diagram-git-dot"[^>]*r="10" fill="#7aff32"/)
    expect(stock).toMatch(/class="diagram-git-edge"[^>]*stroke-width="8" stroke-linecap="round"/)
    expect(redux).toMatch(/data-commit-id="ready"[^>]*>.*?<circle class="diagram-git-dot"[^>]*r="7" fill="#28253d"/)
    expect(redux).toMatch(/class="diagram-git-ring" fill="#ffffff"[^>]*r="5"/)
    expect(colored).toMatch(/<title>review<\/title><path[^>]*stroke="#bdbccc" stroke-width="2" stroke-dasharray="4 2"/)
    expect(colored).toMatch(/<title>review<\/title>.*?class="diagram-git-branch-label-box"[^>]*rx="0" fill="#2dd4bf" stroke="#2dd4bf"/)
    expect(colored).toMatch(/data-commit-id="ready"[^>]*>.*?<circle class="diagram-git-dot"[^>]*r="7" fill="#2dd4bf"/)
    expect(colored).toMatch(/class="diagram-git-edge"[^>]*stroke-width="2" stroke-linecap="round"[^>]*stroke="#2dd4bf"/)
    expect(dark).toMatch(/<title>review<\/title>.*?class="diagram-git-branch-label-box"[^>]*fill="#111113" stroke="#2dd4bf"/)
    expect(dark).toMatch(/data-commit-id="root"[^>]*>.*?<circle class="diagram-git-dot"[^>]*r="7" fill="#ffffff"/)
  }
  const custom = mermaid(source, 'custom-redux', { theme: 'redux-color', themeVariables: {
    borderColorArray: ['#ff0055', '#bc4422'], mainBkg: '#eff0f4', nodeBorder: '#151525',
    strokeWidth: 3, commitLineColor: '#204060',
  } })!
  expect(custom).toMatch(/<title>review<\/title><path[^>]*stroke="#204060" stroke-width="3"/)
  expect(custom).toMatch(/class="diagram-git-edge"[^>]*stroke-width="3"[^>]*stroke="#bc4422"/)
  expect(custom).toMatch(/class="diagram-git-ring" fill="#eff0f4"/)
})

// A compact version of the GitGraph look and theme fixtures from Mermaid 12.3.0 (MIT).
const neoHistory = `gitGraph
commit id:"initial"
branch review
commit id:"approved" type:HIGHLIGHT tag:"v1"
checkout main
merge review id:"published"`

test('configures Neo GitGraph gradients and label shadows independently of branch visibility', () => {
  const themed = mermaid(neoHistory, 'neo-classic-look', { theme: 'neo-dark' })!
  expect(themed).toContain('stop-color="#0042eb"')
  expect(themed).toContain('stop-color="#eb0042"')
  expect(themed).toMatch(/<feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="#b9b9b9" flood-opacity="0.2"/)
  expect(themed).not.toMatch(/class="diagram-git-branch-label-box"[^>]*filter=/)
  expect(themed).toMatch(/class="diagram-git-tag-box"[^>]*filter="url\(#neo-classic-look-label-shadow-1\)"/)

  const hidden = mermaid(neoHistory, 'neo-hidden', { theme: 'neo', look: 'neo', gitGraph: { showBranches: false, showCommitLabel: false } })!
  expect(hidden).not.toContain('linearGradient')
  expect(hidden).not.toContain('diagram-git-branch')
  expect(hidden).toMatch(/class="diagram-git-tag-box"[^>]*filter="url\(#neo-hidden-label-shadow-1\)"/)
  const flat = mermaid(neoHistory, 'neo-flat', { theme: 'neo', look: 'neo', themeVariables: { dropShadow: 'none', useGradient: false } })!
  expect(flat).toContain('class="diagram-git-branch-label-box"')
  expect(flat).not.toContain('<defs>')
})

const actions = `gantt
todayMarker off
Draft :draft, 2026-11-01, 1d
Review :review, after draft, 1d
Publish :ship, after review, 1d
click draft,review call delivery.record()
click ship href "#done/1" call delivery.record("red, blue", "<note> )", draft)
`

test('imports Gantt callback commands and applies security settings', () => {
  const strict = mermaid(actions, 'strict')
  expect(strict).toContain('data-task-id="ship"')
  expect(strict).not.toContain('data-gantt-callback')
  const loose = mermaid(actions, 'actions', { securityLevel: 'loose' })
  expect(loose?.match(/data-gantt-callback="delivery.record"/g)).toHaveLength(3)
  expect(loose).toContain('data-gantt-args="[&quot;draft&quot;]"')
  expect(loose).toContain('data-gantt-args="[&quot;review&quot;]"')
  expect(loose).toContain('data-gantt-args="[&quot;red, blue&quot;,&quot;&lt;note&gt; )&quot;,&quot;draft&quot;]"')
  expect(loose).not.toContain('onclick=')
})

const chrome = await findChrome()

test.skipIf(!chrome)('scopes GitGraph effects per diagram and preserves theme paint in the player', async () => {
  const charts = [
    ['  look: neo', '  theme: neo', '  themeVariables:', '    gradientStart: "rgb(17, 34, 51)"',
      '    gradientStop: "#778899"', '    dropShadow: "drop-shadow(rgba(32, 64, 96, 0.4) -2px 3px 1px)"', '    strokeWidth: 3',
      '  themeCSS: ".label1 { stroke: #abcdef }"'],
    ['  look: neo', '  theme: redux-dark-color', '  themeVariables:', '    filterColor: "#b2d3e4"'],
    ['  theme: neo-dark'],
  ]
  const deck = charts.map(config => ['~~~mermaid', '---', 'config:', ...config, '---', neoHistory, '~~~'].join('\n')).join('\n\n')
  const html = await renderDeck(parseDeck('# GitGraph\n\n' + deck))
  const css = Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url))
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: request => new URL(request.url).pathname === '/presentation.css'
      ? new Response(css, { headers: { 'Content-Type': 'text/css' } })
      : new Response(html, { headers: { 'Content-Type': 'text/html' } }),
  })
  const browser = new Bun.WebView({ width: 960, height: 620, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await browser.navigate(server.url.href)
    const effects = await browser.evaluate(`(() => {
      const effectId = value => /#([^")]+)/.exec(value)?.[1]
      return [...document.querySelectorAll('.slide-diagram')].map(svg => {
        const branch = svg.querySelector('.diagram-git-branch-label-box')
        const tag = svg.querySelector('.diagram-git-tag-box')
        const stroke = getComputedStyle(branch).stroke
        const branchShadow = getComputedStyle(branch).filter
        const tagShadow = getComputedStyle(tag).filter
        const gradient = svg.querySelector('linearGradient')
        const filter = svg.querySelector('filter')
        const shadow = filter.querySelector('feDropShadow')
        const rail = getComputedStyle(svg.querySelector('.diagram-git-branch > path'))
        const edge = getComputedStyle(svg.querySelector('.diagram-git-edge'))
        const merge = getComputedStyle(svg.querySelector('.diagram-git-merge .diagram-git-ring'))
        return {
          id: filter.id,
          branchFilters: branchShadow === 'none' ? 'none' : effectId(branchShadow) === filter.id,
          tagFilters: effectId(tagShadow) === filter.id,
          gradient: gradient ? [effectId(stroke) === gradient.id, ...[...gradient.querySelectorAll('stop')].map(stop => stop.getAttribute('stop-color'))] : null,
          branchOverride: getComputedStyle(svg.querySelectorAll('.diagram-git-branch-label-box')[1]).stroke,
          shadow: ['dx', 'dy', 'stdDeviation', 'flood-color', 'flood-opacity'].map(key => shadow.getAttribute(key)),
          rail: [rail.strokeWidth, rail.opacity],
          edge: [edge.strokeWidth, edge.strokeLinecap],
          merge: merge.fill,
        }
      })
    })()`) as { id: string, [property: string]: unknown }[]
    expect(effects).toHaveLength(3)
    expect(new Set(effects.map(effect => effect.id)).size).toBe(3)
    expect(effects[0]).toMatchObject({
      branchFilters: true, tagFilters: true, gradient: [true, '#112233', '#778899'], branchOverride: 'rgb(171, 205, 239)',
      shadow: ['-2', '3', '1', '#204060', '0.4'], rail: ['3px', '1'], edge: ['8px', 'round'], merge: 'rgb(255, 255, 255)',
    })
    expect(effects[1]).toMatchObject({
      branchFilters: true, tagFilters: true, gradient: null, shadow: ['4', '4', '0', '#b2d3e4', '0.06'],
      rail: ['2px', '1'], edge: ['2px', 'round'], merge: 'rgb(17, 17, 19)',
    })
    expect(effects[2]).toMatchObject({ branchFilters: 'none', tagFilters: true, gradient: [true, '#0042eb', '#eb0042'] })
  }
  finally {
    browser.close()
    await server.stop(true)
  }
})

test.skipIf(!chrome)('keeps full Gantt labels inside the chart without compact row collisions in Chromium', async () => {
  const tasks = [
    'Prepare the weekly release notes and verify each version before the external review',
    'Review the signed artifacts and publish the report for the delivery team',
    'Deploy to the internal environment and run the final verification',
  ]
  const source = [
    'gantt', 'dateFormat YYYY-MM-DD HH:mm', 'todayMarker off',
    `${tasks[0]} :first, 2026-01-01 00:00, 2h`,
    `${tasks[1]} :second, 2026-01-01 04:00, 2h`,
    `${tasks[2]} :final, 2026-01-01 06:00, 1d`,
  ]
  const charts = [
    mermaid(source.join('\n'), 'compact-labels', { gantt: { displayMode: 'compact', useWidth: 390, fontSize: 16, useMaxWidth: false } }),
    mermaid(source.join('\n'), 'narrow-labels', { gantt: { useWidth: 220, leftPadding: 20, rightPadding: 0, useMaxWidth: false } }),
  ]
  expect(charts.every(Boolean)).toBe(true)
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8">${charts.join('')}`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const browser = new Bun.WebView({ backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await browser.navigate(server.url.href)
    const layout = await browser.evaluate<{ text: string[], lines: number[], fits: boolean, separate: boolean }[]>(`[...document.querySelectorAll('svg')].map(svg => {
      const boundary = svg.getBoundingClientRect()
      const tasks = [...svg.querySelectorAll('.diagram-gantt-task')]
      const labels = tasks.map(task => task.querySelector('.diagram-gantt-label'))
      const boxes = tasks.map(task => task.getBoundingClientRect())
      return {
        text: labels.map(label => label.textContent),
        lines: labels.map(label => label.children.length),
        fits: boxes.every(box => box.left >= boundary.left && box.right <= boundary.right &&
          box.top >= boundary.top && box.bottom <= boundary.bottom),
        separate: boxes.every((a, index) => boxes.slice(index + 1).every(b =>
          a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)),
      }
    })`)
    expect(layout).toHaveLength(2)
    for (const chart of layout) {
      expect(chart.text.map(value => value.replace(/\s/g, ''))).toEqual(tasks.map(value => value.replace(/\s/g, '')))
      expect(chart.lines.some(count => count > 1)).toBe(true)
      expect(chart.fits).toBe(true)
      expect(chart.separate).toBe(true)
    }
  }
  finally {
    browser.close()
    await server.stop(true)
  }
}, 45_000)

test.skipIf(!chrome)('keeps dense Gantt axes readable and applies imported grid styling in Chromium', async () => {
  const source = `gantt
topAxis
tickInterval 1day
todayMarker off
Release :release, 2025-12-26, 2026-03-26`
  const gantt = { useWidth: 880, useMaxWidth: false }
  const styled = mermaid(source, 'styled-axis', {
    gantt, theme: 'forest',
    themeCSS: `
      .grid path.domain { stroke-width: 0; }
      .grid .tick line { stroke: #005577; }
      .grid .tick text { fill: #772211; }
    `,
  })
  const plain = mermaid(source, 'default-axis', { gantt, theme: 'forest' })
  const css = await Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url)).text()
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><style>${css}</style>${styled}${plain}`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const browser = new Bun.WebView({ backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await browser.navigate(server.url.href)
    const axes = await browser.evaluate<{ ticks: number, labels: string[], fit: boolean, paint: string[] }[]>(`[...document.querySelectorAll('.diagram-gantt-axis')].map(axis => {
      const captions = [...axis.querySelectorAll('text')]
      const boxes = captions.map(caption => caption.getBBox())
      const width = axis.ownerSVGElement.viewBox.baseVal.width
      return {
        ticks: axis.querySelectorAll('line').length,
        labels: captions.map(caption => caption.textContent),
        fit: boxes.every((box, i) => box.x >= 0 && box.x + box.width <= width &&
          (!i || boxes[i - 1].x + boxes[i - 1].width <= box.x)),
        paint: [getComputedStyle(axis.querySelector('path')).strokeWidth,
          getComputedStyle(axis.querySelector('line')).stroke, getComputedStyle(captions[0]).fill, getComputedStyle(captions[0]).fontSize],
      }
    })`)
    expect(axes).toHaveLength(4)
    for (const axis of axes) {
      expect(axis.ticks).toBe(98)
      expect(axis.labels.length).toBeLessThan(axis.ticks)
      expect(axis.labels[0]).toBe('2025-12-26')
      expect(axis.labels.at(-1)).toBe('2026-04-02')
      expect(axis.fit).toBe(true)
    }
    expect(axes[0]).toEqual(axes[1])
    expect(axes[0].paint).toEqual(['0px', 'rgb(0, 85, 119)', 'rgb(119, 34, 17)', '12px'])
    expect(axes[2].paint[0]).toBe('1px')
    expect(axes[2].paint[1]).not.toBe(axes[0].paint[1])
  }
  finally {
    browser.close()
    await server.stop(true)
  }
}, 45_000)

test.skipIf(!chrome)('wraps imported Gantt reference labels inside the chart and clears the time axis', async () => {
  const name = 'Release readiness review for customer documentation<br />Approval from all reviewers'
  const source = `gantt
todayMarker off
Work :work, 2026-03-06, 3d
${name} :vert, review, 2026-03-06, 0d
Publish :vert, publish, 2026-03-06, 0d`
  const svg = mermaid(source, 'marker-layout', { gantt: { useWidth: 225, leftPadding: 30, rightPadding: 0, fontSize: 16, useMaxWidth: false } })
  expect(svg).toBeDefined()
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8">${svg}`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const browser = new Bun.WebView({ width: 500, height: 520, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await browser.navigate(server.url.href)
    const layout = await browser.evaluate<{ text: string, lines: number, fit: boolean, axisGap: number, nextGap: number, sameDate: boolean }>(`(() => {
      const svg = document.querySelector('svg')
      const label = id => svg.querySelector('[data-task-id="' + id + '"] .diagram-gantt-reference-label')
      const mark = id => svg.querySelector('[data-task-id="' + id + '"] .diagram-gantt-reference')
      const spans = [...label('review').querySelectorAll('tspan')]
      const review = label('review').getBBox()
      const publish = label('publish').getBBox()
      const axis = svg.querySelector('[data-axis=bottom]').getBBox()
      const bounds = svg.viewBox.baseVal
      return {
        text: spans.map(span => span.textContent).join(' '), lines: spans.length,
        fit: [review, publish].every(box => box.x >= 0 && box.x + box.width <= bounds.width && box.y + box.height <= bounds.height),
        axisGap: review.y - axis.y - axis.height,
        nextGap: publish.y - review.y - review.height,
        sameDate: mark('review').getPointAtLength(0).x === mark('publish').getPointAtLength(0).x,
      }
    })()`)
    expect(layout.text).toBe(name.replace('<br />', ' '))
    expect(layout.lines).toBeGreaterThan(2)
    expect(layout.fit).toBe(true)
    expect(layout.axisGap).toBeGreaterThan(0)
    expect(layout.nextGap).toBeGreaterThan(0)
    expect(layout.sameDate).toBe(true)
  }
  finally {
    browser.close()
    await server.stop(true)
  }
}, 45_000)

test.skipIf(!chrome)('fits complete GitGraph labels and separate tag stacks in every orientation in Chromium', async () => {
  const branch = 'feature/review-release-candidate-across-all-supported-platforms'
  const commit = 'reviewed-and-approved-release-candidate-for-production'
  const tag = 'release-candidate-build-with-integration-verification'
  const graphs = ['LR', 'TB', 'BT'].flatMap(direction => [true, false].map((rotateCommitLabel) => {
    const source = [
      `gitGraph ${direction}:`,
      'commit id:"root" tag:"preview" tag:"signed<br>and tested" tag:"verified"',
      'commit id:"second" tag:"nightly"',
      `branch "${branch}"`,
      `commit id:"${commit}" tag:"${tag}" tag:"stable"`,
    ].join('\n')
    return mermaid(source, `long-${direction}-${rotateCommitLabel}`, {
      theme: 'forest', gitGraph: { rotateCommitLabel, useMaxWidth: false },
      themeCSS: rotateCommitLabel ? '.tag-hole { fill: #123456; }' : undefined,
    })
  }))
  expect(graphs.every(Boolean)).toBe(true)
  const css = await Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url)).text()
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8"><style>${css}</style>${graphs.map(svg => `<div class="slide" style="overflow:visible">${svg}</div>`).join('')}`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const browser = new Bun.WebView({ width: 1100, height: 780, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await browser.navigate(server.url.href)
    const boxes = await browser.evaluate<{ labels: string[], fits: boolean, separate: boolean, shaped: boolean, holeColors: string[] }[]>(`[...document.querySelectorAll('svg')].map(svg => {
      const bounds = svg.getBoundingClientRect()
      const labels = [...svg.querySelectorAll('.diagram-git-branch-label, .diagram-git-label, .diagram-git-tag')]
      const polygons = [...svg.querySelectorAll('polygon.diagram-git-tag-box')]
      const holes = [...svg.querySelectorAll('circle.diagram-git-tag-hole')]
      const tags = polygons.map(node => node.getBoundingClientRect())
      return {
        labels: labels.map(node => node.textContent),
        fits: [...labels, ...svg.querySelectorAll('.diagram-git-tag-box')].every(node => {
          const rect = node.getBoundingClientRect()
          return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 &&
            rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1
        }),
        separate: tags.length === 6 && tags.every((box, index) => tags.slice(index + 1).every(other =>
          box.bottom <= other.top || other.bottom <= box.top || box.right <= other.left || other.right <= box.left)),
        shaped: holes.length === polygons.length && holes.every((hole, index) =>
          polygons[index].isPointInFill(new DOMPoint(hole.cx.baseVal.value, hole.cy.baseVal.value))) &&
          new Set(polygons.slice(0, 3).map(node => Math.round(node.getBBox().width))).size === 1,
        holeColors: [...new Set(holes.map(hole => getComputedStyle(hole).fill))],
      }
    })`)
    expect(boxes).toHaveLength(6)
    for (const [index, graph] of boxes.entries()) {
      expect(graph.labels).toEqual(['main', branch, 'root', 'verified', 'signedand tested', 'preview', 'second', 'nightly', commit, 'stable', tag])
      expect(graph.fits).toBe(true)
      expect(graph.separate).toBe(true)
      expect(graph.shaped).toBe(true)
      expect(graph.holeColors).toEqual([index % 2 === 0 ? 'rgb(18, 52, 86)' : 'rgb(0, 0, 0)'])
    }
  }
  finally {
    browser.close()
    await server.stop(true)
  }
})

test.skipIf(!chrome)('routes GitGraph connectors around intervening commit dots in Chromium', async () => {
  const graphs = ['LR', 'TB', 'BT'].flatMap(direction => [true, false].map(parallelCommits =>
    mermaid(`gitGraph ${direction}:\n${routedHistory}`, `routed-${direction}-${parallelCommits}`, {
      gitGraph: { parallelCommits, rotateCommitLabel: false },
    })))
  expect(graphs.every(Boolean)).toBe(true)
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(`<!doctype html><meta charset="utf-8">${graphs.join('')}`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  })
  const browser = new Bun.WebView({ width: 1100, height: 780, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await browser.navigate(server.url.href)
    const routes = await browser.evaluate<{ turns: number, clearance: number, endpoints: boolean, copies: number }[]>(`[...document.querySelectorAll('svg')].map(svg => {
      const edges = svg.querySelectorAll('.diagram-git-pick-edge[data-from-commit="patch"][data-to-commit="c6"]')
      const route = edges[0]
      const length = route.getTotalLength()
      const center = id => {
        const dot = svg.querySelector('[data-commit-id="' + id + '"] .diagram-git-dot')
        return { x: dot.cx.baseVal.value, y: dot.cy.baseVal.value }
      }
      const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
      const blockers = ['next-draft', 'test', 'publish'].map(center)
      let clearance = Infinity
      for (let offset = 0; offset < length; offset += 1) {
        const point = route.getPointAtLength(offset)
        for (const blocker of blockers) clearance = Math.min(clearance, distance(point, blocker))
      }
      return {
        turns: route.getAttribute('d').split('Q').length - 1,
        clearance,
        endpoints: distance(route.getPointAtLength(0), center('patch')) < 1 &&
          distance(route.getPointAtLength(length), center('c6')) < 1,
        copies: edges.length,
      }
    })`)
    expect(routes).toHaveLength(6)
    for (const route of routes) {
      expect(route.turns).toBe(4)
      expect(route.clearance).toBeGreaterThan(12)
      expect(route.endpoints).toBe(true)
      expect(route.copies).toBe(1)
    }
  }
  finally {
    browser.close()
    await server.stop(true)
  }
})

test.skipIf(!chrome)('applies scoped indexed CSS to imported Gantt and GitGraph diagrams', async () => {
  const schedule = [
    'gantt', 'excludes 2026-03-06', 'section Draft', 'Draft :draft, 2026-03-01, 7d', 'section Review',
    'Review :active, crit, review, 2026-03-01, 7d', 'Done :done, finished, 2026-03-01, 7d',
    'section Draft', 'Revision :revision, 2026-03-01, 7d',
  ].join('\n')
  const frontmatter = [
    '---', 'config:', '  theme: forest', '  themeCSS: |',
    '    // Imported timeline styles',
    '    @media (min-width: 1px) {',
    '      .task { stroke: #112233; }',
    '      .exclude-range { fill: #123456; }',
    '      .task0 { fill: #3b295e; }',
    '      .activeCritText1, .doneText1 { fill: #ffeedd; }',
    '      .activeCrit1 { stroke-width: 5px; }',
    '      .sectionTitle1 { fill: #006677; }',
    '      rect[id^=review] { fill: #623c70; }',
    '      #review { height: 12px; }',
    '      h1 { color: red; }',
    '    }',
    '---',
  ].join('\n')
  const plain = '---\nconfig:\n  theme: forest\n---'
  const git = [
    '---', 'config:', '  themeCSS: |',
    '    .commit0 { fill: #123456; }', '    .commit2 { fill: #07967c; }',
    '    .commit-highlight2 { fill: #ab33aa; }', '    .branch2 { stroke: #449966; }',
    '    .branch-label1 { fill: #567812; }', '    .label2 { fill: #aaaaaa; }',
    '    .arrow2 { stroke: #135724; }',
    '---', 'gitGraph', 'commit id:"root"', 'branch review', 'commit id:"audit" type:HIGHLIGHT',
    'checkout main', 'branch priority order:0', 'commit id:"urgent"', 'checkout main', 'merge review id:"approved"',
  ].join('\n')
  const html = await renderDeck(parseDeck([
    '# Schedule', '', '<style>h1 { color: teal; }</style>', '',
    '~~~mermaid', frontmatter, schedule, '~~~', '',
    '~~~mermaid', plain, schedule, '~~~', '',
    '~~~mermaid', git, '~~~',
  ].join('\n')))
  const css = Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url))
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: request => new URL(request.url).pathname === '/presentation.css'
      ? new Response(css, { headers: { 'Content-Type': 'text/css' } })
      : new Response(html, { headers: { 'Content-Type': 'text/html' } }),
  })
  const view = new Bun.WebView({ width: 960, height: 620, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    expect(await view.evaluate(`(() => {
      const [first, second, git] = document.querySelectorAll('.slide-diagram')
      const bar = (chart, id) => getComputedStyle(chart.querySelector('[data-task-id="' + id + '"] .diagram-gantt-bar'))
      const label = id => getComputedStyle(first.querySelector('[data-task-id="' + id + '"] .diagram-gantt-label')).fill
      const fill = (root, selector) => getComputedStyle(root.querySelector(selector)).fill
      const stroke = (root, selector) => getComputedStyle(root.querySelector(selector)).stroke
      const review = bar(first, 'review')
      return {
        review: [review.fill, review.stroke, review.height, review.strokeWidth, label('review'), label('finished')],
        draft: [bar(first, 'draft').fill, bar(first, 'revision').fill],
        exclusions: [fill(first, '.diagram-gantt-excluded'), fill(second, '.diagram-gantt-excluded')],
        sections: [...first.querySelectorAll('.diagram-gantt-section-label')]
          .filter(node => getComputedStyle(node).fill === 'rgb(0, 102, 119)').map(node => node.textContent),
        outside: [bar(second, 'review').fill, getComputedStyle(document.querySelector('#slide-1 h1')).color],
        commits: [fill(git, '[data-commit-id="root"] .diagram-git-dot'),
          fill(git, '[data-commit-id="audit"] .diagram-git-dot'), fill(git, '.diagram-git-highlight-inner')],
        lanes: [stroke(git, '.diagram-git-branch[data-git-branch-index="2"] path'),
          fill(git, '.diagram-git-branch[data-git-branch-index="1"] .diagram-git-branch-label'),
          fill(git, '.diagram-git-branch[data-git-branch-index="2"] .diagram-git-branch-label-box')],
        edges: [...git.querySelectorAll('.diagram-git-edge')]
          .filter(node => getComputedStyle(node).stroke === 'rgb(19, 87, 36)').map(node => node.getAttribute('data-git-branch-index')),
      }
    })()`)).toEqual({
      review: ['rgb(98, 60, 112)', 'rgb(17, 34, 51)', '12px', '5px', 'rgb(255, 238, 221)', 'rgb(255, 238, 221)'],
      draft: ['rgb(59, 41, 94)', 'rgb(59, 41, 94)'],
      exclusions: ['rgb(18, 52, 86)', 'rgb(238, 238, 238)'],
      sections: ['Review'],
      outside: ['rgb(205, 228, 152)', 'rgb(0, 128, 128)'],
      commits: ['rgb(18, 52, 86)', 'rgb(171, 51, 170)', 'rgb(7, 150, 124)'],
      lanes: ['rgb(68, 153, 102)', 'rgb(86, 120, 18)', 'rgb(170, 170, 170)'],
      edges: ['2', '2'],
    })
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 45000)

test.skipIf(!chrome)('uses readable colors for completed Gantt labels inside and outside bars in Chromium', async () => {
  const frontmatter = '---\nconfig:\n  theme: dark\n---'
  const html = await renderDeck(parseDeck(['# Delivery', '', '~~~mermaid', frontmatter, themedSchedule, '~~~'].join('\n')))
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch: () => new Response(html, { headers: { 'Content-Type': 'text/html' } }),
  })
  const view = new Bun.WebView({ width: 960, height: 620, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    expect(await view.evaluate(`(() => {
      const chart = document.querySelector('.slide-diagram[data-diagram-theme="dark"]')
      const label = id => chart.querySelector('[data-task-id="' + id + '"] .diagram-gantt-label')
      return [
        getComputedStyle(chart.querySelector(':scope > rect')).fill,
        label('long').getAttribute('text-anchor'),
        getComputedStyle(label('long')).fill,
        label('short').getAttribute('text-anchor'),
        getComputedStyle(label('short')).fill,
      ]
    })()`)).toEqual(['rgb(51, 51, 51)', 'middle', 'rgb(44, 44, 44)', 'start', 'rgb(211, 211, 211)'])
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 45000)

test.skipIf(!chrome)('runs Gantt callbacks on keyboard and click and preserves slide navigation', async () => {
  const html = await renderDeck(parseDeck([
    '---', 'mermaid:', '  securityLevel: loose', '---', '', '# Delivery',
    '', '```mermaid', actions, '```',
    '', '---', 'routeAlias: done', '---', '', '# Release', '', '<p v-click>Release recorded</p>',
  ].join('\n')))
  const player = await Bun.build({
    entrypoints: [new URL('../packages/client/runtime/player.ts', import.meta.url).pathname],
    format: 'iife',
    target: 'browser',
  })
  if (!player.success || !player.outputs[0]) throw new Error('Could not build the browser player')
  const js = `window.delivery = { calls: [], record(...args) { this.calls.push(args) } };\n${await player.outputs[0].text()}`
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url)
      if (pathname === '/') return new Response(html, { headers: { 'Content-Type': 'text/html' } })
      if (pathname === '/presentation.js') return new Response(js, { headers: { 'Content-Type': 'application/javascript' } })
      return new Response(null, { status: 404 })
    },
  })
  const view = new Bun.WebView({ width: 960, height: 620, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate(server.url.href)
    expect(await view.evaluate(`(() => {
      const first = document.querySelector('[data-gantt-callback][role=button]')
      first.focus()
      return document.activeElement === first
    })()`)).toBe(true)
    await view.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
    await view.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
    await view.evaluate(`document.querySelector('a[data-gantt-callback]').focus()`)
    await view.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await view.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    expect(await view.evaluate('[window.delivery.calls, window.presentationNavigation.currentPage, window.presentationNavigation.clicks]'))
      .toEqual([[['draft'], ['red, blue', '<note> )', 'draft']], 2, 1])
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 45000)
