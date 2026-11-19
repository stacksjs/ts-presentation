export interface ClickPosition { value: number, relative: boolean }
export interface ClickSpan { start: number, end: number, step: number, advance: number }

// Adapted from Slidev's click context. Absolute steps never move the relative cursor.
export function parseClickPosition(raw: string | null, fallback = '+1', expression = false): ClickPosition | undefined {
  let value = raw?.trim() || ''
  let quoted = false
  const literal = /^(['"])([^'"]*)\1$/.exec(value)
  if (literal) {
    value = literal[2].trim()
    quoted = true
  }
  if (value === 'false') return
  if (!value || value === 'true') return { value: Number(fallback), relative: true }
  if (!/^[+-]?\d+$/.test(value)) return
  const number = Number(value)
  if (!Number.isSafeInteger(number)) return
  const relative = /^[+-]/.test(value) && (quoted || !expression)
  return { value: relative ? number : Math.max(1, number), relative }
}

export function clickSequence(at: ClickPosition, offset: number, count = 1): ClickSpan {
  const start = at.relative ? offset + at.value : at.value
  return { start, end: Infinity, step: start + count - 1, advance: at.relative ? at.value + count - 1 : 0 }
}

export function clickSpan(raw: string | null, offset: number, fallback = '+1', expression = false): ClickSpan | undefined {
  const range = /^\[\s*('(?:[^']*)'|"(?:[^"]*)"|[+-]?\d+)\s*,\s*('(?:[^']*)'|"(?:[^"]*)"|[+-]?\d+)\s*\]$/.exec(raw?.trim() ?? '')
  if (!range) {
    const at = parseClickPosition(raw, fallback, expression)
    return at && clickSequence(at, offset)
  }
  const first = parseClickPosition(range[1], fallback, true)
  const last = parseClickPosition(range[2], fallback, true)
  if (!first || !last) return
  const start = first.relative ? offset + first.value : first.value
  const end = last.relative ? start + last.value : last.value
  return { start, end, step: end, advance: (first.relative ? first.value : 0) + (last.relative ? last.value : 0) }
}

export function isActive(span: Pick<ClickSpan, 'start' | 'end'>, click: number): boolean {
  return click >= span.start && click < span.end
}
