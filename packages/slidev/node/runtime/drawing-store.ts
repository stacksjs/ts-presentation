import { lstat, mkdir, readdir, realpath, rename, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { within } from './assets.ts'
import type { SlideCanvas } from '../../../types/src/canvas.ts'
import { drawingPath, drawingStyle, emptySketch, mergeSketches, validateSketch } from '../../../types/src/drawings.ts'
import type { DrawingSketch, SavedDrawing } from '../../../types/src/drawings.ts'

export interface DrawingStore {
  root: string
  directory: string
  slideCount: number
  canvas: SlideCanvas
}

const maxSavedDrawingBytes = 512_000
const metadata = /<metadata id="ts-presentation-drawing">([^<]*)<\/metadata>/
const legacyImage = /data-presentation-legacy="" href="(data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+)"/
const writes = new Map<string, Promise<unknown>>()

// Adapted from Slidev's drawings integration (MIT).
export function isSafeDrawingKey(directory: string, key: string): boolean {
  return /^\d+$/.test(key) && within(directory, join(directory, `${key}.svg`))
}

export function drawingMarkup(drawing: SavedDrawing, canvas: SlideCanvas): string {
  const { width, height } = canvas
  const { sketch, legacy } = drawing
  const base = legacy && !sketch.clear ? `<image data-presentation-legacy="" href="${legacy}" x="0" y="0" width="${width}" height="${height}"/>` : ''
  const paths = sketch.strokes.map(({ points }) => `<path d="${drawingPath(points)}"/>`).join('')
  return `${base}<g fill="none" stroke="${drawingStyle.color}" stroke-width="${drawingStyle.width}" stroke-linejoin="round" stroke-linecap="round">${paths}</g>`
}

export function drawingOverlay(drawing: SavedDrawing, canvas: SlideCanvas): string {
  const { width, height } = canvas
  return `<svg class="slide-ink" data-presentation-drawing="" aria-hidden="true" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${drawingMarkup(drawing, canvas)}</svg>`
}

async function readDrawing(path: string): Promise<SavedDrawing | undefined> {
  const info = await lstat(path).catch(() => undefined)
  if (!info?.isFile() || info.size > maxSavedDrawingBytes) return
  const text = await Bun.file(path).text()
  const managed = metadata.exec(text)
  if (managed) {
    const sketch = validateSketch(JSON.parse(managed[1]))
    if (!sketch) throw new Error(`Invalid saved presentation drawing: ${path}`)
    return { sketch, legacy: legacyImage.exec(text)?.[1] }
  }
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(text)) return
  // Imported drawings are images, so their XML never becomes live deck markup.
  return { sketch: emptySketch, legacy: `data:image/svg+xml;base64,${Buffer.from(text).toString('base64')}` }
}

export async function loadSavedDrawings(store: DrawingStore, observe: (path: string) => Promise<string | undefined>): Promise<Map<number, SavedDrawing>> {
  const { directory, root, slideCount } = store
  if (!within(root, directory)) throw new Error('Drawings must stay inside the deck directory')
  const observed = await observe(directory)
  if (!observed) return new Map()
  const location = await realpath(directory)
  if (!within(root, location)) throw new Error('Drawings must stay inside the deck directory')
  const entries = await readdir(location, { withFileTypes: true })
  const drawings = new Map<number, SavedDrawing>()
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile() || !entry.name.endsWith('.svg')) return
    const key = basename(entry.name, '.svg')
    const slide = Number(key)
    if (!isSafeDrawingKey(location, key) || String(slide) !== key || slide < 1 || slide > slideCount) return
    const path = join(location, entry.name)
    await observe(path)
    const drawing = await readDrawing(path)
    if (drawing) drawings.set(slide, drawing)
  }))
  return drawings
}

async function drawingDirectory(root: string, proposed: string): Promise<string> {
  if (!within(root, proposed)) throw new Error('Drawings must stay inside the deck directory')
  const found = await realpath(proposed).catch(() => undefined)
  if (found) {
    if (!within(root, found)) throw new Error('Drawings must stay inside the deck directory')
    return found
  }
  const parent = await drawingDirectory(root, dirname(proposed))
  const path = join(parent, basename(proposed))
  await mkdir(path, { recursive: true })
  const actual = await realpath(path)
  if (!within(root, actual)) throw new Error('Drawings must stay inside the deck directory')
  return actual
}

async function writeDrawing(store: DrawingStore, slide: number, patch: DrawingSketch): Promise<DrawingSketch> {
  const directory = await drawingDirectory(store.root, resolve(store.directory))
  const path = join(directory, `${slide}.svg`)
  const previous = writes.get(path)
  const running = (async () => {
    await previous?.catch(() => undefined)
    const current = await readDrawing(path)
    const sketch = mergeSketches(current?.sketch ?? emptySketch, patch)
    const drawing = { sketch, legacy: sketch.clear ? undefined : current?.legacy }
    const { width, height } = store.canvas
    const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n<metadata id="ts-presentation-drawing">${JSON.stringify(sketch)}</metadata>\n${drawingMarkup(drawing, store.canvas)}\n</svg>\n`
    if (Buffer.byteLength(svg) > maxSavedDrawingBytes) throw new Error('The drawing exceeds the file size limit')
    const temp = join(directory, `.${randomUUID()}.tmp`)
    try {
      await Bun.write(temp, svg)
      await rename(temp, path)
    }
    finally { await rm(temp, { force: true }) }
    return sketch
  })()
  writes.set(path, running)
  try { return await running }
  finally { if (writes.get(path) === running) writes.delete(path) }
}

export async function saveDrawing(store: DrawingStore | undefined, input: unknown): Promise<Response> {
  if (!store) return new Response('Drawing persistence is disabled.', { status: 404 })
  if (!input || typeof input !== 'object' || !('slide' in input) || !('patch' in input)) return new Response('Invalid drawing.', { status: 400 })
  const { slide, patch } = input
  const sketch = validateSketch(patch)
  if (typeof slide !== 'number' || !Number.isSafeInteger(slide) || slide < 1 || slide > store.slideCount || !sketch) {
    return new Response('Invalid drawing.', { status: 400 })
  }
  try {
    return Response.json(await writeDrawing(store, slide, sketch))
  }
  catch (error) {
    return new Response(error instanceof Error ? error.message : 'Could not save the drawing.', { status: 422 })
  }
}
