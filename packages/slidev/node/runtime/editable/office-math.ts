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
const strikeProperties: Readonly<Record<string, readonly string[]>> = {
  'math-cancel': ['strikeBLTR'],
  'math-bcancel': ['strikeTLBR'],
  'math-xcancel': ['strikeBLTR', 'strikeTLBR'],
  'math-sout': ['strikeH'],
}
const alignmentCellStyles = new Set([
  'text-align:left', 'text-align:right', 'text-align:center', '--math-cell-align:end', '--math-cell-align:center',
  'padding-inline:0', 'padding-inline-start:1em', 'math-style:normal', 'padding-block:0.125em',
])
const measuredCellSpacing = /^(?:padding-block:\d+(?:\.\d+)?em|padding-bottom:max\(0px,calc\(\d+(?:\.\d+)?em \+ [+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:em|ex|px|pt|pc|cm|mm|in)\)\))$/

function only(node: RawMathElement, ...names: string[]): boolean {
  return Object.keys(node.attributes).every(name => names.includes(name))
}

function emptyElement(node: RawMathElement | undefined, name: string): boolean {
  return !!node && node.name === name && !node.children.length && !node.text.trim() && only(node)
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
  let opacity = color.a
  let bold = false
  let italicText = false
  const properties = () => {
    const paint = opacity === 1 ? `<a:srgbClr val="${hex}"/>` : `<a:srgbClr val="${hex}"><a:alpha val="${Math.round(opacity * 100000)}"/></a:srgbClr>`
    return `<a:rPr sz="${size}"><a:solidFill>${paint}</a:solidFill><a:latin typeface="Cambria Math"/></a:rPr>`
  }
  const wrap = (name: string, content: string) => `<m:${name}>${content}</m:${name}>`
  const setting = (name: string, value: string) => `<m:${name} m:val="${escapeHtml(value)}"/>`
  const run = (text: string, italic = false) =>
    wrap('r', `<m:rPr><m:sty m:val="${(bold ? 'b' : '') + (italic ? 'i' : '') || 'p'}"/></m:rPr>${properties()}<m:t xml:space="preserve">${escapeHtml(text)}</m:t>`)
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
  function enclosure(node: RawMathElement): string | undefined {
    const style = node.attributes.class
    const strikes = Object.hasOwn(strikeProperties, style) ? strikeProperties[style] : undefined
    const actuarial = style === 'math-angl'
    if (!strikes && !actuarial && style !== 'math-color-box math-frame') return
    let children = node.children
    if (strikes && style !== 'math-sout') {
      const track = children.at(-1)
      if (track?.name !== 'mspace' || track.attributes.class !== 'math-cancel-track'
        || track.attributes['aria-hidden'] !== 'true' || !only(track, 'class', 'aria-hidden')
        || track.children.length || track.text.trim()) return
      children = children.slice(0, -1)
    }
    const body = sequence(children)
    if (!body) return
    const properties = strikes ? ['hideTop', 'hideBot', 'hideLeft', 'hideRight', ...strikes]
      : actuarial ? ['hideBot', 'hideLeft'] : []
    const options = properties.map(property => setting(property, '1')).join('')
    return wrap('borderBox', (options ? wrap('borderBoxPr', options) : '') + wrap('e', body))
  }
  function phantom(node: RawMathElement): string | undefined {
    const padded = node.name === 'mpadded'
    const { width, height, depth } = node.attributes
    if (padded) {
      const dimensions = Object.values(node.attributes)
      if (!only(node, 'width', 'height', 'depth') || !dimensions.length || dimensions.some(value => value !== '0')) return
    }
    else if (!only(node)) return
    const [child] = node.children
    const hiddenChild = padded && node.children.length === 1 && child.name === 'mphantom'
    if (hiddenChild && (!only(child) || child.text.trim())) return
    const hidden = !padded || hiddenChild
    const body = sequence(hiddenChild ? child.children : node.children)
    if (!body) return body
    const options = setting('show', hidden ? '0' : '1')
      + (width ? setting('zeroWid', '1') : '')
      + (height ? setting('zeroAsc', '1') : '')
      + (depth ? setting('zeroDesc', '1') : '')
    return wrap('phant', wrap('phantPr', options) + wrap('e', body))
  }
  function prescript(node: RawMathElement): string | undefined {
    const { children } = node
    if (children.length !== 4 && children.length !== 6) return
    const marker = children.length - 3
    if (!emptyElement(children[marker], 'mprescripts')) return
    const index = (child: RawMathElement) => emptyElement(child, 'none') ? '' : convert(child)
    const leftSub = index(children[marker + 1])
    const leftSup = index(children[marker + 2])
    const base = convert(children[0])
    if (leftSub === undefined || leftSup === undefined || !base) return
    let body = base
    if (marker === 3) {
      const sub = index(children[1])
      const sup = index(children[2])
      if (sub === undefined || sup === undefined) return
      const script = sub && sup ? 'sSubSup' : sub ? 'sSub' : 'sSup'
      if (sub || sup) body = wrap(script, wrap('e', base) + (sub ? wrap('sub', sub) : '') + (sup ? wrap('sup', sup) : ''))
    }
    return leftSub || leftSup ? wrap('sPre', wrap('sub', leftSub) + wrap('sup', leftSup) + wrap('e', body)) : body
  }
  function equationArray(table: RawMathElement, environment: string): string | undefined {
    if (!/^(?:align(?:ed|at|edat)?|gather(?:ed)?|split)[*]?$/.test(environment)
      || !only(table, 'class', 'style', 'columnalign', 'data-equation-lines', 'data-math-array', 'data-equation-environment', 'data-equation-tags', 'data-equation-flush')) return
    const aligned = !environment.startsWith('gather')
    let rows = ''
    for (const row of table.children) {
      if (row.name !== 'mtr' || row.text.trim() || !only(row, 'data-equation-dim') || !row.children.length
        || (!aligned && row.children.length !== 1)) return
      const rowOpacity = row.opacity ?? 1
      if (!Number.isFinite(rowOpacity) || rowOpacity < 0 || rowOpacity > 1) return
      const previous = opacity
      opacity *= rowOpacity
      try {
        let expression = ''
        for (const [index, cell] of row.children.entries()) {
          const styles = (cell.attributes.style ?? '').split(';').filter(Boolean)
          if (cell.name !== 'mtd' || cell.text.trim() || !only(cell, 'style')
            || !styles.every(style => alignmentCellStyles.has(style))) return
          const content = sequence(cell.children)
          // Ampersands inside an Office equation array are alignment syntax.
          if (content === undefined || content.includes('&amp;')) return
          if (index > 0) expression += run('&')
          if (styles.includes('padding-inline-start:1em')) expression += run('\u2003')
          expression += content
        }
        rows += wrap('e', expression)
      }
      finally { opacity = previous }
    }
    if (rows) return wrap('eqArr', rows)
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
      const italic = name === 'mtext' ? italicText
        : name === 'mi' && !attributes.mathvariant && /^[\p{Script=Latin}\p{Script=Greek}]\p{M}*$/u.test(text)
      return run(text, italic)
    }
    if (text.trim()) return
    if (name === 'mtd' && only(node, 'style')) {
      const styles = (attributes.style ?? '').split(';').filter(Boolean)
      if (styles.every(style => alignmentCellStyles.has(style) || measuredCellSpacing.test(style))) return sequence(children)
      return
    }
    if (name === 'munder' || name === 'mover' || name === 'munderover') return underOver(node)
    if (name === 'mphantom' || name === 'mpadded') return phantom(node)
    if (name === 'mmultiscripts' && only(node)) return prescript(node)
    if (name === 'mspace' && only(node, 'width') && !children.length && /^\d+(?:\.\d+)?em$/.test(attributes.width ?? '')) {
      const width = Number.parseFloat(attributes.width)
      if (width === 0) return ''
      const space = spaces.find(([size]) => Math.abs(width - size) < 0.006)
      if (space) return run(space[1])
      return
    }
    if (name === 'mrow' && attributes.class && only(node, 'class')) {
      if (attributes.class === 'math-chemistry') return sequence(children)
      if (children.length === 1 && (attributes.class === 'math-overline' || attributes.class === 'math-underline')) {
        const body = convert(children[0])
        if (body === undefined) return
        const options = setting('pos', attributes.class === 'math-overline' ? 'top' : 'bot')
        return wrap('bar', wrap('barPr', options) + wrap('e', body))
      }
      return enclosure(node)
    }
    const upright = attributes.class === 'math-normal' && attributes.mathvariant === 'normal' && only(node, 'class', 'mathvariant')
    if (name === 'mrow' && (upright || (only(node, 'style') && attributes.style))) {
      const previousBold = bold
      const previousItalic = italicText
      try {
        const styles = upright ? ['font-weight:normal', 'font-style:normal'] : attributes.style.split(';').filter(Boolean)
        for (const style of styles) {
          if (style === 'font-weight:bold' || style === 'font-weight:normal') bold = style.endsWith('bold')
          else if (style === 'font-style:italic' || style === 'font-style:normal') italicText = style.endsWith('italic')
          else return
        }
        return sequence(children)
      }
      finally {
        bold = previousBold
        italicText = previousItalic
      }
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
    if (name === 'mtable' && attributes['data-equation-environment'])
      return equationArray(node, attributes['data-equation-environment'])
    if (name === 'mtable' && attributes.class === 'math-alignment-axis' && only(node, 'class') && children.length === 1) {
      const [row] = children
      const [cell] = row.children
      if (row.name === 'mtr' && only(row) && !row.text.trim() && row.children.length === 1
        && cell.name === 'mtd' && only(cell) && !cell.text.trim()) return sequence(cell.children)
      return
    }
    if (name === 'mtable' && only(node, 'data-equation-lines', 'data-math-array')) {
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
