import { basename, resolve } from 'node:path'

type Format = 'pdf' | 'png' | 'pptx' | 'pptx-editable' | 'md'

interface ExportFlags {
  output?: string
  out?: string
  format?: string
  range?: string
  scale?: string
  'with-clicks'?: boolean
  'without-clicks'?: boolean
  'executable-path'?: string
  timeout?: string
  wait?: string
}

interface ExportSettings {
  format: Format
  output: string
  withClicks: boolean
  range?: string
  scale: number
  executablePath?: string
}

interface NotesExportSettings {
  format: 'notes'
  output: string
  executablePath?: string
  range?: string
  timeout: number
  wait: number
}

export interface BuildDownload { href: string, filename?: string }

function mapping(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function nonempty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function exportDefaults(headmatter: Record<string, unknown>): Record<string, unknown> {
  return { ...mapping(mapping(headmatter.config).export), ...mapping(headmatter.export) }
}

function exportFilename(headmatter: Record<string, unknown>): string | undefined {
  return nonempty(headmatter.exportFilename) ?? nonempty(mapping(headmatter.config).exportFilename)
}

export function resolveBuildDownload(headmatter: Record<string, unknown> = {}, generate = false): BuildDownload | undefined {
  const download = generate ? true : headmatter.download ?? mapping(headmatter.config).download
  if (download === true || download === 'true' || download === 'auto') {
    const name = exportFilename(headmatter) ?? 'slidev-exported'
    const filename = name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`
    const parts = filename.split('/')
    if (/[:\\\u0000-\u001f\u007f]/u.test(filename) || parts.some(part => !part.trim() || part === '.' || part === '..'))
      throw new Error('The PDF download filename must be relative to the build directory')
    return { filename, href: `./${parts.map(encodeURIComponent).join('/')}` }
  }
  const href = nonempty(download)
  if (!href || href === 'false') return
  const url = URL.parse(href, 'https://deck.invalid/')
  if (!url || !['http:', 'https:'].includes(url.protocol) || /[\\\u0000-\u001f\u007f]/u.test(href))
    throw new Error('The PDF download link must use a local path, HTTP, or HTTPS')
  return { href }
}

function frameSelection(defaults: Record<string, unknown>, flags: ExportFlags, defaultClicks: boolean): Pick<ExportSettings, 'range' | 'withClicks' | 'executablePath'> {
  if (flags['with-clicks'] && flags['without-clicks']) throw new Error('Choose either --with-clicks or --without-clicks')
  return {
    range: flags.range ?? (Number.isSafeInteger(defaults.range) ? String(defaults.range) : nonempty(defaults.range)),
    withClicks: flags['without-clicks'] ? false : flags['with-clicks'] ?? (typeof defaults.withClicks === 'boolean' ? defaults.withClicks : defaultClicks),
    executablePath: flags['executable-path'] ?? nonempty(defaults.executablePath),
  }
}

export function resolveDownloadCapture(headmatter: Record<string, unknown> = {}, flags: ExportFlags = {}): Pick<ExportSettings, 'range' | 'withClicks' | 'executablePath' | 'scale'> {
  return { ...frameSelection(exportDefaults(headmatter), flags, false), scale: 1 }
}

export function resolveExportSettings(source: string, headmatter: Record<string, unknown> = {}, flags: ExportFlags = {}): ExportSettings {
  const defaults = exportDefaults(headmatter)
  const format = flags.format ?? nonempty(defaults.format) ?? 'pdf'
  if (format !== 'pdf' && format !== 'png' && format !== 'pptx' && format !== 'pptx-editable' && format !== 'md')
    throw new Error('Export format must be pdf, png, pptx, pptx-editable or md')

  const powerPoint = format === 'pptx' || format === 'pptx-editable'
  const configuredScale = flags.scale ?? defaults.scale
  const scale = typeof configuredScale === 'string' || typeof configuredScale === 'number'
    ? Number(configuredScale)
    : configuredScale === undefined ? (powerPoint ? 2 : 1) : NaN
  if (!Number.isInteger(scale) || scale < 1 || scale > 3) throw new Error('Export scale must be 1, 2 or 3')
  if (format === 'pdf' && configuredScale !== undefined)
    throw new Error('Export scale is available for PNG, PPTX and Markdown images')

  const explicit = flags.out ?? flags.output ?? nonempty(defaults.output)
  const name = exportFilename(headmatter)
  const output = explicit ?? name
  const extension = powerPoint ? '.pptx' : format === 'md' ? '.md' : '.pdf'
  const fallback = basename(source, '.md')
  const target = output ?? (format === 'png' ? `${fallback}-frames` : format === 'md' ? `${fallback}-export.md` : fallback + extension)
  const path = (format === 'pptx-editable' || format === 'md' || explicit === undefined && format !== 'png') && !target.toLowerCase().endsWith(extension) ? target + extension : target
  return { format, output: resolve(path), scale, ...frameSelection(defaults, flags, powerPoint) }
}

export function resolveNotesExportSettings(source: string, headmatter: Record<string, unknown> = {}, flags: ExportFlags = {}): NotesExportSettings {
  const name = exportFilename(headmatter)
  const target = flags.out ?? flags.output ?? (name ? `${name}-notes` : `${basename(source, '.md')}-export-notes`)
  const timeout = Number(flags.timeout ?? 30_000)
  const wait = Number(flags.wait ?? 0)
  if (!Number.isSafeInteger(timeout) || timeout < 0 || timeout > 2_147_483_647) throw new Error('Invalid notes export timeout')
  if (!Number.isSafeInteger(wait) || wait < 0 || wait > 2_147_483_647) throw new Error('Invalid notes export wait')
  return {
    format: 'notes',
    output: resolve(target.toLowerCase().endsWith('.pdf') ? target : `${target}.pdf`),
    executablePath: flags['executable-path'] ?? nonempty(exportDefaults(headmatter).executablePath),
    range: flags.range,
    timeout,
    wait,
  }
}
