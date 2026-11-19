import { expect, test } from 'bun:test'
import { renderChart } from '../packages/slidev/node/runtime/charts.ts'
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
  expect(tasks).toEqual([['first', '2026-03-06', '2026-03-07'], ['fixes', '2026-03-07', '2026-03-11'],
    ['window', '2026-03-07', '2026-03-13'], ['ship', '2026-03-13', '2026-03-13']])
  const svg = mermaid(project, 'release-gantt')
  expect(svg).toContain('aria-label="Release plan"')
  expect(svg).toContain('diagram-gantt-milestone-shape')
  expect(svg?.match(/class="diagram-gantt-excluded"/g)).toHaveLength(2)
  expect(svg).toContain('data-task-id="fixes" data-task-start="2026-03-07T00:00:00.000Z"')
  expect(svg).not.toContain('diagram-gantt-today')
})

test('uses strict input dates, validates dependencies and supports timezone offsets', () => {
  const iso = ganttDateParser('YYYY-MM-DD HH:mm Z')
  expect(iso('2026-02-30 03:15 -0800')).toBeUndefined()
  expect(new Date(iso('2026-03-04 03:15 -0800')!).toISOString()).toBe('2026-03-04T11:15:00.000Z')
  expect(mermaid('gantt\nA :a, after b, 1d\nB :b, after a, 1d', 'cycle')).toBeUndefined()
  expect(mermaid('gantt\nA :a, after missing, 2d', 'missing')).toBeUndefined()
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
  const input = `# Timelines\n\n\`\`\`mermaid\n${history.replace('LR:', 'BT:')}\`\`\``
  const html = await renderDeck(parseDeck(input))
  expect(html).toContain('viewBox="0 0 ')
  expect(html).toContain('diagram-git-node diagram-git-merge')
  expect(html).not.toContain('language-mermaid')
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
  expect(plain?.match(/>monday<\/tspan>/g)?.length).toBeGreaterThanOrEqual(4)
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
