import { clickSequence, parseClickPosition } from './clicks.ts'
import { readFenceOptions } from './fence-options.ts'

export interface EquationOptions {
  ranges: string[]
  at: string
  startLine: number
  finally: string
}

function validRange(value: string): boolean {
  return /^(?:all|none|hide|\*|\d+(?:-\d*)?(?:[,;]\d+(?:-\d*)?)*)$/.test(value)
}

export function parseEquationOptions(info: string): EquationOptions | undefined {
  // Range splitting follows Slidev's node/syntax/utils, MIT.
  const [, rangeList, props] = /^\{([\w*,;|-]+)\}\s*(\{.*\})?$/.exec(info.trim()) ?? []
  if (!rangeList) return
  const ranges = rangeList.split('|')
  if (ranges.length > 100 || ranges.some(range => !validRange(range))) return
  const options = props ? readFenceOptions(props) : {}
  if (!options) return
  const at = String(options.at ?? '+1')
  const startLine = Number(options.startLine ?? 1)
  const last = String(options.finally ?? 'last')
  if (!/^[+-]?\d{1,3}$/.test(at) || !Number.isInteger(startLine) || startLine < 1 || startLine > 999 || (last !== 'last' && !validRange(last))) return
  return { ranges, at, startLine, finally: last }
}

/** Match the 1-based, open-ended ranges used by Slidev. */
export function lineMatches(range: string, line: number): boolean {
  if (range === 'all' || range === '*') return true
  return range.split(/[,;]/).some((part) => {
    const [, start, end] = /^(\d+)(?:-(\d*))?$/.exec(part) ?? []
    return start !== undefined && line >= Number(start) && line <= (end === '' ? Infinity : Number(end ?? start))
  })
}

export interface EquationReveal {
  element: HTMLElement
  lines: Element[]
  ranges: string[]
  final: string
  firstLine: number
  start: number
  step: number
  advance: number
}

export function equationReveal(element: HTMLElement, cursor: number): EquationReveal {
  const ranges = (element.dataset.equationSteps ?? '').split('|')
  const at = parseClickPosition(element.dataset.equationAt ?? null) ?? { value: 1, relative: true }
  const span = clickSequence(at, cursor, ranges.length - 1)
  // Use the outer alignment table. Its cells can contain nested matrices.
  const table = element.querySelector('mtable[data-equation-lines]')
  const lines = table ? [...table.children].filter(child => child.localName === 'mtr') : [element.querySelector('math') ?? element]
  const final = element.dataset.equationFinally
  return { element, lines, ranges, final: !final || final === 'last' ? ranges.at(-1) ?? 'all' : final, firstLine: Number(element.dataset.equationFirst) || 1, start: span.start - 1, step: span.step, advance: span.advance }
}

export function showEquation(reveal: EquationReveal, click: number): void {
  const index = Math.max(0, click - reveal.start)
  const range = reveal.ranges[index] ?? reveal.final
  reveal.element.toggleAttribute('data-equation-hidden', range === 'hide')
  const highlight = range === 'hide' ? reveal.ranges[index + 1] ?? reveal.final : range
  reveal.lines.forEach((line, offset) => line.toggleAttribute('data-equation-dim', !lineMatches(highlight, reveal.firstLine + offset)))
}
