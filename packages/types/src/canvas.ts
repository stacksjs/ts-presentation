export interface SlideCanvas {
  width: number
  height: number
}

export const defaultCanvas: SlideCanvas = { width: 960, height: 540 }

/** Accept the numeric and composite aspect ratios used by Slidev. */
export function parseAspectRatio(value: unknown): number {
  const formatted = typeof value === 'string' ? value.trim() : ''
  const match = /^(\d+(?:\.\d+)?)\s*[:/x|]\s*(\d+(?:\.\d+)?)$/i.exec(formatted)
  const number = match ? Number(match[1]) / Number(match[2])
    : typeof value === 'number' ? value
      : /^\d+(?:\.\d+)?$/.test(formatted) ? Number(formatted) : NaN
  if (!Number.isFinite(number) || number <= 0) throw new Error(`Invalid aspectRatio: ${String(value)}`)
  return number
}

export function resolveCanvas(headmatter?: Record<string, unknown>): SlideCanvas {
  const width = headmatter?.canvasWidth ?? defaultCanvas.width
  const aspect = parseAspectRatio(headmatter?.aspectRatio ?? (16 / 9))
  if (typeof width !== 'number' || !Number.isInteger(width) || width < 1 || width > 10000)
    throw new Error('canvasWidth must be an integer from 1 to 10000 pixels')
  const height = Math.round(width / aspect)
  if (!Number.isFinite(aspect) || !Number.isFinite(height) || height < 1 || height > 10000)
    throw new Error('aspectRatio must produce a height between 1 and 10000 pixels')
  return { width, height }
}
