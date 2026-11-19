import { realpath } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import type { Deck, RenderOptions } from './index.ts'
import type { ExtensionAssets } from './extensions.ts'
import type { SlideCanvas } from './canvas.ts'
import { loadAuthoringSetup } from './authoring-setup.ts'
import { within } from './assets.ts'
import { resolveCanvas } from './canvas.ts'
import { loadExtensions } from './extensions.ts'
import { parseDeck, renderDeck } from './index.ts'
import { slideRange } from './selection.ts'

export interface CompiledDeck extends ExtensionAssets {
  html: string
  title: string
  author?: string
  canvas: SlideCanvas
}

export interface CompileOptions extends Pick<RenderOptions, 'liveCompile'> {
  theme?: string
}

export function createDeckCompiler(entry: string, options: CompileOptions = {}): () => Promise<CompiledDeck> {
  const root = dirname(resolve(entry))
  let cached: { files: Map<string, string>, deck: CompiledDeck } | undefined
  let pending: Promise<CompiledDeck> | undefined

  async function compile(): Promise<CompiledDeck> {
    if (cached) {
      const checks = await Promise.all([...cached.files].map(async ([path, previous]) => {
        const stat = await Bun.file(path).stat().catch(() => null)
        return stat && `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}` === previous
      }))
      if (checks.every(Boolean)) return cached.deck
    }

    const files = new Map<string, string>()
    const directory = await realpath(root)
    async function observe(path: string): Promise<string> {
      const stat = await Bun.file(path).stat()
      const revision = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`
      files.set(path, revision)
      return revision
    }

    async function read(path: string, stack: string[]): Promise<Deck> {
      const filePath = await realpath(path)
      const position = relative(directory, filePath)
      if (!within(directory, filePath)) throw new Error('Slide source must stay inside the deck directory')
      if (stack.includes(filePath)) throw new Error(`Circular slide source: ${position}`)
      const source = Bun.file(filePath)
      await observe(filePath)
      const deck = parseDeck(await source.text())
      const slides = await Promise.all(deck.slides.map(async (slide) => {
        const attributes = slide.frontmatter ?? {}
        const reference = attributes?.src
        if (typeof reference !== 'string' || attributes.hide === true || attributes.disabled === true) return [slide]
        const [file, range] = reference.split('#')
        if (!file || !file.endsWith('.md')) throw new Error(`Expected a Markdown slide source: ${reference}`)
        const included = await read(resolve(dirname(filePath), file), [...stack, filePath])
        return slideRange(included.slides.length, range).map((number) => {
          const item = included.slides[number - 1]
          return {
            ...item,
            layout: typeof attributes.layout === 'string' ? slide.layout : item.layout,
            className: [item.className, slide.className].filter(Boolean).join(' '),
            frontmatter: { ...item.frontmatter, ...attributes, src: undefined },
          }
        })
      }))
      return { ...deck, slides: slides.flat() }
    }

    const deck = await read(resolve(entry), [])
    const [extensions, setup] = await Promise.all([
      loadExtensions(deck, directory, observe, options.theme),
      loadAuthoringSetup(directory, observe),
    ])
    const html = await renderDeck(deck, { liveCompile: options.liveCompile, extensions, setup })
    const author = typeof deck.headmatter?.author === 'string' ? deck.headmatter.author : undefined
    const compiled = { title: deck.title, author, canvas: resolveCanvas(deck.headmatter), html, styles: extensions.styles, client: extensions.client, mounts: extensions.mounts }
    cached = { files, deck: compiled }
    return compiled
  }

  return () => pending ??= compile().finally(() => { pending = undefined })
}

export function createDeckRenderer(entry: string, options?: CompileOptions): () => Promise<string> {
  const compile = createDeckCompiler(entry, options)
  return async () => (await compile()).html
}
