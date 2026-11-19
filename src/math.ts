import { escapeHtml } from './html.ts'

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
const accents: Record<string, string> = { hat: 'ˆ', widehat: 'ˆ', bar: '¯', overline: '¯', vec: '→', dot: '˙', ddot: '¨', tilde: '˜', widetilde: '˜' }
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
  return source.match(/\\[A-Z]+|\\[^A-Z\r\n]|#[1-9]|\s+|./giu) ?? []
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

interface Atom {
  markup: string
  limits?: boolean
}

function tag(name: string, value: string): string {
  return `<${name}>${escapeHtml(value)}</${name}>`
}

function fence(token: string): string {
  if (!token || token === '.') return ''
  return `<mo stretchy="true">${escapeHtml(delimiters[token] ?? token)}</mo>`
}

/** Translate a bounded TeX math subset to native MathML, with the source retained for accessibility. */
export function renderMath(source: string, display = false, configured: MathMacros = {}): string {
  const tokens = tokenize(source)
  if (tokens.length > 6000) return `<code>${escapeHtml(source)}</code>`
  let cursor = 0
  let depth = 0
  let expandedCount = 0
  let equationTag = ''

  const macros = new Map<string, { body: string[], arguments: number }>()
  function define(name: string, replacement: string, arity = 0): void {
    if (!/^\\[A-Za-z]+$/.test(name) || replacement.length > 8192 || arity < 0 || arity > 9) return
    const body = tokenize(replacement)
    const inferred = Math.max(0, ...body.map(token => /^#[1-9]$/.test(token) ? Number(token[1]) : 0))
    macros.set(name, { body, arguments: Math.max(arity, inferred) })
  }
  for (const [name, replacement] of Object.entries(configured)) define(name, replacement)

  const space = () => { while (/^\s+$/.test(tokens[cursor] ?? '')) cursor++ }

  function expand(): void {
    space()
    let macro = macros.get(tokens[cursor])
    while (macro) {
      if (++expandedCount > 300) throw new Error('Too many math macro expansions')
      const start = cursor++
      const values = Array.from({ length: macro.arguments }, () => tokenize(literalGroup()))
      const body = macro.body.flatMap(token => /^#[1-9]$/.test(token) ? values[Number(token[1]) - 1] ?? [] : [token])
      if (tokens.length + body.length > 12000) throw new Error('Expanded equation is too long')
      tokens.splice(start, cursor - start, ...body)
      cursor = start
      space()
      macro = macros.get(tokens[cursor])
    }
  }

  const peek = () => { expand(); return tokens[cursor] ?? '' }
  const take = () => { expand(); return tokens[cursor++] ?? '' }

  function literalGroup(): string {
    space()
    if (tokens[cursor] !== '{') return tokens[cursor++] ?? ''
    cursor++
    let level = 1
    let text = ''
    while (cursor < tokens.length && level) {
      const next = tokens[cursor++]
      if (next === '{') level++
      if (next === '}') level--
      if (level) text += next
    }
    return text
  }

  function argument(): string {
    if (depth++ > 100) throw new Error('Math arguments are nested too deeply')
    const markup = atom(take()).markup
    depth--
    return markup
  }

  function row(stop: string[] = []): string {
    if (depth++ > 100) throw new Error('Math groups are nested too deeply')
    const parts: string[] = []
    while (peek() && !stop.includes(peek())) {
      const token = take()
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
      let forceLimits = part.limits && display
      if (peek() === '\\limits' || peek() === '\\nolimits') forceLimits = take() === '\\limits'
      while (peek() === '_' || peek() === '^' || peek() === "'") {
        const kind = take()
        if (kind === '_') lower = argument()
        else if (kind === '^') upper = argument()
        else {
          let primes = '′'
          while (peek() === "'") { take(); primes += '′' }
          upper = tag('mo', primes)
        }
      }
      const wrapper = lower && upper ? (forceLimits ? 'munderover' : 'msubsup')
        : lower ? (forceLimits ? 'munder' : 'msub')
          : upper ? (forceLimits ? 'mover' : 'msup') : ''
      parts.push(wrapper ? `<${wrapper}>${part.markup}${lower}${upper}</${wrapper}>` : part.markup)
    }
    depth--
    return parts.join('')
  }

  function matrix(environment: string): string {
    if (/^equation[*]?$/.test(environment)) {
      const content = row(['\\end'])
      if (peek() === '\\end') { take(); literalGroup() }
      return `<mrow>${content}</mrow>`
    }
    if (!/^(?:[pbBvV]?matrix|smallmatrix|cases|align(?:ed|edat|at[*]?|[*])?|gather(?:ed|[*])?|split|array|multline[*]?)$/.test(environment))
      return tag('mtext', `\\begin{${environment}}`)
    const columns = environment === 'array' || /^align(?:ed)?at[*]?$/.test(environment) ? literalGroup() : ''
    const rows: string[] = []
    let cells: string[] = []
    while (peek()) {
      cells.push(`<mtd>${row(['&', '\\\\', '\\end'])}</mtd>`)
      const separator = take()
      if (separator === '&') continue
      rows.push(`<mtr>${cells.join('')}</mtr>`)
      cells = []
      if (separator === '\\end') { literalGroup(); break }
      if (!separator) break
    }
    const [left, right] = matrixDelimiters[environment] ?? ['', '']
    const columnAlign = environment === 'array'
      ? [...columns].filter(column => /[lcr]/.test(column)).map(column => ({ l: 'left', c: 'center', r: 'right' })[column]).join(' ')
      : environment.startsWith('align') || environment === 'split' ? 'right left' : environment === 'cases' ? 'left left' : ''
    const align = columnAlign ? ` columnalign="${columnAlign}"` : ''
    return `<mrow>${fence(left)}<mtable${align}>${rows.join('')}</mtable>${fence(right)}</mrow>`
  }

  function atom(token: string): Atom {
    if (!token) return { markup: '<mrow/>' }
    if (token === '{') {
      const content = row(['}'])
      if (peek() === '}') take()
      return { markup: `<mrow>${content}</mrow>` }
    }
    if (!token.startsWith('\\')) {
      if (/^\d/.test(token)) return { markup: tag('mn', token) }
      return { markup: tag(/^\p{L}$/u.test(token) ? 'mi' : 'mo', token === '-' ? '−' : token) }
    }

    const name = token.slice(1)
    if (name === 'newcommand' || name === 'renewcommand' || name === 'providecommand') {
      const command = literalGroup().trim()
      space()
      let arity = 0
      if (tokens[cursor] === '[' && /^\d$/.test(tokens[cursor + 1] ?? '') && tokens[cursor + 2] === ']') {
        arity = Number(tokens[cursor + 1])
        cursor += 3
      }
      const value = literalGroup()
      if (name !== 'providecommand' || !macros.has(command)) define(command, value, arity)
      return { markup: '' }
    }
    if (name === 'tag') {
      if (peek() === '*') { take(); equationTag = literalGroup() }
      else equationTag = `(${literalGroup()})`
      return { markup: '' }
    }
    if (name === 'label') { literalGroup(); return { markup: '' } }
    if (name === 'notag' || name === 'nonumber') return { markup: '' }
    if (name === 'boxed' || name === 'cancel' || name === 'bcancel' || name === 'xcancel') {
      return { markup: `<mrow class="math-${name}">${argument()}</mrow>` }
    }
    if (name === 'textcolor') {
      const color = literalGroup()
      const content = argument()
      const safe = /^(?:#[\da-f]{3,8}|[a-z]{1,24})$/i.test(color) ? ` style="color:${color}"` : ''
      return { markup: `<mrow${safe}>${content}</mrow>` }
    }
    if (name === 'left') {
      const left = fence(take())
      const content = row(['\\right'])
      const right = peek() === '\\right' ? (take(), fence(take())) : ''
      return { markup: `<mrow>${left}${content}${right}</mrow>` }
    }
    if (name === 'right' || name === 'middle' || /^(?:big|Big|bigg|Bigg)[lrm]?$/.test(name)) return { markup: fence(take()) }
    if (name === 'begin') return { markup: matrix(literalGroup()) }
    if (name === 'end') return { markup: tag('mtext', `\\end{${literalGroup()}}`) }
    if (['frac', 'dfrac', 'tfrac', 'binom', 'dbinom', 'tbinom'].includes(name)) {
      const binomial = name.endsWith('binom')
      const fraction = `<mfrac${binomial ? ' linethickness="0"' : ''}>${argument()}${argument()}</mfrac>`
      return { markup: binomial ? `<mrow>${fence('(')}${fraction}${fence(')')}</mrow>` : fraction }
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
    if (name === 'text' || name === 'operatorname') {
      return { markup: tag(name === 'text' ? 'mtext' : 'mo', literalGroup().replace(/\\([_%#$&{}])/g, '$1')) }
    }
    if (name === 'overbrace' || name === 'underbrace' || name === 'underline') {
      const above = name === 'overbrace'
      const element = above ? 'mover' : 'munder'
      return { markup: `<${element}>${argument()}${tag('mo', name === 'underline' ? '_' : above ? '⏞' : '⏟')}</${element}>` }
    }
    if (name === 'overset' || name === 'underset') {
      const annotation = argument()
      const element = name === 'overset' ? 'mover' : 'munder'
      return { markup: `<${element}>${argument()}${annotation}</${element}>` }
    }
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
    return { markup: tag('mtext', token) }
  }

  try {
    const expression = `<mrow>${row()}</mrow>`
    const numbered = equationTag
      ? `<mtable><mtr><mtd>${expression}</mtd><mtd>${tag('mtext', equationTag)}</mtd></mtr></mtable>`
      : expression
    return `<math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ''}><semantics>${numbered}<annotation encoding="application/x-tex">${escapeHtml(source)}</annotation></semantics></math>`
  }
  catch {
    return `<code class="math-unrendered">${escapeHtml(source)}</code>`
  }
}
