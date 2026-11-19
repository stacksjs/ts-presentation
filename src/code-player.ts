import { clickSequence, parseClickPosition } from './clicks.ts'
import { lineMatches } from './equation-steps.ts'

interface TimedFrame {
  frame: HTMLElement
  ranges: string[]
  start: number
}
interface CodeStep { frame: TimedFrame, range: string }

export interface CodeReveal {
  element: HTMLElement
  frames: TimedFrame[]
  steps: CodeStep[]
  start: number
  step: number
  advance: number
  active?: TimedFrame
}

function ranges(element: HTMLElement): string[] {
  return element.dataset.codeRanges?.split('|').filter(Boolean) ?? []
}

export function codeReveal(element: HTMLElement, cursor: number): CodeReveal {
  const isMotion = element.dataset.codeMotion === 'true'
  const frames = [...element.querySelectorAll<HTMLElement>(':scope > .code-frame')].map((frame) => ({
    frame, ranges: ranges(frame), start: Number(frame.dataset.codeStart) || 1,
  }))
  const steps = frames.flatMap(frame => (frame.ranges.length ? frame.ranges : ['all']).map(range => ({ frame, range })))
  if (!isMotion && !ranges(element).length) return { element, frames, steps, start: 0, step: 0, advance: 0 }
  const at = parseClickPosition(element.dataset.codeAt ?? null) ?? { value: 1, relative: true }
  const span = clickSequence(at, cursor, Math.max(0, steps.length - 1))
  return { element, frames, steps, start: span.start - 1, step: span.step, advance: span.advance }
}

function tokenPositions(frame: HTMLElement): Map<string, DOMRect[]> {
  const positions = new Map<string, DOMRect[]>()
  for (const token of frame.querySelectorAll<HTMLElement>('code [class^="tok-"]')) {
    const key = `${token.className}\0${token.textContent}`
    const rects = positions.get(key) ?? []
    rects.push(token.getBoundingClientRect())
    positions.set(key, rects)
  }
  return positions
}

function animateTokens(frame: HTMLElement, positions: Map<string, DOMRect[]>, scale: number): void {
  const tokens = frame.querySelectorAll<HTMLElement>('code [class^="tok-"]')
  for (const token of tokens) {
    const before = positions.get(`${token.className}\0${token.textContent}`)?.shift()
    const after = token.getBoundingClientRect()
    const dx = before ? (before.left - after.left) / scale : 0
    const dy = before ? (before.top - after.top) / scale : 0
    if (dx || dy || !before) {
      token.animate([
        { translate: `${dx}px ${dy}px`, opacity: before ? 1 : 0 },
        { translate: '0 0', opacity: 1 },
      ], { duration: 240, easing: 'ease-out' })
    }
  }
}

export function showCode(reveal: CodeReveal, click: number, motion: boolean, scale = 1): void {
  if (!reveal.steps.length) return
  const offset = Math.max(0, click - reveal.start)
  const next = reveal.steps[Math.min(offset, reveal.steps.length - 1)]
  const final = next.frame.frame.dataset.codeFinally
  const wrapperFinal = reveal.element.dataset.codeFinally
  const end = wrapperFinal && wrapperFinal !== 'last' ? wrapperFinal : final
  const range = offset >= reveal.steps.length && end && end !== 'last' ? end : next.range
  const frameChanged = next.frame !== reveal.active
  if (frameChanged) {
    const positions = motion && range !== 'hide' && reveal.active && reveal.element.dataset.codeMotion === 'true'
      && !reveal.element.hasAttribute('data-code-hidden') && !matchMedia('(prefers-reduced-motion: reduce)').matches
      ? tokenPositions(reveal.active.frame) : undefined
    reveal.frames.forEach(frame => { frame.frame.hidden = frame !== next.frame })
    if (positions?.size) animateTokens(next.frame.frame, positions, scale)
    reveal.active = next.frame
  }
  reveal.element.toggleAttribute('data-code-hidden', range === 'hide')
  const highlight = range === 'hide' ? 'all' : range
  next.frame.frame.querySelectorAll('[data-code-line]').forEach((line, index) => {
    line.toggleAttribute('data-code-dim', !lineMatches(highlight, next.frame.start + index))
  })
}
