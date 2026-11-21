import { MathParseError } from './math-error.ts'
import { escapeHtml } from './html.ts'
import { mathArrowBody, stackMathArrow } from './math-arrow.ts'
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
  primes?: { text: string, beforeUpper: boolean }
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
  throw new MathParseError('Unclosed chemical notation group')
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

function readScripts(source: string, start: number, allowPrime = false): Scripts {
  const result: Scripts = { end: start }
  for (;;) {
    const prime = allowPrime && !result.primes && /^['′″‴⁗]+/.exec(source.slice(result.end))?.[0]
    if (prime) {
      result.primes = { text: prime.replaceAll("'", '′'), beforeUpper: result.upper === undefined }
      result.end += prime.length
      continue
    }
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

function renderScript(script: string | undefined, math: (source: string) => Markup, subscript = false): Markup {
  if (!script) return ''
  if (script.startsWith('$') && script.endsWith('$')) return xml`<mrow>${math(script.slice(1, -1))}</mrow>`
  if (script.startsWith('{') && script.endsWith('}')) return tag('mtext', script.slice(1, -1))
  if (/^[+\-]?\d+(?:[.,]\d+)?$/.test(script)) return tag('mn', signed(script))
  if (/^[a-z]$/.test(script)) return tag('mi', script)
  if (/^[A-Za-z]+$/.test(script)) return tag('mtext', script)
  const operator = (value: string) => tag('mo', signed(value).replaceAll('.', '·').replaceAll("'", '′'))
  if (!/[A-Za-z]/.test(script)) return operator(script)
  const symbols = (script.match(/[A-Za-z]+|\d+|[^\s]/gu) ?? []).map((value, index) => {
    if (subscript && index === 0 && value === 'i' && script.startsWith('i,')) return tag('mi', 'i', upright)
    if (/^[a-z]$/.test(value)) return tag('mi', value)
    if (/^[A-Za-z]+$/.test(value)) return tag('mtext', value)
    if (/^\d+$/.test(value)) return tag('mn', value)
    return operator(value)
  })
  return `<mrow>${symbols.join('')}</mrow>`
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
    let right = readScripts(source, cursor, true)
    if (!right.primes && right.upper !== undefined && /^\d+$/.test(right.upper) && isotopeBase.test(source.slice(right.end))) {
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
    const lower = renderScript(right.lower, math, true)
    let upper = right.upper === 'x' && lower ? tag('mo', '×') : renderScript(right.upper, math)
    if (right.primes) {
      const prime = tag('mo', right.primes.text)
      if (!upper) upper = prime
      else {
        const scripts = right.primes.beforeUpper ? [prime, upper] : [upper, prime]
        upper = xml`<mrow>${joinMarkup(scripts)}</mrow>`
      }
    }
    if (prescripts) {
      const after = lower || upper ? xml`${lower || '<none/>'}${upper || '<none/>'}` : ''
      const beforeLower = renderScript(prescripts.lower, math, true)
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
    const bias = direction === '<<=>' ? 'left' : direction === '<=>>' ? 'right' : undefined
    const symbol = arrows.get(direction)!
    const arrow = stackMathArrow(mathArrowBody(symbol, '1.75em', bias), over, under)
    return xml`${arrowSpace}${arrow}${arrowSpace}`
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
    if (depth > 80) throw new MathParseError('Chemical notation is nested too deeply')
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
        if (!source.startsWith(closing, cursor)) throw new MathParseError('Unclosed molecular group')
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
        if (!Object.hasOwn(bonds, bond)) throw new MathParseError('Unknown chemical bond')
        atoms.push(tag('mo', bonds[bond]))
      }
      else if (rest[0] === '\\') {
        const command = /^\\(?:[A-Za-z@]+|.)/.exec(rest)?.[0]
        if (!command) throw new MathParseError('Incomplete chemical command')
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

const unitToken = /^(?:\s+|\/\/|[/*.·×()]|[A-ZµμΩΩ°%‰′″]+|\\[A-Z]+|.)/iu
const unitSymbol = /^[A-ZµμΩΩ°%‰′″]+$/iu
const exponent = /^(?:\^?\{([+-]?\d+)\}|\^?([+-]?\d+))/
const unitSpace = '<mspace width="0.18em"/>'

function unitProduct(source: string, depth = 0): string {
  if (depth > 50) throw new MathParseError('Physical unit groups are nested too deeply')
  const parts: string[] = []
  const text = source.trim()
  for (let cursor = 0; cursor < text.length;) {
    const opening = text[cursor]
    if (opening === '{' || opening === '(') {
      const closing = opening === '(' ? ')' : '}'
      const group = groupAt(text, cursor, opening, closing)
      const inside = unitProduct(group.content, depth + 1)
      const value = opening === '(' ? `<mo stretchy="false">(</mo>${inside}<mo stretchy="false">)</mo>` : inside
      const power = exponent.exec(text.slice(group.end))
      const base = `<mrow>${value}</mrow>`
      parts.push(power ? `<msup>${base}${tag('mn', signed(power[1] ?? power[2]))}</msup>` : base)
      cursor = group.end + (power?.[0].length ?? 0)
      continue
    }
    const token = unitToken.exec(text.slice(cursor))?.[0] ?? text[cursor]
    cursor += token.length
    if (/^\s/.test(token)) {
      if (parts.length && parts.at(-1) !== unitSpace && !/^<mo>[·×/]/.test(parts.at(-1)!)) parts.push(unitSpace)
      continue
    }
    if (token === '//' || /^[*.·×/]$/.test(token)) {
      if (parts.at(-1) === unitSpace) parts.pop()
      if (token === '//' && parts.length && text.slice(cursor).trim()) {
        const denominator = unitProduct(text.slice(cursor), depth + 1)
        return `<mfrac><mrow>${parts.join('')}</mrow><mrow>${denominator}</mrow></mfrac>`
      }
      if (token === '/' && (parts.length > 1 || /[\s()*/]/.test(text.slice(cursor).trim()))) {
        parts.push(unitSpace, '<mo>/</mo>', unitSpace)
        continue
      }
      parts.push(tag('mo', token === '*' || token === '.' ? '·' : token))
      continue
    }
    if (unitSymbol.test(token)) {
      const symbol = tag('mi', token, upright)
      const power = exponent.exec(text.slice(cursor))
      parts.push(power ? `<msup>${symbol}${tag('mn', signed(power[1] ?? power[2]))}</msup>` : symbol)
      cursor += power?.[0].length ?? 0
    }
    else parts.push(tag(/[()]/.test(token) ? 'mo' : 'mtext', token))
  }
  if (parts.at(-1) === unitSpace) parts.pop()
  return parts.join('')
}

const scientificExponent = /^(e|E|\s*(?:\*|×|x|\\times|\\cdot)\s*10\s*\^)\s*(?:\{([+-]?\d+)\}|([+-]?\d+))/
const unitQuantity = /^(\+\/-|\+-|±|\\pm(?![A-Za-z])|[+-])?\s*(\d+(?:[.,]\d+)?|[.,]\d+)(?:\((\d+(?:[.,]\d+)?)\))?/
const plusMinus = /^(?:±|\+\/-|\+-|\\pm(?![A-Za-z]))/
const digitSpace = '<mspace width="0.1111em"/>'

function digitGroups(value: string): string[] {
  const [, whole, decimal = '', fraction = ''] = /^(\d*)(?:([.,])(\d+))?$/.exec(value) ?? []
  const split = whole.length % 3 || 3
  const before = whole.length > 4 ? [whole.slice(0, split), ...whole.slice(split).match(/\d{3}/g)!] : [whole]
  const after = fraction.length > 4 ? fraction.match(/\d{1,3}/g)! : [fraction]
  before[before.length - 1] += decimal + after.shift()
  return [...before, ...after]
}

function readUnitQuantity(source: string): { markup: string, end: number } | undefined {
  const number = unitQuantity.exec(source)
  const scientific = scientificExponent.exec(number ? source.slice(number[0].length) : source)
  if (!number && !scientific) return
  if (!number && !/^[Ee]$/.test(scientific![1])) return
  let markup = ''
  let end = number?.[0].length ?? 0
  if (number) {
    const [, sign = '', value, uncertainty] = number
    const groups = digitGroups(value)
    const errors = uncertainty ? digitGroups(uncertainty) : []
    const isPlusMinus = plusMinus.test(sign)
    if (!isPlusMinus) groups[0] = signed(sign) + groups[0]
    if (errors.length === 1 && groups.length === 1) groups[0] += `(${errors.pop()})`
    const grouped = groups.map(group => tag('mn', group)).join(digitSpace)
    const error = errors.length ? `<mo stretchy="false">(</mo>${errors.map(group => tag('mn', group)).join(digitSpace)}<mo stretchy="false">)</mo>` : ''
    markup = (isPlusMinus ? '<mo>±</mo>' : '') + grouped + error
    const plainPower = source[end] === '^' ? exponent.exec(source.slice(end)) : undefined
    if (plainPower) return { markup: `<msup><mrow>${markup}</mrow>${tag('mn', signed(plainPower[1] ?? plainPower[2]))}</msup>`, end: end + plainPower[0].length }
  }
  if (scientific) {
    const power = scientific[2] ?? scientific[3]
    if (number) markup += tag('mo', /^(?:e|\*|\\cdot)/.test(scientific[1].trim()) ? '·' : '×')
    markup += `<msup><mn>10</mn>${tag('mn', signed(power))}</msup>`
    end += scientific[0].length
  }
  return { markup, end }
}

function measurement(source: string): { markup: string, end: number } | undefined {
  const first = readUnitQuantity(source)
  if (!first) return
  const rest = source.slice(first.end)
  const start = rest.length - rest.trimStart().length
  const connector = plusMinus.exec(rest.slice(start))
  if (!connector) return first
  const next = start + connector[0].length
  const value = rest.slice(next).trimStart()
  const second = readUnitQuantity(value)
  if (!second) return first
  return { markup: `${first.markup}<mo>±</mo>${second.markup}`, end: first.end + rest.length - value.length + second.end }
}

const unitAliases: Record<string, string> = { mu: 'μ', Omega: 'Ω', degree: '°', cdot: '·', times: '×' }

export function physicalUnits(source: string): string {
  const text = source.trim().replaceAll('−', '-')
  let quantity = measurement(text)
  if (text.startsWith('(')) {
    const group = groupAt(text, 0, '(', ')')
    const inside = group.content.trim()
    const measured = measurement(inside)
    if (measured?.end === inside.length)
      quantity = { markup: `<mo stretchy="false">(</mo>${measured.markup}<mo stretchy="false">)</mo>`, end: group.end }
  }
  const units = text.slice(quantity?.end ?? 0).trim().replace(/\\%/g, '%')
    .replace(/\\(mu|Omega|degree|cdot|times)(?![A-Za-z])[ \t]*/g, (_, command) => unitAliases[command])
    .replace(/\^(?:o|\{o\})(?=[CF]\b)/g, '°')
  const formatted = (quantity?.markup ?? '') + (units ? (quantity ? '<mspace width="0.26em"/>' : '') + unitProduct(units) : '')
  return `<mrow class="math-units">${formatted}</mrow>`
}
