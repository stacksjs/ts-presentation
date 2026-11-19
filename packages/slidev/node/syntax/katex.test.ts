import { expect, it } from 'bun:test'
import { parseDeck, renderDeck } from '../runtime/index.ts'

it('renders inline math', async () => {
  const html = await renderDeck(parseDeck('This is $x^2$ inline'))
  expect(html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML">')
  expect(html).toContain('<msup><mi>x</mi><mn>2</mn></msup>')
})

it('renders block math with line ranges', async () => {
  const html = await renderDeck(parseDeck('$$ {2,3|4}\nx^2\n$$'))
  expect(html).toContain('data-equation-steps="2,3|4"')
  expect(html).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">')
})

it('preserves math delimiters inside fenced code', async () => {
  const html = await renderDeck(parseDeck('```\n$$x^2$$\n```'))
  expect(html).toContain('<pre><code>$$x^2$$\n</code></pre>')
  expect(html).not.toContain('<math')
})
