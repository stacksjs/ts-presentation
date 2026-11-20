// Adapted from Slidev v53.1.0. See licenses/Slidev-MIT.txt.
import type { RawMathElement, RawMathFragment, RawMathSnapshot, RawNode, RawSlide, RawSnapshot, RawStyle } from './ir.ts'

/**
 * The one function that runs inside the browser. Invariant: zero free variables.
 * Bun WebView evaluates this function's source where none of this
 * module's imports exist, so everything it needs is nested inside it or passed as a
 * parameter; `walker.test.ts` enforces this mechanically. The type-only import above
 * is erased at compile time and is safe.
 *
 * It extracts facts only a live layout engine can supply and makes no decisions;
 * every judgement lives in `normalize.ts`, where it can be unit-tested.
 */
export function collectSnapshot(options: {
  containerSelector: string
  idAttribute: string
  slide: number
  click: number
}): RawSnapshot {
  const STYLE_KEYS = [
    'display',
    'position',
    'zIndex',
    'visibility',
    'opacity',
    'color',
    'backgroundColor',
    'backgroundImage',
    'backgroundSize',
    'backgroundPosition',
    'backgroundOrigin',
    'backgroundAttachment',
    'backgroundBlendMode',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'textAlign',
    'textDecorationLine',
    'textTransform',
    'letterSpacing',
    'lineHeight',
    'whiteSpace',
    'paddingLeft',
    'paddingRight',
    'borderTopWidth',
    'borderTopStyle',
    'borderTopColor',
    'borderRightWidth',
    'borderRightStyle',
    'borderRightColor',
    'borderBottomWidth',
    'borderBottomStyle',
    'borderBottomColor',
    'borderLeftWidth',
    'borderLeftStyle',
    'borderLeftColor',
    'borderTopLeftRadius',
    'boxShadow',
    'filter',
    'backdropFilter',
    'mixBlendMode',
    'clipPath',
    'transform',
    'writingMode',
    'webkitBackgroundClip',
    'top',
    'right',
    'bottom',
    'left',
    'width',
    'height',
    'overflow',
  ] as const

  /** Strips the quotes CSS keeps around a `content` or font family value. */
  const RE_QUOTES = /^["']|["']$/g

  const styles: RawStyle[] = []
  const styleIndex = new Map<string, number>()

  function mathExpression(root: Element): RawMathElement | undefined {
    let nodes = 0
    let characters = 0
    function read(element: Element, depth: number): RawMathElement | undefined {
      if (++nodes > 600 || depth > 40 || element.namespaceURI !== 'http://www.w3.org/1998/Math/MathML') return
      // Ignore annotations at the root by capturing its presentation child.
      const attributes = Object.fromEntries(Array.from(element.attributes, attribute => [attribute.name, attribute.value]))
      const text = Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.nodeValue).join('')
      characters += text.length
      if (characters > 4096) return
      const children: RawMathElement[] = []
      for (const child of element.children) {
        const nested = read(child, depth + 1)
        if (!nested) return
        children.push(nested)
      }
      const result: RawMathElement = { name: element.localName, attributes, text, children }
      if (element.localName === 'munderover' && children[0]?.attributes.class === 'math-arrow-body' && children.length === 3) {
        const [, below, above] = element.children
        result.widerArrowLabel = below.getBoundingClientRect().width > above.getBoundingClientRect().width ? 'below' : 'above'
      }
      if (/^color:[^;]+;?$/.test(attributes.style ?? '')) result.color = getComputedStyle(element).color
      if (element.localName === 'mtr' && element.hasAttribute('data-equation-dim'))
        result.opacity = Number(getComputedStyle(element).opacity)
      return result
    }
    return read(root, 0)
  }
  const scaledKeys = [
    'fontSize', 'letterSpacing', 'lineHeight', 'paddingLeft', 'paddingRight',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopLeftRadius',
    'top', 'right', 'bottom', 'left', 'width', 'height',
  ] as const

  function componentScale(element: Element, computed: CSSStyleDeclaration): number | undefined {
    if (computed.transform === 'none' || element.getAttribute('data-presentation-transform') === null) return
    if (computed.rotate !== 'none' || computed.scale !== 'none') return
    const matrix = new DOMMatrixReadOnly(computed.transform)
    if (matrix.is2D && matrix.b === 0 && matrix.c === 0 && matrix.a === matrix.d && matrix.a > 0)
      return matrix.a
  }

  /**
   * Intern a computed style: `getComputedStyle` exposes several hundred properties,
   * so serializing a full style per node turns a snapshot into megabytes crossing
   * the CDP boundary. A few hundred nodes collapse to a few dozen distinct styles.
   */
  function intern(computed: CSSStyleDeclaration, scale = 1, flattenTransform = false): number {
    const record: Record<string, string> = {}
    for (const key of STYLE_KEYS)
      record[key] = computed[key as any] ?? ''
    if (computed.rotate && computed.rotate !== 'none' && computed.rotate !== '0deg' && record.transform === 'none')
      record.transform = computed.rotate
    if (flattenTransform) record.transform = 'none'
    if (scale !== 1) {
      for (const key of scaledKeys) {
        if (/^-?[\d.]+px$/.test(record[key])) record[key] = `${Number.parseFloat(record[key]) * scale}px`
      }
    }
    const key = JSON.stringify(record)
    const existing = styleIndex.get(key)
    if (existing !== undefined)
      return existing
    const index = styles.length
    // Complete by construction: every `RawStyle` key comes from `STYLE_KEYS`.
    styles.push(record as unknown as RawStyle)
    styleIndex.set(key, index)
    return index
  }

  /**
   * Which family a CSS font stack actually resolves to on this machine, measured by
   * rendering a probe string and comparing widths: `document.fonts.check()` returns
   * true for families that do not exist.
   */
  const unplaceablePseudos: string[] = []
  const fontResolution: Record<string, string> = {}
  const probeCanvas = document.createElement('canvas')
  const probeContext = probeCanvas.getContext('2d')!
  const PROBE = 'mmmmmmmmmmlliWWWWWW0Oo'
  const BASES = ['monospace', 'sans-serif', 'serif']
  const baseWidths: Record<string, number> = {}
  for (const base of BASES) {
    probeContext.font = `72px ${base}`
    baseWidths[base] = probeContext.measureText(PROBE).width
  }

  function isAvailable(family: string): boolean {
    for (const base of BASES) {
      probeContext.font = `72px "${family}", ${base}`
      // A missing family falls through to the base, so an identical width
      // against every base means it never took effect.
      if (probeContext.measureText(PROBE).width !== baseWidths[base])
        return true
    }
    return false
  }

  // CSS keywords, not typefaces; naming one in a .pptx makes PowerPoint substitute its default.
  const GENERIC = [
    'system-ui',
    'ui-sans-serif',
    'ui-serif',
    'ui-monospace',
    'ui-rounded',
    'sans-serif',
    'serif',
    'monospace',
    'cursive',
    'fantasy',
    'math',
    'emoji',
    'fangsong',
    'inherit',
    'initial',
    'unset',
  ]

  function resolveStack(stack: string): void {
    if (stack in fontResolution)
      return
    for (const raw of stack.split(',')) {
      const family = raw.trim().replace(RE_QUOTES, '')
      if (!family)
        continue
      if (GENERIC.includes(family.toLowerCase()) || family.charAt(0) === '-')
        continue
      // `@fontsource-variable` names its family "Inter Variable"; the face
      // people actually have installed is "Inter". So the stack is probed
      // under the name the page really registered, and only the name written
      // into the file is stripped. Testing the stripped name first finds
      // nothing whenever the theme ships the font as a webfont and the machine
      // has no static copy, which is the usual case, and the whole deck then
      // falls through to a system face the author never chose.
      const cleaned = family.replace(/\s+Variable$/, '')
      if (isAvailable(family) || isAvailable(cleaned)) {
        fontResolution[stack] = cleaned
        return
      }
    }
    fontResolution[stack] = ''
  }

  /**
   * The nearest painted background color at or above the slide container; themes
   * can put `bg-main` on an ancestor rather than on the container itself.
   */
  function backgroundOf(container: Element): string | undefined {
    // Any fully transparent color ends nothing: matching only the literal
    // `rgba(0, 0, 0, 0)` misses `rgba(255, 255, 255, 0)` and `oklch(... / 0)`.
    // The browser judges, since it accepts syntaxes no parser here does.
    const probe = document.createElement('canvas').getContext('2d')
    let node: Element | null = container
    while (node) {
      const color = getComputedStyle(node).backgroundColor
      if (color && color !== 'transparent') {
        if (!probe)
          return color
        // Painting over an opaque backdrop leaves it untouched only when the color contributes nothing.
        probe.clearRect(0, 0, 1, 1)
        probe.fillStyle = color
        probe.fillRect(0, 0, 1, 1)
        if (probe.getImageData(0, 0, 1, 1).data[3] !== 0)
          return color
      }
      node = node.parentElement
    }
    return undefined
  }

  function fillsPictureBox(image: HTMLImageElement, style: CSSStyleDeclaration, box: DOMRect, container: Element): boolean {
    if (!image.complete || !image.naturalWidth || !image.naturalHeight || !box.width || !box.height) return false
    if (style.objectFit !== 'fill') {
      const fitsExactly = Math.abs(box.width - box.height * image.naturalWidth / image.naturalHeight) < 0.01
      if (!fitsExactly || !['cover', 'contain'].includes(style.objectFit)) return false
    }
    if ([style.padding, style.borderWidth, style.borderRadius].some(value => value !== '0px')) return false
    if (!['transparent', 'rgba(0, 0, 0, 0)'].includes(style.backgroundColor) || style.boxShadow !== 'none') return false
    let parent: Element | null = image
    while (parent && parent !== container) {
      const paint = parent === image ? style : getComputedStyle(parent)
      if (paint.maskImage !== 'none' || paint.rotate !== 'none'
        || paint.scale !== 'none' || paint.clip !== 'auto' || paint.clipPath !== 'none') return false
      if (parent !== image && (paint.overflowX !== 'visible' || paint.overflowY !== 'visible')) {
        const limits = parent.getBoundingClientRect()
        if (paint.borderRadius !== '0px' || paint.borderWidth !== '0px'
          || (paint.overflowX !== 'visible' && (box.left < limits.left || box.right > limits.right))
          || (paint.overflowY !== 'visible' && (box.top < limits.top || box.bottom > limits.bottom))) return false
      }
      parent = parent.parentElement
    }
    return parent === container
  }

  /**
   * The text an ordinary list marker renders, which the DOM never exposes; ordered
   * lists need the ordinal counted over previous list-item siblings.
   */
  function markerGlyph(el: Element, listStyleType: string): string {
    const BULLETS: Record<string, string> = {
      'disc': '\u2022 ',
      'circle': '\u25E6 ',
      'square': '\u25AA ',
      'disclosure-open': '\u25BE ',
      'disclosure-closed': '\u25B8 ',
    }
    if (listStyleType in BULLETS)
      return BULLETS[listStyleType]

    let ordinal = 1
    let sibling = el.previousElementSibling
    while (sibling) {
      if (getComputedStyle(sibling).display === 'list-item')
        ordinal++
      sibling = sibling.previousElementSibling
    }
    const parent = el.parentElement
    const start = parent && parent.tagName.toUpperCase() === 'OL'
      ? Number(parent.getAttribute('start') || '1')
      : 1
    const value = ordinal + (Number.isFinite(start)
      ? start
      : 1) - 1

    if (listStyleType === 'lower-alpha' || listStyleType === 'lower-latin')
      return `${String.fromCharCode(96 + ((value - 1) % 26) + 1)}. `
    if (listStyleType === 'upper-alpha' || listStyleType === 'upper-latin')
      return `${String.fromCharCode(64 + ((value - 1) % 26) + 1)}. `
    return `${value}. `
  }

  const containers = Array.from(document.querySelectorAll(options.containerSelector))
  const slides: RawSlide[] = []
  let nextId = 0

  for (const container of containers) {
    const containerRect = container.getBoundingClientRect()

    // A print page stacks every slide into one tall viewport; a container not
    // being rendered has a zero-sized rect. `--range` is the caller's filter.
    if (containerRect.width === 0 || containerRect.height === 0)
      continue

    const nodes: RawNode[] = []

    function relative(rect: DOMRect | { left: number, top: number, width: number, height: number }) {
      return {
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
        w: rect.width,
        h: rect.height,
      }
    }

    function mathBounds(boxes: DOMRect[]) {
      if (!boxes.length) return
      const left = Math.min(...boxes.map(box => box.left))
      const top = Math.min(...boxes.map(box => box.top))
      const width = Math.max(...boxes.map(box => box.right)) - left
      const height = Math.max(...boxes.map(box => box.bottom)) - top
      if (width > 0 && height > 0) return relative({ left, top, width, height })
    }

    function intertextFragments(element: Element, data: RawMathElement, opacity: number, scale: number): RawMathFragment[] {
      const fontSize = Number.parseFloat(getComputedStyle(element).fontSize) * scale
      const fragments: RawMathFragment[] = []
      type Wrap = (expression: RawMathElement) => RawMathElement
      function add(boxes: DOMRect[], expression: RawMathElement, wrap: Wrap): void {
        const rect = mathBounds(boxes)
        if (rect) fragments.push({ expression: wrap(expression), rect, fontSize, opacity })
      }

      function collect(current: Element, expression: RawMathElement, wrap: Wrap): void {
        const boxes = [...current.getClientRects()]
        if (boxes.length <= 1) {
          add(boxes, expression, wrap)
          return
        }
        if (expression.name === 'mrow') {
          for (const [index, child] of [...current.children].entries())
            collect(child, expression.children[index], part => wrap({ ...expression, children: [part] }))
          return
        }
        const text = current.firstChild
        if (expression.name !== 'mtext' || text?.nodeType !== Node.TEXT_NODE) {
          add(boxes, expression, wrap)
          return
        }
        // Match the browser's line breaks, including styled words and clusters
        // made of multiple Unicode code points.
        const value = text.textContent ?? ''
        const breaks = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].map(part => part.index)
        breaks.push(value.length)
        const range = document.createRange()
        for (let start = 0; start < breaks.length - 1;) {
          range.setStart(text, breaks[start])
          const line = (end: number) => {
            range.setEnd(text, breaks[end])
            return [...range.getClientRects()].filter(rect => rect.width > 0)
          }
          let low = start + 1
          let high = breaks.length - 1
          while (low < high) {
            const mid = Math.ceil((low + high) / 2)
            const measured = line(mid)
            if (measured.every(rect => rect.top === measured[0]?.top)) low = mid
            else high = mid - 1
          }
          add(line(low), { ...expression, text: value.slice(breaks[start], breaks[low]) }, wrap)
          start = low
        }
      }
      collect(element, data, expression => expression)
      return fragments
    }

    function mathProjection(presentation: Element, expression: RawMathElement, display: boolean, scale: number): RawMathSnapshot | undefined {
      let table = presentation
      let data = expression
      while (table.localName === 'mrow' && table.children.length === 1) {
        table = table.children[0]
        data = data.children[0]
      }
      const singleTag = display && table.localName === 'mtable' && table.getAttribute('class') === 'math-tagged-display'
      const ams = display && table.localName === 'mtable' && table.hasAttribute('data-equation-environment')
      const tagsAtMargin = ams && table.hasAttribute('data-equation-tags')
      const spacedRows = ams && table.hasAttribute('data-equation-row-spacing')
      if (!singleTag && !tagsAtMargin && !spacedRows) {
        const rect = relative(presentation.getBoundingClientRect())
        if (rect.w > 0 && rect.h > 0) return { expression, rect, display }
        return
      }

      const fragment = (element: Element, expression: RawMathElement, opacity: number, rect: RawMathFragment['rect']): RawMathFragment => ({
        expression, opacity, rect, fontSize: Number.parseFloat(getComputedStyle(element).fontSize) * scale,
      })
      // Capture tags independently of the full-width gutters.
      const tags: RawMathFragment[] = []
      const measuredCells: RawMathFragment[] = []
      const body: DOMRect[] = []
      let singleFormula: RawMathSnapshot | undefined
      for (const [index, row] of Array.from(table.children).entries()) {
        const mathRow = data.children[index]
        const rowOpacity = mathRow.opacity ?? 1
        if (row.hasAttribute('data-equation-intertext')) {
          const paragraph = row.firstElementChild?.firstElementChild?.firstElementChild
          const content = mathRow.children[0]?.children[0]?.children[0]
          if (!spacedRows || !paragraph || !content) return
          body.push(paragraph.getBoundingClientRect())
          measuredCells.push(...intertextFragments(paragraph, content, rowOpacity, scale))
          continue
        }
        const cells = Array.from(row.children)
        const tagIndex = cells.findIndex(cell => cell.getAttribute('class') === 'math-equation-number')
        if ((singleTag || tagsAtMargin) && tagIndex < 0) return
        for (const [column, cell] of cells.entries()) {
          const cellData = mathRow.children[column]
          if (column === tagIndex) {
            if (!cell.children.length && !cellData.text.trim()) continue
            const label = cell.firstElementChild
            if (!label || cell.children.length !== 1 || cellData.text.trim()) return
            const rect = mathBounds([label.getBoundingClientRect()])
            if (!rect) return
            tags.push(fragment(label, cellData.children[0], rowOpacity, rect))
          }
          else if (singleTag) {
            if (cell.hasAttribute('aria-hidden')) continue
            const formula = cell.firstElementChild
            if (singleFormula || !cell.hasAttribute('data-equation-body') || !formula || cell.children.length !== 1) return
            singleFormula = mathProjection(formula, cellData.children[0], true, scale)
            if (!singleFormula) return
          }
          else {
            body.push(cell.getBoundingClientRect())
            if (!spacedRows) continue
            const boxes = Array.from(cell.children, child => child.getBoundingClientRect())
            const rect = mathBounds(boxes)
            if (rect) measuredCells.push(fragment(cell, cellData, rowOpacity, rect))
            else if (/(?:^|;)(?:border-|background:)/.test(cellData.attributes.style ?? '')) return
          }
        }
        if (tagIndex >= 0) mathRow.children.splice(tagIndex, 1)
      }
      if (singleTag) {
        if (singleFormula) return { ...singleFormula, tags: [...(singleFormula.tags ?? []), ...tags] }
        return
      }
      const rect = mathBounds(body)
      if (!rect) return
      if (!spacedRows) return { expression, rect, display, tags }
      if (measuredCells.length) return { rect, display, tags, cells: measuredCells }
    }

    function walk(node: Node, parent: number, fromShadowRoot: boolean, inheritedOpacity: number, inheritedScale: number): void {
      if (node.nodeType === 3) {
        const text = node.textContent ?? ''
        // A whitespace-only node can hold the only space between two inline
        // elements; kept when it occupies a line box, ignored when collapsed.
        if (!text)
          return
        const range = document.createRange()
        range.selectNodeContents(node)
        const rects = Array.from(range.getClientRects())
        range.detach()
        // A rect-less node still matters twice over: inside `white-space: pre`
        // a newline is the only record of where a line ends, and a
        // whitespace-only node is the only record that two inline elements are
        // separated at all. Chromium reports no rect for the space between two
        // inline-blocks, and without it `<kbd>shift</kbd> <kbd>space</kbd>`
        // came out as "shiftspace".
        if (!rects.length) {
          if (text.trim())
            return
          nodes.push({
            id: nextId++,
            parent,
            tag: '#text',
            style: -1,
            rect: { x: 0, y: 0, w: 0, h: 0 },
            glyphRects: [],
            text,
          })
          return
        }
        // Glyph rects, not the element box: positioned from the element rect the text lands offset and re-wraps.
        const bounds = {
          left: Math.min(...rects.map(r => r.left)),
          top: Math.min(...rects.map(r => r.top)),
          width: Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left)),
          height: Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top)),
        }
        nodes.push({
          id: nextId++,
          parent,
          tag: '#text',
          style: -1,
          rect: relative(bounds),
          glyphRects: rects.map(relative),
          text,
          // A text node inherits the compounded opacity; without it a greyed paragraph exports solid.
          ...(inheritedOpacity < 1
            ? { opacity: inheritedOpacity }
            : {}),
        })
        return
      }

      if (node.nodeType !== 1)
        return

      const el = node as Element
      const id = nextId++
      const computed = getComputedStyle(el)

      // `visibility: hidden` and `opacity: 0` still have boxes: a not-yet-revealed
      // v-click element sits at opacity 0 and would export onto every click step.
      if (computed.display === 'none' || computed.visibility === 'hidden')
        return
      const own = Number(computed.opacity)
      // CSS `opacity` does not inherit, and DrawingML has no group opacity to stand
      // in for a wrapper's, so it is compounded here while the tree is available.
      const effectiveOpacity = inheritedOpacity * (Number.isFinite(own)
        ? own
        : 1)
      if (effectiveOpacity === 0)
        return
      const ownScale = componentScale(el, computed)
      // Bounding boxes already include these transforms. Scale the computed
      // font and paint lengths to match those boxes in the editable output.
      const scale = inheritedScale * (ownScale ?? 1)

      el.setAttribute(options.idAttribute, String(id))
      resolveStack(computed.fontFamily)

      let box = el.getBoundingClientRect()
      if (el.localName === 'math') {
        // A TeX lap can paint outside the formula without taking up layout space.
        for (const overlap of el.querySelectorAll('.math-overlap-l, .math-overlap-c, .math-overlap-r')) {
          const ink = overlap.getBoundingClientRect()
          const left = Math.min(box.left, ink.left)
          const top = Math.min(box.top, ink.top)
          box = new DOMRect(left, top, Math.max(box.right, ink.right) - left, Math.max(box.bottom, ink.bottom) - top)
        }
      }
      const record: RawNode = {
        id,
        parent,
        tag: el.tagName.toUpperCase(),
        style: intern(computed, scale, ownScale !== undefined),
        rect: relative(box),
        // Document coordinates too: an element overflowing the slide is
        // captured as a page clip, which needs a page-space rectangle.
        pageRect: {
          x: box.left + window.scrollX,
          y: box.top + window.scrollY,
          w: box.width,
          h: box.height,
        },
      }
      if (effectiveOpacity < 1)
        record.opacity = effectiveOpacity
      if (scale !== 1 && computed.backgroundImage.startsWith('linear-gradient('))
        record.paintScale = scale
      // An inline box that wraps paints once per line, so backgrounds belong to
      // the fragments. Only `inline` proper: an inline-block has one rect.
      if (computed.display === 'inline') {
        const fragments = Array.from(el.getClientRects())
        if (fragments.length > 1)
          record.fragments = fragments.map(relative)
      }
      if (fromShadowRoot)
        record.fromShadowRoot = true
      // KaTeX marks its root by class; the MathML it writes for screen readers is display:none.
      if (el.localName === 'math' || el.classList.contains('katex'))
        record.isMath = true
      const semantics = el.localName === 'math' ? el.firstElementChild : undefined
      // Inline wrapping creates a MathML root for each visible fragment and
      // keeps the original formula hidden for assistive technology.
      const fragment = semantics?.localName === 'mrow' && el.getAttribute('class') === 'math-inline-fragment'
        && el.parentElement?.classList.contains('math-inline')
      const presentation = fragment ? semantics : semantics?.localName === 'semantics' && !el.hasAttribute('class') ? semantics.firstElementChild : undefined
      if (presentation && !computed.getPropertyValue('--math-min-rule').trim()) {
        const expression = mathExpression(presentation)
        const source = expression && mathProjection(presentation, expression, el.getAttribute('display') === 'block', scale)
        if (source) record.math = source
      }
      if (el.tagName.toUpperCase() === 'IMG') {
        const image = el as HTMLImageElement
        record.src = image.currentSrc || image.src
        if (image.alt) record.alt = image.alt
        if (effectiveOpacity === 1 && fillsPictureBox(image, computed, box, container)) record.preserveImageSource = true
      }
      if (el.tagName.toUpperCase() === 'A') {
        const href = el.getAttribute('href')?.trim() ?? ''
        if (/^#slide-[1-9]\d*$/.test(href) && el.hasAttribute('data-slide-link')) {
          const click = el.getAttribute('data-slide-click')
          record.href = click && /^\d+$/.test(click) ? `${href}/${click}` : href
        }
        else if (/^(https?:|mailto:|\/\/)/i.test(href)) record.href = (el as HTMLAnchorElement).href
      }
      if (el.tagName.toUpperCase() === 'SVG' && el.querySelector('foreignObject'))
        // Mermaid puts its labels in <foreignObject> HTML with no <text>
        // element; the normalizer routes these to a picture.
        record.hasForeignObject = true

      // `::marker` is a pseudo-element, so a bullet has no text node. Reading
      // `content` alone recovers only custom markers: Chromium reports it as
      // `normal` for ordinary lists and leaves the glyph to `list-style-type`.
      if (computed.display === 'list-item') {
        const marker = getComputedStyle(el, '::marker')
        const explicit = marker && marker.content
          && marker.content !== 'none'
          && marker.content !== 'normal'
        if (explicit) {
          record.marker = marker.content.replace(RE_QUOTES, '')
        }
        else if (computed.listStyleType !== 'none') {
          record.marker = markerGlyph(el, computed.listStyleType)
        }
      }

      nodes.push(record)

      // `::before` and `::after` have no DOM node, so a tree walk cannot see
      // them, and themes use them for decorative marks. Only absolutely
      // positioned pseudos are placeable: anything in flow has geometry not
      // recoverable from computed style alone, and is reported instead.
      for (const which of ['::before', '::after']) {
        const pseudo = getComputedStyle(el, which)
        if (!pseudo || !pseudo.content || pseudo.content === 'none')
          continue
        const paints = pseudo.content !== 'normal'
          || (pseudo.backgroundImage && pseudo.backgroundImage !== 'none')
        if (!paints)
          continue
        if (pseudo.position !== 'absolute' || computed.position === 'static') {
          unplaceablePseudos.push(`${el.tagName.toLowerCase()}${which}`)
          continue
        }

        const own = el.getBoundingClientRect()
        const width = (Number.parseFloat(pseudo.width) || 0) * scale
        const height = (Number.parseFloat(pseudo.height) || 0) * scale
        if (width <= 0 || height <= 0) {
          unplaceablePseudos.push(`${el.tagName.toLowerCase()}${which}`)
          continue
        }
        // `auto` parses to NaN, which spreads through the whole `pageRect` and
        // loses the decoration to a failed clip. Zero is what `auto` resolves
        // to for an absolutely positioned box with no other constraint.
        const px = (value: string): number => (Number.parseFloat(value) || 0) * scale
        const left = pseudo.left === 'auto'
          ? own.width - px(pseudo.right) - width
          : px(pseudo.left)
        const top = pseudo.top === 'auto'
          ? own.height - px(pseudo.bottom) - height
          : px(pseudo.top)

        const box = {
          left: own.left + left,
          top: own.top + top,
          width,
          height,
        }
        // Document coordinates, not viewport ones: the clip screenshot is taken
        // after other captures have scrolled the page, so viewport coordinates
        // read at measurement time are stale by then.
        const pageRect = {
          x: box.left + window.scrollX,
          y: box.top + window.scrollY,
          w: width,
          h: height,
        }
        const text = pseudo.content.replace(RE_QUOTES, '')
        nodes.push({
          id: nextId++,
          parent: id,
          tag: which === '::before'
            ? '::BEFORE'
            : '::AFTER',
          style: intern(pseudo, scale),
          rect: relative(box),
          // A pseudo has no element to screenshot, so it is captured by clipping the page.
          pageRect,
          ...(text && pseudo.content !== 'normal'
            ? { text }
            : {}),
        })
      }

      if (record.isMath || ['SVG', 'IMG', 'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME'].includes(record.tag))
        return

      // Descend into the shadow root as well; Mermaid renders into one.
      const shadow = (el as any).shadowRoot
      if (shadow) {
        for (const child of Array.from(shadow.childNodes) as Node[])
          walk(child, id, true, effectiveOpacity, scale)
      }

      // Recurse through zero-sized boxes rather than pruning them: a cover
      // slide commonly hangs its title off a wrapper that measures 0 high.
      for (const child of Array.from(el.childNodes) as Node[])
        walk(child, id, fromShadowRoot, effectiveOpacity, scale)
    }

    // Keep the article background as its own layer. Its transform belongs to
    // the player and has already been included in the viewport measurements.
    const rootId = nextId++
    const rootStyle = { ...styles[intern(getComputedStyle(container))], transform: 'none', position: 'static', backgroundColor: 'transparent' }
    container.setAttribute(options.idAttribute, String(rootId))
    nodes.push({ id: rootId, parent: -1, tag: 'DIV', style: styles.push(rootStyle) - 1, rect: relative(containerRect) })
    for (const child of Array.from(container.childNodes) as Node[])
      walk(child, rootId, false, 1, 1)

    slides.push({
      no: options.slide,
      clickIndex: options.click,
      containerId: container.id,
      size: { w: containerRect.width, h: containerRect.height },
      // The container's own background is never reached by a walk that starts
      // at its children; without it a dark theme exports onto default white.
      background: backgroundOf(container),
      nodes,
    })
  }

  return {
    slides,
    styles,
    fontResolution,
    unplaceablePseudos,
  } as RawSnapshot
}
