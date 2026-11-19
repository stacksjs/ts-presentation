// Adapted from Slidev v53.1.0's drawings integration and parser configuration tests.
// See licenses/Slidev-MIT.txt.
import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drawingOverlay, isSafeDrawingKey, loadSavedDrawings, saveDrawing } from '../src/drawing-store.ts'
import type { DrawingStore } from '../src/drawing-store.ts'
import { drawingEnabled, emptySketch, mergeSketches, resolveDrawings, validateSketch } from '../src/drawings.ts'
import type { DrawingStroke } from '../src/drawings.ts'

const stroke = (number: number): DrawingStroke => ({ id: String(number).padStart(16, '0') + '-0000000000000000', points: [[10, 20], [30, 40]] })

describe('Slidev drawing settings', () => {
  test('applies the theme defaults', () => {
    expect(resolveDrawings({}, { presenterOnly: true })).toEqual({
      enabled: true, persist: false, presenterOnly: true, syncAll: true,
    })
  })

  test('applies the nested config headmatter', () => {
    expect(resolveDrawings({ config: { drawings: { syncAll: false } } }).syncAll).toBe(false)
  })

  test('lets direct headmatter override nested settings and theme defaults', () => {
    const settings = resolveDrawings({ drawings: { enabled: false }, config: { drawings: { enabled: 'dev' } } }, { enabled: true, presenterOnly: true })
    expect(settings.enabled).toBe(false)
    expect(settings.presenterOnly).toBe(true)
  })

  test('resolves persistence and switches editing by build mode', () => {
    const settings = resolveDrawings({ drawings: { enabled: 'dev', persist: true } }, undefined, 'research')
    expect(settings.persist).toBe('.slidev/drawings/research')
    expect(drawingEnabled(settings, 'dev')).toBe(true)
    expect(drawingEnabled(settings, 'build')).toBe(false)
    expect(drawingEnabled(settings, 'export')).toBe(false)
    expect(resolveDrawings({ drawings: { persist: 'annotations' } }).persist).toBe('annotations')
  })
})

describe('isSafeDrawingKey', () => {
  const directory = '/deck/.slidev/drawings'
  test('accepts numeric keys', () => expect(isSafeDrawingKey(directory, '3')).toBe(true))
  test('rejects traversal', () => expect(isSafeDrawingKey(directory, '../../evil')).toBe(false))
  test('rejects separators', () => expect(isSafeDrawingKey(directory, 'a/b')).toBe(false))
  test('rejects empty keys', () => expect(isSafeDrawingKey(directory, '')).toBe(false))
  test('rejects non-numeric keys', () => expect(isSafeDrawingKey(directory, 'abc')).toBe(false))
})

test('merges simultaneous strokes and deterministically drops stale ink after a clear', () => {
  const one = { strokes: [stroke(1)] }
  const two = { strokes: [stroke(2)] }
  const clear = { clear: stroke(3).id, strokes: [] }
  const remote = { strokes: [stroke(4)] }
  expect(mergeSketches(one, two)).toEqual(mergeSketches(two, one))
  expect(mergeSketches(one, one).strokes).toHaveLength(1)
  expect(mergeSketches(mergeSketches(one, clear), remote)).toEqual(mergeSketches(mergeSketches(one, remote), clear))
  expect(mergeSketches(mergeSketches(one, clear), remote).strokes).toEqual(remote.strokes)
  expect(validateSketch({ strokes: [{ ...stroke(1), points: [[NaN, 5]] }] })).toBeUndefined()
  expect(validateSketch({ strokes: [{ ...stroke(1), id: '<script>' }] })).toBeUndefined()
})

test('stores concurrent patches as SVG, preserves imported drawings, and reopens the result', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'presentation-test-drawings-')))
  try {
    const store: DrawingStore = { root, directory: join(root, '.slidev/drawings/slides'), slideCount: 2, canvas: { width: 960, height: 540 } }
    await mkdir(store.directory, { recursive: true })
    const path = join(store.directory, '1.svg')
    await Bun.write(path, '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><circle cx="10" cy="20" r="3"/></svg>')
    const observed: string[] = []
    const observe = async (path: string) => { observed.push(path); return 'exists' }
    const original = (await loadSavedDrawings(store, observe)).get(1)!
    expect(original.sketch).toEqual(emptySketch)
    expect(original.legacy).toStartWith('data:image/svg+xml;base64,')
    expect(observed).toEqual([store.directory, path])

    const results = await Promise.all([1, 2, 3].map(number => saveDrawing(store, { slide: 1, patch: { strokes: [stroke(number)] } })))
    expect(results.map(result => result.status)).toEqual([200, 200, 200])
    const imported = (await loadSavedDrawings(store, observe)).get(1)!
    expect(imported.sketch.strokes).toEqual([stroke(1), stroke(2), stroke(3)])
    expect(imported.legacy).toBe(original.legacy)
    expect(drawingOverlay(imported, store.canvas)).toContain('<path d="M10 20 L30 40"/>')

    const afterClear = await saveDrawing(store, { slide: 1, patch: { clear: stroke(4).id, strokes: [] } })
    expect(afterClear.ok).toBe(true)
    expect((await loadSavedDrawings(store, observe)).get(1)).toEqual({ sketch: { clear: stroke(4).id, strokes: [] } })
    expect((await saveDrawing(store, { slide: 3, patch: { strokes: [] } })).status).toBe(400)
    expect((await saveDrawing(store, { slide: '../other', patch: { strokes: [] } })).status).toBe(400)
    expect((await saveDrawing(undefined, { slide: 1, patch: { strokes: [] } })).status).toBe(404)
  }
  finally { await rm(root, { recursive: true, force: true }) }
})

test('rejects a configured drawing directory connected to an external directory', async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'presentation-test-drawings-link-')))
  try {
    const root = join(parent, 'deck')
    const outside = join(parent, 'outside')
    await mkdir(root)
    await mkdir(outside)
    await symlink(outside, join(root, '.slidev'))
    const store: DrawingStore = { root, directory: join(root, '.slidev/drawings'), slideCount: 1, canvas: { width: 960, height: 540 } }
    const response = await saveDrawing(store, { slide: 1, patch: { strokes: [stroke(1)] } })
    expect(response.status).toBe(422)
    expect(await Bun.file(join(outside, 'drawings/1.svg')).exists()).toBe(false)
  }
  finally { await rm(parent, { recursive: true, force: true }) }
})
