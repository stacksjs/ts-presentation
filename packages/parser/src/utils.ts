export * from './timesplit/index.ts'

const RE_ASPECT_RATIO_SEPARATOR = /[:/x|]/

/**
 * 1,3-5,8 => [1, 3, 4, 5, 8]
 */
export function parseRangeString(total: number, rangeStr?: string): number[] {
  if (!rangeStr || rangeStr === 'all' || rangeStr === '*')
    return Array.from({ length: total }, (_, index) => index + 1)

  if (rangeStr === 'none')
    return []

  const indexes: number[] = []
  for (const part of rangeStr.split(/[,;]/g)) {
    if (!part.includes('-')) {
      indexes.push(+part)
    }
    else {
      const [start, end] = part.split('-', 2)
      const last = end ? Math.min(Number(end), total) : total
      for (let index = Number(start); index <= last; index++)
        indexes.push(index)
    }
  }

  return [...new Set(indexes)].filter(i => i <= total).sort((a, b) => a - b)
}

/**
 * Accepts `16/9` `1:1` `3x4`
 */
export function parseAspectRatio(str: string | number): number {
  if (typeof str === 'number')
    return str
  if (!Number.isNaN(+str))
    return +str
  const [wStr = '', hStr = ''] = str.split(RE_ASPECT_RATIO_SEPARATOR)
  const w = Number.parseFloat(wStr.trim())
  const h = Number.parseFloat(hStr.trim())

  if (Number.isNaN(w) || Number.isNaN(h) || h === 0)
    throw new Error(`Invalid aspect ratio "${str}"`)

  return w / h
}
