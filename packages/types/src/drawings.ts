export interface DrawingOptions {
  enabled?: boolean | 'dev' | 'build'
  persist?: boolean | string
  presenterOnly?: boolean
  syncAll?: boolean
}

export interface DrawingSettings extends Required<DrawingOptions> {
  persist: false | string
}

export type DrawingPoint = [x: number, y: number]
export interface DrawingStroke { id: string, points: DrawingPoint[] }
export interface DrawingSketch { clear?: string, strokes: DrawingStroke[] }
export interface SavedDrawing { sketch: DrawingSketch, legacy?: string }
export interface DrawingClientConfig {
  enabled: boolean
  presenterOnly: boolean
  syncAll: boolean
  persist: boolean
  saved: Record<string, DrawingSketch>
}

export const maxStrokePoints = 1500
const maxStrokes = 160
const maxDrawingPoints = 6000
const stamp = /^\d{16}-[a-f0-9]{16}$/
export const emptySketch: DrawingSketch = { strokes: [] }

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

// Settings use the ordering and directory convention in Slidev's MIT parser.
export function resolveDrawings(headmatter?: Record<string, unknown>, theme?: DrawingOptions, filename?: string): DrawingSettings {
  const settings = { ...theme, ...record(record(headmatter?.config).drawings), ...record(headmatter?.drawings) }
  const path = filename ? `.slidev/drawings/${filename}` : '.slidev/drawings'
  return {
    enabled: settings.enabled === 'dev' || settings.enabled === 'build' ? settings.enabled : settings.enabled !== false,
    persist: typeof settings.persist === 'string' && settings.persist.trim() ? settings.persist : settings.persist === true ? path : false,
    presenterOnly: settings.presenterOnly === true,
    syncAll: settings.syncAll !== false,
  }
}

export function drawingEnabled(settings: DrawingSettings, mode: 'dev' | 'build' | 'export'): boolean {
  return settings.enabled === true || settings.enabled === mode
}

function validStamp(value: unknown): value is string {
  return typeof value === 'string' && stamp.test(value) && Number.isSafeInteger(Number(value.slice(0, 16)))
}

export function validateSketch(input: unknown): DrawingSketch | undefined {
  const { clear, strokes } = record(input)
  if ((clear !== undefined && !validStamp(clear)) || !Array.isArray(strokes) || strokes.length > maxStrokes) return
  const result: DrawingStroke[] = []
  let totalPoints = 0
  for (const value of strokes) {
    const { id, points } = record(value)
    if (!validStamp(id) || !Array.isArray(points) || !points.length || points.length > maxStrokePoints) return
    totalPoints += points.length
    if (totalPoints > maxDrawingPoints) return
    if (points.some(point => !Array.isArray(point) || point.length !== 2 || point.some(value => !Number.isFinite(value) || value < 0 || value > 32768))) return
    result.push({ id, points: points as DrawingPoint[] })
  }
  return { clear, strokes: result }
}

export function mergeSketches(current: DrawingSketch, update: DrawingSketch): DrawingSketch {
  const clear = !current.clear || (update.clear && update.clear > current.clear) ? update.clear : current.clear
  const strokes = new Map(current.strokes.map(stroke => [stroke.id, stroke]))
  for (const stroke of update.strokes) if (!strokes.has(stroke.id)) strokes.set(stroke.id, stroke)
  const ordered = [...strokes.values()].filter(stroke => !clear || stroke.id > clear).sort((a, b) => a.id < b.id ? -1 : 1)
  let points = 0
  let first = ordered.length
  while (first && ordered.length - first < maxStrokes) {
    points += ordered[first - 1].points.length
    if (points > maxDrawingPoints) break
    first--
  }
  return { clear, strokes: ordered.slice(first) }
}

export function drawingPath(points: DrawingPoint[]): string {
  const [first, ...rest] = points
  if (!first) return ''
  const start = first.join(' ')
  return `M${start} L${rest.length ? rest.map(point => point.join(' ')).join(' ') : start}`
}

export const drawingStyle = { color: '#ff7b70', width: 3 }
