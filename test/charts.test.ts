import { expect, test } from 'bun:test'
import { createDeckCompiler } from '../src/loader.ts'
import { parseDeck, renderDeck } from '../src/index.ts'

test('compiles native flowcharts from structured YAML data', async () => {
  const html = await renderDeck(parseDeck(`# Prepare

~~~charts
type: flowchart
theme: neutral
accessibleTitle: Proposal flow
nodes:
  - { id: draft, label: Draft }
  - { id: review, label: Review, shape: diamond }
edges:
  - { from: draft, to: review, label: Send }
~~~
`))
  expect(html).toContain('data-diagram-kind="flowchart"')
  expect(html).toContain('aria-label="Proposal flow"')
  expect(html).toContain('data-diagram-theme="neutral"')
  expect(html).toContain('data-node-id="review"')
  expect(html).toContain('marker-end="url(#chart-0-0)"')
  expect(html).not.toContain('language-charts')
})

test('renders native charts in the example deck using the normal compiler', async () => {
  const { html } = await createDeckCompiler('examples/demo/slides.md')()
  expect(html).toContain('data-diagram-kind="flowchart"')
  expect(html).toContain('data-diagram-kind="timeline"')
  expect(html).toContain('data-diagram-kind="journey"')
  expect(html).toContain('data-diagram-kind="gantt"')
  expect(html).toContain('data-diagram-kind="gitgraph"')
  expect(html).toContain('data-task-id="verify" data-task-start="2026-03-07T00:00:00.000Z" data-task-end="2026-03-11T00:00:00.000Z"')
  expect(html).toContain('data-commit-id="Approve" data-parent-ids="Prepare, Draft"')
  expect(html).toContain('Release milestones by phase')
  expect(html).toContain('marker-end="url(#chart-16-0)"')
})

test('keeps invalid native diagram data as visible source', async () => {
  const html = await renderDeck(parseDeck(`# Invalid

~~~charts
type: flowchart
nodes: [{ id: known }]
edges: [{ from: known, to: missing }]
~~~

~~~ts-charts
type: journey
phases: { unexpected: data }
~~~
`))
  expect(html).toContain('language-charts')
  expect(html).toContain('language-ts-charts')
  expect(html).not.toContain('data-diagram-kind=')
})
