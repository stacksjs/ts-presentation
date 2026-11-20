export type MathStyle = 0 | 1 | 2 | 3

export function fractionStyle(style: MathStyle): MathStyle {
  return Math.min(3, style + 1) as MathStyle
}

export function scriptStyle(style: MathStyle): MathStyle {
  return style < 2 ? 2 : 3
}

// Infix fractions decide the style of both operands after the row is parsed.
// Static fragments stay strings. Only style-dependent parts defer rendering.
export type Markup = string | ((style: MathStyle) => string)

export function renderMarkup(markup: Markup, style: MathStyle): string {
  return typeof markup === 'string' ? markup : markup(style)
}

export function joinMarkup(parts: Markup[]): Markup {
  return parts.some(part => typeof part !== 'string')
    ? style => parts.map(part => renderMarkup(part, style)).join('')
    : parts.join('')
}

export function xml(parts: TemplateStringsArray, ...values: Markup[]): Markup {
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
