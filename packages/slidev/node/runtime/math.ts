import { escapeHtml, unescapeHtml } from './html.ts'
import { createEquationReferences } from './equation-references.ts'
import type { EquationReferenceMarkup } from './equation-references.ts'
import type { KatexOptions, KatexTrustContext } from './authoring-setup.ts'
import { mathArrowBody, stackMathArrow, texArrowMinWidth, verticalMathArrow } from './math-arrow.ts'
import { styledMathAlphabets } from './math-alphabets.ts'
import { MathParseError } from './math-error.ts'
import { chemicalFormula, physicalUnits } from './math-chemistry.ts'
import type { Markup, MathStyle } from './math-markup.ts'
import { fractionStyle, joinMarkup, renderMarkup, scriptStyle, xml } from './math-markup.ts'
import { fractionRule, mathDimension, nullDelimiterWidth } from './math-sizing.ts'
import { resolveRowClasses, rowSpacing } from './math-spacing.ts'
import type { MathClass } from './math-spacing.ts'
import { isCenteredGlyph, isColonRelationCommand, mathSymbol, textSymbol, unicodeColonRelation } from './math-symbols.ts'
import type { MathSymbol, MathSymbolKind } from './math-symbols.ts'
import { isMathAttributeCommand, isMathUrlCommand, mathAttributes, mathKeyValues, mathUrl, trustedMath } from './math-trust.ts'
import { readUnicodeToken, unicodeAccents } from './math-unicode.ts'

const greek: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', thetasym: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
  rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ',
  chi: 'χ', psi: 'ψ', omega: 'ω',
}
const upperGreek: Record<string, string> = {
  Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Epsilon: 'Ε', Zeta: 'Ζ', Eta: 'Η', Theta: 'Θ',
  Iota: 'Ι', Kappa: 'Κ', Lambda: 'Λ', Mu: 'Μ', Nu: 'Ν', Xi: 'Ξ', Omicron: 'Ο', Pi: 'Π',
  Rho: 'Ρ', Sigma: 'Σ', Tau: 'Τ', Upsilon: 'Υ', Phi: 'Φ', Chi: 'Χ', Psi: 'Ψ', Omega: 'Ω',
}
const italicGreek = new Set(['Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega'])

function greekLetter(name: string): [glyph: string, upright: boolean] | undefined {
  if (Object.hasOwn(greek, name)) return [greek[name], false]
  if (Object.hasOwn(upperGreek, name)) return [upperGreek[name], true]
  if (name.startsWith('var') && italicGreek.has(name.slice(3))) return [upperGreek[name.slice(3)], false]
}
const operators: Record<string, string> = {
  pm: '±', mp: '∓', cdot: '·', times: '×', div: '÷', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  approx: '≈', sim: '∼', simeq: '≃', equiv: '≡', propto: '∝', in: '∈', notin: '∉', subset: '⊂',
  subseteq: '⊆', supset: '⊃', supseteq: '⊇', cap: '∩', cup: '∪', land: '∧', lor: '∨',
  forall: '∀', exists: '∃', neg: '¬', to: '→', mapsto: '↦', rightarrow: '→', leftarrow: '←', gets: '←',
  leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔',
  sum: '∑', prod: '∏', int: '∫', iint: '∬', oint: '∮', partial: '∂', nabla: '∇', infty: '∞',
  emptyset: '∅', ldots: '…', '@cdots': '⋯', vdots: '⋮', ddots: '⋱', angle: '∠',
  mid: '∣', parallel: '∥', perp: '⊥', circ: '∘', ast: '∗', setminus: '∖',
  coprod: '∐', bigcup: '⋃', bigcap: '⋂', bigvee: '⋁', bigwedge: '⋀',
  bigodot: '⨀', bigoplus: '⨁', bigotimes: '⨂', biguplus: '⨄', bigsqcup: '⨆',
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
  'log', 'ln', 'exp', 'min', 'max', 'argmin', 'argmax', 'det', 'lim', 'sup', 'inf', 'gcd', 'Pr',
  'arg', 'arctg', 'arcctg', 'ch', 'cosec', 'cotg', 'coth', 'ctg', 'cth', 'deg', 'dim', 'hom', 'ker', 'lg', 'sh', 'tg', 'th'])
const big = new Set(['sum', 'prod', 'coprod', 'bigcup', 'bigcap', 'bigvee', 'bigwedge', 'intop', 'smallint',
  'bigodot', 'bigoplus', 'bigotimes', 'biguplus', 'bigsqcup',
  'lim', 'min', 'max', 'argmin', 'argmax', 'sup', 'inf', 'det', 'gcd', 'Pr'])
const integrals = new Set(['int', 'iint', 'iiint', 'oint', 'oiint', 'oiiint'])
const integralGlyphs = new Set([...integrals].map(name => operators[name]))
const largeOperatorGlyphs = new Set([...big].filter(name => !integralGlyphs.has(operators[name]) && Object.hasOwn(operators, name)).map(name => operators[name]))
const mathClasses: Record<string, MathClass> = {
  mathord: 'ord', mathopen: 'open', mathclose: 'close', mathpunct: 'punct',
  mathbin: 'bin', mathrel: 'rel', mathinner: 'inner', mathop: 'op',
}
const symbolClasses: Partial<Record<MathSymbolKind, MathClass>> = {
  binary: 'bin', relation: 'rel', punctuation: 'punct', inner: 'inner',
}
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
const primes = new Map([["'", 1], ['′', 1], ['″', 2], ['‴', 3], ['⁗', 4]])
const negatedOperators: Record<string, string> = {
  '=': '≠', '&lt;': '≮', '&gt;': '≯', '≤': '≰', '≥': '≱', '≈': '≉', '≡': '≢', '∼': '≁', '≃': '≄', '≅': '≇',
  '∈': '∉', '∋': '∌', '⊂': '⊄', '⊃': '⊅', '⊆': '⊈', '⊇': '⊉', '∣': '∤', '∥': '∦',
  '⊢': '⊬', '⊨': '⊭', '←': '↚', '→': '↛', '↔': '↮', '⇐': '⇍', '⇒': '⇏', '⇔': '⇎',
}
const centersDots = /^[+\-−*=<>:±∓·×÷≤≥≠≈∼≃≡∝∈∉∋∌∣∤∥∦⊥⊂⊄⊆⊈⊃⊅⊇⊉∘∗∖∩∪∧∨⊕⊗⊙∑∏∐⋃⋂⋁⋀←→↔⇒⇐⇔↦⟵⟶⟷⟹⟸⟺⟼]$/u
const dotsBeforeIntegral = new Set(['\\DOTSI', '\\int', '\\oint', '\\iint', '\\iiint'])
const dotsBeforeOperator = new Set([
  '\\DOTSB', '\\mathbin', '\\mathrel', '\\relbar', '\\Relbar', '\\xrightarrow', '\\xleftarrow',
  '\\argmin', '\\argmax', '\\plim', '\\bigoplus', '\\bigotimes', '\\bigodot', '\\biguplus', '\\bigsqcup',
])
const explicitColonDots = new Set(['vcentcolon', 'simcolon', 'simcoloncolon', 'approxcolon', 'approxcoloncolon'])
const negationMacros = new Set(['\\not', '\\notin', '\\notni'])
const spaceAfterDots = /^(?:[)\],.;$]|\\(?:[}]|right|rbrack|rbrace|rangle|rceil|rfloor|rgroup|rmoustache|bigr|biggr|Bigr|Biggr))$/
const variants: Record<string, string> = {
  mathbf: 'bold', mathbb: 'double-struck', mathrm: 'normal', mathit: 'italic',
  mathsf: 'sans-serif', mathsfit: 'sans-serif-italic', mathtt: 'monospace', mathcal: 'script', mathscr: 'script',
  mathfrak: 'fraktur', mathnormal: 'italic', boldsymbol: 'bold-italic', bm: 'bold-italic',
  Bbb: 'double-struck', frak: 'fraktur', bold: 'bold',
}
const legacyFonts: Readonly<Record<string, string>> = {
  '\\rm': 'normal', '\\sf': 'sans-serif', '\\tt': 'monospace', '\\bf': 'bold', '\\it': 'italic', '\\cal': 'script',
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
  Overrightarrow: '⇒', overgroup: '⏠', undergroup: '⏡',
}
const ruledAccents = new Set(['overbracket', 'underbracket', 'overlinesegment', 'underlinesegment'])
const extensibleArrows: Record<string, string> = {
  xrightarrow: '→', xleftarrow: '←', xleftrightarrow: '↔', xRightarrow: '⇒', xLeftarrow: '⇐', xLeftrightarrow: '⇔',
  xmapsto: '↦', xhookrightarrow: '↪', xhookleftarrow: '↩', xtwoheadleftarrow: '↞', xtwoheadrightarrow: '↠',
  xleftharpoonup: '↼', xleftharpoondown: '↽', xrightharpoonup: '⇀', xrightharpoondown: '⇁',
  xleftrightharpoons: '⇋', xrightleftharpoons: '⇌', xtofrom: '⇄', xrightleftarrows: '⇄', xlongequal: '=',
  xleftequilibrium: '⇌', xrightequilibrium: '⇌',
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
const spacing: Record<string, string> = {
  ',': '0.17em', ':': '0.22em', '>': '0.22em', ';': '0.28em', '!': '-0.17em', ' ': '0.33em',
  thinspace: '0.17em', medspace: '0.22em', thickspace: '0.28em',
  negthinspace: '-0.17em', negmedspace: '-0.22em', negthickspace: '-0.28em',
  space: '0.33em', nobreakspace: '0.33em', enspace: '0.5em', enskip: '0.5em', quad: '1em', qquad: '2em',
}
const spacingCommands = new Set(['kern', 'mkern', 'mskip', 'hskip'])
// A partial dimension can end before its magnitude or unit is complete.
const dimensionPrefix = /^[+-]?\s*(?:(?:\d+(?:\.\d*)?|\.\d*)(?:\s*[a-z]{1,2})?\s*)?$/

export interface MathMacroToken {
  text: string
  noexpand?: boolean
  treatAsRelax?: boolean
}

export interface MathMacroExpansion {
  /** TeX tokens in stack order, with the first token to read at the end. */
  tokens: readonly MathMacroToken[]
  numArgs: number
  /** Literal prefix followed by the delimiter tokens for each argument. */
  delimiters?: readonly (readonly string[])[]
  unexpandable?: boolean
}

export interface MathMacroArgument {
  /** Argument tokens in stack order. */
  tokens: MathMacroToken[]
  start: MathMacroToken
  end: MathMacroToken
}

export interface MathMacroNamespace {
  has(name: string): boolean
  get(name: string): MathMacroDefinition | undefined
  set(name: string, value: MathMacroDefinition | undefined, global?: boolean): void
  beginGroup(): void
  endGroup(): void
  endGroups(): void
}

export interface MathMacroContext {
  readonly mode: 'math' | 'text'
  readonly macros: MathMacroNamespace
  future(): MathMacroToken
  popToken(): MathMacroToken
  pushToken(token: MathMacroToken): void
  pushTokens(tokens: readonly MathMacroToken[]): void
  consumeSpaces(): void
  consumeArg(delimiters?: readonly string[] | null): MathMacroArgument
  consumeArgs(numArgs: number, delimiters?: readonly (readonly string[])[]): MathMacroToken[][]
  expandOnce(expandableOnly?: boolean): number | false
  expandAfterFuture(): MathMacroToken
  expandNextToken(): MathMacroToken
  /** Read stack-order tokens and return the expanded tokens in source order. */
  expandTokens(tokens: readonly MathMacroToken[]): MathMacroToken[]
  expandMacro(name: string): MathMacroToken[] | undefined
  expandMacroAsText(name: string): string | undefined
  isDefined(name: string): boolean
  isExpandable(name: string): boolean
}

export type MathMacroFunction = (context: MathMacroContext) => string | MathMacroExpansion
export type MathMacroDefinition = string | MathMacroExpansion | MathMacroFunction
export type MathMacros = Readonly<Record<string, MathMacroDefinition>>
const controlSequence = /^\\(?:[A-Za-z@]+|[^\s])$/u
const controlWord = /^\\[A-Za-z@]+$/
const activeCharacter = /^[^\s\\{}$&#^_]$/u

function isConfiguredMacroName(name: string): boolean {
  return controlSequence.test(name) || (name !== '%' && activeCharacter.test(name))
}

function isMacroTokenText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 8192 && !value.includes('\u0000')
}

function isConfiguredMacro(value: unknown): value is string | MathMacroExpansion {
  if (typeof value === 'string') return value.length <= 8192
  if (!value || typeof value !== 'object') return false
  const { tokens, numArgs, delimiters, unexpandable } = value as Partial<MathMacroExpansion>
  if (typeof numArgs !== 'number' || !Number.isSafeInteger(numArgs) || numArgs < 0 || numArgs > 6000
    || !Array.isArray(tokens) || tokens.length > 8192 || (unexpandable !== undefined && typeof unexpandable !== 'boolean')) return false
  let length = 0
  for (const token of tokens) {
    if (!token || typeof token !== 'object' || !isMacroTokenText(token.text)
      || (token.noexpand !== undefined && typeof token.noexpand !== 'boolean')
      || (token.treatAsRelax !== undefined && typeof token.treatAsRelax !== 'boolean')) return false
    length += token.text.length
    if (length > 8192) return false
  }
  if (delimiters === undefined) return true
  if (!Array.isArray(delimiters) || delimiters.length !== numArgs + 1) return false
  for (const delimiter of delimiters) {
    if (!Array.isArray(delimiter) || delimiter.length > 80) return false
    for (const token of delimiter) {
      if (!isMacroTokenText(token)) return false
    }
  }
  return true
}

export function resolveMathMacros(headmatter?: Record<string, unknown>): MathMacros {
  const options = headmatter?.math ?? headmatter?.katex
  const macros = options && typeof options === 'object' && 'macros' in options ? options.macros : undefined
  return macros && typeof macros === 'object' && !Array.isArray(macros)
    ? Object.fromEntries(Object.entries(macros).filter((entry): entry is [string, string | MathMacroExpansion] =>
      isConfiguredMacroName(entry[0]) && isConfiguredMacro(entry[1])))
    : {}
}

const verbPattern = /\\verb(?:\*([^\r\n])([^\r\n]*?)\1|([^*A-Za-z\r\n])([^\r\n]*?)\3)/
const leadingVerb = new RegExp(`^${verbPattern.source}`, 'u')
const ordinaryMathTokens = /\\[A-Za-z@]+|\\[^A-Za-z@\r\n]|#[1-9]|[ \t\r\n]+|[\s\S][\u0300-\u036F]*/
const texWhitespace = /^[ \t\r\n]+$/
const mathComment = /%[^\r\n]*(?:\r?\n[ \t]*|$)/
const mathTokens = new RegExp(`${verbPattern.source}|${mathComment.source}|${ordinaryMathTokens.source}`, 'gu')
const rawMathTokens = new RegExp(ordinaryMathTokens, 'gu')

export function mathVerbLength(source: string): number {
  return source.startsWith('\\verb') ? leadingVerb.exec(source)?.[0].length ?? 0 : 0
}

function verbatimMarkup(token: string): string | undefined {
  if (!token.startsWith('\\verb')) return
  const match = leadingVerb.exec(token)
  if (!match) return
  const [, star, withSpaces, , literal] = match
  const content = star === undefined ? literal : withSpaces.replaceAll(' ', '␣')
  return `<mtext class="math-verbatim" style="font-family:monospace;white-space:pre">${escapeHtml(content)}</mtext>`
}

function tokenize(source: string, onTrailingComment?: () => void): string[] {
  if (!source.includes('%')) return source.match(mathTokens) ?? []
  const lexer = new RegExp(mathTokens)
  const tokens: string[] = []
  for (let match = lexer.exec(source); match; match = lexer.exec(source)) {
    const token = match[0]
    if (token.startsWith('%')) {
      if (!token.includes('\n')) onTrailingComment?.()
      continue
    }
    tokens.push(token)
    if (!isMathUrlCommand(token)) continue
    const start = lexer.lastIndex
    const argument = token === '\\includegraphics' ? /[ \t\r\n]*(?:\[[^\]\r\n]*\][ \t\r\n]*)?([{%])/y : /[ \t\r\n]*([{%])/y
    argument.lastIndex = start
    const opening = argument.exec(source)?.[1]
    if (!opening) continue
    // Percent signs inside literal URLs belong to the address rather than TeX comments.
    let group = opening === '{' ? 1 : 0
    let end = argument.lastIndex
    while (end < source.length && group) {
      const character = source[end++]
      if (character === '\\') end++
      else if (character === '{') group++
      else if (character === '}') group--
    }
    for (const entry of source.slice(start, end).match(rawMathTokens) ?? []) tokens.push(entry)
    lexer.lastIndex = end
  }
  return tokens
}

type MathMode = 'math' | 'text'
const expansionPrimitives = ['\\expandafter', '\\noexpand', '\\@firstoftwo', '\\@secondoftwo', '\\@ifnextchar', '\\@ifstar', '\\TextOrMath', '\\html@mathml', '\\message', '\\errmessage', '\\char'] as const
const expansionPrimitiveNames = new Set<string>(expansionPrimitives)
const macroDeclaration = /^\\(?:[gex]?def|(?:future)?let|(?:new|renew|provide)command|global|long)$/
const assignmentCommand = /^\\(?:[gex]?def|(?:future)?let)$/
type ExpansionPrimitive = typeof expansionPrimitives[number]
type ConditionalPrimitive = Exclude<ExpansionPrimitive, '\\expandafter' | '\\noexpand' | '\\message' | '\\errmessage' | '\\char'>
interface TokenMacro { body: string[], parameters: string[][], prefix: string[], optional?: string[], unexpandable?: boolean, source?: string }
type DelimitedNotation = 'Braket' | 'Set' | 'set'
type DotsMacro = 'dots' | 'dotsc' | 'dotso' | 'cdots'
type NativeMacro = { primitive: ExpansionPrimitive } | { notation: DelimitedNotation } | { separator: () => string[] } | { dots: DotsMacro }
type Macro = TokenMacro | NativeMacro | MathMacroFunction
interface MathState {
  configured: ReadonlyMap<string, Macro>
  globals: Map<string, Macro | undefined>
  options: KatexOptions
  inlineBreaks: boolean
}
type EquationNumberMarkup = (number: number) => string

// KaTeX's legacy Khan Academy color macros. See licenses/KaTeX-MIT.txt.
const legacyColors: Record<string, string> = {
  blue: '#6495ed', orange: '#ffa500', pink: '#ff00af', red: '#df0030', green: '#28ae7b',
  gray: 'gray', purple: '#9d38bd', kaBlue: '#314453', kaGreen: '#71b307',
}
const legacyColorShades: Record<string, string[]> = {
  blue: ['ccfaff', '80f6ff', '63d9ea', '11accd', '0c7f99'],
  teal: ['94fff5', '26edd5', '01d1c1', '01a995', '208170'],
  green: ['b6ffb0', '8af281', '74cf70', '1fab54', '0d923f'],
  gold: ['ffd0a9', 'ffbb71', 'ff9c39', 'e07d10', 'a75a05'],
  red: ['fca9a9', 'ff8482', 'f9685d', 'e84d39', 'bc2612'],
  maroon: ['ffbde0', 'ff92c6', 'ed5fa6', 'ca337c', '9e034e'],
  purple: ['ddd7ff', 'c6b9fc', 'aa87ff', '7854ab', '543b78'],
  mint: ['f5f9e8', 'edf2df', 'e0e5cc'],
  gray: ['f6f7f7', 'f0f1f2', 'e3e5e6', 'd6d8da', 'babec2', '888d93', '626569', '3b3e40', '21242c'],
}
for (const [name, shades] of Object.entries(legacyColorShades)) {
  shades.forEach((hex, index) => { legacyColors[`${name}${'ABCDEFGHI'[index]}`] = `#${hex}` })
}
const builtinMacros = new Map<string, Macro>(Object.entries(legacyColors).map(([name, value]) =>
  [`\\${name}`, { body: ['\\textcolor', '{', value, '}', '{', '#1', '}'], parameters: [[]], prefix: [] }]))
builtinMacros.set('\\boxed', { body: tokenize('\\fbox{$\\displaystyle{#1}$}'), parameters: [[]], prefix: [] })
builtinMacros.set('\\substack', { body: tokenize('\\begin{subarray}{c}#1\\end{subarray}'), parameters: [[]], prefix: [] })
// LaTeX's spacing macro follows KaTeX's expansion, including the starred zero-width rule.
builtinMacros.set('\\hspace', { body: tokenize('\\@ifstar\\@hspacer\\@hspace'), parameters: [], prefix: [] })
builtinMacros.set('\\@hspace', { body: tokenize('\\hskip #1\\relax'), parameters: [[]], prefix: [] })
builtinMacros.set('\\@hspacer', { body: tokenize('\\rule{0pt}{0pt}\\hskip #1\\relax'), parameters: [[]], prefix: [] })
builtinMacros.set('\\angln', { body: tokenize('{\\angl n}'), parameters: [], prefix: [] })
for (const [name, brace] of [['\\bgroup', '{'], ['\\egroup', '}']])
  builtinMacros.set(name, { body: [brace], parameters: [], prefix: [] })

// Bra-ket expansions follow braket.sty as documented by KaTeX (MIT).
for (const [name, expansion] of Object.entries({
  bra: '\\mathinner{\\langle{#1}|}',
  ket: '\\mathinner{|{#1}\\rangle}',
  braket: '\\mathinner{\\langle{#1}\\rangle}',
  Bra: '\\left\\langle#1\\right|',
  Ket: '\\left|#1\\right\\rangle',
})) builtinMacros.set(`\\${name}`, { body: tokenize(expansion), parameters: [[]], prefix: [] })
for (const name of ['Braket', 'Set', 'set'] as const) builtinMacros.set(`\\${name}`, { notation: name })
for (const [name, arrow] of Object.entries({ implies: 'Longrightarrow', impliedby: 'Longleftarrow', iff: 'Longleftrightarrow' }))
  builtinMacros.set(`\\${name}`, { body: ['\\DOTSB', '\\;', `\\${arrow}`, '\\;'], parameters: [], prefix: [] })

// AMS ellipsis commands follow KaTeX's macro expansion rules (MIT).
for (const name of ['dots', 'dotsc', 'dotso', 'cdots'] as const) builtinMacros.set(`\\${name}`, { dots: name })
for (const [name, body] of Object.entries({
  dotsb: ['\\cdots'], dotsm: ['\\cdots'], dotsi: ['\\!', '\\cdots'], dotsx: ['\\ldots', '\\,'],
  DOTSB: ['\\relax'], DOTSI: ['\\relax'], DOTSX: ['\\relax'],
})) builtinMacros.set(`\\${name}`, { body, parameters: [], prefix: [] })

function isExpansionPrimitive(token: string | undefined): token is ExpansionPrimitive {
  return token !== undefined && expansionPrimitiveNames.has(token)
}

export function createMathRenderer(options: KatexOptions = {}, inlineBreaks = false): (source: string, display: boolean, numberMarkup?: EquationNumberMarkup, references?: EquationReferenceMarkup) => string {
  const state: MathState = { configured: compileMathMacros(options.macros), globals: new Map(), options, inlineBreaks }
  return (source, display, numberMarkup, references) => renderMath(source, display, undefined, state, numberMarkup, references)
}

function safeColor(value: string): string {
  value = value.trim()
  if (/^[\da-f]{6}$/i.test(value)) return `#${value}`
  return /^(?:#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|[a-z]+)$/i.test(value) ? value : ''
}

function mathErrorColor(value: unknown): string {
  return (typeof value === 'string' && safeColor(value)) || '#cc0000'
}

export function renderUnrenderedMath(source: string, display: boolean, error: MathParseError, color?: string | false): string {
  const block = display ? ' data-math-display' : ''
  const style = color === false ? '' : ` style="color:${mathErrorColor(color)}"`
  return `<code class="math-unrendered"${block} title="${escapeHtml(error.message)}"${style}>${escapeHtml(source)}</code>`
}

function applyVariant(content: string, variant: string): string {
  const style = styledMathAlphabets[variant]
  const uprightFont = variant === 'normal' || variant === 'bold' || variant === 'sans-serif' || variant === 'monospace'
  if (!style && !uprightFont && variant !== 'italic') return content
  // Explicit fonts, array cells, and math inside text own their glyphs.
  const groups: boolean[] = []
  let innerFont = 0
  return content.replace(/<m(?:row|table)(?: [^>]*?)?>|<\/m(?:row|table)>|<(mi|mn)( mathvariant="normal")?>([^<]+)<\/\1>/g,
    (markup, element: string | undefined, upright: string | undefined, letters: string | undefined) => {
      if (!element) {
        if (markup.startsWith('</')) innerFont -= Number(groups.pop() ?? false)
        else if (!markup.endsWith('/>')) {
          const explicit = markup.includes(' mathvariant="') || markup.includes(' data-math-array')
            || markup.includes(' class="math-cd"') || markup.includes(' class="math-font-reset"')
          groups.push(explicit)
          innerFont += Number(explicit)
        }
        return markup
      }
      if (innerFont) return markup
      if (uprightFont) return element === 'mi' && !upright ? `<mi mathvariant="normal">${letters}</mi>` : markup
      if (variant === 'italic') return upright ? `<${element}>${letters}</${element}>` : markup
      if (!style || !letters || !/^[A-Za-z\d]+$/.test(letters)) return markup
      const glyphs = [...letters].map((letter) => {
        const exception = style.exceptions.indexOf(letter)
        if (exception >= 0) return style.exceptions[exception + 1]
        const code = letter.charCodeAt(0)
        if (code >= 65 && code <= 90) return String.fromCodePoint(style.upper + code - 65)
        if (code >= 97 && code <= 122) return String.fromCodePoint(style.lower + code - 97)
        return style.digits ? String.fromCodePoint(style.digits + code - 48) : letter
      }).join('')
      return `<${element}>${glyphs}</${element}>`
    })
}

function fontMarkup(content: Markup, variant: string): Markup {
  const styled: Markup = typeof content === 'string' ? applyVariant(content, variant) : style => applyVariant(content(style), variant)
  return xml`<mrow class="math-${variant}" mathvariant="${variant}">${styled}</mrow>`
}

interface TextFont {
  'font-family'?: 'math' | 'serif' | 'sans-serif' | 'monospace'
  'font-weight'?: 'bold' | 'normal'
  'font-style'?: 'italic' | 'normal'
}
const normalFont: Readonly<TextFont> = { 'font-family': 'math', 'font-weight': 'normal', 'font-style': 'normal' }
const textFonts: Readonly<Record<string, Readonly<TextFont>>> = {
  text: {}, hbox: {}, mbox: {}, textnormal: { ...normalFont, 'font-family': 'serif' }, textrm: { 'font-family': 'serif' },
  textsf: { 'font-family': 'sans-serif' }, texttt: { 'font-family': 'monospace' },
  textbf: { 'font-weight': 'bold' }, textmd: { 'font-weight': 'normal' }, textup: { 'font-style': 'normal' },
  textit: { 'font-style': 'italic' }, emph: { 'font-style': 'italic' },
}
function textFontCSS(font: Readonly<TextFont>): string {
  return Object.entries(font).map(([property, value]) => `${property}:${value}`).join(';')
}
const textLigatures: Readonly<Record<string, string>> = {
  '---': '\u2014', '--': '\u2013', '\x60\x60': '\u201c', "''": '\u201d',
  '\x60': '\u2018', "'": '\u2019',
}
const typesettingNames = new Set(['TeX', 'LaTeX', 'KaTeX'])
const textBoxes = new Set(['colorbox', 'fcolorbox', 'fbox', 'reflectbox'])
const verticalBoxCommands = new Set(['phantom', 'hphantom', 'vphantom', 'smash', 'raisebox', 'rule'])
const textSymbols: Record<string, string> = {
  '\\textdollar': '$', '\\textunderscore': '_', '\\textbackslash': '\\',
  '\\textasciitilde': '~', '\\textasciicircum': '^', '\\textbar': '|',
  '\\textless': '<', '\\textgreater': '>', '\\ss': 'ß', '\\ae': 'æ', '\\AE': 'Æ',
  '\\aa': 'å', '\\AA': 'Å', '\\o': 'ø', '\\O': 'Ø', '\\oe': 'œ', '\\OE': 'Œ', '\\i': 'ı', '\\j': 'ȷ',
}
const textAccents: Record<string, [mark: string, glyph: string, below?: boolean]> = {
  "\\'": ['\u0301', '´'], '\\`': ['\u0300', '`'], '\\"': ['\u0308', '¨'],
  '\\^': ['\u0302', 'ˆ'], '\\~': ['\u0303', '˜'], '\\=': ['\u0304', '¯'], '\\.': ['\u0307', '˙'],
  '\\u': ['\u0306', '˘'], '\\v': ['\u030c', 'ˇ'], '\\H': ['\u030b', '˝'], '\\r': ['\u030a', '˚'],
  '\\c': ['\u0327', '¸', true], '\\k': ['\u0328', '˛', true], '\\b': ['\u0331', '_', true], '\\d': ['\u0323', '.', true],
}
const operatorSpaceGlyphs: Readonly<Record<string, string>> = {
  [spacing.thinspace]: '\u2009', [spacing.medspace]: '\u205f',
  [spacing.thickspace]: '\u2004', [spacing.space]: ' ',
  [`${3 / 18}em`]: '', [`${4 / 18}em`]: '', [`${5 / 18}em`]: '',
}

interface Atom {
  markup: Markup
  fragment?: MathFragment
  mathClass?: MathClass
  limits?: boolean
  forceLimits?: boolean
  ignoreLimitControl?: boolean
  brace?: 'lower' | 'upper'
}

interface RowPart {
  markup: Markup
  fragment?: MathFragment
  token?: string
  mathClass?: MathClass
  operator?: boolean
}

type MathFragment = (style: MathStyle) => RowPart[]

type Alignment = 'left' | 'center' | 'right'
type ArrayRule = 'solid' | 'dashed'
type CellSide = 'top' | 'right' | 'bottom' | 'left'
const alignments: Record<string, Alignment> = { l: 'left', c: 'center', r: 'right' }
interface ArrayColumn { align: Alignment, before: ArrayRule[] }
interface ArrayRow { cells: Markup[], label?: Markup, before: ArrayRule[], gap?: string, raise?: string }
interface MathLine { content: Markup, gap?: string }
interface MultlineRow extends MathLine { align?: 'left' | 'right' }
interface EquationTag { label?: Markup, key?: string, starred?: boolean, suppressed: boolean, raise?: string }

function equationNumberCell(label: Markup | undefined, position?: 'start' | 'end', raise?: string): string {
  const styles = [
    position && `display:math;padding:0;justify-self:${position}`,
    label !== undefined && raise && `--math-tag-raise:${raise}`,
  ].filter(Boolean).join(';')
  return `<mtd class="math-equation-number"${styles ? ` style="${styles}"` : ''}>${renderMarkup(label ?? '', 1)}</mtd>`
}

function taggedDisplay(expression: string, label: Markup, left: boolean, flush: boolean, raise?: string): string {
  const number = equationNumberCell(label, left ? 'start' : 'end', raise)
  const spacer = flush ? '' : '<mtd aria-hidden="true" style="display:block;padding:0"></mtd>'
  const body = `<mtd data-equation-body style="display:math;math-style:normal;padding:0;justify-self:start">${expression}</mtd>`
  // Equal gutters center the formula. The tag's intrinsic width can expand
  // its gutter when space is tight, avoiding an overlap with the formula.
  const columns = flush
    ? left ? 'max-content minmax(max-content,1fr)' : 'minmax(max-content,1fr) max-content'
    : 'minmax(max-content,1fr) max-content minmax(max-content,1fr)'
  return `<mtable class="math-tagged-display" data-equation-tags="${left ? 'left' : 'right'}"${flush ? ' data-equation-flush' : ''} style="display:block;width:100%"><mtr style="display:grid;grid-template-columns:${columns};align-items:center;column-gap:0.5em">${left ? number : spacer}${body}${left ? spacer : number}</mtr></mtable>`
}

function multlineTable(rows: readonly MultlineRow[], label: Markup | undefined, left: boolean, flush: boolean, environment: string, raise?: string): string {
  const tagRow = left ? 0 : rows.length - 1
  const markup = rows.map(({ content, gap, align }, index) => {
    const first = index === 0
    const last = index === rows.length - 1
    const placement = align ?? (last && !first ? 'right' : flush || (first && !last) ? 'left' : 'center')
    const number = label === undefined ? '' : equationNumberCell(index === tagRow ? label : undefined, undefined, raise)
    const rowSpacing = gap ? `;padding-bottom:max(0px,calc(0.125em + ${gap}))` : ''
    const body = `<mtd style="math-style:normal;padding-block:0.125em${rowSpacing}"><mrow>${renderMarkup(content, 0)}</mrow></mtd>`
    return `<mtr data-multline-align="${placement}">${left ? number : ''}${body}${left ? '' : number}</mtr>`
  }).join('')
  const tags = label === undefined ? '' : ` data-equation-tags="${left ? 'left' : 'right'}"`
  // Office Math uses one alignment for an array. Measure each row's position
  // separately, as with AMS displays that have explicit row gaps.
  return `<mtable class="math-multline" data-equation-lines data-math-array data-equation-environment="${environment}" data-equation-row-spacing${tags}${flush ? ' data-equation-flush' : ''}>${markup}</mtable>`
}

function inScript(markup: Markup): Markup {
  return typeof markup === 'string' ? markup : style => markup(scriptStyle(style))
}

function stackOperator(markup: Markup): Markup {
  const fixed = (value: string) => value.replace(/^((?:<mrow>)*<mo)(?=[ >])/, '$1 movablelimits="false"')
  return typeof markup === 'string' ? fixed(markup) : style => fixed(markup(style))
}

function arrayColumns(spec: string): { columns: ArrayColumn[], after: ArrayRule[] } {
  const columns: ArrayColumn[] = []
  let after: ArrayRule[] = []
  for (const char of spec.replace(/\s/g, '')) {
    if (char === '|' || char === ':') after.push(char === '|' ? 'solid' : 'dashed')
    else if (Object.hasOwn(alignments, char)) {
      columns.push({ align: alignments[char], before: after })
      after = []
    }
    else throw new MathParseError('Invalid array column')
  }
  return { columns, after }
}

function arrayRuleStyles(borders: [CellSide, ArrayRule[] | undefined][], minimum: number): string[] {
  const styles: string[] = []
  const strokes: string[] = []
  const width = minimum ? `max(1px,${minimum}em)` : '1px'
  for (const [side, rules] of borders) {
    if (!rules?.length) continue
    if (rules.length === 1) {
      styles.push(`border-${side}:${width} ${rules[0]} currentColor`)
      continue
    }
    const horizontal = side === 'top' || side === 'bottom'
    // Consecutive rules are spaced like TeX's horizontal and vertical rules.
    // Keep enough space for thick rules selected by minRuleThickness.
    const step = `max(${horizontal ? '0.25' : '0.2'}em,2 * ${width})`
    const extent = `calc(${rules.length - 1} * ${step} + ${width})`
    styles.push(`border-${side}:${extent} solid transparent`)
    const size = horizontal ? `100% ${width}` : `${width} 100%`
    for (const [index, rule] of rules.entries()) {
      const offsetIndex = side === 'right' || side === 'bottom' ? rules.length - 1 - index : index
      const offset = offsetIndex ? `calc(${offsetIndex} * ${step})` : '0px'
      const position = horizontal ? `left 0px ${side} ${offset}` : `${side} ${offset} top 0px`
      const ink = rule === 'solid'
        ? 'linear-gradient(currentColor,currentColor)'
        : `repeating-linear-gradient(to ${horizontal ? 'right' : 'bottom'},currentColor 0 3px,transparent 3px 5px)`
      strokes.push(`${ink} ${position} / ${size} no-repeat border-box`)
    }
  }
  if (strokes.length) styles.push(`background:${strokes.join(',')}`)
  return styles
}

function tag(name: string, value: string): string {
  return `<${name}>${escapeHtml(value)}</${name}>`
}

function operatorLabel(body: Markup): Markup {
  const render = (markup: string) => {
    // Keep short names as one upright operator. Preserve the MathML for
    // structured names with fractions, scripts, or explicit formatting.
    const text = markup
      .replace(/<\/?mrow>/g, '')
      .replace(/<(mi|mn|mo|mtext)(?: (?:mathvariant|stretchy|lspace|rspace)="[^"]*")*>([^<]*)<\/\1>/g,
        (_token, element: string, value: string) => element === 'mo' ? value.replaceAll('−', '-').replaceAll('∗', '*') : value)
      .replace(/<mspace width="([^"]+)"\/>/g, (space, width: string) => operatorSpaceGlyphs[width] ?? space)
      .replace(/<mspace width="0" style="margin-inline-end:-0\.17em"\/>/g, '')
    return text.includes('<') ? applyVariant(markup, 'normal') : `<mo>${text}</mo>`
  }
  return typeof body === 'string' ? render(body) : style => render(body(style))
}

function typesettingName(name: string): string {
  return `<mrow style="${textFontCSS(textFonts.textrm)}">${tag('mtext', name)}</mrow>`
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

function classifiedAtom(mathClass: MathClass, content: Markup): Atom {
  const limits = mathClass === 'op' ? false : undefined
  if (typeof content === 'string' && mathClass !== 'inner') {
    const token = /^(?:<mrow>)*<(mn|mi|mo|mtext)(?: lspace="0em" rspace="0em")?( stretchy="(?:true|false)")?>([^<]*)<\/\1>(?:<\/mrow>)*$/.exec(content)
    if (token) {
      const [, kind, stretchy = '', glyph] = token
      if (mathClass === 'ord') {
        const normal = kind === 'mo' ? ' mathvariant="normal"' : ''
        const element = kind === 'mo' ? 'mi' : kind
        return { mathClass, markup: `<${element}${normal}>${glyph}</${element}>` }
      }
      const font = kind === 'mi' ? ' style="font-style:italic"' : ''
      const role = mathClass === 'open' || mathClass === 'close'
        ? ` fence="true" form="${mathClass === 'open' ? 'prefix' : 'postfix'}"`
        : mathClass === 'punct' ? ' separator="true"' : ''
      return { mathClass, markup: `<mo lspace="0em" rspace="0em"${stretchy}${font}${role}>${glyph}</mo>`, limits }
    }
  }
  // MathML token elements contain text. Space composite atoms outside their
  // script base so fractions, styles, and accents remain valid MathML.
  return { mathClass, markup: xml`<mrow>${content}</mrow>`, limits }
}

function supplementalAtom([glyph, kind]: MathSymbol): Atom {
  const category = symbolClasses[kind]
  if (!category) return { markup: tag(kind === 'identifier' ? 'mi' : 'mtext', glyph) }
  return classifiedAtom(category, tag('mo', glyph))
}

function rowClass({ markup, token = '', mathClass, operator }: RowPart): MathClass | undefined {
  if (!markup) return
  if (mathClass) return mathClass
  if (operator) return 'op'
  const name = token.startsWith('\\') ? token.slice(1) : ''
  if (token === '~' || Object.hasOwn(spacing, name) || spacingCommands.has(name)) return
  if (token === '{') return 'ord'
  if (name === 'left') return 'inner'
  if (name === 'not' || name === 'stackrel' || Object.hasOwn(extensibleArrows, name)) return 'rel'
  const sized = /^(?:bigg|Bigg|big|Big)([lrm]?)$/.exec(name)
  if (sized) return sized[1] === 'l' ? 'open' : sized[1] === 'r' ? 'close' : sized[1] === 'm' ? 'rel' : 'ord'
  if (name === 'colon') return 'punct'
  if (name === 'lvert' || name === 'lVert') return 'open'
  if (name === 'rvert' || name === 'rVert') return 'close'
  const glyph = delimiters[token] ?? operators[name] ?? token
  if (/^[+\-−*±∓·×÷∘∗∖∩∪∧∨⊕⊗⊙]$/u.test(glyph)) return 'bin'
  if (/^[=<>:≤≥≠≈∼≃≡∝∈∉∋∌∣∤∥∦⊥⊂⊆⊃⊇≰≱⊈⊉≅≪≫←→↔↑↓↕⇒⇐⇔⇑⇓⇕↦⟵⟶⟷⟹⟸⟺⟼]$/u.test(glyph)) return 'rel'
  if (/^[(\[{⟨⌊⌈⟮⎰⌜⌞⟦⦃]$/u.test(glyph)) return 'open'
  if (/^[)\]}⟩⌋⌉⟯⎱⌝⌟⟧⦄!?]$/u.test(glyph)) return 'close'
  return glyph === ',' || glyph === ';' ? 'punct' : 'ord'
}

function neutralizeOperator(markup: string): string {
  // MathML propagates a glyph's native spacing through scripts and singleton
  // rows. Preserve spacing within a group that has several children.
  const operator = /^((?:<(?:msub|msup|msubsup|mover|munder|munderover)(?: [^>]*)?>)*)((?:<(?:mrow|mphantom)(?: [^>]*)?>)*)<mo([^>]*)>([^<]*<\/mo>)((?:<\/(?:mrow|mphantom)>)*)/
  return markup.replace(operator, (match, scripts: string, groups: string, attrs: string, glyph: string, ends: string) => {
    if ((groups.match(/</g)?.length ?? 0) !== (ends.match(/</g)?.length ?? 0)) return match
    const attributes = attrs.replace(/ (?:lspace|rspace)="[^"]*"/g, '')
    return `${scripts}${groups}<mo${attributes} lspace="0em" rspace="0em">${glyph}${ends}`
  })
}

function inlineBreaksBefore(parts: readonly RowPart[], classes: readonly (MathClass | undefined)[]): Set<number> {
  const offsets = new Set<number>()
  let seen = false
  let allow = false
  let suppress = false
  for (const [index, part] of parts.entries()) {
    const category = classes[index]
    if (category) {
      if (seen && allow && !suppress) offsets.add(index)
      seen = true
      allow = category === 'bin' || category === 'rel'
      suppress = false
    }
    else if (part.token === '\\allowbreak') allow = true
    else if (part.token === '\\nobreak' || part.token === '\\nobreakspace' || part.token === '~') suppress = true
  }
  return offsets
}

function expandRow(parts: RowPart[], style: MathStyle): RowPart[] {
  return parts.flatMap(part => part.fragment ? expandRow(part.fragment(style), style) : part)
}

function colorRowPart(part: RowPart, color: string): RowPart {
  const fragment = part.fragment
  if (!fragment && !rowClass(part)) return part
  return {
    ...part,
    markup: part.markup ? xml`<mrow style="color:${color}">${part.markup}</mrow>` : '',
    fragment: fragment && (style => fragment(style).map(child => colorRowPart(child, color))),
  }
}

interface NumberPart { text: string, numeral: boolean, joined?: boolean }

function readNumberPart(part: RowPart): NumberPart | undefined {
  if (typeof part.markup !== 'string' || part.mathClass || part.operator) return
  const numeral = /^(?:<mrow>)*<mn>([\p{Nd}.,]+)<\/mn>(?:<\/mrow>)*$/u.exec(part.markup)
  if (numeral) return { text: numeral[1], numeral: true }
  const punctuation = /^(?:<mrow>)+<mo>([.,])<\/mo>(?:<\/mrow>)+$/.exec(part.markup)
  if (punctuation) return { text: punctuation[1], numeral: false }
  if (part.markup === '<mo>.</mo>') return { text: '.', numeral: false }
}

// KaTeX consolidates numbers after parsing atoms and attaching scripts.
// An ordinary comma delimits expressions, while a braced comma joins digits.
function joinNumberParts(parts: RowPart[]): RowPart[] {
  if (parts.length < 2) return parts
  const result: RowPart[] = []
  let previous: NumberPart | undefined
  for (const part of parts) {
    if (!part.markup && part.token !== '\\allowbreak' && part.token !== '\\nobreak') continue
    const next = readNumberPart(part)
    if (previous && next && (previous.numeral || next.numeral)) {
      previous.text += next.text
      previous.numeral = true
      previous.joined = true
      continue
    }
    if (previous && !part.mathClass && typeof part.markup === 'string') {
      // A single script moves the preceding digits into its number base.
      // Simultaneous upper and lower scripts stay on the final atom.
      const base = /^(<ms(?:ub|up)>)((?:<mrow>)*)<mn>([\p{Nd}.,]+)<\/mn>((?:<\/mrow>)*)/u.exec(part.markup)
      if (base && base[2].length / '<mrow>'.length === base[4].length / '</mrow>'.length) {
        result[result.length - 1] = { ...part, markup: base[1] + tag('mn', previous.text + base[3]) + part.markup.slice(base[0].length) }
        previous = undefined
        continue
      }
    }
    if (previous?.joined) result[result.length - 1] = { markup: tag('mn', previous.text) }
    result.push(part)
    previous = next
  }
  if (previous?.joined) result[result.length - 1] = { markup: tag('mn', previous.text) }
  return result
}

function joinRow(atoms: RowPart[], wrap = false, followsOrdinary = false, explicitSpacing = false): Markup {
  if (atoms.some(part => part.fragment))
    return style => renderMarkup(joinRow(expandRow(atoms, style), wrap, followsOrdinary, true), style)
  const parts = joinNumberParts(atoms)
  const explicit = explicitSpacing || followsOrdinary || parts.some(part => part.mathClass)
  if (!explicit && !wrap) return joinMarkup(parts.map(part => part.markup))
  const categories = parts.map(rowClass)
  // AMS alignment prepends an empty ordinary group in every right-hand cell.
  const classes = resolveRowClasses(followsOrdinary ? ['ord', ...categories] : categories)
  const breaks = wrap ? inlineBreaksBefore(parts, followsOrdinary ? classes.slice(1) : classes) : undefined
  if (!explicit && !breaks?.size) return joinMarkup(parts.map(part => part.markup))
  const normal = rowSpacing(classes, false)
  const tight = rowSpacing(classes, true)
  return style => parts.map((part, index) => {
    const atomIndex = followsOrdinary ? index + 1 : index
    const gap = (style < 2 ? normal : tight)[atomIndex]
    const value = renderMarkup(part.markup, style)
    // The renderer inserts a single gap between neighbors, including composites.
    const boundary = breaks?.has(index) ? '<mspace width="0" data-math-break=""/>' : ''
    const category = classes[atomIndex]
    return (gap ? muSpace(gap) : '') + boundary + (category && category !== 'middle' ? neutralizeOperator(value) : value)
  }).join('')
}

function horizontalPhantom(body: Markup, parts: RowPart[], mode: 'math' | 'text'): Markup {
  const padded = (content: Markup, margin = '') =>
    xml`<mpadded height="0" depth="0"${margin ? ` style="margin-inline-end:${margin}"` : ''}><mphantom>${content}</mphantom></mpadded>`

  function measure(children: RowPart[]): Markup {
    const kerns: string[] = []
    const remainder: RowPart[] = []
    for (const part of children) {
      const markup = part.markup
      const kern = typeof markup === 'string' && /^(?:<mrow>)*<mspace width="0" style="margin-inline-end:(-[^"]+)"\/>(?:<\/mrow>)*$/.exec(markup)
      if (kern) {
        kerns.push(kern[1])
        continue
      }
      const nested = typeof markup === 'string' && /^((?:<mrow>)*<mpadded height="0" depth="0") style="margin-inline-end:([^"]+)">/.exec(markup)
      if (nested) {
        kerns.push(nested[2])
        remainder.push({ ...part, markup: `${nested[1]}>${markup.slice(nested[0].length)}` })
      }
      else remainder.push(part)
    }
    if (!kerns.length) return padded(body)
    // MathML clamps a box's measured width at zero. Apply signed kerns to
    // the outer margin so they still affect the next atom's position.
    const margin = kerns.length === 1 ? kerns[0] : `calc(${kerns.map(kern => `(${kern})`).join(' + ')})`
    const content = mode === 'math' ? joinRow(remainder) : joinMarkup(remainder.map(part => part.markup))
    return padded(content, margin)
  }

  return parts.some(part => part.fragment)
    ? style => renderMarkup(measure(expandRow(parts, style)), style)
    : measure(parts)
}

function lineTable(lines: MathLine[], exposeRows: boolean, alignStart: boolean): Markup {
  // MathML Core browsers need separate rows to show a line break.
  return (style) => {
    const rows = lines.map(({ content, gap }) => {
      const cellStyle = [
        alignStart ? 'text-align:start' : '',
        style === 0 ? 'math-style:normal' : '',
        gap ? `padding-bottom:max(0px,calc(0.14em + ${gap}))` : 'padding-bottom:0.14em',
      ].filter(Boolean).join(';')
      return `<mtr><mtd style="${cellStyle}">${renderMarkup(content, style) || '<mrow/>'}</mtd></mtr>`
    }).join('')
    return `<mtable${exposeRows ? ' data-equation-lines' : ''}>${rows}</mtable>`
  }
}

const cancelTrack = '<mspace class="math-cancel-track" aria-hidden="true"/>'

function negatedMarkup(markup: string): string {
  const symbol = /^((?:<mrow>)*)<(mo|mi|mn)([^>]*)>([^<]+)<\/\2>((?:<\/mrow>)*)$/.exec(markup)
  if (!symbol || !/^(?:[^&]|&(?:lt|gt|amp|quot|#39);)$/u.test(symbol[4]))
    return `<mrow class="math-cancel">${markup}${cancelTrack}</mrow>`
  const [, prefix, element, attrs, value, suffix] = symbol
  const negated = negatedOperators[value] ?? `${value}\u0338`
  return `${prefix}<${element}${attrs}>${negated}</${element}>${suffix}`
}

function fence(token: string, stretchy = true, color = ''): string {
  if (!token || token === '.') return ''
  const style = color ? ` style="color:${color}"` : ''
  return `<mo stretchy="${stretchy}"${style}>${escapeHtml(delimiters[token] ?? token)}</mo>`
}

function delimiter(token: string, command: string): string {
  const glyph = delimiterAliases[token] ?? delimiters[token] ?? token
  if (!delimiterGlyphs.has(glyph)) throw new MathParseError(`Invalid delimiter after \\${command}`)
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
const sizeCommands: Readonly<Record<string, number>> = {
  '\\tiny': 0.5, '\\sixptsize': 0.6, '\\scriptsize': 0.7, '\\footnotesize': 0.8, '\\small': 0.9,
  '\\normalsize': 1, '\\large': 1.2, '\\Large': 1.44, '\\LARGE': 1.728, '\\huge': 2.074, '\\Huge': 2.488,
}
const infixFractions = new Set(['\\over', '\\atop', '\\choose', '\\brace', '\\brack', '\\above'])
const primitiveArgumentFunctions = new Set(['frac', 'dfrac', 'tfrac', 'binom', 'dbinom', 'tbinom', 'genfrac', 'cfrac', ...Object.keys(variants)])
const groupedArgumentFunctions = new Set(['sqrt', 'left', 'mathllap', 'mathclap', 'mathrlap', 'angl'])
const intertextCommands: ReadonlyMap<string, string> = new Map([
  ['\\intertext', 'normal'],
  ['\\shortintertext', 'short'],
])
const mathModeFunctions = new Set([
  ...groupedArgumentFunctions, ...primitiveArgumentFunctions, ...Object.keys(mathClasses), ...Object.keys(accents),
  ...Object.keys(stretchedAccents), ...Object.keys(extensibleArrows),
  ...ruledAccents, ...Array.from(infixFractions, command => command.slice(1)),
  'begin', 'end', 'right', 'middle', '@binrel', 'mathchoice', 'vcenter',
  'cancel', 'bcancel', 'xcancel', 'pmb', 'phase', 'mathreflectbox',
  'prescript', 'mathstrut', 'sideset', 'overset', 'underset', 'overunderset', 'stackrel',
  'shoveleft', 'shoveright', ...Array.from(intertextCommands.keys(), command => command.slice(1)),
  'overline', 'operatorname', 'operatorname@', 'operatornamewithlimits', 'limits', 'nolimits', 'displaylimits',
  'not', 'mod', 'bmod', 'pmod', 'pod', 'ce', 'pu', 'allowbreak',
])
const sharedFunctions = new Set([
  ...Object.keys(textFonts), ...typesettingNames, ...textBoxes, ...verticalBoxCommands, ...spacingCommands,
  'begingroup', 'endgroup', 'relax', 'newline', 'cr', 'color', 'textcolor',
  'sout', 'underline', 'underbar', 'textcircled', 'llap', 'clap', 'rlap', '@char',
  'tag', 'raisetag', 'label', 'ref', 'eqref', 'notag', 'nonumber', 'nobreak', 'hline', 'hdashline',
])
const fractionFences: Record<string, [string, string]> = {
  '\\choose': ['(', ')'],
  '\\brace': ['{', '}'],
  '\\brack': ['[', ']'],
}
const boundary = '\u0000math-expansion-boundary'
const literalToken = '\u0000math-literal:'
const inhibitedToken = '\u0000math-inhibited:'

function plainMacro(body: string[], arity?: number, optional?: string[]): TokenMacro {
  const count = arity ?? Math.max(0, ...body.map(token => /^#[1-9]$/.test(token) ? Number(token[1]) : 0))
  return { body, parameters: Array.from({ length: count }, () => []), prefix: [], optional }
}

function bodyFromStack(tokens: readonly MathMacroToken[]): string[] {
  const body: string[] = []
  for (let cursor = tokens.length - 1; cursor >= 0; cursor--) {
    const { text, noexpand, treatAsRelax } = tokens[cursor]
    const next = tokens[cursor - 1]
    if (treatAsRelax) body.push(inhibitedToken + text)
    else if (noexpand) body.push(literalToken + text)
    // KaTeX holds the parameter marker and digit as separate stack tokens.
    else if (text === '#' && next && /^[1-9]$/.test(next.text) && !next.noexpand && !next.treatAsRelax) {
      body.push(`#${next.text}`)
      cursor--
    }
    else body.push(text)
  }
  return body
}

function compileTokenMacro(replacement: string | MathMacroExpansion): TokenMacro {
  if (typeof replacement === 'string') return { ...plainMacro(tokenize(replacement)), source: replacement }
  const { tokens, numArgs, delimiters, unexpandable } = replacement
  return {
    body: bodyFromStack(tokens), unexpandable,
    prefix: delimiters ? [...delimiters[0]] : [],
    parameters: delimiters ? delimiters.slice(1).map(delimiter => [...delimiter]) : Array.from({ length: numArgs }, () => []),
  }
}

// Native implementations and optional arguments can be saved and restored
// through the callback namespace without losing their implementation.
const macroSnapshots = new WeakMap<MathMacroExpansion | MathMacroFunction, TokenMacro | NativeMacro>()

function compileMacro(replacement: unknown): Macro | undefined {
  if (typeof replacement === 'function') {
    const callback = replacement as MathMacroFunction
    return macroSnapshots.get(callback) ?? callback
  }
  if (isConfiguredMacro(replacement))
    return (typeof replacement === 'object' ? macroSnapshots.get(replacement) : undefined) ?? compileTokenMacro(replacement)
}

function compileMathMacros(configured: MathMacros = {}): Map<string, Macro> {
  const macros = new Map<string, Macro>()
  for (const [name, replacement] of Object.entries(configured)) {
    if (!isConfiguredMacroName(name)) continue
    const macro = compileMacro(replacement)
    if (macro) macros.set(name, macro)
  }
  return macros
}

function mathSize(style: MathStyle, markup: string): string {
  return `<mstyle displaystyle="${style === 0}" scriptlevel="${Math.max(0, style - 1)}">${markup}</mstyle>`
}

function scaledMath(content: Markup, ratio: number): Markup {
  if (ratio === 1 || !content) return content
  return xml`<mstyle mathsize="${String(Number(ratio.toFixed(5)))}em">${content}</mstyle>`
}

interface FractionLayout {
  forced?: MathStyle
  thickness?: string
  align?: 'left' | 'right'
  fences?: readonly [string, string]
  continued?: boolean
}

function fractionMarkup(first: Markup, second: Markup, layout: FractionLayout): Markup {
  const { forced, thickness, align, fences, continued } = layout
  const bar = thickness !== undefined ? ` linethickness="${thickness}"` : ''
  const numerator = align ? ` numalign="${align}"` : ''
  const start = `<mfrac${bar}${numerator}>`
  const [left, right] = fences ?? []
  const opening = left || right ? `<mrow>${left}${start}` : start
  const closing = left || right ? `</mfrac>${right}</mrow>` : '</mfrac>'
  // Continued fractions have TeX's numerator strut without adding ink or width.
  const top = continued ? xml`<mrow><mspace width="0" height="0.85em" depth="0.35em"/>${first}</mrow>` : first
  if (forced === undefined && typeof top === 'string' && typeof second === 'string') return opening + top + second + closing
  return (parent) => {
    const target = forced ?? parent
    const child = fractionStyle(target)
    const content = opening + renderMarkup(top, child) + renderMarkup(second, child) + closing
    return target === parent ? content : mathSize(target, content)
  }
}

/** Translate a bounded TeX math subset to native MathML, with the source retained for accessibility. */
export function renderMath(source: string, display = false, configured: MathMacros = {}, state?: MathState, numberMarkup?: EquationNumberMarkup, references?: EquationReferenceMarkup): string {
  const options = state?.options
  function parseFailure(error: MathParseError): string {
    if (options?.throwOnError) throw error
    return renderUnrenderedMath(source, display, error, options?.errorColor)
  }
  let trailingComment = false
  const recordComment = () => { trailingComment = true }
  let tokens = tokenize(source, recordComment)
  if (tokens.length > 6000) return parseFailure(new MathParseError('Equation has too many input tokens'))
  const limit = options?.maxExpand
  const maxExpand = typeof limit === 'number' && !Number.isNaN(limit) ? Math.max(0, limit) : 1000
  const configuredSize = options?.maxSize ?? Infinity
  const configuredRule = options?.minRuleThickness ?? 0
  const maxSize = Number.isFinite(configuredSize) ? Math.max(0, configuredSize) : Infinity
  const minRule = Number.isFinite(configuredRule) ? Math.max(0, configuredRule) : 0
  const dimension = (value: string) => mathDimension(value, maxSize)
  let cursor = 0
  let remainingOuterTokens = 0
  let depth = 0
  let expandedCount = 0
  let mode: MathMode = 'math'
  let tagState: EquationTag = { suppressed: false }
  let environmentDepth = 0
  let delimiterDepth = 0
  let currentColor = ''
  let equationNumber = 0
  let fullWidthAlignment = false
  let fontScale = 1
  let textItalic = false
  let textMonospace = false
  let textFont: Readonly<TextFont> | undefined
  let mathFontActive = false
  let linkDepth = 0
  let context: MathMacroContext | undefined
  let localReferences: ReturnType<typeof createEquationReferences> | undefined
  function referenceMarkup(): EquationReferenceMarkup {
    return references ?? (localReferences ??= createEquationReferences(Bun.randomUUIDv7().replaceAll('-', ''))).markup
  }

  const macros = new Map<string, Macro>(state?.configured ?? compileMathMacros(configured))
  const macroFor = (token: string) => macros.get(token) ?? builtinMacros.get(token)
  const scopes: { undo: Map<string, Macro | undefined>, callback?: boolean }[] = []
  function assign(name: string, definition: Macro | undefined, global = false): void {
    const scope = scopes.at(-1)?.undo
    if (global) {
      for (const scope of scopes) scope.undo.delete(name)
    }
    else if (scope && !scope.has(name)) scope.set(name, macros.get(name))
    if (global || (!scope && options?.globalGroup)) state?.globals.set(name, definition)
    if (definition) macros.set(name, definition)
    else macros.delete(name)
  }
  for (const [name, definition] of state?.globals ?? []) {
    if (definition) macros.set(name, definition)
    else macros.delete(name)
  }

  const space = () => { while (texWhitespace.test(tokenText(tokens[cursor] ?? ''))) cursor++ }
  const extendedPrimes = !options?.strict || options.strict === 'ignore'
  const primeCount = (token: string) => token === "'" || extendedPrimes ? primes.get(token) ?? 0 : 0

  function restoreScope(): void {
    const scope = scopes.pop()
    if (!scope) throw new MathParseError('Unbalanced math macro group')
    for (const [command, previous] of scope.undo) {
      if (previous) macros.set(command, previous)
      else macros.delete(command)
    }
  }

  function inScope<T>(render: () => T): T {
    const before = scopes.length
    const previousColor = currentColor
    const previousItalic = textItalic
    const previousMonospace = textMonospace
    scopes.push({ undo: new Map() })
    try { return render() }
    finally {
      currentColor = previousColor
      textItalic = previousItalic
      textMonospace = previousMonospace
      while (scopes.length > before) restoreScope()
    }
  }

  function inMode<T>(selected: MathMode, render: () => T): T {
    const previous = mode
    mode = selected
    try { return render() }
    finally { mode = previous }
  }

  function withMathFont<T>(active: boolean, render: () => T): T {
    const previous = mathFontActive
    mathFontActive = active
    try { return render() }
    finally { mathFontActive = previous }
  }

  function expandable(token: string): boolean {
    const macro = macroFor(token)
    return macro ? typeof macro === 'function' || !('unexpandable' in macro && macro.unexpandable) : isExpansionPrimitive(token)
  }

  function defined(token: string): boolean {
    if (macroFor(token) || activeCharacter.test(token) || isExpansionPrimitive(token) || macroDeclaration.test(token)) return true
    const name = token.slice(1)
    return sharedFunctions.has(name) || mathModeFunctions.has(name) || functions.has(name)
      || !!greekLetter(name) || !!mathSymbol(name) || !!textSymbol(token)
      || isMathUrlCommand(token) || isMathAttributeCommand(token)
      || Object.hasOwn(textSymbols, token) || Object.hasOwn(textAccents, token)
      || Object.hasOwn(styleCommands, token) || Object.hasOwn(legacyFonts, token) || Object.hasOwn(sizeCommands, token)
      || Object.hasOwn(delimiters, token) || Object.hasOwn(spacing, name) || Object.hasOwn(operators, name)
      || Object.hasOwn(namedLimits, name) || Object.hasOwn(accentedLimits, name)
      || /^(?:varinjlim|varprojlim|plim|bigg?[lrm]?|Bigg?[lrm]?|[%$#&_{}|\\ ])$/.test(name)
  }

  function chooseBranch(command: ConditionalPrimitive): string[] {
    const pattern = command === '\\@ifnextchar' ? rawGroup() : undefined
    const first = rawGroup()
    const second = rawGroup()
    switch (command) {
      case '\\@firstoftwo': return first
      case '\\html@mathml':
      case '\\@secondoftwo': return second
      case '\\TextOrMath': return mode === 'text' ? first : second
      case '\\@ifstar':
        space()
        if (tokenText(tokens[cursor] ?? '') !== '*') return second
        cursor++
        return first
      case '\\@ifnextchar':
        space()
        return pattern?.length === 1 && tokenText(pattern[0]) === tokenText(tokens[cursor] ?? '') ? first : second
    }
  }

  function replaceExpansion(start: number, body: string[]): number {
    if (remainingOuterTokens + tokens.length - (cursor - start) + body.length > 12000) throw new MathParseError('Expanded equation is too long')
    tokens.splice(start, cursor - start, ...body)
    cursor = start
    return body.length
  }

  function countExpansions(count: number): void {
    expandedCount += count
    if (expandedCount > maxExpand) throw new MathParseError('Too many math macro expansions')
  }

  function expandNativeMacro(macro: NativeMacro): string[] {
    if ('notation' in macro) return expandDelimitedNotation(macro.notation)
    if ('separator' in macro) return macro.separator()
    if ('dots' in macro) return expandDots(macro.dots)
    const { primitive } = macro
    if (primitive === '\\expandafter' || primitive === '\\noexpand') {
      space()
      const next = tokens[cursor++]
      if (!next || next === boundary) throw new MathParseError('Missing math expansion token')
      if (primitive === '\\noexpand') return [expandable(next) ? inhibitedToken + next : next]
      space()
      if (!tokens[cursor] || tokens[cursor] === boundary) throw new MathParseError('Missing token after delayed math expansion')
      expandOnce(true)
      return [next]
    }
    if (primitive === '\\message' || primitive === '\\errmessage') {
      const message = literalGroup()
      if (primitive === '\\message') console.log(message)
      else console.error(message)
      return []
    }
    if (primitive === '\\char') return expandCharacter()
    return chooseBranch(primitive)
  }

  function expandDots(name: DotsMacro): string[] {
    if (name === 'dots') {
      // AMS math classifies the next token after a single expansion.
      const expanded = expandOnce() !== false
      const next = tokenValue(tokens[cursor] ?? '')
      if (next === ',') return ['\\dotsc']
      if (dotsBeforeIntegral.has(next)) return ['\\dotsi']
      if (next === '\\DOTSX') return ['\\dotsx']
      const command = next.startsWith('\\') ? next.slice(1) : ''
      // These native relations represent KaTeX macros whose first expansion
      // can differ from the final relation symbol.
      if (command === 'ne' || command === 'neq' || (!expanded && negationMacros.has(next))) return ['\\dotso']
      if (isColonRelationCommand(command))
        return [!expanded && explicitColonDots.has(command) ? '\\dotsb' : '\\dotso']
      const category = command ? mathSymbol(command)?.[1] : undefined
      const centered = dotsBeforeOperator.has(next) || command.startsWith('not') || category === 'binary' || category === 'relation'
        || centersDots.test(operators[command] ?? next) || (!command && isCenteredGlyph(next))
      return [centered ? '\\dotsb' : '\\dotso']
    }
    const next = tokenValue(tokens[cursor] ?? '')
    const symbol = name === 'cdots' ? '\\@cdots' : '\\ldots'
    return spaceAfterDots.test(next) && (name !== 'dotsc' || next !== ',') ? [symbol, '\\,'] : [symbol]
  }

  function expandCharacter(): string[] {
    const prefix = peek()
    let code: number
    if (prefix === '`') {
      cursor++
      // Character constants name the next token itself, even for a macro.
      const token = tokenText(tokens[cursor++] ?? '')
      code = token === boundary ? NaN : token.codePointAt(token.startsWith('\\') ? 1 : 0) ?? NaN
    }
    else {
      const radix = prefix === '"' ? 16 : prefix === "'" ? 8 : 10
      if (radix !== 10) cursor++
      const digit = radix === 16 ? /^[0-9a-f]$/i : radix === 8 ? /^[0-7]$/ : /^\d$/
      space()
      const start = cursor
      while (digit.test(tokenValue(tokens[cursor] ?? ''))) cursor++
      code = Number.parseInt(tokens.slice(start, cursor).map(tokenValue).join(''), radix)
    }
    if (!Number.isSafeInteger(code)) throw new MathParseError('Invalid math character code')
    // Freeze the generated digits so active character definitions cannot
    // change the code during an eager definition or later formula rendering.
    return ['\\@char', '{', ...Array.from(String(code), digit => literalToken + digit), '}']
  }

  function macroDefinition(token: string): Macro | undefined {
    return macroFor(token) ?? (isExpansionPrimitive(token) ? { primitive: token } : undefined)
  }

  function consumeMacroPrefix(prefix: readonly string[]): void {
    for (const token of prefix) {
      if (tokenText(tokens[cursor++] ?? '') !== token) throw new MathParseError('Missing macro prefix')
    }
  }

  function expandOnce(eager = false): number | false {
    const token = tokens[cursor]
    const definition = macroDefinition(token)
    if (!definition) {
      if (eager && controlSequence.test(token) && !defined(token)) throw new MathParseError(`Undefined control sequence: ${token}`)
      return false
    }
    if (eager && typeof definition !== 'function' && 'body' in definition && definition.unexpandable) return false
    countExpansions(1)
    const start = cursor++
    if (controlWord.test(token)) space()
    if (typeof definition !== 'function' && !('body' in definition))
      return replaceExpansion(start, expandNativeMacro(definition))
    let macro: TokenMacro
    if (typeof definition === 'function') {
      const result = definition(context ??= createMacroContext())
      if (!isConfiguredMacro(result)) throw new Error(`Invalid expansion from math macro ${token}`)
      macro = compileTokenMacro(result)
      if (eager && macro.unexpandable) {
        replaceExpansion(start, [token])
        return false
      }
    }
    else macro = definition
    consumeMacroPrefix(macro.prefix)
    const values = macro.parameters.map((delimiter, index) => {
      if (index === 0 && macro.optional !== undefined) return rawBracket() ?? macro.optional
      return delimiter.length ? delimitedArgument(delimiter, true) : rawGroup()
    })
    const body: string[] = []
    for (let index = 0; index < macro.body.length; index++) {
      const token = macro.body[index]
      const next = macro.body[index + 1] ?? ''
      if (token === '#' && /^#[1-9]?$/.test(next)) {
        body.push(next)
        index++
      }
      else if (/^#[1-9]$/.test(token)) {
        const value = values[Number(token[1]) - 1]
        if (!value) throw new MathParseError(`Unbound macro parameter: ${token}`)
        body.push(...value)
      }
      else body.push(token)
    }
    return replaceExpansion(start, body)
  }

  function expand(skipSpace = true, eager = false): void {
    if (skipSpace) space()
    while (expandOnce(eager) !== false) {
      if (skipSpace) space()
    }
  }

  function tokenText(token: string): string {
    if (token.charCodeAt(0) !== 0) return token
    if (token.startsWith(literalToken)) return token.slice(literalToken.length)
    return token.startsWith(inhibitedToken) ? token.slice(inhibitedToken.length) : token
  }

  function tokenValue(token: string): string {
    if (token.charCodeAt(0) !== 0) return token
    return token.startsWith(inhibitedToken) ? '\\relax' : tokenText(token)
  }

  const peek = () => { expand(); return tokenValue(tokens[cursor] ?? '') }
  const take = () => { expand(); return tokenValue(tokens[cursor++] ?? '') }

  function rawGroup(missing = 'Missing math argument'): string[] {
    space()
    const first = tokenText(tokens[cursor] ?? '')
    if (!first || first === boundary || first === '}') throw new MathParseError(missing)
    if (first !== '{') return [tokens[cursor++]]
    cursor++
    let level = 1
    const begin = cursor
    while (cursor < tokens.length && level) {
      const next = tokenText(tokens[cursor++])
      if (next === boundary) throw new MathParseError('Unclosed math argument')
      if (next === '{') level++
      if (next === '}') level--
    }
    if (level) throw new MathParseError('Unclosed math argument')
    return tokens.slice(begin, cursor - 1)
  }

  function literalGroup(): string {
    return rawGroup().map(tokenValue).join('')
  }

  function delimitedArgument(delimiter: readonly string[], unwrapGroup = false): string[] {
    const start = cursor
    let level = 0
    let groupEnd: number | undefined
    while (cursor < tokens.length && tokens[cursor] !== boundary) {
      if (level === 0 && delimiter.every((token, index) => tokenText(tokens[cursor + index] ?? '') === token)) {
        const unwrap = unwrapGroup && tokenText(tokens[start]) === '{' && groupEnd === cursor
        const argument = unwrap ? tokens.slice(start + 1, cursor - 1) : tokens.slice(start, cursor)
        cursor += delimiter.length
        return argument
      }
      const token = tokenText(tokens[cursor++])
      if (token === '{') level++
      else if (token === '}' && --level === 0) groupEnd ??= cursor
      if (level < 0) break
    }
    throw new MathParseError('Missing macro delimiter')
  }

  function rawBracket(): string[] | undefined {
    space()
    if (tokenText(tokens[cursor] ?? '') !== '[') return
    cursor++
    return delimitedArgument([']'])
  }

  function withTokens<T>(body: string[], read: () => T): T {
    // Expand a local argument without shifting the rest of the formula.
    const outer = tokens
    const resume = cursor
    const remaining = outer.length - resume
    remainingOuterTokens += remaining
    tokens = [...body, boundary]
    cursor = 0
    try { return read() }
    finally {
      tokens = outer
      cursor = resume
      remainingOuterTokens -= remaining
    }
  }

  function expandDefinition(body: string[], expansionMode: 'value' | 'tokens' | 'definition' = 'value'): string[] {
    const eager = expansionMode === 'definition'
    const preserveTokens = expansionMode !== 'value'
    const definition = withTokens(body, () => {
      const result: string[] = []
      while (tokens[cursor] !== boundary) {
        expand(false, eager)
        if (tokens[cursor] === boundary) break
        const token = tokens[cursor++]
        if (token.startsWith(inhibitedToken) && (eager || !preserveTokens)) result.push(token.slice(inhibitedToken.length))
        else result.push(preserveTokens ? token : tokenValue(token))
      }
      return result
    })
    if (eager) countExpansions(definition.length)
    return definition
  }

  function publicToken(token: string | undefined): MathMacroToken {
    if (!token || token === boundary) return { text: 'EOF' }
    const value = tokenText(token)
    const text = texWhitespace.test(value) ? ' ' : value
    if (token.startsWith(inhibitedToken)) return { text, noexpand: true, treatAsRelax: true }
    if (token.startsWith(literalToken)) return { text, noexpand: true }
    return { text }
  }

  function publicTokens(body: readonly string[]): MathMacroToken[] {
    return body.flatMap(token => /^#[1-9]$/.test(token) ? [{ text: '#' }, { text: token[1] }] : [publicToken(token)])
  }

  function publicDefinition(macro: Macro | undefined): MathMacroDefinition | undefined {
    if (!macro || typeof macro === 'function') return macro
    if ('body' in macro) {
      if (macro.source !== undefined) return macro.source
      const expansion: MathMacroExpansion = {
        tokens: publicTokens(macro.body).reverse(),
        numArgs: macro.parameters.length,
        delimiters: [macro.prefix, ...macro.parameters].map(delimiter => [...delimiter]),
        unexpandable: macro.unexpandable,
      }
      if (macro.optional !== undefined) macroSnapshots.set(expansion, macro)
      return expansion
    }
    const callback: MathMacroFunction = () => ({ tokens: publicTokens(expandNativeMacro(macro)).reverse(), numArgs: 0 })
    macroSnapshots.set(callback, macro)
    return callback
  }

  function createMacroContext(): MathMacroContext {
    const future = (): MathMacroToken => {
      const token = tokens[cursor]
      return /^#[1-9]$/.test(token ?? '') ? { text: '#' } : publicToken(token)
    }
    const popToken = (): MathMacroToken => {
      const next = future()
      if (next.text === '#' && /^#[1-9]$/.test(tokens[cursor])) tokens[cursor] = tokens[cursor][1]
      else if (cursor < tokens.length && tokens[cursor] !== boundary) {
        cursor++
        if (controlWord.test(next.text)) space()
      }
      return next
    }
    const readStack = (stack: readonly MathMacroToken[]): string[] => {
      if (!isConfiguredMacro({ tokens: stack, numArgs: 0 })) throw new Error('Invalid math macro token list')
      return bodyFromStack(stack)
    }
    const pushTokens = (stack: readonly MathMacroToken[]): void => {
      const body = readStack(stack)
      if (remainingOuterTokens + tokens.length + body.length > 12000) throw new MathParseError('Expanded equation is too long')
      tokens.splice(cursor, 0, ...body)
    }
    const consumeArg = (delimiters?: readonly string[] | null): MathMacroArgument => {
      if (!delimiters?.length) space()
      const start = publicToken(tokens[cursor])
      const body = delimiters?.length ? delimitedArgument(delimiters, true) : rawGroup()
      const end = publicToken(tokens[cursor - 1])
      if (!delimiters?.length && controlWord.test(start.text)) space()
      return { start, end, tokens: publicTokens(body).reverse() }
    }
    const expandMacro = (name: string): MathMacroToken[] | undefined => macroDefinition(name)
      ? publicTokens(expandDefinition([name], 'definition')) : undefined
    return {
      get mode() { return mode },
      macros: {
        has: name => macroDefinition(name) !== undefined,
        get: name => publicDefinition(macroDefinition(name)),
        set(name, value, global) {
          if (!isConfiguredMacroName(name)) throw new Error(`Invalid math macro name: ${name}`)
          const macro = compileMacro(value)
          if (value !== undefined && !macro) throw new Error(`Invalid definition for math macro ${name}`)
          assign(name, macro, global)
        },
        beginGroup() { scopes.push({ undo: new Map(), callback: true }) },
        endGroup() {
          if (!scopes.at(-1)?.callback) throw new Error('Unbalanced math macro group')
          restoreScope()
        },
        endGroups() {
          while (scopes.at(-1)?.callback) restoreScope()
        },
      },
      future, popToken, pushToken: token => pushTokens([token]), pushTokens,
      consumeSpaces: space, consumeArg,
      consumeArgs(numArgs, delimiters) {
        if (!isConfiguredMacro({ tokens: [], numArgs, delimiters })) throw new Error('Invalid math macro arguments')
        if (delimiters) consumeMacroPrefix(delimiters[0])
        return Array.from({ length: numArgs }, (_, index) => consumeArg(delimiters?.[index + 1]).tokens)
      },
      expandOnce,
      expandAfterFuture() {
        expandOnce()
        return future()
      },
      expandNextToken() {
        expand(false)
        const next = popToken()
        return next.treatAsRelax ? { ...next, text: '\\relax' } : next
      },
      expandTokens: stack => publicTokens(expandDefinition(readStack(stack), 'definition')),
      expandMacro,
      expandMacroAsText: name => expandMacro(name)?.map(token => token.text).join(''),
      isDefined: defined,
      isExpandable: expandable,
    }
  }

  function expandDelimitedNotation(name: DelimitedNotation): string[] {
    const body = rawGroup()
    const bars = name === 'set' ? ['|'] : ['|', '\\|']
    const previous = bars.map(bar => macros.get(bar))
    return inScope(() => {
      for (const [index, bar] of bars.entries()) {
        assign(bar, { separator() {
          // Set builders replace only the first separator. A ket may contain
          // several separators, including ones produced by user macros.
          if (name !== 'Braket') {
            for (const [index, key] of bars.entries()) {
              const original = previous[index]
              if (original) macros.set(key, original)
              else macros.delete(key)
            }
          }
          if (name === 'set') return ['\\mid']
          const doubled = index === 0 && tokens[cursor] === '|'
          if (doubled) cursor++
          const gap = name === 'Set' ? '\\;' : '\\,'
          const glyph = name === 'Set' && (index === 1 || doubled) ? '\\Vert' : '\\vert'
          return [gap, '\\middle', glyph, gap]
        } })
      }
      const open = name === 'Braket' ? ['\\left', '\\langle'] : name === 'Set' ? ['\\left', '\\{', '\\:'] : ['\\{', '\\,']
      const close = name === 'Braket' ? ['\\right', '\\rangle'] : name === 'Set' ? ['\\:', '\\right', '\\}'] : ['\\,', '\\}']
      return expandDefinition([...open, ...body, ...close], 'tokens')
    })
  }

  function chemistryMath(source: string): Markup {
    const previous = tagState
    tagState = { suppressed: false }
    try { return withTokens(tokenize(source), () => inScope(() => row([boundary]))) }
    finally { tagState = previous }
  }

  function argumentAtom(primitive = false): Atom {
    if (depth++ > 100) throw new MathParseError('Math arguments are nested too deeply')
    const token = take()
    if (!token || token === '}' || token === boundary || token === '^' || token === '_' || macroDeclaration.test(token))
      throw new MathParseError('Missing math argument')
    if (infixFractions.has(token)) throw new MathParseError('An infix fraction argument requires a group')
    if (token.startsWith('\\')) {
      const name = token.slice(1)
      if (groupedArgumentFunctions.has(name) || (!primitive && primitiveArgumentFunctions.has(name)))
        throw new MathParseError(`Math command ${token} requires a grouped argument`)
    }
    const result = atom(token)
    depth--
    return result
  }

  function binRelArgument(): { markup: Markup, mathClass: MathClass, operator: boolean } {
    const { markup, parts } = fragmentArgument()
    const first = parts.find(part => part.markup !== '')
    const category = first && rowClass(first)
    return { markup, mathClass: category === 'bin' || category === 'rel' ? category : 'ord', operator: first?.operator === true }
  }

  function argument(primitive = false): Markup {
    return primitive ? argumentAtom(true).markup : fragmentArgument().markup
  }

  function scriptArgument(): Markup {
    while (peek() === '\\relax') cursor++
    return argument(true)
  }

  function fragmentArgument(missing?: string): { markup: Markup, parts: RowPart[] } {
    space()
    const grouped = tokenText(tokens[cursor] ?? '') === '{'
    const body = rawGroup(missing)
    let parts: RowPart[] | undefined
    // Fully expand an ordinary argument inside its own group. A single raw
    // macro token can produce several atoms, but cannot consume the next argument.
    const content = withTokens(body, () => inScope(() => row([boundary], false, false, value => { parts = value })))
    const single = parts?.length === 1 && !parts[0].fragment
    const markup = grouped || !single ? xml`<mrow>${content}</mrow>` : content
    return { markup, parts: parts ?? [{ markup: content }] }
  }

  function bracket(): string | undefined {
    return rawBracket()?.join('')
  }

  function strictViolation(code: string, message: string, report = true, token?: string): boolean {
    let strict = options?.strict
    if (typeof strict === 'function') {
      if (report) strict = strict(code, message, token === undefined ? undefined : { text: token })
      else {
        try { strict = strict(code, message) }
        catch { strict = 'error' }
      }
    }
    const reject = strict === true || strict === 'error'
    if (strict === 'warn') console.warn(`${message} [${code}]`)
    if (reject && report) throw new MathParseError(`${message} [${code}]`)
    return reject
  }

  function checkUnicode(token: string): ReturnType<typeof readUnicodeToken> {
    const unicode = readUnicodeToken(token, mode)
    if (options?.strict && unicode?.diagnostic) {
      const character = unicode.diagnostic === 'unknownSymbol' ? unicode.base : String.fromCodePoint(token.codePointAt(0)!)
      const message = unicode.diagnostic === 'unknownSymbol'
        ? `Unrecognized Unicode character "${character}" (${character.codePointAt(0)})`
        : `Unicode text character "${character}" used in math mode`
      strictViolation(unicode.diagnostic, message, true, token)
    }
    return unicode
  }

  function lineGap(command: string): string | undefined {
    const extra = command === '\\\\' && tokens[cursor] === '[' ? rawBracket() : undefined
    const gap = extra === undefined ? '' : dimension(expandDefinition(extra).join(''))
    if (gap === undefined) throw new MathParseError('Invalid math line spacing')
    if (!display) return gap
    return strictViolation('newLineInDisplayMode', 'A standalone TeX line break has no effect in LaTeX display math', false) ? undefined : gap
  }

  function readDelimiter(command: string): string {
    const token = take()
    if (token !== '{') return delimiter(token, command)
    const symbol = take()
    if (take() !== '}') throw new MathParseError(`Invalid delimiter after \\${command}`)
    return delimiter(symbol, command)
  }

  function pairedDelimiters(): Markup {
    const leftGlyph = readDelimiter('left')
    const left = leftGlyph === '.' ? spaceMarkup(nullDelimiterWidth) : fence(leftGlyph)
    delimiterDepth++
    let content: Markup
    try {
      // KaTeX keeps definitions between the fences in their surrounding group.
      content = row(['\\right', '}', '\\end', '&', '\\cr'])
    }
    finally { delimiterDepth-- }
    if (take() !== '\\right') throw new MathParseError('Missing \\right for \\left')
    const rightGlyph = readDelimiter('right')
    const right = rightGlyph === '.' ? spaceMarkup(nullDelimiterWidth) : fence(rightGlyph, true, currentColor)
    return xml`<mrow data-math-delimiters="">${left}${content}${right}</mrow>`
  }

  function readDimension(blank?: string, spacingCommand?: string): string {
    function parseLength(raw: string): string | undefined {
      const length = dimension(raw)
      if (length === undefined || !spacingCommand || !options?.strict) return length
      const unit = /[a-z]+$/.exec(raw.trim())?.[0] ?? 'pt'
      const mathSpacing = spacingCommand.startsWith('m')
      if (mathSpacing !== (unit === 'mu')) {
        const units = mathSpacing ? 'requires mu units' : 'requires text units'
        strictViolation('mathVsTextUnits', `\\${spacingCommand} ${units}`)
      }
      if (mathSpacing && mode !== 'math') strictViolation('mathVsTextUnits', `\\${spacingCommand} works only in math mode`)
      return length
    }
    space()
    let raw = ''
    const grouped = tokenText(tokens[cursor] ?? '') === '{'
    if (grouped) {
      raw = expandDefinition(rawGroup()).join('')
      if (!raw.trim() && blank !== undefined) return blank
    }
    else {
      while (true) {
        expand(false)
        const token = tokenValue(tokens[cursor] ?? '')
        if (!token || !dimensionPrefix.test(raw + token)) break
        raw += token
        cursor++
      }
    }
    // TeX treats an empty braced size as zero points but requires a unit on
    // an explicit kern or skip, including when its magnitude is zero.
    if (spacingCommand && raw && !/[a-z]{2}\s*$/.test(raw)) throw new MathParseError('Invalid math dimension')
    const emptySkip = spacingCommand && grouped && !raw
    const length = parseLength(emptySkip ? '0pt' : raw)
    if (length !== undefined) return emptySkip ? '0em' : length
    throw new MathParseError('Invalid math dimension')
  }

  function spacingMarkup(name: string): string {
    return spaceMarkup(readDimension(undefined, name))
  }

  function readColor(message = 'Invalid math color'): string {
    const color = safeColor(expandDefinition(rawGroup()).join(''))
    if (!color) throw new MathParseError(message)
    return color
  }

  function textBox(name: string): Markup {
    if (name === 'reflectbox') return xml`<mrow class="math-reflect">${textArgument('hbox')}</mrow>`
    if (name === 'fbox') return xml`<mrow class="math-color-box math-frame">${textArgument('hbox')}</mrow>`
    const frame = name === 'fcolorbox' ? readColor('Invalid math box color') : ''
    const background = readColor('Invalid math box color')
    const content = textArgument('hbox')
    return xml`<mrow class="math-color-box${frame ? ' math-frame' : ''}" style="background-color:${background}${frame ? `;border-color:${frame}` : ''}">${content}</mrow>`
  }

  function optionalBoxDimension(): string | undefined {
    const size = rawBracket()
    if (size === undefined) return
    const value = dimension(expandDefinition(size).join(''))
    if (value === undefined) throw new MathParseError('Invalid math box dimension')
    return value
  }

  function verticalBox(name: string, readBody: () => Markup): Markup {
    if (name === 'rule') {
      const offset = optionalBoxDimension()
      const width = readDimension('0px')
      const height = readDimension('0px')
      const rule = `<mspace width="${width}" height="${height}" style="background:currentColor"/>`
      if (!offset || Number.parseFloat(offset) === 0) return rule
      const ascent = `max(0px,calc((${height}) + (${offset})))`
      const descent = `max(0px,calc(-1 * (${offset})))`
      // A MathML vertical offset moves the ink independently of layout.
      return `<mpadded voffset="${offset}" height="0" style="padding-top:${ascent};padding-bottom:${descent}">${rule}</mpadded>`
    }
    if (name === 'raisebox') {
      if (peek() !== '{') throw new MathParseError('Raised math box requires a grouped dimension')
      const offset = readDimension('0px')
      const height = optionalBoxDimension()
      const depth = optionalBoxDimension()
      const body = renderMarkup(textArgument(), 1)
      // Use an inline box baseline so the shift affects both layout and paint.
      // Zero font adjustment removes the empty line strut without shrinking the content.
      const text = `<math style="font-size:math;font-family:inherit;font-style:inherit;font-weight:inherit" scriptlevel="0" displaystyle="false"><mrow>${body}</mrow></math>`
      const shifted = `<span style="display:inline-block;font-size-adjust:none;vertical-align:${offset}">${text}</span>`
      const box = `<mtext class="math-raised-box" style="line-height:0"><span style="display:inline-block;line-height:0;font-size-adjust:0">${shifted}</span></mtext>`
      return height || depth ? `<mpadded${height ? ` height="${height}"` : ''}${depth ? ` depth="${depth}"` : ''}>${box}</mpadded>` : box
    }
    if (name === 'smash') {
      const flags = rawBracket()
      const sides = flags === undefined ? 'tb' : expandDefinition(flags).join('').replace(/\s/g, '')
      const content = readBody()
      if (!/^[tb]+$/.test(sides)) return content
      return xml`<mpadded${sides.includes('t') ? ' height="0"' : ''}${sides.includes('b') ? ' depth="0"' : ''}>${content}</mpadded>`
    }
    if (name === 'hphantom') {
      let parts: Markup[] = []
      const body = textArgument(undefined, false, value => { parts = value })
      return horizontalPhantom(body, parts.map(markup => ({ markup })), 'text')
    }
    const invisible = xml`<mphantom>${readBody()}</mphantom>`
    if (name === 'vphantom') return xml`<mpadded width="0">${invisible}</mpadded>`
    return invisible
  }

  function overlap(direction: string, content: Markup): Markup {
    return xml`<mpadded width="0"><mrow class="math-overlap-${direction}">${content}</mrow></mpadded>`
  }

  function untrusted(command: string): string {
    const color = mathErrorColor(options?.errorColor)
    return `<mtext class="math-untrusted" style="color:${color}">${escapeHtml(command)}</mtext>`
  }

  function imageMarkup(url: string, options: string): string {
    const values = new Map(mathKeyValues(options))
    for (const key of values.keys()) {
      if (!['width', 'height', 'totalheight', 'alt'].includes(key)) throw new MathParseError(`Unknown math image option: ${key}`)
    }
    function size(key: string): string | undefined {
      const value = values.get(key)?.trim()
      if (value === undefined) return
      const normalized = /^[+\-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) ? `${Number(value)}bp` : value
      const parsed = dimension(normalized)
      if (!parsed || Number.parseFloat(parsed) < 0) throw new MathParseError(`Invalid math image size: ${key}`)
      return parsed
    }
    const width = size('width')
    const height = size('height') ?? '0.9em'
    const total = size('totalheight')
    const sizing = `height:${total ?? height}${width && Number.parseFloat(width) > 0 ? `;width:${width}` : ''}${total ? `;vertical-align:calc(${height} - ${total})` : ''}`
    const filename = url.split(/[?#]/)[0].split('/').at(-1)?.replace(/\.[^.]+$/, '') ?? ''
    const alt = values.get('alt')?.trim() || filename
    return `<mtext class="math-image"><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" style="${sizing}"></mtext>`
  }

  function htmlCommand(command: KatexTrustContext['command'], text = false): Markup {
    const body = () => text ? textArgument() : argument()
    if (isMathUrlCommand(command)) {
      const options = command === '\\includegraphics' ? bracket() : undefined
      const raw = expandDefinition(rawGroup()).join('')
      let content: Markup = ''
      if (command === '\\href') {
        linkDepth++
        try { content = body() }
        finally { linkDepth-- }
      }
      const context = mathUrl(command, raw)
      if (!context || !trustedMath(context, state?.options.trust)) return untrusted(command)
      if (command === '\\includegraphics') return imageMarkup(context.url, options ?? '')
      if (linkDepth) return command === '\\url' ? tag('mtext', context.url) : content
      const href = escapeHtml(context.url)
      if (command === '\\url') return `<mtext class="math-link math-url"><a href="${href}">${escapeHtml(context.url)}</a></mtext>`
      // HTML anchors remain operable in browsers that do not implement MathML href.
      return style => `<mtext class="math-link"><a href="${href}"><math displaystyle="${style === 0}"><mrow>${renderMarkup(content, style)}</mrow></math></a></mtext>`
    }
    const { context, attributes } = mathAttributes(command, literalGroup())
    const content = body()
    strictViolation('htmlExtension', 'HTML extension commands are disabled in strict mode')
    return trustedMath(context, state?.options.trust) ? xml`<mrow ${attributes}>${content}</mrow>` : untrusted(command)
  }

  function textArgument(name?: string, parentheses = false, capture?: (parts: Markup[]) => void): Markup {
    const previousItalic = textItalic
    const previousMonospace = textMonospace
    const previousFont = textFont
    const font = name === 'emph' ? (textItalic ? 'textup' : 'textit')
      : name === 'text' && textItalic ? 'textup' : name
    const declaration = font ? textFonts[font] : undefined
    if (declaration?.['font-style']) textItalic = declaration['font-style'] === 'italic'
    if (declaration?.['font-family']) textMonospace = declaration['font-family'] === 'monospace'
    if (declaration && Object.keys(declaration).length) textFont = { ...textFont, ...declaration }
    // Named text styles survive an embedded formula. The formula's math font
    // and any legacy math font declaration stay on their own side of the switch.
    const reset = mode === 'math' && (mathFontActive || previousFont !== undefined)
    const properties = reset ? textFontCSS({ ...normalFont, ...textFont }) : declaration ? textFontCSS(declaration) : ''
    try {
      space()
      const word = controlWord.test(tokens[cursor] ?? '')
      const body = rawGroup('Missing math text argument')
      if (word) space()
      // Scan the argument before expansion so a token's whole expansion
      // stays in text mode and stops at the boundary of this argument.
      const content = inMode('text', () => withTokens(body, () => parseTextArgument(properties, parentheses, capture)))
      if (name !== 'hbox') return content
      const sized = renderMarkup(content, 1)
      return style => style === 1 ? sized : mathSize(1, sized)
    }
    finally {
      textItalic = previousItalic
      textMonospace = previousMonospace
      textFont = previousFont
    }
  }

  function unsupportedCommand(token: string): string {
    if (options?.throwOnError) throw new MathParseError(`Unsupported math command: ${token}`)
    return `<mtext style="color:${mathErrorColor(options?.errorColor)}">${escapeHtml(token)}</mtext>`
  }

  function textCharacter(token: string): string | undefined {
    if (token === '\\@char') return explicitCharacter()
    if (/^(?:[&#^_]|#[1-9])$/.test(token)) throw new MathParseError(`Unexpected text token: ${token}`)
    if (!token.startsWith('\\')) {
      const unicode = checkUnicode(token)
      return unicode?.marks ? (unicode.base + unicode.marks).normalize('NFC') : token
    }
    const name = token.slice(1)
    if (mathModeFunctions.has(name) || name === 'includegraphics')
      throw new MathParseError(`Math command ${token} requires math mode`)
    const escaped = /^\\([%$#&_{} ])$/.exec(token)
    return escaped?.[1] ?? textSymbols[token] ?? textSymbol(token)
  }

  function textAccent(command: string): { literal: string } | { markup: Markup } {
    const blank = Object.hasOwn(textAccents, command) && !/^\\[A-Za-z]+$/.test(command) && texWhitespace.test(tokens[cursor] ?? '')
    if (blank) cursor++
    const content = blank ? tag('mtext', '\u00A0') : textArgument()
    if (command === '\\textcircled') return { markup: xml`<mrow class="math-text-circled">${content}</mrow>` }
    const [mark, glyph, below] = textAccents[command]
    const plain = typeof content === 'string' ? /^<mtext>([^&<]\p{M}*)<\/mtext>$/u.exec(content)?.[1] : undefined
    if (plain !== undefined && plain.trim()) {
      const base = below ? plain : plain.replace(/^ı/, 'i').replace(/^ȷ/, 'j')
      return { literal: (base + mark).normalize('NFC') }
    }
    const element = below ? 'munder' : 'mover'
    return { markup: xml`<${element} ${below ? 'accentunder' : 'accent'}="true"><mrow>${content}</mrow>${tag('mo', glyph)}</${element}>` }
  }

  function coloredArgument(text: boolean): Markup {
    const color = readColor()
    const content = text ? textArgument() : argument()
    return xml`<mrow style="color:${color}">${content}</mrow>`
  }

  function parseTextArgument(properties: string, parentheses: boolean, capture?: (parts: Markup[]) => void, end = boundary): Markup {
    if (depth++ > 100) throw new MathParseError('Math text is nested too deeply')
    const wrap = (markup: Markup) => properties ? xml`<mrow style="${properties}">${markup}</mrow>` : markup
    const opening = parentheses ? '(' : ''
    const closing = parentheses ? ')' : ''
    const sized: Markup[] = []
    const lines: MathLine[] = []
    const baseScale = fontScale
    let parts: Markup[] = []
    let literal = opening
    let legacyFont: string | undefined
    let textColor = ''
    function flush(): void {
      if (!literal) return
      const joined = literal.replace(/[ \t\r\n]+/g, ' ').replace(/^ | $/g, '\u00A0')
        .replace(/-{2,3}|\x60{1,2}|'{1,2}/g, glyph => textMonospace && glyph.length > 1 ? glyph : textLigatures[glyph])
      parts.push(tag('mtext', joined))
      literal = ''
    }
    function flushFormatting(): void {
      flush()
      if (parts.length) {
        const content = joinMarkup(parts)
        const styled = scaledMath(legacyFont ? fontMarkup(content, legacyFont) : content, fontScale / baseScale)
        sized.push(textColor ? xml`<mrow style="color:${textColor}">${styled}</mrow>` : styled)
      }
      parts = []
    }
    inScope(() => {
      while (true) {
        expand(false)
        const token = tokenValue(tokens[cursor] ?? '')
        if (token === end) {
          if (end !== boundary) cursor++
          if (end === '\\endgroup') space()
          literal += closing
          break
        }
        if (!token || token === boundary || token === '}' || token === '\\endgroup') throw new MathParseError('Unclosed math text')
        cursor++
        if (token === '\\relax' || declareMacro(token) || equationDirective(token)) continue
        const command = token.startsWith('\\') ? token.slice(1) : ''
        const verbatim = verbatimMarkup(token)
        if (verbatim !== undefined) {
          flush()
          parts.push(verbatim)
        }
        else if (token === '\\\\' || token === '\\newline') {
          const gap = lineGap(token)
          if (gap === undefined) continue
          flushFormatting()
          lines.push({ content: joinMarkup(sized.splice(0)), gap })
        }
        else if (Object.hasOwn(sizeCommands, token)) {
          flushFormatting()
          fontScale = sizeCommands[token]
          space()
        }
        else if (Object.hasOwn(legacyFonts, token)) {
          flushFormatting()
          legacyFont = legacyFonts[token]
          textItalic = legacyFont === 'italic'
          textMonospace = legacyFont === 'monospace'
          space()
        }
        else if (token === '$' || token === '\\(') {
          flush()
          const close = token === '$' ? '$' : '\\)'
          const value = inScope(() => inMode('math', () => withMathFont(false, () => {
            textItalic = textFont?.['font-style'] === 'italic'
            textMonospace = textFont?.['font-family'] === 'monospace'
            const content = row([close, '}', '\\endgroup', boundary])
            if (take() !== close) throw new MathParseError('Unclosed inline math in text')
            return content
          })))
          parts.push(style => {
            const content = renderMarkup(value, style === 0 ? 1 : style)
            return `<mrow class="math-font-reset">${style === 0 ? mathSize(1, content) : content}</mrow>`
          })
        }
        else if (token === '{' || token === '\\begingroup') {
          flush()
          if (token === '\\begingroup') space()
          parts.push(parseTextArgument('', false, undefined, token === '{' ? '}' : '\\endgroup'))
        }
        else if (Object.hasOwn(textFonts, command)) {
          flush()
          parts.push(textArgument(command))
        }
        else if (textBoxes.has(command)) {
          flush()
          parts.push(textBox(command))
        }
        else if (verticalBoxCommands.has(command)) {
          flush()
          parts.push(verticalBox(command, () => textArgument()))
        }
        else if (typesettingNames.has(command)) {
          flush()
          parts.push(typesettingName(command))
          space()
        }
        else if (token === '\\textcolor' || (token === '\\color' && options?.colorIsTextColor)) {
          flush()
          parts.push(coloredArgument(true))
        }
        else if (token === '\\color') {
          flushFormatting()
          textColor = readColor()
        }
        else if (token === '\\sout') {
          flush()
          parts.push(xml`<mrow class="math-sout">${textArgument()}</mrow>`)
        }
        else if (token === '\\underbar' || token === '\\underline') {
          flush()
          parts.push(xml`<mrow class="math-underline">${textArgument()}</mrow>`)
        }
        else if (spacingCommands.has(command)) {
          flush()
          parts.push(spacingMarkup(command))
        }
        else if (/^\\[^ >]/.test(token) && Object.hasOwn(spacing, token.slice(1))) {
          flush()
          parts.push(spaceMarkup(spacing[token.slice(1)]))
          if (/^\\[A-Za-z]+$/.test(token)) space()
        }
        else if (token === '\\llap' || token === '\\clap' || token === '\\rlap') {
          flush()
          parts.push(overlap(token[1], textArgument()))
        }
        else if (token === '\\ref' || token === '\\eqref') {
          flush()
          parts.push(equationReference(token))
        }
        else if (isMathAttributeCommand(token) || token === '\\href' || token === '\\url') {
          flush()
          parts.push(htmlCommand(token, true))
        }
        else if (token === '\\textcircled' || Object.hasOwn(textAccents, token)) {
          const accented = textAccent(token)
          if ('literal' in accented) literal += accented.literal
          else {
            flush()
            parts.push(accented.markup)
          }
        }
        else if (token === '~') {
          flush()
          parts.push(tag('mtext', '\u00A0'))
        }
        else if (token === '\\ldots') {
          flush()
          parts.push(tag('mo', '…'))
        }
        else {
          const character = textCharacter(token)
          if (character !== undefined) literal += character
          else {
            flush()
            parts.push(unsupportedCommand(token))
          }
        }
      }
      if (sized.length || fontScale !== baseScale || legacyFont || textColor) {
        flushFormatting()
        parts = sized
      }
      flush()
    })
    fontScale = baseScale
    depth--
    const content = joinMarkup(parts)
    if (lines.length) return wrap(lineTable([...lines, { content }], false, true))
    capture?.(parts)
    return properties || parts.length === 1 ? wrap(content) : xml`<mrow>${content}</mrow>`
  }

  function fraction(layout: FractionLayout): Markup {
    return fractionMarkup(argument(), argument(), { ...layout, thickness: fractionRule(layout.thickness, minRule) })
  }

  function fractionDelimiter(side: 'open' | 'close'): string {
    const { markup, parts } = fragmentArgument()
    if (parts.length !== 1 || rowClass(parts[0]) !== side || typeof markup !== 'string') return ''
    const glyph = /^(?:<mrow>)*<mo stretchy="false">([^<]+)<\/mo>(?:<\/mrow>)*$/.exec(markup)?.[1]
    if (!glyph) return ''
    const value = unescapeHtml(glyph)
    return delimiterGlyphs.has(value) ? fence(value) : ''
  }

  function infixThickness(token: string): string | undefined {
    if (token === '\\over') return
    const thickness = token === '\\above' ? readDimension('0') : '0'
    return Number.parseFloat(thickness) > 0 ? thickness : '0'
  }

  function nextTag(automatic: boolean): Markup | undefined {
    const { key, label, starred } = tagState
    tagState.key = undefined
    if (label !== undefined) {
      return key ? referenceMarkup().label?.(key, { markup: renderMarkup(label, 1), starred: starred === true }) ?? label : label
    }
    if (automatic && !tagState.suppressed) {
      equationNumber++
      return (key ? referenceMarkup() : references)?.number?.(equationNumber, key)
        ?? numberMarkup?.(equationNumber) ?? tag('mtext', `(${equationNumber})`)
    }
  }

  function equationKey(): string {
    return expandDefinition(rawGroup('Missing equation label')).join('').trim()
  }

  function equationReference(token: string): string {
    const starred = peek() === '*'
    if (starred) take()
    return referenceMarkup().reference(equationKey(), token === '\\eqref', !starred && linkDepth === 0)
  }

  function equationDirective(token: string): boolean {
    if (token === '\\tag') {
      if (!display) throw new MathParseError('Equation tags require display math')
      if (tagState.label !== undefined) throw new MathParseError('Multiple tags for one equation')
      const starred = peek() === '*'
      if (starred) take()
      tagState.starred = starred
      tagState.label = ''
      tagState.label = textArgument(undefined, !starred)
    }
    else if (token === '\\label') {
      const key = equationKey()
      if (key && display) tagState.key ??= key
    }
    else if (token === '\\raisetag') {
      if (!display) throw new MathParseError('Equation tag shifts require display math')
      tagState.raise = readDimension()
    }
    else if (token === '\\notag' || token === '\\nonumber') tagState.suppressed = true
    else return false
    return true
  }

  function unicodeScript(symbols: ReadonlyMap<string, string>): Markup {
    let buffer = ''
    for (let value = symbols.get(peek()); value !== undefined; value = symbols.get(peek())) {
      cursor++
      buffer += value
    }
    const body = tokenize(buffer)
    if (body.some(token => macroFor(token))) {
      const content = withTokens(body, () => inScope(() => row([boundary])))
      return xml`<mrow>${content}</mrow>`
    }
    const parts = (buffer.match(/\d+|./g) ?? []).map(token => /^\d+$/.test(token) ? tag('mn', token) : atom(token).markup)
    return xml`<mrow>${joinMarkup(parts)}</mrow>`
  }

  function primeScript(): Markup {
    let text = ''
    for (let count = primeCount(peek()); count; count = primeCount(peek())) {
      cursor++
      text += '′'.repeat(count)
    }
    const following = peek() === '^' ? (cursor++, scriptArgument()) : ''
    return xml`<mrow>${tag('mo', text)}${following}</mrow>`
  }

  function readScripts(part?: Atom): { lower: Markup, upper: Markup, forceLimits: boolean | 'display' | undefined } {
    let lower: Markup = ''
    let upper: Markup = ''
    let forceLimits: boolean | 'display' | undefined = part?.forceLimits
    for (let kind = peek(); kind; kind = peek()) {
      if (kind === '\\limits' || kind === '\\nolimits' || kind === '\\displaylimits') {
        cursor++
        if (part?.limits === undefined) throw new MathParseError('Limit control requires a math operator')
        if (!part.ignoreLimitControl) forceLimits = kind === '\\displaylimits' ? 'display' : kind === '\\limits'
        continue
      }
      if (kind === '_' || unicodeSubscripts.has(kind)) {
        if (lower) throw new MathParseError('Double subscript')
        lower = inScript(kind === '_' ? (cursor++, scriptArgument()) : unicodeScript(unicodeSubscripts))
        continue
      }
      const prime = primeCount(kind) > 0
      if (kind !== '^' && !prime && !unicodeSuperscripts.has(kind)) break
      if (upper) throw new MathParseError('Double superscript')
      upper = inScript(kind === '^' ? (cursor++, scriptArgument()) : prime ? primeScript() : unicodeScript(unicodeSuperscripts))
    }
    return { lower, upper, forceLimits }
  }

  function sidedOperator(): Atom {
    function side() {
      return withTokens(rawGroup('Missing sideset script argument'), () => inScope(() => {
        const { lower, upper } = readScripts()
        if (peek() !== boundary) throw new MathParseError('Invalid sideset script argument')
        return lower || upper ? xml`${lower || '<none/>'}${upper || '<none/>'}` : ''
      }))
    }
    const left = side()
    const right = side()
    const base = withTokens(rawGroup('Missing sideset operator'), () => inScope(() => {
      const operator = argumentAtom(true)
      if (operator.limits !== true || peek() !== boundary) throw new MathParseError('Sideset requires a sum-class operator')
      return operator.markup
    }))
    const markup = left || right
      ? xml`<mmultiscripts>${stackOperator(base)}${right}<mprescripts/>${left || '<none/><none/>'}</mmultiscripts>`
      : base
    return { markup, mathClass: 'op', limits: true }
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

  function row(stop: string[] = [], breakOnInfix = false, exposeLines = false, capture?: (parts: RowPart[]) => void, followsOrdinary = false): Markup {
    if (depth++ > 100) throw new MathParseError('Math groups are nested too deeply')
    const softWrap = !display && depth === 1 && state?.inlineBreaks === true
    let parts: RowPart[] = []
    let lines: MathLine[] | undefined
    let numerator: Markup = ''
    let infix = ''
    let thickness: string | undefined
    const finish = (wrap = false) => {
      const content = joinRow(parts, wrap && !lines, followsOrdinary)
      return lines ? lineTable([...lines, { content }], display && exposeLines, !display || options?.fleqn === true) : content
    }
    for (let token = peek(); token && !stop.includes(token); token = peek()) {
      if (token === boundary) throw new MathParseError('Unclosed math argument')
      if (breakOnInfix && infixFractions.has(token)) break
      cursor++
      if (token === '\\relax') continue
      if (infixFractions.has(token)) {
        if (infix) throw new MathParseError('Only one infix fraction is allowed per math group')
        infix = token
        thickness = infixThickness(token)
        numerator = finish()
        parts = []
        followsOrdinary = false
        lines = undefined
        continue
      }
      if (token === '\\\\' || token === '\\newline') {
        const gap = lineGap(token)
        if (gap !== undefined) {
          lines ??= []
          lines.push({ content: joinRow(parts, false, followsOrdinary), gap })
          parts = []
          followsOrdinary = false
        }
        continue
      }
      const exposeDeclarationLines = exposeLines && !parts.length && !infix && !lines
      if (Object.hasOwn(styleCommands, token)) {
        const selected = styleCommands[token]
        const content = row(stop, true, exposeDeclarationLines, undefined, followsOrdinary && !parts.some(rowClass))
        parts.push({ markup: mathSize(selected, renderMarkup(content, selected)) })
        continue
      }
      if (Object.hasOwn(sizeCommands, token)) {
        const baseScale = fontScale
        fontScale = sizeCommands[token]
        parts.push({ markup: scaledMath(row(stop, true, exposeDeclarationLines, undefined, followsOrdinary && !parts.some(rowClass)), fontScale / baseScale) })
        fontScale = baseScale
        continue
      }
      if (Object.hasOwn(legacyFonts, token)) {
        const content = withMathFont(true, () => row(stop, true, exposeDeclarationLines, undefined, followsOrdinary && !parts.some(rowClass)))
        parts.push({ markup: fontMarkup(content, legacyFonts[token]) })
        continue
      }
      if (token === '\\color' && !options?.colorIsTextColor) {
        const color = readColor()
        currentColor = color
        let coloredParts: RowPart[] | undefined
        const capture = delimiterDepth > 0 ? (value: RowPart[]) => { coloredParts = value } : undefined
        const content = row(stop, true, exposeDeclarationLines, capture, followsOrdinary && !parts.some(rowClass))
        // An embellished middle operator must be a child of the fence row
        // to stretch to its height. Keep the color on each atom in that row.
        if (coloredParts?.some(part => part.mathClass === 'middle' || part.fragment))
          parts.push(...coloredParts.map(part => colorRowPart(part, color)))
        else parts.push({ markup: xml`<mrow style="color:${color}">${content}</mrow>` })
        continue
      }
      const unicodeScriptToken = unicodeSuperscripts.has(token) || unicodeSubscripts.has(token)
      let part: Atom
      if (token === '_' || token === '^' || primeCount(token) || unicodeScriptToken) {
        if (unicodeScriptToken) checkUnicode(token)
        part = { markup: '<mrow/>' }
        cursor--
      }
      else part = atom(token)
      let { lower, upper, forceLimits } = readScripts(part)
      if (part.brace === 'upper' && upper) {
        part.markup = xml`<mover>${part.markup}${upper}</mover>`
        upper = ''
      }
      if (part.brace === 'lower' && lower) {
        part.markup = xml`<munder>${part.markup}${lower}</munder>`
        lower = ''
      }
      let content = part.markup
      let fragment = part.fragment
      if (lower || upper) {
        const normal = lower && upper ? 'msubsup' : lower ? 'msub' : 'msup'
        const stacked = lower && upper ? 'munderover' : lower ? 'munder' : 'mover'
        const wrap = (tag: string) => xml`<${tag}>${part.markup}${lower}${upper}</${tag}>`
        if (typeof forceLimits === 'boolean' || (forceLimits !== 'display' && !part.limits)) {
          if (forceLimits) part.markup = stackOperator(part.markup)
          content = wrap(forceLimits ? stacked : normal)
        }
        else {
          const display = wrap(stacked)
          const inline = wrap(normal)
          content = style => renderMarkup(style === 0 ? display : inline, style)
        }
        if (fragment) {
          const select = fragment
          fragment = (style) => {
            // Scripts attach to the full branch. Its final atom supplies the
            // spacing class for the resulting script box.
            const mathClass = expandRow(select(style), style).map(rowClass).findLast(Boolean) ?? 'ord'
            return [{ markup: content, mathClass }]
          }
        }
      }
      parts.push({ markup: content, token, mathClass: part.mathClass, operator: part.limits !== undefined, fragment })
    }
    depth--
    if (!infix && !lines) capture?.(parts)
    const result = finish(softWrap && !infix)
    if (!infix) return result
    const fences = fractionFences[infix]
    return fractionMarkup(xml`<mrow>${numerator}</mrow>`, xml`<mrow>${result}</mrow>`, {
      thickness: fractionRule(thickness, minRule),
      fences: fences && [fence(fences[0]), fence(fences[1])],
    })
  }

  function commutativeDiagram(): string {
    const stops = ['@', '&', '\\\\', '\\newline', '\\cr', '\\end']
    const rows: string[][] = []
    function arrowLabel(type: string): string {
      const label = renderMarkup(row([...stops, type]), 2)
      if (take() !== type) throw new MathParseError('Incomplete CD arrow')
      return label ? `<mrow>${label}</mrow>` : ''
    }
    function vertical(symbol: '↑' | '↓' | '‖', left = '', right = ''): string {
      return `<mrow class="math-cd-vertical">${mathSize(2, left || '<mrow/>')}${verticalMathArrow(symbol)}${mathSize(2, right || '<mrow/>')}</mrow>`
    }
    function commutativeArrow(): string {
      const type = take()
      if (type === '.') return ''
      if (type === '=') return mathArrowBody('=', '3em')
      if (type === '|') return vertical('‖')
      if (!/^[<>AV]$/.test(type)) throw new MathParseError('Unknown CD arrow')
      const first = arrowLabel(type)
      const second = arrowLabel(type)
      if (type === '<' || type === '>') {
        return renderMarkup(stackMathArrow(mathArrowBody(type === '<' ? '←' : '→', '3em'), first, second), 0)
      }
      return vertical(type === 'A' ? '↑' : '↓', first, second)
    }
    function readRow(): { cells: string[], last: boolean } {
      const cells: string[] = []
      while (peek()) {
        cells.push(renderMarkup(row(stops), 0))
        const separator = take()
        if (separator === '@') {
          cells.push(commutativeArrow())
          continue
        }
        if (separator === '&') continue
        if (separator === '\\\\' || separator === '\\newline' || separator === '\\cr') return { cells, last: false }
        if (separator === '\\end' && literalGroup() === 'CD') return { cells, last: true }
        break
      }
      throw new MathParseError('Unclosed CD environment')
    }

    let closed = false
    while (peek()) {
      // AMS CD definitions are local to each row, including its labels.
      const { cells, last } = inScope(readRow)
      if (rows.length % 2) {
        if (cells[0] === '') cells.shift()
        if (cells.at(-1) === '') cells.pop()
      }
      if (cells.some(Boolean) || !last) rows.push(cells)
      if (last) { closed = true; break }
    }
    if (!closed) throw new MathParseError('Unclosed CD environment')
    const columns = Math.max(0, ...rows.map(cells => cells.length))
    if (columns * rows.length > 6000) throw new MathParseError('CD environment has too many cells')
    const markup = rows.map(cells => `<mtr>${Array.from({ length: columns }, (_, index) => `<mtd>${cells[index] ?? ''}</mtd>`).join('')}</mtr>`).join('')
    return `<mtable class="math-cd">${markup}</mtable>`
  }

  function arrayRowGap(separator: string): string | undefined {
    if (separator !== '\\\\' || tokens[cursor] !== '[') return
    const extra = rawBracket()
    const gap = extra === undefined ? undefined : dimension(expandDefinition(extra).join(''))
    if (gap === undefined) throw new MathParseError('Invalid array row spacing')
    return gap
  }

  function multline(environment: string): string {
    if (environmentDepth) throw new MathParseError(`${environment} cannot be nested in another math environment`)
    const previousTag = tagState
    tagState = { suppressed: false }
    environmentDepth++
    const rows: MultlineRow[] = []
    const stops = ['&', '\\\\', '\\newline', '\\cr', '\\end']
    try {
      while (peek()) {
        const line = inScope((): MultlineRow => {
          const first = peek()
          if (first !== '\\shoveleft' && first !== '\\shoveright')
            return { content: row(stops, false, false, undefined, true) }
          take()
          const body = rawGroup(`Missing argument to ${first}`)
          const shoved = withTokens(body, () => inScope(() => row([boundary], false, false, undefined, true)))
          // Tags and other zero-width directives can follow the group.
          const tail = row(stops)
          return { content: joinMarkup([shoved, tail]), align: first === '\\shoveleft' ? 'left' : 'right' }
        })
        const separator = take()
        if (separator === '&') throw new MathParseError(`Too many columns in ${environment}`)
        if (separator === '\\end' && literalGroup() === environment) {
          if (!rows.length || renderMarkup(line.content, 0)) rows.push(line)
          return multlineTable(rows, nextTag(environment === 'multline'), options?.leqno === true, options?.fleqn === true, environment, tagState.raise)
        }
        if (separator !== '\\\\' && separator !== '\\newline' && separator !== '\\cr') break
        rows.push({ ...line, gap: arrayRowGap(separator) })
      }
      throw new MathParseError(`Unclosed math environment: ${environment}`)
    }
    finally {
      environmentDepth--
      tagState = previousTag
    }
  }

  function matrix(environment: string): Markup {
    const unclosed = () => new MathParseError(`Unclosed math environment: ${environment}`)
    const spreadEnvironment = /^(?:(?:flalign|xalignat)\*?|xxalignat)$/.test(environment)
    if (!display && (spreadEnvironment || /^(?:(?:equation|align(?:at)?|gather|multline)\*?|split|CD)$/.test(environment)))
      throw new MathParseError(`${environment} requires display math`)
    if (spreadEnvironment && (environmentDepth !== 0 || depth !== 1))
      throw new MathParseError(`${environment} requires a top-level display`)
    if (environment === 'CD') return commutativeDiagram()
    if (environment === 'multline' || environment === 'multline*') return multline(environment)
    if (/^equation[*]?$/.test(environment)) {
      environmentDepth++
      const content = row(['&', '\\end'], false, true)
      environmentDepth--
      if (peek() === '&') throw new MathParseError('Too many columns in equation')
      if (take() !== '\\end' || literalGroup() !== environment) throw unclosed()
      tagState.label = nextTag(display && environment === 'equation')
      return xml`<mrow>${content}</mrow>`
    }
    if (!spreadEnvironment && !/^(?:[pbBvV]?matrix[*]?|smallmatrix|d?rcases|d?cases|align(?:ed|edat|at[*]?|[*])?|gather(?:ed|[*])?|split|d?array|subarray)$/.test(environment))
      throw new MathParseError(`Unsupported math environment: ${environment}`)
    const subarray = environment === 'subarray'
    const smallMatrix = environment === 'smallmatrix'
    const columnArray = subarray || /^(?:d?array)$/.test(environment)
    const alignmentTokens = environment.endsWith('matrix*') ? rawBracket() : undefined
    const matrixAlignment = alignmentTokens && expandDefinition(alignmentTokens).join('').trim()
    if (matrixAlignment !== undefined && !/^[lcr]$/.test(matrixAlignment)) throw new MathParseError('Invalid matrix alignment')
    const columns = columnArray ? expandDefinition(rawGroup()).join('') : matrixAlignment ?? ''
    const paired = /^(?:align(?:ed)?|xx?align)at[*]?$/.test(environment)
    const pairCount = paired ? expandDefinition(rawGroup()).join('').replace(/\s/g, '') : ''
    const pairs = Number(pairCount)
    if (paired && (!/^\d+$/.test(pairCount) || !Number.isSafeInteger(pairs) || pairs < 1)) throw new MathParseError('Invalid alignment column count')
    const layout = arrayColumns(columns)
    if (subarray && !/^[lc]?$/.test(columns.trim())) throw new MathParseError('Invalid subarray alignment')
    const compact = subarray || smallMatrix
    const aligned = spreadEnvironment || environment.startsWith('align') || environment === 'split'
    const gathered = environment.startsWith('gather')
    const cases = environment.endsWith('cases')
    const ordinaryCellStyle = environment.startsWith('d') || aligned || gathered ? 0 : 1
    const stretch = !compact && !cases && macros.has('\\arraystretch')
      ? Number.parseFloat(expandDefinition(['\\arraystretch']).join('')) : 1
    if (!(stretch > 0 && stretch <= 100)) throw new MathParseError('Invalid array stretch')
    const outerTag = tagState
    const rowTags = spreadEnvironment || /^(?:align|alignat|gather)[*]?$/.test(environment)
    const allowIntertext = rowTags && display && environmentDepth === 0
    const tagless = environment === 'xxalignat'
    const automatic = allowIntertext && !tagless && !environment.endsWith('*')
    environmentDepth++
    // Embedded tables such as split and aligned share the enclosing
    // equation's tag. Only the top-level AMS row environments collect tags.
    if (rowTags) tagState = { suppressed: false }
    const rows: ArrayRow[] = []
    const intertexts = new Map<number, { spacing: string, content: Markup }[]>()
    function intertext(spacing: string): void {
      const rowTag = tagState
      tagState = { suppressed: false }
      try {
        const content = inScope(() => textArgument())
        const paragraphs = intertexts.get(rows.length) ?? []
        paragraphs.push({ spacing, content })
        intertexts.set(rows.length, paragraphs)
      }
      finally {
        tagState = rowTag
      }
    }
    let cells: Markup[] = []
    let rules: ArrayRule[] = []
    let closed = false
    const stops = ['&', '\\\\', '\\newline', '\\cr', '\\end']
    if (allowIntertext) stops.push(...intertextCommands.keys())
    while (peek()) {
      if (!cells.length) {
        while (peek() === '\\hline' || peek() === '\\hdashline')
          rules.push(take() === '\\hline' ? 'solid' : 'dashed')
        const spacing = allowIntertext && intertextCommands.get(peek())
        if (spacing) {
          take()
          intertext(spacing)
          continue
        }
        if (peek() === '\\end' && intertexts.has(rows.length)) {
          take()
          closed = literalGroup() === environment
          break
        }
      }
      const followsOrdinary = aligned && cells.length % 2 === 1
      cells.push(inScope(() => row(stops, false, false, undefined, followsOrdinary)))
      const separator = take()
      if (separator === '&') {
        if (subarray || gathered) throw new MathParseError('Too many columns in math stack')
        if (environment === 'split' && cells.length === 2) throw new MathParseError('Too many columns in split')
        if (columnArray && cells.length === layout.columns.length) strictViolation('textEnv', 'Too few columns in the array specification')
        continue
      }
      if (pairs && cells.length > pairs * 2) throw new MathParseError('Too many alignment columns')
      const spacing = allowIntertext && intertextCommands.get(separator)
      const lineBreak = Boolean(spacing) || separator === '\\\\' || separator === '\\newline' || separator === '\\cr'
      const gap = arrayRowGap(separator)
      if (tagless && tagState.label !== undefined) throw new MathParseError('Equation tags are not allowed in xxalignat')
      const label = rowTags ? nextTag(automatic) : undefined
      if (cells.length > 1 || cells[0] || label !== undefined || rows.length === 0 || lineBreak) {
        rows.push({ cells, label, before: rules, gap, raise: tagState.raise })
        rules = []
      }
      cells = []
      if (rowTags) tagState = { suppressed: false }
      if (spacing) intertext(spacing)
      if (separator === '\\end' && literalGroup() === environment) {
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
    const tags = rows.some(entry => entry.label !== undefined)
    const hasIntertext = intertexts.size > 0
    const leqno = state?.options.leqno === true
    const authoredColumns = Math.max(layout.columns.length, Number(hasIntertext), ...rows.map(entry => entry.cells.length))
    const columnCount = spreadEnvironment ? Math.max(pairs * 2, 2 * Math.ceil(authoredColumns / 2)) : authoredColumns
    // A single alignment pair has no intercolumn space to distribute.
    const spread = spreadEnvironment && columnCount > 2 ? environment.startsWith('xalignat') ? 'balanced' : 'full' : ''
    if (spread === 'full') fullWidthAlignment = true
    const displayRows = (tags || hasIntertext || spread) && rowTags && display && depth === 1
    const grid = aligned || alignment.length > 0 || displayRows
    const rowRules = rows.reduce((count, entry) => count + entry.before.length, rules.length)
    const columnRules = layout.columns.reduce((count, column) => count + column.before.length, layout.after.length)
    const rectangular = grid || columnArray || tags || rowRules > 0
    if (rectangular && columnCount * Math.max(1, rows.length) > 6000) throw new MathParseError('Math array has too many cells')
    if (rowRules * columnCount + columnRules * rows.length > 24000)
      throw new MathParseError('Math array has too many rules')
    const alignmentAt = (index: number) => aligned ? (index % 2 ? 'left' : 'right') : alignment[index] ?? alignment.at(-1) ?? (cases ? 'left' : '')
    const columnAlignment = Array.from({ length: columnCount }, (_, index) => alignmentAt(index) || 'center')
    if (tags) {
      if (leqno) columnAlignment.unshift('left')
      else columnAlignment.push('right')
    }
    const align = aligned || cases || alignment.length || tags ? ` columnalign="${columnAlignment.join(' ')}"` : ''
    const moreRowSpace = aligned || gathered || cases
    const pad = compact ? '0.06' : ((moreRowSpace ? 0.125 : 0.14) * stretch).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
    const lines = compact ? '' : ' data-equation-lines'
    const classes = [compact && 'math-compact-array', grid && 'math-alignment-grid', displayRows && 'math-display-grid'].filter(Boolean).join(' ')
    const layoutClass = classes ? ` class="${classes}"` : ''
    const amsAlignment = (aligned || environment.startsWith('gather')) ? ` data-equation-environment="${environment}"` : ''
    const rowSpacing = amsAlignment && (hasIntertext || stretch !== 1 || rows.some(row => row.gap !== undefined)) ? ' data-equation-row-spacing' : ''
    const tagPlacement = tags ? ` data-equation-tags="${leqno ? 'left' : 'right'}"` : ''
    const spreadLayout = spread ? ` data-equation-spread="${spread}"` : ''
    const gridTracks = spread ? `--math-pair-gaps:${columnCount / 2 - 1}` : `--math-columns:${columnCount}`
    const gridLayout = displayRows
      ? ` style="${gridTracks}"${tagPlacement}${spreadLayout}${options?.fleqn && spread !== 'full' ? ' data-equation-flush' : ''}`
      : grid ? ` style="--math-columns:${columnAlignment.length}"` : ''
    return (style) => {
      const cellStyle = compact ? 2 : ordinaryCellStyle
      const prose = (index: number) => intertexts.get(index)?.map(({ content, spacing }) =>
        `<mtr data-equation-intertext="${spacing}"><mtd columnspan="${columnCount + Number(tags)}"><mrow><mrow>${renderMarkup(content, 1)}</mrow></mrow></mtd></mtr>`).join('') ?? ''
      const markup = rows.map((entry, rowIndex) => {
        const cell = tags ? equationNumberCell(entry.label, undefined, entry.raise) : ''
        // MathML Core browsers use CSS for cell alignment and visible rules.
        const content = Array.from({ length: rectangular ? columnCount : entry.cells.length }, (_, index) => {
          const align = alignmentAt(index)
          const styling: string[] = []
          if (align) styling.push(`text-align:${align}`)
          if (grid && align !== 'left')
            styling.push(`--math-cell-align:${align === 'right' ? 'end' : 'center'}`)
          if (aligned || cases || displayRows) {
            styling.push('padding-inline:0')
            if (spread) styling.push(`grid-column:${index + 2 + Math.floor(index / 2)}`)
            else if ((aligned && !paired && index > 0 && index % 2 === 0) || (cases && index > 0))
              styling.push('padding-inline-start:1em')
          }
          if (compact) {
            styling.push('padding-inline:0')
            if (smallMatrix && index > 0) styling.push('padding-inline-start:0.2778em')
          }
          if (cellStyle === 0) styling.push('math-style:normal')
          if (rowRules || columnRules) {
            styling.push(...arrayRuleStyles([
              ['left', layout.columns[index]?.before],
              ['right', index === columnCount - 1 ? layout.after : undefined],
              ['top', entry.before],
              ['bottom', rowIndex === rows.length - 1 ? rules : undefined],
            ], minRule))
          }
          if (compact || stretch !== 1 || moreRowSpace) styling.push(`padding-block:${pad}em`)
          if (entry.gap) styling.push(`padding-bottom:max(0px,calc(${pad}em + ${entry.gap}))`)
          const settings = styling.length ? ` style="${styling.join(';')}"` : ''
          const value = renderMarkup(entry.cells[index] ?? '', cellStyle)
          const sized = compact || style === cellStyle ? value : mathSize(cellStyle, value)
          return `<mtd${settings}>${grid ? `<mrow>${sized}</mrow>` : sized}</mtd>`
        }).join('')
        return `${prose(rowIndex)}<mtr>${leqno ? cell : ''}${content}${leqno ? '' : cell}</mtr>`
      }).join('') + prose(rows.length)
      const matrix = `<mtable${lines} data-math-array${align}${layoutClass}${gridLayout}${amsAlignment}${rowSpacing}>${markup}</mtable>`
      const table = compact ? mathSize(cellStyle, matrix) : matrix
      if (displayRows) return table
      // Center the whole grid on the math axis beside surrounding inline atoms.
      const centered = grid && style !== 0
        ? `<mtable class="math-alignment-axis"><mtr><mtd>${table}</mtd></mtr></mtable>`
        : table
      const caseBrace = cases ? ` data-math-cases="${left ? 'left' : 'right'}"` : ''
      return `<mrow${caseBrace}>${fence(left)}${centered}${fence(right)}</mrow>`
    }
  }

  function explicitCharacter(): string {
    const parts = expandDefinition(rawGroup())
    const value = (mode === 'math' ? parts.filter(token => !texWhitespace.test(token)) : parts).join('')
    const code = /^\d+$/.test(value) ? Number(value) : NaN
    if (!Number.isInteger(code) || code < 0x20 || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF))
      throw new MathParseError('Invalid math character code')
    return String.fromCodePoint(code)
  }

  function declareMacro(token: string): boolean {
    if (!macroDeclaration.test(token)) return false
    let global = false
    const prefixed = token === '\\global' || token === '\\long'
    while (token === '\\global' || token === '\\long') {
      global ||= token === '\\global'
      token = take()
    }
    if (prefixed && !assignmentCommand.test(token))
      throw new MathParseError('Invalid token after math macro prefix')
    const name = token.slice(1)
    function definitionTarget(grouped = false): string {
      space()
      const target = grouped ? literalGroup().trim() : tokenText(tokens[cursor++] ?? '')
      if (!target || (!controlSequence.test(target) && !activeCharacter.test(target)))
        throw new MathParseError(`Invalid macro name in ${token}`)
      return target
    }
    if (['def', 'gdef', 'edef', 'xdef'].includes(name)) {
      const command = definitionTarget()
      space()
      const prefix: string[] = []
      const parameters: string[][] = []
      let sequence = prefix
      let openDelimiter = false
      while (tokenText(tokens[cursor] ?? '') !== '{') {
        const token = tokenText(tokens[cursor++] ?? '')
        if (!token || token === boundary || token === '}' || sequence.length > 80) throw new MathParseError('Invalid macro parameter')
        if (token === '#') {
          if (tokenText(tokens[cursor] ?? '') !== '{') throw new MathParseError('Invalid macro parameter')
          sequence.push('{')
          openDelimiter = true
          break
        }
        if (/^#[1-9]$/.test(token)) {
          if (Number(token[1]) !== parameters.length + 1) throw new MathParseError('Macro parameters must be sequential')
          sequence = []
          parameters.push(sequence)
        }
        else sequence.push(token)
      }
      const body = rawGroup()
      const replacement = name === 'edef' || name === 'xdef' ? expandDefinition(body, 'definition') : body
      if (openDelimiter) replacement.push('{')
      assign(command, { body: replacement, parameters, prefix }, global || name === 'gdef' || name === 'xdef')
      return true
    }
    if (name === 'let' || name === 'futurelet') {
      const target = definitionTarget()
      let value: string
      if (name === 'futurelet') {
        if (controlWord.test(target)) space()
        const middle = tokens[cursor]
        let following = cursor + 1
        if (controlWord.test(middle ?? '')) {
          while (texWhitespace.test(tokens[following] ?? '')) following++
        }
        value = tokens[following]
        if (!middle || middle === boundary || !value || value === boundary)
          throw new MathParseError('Missing math lookahead token')
      }
      else {
        space()
        if (tokens[cursor] === '=') {
          cursor++
          if (texWhitespace.test(tokens[cursor] ?? '')) cursor++
        }
        value = tokens[cursor++]
        if (!value || value === boundary) throw new MathParseError('Missing math assignment token')
      }
      const existing = macroFor(value)
      const command = value.startsWith('\\')
      const literal = command || activeCharacter.test(value) ? literalToken + value : value
      const snapshot = { ...plainMacro([literal]), unexpandable: !command || !defined(value) }
      assign(target, existing ?? (isExpansionPrimitive(value) ? { primitive: value } : snapshot), global)
      return true
    }
    if (name === 'newcommand' || name === 'renewcommand' || name === 'providecommand') {
      const command = definitionTarget(true)
      const exists = defined(command)
      if (name === 'newcommand' && exists) throw new MathParseError(`Macro ${command} is already defined. Use \\renewcommand`)
      if (name === 'renewcommand' && !exists) throw new MathParseError(`Macro ${command} is undefined. Use \\newcommand`)
      const rawCount = rawBracket()
      const count = rawCount && expandDefinition(rawCount).join('').trim()
      const arity = Number(count ?? 0)
      if (count !== undefined && (!/^\d+$/.test(count) || arity > 6000)) throw new MathParseError('Invalid macro argument count')
      const optional = arity ? rawBracket() : undefined
      const body = rawGroup()
      if (name !== 'providecommand' || !exists) assign(command, plainMacro(body, arity, optional), global)
      return true
    }
    return false
  }

  function atom(token: string): Atom {
    if (token === '{') {
      const content = inScope(() => row(['}']))
      if (take() !== '}') throw new MathParseError('Unclosed math group')
      return { markup: xml`<mrow>${content}</mrow>` }
    }
    if (!token.startsWith('\\')) {
      if (/^(?:[}&#$]|#[1-9])$/.test(token)) throw new MathParseError(`Unexpected math token: ${token}`)
      if (token === '~') return { markup: spaceMarkup(spacing.nobreakspace) }
      if (token === '®') {
        strictViolation('mathVsTextAccents', 'The registered sign is a text-mode symbol')
        return { markup: '<mi mathvariant="normal">®</mi>' }
      }
      const unicode = checkUnicode(token)
      if (unicode?.marks) {
        const base = unicode.base === 'i' ? 'ı' : unicode.base === 'j' ? 'ȷ' : unicode.base
        const element = unicode.textFallback ? 'mtext' : /^\p{Nd}$/u.test(base) ? 'mn' : /^\p{L}$/u.test(base) ? 'mi' : 'mo'
        let markup = tag(element, base)
        for (const mark of unicode.marks) {
          const [glyph, below] = unicodeAccents[mark]
          const name = below ? 'munder' : 'mover'
          markup = `<${name} ${below ? 'accentunder' : 'accent'}="true">${markup}${tag('mo', glyph)}</${name}>`
        }
        return { markup }
      }
      const relation = unicodeColonRelation(token)
      if (relation) return supplementalAtom(relation)
      if (token !== '.' && delimiterGlyphs.has(token)) return { markup: fence(token, false) }
      const limits = largeOperatorGlyphs.has(token) ? true : integralGlyphs.has(token) ? false : undefined
      const fallback = unicode?.textFallback && limits === undefined && !isCenteredGlyph(token)
      const element = fallback ? 'mtext' : /^\p{Nd}+$/u.test(token) ? 'mn' : /^\p{L}$/u.test(token) ? 'mi' : 'mo'
      return { markup: tag(element, token === '-' ? '−' : token), limits }
    }

    const verbatim = verbatimMarkup(token)
    if (verbatim !== undefined) return { markup: verbatim }

    if (declareMacro(token) || equationDirective(token)) return { markup: '' }
    if (token === '\\ref' || token === '\\eqref') return { markup: equationReference(token) }
    const name = token.slice(1)
    if (intertextCommands.has(token)) throw new MathParseError(`${token} requires a top-level align, alignat, or gather display (including full-width alignments)`)
    if (name === 'begingroup') {
      let parts: RowPart[] | undefined
      const content = inScope(() => row(['\\endgroup'], false, false, value => { parts = value }))
      if (take() !== '\\endgroup') throw new MathParseError('Unclosed math group')
      const inner = parts
      return { markup: xml`<mrow>${content}</mrow>`, fragment: inner && (() => inner) }
    }
    if (name === 'ce') return { markup: chemicalFormula(literalGroup(), chemistryMath) }
    if (name === 'pu') return { markup: physicalUnits(literalGroup()) }
    if (isMathAttributeCommand(token) || isMathUrlCommand(token)) return { markup: htmlCommand(token) }
    if (Object.hasOwn(mathClasses, name)) return classifiedAtom(mathClasses[name], argument())
    if (name === '@binrel') {
      const { mathClass } = binRelArgument()
      return classifiedAtom(mathClass, argument())
    }
    if (name === 'mathchoice') {
      const choices = Array.from({ length: 4 }, () => fragmentArgument('Missing math choice'))
      return {
        markup: style => renderMarkup(choices[style].markup, style),
        fragment: style => choices[style].parts,
      }
    }
    if (name === 'cancel' || name === 'bcancel' || name === 'xcancel') {
      return { markup: xml`<mrow class="math-${name}">${argument()}${cancelTrack}</mrow>` }
    }
    if (name === 'sout') {
      const content = argument()
      strictViolation('mathVsSout', 'LaTeX strikeout works only in text mode')
      return { markup: xml`<mrow class="math-sout">${content}</mrow>` }
    }
    if (name === 'pmb') {
      const { mathClass, markup } = binRelArgument()
      return { mathClass, markup: xml`<mrow class="math-pmb">${markup}</mrow>` }
    }
    if (name === 'phase') return { markup: xml`<mrow class="math-phase">${argument()}</mrow>` }
    if (name === 'angl') return { markup: xml`<mrow class="math-angl">${textArgument('hbox')}</mrow>` }
    if (name === 'textcolor' || (name === 'color' && options?.colorIsTextColor)) return { markup: coloredArgument(false) }
    if (textBoxes.has(name)) return { markup: textBox(name) }
    if (name === 'mathreflectbox') return { markup: xml`<mrow class="math-reflect">${argument()}</mrow>` }
    if (name === 'vcenter') {
      return { markup: xml`<mtable class="math-vcenter"><mtr><mtd>${argument()}</mtd></mtr></mtable>` }
    }
    const lap = /^(math)?([lcr])lap$/.exec(name)
    if (lap) return { markup: overlap(lap[2], lap[1] ? argument() : textArgument()) }
    if (name === 'left') return { markup: pairedDelimiters() }
    if (name === 'right') throw new MathParseError('Unexpected \\right')
    if (name === 'middle') {
      if (!delimiterDepth) throw new MathParseError('\\middle requires \\left and \\right')
      const glyph = readDelimiter(name)
      const markup = glyph === '.' ? spaceMarkup(nullDelimiterWidth)
        : `<mo stretchy="true" symmetric="true" form="infix" fence="true" lspace="0.05em" rspace="0.05em">${escapeHtml(glyph)}</mo>`
      return { markup, mathClass: 'middle' }
    }
    const sized = /^(bigg|Bigg|big|Big)([lrm]?)$/.exec(name)
    if (sized) return { markup: sizedFence(readDelimiter(name), sizedDelimiters[sized[1]], sized[2]) }
    if (name === 'begin') return { markup: inScope(() => matrix(literalGroup())) }
    if (name === 'end' || name === 'endgroup') throw new MathParseError(`Unexpected math token: ${token}`)
    if (['frac', 'dfrac', 'tfrac', 'binom', 'dbinom', 'tbinom'].includes(name)) {
      const binomial = name.endsWith('binom')
      const forced = name.startsWith('d') ? 0 : name.startsWith('t') ? 1 : undefined
      return { markup: fraction({ forced, thickness: binomial ? '0' : undefined, fences: binomial ? [fence('('), fence(')')] : undefined }) }
    }
    if (name === 'genfrac') {
      const fences = [fractionDelimiter('open'), fractionDelimiter('close')] as const
      const bar = readDimension('')
      const mode = expandDefinition(rawGroup()).join('').trim()
      if (mode && !/^[0-3]$/.test(mode)) throw new MathParseError('Invalid fraction style')
      const thickness = bar ? (Number.parseFloat(bar) > 0 ? bar : '0') : undefined
      return { markup: fraction({ forced: mode ? Number(mode) as MathStyle : undefined, thickness, fences }) }
    }
    if (name === 'cfrac') {
      const align = bracket()
      return { markup: fraction({ forced: 0, continued: true, align: align === 'l' ? 'left' : align === 'r' ? 'right' : undefined }) }
    }
    if (name === 'phantom') {
      const { markup, parts } = fragmentArgument()
      return {
        markup: xml`<mphantom>${markup}</mphantom>`,
        fragment: style => expandRow(parts, style).map(part => {
          const mathClass = rowClass(part)
          if (!mathClass) return part
          return { ...part, mathClass, markup: xml`<mphantom>${part.markup}</mphantom>` }
        }),
      }
    }
    if (name === 'hphantom') {
      const { markup, parts } = fragmentArgument()
      return { markup: horizontalPhantom(markup, parts, 'math'), mathClass: 'ord' }
    }
    if (verticalBoxCommands.has(name)) return { markup: verticalBox(name, argument) }
    if (spacingCommands.has(name)) return { markup: spacingMarkup(name) }
    if (name === 'prescript') {
      const upper = inScript(argument())
      const lower = inScript(argument())
      return { markup: xml`<mmultiscripts>${argument()}<mprescripts/>${lower}${upper}</mmultiscripts>` }
    }
    if (name === 'sideset') return sidedOperator()
    if (name === 'sqrt') {
      const index = rawBracket()
      if (index === undefined) return { markup: xml`<msqrt>${argument(true)}</msqrt>` }
      const degree = withTokens(index, () => renderMarkup(inScope(() => row([boundary])), 3))
      return { markup: xml`<mroot>${argument()}<mrow>${degree}</mrow></mroot>` }
    }
    if (Object.hasOwn(textFonts, name)) return { markup: textArgument(name) }
    if (typesettingNames.has(name)) return { markup: typesettingName(name) }
    if (name === 'operatorname' || name === 'operatorname@' || name === 'operatornamewithlimits') {
      const star = name === 'operatorname' && peek() === '*'
      if (star) take()
      const limits = name === 'operatornamewithlimits' || star
      return { markup: operatorLabel(argument()), mathClass: 'op', limits, ignoreLimitControl: !limits }
    }
    if (name === '@char') {
      const glyph = explicitCharacter()
      return { markup: tag(/^\p{L}$/u.test(glyph) ? 'mi' : /^\d$/.test(glyph) ? 'mn' : 'mtext', glyph) }
    }
    if (name === 'aa' || name === 'AA') {
      strictViolation('mathVsTextAccents', 'The ring accent works only in text mode', true, token)
      return { markup: tag('mi', textSymbols[token]) }
    }
    if (name === 'mathstrut') {
      return { markup: '<mpadded width="0"><mphantom><mo stretchy="false">(</mo></mphantom></mpadded>' }
    }
    if (name === 'mod' || name === 'bmod' || name === 'pmod' || name === 'pod') return { markup: modulus(name) }
    if (name === 'not') {
      const { markup, mathClass } = argumentAtom()
      return { mathClass, markup: typeof markup === 'string' ? negatedMarkup(markup) : style => negatedMarkup(markup(style)) }
    }
    if (Object.hasOwn(namedLimits, name)) return { markup: tag('mo', namedLimits[name]), limits: true }
    if (Object.hasOwn(accentedLimits, name)) {
      return { markup: `<mo class="${accentedLimits[name]}">lim</mo>`, limits: true }
    }
    if (name === 'varinjlim' || name === 'varprojlim') {
      const mark = name === 'varinjlim' ? '→' : '←'
      return { markup: `<munder accentunder="true"><mo>lim</mo><mo stretchy="true">${mark}</mo></munder>`, limits: true }
    }
    if (name === 'underbar') return { markup: xml`<mrow class="math-underline">${textArgument()}</mrow>` }
    if (name === 'textcircled' || Object.hasOwn(textAccents, token)) {
      const accented = textAccent(token)
      strictViolation('mathVsTextAccents', `LaTeX accent ${token} works only in text mode`, true, token)
      return { markup: 'literal' in accented ? tag('mtext', accented.literal) : accented.markup }
    }
    if (name === 'overline' || name === 'underline') {
      return { markup: xml`<mrow class="math-${name}">${argument()}</mrow>` }
    }
    if (name === 'overset' || name === 'underset' || name === 'overunderset' || name === 'stackrel') {
      const annotation = inScript(argument())
      const both = name === 'overunderset'
      const below = both ? inScript(argument()) : ''
      const element = both ? 'munderover' : name === 'underset' ? 'munder' : 'mover'
      const base = binRelArgument()
      const content = base.operator ? stackOperator(base.markup) : base.markup
      return { mathClass: name === 'stackrel' ? 'rel' : base.mathClass, markup: xml`<${element}>${content}${below}${annotation}</${element}>` }
    }
    if (ruledAccents.has(name)) {
      const brace = name.endsWith('bracket') ? (name.startsWith('over') ? 'upper' : 'lower') : undefined
      return { brace, markup: xml`<mrow class="math-${name}">${argument()}</mrow>` }
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
        if (take() !== ']') throw new MathParseError('Unclosed arrow subscript')
      }
      const above = inScript(argument())
      const bias = name === 'xleftequilibrium' ? 'left' : name === 'xrightequilibrium' ? 'right' : undefined
      return { markup: stackMathArrow(mathArrowBody(extensibleArrows[name], texArrowMinWidth, bias), above, below) }
    }
    if (name === 'relax' || name === 'allowbreak' || name === 'nobreak') return { markup: '' }
    if (name === 'plim') return { markup: tag('mo', 'plim'), limits: true, forceLimits: true }
    if (Object.hasOwn(variants, name)) {
      const variant = variants[name]
      const { mathClass, markup: content } = withMathFont(true, () => name === 'boldsymbol' || name === 'bm'
        ? binRelArgument()
        : { markup: argument(), mathClass: undefined })
      return { mathClass, markup: fontMarkup(content, variant) }
    }
    if (Object.hasOwn(accents, name)) return { markup: xml`<mover accent="true">${argument()}${tag('mo', accents[name])}</mover>` }
    const letter = greekLetter(name)
    if (letter) return { markup: `<mi${letter[1] ? ' mathvariant="normal"' : ''}>${letter[0]}</mi>` }
    if (name === 'smallint') return { markup: '<mo largeop="false">∫</mo>', limits: true }
    if (Object.hasOwn(operators, name)) {
      return { markup: tag('mo', operators[name]), limits: big.has(name) ? true : integrals.has(name) ? false : undefined }
    }
    if (functions.has(name)) return { markup: tag('mo', name), limits: big.has(name) }
    if (Object.hasOwn(delimiters, token)) return { markup: fence(token, false) }
    if (Object.hasOwn(spacing, name)) return { markup: spaceMarkup(spacing[name]) }
    if (/^[%$#&_{}|]$/.test(name)) return { markup: tag('mo', name) }
    const symbol = mathSymbol(name)
    if (symbol) return supplementalAtom(symbol)
    return { markup: unsupportedCommand(token) }
  }

  try {
    if (trailingComment) strictViolation('commentAtEnd', 'A TeX comment at the end of the formula needs a terminating newline')
    const expression = `<mrow>${renderMarkup(row([], false, true), display ? 0 : 1)}</mrow>`
    const flush = display && !fullWidthAlignment && state?.options.fleqn === true
    const label = nextTag(false)
    const markup = label === undefined ? expression : taggedDisplay(expression, label, state?.options.leqno === true, flush, tagState.raise)
    const layoutStyle = flush ? 'display:block;padding-inline-start:2em;text-align:start'
      : label === undefined ? '' : 'display:block;text-align:center'
    const styles = [layoutStyle, minRule ? `--math-min-rule:${minRule}em` : ''].filter(Boolean).join(';')
    const layout = styles ? ` style="${styles}"` : ''
    const content = `<math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ''}${layout}><semantics>${markup}<annotation encoding="application/x-tex">${escapeHtml(source)}</annotation></semantics></math>`
    return localReferences ? localReferences.resolve(localReferences.numberSlide(content, 1)) : content
  }
  catch (error) {
    if (!(error instanceof MathParseError)) throw error
    return parseFailure(error)
  }
}
