const strut = 'data-math-strut'
const frameRow = 'data-equation-frame-row'
const empheq = '.math-empheq'
const transformBox = 'data-math-transform-box'
const selector = `${empheq}, mpadded[${transformBox}], mrow[${strut}], mtr[${frameRow}], mtable[data-equation-tags]:is(.math-display-grid, .math-tagged-display, .math-multline)`
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

function fitTransformedBox(box: Element): void {
  const frame = box.firstElementChild
  if (!frame) return
  const [ink, baseline, inline, block] = frame.children
  if (!ink || !baseline || !inline || !block) return
  const frameStyle = getComputedStyle(frame)
  const width = Number.parseFloat(frameStyle.width)
  const totalHeight = Number.parseFloat(frameStyle.height)
  if (!Number.isFinite(width) || !Number.isFinite(totalHeight)) return

  // Project onto the screen axis most aligned with the box's local y axis,
  // then remove the horizontal contribution from a rotated ancestor.
  const bounds = frame.getBoundingClientRect()
  const base = baseline.getBoundingClientRect()
  const inlineProbe = inline.getBoundingClientRect()
  const blockProbe = block.getBoundingClientRect()
  const axis = Math.abs(blockProbe.left - base.left) > Math.abs(blockProbe.top - base.top) ? 'left' : 'top'
  const blockStep = blockProbe[axis] - base[axis]
  const span = width * (inlineProbe[axis] - base[axis])
  const start = base[axis] + (frameStyle.direction === 'rtl' ? Math.min(0, span) : Math.min(0, -span))
  const extent = blockStep ? (start - bounds[axis]) / Math.abs(blockStep) : 0
  const height = Math.min(totalHeight, Math.max(0, blockStep < 0 ? totalHeight - extent : extent))
  const depth = totalHeight - height

  const horizontal = box.getAttribute('data-width') ?? ''
  const vertical = box.getAttribute('data-height') ?? ''
  const sizing = box.getAttribute(transformBox)
  const dimensions: Readonly<Record<string, number>> = { width, height, depth, totalheight: totalHeight, center: (height - depth) / 2 }
  const boxStyle = sizing === 'scale' ? undefined : getComputedStyle(box)
  function target(specification: string, axis: 'width' | 'height'): number {
    if (specification === 'length')
      return Number.parseFloat(boxStyle?.getPropertyValue(`--math-box-${axis}`) ?? '')
    const [natural, multiplier] = specification.split(':')
    return dimensions[natural] * Number(multiplier)
  }
  const length = (value: number) => `${Number(value.toFixed(4))}px`
  let advance: number
  let ascent: number
  let descent: number
  let origin: string
  let transform: string
  if (sizing === 'rotate') {
    const angle = Number(box.getAttribute('data-angle'))
    const x = target(horizontal, 'width')
    const y = height - target(vertical, 'height')
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const left = x - x * cosine + y * sine + Math.min(0, width * cosine) + Math.min(0, -totalHeight * sine)
    const top = y - x * sine - y * cosine + Math.min(0, width * sine) + Math.min(0, totalHeight * cosine)
    advance = Math.abs(width * cosine) + Math.abs(totalHeight * sine)
    const bottom = top + Math.abs(width * sine) + Math.abs(totalHeight * cosine)
    ascent = Math.max(0, height - top)
    descent = Math.max(0, bottom - height)
    origin = `${length(x)} ${length(y)}`
    transform = `translateX(${length(-left)}) rotate(${angle}rad)`
  }
  else {
    let x = Number(horizontal)
    let y = Number(vertical)
    if (sizing !== 'scale') {
      const naturalHeight = sizing === 'total' ? totalHeight : height
      x = width ? target(horizontal, 'width') / width : 1
      y = naturalHeight ? target(vertical, 'height') / naturalHeight : 1
      if (horizontal === '!') x = y
      if (vertical === '!') y = x
    }
    advance = width * Math.abs(x)
    ascent = (y < 0 ? depth : height) * Math.abs(y)
    descent = (y < 0 ? height : depth) * Math.abs(y)
    origin = `left ${length(height)}`
    transform = `translateX(${length(x < 0 ? advance : 0)}) scale(${x},${y})`
  }
  if (![advance, ascent, descent].every(Number.isFinite)) return

  // MPadded reserves the transformed dimensions at the original baseline.
  const style = `transform-origin:${origin};transform:${transform}`
  if (ink.getAttribute('style') !== style) ink.setAttribute('style', style)
  for (const [attribute, value] of [['width', advance], ['height', ascent], ['depth', descent]] as const) {
    const dimension = length(value)
    if (box.getAttribute(attribute) !== dimension) box.setAttribute(attribute, dimension)
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
  const equationWidth = cells.reduce((total, cell) => {
    if (!cell.hasAttribute('data-empheq-start') && !cell.hasAttribute('data-empheq-end'))
      return total + cell.getBoundingClientRect().width
    const style = getComputedStyle(cell)
    return total + cell.getBoundingClientRect().width + (Number.parseFloat(style.marginInlineStart) + Number.parseFloat(style.marginInlineEnd)) * scale
  }, 0)
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

function fitEmpheq(element: HTMLElement): void {
  const table = element.querySelector(':scope > math :is(.math-display-grid, .math-tagged-display, .math-multline), :scope > .math-short-display > math :is(.math-display-grid, .math-tagged-display, .math-multline)')
  if (!table) return
  const outer = element.querySelector<HTMLElement>(':scope > [data-empheq-box="outer"]')
  const inner = element.querySelector<HTMLElement>(':scope > [data-empheq-box="inner"]')
  const left = element.querySelector<HTMLElement>(':scope > [data-empheq-side="left"]')
  const right = element.querySelector<HTMLElement>(':scope > [data-empheq-side="right"]')
  const cells = Array.from(table.querySelectorAll(':scope > mtr > mtd:not(.math-equation-number, [aria-hidden])'))
  const rootStyle = getComputedStyle(element)
  const initial = element.getBoundingClientRect()
  const xScale = initial.width / Number.parseFloat(rootStyle.width)
  const yScale = initial.height / Number.parseFloat(rootStyle.height)
  if (!(xScale > 0 && yScale > 0 && Number.isFinite(xScale) && Number.isFinite(yScale)) || !cells.length) return
  const inset = (box: HTMLElement | null) => {
    if (!box) return 0
    const style = getComputedStyle(box)
    return Number.parseFloat(style.paddingTop) + Number.parseFloat(style.borderTopWidth)
  }
  const outerInset = inset(outer)
  const innerInset = inset(inner)
  const totalInset = outerInset + innerInset
  // A margin box paints outside its content's horizontal space.
  const inlineInset = element.hasAttribute('data-empheq-marginbox') ? innerInset : totalInset
  const length = (value: number) => `${Number(value.toFixed(4))}px`
  const assign = (box: HTMLElement, property: string, amount: number) => {
    const value = length(amount)
    if (box.style.getPropertyValue(property) !== value) box.style.setProperty(property, value)
  }
  const width = (side: HTMLElement | null) => side ? side.getBoundingClientRect().width / xScale : 0
  function reserve(): void {
    assign(element, '--empheq-inline-start', width(left) + inlineInset)
    assign(element, '--empheq-inline-end', width(right) + inlineInset)
  }
  function body() {
    const root = element.getBoundingClientRect()
    const boxes = cells.map(cell => cell.getBoundingClientRect()).filter(box => box.width && box.height)
    if (!boxes.length) return
    return {
      x: (Math.min(...boxes.map(box => box.left)) - root.left) / xScale,
      y: (Math.min(...boxes.map(box => box.top)) - root.top) / yScale,
      right: (Math.max(...boxes.map(box => box.right)) - root.left) / xScale,
      bottom: (Math.max(...boxes.map(box => box.bottom)) - root.top) / yScale,
    }
  }
  const fences = Array.from(element.querySelectorAll(':scope > .math-empheq-side [data-empheq-delimiter]'), fence => ({
    fence,
    phantom: fence.nextElementSibling,
    pad: fence.getAttribute('data-empheq-delimiter') === 'inner' ? innerInset : 0,
    factor: Number(fence.getAttribute('data-empheq-factor') ?? 950) / 1000,
    shortfall: Number.parseFloat(getComputedStyle(fence).getPropertyValue('--empheq-shortfall')) || 0,
  }))
  function stretch(bounds: NonNullable<ReturnType<typeof body>>): void {
    for (const { fence, phantom, pad, factor, shortfall } of fences) {
      const naturalHeight = bounds.bottom - bounds.y + 2 * pad
      const target = Math.max(0, naturalHeight * factor, naturalHeight - shortfall)
      const half = length(target / 2)
      if (phantom && phantom.getAttribute('height') !== half) {
        phantom.setAttribute('height', half)
        phantom.setAttribute('depth', half)
        fence.setAttribute('minsize', length(target))
      }
    }
  }
  assign(element, '--empheq-block-pad', totalInset)
  reserve()
  let bounds = body()
  if (!bounds) return
  stretch(bounds)
  reserve()
  if (table.hasAttribute('data-equation-tags')) fitTable(table)
  bounds = body() ?? bounds
  stretch(bounds)

  const framed = (box: HTMLElement, rect: typeof bounds, pad: number) => {
    assign(box, 'left', rect.x - pad)
    assign(box, 'top', rect.y - pad)
    assign(box, 'width', rect.right - rect.x + 2 * pad)
    assign(box, 'height', rect.bottom - rect.y + 2 * pad)
    box.setAttribute('data-empheq-ready', '')
  }
  if (inner) framed(inner, bounds, innerInset)
  const group = { x: bounds.x - innerInset, y: bounds.y - innerInset, right: bounds.right + innerInset, bottom: bounds.bottom + innerInset }
  for (const [side, onLeft] of [[left, true], [right, false]] as const) {
    if (!side) continue
    const sideBox = side.getBoundingClientRect()
    const w = sideBox.width / xScale
    const h = sideBox.height / yScale
    const y = (bounds.y + bounds.bottom - h) / 2
    const x = onLeft ? group.x - w : group.right
    assign(side, 'left', x)
    assign(side, 'top', y)
    side.setAttribute('data-empheq-ready', '')
    group.x = Math.min(group.x, x)
    group.y = Math.min(group.y, y)
    group.right = Math.max(group.right, x + w)
    group.bottom = Math.max(group.bottom, y + h)
  }
  if (outer) framed(outer, group, outerInset)
}

export function createEquationFit(): (root: ParentNode, watch?: boolean) => void {
  const observed = new Map<Element, Element>()
  const pending = new Set<Element>()
  let resize: ResizeObserver | undefined
  let frame: number | undefined
  function fit(element: Element): void {
    if (element.hasAttribute(strut)) fitStrut(element)
    else if (element.hasAttribute(transformBox)) fitTransformedBox(element)
    else if (element.hasAttribute(frameRow)) fitFrames(element)
    else if (element.matches(empheq)) fitEmpheq(element as HTMLElement)
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
      else if (element.hasAttribute(transformBox) && element.firstElementChild) {
        observe(element.firstElementChild, element)
      }
      else if (element.hasAttribute(frameRow)) {
        observe(element, element)
        for (const cell of element.children) observe(cell, element)
      }
      else observe(element, element)
    }
  }
}
