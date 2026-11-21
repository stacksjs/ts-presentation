import type { PathCommand } from './ir.ts'

const argumentCount: Readonly<Record<string, number>> = { M: 2, L: 2, H: 1, V: 1, Q: 4, C: 6 }
const tokenPattern = /[a-z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|[,\s]+|./gi

/** Normalize the line and Bézier commands emitted by the chart renderers. */
export function svgPath(source: string, scale: number, offsetX: number, offsetY: number): PathCommand[] | undefined {
  if (source.length > 32_000) return
  const tokens = (source.match(tokenPattern) ?? []).filter(token => !/^[,\s]+$/.test(token))
  const result: PathCommand[] = []
  let index = 0
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  let command = ''
  while (index < tokens.length) {
    if (result.length >= 1500) return
    if (/^[a-z]$/i.test(tokens[index])) command = tokens[index++]
    const kind = command.toUpperCase()
    const relative = command !== kind
    if (!result.length && kind !== 'M') return
    if (kind === 'Z') {
      result.push({ kind })
      x = startX
      y = startY
      command = ''
      continue
    }
    const count = argumentCount[kind]
    if (!count || index + count > tokens.length) return
    const points = tokens.slice(index, index + count).map(Number)
    if (points.some(value => !Number.isFinite(value))) return
    index += count
    if (kind === 'H') points[0] += relative ? x : 0
    else if (kind === 'V') points[0] += relative ? y : 0
    else if (relative) {
      for (let i = 0; i < points.length; i += 2) {
        points[i] += x
        points[i + 1] += y
      }
    }
    if (kind === 'H') points.push(y)
    if (kind === 'V') points.unshift(x)
    x = points[points.length - 2]
    y = points[points.length - 1]
    if (kind === 'M') {
      startX = x
      startY = y
      command = relative ? 'l' : 'L'
    }
    const mapped = points.map((point, i) => point * scale + (i % 2 ? offsetY : offsetX))
    if (mapped.some(point => !Number.isFinite(point) || Math.abs(point) > 1_000_000)) return
    const normalized = kind === 'H' || kind === 'V' ? 'L' : kind as 'M' | 'L' | 'C' | 'Q'
    result.push({ kind: normalized, points: mapped })
  }
  return result.length > 1 ? result : undefined
}
