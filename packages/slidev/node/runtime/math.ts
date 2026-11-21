import { escapeHtml, unescapeHtml } from './html.ts'
import { applyEquationTagForm, createEquationReferences, equationTagValue } from './equation-references.ts'
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
const expansionPrimitives = ['\\expandafter', '\\noexpand', '\\@firstoftwo', '\\@secondoftwo', '\\@ifnextchar', '\\@ifstar', '\\TextOrMath', '\\html@mathml', '\\message', '\\errmessage', '\\char', '\\MoveEqLeft'] as const
const expansionPrimitiveNames = new Set<string>(expansionPrimitives)
const macroDeclaration = /^\\(?:[gex]?def|(?:future)?let|(?:new|renew|provide)command|DeclarePairedDelimiter(?:X(?:PP)?)?|Declare(?:Left|Right)Delimiter|MakeAboxedCommand|mathtoolsset|empheqset|EmphEqdelimiter(?:factor|shortfall)|(?:new|renew|use)tagform|setlength|global|long)$/
const tagFormDeclaration = /^\\(?:new|renew|use)tagform$/
const tagValueToken = '\u0000equation-tag-value'
const assignmentCommand = /^\\(?:[gex]?def|(?:future)?let)$/
type ExpansionPrimitive = typeof expansionPrimitives[number]
type ConditionalPrimitive = Exclude<ExpansionPrimitive, '\\expandafter' | '\\noexpand' | '\\message' | '\\errmessage' | '\\char' | '\\MoveEqLeft'>
interface TokenMacro { body: string[], parameters: string[][], prefix: string[], optional?: string[], unexpandable?: boolean, source?: string }
type DelimitedNotation = 'Braket' | 'Set' | 'set'
type DotsMacro = 'dots' | 'dotsc' | 'dotso' | 'cdots'
interface PairedDelimiter {
  opening: string[]
  closing: string[]
  template?: { arity: number, before: string[], body: string[], after: string[] }
}
type NativeMacro = { primitive: ExpansionPrimitive } | { notation: DelimitedNotation } | { separator: () => string[] } | { dots: DotsMacro } | { pairedDelimiter: PairedDelimiter }
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
for (const [name, script] of [['\\sb', '_'], ['\\sp', '^']])
  builtinMacros.set(name, { body: [script], parameters: [], prefix: [] })
builtinMacros.set('\\substack', { body: tokenize('\\begin{subarray}{c}#1\\end{subarray}'), parameters: [[]], prefix: [] })
builtinMacros.set('\\crampedsubstack', { body: tokenize('\\begin{crampedsubarray}{c}#1\\end{crampedsubarray}'), parameters: [[]], prefix: [] })
builtinMacros.set('\\ensuremath', { body: tokenize('\\TextOrMath{\\(#1\\)}{#1}'), parameters: [[]], prefix: [] })
builtinMacros.set('\\vdotswithin', { body: tokenize('{\\mathmakebox[\\widthof{\\ensuremath{{}#1{}}}][c]{\\vdots}}'), parameters: [[]], prefix: [] })
builtinMacros.set('\\shortvdotswithin', { body: tokenize('\\@ifstar\\@shortvdotsleft\\@shortvdotsright'), parameters: [], prefix: [] })
builtinMacros.set('\\@shortvdotsleft', { body: tokenize('\\MTFlushSpaceAbove\\vdotswithin{#1}&\\MTFlushSpaceBelow'), parameters: [[]], prefix: [] })
builtinMacros.set('\\@shortvdotsright', { body: tokenize('\\MTFlushSpaceAbove&\\vdotswithin{#1}\\MTFlushSpaceBelow'), parameters: [[]], prefix: [] })
builtinMacros.set('\\splitfrac', { body: tokenize('\\@splitfrac{1}{\\textstyle#1\\quad}{\\textstyle\\quad\\mathstrut#2}'), parameters: [[], []], prefix: [] })
builtinMacros.set('\\splitdfrac', { body: tokenize('\\@splitfrac{0}{#1\\quad}{\\quad\\mathstrut#2}'), parameters: [[], []], prefix: [] })
// LaTeX's spacing macro follows KaTeX's expansion, including the starred zero-width rule.
builtinMacros.set('\\hspace', { body: tokenize('\\@ifstar\\@hspacer\\@hspace'), parameters: [], prefix: [] })
builtinMacros.set('\\@hspace', { body: tokenize('\\hskip #1\\relax'), parameters: [[]], prefix: [] })
builtinMacros.set('\\@hspacer', { body: tokenize('\\rule{0pt}{0pt}\\hskip #1\\relax'), parameters: [[]], prefix: [] })
builtinMacros.set('\\DeclareMathOperator', { body: tokenize('\\@ifstar\\@declareoperatorstar\\@declareoperator'), parameters: [], prefix: [] })
builtinMacros.set('\\@declareoperator', { body: tokenize('\\newcommand{#1}{\\operatorname{#2}}'), parameters: [[], []], prefix: [] })
builtinMacros.set('\\@declareoperatorstar', { body: tokenize('\\newcommand{#1}{\\operatorname*{#2}}'), parameters: [[], []], prefix: [] })
const emphasisDelimiter = '\\@empheqDelimiter'
function emphasisDelimiters(target: string, left: boolean, affix: string[] = []): [string, TokenMacro][] {
  return ['', 'big'].map(size => {
    const fence = [emphasisDelimiter, size ? '1' : '0', '{', target, '}']
    const body = left ? [...fence, ...affix] : [...affix, ...fence]
    return [`\\empheq${size}${target.slice(1)}`, plainMacro(body)]
  })
}
for (const symbol of ['brace', 'brack', 'angle', 'vert', 'Vert', 'floor', 'ceil', 'paren']) {
  for (const [name, macro] of [...emphasisDelimiters(`\\l${symbol}`, true), ...emphasisDelimiters(`\\r${symbol}`, false)])
    builtinMacros.set(name, macro)
}
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
const graphicsNumber = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/
const textBoxes = new Set(['colorbox', 'fcolorbox', 'fbox', 'reflectbox', 'scalebox', 'resizebox', 'rotatebox'])
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
interface DottedArrayCell { span: number, spacing: number }
type ArrayCell = Markup | DottedArrayCell
interface AlignmentFrame { span: 1 | 2, style: string[] }
interface ArrayRow { cells: ArrayCell[], columns: number, label?: Markup, before: ArrayRule[], gap?: string, raise?: string, arrow?: 'left' | 'right', flushAbove?: boolean, flushBelow?: boolean, frames?: Map<number, AlignmentFrame> }
interface MathLine { content: Markup, gap?: string }
interface MultlineRow extends MathLine { align?: 'left' | 'right', inset?: string }
type MultlinedPosition = 't' | 'c' | 'b'
interface EquationTag { label?: Markup, key?: string, starred?: boolean, suppressed: boolean, raise?: string, finalized?: boolean, bareMarkup?: string }
interface TagForm { left: string[], right: string[], inner: string[] }

function equationNumberCell(label: Markup | undefined, position?: 'start' | 'end', raise?: string, padding: readonly string[] = []): string {
  const styles = [
    position && `display:math;padding:0;justify-self:${position}`,
    label !== undefined && raise && `--math-tag-raise:${raise}`,
    ...padding,
  ].filter(Boolean).join(';')
  return `<mtd class="math-equation-number"${styles ? ` style="${styles}"` : ''}>${renderMarkup(label ?? '', 1)}</mtd>`
}

function taggedDisplay(expression: string, label: Markup, left: boolean, flush: boolean, raise?: string, emphasized = false): string {
  const number = equationNumberCell(label, left ? 'start' : 'end', raise)
  const spacer = flush ? '' : '<mtd aria-hidden="true" style="display:block;padding:0"></mtd>'
  const body = `<mtd data-equation-body${emphasized ? ' data-empheq-start data-empheq-end' : ''} style="display:math;math-style:normal;padding:0;justify-self:start">${expression}</mtd>`
  // Equal gutters center the formula. The tag's intrinsic width can expand
  // its gutter when space is tight, avoiding an overlap with the formula.
  const columns = flush
    ? left ? 'max-content minmax(max-content,1fr)' : 'minmax(max-content,1fr) max-content'
    : 'minmax(max-content,1fr) max-content minmax(max-content,1fr)'
  return `<mtable class="math-tagged-display" data-equation-tags="${left ? 'left' : 'right'}"${flush ? ' data-equation-flush' : ''} style="display:block;width:100%"><mtr style="display:grid;grid-template-columns:${columns};align-items:center;column-gap:0.5em">${left ? number : spacer}${body}${left ? spacer : number}</mtr></mtable>`
}

function equationRowGap(base?: string, extra?: string): string | undefined {
  return base && extra ? `calc(${base} + ${extra})` : base ?? extra
}

function equationRowMargins(before?: string, after?: string): string {
  if (!before && !after) return ''
  const styles = [before && `margin-block-start:${before}`, after && `margin-block-end:${after}`].filter(Boolean)
  return ` style="${styles.join(';')}"`
}

function multlineTable(rows: readonly MultlineRow[], label: Markup | undefined, left: boolean, flush: boolean, environment: string, raise?: string, jot?: string, emphasized = false): string {
  const tagRow = left ? 0 : rows.length - 1
  const markup = rows.map(({ content, gap, align }, index) => {
    const first = index === 0
    const last = index === rows.length - 1
    const placement = align ?? (last && !first ? 'right' : flush || (first && !last) ? 'left' : 'center')
    const number = label === undefined ? '' : equationNumberCell(index === tagRow ? label : undefined, undefined, raise)
    const rowSpacing = jot === undefined && gap ? `;padding-bottom:max(0px,calc(0.125em + ${gap}))` : ''
    const body = `<mtd${emphasized ? ' data-empheq-start data-empheq-end' : ''} style="math-style:normal;padding-block:${jot === undefined ? '0.125em' : '0em'}${rowSpacing}"><mrow>${renderMarkup(content, 0)}</mrow></mtd>`
    const margin = jot === undefined ? undefined : equationRowGap(last || rows.length === 1 ? undefined : jot, gap)
    return `<mtr data-multline-align="${placement}"${margin ? ` style="margin-block-end:${margin}"` : ''}>${left ? number : ''}${body}${left ? '' : number}</mtr>`
  }).join('')
  const tags = label === undefined ? '' : ` data-equation-tags="${left ? 'left' : 'right'}"`
  // Office Math uses one alignment for an array. Measure each row's position
  // separately, as with AMS displays that have explicit row gaps.
  return `<mtable class="math-multline" data-equation-lines data-math-array data-equation-environment="${environment}" data-equation-row-spacing${tags}${flush ? ' data-equation-flush' : ''}>${markup}</mtable>`
}

function multlinedTable(rows: readonly MultlineRow[], position: MultlinedPosition, width?: string, jot?: string): string {
  const markup = rows.map(({ content, gap, align, inset }, index) => {
    const first = index === 0 && rows.length > 1
    const last = index > 0 && index === rows.length - 1
    const placement = align ?? (first ? 'left' : last ? 'right' : 'center')
    const spacing = jot !== undefined ? ' style="padding-block:0em"'
      : gap ? ` style="padding-bottom:max(0px,calc(0.125em + ${gap}))"` : ''
    const before = (last ? spaceMarkup('1em') : '') + (inset && align === 'left' ? spaceMarkup(inset) : '')
    const after = (inset && align === 'right' ? spaceMarkup(inset) : '') + (first ? spaceMarkup('1em') : '')
    const strut = '<mspace width="0" height="0.7em" depth="0.3em"/>'
    const margin = jot === undefined ? undefined : equationRowGap(index < rows.length - 1 ? jot : undefined, gap)
    return `<mtr data-multline-align="${placement}"${margin ? ` style="margin-block-end:${margin}"` : ''}><mtd${spacing}><mrow>${before}${renderMarkup(content, 0)}${after}${strut}</mrow></mtd></mtr>`
  }).join('')
  const size = width ? ` style="min-inline-size:${width}"` : ''
  const alignment = position === 't' ? 'baseline 1' : position === 'b' ? 'baseline -1' : 'axis'
  const table = `<mtable class="math-multlined" align="${alignment}" data-multlined-position="${position}"${size}>${markup}</mtable>`
  if (position === 'b') return `<mrow class="math-multlined-bottom">${table}</mrow>`
  if (position === 'c') return `<mtable class="math-alignment-axis"><mtr><mtd>${table}</mtd></mtr></mtable>`
  return table
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
const groupedArgumentFunctions = new Set(['sqrt', 'left', 'mathllap', 'mathclap', 'mathrlap',
  'cramped', 'crampedllap', 'crampedclap', 'crampedrlap', 'mathmbox', 'mathmakebox', 'angl'])
type IntertextKind = 'normal' | 'short'
const intertextCommands: ReadonlyMap<string, IntertextKind> = new Map([
  ['\\intertext', 'normal'],
  ['\\shortintertext', 'short'],
])
const mathtoolsBooleanOptions = new Set([
  'original-intertext', 'original-shortintertext', 'showonlyrefs', 'showmanualtags',
])
const equationReferences = new Set(['\\ref', '\\eqref', '\\refeq', '\\noeqref'])
const mathtoolsSpacingOptions = new Set([
  'above-intertext-sep', 'below-intertext-sep', 'above-shortintertext-sep', 'below-shortintertext-sep',
  'shortvdotsadjustabove', 'shortvdotsadjustbelow',
])

const arrowBetweenLines = '\\ArrowBetweenLines'
const emphasisEnvironments = /^(?:(?:equation|align|alignat|flalign|gather|multline)\*?)$/
const emphasisEdges = ' data-empheq-start data-empheq-end'
const measureEmpheqLength = /\\EmphEq(?:display(?:width|height|depth)|tagwidth)(?![A-Za-z@])/
const emphasisAxisProbe = '<math xmlns="http://www.w3.org/1998/Math/MathML" data-empheq-axis aria-hidden="true"><mrow><mtable><mtr><mtd><mspace width="0" height="0" depth="0"/></mtd></mtr></mtable><mspace width="0" height="0" depth="0"/></mrow></math>'
const emphasisFactorCommand = '\\EmphEqdelimiterfactor'
const emphasisShortfallCommand = '\\EmphEqdelimitershortfall'
const swapAboveDisplaySkip = '\\SwapAboveDisplaySkip'
const flushSpaceAbove = '\\MTFlushSpaceAbove'
const flushSpaceBelow = '\\MTFlushSpaceBelow'
const alignedBox = '\\Aboxed'
const customAlignedBox = '\\@AboxedWith'
const alignedBoxAssignments = new Set(['\\setlength', '\\fboxsep', '\\fboxrule'])
const mathModeFunctions = new Set([
  ...groupedArgumentFunctions, ...primitiveArgumentFunctions, ...Object.keys(mathClasses), ...Object.keys(accents),
  ...Object.keys(stretchedAccents), ...Object.keys(extensibleArrows),
  ...ruledAccents, ...Array.from(infixFractions, command => command.slice(1)),
  'begin', 'end', 'right', 'middle', '@binrel', '@splitfrac', 'mathchoice', 'vcenter',
  'cancel', 'bcancel', 'xcancel', 'pmb', 'phase', 'mathreflectbox',
  'prescript', 'mathstrut', 'xmathstrut', 'sideset', 'adjustlimits', 'smashoperator', 'SwapAboveDisplaySkip', 'overset', 'underset', 'overunderset', 'stackrel',
  'shoveleft', 'shoveright', 'ArrowBetweenLines', 'MTFlushSpaceAbove', 'MTFlushSpaceBelow', 'Aboxed', '@AboxedWith', 'MakeAboxedCommand',
  ...Array.from(intertextCommands.keys(), command => command.slice(1)),
  'overline', 'operatorname', 'operatorname@', 'operatornamewithlimits', 'limits', 'nolimits', 'displaylimits',
  'not', 'mod', 'bmod', 'pmod', 'pod', 'ce', 'pu', 'allowbreak', 'nonscript', 'root', 'of', 'leftroot', 'uproot', 'hdotsfor',
])
const sharedFunctions = new Set([
  ...Object.keys(textFonts), ...typesettingNames, ...textBoxes, ...verticalBoxCommands, ...spacingCommands,
  'begingroup', 'endgroup', 'relax', 'newline', 'cr', 'color', 'textcolor',
  'sout', 'underline', 'underbar', 'textcircled', 'llap', 'clap', 'rlap', '@char',
  'tag', 'raisetag', 'label', 'ref', 'eqref', 'refeq', 'noeqref', 'notag', 'nonumber', 'nobreak', 'hline', 'hdashline',
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

function crampedMath(content: Markup): Markup {
  return xml`<mrow style="math-shift:compact">${content}</mrow>`
}

function scaledMath(content: Markup, ratio: number): Markup {
  if (ratio === 1 || !content) return content
  return xml`<mstyle mathsize="${String(Number(ratio.toFixed(5)))}em">${content}</mstyle>`
}

interface FractionLayout {
  forced?: MathStyle
  thickness?: string
  align?: 'left' | 'right'
  denominatorAlign?: 'left' | 'right'
  fences?: readonly [string, string]
  continued?: boolean
}

function fractionMarkup(first: Markup, second: Markup, layout: FractionLayout): Markup {
  const { forced, thickness, align, denominatorAlign, fences, continued } = layout
  const bar = thickness !== undefined ? ` linethickness="${thickness}"` : ''
  const numerator = align ? ` numalign="${align}"` : ''
  const denominator = denominatorAlign ? ` denomalign="${denominatorAlign}"` : ''
  const start = `<mfrac${bar}${numerator}${denominator}>`
  const [left, right] = fences ?? []
  const opening = left || right ? `<mrow>${left}${start}` : start
  const closing = left || right ? `</mfrac>${right}</mrow>` : '</mfrac>'
  // Continued fractions have TeX's numerator strut without adding ink or width.
  const top = continued ? xml`<mrow><mspace width="0" height="0.85em" depth="0.35em"/>${first}</mrow>` : first
  // Use one grid item per row when MathML Core does not honor numalign or denomalign.
  const upper = align ? xml`<mrow class="math-fraction-alignment">${top}</mrow>` : top
  const lower = denominatorAlign ? xml`<mrow class="math-fraction-alignment">${second}</mrow>` : second
  if (forced === undefined && typeof upper === 'string' && typeof lower === 'string') return opening + upper + lower + closing
  return (parent) => {
    const target = forced ?? parent
    const child = fractionStyle(target)
    const content = opening + renderMarkup(upper, child) + renderMarkup(lower, child) + closing
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
  let filteredNumbering = false
  let equationJot: string | undefined
  let mathtoolsOptions: ReadonlyMap<string, string> | undefined
  let tagForms: ReadonlyMap<string, TagForm> | undefined
  let tagFormName = 'default'
  let formattingTag = false
  let nextSubequationNumber: ((key?: string, onlyReferenced?: boolean, form?: string) => string) | undefined
  let fullWidthAlignment = false
  let shortDisplaySkip = false
  let emphasizedDisplay: 'equation' | 'alignment' | undefined
  let emphasisDefaults: ReadonlyMap<string, string[]> | undefined
  let emphasisFactor = 950
  let emphasisShortfall: string | undefined
  let emphasisSide = false
  let fontScale = 1
  let textItalic = false
  let textMonospace = false
  let textFont: Readonly<TextFont> | undefined
  let mathFontActive = false
  let explicitMathBoxSpacing = false
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
    const previousJot = equationJot
    const previousMathtoolsOptions = mathtoolsOptions
    const previousEmphasisDefaults = emphasisDefaults
    const previousEmphasisFactor = emphasisFactor
    const previousEmphasisShortfall = emphasisShortfall
    const previousTagForms = tagForms
    const previousTagFormName = tagFormName
    scopes.push({ undo: new Map() })
    try { return render() }
    finally {
      currentColor = previousColor
      textItalic = previousItalic
      textMonospace = previousMonospace
      equationJot = previousJot
      mathtoolsOptions = previousMathtoolsOptions
      emphasisDefaults = previousEmphasisDefaults
      emphasisFactor = previousEmphasisFactor
      emphasisShortfall = previousEmphasisShortfall
      tagForms = previousTagForms
      tagFormName = previousTagFormName
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
    if ('pairedDelimiter' in macro) return expandPairedDelimiter(macro.pairedDelimiter)
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
    if (primitive === '\\MoveEqLeft') {
      if (mode !== 'math') throw new MathParseError('Math command \\MoveEqLeft requires math mode')
      const input = rawBracket()
      const amount = input === undefined ? '2' : expandDefinition(input).join('').trim()
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(amount) || !Number.isFinite(Number(amount)))
        throw new MathParseError('Expected a signed number after \\MoveEqLeft')
      const inverse = amount.startsWith('-') ? amount.slice(1) : `-${amount.replace(/^\+/, '')}`
      return tokenize(`\\kern{${amount}em}&\\kern{${inverse}em}`)
    }
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
    if (eager && typeof definition !== 'function' && 'pairedDelimiter' in definition && definition.pairedDelimiter.template) return false
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
    return replaceExpansion(start, substituteMacroArguments(macro.body, values))
  }

  function substituteMacroArguments(template: readonly string[], values: readonly string[][]): string[] {
    const body: string[] = []
    for (let index = 0; index < template.length; index++) {
      const token = template[index]
      const next = template[index + 1] ?? ''
      if (token === '#' && /^#[1-9]?$/.test(next)) {
        body.push(next)
        index++
      }
      else if (/^#[1-9]$/.test(token)) {
        const value = values[Number(token[1]) - 1]
        if (!value) throw new MathParseError(`Unbound macro parameter: ${token}`)
        if (body.length + value.length > 12000) throw new MathParseError('Expanded equation is too long')
        body.push(...value)
      }
      else body.push(token)
    }
    return body
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

  function expandPairedDelimiter({ opening, closing, template }: PairedDelimiter): string[] {
    const starred = tokenText(tokens[cursor] ?? '') === '*'
    if (starred) cursor++
    const optionalSize = starred ? undefined : rawBracket()
    const args = Array.from({ length: template?.arity ?? 1 }, () => rawGroup())
    const body = template ? substituteMacroArguments(template.body, args) : args[0]
    function readFence(tokens: string[]): string {
      const expanded = expandDefinition(tokens).join('').trim()
      const glyph = delimiter(expanded, 'DeclarePairedDelimiter')
      return glyph === '{' ? '\\{' : glyph === '}' ? '\\}' : glyph === '\\' ? '\\backslash' : glyph
    }
    function pairedTokens(left: string, right: string, scale: string): string[] {
      // The empty opening atom gives the paired row ordinary fence spacing.
      // The stretchy fences stay together so scripts and export see one base.
      if (starred) return ['\\mathopen', '{', '}', '\\mathclose', '{', '\\left', left, ...body, '\\right', right, '}']
      if (scale) return [`${scale}l`, left, ...body, `${scale}r`, right]
      const start = left === '.' ? [] : ['\\mathopen', '{', left, '}']
      const end = right === '.' ? [] : ['\\mathclose', '{', right, '}']
      return [...start, ...body, ...end]
    }
    const left = readFence(opening)
    const right = readFence(closing)
    const isScaler = (name: string) => controlWord.test(name) && defined(name) && defined(`${name}l`) && defined(`${name}r`)
    const authoredSize = optionalSize?.map(tokenValue).join('').trim() ?? ''
    const scale = isScaler(authoredSize) ? authoredSize : optionalSize ? expandDefinition(optionalSize).join('').trim() : ''
    if (scale && !isScaler(scale))
      throw new MathParseError('Expected a delimiter size such as \\big or \\Bigg')
    const expression = pairedTokens(left, right, scale)
    if (!template) return expression
    const scaler = starred ? ['\\middle'] : scale ? [scale] : []
    return [
      '\\begingroup', '\\def', '\\delimsize', '{', ...scaler, '}',
      ...substituteMacroArguments(template.before, args), ...expression, ...substituteMacroArguments(template.after, args), '\\endgroup',
    ]
  }

  function radicalDegree(tokens: string[]): string {
    return withTokens(tokens, () => inScope(() => {
      let left = 0
      let up = 0
      for (let command = peek(); command === '\\leftroot' || command === '\\uproot'; command = peek()) {
        take()
        const input = expandDefinition(rawGroup()).join('').trim()
        const value = Number(input)
        if (!/^[+-]?\d+$/.test(input) || !Number.isSafeInteger(value))
          throw new MathParseError(`Expected a signed integer after ${command}`)
        if (command === '\\leftroot') left = value
        else up = value
      }
      const degree = renderMarkup(row([boundary]), 3)
      if (!left && !up) return `<mrow>${degree}</mrow>`
      // The index uses scriptscript size. Convert the parent-style mu offset
      // to index-sized ems before applying it to the degree box.
      const horizontal = dimension(`${-left * 2}mu`)
      const vertical = dimension(`${-up * 2}mu`)
      return `<mrow class="math-root-offset" style="position:relative;left:${horizontal};top:${vertical}">${degree}</mrow>`
    }))
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
    if (name === 'scalebox' || name === 'resizebox') return scaledBox(name)
    if (name === 'rotatebox') return rotatedBox()
    if (name === 'reflectbox') return xml`<mrow class="math-reflect">${textArgument('hbox')}</mrow>`
    if (name === 'fbox') return xml`<mrow class="math-color-box math-frame">${textArgument('hbox')}</mrow>`
    const { frame, background } = readBoxColors(name)
    const content = textArgument('hbox')
    return xml`<mrow class="math-color-box${frame ? ' math-frame' : ''}" style="background-color:${background}${frame ? `;border-color:${frame}` : ''}">${content}</mrow>`
  }

  function readGraphicsNumber(raw: string, message: string): number {
    const value = Number(raw)
    if (!graphicsNumber.test(raw) || !Number.isFinite(value)) throw new MathParseError(message)
    return value
  }

  function empheqLength(raw: string): string | undefined {
    if (!measureEmpheqLength.test(raw)) return
    if (!emphasisSide) throw new MathParseError('Empheq display lengths require a side decoration')
    const term = /\s*([+-]?)\s*(?:(\d+(?:\.\d*)?|\.\d+)?\s*\\EmphEq(displaywidth|displayheight|displaydepth|tagwidth)|((?:\d+(?:\.\d*)?|\.\d+)(?:\s*[a-z]{2})?))/y
    const parts: string[] = []
    while (term.lastIndex < raw.length) {
      const match = term.exec(raw)
      if (!match || (parts.length && !match[1])) throw new MathParseError('Invalid Empheq length expression')
      const [, sign, coefficient, register, literal] = match
      const factor = Number(coefficient ?? 1)
      const value = register ? `var(--empheq-${register})` : dimension(literal)
      if (!value || !Number.isFinite(factor)) throw new MathParseError('Invalid Empheq length expression')
      const magnitude = factor === 1 ? value : `(${value} * ${factor})`
      parts.push(parts.length ? ` ${sign} ${magnitude}` : sign === '-' ? `(-1 * ${magnitude})` : magnitude)
    }
    return `calc(${parts.join('')})`
  }

  function graphicsLength(raw: string, axis: 'width' | 'height', lengths: Map<string, string>): string {
    const reference = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)?)\s*\\(width|height|depth|totalheight)$/.exec(raw)
    if (reference) {
      const amount = reference[1]
      const multiplier = amount === '-' ? -1 : amount === '+' || !amount ? 1 : Number(amount)
      if (!Number.isFinite(multiplier)) throw new MathParseError('Invalid math box dimension')
      return `${reference[2]}:${multiplier}`
    }
    const length = empheqLength(raw) ?? dimension(raw)
    if (length === undefined) throw new MathParseError('Invalid math box dimension')
    lengths.set(axis, length)
    return 'length'
  }

  function transformedBox(content: Markup, kind: string, horizontal: string, vertical: string, lengths: Map<string, string>, angle?: number): Markup {
    const style = lengths.size ? ` style="${[...lengths].map(([axis, length]) => `--math-box-${axis}:${length}`).join(';')}"` : ''
    const measured = style.includes('var(--empheq-') ? ' data-empheq-measure' : ''
    const rotation = angle === undefined ? '' : ` data-angle="${angle}"`
    const anchor = '<mspace width="0" height="0" depth="0" aria-hidden="true"/>'
    const inline = '<mspace class="math-box-axis-x" width="0" height="0" depth="0" aria-hidden="true"/>'
    const block = '<mspace class="math-box-axis-y" width="0" height="0" depth="0" aria-hidden="true"/>'
    return xml`<mpadded data-math-transform-box="${kind}" data-width="${horizontal}" data-height="${vertical}"${rotation}${measured}${style}><mrow><mrow>${content}</mrow>${anchor}${inline}${block}</mrow></mpadded>`
  }

  function scaledBox(name: 'scalebox' | 'resizebox'): Markup {
    const read = (input: string[]) => expandDefinition(input).join('').trim()
    const lengths = new Map<string, string>()
    if (name === 'scalebox') {
      const factor = (input: string[]) => String(readGraphicsNumber(read(input), 'Invalid math scale factor'))
      const horizontal = factor(rawGroup())
      const optional = rawBracket()
      const vertical = optional ? factor(optional) : horizontal
      return transformedBox(textArgument('hbox'), 'scale', horizontal, vertical, lengths)
    }
    const starred = peek() === '*'
    if (starred) take()
    function size(axis: 'width' | 'height'): string {
      const raw = read(rawGroup())
      return raw === '!' ? raw : graphicsLength(raw, axis, lengths)
    }
    const horizontal = size('width')
    const vertical = size('height')
    const content = textArgument('hbox')
    if (horizontal === '!' && vertical === '!') return content
    return transformedBox(content, starred ? 'total' : 'height', horizontal, vertical, lengths)
  }

  function rotatedBox(): Markup {
    const optional = rawBracket()
    const lengths = new Map<string, string>()
    let horizontal = optional ? 'width:0.5' : 'width:0'
    let vertical = optional ? 'center:1' : 'height:0'
    let units = 360
    for (const assignment of optional ? expandDefinition(optional).join('').split(',') : []) {
      if (!assignment.trim()) continue
      const [key, value, extra] = assignment.split('=')
      const name = key.trim()
      const argument = value?.trim().replace(/^\{([^{}]*)\}$/, '$1').trim()
      if (extra !== undefined) throw new MathParseError('Invalid math rotation option')
      if (name === 'origin') {
        const origin = argument ?? 'c'
        if (!/^[lrctbB]{1,2}$/.test(origin)) throw new MathParseError('Invalid math rotation origin')
        for (const position of origin) {
          if (position === 'l' || position === 'r') horizontal = position === 'l' ? 'width:0' : 'width:1'
          else if (position === 't') vertical = 'height:1'
          else if (position === 'b') vertical = 'depth:-1'
          else if (position === 'B') vertical = 'height:0'
        }
      }
      else if (name === 'x' || name === 'y') {
        const length = graphicsLength(argument ?? '', name === 'x' ? 'width' : 'height', lengths)
        if (name === 'x') horizontal = length
        else vertical = length
      }
      else if (name === 'units') {
        units = readGraphicsNumber(argument ?? '', 'Invalid math rotation units')
        if (!units) throw new MathParseError('Invalid math rotation units')
      }
      else throw new MathParseError(`Unsupported math rotation option: ${name}`)
    }
    const angle = readGraphicsNumber(expandDefinition(rawGroup()).join('').trim(), 'Invalid math rotation angle')
    const radians = -(angle % units) / units * 2 * Math.PI
    const content = textArgument('hbox')
    return radians ? transformedBox(content, 'rotate', horizontal, vertical, lengths, radians) : content
  }

  function readBoxColors(name: string): { frame?: string, background: string } {
    const frame = name === 'fcolorbox' ? readColor('Invalid math box color') : undefined
    const background = readColor('Invalid math box color')
    return { frame, background }
  }

  function alignedBoxDimensions(): string[] {
    const dimensions: string[] = []
    while (alignedBoxAssignments.has(peek())) {
      const assignment = take()
      const name = assignment === '\\setlength' ? literalGroup() : assignment
      if (name !== '\\fboxsep' && name !== '\\fboxrule') throw new MathParseError('Unsupported \\Aboxed dimension')
      if (assignment !== '\\setlength' && peek() === '=') take()
      const length = readDimension()
      if (Number.parseFloat(length) < 0) throw new MathParseError('Invalid \\Aboxed dimension')
      dimensions.push(`--math-frame-${name === '\\fboxsep' ? 'padding' : 'rule'}:${length}`)
    }
    return dimensions
  }

  function alignedBoxStyle(box: string[]): string[] {
    // Expand the wrapper in isolation and verify that it forwards one
    // argument to a box. The actual math is laid out in its alignment cells.
    const probe = '\u0000alignment-box-argument'
    return withTokens([...box, '{', probe, '}'], () => inScope(() => {
      let groups = 0
      while (peek() === '{') {
        take()
        groups++
      }
      const style = alignedBoxDimensions()
      const command = take()
      const name = command.slice(1)
      if (name !== 'fbox' && name !== 'colorbox' && name !== 'fcolorbox')
        throw new MathParseError('Expected \\fbox, \\colorbox, or \\fcolorbox in an alignment box wrapper')
      const { frame, background } = name === 'fbox' ? {} : readBoxColors(name)
      let contents = expandDefinition(rawGroup()).filter(value => !texWhitespace.test(value))
      // \boxed expands to an \fbox containing a grouped display formula.
      if (contents[0] === '$' && contents.at(-1) === '$') contents = contents.slice(1, -1)
      if (contents[0] === '\\displaystyle') contents.shift()
      while (contents[0] === '{' && contents.at(-1) === '}') contents = contents.slice(1, -1)
      if (contents.length !== 1 || contents[0] !== probe)
        throw new MathParseError('An alignment box wrapper must pass its argument through once')
      for (let index = 0; index < groups; index++) {
        if (take() !== '}') throw new MathParseError('Unexpected tokens after an alignment box wrapper')
      }
      if (peek() !== boundary) throw new MathParseError('Unexpected tokens after an alignment box wrapper')
      if (background) style.push(`--math-frame-fill:${background}`)
      if (frame) style.push(`--math-frame-color:${frame}`)
      if (name === 'colorbox') style.push('--math-frame-rule:0px')
      return style
    }))
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

  function overlap(direction: string, content: Markup, cramped = false): Markup {
    const marker = cramped ? ' data-math-cramped-lap=""' : ''
    return xml`<mpadded width="0"${marker}><mrow class="math-overlap-${direction}">${content}</mrow></mpadded>`
  }

  function mathStrut(variable: boolean): string {
    const phantom = '<mphantom><mo stretchy="false">(</mo></mphantom>'
    const basic = `<mpadded width="0">${phantom}</mpadded>`
    if (!variable) return basic
    const offset = (tokens: string[]) => {
      const value = expandDefinition(tokens).join('').trim()
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value)))
        throw new MathParseError('Invalid variable math strut adjustment')
      return Number(value)
    }
    const optional = rawBracket()
    const height = offset(rawGroup())
    const depth = optional === undefined ? height : offset(optional)
    if (!height && !depth) return basic
    const max = maxSize === Infinity ? '' : ` data-math-strut-limit="${maxSize}"`
    return `<mrow data-math-strut="${height} ${depth}"${max} aria-hidden="true"><mpadded width="0" height="0" depth="0">${phantom}<mpadded width="0" depth="0">${phantom}</mpadded></mpadded><mspace width="0" height="0.75em" depth="0.25em"/></mrow>`
  }

  function withMathBoxSpacing(read: () => Markup): Markup {
    const previousSpacing = explicitMathBoxSpacing
    explicitMathBoxSpacing = true
    try { return read() }
    finally { explicitMathBoxSpacing = previousSpacing }
  }

  function mathBox(name: string): Markup {
    const size = name === 'mathmakebox' ? rawBracket() : undefined
    if (size === undefined) return withMathBoxSpacing(argument)

    const position = rawBracket()
    const alignment = position === undefined ? 'c' : expandDefinition(position).join('').trim()
    if (!/^[lcr]$/.test(alignment)) throw new MathParseError('Invalid math box alignment')

    const width = inScope(() => withTokens(size, () => {
      if (peek() === '\\widthof') {
        take()
        const probe = withMathBoxSpacing(() => textArgument('hbox'))
        if (peek() !== boundary) throw new MathParseError('Unexpected tokens after math box width measurement')
        return { probe }
      }
      const value = expandDefinition(tokens.slice(cursor, -1)).join('').trim()
      if (value === '\\width') return
      const length = dimension(value)
      if (length === undefined) throw new MathParseError('Invalid math box dimension')
      return { length }
    }))
    const content = withMathBoxSpacing(argument)
    if (width === undefined) return content

    // TeX aligns the right edge for r and the center for c.
    const direction = alignment === 'c' ? 'c' : alignment === 'r' ? 'l' : 'r'
    const ink = (offset?: string) => xml`<mrow class="math-overlap-${direction}"${offset ? ` style="position:relative;left:${offset}"` : ''}>${content}</mrow>`
    if (width.probe !== undefined) {
      return xml`<mrow class="math-measured-box"><mpadded height="0" depth="0" aria-hidden="true"><mphantom>${width.probe}</mphantom></mpadded><mpadded width="0" class="math-measured-${alignment}">${ink()}</mpadded></mrow>`
    }
    const { length } = width
    const magnitude = Number.parseFloat(length)
    const unit = /[a-z]+$/.exec(length)?.[0] ?? ''
    const anchor = alignment === 'r' ? length : alignment === 'c' ? `${magnitude / 2}${unit}` : '0'
    // Chromium clamps negative lspace values. Shift the ink independently
    // of the negative advance, as with a negative TeX kern.
    if (magnitude < 0) return xml`<mpadded width="0" style="margin-inline-end:${length}">${ink(anchor)}</mpadded>`
    return xml`<mpadded width="${length}" lspace="${anchor}">${ink()}</mpadded>`
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

  function parseTextArgument(properties: string, parentheses: boolean, capture?: (parts: Markup[]) => void, end = boundary, stops?: readonly string[]): Markup {
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
        if (stops?.includes(token)) {
          literal = literal.replace(/[ \t\r\n]+$/, '')
          break
        }
        if (!token || token === boundary || token === '}' || token === '\\endgroup') throw new MathParseError('Unclosed math text')
        cursor++
        if (token === '\\relax' || declareMacro(token) || equationDirective(token)) continue
        const command = token.startsWith('\\') ? token.slice(1) : ''
        const verbatim = token === tagValueToken ? equationTagValue : verbatimMarkup(token)
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
        else if (equationReferences.has(token)) {
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

  function selectedTagForm(): string | undefined {
    const form = tagForms?.get(tagFormName)
    if (!form || formattingTag) return
    const previousTag = tagState
    tagState = { suppressed: false }
    formattingTag = true
    linkDepth++
    try {
      const tokens = [...form.left, '{', ...form.inner, '{', tagValueToken, '}', '}', ...form.right]
      const template = withTokens(tokens, () => inMode('text', () => parseTextArgument('', false)))
      return renderMarkup(template, 1)
    }
    finally {
      linkDepth--
      formattingTag = false
      tagState = previousTag
    }
  }

  function nextTag(automatic: boolean): Markup | undefined {
    const { key, label, starred } = tagState
    if (tagState.finalized) return label
    tagState.key = undefined
    const onlyReferenced = mathtoolsOptions?.get('showonlyrefs') === 'true'
    if (label !== undefined) {
      const optional = onlyReferenced && mathtoolsOptions?.get('showmanualtags') !== 'true'
      if (!key) return optional ? undefined : label
      const definition = referenceMarkup().label?.(key, {
        markup: renderMarkup(label, 1), starred: starred === true, bareMarkup: tagState.bareMarkup,
      }, optional)
      return definition ?? (optional ? undefined : label)
    }
    if (automatic && !tagState.suppressed) {
      const form = selectedTagForm()
      if (nextSubequationNumber) return nextSubequationNumber(key, onlyReferenced, form)
      equationNumber++
      filteredNumbering ||= onlyReferenced
      const registry = key || filteredNumbering || form ? referenceMarkup() : references
      const numbered = registry?.number?.(equationNumber, key, onlyReferenced, form)
      if (numbered !== undefined || onlyReferenced) return numbered
      return form ? applyEquationTagForm(form, tag('mtext', String(equationNumber)))
        : numberMarkup?.(equationNumber) ?? tag('mtext', `(${equationNumber})`)
    }
  }

  function equationKey(): string {
    return expandDefinition(rawGroup('Missing equation label')).join('').trim()
  }

  function equationReference(token: string): string {
    if (token === '\\noeqref')
      return equationKey().split(',').map(key => key.trim()).filter(Boolean).map(key => referenceMarkup().pin(key)).join('')
    const starred = peek() === '*'
    if (starred) take()
    const kind = token === '\\eqref' ? 'eqref' : token === '\\refeq' ? 'refeq' : 'ref'
    const key = equationKey()
    return referenceMarkup().reference(key, kind, !starred && linkDepth === 0, kind === 'eqref' ? selectedTagForm() : undefined)
  }

  function equationDirective(token: string): boolean {
    if (token === '\\tag') {
      if (!display) throw new MathParseError('Equation tags require display math')
      if (tagState.label !== undefined) throw new MathParseError('Multiple tags for one equation')
      const starred = peek() === '*'
      if (starred) take()
      const form = starred ? undefined : selectedTagForm()
      tagState.starred = starred
      tagState.label = ''
      const content = textArgument(undefined, !starred && !form)
      if (form) {
        tagState.bareMarkup = renderMarkup(content, 1)
        tagState.label = applyEquationTagForm(form, tagState.bareMarkup)
      }
      else tagState.label = content
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

  function smashedOperator(): Atom {
    const option = rawBracket()
    const direction = option === undefined ? 'lr' : expandDefinition(option).join('').trim()
    if (!/^(?:l|r|lr|rl)$/.test(direction)) throw new MathParseError('Invalid direction in \\smashoperator')
    return withTokens(rawGroup('Missing argument to \\smashoperator'), () => inScope(() => {
      const operator = argumentAtom(true)
      const { lower, upper } = readScripts({ ...operator, limits: true, ignoreLimitControl: true })
      if (peek() !== boundary) throw new MathParseError('Expected an operator with limits in \\smashoperator')
      const base = neutralizeOperator(renderMarkup(stackOperator(operator.markup), 0))
      if (!lower && !upper) return { markup: mathSize(0, base), mathClass: 'op' }

      const element = lower && upper ? 'munderover' : lower ? 'munder' : 'mover'
      const script = (value: Markup) => value ? renderMarkup(crampedMath(value), 0) : ''
      const limits = mathSize(0, `<${element}>${base}${script(lower)}${script(upper)}</${element}>`)
      const measure = (markup: string) => `<mpadded height="0" depth="0" aria-hidden="true"><mphantom>${markup}</mphantom></mpadded>`
      // Reserve half of the operator on the smashed side, and half of the
      // full stack on the other side. The ink is centered over their seam.
      const bare = measure(mathSize(0, base))
      const full = direction.length === 1 ? measure(limits) : bare
      const widths = direction === 'r' ? full + bare : bare + full
      const ink = `<mpadded width="0"><mrow class="math-overlap-c">${limits}</mrow></mpadded>`
      return { markup: `<mrow data-math-smash-operator>${widths}${ink}</mrow>`, mathClass: 'op' }
    }))
  }

  function adjustLimits(): Atom {
    function readOperator(): { base: Markup, limit: Markup } {
      const base = stackOperator(fragmentArgument('Missing operator in \\adjustlimits').markup)
      const marker = take()
      if (marker !== '_' && marker !== '\\sb') throw new MathParseError('Expected a subscript in \\adjustlimits')
      return { base, limit: crampedMath(inScript(scriptArgument())) }
    }
    const first = readOperator()
    const second = readOperator()
    function adjusted(base: typeof first, partner: typeof first): RowPart {
      // Share the base depth and script ascent without adding horizontal
      // advance. MathML and Office Math can represent both phantoms natively.
      const depth = xml`<mpadded width="0" height="0"><mphantom>${partner.base}</mphantom></mpadded>`
      const ascent = xml`<mpadded width="0" depth="0"><mphantom>${partner.limit}</mphantom></mpadded>`
      return {
        markup: xml`<munder><mrow>${base.base}${depth}</mrow><mrow>${base.limit}${ascent}</mrow></munder>`,
        mathClass: 'op',
        operator: true,
      }
    }
    const parts = [adjusted(first, second), adjusted(second, first)]
    return { markup: joinRow(parts), fragment: () => parts }
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
      // Math boxes own their operator spacing. Intrinsic MathML widths can
      // omit native spacing in a grid, and embellished operators can leak it.
      const content = joinRow(parts, wrap && !lines, followsOrdinary, explicitMathBoxSpacing)
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

  function readMultlineRows(environment: string, closing = environment): MultlineRow[] {
    const rows: MultlineRow[] = []
    const stops = ['&', '\\\\', '\\newline', '\\cr', '\\end']
    while (peek()) {
      const line = inScope((): MultlineRow => {
        const first = peek()
        if (first !== '\\shoveleft' && first !== '\\shoveright')
          return { content: row(stops, false, false, undefined, true) }
        take()
        const insetTokens = environment === 'multlined' ? rawBracket() : undefined
        const inset = insetTokens === undefined ? undefined : dimension(expandDefinition(insetTokens).join(''))
        if (insetTokens !== undefined && inset === undefined) throw new MathParseError('Invalid multlined row inset')
        const body = rawGroup(`Missing argument to ${first}`)
        const shoved = withTokens(body, () => inScope(() => row([boundary], false, false, undefined, true)))
        const tail = row(stops)
        return { content: joinMarkup([shoved, tail]), align: first === '\\shoveleft' ? 'left' : 'right', inset }
      })
      const separator = take()
      if (separator === '&') throw new MathParseError(`Too many columns in ${environment}`)
      if (separator === '\\end' && literalGroup() === closing) {
        if (!rows.length || renderMarkup(line.content, 0)) rows.push(line)
        return rows
      }
      if (separator !== '\\\\' && separator !== '\\newline' && separator !== '\\cr') break
      rows.push({ ...line, gap: arrayRowGap(separator) })
    }
    throw new MathParseError(`Unclosed math environment: ${environment}`)
  }

  function multline(environment: string, closing: string): string {
    if (environmentDepth) throw new MathParseError(`${environment} cannot be nested in another math environment`)
    const previousTag = tagState
    tagState = { suppressed: false }
    environmentDepth++
    try {
      const rows = readMultlineRows(environment, closing)
      return multlineTable(rows, nextTag(environment === 'multline'), options?.leqno === true, options?.fleqn === true, environment, tagState.raise, equationJot, Boolean(emphasizedDisplay))
    }
    finally {
      environmentDepth--
      tagState = previousTag
    }
  }

  function multlined(): string {
    let position: MultlinedPosition = 'c'
    let width: string | undefined
    for (let index = 0; index < 2; index++) {
      const tokens = rawBracket()
      if (tokens === undefined) break
      const value = expandDefinition(tokens).join('').trim()
      if (!value) continue
      if (value === 't' || value === 'c' || value === 'b') position = value
      else {
        width = dimension(value)
        if (width === undefined || Number.parseFloat(width) < 0)
          throw new MathParseError('Invalid multlined width or position')
      }
    }
    const previousTag = tagState
    tagState = { suppressed: false }
    environmentDepth++
    try {
      const rows = readMultlineRows('multlined')
      if (tagState.label !== undefined) throw new MathParseError('Equation tags belong outside multlined')
      return multlinedTable(rows, position, width, equationJot)
    }
    finally {
      environmentDepth--
      tagState = previousTag
    }
  }

  function matrix(environment: string, closing = environment, emphasisPairs?: string): Markup {
    const emphasized = Boolean(emphasizedDisplay) && closing === 'empheq'
    const unclosed = () => new MathParseError(`Unclosed math environment: ${environment}`)
    const spreadEnvironment = /^(?:(?:flalign|xalignat)\*?|xxalignat)$/.test(environment)
    if (!display && (spreadEnvironment || /^(?:(?:equation|align(?:at)?|gather|multline)\*?|split|CD)$/.test(environment)))
      throw new MathParseError(`${environment} requires display math`)
    if (spreadEnvironment && (environmentDepth !== 0 || depth !== 1))
      throw new MathParseError(`${environment} requires a top-level display`)
    if (environment === 'CD') return commutativeDiagram()
    if (environment === 'multline' || environment === 'multline*') return multline(environment, closing)
    if (environment === 'multlined') return multlined()
    if (/^equation[*]?$/.test(environment)) {
      environmentDepth++
      const content = row(['&', '\\end'], false, true)
      environmentDepth--
      if (peek() === '&') throw new MathParseError('Too many columns in equation')
      if (take() !== '\\end' || literalGroup() !== closing) throw unclosed()
      tagState.label = nextTag(display && environment === 'equation')
      tagState.finalized = true
      return xml`<mrow>${content}</mrow>`
    }
    const inner = /^(?:aligned(?:at)?|[lr]?gathered)$/.test(environment)
    if (!inner && !spreadEnvironment && !/^(?:[pbBvV]?matrix[*]?|smallmatrix|d?r?cases\*?|align(?:at)?[*]?|gather[*]?|split|d?array|(?:cramped)?subarray)$/.test(environment))
      throw new MathParseError(`Unsupported math environment: ${environment}`)
    const positionTokens = inner ? rawBracket() : undefined
    const position = positionTokens === undefined ? 'c' : expandDefinition(positionTokens).join('').trim()
    if (!/^[tcb]$/.test(position)) throw new MathParseError('Invalid inner alignment position')
    const cramped = environment === 'crampedsubarray'
    const subarray = cramped || environment === 'subarray'
    const smallMatrix = environment === 'smallmatrix'
    const columnArray = subarray || /^(?:d?array)$/.test(environment)
    const alignmentTokens = environment.endsWith('matrix*') ? rawBracket() : undefined
    const matrixAlignment = alignmentTokens && expandDefinition(alignmentTokens).join('').trim()
    if (matrixAlignment !== undefined && !/^[lcr]$/.test(matrixAlignment)) throw new MathParseError('Invalid matrix alignment')
    const columns = columnArray ? expandDefinition(rawGroup()).join('') : matrixAlignment ?? ''
    const paired = /^(?:align(?:ed)?|xx?align)at[*]?$/.test(environment)
    const pairCount = paired ? emphasisPairs ?? expandDefinition(rawGroup()).join('').replace(/\s/g, '') : ''
    const pairs = Number(pairCount)
    if (paired && (!/^\d+$/.test(pairCount) || !Number.isSafeInteger(pairs) || pairs < 1)) throw new MathParseError('Invalid alignment column count')
    const layout = arrayColumns(columns)
    if (subarray && !/^[lc]?$/.test(columns.trim())) throw new MathParseError('Invalid subarray alignment')
    const compact = subarray || smallMatrix
    const aligned = spreadEnvironment || environment.startsWith('align') || environment === 'split'
    const gathered = /^(?:gather[*]?|[lr]?gathered)$/.test(environment)
    const jot = aligned || gathered ? equationJot : undefined
    const gatherAlignment = environment === 'lgathered' ? 'left' : environment === 'rgathered' ? 'right' : ''
    const cases = environment.endsWith('cases') || environment.endsWith('cases*')
    const proseCases = cases && environment.endsWith('*')
    const ordinaryCellStyle = environment.startsWith('d') || aligned || gathered ? 0 : 1
    const stretch = !compact && !cases && macros.has('\\arraystretch')
      ? Number.parseFloat(expandDefinition(['\\arraystretch']).join('')) : 1
    if (!(stretch > 0 && stretch <= 100)) throw new MathParseError('Invalid array stretch')
    const outerTag = tagState
    const rowTags = spreadEnvironment || /^(?:align|alignat|gather)[*]?$/.test(environment)
    if (rowTags && display && !environmentDepth && depth === 1 && peek() === swapAboveDisplaySkip) {
      take()
      shortDisplaySkip = true
    }
    const allowIntertext = rowTags && display && environmentDepth === 0
    const allowArrow = /^(?:align(?:at)?\*?|aligned(?:at)?)$/.test(environment)
    const tagless = environment === 'xxalignat'
    const automatic = allowIntertext && !tagless && !environment.endsWith('*')
    environmentDepth++
    // Embedded tables such as split and aligned share the enclosing
    // equation's tag. Only the top-level AMS row environments collect tags.
    if (rowTags) tagState = { suppressed: false }
    const rows: ArrayRow[] = []
    const intertexts = new Map<number, { spacing: IntertextKind, content: Markup }[]>()
    function intertext(spacing: IntertextKind): void {
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
    const allowDottedCells = /^(?:[pbBvV]?matrix\*?|smallmatrix|d?array)$/.test(environment)
    let cells: ArrayCell[] = []
    let columnsInRow = 0
    let rules: ArrayRule[] = []
    let closed = false
    let flushAbove = false
    let frames: Map<number, AlignmentFrame> | undefined
    const stops = ['&', '\\\\', '\\newline', '\\cr', '\\end']
    if (allowIntertext) stops.push(...intertextCommands.keys())
    if (allowArrow) stops.push(arrowBetweenLines)
    if (aligned) stops.push(flushSpaceAbove, flushSpaceBelow)
    function addArrow(): void {
      const starred = peek() === '*'
      if (starred) take()
      if (starred && paired && pairs < 2) throw new MathParseError('The starred \\ArrowBetweenLines requires two alignment pairs')
      const rowTag = tagState
      tagState = { suppressed: false }
      try {
        const symbol = withTokens(rawBracket() ?? ['\\Updownarrow'], () => inScope(() => row([boundary])))
        if (tagState.label !== undefined || tagState.key !== undefined || tagState.raise !== undefined)
          throw new MathParseError('Equation tags belong on an equation line')
        const space = muSpace(18)
        const content = starred ? xml`<mrow>${space}${symbol}</mrow>` : xml`<mrow>${symbol}${space}</mrow>`
        const cells = starred ? ['', '', content] : [content]
        rows.push({ cells, columns: cells.length, before: rules, arrow: starred ? 'right' : 'left' })
        rules = []
      }
      finally {
        tagState = rowTag
      }
    }
    // The condition column must expand in text mode, including its first token.
    while ((proseCases && columnsInRow === 1) || peek()) {
      if (!cells.length) {
        while (peek() === '\\hline' || peek() === '\\hdashline')
          rules.push(take() === '\\hline' ? 'solid' : 'dashed')
        const spacing = allowIntertext && intertextCommands.get(peek())
        if (spacing) {
          take()
          intertext(spacing)
          continue
        }
        if (allowArrow && peek() === arrowBetweenLines) {
          take()
          addArrow()
          continue
        }
        if (aligned && peek() === flushSpaceAbove) {
          take()
          flushAbove = true
          continue
        }
        if (peek() === '\\end' && (intertexts.has(rows.length) || rows.at(-1)?.arrow || rows.at(-1)?.flushBelow)) {
          take()
          closed = literalGroup() === closing
          break
        }
      }
      const followsOrdinary = aligned && columnsInRow % 2 === 1
      const command = aligned || allowDottedCells ? peek() : ''
      if (aligned && (command === alignedBox || command === customAlignedBox || alignedBoxAssignments.has(command))) {
        const frameStyle = alignedBoxDimensions()
        const box = take()
        if (box !== alignedBox && box !== customAlignedBox) throw new MathParseError('Frame dimensions must precede an alignment box')
        if (box === customAlignedBox) frameStyle.push(...alignedBoxStyle(rawGroup()))
        const [lhs, rhs] = withTokens(rawGroup(), () => inScope(() => {
          const lhs = row(['&', boundary], false, false, undefined, followsOrdinary)
          if (peek() !== '&') return [lhs]
          take()
          const rhs = row(['&', boundary], false, false, undefined, true)
          if (peek() === '&') throw new MathParseError('Too many alignment points in \\Aboxed')
          return [lhs, rhs]
        }))
        const suffix = inScope(() => row(stops, false, false, undefined, true))
        if (rhs === undefined && !frameStyle.length) {
          cells.push(xml`<mrow class="math-color-box math-frame">${lhs}</mrow>${suffix}`)
          columnsInRow++
        }
        else {
          const span = rhs === undefined ? 1 : 2
          if (span === 2 && followsOrdinary) throw new MathParseError('\\Aboxed must start in the left column of an alignment pair')
          frames ??= new Map()
          frames.set(columnsInRow, { span, style: frameStyle })
          const tail = suffix && xml`<mrow>${suffix}</mrow>`
          if (rhs === undefined) cells.push(xml`<mrow data-equation-frame-start>${lhs}</mrow>${tail}`)
          else cells.push(lhs, xml`<mrow data-equation-frame-end>${rhs}</mrow>${tail}`)
          columnsInRow += span
        }
      }
      else if (allowDottedCells && command === '\\hdotsfor') {
        take()
        const multiplier = rawBracket()
        const scale = multiplier === undefined ? '1' : expandDefinition(multiplier).join('').trim()
        const spanText = expandDefinition(rawGroup()).join('').trim()
        const span = Number(spanText)
        if (!/^\d+$/.test(spanText) || span < 1 || span > 6000 - columnsInRow)
          throw new MathParseError('Invalid column span in \\hdotsfor')
        if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)$/.test(scale) || !Number.isFinite(Number(scale)))
          throw new MathParseError('Invalid dot spacing multiplier in \\hdotsfor')
        if (!stops.includes(peek())) throw new MathParseError('\\hdotsfor must occupy a whole cell')
        if (columnArray && columnsInRow + span > layout.columns.length)
          throw new MathParseError('\\hdotsfor spans past the array columns')
        cells.push({ span, spacing: Number(scale) })
        columnsInRow += span
      }
      else if (proseCases && columnsInRow === 1) {
        const properties = mathFontActive || textFont ? textFontCSS({ ...normalFont, ...textFont }) : ''
        cells.push(inMode('text', () => {
          expand()
          return parseTextArgument(properties, false, undefined, boundary, stops)
        }))
        columnsInRow++
      }
      else {
        cells.push(inScope(() => row(stops, false, false, undefined, followsOrdinary)))
        columnsInRow++
      }
      const separator = take()
      if (separator === '&') {
        if (subarray || gathered) throw new MathParseError('Too many columns in math stack')
        if (environment === 'split' && columnsInRow >= 2) throw new MathParseError('Too many columns in split')
        if (proseCases && columnsInRow === 2) throw new MathParseError(`Too many columns in ${environment}`)
        if (columnArray && columnsInRow === layout.columns.length) strictViolation('textEnv', 'Too few columns in the array specification')
        continue
      }
      if (environment === 'split' && columnsInRow > 2) throw new MathParseError('Too many columns in split')
      if (pairs && columnsInRow > pairs * 2) throw new MathParseError('Too many alignment columns')
      const spacing = allowIntertext && intertextCommands.get(separator)
      const arrow = allowArrow && separator === arrowBetweenLines
      const flushBelow = separator === flushSpaceBelow
      const continuation = flushAbove || flushBelow
      const lineBreak = Boolean(spacing) || arrow || separator === '\\\\' || separator === '\\newline' || separator === '\\cr'
        || separator === flushSpaceAbove || flushBelow
      const gap = arrayRowGap(separator)
      if (tagless && tagState.label !== undefined) throw new MathParseError('Equation tags are not allowed in xxalignat')
      if (continuation && rowTags && (tagState.label !== undefined || tagState.key !== undefined || tagState.raise !== undefined))
        throw new MathParseError('Equation tags belong on an equation line')
      const label = rowTags ? nextTag(automatic && !arrow && !continuation) : undefined
      if (cells.length > 1 || cells[0] || label !== undefined || rows.length === 0 || lineBreak) {
        rows.push({ cells, columns: columnsInRow, label, before: rules, gap, raise: tagState.raise, flushAbove, flushBelow, frames })
        rules = []
      }
      cells = []
      frames = undefined
      columnsInRow = 0
      flushAbove = separator === flushSpaceAbove
      if (rowTags) tagState = { suppressed: false }
      if (spacing) intertext(spacing)
      if (arrow) addArrow()
      if (separator === '\\end' && literalGroup() === closing) {
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
    const hasArrows = rows.some(entry => entry.arrow)
    const hasContinuations = rows.some(entry => entry.flushAbove || entry.flushBelow)
    const hasFrames = rows.some(entry => entry.frames)
    const leqno = state?.options.leqno === true
    const authoredColumns = Math.max(layout.columns.length, Number(hasIntertext), ...rows.map(entry => entry.columns))
    const columnCount = spreadEnvironment ? Math.max(pairs * 2, 2 * Math.ceil(authoredColumns / 2)) : authoredColumns
    // A single alignment pair has no intercolumn space to distribute.
    const spread = spreadEnvironment && columnCount > 2 ? environment.startsWith('xalignat') ? 'balanced' : 'full' : ''
    if (spread === 'full') fullWidthAlignment = true
    const displayRows = (tags || hasIntertext || hasArrows || hasContinuations || hasFrames || emphasized || spread || jot !== undefined) && rowTags && display && depth === 1
    const grid = aligned || cases || alignment.length > 0 || displayRows || gatherAlignment !== '' || position !== 'c' || jot !== undefined
    const rowRules = rows.reduce((count, entry) => count + entry.before.length, rules.length)
    const columnRules = layout.columns.reduce((count, column) => count + column.before.length, layout.after.length)
    const rectangular = grid || columnArray || tags || rowRules > 0 || rows.some(row => row.columns > row.cells.length)
    if (rectangular && columnCount * Math.max(1, rows.length) > 6000) throw new MathParseError('Math array has too many cells')
    if (rowRules * columnCount + columnRules * rows.length > 24000)
      throw new MathParseError('Math array has too many rules')
    const alignmentAt = (index: number) => aligned ? (index % 2 ? 'left' : 'right') : alignment[index] ?? alignment.at(-1) ?? (cases ? 'left' : gatherAlignment)
    const columnAlignment = Array.from({ length: columnCount }, (_, index) => alignmentAt(index) || 'center')
    if (tags) {
      if (leqno) columnAlignment.unshift('left')
      else columnAlignment.push('right')
    }
    const align = aligned || cases || alignment.length || tags || gatherAlignment ? ` columnalign="${columnAlignment.join(' ')}"` : ''
    const moreRowSpace = aligned || gathered || cases
    const pad = jot !== undefined ? '0' : compact ? '0.06' : ((moreRowSpace ? 0.125 : 0.14) * stretch).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
    const lines = compact ? '' : ' data-equation-lines'
    const classes = [compact && 'math-compact-array', grid && 'math-alignment-grid', displayRows && 'math-display-grid'].filter(Boolean).join(' ')
    const layoutClass = classes ? ` class="${classes}"` : ''
    const amsAlignment = (aligned || gathered) ? ` data-equation-environment="${environment}"` : ''
    const rowSpacing = amsAlignment && (emphasized || hasIntertext || (hasArrows && displayRows) || hasContinuations || hasFrames || jot !== undefined || stretch !== 1 || rows.some(row => row.gap !== undefined)) ? ' data-equation-row-spacing' : ''
    const tagPlacement = tags ? ` data-equation-tags="${leqno ? 'left' : 'right'}"` : ''
    const spreadLayout = spread ? ` data-equation-spread="${spread}"` : ''
    const gridTracks = spread ? `--math-pair-gaps:${columnCount / 2 - 1}` : `--math-columns:${columnCount}`
    const gridLayout = displayRows
      ? ` style="${gridTracks}"${tagPlacement}${spreadLayout}${options?.fleqn && spread !== 'full' ? ' data-equation-flush' : ''}`
      : grid ? ` style="--math-columns:${columnAlignment.length}"` : ''
    const spacingOptions = mathtoolsOptions
    const dotAbove = spacingOptions?.get('shortvdotsadjustabove')
    const dotBelow = spacingOptions?.get('shortvdotsadjustbelow')
    // Keep the default compact geometry. A larger trim subtracts space relative
    // to the Mathtools defaults (2.15 and 1 times the original 3pt jot).
    const compactAbove = dotAbove && dotAbove !== '6.45pt' ? `calc(6.45pt - ${dotAbove})` : undefined
    const compactBelow = dotBelow && dotBelow !== '3pt' ? `calc(3pt - ${dotBelow})` : undefined

    function proseMargins(spacing: IntertextKind): string {
      if (!spacingOptions) return ''
      const command = spacing === 'short' ? 'shortintertext' : 'intertext'
      if (spacingOptions.get(`original-${command}`) === 'true') return equationRowMargins(jot, jot)
      const above = spacingOptions.get(`above-${command}-sep`)
      const below = spacingOptions.get(`below-${command}-sep`)
      if (spacing === 'normal') return equationRowMargins(above, below)
      return equationRowMargins(
        above && above !== '3pt' ? `calc(${above} - 3pt)` : undefined,
        below && below !== '3pt' ? `calc(${below} - 3pt)` : undefined,
      )
    }

    return (style) => {
      const tableCellStyle = compact ? 2 : ordinaryCellStyle
      const prose = (index: number) => intertexts.get(index)?.map(({ content, spacing }) =>
        `<mtr data-equation-intertext="${spacing}"${proseMargins(spacing)}><mtd${emphasized ? emphasisEdges : ''} columnspan="${columnCount + Number(tags)}"><mrow><mrow>${renderMarkup(content, 1)}</mrow></mrow></mtd></mtr>`).join('') ?? ''
      const markup = rows.map((entry, rowIndex) => {
        const flushTop = entry.flushAbove || (!intertexts.has(rowIndex) && rows[rowIndex - 1]?.flushBelow)
        const flushBottom = entry.flushBelow || (!intertexts.has(rowIndex + 1) && rows[rowIndex + 1]?.flushAbove)
        const trim: string[] = []
        if (jot !== undefined) trim.push('padding-block:0em')
        if (flushTop) trim.push('padding-top:0em')
        if (flushBottom) trim.push('padding-bottom:0em')
        const cell = tags ? equationNumberCell(entry.label, undefined, entry.raise, trim) : ''
        // MathML Core browsers use CSS for cell alignment and visible rules.
        let cellIndex = 0
        let nextColumn = 0
        const content = Array.from({ length: rectangular ? columnCount : entry.columns }, (_, index) => {
          if (index < nextColumn) return ''
          const value = entry.cells[cellIndex++]
          const dots = typeof value === 'object' ? value : undefined
          const span = dots?.span ?? 1
          nextColumn += span
          const align = alignmentAt(index)
          const cellStyle = proseCases && index === 1 ? 1 : tableCellStyle
          const styling: string[] = []
          const frameStart = entry.frames?.get(index)
          const previousFrame = entry.frames?.get(index - 1)
          const frameEnd = previousFrame?.span === 2 ? previousFrame : undefined
          const framing = frameStart ?? frameEnd
          if (align) styling.push(`text-align:${align}`)
          if (grid && align !== 'left')
            styling.push(`--math-cell-align:${align === 'right' ? 'end' : 'center'}`)
          if (aligned || cases || displayRows || inner && gathered && grid) {
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
          if (dots) {
            // TeX places 1.5mu of scaled space on each side of a period.
            styling.push(`--math-dot-step:${Number((0.26 + dots.spacing / 6).toFixed(4))}em`)
            if (grid) styling.push(`grid-column:span ${span}`)
          }
          if (rowRules || columnRules) {
            styling.push(...arrayRuleStyles([
              ['left', layout.columns[index]?.before],
              ['right', index + span === columnCount ? layout.after : undefined],
              ['top', entry.before],
              ['bottom', rowIndex === rows.length - 1 ? rules : undefined],
            ], minRule))
          }
          if (entry.arrow) styling.push('padding-block:0em')
          else if (compact || stretch !== 1 || moreRowSpace) styling.push(`padding-block:${pad}em`)
          const inset = 'var(--math-frame-inset)'
          const pairedGap = !spread && !paired && index > 0 && index % 2 === 0
          if (framing) styling.push(...framing.style)
          if (frameStart) styling.push(`padding-inline-start:${pairedGap ? `calc(1em + ${inset})` : inset}`)
          if (framing) styling.push(`padding-block:calc(${pad}em + ${inset})`)
          if (flushTop) styling.push('padding-top:0em')
          if (flushBottom) styling.push('padding-bottom:0em')
          if (jot === undefined && entry.gap) styling.push(`padding-bottom:max(0px,calc(${flushBottom ? '0' : pad}em${framing && !flushBottom ? ` + ${inset}` : ''} + ${entry.gap}))`)
          const settings = styling.length ? ` style="${styling.join(';')}"` : ''
          const cellAttrs = dots ? ` class="math-array-dots" columnspan="${span}"` : ''
          const markup = dots ? '<mo>…</mo>' : renderMarkup(typeof value === 'object' ? '' : value ?? '', cellStyle)
          const sized = compact || style === cellStyle ? markup : mathSize(cellStyle, markup)
          const frame = frameStart ? `<mspace data-equation-frame="${frameStart.span}" aria-hidden="true" width="0"/>` : ''
          const edges = emphasized ? (index === 0 ? ' data-empheq-start' : '')
            + (index + span === columnCount ? ' data-empheq-end' : '') : ''
          return `<mtd${cellAttrs}${edges}${settings}>${grid ? `<mrow>${sized}</mrow>` : sized}${frame}</mtd>`
        }).join('')
        const arrow = entry.arrow ? ` data-equation-arrow="${entry.arrow}"` : ''
        const continuation = entry.flushAbove || entry.flushBelow ? ' data-equation-continuation' : ''
        const frameRow = entry.frames ? ' data-equation-frame-row' : ''
        const following = rows[rowIndex + 1]
        const spreadGap = following && !flushBottom && !entry.arrow && !following.arrow && !intertexts.has(rowIndex + 1) ? jot : undefined
        const rowGap = jot === undefined ? undefined : equationRowGap(spreadGap, entry.gap)
        const margins = equationRowMargins(entry.flushAbove ? compactAbove : undefined, equationRowGap(rowGap, entry.flushBelow ? compactBelow : undefined))
        return `${prose(rowIndex)}<mtr${arrow}${continuation}${frameRow}${margins}>${leqno ? cell : ''}${content}${leqno ? '' : cell}</mtr>`
      }).join('') + prose(rows.length)
      const baseline = position === 't' ? ' align="baseline 1"' : position === 'b' ? ' align="baseline -1"' : ''
      const matrix = `<mtable${lines} data-math-array${align}${layoutClass}${gridLayout}${amsAlignment}${rowSpacing}${baseline}>${markup}</mtable>`
      const sizedTable = compact ? mathSize(tableCellStyle, matrix) : matrix
      const table = cramped ? renderMarkup(crampedMath(sizedTable), style) : sizedTable
      if (displayRows) return table
      // An inline grid's natural baseline comes from its first row. Use a
      // MathML table or the grid's last baseline for the other placements.
      const placement = position === 'b' ? `<mrow class="math-alignment-bottom">${table}</mrow>`
        : position === 'c' && grid && (inner || cases || style !== 0)
          ? `<mtable class="math-alignment-axis"><mtr><mtd>${table}</mtd></mtr></mtable>`
          : table
      const caseBrace = cases ? ` data-math-cases="${left ? 'left' : 'right'}"` : ''
      return `<mrow${caseBrace}>${fence(left)}${placement}${fence(right)}</mrow>`
    }
  }

  function formulaMarkup(expression: string, tex: string): string {
    const flush = display && !fullWidthAlignment && state?.options.fleqn === true
    const label = nextTag(false)
    const single = emphasizedDisplay === 'equation'
    const markup = label === undefined && !single ? expression
      : taggedDisplay(expression, label ?? '', state?.options.leqno === true, flush, tagState.raise, single)
    const layoutStyle = flush ? 'display:block;padding-inline-start:2em;text-align:start'
      : label === undefined ? '' : 'display:block;text-align:center'
    const styles = [layoutStyle, minRule ? `--math-min-rule:${minRule}em` : ''].filter(Boolean).join(';')
    const layout = styles ? ` style="${styles}"` : ''
    const formula = `<math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ''}${layout}><semantics>${markup}<annotation encoding="application/x-tex">${escapeHtml(tex)}</annotation></semantics></math>`
    return shortDisplaySkip ? `<div class="math-short-display">${formula}</div>` : formula
  }

  function emphasisOptions(raw: string[]): ReadonlyMap<string, string[]> {
    const settings = new Map(emphasisDefaults)
    withTokens([...raw, ','], () => {
      space()
      while (tokens[cursor] !== boundary) {
        const assignment = delimitedArgument([','])
        space()
        if (!assignment.some(token => !texWhitespace.test(tokenText(token)))) continue
        const equals = assignment.indexOf('=')
        const key = assignment.slice(0, equals).map(tokenText).join('').trim()
        if (equals < 1 || !/^(?:box|outerbox|marginbox|innerbox|left|right)$/.test(key))
          throw new MathParseError(`Unsupported empheq option: ${assignment.map(tokenText).join('').trim()}`)
        const body = assignment.slice(equals + 1)
        const value = withTokens(body, () => {
          space()
          if (tokenText(tokens[cursor] ?? '') !== '{') return body
          const unwrapped = rawGroup()
          space()
          return tokens[cursor] === boundary ? unwrapped : body
        })
        const option = key === 'outerbox' ? 'box' : key
        if (option === 'box') settings.delete('marginbox')
        else if (option === 'marginbox') settings.delete('box')
        if (value.some(token => !texWhitespace.test(tokenText(token)))) settings.set(option, value)
        else settings.delete(option)
      }
    })
    return settings
  }

  function empheqDisplay(tex: () => string): string {
    if (!display) throw new MathParseError('empheq requires display math')
    return inScope(() => {
      const raw = rawBracket()
      const settings = raw ? emphasisOptions(raw) : emphasisDefaults
      const [environment, pairs, extra] = expandDefinition(rawGroup()).join('').replace(/\s/g, '').split('=')
      if (!emphasisEnvironments.test(environment) || extra !== undefined || environment.startsWith('alignat') !== (pairs !== undefined))
        throw new MathParseError('Invalid empheq alignment')
      const margin = settings?.has('marginbox')
      if (margin && options?.fleqn !== true) throw new MathParseError('empheq marginbox requires fleqn')
      function box(key: string, side: string): string {
        const option = settings?.get(key)
        if (!option) return ''
        const style = alignedBoxStyle(option).join(';')
        return `<div class="math-empheq-box" data-empheq-box="${side}"${style ? ` style="${style}"` : ''} aria-hidden="true"></div>`
      }
      function adornment(side: 'left' | 'right'): string {
        const value = settings?.get(side)
        if (!value) return ''
        const previousTag = tagState
        tagState = { suppressed: false }
        emphasisSide = true
        try {
          const content = withTokens(value, () => inScope(() => renderMarkup(row([boundary]), 0)))
          return `<div class="math-empheq-side" data-empheq-side="${side}"><math xmlns="http://www.w3.org/1998/Math/MathML"><semantics><mrow>${content}</mrow></semantics></math></div>`
        }
        finally {
          emphasisSide = false
          tagState = previousTag
        }
      }
      const decorations = box(margin ? 'marginbox' : 'box', 'outer') + box('innerbox', 'inner') + adornment('left') + adornment('right')
      const probe = decorations.includes(' data-empheq-measure') ? emphasisAxisProbe : ''
      const single = environment === 'equation' || environment === 'equation*'
      emphasizedDisplay = decorations ? (single ? 'equation' : 'alignment') : undefined
      depth++
      try {
        const content = renderMarkup(matrix(environment, 'empheq', pairs), 0)
        const formula = formulaMarkup(`<mrow>${content}</mrow>`, tex())
        return decorations ? `<div class="math-empheq"${margin ? ' data-empheq-marginbox' : ''}>${decorations}${probe}${formula}</div>` : formula
      }
      finally {
        depth--
        emphasizedDisplay = undefined
      }
    })
  }

  function displayGroup(environment: 'subequations' | 'spreadlines', level = 0): string {
    if (!display) throw new MathParseError(`${environment} requires display math`)
    if (level > 100) throw new MathParseError('Display math groups are nested too deeply')
    const numbered = environment === 'subequations'
    const previousNumbering = nextSubequationNumber
    const previousTag = tagState
    const previousAlignment = fullWidthAlignment
    const previousShortDisplaySkip = shortDisplaySkip
    let key: string | undefined
    let marker = ''
    const blocks: string[] = []
    const pins: string[] = []
    const begin = () => {
      const parent = ++equationNumber
      const numbering = referenceMarkup().group?.(parent, key)
      let member = 0
      marker = numbering?.marker ?? ''
      nextSubequationNumber = (key, onlyReferenced, form) => {
        if (member === 26) throw new MathParseError('Too many numbered subequations')
        const suffix = String.fromCharCode(97 + member++)
        const numbered = numbering?.member(suffix, key, onlyReferenced, form)
        if (numbered !== undefined || onlyReferenced) return numbered ?? ''
        const value = `${parent}${suffix}`
        return form ? applyEquationTagForm(form, tag('mtext', value)) : tag('mtext', `(${value})`)
      }
    }
    try {
      return inScope(() => {
        if (!numbered) equationJot = readDimension()
        while (peek()) {
          const start = cursor
          const token = take()
          if (token === '\\relax' || declareMacro(token)) continue
          if (token === '\\noeqref') {
            pins.push(equationReference(token))
            continue
          }
          if (numbered && token === '\\label' && !blocks.length) {
            const label = equationKey()
            key ??= label || undefined
            continue
          }
          if (token === '\\end') {
            if (literalGroup() !== environment) break
            if (!level && peek()) throw new MathParseError(`${environment} must occupy the display`)
            if (numbered && !nextSubequationNumber) begin()
            return `<div class="math-${environment}">${marker}${pins.join('')}${blocks.join('')}</div>`
          }
          if (numbered && !nextSubequationNumber) begin()
          const child = token === '\\begin' ? literalGroup() : undefined
          if (child === 'spreadlines' || (child === 'subequations' && !nextSubequationNumber)) {
            blocks.push(displayGroup(child, level + 1))
            continue
          }
          tagState = { suppressed: false }
          fullWidthAlignment = false
          shortDisplaySkip = false
          if (child === 'empheq') {
            blocks.push(empheqDisplay(() => tokens.slice(start, cursor).map(tokenText).join('')))
            continue
          }
          // Each child is a complete display, with its own tag and row layout.
          const content = inScope(() => {
            if (token === '\\[') {
              const expression = row(['\\]'], false, true)
              if (take() !== '\\]') throw new MathParseError(`Unclosed display inside ${environment}`)
              return expression
            }
            if (child === undefined) throw new MathParseError(`Expected a display environment inside ${environment}`)
            if (!/^(?:(?:equation|align|alignat|flalign|xalignat|gather|multline)\*?|xxalignat|CD)$/.test(child))
              throw new MathParseError(`Invalid ${environment} display: ${child}`)
            depth++
            try { return matrix(child) }
            finally { depth-- }
          })
          const tex = tokens.slice(start, cursor).map(tokenText).join('')
          blocks.push(formulaMarkup(`<mrow>${renderMarkup(content, 0)}</mrow>`, tex))
        }
        throw new MathParseError(`Unclosed math environment: ${environment}`)
      })
    }
    finally {
      nextSubequationNumber = previousNumbering
      tagState = previousTag
      fullWidthAlignment = previousAlignment
      shortDisplaySkip = previousShortDisplaySkip
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

  function setMathtoolsOptions(): void {
    const selected = new Map(mathtoolsOptions)
    for (const assignment of expandDefinition(rawGroup()).join('').split(',')) {
      if (!assignment.trim()) continue
      const equals = assignment.indexOf('=')
      const name = (equals < 0 ? assignment : assignment.slice(0, equals)).trim()
      const key = name.replace(/^(above|below)(?:shortintertextdim|-short-intertext-(?:dim|sep))$/, '$1-shortintertext-sep')
      const value = equals < 0 ? undefined : assignment.slice(equals + 1).trim().replace(/^\{([^{}]*)\}$/, '$1').trim()
      if (mathtoolsBooleanOptions.has(key)) {
        if (value !== undefined && value !== 'true' && value !== 'false')
          throw new MathParseError(`Expected true or false for Mathtools option ${name}`)
        selected.set(key, value ?? 'true')
        continue
      }
      if (!mathtoolsSpacingOptions.has(key)) throw new MathParseError(`Unsupported Mathtools option: ${name}`)
      const register = /^([+-]?)\s*(\d+(?:\.\d*)?|\.\d+)?\s*\\(origjot|jot)$/.exec(value ?? '')
      let length = value
      if (register) {
        const base = (register[3] === 'jot' && equationJot) || '3pt'
        const multiplier = Number(register[1] + (register[2] ?? '1'))
        const magnitude = (Number.parseFloat(base) * multiplier).toFixed(12).replace(/\.?0+$/, '')
        length = magnitude + /[a-z]+$/.exec(base)![0]
      }
      const size = length === undefined ? undefined : dimension(length)
      if (size === undefined) throw new MathParseError(`Invalid math dimension for Mathtools option ${name}`)
      selected.set(key, size)
    }
    mathtoolsOptions = selected
  }

  function declareTagForm(command: string): void {
    const name = equationKey()
    if (!name || /\s/.test(name)) throw new MathParseError('Invalid equation tag form name')
    const exists = name === 'default' || tagForms?.has(name)
    if (command === '\\usetagform') {
      if (!exists) throw new MathParseError(`Unknown equation tag form: ${name}`)
      tagFormName = name
      return
    }
    if (exists && command === '\\newtagform') throw new MathParseError(`Equation tag form is already defined: ${name}`)
    if (!exists && command === '\\renewtagform') throw new MathParseError(`Unknown equation tag form: ${name}`)
    const inner = rawBracket() ?? []
    const left = rawGroup('Missing left equation tag delimiter')
    const right = rawGroup('Missing right equation tag delimiter')
    tagForms = new Map(tagForms).set(name, { left, right, inner })
  }

  function readEmphasisFactor(): number {
    let raw: string
    if (peek() === '{') raw = expandDefinition(rawGroup()).join('').trim()
    else {
      const sign = peek()
      raw = sign === '+' || sign === '-' ? take() : ''
      space()
      for (expand(false); /^\d$/.test(tokenValue(tokens[cursor] ?? '')); expand(false))
        raw += tokenValue(tokens[cursor++])
    }
    const value = Number(raw.replace(/\s/g, ''))
    if (!/^[+-]?\s*\d+$/.test(raw) || !Number.isSafeInteger(value) || Math.abs(value) > 2_147_483_647)
      throw new MathParseError('Expected an integer for \\EmphEqdelimiterfactor')
    return value
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
    if (tagFormDeclaration.test(token)) {
      declareTagForm(token)
      return true
    }
    if (name === 'mathtoolsset') {
      setMathtoolsOptions()
      return true
    }
    if (name === 'empheqset') {
      emphasisDefaults = emphasisOptions(rawGroup())
      return true
    }
    if (name === 'DeclareLeftDelimiter' || name === 'DeclareRightDelimiter') {
      const affix = rawBracket()
      const target = literalGroup().trim()
      if (!controlWord.test(target)) throw new MathParseError(`Expected a delimiter command in ${token}`)
      for (const [command, macro] of emphasisDelimiters(target, name === 'DeclareLeftDelimiter', affix))
        assign(command, macro)
      return true
    }
    if (token === emphasisFactorCommand || token === emphasisShortfallCommand) {
      if (peek() === '=') take()
      if (token === emphasisFactorCommand) emphasisFactor = readEmphasisFactor()
      else emphasisShortfall = readDimension()
      return true
    }
    if (name === 'setlength') {
      const register = literalGroup().trim()
      if (register === '\\jot') equationJot = readDimension()
      else if (register === emphasisShortfallCommand) emphasisShortfall = readDimension()
      else throw new MathParseError('Unsupported math length register')
      return true
    }
    function definitionTarget(grouped = false): string {
      space()
      const target = grouped ? literalGroup().trim() : tokenText(tokens[cursor++] ?? '')
      if (!target || (!controlSequence.test(target) && !activeCharacter.test(target)))
        throw new MathParseError(`Invalid macro name in ${token}`)
      return target
    }
    if (name.startsWith('DeclarePairedDelimiter')) {
      const target = definitionTarget(true)
      if (!controlSequence.test(target)) throw new MathParseError(`Expected a command name in ${token}`)
      if (defined(target)) throw new MathParseError(`Macro ${target} is already defined`)
      const extended = name !== 'DeclarePairedDelimiter'
      const hasAffixes = name === 'DeclarePairedDelimiterXPP'
      const arityTokens = extended ? rawBracket() : undefined
      const count = arityTokens && expandDefinition(arityTokens).join('').trim()
      if (extended && !/^[1-9]$/.test(count ?? '')) throw new MathParseError(`Expected an argument count from 1 to 9 in ${token}`)
      const before = hasAffixes ? rawGroup() : []
      const opening = rawGroup()
      const closing = rawGroup()
      const after = hasAffixes ? rawGroup() : []
      const template = extended ? { arity: Number(count), before, body: rawGroup('Missing paired delimiter body'), after } : undefined
      assign(target, { pairedDelimiter: { opening, closing, template } })
      return true
    }
    if (name === 'MakeAboxedCommand') {
      const target = definitionTarget(true)
      if (!controlSequence.test(target)) throw new MathParseError(`Expected a command name in ${token}`)
      if (defined(target)) throw new MathParseError(`Macro ${target} is already defined`)
      const wrapper = rawGroup('Missing alignment box wrapper')
      assign(target, plainMacro([customAlignedBox, '{', ...wrapper, '}', '{', '#1', '}'], 1))
      return true
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
    if (token === tagValueToken) return { markup: equationTagValue }
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
    if (equationReferences.has(token)) return { markup: equationReference(token) }
    const name = token.slice(1)
    if (token === swapAboveDisplaySkip) throw new MathParseError(`${token} must start a top-level align, alignat, gather, or full-width AMS alignment`)
    if (token === emphasisDelimiter) {
      if (!emphasisSide) throw new MathParseError('An empheq delimiter requires a left or right decoration')
      const size = take() === '1' ? 'inner' : 'body'
      const input = expandDefinition(rawGroup()).filter(token => !texWhitespace.test(token))
      if (input.length !== 1) throw new MathParseError('Expected one glyph for an empheq delimiter')
      const symbol = delimiter(input[0], 'empheq')
      if (symbol === '.') return { markup: '' }
      const factor = emphasisFactor === 950 ? '' : ` data-empheq-factor="${emphasisFactor}"`
      const shortfall = emphasisShortfall ? ` style="--empheq-shortfall:${emphasisShortfall}"` : ''
      return { markup: `<mrow class="math-empheq-delimiter"><mo stretchy="true" symmetric="false" data-empheq-delimiter="${size}"${factor}${shortfall} lspace="0em" rspace="0em">${escapeHtml(symbol)}</mo><mspace width="0"/></mrow>` }
    }
    if (token === arrowBetweenLines) throw new MathParseError(`${token} requires an align, alignat, aligned, or alignedat environment`)
    if (token === flushSpaceAbove || token === flushSpaceBelow) throw new MathParseError(`${token} requires an alignment environment`)
    if (token === alignedBox || token === customAlignedBox) throw new MathParseError('\\Aboxed must start an alignment cell')
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
    if (name === 'mathmbox' || name === 'mathmakebox') return { markup: mathBox(name) }
    if (name === 'vcenter') {
      return { markup: xml`<mtable class="math-vcenter"><mtr><mtd>${argument()}</mtd></mtr></mtable>` }
    }
    const lap = /^(math|cramped)?([lcr])lap$/.exec(name)
    if (lap || name === 'cramped') {
      if (lap && !lap[1]) return { markup: overlap(lap[2], textArgument()) }
      const cramped = lap?.[1] === 'cramped' || name === 'cramped'
      const choice = expandDefinition(rawBracket() ?? []).join('').trim()
      if (choice && !Object.hasOwn(styleCommands, choice))
        throw new MathParseError(cramped ? 'Invalid cramped math style' : 'Invalid math lap style')
      const content = argument()
      const styled = choice ? (style: MathStyle) => {
        const forced = styleCommands[choice]
        const body = renderMarkup(content, forced)
        return forced === style ? body : mathSize(forced, body)
      } : content
      const markup = cramped ? crampedMath(styled) : styled
      return { markup: lap ? overlap(lap[2], markup, cramped) : markup }
    }
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
    if (name === '@splitfrac') {
      const style = literalGroup()
      if (style !== '0' && style !== '1') throw new MathParseError('Invalid split fraction style')
      return { markup: fraction({ forced: style === '0' ? 0 : 1, thickness: '0', align: 'left', denominatorAlign: 'right' }) }
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
    if (name === 'nonscript') {
      const next = peek()
      const command = next.startsWith('\\') ? next.slice(1) : ''
      if (next !== '~' && !Object.hasOwn(spacing, command) && !spacingCommands.has(command)) return { markup: '' }
      cursor++
      const { markup } = atom(next)
      return {
        markup: style => style < 2 ? renderMarkup(markup, style) : '',
        fragment: style => style < 2 ? [{ token: next, markup }] : [],
      }
    }
    if (spacingCommands.has(name)) return { markup: spacingMarkup(name) }
    if (name === 'prescript') {
      const upper = inScript(argument())
      const lower = inScript(argument())
      return { markup: xml`<mmultiscripts>${argument()}<mprescripts/>${lower}${upper}</mmultiscripts>` }
    }
    if (name === 'sideset') return sidedOperator()
    if (name === 'adjustlimits') return adjustLimits()
    if (name === 'smashoperator') return smashedOperator()
    if (name === 'sqrt' || name === 'root') {
      const index = name === 'root' ? delimitedArgument(['\\of']) : rawBracket()
      if (index === undefined) return { markup: xml`<msqrt>${argument(true)}</msqrt>` }
      const degree = radicalDegree(index)
      return { markup: xml`<mroot>${argument()}${degree}</mroot>` }
    }
    if (name === 'leftroot' || name === 'uproot') throw new MathParseError(`${token} belongs at the start of a root index`)
    if (name === 'hdotsfor') throw new MathParseError('\\hdotsfor must occupy a whole matrix or array cell')
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
    if (name === 'mathstrut' || name === 'xmathstrut') return { markup: mathStrut(name === 'xmathstrut') }
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
    let first = peek()
    while ((display && (first === '\\relax' || macroDeclaration.test(first))) || tagFormDeclaration.test(first)) {
      take()
      if (first !== '\\relax') declareMacro(first)
      first = peek()
    }
    const start = cursor
    const environment = first === '\\begin' ? (take(), literalGroup()) : undefined
    const group = environment === 'subequations' || environment === 'spreadlines'
    if (!group && environment !== 'empheq') cursor = start
    let content: string
    if (group) content = displayGroup(environment)
    else if (environment === 'empheq') {
      content = empheqDisplay(() => source)
      if (peek()) throw new MathParseError('empheq must occupy the display')
    }
    else {
      const body = renderMarkup(row([], false, true), display ? 0 : 1)
      const pinsOnly = first === '\\noeqref' && /^(?:<mrow data-pending-equation-pin="[^"]+"><\/mrow>)*$/.test(body)
      content = pinsOnly ? body : formulaMarkup(`<mrow>${body}</mrow>`, source)
    }
    return localReferences ? localReferences.resolve(localReferences.numberSlides([content])[0]) : content
  }
  catch (error) {
    if (!(error instanceof MathParseError)) throw error
    return parseFailure(error)
  }
}
