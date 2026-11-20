import { expect, test } from 'bun:test'
import { renderChart } from '../packages/slidev/node/runtime/charts.ts'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { mermaid } from '../packages/slidev/node/runtime/diagram.ts'
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
  expect(svg?.match(/class="diagram-gantt-excluded"/g)).toHaveLength(2)
  expect(svg).toContain('data-task-id="fixes" data-task-start="2026-03-09T00:00:00.000Z"')
  expect(svg).toContain('data-task-bar-end="2026-03-07T00:00:00.000Z"')
  expect(svg).not.toContain('diagram-gantt-today')
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
    ['deadline', march(5), march(8), undefined],
    ['window', march(7), march(10), undefined],
    ['followup', march(10), march(10), undefined],
  ])
})

test('uses strict input dates, validates dependencies and supports timezone offsets', () => {
  const iso = ganttDateParser('YYYY-MM-DD HH:mm Z')
  expect(iso('2026-02-30 03:15 -0800')).toBeUndefined()
  expect(new Date(iso('2026-03-04 03:15 -0800')!).toISOString()).toBe('2026-03-04T11:15:00.000Z')
  expect(mermaid('gantt\nA :a, after b, 1d\nB :b, after a, 1d', 'cycle')).toBeUndefined()
  expect(mermaid('gantt\nA :a, after missing, 2d', 'missing')).toBeUndefined()
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

const history = `gitGraph LR:
  commit id: "base"
  branch "feature/review" order: 3
  commit id:"work; review" type:HIGHLIGHT
  switch main
  commit id: "other" type: REVERSE
  cherry-pick id: "work; review"
  merge "feature/review" id: "release" tag: "v1.0" tag: "stable"
`

test('builds GitGraph branch history with merge parents, tags, and cherry-picks', () => {
  const graph = buildGitHistory(history, { parallelCommits: true })
  expect(graph?.commits.map(commit => [commit.id, commit.rank])).toEqual([
    ['base', 0], ['work; review', 1], ['other', 1], ['c4', 2], ['release', 3],
  ])
  expect(graph?.commits.at(-1)?.parents.map(parent => parent.id)).toEqual(['c4', 'work; review'])
  expect(graph?.commits[3].picked).toBe('work; review')
  expect(graph?.commits[4].tags).toEqual(['v1.0', 'stable'])
  const svg = mermaid(history, 'release-history', { gitGraph: { showCommitLabel: false } })
  expect(svg).toContain('data-commit-id="release" data-parent-ids="c4, work; review"')
  expect(svg).toContain('v1.0 · stable')
  expect(svg).not.toContain('class="diagram-git-label"')
})

test('supports directed GitGraph layout and checks cherry-pick merge parents', async () => {
  const branched = history + '  branch maintenance\n  commit id: "maintenance"\n'
  expect(buildGitHistory(branched + '  cherry-pick id: "release"\n')).toBeUndefined()
  expect(buildGitHistory(branched + '  cherry-pick id: "release" parent: "base"\n')).toBeUndefined()
  expect(buildGitHistory(branched + '  cherry-pick id: "release" parent: "c4"\n')?.commits.at(-1)?.picked).toBe('release')
  const picked = mermaid(branched + '  cherry-pick id: "release" parent: "c4"\n', 'provenance')!
  expect(picked).toMatch(/stroke-dasharray="5 3" data-from-commit="release" data-to-commit="c7"/)
  expect(picked).toContain('data-parent-ids="maintenance" data-picked-id="release" data-picked-parent="c4"')
  expect(picked).toContain('cherry-pick:release|parent:c4')
  const input = `# Timelines\n\n\`\`\`mermaid\n${history.replace('LR:', 'BT:')}\`\`\``
  const html = await renderDeck(parseDeck(input))
  expect(html).toContain('viewBox="0 0 ')
  expect(html).toContain('diagram-git-node diagram-git-merge')
  expect(html).not.toContain('language-mermaid')
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
    ['approved', undefined, 'NORMAL'],
  ])
  expect(parsed?.commits.at(-1)?.parents.map(parent => parent.id)).toEqual(['base', 'fix'])
  const input = ['# Review workflow', '', '~~~mermaid', graph, '~~~'].join('\n')
  const html = await renderDeck(parseDeck(input))
  expect(html).toContain('data-commit-message="Begin &quot;review&quot;: phase 1"')
  expect(html).toContain('data-commit-message="Fix; verify 100%% complete"')
  expect(html).toContain('diagram-git-reverse-mark')
  expect(html).toMatch(/data-commit-id="approved" data-parent-ids="base, fix"[^>]*><title>[^<]*<\/title><circle[^>]*\/><g transform=/)
  expect(buildGitHistory('gitGraph\ncommit msg:bare-message')).toBeUndefined()
  expect(buildGitHistory('gitGraph\ncommit "first" msg:"second"')).toBeUndefined()
})

test('native Gantt YAML and compatibility syntax render the same schedule', () => {
  const yaml = `type: gantt
accessibleTitle: Delivery steps
description: The preview comes before release.
todayMarker: false
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

test('imports GitGraph rotation and multiline accessible descriptions', () => {
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
  expect(defaultSvg).toContain('aria-describedby="rotation-description"')
  expect(defaultSvg).toContain('<desc id="rotation-description">Main and review lanes converge ahead of release.</desc>')
  expect(defaultSvg).toMatch(/rotate\(45 /)
  expect(defaultSvg).toContain('>apply reviewer corrections</tspan>')
  const frontmatter = ['---', 'config:', '  gitGraph:', '    rotateCommitLabel: false', '---', graph].join('\n')
  const horizontal = mermaid(frontmatter, 'horizontal')
  expect(horizontal).not.toContain('rotate(')
  expect(horizontal).toContain('>v1</tspan>')
})

test('imports Gantt compact frontmatter, dimensions, fonts, and themed section bands', () => {
  const source = `---
displayMode: compact
config:
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
  expect(svg).toMatch(/class="diagram-gantt-grid"[^>]*d="M[\d.]+ 14V/)
  const height = (html: string) => Number(/viewBox="0 0 460 ([\d.]+)/.exec(html)?.[1])
  expect(height(svg)).toBeLessThan(height(mermaid(source.replace('displayMode: compact\n', ''), 'ordinary-gantt')!))
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
---
gitGraph
  commit id:"first" type:HIGHLIGHT tag:"v1"
  commit id:"second"`
  const native = `type: gitgraph
rotateCommitLabel: false
colors: ['#28536b']
branchLabelColors: ['#ead99b']
highlightColors: ['#77aa66']
commitLabel: { color: '#173652', background: '#d9eef6', fontSize: 18 }
tagLabel: { color: '#370b16', background: '#f7c4ca', border: '#db8492', fontSize: 14 }
operations:
  - { op: commit, id: first, style: HIGHLIGHT, tags: [v1] }
  - { op: commit, id: second }`
  const svg = mermaid(source, 'styled-git')
  expect(svg).toContain('fill="#77aa66"')
  expect(svg).toContain('style="fill:#173652;font-size:18px;"')
  expect(svg).toContain('fill="#f7c4ca" stroke="#db8492"')
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
    ['neo', '#ffffff', '#7373f8'],
    ['neo-dark', '#333333', '#8b0000'],
    ['redux', '#ffffff', '#7373f8'],
    ['redux-color', '#ffffff', '#7373f8'],
    ['redux-dark', '#333333', '#000000'],
    ['redux-dark-color', '#333333', '#000000'],
  ]
  for (const [theme, background, branch] of presets) {
    const svg = mermaid(graph, 'preset', { theme })!
    expect(svg).toContain(`data-diagram-theme="${theme}"`)
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
