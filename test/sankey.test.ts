import { expect, test } from 'bun:test'
import { mermaid, renderMermaid } from '../packages/slidev/node/runtime/diagram.ts'
import { parseDeck, renderDeck } from '../packages/slidev/node/runtime/index.ts'

test('imports Sankey CSV with quoted commas, doubled quotes, comments, multiline fields and empty rows', () => {
  const source = `%% yearly totals
sankey-beta

accTitle: Energy allocation
accDescr {
  One source sends energy to two uses.
}
%% source,target,value
Pumped heat,"Heating and cooling, ""homes""",193.026
Pumped heat,"Heating and cooling, ""commercial""",70.672

"Local
generation","Heating and cooling, ""homes""",.5
  `
  const svg = mermaid(source.replaceAll('\n', '\r\n'), 'energy')!
  expect(svg).toContain('aria-labelledby="energy-title" aria-describedby="energy-description"')
  expect(svg).toContain('data-diagram-kind="sankey" data-alignment="justify"')
  expect(svg).toContain('data-target="Heating and cooling, &quot;homes&quot;" data-value="193.026"')
  expect(svg).toContain('data-source="Local\r\ngeneration"')
  expect(svg.match(/class="diagram-sankey-link"/g)).toHaveLength(3)
})

test('honors Sankey dimensions, node alignment, custom color precedence and node labels', async () => {
  const source = `---
title: "Flow report"
config:
  sankey:
    width: 700
    height: 360
    nodeWidth: 15
    nodePadding: 20
    nodeAlignment: right
    linkColor: target
    labelStyle: outlined
    prefix: "$"
    suffix: "k"
    nodeColors:
      Review: "#e15759"
---
sankey
Draft,Review,5
Review,Done,5
  `
  const svg = (await renderMermaid(source, 'flow', { sankey: { nodeColors: { Draft: '#112233' } } },
    { sankey: { nodeColors: { Done: 'rgb(12 34 56)' } } }))!
  expect(svg).toContain('viewBox="0 0 700 360"')
  expect(svg).toContain('data-alignment="right"')
  expect(svg).toContain('fill="#112233"')
  expect(svg).toMatch(/data-target="Review"[^>]*stroke="#e15759"/)
  expect(svg).toMatch(/data-target="Done"[^>]*stroke="rgb\(12 34 56\)"/)
  expect(svg).toMatch(/class="diagram-sankey-node"[^>]*width="15"/)
  expect(svg).toContain('>$5k</tspan>')
  expect(svg).toContain('>Flow report</tspan>')
  expect(svg).not.toContain('<linearGradient')
})

test('keeps bad Sankey input visible and renders structured and imported charts in one deck', async () => {
  const markdown = `# Route the flow

~~~charts
type: sankey
showValues: false
links:
  - { source: Draft, target: Review, value: 9 }
  - { source: Review, target: Final, value: 8 }
~~~

~~~mermaid
sankey
Draft,Review,9
Review,Final,8
~~~

~~~mermaid
sankey
Draft,Review,9
Review,Draft,8
~~~
`
  const html = await renderDeck(parseDeck(markdown))
  expect(html.match(/data-diagram-kind="sankey"/g)).toHaveLength(2)
  expect(html.match(/class="diagram-sankey-link"/g)).toHaveLength(4)
  expect(html).toContain('id="chart-0-0-sankey-0"')
  expect(html).toContain('id="arrow-0-1-sankey-0"')
  expect(html).toContain('language-mermaid')
  expect(mermaid('sankey\nA,B,-4', 'invalid')).toBeUndefined()
  expect(mermaid('sankey\nA,B,4,extra', 'invalid')).toBeUndefined()
  expect(mermaid('sankey\n"A,B,4', 'invalid')).toBeUndefined()
})
