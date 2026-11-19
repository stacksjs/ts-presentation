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
}
const functions = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'exp', 'min', 'max', 'argmin', 'argmax', 'det', 'lim', 'sup', 'inf', 'gcd', 'mod', 'Pr'])
const big = new Set(['sum', 'prod', 'lim', 'min', 'max', 'argmin', 'argmax', 'sup', 'inf'])
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
export function renderMath(source: string, display = false): string {
  const tokens = source.match(/\\[A-Z]+|\\[^A-Z\r\n]|\d+(?:\.\d+)?|\s+|./giu) ?? []
  if (tokens.length > 6000) return `<code>${escapeHtml(source)}</code>`
  let cursor = 0
  let depth = 0

  const space = () => { while (/^\s+$/.test(tokens[cursor] ?? '')) cursor++ }
  const peek = () => { space(); return tokens[cursor] ?? '' }
  const take = () => { space(); return tokens[cursor++] ?? '' }

  function literalGroup(): string {
    if (peek() !== '{') return take()
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
    return atom(take()).markup
  }

  function row(stop: string[] = []): string {
    if (depth++ > 100) throw new Error('Math groups are nested too deeply')
    const parts: string[] = []
    while (peek() && !stop.includes(peek())) {
      const part = atom(take())
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
    if (!/^(?:[pbBvV]?matrix|smallmatrix|cases|aligned|alignedat|gathered|split|array)$/.test(environment))
      return tag('mtext', `\\begin{${environment}}`)
    if (environment === 'array' || environment === 'alignedat') literalGroup()
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
    const align = ['aligned', 'alignedat', 'split'].includes(environment) ? ' columnalign="right left"' : environment === 'cases' ? ' columnalign="left left"' : ''
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
      const styled = variant === 'normal'
        ? content.replaceAll('<mi>', '<mi mathvariant="normal">')
        : content
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
    return `<math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ''}><semantics><mrow>${row()}</mrow><annotation encoding="application/x-tex">${escapeHtml(source)}</annotation></semantics></math>`
  }
  catch {
    return `<code class="math-unrendered">${escapeHtml(source)}</code>`
  }
}
