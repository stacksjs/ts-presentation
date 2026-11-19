import { escapeHtml } from '../html.ts'

export function labelLines(label: string): string[] {
  return label.trim().replace(/^"|"$/g, '').split(/<br\s*\/?>/i)
}

export function svgText(label: string, x: number, y: number, classes = '', anchor = 'middle'): string {
  return svgTextLines(labelLines(label), x, y, classes, anchor)
}

export function svgTextLines(lines: string[], x: number, y: number, classes = '', anchor = 'middle'): string {
  const dy = -(lines.length - 1) * 8
  return `<text x="${x}" y="${y}" class="${classes}" text-anchor="${anchor}" dominant-baseline="central">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? 16 : dy}">${escapeHtml(line)}</tspan>`).join('')}</text>`
}

export function diagramSvg(label: string, width: number, height: number, body: string): string {
  return `<svg class="slide-diagram" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}">${body}</svg>`
}

export function arrows(marker: string): string {
  return `<defs>
    <marker id="${marker}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="diagram-arrow" d="M0 0L8 4L0 8Z"/></marker>
    <marker id="${marker}-circle" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><circle class="diagram-arrow" cx="4" cy="4" r="2.8"/></marker>
    <marker id="${marker}-cross" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="diagram-cross" d="M1 1L7 7M7 1L1 7"/></marker>
  </defs>`
}

/** Mask characters protected by a node shape, quoted string, or edge label. */
export function syntaxMask(source: string): string {
  const stack: string[] = []
  const closes: Record<string, string> = { '[': ']', '(': ')', '{': '}' }
  let quote = false
  let pipe = false
  let mask = ''
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quote && char === '\\' && source[index + 1]) {
      index++
      mask += '  '
      continue
    }
    const sheltered = quote || pipe || stack.length > 0
    if (char === '"' && !pipe) quote = !quote
    else if (!quote && char === '|' && !stack.length) pipe = !pipe
    else if (!quote && !pipe) {
      if (closes[char]) stack.push(closes[char])
      else if (char === stack.at(-1)) stack.pop()
    }
    mask += sheltered || quote || pipe || stack.length ? ' ' : char
  }
  return mask
}
