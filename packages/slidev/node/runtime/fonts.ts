import { resolveFonts } from '../../../parser/src/config.ts'
import type { ResolvedFontOptions } from '../../../types/src/config.ts'
import type { FontOptions } from '../../../types/src/frontmatter.ts'
import { escapeHtml } from './html.ts'

function fontName(name: string): string {
  return name.trim().replace(/^(["'])(.*?)\1$/, '$2')
}

function fontQuery(options: ResolvedFontOptions): string {
  const families = new Set(options.webfonts.map(fontName).filter(Boolean))
  if (!families.size) return ''
  const weights = [...new Set(options.weights)].filter((weight) => {
    const match = /^(\d{1,4})(?:\.\.(\d{1,4}))?$/.exec(weight)
    return match && Number(match[1]) >= 1 && Number(match[2] ?? match[1]) <= 1000 && Number(match[2] ?? match[1]) >= Number(match[1])
  }).sort((a, b) => Number.parseInt(a) - Number.parseInt(b))
  if (!weights.length) weights.push('400')
  const values = options.italic ? [0, 1].flatMap(style => weights.map(weight => `${style},${weight}`)) : weights
  const axis = options.italic ? 'ital,wght' : 'wght'
  return [...families].map(family => `family=${encodeURIComponent(family).replaceAll('%20', '+')}:${axis}@${values.join(';')}`).join('&') + '&display=swap'
}

export function generateGoogleFontsUrl(options: ResolvedFontOptions): string {
  const query = fontQuery(options)
  return query ? `https://fonts.googleapis.com/css2?${query}` : ''
}
export function generateCoollabsFontsUrl(options: ResolvedFontOptions): string {
  const query = fontQuery(options)
  return query ? `https://api.fonts.coollabs.io/css2?${query}` : ''
}

const generic = /^(?:sans-serif|serif|monospace|system-ui|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|-apple-system|BlinkMacSystemFont)$/i
function families(names: string[]): string {
  return names.map(fontName).filter(name => name && !/[\x00-\x1F<>{};]/.test(name))
    .map(name => generic.test(name) ? name : JSON.stringify(name)).join(', ')
}

function fontOptions(value: unknown): FontOptions | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const raw = value as Record<string, unknown>
  const options: FontOptions = {}
  for (const key of ['sans', 'serif', 'mono', 'custom'] as const) {
    const field = raw[key]
    if (typeof field === 'string') options[key] = field
    else if (Array.isArray(field)) options[key] = field.filter((entry): entry is string => typeof entry === 'string')
  }
  for (const key of ['local', 'webfonts'] as const) {
    const field = raw[key]
    if (Array.isArray(field)) options[key] = field.filter((entry): entry is string => typeof entry === 'string')
  }
  if (typeof raw.weights === 'string') options.weights = raw.weights
  else if (Array.isArray(raw.weights)) options.weights = raw.weights.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
  if (typeof raw.italic === 'boolean') options.italic = raw.italic
  if (typeof raw.fallbacks === 'boolean') options.fallbacks = raw.fallbacks
  if (raw.provider === 'google' || raw.provider === 'coollabs' || raw.provider === 'none') options.provider = raw.provider
  return options
}

export function deckFontMarkup(...values: unknown[]): string {
  const configs = values.map(fontOptions).filter(Boolean)
  if (!configs.length) return ''
  const fonts = resolveFonts(Object.assign({}, ...configs))
  const local = new Set(fonts.local.map(fontName))
  const remote = { ...fonts, webfonts: fonts.webfonts.filter(name => !local.has(fontName(name)) && !generic.test(fontName(name))) }
  const url = fonts.provider === 'google' ? generateGoogleFontsUrl(remote)
    : fonts.provider === 'coollabs' ? generateCoollabsFontsUrl(remote) : ''
  const variables = (['sans', 'serif', 'mono'] as const).flatMap((key) => {
    const list = families(fonts[key])
    return list ? [`--presentation-font-${key}:${list}`] : []
  }).join(';')
  const link = url ? `<link rel="stylesheet" href="${escapeHtml(url)}">` : ''
  return link + (variables ? `<style id="presentation-fonts">:root{${variables}}</style>` : '')
}
