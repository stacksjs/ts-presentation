interface ManualTag {
  markup: string
  starred: boolean
}

export interface EquationReferenceMarkup {
  number?: (number: number, key?: string) => string
  label?: (key: string, tag: ManualTag) => string
  reference: (key: string, parenthesized: boolean, link: boolean) => string
}

type Definition = { key?: string, number: number } | { key: string, tag: ManualTag }
type Reference = { key: string, parenthesized: boolean, link: boolean }
type Resolved = { slide: number, tag: ManualTag }

function unparenthesize(markup: string): string {
  // TeX's tag parser emits the delimiters at the ends of its first and
  // last text runs. Leave any parentheses authored inside the tag intact.
  const start = markup.replace(/(<mtext>)\(/, '$1')
  const end = start.lastIndexOf(')</mtext>')
  return (end < 0 ? start : start.slice(0, end) + start.slice(end + 1)).replaceAll('<mtext></mtext>', '')
}

export function createEquationReferences(token: string, deck = false): {
  markup: EquationReferenceMarkup
  numberSlide: (html: string, slide: number) => string
  resolve: (markup: string) => string
} {
  const definitions: Definition[] = []
  const references: Reference[] = []
  const labels = new Map<string, Resolved>()
  const duplicate = new Set<string>()
  const definitionPattern = new RegExp(`<mrow data-pending-equation-tag="${token}-(\\d+)"></mrow>`, 'g')
  const referencePattern = new RegExp(`<mrow data-pending-equation-ref="${token}-(\\d+)"></mrow>`, 'g')
  let counter = 0

  function define(definition: Definition): string {
    return `<mrow data-pending-equation-tag="${token}-${definitions.push(definition) - 1}"></mrow>`
  }

  function numberSlide(html: string, slide: number): string {
    return html.replace(definitionPattern, (_, index: string) => {
      const definition = definitions[Number(index)]
      const tag = 'tag' in definition ? definition.tag
        : { markup: `<mtext>(${deck ? ++counter : definition.number})</mtext>`, starred: false }
      const { key } = definition
      if (key) {
        if (!labels.has(key)) labels.set(key, { slide, tag })
        else if (!duplicate.has(key)) {
          duplicate.add(key)
          if (deck) console.warn(`Duplicate equation label: ${key}`)
        }
      }
      // A manual tag's original markup remains in the equation so the deck's
      // HTML transforms can handle its links and styling as usual.
      return 'tag' in definition ? '' : tag.markup
    })
  }

  function resolve(html: string): string {
    return html.replace(referencePattern, (_, index: string) => resolveReference(Number(index), new Set(), { remaining: 64 }))
  }

  function resolveReference(index: number, visiting: Set<string>, budget: { remaining: number }): string {
    const reference = references[index]
    const { key, parenthesized } = reference
    const target = labels.get(key)
    if (!target || visiting.has(key) || visiting.size >= 32 || --budget.remaining < 0)
      return `<mtext>${parenthesized ? '(??)' : '??'}</mtext>`
    const { tag, slide } = target
    const content = parenthesized === !tag.starred ? tag.markup
      : parenthesized ? `<mtext>(</mtext>${tag.markup}<mtext>)</mtext>` : unparenthesize(tag.markup)
    visiting.add(key)
    const resolved = content.replace(referencePattern, (_, nested: string) => resolveReference(Number(nested), visiting, budget))
    visiting.delete(key)
    const expression = `<mrow>${resolved}</mrow>`
    return deck && reference.link && !visiting.size
      ? `<mtext class="math-equation-reference"><a href="#slide-${slide}" data-slide-link="${slide}"><math>${expression}</math></a></mtext>`
      : expression
  }

  return {
    markup: {
      number: (number, key) => !deck && !key ? `<mtext>(${number})</mtext>` : define({ number, key }),
      label: (key, tag) => define({ key, tag }) + tag.markup,
      reference: (key, parenthesized, link) => `<mrow data-pending-equation-ref="${token}-${references.push({ key, parenthesized, link }) - 1}"></mrow>`,
    },
    numberSlide,
    resolve,
  }
}
