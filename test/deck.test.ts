import { describe, expect, test } from 'bun:test'
import { parseDeck, renderDeck } from '../src/index.ts'

const demo = [
  '---', 'title: Test deck', 'class: custom', '---',
  '', '# First', '',
  '```ts', 'const text = "<strong>"', '---', '```', '',
  '<!--', 'Talk about the example.', '---', 'Then move on.', '-->', '',
  '---', 'layout: center', '---', '',
  '# Second', '', '<div>Inline HTML works.</div>', '',
  '---', '', '# Third', '',
].join('\r\n')

describe('ts-presentation', () => {
  test('reads headmatter, slide frontmatter, notes and fenced separators', () => {
    const deck = parseDeck(demo)
    expect(deck.title).toBe('Test deck')
    expect(deck.slides.map(slide => slide.title)).toEqual(['Test deck', 'Second', 'Third'])
    expect(deck.slides[0].className).toBe('custom')
    expect(deck.slides[0].content).toContain('---')
    expect(deck.slides[0].content).not.toContain('Talk about')
    expect(deck.slides[0].notes).toContain('Then move on.')
    expect(deck.slides[1].layout).toBe('center')
  })

  test('highlights known code and preserves trusted authored HTML', async () => {
    const rendered = await renderDeck(parseDeck(demo))
    expect(rendered).toContain('tok-keyword')
    expect(rendered).toContain('&lt;strong&gt;')
    expect(rendered).toContain('<div>Inline HTML works.</div>')
    expect(rendered).toContain('<section hidden>')
    expect(rendered).not.toContain('<!--')
  })

  test('loads the public example deck', async () => {
    const deck = parseDeck(await Bun.file('examples/demo/slides.md').text())
    expect(deck.slides).toHaveLength(7)
    expect(deck.slides.every(slide => slide.notes.length > 0)).toBe(true)
    const html = await renderDeck(deck)
    expect(html).toContain('data-route="reveal"')
    expect(html).toContain('data-transition="fade"')
    expect(html).toContain('data-note-step="2"')
    expect(html).toContain('class="slide-diagram"')
  })
})
