export interface SlideCanvas {
  width: number
  height: number
}

export const defaultCanvas: SlideCanvas = { width: 960, height: 540 }

export function resolveCanvas(headmatter?: Record<string, unknown>): SlideCanvas {
  const width = headmatter?.canvasWidth ?? defaultCanvas.width
  const ratio = headmatter?.aspectRatio ?? (16 / 9)
  const match = typeof ratio === 'string' ? /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(ratio.trim()) : null
  const aspect = match ? Number(match[1]) / Number(match[2]) : typeof ratio === 'number' ? ratio : NaN
  if (typeof width !== 'number' || !Number.isInteger(width) || width < 1 || width > 10000)
    throw new Error('canvasWidth must be an integer from 1 to 10000 pixels')
  const height = Math.round(width / aspect)
  if (!Number.isFinite(aspect) || !Number.isFinite(height) || height < 1 || height > 10000)
    throw new Error('aspectRatio must produce a height between 1 and 10000 pixels')
  return { width, height }
}
