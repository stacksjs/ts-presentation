import { expect, test } from 'bun:test'
import { mermaid, renderMermaid } from '../packages/slidev/node/runtime/diagram.ts'
import { parseDeck, renderDeck } from '../packages/slidev/node/runtime/index.ts'

test('imports named bar and line series, quoted categories, and per-point labels', () => {
  const diagram = `xychart-beta
    title "Review metrics"
    accTitle: Quarter totals
    accDescr: Compare the measured values with a target.
    x-axis "Quarter" [Q1, "Q2, revised", "Q3 %% final"]
    y-axis "Balance" -10 --> 25
    bar "Measured" [-3.4, .98, +20] %% inline comment
    bar [3,4,8]
    line "Target" [2, 4 "Target <goal>", 12]
  `
  const svg = mermaid(diagram, 'metrics')!
  expect(svg).toContain('data-diagram-kind="xy" data-orientation="vertical"')
  expect(svg).toContain('aria-labelledby="metrics-title" aria-describedby="metrics-description"')
  expect(svg).toContain('aria-label="Quarter totals"')
  expect(svg).toContain('>Review metrics</tspan>')
  expect(svg).toContain('>Q2, revised</tspan>')
  expect(svg).toContain('>Q3 %% final</tspan>')
  expect(svg).toContain('>Target &lt;goal&gt;</tspan>')
  expect(svg).toContain('>Measured</tspan>')
  expect(svg).toContain('>Target</tspan>')
  expect(svg.match(/class="diagram-xy-bar"/g)).toHaveLength(6)
  expect(svg.match(/class="diagram-xy-line"/g)).toHaveLength(1)
})

test('merges nested XY axes and theme options across deck, diagram, and fence config', async () => {
  const source = `---
config:
  xyChart:
    width: 620
    showDataLabel: true
    yAxis:
      showTick: false
      labelRotation: -15
  themeVariables:
    xyChart:
      titleColor: "#aa2233"
      plotColorPalette: "#42a077, #ab7526"
---
xychart horizontal
  title "Flow rates"
  x-axis "Elapsed time" -2 --> +8
  y-axis "Units" 0 --> 20
  bar [6, 8, 9]
  line [2, 4, 1e1 "End"]
`
  const svg = (await renderMermaid(source, 'measure',
    {
      xyChart: { yAxis: { showTitle: false }, height: 350 },
      themeVariables: { xyChart: { backgroundColor: '#102030' } },
    },
    { xyChart: { yAxis: { labelFontSize: 16 } }, themeVariables: { xyChart: { yAxisLabelColor: '#ffcc00' } } },
  ))!
  expect(svg).toContain('viewBox="0 0 620 350"')
  expect(svg).toContain('data-orientation="horizontal"')
  expect(svg).toContain('fill="#102030"')
  expect(svg).toContain('fill:#aa2233;font-size:20px;')
  expect(svg).toContain('fill:#ffcc00;font-size:16px;')
  expect(svg).toContain('fill="#42a077"')
  expect(svg).toContain('stroke="#ab7526"')
  expect(svg).toContain('rotate(-15)')
  expect(svg).not.toContain('>Units</tspan>')
  expect(svg).toContain('>End</tspan>')
  expect(svg.match(/diagram-xy-value/g)).toHaveLength(4)
})

test('renders both native and imported XY charts through the Markdown deck', async () => {
  const source = `# Comparison

~~~charts
type: xy
width: 590
xAxis:
  categories: [Jan, Feb, Mar]
yAxis:
  domain: [0, 10]
series:
  - { type: bar, label: Delivered, values: [3, 6, 9] }
  - { type: line, label: Target, values: [4, 5, { value: 8, label: Planned }] }
~~~

~~~mermaid
%%{init: {"xyChart":{"width":590}}}%%
xychart
x-axis [Jan, Feb, Mar]
y-axis 0 --> 10
bar "Delivered" [3, 6, 9]
line "Target" [4, 5, 8 "Planned"]
~~~

~~~mermaid
xychart
y-axis [invalid]
bar [1, 2]
~~~
`
  const html = await renderDeck(parseDeck(source))
  expect(html.match(/data-diagram-kind="xy"/g)).toHaveLength(2)
  expect(html.match(/viewBox="0 0 590 500"/g)).toHaveLength(2)
  expect(html.match(/diagram-xy-bar/g)).toHaveLength(6)
  expect(html.match(/>Planned<\/tspan>/g)).toHaveLength(2)
  expect(html).toContain('url(#chart-0-0-xy-plot)')
  expect(html).toContain('language-mermaid')
  expect(html).not.toMatch(/(?:NaN|Infinity)/)
})
