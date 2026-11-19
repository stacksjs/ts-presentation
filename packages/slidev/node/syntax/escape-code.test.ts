import { expect, it } from 'bun:test'
import { parseDeck } from '../../../parser/src/deck.ts'
import { renderDeck } from '../runtime/index.ts'

it('escape inline code', async () => {
  const result = await renderDeck(parseDeck('This is `inline {{code}}` test'))

  expect(result).toContain('<p>This is <code>inline {{code}}</code> test</p>')
})
