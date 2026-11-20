import { escapeHtml } from './html.ts'
import type { Markup } from './math-markup.ts'
import { joinMarkup, xml } from './math-markup.ts'

function tag(name: string, text: string, attrs = ''): string {
  return `<${name}${attrs}>${escapeHtml(text)}</${name}>`
}

const arrows = new Map([
  ['<<=>', '⇌'], ['<=>>', '⇌'], ['<-->', '⇄'], ['<->', '↔'], ['<=>', '⇌'],
  ['->', '→'], ['→', '→'], ['⟶', '→'], ['<-', '←'], ['=>', '⇒'], ['<=', '⇐'], ['⇌', '⇌'],
])
const bonds: Record<string, string> = {
  '-': '−', '1': '−', '=': '=', '2': '=', '#': '≡', '3': '≡',
  '~': '┄', '~-': '≃', '~--': '≅', '~=': '≅', '-~-': '≅',
  '...': '⋯', '....': '⋯·', '->': '→', '<-': '←', '<': '<', '>': '>',
}
const closingBrackets: Record<string, string> = { '(': ')', '[': ']', '\\{': '\\}' }
const isotopeBase = /^(?:[A-Z]|\$|\\[A-Za-z]+|[ne](?![a-z]))/
const element = /^(?:[A-Z][a-z]{0,2}|[ne](?![a-z]))/
const phase = /^\((?:aq|s|l|g)\)/
const digits = /^\d+/
const textWord = /^[a-z]{2,}/
const coefficient = /^[+-]?(?:\d+(?:[.,]\d+)?|\.\d+)/
const scriptValue = /^(?:[+-]?\d+|[A-Z]+|[a-z]|[.·*]+|\$|[()+\-])['′.+\-]*/
const rawCharge = /^(?:[+\-](?!>))+(?=\s*(?:$|[)\]}]|[+\-]\s|[<=>-]))/
const markedState = /^(?:\(([v^])\)|([v^])(?=\s|$))/
const fraction = /^(\d+)\s*\/\s*(\d+)(?!\d|[.,]\d)/
const upright = ' mathvariant="normal"'
const arrowNames = [...arrows.keys()]
const arrowSpace = '<mspace width="0.28em"/>'
const coefficientSpace = '<mspace width="0.17em"/>'

interface Scripts {
  end: number
  upper?: string
  lower?: string
}

function signed(value: string): string {
  return value.replaceAll('-', '−')
}

function groupAt(source: string, start: number, opening: string, closing: string): { content: string, end: number } {
  let depth = 1
  let braces = 0
  for (let at = start + opening.length; at < source.length;) {
    if (!braces && source.startsWith(closing, at) && --depth === 0)
      return { content: source.slice(start + opening.length, at), end: at + closing.length }
    const character = source[at]
    if (opening === '[' && character === '{') braces++
    else if (opening === '[' && character === '}') braces = Math.max(0, braces - 1)
    if (!braces && opening !== closing && source.startsWith(opening, at)) {
      depth++
      at += opening.length
    }
    else at += character === '\\' ? 2 : 1
  }
  throw new Error('Unclosed chemical notation group')
}

function readScript(source: string, start: number): { content: string, end: number } | undefined {
  if (source[start] === '{') return groupAt(source, start, '{', '}')
  if (source[start] === '$') {
    const value = groupAt(source, start, '$', '$')
    return { content: source.slice(start, value.end), end: value.end }
  }
  const raw = scriptValue.exec(source.slice(start))?.[0]
  if (!raw) return
  // A bond or reaction arrow can immediately follow a script.
  const content = raw.endsWith('-') && source[start + raw.length] === '>' ? raw.slice(0, -1) : raw
  if (content) return { content, end: start + content.length }
}

function readScripts(source: string, start: number): Scripts {
  const result: Scripts = { end: start }
  for (let i = 0; i < 2; i++) {
    const marker = source[result.end]
    if (marker !== '^' && marker !== '_') break
    const slot = marker === '^' ? 'upper' : 'lower'
    if (result[slot] !== undefined) break
    const value = readScript(source, result.end + 1)
    if (!value) break
    result[slot] = value.content
    result.end = value.end
  }
  return result
}

function renderScript(script: string | undefined, math: (source: string) => Markup): Markup {
  if (!script) return ''
  if (script.startsWith('$') && script.endsWith('$')) return xml`<mrow>${math(script.slice(1, -1))}</mrow>`
  if (script.startsWith('{') && script.endsWith('}')) return tag('mtext', script.slice(1, -1))
  if (/^[+\-]?\d+(?:[.,]\d+)?$/.test(script)) return tag('mn', signed(script))
  if (/^[a-z]$/.test(script)) return tag('mi', script)
  if (/^[A-Z]+$/.test(script)) return tag('mtext', script)
  const symbols: Markup[] = []
  for (const value of script.match(/[A-Za-z]+|\d+|./gu) ?? []) {
    if (/^[a-z]$/.test(value)) symbols.push(tag('mi', value))
    else if (/^[A-Z]+$/.test(value)) symbols.push(tag('mtext', value))
    else symbols.push(tag('mo', signed(value).replaceAll('.', '·').replaceAll("'", '′')))
  }
  return symbols.length > 1 && symbols.some(value => typeof value === 'string' && value.startsWith('<mi'))
    ? xml`<mrow>${joinMarkup(symbols)}</mrow>`
    : tag('mo', signed(script).replaceAll('.', '·').replaceAll("'", '′'))
}

export function chemicalFormula(source: string, math: (source: string) => Markup): Markup {
  if (source.length > 2048) return tag('mtext', source)
  let cursor = 0

  function balanced(open: string, close: string): string {
    const group = groupAt(source, cursor, open, close)
    cursor = group.end
    return group.content
  }

  function atom(base: Markup, prescripts?: Scripts, count = true): Markup {
    const quantity = count ? digits.exec(source.slice(cursor))?.[0] : undefined
    if (quantity) cursor += quantity.length
    let right = readScripts(source, cursor)
    if (right.upper !== undefined && /^\d+$/.test(right.upper) && isotopeBase.test(source.slice(right.end))) {
      // A bare mass number next to another element describes the next atom.
      right = { end: cursor }
    }
    cursor = right.end
    const charge = rawCharge.exec(source.slice(cursor))?.[0]
    if (charge) {
      right.upper = (right.upper ?? '') + charge
      cursor += charge.length
    }
    if (right.lower === undefined) {
      right.lower = quantity ?? (count && right.upper ? digits.exec(source.slice(cursor))?.[0] : undefined)
      if (!quantity && right.lower) cursor += right.lower.length
    }
    const lower = renderScript(right.lower, math)
    const upper = renderScript(right.upper, math)
    if (prescripts) {
      const after = lower || upper ? xml`${lower || '<none/>'}${upper || '<none/>'}` : ''
      const beforeLower = renderScript(prescripts.lower, math)
      const beforeUpper = renderScript(prescripts.upper, math)
      return xml`<mmultiscripts>${base}${after}<mprescripts/>${beforeLower || '<none/>'}${beforeUpper || '<none/>'}</mmultiscripts>`
    }
    if (lower && upper) return xml`<msubsup>${base}${lower}${upper}</msubsup>`
    if (lower) return xml`<msub>${base}${lower}</msub>`
    if (upper) return xml`<msup>${base}${upper}</msup>`
    return base
  }

  function labels(direction: string): Markup {
    let over: Markup = ''
    let under: Markup = ''
    if (source[cursor] === '[') over = renderLabel(balanced('[', ']'))
    if (source[cursor] === '[') under = renderLabel(balanced('[', ']'))
    const arrow = tag('mo', arrows.get(direction)!, ' stretchy="true"')
    if (over && under) return xml`${arrowSpace}<munderover>${arrow}${under}${over}</munderover>${arrowSpace}`
    if (over) return xml`${arrowSpace}<mover>${arrow}${over}</mover>${arrowSpace}`
    if (under) return xml`${arrowSpace}<munder>${arrow}${under}</munder>${arrowSpace}`
    return arrow
  }

  function renderLabel(label: string): Markup {
    const text = label.trim()
    if (!text) return ''
    if (text.startsWith('$') && text.endsWith('$')) return xml`<mrow>${math(text.slice(1, -1))}</mrow>`
    if (text.startsWith('{') && groupAt(text, 0, '{', '}').end === text.length)
      return tag('mtext', text.slice(1, -1))
    return chemicalFormula(text, math)
  }

  function sequence(end = '', depth = 0): Markup {
    if (depth > 80) throw new Error('Chemical notation is nested too deeply')
    const atoms: Markup[] = []
    while (cursor < source.length && !(end && source.startsWith(end, cursor))) {
      let rest = source.slice(cursor)
      const white = /^\s+/.exec(rest)
      if (white) { cursor += white[0].length; continue }
      const direction = arrowNames.find(arrow => rest.startsWith(arrow))
      if (direction) {
        cursor += direction.length
        atoms.push(labels(direction))
        continue
      }

      const state = phase.exec(rest)?.[0]
      if (state) {
        atoms.push(tag('mtext', state))
        cursor += state.length
        continue
      }

      let prefix: Scripts | undefined
      if (rest[0] === '^' || rest[0] === '_') {
        const candidate = readScripts(source, cursor)
        if (candidate.end > cursor && isotopeBase.test(source.slice(candidate.end))) {
          prefix = candidate
          cursor = candidate.end
          rest = source.slice(cursor)
        }
      }
      const symbol = element.exec(rest)?.[0]
      const opening = rest.startsWith('\\{') ? '\\{' : rest[0]
      const closing = closingBrackets[opening]
      const marker = markedState.exec(rest)
      if (symbol) {
        cursor += symbol.length
        atoms.push(atom(tag('mi', symbol, upright), prefix))
      }
      else if (marker) {
        atoms.push(tag('mo', (marker[1] ?? marker[2]) === '^' ? '↑' : '↓'))
        cursor += marker[0].length
      }
      else if (closing) {
        cursor += opening.length
        const inside = sequence(closing, depth + 1)
        if (!source.startsWith(closing, cursor)) throw new Error('Unclosed molecular group')
        cursor += closing.length
        const group = xml`<mrow>${tag('mo', opening.at(-1)!)}${inside}${tag('mo', closing.at(-1)!)}</mrow>`
        atoms.push(atom(group, prefix))
      }
      else if (rest[0] === '$') {
        const content = math(balanced('$', '$'))
        atoms.push(atom(xml`<mrow>${content}</mrow>`, prefix, false))
      }
      else if (rest[0] === '{') {
        const content = balanced('{', '}')
        if (content) atoms.push(atom(tag('mtext', content), prefix, false))
      }
      else if (/^\\(?:dfrac|tfrac|frac)\{/.test(rest)) {
        cursor += /^\\[dt]?frac/.exec(rest)![0].length
        const numerator = chemicalFormula(balanced('{', '}'), math)
        const denominator = chemicalFormula(balanced('{', '}'), math)
        atoms.push(xml`<mfrac>${numerator}${denominator}</mfrac>`)
      }
      else if (rest.startsWith('\\bond{')) {
        cursor += '\\bond'.length
        const bond = balanced('{', '}')
        if (!Object.hasOwn(bonds, bond)) throw new Error('Unknown chemical bond')
        atoms.push(tag('mo', bonds[bond]))
      }
      else if (rest[0] === '\\') {
        const command = /^\\(?:[A-Za-z@]+|.)/.exec(rest)?.[0]
        if (!command) throw new Error('Incomplete chemical command')
        cursor += command.length
        if (command === '\\ca') atoms.push(tag('mo', '∼'))
        else atoms.push(atom(math(command), prefix))
      }
      else {
        const fractionMatch = fraction.exec(rest)
        const amount = coefficient.exec(rest)?.[0]
        const word = textWord.exec(rest)?.[0]
        if (fractionMatch) {
          atoms.push(xml`<mfrac>${tag('mn', fractionMatch[1])}${tag('mn', fractionMatch[2])}</mfrac>`)
          cursor += fractionMatch[0].length
          if (/^\s*(?:[A-Z(\[]|\$)/.test(source.slice(cursor))) atoms.push(coefficientSpace)
        }
        else if (amount && ((rest[0] !== '.') || !atoms.length)) {
          atoms.push(tag('mn', signed(amount)))
          cursor += amount.length
          if (/^\s*(?:[A-Z(\[]|\$)/.test(source.slice(cursor))) atoms.push(coefficientSpace)
        }
        else if (word) {
          atoms.push(tag('mtext', word))
          cursor += word.length
        }
        else {
          const value = String.fromCodePoint(source.codePointAt(cursor)!)
          const glyph = value === '.' || value === '*' ? '·' : value === '#' ? '≡' : signed(value)
          if (glyph === '·') atoms.push(coefficientSpace, tag('mo', glyph, ' lspace="0" rspace="0"'), coefficientSpace)
          else atoms.push(tag(/^\p{L}$/u.test(value) ? 'mi' : 'mo', glyph))
          cursor += value.length
        }
      }
    }
    return joinMarkup(atoms)
  }

  return xml`<mrow class="math-chemistry">${sequence()}</mrow>`
}

const unitToken = /\s+|\/\/|\/|[*.·×]|[()]|[A-ZµμΩΩ°%‰′″]+(?:\^?\{?[+-]?\d+\}?)?|./giu
const unitTerm = /^([A-ZµμΩΩ°%‰′″]+)(?:\^?\{?([+-]?\d+)\}?)?$/iu
const unitSpace = '<mspace width="0.18em"/>'

function unitProduct(source: string): string {
  const parts: string[] = []
  const text = source.trim().replace(/\\%/g, '%')
  for (const token of text.match(unitToken) ?? []) {
    if (/^\s/.test(token)) {
      if (parts.length && parts.at(-1) !== unitSpace && !/^<mo>[·×/]/.test(parts.at(-1)!)) parts.push(unitSpace)
      continue
    }
    if (/^[*.·×/]$/.test(token)) {
      if (parts.at(-1) === unitSpace) parts.pop()
      parts.push(tag('mo', token === '*' || token === '.' ? '·' : token))
      continue
    }
    const unit = unitTerm.exec(token)
    if (unit) {
      const symbol = tag('mi', unit[1], upright)
      parts.push(unit[2] ? `<msup>${symbol}${tag('mn', signed(unit[2]))}</msup>` : symbol)
    }
    else parts.push(tag(/[()]/.test(token) ? 'mo' : 'mtext', token))
  }
  if (parts.at(-1) === unitSpace) parts.pop()
  return parts.join('')
}

const scientificQuantity = /^\s*([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+))(\(\d+(?:[.,]\d+)?\))?(?:(e|E|\s*(?:\*|×|x|\\times)\s*10\s*\^)\s*(?:\{([+-]?\d+)\}|([+-]?\d+)))?\s*(.*?)\s*$/s

export function physicalUnits(source: string): string {
  const [, value, uncertainty, notation, groupedPower, barePower, units = source] = scientificQuantity.exec(source) ?? []
  const power = groupedPower ?? barePower
  let formatted = value ? tag('mn', signed(value + (uncertainty ?? ''))) : ''
  if (power) {
    const multiply = /^(?:e|\*)/.test(notation.trim()) ? '·' : '×'
    formatted += `${tag('mo', multiply)}<msup><mn>10</mn>${tag('mn', signed(power))}</msup>`
  }
  if (units.trim()) {
    const division = units.split('//')
    const body = division.length === 2 && division.every(part => part.trim())
      ? `<mfrac><mrow>${unitProduct(division[0])}</mrow><mrow>${unitProduct(division[1])}</mrow></mfrac>`
      : unitProduct(units)
    formatted += (formatted ? '<mspace width="0.26em"/>' : '') + body
  }
  return `<mrow class="math-units">${formatted}</mrow>`
}
