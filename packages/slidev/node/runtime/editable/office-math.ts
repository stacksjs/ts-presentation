import { escapeHtml } from '../html.ts'
import type { RawMathElement, Rgba } from './ir.ts'
import { PT_PER_PX } from './ir.ts'

const tokenNames = new Set(['mi', 'mn', 'mo', 'mtext'])
const scriptProperties: Readonly<Record<string, readonly string[]>> = {
  msub: ['sSub', 'sub'],
  msup: ['sSup', 'sup'],
  msubsup: ['sSubSup', 'sub', 'sup'],
}
const leftFences = new Set(['(', '[', '{', '|', '‖', '⟨', '⌈', '⌊'])
const rightFences = new Set([')', ']', '}', '|', '‖', '⟩', '⌉', '⌋'])
const naryGlyphs = new Set('∑∏∐∫∬∭∮∯∰⋀⋁⋂⋃⨀⨁⨂⨄⨆')
const termSeparators = new Set('+−-±∓=<>≤≥≠≈≡∼≃∈∉∋⊂⊃⊆⊇,;:→⇒↔|‖')
const accents: Readonly<Record<string, string>> = {
  '^': '\u0302', 'ˆ': '\u0302', '˜': '\u0303', '~': '\u0303', '˙': '\u0307', '¨': '\u0308',
  '´': '\u0301', 'ˊ': '\u0301', '`': '\u0300', 'ˋ': '\u0300', '˘': '\u0306', 'ˇ': '\u030c',
  '˚': '\u030a', 'ˉ': '\u0304', '→': '\u20d7', '⃗': '\u20d7',
}
const stretchMarks = new Set(['⏞', '⏟', '←', '→', '↔', '⇐', '⇒', '⇔', '↼', '⇀'])
const spaces = [[0.17, '\u2009'], [2 / 9, '\u205f'], [5 / 18, '\u2005'], [0.5, '\u2002'], [1, '\u2003'], [2, '\u2003\u2003']] as const

function only(node: RawMathElement, ...names: string[]): boolean {
  return Object.keys(node.attributes).every(name => names.includes(name))
}

function stretchyFence(node: RawMathElement | undefined, fences: ReadonlySet<string>): node is RawMathElement {
  return !!node && node.name === 'mo' && node.attributes.stretchy === 'true'
    && only(node, 'stretchy', 'fence') && fences.has(node.text) && !node.children.length
}

function operatorLimits(node: RawMathElement): { glyph: string, location: 'subSup' | 'undOvr', sub?: RawMathElement, sup?: RawMathElement } | undefined {
  const [base, first, second] = node.children
  if (!base || base.name !== 'mo' || !naryGlyphs.has(base.text) || base.children.length
    || !only(base) || !only(node) || node.text.trim()) return
  const { name } = node
  const side = name === 'msub' || name === 'msup' || name === 'msubsup'
  if (!side && name !== 'munder' && name !== 'mover' && name !== 'munderover') return
  const both = name === 'msubsup' || name === 'munderover'
  if (node.children.length !== (both ? 3 : 2)) return
  const upperOnly = name === 'msup' || name === 'mover'
  return { glyph: base.text, location: side ? 'subSup' : 'undOvr', sub: upperOnly ? undefined : first, sup: upperOnly ? first : second }
}

function followingTerm(nodes: readonly RawMathElement[], start: number): number {
  let depth = 0
  let index = start
  for (; index < nodes.length; index++) {
    const node = nodes[index]
    if (node.name !== 'mo') continue
    const glyph = node.text
    if (depth === 0 && termSeparators.has(glyph)) break
    if (leftFences.has(glyph) && !rightFences.has(glyph)) depth++
    if (rightFences.has(glyph) && !leftFences.has(glyph)) {
      if (depth === 0) break
      depth--
    }
  }
  return depth === 0 ? index : start
}

/** Convert presentation MathML to the structures in the Office Math schema.
 * Decline formulas whose presentation would be lost in the editable shape.
 */
export function officeMath(root: RawMathElement, fontSize: number, color: Rgba): string | undefined {
  const size = Math.max(100, Math.min(400000, Math.round(fontSize * PT_PER_PX * 100)))
  const hex = [color.r, color.g, color.b].map(value => Math.round(value).toString(16).padStart(2, '0')).join('').toUpperCase()
  const properties = `<a:rPr sz="${size}"><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill><a:latin typeface="Cambria Math"/></a:rPr>`
  const wrap = (name: string, content: string) => `<m:${name}>${content}</m:${name}>`
  const setting = (name: string, value: string) => `<m:${name} m:val="${escapeHtml(value)}"/>`
  const run = (text: string, italic = false) =>
    wrap('r', `<m:rPr><m:sty m:val="${italic ? 'i' : 'p'}"/></m:rPr>${properties}<m:t xml:space="preserve">${escapeHtml(text)}</m:t>`)
  function sequence(nodes: readonly RawMathElement[]): string | undefined {
    let output = ''
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index]
      const limits = operatorLimits(node)
      if (limits) {
        const end = followingTerm(nodes, index + 1)
        if (end > index + 1) {
          const body = sequence(nodes.slice(index + 1, end))
          const sub = limits.sub ? convert(limits.sub) : ''
          const sup = limits.sup ? convert(limits.sup) : ''
          if (body === undefined || sub === undefined || sup === undefined) return
          if (body) {
            const options = setting('chr', limits.glyph) + setting('limLoc', limits.location)
              + (limits.sub ? '' : setting('subHide', '1')) + (limits.sup ? '' : setting('supHide', '1'))
            output += wrap('nary', wrap('naryPr', options) + wrap('sub', sub) + wrap('sup', sup) + wrap('e', body))
            index = end - 1
            continue
          }
        }
      }
      const item = convert(node)
      if (item === undefined) return
      output += item
    }
    return output
  }
  function underOver(node: RawMathElement): string | undefined {
    const { name, attributes, children } = node
    const both = name === 'munderover'
    if (children.length !== (both ? 3 : 2)) return
    const [base, first, last] = children
    const body = convert(base)
    if (body === undefined) return
    if (!both && (attributes.accent === 'true' || attributes.accentunder === 'true')) {
      const below = name === 'munder'
      if (!only(node, below ? 'accentunder' : 'accent') || first.name !== 'mo'
        || first.children.length || !only(first, 'stretchy')) return
      const glyph = first.text
      if (first.attributes.stretchy === 'true' && stretchMarks.has(glyph)) {
        const options = setting('chr', glyph) + setting('pos', below ? 'bot' : 'top') + setting('vertJc', below ? 'top' : 'bot')
        return wrap('groupChr', wrap('groupChrPr', options) + wrap('e', body))
      }
      const accent = Object.hasOwn(accents, glyph) ? accents[glyph] : undefined
      if (below || !accent) return
      return wrap('acc', wrap('accPr', setting('chr', accent)) + wrap('e', body))
    }
    if (!only(node)) return
    const label = convert(first)
    if (label === undefined) return
    const limit = (tag: string, content: string, value: string) => wrap(tag, wrap('e', content) + wrap('lim', value))
    if (!both) return limit(name === 'munder' ? 'limLow' : 'limUpp', body, label)
    const upper = convert(last)
    if (upper !== undefined) return limit('limUpp', limit('limLow', body, label), upper)
  }
  function convert(node: RawMathElement): string | undefined {
    const { name, text, attributes, children } = node
    if (tokenNames.has(name)) {
      if (children.length || !only(node, 'mathvariant', 'stretchy', 'lspace', 'rspace') || attributes.stretchy === 'true') return
      if ([attributes.lspace, attributes.rspace].some(value => value !== undefined && value !== '0em')) return
      if (attributes.mathvariant !== undefined && attributes.mathvariant !== 'normal') return
      // XML 1.0 forbids control characters even inside a text run.
      // eslint-disable-next-line no-control-regex
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/.test(text)) return
      const italic = name === 'mi' && !attributes.mathvariant && /^[\p{Script=Latin}\p{Script=Greek}]\p{M}*$/u.test(text)
      return run(text, italic)
    }
    if (text.trim()) return
    if (name === 'munder' || name === 'mover' || name === 'munderover') return underOver(node)
    if (name === 'mspace' && only(node, 'width') && !children.length && /^\d+(?:\.\d+)?em$/.test(attributes.width ?? '')) {
      const width = Number.parseFloat(attributes.width)
      if (width === 0) return ''
      const space = spaces.find(([size]) => Math.abs(width - size) < 0.006)
      if (space) return run(space[1])
      return
    }
    if (name === 'mrow' && only(node, 'class') && children.length === 1
      && (attributes.class === 'math-overline' || attributes.class === 'math-underline')) {
      const body = convert(children[0])
      if (body === undefined) return
      const options = setting('pos', attributes.class === 'math-overline' ? 'top' : 'bot')
      return wrap('bar', wrap('barPr', options) + wrap('e', body))
    }
    if (name === 'mrow' && only(node)) {
      const left = children[0]
      const right = children.at(-1)
      if (children.length > 2 && stretchyFence(left, leftFences) && stretchyFence(right, rightFences)) {
        const expression = sequence(children.slice(1, -1))
        if (expression === undefined) return
        return wrap('d', `<m:dPr><m:begChr m:val="${escapeHtml(left.text)}"/><m:endChr m:val="${escapeHtml(right.text)}"/></m:dPr>${wrap('e', expression)}`)
      }
      return sequence(children)
    }
    if (name === 'mstyle' && only(node, 'displaystyle', 'scriptlevel') && attributes.scriptlevel === '0')
      return sequence(children)
    if (name === 'mtable' && only(node, 'data-equation-lines')) {
      const columns = children[0]?.children.length
      if (!columns || !children.every(row => row.name === 'mtr' && !row.text.trim() && only(row)
        && row.children.length === columns && row.children.every(cell => cell.name === 'mtd' && !cell.text.trim() && only(cell)))) return
      let rows = ''
      for (const row of children) {
        let entries = ''
        for (const cell of row.children) {
          const expression = sequence(cell.children)
          if (expression === undefined) return
          entries += wrap('e', expression)
        }
        rows += wrap('mr', entries)
      }
      return wrap('m', rows)
    }
    if (name === 'mfrac' && only(node, 'linethickness') && children.length === 2) {
      if (attributes.linethickness !== undefined && !/^0(?:em|px)?$/.test(attributes.linethickness)) return
      const numerator = convert(children[0])
      const denominator = convert(children[1])
      if (numerator === undefined || denominator === undefined) return
      const rule = attributes.linethickness === undefined ? '' : '<m:fPr><m:type m:val="noBar"/></m:fPr>'
      return wrap('f', rule + wrap('num', numerator) + wrap('den', denominator))
    }
    if (!only(node)) return
    if (name === 'msqrt') {
      const expression = sequence(children)
      if (!expression) return
      return wrap('rad', `<m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>${wrap('e', expression)}`)
    }
    if (name === 'mroot' && children.length === 2) {
      const radicand = convert(children[0])
      const index = convert(children[1])
      if (radicand === undefined || index === undefined) return
      return wrap('rad', wrap('deg', index) + wrap('e', radicand))
    }
    const script = Object.hasOwn(scriptProperties, name) ? scriptProperties[name] : undefined
    if (script && children.length === script.length) {
      const expressions = children.map(convert)
      if (expressions.some(value => value === undefined)) return
      const [element, ...positions] = script
      return wrap(element, wrap('e', expressions[0]!) + positions.map((position, index) => wrap(position, expressions[index + 1]!)).join(''))
    }
  }
  return convert(root) || undefined
}
