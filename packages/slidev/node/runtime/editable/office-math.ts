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

function only(node: RawMathElement, ...names: string[]): boolean {
  return Object.keys(node.attributes).every(name => names.includes(name))
}

function stretchyFence(node: RawMathElement | undefined, fences: ReadonlySet<string>): node is RawMathElement {
  return !!node && node.name === 'mo' && node.attributes.stretchy === 'true'
    && only(node, 'stretchy', 'fence') && fences.has(node.text) && !node.children.length
}

/** Convert presentation MathML to the structures in the Office Math schema.
 * Decline formulas whose presentation would be lost in the editable shape.
 */
export function officeMath(root: RawMathElement, fontSize: number, color: Rgba): string | undefined {
  const size = Math.max(100, Math.min(400000, Math.round(fontSize * PT_PER_PX * 100)))
  const hex = [color.r, color.g, color.b].map(value => Math.round(value).toString(16).padStart(2, '0')).join('').toUpperCase()
  const properties = `<a:rPr sz="${size}"><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill><a:latin typeface="Cambria Math"/></a:rPr>`
  const wrap = (name: string, content: string) => `<m:${name}>${content}</m:${name}>`
  function sequence(nodes: readonly RawMathElement[]): string | undefined {
    let output = ''
    for (const node of nodes) {
      const item = convert(node)
      if (item === undefined) return
      output += item
    }
    return output
  }
  function convert(node: RawMathElement): string | undefined {
    const { name, text, attributes, children } = node
    if (tokenNames.has(name)) {
      if (children.length || !only(node, 'mathvariant', 'stretchy') || attributes.stretchy === 'true') return
      if (attributes.mathvariant !== undefined && attributes.mathvariant !== 'normal') return
      // XML 1.0 forbids control characters even inside a text run.
      // eslint-disable-next-line no-control-regex
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/.test(text)) return
      const italic = name === 'mi' && !attributes.mathvariant && /^[\p{Script=Latin}\p{Script=Greek}]\p{M}*$/u.test(text)
      return wrap('r', `<m:rPr><m:sty m:val="${italic ? 'i' : 'p'}"/></m:rPr>${properties}<m:t xml:space="preserve">${escapeHtml(text)}</m:t>`)
    }
    if (text.trim()) return
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
