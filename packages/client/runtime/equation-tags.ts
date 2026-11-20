const selector = 'mtable[data-equation-tags]:is(.math-display-grid, .math-tagged-display, .math-multline)'
const shifted = 'data-equation-tag-shifted'

function fitTable(table: Element): void {
  const width = table.getBoundingClientRect().width
  if (!width) return
  const rows = [...table.children].filter(row => row.localName === 'mtr' && !row.hasAttribute('data-equation-intertext'))
  if (!rows.length) return
  if (table.classList.contains('math-multline')) {
    // The flex row already wraps. Measure its cells before the relative
    // adjustment on the tag's contents so the next layout stays stable.
    for (const row of rows) {
      const tag = row.querySelector(':scope > .math-equation-number:not(:empty)')
      const body = row.querySelector(':scope > mtd:not(.math-equation-number)')
      if (!tag || !body) continue
      const tagBox = tag.getBoundingClientRect()
      const bodyBox = body.getBoundingClientRect()
      tag.toggleAttribute(shifted, tagBox.bottom <= bodyBox.top + 0.5 || tagBox.top >= bodyBox.bottom - 0.5)
    }
    return
  }

  const style = getComputedStyle(table)
  const scale = width / Number.parseFloat(style.width)
  const em = Number.parseFloat(style.fontSize) * scale
  if (!(em > 0 && Number.isFinite(em))) return
  const single = table.classList.contains('math-tagged-display')
  const cells = [...rows[0].querySelectorAll(':scope > mtd:not(.math-equation-number, [aria-hidden])')]
  const equationWidth = cells.reduce((total, cell) => total + cell.getBoundingClientRect().width, 0)
  // Equation cells occupy shared max-content tracks. Reserve their width and
  // the minimum interpair gaps before deciding which individual tags fit.
  const pairGaps = Number(style.getPropertyValue('--math-pair-gaps')) || 0
  const tagGap = single ? (rows[0].children.length - 1) * em / 2 : em / 2
  const available = width - equationWidth - pairGaps * em - tagGap
  for (const row of rows) {
    const tag = row.querySelector(':scope > .math-equation-number')
    const label = tag?.firstElementChild
    if (label) tag!.toggleAttribute(shifted, label.getBoundingClientRect().width > available + 0.5)
  }
}

export function createEquationTagFit(): (root: ParentNode, watch?: boolean) => void {
  const observed = new Set<Element>()
  const pending = new Set<Element>()
  let resize: ResizeObserver | undefined
  let frame: number | undefined
  function schedule(elements: Iterable<Element>): void {
    for (const element of elements) pending.add(element)
    frame ??= requestAnimationFrame(() => {
      frame = undefined
      for (const table of pending) {
        if (table.isConnected) fitTable(table)
        else {
          resize?.unobserve(table)
          observed.delete(table)
        }
      }
      pending.clear()
    })
  }

  return (root, watch = true) => {
    for (const table of root.querySelectorAll(selector)) {
      fitTable(table)
      if (!watch || observed.has(table)) continue
      if (!resize) {
        resize = new ResizeObserver(entries => schedule(entries.map(entry => entry.target)))
        document.fonts?.addEventListener('loadingdone', () => schedule(observed))
      }
      observed.add(table)
      resize.observe(table)
    }
  }
}
