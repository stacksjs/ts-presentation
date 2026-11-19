import { expect, test } from 'bun:test'
import { clickSequence, clickSpan, isActive, parseClickPosition } from '../src/clicks.ts'

test('keeps absolute positions out of the relative offset', () => {
  expect(clickSpan('4', 1, '+1', true)).toEqual({ start: 4, end: Infinity, step: 4, advance: 0 })
  expect(clickSpan("'+2'", 1, '+1', true)).toEqual({ start: 3, end: Infinity, step: 3, advance: 2 })
  expect(clickSpan('+2', 1, '+1', true)?.start).toBe(2)
  expect(clickSpan(null, 1, '+0')?.start).toBe(1)
  expect(clickSpan("'-1'", 3, '+1', true)?.advance).toBe(-1)
})

test('supports mixed relative and absolute enter and exclusive exit positions', () => {
  const span = clickSpan("['+1', '+2']", 2, '+1', true)!
  expect(span).toEqual({ start: 3, end: 5, step: 5, advance: 3 })
  expect([2, 3, 4, 5].map(click => isActive(span, click))).toEqual([false, true, true, false])
  expect(clickSpan("[2, '+3']", 6, '+1', true)).toEqual({ start: 2, end: 5, step: 5, advance: 3 })
  expect(clickSpan("['+1', 7]", 5, '+1', true)).toEqual({ start: 6, end: 7, step: 7, advance: 1 })
  expect(clickSpan('false', 1)).toBeUndefined()
  expect(clickSpan('[2, 3, 4]', 1)).toBeUndefined()
  expect(clickSpan('window.show()', 1)).toBeUndefined()
})

test('uses the same click sequence for single and multistep components', () => {
  expect(clickSequence(parseClickPosition('7')!, 2, 3)).toEqual({ start: 7, end: Infinity, step: 9, advance: 0 })
  expect(clickSequence(parseClickPosition('+2')!, 2, 3)).toEqual({ start: 4, end: Infinity, step: 6, advance: 4 })
})
