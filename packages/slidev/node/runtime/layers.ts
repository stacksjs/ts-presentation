import { realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileLayoutTemplate } from '../../../client/index.ts'
import type { SlideRoute } from '../../../client/runtime/navigation.ts'
import { within } from './assets.ts'
import { snippetRevision } from './snippet-write.ts'

const names = ['global-bottom', 'slide-bottom', 'slide-top', 'global-top', 'custom-nav-controls'] as const
type Layer = typeof names[number]
type Template = Awaited<ReturnType<typeof compileLayoutTemplate>>
export type DeckLayers = Partial<Record<Layer, Template>>

export async function loadDeckLayers(roots: readonly string[], observe: (path: string) => Promise<string | undefined>): Promise<DeckLayers> {
  const found = await Promise.all(names.map(async (name) => {
    const candidates = name.startsWith('slide-') ? [`layouts/${name}.stx`, `${name}.stx`] : [`${name}.stx`]
    for (const root of roots) {
      for (const candidate of candidates) {
        const path = join(root, candidate)
        if (await observe(path) === undefined) continue
        const template = await realpath(path)
        if (!within(root, template)) throw new Error('STX layers must stay inside their project or extension directory')
        return [name, await compileLayoutTemplate(pathToFileURL(template))] as const
      }
    }
  }))
  return Object.fromEntries(found.filter(entry => entry !== undefined))
}

export function renderLayer(template: Template, route: SlideRoute, total: number): Promise<string> {
  return template({
    slots: { default: '' },
    frontmatter: route.frontmatter,
    title: route.title,
    slideNumber: route.no,
    nav: { currentPage: route.no, currentSlideNo: route.no, currentLayout: route.layout, currentFrontmatter: route.frontmatter, total },
  })
}

export async function renderSlideLayers(layers: DeckLayers, route: SlideRoute, total: number): Promise<{ below: string, above: string }> {
  const [background, lower, upper, foreground] = await Promise.all(names.slice(0, 4).map(async (name) => {
    const template = layers[name]
    const html = template && (await renderLayer(template, route, total)).trim()
    if (!html) return ''
    // A matching global layer can retain its DOM state when the player changes slides.
    const identity = name.startsWith('global-') ? ` data-global-layer="${snippetRevision(html)}"` : ''
    return `<div class="presentation-layer" data-presentation-layer="${name}"${identity}>${html}</div>`
  }))
  return { below: background + lower, above: upper + foreground }
}
