import { expect, it } from 'bun:test'
import { parseDeck, renderDeck } from '../runtime/index.ts'

it.each(['', ' scoped'])('scopes slide styles with attributes %j', async (attribute) => {
  const html = await renderDeck(parseDeck(`<style${attribute}>\n.red { color: red; }\n</style>\n\n# Example`))
  expect(html).toContain('<style data-slide-style="1">')
  expect(html).toContain('.red:where(#slide-1, #slide-1 *) { color: red; }')
})

it('preserves style tags inside fenced code', async () => {
  const html = await renderDeck(parseDeck('```\n<style>\n.red { color: red; }\n</style>\n```'))
  expect(html).toContain('&lt;style&gt;\n.red { color: red; }\n&lt;/style&gt;')
  expect(html).not.toContain('data-slide-style')
})
