import { describe, expect, it } from 'bun:test'
import { equationReveal, showEquation } from '../runtime/equation-steps.ts'

function mathElement(localName: string, children: Element[] = []) {
  const attributes = new Set<string>()
  return {
    element: {
      localName,
      children,
      toggleAttribute(name: string, force: boolean) {
        if (force) attributes.add(name)
        else attributes.delete(name)
      },
    } as unknown as Element,
    attributes,
  }
}

describe('MathML equation lines', () => {
  it('ignores rows in nested tables when mapping reveal ranges', () => {
    const nested = mathElement('mtr')
    const nestedTable = mathElement('mtable', [nested.element])
    const rowA = mathElement('mtr', [mathElement('mtd', [nestedTable.element]).element])
    const rowB = mathElement('mtr')
    const table = mathElement('mtable', [rowA.element, rowB.element]).element
    const root = {
      dataset: { equationSteps: '1|2' },
      querySelector: (selector: string) => selector === 'mtable[data-equation-lines]' ? table : null,
      toggleAttribute: () => {},
    } as unknown as HTMLElement

    const reveal = equationReveal(root, 0)
    expect(reveal.lines).toEqual([rowA.element, rowB.element])
    showEquation(reveal, 0)
    expect(rowA.attributes.has('data-equation-dim')).toBe(false)
    expect(rowB.attributes.has('data-equation-dim')).toBe(true)
    showEquation(reveal, 1)
    expect(rowA.attributes.has('data-equation-dim')).toBe(true)
    expect(rowB.attributes.has('data-equation-dim')).toBe(false)
    expect(nested.attributes.size).toBe(0)
  })
})
