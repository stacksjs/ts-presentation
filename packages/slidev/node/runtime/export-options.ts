import { basename, resolve } from 'node:path'

type Format = 'pdf' | 'png' | 'pptx' | 'pptx-editable'

interface ExportFlags {
  output?: string
  out?: string
  format?: string
  range?: string
  scale?: string
  'with-clicks'?: boolean
  'without-clicks'?: boolean
  'executable-path'?: string
}

interface ExportSettings {
  format: Format
  output: string
  withClicks: boolean
  range?: string
  scale: number
  executablePath?: string
}

function mapping(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function nonempty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function resolveExportSettings(source: string, headmatter: Record<string, unknown> = {}, flags: ExportFlags = {}): ExportSettings {
  const defaults = { ...mapping(mapping(headmatter.config).export), ...mapping(headmatter.export) }
  const format = flags.format ?? nonempty(defaults.format) ?? 'pdf'
  if (format !== 'pdf' && format !== 'png' && format !== 'pptx' && format !== 'pptx-editable')
    throw new Error('Export format must be pdf, png, pptx or pptx-editable')
  if (flags['with-clicks'] && flags['without-clicks']) throw new Error('Choose either --with-clicks or --without-clicks')

  const powerPoint = format === 'pptx' || format === 'pptx-editable'
  const configuredScale = flags.scale ?? defaults.scale
  const scale = typeof configuredScale === 'string' || typeof configuredScale === 'number'
    ? Number(configuredScale)
    : configuredScale === undefined ? (powerPoint ? 2 : 1) : NaN
  if (!Number.isInteger(scale) || scale < 1 || scale > 3) throw new Error('Export scale must be 1, 2 or 3')
  const range = flags.range ?? (Number.isSafeInteger(defaults.range) ? String(defaults.range) : nonempty(defaults.range))
  const withClicks = flags['without-clicks'] ? false : flags['with-clicks'] ?? (typeof defaults.withClicks === 'boolean' ? defaults.withClicks : powerPoint)
  if (format === 'pdf' && configuredScale !== undefined)
    throw new Error('Export scale is available for PNG and PPTX')

  const executablePath = flags['executable-path'] ?? nonempty(defaults.executablePath)
  const explicit = flags.out ?? flags.output ?? nonempty(defaults.output)
  const name = nonempty(headmatter.exportFilename) ?? nonempty(mapping(headmatter.config).exportFilename)
  const output = explicit ?? name
  const extension = powerPoint ? '.pptx' : '.pdf'
  const fallback = basename(source, '.md')
  const target = output ?? (format === 'png' ? `${fallback}-frames` : fallback + extension)
  const path = (format === 'pptx-editable' || explicit === undefined && format !== 'png') && !target.toLowerCase().endsWith(extension) ? target + extension : target
  return { format, output: resolve(path), range, scale, withClicks, executablePath }
}
