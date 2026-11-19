import { describe, expect, test } from 'bun:test'
import { within } from '../src/assets.ts'
import { parseAspectRatio, resolveCanvas } from '../src/canvas.ts'
import { equationReveal, showEquation } from '../src/equation-steps.ts'
import { slideRange } from '../src/selection.ts'

// Range and aspect-ratio cases adapted from Slidev's test/utils.test.ts (MIT).
test('selects slides using Slidev ranges', () => {
  expect(slideRange(5)).toEqual([1, 2, 3, 4, 5])
  expect(slideRange(5, 'all')).toEqual([1, 2, 3, 4, 5])
  expect(slideRange(2, '*')).toEqual([1, 2])
  expect(slideRange(5, '1')).toEqual([1])
  expect(slideRange(10, '1,2-3,5')).toEqual([1, 2, 3, 5])
  expect(slideRange(10, '1;2-3;5')).toEqual([1, 2, 3, 5])
  expect(slideRange(10, '6-')).toEqual([6, 7, 8, 9, 10])
  expect(slideRange(5, 'none')).toEqual([])
  expect(slideRange(5, '5;1-2;1')).toEqual([5, 1, 2])
  expect(() => slideRange(5, '6-')).toThrow(/outside/)
})

test('accepts Slidev aspect ratios through canvas resolution', () => {
  expect(parseAspectRatio(1)).toBe(1)
  expect(parseAspectRatio('16/9')).toBe(16 / 9)
  expect(parseAspectRatio('16 / 9 ')).toBe(16 / 9)
  expect(parseAspectRatio('3:4')).toBe(3 / 4)
  expect(parseAspectRatio('1x1')).toBe(1)
  expect(parseAspectRatio('1')).toBe(1)
  expect(() => parseAspectRatio('hello')).toThrow()
  expect(() => parseAspectRatio('1/0')).toThrow()
  expect(resolveCanvas({ canvasWidth: 900, aspectRatio: '3:4' })).toEqual({ width: 900, height: 1200 })
})

// Whole path-containment suite adapted from Slidev's packages/parser/src/utils.test.ts (MIT).
describe('deck and asset roots', () => {
  test('accepts a path nested inside a root', () => {
    expect(within('/a', '/a/b/c')).toBe(true)
  })
  test('accepts a path that equals the root itself', () => {
    expect(within('/a', '/a')).toBe(true)
  })
  test('rejects a path outside every root', () => {
    expect(within('/a', '/x')).toBe(false)
  })
  test('rejects a path that escapes through a parent segment', () => {
    expect(within('/a', '/a/../x')).toBe(false)
  })
})

// Adapted from packages/client/builtin/KaTexBlockWrapper.test.ts. Native
// MathML has one row element per line, even when a cell nests a matrix.
test('ignores nested MathML tables when mapping equation highlight lines', () => {
  function node(localName: string, children: object[] = []) {
    const attributes = new Map<string, boolean>()
    return { localName, children, attributes, toggleAttribute: (attribute: string, value: boolean) => attributes.set(attribute, value) }
  }
  const leaf = node('mtr')
  const nested = node('mtable', [leaf])
  const first = node('mtr', [node('mtd'), node('mtd', [nested])])
  const second = node('mtr', [node('mtd'), node('mtd')])
  const table = node('mtable', [first, second])
  const block = {
    dataset: { equationSteps: '1|2', equationAt: '+1', equationFirst: '1' },
    querySelector: () => table,
    ...node('div'),
  }
  const reveal = equationReveal(block as unknown as HTMLElement, 0)
  expect(reveal.lines).toEqual([first, second] as unknown as Element[])
  showEquation(reveal, 1)
  expect(first.attributes.get('data-equation-dim')).toBe(true)
  expect(second.attributes.get('data-equation-dim')).toBe(false)
  expect(leaf.attributes.size).toBe(0)
})
