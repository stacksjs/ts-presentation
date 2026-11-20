import { expect, test } from 'bun:test'
import { renderChart } from '../packages/slidev/node/runtime/charts.ts'
import { mermaid } from '../packages/slidev/node/runtime/diagram.ts'
import { parseDeck, renderDeck } from '../packages/slidev/node/runtime/index.ts'

// Syntax cases adapted from Mermaid's quadrant parser and rendering fixtures (MIT).
const source = `quadrantChart
title Portfolio
accTitle: Assessment
accDescr {
  Compare reach and effort.
}
x-AxIs "Low reach --> today" --> "High reach"
y-axis Effort -->
quadrant-1 拡大
quadrant-2 Plan
quadrant-3 Review
quadrant-4 Defer
"Candidate; <draft>":::constructor: [1, 0] color: #00ff33, radius: 8
Review:::constructor: [0.35, 0.75]
classDef constructor color: #109060, radius: 10, stroke-color: #310085, stroke-width: 3px`

test('imports quadrant axes, Unicode labels and late-defined point classes', () => {
  const svg = mermaid(source, 'portfolio')!
  expect(svg).toContain('aria-labelledby="portfolio-title" aria-describedby="portfolio-description"')
  expect(svg).toContain('Compare reach and effort.')
  expect(svg).toContain('Low reach --&gt; today')
  expect(svg).toContain('Effort ⟶')
  expect(svg.match(/data-quadrant="[1-4]"/g)).toHaveLength(4)
  expect(svg).toContain('>拡大</tspan>')
  expect(svg).toContain('Candidate; &lt;draft&gt;')
  expect(svg).toContain('r="8" fill="#00ff33" stroke="#310085" stroke-width="3"')
  expect(svg).toContain('r="10" fill="#109060" stroke="#310085" stroke-width="3"')
})

test('merges quadrant frontmatter and init settings while preserving explicit style overrides', async () => {
  const configured = [
    '---', 'config:', '  theme: dark', '  quadrantChart:', '    chartWidth: 560',
    '    chartHeight: 480', '    yAxisPosition: right', '    useMaxWidth: false',
    '  themeVariables:', '    quadrant1TextFill: "ffee33"', '---',
    '%%{init: {"quadrantChart": {"chartHeight": 440, "titleFontSize": 18, "quadrantInternalBorderStrokeWidth": 4}}}%%',
    source,
  ].join('\n')
  const html = await renderDeck(parseDeck(['# Choices', '', '~~~mermaid', configured, '~~~'].join('\n')))
  expect(html).toMatch(/<svg width="560" height="440"[^>]*viewBox="0 0 560 440"[^>]*data-diagram-theme="dark"/)
  expect(html).toContain('style="--diagram-background:#333333"')
  expect(html).toMatch(/diagram-quadrant-label[^>]*fill:#ffee33;/)
  expect(html).toMatch(/diagram-title[^>]*font-size:18px;/)
  expect(html).toMatch(/diagram-quadrant-dividers[^>]*stroke-width="4"/)
  expect(html).toMatch(/transform="rotate\(-90 547 /)
})

test('routes YAML and Mermaid quadrant charts through the same renderer', () => {
  const native = renderChart(`type: quadrant
title: Assessment
xAxis: [Low, High]
quadrants: [Expand, Prepare, Review, Defer]
points:
  - { label: Candidate, x: 0.6, y: 0.8 }`, 'decision')
  const imported = mermaid(`quadrantChart
title Assessment
x-axis Low --> High
quadrant-1 Expand
quadrant-2 Prepare
quadrant-3 Review
quadrant-4 Defer
Candidate: [0.6, 0.8]`, 'decision')
  expect(native).toContain('data-diagram-kind="quadrant"')
  expect(imported).toBe(native)
})

test('renders empty quadrant grids and preserves invalid input as fenced source', async () => {
  expect(mermaid('quadrantChart', 'empty')?.match(/data-quadrant="[1-4]"/g)).toHaveLength(4)
  expect(mermaid('quadrantChart; point: [0, 1]', 'inline')).toContain('data-point-x="0" data-point-y="1"')
  expect(mermaid('quadrantChart\nPoint: [0.5, 0.25] padding: 3', 'invalid-style')).toBeUndefined()
  const invalid = 'quadrantChart\nPoint: [1.3, 0]'
  expect(mermaid(invalid, 'invalid')).toBeUndefined()
  const html = await renderDeck(parseDeck(['# Invalid', '', '~~~mermaid', invalid, '~~~'].join('\n')))
  expect(html).toContain('language-mermaid')
  expect(html).toContain('1.3')
  expect(html).not.toContain('data-diagram-kind="quadrant"')
})
