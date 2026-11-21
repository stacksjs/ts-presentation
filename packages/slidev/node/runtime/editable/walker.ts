// Adapted from Slidev v53.1.0. See licenses/Slidev-MIT.txt.
import type { RawChartPart, RawChartRun, RawMathElement, RawMathFragment, RawMathFrame, RawMathPicture, RawMathRule, RawMathSnapshot, RawNode, RawSlide, RawSnapshot, RawStyle } from './ir.ts'

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

  const overlappingMath = '[data-math-smash-operator], [data-math-cramped-lap]'
  const measuredMathBox = 'mpadded:is([data-math-transform-box="make"], [data-math-transform-box="raise"])'
  const graphicMathBox = 'mpadded:is([data-math-transform-box="rotate"], [data-math-transform-box="scale"], [data-math-transform-box="height"], [data-math-transform-box="total"])'
  const decoratedArray = 'mtable[data-math-array-decoration]'
  const multilineStack = 'mtable[data-multlined-position]'
  const alignedFraction = 'mfrac:is([numalign], [denomalign])'
  const ruledFraction = 'mfrac[linethickness]:not([linethickness="0"], [linethickness="0px"], [linethickness="0em"])'
  const adjustedDegree = 'mrow.math-root-offset'
  const measuredStrut = 'mrow[data-math-strut][aria-hidden="true"]'
  const lineAccent = ':is(mrow, mo):is(.math-overline, .math-underline)'
  const bracketAccent = 'mrow:is(.math-overbracket, .math-underbracket, .math-overlinesegment, .math-underlinesegment)'
  const measuredStructures = `${decoratedArray}, ${multilineStack}, ${alignedFraction}, ${ruledFraction}, ${adjustedDegree}, ${measuredStrut}, ${bracketAccent}`
  const unmeasuredRule = 'mroot, msqrt, menclose, .math-frame, .math-angl, .math-text-circled'
  const raisedMathBox = 'mtext.math-raised-box'
  const positionedBoxes = `${overlappingMath}, ${measuredMathBox}, ${graphicMathBox}, ${raisedMathBox}`
  const raisedMathBody = ':scope > span > span > math > mrow'
  function positionedMathInk(element: Element): Element | undefined {
    if (!element.matches(overlappingMath)) return
    const ink = element.hasAttribute('data-math-cramped-lap')
      ? element.firstElementChild : element.lastElementChild?.firstElementChild
    if (ink && /^math-overlap-[lcr]$/.test(ink.getAttribute('class') ?? '') && ink.children.length === 1) return ink
  }

  function mathExpression(root: Element, customThickness: boolean): RawMathElement | undefined {
    let nodes = 0
    let characters = 0
    function read(element: Element, depth: number): RawMathElement | undefined {
      if (++nodes > 600 || depth > 40 || element.namespaceURI !== 'http://www.w3.org/1998/Math/MathML') return
      if (element.localName === 'mtext' && element.getAttribute('class') === 'math-equation-reference') {
        const expression = element.querySelector(':scope > a[data-slide-link] > math > mrow')
        return expression ? read(expression, depth + 1) : undefined
      }
      if (element.matches(raisedMathBox)) {
        const body = element.querySelector(raisedMathBody)
        const expression = body && read(body, depth + 1)
        // Keep the wrapper so Office Math declines a raise nested inside a
        // fraction or script where the browser's coordinates cannot be used.
        return expression ? { name: 'mtext', attributes: { class: 'math-raised-box' }, text: '', children: [expression] } : undefined
      }
      // Ignore annotations at the root by capturing its presentation child.
      const attributes = Object.fromEntries(Array.from(element.attributes)
        .filter(attribute => attribute.name !== 'data-empheq-start' && attribute.name !== 'data-empheq-end')
        .map(attribute => [attribute.name, attribute.value]))
      // A native Office Math bar has fixed weight. Keep the image fallback
      // when a custom rule cannot be extracted from its surrounding layout.
      if (customThickness && element.matches(lineAccent)) attributes['data-math-custom-line'] = ''
      const text = Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.nodeValue).join('')
      characters += text.length
      if (characters > 4096) return
      const children: RawMathElement[] = []
      // Capture the visible expression without its browser-only positioning boxes.
      const ink = positionedMathInk(element)
      const contents = ink ? ink.children : element.children
      for (const child of contents) {
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

    function chartArtwork(svg: SVGSVGElement): RawChartPart[] | undefined {
      const parts: RawChartPart[] = []
      const clips = new Map(Array.from(svg.querySelectorAll<SVGClipPathElement>('clipPath[id]'), clip => [clip.id, clip]))
      let count = 0

      function scaleOf(matrix: DOMMatrix | null, allowRotation = false): number | undefined {
        if (!matrix || matrix.is2D === false || Math.abs(matrix.a - matrix.d) > 1e-6 || Math.abs(matrix.b + matrix.c) > 1e-6) return
        if (allowRotation) return Math.hypot(matrix.a, matrix.b) || undefined
        if (matrix.a > 0 && Math.abs(matrix.b) < 1e-6) return matrix.a
      }

      function contained(box: DOMRect, clip: DOMRect, stroke = 0): boolean {
        const tolerance = 0.35
        return box.left - stroke >= clip.left - tolerance && box.top - stroke >= clip.top - tolerance
          && box.right + stroke <= clip.right + tolerance && box.bottom + stroke <= clip.bottom + tolerance
      }

      function beforeRotation(box: DOMRect, centerOf: DOMRect, matrix: DOMMatrix, scale: number): DOMRect {
        const centerX = centerOf.x + centerOf.width / 2
        const centerY = centerOf.y + centerOf.height / 2
        const center = new DOMPoint(centerX, centerY).matrixTransform(matrix)
        return new DOMRect(center.x + (box.x - centerX) * scale, center.y + (box.y - centerY) * scale,
          box.width * scale, box.height * scale)
      }

      function clipBounds(element: SVGGraphicsElement, path: string, outer: DOMRect): DOMRect | undefined {
        const id = /^url\("?#([\w-]+)"?\)$/.exec(path)?.[1]
        const clip = id ? clips.get(id) : undefined
        const rect = clip?.firstElementChild as SVGRectElement | null | undefined
        // Treemap label clips are axis-aligned rectangles in the enclosing group's units.
        if (!clip || clip.children.length !== 1 || rect?.localName !== 'rect'
          || clip.clipPathUnits.baseVal !== 1 || clip.hasAttribute('transform') || rect.hasAttribute('transform')) return
        const computed = getComputedStyle(rect)
        if (computed.transform !== 'none' || computed.rotate !== 'none' || computed.scale !== 'none' || computed.translate !== 'none'
          || !['auto', '0px'].includes(computed.rx) || !['auto', '0px'].includes(computed.ry)) return
        const matrix = element.getScreenCTM()
        const scale = scaleOf(matrix)
        if (!matrix || scale === undefined) return
        const bounds = rect.getBBox()
        const x = bounds.x * scale + matrix.e
        const y = bounds.y * scale + matrix.f
        const left = Math.max(x, outer.left)
        const top = Math.max(y, outer.top)
        return new DOMRect(left, top,
          Math.max(0, Math.min(x + bounds.width * scale, outer.right) - left),
          Math.max(0, Math.min(y + bounds.height * scale, outer.bottom) - top))
      }

      function simplePaint(style: CSSStyleDeclaration): boolean {
        return style.filter === 'none' && style.backdropFilter === 'none' && style.mixBlendMode === 'normal'
          && style.maskImage === 'none' && !style.transform.startsWith('matrix3d(')
          && style.getPropertyValue('marker-start') === 'none'
          && style.getPropertyValue('marker-mid') === 'none' && style.getPropertyValue('marker-end') === 'none'
      }

      const hasCharacterCoordinates = (element: Element) =>
        ['x', 'y', 'dx', 'dy', 'rotate', 'textLength'].some(name => element.hasAttribute(name))

      function inlineLabel(element: SVGTextElement, style: CSSStyleDeclaration, scale: number): RawChartRun[] | undefined {
        const runs: RawChartRun[] = []
        const preserve = /^(?:pre|pre-wrap|break-spaces)$/.test(style.whiteSpace)
        let previousSpace = true
        for (const child of Array.from(element.childNodes)) {
          if (child.nodeType === 8) continue
          let paint = style
          if (child.nodeType === 1) {
            const span = child as SVGElement
            if (span.localName !== 'tspan' || span.children.length || hasCharacterCoordinates(span)) return
            paint = getComputedStyle(span)
            if (paint.textAnchor !== style.textAnchor || paint.direction !== style.direction || paint.writingMode !== style.writingMode
              || paint.whiteSpace !== style.whiteSpace || paint.visibility !== 'visible' || paint.display === 'none'
              || paint.clipPath !== 'none' || paint.transform !== 'none' || paint.rotate !== 'none' || paint.scale !== 'none'
              || paint.translate !== 'none' || paint.stroke !== 'none' || paint.textShadow !== 'none' || !simplePaint(paint)
              || paint.getPropertyValue('baseline-shift') !== '0px'
              || paint.getPropertyValue('dominant-baseline') !== style.getPropertyValue('dominant-baseline')) return
          }
          else if (child.nodeType !== 3) return
          let text = child.textContent ?? ''
          if (!preserve) {
            text = text.replace(/[\t\n\r\f ]+/g, ' ')
            if (previousSpace) text = text.replace(/^ /, '')
            if (text) previousSpace = text.endsWith(' ')
          }
          if (!text) continue
          const opacity = Number(paint.opacity) * Number(paint.fillOpacity)
          if (!(opacity > 0) || paint.fill === 'none' || !(Number.parseFloat(paint.fontSize) > 0) || /[\r\n]/.test(text)) return
          resolveStack(paint.fontFamily)
          runs.push({ text, style: intern(paint, scale, true), fill: paint.fill, opacity })
        }
        const last = runs.at(-1)
        if (!preserve && last) {
          last.text = last.text.replace(/ $/, '')
          if (!last.text) runs.pop()
        }
        return runs
      }

      function readLabel(element: SVGTextElement, style: CSSStyleDeclaration, matrix: DOMMatrix, scale: number, clip: DOMRect): boolean {
        const lines: Extract<RawChartPart, { kind: 'text' }>['lines'] = []
        const sources = element.children.length ? Array.from(element.children) : [element]
        const align = style.textAnchor === 'middle' ? 'center' : style.textAnchor === 'end' ? 'right' : 'left'
        const fill = style.fill
        const opacity = Number(style.fillOpacity)
        const rotation = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI
        const rotated = Math.abs(rotation) > 1e-5
        const bounds = element.getBBox()
        const visible = element.getBoundingClientRect()
        if (style.stroke !== 'none' || style.textShadow !== 'none' || style.writingMode !== 'horizontal-tb'
          || style.direction !== 'ltr' || Number.parseFloat(style.fontSize) <= 0
          || element.hasAttribute('textLength') || element.hasAttribute('rotate')) return false
        const rotationInfo = rotated ? { rotation, visibleBounds: relative(visible) } : {}
        if (element.children.length && sources.every(span => !hasCharacterCoordinates(span))) {
          if (!contained(visible, clip)) return false
          const runs = inlineLabel(element, style, scale)
          if (!runs) return false
          const rect = relative(rotated ? beforeRotation(bounds, bounds, matrix, scale) : visible)
          if (runs.length) parts.push({ kind: 'text', lines: [{ rect, runs }], align, ...rotationInfo })
          return true
        }
        if (fill === 'none' || opacity === 0) return true
        if (element.children.length && Array.from(element.childNodes).some(node => node.nodeType === 3 && node.textContent?.trim())) return false
        const textStyle = intern(style, scale, true)
        const typography = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'textDecorationLine', 'textTransform'] as const
        for (const line of sources) {
          if (line !== element && (line.localName !== 'tspan' || line.children.length)) return false
          if (line.hasAttribute('textLength') || line.hasAttribute('rotate')) return false
          const lineStyle = getComputedStyle(line)
          if (lineStyle.visibility !== 'visible' || lineStyle.display === 'none' || Number(lineStyle.opacity) === 0) continue
          if (typography.some(property => lineStyle[property] !== style[property]) || lineStyle.textAnchor !== style.textAnchor
            || lineStyle.fill !== fill || lineStyle.fillOpacity !== style.fillOpacity || lineStyle.stroke !== 'none'
            || lineStyle.textShadow !== 'none' || Number(lineStyle.opacity) !== 1 || !simplePaint(lineStyle)
            || (line !== element && (lineStyle.clipPath !== 'none' || lineStyle.transform !== 'none'
              || lineStyle.rotate !== 'none' || lineStyle.scale !== 'none' || lineStyle.translate !== 'none'))) return false
          const text = (line.textContent ?? '').replace(/\s+/g, ' ').trim()
          if (!text) continue
          let box = line.getBoundingClientRect()
          if (!contained(box, clip)) return false
          if (rotated) box = beforeRotation((line as SVGGraphicsElement).getBBox(), bounds, matrix, scale)
          lines.push({ rect: relative(box), runs: [{ text, style: textStyle, fill, opacity }] })
        }
        if (lines.length) {
          resolveStack(style.fontFamily)
          parts.push({ kind: 'text', lines, align, ...rotationInfo })
        }
        return true
      }

      function collect(element: Element, outerClip: DOMRect, depth = 0): boolean {
        if (++count > 12_000 || depth > 32) return false
        if (['title', 'desc', 'style', 'clipPath', 'defs'].includes(element.localName)) return true
        if (element.localName === 'foreignObject' && element.hasAttribute('data-mindmap-icon')
          && svg.getAttribute('data-diagram-kind') === 'mindmap') {
          const style = getComputedStyle(element)
          if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return true
          if (!simplePaint(style) || style.clipPath !== 'none' || !['hidden', 'clip'].includes(style.overflow)) return false
          const bounds = element.getBoundingClientRect()
          if (!bounds.width || !bounds.height) return true
          if (!contained(bounds, outerClip)) return false
          const sourceId = nextId++
          element.setAttribute(options.idAttribute, String(sourceId))
          parts.push({ kind: 'picture', sourceId, rect: relative(bounds) })
          return true
        }
        if (element.namespaceURI !== 'http://www.w3.org/2000/svg' || !['g', 'text', 'rect', 'circle', 'ellipse', 'path', 'polygon', 'line'].includes(element.localName)) return false
        const graphic = element as SVGGraphicsElement
        const style = getComputedStyle(element)
        const opacity = Number(style.opacity)
        if (style.display === 'none' || opacity === 0) return true
        if (!simplePaint(style)) return false
        const clip = style.clipPath === 'none' ? outerClip : clipBounds(graphic, style.clipPath, outerClip)
        if (!clip) return false
        // Opacity on a group applies after painting the group, including overlaps.
        if (element.localName === 'g') return opacity === 1 && Array.from(element.children).every(child => collect(child, clip, depth + 1))
        if (style.visibility !== 'visible') return true
        const tag = element.localName
        const preset = ['rect', 'ellipse', 'circle'].includes(tag)
        const matrix = graphic.getScreenCTM()
        const scale = scaleOf(matrix, preset || tag === 'text')
        if (!matrix || scale === undefined) return false
        if (element.localName === 'text') return opacity === 1 && readLabel(element as SVGTextElement, style, matrix, scale, clip)
        if (style.vectorEffect !== 'none') return false
        const box = element.getBoundingClientRect()
        if (preset && (!box.width || !box.height)) return true
        if (!box.width && !box.height) return true
        if (style.stroke !== 'none' && !/^(?:0|[\d.]+px)$/.test(style.strokeWidth)) return false
        const strokeWidth = style.stroke === 'none' || Number(style.strokeOpacity) === 0 ? 0 : Number.parseFloat(style.strokeWidth) * scale
        const fill = element.localName === 'line' ? 'none' : style.fill
        if (strokeWidth && fill !== 'none' && Number(style.fillOpacity) > 0 && opacity !== 1) return false
        if (!Number.isFinite(strokeWidth) || !contained(box, clip, strokeWidth / 2)) return false
        const part: Extract<RawChartPart, { kind: 'shape' }> = {
          kind: 'shape', rect: relative(box), fill, fillOpacity: Number(style.fillOpacity) * opacity,
          stroke: style.stroke, strokeOpacity: Number(style.strokeOpacity) * opacity, strokeWidth,
        }
        if (preset) {
          const rotation = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI
          if (Math.abs(rotation) > 1e-5) {
            const local = graphic.getBBox()
            part.rect = relative(beforeRotation(local, local, matrix, scale))
            part.rotation = rotation
            part.visibleBounds = relative(box)
          }
        }
        if (strokeWidth) {
          if (style.strokeDasharray !== 'none') {
            if (!/^0(?:px)?$/.test(style.strokeDashoffset)) return false
            const dash = style.strokeDasharray.split(/[,\s]+/).filter(Boolean)
            if (dash.length > 32 || dash.some(value => !/^[\d.]+px$/.test(value) || !(Number.parseFloat(value) > 0))) return false
            const lengths = dash.map(value => Number.parseFloat(value) * scale)
            part.dashes = lengths.length % 2 ? [...lengths, ...lengths] : lengths
          }
          part.cap = style.strokeLinecap === 'round' ? 'rnd' : style.strokeLinecap === 'square' ? 'sq' : 'flat'
          if (!['round', 'bevel', 'miter'].includes(style.strokeLinejoin)) return false
          if (style.strokeLinejoin === 'miter' && Number(style.strokeMiterlimit) !== 4) return false
          part.join = style.strokeLinejoin as 'round' | 'bevel' | 'miter'
        }
        if (tag === 'circle' || tag === 'ellipse') part.ellipse = true
        else if (tag === 'rect') {
          const { rx, ry } = style
          if ((rx !== 'auto' && !/^[\d.]+px$/.test(rx)) || (ry !== 'auto' && !/^[\d.]+px$/.test(ry))
            || (rx !== ry && rx !== 'auto' && ry !== 'auto')) return false
          const radius = Number.parseFloat(rx === 'auto' ? ry : rx) || 0
          if (radius) part.radius = radius * scale
        }
        else {
          if (fill !== 'none' && style.fillRule !== 'nonzero') return false
          let data: string | null
          if (tag === 'line') {
            const line = element as SVGLineElement
            data = `M${line.x1.baseVal.value} ${line.y1.baseVal.value}L${line.x2.baseVal.value} ${line.y2.baseVal.value}`
          }
          else if (tag === 'polygon') {
            const points = Array.from((element as SVGPolygonElement).points)
            if (points.length < 3 || points.length > 1500) return false
            data = `M${points.map(point => `${point.x} ${point.y}`).join('L')}Z`
          }
          else {
            const cssPath = style.getPropertyValue('d')
            if (cssPath === 'none') return true
            data = /^path\("([^"]*)"\)$/.exec(cssPath)?.[1] ?? element.getAttribute('d')
          }
          if (!data) return false
          part.path = { data, scale, x: matrix.e - box.left, y: matrix.f - box.top }
        }
        parts.push(part)
        return true
      }

      const bounds = svg.getBoundingClientRect()
      const style = getComputedStyle(svg)
      if (!simplePaint(style) || style.clipPath !== 'none') return
      for (let ancestor = svg.parentElement; ancestor && ancestor !== container; ancestor = ancestor.parentElement) {
        const parentStyle = getComputedStyle(ancestor)
        if (parentStyle.overflowX === 'visible' && parentStyle.overflowY === 'visible') continue
        const parent = ancestor.getBoundingClientRect()
        if ((parentStyle.overflowX !== 'visible' && (bounds.left < parent.left - 0.35 || bounds.right > parent.right + 0.35))
          || (parentStyle.overflowY !== 'visible' && (bounds.top < parent.top - 0.35 || bounds.bottom > parent.bottom + 0.35))) return
      }
      if (Array.from(svg.children).every(element => collect(element, bounds)) && parts.length) return parts
    }

    function mathBounds(boxes: DOMRect[]) {
      if (!boxes.length) return
      const left = Math.min(...boxes.map(box => box.left))
      const top = Math.min(...boxes.map(box => box.top))
      const width = Math.max(...boxes.map(box => box.right)) - left
      const height = Math.max(...boxes.map(box => box.bottom)) - top
      if (width > 0 && height > 0) return relative({ left, top, width, height })
    }

    function arrayPaint(cell: Element, style: CSSStyleDeclaration, box: DOMRect, opacity: number, scale: number): RawMathRule[] | undefined {
      const result: RawMathRule[] = []
      const dots = cell.classList.contains('math-array-dots') && style.backgroundImage.startsWith('radial-gradient(')
      const layers = style.backgroundSize.split(/,\s*/)
      let nextLayer = Number(dots)
      const rules = cell.getAttribute('data-math-array-rules')?.split(' ') ?? []
      for (const mark of rules) {
        const [, side, pattern] = /^(left|right|top|bottom):([sd]+)$/.exec(mark) ?? []
        if (!side || !pattern) return
        const vertical = side === 'left' || side === 'right'
        const far = side === 'right' || side === 'bottom'
        const border = `border-${side}`
        const single = pattern.length === 1
        const computedWidth = Number.parseFloat(style.getPropertyValue(`${border}-width`))
        const computedStyle = style.getPropertyValue(`${border}-style`)
        if (single && (computedStyle === 'none' || computedStyle === 'hidden' || computedWidth === 0)) continue
        if (single && computedStyle !== 'solid' && computedStyle !== 'dashed') return
        const color = single ? style.getPropertyValue(`${border}-color`) : style.color
        if (!color) return
        for (const [index, value] of Array.from(pattern).entries()) {
          const layer = single ? undefined : layers[nextLayer++]
          if (!single && !(vertical ? /^[\d.]+px 100%$/ : /^100% [\d.]+px$/).test(layer ?? '')) return
          const width = single ? computedWidth : Number.parseFloat(vertical ? layer! : layer!.slice(5))
          if (!(width > 0)) return
          const step = Math.max(Number.parseFloat(style.fontSize) * (vertical ? 0.2 : 0.25), width * 2)
          const offset = (single ? 0 : (far ? pattern.length - 1 - index : index) * step) * scale
          const weight = width * scale
          const left = vertical ? far ? box.right - offset - weight : box.left + offset : box.left
          const top = vertical ? box.top : far ? box.bottom - offset - weight : box.top + offset
          const rect = relative({ left, top, width: vertical ? weight : box.width, height: vertical ? box.height : weight })
          const dashed = single ? computedStyle === 'dashed' : value === 'd'
          const length = single ? weight : scale
          result.push({
            rect, color, opacity,
            ...(dashed && { dash: { axis: vertical ? 'vertical' : 'horizontal', lengths: [3 * length, 2 * length] } }),
          })
        }
      }

      if (dots) {
        const [, rawStep, rawSize] = /^([\d.]+)px ([\d.]+)px$/.exec(layers[0]) ?? []
        const first = (value: string) => value.split(/,\s*/, 1)[0]
        if (!(Number(rawStep) > 0 && Number(rawSize) > 0)
          || nextLayer !== layers.length || first(style.backgroundPosition) !== '50% 65%'
          || first(style.backgroundRepeat) !== 'repeat-x'
          || first(style.backgroundOrigin) !== 'content-box' || first(style.backgroundClip) !== 'content-box') return
        const length = (value: string) => (Number.parseFloat(value) || 0) * scale
        const left = box.left + length(style.borderLeftWidth) + length(style.paddingLeft)
        const right = box.right - length(style.borderRightWidth) - length(style.paddingRight)
        const top = box.top + length(style.borderTopWidth) + length(style.paddingTop)
        const bottom = box.bottom - length(style.borderBottomWidth) - length(style.paddingBottom)
        const step = Number(rawStep) * scale
        const tileHeight = Number(rawSize) * scale
        const diameter = Math.min(step, tileHeight) * 0.78
        const center = (left + right) / 2
        const sides = Math.floor((right - left - diameter) / (2 * step))
        if (!Number.isFinite(sides) || sides > 160) return
        for (let index = -sides; index <= sides; index++) {
          const x = center + index * step - diameter / 2
          const y = top + (bottom - top - tileHeight) * 0.65 + (tileHeight - diameter) / 2
          result.push({ rect: relative({ left: x, top: y, width: diameter, height: diameter }), color: style.color, opacity, ellipse: true })
        }
      }
      else if (style.backgroundImage !== 'none') {
        if (!nextLayer || nextLayer !== layers.length || !/^(?:linear|repeating-linear)-gradient\(/.test(style.backgroundImage)) return
      }
      return result
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

    function positionedMathFragments(element: Element, expression: RawMathElement, opacity: number, scale: number, measuredLayout: string):
      { cells: RawMathFragment[], rect: RawMathFragment['rect'], rules?: RawMathRule[], pictures?: RawMathPicture[] } | undefined {
      const positionedMath = `${positionedBoxes}, ${measuredLayout}`
      if (!element.matches(positionedMath) && !element.querySelector(positionedMath)) return
      const formulaColor = getComputedStyle(element.closest('math') ?? element).color
      const cells: RawMathFragment[] = []
      const rules: RawMathRule[] = []
      const pictures: RawMathPicture[] = []
      const bounds: DOMRect[] = []
      let pieces: { element: Element, expression: RawMathElement }[] = []
      let split = false
      type GraphicPlacement = Pick<RawMathFragment, 'rect' | 'rotation' | 'visibleBounds'> & { fontScale: number }
      type PositionedContent = { element: Element, expression: RawMathElement, graphic?: GraphicPlacement }
      function add(boxes: DOMRect[], content: RawMathElement, context: Element, graphic?: GraphicPlacement, inheritedColor?: string): void {
        const visible = mathBounds(boxes)
        if (!visible) return
        bounds.push(...boxes)
        const style = getComputedStyle(context)
        const fontSize = Number.parseFloat(style.fontSize) * scale * (graphic?.fontScale ?? 1)
        const color = inheritedColor ?? style.color
        const expression: RawMathElement = color === formulaColor ? content
          : { name: 'mrow', attributes: { style: `color:${color}` }, color, text: '', children: [content] }
        cells.push({
          expression, opacity, rect: graphic?.rect ?? visible, fontSize,
          ...(graphic?.rotation === undefined ? {} : { rotation: graphic.rotation, visibleBounds: graphic.visibleBounds }),
        })
      }
      function flush(): void {
        if (!pieces.length) return
        const content = pieces.length === 1 ? pieces[0].expression
          : { name: 'mrow', attributes: {}, text: '', children: pieces.map(piece => piece.expression) }
        const first = pieces[0].element
        const inheritedColor = first.parentElement ? getComputedStyle(first.parentElement).color : undefined
        add(pieces.map(piece => piece.element.getBoundingClientRect()), content, first, undefined, inheritedColor)
        pieces = []
      }
      function graphicPlacement(ink: Element, angle?: number): GraphicPlacement | undefined {
        const style = getComputedStyle(ink)
        if (style.transform === 'none' || style.rotate !== 'none' || style.scale !== 'none' || style.translate !== 'none'
          || style.filter !== 'none' || style.backdropFilter !== 'none' || style.clipPath !== 'none'
          || style.maskImage !== 'none' || style.mixBlendMode !== 'normal' || style.textShadow !== 'none' || Number(style.opacity) !== 1) return
        const matrix = new DOMMatrixReadOnly(style.transform)
        const size = Math.hypot(matrix.a, matrix.b)
        const epsilon = size * 1e-5
        // An equation can rotate or use a single font scale. It cannot
        // stretch its glyphs independently on the two axes or reflect them.
        if (!matrix.is2D || !(size > 0) || Math.abs(matrix.a - matrix.d) > epsilon || Math.abs(matrix.b + matrix.c) > epsilon) return
        const box = ink.getBoundingClientRect()
        if (!(box.width > 0 && box.height > 0)) return
        if (angle === undefined) {
          if (matrix.a > 0 && Math.abs(matrix.b) <= epsilon) return { rect: relative(box), fontScale: size }
          return
        }
        if (!Number.isFinite(angle) || Math.abs(matrix.a - Math.cos(angle)) > 1e-5
          || Math.abs(matrix.b - Math.sin(angle)) > 1e-5) return
        const w = Number.parseFloat(style.width) * scale
        const h = Number.parseFloat(style.height) * scale
        if (!(w > 0 && h > 0)) return
        const c = Math.abs(Math.cos(angle))
        const s = Math.abs(Math.sin(angle))
        if (Math.abs(w * c + h * s - box.width) > 0.35 || Math.abs(w * s + h * c - box.height) > 0.35) return
        // PowerPoint rotates about the center. The rendered bounds have the
        // same center regardless of the TeX top, baseline, or custom origin.
        const visible = relative(box)
        const rect = { x: visible.x + (visible.w - w) / 2, y: visible.y + (visible.h - h) / 2, w, h }
        return { rect, visibleBounds: visible, rotation: angle * 180 / Math.PI, fontScale: 1 }
      }
      function positionedContent(node: Element, data: RawMathElement): PositionedContent | undefined {
        const ink = positionedMathInk(node)
        if (ink && data.children.length === 1) return { element: ink, expression: data.children[0] }
        if (node.matches(graphicMathBox)) {
          const ink = node.querySelector(':scope > mrow > mrow:first-child')
          const content = data.children[0]?.children[0]
          if (!ink || !content) return
          const { style, ...attributes } = content.attributes
          const rotated = node.getAttribute('data-math-transform-box') === 'rotate'
          const transform = /^transform-origin:[^;]+;transform:translateX\(-?[\d.]+px\) (rotate|scale)\([^;]+\)$/.exec(style ?? '')?.[1]
          if (transform !== (rotated ? 'rotate' : 'scale')) return
          const graphic = graphicPlacement(ink, rotated ? Number(node.getAttribute('data-angle')) : undefined)
          if (graphic) return { element: ink, expression: { ...content, attributes }, graphic }
          return
        }
        if (node.matches(measuredMathBox)) {
          const element = node.querySelector(':scope > mrow > mrow[data-math-box-ink]')
          const expression = data.children[0]?.children[0]
          // Justified text uses CSS word spacing that an equation run cannot reproduce.
          if (element && expression && !element.hasAttribute('data-extra-space')) {
            const { 'data-math-box-ink': marker, style, ...attributes } = expression.attributes
            if (marker === '' && /^transform-origin:left;transform:translate[XY]\(-?[\d.]+px\)$/.test(style ?? ''))
              return { element, expression: { ...expression, attributes } }
          }
          return
        }
        const raised = node.matches(raisedMathBox) ? node
          : node.localName === 'mpadded' && node.children.length === 1 && node.firstElementChild?.matches(raisedMathBox)
            ? node.firstElementChild : undefined
        if (!raised) return
        const element = raised.querySelector(raisedMathBody)
        const raw = raised === node ? data : data.children[0]
        if (element && raw.children.length === 1) return { element, expression: raw.children[0] }
      }
      function collectArray(table: Element, data: RawMathElement): boolean {
        flush()
        split = true
        bounds.push(table.getBoundingClientRect())
        for (const [rowIndex, row] of Array.from(table.children).entries()) {
          if (row.localName !== 'mtr') return false
          for (const [cellIndex, cell] of Array.from(row.children).entries()) {
            if (cell.localName !== 'mtd' || rules.length > 1800) return false
            const style = getComputedStyle(cell)
            if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.filter !== 'none' || style.boxShadow !== 'none'
              || style.clipPath !== 'none' || style.transform !== 'none' || Number(style.opacity) !== 1) return false
            const decorations = arrayPaint(cell, style, cell.getBoundingClientRect(), opacity, scale)
            if (!decorations) return false
            rules.push(...decorations)
            if (cell.classList.contains('math-array-dots') && style.backgroundImage.startsWith('radial-gradient(')) continue
            const rowData = data.children[rowIndex]?.children[cellIndex]
            if (!rowData || rowData.text.trim() || rowData.children.length !== cell.children.length) return false
            if (cell.querySelector(positionedMath)) {
              if (!visitRow(cell, rowData)) return false
              continue
            }
            const content: RawMathElement = { name: 'mrow', text: '', children: rowData.children, attributes: {} }
            add(Array.from(cell.children, ink => ink.getBoundingClientRect()), content, cell)
          }
        }
        return true
      }
      function mathPicture(node: Element, kind: RawMathPicture['kind']): boolean {
        const box = node.getBoundingClientRect()
        if (!(box.width > 0 && box.height > 0)) return false
        flush()
        const sourceId = nextId++
        node.setAttribute(options.idAttribute, String(sourceId))
        pictures.push({ sourceId, rect: relative(box), kind })
        bounds.push(box)
        return true
      }
      function pictureFence(node: Element): boolean {
        return node.localName === 'mo' && node.getAttribute('stretchy') === 'true'
          && /^[()[\]{}|‖⟨⟩⌊⌋⌈⌉⟮⟯⎰⎱⟦⟧⦃⦄]$/u.test(node.textContent ?? '') && mathPicture(node, 'delimiter')
      }
      function visitRow(node: Element, data: RawMathElement): boolean {
        // The edge spaces and struts have already positioned the visible terms.
        const boxes = Array.from(node.children)
        let start = 0
        let end = boxes.length
        while (start < end && boxes[start].localName === 'mspace') start++
        while (end > start && boxes[end - 1].localName === 'mspace') end--
        const result = boxes.slice(start, end).every((child, index) => visit(child, data.children[start + index]))
        flush()
        return result
      }
      function visitArgument(node: Element, data: RawMathElement): boolean {
        if (node.localName === 'mrow' && (!Object.keys(data.attributes).length || node.matches(adjustedDegree)))
          return visitRow(node, data)
        const collected = visit(node, data)
        flush()
        return collected
      }
      function collectMultline(node: Element, data: RawMathElement): boolean {
        flush()
        split = true
        bounds.push(node.getBoundingClientRect())
        return Array.from(node.children).every((row, index) => {
          const body = row.firstElementChild?.firstElementChild
          const bodyData = data.children[index]?.children[0]?.children[0]
          return body?.localName === 'mrow' && bodyData && visitRow(body, bodyData)
        })
      }
      function collectFraction(node: Element, data: RawMathElement): boolean {
        if (node.children.length !== 2) return false
        flush()
        split = true
        bounds.push(node.getBoundingClientRect())
        const thickness = data.attributes.linethickness
        if ((thickness === undefined || Number.parseFloat(thickness) !== 0) && !mathPicture(node, 'fraction-rule')) return false
        return Array.from(node.children).every((child, index) => {
          const argument = data.children[index]
          const aligned = child.classList.contains('math-fraction-alignment') && child.children.length === 1
          return aligned ? visitArgument(child.children[0], argument.children[0]) : visitArgument(child, argument)
        })
      }
      function collectRadical(node: Element, data: RawMathElement): boolean {
        if (!mathPicture(node, 'radical')) return false
        split = true
        if (node.localName === 'msqrt') return visitRow(node, data)
        return Array.from(node.children).every((child, index) => visitArgument(child, data.children[index]))
      }
      function collectAccent(node: Element, data: RawMathElement, line: boolean): boolean {
        flush()
        const box = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        if (!(box.width > 0 && box.height > 0) || style.transform !== 'none' || style.filter !== 'none'
          || style.boxShadow !== 'none' || style.backgroundColor !== 'rgba(0, 0, 0, 0)' || Number(style.opacity) !== 1) return false
        const below = /math-under/.test(data.attributes.class)
        const px = (value: string) => Number.parseFloat(value) * scale
        function rule(left: number, top: number, width: number, height: number, color = style.color): void {
          if (width > 0 && height > 0) rules.push({ rect: relative({ left, top, width, height }), opacity, color })
        }
        if (line) {
          const weight = px(below ? style.borderBottomWidth : style.borderTopWidth)
          const edge = below ? style.borderBottomStyle : style.borderTopStyle
          if (!(weight > 0 && weight < box.height) || edge !== 'solid' || style.backgroundImage !== 'none') return false
          rule(box.left, below ? box.bottom - weight : box.top, box.width, weight, below ? style.borderBottomColor : style.borderTopColor)
          if (node.localName === 'mo') {
            const { class: _accent, 'data-math-custom-line': _weight, ...attributes } = data.attributes
            const ink = new DOMRect(box.left, box.top + (below ? 0 : weight), box.width, box.height - weight)
            add([ink], { ...data, attributes }, node)
          }
        }
        else {
          // The renderer paints two short caps and one full-width bar. Check
          // all three layers before reproducing their geometry in DrawingML.
          const gradient = `linear-gradient(${style.color}, ${style.color})`
          const sizes = /^(\d+(?:\.\d+)?)px (\d+(?:\.\d+)?)px, \1px \2px, 100% \1px$/.exec(style.backgroundSize)
          if (!sizes || !style.color.startsWith('rgb(') || style.backgroundImage !== `${gradient}, ${gradient}, ${gradient}`
            || style.backgroundRepeat !== 'no-repeat, no-repeat, no-repeat'
            || style.backgroundOrigin !== 'padding-box, padding-box, padding-box'
            || style.backgroundClip !== 'border-box, border-box, border-box'
            || [style.borderTopWidth, style.borderBottomWidth, style.borderLeftWidth, style.borderRightWidth].some(length => length !== '0px')) return false
          const [weight, cap] = sizes.slice(1).map(px)
          const anchor = below ? '100%' : '0%'
          const position = style.backgroundPosition.split(', ').at(-1) ?? ''
          if (style.backgroundPosition !== `0% ${anchor}, 100% ${anchor}, ${position}` || !position.startsWith('50% ')) return false
          const placement = position.slice(4)
          const inset = below ? /^calc\(100% - ([\d.]+px)\)$/.exec(placement)?.[1] : /^[\d.]+px$/.exec(placement)?.[0]
          const offset = position === `50% ${anchor}` ? 0 : inset ? px(inset) : NaN
          if (!(weight > 0 && weight <= box.width / 2 && cap > 0 && cap <= box.height && offset + weight <= box.height)) return false
          const top = below ? box.bottom - offset - weight : box.top + offset
          const capTop = below ? box.bottom - cap : box.top
          rule(box.left, top, box.width, weight)
          for (const x of [box.left, box.right - weight]) {
            // Keep the rectangles disjoint so fading a row has no seams.
            rule(x, capTop, weight, Math.min(top - capTop, cap))
            const bottom = Math.max(top + weight, capTop)
            rule(x, bottom, weight, capTop + cap - bottom)
          }
        }
        bounds.push(box)
        split = true
        return node.localName === 'mo' || visitRow(node, data)
      }
      function visit(node: Element, data: RawMathElement): boolean {
        if (node.matches(decoratedArray)) return collectArray(node, data)
        if (node.matches(measuredStrut)) {
          // The strut is invisible. Its height and depth are already included
          // in the measured positions of the surrounding terms.
          split = true
          return true
        }
        if (node.matches(multilineStack)) return collectMultline(node, data)
        const line = node.matches(lineAccent)
        if (node.matches(bracketAccent) || (line && (node.matches(measuredLayout) || node.querySelector(measuredLayout))))
          return collectAccent(node, data, line)
        if (node.matches('munder, mover, munderover') && node.firstElementChild?.matches(`${bracketAccent}, ${lineAccent}`)
          && (node.firstElementChild.matches(measuredLayout) || node.firstElementChild.querySelector(measuredLayout))) {
          flush()
          return Array.from(node.children).every((child, index) => visitArgument(child, data.children[index]))
        }
        if (node.matches('mfrac') && (node.matches(`${alignedFraction}, ${ruledFraction}`)
          || node.querySelector(measuredLayout))) return collectFraction(node, data)
        if (node.matches('mroot, msqrt') && node.querySelector(measuredLayout)) return collectRadical(node, data)
        const content = positionedContent(node, data)
        if (content) {
          flush()
          split = true
          add([content.element.getBoundingClientRect()], content.expression, content.element, content.graphic)
          return true
        }
        const stack = node.querySelector(measuredLayout)
        if (stack && data.attributes.class === 'math-alignment-axis' && node.children.length === 1) {
          const cell = node.firstElementChild?.firstElementChild
          const column = data.children[0]?.children[0]
          if (cell?.children.length === 1 && column?.children.length === 1)
            return visit(cell.children[0], column.children[0])
        }
        const keys = Object.keys(data.attributes)
        const color = stack && node.localName === 'mrow' && keys.length === 1 && keys[0] === 'style' && data.color !== undefined
        const plain = node.localName === 'mrow' && (!keys.length || data.attributes.class === 'math-multlined-bottom')
        const fenced = stack && node.localName === 'mrow' && keys.length === 1
          && (keys[0] === 'data-math-delimiters' || keys[0] === 'data-math-cases')
        const compact = stack && node.localName === 'mstyle' && keys.every(key => key === 'scriptlevel' || key === 'displaystyle')
        if ((plain || color || fenced || compact) && !data.text.trim() && node.querySelector(positionedMath)) {
          if (color) flush()
          const collected = Array.from(node.children).every((child, index) =>
            Boolean(stack && pictureFence(child)) || visit(child, data.children[index]))
          if (color) flush()
          return collected
        }
        pieces.push({ element: node, expression: data })
        return true
      }
      if (!visit(element, expression) || !split) return
      flush()
      const rect = mathBounds(bounds)
      if (rect && cells.length) return { cells, rect, ...(rules.length && { rules }), ...(pictures.length && { pictures }) }
    }

    function mathProjection(presentation: Element, expression: RawMathElement, display: boolean, scale: number, customThickness: boolean): RawMathSnapshot | undefined {
      const measuredLayout = customThickness ? `${measuredStructures}, ${lineAccent}` : measuredStructures
      const positionedMath = `${positionedBoxes}, ${measuredLayout}`
      let table = presentation
      let data = expression
      while (table.localName === 'mrow' && table.children.length === 1) {
        table = table.children[0]
        data = data.children[0]
      }
      const singleTag = display && table.localName === 'mtable' && table.getAttribute('class') === 'math-tagged-display'
      const ams = display && table.localName === 'mtable' && table.hasAttribute('data-equation-environment')
      const tagsAtMargin = ams && table.hasAttribute('data-equation-tags')
      const positionedCells = ams && (table.hasAttribute('data-equation-row-spacing') || table.hasAttribute('data-equation-spread')
        || table.querySelector(positionedMath) !== null)
      if (!singleTag && !tagsAtMargin && !positionedCells) {
        const positioned = positionedMathFragments(presentation, expression, 1, scale, measuredLayout)
        if (positioned) return { ...positioned, display }
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
      const frames: RawMathFrame[] = []
      const rules: RawMathRule[] = []
      const pictures: RawMathPicture[] = []
      const body: DOMRect[] = []
      let singleFormula: RawMathSnapshot | undefined
      for (const [index, row] of Array.from(table.children).entries()) {
        const mathRow = data.children[index]
        const rowOpacity = mathRow.opacity ?? 1
        if (row.hasAttribute('data-equation-intertext')) {
          const paragraph = row.firstElementChild?.firstElementChild?.firstElementChild
          const content = mathRow.children[0]?.children[0]?.children[0]
          if (!positionedCells || !paragraph || !content) return
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
            singleFormula = mathProjection(formula, cellData.children[0], true, scale, customThickness)
            if (!singleFormula) return
          }
          else {
            body.push(cell.getBoundingClientRect())
            if (!positionedCells) continue
            const frame = cell.querySelector(':scope > mspace[data-equation-frame]')
            if (frame) {
              const style = getComputedStyle(frame)
              const box = frame.getBoundingClientRect()
              const rect = mathBounds([box])
              if (!rect || style.visibility !== 'visible') return
              const width = Number.parseFloat(style.borderTopWidth) * scale
              frames.push({ rect, color: style.borderTopColor, background: style.backgroundColor, width, opacity: rowOpacity })
              body.push(box)
            }
            const content = cell.firstElementChild
            const pieces = content?.firstElementChild?.matches('[data-equation-frame-start], [data-equation-frame-end]')
            if ((frame || pieces) && content) {
              if (/(?:^|;)(?:border-|background:)/.test(cellData.attributes.style ?? '')) return
              // Position the boxed expression and the trailing text separately.
              const sections = pieces ? Array.from(content.children) : [content]
              const expressions = pieces ? cellData.children[0].children : [cellData.children[0]]
              for (const [index, item] of sections.entries()) {
                const rect = mathBounds([item.getBoundingClientRect()])
                if (rect) measuredCells.push(fragment(item, expressions[index], rowOpacity, rect))
              }
              continue
            }
            // Cells already have independent coordinates. For a measured box
            // that fills a continuation cell, place only its visible content.
            if (row.hasAttribute('data-equation-continuation')) {
              let box = cell.firstElementChild
              let boxData = cellData.children[0]
              while (box?.localName === 'mrow' && box.children.length === 1
                && Object.keys(boxData.attributes).length === 0 && !boxData.text.trim()) {
                box = box.firstElementChild
                boxData = boxData.children[0]
              }
              if (cell.children.length === 1 && box?.getAttribute('class') === 'math-measured-box') {
                const ink = box.children[1]?.firstElementChild
                const inkData = boxData.children[1]?.children[0]
                if (!ink || !inkData || !/^math-overlap-[lcr]$/.test(inkData.attributes.class ?? '')) return
                const rect = mathBounds([ink.getBoundingClientRect()])
                if (rect) measuredCells.push(fragment(ink, { ...inkData, attributes: {} }, rowOpacity, rect))
                continue
              }
            }
            const positioned = content && cell.children.length === 1
              ? positionedMathFragments(content, cellData.children[0], rowOpacity, scale, measuredLayout) : undefined
            if (positioned) {
              measuredCells.push(...positioned.cells)
              if (positioned.rules) rules.push(...positioned.rules)
              if (positioned.pictures) pictures.push(...positioned.pictures)
              continue
            }
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
      if (!positionedCells) return { expression, rect, display, tags }
      if (measuredCells.length) return {
        rect, display, tags, cells: measuredCells, ...(frames.length && { frames }),
        ...(rules.length && { rules }), ...(pictures.length && { pictures }),
      }
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
        // Laps, shifted root indices and custom boxes can paint beyond the layout box.
        for (const overlap of el.querySelectorAll('.math-overlap-l, .math-overlap-c, .math-overlap-r, .math-root-offset, [data-math-box-ink]')) {
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
      if (presentation) {
        const customThickness = Boolean(computed.getPropertyValue('--math-min-rule').trim())
        if (!customThickness || (!presentation.matches(unmeasuredRule) && !presentation.querySelector(unmeasuredRule))) {
          const expression = mathExpression(presentation, customThickness)
          const source = expression && mathProjection(presentation, expression, el.getAttribute('display') === 'block', scale, customThickness)
          if (source) record.math = source
        }
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
      if (record.tag === 'SVG') {
        if (el.querySelector('foreignObject')) record.hasForeignObject = true
        const kind = el.getAttribute('data-diagram-kind')
        if (effectiveOpacity === 1 && (kind === 'mindmap' || (!record.hasForeignObject && (kind === 'treemap'
          || el.querySelector(':scope > g:is([data-diagram-kind="gitgraph"], [data-diagram-kind="gantt"])'))))) {
          const parts = chartArtwork(el as SVGSVGElement)
          if (parts) record.chartParts = parts
        }
      }

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
