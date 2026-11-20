interface ManualTag {
  markup: string
  starred: boolean
  bareMarkup?: string
}

export const equationTagValue = '<mrow data-equation-tag-value=""></mrow>'

export function applyEquationTagForm(form: string, markup: string): string {
  return form.replaceAll(equationTagValue, () => markup)
}

export type EquationReferenceKind = 'ref' | 'eqref' | 'refeq'

export interface EquationReferenceMarkup {
  number?: (number: number, key?: string, onlyReferenced?: boolean, form?: string) => string
  group?: (parent: number, key?: string) => { marker: string, member: (suffix: string, key?: string, onlyReferenced?: boolean, form?: string) => string }
  label?: (key: string, tag: ManualTag, onlyReferenced?: boolean) => string
  reference: (key: string, kind: EquationReferenceKind, link: boolean, form?: string) => string
  pin: (key: string) => string
}

interface EquationGroup { parent: number }
type Definition = ({ number: number } | { tag: ManualTag } | { group: EquationGroup, suffix?: string }) & { key?: string, onlyReferenced?: boolean, form?: string }
type Reference = { key: string, kind: EquationReferenceKind | 'pin', link: boolean, form?: string }
type Resolved = { slide: number, tag: ManualTag }

function unparenthesize(markup: string): string {
  // TeX's tag parser emits the delimiters at the ends of its first and
  // last text runs. Leave any parentheses authored inside the tag intact.
  const start = markup.replace(/(<mtext>)\(/, '$1')
  const end = start.lastIndexOf(')</mtext>')
  return (end < 0 ? start : start.slice(0, end) + start.slice(end + 1)).replaceAll('<mtext></mtext>', '')
}

function parenthesize(markup: string): string {
  const text = /^<mtext>([^<]*)<\/mtext>$/.exec(markup)?.[1]
  return text === undefined ? `<mtext>(</mtext>${markup}<mtext>)</mtext>` : `<mtext>(${text})</mtext>`
}

export function createEquationReferences(token: string, deck = false): {
  markup: EquationReferenceMarkup
  numberSlides: (slides: readonly string[]) => string[]
  resolve: (markup: string) => string
} {
  const definitions: Definition[] = []
  const references: Reference[] = []
  const labels = new Map<string, Resolved>()
  const duplicate = new Set<string>()
  const unresolvedPins = new Set<string>()
  const referenced = new Set<string>()
  const definitionMarker = `data-pending-equation-tag="${token}-`
  const manualMarker = `data-pending-equation-manual="${token}-`
  const manualTag = `<mrow ${manualMarker}(\\d+)"></mrow>([\\s\\S]*?)<mrow data-pending-equation-manual-end="${token}-\\1"></mrow>`
  const definitionPattern = new RegExp(`${manualTag}|<mrow ${definitionMarker}(\\d+)"></mrow>`, 'g')
  const manualPattern = new RegExp(manualTag, 'g')
  const referencePattern = new RegExp(`<mrow data-pending-equation-(?:ref|pin)="${token}-(\\d+)"></mrow>`, 'g')
  let filtering = false
  let conditionalManualTags = false
  let formattedNumbers = false
  let counter = 0
  let skipped = 0

  function define(definition: Definition): string {
    const index = definitions.push(definition) - 1
    filtering ||= definition.onlyReferenced === true
    formattedNumbers ||= definition.form !== undefined
    if ('tag' in definition && definition.onlyReferenced) {
      conditionalManualTags = true
      return `<mrow ${manualMarker}${index}"></mrow>${definition.tag.markup}<mrow data-pending-equation-manual-end="${token}-${index}"></mrow>`
    }
    return `<mrow ${definitionMarker}${index}"></mrow>`
  }

  function visible(definition: Definition): boolean {
    return !definition.onlyReferenced || Boolean(definition.key && referenced.has(definition.key))
  }

  function collectReferences(html: string): void {
    for (const [, index] of html.matchAll(referencePattern)) {
      const reference = references[Number(index)]
      if (reference.kind !== 'ref') referenced.add(reference.key)
      if (reference.form) collectReferences(reference.form)
    }
  }

  function numberSlides(slides: readonly string[]): string[] {
    if (filtering) {
      // Count references in the final layout. Discarded slots and inactive
      // slides never activate an equation. References inside optional manual
      // tags activate only after their enclosing tag has been selected.
      const pendingTags = new Map<string, string[]>()
      function collectTag(definition: Definition, content: string): void {
        const key = definition.key
        if (!definition.onlyReferenced) collectReferences(content)
        else if (key) {
          const entries = pendingTags.get(key) ?? []
          entries.push(content)
          pendingTags.set(key, entries)
        }
      }
      for (const html of slides) {
        if (formattedNumbers) {
          for (const [, , , index] of html.matchAll(definitionPattern)) {
            const definition = definitions[Number(index)]
            if (definition?.form) collectTag(definition, definition.form)
          }
        }
        collectReferences(conditionalManualTags ? html.replace(manualPattern, (_, index: string, content: string) => {
          collectTag(definitions[Number(index)], content)
          return ''
        }) : html)
      }
      for (const key of referenced) {
        for (const tag of pendingTags.get(key) ?? []) collectReferences(tag)
      }
    }
    return slides.map((html, index) => numberSlide(html, index + 1))
  }

  function numberSlide(html: string, slide: number): string {
    let groups: Map<EquationGroup, { parent: number, members: number }> | undefined
    return html.replace(definitionPattern, (_, manualIndex: string | undefined, manualMarkup: string | undefined, index: string | undefined) => {
      const definition = definitions[Number(manualIndex ?? index)]
      const startGroup = 'group' in definition && definition.suffix === undefined
      if (!visible(definition)) {
        if ('number' in definition) skipped++
        return ''
      }
      let value: string | number = ''
      if ('group' in definition) {
        const { group, suffix } = definition
        const parents = groups ??= new Map()
        let numbering = parents.get(group)
        if (!numbering) {
          numbering = { parent: deck ? ++counter : group.parent - skipped, members: 0 }
          parents.set(group, numbering)
        }
        if (suffix === undefined) value = numbering.parent
        else value = `${numbering.parent}${String.fromCharCode(97 + numbering.members++)}`
      }
      else if ('number' in definition) value = deck ? ++counter : definition.number - skipped
      const tag = 'tag' in definition ? definition.tag
        : definition.form ? formattedNumberTag(value, definition.form) : { markup: `<mtext>(${value})</mtext>`, starred: false }
      const { key } = definition
      if (key) {
        if (!labels.has(key)) labels.set(key, { slide, tag })
        else if (!duplicate.has(key)) {
          duplicate.add(key)
          if (deck) console.warn(`Duplicate equation label: ${key}`)
        }
      }
      // Unconditional manual tags already remain in the HTML. Optional manual
      // tags return the enclosed markup after the layout's link processing.
      return 'tag' in definition ? manualMarkup ?? '' : startGroup ? '' : tag.markup
    })
  }

  function formattedNumberTag(value: string | number, form: string): ManualTag {
    const bareMarkup = `<mtext>${value}</mtext>`
    return { markup: applyEquationTagForm(form, bareMarkup), bareMarkup, starred: false }
  }

  function resolve(html: string): string {
    return html.replace(referencePattern, (_, index: string) => resolveReference(Number(index), new Set(), { remaining: 64 }))
  }

  function resolveReference(index: number, visiting: Set<string>, budget: { remaining: number }): string {
    const reference = references[index]
    const { key, kind, form } = reference
    const target = labels.get(key)
    if (kind === 'pin') {
      if (deck && !target && !unresolvedPins.has(key)) {
        unresolvedPins.add(key)
        console.warn(`Undefined equation label: ${key}`)
      }
      return ''
    }
    const parenthesized = kind === 'eqref'
    const unresolved = `<mtext>${parenthesized ? '(??)' : '??'}</mtext>`
    if (visiting.has(key) || visiting.size >= 32 || --budget.remaining < 0) return unresolved
    const resolveNested = (content: string) => content.replace(referencePattern, (_, nested: string) =>
      resolveReference(Number(nested), visiting, budget))
    if (!target) {
      if (!form) return unresolved
      visiting.add(key)
      const formatted = resolveNested(applyEquationTagForm(form, '<mtext>??</mtext>'))
      visiting.delete(key)
      return formatted
    }
    const { tag, slide } = target
    let content: string
    if (form || tag.bareMarkup !== undefined) {
      const bare = tag.bareMarkup ?? (tag.starred ? tag.markup : unparenthesize(tag.markup))
      content = form ? applyEquationTagForm(form, bare) : parenthesized ? parenthesize(bare) : bare
    }
    else {
      content = parenthesized === !tag.starred ? tag.markup
        : parenthesized ? `<mtext>(</mtext>${tag.markup}<mtext>)</mtext>` : unparenthesize(tag.markup)
    }
    visiting.add(key)
    const resolved = resolveNested(content)
    visiting.delete(key)
    const upright = kind === 'refeq' ? ' style="font-style:normal"' : ''
    const expression = `<mrow${upright}>${resolved}</mrow>`
    return deck && reference.link && !visiting.size
      ? `<mtext class="math-equation-reference"><a href="#slide-${slide}" data-slide-link="${slide}"><math>${expression}</math></a></mtext>`
      : expression
  }

  function reference(key: string, kind: Reference['kind'], link: boolean, form?: string): string {
    const index = references.push({ key, kind, link, form }) - 1
    return `<mrow data-pending-equation-${kind === 'pin' ? 'pin' : 'ref'}="${token}-${index}"></mrow>`
  }

  return {
    markup: {
      number: (number, key, onlyReferenced, form) => define({ number, key, onlyReferenced, form }),
      group: (parent, key) => {
        const group = { parent }
        return { marker: define({ group, key }), member: (suffix, key, onlyReferenced, form) => define({ group, suffix, key, onlyReferenced, form }) }
      },
      label: (key, tag, onlyReferenced) => define({ key, tag, onlyReferenced }) + (onlyReferenced ? '' : tag.markup),
      reference,
      pin: key => reference(key, 'pin', false),
    },
    numberSlides,
    resolve,
  }
}
