const strut = 'data-math-strut'
const frameRow = 'data-equation-frame-row'
const selector = `mrow[${strut}], mtr[${frameRow}], mtable[data-equation-tags]:is(.math-display-grid, .math-tagged-display, .math-multline)`
const shifted = 'data-equation-tag-shifted'

function fitStrut(element: Element): void {
  const [measure, space] = element.children
  if (!measure || !space) return
  const [glyph, ascender] = measure.children
  if (!glyph || !ascender) return
  // Computed MathML box sizes already use the glyph's font and script level
  // and are independent of transforms used to fit the deck in the window.
  const glyphStyle = getComputedStyle(glyph)
  const total = Number.parseFloat(glyphStyle.height)
  const ascent = Number.parseFloat(getComputedStyle(ascender).height)
  if (!(total > 0) || !Number.isFinite(ascent)) return
  const [above, below] = (element.getAttribute(strut) ?? '').split(' ').map(Number)
  const limit = element.getAttribute('data-math-strut-limit')
  const max = limit === null ? Infinity : Number(limit) * Number.parseFloat(glyphStyle.fontSize)
  for (const [name, base, growth] of [['height', ascent, above], ['depth', total - ascent, below]] as const) {
    const length = Math.max(0, base + Math.min(growth * total, max))
    if (!Number.isFinite(length)) continue
    const value = `${Number(length.toFixed(4))}px`
    if (space.getAttribute(name) !== value) space.setAttribute(name, value)
  }
}

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

function fitFrames(row: Element): void {
  const bounds = row.getBoundingClientRect()
  const dimensions = getComputedStyle(row)
  const xScale = bounds.width / Number.parseFloat(dimensions.width)
  const yScale = bounds.height / Number.parseFloat(dimensions.height)
  if (!(xScale > 0 && yScale > 0 && Number.isFinite(xScale) && Number.isFinite(yScale))) return
  for (const frame of row.querySelectorAll(':scope > mtd > mspace[data-equation-frame]')) {
    const single = frame.getAttribute('data-equation-frame') === '1'
    const lhs = frame.previousElementSibling
    const left = (single ? lhs?.querySelector(':scope > [data-equation-frame-start]') : lhs)?.getBoundingClientRect()
    const right = single ? left : frame.parentElement?.nextElementSibling?.querySelector(':scope > mrow > [data-equation-frame-end]')?.getBoundingClientRect()
    if (!left || !right) continue
    const style = getComputedStyle(frame)
    const inset = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.borderTopWidth)
    if (!Number.isFinite(inset)) continue
    const top = Math.min(left.top, right.top)
    const bottom = Math.max(left.bottom, right.bottom)
    const properties = `left:${(left.left - bounds.left) / xScale - inset}px;top:${(top - bounds.top) / yScale - inset}px;width:${(right.right - left.left) / xScale + 2 * inset}px;height:${(bottom - top) / yScale + 2 * inset}px`
    if (frame.getAttribute('style') !== properties) frame.setAttribute('style', properties)
  }
}

export function createEquationFit(): (root: ParentNode, watch?: boolean) => void {
  const observed = new Map<Element, Element>()
  const pending = new Set<Element>()
  let resize: ResizeObserver | undefined
  let frame: number | undefined
  function fit(element: Element): void {
    if (element.hasAttribute(strut)) fitStrut(element)
    else if (element.hasAttribute(frameRow)) fitFrames(element)
    else fitTable(element)
  }

  function schedule(elements: Iterable<Element>): void {
    for (const element of elements) pending.add(element)
    frame ??= requestAnimationFrame(() => {
      frame = undefined
      const elements = new Set<Element>()
      for (const target of pending) {
        const element = observed.get(target)
        if (element?.isConnected) elements.add(element)
        else {
          resize?.unobserve(target)
          observed.delete(target)
        }
      }
      pending.clear()
      for (const element of elements) fit(element)
    })
  }

  function observe(target: Element, element: Element): void {
    if (observed.has(target)) return
    if (!resize) {
      resize = new ResizeObserver(entries => schedule(entries.map(entry => entry.target)))
      document.fonts?.addEventListener('loadingdone', () => schedule(observed.keys()))
    }
    observed.set(target, element)
    resize.observe(target)
  }

  return (root, watch = true) => {
    // A tag can depend on the dimensions of a strut in its equation.
    for (const element of Array.from(root.querySelectorAll(selector)).reverse()) {
      fit(element)
      if (!watch) continue
      // The unpadded glyphs change size even when the outer strut has fixed dimensions.
      if (element.hasAttribute(strut)) {
        for (const child of element.firstElementChild?.children ?? []) observe(child, element)
      }
      else if (element.hasAttribute(frameRow)) {
        observe(element, element)
        for (const cell of element.children) observe(cell, element)
      }
      else observe(element, element)
    }
  }
}
