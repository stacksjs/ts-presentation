import { expect, it } from 'bun:test'
import { parseDeck, renderDeck } from '../runtime/index.ts'

it('links to slides and opens external destinations in a separate tab', async () => {
  const html = await renderDeck(parseDeck('[slide 1](#1)\n\n[external](https://example.com)'))
  expect(html).toContain('<a href="#slide-1" data-slide-link="1">slide 1</a>')
  expect(html).toContain('href="https://example.com" target="_blank"')
})
