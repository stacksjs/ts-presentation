import { expect, test } from 'bun:test'
import { parseDeck, renderDeck } from '../src/index.ts'
import { renderChart } from '../packages/slidev/node/runtime/charts.ts'
import { mermaid, renderMermaid } from '../packages/slidev/node/runtime/diagram.ts'

test('imports nested treemaps with Mermaid styles, values, and accessible labels', () => {
  const source = `---
title: Release capacity
config:
  theme: forest
  treemap:
    nodeWidth: 40
    nodeHeight: 20
    diagramPadding: 14
    useMaxWidth: false
    valueFormat: '$0,0'
---
treemap-beta
  accTitle: Capacity by team
  accDescr {
    Quarterly staffing
    and open roles.
  }
  "Platform":::lead
    "Tools #38; Systems %% Cloud": 1_200
    'Support'
      "Open roles", 800
  "QA": 500 %% omit this comment
  classDef lead fill:red,color:blue,stroke:rgb(2, 3, 4),stroke-width:3px;
`
  const svg = mermaid(source, 'release')!
  expect(svg).toContain('data-diagram-kind="treemap"')
  expect(svg).toContain('viewBox="0 0 428 262" width="428" height="262"')
  expect(svg).toContain('<title id="tp-treemap-release-title">Capacity by team</title>')
  expect(svg).toContain('<desc id="tp-treemap-release-desc">Quarterly staffing and open roles.</desc>')
  expect(svg).toContain('data-treemap-label="Platform" data-treemap-value="2000" data-treemap-depth="1"')
  expect(svg).toContain('data-treemap-label="Open roles" data-treemap-value="800" data-treemap-depth="3"')
  expect(svg).toContain('data-treemap-label="Tools &amp; Systems %% Cloud"')
  expect(svg).toContain('<title>Platform: $2,000</title>')
  expect(svg).toContain('fill:#ff0000;fill-opacity:1;stroke:#020304;stroke-width:3')
  expect(svg).toContain('fill:#0000ff;font-size:14px')
  expect(svg).not.toContain('omit this comment')
})

test('layout gives native treemap leaves proportional area and supports hiding their values', () => {
  const svg = renderChart(`
type: treemap
width: 400
height: 200
padding: 0
diagramPadding: 0
showValues: false
nodes:
  - label: Large leaf
    value: 3
  - label: Small leaf
    value: 1
`, 'area')!
  const areas = [...svg.matchAll(/class="treemapLeaf" width="([^"]+)" height="([^"]+)"/g)]
    .map(([, width, height]) => Number(width) * Number(height))
  expect(areas).toEqual([60_000, 20_000])
  expect(svg).toContain('data-treemap-value="3"')
  expect(svg).not.toContain('class="treemapValue"')
  expect(svg).not.toContain('<title>Large leaf: 3</title>')
})

test('scopes imported treemap CSS and keeps authored markup out of SVG nodes', async () => {
  const source = `treemap
"<script>unsafe</script>": 0.35:::accent
classDef accent fill:url(https://example.invalid/test),stroke:navy;
`
  const svg = await renderMermaid(source, 'safe', {
    treemap: { valueFormat: '.1%' },
    themeCSS: '.treemapLeaf { stroke-width: 4; }',
  })
  expect(svg).toContain('#tp-diagram-safe')
  expect(svg).toContain('.treemapLeaf')
  expect(svg).toContain('35.0%')
  expect(svg).toContain('&lt;script&gt;unsafe&lt;/script&gt;')
  expect(svg).not.toContain('<script>')
  expect(svg).not.toContain('https://example.invalid/test')
})

test('renders treemap fences on a slide and leaves invalid hierarchy source visible', async () => {
  const source = [
    '# Release portfolio', '',
    '~~~mermaid', 'treemap-beta', '"Backend"', '\t"New routes": 5', '~~~', '',
    '~~~charts', 'type: treemap', 'nodes:', '  - label: Client', '    value: 2', '~~~', '',
    '~~~mermaid', 'treemap-beta', '"A leaf": 7', '    "Cannot be nested under a leaf": 1', '~~~',
  ].join('\n')
  const html = await renderDeck(parseDeck(source))
  expect(html.match(/data-diagram-kind="treemap"/g)).toHaveLength(2)
  expect(html).toContain('data-treemap-label="New routes" data-treemap-value="5" data-treemap-depth="2"')
  expect(html).toContain('data-treemap-label="Client" data-treemap-value="2"')
  expect(html).toContain('Cannot be nested under a leaf')
})
