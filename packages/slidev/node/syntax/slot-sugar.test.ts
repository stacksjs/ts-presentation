import { expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseDeck } from '../../../parser/src/deck.ts'
import { defineStxLayout, renderDeck } from '../runtime/index.ts'

it('slot markers', async () => {
  const deck = parseDeck('---\nlayout: two-cols\n---\n\nDefault\n\n::right::\n\nRight content')
  const result = await renderDeck(deck)

  expect(result).toContain('<div class="col-left"><p>Default</p>\n</div>')
  expect(result).toContain('<div class="col-right"><p>Right content</p>\n</div>')
})

it('not transform in code block', async () => {
  const deck = parseDeck('---\nlayout: two-cols\n---\n\n```\n::right::\n```')
  const result = await renderDeck(deck)

  expect(result).toContain('<pre><code>::right::\n</code></pre>')
  expect(result).toContain('<div class="col-right"></div>')
})

it('renders a theme’s STX layout with named slots and escaped metadata', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'presentation-stx-layout-'))
  try {
    const file = pathToFileURL(join(folder, 'layout.stx'))
    await Bun.write(file, '<section aria-label="{{ title }}">{!! content !!}<aside>{!! right !!}</aside></section>')
    const deck = parseDeck('---\nlayout: custom\ntitle: A < B\n---\n\nDefault\n\n::right::\n\nRight content')
    const theme = { name: 'custom', layouts: { custom: defineStxLayout(file) } }
    const result = await renderDeck(deck, { extensions: { theme, addons: [], styles: '', client: '', mounts: {} } })

    expect(result).toContain('<section aria-label="A &lt; B"><p>Default</p>')
    expect(result).toContain('<aside><p>Right content</p>')
  }
  finally {
    await rm(folder, { recursive: true })
  }
})
