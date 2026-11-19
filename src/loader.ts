import { realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { Deck, Slide } from './index.ts'
import { parseDeck, renderDeck } from './index.ts'

interface CompiledDeck {
  files: Map<string, string>
  html: string
}

function rangeFor(reference: string | undefined, slides: Slide[]): Slide[] {
  if (!reference) return slides
  const match = /^(\d+)(?:-(\d+))?$/.exec(reference)
  if (!match) throw new Error(`Invalid slide source range: ${reference}`)
  const first = Number(match[1])
  const last = Number(match[2] ?? match[1])
  if (first < 1 || last < first || last > slides.length) throw new Error(`Slide source range is out of bounds: ${reference}`)
  return slides.slice(first - 1, last)
}

export function createDeckRenderer(entry: string): () => Promise<string> {
  const root = dirname(resolve(entry))
  let cached: CompiledDeck | undefined
  let pending: Promise<string> | undefined

  async function compile(): Promise<string> {
    if (cached) {
      const checks = await Promise.all([...cached.files].map(async ([path, previous]) => {
        const stat = await Bun.file(path).stat().catch(() => null)
        return stat && `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}` === previous
      }))
      if (checks.every(Boolean)) return cached.html
    }

    const files = new Map<string, string>()
    const directory = await realpath(root)
    async function read(path: string, stack: string[]): Promise<Deck> {
      const filePath = await realpath(path)
      const position = relative(directory, filePath)
      if (position === '..' || position.startsWith(`..${sep}`) || isAbsolute(position)) throw new Error('Slide source must stay inside the deck directory')
      if (stack.includes(filePath)) throw new Error(`Circular slide source: ${position}`)
      const source = Bun.file(filePath)
      const stat = await source.stat()
      const deck = parseDeck(await source.text())
      files.set(filePath, `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`)
      const slides = await Promise.all(deck.slides.map(async (slide) => {
        const attributes = slide.frontmatter ?? {}
        const reference = attributes?.src
        if (typeof reference !== 'string' || attributes.hide === true || attributes.disabled === true) return [slide]
        const [file, range] = reference.split('#')
        if (!file || !file.endsWith('.md')) throw new Error(`Expected a Markdown slide source: ${reference}`)
        const included = await read(resolve(dirname(filePath), file), [...stack, filePath])
        return rangeFor(range, included.slides).map(item => ({
          ...item,
          layout: typeof attributes.layout === 'string' ? slide.layout : item.layout,
          className: [item.className, slide.className].filter(Boolean).join(' '),
          frontmatter: { ...item.frontmatter, ...attributes, src: undefined },
        }))
      }))
      return { title: deck.title, slides: slides.flat() }
    }

    const html = await renderDeck(await read(resolve(entry), []))
    cached = { files, html }
    return html
  }

  return () => pending ??= compile().finally(() => { pending = undefined })
}
