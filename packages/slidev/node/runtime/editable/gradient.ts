import { isVisible, parseColor, withOpacity } from './color.ts'
import type { LinearGradient, RawStyle, Rect, Rgba } from './ir.ts'

const number = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?'
const angle = new RegExp(`^(${number})(deg|grad|rad|turn)$`)
const length = new RegExp(`^(${number})(%|px)$`)
const angleUnits = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 }
const side = { top: -1, bottom: 1, left: -1, right: 1 }
type Stop = { position: number, color: Rgba }
type PendingStop = { position: number | undefined, color: Rgba }

function gradientArguments(body: string): string[] {
  let depth = 0
  let start = 0
  const items: string[] = []
  for (let index = 0; index < body.length; index++) {
    if (body[index] === '(') depth++
    else if (body[index] === ')') depth--
    else if (depth === 0 && body[index] === ',') {
      items.push(body.slice(start, index).trim())
      start = index + 1
    }
  }
  items.push(body.slice(start).trim())
  return items
}

function direction(value: string, rect: Rect): number | undefined {
  if (!value) return 90
  if (value === '0') return -90
  const turn = angle.exec(value)
  if (turn) return Number(turn[1]) * angleUnits[turn[2] as keyof typeof angleUnits] - 90
  const words = /^to (top|bottom|left|right)(?: (top|bottom|left|right))?$/.exec(value)
  if (!words) return
  const directions = words.slice(1) as (keyof typeof side | undefined)[]
  const horizontal = directions.find(word => word === 'left' || word === 'right')
  const vertical = directions.find(word => word === 'top' || word === 'bottom')
  if (directions[1] && (!horizontal || !vertical)) return
  return Math.atan2(vertical ? side[vertical] * rect.w : 0, horizontal ? side[horizontal] * rect.h : 0) * 180 / Math.PI
}

function readStops(items: readonly string[], size: number, scale: number, srgb: boolean): PendingStop[] | undefined {
  const stops: PendingStop[] = []
  for (const item of items) {
    const match = /^(rgba?\([^)]*\)|transparent|color\(srgb [^)]*\))(?:\s+(.*))?$/.exec(item)
    if (!match || (match[1].startsWith('color(') && !srgb)) return
    const color = parseColor(match[1])
    if (!color || !Object.values(color).every(Number.isFinite)) return
    if (!match[2]) {
      stops.push({ color, position: undefined })
      continue
    }
    const positions = match[2].split(/\s+/)
    if (positions.length > 2) return
    for (const input of positions) {
      const found = length.exec(input)
      const position = found ? Number(found[1]) * (found[2] === '%' ? 0.01 : scale / size) : input === '0' ? 0 : NaN
      if (!Number.isFinite(position)) return
      stops.push({ color, position })
    }
  }
  return stops
}

// Apply CSS stop fixup before restricting the stops to the visible interval.
function placeStops(stops: PendingStop[]): Stop[] {
  stops[0].position ??= 0
  stops.at(-1)!.position ??= 1
  let previous = 0
  for (let index = 1; index < stops.length; index++) {
    const next = stops[index].position
    if (next === undefined) continue
    const first = stops[previous].position!
    const last = Math.max(first, next)
    for (let between = previous + 1; between < index; between++)
      stops[between].position = first + (last - first) * (between - previous) / (index - previous)
    stops[index].position = last
    previous = index
  }
  return stops as Stop[]
}

function clippedStops(stops: Stop[]): Stop[] {
  function at(position: number): Stop {
    const next = stops.findIndex(stop => stop.position > position)
    if (next <= 0) return { position, color: (next < 0 ? stops.at(-1)! : stops[0]).color }
    const left = stops[next - 1]
    const right = stops[next]
    const fraction = (position - left.position) / (right.position - left.position)
    const channel = (key: keyof Rgba) => left.color[key] + fraction * (right.color[key] - left.color[key])
    return { position, color: { r: channel('r'), g: channel('g'), b: channel('b'), a: channel('a') } }
  }
  const visible = stops.filter(stop => stop.position >= 0 && stop.position <= 1)
  if (visible[0]?.position !== 0) visible.unshift(at(0))
  if (visible.at(-1)?.position !== 1) visible.push(at(1))
  return visible
}

export function linearBackground(style: RawStyle, rect: Rect, opacity?: number, scale = 1): LinearGradient | undefined {
  const image = /^linear-gradient\((.+)\)$/.exec(style.backgroundImage)?.[1]
  if (!image || rect.w <= 0 || rect.h <= 0) return
  if (style.backgroundOrigin === 'content-box' || style.backgroundAttachment && style.backgroundAttachment !== 'scroll') return
  if (style.backgroundBlendMode && style.backgroundBlendMode !== 'normal') return
  if (style.backgroundSize && !/^(?:auto(?: auto)?|100% 100%|cover|contain)$/.test(style.backgroundSize)) return
  if (style.backgroundPosition && !/^(?:[+-]?[\d.]+%|0px) (?:[+-]?[\d.]+%|0px)$/.test(style.backgroundPosition)) return
  if (style.webkitBackgroundClip && !['border-box', 'padding-box'].includes(style.webkitBackgroundClip)) return
  if ([style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].some(value => Number.parseFloat(value) > 0)) return
  if ((style.filter && style.filter !== 'none') || (style.backdropFilter && style.backdropFilter !== 'none') ||
    (style.clipPath && style.clipPath !== 'none') || (style.transform && style.transform !== 'none') ||
    (style.mixBlendMode && style.mixBlendMode !== 'normal')) return

  const items = gradientArguments(image)
  if (items.length < 2 || items.length > 64) return
  const head = /^(?:rgba?\(|color\(|transparent(?:\s|$))/.test(items[0]) ? '' : items.shift()!
  if (items.length < 2) return
  const srgb = /(?:^| )in srgb(?: |$)/.test(head)
  const degrees = direction(head.replace(/(?:^| )in srgb(?= |$)/, '').trim(), rect)
  if (degrees === undefined || !Number.isFinite(degrees)) return
  const radians = degrees * Math.PI / 180
  const size = Math.abs(Math.cos(radians) * rect.w) + Math.abs(Math.sin(radians) * rect.h)
  const stops = readStops(items, size, scale, srgb)
  if (!stops || stops.length > 64) return
  if (stops.some(stop => stop.color.a < 1) && style.backgroundColor) {
    const backdrop = parseColor(style.backgroundColor)
    if (!backdrop || (isVisible(backdrop) && backdrop.a < 1)) return
    if (backdrop.a === 1) {
      // Compositing premultiplied sRGB over an opaque color is linear, so
      // each composited stop can be represented as an opaque DrawingML color.
      for (const stop of stops) {
        const { r, g, b, a } = stop.color
        stop.color = { r: r * a + backdrop.r * (1 - a), g: g * a + backdrop.g * (1 - a), b: b * a + backdrop.b * (1 - a), a: 1 }
      }
    }
  }
  const alpha = stops[0].color.a
  if (stops.some(stop => stop.color.a !== alpha)) {
    // A fade of one color interpolates the same way in premultiplied CSS and
    // DrawingML once the invisible stops carry the color of the visible ones.
    const color = stops.find(stop => stop.color.a > 0)!.color
    if (stops.some(({ color: stop }) => stop.a > 0 && (stop.r !== color.r || stop.g !== color.g || stop.b !== color.b))) return
    for (const stop of stops) stop.color = { ...color, a: stop.color.a }
  }
  return {
    angle: ((degrees % 360) + 360) % 360,
    stops: clippedStops(placeStops(stops)).map(stop => ({ ...stop, color: withOpacity(stop.color, opacity)! })),
  }
}
