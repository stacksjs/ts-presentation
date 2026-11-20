import { escapeHtml } from './html.ts'
import type { Markup } from './math-markup.ts'
import { xml } from './math-markup.ts'

type Head = 'open' | 'upper' | 'lower' | 'double' | 'bar' | 'hook' | 'two'
export type EquilibriumBias = 'left' | 'right'
export const texArrowMinWidth = '1.75em'

interface Track { left?: Head, right?: Head, lane?: 'upper' | 'lower', double?: boolean }

const tracks: Readonly<Record<string, readonly Track[]>> = {
  '→': [{ right: 'open' }],
  '←': [{ left: 'open' }],
  '↔': [{ left: 'open', right: 'open' }],
  '⇒': [{ right: 'double', double: true }],
  '⇐': [{ left: 'double', double: true }],
  '⇔': [{ left: 'double', right: 'double', double: true }],
  '↦': [{ left: 'bar', right: 'open' }],
  '↪': [{ left: 'hook', right: 'open' }],
  '↩': [{ left: 'open', right: 'hook' }],
  '↞': [{ left: 'two' }],
  '↠': [{ right: 'two' }],
  '↼': [{ left: 'upper' }],
  '↽': [{ left: 'lower' }],
  '⇀': [{ right: 'upper' }],
  '⇁': [{ right: 'lower' }],
  '⇋': [{ left: 'upper', lane: 'upper' }, { right: 'lower', lane: 'lower' }],
  '⇌': [{ right: 'upper', lane: 'upper' }, { left: 'lower', lane: 'lower' }],
  '⇄': [{ right: 'open', lane: 'upper' }, { left: 'open', lane: 'lower' }],
  '=': [{ double: true }],
}

function data(name: string, value: string | undefined): string {
  return value ? ` data-${name}="${value}"` : ''
}

/**
 * MathML provides the intrinsic label width and script placement. The painted
 * shaft fills that width even when the browser's math font lacks an extensible
 * glyph. The operator remains available to MathML consumers and plain renders.
 */
export function mathArrowBody(symbol: string, minWidth = '', bias?: EquilibriumBias): string {
  const lanes = tracks[symbol]
  const minimum = minWidth ? ` minsize="${minWidth}"` : ''
  const glyph = `<mo stretchy="true" movablelimits="false"${minimum}>${escapeHtml(symbol)}</mo>`
  if (!lanes) return glyph
  const geometry = lanes.map(({ left, right, lane, double }) => {
    const short = (bias === 'left' && lane === 'upper') || (bias === 'right' && lane === 'lower')
    const attributes = data('lane', lane) + data('left', left) + data('right', right)
    return `<mspace class="math-arrow-track"${attributes}${double ? ' data-double=""' : ''}${short ? ' data-short=""' : ''} aria-hidden="true"/>`
  }).join('')
  const size = minWidth ? ` style="min-width:${minWidth}"` : ''
  return `<mrow class="math-arrow-body"${data('equilibrium', bias)}${size}>${glyph}${geometry}</mrow>`
}

export function verticalMathArrow(symbol: '↑' | '↓' | '‖'): string {
  const direction = symbol === '↑' ? 'up' : symbol === '↓' ? 'down' : 'parallel'
  return `<mrow class="math-cd-arrow" data-direction="${direction}">${mathArrowBody(symbol, '1.8em')}</mrow>`
}

export function stackMathArrow(base: string, above: Markup, below: Markup): Markup {
  if (above && below) return xml`<munderover>${base}${below}${above}</munderover>`
  if (above) return xml`<mover>${base}${above}</mover>`
  return below ? xml`<munder>${base}${below}</munder>` : base
}
