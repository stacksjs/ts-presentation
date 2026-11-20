import { renderTemplateString } from '@stacksjs/stx'
import { fileURLToPath } from 'node:url'
import { builtinLayouts } from './runtime/builtin-layouts.ts'

export type { ClickBounds, PresentationNavigation, SlidePosition, SlideRoute } from './runtime/navigation.ts'
export { clickBounds, createNavigationContext, getSlideRoutePath, readSlideHash, slideHash } from './runtime/navigation.ts'

type TemplateContext = Record<string, string | number | undefined>
type Template = (context: TemplateContext) => string
const bindings = /{!!\s*(\w+)\s*!!}|\{\{\s*(\w+)\s*\}\}/g
const slotMarker = /__presentation_slot_(\d+)__/g

function renderStx(source: string, path: string, context: Record<string, unknown>): Promise<string> {
  return renderTemplateString(source, path, {
    context,
    templateOnly: true,
    options: { seo: { enabled: false }, partialsDir: '', componentsDir: '', layoutsDir: '' },
  })
}

export async function compileTemplate(url: URL): Promise<Template> {
  const source = await Bun.file(url).text()
  const slots: { name: string, raw: boolean }[] = []
  const context: Record<string, string> = Object.create(null)
  const template = source.replace(bindings, (_expression, raw: string | undefined, escaped: string) => {
    const key = `presentationBinding${slots.length}`
    context[key] = `__presentation_slot_${slots.length}__`
    slots.push({ name: raw ?? escaped, raw: Boolean(raw) })
    return `{{ ${key} }}`
  })

  // Compile the trusted template once. Fill its slots after STX processing so
  // authored code samples, CSS, and JSON are preserved as literal content.
  const html = await renderStx(template, fileURLToPath(url), context)
  return values => html.replace(slotMarker, (_, marker: string) => {
    const binding = slots[Number(marker)]
    if (!binding) return ''
    const value = String(values[binding.name] ?? '')
    return binding.raw ? value : Bun.escapeHTML(value)
  })
}

interface LayoutBindings {
  slots: Readonly<Record<string, string>>
  title: string
  slideNumber: number
  frontmatter: Readonly<Record<string, unknown>>
  nav?: Readonly<Record<string, unknown>>
}

export async function compileLayoutTemplate(url: URL): Promise<(bindings: LayoutBindings) => Promise<string>> {
  const path = fileURLToPath(url)
  const source = await Bun.file(url).text()
  const marker = `presentationSlot${Bun.randomUUIDv7().replaceAll('-', '')}_`
  const slotExpression = /{!!\s*((?:slots\.)?[\w-]+)\s*!!}|\{\{\s*((?:slots\.)?[\w-]+)\s*\}\}/g
  const restoreSlot = new RegExp(`${marker}(\\d+)x`, 'g')

  return async ({ slots, title, slideNumber, frontmatter, nav }) => {
    const context: Record<string, unknown> = { ...slots, slots, content: slots.default, frontmatter, title, slideNumber, nav }
    const values: string[] = []
    const template = source.replace(slotExpression, (expression, raw: string | undefined, escaped: string) => {
      const name = raw ?? escaped
      const explicit = name.startsWith('slots.')
      const slot = explicit ? name.slice(6) : name === 'content' ? 'default' : name
      if (!explicit && name !== 'content' && (!Object.hasOwn(slots, slot) || ['title', 'slideNumber', 'frontmatter', 'slots'].includes(name))) return expression
      const value = Object.hasOwn(slots, slot) ? slots[slot] : ''
      const key = `${marker}${values.length}x`
      context[key] = key
      values.push(raw ? value : Bun.escapeHTML(value))
      return `{{ ${key} }}`
    })
    // Inject rendered Markdown after STX has evaluated the layout's own directives.
    const html = await renderStx(template, path, context)
    return html.replace(restoreSlot, (_, number: string) => values[Number(number)] ?? '')
  }
}

let shell: Promise<Template> | undefined

export function renderPresentationShell(context: TemplateContext): Promise<string> {
  shell ??= compileTemplate(new URL('./runtime/Presentation.stx', import.meta.url))
  return shell.then(render => render(context))
}

const layouts = new Map<string, Promise<Template>>()

export function hasBuiltinLayoutSlots(name: string): boolean {
  return ['two-cols', 'two-cols-header', 'iframe', 'iframe-left', 'iframe-right'].includes(name)
}

function layoutUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return
  const url = value.trim()
  if (!url || /[\0-\x1f\x7f\\]/.test(url) || url.startsWith('//')) return
  if (/^[\w+.-]+:/.test(url)) {
    if (!/^https?:\/\//i.test(url) || !URL.canParse(url)) return
  }
  return url
}

const imageLength = /^(?:auto|0|\d+(?:\.\d+)?(?:%|px|em|rem|vw|vh|vmin|vmax|ch))$/i

function imageSizing(value: unknown): string {
  const size = typeof value === 'string' ? value.trim() : ''
  if (size === 'contain') return 'object-fit:contain'
  const [width, height = 'auto', extra] = size.split(/\s+/)
  if (extra === undefined && imageLength.test(width) && imageLength.test(height))
    return `width:${width};height:${height};object-fit:fill`
  return 'object-fit:cover'
}

async function renderBuiltinTemplate(template: string, values: TemplateContext): Promise<string> {
  let pending = layouts.get(template)
  if (!pending) {
    pending = compileTemplate(new URL(`./layouts/${template}.stx`, import.meta.url))
    layouts.set(template, pending)
  }
  return (await pending)(values)
}

export async function renderBuiltinLayout(name: string, slots: Record<string, string>, frontmatter: Record<string, unknown> = {}): Promise<string | undefined> {
  if (!Object.hasOwn(builtinLayouts, name)) return
  const template = builtinLayouts[name]
  const content = name === 'end' && !slots.default.trim() ? '<p>END</p>' : slots.default
  if (template === 'content') return renderBuiltinTemplate(template, { content })
  if (template === 'image' || template === 'image-split') {
    const url = layoutUrl(frontmatter.image ?? frontmatter.backgroundImage ?? frontmatter.background)
    const imageMarkup = url ? await renderBuiltinTemplate('image-element', {
      url,
      alt: typeof frontmatter.imageAlt === 'string' ? frontmatter.imageAlt : '',
      sizing: imageSizing(frontmatter.backgroundSize),
    }) : ''
    return renderBuiltinTemplate(template, { content, imageMarkup })
  }
  if (!template.startsWith('iframe')) return renderBuiltinTemplate(template, { ...slots, content })
  const scale = typeof frontmatter.scale === 'number' && Number.isFinite(frontmatter.scale) && frontmatter.scale > 0
    ? frontmatter.scale
    : 1
  return renderBuiltinTemplate(template, {
    content,
    url: layoutUrl(frontmatter.url) ?? 'about:blank',
    scale,
    percent: 100 / scale,
  })
}
