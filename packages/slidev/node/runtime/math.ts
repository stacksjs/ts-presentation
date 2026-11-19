import { escapeHtml } from './html.ts'
import type { KatexOptions } from './authoring-setup.ts'
import { chemicalFormula, physicalUnits } from './math-chemistry.ts'

const greek: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ϵ', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
  rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ',
  chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ',
  Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
}
const operators: Record<string, string> = {
  pm: '±', mp: '∓', cdot: '·', times: '×', div: '÷', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  approx: '≈', sim: '∼', simeq: '≃', equiv: '≡', propto: '∝', in: '∈', notin: '∉', subset: '⊂',
  subseteq: '⊆', supset: '⊃', supseteq: '⊇', cap: '∩', cup: '∪', land: '∧', lor: '∨',
  forall: '∀', exists: '∃', neg: '¬', to: '→', mapsto: '↦', rightarrow: '→', leftarrow: '←', gets: '←',
  leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', iff: '⇔',
  sum: '∑', prod: '∏', int: '∫', iint: '∬', oint: '∮', partial: '∂', nabla: '∇', infty: '∞',
  emptyset: '∅', ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', angle: '∠',
  mid: '∣', parallel: '∥', perp: '⊥', circ: '∘', ast: '∗', setminus: '∖',
  coprod: '∐', bigcup: '⋃', bigcap: '⋂', bigvee: '⋁', bigwedge: '⋀',
  iiint: '∭', oiint: '∯', oiiint: '∰', intop: '∫', smallint: '∫', imath: 'ı', jmath: 'ȷ', ell: 'ℓ', hbar: 'ℏ',
  Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', empty: '∅', cong: '≅', ll: '≪', gg: '≫',
  uparrow: '↑', downarrow: '↓', updownarrow: '↕', Uparrow: '⇑', Downarrow: '⇓', Updownarrow: '⇕',
  longrightarrow: '⟶', longleftarrow: '⟵', longleftrightarrow: '⟷',
  Longrightarrow: '⟹', Longleftarrow: '⟸', Longleftrightarrow: '⟺', longmapsto: '⟼',
  lt: '<', gt: '>', ni: '∋', owns: '∋', notni: '∌', nmid: '∤', nparallel: '∦',
  nleq: '≰', ngeq: '≱', nsubseteq: '⊈', nsupseteq: '⊉',
  prime: '′', backprime: '‵', smallsetminus: '∖',
  otimes: '⊗', oplus: '⊕', odot: '⊙', wedge: '∧', vee: '∨', colon: ':',
}
const functions = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'exp', 'min', 'max', 'argmin', 'argmax', 'det', 'lim', 'sup', 'inf', 'gcd', 'Pr'])
const big = new Set(['sum', 'prod', 'coprod', 'bigcup', 'bigcap', 'bigvee', 'bigwedge', 'intop', 'smallint',
  'lim', 'min', 'max', 'argmin', 'argmax', 'sup', 'inf', 'det', 'gcd', 'Pr'])
const integrals = new Set(['int', 'iint', 'iiint', 'oint', 'oiint', 'oiiint'])
const namedLimits: Record<string, string> = {
  liminf: 'lim inf', limsup: 'lim sup', injlim: 'inj lim', projlim: 'proj lim',
}
const accentedLimits: Record<string, string> = {
  varliminf: 'math-underline', varlimsup: 'math-overline',
}
const unicodeSuperscripts = new Map([...'⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ᴬᴮᴰᴱᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾᴿᵀᵁⱽᵂᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻᵝᵞᵟᵠᵡᶿ'].map((symbol, index) =>
  [symbol, '0123456789+-=()ABDEGHIJKLMNOPRTUVWabcdefghijklmnoprstuvwxyzβγδϕχθ'[index]]))
const unicodeSubscripts = new Map([...'₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓᵦᵧᵨᵩᵪ'].map((symbol, index) =>
  [symbol, '0123456789+-=()aehijklmnoprstuvxβγρϕχ'[index]]))
const primes: Readonly<Record<string, number>> = { "'": 1, '′': 1, '″': 2, '‴': 3, '⁗': 4 }
const negatedOperators: Record<string, string> = {
  '=': '≠', '&lt;': '≮', '&gt;': '≯', '≤': '≰', '≥': '≱', '≈': '≉', '≡': '≢', '∼': '≁', '≃': '≄', '≅': '≇',
  '∈': '∉', '∋': '∌', '⊂': '⊄', '⊃': '⊅', '⊆': '⊈', '⊇': '⊉', '∣': '∤', '∥': '∦',
  '⊢': '⊬', '⊨': '⊭', '←': '↚', '→': '↛', '↔': '↮', '⇐': '⇍', '⇒': '⇏', '⇔': '⇎',
}
const contextualDots = new Set(['dots', 'dotsc', 'dotsb', 'dotsm', 'dotsi', 'dotso', 'dotsx'])
const centersDots = /^[+\-−*=<>:±∓·×÷≤≥≠≈∼≃≡∝∈∉∋∌∣∤∥∦⊥⊂⊄⊆⊈⊃⊅⊇⊉∘∗∖∩∪∧∨⊕⊗⊙∑∏∐⋃⋂⋁⋀←→↔⇒⇐⇔↦⟵⟶⟷⟹⟸⟺⟼]$/u
const variants: Record<string, string> = {
  mathbf: 'bold', mathbb: 'double-struck', mathrm: 'normal', mathit: 'italic',
  mathsf: 'sans-serif', mathtt: 'monospace', mathcal: 'script', mathscr: 'script',
  mathfrak: 'fraktur', mathnormal: 'italic', boldsymbol: 'bold-italic', bm: 'bold-italic',
  Bbb: 'double-struck', frak: 'fraktur', bold: 'bold',
}
const accents: Record<string, string> = {
  hat: 'ˆ', bar: '¯', vec: '→', dot: '˙', ddot: '¨', dddot: '⃛', ddddot: '⃜', tilde: '˜',
  acute: '´', grave: '`', breve: '˘', check: 'ˇ', mathring: '˚',
}
const stretchedAccents: Record<string, string> = {
  widehat: 'ˆ', widetilde: '˜', widecheck: 'ˇ', overbrace: '⏞', underbrace: '⏟', utilde: '˜',
  overrightarrow: '→', overleftarrow: '←', overleftrightarrow: '↔',
  underrightarrow: '→', underleftarrow: '←', underleftrightarrow: '↔',
  overleftharpoon: '↼', overrightharpoon: '⇀', underleftharpoon: '↽', underrightharpoon: '⇁',
  Overrightarrow: '⇒', overbracket: '⎴', underbracket: '⎵', overgroup: '⏠', undergroup: '⏡',
}
const extensibleArrows: Record<string, string> = {
  xrightarrow: '→', xleftarrow: '←', xleftrightarrow: '↔', xRightarrow: '⇒', xLeftarrow: '⇐', xLeftrightarrow: '⇔',
  xmapsto: '↦', xhookrightarrow: '↪', xhookleftarrow: '↩', xtwoheadleftarrow: '↞', xtwoheadrightarrow: '↠',
  xleftharpoonup: '↼', xleftharpoondown: '↽', xrightharpoonup: '⇀', xrightharpoondown: '⇁',
  xleftrightharpoons: '⇋', xrightleftharpoons: '⇌', xtofrom: '⇄', xlongequal: '=',
}
const notationDelimiters: Record<string, [string, string]> = {
  bra: ['⟨', '|'], Bra: ['⟨', '|'], ket: ['|', '⟩'], Ket: ['|', '⟩'],
  braket: ['⟨', '⟩'], Braket: ['⟨', '⟩'], set: ['{', '}'], Set: ['{', '}'],
}
const delimiters: Record<string, string> = {
  '\\{': '{', '\\}': '}', '\\lbrace': '{', '\\rbrace': '}', '\\langle': '⟨', '\\rangle': '⟩',
  '\\lparen': '(', '\\rparen': ')', '\\lbrack': '[', '\\rbrack': ']', '\\lang': '⟨', '\\rang': '⟩',
  '\\lVert': '‖', '\\rVert': '‖', '\\lvert': '|', '\\rvert': '|',
  '\\lfloor': '⌊', '\\rfloor': '⌋', '\\lceil': '⌈', '\\rceil': '⌉', '\\vert': '|', '\\Vert': '‖', '\\|': '‖',
  '\\lgroup': '⟮', '\\rgroup': '⟯', '\\lmoustache': '⎰', '\\rmoustache': '⎱', '\\backslash': '\\',
  '\\ulcorner': '⌜', '\\urcorner': '⌝', '\\llcorner': '⌞', '\\lrcorner': '⌟',
  '\\llbracket': '⟦', '\\rrbracket': '⟧', '\\lBrace': '⦃', '\\rBrace': '⦄',
}
const delimiterAliases: Record<string, string> = {
  '\\lt': '⟨', '\\gt': '⟩', '<': '⟨', '>': '⟩',
  '\\uparrow': '↑', '\\downarrow': '↓', '\\updownarrow': '↕',
  '\\Uparrow': '⇑', '\\Downarrow': '⇓', '\\Updownarrow': '⇕',
}
const delimiterGlyphs = new Set(['.', '(', ')', '[', ']', '{', '}', '/', '∣', ...Object.values(delimiters), ...Object.values(delimiterAliases)])
const sizedDelimiters: Record<string, string> = { big: '1.2em', Big: '1.8em', bigg: '2.4em', Bigg: '3em' }
const matrixDelimiters: Record<string, [string, string]> = {
  pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'], cases: ['{', ''],
}
const spacing: Record<string, string> = { ',': '0.17em', ':': '0.22em', ';': '0.28em', '!': '-0.17em', ' ': '0.33em', quad: '1em', qquad: '2em' }
const styledLetters: Record<string, { upper: number, lower: number, digits?: number, exceptions: string }> = {
  'double-struck': { upper: 0x1D538, lower: 0x1D552, digits: 0x1D7D8, exceptions: 'CℂHℍNℕPℙQℚRℝZℤ' },
  'script': { upper: 0x1D49C, lower: 0x1D4B6, exceptions: 'BℬEℰFℱHℋIℐLℒMℳRℛeℯgℊoℴ' },
  'fraktur': { upper: 0x1D504, lower: 0x1D51E, exceptions: 'CℭHℌIℑRℜZℨ' },
}

export type MathMacros = Readonly<Record<string, string>>

export function resolveMathMacros(headmatter?: Record<string, unknown>): MathMacros {
  const options = headmatter?.math ?? headmatter?.katex
  const macros = options && typeof options === 'object' && 'macros' in options ? options.macros : undefined
  return macros && typeof macros === 'object' && !Array.isArray(macros)
    ? Object.fromEntries(Object.entries(macros).filter((entry): entry is [string, string] =>
      /^\\[A-Za-z]+$/.test(entry[0]) && typeof entry[1] === 'string'))
    : {}
}

const verbPattern = /\\verb(?:\*([^\r\n])([^\r\n]*?)\1|([^*A-Za-z\r\n])([^\r\n]*?)\3)/
const leadingVerb = new RegExp(`^${verbPattern.source}`, 'u')
const ordinaryMathTokens = /\\[A-Za-z@]+|\\[^A-Za-z@\r\n]|%[^\r\n]*(?:\r?\n[ \t]*|$)|#[1-9]|\s+|./
const mathTokens = new RegExp(`${verbPattern.source}|${ordinaryMathTokens.source}`, 'gu')

export function mathVerbLength(source: string): number {
  return source.startsWith('\\verb') ? leadingVerb.exec(source)?.[0].length ?? 0 : 0
}

function tokenize(source: string): string[] {
  return source.match(mathTokens)?.filter(token => !token.startsWith('%')) ?? []
}

type MathStyle = 0 | 1 | 2 | 3
interface Macro { body: string[], parameters: string[][], prefix: string[], optional?: string[] }
interface MathState { globals: Map<string, Macro>, options: KatexOptions }

export function createMathRenderer(options: KatexOptions = {}): (source: string, display: boolean) => string {
  const state: MathState = { globals: new Map(), options }
  return (source, display) => renderMath(source, display, options.macros, state)
}

function safeColor(value: string): string {
  value = value.trim()
  if (/^[\da-f]{6}$/i.test(value)) return `#${value}`
  return /^(?:#[\da-f]{3}|#[\da-f]{6}|[a-z]{1,24})$/i.test(value) ? value : ''
}

function applyVariant(content: string, variant: string): string {
  const style = styledLetters[variant]
  if (!style) return variant === 'normal' ? content.replaceAll('<mi>', '<mi mathvariant="normal">') : content
  return content.replace(/<(mi|mn)>([A-Za-z\d]+)<\/\1>/g, (_, tagName: string, text: string) => {
    const glyphs = [...text].map((letter) => {
      const exception = style.exceptions.indexOf(letter)
      if (exception >= 0) return style.exceptions[exception + 1]
      const code = letter.charCodeAt(0)
      if (code >= 65 && code <= 90) return String.fromCodePoint(style.upper + code - 65)
      if (code >= 97 && code <= 122) return String.fromCodePoint(style.lower + code - 97)
      return style.digits ? String.fromCodePoint(style.digits + code - 48) : letter
    }).join('')
    return `<${tagName}>${glyphs}</${tagName}>`
  })
}

const textFonts: Record<string, string> = {
  text: '', hbox: '', mbox: '', textnormal: 'font-family:serif;font-weight:normal;font-style:normal', textrm: 'font-family:serif',
  textsf: 'font-family:sans-serif', texttt: 'font-family:monospace',
  textbf: 'font-weight:bold', textmd: 'font-weight:normal', textup: 'font-style:normal',
  textit: 'font-style:italic', emph: 'font-style:italic',
}
const textBoxes = new Set(['colorbox', 'fcolorbox', 'fbox', 'reflectbox'])
const textSymbols: Record<string, string> = {
  '\\textdollar': '$', '\\textunderscore': '_', '\\textbackslash': '\\',
  '\\textasciitilde': '~', '\\textasciicircum': '^', '\\textbar': '|',
  '\\textless': '<', '\\textgreater': '>', '\\ss': 'ß', '\\ae': 'æ', '\\AE': 'Æ',
  '\\aa': 'å', '\\AA': 'Å', '\\o': 'ø', '\\O': 'Ø', '\\oe': 'œ', '\\OE': 'Œ',
}
const textAccents: Record<string, string> = {
  "\\'": '\u0301', '\\`': '\u0300', '\\"': '\u0308',
  '\\^': '\u0302', '\\~': '\u0303', '\\=': '\u0304', '\\.': '\u0307',
  '\\u': '\u0306', '\\v': '\u030c', '\\H': '\u030b', '\\r': '\u030a',
  '\\c': '\u0327', '\\k': '\u0328', '\\b': '\u0331', '\\d': '\u0323',
}

interface Atom {
  markup: Markup
  limits?: boolean
  brace?: 'lower' | 'upper'
}

type Alignment = 'left' | 'center' | 'right'
type ArrayRule = 'solid' | 'dashed' | 'double'
const alignments: Record<string, Alignment> = { l: 'left', c: 'center', r: 'right' }
interface ArrayColumn { align: Alignment, before?: ArrayRule }
interface ArrayRow { cells: Markup[], label: string, before?: ArrayRule, gap?: string }

// Infix fractions decide the style of both operands after the row is parsed.
// Static fragments stay strings. Only style-dependent parts defer rendering.
type Markup = string | ((style: MathStyle) => string)

function renderMarkup(markup: Markup, style: MathStyle): string {
  return typeof markup === 'string' ? markup : markup(style)
}

function joinMarkup(parts: Markup[]): Markup {
  return parts.some(part => typeof part !== 'string')
    ? style => parts.map(part => renderMarkup(part, style)).join('')
    : parts.join('')
}

function xml(parts: TemplateStringsArray, ...values: Markup[]): Markup {
  let leading = parts[0]
  for (let index = 0; index < values.length; index++) {
    const value = values[index]
    if (typeof value !== 'string') {
      return (style) => {
        let result = leading
        for (let rest = index; rest < values.length; rest++) result += renderMarkup(values[rest], style) + parts[rest + 1]
        return result
      }
    }
    leading += value + parts[index + 1]
  }
  return leading
}

function fractionStyle(style: MathStyle): MathStyle {
  return Math.min(3, style + 1) as MathStyle
}

function scriptStyle(style: MathStyle): MathStyle {
  return style < 2 ? 2 : 3
}

function inScript(markup: Markup): Markup {
  return typeof markup === 'string' ? markup : style => markup(scriptStyle(style))
}

function stackOperator(markup: Markup): Markup {
  const fixed = (value: string) => value.replace(/^((?:<mrow>)*<mo)(?=[ >])/, '$1 movablelimits="false"')
  return typeof markup === 'string' ? fixed(markup) : style => fixed(markup(style))
}

function arrayColumns(spec: string): { columns: ArrayColumn[], after?: ArrayRule } {
  const columns: ArrayColumn[] = []
  let after: ArrayRule | undefined
  for (const char of spec.replace(/\s/g, '')) {
    if (char === '|' || char === ':') after = after ? 'double' : char === '|' ? 'solid' : 'dashed'
    else if (Object.hasOwn(alignments, char)) {
      columns.push({ align: alignments[char], before: after })
      after = undefined
    }
    else throw new Error('Invalid array column')
  }
  return { columns, after }
}

function tableBorder(side: string, line: ArrayRule): string {
  return `border-${side}:${line === 'double' ? '3px' : '1px'} ${line} currentColor`
}

function tag(name: string, value: string): string {
  return `<${name}>${escapeHtml(value)}</${name}>`
}

function spaceMarkup(width: string): string {
  // MathML Core layout clamps space widths to zero. A negative margin retains
  // the signed advance of a TeX kern.
  return Number.parseFloat(width) < 0
    ? `<mspace width="0" style="margin-inline-end:${width}"/>`
    : `<mspace width="${width}"/>`
}

function muSpace(mu: number): string {
  return spaceMarkup(`${mu / 18}em`)
}

function negatedMarkup(markup: string): string {
  const symbol = /^((?:<mrow>)*)<(mo|mi|mn)([^>]*)>([^<]+)<\/\2>((?:<\/mrow>)*)$/.exec(markup)
  if (!symbol || !/^(?:[^&]|&(?:lt|gt|amp|quot|#39);)$/u.test(symbol[4]))
    return `<mrow class="math-cancel">${markup}</mrow>`
  const [, prefix, element, attrs, value, suffix] = symbol
  const negated = negatedOperators[value] ?? `${value}\u0338`
  return `${prefix}<${element}${attrs}>${negated}</${element}>${suffix}`
}

function fence(token: string, stretchy = true): string {
  if (!token || token === '.') return ''
  return `<mo stretchy="${stretchy}">${escapeHtml(delimiters[token] ?? token)}</mo>`
}

function delimiter(token: string, command: string): string {
  const glyph = delimiterAliases[token] ?? delimiters[token] ?? token
  if (!delimiterGlyphs.has(glyph)) throw new Error(`Invalid delimiter after \\${command}`)
  return glyph
}

function sizedFence(glyph: string, size: string, side: string): string {
  if (glyph === '.') return ''
  const form = side === 'l' ? 'prefix' : side === 'r' ? 'postfix' : 'infix'
  const gap = side === 'm' ? '0.278em' : '0em'
  return `<mo stretchy="true" fence="${side === 'l' || side === 'r'}" form="${form}" lspace="${gap}" rspace="${gap}" minsize="${size}" maxsize="${size}">${escapeHtml(glyph)}</mo>`
}

const styleCommands: Record<string, MathStyle> = {
  '\\displaystyle': 0, '\\textstyle': 1, '\\scriptstyle': 2, '\\scriptscriptstyle': 3,
}
const infixFractions = new Set(['\\over', '\\atop', '\\choose', '\\brace', '\\brack', '\\above'])
const fractionFences: Record<string, [string, string]> = {
  '\\choose': ['(', ')'],
  '\\brace': ['{', '}'],
  '\\brack': ['[', ']'],
}
const boundary = '\u0000math-expansion-boundary'

function labelledOperator(symbol: string, above: string, below: string, size = ''): string {
  const base = `<mo stretchy="true" movablelimits="false"${size ? ` minsize="${size}"` : ''}>${symbol}</mo>`
  if (above && below) return `<munderover>${base}${below}${above}</munderover>`
  if (above) return `<mover>${base}${above}</mover>`
  return below ? `<munder>${base}${below}</munder>` : base
}

function mathSize(style: MathStyle, markup: string): string {
  return `<mstyle displaystyle="${style === 0}" scriptlevel="${Math.max(0, style - 1)}">${markup}</mstyle>`
}

function fractionMarkup(first: Markup, second: Markup, forced?: MathStyle, thickness?: string, align?: string): Markup {
  const bar = thickness !== undefined ? ` linethickness="${thickness}"` : ''
  const numerator = align ? ` numalign="${align}"` : ''
  const start = `<mfrac${bar}${numerator}>`
  if (forced === undefined && typeof first === 'string' && typeof second === 'string') return `${start}${first}${second}</mfrac>`
  return (parent) => {
    const target = forced ?? parent
    const child = fractionStyle(target)
    const content = `${start}${renderMarkup(first, child)}${renderMarkup(second, child)}</mfrac>`
    return target === parent ? content : mathSize(target, content)
  }
}

function dimension(value: string): string | undefined {
  const [, amount, unit] = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(px|em|ex|pt|bp|cm|mm|in|mu)?$/.exec(value.trim()) ?? []
  if (!amount || (!unit && Number(amount) !== 0) || Math.abs(Number(amount)) > 1000) return
  if (unit === 'mu') return `${Number(amount) / 18}em`
  return `${amount}${unit === 'bp' ? 'pt' : unit ?? 'px'}`
}

/** Translate a bounded TeX math subset to native MathML, with the source retained for accessibility. */
export function renderMath(source: string, display = false, configured: MathMacros = {}, state?: MathState): string {
  const tokens = tokenize(source)
  if (tokens.length > 6000) return `<code>${escapeHtml(source)}</code>`
  let cursor = 0
  let depth = 0
  let expandedCount = 0
  let tagState = { label: '', suppressed: false }
  let environmentDepth = 0
  let delimiterDepth = 0
  let equationNumber = 0

  const macros = new Map<string, Macro>()
  const scopes: Map<string, Macro | undefined>[] = []
  function assign(name: string, definition: Macro, global = false): void {
    if (!/^\\(?:[A-Za-z@]+|[^\s])$/.test(name)) return
    if (global) {
      state?.globals.set(name, definition)
      for (const scope of scopes) scope.delete(name)
    }
    const scope = scopes.at(-1)
    if (!global && scope && !scope.has(name)) scope.set(name, macros.get(name))
    macros.set(name, definition)
  }
  function plainMacro(body: string[], arity = 0, optional?: string[]): Macro {
    const count = Math.max(arity, ...body.map(token => /^#[1-9]$/.test(token) ? Number(token[1]) : 0))
    return { body, parameters: Array.from({ length: count }, () => []), prefix: [], optional }
  }
  for (const [name, replacement] of Object.entries(configured)) {
    if (replacement.length <= 8192) assign(name, plainMacro(tokenize(replacement)))
  }
  for (const [name, definition] of state?.globals ?? []) macros.set(name, definition)

  const space = () => { while (/^\s+$/.test(tokens[cursor] ?? '')) cursor++ }

  function inScope<T>(render: () => T): T {
    const saved = new Map<string, Macro | undefined>()
    scopes.push(saved)
    try { return render() }
    finally {
      scopes.pop()
      for (const [command, previous] of saved) {
        if (previous) macros.set(command, previous)
        else macros.delete(command)
      }
    }
  }

  function expand(skipSpace = true): void {
    if (skipSpace) space()
    let macro = macros.get(tokens[cursor])
    while (macro) {
      if (++expandedCount > 300) throw new Error('Too many math macro expansions')
      const start = cursor++
      space()
      for (const token of macro.prefix) {
        if (tokens[cursor++] !== token) throw new Error('Missing macro prefix')
      }
      const values = macro.parameters.map((delimiter, index) => {
        if (index === 0 && macro!.optional !== undefined) return rawBracket() ?? macro!.optional
        return delimiter.length ? delimitedArgument(delimiter) : rawGroup()
      })
      const body = macro.body.flatMap(token => /^#[1-9]$/.test(token) ? values[Number(token[1]) - 1] ?? [] : [token])
      if (tokens.length + body.length > 12000) throw new Error('Expanded equation is too long')
      tokens.splice(start, cursor - start, ...body)
      cursor = start
      if (skipSpace) space()
      macro = macros.get(tokens[cursor])
    }
  }

  const peek = () => { expand(); return tokens[cursor] ?? '' }
  const take = () => { expand(); return tokens[cursor++] ?? '' }

  function rawGroup(): string[] {
    space()
    if (tokens[cursor] === undefined || tokens[cursor] === boundary) throw new Error('Missing math argument')
    if (tokens[cursor] !== '{') return [tokens[cursor++]]
    cursor++
    let level = 1
    const begin = cursor
    while (cursor < tokens.length && level) {
      const next = tokens[cursor++]
      if (next === boundary) throw new Error('Unclosed math argument')
      if (next === '{') level++
      if (next === '}') level--
    }
    if (level) throw new Error('Unclosed math argument')
    return tokens.slice(begin, cursor - 1)
  }

  function literalGroup(): string {
    return rawGroup().join('')
  }

  function delimitedArgument(delimiter: string[]): string[] {
    const start = cursor
    let level = 0
    while (cursor < tokens.length && tokens[cursor] !== boundary) {
      if (level === 0 && delimiter.every((token, index) => tokens[cursor + index] === token)) {
        const argument = tokens.slice(start, cursor)
        cursor += delimiter.length
        return argument
      }
      const token = tokens[cursor++]
      if (token === '{') level++
      else if (token === '}') level--
      if (level < 0) break
    }
    throw new Error('Missing macro delimiter')
  }

  function rawBracket(): string[] | undefined {
    space()
    if (tokens[cursor] !== '[') return
    cursor++
    return delimitedArgument([']'])
  }

  function expandDefinition(body: string[]): string[] {
    const begin = cursor
    tokens.splice(begin, 0, ...body, boundary)
    const definition: string[] = []
    try {
      while (tokens[cursor] !== boundary) {
        if (tokens[cursor] === '\\noexpand') cursor++
        else expand(false)
        if (tokens[cursor] === boundary) break
        definition.push(tokens[cursor++])
      }
    }
    finally {
      const end = tokens.indexOf(boundary, begin)
      tokens.splice(begin, end - begin + 1)
      cursor = begin
    }
    return definition
  }

  function argument(): Markup {
    if (depth++ > 100) throw new Error('Math arguments are nested too deeply')
    const token = take()
    if (!token || token === '}' || token === boundary || token === '^' || token === '_') throw new Error('Missing math argument')
    if (infixFractions.has(token)) throw new Error('An infix fraction argument requires a group')
    const markup = atom(token).markup
    depth--
    return markup
  }

  function bracket(): string | undefined {
    return rawBracket()?.join('')
  }

  function readDelimiter(command: string): string {
    const token = take()
    if (token !== '{') return delimiter(token, command)
    const symbol = take()
    if (take() !== '}') throw new Error(`Invalid delimiter after \\${command}`)
    return delimiter(symbol, command)
  }

  function pairedDelimiters(): Markup {
    const left = fence(readDelimiter('left'))
    delimiterDepth++
    let content: Markup
    try {
      content = inScope(() => row(['\\right', '}', '\\end', '&', '\\\\', '\\cr']))
    }
    finally { delimiterDepth-- }
    if (take() !== '\\right') throw new Error('Missing \\right for \\left')
    const right = fence(readDelimiter('right'))
    return xml`<mrow>${left}${content}${right}</mrow>`
  }

  function readDimension(blank?: string): string {
    expand()
    if (tokens[cursor] === '{') {
      const value = expandDefinition(rawGroup()).join('')
      if (!value.trim() && blank !== undefined) return blank
      const length = dimension(value)
      if (length !== undefined) return length
    }
    else {
      for (let end = cursor + 1; end <= Math.min(cursor + 15, tokens.length); end++) {
        const candidate = tokens.slice(cursor, end).join('')
        if (!/[a-z]$/i.test(candidate)) continue
        const value = dimension(candidate)
        if (value !== undefined) {
          cursor = end
          return value
        }
      }
    }
    throw new Error('Invalid math dimension')
  }

  function textBox(name: string): Markup {
    if (name === 'reflectbox') return xml`<mrow class="math-reflect">${textArgument('text')}</mrow>`
    if (name === 'fbox') return xml`<mrow class="math-color-box math-frame">${textArgument('text')}</mrow>`
    const frame = name === 'fcolorbox' ? safeColor(literalGroup()) : ''
    const background = safeColor(literalGroup())
    if (!background || (name === 'fcolorbox' && !frame)) throw new Error('Invalid math box color')
    const content = textArgument('text')
    return xml`<mrow class="math-color-box${frame ? ' math-frame' : ''}" style="background-color:${background}${frame ? `;border-color:${frame}` : ''}">${content}</mrow>`
  }

  function overlap(direction: string, content: Markup): Markup {
    return xml`<mpadded width="0"><mrow class="math-overlap-${direction}">${content}</mrow></mpadded>`
  }

  function textArgument(name: string): Markup {
    if (depth++ > 100) throw new Error('Math text is nested too deeply')
    const properties = textFonts[name]
    const wrap = (markup: Markup) => properties ? xml`<mrow style="${properties}">${markup}</mrow>` : markup
    expand()
    if (tokens[cursor] !== '{') {
      const token = tokens[cursor++]
      if (!token || token === boundary || token === '}') throw new Error('Missing math text argument')
      depth--
      return wrap(tag('mtext', textSymbols[token] ?? token.replace(/^\\([%$#&_{} ])$/, '$1')))
    }
    cursor++
    const parts: Markup[] = []
    let literal = ''
    function flush(): void {
      if (!literal) return
      const joined = literal.replace(/\s+/g, ' ').replace(/^ | $/g, '\u00A0')
      parts.push(tag('mtext', joined))
      literal = ''
    }
    inScope(() => {
      while (true) {
        expand(false)
        const token = tokens[cursor++]
        if (!token || token === boundary) throw new Error('Unclosed math text')
        if (token === '}') break
        if (token === '$' || token === '\\(') {
          flush()
          const close = token === '$' ? '$' : '\\)'
          const value = inScope(() => row([close, '}']))
          if (take() !== close) throw new Error('Unclosed inline math in text')
          parts.push(style => {
            const content = renderMarkup(value, style === 0 ? 1 : style)
            return `<mrow style="font-style:normal;font-weight:normal">${style === 0 ? mathSize(1, content) : content}</mrow>`
          })
        }
        else if (token === '{' || (token.startsWith('\\') && Object.hasOwn(textFonts, token.slice(1)))) {
          flush()
          if (token === '{') cursor--
          parts.push(textArgument(token === '{' ? 'text' : token.slice(1)))
        }
        else if (token.startsWith('\\') && textBoxes.has(token.slice(1))) {
          flush()
          parts.push(textBox(token.slice(1)))
        }
        else if (token === '\\llap' || token === '\\clap' || token === '\\rlap') {
          flush()
          parts.push(overlap(token[1], textArgument('text')))
        }
        else if (Object.hasOwn(textAccents, token)) {
          const character = literalGroup().trim()
          literal += (character + textAccents[token]).normalize('NFC')
        }
        else if (token === '~') {
          flush()
          parts.push(tag('mtext', '\u00A0'))
        }
        else literal += textSymbols[token] ?? token.replace(/^\\([%$#&_{} ])$/, '$1')
      }
    })
    flush()
    depth--
    const content = joinMarkup(parts)
    return properties || parts.length === 1 ? wrap(content) : xml`<mrow>${content}</mrow>`
  }

  function fraction(target?: MathStyle, thickness?: string, align?: string): Markup {
    return fractionMarkup(argument(), argument(), target, thickness, align)
  }

  function infixThickness(token: string): string | undefined {
    if (token === '\\over') return
    const thickness = token === '\\above' ? readDimension('0') : '0'
    return Number.parseFloat(thickness) > 0 ? thickness : '0'
  }

  function nextTag(automatic: boolean): string {
    if (tagState.label) return tagState.label
    return automatic && !tagState.suppressed ? `(${++equationNumber})` : ''
  }

  function unicodeScript(symbols: ReadonlyMap<string, string>): Markup {
    let buffer = ''
    for (let value = symbols.get(peek()); value !== undefined; value = symbols.get(peek())) {
      cursor++
      buffer += value
    }
    const parts = (buffer.match(/\d+|./g) ?? []).map(token => /^\d+$/.test(token) ? tag('mn', token) : atom(token).markup)
    return xml`<mrow>${joinMarkup(parts)}</mrow>`
  }

  function primeScript(): Markup {
    let text = ''
    for (let count = primes[peek()]; count; count = primes[peek()]) {
      cursor++
      text += '′'.repeat(count)
    }
    const following = peek() === '^' ? (cursor++, argument()) : ''
    return xml`<mrow>${tag('mo', text)}${following}</mrow>`
  }

  function ellipsis(name: string): string {
    const next = peek()
    const command = next.startsWith('\\') ? next.slice(1) : ''
    const integral = name === 'dotsi' || (name === 'dots' && integrals.has(command))
    const centered = integral || name === 'dotsb' || name === 'dotsm'
      || (name === 'dots' && (command.startsWith('not') || centersDots.test(operators[command] ?? next)))
    const nearClosing = /^(?:[)\]},.;]|\\(?:right|rparen|rbrack|rbrace|rangle|rceil|rfloor|rgroup|rmoustache|(?:big|Big|bigg|Bigg)r))$/.test(next)
    const trailing = name === 'dotsx' || (nearClosing && (name !== 'dotsc' || next !== ',')) ? muSpace(3) : ''
    const symbol = tag('mo', centered ? '⋯' : '…')
    return integral || trailing ? `<mrow>${integral ? muSpace(-3) : ''}${symbol}${trailing}</mrow>` : symbol
  }

  function modulus(name: string): Markup {
    const label = '<mi mathvariant="normal">mod</mi>'
    if (name === 'bmod') return `<mrow>${muSpace(5)}${label}${muSpace(5)}</mrow>`
    const operand = argument()
    const parenthesized = name !== 'mod'
    return (style) => {
      const space = muSpace(style === 0 ? 18 : parenthesized ? 8 : 12)
      const value = renderMarkup(operand, style)
      const content = name === 'pod' ? value : label + muSpace(6) + value
      const body = parenthesized ? `<mrow>${fence('(', false)}${content}${fence(')', false)}</mrow>` : content
      return `<mrow>${space}${body}</mrow>`
    }
  }

  function row(stop: string[] = [], breakOnInfix = false): Markup {
    if (depth++ > 100) throw new Error('Math groups are nested too deeply')
    const before: Markup[] = []
    let parts = before
    let infix = ''
    let thickness: string | undefined
    for (let token = peek(); token && !stop.includes(token); token = peek()) {
      if (breakOnInfix && infixFractions.has(token)) break
      cursor++
      if (infixFractions.has(token)) {
        if (infix) throw new Error('Only one infix fraction is allowed per math group')
        infix = token
        thickness = infixThickness(token)
        parts = []
        continue
      }
      if (Object.hasOwn(styleCommands, token)) {
        const selected = styleCommands[token]
        parts.push(mathSize(selected, renderMarkup(row(stop, true), selected)))
        continue
      }
      if (token === '\\color') {
        const color = safeColor(literalGroup())
        const content = row(stop, true)
        parts.push(color ? xml`<mrow style="color:${color}">${content}</mrow>` : content)
        continue
      }
      let part: Atom
      if (/^\d$/.test(token)) {
        let number = token
        while (/^\d$/.test(tokens[cursor] ?? '')) number += tokens[cursor++]
        if (tokens[cursor] === '.' && /^\d$/.test(tokens[cursor + 1] ?? '')) {
          number += tokens[cursor++]
          while (/^\d$/.test(tokens[cursor] ?? '')) number += tokens[cursor++]
        }
        part = { markup: tag('mn', number) }
      }
      else if (token === '_' || token === '^' || primes[token] || unicodeSubscripts.has(token) || unicodeSuperscripts.has(token)) {
        part = { markup: '<mrow/>' }
        cursor--
      }
      else part = atom(token)
      let lower: Markup = ''
      let upper: Markup = ''
      let forceLimits: boolean | undefined
      for (let kind = peek(); kind; kind = peek()) {
        if (kind === '\\limits' || kind === '\\nolimits') {
          cursor++
          if (part.limits === undefined) throw new Error('Limit control requires a math operator')
          forceLimits = kind === '\\limits'
          continue
        }
        if (kind === '_' || unicodeSubscripts.has(kind)) {
          if (lower) throw new Error('Double subscript')
          lower = inScript(kind === '_' ? (cursor++, argument()) : unicodeScript(unicodeSubscripts))
          continue
        }
        if (kind !== '^' && !primes[kind] && !unicodeSuperscripts.has(kind)) break
        if (upper) throw new Error('Double superscript')
        upper = inScript(kind === '^' ? (cursor++, argument()) : primes[kind] ? primeScript() : unicodeScript(unicodeSuperscripts))
      }
      if (part.brace === 'upper' && upper) {
        part.markup = xml`<mover>${part.markup}${upper}</mover>`
        upper = ''
      }
      if (part.brace === 'lower' && lower) {
        part.markup = xml`<munder>${part.markup}${lower}</munder>`
        lower = ''
      }
      if (!lower && !upper) parts.push(part.markup)
      else {
        const normal = lower && upper ? 'msubsup' : lower ? 'msub' : 'msup'
        const stacked = lower && upper ? 'munderover' : lower ? 'munder' : 'mover'
        const wrap = (tag: string) => xml`<${tag}>${part.markup}${lower}${upper}</${tag}>`
        if (forceLimits !== undefined || !part.limits) {
          if (forceLimits) part.markup = stackOperator(part.markup)
          parts.push(wrap(forceLimits ? stacked : normal))
        }
        else {
          const display = wrap(stacked)
          const inline = wrap(normal)
          parts.push(style => renderMarkup(style === 0 ? display : inline, style))
        }
      }
    }
    depth--
    const result = joinMarkup(parts)
    if (!infix) return result
    const quotient = fractionMarkup(xml`<mrow>${joinMarkup(before)}</mrow>`, xml`<mrow>${result}</mrow>`, undefined, thickness)
    const fences = fractionFences[infix]
    return fences ? xml`<mrow>${fence(fences[0])}${quotient}${fence(fences[1])}</mrow>` : quotient
  }

  function commutativeDiagram(): string {
    const stops = ['@', '&', '\\\\', '\\cr', '\\end']
    const rows: string[][] = []
    function arrowLabel(type: string): string {
      const label = renderMarkup(inScope(() => row([...stops, type])), 2)
      if (take() !== type) throw new Error('Incomplete CD arrow')
      return label ? `<mrow>${label}</mrow>` : ''
    }
    function commutativeArrow(): string {
      const type = take()
      if (type === '.') return ''
      if (type === '=') return labelledOperator('=', '', '', '2em')
      if (type === '|') return labelledOperator('‖', '', '', '1.7em')
      if (!/^[<>AV]$/.test(type)) throw new Error('Unknown CD arrow')
      const first = arrowLabel(type)
      const second = arrowLabel(type)
      if (type === '<' || type === '>') return labelledOperator(type === '<' ? '←' : '→', first, second, '2em')
      const vertical = labelledOperator(type === 'A' ? '↑' : '↓', '', '', '1.7em')
      return `<mrow class="math-cd-vertical">${mathSize(2, first || '<mrow/>')}${vertical}${mathSize(2, second || '<mrow/>')}</mrow>`
    }
    let cells: string[] = []
    let closed = false
    while (peek()) {
      cells.push(renderMarkup(inScope(() => row(stops)), 0))
      const separator = take()
      if (separator === '@') { cells.push(commutativeArrow()); continue }
      if (separator === '&') continue
      const lineBreak = separator === '\\\\' || separator === '\\cr'
      if (!lineBreak && (separator !== '\\end' || literalGroup() !== 'CD')) break
      if (rows.length % 2) {
        if (cells[0] === '') cells.shift()
        if (cells.at(-1) === '') cells.pop()
      }
      if (cells.some(Boolean) || lineBreak) rows.push(cells)
      cells = []
      if (!lineBreak) { closed = true; break }
    }
    if (!closed || !rows.length) throw new Error('Unclosed CD environment')
    const columns = Math.max(...rows.map(cells => cells.length))
    if (columns * rows.length > 6000) throw new Error('CD environment has too many cells')
    const markup = rows.map(cells => `<mtr>${Array.from({ length: columns }, (_, index) => `<mtd>${cells[index] ?? ''}</mtd>`).join('')}</mtr>`).join('')
    return `<mtable class="math-cd">${markup}</mtable>`
  }

  function delimitedNotation(name: string): Markup {
    const [left, right] = notationDelimiters[name]
    const stretchy = /^[A-Z]/.test(name)
    const separator = name === 'Braket' || name === 'Set' || name === 'set'
    if (!separator || peek() !== '{') return xml`<mrow>${fence(left, stretchy)}${argument()}${fence(right, stretchy)}</mrow>`
    take()
    const content = inScope(() => {
      const parts: Markup[] = []
      const stops = name === 'set' ? ['|', '}'] : ['|', '\\|', '}']
      parts.push(row(stops))
      while (peek() && peek() !== '}') {
        const join = take()
        const doubled = join === '\\|' || (stretchy && tokens[cursor] === '|')
        if (join === '|' && doubled) cursor++
        parts.push(stretchy ? fence(doubled && name === 'Set' ? '‖' : '∣') : tag('mo', '∣'))
        parts.push(row(name === 'Braket' ? stops : ['}']))
      }
      if (take() !== '}') throw new Error('Unclosed math notation')
      return joinMarkup(parts)
    })
    return xml`<mrow>${fence(left, stretchy)}${content}${fence(right, stretchy)}</mrow>`
  }

  function matrix(environment: string): Markup {
    const unclosed = () => new Error(`Unclosed math environment: ${environment}`)
    if (environment === 'CD') return commutativeDiagram()
    if (/^equation[*]?$/.test(environment)) {
      environmentDepth++
      const content = row(['\\end'])
      environmentDepth--
      if (take() !== '\\end' || literalGroup() !== environment) throw unclosed()
      tagState.label = nextTag(display && environment === 'equation')
      return xml`<mrow>${content}</mrow>`
    }
    if (!/^(?:[pbBvV]?matrix[*]?|smallmatrix|d?rcases|d?cases|align(?:ed|edat|at[*]?|[*])?|gather(?:ed|[*])?|split|d?array|subarray|substack|multline[*]?)$/.test(environment))
      return tag('mtext', `\\begin{${environment}}`)
    const stack = environment === 'substack'
    const columnArray = /^(?:d?array|subarray)$/.test(environment)
    const columns = columnArray ? literalGroup() : environment.endsWith('matrix*') ? bracket() ?? '' : ''
    const paired = /^align(?:ed)?at[*]?$/.test(environment)
    const pairs = paired ? Number(literalGroup()) : 0
    if (paired && (!Number.isSafeInteger(pairs) || pairs < 1)) throw new Error('Invalid alignment column count')
    const layout = arrayColumns(columns)
    if (environment === 'subarray' && !/^\s*[lc]\s*$/.test(columns)) throw new Error('Invalid subarray alignment')
    const compact = stack || environment === 'subarray' || environment === 'smallmatrix'
    const aligned = environment.startsWith('align') || environment === 'split'
    const gathered = environment.startsWith('gather') || environment.startsWith('multline')
    const cases = environment.endsWith('cases')
    const ordinaryCellStyle = environment.startsWith('d') || aligned || gathered ? 0 : 1
    const stretch = columnArray && macros.has('\\arraystretch')
      ? Number(expandDefinition(['\\arraystretch']).join('')) : 1
    if (!(stretch > 0 && stretch <= 100)) throw new Error('Invalid array stretch')
    const outerTag = tagState
    const automatic = display && environmentDepth === 0 && /^(?:align|alignat|gather)$/.test(environment)
    environmentDepth++
    tagState = { label: '', suppressed: false }
    const rows: ArrayRow[] = []
    let cells: Markup[] = []
    const end = stack ? '}' : '\\end'
    let rule: ArrayRule | undefined
    let closed = false
    const stops = ['&', '\\\\', '\\cr', end]
    while (peek()) {
      if (columnArray && !cells.length) {
        while (peek() === '\\hline' || peek() === '\\hdashline') {
          const line = take() === '\\hline' ? 'solid' : 'dashed'
          rule = rule ? 'double' : line
        }
      }
      cells.push(inScope(() => row(stops)))
      const separator = take()
      if (separator === '&') {
        if (stack || environment === 'subarray' || gathered) throw new Error('Too many columns in math stack')
        continue
      }
      if (pairs && cells.length > pairs * 2) throw new Error('Too many alignment columns')
      const lineBreak = separator === '\\\\' || separator === '\\cr'
      const extra = lineBreak ? bracket() : undefined
      const gap = extra === undefined ? undefined : dimension(extra)
      if (extra !== undefined && gap === undefined) throw new Error('Invalid array row spacing')
      if (cells.length > 1 || cells[0] || tagState.label || rows.length === 0 || lineBreak) {
        rows.push({ cells, label: nextTag(automatic), before: rule, gap })
        rule = undefined
      }
      cells = []
      tagState = { label: '', suppressed: false }
      if (separator === end && (stack || literalGroup() === environment)) {
        closed = true
        break
      }
      if (!lineBreak) break
    }
    if (!closed) throw unclosed()
    environmentDepth--
    tagState = outerTag
    const kind = environment.replace(/[*]$/, '').replace(/^d(?=(?:array|r?cases)$)/, '')
    const [left, right] = kind === 'rcases' ? ['', '}'] : matrixDelimiters[kind] ?? ['', '']
    const alignment = layout.columns.map(column => column.align)
    const columnAlign = alignment.join(' ') || (aligned ? 'right left' : cases ? 'left left' : '')
    const align = columnAlign ? ` columnalign="${columnAlign}"` : ''
    const tags = rows.some(entry => entry.label)
    const columnCount = Math.max(layout.columns.length, ...rows.map(entry => entry.cells.length))
    if (columnArray && columnCount * rows.length > 6000) throw new Error('Math array has too many cells')
    const pad = compact ? '0.06' : (0.14 * stretch).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
    const lines = compact ? ' class="math-compact-array"' : ' data-equation-lines'
    return (style) => {
      const cellStyle = compact ? Math.max(2, style) as MathStyle : ordinaryCellStyle
      const markup = rows.map((entry, rowIndex) => {
        const cell = tags ? `<mtd class="math-equation-number">${tag('mtext', entry.label)}</mtd>` : ''
        // MathML Core browsers use CSS for cell alignment and visible rules.
        const content = Array.from({ length: columnArray ? columnCount : entry.cells.length }, (_, index) => {
          const align = aligned ? (index % 2 ? 'left' : 'right') : alignment[index] ?? alignment.at(-1) ?? (cases ? 'left' : '')
          const styling: string[] = []
          if (align) styling.push(`text-align:${align}`)
          if (cellStyle === 0) styling.push('math-style:normal')
          const before = layout.columns[index]?.before
          if (before) styling.push(tableBorder('left', before))
          if (layout.after && index === columnCount - 1) styling.push(tableBorder('right', layout.after))
          if (entry.before) styling.push(tableBorder('top', entry.before))
          if (rule && rowIndex === rows.length - 1) styling.push(tableBorder('bottom', rule))
          if (compact || stretch !== 1) styling.push(`padding-block:${pad}em`)
          if (entry.gap) styling.push(`padding-bottom:max(0px,calc(${pad}em + ${entry.gap}))`)
          const settings = styling.length ? ` style="${styling.join(';')}"` : ''
          const value = renderMarkup(entry.cells[index] ?? '', cellStyle)
          return `<mtd${settings}>${style === cellStyle ? value : mathSize(cellStyle, value)}</mtd>`
      }).join('')
      return `<mtr>${state?.options.leqno ? cell : ''}${content}${state?.options.leqno ? '' : cell}</mtr>`
      }).join('')
      return `<mrow>${fence(left)}<mtable${lines}${align}>${markup}</mtable>${fence(right)}</mrow>`
    }
  }

  function explicitCharacter(): string {
    const prefix = peek()
    let code: number
    if (prefix === '`') {
      take()
      const char = take().replace(/^\\(?=.$)/u, '')
      code = [...char].length === 1 ? char.codePointAt(0)! : NaN
    }
    else {
      const radix = prefix === '"' ? 16 : prefix === "'" ? 8 : 10
      if (radix !== 10) take()
      const digits = radix === 16 ? /^[0-9a-f]$/i : radix === 8 ? /^[0-7]$/ : /^\d$/
      space()
      const start = cursor
      while (cursor - start < 16 && digits.test(tokens[cursor] ?? '')) cursor++
      code = Number.parseInt(tokens.slice(start, cursor).join(''), radix)
    }
    if (!Number.isInteger(code) || code < 0x20 || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF))
      throw new Error('Invalid math character code')
    return String.fromCodePoint(code)
  }

  function atom(token: string): Atom {
    if (token === '{') {
      const content = inScope(() => row(['}']))
      if (take() !== '}') throw new Error('Unclosed math group')
      return { markup: xml`<mrow>${content}</mrow>` }
    }
    if (!token.startsWith('\\')) {
      if (/^\d/.test(token)) return { markup: tag('mn', token) }
      if (token !== '.' && delimiterGlyphs.has(token)) return { markup: fence(token, false) }
      return { markup: tag(/^\p{L}$/u.test(token) ? 'mi' : 'mo', token === '-' ? '−' : token) }
    }

    if (mathVerbLength(token)) {
      const [, star, withSpaces, , literal] = leadingVerb.exec(token)!
      const content = star === undefined ? literal : withSpaces.replaceAll(' ', '␣')
      return { markup: `<mtext class="math-verbatim" style="font-family:monospace;white-space:pre">${escapeHtml(content)}</mtext>` }
    }

    let name = token.slice(1)
    const global = name === 'global'
    if (global) name = take().slice(1)
    if (name === 'begingroup' || name === 'bgroup') {
      const close = name === 'begingroup' ? '\\endgroup' : '\\egroup'
      const content = inScope(() => row([close]))
      if (take() !== close) throw new Error('Unclosed math group')
      return { markup: xml`<mrow>${content}</mrow>` }
    }
    if (name === 'ce' || name === 'pu') {
      return { markup: (name === 'ce' ? chemicalFormula : physicalUnits)(literalGroup()) }
    }
    if (['def', 'gdef', 'edef', 'xdef'].includes(name)) {
      const command = literalGroup()
      space()
      const prefix: string[] = []
      const parameters: string[][] = []
      let sequence = prefix
      while (tokens[cursor] !== '{') {
        const token = tokens[cursor++]
        if (!token || token === boundary || token === '}' || sequence.length > 80) throw new Error('Invalid macro parameter')
        if (/^#[1-9]$/.test(token)) {
          if (Number(token[1]) !== parameters.length + 1) throw new Error('Macro parameters must be sequential')
          sequence = []
          parameters.push(sequence)
        }
        else sequence.push(token)
      }
      const body = rawGroup()
      const replacement = name === 'edef' || name === 'xdef' ? expandDefinition(body) : body
      assign(command, { body: replacement, parameters, prefix }, global || name === 'gdef' || name === 'xdef')
      return { markup: '' }
    }
    if (name === 'let') {
      const target = literalGroup()
      space()
      if (tokens[cursor] === '=') cursor++
      const source = rawGroup()
      const existing = source.length === 1 ? macros.get(source[0]) : undefined
      assign(target, existing ?? plainMacro(source), global)
      return { markup: '' }
    }
    if (name === 'newcommand' || name === 'renewcommand' || name === 'providecommand') {
      const command = literalGroup().trim()
      const count = bracket()
      if (count !== undefined && !/^\d$/.test(count)) throw new Error('Invalid macro argument count')
      const arity = Number(count ?? 0)
      const optional = arity ? rawBracket() : undefined
      const body = rawGroup()
      if (name !== 'providecommand' || !macros.has(command)) assign(command, plainMacro(body, arity, optional))
      return { markup: '' }
    }
    if (name === 'mathchoice') {
      const choices = Array.from({ length: 4 }, () => {
        const next = peek()
        if (!next || next === '}') throw new Error('Missing math choice')
        return argument()
      })
      return { markup: style => renderMarkup(choices[style], style) }
    }
    if (name === '@firstoftwo' || name === '@secondoftwo') {
      const choices = [rawGroup(), rawGroup()]
      const selected = choices[name === '@firstoftwo' ? 0 : 1]
      tokens.splice(cursor, 0, '{', ...selected, '}')
      return { markup: argument() }
    }
    if (name === 'tag') {
      if (peek() === '*') { take(); tagState.label = literalGroup() }
      else tagState.label = `(${literalGroup()})`
      return { markup: '' }
    }
    if (name === 'label') { literalGroup(); return { markup: '' } }
    if (name === 'notag' || name === 'nonumber') { tagState.suppressed = true; return { markup: '' } }
    if (name === 'boxed' || name === 'cancel' || name === 'bcancel' || name === 'xcancel') {
      return { markup: xml`<mrow class="math-${name}">${argument()}</mrow>` }
    }
    if (name === 'textcolor') {
      const color = safeColor(literalGroup())
      const content = argument()
      const safe = color ? ` style="color:${color}"` : ''
      return { markup: xml`<mrow${safe}>${content}</mrow>` }
    }
    if (textBoxes.has(name)) return { markup: textBox(name) }
    if (name === 'mathreflectbox') return { markup: xml`<mrow class="math-reflect">${argument()}</mrow>` }
    if (name === 'vcenter') {
      return { markup: xml`<mtable class="math-vcenter"><mtr><mtd>${argument()}</mtd></mtr></mtable>` }
    }
    const lap = /^(math)?([lcr])lap$/.exec(name)
    if (lap) return { markup: overlap(lap[2], lap[1] ? argument() : textArgument('text')) }
    if (name === 'left') return { markup: pairedDelimiters() }
    if (name === 'right') throw new Error('Unexpected \\right')
    if (name === 'middle') {
      if (!delimiterDepth) throw new Error('\\middle requires \\left and \\right')
      const glyph = readDelimiter(name)
      return { markup: glyph === '.' ? '' : `<mo stretchy="true" symmetric="true" form="infix">${escapeHtml(glyph)}</mo>` }
    }
    const sized = /^(bigg|Bigg|big|Big)([lrm]?)$/.exec(name)
    if (sized) return { markup: sizedFence(readDelimiter(name), sizedDelimiters[sized[1]], sized[2]) }
    if (name === 'begin') return { markup: inScope(() => matrix(literalGroup())) }
    if (name === 'substack') {
      if (take() !== '{') throw new Error('Expected a grouped math stack')
      return { markup: inScope(() => matrix('substack')) }
    }
    if (name === 'end') return { markup: tag('mtext', `\\end{${literalGroup()}}`) }
    if (['frac', 'dfrac', 'tfrac', 'binom', 'dbinom', 'tbinom'].includes(name)) {
      const binomial = name.endsWith('binom')
      const targetStyle = name.startsWith('d') ? 0 : name.startsWith('t') ? 1 : undefined
      const content = fraction(targetStyle, binomial ? '0' : undefined)
      return { markup: binomial ? xml`<mrow>${fence('(')}${content}${fence(')')}</mrow>` : content }
    }
    if (name === 'genfrac') {
      const left = expandDefinition(rawGroup()).join('').trim() || '.'
      const right = expandDefinition(rawGroup()).join('').trim() || '.'
      const bar = readDimension('')
      const mode = expandDefinition(rawGroup()).join('').trim()
      if (mode && !/^[0-3]$/.test(mode)) throw new Error('Invalid fraction style')
      const thickness = bar ? (Number.parseFloat(bar) > 0 ? bar : '0') : undefined
      const content = fraction(mode ? Number(mode) as MathStyle : undefined, thickness)
      return { markup: xml`<mrow>${fence(delimiter(left, 'genfrac'))}${content}${fence(delimiter(right, 'genfrac'))}</mrow>` }
    }
    if (name === 'cfrac') {
      const align = bracket()
      return { markup: fraction(0, undefined, align === 'l' ? 'left' : align === 'r' ? 'right' : undefined) }
    }
    if (name === 'raisebox' || name === 'rule') {
      if (name === 'rule') {
        const offset = dimension(bracket() ?? '')
        const width = readDimension()
        const height = readDimension()
        const rule = `<mspace width="${width}" height="${height}" style="background:currentColor"/>`
        return { markup: offset ? `<mpadded voffset="${offset}">${rule}</mpadded>` : rule }
      }
      const offset = readDimension()
      const height = dimension(bracket() ?? '')
      const depth = dimension(bracket() ?? '')
      return { markup: xml`<mpadded voffset="${offset}"${height ? ` height="${height}"` : ''}${depth ? ` depth="${depth}"` : ''}>${textArgument('text')}</mpadded>` }
    }
    if (name === 'smash') {
      const side = bracket()
      return { markup: xml`<mpadded${side !== 'b' ? ' height="0"' : ''}${side !== 't' ? ' depth="0"' : ''}>${argument()}</mpadded>` }
    }
    if (['hspace', 'kern', 'mkern', 'mskip', 'hskip'].includes(name)) {
      if (name === 'hspace' && peek() === '*') take()
      return { markup: spaceMarkup(readDimension()) }
    }
    if (Object.hasOwn(notationDelimiters, name)) return { markup: delimitedNotation(name) }
    if (name === 'prescript') {
      const upper = inScript(argument())
      const lower = inScript(argument())
      return { markup: xml`<mmultiscripts>${argument()}<mprescripts/>${lower}${upper}</mmultiscripts>` }
    }
    if (name === 'sqrt') {
      let degree = ''
      if (peek() === '[') {
        take()
        degree = renderMarkup(inScope(() => row([']'])), 3)
        if (take() !== ']') throw new Error('Unclosed root index')
      }
      const base = argument()
      return { markup: degree ? xml`<mroot>${base}<mrow>${degree}</mrow></mroot>` : xml`<msqrt>${base}</msqrt>` }
    }
    if (Object.hasOwn(textFonts, name)) return { markup: textArgument(name) }
    if (name === 'operatorname' || name === 'operatornamewithlimits') {
      const star = name === 'operatorname' && peek() === '*'
      if (star) take()
      const label = expandDefinition(rawGroup()).join('').replace(/\\([_%#$&{}])/g, '$1')
      return { markup: tag('mo', label), limits: name === 'operatornamewithlimits' || star }
    }
    if (name === 'char') {
      const glyph = explicitCharacter()
      return { markup: tag(/^\p{L}$/u.test(glyph) ? 'mi' : 'mtext', glyph) }
    }
    if (name === 'mathstrut') {
      return { markup: '<mpadded width="0"><mphantom><mo stretchy="false">(</mo></mphantom></mpadded>' }
    }
    if (name === 'mathop') return { markup: argument(), limits: false }
    if (name === 'mod' || name === 'bmod' || name === 'pmod' || name === 'pod') return { markup: modulus(name) }
    if (contextualDots.has(name)) return { markup: ellipsis(name) }
    if (name === 'not') {
      const operand = argument()
      return { markup: typeof operand === 'string' ? negatedMarkup(operand) : style => negatedMarkup(operand(style)) }
    }
    if (Object.hasOwn(namedLimits, name)) return { markup: tag('mo', namedLimits[name]), limits: true }
    if (Object.hasOwn(accentedLimits, name)) {
      return { markup: `<mo class="${accentedLimits[name]}">lim</mo>`, limits: true }
    }
    if (name === 'varinjlim' || name === 'varprojlim') {
      const mark = name === 'varinjlim' ? '→' : '←'
      return { markup: `<munder accentunder="true"><mo>lim</mo><mo stretchy="true">${mark}</mo></munder>`, limits: true }
    }
    if (name === 'overline' || name === 'underline') {
      return { markup: xml`<mrow class="math-${name}">${argument()}</mrow>` }
    }
    if (name === 'overset' || name === 'underset' || name === 'stackrel') {
      const annotation = inScript(argument())
      const element = name === 'underset' ? 'munder' : 'mover'
      return { markup: xml`<${element}>${argument()}${annotation}</${element}>` }
    }
    if (Object.hasOwn(stretchedAccents, name)) {
      const under = name.startsWith('under') || name === 'utilde'
      const element = under ? 'munder' : 'mover'
      const brace = name === 'overbrace' ? 'upper' : name === 'underbrace' ? 'lower' : undefined
      return { brace, markup: xml`<${element} ${under ? 'accentunder' : 'accent'}="true">${argument()}<mo stretchy="true">${stretchedAccents[name]}</mo></${element}>` }
    }
    if (Object.hasOwn(extensibleArrows, name)) {
      let below: Markup = ''
      if (peek() === '[') {
        take()
        below = xml`<mrow>${inScript(inScope(() => row([']'])))}</mrow>`
        if (take() !== ']') throw new Error('Unclosed arrow subscript')
      }
      const above = inScript(argument())
      const symbol = extensibleArrows[name]
      return { markup: typeof above === 'string' && typeof below === 'string'
        ? labelledOperator(symbol, above, below)
        : style => labelledOperator(symbol, renderMarkup(above, style), renderMarkup(below, style)) }
    }
    if (name === 'phantom' || name === 'hphantom' || name === 'vphantom') {
      const invisible = xml`<mphantom>${argument()}</mphantom>`
      const dimensions = name === 'hphantom' ? ' height="0" depth="0"' : name === 'vphantom' ? ' width="0"' : ''
      return { markup: dimensions ? xml`<mpadded${dimensions}>${invisible}</mpadded>` : invisible }
    }
    if (name === 'relax' || name === 'allowbreak' || name === 'nobreak') return { markup: '' }
    if (Object.hasOwn(variants, name)) {
      const variant = variants[name]
      const content = argument()
      // MathML Core honors normal on identifiers and uses font styles for other variants.
      const styled: Markup = typeof content === 'string' ? applyVariant(content, variant) : style => applyVariant(content(style), variant)
      return { markup: xml`<mrow class="math-${variant}" mathvariant="${variant}">${styled}</mrow>` }
    }
    if (Object.hasOwn(accents, name)) return { markup: xml`<mover accent="true">${argument()}${tag('mo', accents[name])}</mover>` }
    if (Object.hasOwn(greek, name)) return { markup: tag('mi', greek[name]) }
    if (name === 'smallint') return { markup: '<mo largeop="false">∫</mo>', limits: true }
    if (Object.hasOwn(operators, name)) {
      return { markup: tag('mo', operators[name]), limits: big.has(name) ? true : integrals.has(name) ? false : undefined }
    }
    if (functions.has(name)) return { markup: tag('mo', name), limits: big.has(name) }
    if (Object.hasOwn(delimiters, token)) return { markup: fence(token, false) }
    if (Object.hasOwn(spacing, name)) return { markup: spaceMarkup(spacing[name]) }
    if (/^[%$#&_{}|]$/.test(name)) return { markup: tag('mo', name) }
    if (state?.options.throwOnError) throw new Error(`Unsupported math command: ${token}`)
    const color = safeColor(state?.options.errorColor ?? '')
    return { markup: color ? `<mtext style="color:${color}">${escapeHtml(token)}</mtext>` : tag('mtext', token) }
  }

  try {
    const expression = `<mrow>${renderMarkup(row(), display ? 0 : 1)}</mrow>`
    const equationTag = tagState.label ? `<mtd class="math-equation-number">${tag('mtext', tagState.label)}</mtd>` : ''
    const numbered = equationTag
      ? `<mtable><mtr>${state?.options.leqno ? equationTag : ''}<mtd>${expression}</mtd>${state?.options.leqno ? '' : equationTag}</mtr></mtable>`
      : expression
    return `<math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ''}><semantics>${numbered}<annotation encoding="application/x-tex">${escapeHtml(source)}</annotation></semantics></math>`
  }
  catch (error) {
    if (state?.options.throwOnError) throw error
    return `<code class="math-unrendered">${escapeHtml(source)}</code>`
  }
}
