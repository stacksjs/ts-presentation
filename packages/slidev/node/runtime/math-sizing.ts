import { MathParseError } from './math-error.ts'

// TeX absolute units in points at a 10 pt text size. See KaTeX src/units.ts (MIT).
const pointsPerUnit: Readonly<Record<string, number>> = {
  pt: 1, bp: 803 / 800, px: 803 / 800, pc: 12,
  mm: 7227 / 2540, cm: 7227 / 254, in: 72.27,
  dd: 1238 / 1157, cc: 14856 / 1157, nd: 685 / 642, nc: 1370 / 107, sp: 1 / 65536,
}

const nativeUnits = new Set(['px', 'em', 'ex', 'pt', 'cm', 'mm', 'in', 'pc'])
const dimensionPattern = /^([+-]?)\s*(\d+(?:\.\d*)?|\.\d+)\s*(px|em|ex|pt|bp|cm|mm|in|mu|pc|dd|cc|nd|nc|sp)?$/

export const nullDelimiterWidth = '0.12em'

interface IntegerTokens {
  peek: (skipSpace?: boolean) => string
  advance: () => void
  characterCode: () => number
}

const texIntegerLimit = 2_147_483_647n

/** Read a signed TeX integer, optionally using e-TeX expression arithmetic. */
export function mathInteger(tokens: IntegerTokens, expression: boolean): bigint {
  const { peek, advance, characterCode } = tokens

  function checked(value: bigint): bigint {
    if (value < -texIntegerLimit || value > texIntegerLimit) throw new MathParseError('TeX integer overflow')
    return value
  }

  function divide(left: bigint, right: bigint): bigint {
    if (right === 0n) throw new MathParseError('Division by zero in TeX integer expression')
    const quotient = left / right
    const remainder = left % right
    const magnitude = remainder < 0n ? -remainder : remainder
    const divisor = right < 0n ? -right : right
    if (magnitude * 2n < divisor) return quotient
    return quotient + ((left < 0n) === (right < 0n) ? 1n : -1n)
  }

  function quantity(depth: number, allowGroup: boolean): bigint {
    if (depth > 100) throw new MathParseError('TeX integer expressions are nested too deeply')
    let sign = 1n
    let first = peek()
    while (first === '+' || first === '-') {
      if (first === '-') sign = -sign
      advance()
      first = peek()
    }
    if (first === '\\numexpr' || (allowGroup && first === '(')) {
      advance()
      const value = sum(depth + 1)
      if (first === '(' && peek() !== ')') throw new MathParseError('Missing closing parenthesis in TeX integer expression')
      if (first === '(' || peek() === '\\relax') advance()
      return sign * value
    }
    if (first === '`') {
      advance()
      const code = characterCode()
      if (!Number.isInteger(code)) throw new MathParseError('Invalid TeX character constant')
      if (/^[ \t\r\n]+$/.test(peek(false))) advance()
      return sign * BigInt(code)
    }
    const radix = first === '"' ? 16 : first === "'" ? 8 : 10
    const valid = radix === 16 ? /^[\dA-F]$/i : radix === 8 ? /^[0-7]$/ : /^\d$/
    if (radix !== 10) advance()
    let digit = peek(false)
    if (!valid.test(digit)) throw new MathParseError('Expected a TeX integer')
    const base = BigInt(radix)
    let value = 0n
    while (valid.test(digit)) {
      value = checked(value * base + BigInt(Number.parseInt(digit, radix)))
      advance()
      digit = peek(false)
    }
    if (/^[ \t\r\n]+$/.test(digit)) advance()
    return sign * value
  }

  function term(depth: number): bigint {
    let value = quantity(depth, true)
    for (let operator = peek(); operator === '*' || operator === '/'; operator = peek()) {
      advance()
      const right = quantity(depth, true)
      if (operator === '*' && peek() === '/') {
        // Scale in one operation so the intermediate product can exceed
        // the integer limit when the divided result is in range.
        advance()
        value = checked(divide(value * right, quantity(depth, true)))
      }
      else value = checked(operator === '*' ? value * right : divide(value, right))
    }
    return value
  }

  function sum(depth: number): bigint {
    let value = term(depth)
    for (let operator = peek(); operator === '+' || operator === '-'; operator = peek()) {
      advance()
      const right = term(depth)
      value = checked(operator === '+' ? value + right : value - right)
    }
    return value
  }

  if (!expression) return quantity(0, false)
  const value = sum(0)
  if (peek() === '\\relax') advance()
  return value
}

function toEm(value: number, unit: string): number {
  if (unit === 'em') return value
  if (unit === 'mu') return value / 18
  if (unit === 'ex') return value * 0.431
  return value * pointsPerUnit[unit] / 10
}

export function mathDimension(source: string, maximum: number): string | undefined {
  const [, sign, magnitude, unit] = dimensionPattern.exec(source.trim()) ?? []
  if (magnitude === undefined) return
  const amount = (sign === '-' ? sign : '') + magnitude.replace(/\.$/, '')
  const value = Number(amount)
  if (!Number.isFinite(value) || (!unit && value !== 0)) return
  const em = toEm(value, unit ?? 'px')
  if (em > maximum) return `${maximum}em`
  // Scaled points can use large integers even for a fraction of a point.
  if (Math.abs(unit === 'sp' ? value * pointsPerUnit.sp : value) > 1000) return
  if (maximum !== Infinity || unit === 'mu') return `${em}em`
  if (!unit) return `${amount}px`
  if (nativeUnits.has(unit)) return `${amount}${unit}`
  if (unit === 'bp') return `${amount}pt`
  return `${value * pointsPerUnit[unit]}pt`
}

/** Parse a TeX dimension expression into CSS without passing through source text. */
export function mathBoxDimensionExpression(source: string, resolve: (operand: string) => string | undefined): string {
  function invalid(): never {
    throw new MathParseError('Invalid TeX box dimension expression')
  }
  if (source.length > 1024) invalid()
  // A dimension may start with a numeric coefficient. Leave \relax separate
  // so it can also terminate an expression immediately after a scalar.
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:\s*(?:[a-z]{2}|\\(?!relax(?![A-Za-z@]))[A-Za-z@]+))?|\\[A-Za-z@]+|\S/g) ?? []
  if (tokens.at(-1) === '\\relax') tokens.pop()
  let index = 0
  type Operand = string | number

  function integer(value: number): number {
    // e-TeX rounds integer division to the nearest integer, away from zero on ties.
    if (!Number.isFinite(value) || Math.abs(value) > 2_147_483_647) invalid()
    return Math.sign(value) * Math.round(Math.abs(value))
  }

  function combine(left: Operand, operator: string, right: Operand): Operand {
    if (operator === '/' && right === 0) invalid()
    if (typeof left === 'string') return `(${left} ${operator} ${right})`
    if (typeof right !== 'number') invalid()
    switch (operator) {
      case '+': return integer(left + right)
      case '-': return integer(left - right)
      case '*': return integer(left * right)
      default: return integer(left / right)
    }
  }

  function factor(numeric: boolean, depth: number): Operand {
    if (depth > 32) invalid()
    let sign = 1
    while (tokens[index] === '-' || tokens[index] === '+') {
      if (tokens[index++] === '-') sign = -sign
    }
    const next = tokens[index++]
    let value: Operand | undefined
    if (next === '(') {
      value = expression(numeric, depth + 1)
      if (tokens[index++] !== ')') invalid()
    }
    else if (numeric && /^\d+$/.test(next ?? '')) value = integer(Number(next))
    else if (!numeric && next) value = resolve(next)
    if (value === undefined) invalid()
    return sign === 1 ? value : combine(value, '*', -1)
  }

  function expression(numeric: boolean, depth: number): Operand {
    function term(): Operand {
      let value = factor(numeric, depth)
      while (tokens[index] === '*' || tokens[index] === '/')
        value = combine(value, tokens[index++], factor(true, depth))
      return value
    }
    let value = term()
    while (tokens[index] === '+' || tokens[index] === '-')
      value = combine(value, tokens[index++], term())
    return value
  }

  const value = expression(false, 0)
  if (index !== tokens.length || typeof value !== 'string') invalid()
  return `calc(${value})`
}

export function fractionRule(thickness: string | undefined, minimum: number): string | undefined {
  if (!minimum || thickness === '0') return thickness
  if (thickness === undefined) return minimum > 0.04 ? `${minimum}em` : undefined
  const value = Number.parseFloat(thickness)
  if (value <= 0) return thickness
  const unit = /[a-z]+$/.exec(thickness)?.[0] ?? 'px'
  return `${Math.max(minimum, toEm(value, unit))}em`
}
