interface Rule {
  prelude: string
  children?: Rule[]
}

function skipLiteral(source: string, at: number): number {
  const current = source[at]
  if (current === '\\') return Math.min(at + 2, source.length)
  if (source.startsWith('/*', at)) {
    const end = source.indexOf('*/', at + 2)
    return end < 0 ? source.length : end + 2
  }
  if (current !== '"' && current !== "'") return at
  for (let end = at + 1; end < source.length; end++) {
    if (source[end] === '\\') end++
    else if (source[end] === current) return end + 1
  }
  return source.length
}

function* delimiters(source: string, wanted: string): Generator<number> {
  let parentheses = 0
  let brackets = 0
  for (let at = 0; at < source.length; at++) {
    const skipped = skipLiteral(source, at)
    if (skipped > at) {
      at = skipped - 1
      continue
    }
    const current = source[at]
    if (!parentheses && !brackets && wanted.includes(current)) yield at
    if (current === '(') parentheses++
    else if (current === ')' && parentheses) parentheses--
    else if (current === '[') brackets++
    else if (current === ']' && brackets) brackets--
  }
}

function parseRules(source: string): Rule[] {
  const rules: Rule[] = []
  const stack = [rules]
  let start = 0
  for (const index of delimiters(source, ';{}')) {
    const text = source.slice(start, index)
    start = index + 1
    const active = stack.at(-1)!
    if (source[index] === '{') {
      if (stack.length >= 64) throw new Error('Slide CSS is nested too deeply')
      const children: Rule[] = []
      active.push({ prelude: text, children })
      stack.push(children)
    }
    else if (source[index] === '}') {
      if (text) active.push({ prelude: text })
      if (stack.length > 1) stack.pop()
    }
    else active.push({ prelude: `${text};` })
  }
  const remainder = source.slice(start)
  if (remainder) stack.at(-1)!.push({ prelude: remainder })
  return rules
}

function withoutLeadingComments(source: string): string {
  let index = 0
  while (index < source.length) {
    if (/\s/.test(source[index])) index++
    else if (source.startsWith('/*', index)) index = skipLiteral(source, index)
    else break
  }
  return source.slice(index)
}

function selectorEnd(source: string): number {
  let end = 0
  for (let at = 0; at < source.length;) {
    const skipped = skipLiteral(source, at)
    if (skipped > at) {
      if (!source.startsWith('/*', at)) end = skipped
      at = skipped
    }
    else if (!/\s/.test(source[at++])) end = at
  }
  return end
}

const keyframe = /^(@(?:-[a-z]+-)?keyframes\s+)([-_a-z][\w-]*)(?=\s|$)/i
const group = /^@(?:media|supports|container|layer|scope|starting-style|document|-\w+-document)\b/i
const animation = /^((?:-[a-z]+-)?animation(?:-name)?\s*:\s*)/i
const animationKeywords = new Set([
  'none', 'initial', 'inherit', 'unset', 'revert', 'revert-layer',
  'infinite', 'normal', 'reverse', 'alternate', 'alternate-reverse',
  'forwards', 'backwards', 'both', 'running', 'paused', 'auto',
  'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end',
])

function animationNames(value: string, names: Map<string, string>, allowKeywords: boolean): string {
  let output = ''
  let parentheses = 0
  for (let at = 0; at < value.length;) {
    const skipped = skipLiteral(value, at)
    if (skipped > at) {
      output += value.slice(at, skipped)
      at = skipped
      continue
    }
    const current = value[at]
    if (current === '(') parentheses++
    else if (current === ')' && parentheses) parentheses--
    if (!parentheses && /[\w-]/.test(current)) {
      let end = at + 1
      while (end < value.length && /[\w-]/.test(value[end])) end++
      const word = value.slice(at, end)
      const match = value[end] !== '(' && (allowKeywords || !animationKeywords.has(word.toLowerCase())) ? names.get(word) : undefined
      output += match ?? word
      at = end
    }
    else {
      output += current
      at++
    }
  }
  return output
}

function applySelectorScope(selector: string, root: string, nativeScope: boolean): string {
  const guard = `:where(${root}, ${root} *)`
  let output = ''
  let start = 0
  function scoped(part: string): string {
    if (!withoutLeadingComments(part)) return part
    let result = ''
    let cursor = 0
    let pseudo: number | undefined
    for (const colon of delimiters(part, ':')) {
      if (/^::|^:(?:before|after|first-line|first-letter)(?![\w-])/i.test(part.slice(colon))) {
        pseudo = colon
        break
      }
      const alias = !nativeScope && /^:(?:scope|root)(?![\w-])/i.exec(part.slice(colon))
      if (alias) {
        result += part.slice(cursor, colon) + `:where(${root})`
        cursor = colon + alias[0].length
      }
    }
    const subject = result + part.slice(cursor, pseudo)
    const end = selectorEnd(subject)
    return `${subject.slice(0, end)}${guard}${subject.slice(end)}${pseudo === undefined ? '' : part.slice(pseudo)}`
  }
  for (const comma of delimiters(selector, ',')) {
    output += scoped(selector.slice(start, comma)) + ','
    start = comma + 1
  }
  return output + scoped(selector.slice(start))
}

export function scopeSlideStyles(styles: readonly string[], slide: number): string[] {
  const groups = styles.map(parseRules)
  const names = new Map<string, string>()
  function collect(rules: Rule[]): void {
    for (const rule of rules) {
      if (!rule.children) continue
      const header = withoutLeadingComments(rule.prelude)
      const frame = keyframe.exec(header)
      if (frame) names.set(frame[2], `tp-slide-${slide}-${frame[2]}`)
      else if (group.test(header) || !header.startsWith('@')) collect(rule.children)
    }
  }
  for (const rules of groups) collect(rules)

  function render(rules: Rule[], selectors: boolean, nativeScope = false): string {
    return rules.map(({ prelude, children }) => {
      const header = withoutLeadingComments(prelude)
      const prefix = prelude.slice(0, prelude.length - header.length)
      if (!children) {
        if (/^@import\b/i.test(header)) return prefix
        const declaration = names.size ? animation.exec(header) : undefined
        if (declaration) return prefix + declaration[0] + animationNames(header.slice(declaration[0].length), names, /-name\s*:/i.test(declaration[0]))
        return prelude
      }

      const frame = keyframe.exec(header)
      if (frame) {
        const renamed = frame[1] + (names.get(frame[2]) ?? frame[2]) + header.slice(frame[0].length)
        return `${prefix}${renamed}{${render(children, false)}}`
      }
      if (/^--[\w-]+\s*:/.test(header)) return `${prelude}{${render(children, false)}}`
      if (header.startsWith('@')) {
        const nested = selectors && group.test(header)
        return `${prelude}{${render(children, nested, nativeScope || /^@scope\b/i.test(header))}}`
      }
      return `${selectors ? applySelectorScope(prelude, `#slide-${slide}`, nativeScope) : prelude}{${render(children, selectors, nativeScope)}}`
    }).join('')
  }

  return groups.map(rules => render(rules, true))
}
