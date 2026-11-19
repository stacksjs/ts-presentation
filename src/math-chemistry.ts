import { escapeHtml } from './html.ts'

function tag(name: string, text: string, attrs = ''): string {
  return `<${name}${attrs}>${escapeHtml(text)}</${name}>`
}

const arrows: Record<string, string> = { '<->': '↔', '<=>': '⇌', '->': '→', '<-': '←', '=>': '⇒', '<=': '⇐', '⇌': '⇌' }

/** Format common mhchem reaction and molecular notation with named MathML atoms. */
export function chemicalFormula(source: string): string {
  const count = /^\d+(?:\.\d+)?/
  const element = /^[A-Z][a-z]{0,2}/
  const phase = /^\((?:aq|s|l|g)\)/
  const charge = /^(?:\^\{?(\d*[+\-]|[+\-]\d*)\}?|([+\-])(?=\s*(?:$|[)\]}]|[+\-]\s|[<>=-])))/

  function sequence(at: number, end = ''): { content: string, next: number } {
    const atoms: string[] = []
    while (at < source.length && source[at] !== end) {
      const rest = source.slice(at)
      const white = /^\s+/.exec(rest)
      const direction = Object.keys(arrows).find(arrow => rest.startsWith(arrow))
      const phaseMatch = phase.exec(rest)
      const symbol = element.exec(rest)
      const amount = count.exec(rest)
      const superscript = charge.exec(rest)
      if (white) { at += white[0].length; continue }
      if (direction) {
        at += direction.length
        let arrow = tag('mo', arrows[direction], ' stretchy="true"')
        const description = /^\[([^\]]+)\]/.exec(source.slice(at))
        if (description) {
          arrow = `<mover>${arrow}${tag('mtext', description[1])}</mover>`
          at += description[0].length
        }
        atoms.push(arrow)
        continue
      }
      if (phaseMatch) {
        atoms.push(tag('mtext', phaseMatch[0]))
        at += phaseMatch[0].length
        continue
      }
      if (superscript && atoms.length) {
        const previous = atoms.pop()
        atoms.push(`<msup>${previous}${tag('mo', (superscript[1] ?? superscript[2]).replace('-', '−'))}</msup>`)
        at += superscript[0].length
        continue
      }
      const bracket = rest[0] === '(' ? ')' : rest[0] === '[' ? ']' : ''
      if (symbol || bracket) {
        let formula = ''
        if (symbol) {
          formula = tag('mi', symbol[0], ' mathvariant="normal"')
          at += symbol[0].length
        }
        else {
          const inner = sequence(at + 1, bracket)
          formula = `<mrow>${tag('mo', rest[0])}${inner.content}${tag('mo', bracket)}</mrow>`
          at = inner.next + (source[inner.next] === bracket ? 1 : 0)
        }
        const subscript = count.exec(source.slice(at))
        if (subscript) {
          formula = `<msub>${formula}${tag('mn', subscript[0])}</msub>`
          at += subscript[0].length
        }
        atoms.push(formula)
        continue
      }
      if (amount) {
        atoms.push(tag('mn', amount[0]))
        at += amount[0].length
        continue
      }
      const glyph = ({ '-': '−', '=': '=', '#': '≡', '.': '·', '*': '·' } as Record<string, string>)[rest[0]] ?? rest[0]
      atoms.push(tag('mo', glyph))
      at++
    }
    return { content: atoms.join(''), next: at }
  }
  // Bounding recursion keeps nested grouping linear at presentation scale.
  if (source.length > 2048 || [...source.matchAll(/[([]/g)].length > 80) return tag('mtext', source)
  return `<mrow class="math-chemistry">${sequence(0).content}</mrow>`
}

export function physicalUnits(source: string): string {
  const [, value, power, units] = /^([+-]?\d+(?:[.,]\d+)?)(?:[eE]([+-]?\d+))?\s*(.*)$/.exec(source) ?? []
  if (!value) return tag('mtext', source)
  let formatted = tag('mn', value)
  if (power) formatted += `<mo>×</mo><msup><mn>10</mn>${tag('mn', power.replace('-', '−'))}</msup>`
  if (units) {
    const body = units.split(/\s+|(?=\/)|(?<=\/)/).filter(Boolean).map((unit) => {
      if (unit === '/') return '<mo>/</mo>'
      const [, name, exponent] = /^([A-ZµμΩ°%]+)(?:\^?\{?([+-]?\d+)\}?)?$/i.exec(unit) ?? []
      if (!name) return tag('mtext', unit)
      const symbol = tag('mi', name, ' mathvariant="normal"')
      return exponent ? `<msup>${symbol}${tag('mn', exponent.replace('-', '−'))}</msup>` : symbol
    })
    formatted += `<mspace width="0.26em"/>${body.join('<mspace width="0.18em"/>')}`
  }
  return `<mrow class="math-units">${formatted}</mrow>`
}
