import { escapeHtml } from '../html.ts'
import { baseMathLetters } from '../math-alphabets.ts'
import { texArrowMinWidth } from '../math-arrow.ts'
import type { MathStyle } from '../math-markup.ts'
import { fractionStyle, scriptStyle } from '../math-markup.ts'
import { nullDelimiterWidth } from '../math-sizing.ts'
import { parseColor } from './color.ts'
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
const zeroLength = /^-?0(?:\.0+)?[a-z]+$/
const stretchMarks = new Set(['⏞', '⏟', '⏠', '⏡', '←', '→', '↔', '⇐', '⇒', '⇔', '↼', '⇀', '↽', '⇁'])
const extensibleArrows = new Set(['←', '→', '↔', '⇐', '⇒', '⇔'])
const nullFenceSpace = '\u200a'
const spaces = [[Number.parseFloat(nullDelimiterWidth), nullFenceSpace], [0.17, '\u2009'], [2 / 9, '\u205f'], [5 / 18, '\u2005'], [0.5, '\u2002'], [1, '\u2003'], [2, '\u2003\u2003']] as const
const strikeProperties: Readonly<Record<string, readonly string[]>> = {
  'math-cancel': ['strikeBLTR'],
  'math-bcancel': ['strikeTLBR'],
  'math-xcancel': ['strikeBLTR', 'strikeTLBR'],
  'math-sout': ['strikeH'],
}
const alignmentCellStyles = new Set([
  'text-align:left', 'text-align:right', 'text-align:center', '--math-cell-align:end', '--math-cell-align:center',
  'padding-inline:0', 'padding-inline-start:1em', 'math-style:normal', 'padding-block:0.125em',
  'padding-top:0em', 'padding-bottom:0em',
])
const compactCellStyles = new Set([
  'text-align:left', 'text-align:center', '--math-cell-align:center',
  'padding-inline:0', 'padding-inline-start:0.2778em', 'padding-block:0.06em',
])
const centeredCellStyles = new Set(['text-align:center', '--math-cell-align:center', 'math-style:normal'])
const caseCellStyles = new Set(['text-align:left', 'padding-inline:0', 'padding-inline-start:1em', 'math-style:normal', 'padding-block:0.125em'])
const measuredCellLayout = /^(?:grid-column:[1-9]\d*|padding-block:\d+(?:\.\d+)?em|padding-bottom:max\(0px,calc\(\d+(?:\.\d+)?em \+ [+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:em|ex|px|pt|pc|cm|mm|in)\)\))$/
const mathTypeface = 'Cambria Math'
const textTypefaces: Readonly<Record<string, string>> = {
  'font-family:math': mathTypeface,
  'font-family:serif': 'Cambria',
  'font-family:sans-serif': 'Arial',
  'font-family:monospace': 'Courier New',
}

interface EquationFont {
  script?: 'double-struck' | 'script' | 'fraktur' | 'sans-serif' | 'monospace'
  mathItalic?: boolean
  textItalic: boolean
  bold: boolean
  typeface: string
}

const defaultMathFont: Readonly<EquationFont> = { textItalic: false, bold: false, typeface: mathTypeface }
const mathFonts: Readonly<Record<string, Partial<EquationFont>>> = {
  normal: { mathItalic: false },
  bold: { mathItalic: false, bold: true },
  italic: { mathItalic: true, textItalic: true },
  'bold-italic': { mathItalic: true, textItalic: true, bold: true },
  'double-struck': { script: 'double-struck', mathItalic: false },
  script: { script: 'script', mathItalic: false },
  fraktur: { script: 'fraktur', mathItalic: false },
  'sans-serif': { script: 'sans-serif', mathItalic: false, typeface: 'Arial' },
  'sans-serif-italic': { script: 'sans-serif', mathItalic: true, textItalic: true, typeface: 'Arial' },
  monospace: { script: 'monospace', mathItalic: false, typeface: 'Courier New' },
}

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
    if (depth === 0 && /^(?:munder|mover|munderover)$/.test(node.name) && node.children[0]?.attributes.class === 'math-arrow-body') break
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

function mathInk({ r, g, b, a }: Rgba): { hex: string, alpha: number } {
  const hex = [r, g, b].map(value => Math.round(value).toString(16).padStart(2, '0')).join('').toUpperCase()
  return { hex, alpha: a }
}

/** Convert presentation MathML to the structures in the Office Math schema.
 * Decline formulas whose presentation would be lost in the editable shape.
 */
export function officeMath(root: RawMathElement, fontSize: number, color: Rgba, fragmentOpacity: number, display: boolean): string | undefined {
  const baseInk = mathInk(color)
  let localSize = fontSize
  let ink = baseInk
  let opacity = fragmentOpacity
  let font: Readonly<EquationFont> = defaultMathFont
  let mathStyle: MathStyle = display ? 0 : 1
  function inFont(next: Readonly<EquationFont>, render: () => string | undefined): string | undefined {
    const previous = font
    font = next
    try { return render() }
    finally { font = previous }
  }
  function inMathStyle(next: MathStyle, render: () => string | undefined): string | undefined {
    const previous = mathStyle
    mathStyle = next
    try { return render() }
    finally { mathStyle = previous }
  }
  function script(node: RawMathElement): string | undefined {
    return inMathStyle(scriptStyle(mathStyle), () => convert(node))
  }
  const properties = (normalText: boolean, italic: boolean) => {
    const size = Math.max(100, Math.min(400000, Math.round(localSize * PT_PER_PX * 100)))
    const { hex } = ink
    const alpha = ink.alpha * opacity
    const paint = alpha === 1 ? `<a:srgbClr val="${hex}"/>` : `<a:srgbClr val="${hex}"><a:alpha val="${Math.round(alpha * 100000)}"/></a:srgbClr>`
    const formatting = normalText ? ` b="${Number(font.bold)}" i="${Number(italic)}"` : ''
    return `<a:rPr sz="${size}"${formatting}><a:solidFill>${paint}</a:solidFill><a:latin typeface="${normalText ? font.typeface : mathTypeface}"/></a:rPr>`
  }
  const wrap = (name: string, content: string) => `<m:${name}>${content}</m:${name}>`
  const setting = (name: string, value: string) => `<m:${name} m:val="${escapeHtml(value)}"/>`
  const control = () => ink !== baseInk || localSize !== fontSize || opacity !== 1 ? wrap('ctrlPr', properties(false, false)) : ''
  function run(text: string, italic = false, textToken = false, script?: EquationFont['script']): string {
    const normalText = textToken && font.typeface !== mathTypeface
    const alphabet = script ? setting('scr', script) : ''
    const style = normalText ? '<m:nor/>' : alphabet + setting('sty', (font.bold ? 'b' : '') + (italic ? 'i' : '') || 'p')
    return wrap('r', `<m:rPr>${style}</m:rPr>${properties(normalText, italic)}<m:t xml:space="preserve">${escapeHtml(text)}</m:t>`)
  }
  function sequence(nodes: readonly RawMathElement[]): string | undefined {
    let output = ''
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index]
      // Keep the styled operator as an editable run when its weight matters.
      const limits = font.bold ? undefined : operatorLimits(node)
      if (limits) {
        const end = followingTerm(nodes, index + 1)
        if (end > index + 1) {
          const body = sequence(nodes.slice(index + 1, end))
          const sub = limits.sub ? script(limits.sub) : ''
          const sup = limits.sup ? script(limits.sup) : ''
          if (body === undefined || sub === undefined || sup === undefined) return
          if (body) {
            const options = setting('chr', limits.glyph) + setting('limLoc', limits.location)
              + (limits.sub ? '' : setting('subHide', '1')) + (limits.sup ? '' : setting('supHide', '1'))
            output += wrap('nary', wrap('naryPr', options + control()) + wrap('sub', sub) + wrap('sup', sup) + wrap('e', body))
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
  const limit = (tag: string, content: string, value: string) => wrap(tag, wrap('e', content) + wrap('lim', value))
  function groupCharacter(glyph: string, position: 'top' | 'bot', alignment: 'top' | 'bot', content: string, argumentSize = 0): string {
    const options = setting('chr', glyph) + setting('pos', position) + setting('vertJc', alignment) + control()
    const size = argumentSize ? wrap('argPr', setting('argSz', String(argumentSize))) : ''
    return wrap('groupChr', wrap('groupChrPr', options) + wrap('e', size + content))
  }
  function annotatedArrow(node: RawMathElement): string | undefined {
    const [base, first, second] = node.children
    if (!only(node) || !only(base, 'class', 'style') || base.attributes.style !== `min-width:${texArrowMinWidth}` || base.text.trim()) return
    const [glyph, track] = base.children
    if (base.children.length !== 2 || glyph.name !== 'mo' || glyph.children.length || !extensibleArrows.has(glyph.text)
      || !only(glyph, 'stretchy', 'movablelimits', 'minsize', 'lspace', 'rspace') || glyph.attributes.stretchy !== 'true'
      || glyph.attributes.movablelimits !== 'false' || glyph.attributes.minsize !== texArrowMinWidth
      || [glyph.attributes.lspace, glyph.attributes.rspace].some(space => space !== undefined && space !== '0em')
      || track.name !== 'mspace' || track.attributes.class !== 'math-arrow-track' || track.attributes['aria-hidden'] !== 'true'
      || !only(track, 'class', 'aria-hidden', 'data-left', 'data-right', 'data-double') || track.text.trim() || track.children.length) return
    const above = node.name === 'munder' ? '' : script(second ?? first)
    const below = node.name === 'mover' ? '' : script(first)
    if (above === undefined || below === undefined || (!above && !below)) return
    // Stretch the group character to its wider label. The other label is a
    // native limit so the two scripts remain independently editable.
    const useBelow = Boolean(below && (!above || node.widerArrowLabel === 'below'))
    const position = useBelow ? 'top' : 'bot'
    const adjustment = Math.max(0, mathStyle - 1) - (scriptStyle(mathStyle) - 1)
    const body = groupCharacter(glyph.text, position, position, useBelow ? below : above, adjustment)
    const other = useBelow ? above : below
    return other ? limit(useBelow ? 'limUpp' : 'limLow', body, other) : body
  }
  function underOver(node: RawMathElement): string | undefined {
    const { name, attributes, children } = node
    const both = name === 'munderover'
    if (children.length !== (both ? 3 : 2)) return
    const [base, first, last] = children
    if (base.name === 'mrow' && base.attributes.class === 'math-arrow-body') return annotatedArrow(node)
    const body = convert(base)
    if (body === undefined) return
    if (!both && (attributes.accent === 'true' || attributes.accentunder === 'true')) {
      const below = name === 'munder'
      if (!only(node, below ? 'accentunder' : 'accent') || first.name !== 'mo'
        || first.children.length || !only(first, 'stretchy')) return
      const glyph = first.text
      if (first.attributes.stretchy === 'true' && stretchMarks.has(glyph)) {
        return groupCharacter(glyph, below ? 'bot' : 'top', below ? 'top' : 'bot', body)
      }
      const accent = Object.hasOwn(accents, glyph) ? accents[glyph] : undefined
      if (below || !accent) return
      return wrap('acc', wrap('accPr', setting('chr', accent) + control()) + wrap('e', body))
    }
    if (!only(node)) return
    const label = script(first)
    if (label === undefined) return
    if (!both) return limit(name === 'munder' ? 'limLow' : 'limUpp', body, label)
    const upper = script(last)
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
    const options = properties.map(property => setting(property, '1')).join('') + control()
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
    const index = (child: RawMathElement) => emptyElement(child, 'none') ? '' : script(child)
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
    if (!/^(?:align(?:ed|at|edat)?|flalign|xx?alignat|gather(?:ed)?|[lr]gathered|split)[*]?$/.test(environment)
      || !only(table, 'class', 'style', 'columnalign', 'align', 'data-equation-lines', 'data-math-array', 'data-equation-environment', 'data-equation-tags', 'data-equation-flush')) return
    const baseline = table.attributes.align
    if (baseline !== undefined && (!/^(?:aligned(?:at)?|[lr]?gathered)$/.test(environment)
      || !/^baseline -?1$/.test(baseline))) return
    const aligned = !/gather/.test(environment)
    const flushLeft = environment === 'lgathered'
    const flushRight = environment === 'rgathered'
    let rows = ''
    for (const row of table.children) {
      const arrow = row.attributes['data-equation-arrow']
      if (row.name !== 'mtr' || row.text.trim() || !only(row, 'data-equation-dim', 'data-equation-arrow') || !row.children.length
        || (arrow !== undefined && (!aligned || (arrow !== 'left' && arrow !== 'right')))
        || (!aligned && row.children.length !== 1)) return
      const rowOpacity = row.opacity ?? 1
      if (!Number.isFinite(rowOpacity) || rowOpacity < 0 || rowOpacity > 1) return
      const previous = opacity
      opacity *= rowOpacity
      try {
        let expression = flushLeft ? run('&') : ''
        for (const [index, cell] of row.children.entries()) {
          const styles = (cell.attributes.style ?? '').split(';').filter(Boolean)
          if (cell.name !== 'mtd' || cell.text.trim() || !only(cell, 'style')
            || !styles.every(style => alignmentCellStyles.has(style) || (arrow && style === 'padding-block:0em'))) return
          const content = sequence(cell.children)
          // Ampersands inside an Office equation array are alignment syntax.
          if (content === undefined || content.includes('&amp;')) return
          if (index > 0) expression += run('&')
          if (styles.includes('padding-inline-start:1em')) expression += run('\u2003')
          expression += content
        }
        rows += wrap('e', expression + (flushRight ? run('&') : ''))
      }
      finally { opacity = previous }
    }
    const properties = baseline ? wrap('eqArrPr', setting('baseJc', baseline === 'baseline 1' ? 'top' : 'bot')) : ''
    if (rows) return wrap('eqArr', properties + rows)
  }
  function tableRows(table: RawMathElement, cellStyles?: ReadonlySet<string>): string[][] | undefined {
    if (table.name !== 'mtable' || table.text.trim()) return
    const rows: string[][] = []
    for (const row of table.children) {
      if (row.name !== 'mtr' || row.text.trim() || !only(row) || !row.children.length) return
      const cells: string[] = []
      for (const cell of row.children) {
        if (cell.name !== 'mtd' || cell.text.trim()) return
        if (cellStyles) {
          const styles = (cell.attributes.style ?? '').split(';').filter(Boolean)
          if (!only(cell, 'style') || !styles.every(style => cellStyles.has(style))) return
        }
        else if (!only(cell)) return
        const expression = sequence(cell.children)
        if (expression === undefined) return
        cells.push(expression)
      }
      rows.push(cells)
    }
    if (rows.length) return rows
  }
  function matrix(rows: readonly string[][], properties = ''): string {
    const width = Math.max(...rows.map(row => row.length))
    const body = rows.map(row => {
      const cells = Array.from({ length: width }, (_, column) => wrap('e', row[column] ?? '')).join('')
      return wrap('mr', cells)
    }).join('')
    return wrap('m', properties + body)
  }
  function centeredArray(table: RawMathElement): string | undefined {
    const { columnalign, style } = table.attributes
    if (!only(table, 'class', 'style', 'columnalign', 'data-equation-lines', 'data-math-array')) return
    const columns = (columnalign ?? '').split(' ')
    if (!columns.every(align => align === 'center') || style !== `--math-columns:${columns.length}`) return
    const rows = tableRows(table, centeredCellStyles)
    if (rows && rows.every(row => row.length === columns.length)) return matrix(rows)
  }
  function compactArray(table: RawMathElement): string | undefined {
    const { class: kind, columnalign, style } = table.attributes
    if (!only(table, 'class', 'style', 'columnalign', 'data-math-array')) return
    if (kind === 'math-compact-array math-alignment-grid') {
      if ((columnalign !== 'left' && columnalign !== 'center') || style !== '--math-columns:1') return
    }
    else if (kind !== 'math-compact-array' || columnalign || style) return
    const rows = tableRows(table, compactCellStyles)
    if (!rows) return
    if (columnalign !== 'left') return matrix(rows)
    if (rows.some(row => row.length !== 1 || row[0].includes('&amp;'))) return
    const mark = run('&')
    return wrap('eqArr', rows.map(([content]) => wrap('e', mark + content)).join(''))
  }
  function alignmentAxisContents(node: RawMathElement): RawMathElement[] | undefined {
    if (node.name !== 'mtable' || node.attributes.class !== 'math-alignment-axis' || !only(node, 'class') || node.children.length !== 1) return
    const [row] = node.children
    if (row.name !== 'mtr' || !only(row) || row.text.trim() || row.children.length !== 1) return
    const [cell] = row.children
    if (cell.name === 'mtd' && only(cell) && !cell.text.trim()) return cell.children
  }
  function caseArray(node: RawMathElement, side: string): string | undefined {
    if (node.children.length !== 2 || (side !== 'left' && side !== 'right')) return
    const [first, second] = node.children
    const left = side === 'left'
    const brace = left ? first : second
    const container = left ? second : first
    const wrapped = alignmentAxisContents(container)
    const table = wrapped?.[0] ?? container
    if (!stretchyFence(brace, left ? leftFences : rightFences) || brace.text !== (left ? '{' : '}')) return
    if (wrapped && wrapped.length !== 1) return
    if (!only(table, 'columnalign', 'data-equation-lines', 'data-math-array', 'class', 'style')) return
    if ((table.attributes.class || table.attributes.style)
      && (table.attributes.class !== 'math-alignment-grid' || !/^--math-columns:[12]$/.test(table.attributes.style ?? ''))) return
    const array = inFont(defaultMathFont, () => {
      const rows = tableRows(table, caseCellStyles)
      if (!rows || rows.some(row => row.length > 2 || row.some(cell => cell.includes('&amp;')))) return
      const mark = run('&')
      // The first and third markers align each column's left edge. The second
      // marker separates the expression column from the condition column.
      const condition = mark + mark + run('\u2003')
      const body = rows.map(([value, test]) => wrap('e', mark + value + (test === undefined ? '' : condition + test))).join('')
      return wrap('eqArr', body)
    })
    if (array === undefined) return
    return delimiter(left ? '{' : '', left ? '' : '}', [array])
  }
  function delimiter(left: string, right: string, expressions: readonly string[], separator?: string): string {
    const begin = left ? setting('begChr', left) : '<m:begChr/>'
    const end = right ? setting('endChr', right) : '<m:endChr/>'
    const options = begin + end + (separator ? setting('sepChr', separator) : '') + control()
    return wrap('d', wrap('dPr', options) + expressions.map(content => wrap('e', content)).join(''))
  }
  function fenceGlyph(node: RawMathElement, middle: boolean): string | undefined {
    const { attributes, text } = node
    if (!middle && node.name === 'mspace' && attributes.width === nullDelimiterWidth && only(node, 'width')
      && !text.trim() && !node.children.length) return ''
    if (node.name !== 'mo' || node.children.length || attributes.stretchy !== 'true' || text.length !== 1 || /[\p{C}\s]/u.test(text)) return
    if (middle) {
      if (!only(node, 'stretchy', 'fence', 'symmetric', 'form', 'lspace', 'rspace', 'style') || attributes.fence !== 'true'
        || attributes.symmetric !== 'true' || attributes.form !== 'infix' || attributes.lspace !== '0.05em' || attributes.rspace !== '0.05em') return
    }
    else if (!only(node, 'stretchy', 'style')) return
    // An OMML delimiter uses a single style for all of its characters.
    if (attributes.style) {
      const paint = parseColor(node.color)
      if (!paint || !/^color:[^;]+;?$/.test(attributes.style)) return
      const resolved = mathInk(paint)
      if (resolved.hex !== ink.hex || resolved.alpha !== ink.alpha) return
    }
    return text
  }
  function pairedDelimiters(nodes: readonly RawMathElement[]): string | undefined {
    if (nodes.length < 2) return
    const left = fenceGlyph(nodes[0], false)
    const right = fenceGlyph(nodes[nodes.length - 1], false)
    if (left === undefined || right === undefined) return
    const parts: string[] = []
    let separator: string | undefined
    let start = 1
    const end = nodes.length - 1
    for (let index = start; index < end; index++) {
      const node = nodes[index]
      if (node.name !== 'mo' || node.attributes.form !== 'infix' || node.attributes.stretchy !== 'true') continue
      const glyph = fenceGlyph(node, true)
      if (glyph === undefined || (separator !== undefined && separator !== glyph)) return
      const content = sequence(nodes.slice(start, index))
      if (content === undefined) return
      parts.push(content)
      separator = glyph
      start = index + 1
    }
    const content = sequence(nodes.slice(start, end))
    if (content === undefined) return
    parts.push(content)
    // A null TeX delimiter also contributes a small horizontal space.
    if (!left) parts[0] = run(nullFenceSpace) + parts[0]
    if (!right) parts[parts.length - 1] += run(nullFenceSpace)
    return delimiter(left, right, parts, separator)
  }
  function convert(node: RawMathElement): string | undefined {
    if (node.color === undefined) return convertElement(node)
    const next = parseColor(node.color)
    if (!next) return
    const { style, ...attributes } = node.attributes
    if (!/^color:[^;]+;?$/.test(style ?? '')) return
    const previous = ink
    ink = mathInk(next)
    try { return convertElement({ ...node, attributes, color: undefined }) }
    finally { ink = previous }
  }
  function convertElement(node: RawMathElement): string | undefined {
    const { name, text, attributes, children } = node
    if (tokenNames.has(name)) {
      if (children.length || !only(node, 'mathvariant', 'stretchy', 'lspace', 'rspace', 'movablelimits') || attributes.stretchy === 'true') return
      if (attributes.movablelimits !== undefined && (name !== 'mo' || attributes.movablelimits !== 'false')) return
      if ([attributes.lspace, attributes.rspace].some(value => value !== undefined && value !== '0em')) return
      if (attributes.mathvariant !== undefined && attributes.mathvariant !== 'normal') return
      // XML 1.0 forbids control characters even inside a text run.
      // eslint-disable-next-line no-control-regex
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/.test(text)) return
      const letter = name === 'mi' || name === 'mn'
      const script = letter ? font.script : undefined
      const italic = name === 'mtext' ? font.textItalic
        : letter && (font.mathItalic ?? (name === 'mi' && !attributes.mathvariant && /^[\p{Script=Latin}\p{Script=Greek}]\p{M}*$/u.test(text)))
      return run(script ? baseMathLetters(text, script) : text, italic, name === 'mtext', script)
    }
    if (text.trim()) return
    if (name === 'mtable' && font !== defaultMathFont && Object.hasOwn(attributes, 'data-math-array'))
      return inFont(defaultMathFont, () => convert(node))

    if (name === 'mtd' && only(node, 'style')) {
      const styles = (attributes.style ?? '').split(';').filter(Boolean)
      if (styles.every(style => alignmentCellStyles.has(style) || measuredCellLayout.test(style))) return sequence(children)
      return
    }
    if (name === 'munder' || name === 'mover' || name === 'munderover') return underOver(node)
    if (name === 'mphantom' || name === 'mpadded') return phantom(node)
    if (name === 'mmultiscripts' && only(node)) return prescript(node)
    // Starred TeX spacing includes a rule with no width or height.
    if (name === 'mspace' && !children.length && only(node, 'width', 'height', 'style')
      && attributes.style === 'background:currentColor'
      && zeroLength.test(attributes.width ?? '') && zeroLength.test(attributes.height ?? '')) return ''
    if (name === 'mspace' && only(node, 'width') && !children.length && /^\d+(?:\.\d+)?em$/.test(attributes.width ?? '')) {
      const width = Number.parseFloat(attributes.width)
      if (width === 0) return ''
      const space = spaces.find(([size]) => Math.abs(width - size) < 0.006)
      if (space) return run(space[1])
      return
    }
    if (name === 'mrow') {
      if (attributes['data-math-smash-operator'] === '' && only(node, 'data-math-smash-operator') && children.length === 1) return convert(children[0])
      if (attributes['data-equation-frame-start'] === '' && only(node, 'data-equation-frame-start')) return sequence(children)
      if (attributes['data-equation-frame-end'] === '' && only(node, 'data-equation-frame-end')) return sequence(children)
      if (attributes['data-math-delimiters'] === '' && only(node, 'data-math-delimiters')) return pairedDelimiters(children)
      if (attributes['data-math-cases'] && only(node, 'data-math-cases')) return caseArray(node, attributes['data-math-cases'])
      const variant = attributes.mathvariant
      if (variant && attributes.class === `math-${variant}` && only(node, 'class', 'mathvariant') && Object.hasOwn(mathFonts, variant))
        return inFont({ ...defaultMathFont, ...mathFonts[variant] }, () => sequence(children))
      if (attributes.class === 'math-font-reset' && only(node, 'class'))
        return inFont(defaultMathFont, () => sequence(children))
      if (attributes.class && only(node, 'class')) {
        if (attributes.class === 'math-chemistry') return sequence(children)
        if (attributes.class === 'math-alignment-bottom' && children.length === 1
          && children[0].name === 'mtable' && children[0].attributes.align === 'baseline -1') return convert(children[0])
        if (children.length === 1 && (attributes.class === 'math-overline' || attributes.class === 'math-underline')) {
          const body = convert(children[0])
          if (body === undefined) return
          const options = setting('pos', attributes.class === 'math-overline' ? 'top' : 'bot')
          return wrap('bar', wrap('barPr', options + control()) + wrap('e', body))
        }
        return enclosure(node)
      }
      if (attributes.style && only(node, 'style')) {
        const next = { ...font }
        for (const style of attributes.style.split(';').filter(Boolean)) {
          if (style === 'font-weight:bold' || style === 'font-weight:normal') next.bold = style.endsWith('bold')
          else if (style === 'font-style:italic' || style === 'font-style:normal') next.textItalic = style.endsWith('italic')
          else if (Object.hasOwn(textTypefaces, style)) next.typeface = textTypefaces[style]
          else return
        }
        return inFont(next, () => sequence(children))
      }
    }
    if (name === 'mrow' && only(node)) {
      const left = children[0]
      const right = children.at(-1)
      if (children.length > 2 && stretchyFence(left, leftFences) && stretchyFence(right, rightFences)) {
        const expression = sequence(children.slice(1, -1))
        if (expression === undefined) return
        return delimiter(left.text, right.text, [expression])
      }
      return sequence(children)
    }
    if (name === 'mstyle' && only(node, 'displaystyle', 'scriptlevel') && /^[012]$/.test(attributes.scriptlevel ?? '')
      && /^(?:true|false)$/.test(attributes.displaystyle ?? '')) {
      const level = Number(attributes.scriptlevel)
      const target = (level ? level + 1 : attributes.displaystyle === 'true' ? 0 : 1) as MathStyle
      const adjustment = Math.max(0, mathStyle - 1) - level
      const content = inMathStyle(target, () => sequence(children))
      if (!adjustment || !content) return content
      return wrap('box', wrap('e', wrap('argPr', setting('argSz', String(adjustment))) + content))
    }
    if (name === 'mstyle' && only(node, 'mathsize') && /^\d+(?:\.\d+)?em$/.test(attributes.mathsize ?? '')) {
      const previous = localSize
      localSize *= Number.parseFloat(attributes.mathsize)
      try { return sequence(children) }
      finally { localSize = previous }
    }
    if (name === 'mtable' && attributes['data-equation-environment'])
      return equationArray(node, attributes['data-equation-environment'])
    if (name === 'mtable' && attributes.class?.startsWith('math-compact-array')) return compactArray(node)
    if (name === 'mtable' && attributes.class === 'math-alignment-grid') return centeredArray(node)
    if (name === 'mtable' && attributes.class === 'math-vcenter' && only(node, 'class')) {
      const rows = tableRows(node)
      if (rows?.length === 1 && rows[0].length === 1) return matrix(rows, wrap('mPr', setting('baseJc', 'center')))
      return
    }
    if (name === 'mtable' && attributes.class === 'math-alignment-axis') {
      const content = alignmentAxisContents(node)
      if (content) return sequence(content)
      return
    }
    if (name === 'mtable' && only(node, 'data-equation-lines', 'data-math-array')) {
      const rows = tableRows(node)
      if (rows && rows.every(row => row.length === rows[0].length)) return matrix(rows)
      return
    }
    if (name === 'mfrac' && only(node, 'linethickness') && children.length === 2) {
      if (attributes.linethickness !== undefined && !/^0(?:em|px)?$/.test(attributes.linethickness)) return
      const style = fractionStyle(mathStyle)
      const numerator = inMathStyle(style, () => convert(children[0]))
      const denominator = inMathStyle(style, () => convert(children[1]))
      if (numerator === undefined || denominator === undefined) return
      const options = (attributes.linethickness === undefined ? '' : setting('type', 'noBar')) + control()
      return wrap('f', (options ? wrap('fPr', options) : '') + wrap('num', numerator) + wrap('den', denominator))
    }
    if (!only(node)) return
    if (name === 'msqrt') {
      const expression = sequence(children)
      if (!expression) return
      return wrap('rad', `${wrap('radPr', setting('degHide', '1') + control())}<m:deg/>${wrap('e', expression)}`)
    }
    if (name === 'mroot' && children.length === 2) {
      const radicand = convert(children[0])
      const index = inMathStyle(3, () => convert(children[1]))
      if (radicand === undefined || index === undefined) return
      const options = control()
      return wrap('rad', (options ? wrap('radPr', options) : '') + wrap('deg', index) + wrap('e', radicand))
    }
    const wrapper = Object.hasOwn(scriptProperties, name) ? scriptProperties[name] : undefined
    if (wrapper && children.length === wrapper.length) {
      const expressions = children.map((child, index) => index ? script(child) : convert(child))
      if (expressions.some(value => value === undefined)) return
      const [element, ...positions] = wrapper
      return wrap(element, wrap('e', expressions[0]!) + positions.map((position, index) => wrap(position, expressions[index + 1]!)).join(''))
    }
  }
  return convert(root) || undefined
}
