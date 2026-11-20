import { MathParseError } from './math-error.ts'
import type { KatexOptions, KatexTrustContext } from './authoring-setup.ts'
import { escapeHtml } from './html.ts'

type UrlCommand = Extract<KatexTrustContext, { url: string }>['command']
type AttributeCommand = Exclude<KatexTrustContext['command'], UrlCommand>

const mathUrlCommands = new Set(['\\href', '\\url', '\\includegraphics'])
const mathAttributeCommands = new Set(['\\htmlClass', '\\htmlId', '\\htmlStyle', '\\htmlData'])

export function isMathUrlCommand(command: string): command is UrlCommand {
  return mathUrlCommands.has(command)
}

export function isMathAttributeCommand(command: string): command is AttributeCommand {
  return mathAttributeCommands.has(command)
}

// KaTeX's trust contexts and HTML argument syntax are distributed under the MIT license.
export function trustedMath(context: KatexTrustContext, trust: KatexOptions['trust']): boolean {
  return typeof trust === 'function' ? trust(context) : trust === true
}

export function mathUrl(command: UrlCommand, raw: string): Extract<KatexTrustContext, { url: string }> | undefined {
  const url = raw.replace(/\\([%#$&_{}~^])/g, '$1').trim()
  if (/[\\\u0000-\u001f\u007f]/.test(url)) return
  const parsed = URL.parse(url, 'https://presentation.invalid/')
  if (!parsed) return
  const image = command === '\\includegraphics'
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && (image || !['mailto:', 'tel:'].includes(parsed.protocol))) return
  const protocol = /^[a-z][a-z\d+.-]*:/i.test(url) ? parsed.protocol.slice(0, -1) : '_relative'
  return { command, url, protocol }
}

export function mathKeyValues(source: string): [string, string][] {
  return (source.match(/(?:\{,\}|[^,])+/g) ?? []).map((item) => {
    const at = item.indexOf('=')
    if (at < 0) throw new MathParseError('Expected a math key and value separated by an equals sign')
    return [item.slice(0, at).trim(), item.slice(at + 1).replaceAll('{,}', ',')]
  })
}

export function mathAttributes(command: AttributeCommand, value: string): { context: KatexTrustContext, attributes: string } {
  if (command === '\\htmlClass') return { context: { command, class: value }, attributes: `class="${escapeHtml(value)}"` }
  if (command === '\\htmlId') return { context: { command, id: value }, attributes: `id="${escapeHtml(value)}"` }
  if (command === '\\htmlStyle') return { context: { command, style: value }, attributes: `style="${escapeHtml(value)}"` }
  const attributes = Object.fromEntries(mathKeyValues(value).map(([key, item]) => {
    if (!/^[a-z][\w.-]*$/i.test(key)) throw new MathParseError('Invalid math data attribute name')
    return [`data-${key.toLowerCase()}`, item]
  }))
  return {
    context: { command, attributes },
    attributes: Object.entries(attributes).map(([key, entry]) => `${key}="${escapeHtml(entry)}"`).join(' '),
  }
}
