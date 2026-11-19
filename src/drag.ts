// Position formats follow Slidev's MIT-licensed VDrag components.
export type DragPosition = [left: number, top: number, width: number, height: number | null, angle: number]
export type DragKind = 'box' | 'arrow'
const dragName = /^[a-z0-9_-][a-z0-9_.-]{0,79}$/i

export function dragKey(raw: string): string | undefined {
  const value = raw.trim().replace(/^(["'])(.*)\1$/, '$2')
  return dragName.test(value) ? value : undefined
}

function finite(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))) return
  const number = Number(value)
  if (Number.isFinite(number) && Math.abs(number) <= 100_000)
    return Math.round(number * 10) / 10 || 0
}

export function parseDragPosition(value: unknown, kind: DragKind): DragPosition | undefined {
  const parts = Array.isArray(value) ? value : typeof value === 'string'
    ? value.trim().replace(/^(['"])(.*)\1$/, '$2').replace(/^\[([\s\S]*)\]$/, '$1').split(',').map(entry => entry.trim())
    : []
  if (parts.length < 4 || parts.length > 5) return
  const [left, top, width] = parts
  const x = finite(left)
  const y = finite(top)
  const w = finite(width)
  const autoHeight = parts[3] === null || parts[3] === 'null' || parts[3] === '_' || parts[3] === 'NaN'
  const h = kind === 'box' && autoHeight ? null : finite(parts[3])
  const angle = kind === 'arrow' || parts.length < 5 ? 0 : finite(parts[4])
  if (x === undefined || y === undefined || w === undefined || h === undefined || angle === undefined
    || (kind === 'box' && (w < 1 || (h !== null && h < 1)))) return
  return [x, y, w, h, angle]
}

export function defaultDragPosition(kind: DragKind): DragPosition {
  return kind === 'arrow' ? [100, 100, 300, 300, 0] : [64, 130, 220, null, 0]
}

export function dragPositionText(position: DragPosition, kind: DragKind, directive: boolean = false): string {
  const [left, top, width, height, angle] = position
  const numbers = [left, top, width, height ?? (directive ? 'NaN' : '_')]
  if (kind === 'box' && angle) numbers.push(angle)
  const values = numbers.join(', ')
  return directive ? `[${values}]` : values
}

export function arrowGeometry(position: DragPosition, padding = 0): { left: number, top: number, width: number, height: number, x1: number, y1: number, x2: number, y2: number } {
  const [x, y, dx, dy] = position
  const height = dy ?? 0
  return {
    left: x + Math.min(dx, 0) - padding, top: y + Math.min(height, 0) - padding,
    width: Math.max(1, Math.abs(dx) + padding * 2), height: Math.max(1, Math.abs(height) + padding * 2),
    x1: Math.max(0, -dx) + padding, y1: Math.max(0, -height) + padding,
    x2: Math.max(0, dx) + padding, y2: Math.max(0, height) + padding,
  }
}

export function dragStyle(position: DragPosition, kind: DragKind, padding = 0): string {
  const [left, top, width, height, angle] = position
  if (kind === 'arrow') {
    const box = arrowGeometry(position, padding)
    return `position:absolute;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;overflow:visible`
  }
  return `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height === null ? 'auto' : `${height}px`}${angle ? `;rotate:${angle}deg` : ''}`
}
