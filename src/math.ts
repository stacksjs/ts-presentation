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
  forall: '∀', exists: '∃', neg: '¬', to: '→', mapsto: '↦', rightarrow: '→', leftarrow: '←',
  leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', iff: '⇔',
  sum: '∑', prod: '∏', int: '∫', iint: '∬', oint: '∮', partial: '∂', nabla: '∇', infty: '∞',
  emptyset: '∅', ldots: '…', dots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', angle: '∠',
  mid: '∣', parallel: '∥', perp: '⊥', circ: '∘', ast: '∗', setminus: '∖',
  coprod: '∐', bigcup: '⋃', bigcap: '⋂', bigvee: '⋁', bigwedge: '⋀',
  iiint: '∭', oiint: '∯', imath: 'ı', jmath: 'ȷ', ell: 'ℓ', hbar: 'ℏ',
  Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', empty: '∅', cong: '≅', ll: '≪', gg: '≫',
  uparrow: '↑', downarrow: '↓', longrightarrow: '⟶', longleftarrow: '⟵',
  otimes: '⊗', oplus: '⊕', odot: '⊙', wedge: '∧', vee: '∨', colon: ':',
}
const functions = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'exp', 'min', 'max', 'argmin', 'argmax', 'det', 'lim', 'sup', 'inf', 'gcd', 'mod', 'Pr'])
const big = new Set(['sum', 'prod', 'coprod', 'bigcup', 'bigcap', 'bigvee', 'bigwedge', 'lim', 'min', 'max', 'argmin', 'argmax', 'sup', 'inf'])
const variants: Record<string, string> = {
  mathbf: 'bold', mathbb: 'double-struck', mathrm: 'normal', mathit: 'italic',
  mathsf: 'sans-serif', mathtt: 'monospace', mathcal: 'script', mathfrak: 'fraktur', boldsymbol: 'bold-italic',
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
  '\\lVert': '‖', '\\rVert': '‖', '\\lvert': '|', '\\rvert': '|',
  '\\lfloor': '⌊', '\\rfloor': '⌋', '\\lceil': '⌈', '\\rceil': '⌉', '\\vert': '|', '\\Vert': '‖', '\\|': '‖',
}
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

function tokenize(source: string): string[] {
  return source.match(/\\[A-Z@]+|\\[^A-Z@\r\n]|%[^\r\n]*(?:\r?\n[ \t]*|$)|#[1-9]|\s+|./giu)
    ?.filter(token => !token.startsWith('%')) ?? []
}

type MathStyle = 0 | 1 | 2 | 3
interface Macro { body: string[], parameters: string[][], prefix: string[], optional?: string[] }
interface MathState { globals: Map<string, Macro>, options: KatexOptions }

export function createMathRenderer(options: KatexOptions = {}): (source: string, display: boolean) => string {
  const state: MathState = { globals: new Map(), options }
  return (source, display) => renderMath(source, display, options.macros, state)
}

function safeColor(value: string): string {
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
  text: '', textnormal: 'font-family:serif;font-weight:normal;font-style:normal', textrm: 'font-family:serif',
  textsf: 'font-family:sans-serif', texttt: 'font-family:monospace',
  textbf: 'font-weight:bold', textmd: 'font-weight:normal', textup: 'font-style:normal',
  textit: 'font-style:italic', emph: 'font-style:italic',
}
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
  markup: string
  limits?: boolean
  brace?: 'lower' | 'upper'
}

type Alignment = 'left' | 'center' | 'right'
type ArrayRule = 'solid' | 'dashed' | 'double'
const alignments: Record<string, Alignment> = { l: 'left', c: 'center', r: 'right' }
interface ArrayColumn { align: Alignment, before?: ArrayRule }
interface ArrayRow { cells: string[], label: string, before?: ArrayRule, gap?: string }

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

function fence(token: string, stretchy = true): string {
  if (!token || token === '.') return ''
  return `<mo stretchy="${stretchy}">${escapeHtml(delimiters[token] ?? token)}</mo>`
}

const styleCommands: Record<string, MathStyle> = {
  '\\displaystyle': 0, '\\textstyle': 1, '\\scriptstyle': 2, '\\scriptscriptstyle': 3,
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
  let equationNumber = 0
  let style: MathStyle = display ? 0 : 1

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

  function withStyle<T>(value: MathStyle, render: () => T): T {
    const before = style
    style = value
    try { return render() }
    finally { style = before }
  }

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

  function scriptStyle(): MathStyle {
    return Math.max(2, Math.min(3, style + 1)) as MathStyle
  }

  function argument(): string {
    if (depth++ > 100) throw new Error('Math arguments are nested too deeply')
    const markup = atom(take()).markup
    depth--
    return markup
  }

  function bracket(): string | undefined {
    return rawBracket()?.join('')
  }

  function readDimension(): string {
    space()
    if (tokens[cursor] === '{') {
      const length = dimension(literalGroup())
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

  function textArgument(name: string): string {
    if (depth++ > 100) throw new Error('Math text is nested too deeply')
    const properties = textFonts[name]
    const wrap = (markup: string) => properties ? `<mrow style="${properties}">${markup}</mrow>` : markup
    expand()
    if (tokens[cursor] !== '{') {
      const token = tokens[cursor++]
      if (!token || token === boundary || token === '}') throw new Error('Missing math text argument')
      depth--
      return wrap(tag('mtext', textSymbols[token] ?? token.replace(/^\\([%$#&_{} ])$/, '$1')))
    }
    cursor++
    const parts: string[] = []
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
          const value = withStyle(Math.max(1, style) as MathStyle, () => inScope(() => row([close, '}'])))
          if (take() !== close) throw new Error('Unclosed inline math in text')
          parts.push(`<mrow style="font-style:normal;font-weight:normal">${value}</mrow>`)
        }
        else if (token === '{' || (token.startsWith('\\') && Object.hasOwn(textFonts, token.slice(1)))) {
          flush()
          if (token === '{') cursor--
          parts.push(textArgument(token === '{' ? 'text' : token.slice(1)))
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
    if (properties || parts.length === 1) return wrap(parts.join(''))
    return `<mrow>${parts.join('')}</mrow>`
  }

  function fraction(targetStyle: MathStyle, thickness?: string, align?: string): string {
    const script = Math.min(3, targetStyle + 1) as MathStyle
    const first = withStyle(script, argument)
    const second = withStyle(script, argument)
    const settings = thickness !== undefined ? ` linethickness="${thickness}"` : ''
    const numerator = align ? ` numalign="${align}"` : ''
    const markup = `<mfrac${settings}${numerator}>${first}${second}</mfrac>`
    return style === targetStyle ? markup : mathSize(targetStyle, markup)
  }

  function nextTag(automatic: boolean): string {
    if (tagState.label) return tagState.label
    return automatic && !tagState.suppressed ? `(${++equationNumber})` : ''
  }

  function row(stop: string[] = []): string {
    if (depth++ > 100) throw new Error('Math groups are nested too deeply')
    const parts: string[] = []
    while (peek() && !stop.includes(peek())) {
      const token = take()
      if (Object.hasOwn(styleCommands, token)) {
        const selected = styleCommands[token]
        parts.push(mathSize(selected, withStyle(selected, () => row(stop))))
        break
      }
      if (token === '\\color') {
        const color = safeColor(literalGroup())
        const content = row(stop)
        parts.push(color ? `<mrow style="color:${color}">${content}</mrow>` : content)
        break
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
      else part = atom(token)
      let lower = ''
      let upper = ''
      let forceLimits = part.limits && style === 0
      if (peek() === '\\limits' || peek() === '\\nolimits') forceLimits = take() === '\\limits'
      while (peek() === '_' || peek() === '^' || peek() === "'") {
        const kind = take()
        if (kind === '_') lower = withStyle(scriptStyle(), argument)
        else if (kind === '^') upper = withStyle(scriptStyle(), argument)
        else {
          let primes = '′'
          while (peek() === "'") { take(); primes += '′' }
          upper = tag('mo', primes)
        }
      }
      if (part.brace === 'upper' && upper) {
        part.markup = `<mover>${part.markup}${upper}</mover>`
        upper = ''
      }
      if (part.brace === 'lower' && lower) {
        part.markup = `<munder>${part.markup}${lower}</munder>`
        lower = ''
      }
      const wrapper = lower && upper ? (forceLimits ? 'munderover' : 'msubsup')
        : lower ? (forceLimits ? 'munder' : 'msub')
          : upper ? (forceLimits ? 'mover' : 'msup') : ''
      parts.push(wrapper ? `<${wrapper}>${part.markup}${lower}${upper}</${wrapper}>` : part.markup)
    }
    depth--
    return parts.join('')
  }

  function commutativeDiagram(): string {
    const stops = ['@', '&', '\\\\', '\\cr', '\\end']
    const rows: string[][] = []
    function arrowLabel(type: string): string {
      const label = withStyle(2, () => inScope(() => row([...stops, type])))
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
      cells.push(withStyle(0, () => inScope(() => row(stops))))
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

  function delimitedNotation(name: string): string {
    const [left, right] = notationDelimiters[name]
    const stretchy = /^[A-Z]/.test(name)
    const separator = name === 'Braket' || name === 'Set' || name === 'set'
    if (!separator || peek() !== '{') return `<mrow>${fence(left, stretchy)}${argument()}${fence(right, stretchy)}</mrow>`
    take()
    const content = inScope(() => {
      const parts: string[] = []
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
      return parts.join('')
    })
    return `<mrow>${fence(left, stretchy)}${content}${fence(right, stretchy)}</mrow>`
  }

  function matrix(environment: string): string {
    const unclosed = () => new Error(`Unclosed math environment: ${environment}`)
    if (environment === 'CD') return commutativeDiagram()
    if (/^equation[*]?$/.test(environment)) {
      environmentDepth++
      const content = row(['\\end'])
      environmentDepth--
      if (take() !== '\\end' || literalGroup() !== environment) throw unclosed()
      tagState.label = nextTag(display && environment === 'equation')
      return `<mrow>${content}</mrow>`
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
    const cellStyle = compact ? Math.max(2, style) as MathStyle : environment.startsWith('d') || aligned || gathered ? 0 : 1
    const stretch = columnArray && macros.has('\\arraystretch')
      ? Number(expandDefinition(['\\arraystretch']).join('')) : 1
    if (!(stretch > 0 && stretch <= 100)) throw new Error('Invalid array stretch')
    const outerTag = tagState
    const automatic = display && environmentDepth === 0 && /^(?:align|alignat|gather)$/.test(environment)
    environmentDepth++
    tagState = { label: '', suppressed: false }
    const rows: ArrayRow[] = []
    let cells: string[] = []
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
      cells.push(withStyle(cellStyle, () => inScope(() => row(stops))))
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
        const value = entry.cells[index] ?? ''
        return `<mtd${settings}>${style === cellStyle ? value : mathSize(cellStyle, value)}</mtd>`
      }).join('')
      return `<mtr>${state?.options.leqno ? cell : ''}${content}${state?.options.leqno ? '' : cell}</mtr>`
    }).join('')
    const lines = compact ? ' class="math-compact-array"' : ' data-equation-lines'
    return `<mrow>${fence(left)}<mtable${lines}${align}>${markup}</mtable>${fence(right)}</mrow>`
  }

  function atom(token: string): Atom {
    if (!token) return { markup: '<mrow/>' }
    if (token === '{') {
      const content = inScope(() => row(['}']))
      if (take() !== '}') throw new Error('Unclosed math group')
      return { markup: `<mrow>${content}</mrow>` }
    }
    if (!token.startsWith('\\')) {
      if (/^\d/.test(token)) return { markup: tag('mn', token) }
      return { markup: tag(/^\p{L}$/u.test(token) ? 'mi' : 'mo', token === '-' ? '−' : token) }
    }

    let name = token.slice(1)
    const global = name === 'global'
    if (global) name = take().slice(1)
    if (name === 'begingroup' || name === 'bgroup') {
      const close = name === 'begingroup' ? '\\endgroup' : '\\egroup'
      const content = inScope(() => row([close]))
      if (take() !== close) throw new Error('Unclosed math group')
      return { markup: `<mrow>${content}</mrow>` }
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
    if (name === 'mathchoice' || name === '@firstoftwo' || name === '@secondoftwo') {
      const choices = Array.from({ length: name === 'mathchoice' ? 4 : 2 }, rawGroup)
      const selected = choices[name === 'mathchoice' ? style : name === '@firstoftwo' ? 0 : 1]
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
      return { markup: `<mrow class="math-${name}">${argument()}</mrow>` }
    }
    if (name === 'textcolor') {
      const color = literalGroup()
      const content = argument()
      const safe = safeColor(color) ? ` style="color:${color}"` : ''
      return { markup: `<mrow${safe}>${content}</mrow>` }
    }
    if (name === 'left') {
      const left = fence(take())
      const content = inScope(() => row(['\\right']))
      const right = peek() === '\\right' ? (take(), fence(take())) : ''
      return { markup: `<mrow>${left}${content}${right}</mrow>` }
    }
    if (name === 'right' || name === 'middle' || /^(?:big|Big|bigg|Bigg)[lrm]?$/.test(name)) return { markup: fence(take()) }
    if (name === 'begin') return { markup: inScope(() => matrix(literalGroup())) }
    if (name === 'substack') {
      if (take() !== '{') throw new Error('Expected a grouped math stack')
      return { markup: inScope(() => matrix('substack')) }
    }
    if (name === 'end') return { markup: tag('mtext', `\\end{${literalGroup()}}`) }
    if (['frac', 'dfrac', 'tfrac', 'binom', 'dbinom', 'tbinom'].includes(name)) {
      const binomial = name.endsWith('binom')
      const targetStyle = name.startsWith('d') ? 0 : name.startsWith('t') ? 1 : style
      const content = fraction(targetStyle, binomial ? '0' : undefined)
      return { markup: binomial ? `<mrow>${fence('(')}${content}${fence(')')}</mrow>` : content }
    }
    if (name === 'genfrac') {
      const left = literalGroup()
      const right = literalGroup()
      const bar = literalGroup()
      const mode = literalGroup()
      if (mode && !/^[0-3]$/.test(mode)) throw new Error('Invalid fraction style')
      const content = fraction(mode ? Number(mode) as MathStyle : style, dimension(bar))
      return { markup: `<mrow>${fence(left)}${content}${fence(right)}</mrow>` }
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
      return { markup: `<mpadded voffset="${offset}"${height ? ` height="${height}"` : ''}${depth ? ` depth="${depth}"` : ''}>${argument()}</mpadded>` }
    }
    if (name === 'smash') {
      const side = bracket()
      return { markup: `<mpadded${side !== 'b' ? ' height="0"' : ''}${side !== 't' ? ' depth="0"' : ''}>${argument()}</mpadded>` }
    }
    if (['hspace', 'kern', 'mkern', 'mskip', 'hskip'].includes(name)) {
      if (name === 'hspace' && peek() === '*') take()
      return { markup: `<mspace width="${readDimension()}"/>` }
    }
    if (Object.hasOwn(notationDelimiters, name)) return { markup: delimitedNotation(name) }
    if (name === 'prescript') {
      const upper = withStyle(2, argument)
      const lower = withStyle(2, argument)
      return { markup: `<mmultiscripts>${argument()}<mprescripts/>${lower}${upper}</mmultiscripts>` }
    }
    if (name === 'sqrt') {
      let degree = ''
      if (peek() === '[') {
        take()
        degree = row([']'])
        if (peek() === ']') take()
      }
      const base = argument()
      return { markup: degree ? `<mroot>${base}<mrow>${degree}</mrow></mroot>` : `<msqrt>${base}</msqrt>` }
    }
    if (Object.hasOwn(textFonts, name)) return { markup: textArgument(name) }
    if (name === 'operatorname') {
      const star = peek() === '*'
      if (star) take()
      return { markup: tag('mo', literalGroup().replace(/\\([_%#$&{}])/g, '$1')), limits: star }
    }
    if (name === 'overline' || name === 'underline') {
      return { markup: `<mrow class="math-${name}">${argument()}</mrow>` }
    }
    if (name === 'overset' || name === 'underset' || name === 'stackrel') {
      const annotation = withStyle(scriptStyle(), argument)
      const element = name === 'underset' ? 'munder' : 'mover'
      return { markup: `<${element}>${argument()}${annotation}</${element}>` }
    }
    if (Object.hasOwn(stretchedAccents, name)) {
      const under = name.startsWith('under') || name === 'utilde'
      const element = under ? 'munder' : 'mover'
      const brace = name === 'overbrace' ? 'upper' : name === 'underbrace' ? 'lower' : undefined
      return { brace, markup: `<${element} ${under ? 'accentunder' : 'accent'}="true">${argument()}<mo stretchy="true">${stretchedAccents[name]}</mo></${element}>` }
    }
    if (Object.hasOwn(extensibleArrows, name)) {
      let below = ''
      if (peek() === '[') {
        take()
        below = `<mrow>${withStyle(scriptStyle(), () => inScope(() => row([']'])))}</mrow>`
        if (take() !== ']') throw new Error('Unclosed arrow subscript')
      }
      return { markup: labelledOperator(extensibleArrows[name], withStyle(scriptStyle(), argument), below) }
    }
    if (name === 'phantom' || name === 'hphantom' || name === 'vphantom') {
      const invisible = `<mphantom>${argument()}</mphantom>`
      const dimensions = name === 'hphantom' ? ' height="0" depth="0"' : name === 'vphantom' ? ' width="0"' : ''
      return { markup: dimensions ? `<mpadded${dimensions}>${invisible}</mpadded>` : invisible }
    }
    if (name === 'relax' || name === 'allowbreak' || name === 'nobreak') return { markup: '' }
    if (Object.hasOwn(variants, name)) {
      const variant = variants[name]
      const content = argument()
      // MathML Core honors normal on identifiers and uses font styles for other variants.
      const styled = applyVariant(content, variant)
      return { markup: `<mrow class="math-${variant}" mathvariant="${variant}">${styled}</mrow>` }
    }
    if (Object.hasOwn(accents, name)) return { markup: `<mover accent="true">${argument()}${tag('mo', accents[name])}</mover>` }
    if (Object.hasOwn(greek, name)) return { markup: tag('mi', greek[name]) }
    if (Object.hasOwn(operators, name)) return { markup: tag('mo', operators[name]), limits: big.has(name) }
    if (functions.has(name)) return { markup: tag('mo', name), limits: big.has(name) }
    if (Object.hasOwn(delimiters, token)) return { markup: fence(token) }
    if (Object.hasOwn(spacing, name)) return { markup: `<mspace width="${spacing[name]}"/>` }
    if (/^[%$#&_{}|]$/.test(name)) return { markup: tag('mo', name) }
    if (state?.options.throwOnError) throw new Error(`Unsupported math command: ${token}`)
    const color = safeColor(state?.options.errorColor ?? '')
    return { markup: color ? `<mtext style="color:${color}">${escapeHtml(token)}</mtext>` : tag('mtext', token) }
  }

  try {
    const expression = `<mrow>${row()}</mrow>`
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
