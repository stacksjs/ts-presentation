import { renderTemplateString } from '@stacksjs/stx'
import { fileURLToPath } from 'node:url'

export type { ClickBounds, PresentationNavigation, SlidePosition, SlideRoute } from './runtime/navigation.ts'
export { clickBounds, createNavigationContext, getSlideRoutePath, readSlideHash, slideHash } from './runtime/navigation.ts'

type TemplateContext = Record<string, string | number | undefined>
type Template = (context: TemplateContext) => string
const bindings = /{!!\s*(\w+)\s*!!}|\{\{\s*(\w+)\s*\}\}/g
const slotMarker = /__presentation_slot_(\d+)__/g

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
  const html = await renderTemplateString(template, fileURLToPath(url), {
    context,
    templateOnly: true,
    options: { seo: { enabled: false }, partialsDir: '', componentsDir: '', layoutsDir: '' },
  })
  return values => html.replace(slotMarker, (_, marker: string) => {
    const binding = slots[Number(marker)]
    if (!binding) return ''
    const value = String(values[binding.name] ?? '')
    return binding.raw ? value : Bun.escapeHTML(value)
  })
}

let shell: Promise<Template> | undefined

export function renderPresentationShell(context: TemplateContext): Promise<string> {
  shell ??= compileTemplate(new URL('./runtime/Presentation.stx', import.meta.url))
  return shell.then(render => render(context))
}

const builtinLayouts = new Set(['two-cols', 'two-cols-header', 'iframe', 'iframe-left', 'iframe-right'])
const layouts = new Map<string, Promise<Template>>()

export function hasBuiltinLayout(name: string): boolean {
  return builtinLayouts.has(name)
}

export async function renderBuiltinLayout(name: string, slots: Record<string, string>, frontmatter: Record<string, unknown> = {}): Promise<string | undefined> {
  if (!hasBuiltinLayout(name)) return
  let pending = layouts.get(name)
  if (!pending) {
    pending = compileTemplate(new URL(`./layouts/${name}.stx`, import.meta.url))
    layouts.set(name, pending)
  }

  const render = await pending
  const url = typeof frontmatter.url === 'string' && /^(?:https?:\/\/|\.{0,2}\/(?!\/))/i.test(frontmatter.url) ? frontmatter.url : 'about:blank'
  const scale = typeof frontmatter.scale === 'number' && Number.isFinite(frontmatter.scale) && frontmatter.scale > 0
    ? frontmatter.scale
    : 1
  return render({ ...slots, content: slots.default, url, scale, percent: 100 / scale })
}
