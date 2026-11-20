import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { within } from './assets.ts'
import { findChrome } from './chrome.ts'
import type { ExportFlags } from './export-options.ts'
import { markdownImageDirectory, resolveExportSettings, resolveNotesExportSettings } from './export-options.ts'
import { resolveDeckEntry } from './extension-resolver.ts'
import type { CompiledDeck, CompileOptions } from './loader.ts'
import { createDeckCompiler } from './loader.ts'
import type { PowerPointFrame } from './powerpoint.ts'
import { bundlePlayer, writeStaticSite } from './site-output.ts'

type ExportSettings = ReturnType<typeof resolveExportSettings> | ReturnType<typeof resolveNotesExportSettings>

interface DeckExport {
  deck: CompiledDeck
  directory: string
  settings: ExportSettings
}

async function canonicalOutput(path: string): Promise<string> {
  try { return await realpath(path) }
  catch (error) {
    const parent = dirname(path)
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || parent === path) throw error
    return join(await canonicalOutput(parent), basename(path))
  }
}

async function checkExportOutputs(jobs: readonly DeckExport[], sources: Set<string>, directory?: string): Promise<void> {
  const root = directory === undefined ? undefined : await canonicalOutput(directory)
  const paths = jobs.flatMap(({ settings }) =>
    settings.format === 'md' ? [settings.output, markdownImageDirectory(settings.output)] : [settings.output])
  const reserved: string[] = []
  for (const path of paths) {
    const output = await canonicalOutput(path)
    if (sources.has(output)) throw new Error(`Export output would overwrite the deck source: ${path}`)
    if (root !== undefined && (output === root || !within(root, output)))
      throw new Error(`Export output must be inside the batch output directory: ${path}`)
    if (reserved.some(target => within(target, output) || within(output, target)))
      throw new Error(`Export output conflicts with another output: ${path}`)
    reserved.push(output)
  }
}

export async function exportDecks(entries: readonly string[], flags: ExportFlags, options: CompileOptions, notes: boolean): Promise<void> {
  const sources = new Set(await Promise.all(entries.map(resolveDeckEntry)))
  if (sources.size !== entries.length) throw new Error('Each export entry must refer to a different deck')
  const batch = sources.size > 1
  const { out, output, ...sharedFlags } = flags
  const destination = out ?? output
  const root = batch && destination !== undefined ? resolve(destination) : undefined
  const resolveSettings = notes ? resolveNotesExportSettings : resolveExportSettings
  const jobs: DeckExport[] = []
  for (const source of sources) {
    const directory = dirname(source)
    const deck = await createDeckCompiler(source, { ...options, mode: 'export', base: '/' })()
    const settings = resolveSettings(source, deck.headmatter, batch ? sharedFlags : flags, batch ? root ?? directory : undefined)
    jobs.push({ deck, directory, settings })
  }
  await checkExportOutputs(jobs, sources, root)

  const executables = await Promise.all(jobs.map(async ({ settings }) => {
    const executable = await findChrome(settings.executablePath)
    if (!executable) throw new Error('Chrome or Chromium is required for export. Pass --executable-path or set CHROME_BIN.')
    return executable
  }))
  const javascript = await bundlePlayer()
  for (const [index, job] of jobs.entries()) {
    await writeDeckExport(job, executables[index], javascript)
    console.log(job.settings.output)
  }
}

async function writeDeckExport(job: DeckExport, executable: string, javascript: string): Promise<void> {
  const { deck, directory, settings } = job
  const { format, output, range, timeout, wait, waitUntil } = settings
  const root = await mkdtemp(join(tmpdir(), 'ts-presentation-'))
  try {
    await mkdir(dirname(output), { recursive: true })
    await writeStaticSite(root, deck, { directory, javascript, base: '/' })
    const browser = { root, executable, canvas: deck.canvas, range, timeout, wait, waitUntil }
    if (format === 'notes') {
      const { captureNotesPdf } = await import('./capture.ts')
      await Bun.write(output, await captureNotesPdf({ ...browser, scale: 1 }))
      return
    }
    const { scale, withClicks, colorScheme, omitBackground } = settings
    const capture = { ...browser, scale, withClicks, colorScheme, omitBackground }
    if (format === 'md') {
      const { exportMarkdown } = await import('./markdown-export.ts')
      await exportMarkdown(output, deck.notesMarkdown, capture)
      return
    }
    if (format === 'pdf') {
      const { capturePdf } = await import('./capture.ts')
      await Bun.write(output, await capturePdf({ ...capture, withToc: settings.withToc }))
      return
    }
    const { captureFrames } = await import('./capture.ts')
    if (format === 'png') {
      await mkdir(output, { recursive: true })
      await captureFrames(capture, async (frame, index, total) => {
        if (!frame.image) throw new Error('Missing PNG frame')
        const suffix = String(index + 1).padStart(String(total).length, '0')
        await Bun.write(join(output, `slide-${suffix}.png`), frame.image)
      })
      return
    }
    const frames: PowerPointFrame[] = []
    await captureFrames({ ...capture, editable: format === 'pptx-editable' }, async (frame) => { frames.push(frame) })
    const { createPowerPoint } = await import('./powerpoint.ts')
    const { title, author, canvas } = deck
    await Bun.write(output, createPowerPoint(frames, { title, author, ...canvas }))
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
}
