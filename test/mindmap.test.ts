import { expect, test } from 'bun:test'
import { mermaid } from '../packages/slidev/node/runtime/diagram.ts'
import { parseDeck, renderDeck } from '../packages/slidev/node/runtime/index.ts'

test('imports mind maps with nearest-parent indentation, shapes, and scoped author styles', () => {
  const svg = mermaid([
    '---', 'title: Project outline', 'config:', '  layout: tidy-tree', '  mindmap:', '    colorBy: depth',
    '    useMaxWidth: false', '  themeVariables:', '    cScale2: "#bfdbfe"',
    '  themeCSS: ".highlight rect { stroke-width: 3px }"', '---',
    'mindmap', '  accTitle: Project concept tree', '  accDescr { A hierarchy of teams }',
    '  root((Project))', '      team[Teams]', '          roles(Roles)',
    '        focus{{Focus}}', '      launch))Launch((', '        release)Release(',
    '      :::highlight large',
  ].join('\n'), 'planning')
  expect(svg).toContain('data-layout="tidy-tree"')
  expect(svg).toContain('aria-labelledby="tp-mindmap-planning-title"')
  expect(svg).toContain('aria-describedby="tp-mindmap-planning-desc"')
  expect(svg).toContain('Project concept tree')
  expect(svg).toContain('A hierarchy of teams')
  expect(svg).toMatch(/viewBox="0 0 [\d.]+ [\d.]+" width="\d+" height="\d+"/)
  expect(svg).toContain('data-from="team" data-to="focus"')
  expect(svg?.match(/section-2[^>]+data-depth="2"/g)).toHaveLength(3)
  expect(svg).toContain('fill:rgb(191, 219, 254)')
  expect(svg).toContain('section-2 highlight large')
  expect(svg).toContain('#tp-diagram-planning')
  for (const shape of ['circle', 'square', 'rounded', 'hexagon', 'bang', 'cloud'])
    expect(svg).toContain(`data-shape="${shape}"`)
})

test('imports multiline Markdown label styling and deck-supplied icon classes', () => {
  const svg = mermaid([
    'mindmap', '  root["`**Project** and *research*', 'second line #38; review`"]',
    '    Notes<br/>Proof', '    ::icon(fa fa-book)',
  ].join('\n'), 'labels') ?? ''
  expect(svg).toContain('data-layout="balanced"')
  expect(svg).toContain('<tspan font-weight="bold">Project</tspan>')
  expect(svg).toContain('<tspan font-style="italic">research</tspan>')
  expect(svg).toContain('>second line &amp; review</text>')
  expect(svg).toContain('class="mindmap-icon fa fa-book"')
  expect(svg).toContain('>Notes</text>')
  expect(svg).toContain('>Proof</text>')
})

test('renders structured mind maps independently of imported diagrams and keeps malformed outlines visible', async () => {
  const deck = [
    '---', 'mermaid: false', '---', '', '# Planning', '',
    '~~~charts', 'type: mindmap', 'colorBy: branch', 'root:', '  id: project', '  label: Project',
    '  children:', '    - {id: design, label: Design, shape: square}', '    - Review', '~~~',
  ].join('\n')
  const html = await renderDeck(parseDeck(deck))
  expect(html).toContain('data-diagram-kind="mindmap"')
  expect(html).toContain('data-from="project" data-to="design"')
  expect(html).toContain('>Review</text>')
  expect(html).not.toContain('language-charts')
  expect(mermaid('mindmap\nRoot\nAnother', 'malformed')).toBeUndefined()
  expect(mermaid('mindmap\n root[Outline]\n   root[Duplicate]', 'duplicate')).toBeUndefined()
  const fallback = await renderDeck(parseDeck('# Invalid\n\n~~~mermaid\nmindmap\nRoot\nAnother\n~~~'))
  expect(fallback).toContain('language-mermaid')
})
