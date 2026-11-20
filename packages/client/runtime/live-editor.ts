export type LiveLineNumberMode = 'on' | 'off' | 'relative' | 'interval'
export type LiveWordWrap = 'off' | 'on' | 'wordWrapColumn' | 'bounded'

export function liveLineNumbers(count: number, start: number, mode: LiveLineNumberMode, active = 0): string {
  if (mode === 'off') return ''
  return Array.from({ length: count }, (_, row) => {
    const number = start + row
    if (mode === 'relative' && row !== active) return String(Math.abs(row - active))
    if (mode === 'interval' && row !== active && number % 10 !== 0) return ''
    return String(number)
  }).join('\n')
}

export function liveEditorRowTop(editor: HTMLTextAreaElement, line: number, column: number, lineHeight: number): number {
  const mirror = editor.parentElement?.querySelector<HTMLElement>('.live-code-measure > div')
  const row = mirror?.children[line - 1] as HTMLElement | undefined
  const text = row?.firstChild
  if (!row || !(text instanceof Text)) return (line - 1) * lineHeight
  const bounds = row.getBoundingClientRect()
  if (!bounds.height) return row.offsetTop
  const range = document.createRange()
  range.setStart(text, Math.min(column - 1, text.length))
  range.setEnd(text, Math.min(column, text.length))
  const rect = range.getBoundingClientRect()
  const relativeY = rect.height ? (rect.top - bounds.top) * row.offsetHeight / bounds.height : 0
  return row.offsetTop + Math.round(relativeY / lineHeight) * lineHeight
}

export function setupLiveEditor(block: HTMLElement, editor: HTMLTextAreaElement, getLanguage: () => string): () => void {
  const wrapper = block.querySelector<HTMLElement>('.live-code-editor')
  if (!wrapper) return () => {}
  const gutter = wrapper.querySelector<HTMLElement>('[data-live-gutter]')
  const highlight = wrapper.querySelector<HTMLElement>('.live-code-highlight > div')
  const marks = wrapper.querySelector<HTMLElement>('.live-code-marks > div')
  const wrap = wrapper.dataset.liveWrap
  const auto = wrapper.dataset.liveHeight === 'auto'
  const initial = wrapper.dataset.liveHeight === 'initial'
  const authored = editor.value
  const mode = wrapper.dataset.liveNumbering as LiveLineNumberMode
  const start = Number(wrapper.dataset.liveStart ?? 1)
  const style = wrapper.style
  let source: string | undefined
  let count = 1
  let active = -1
  let composing = false
  let paintFrame = 0
  let wrapWidth = 0
  let wrapScrollbar = 0
  let physicalRows: number[] | undefined
  let measuredSource: string | undefined
  const mirror = wrap ? document.createElement('div') : undefined
  if (mirror) {
    const holder = document.createElement('div')
    holder.className = 'live-code-measure'
    holder.setAttribute('aria-hidden', 'true')
    holder.append(mirror)
    wrapper.append(holder)
  }
  function measureRows(value: string, lineHeight: number): number[] {
    if (!mirror) return []
    if (measuredSource !== value) {
      measuredSource = value
      const lines = document.createDocumentFragment()
      for (const line of value.split('\n')) {
        const row = document.createElement('div')
        row.textContent = line || '\u200b'
        lines.append(row)
      }
      mirror.replaceChildren(lines)
    }
    return Array.from(mirror.children, row => Math.max(1, Math.round((row as HTMLElement).offsetHeight / lineHeight)))
  }
  function syncWrap(changed: boolean): boolean {
    if (!mirror || !editor.clientWidth) return false
    const scrollbar = editor.offsetWidth - editor.clientWidth
    if (wrap !== 'on' && scrollbar !== wrapScrollbar) {
      wrapScrollbar = scrollbar
      style.setProperty('--live-code-wrap-scrollbar', `${scrollbar}px`)
    }
    const computed = getComputedStyle(editor)
    const width = parseFloat(computed.width) - scrollbar
    const resized = width !== wrapWidth
    if (!resized && !changed && measuredSource === editor.value) return false
    const lineHeight = parseFloat(computed.lineHeight)
    wrapWidth = width
    style.setProperty('--live-code-wrap-viewport', `${width}px`)
    if (initial && resized && editor.value !== authored) {
      const rows = measureRows(authored, lineHeight).reduce((sum, rows) => sum + rows, 0)
      style.setProperty('--live-code-rows', String(rows))
    }
    physicalRows = measureRows(editor.value, lineHeight)
    if (auto || (initial && resized && editor.value === authored))
      style.setProperty('--live-code-rows', String(physicalRows.reduce((sum, rows) => sum + rows, 0)))
    return true
  }
  function syncScroll(): void {
    if (gutter) gutter.style.transform = 'translateY(' + (-editor.scrollTop) + 'px)'
    const offset = `translate(${-editor.scrollLeft}px, ${-editor.scrollTop}px)`
    if (highlight) highlight.style.transform = offset
    if (marks) marks.style.transform = offset
  }
  function syncSizeAndNumbers(): void {
    const changed = editor.value !== source
    if (changed) {
      source = editor.value
      count = source.split('\n').length
      if (auto && !wrap) style.setProperty('--live-code-rows', String(count))
      if (gutter) style.setProperty('--live-code-digits', String(String(start + count - 1).length))
    }
    const rewrapped = syncWrap(changed)
    if (gutter) {
      const row = mode === 'relative' || mode === 'interval'
        ? editor.value.slice(0, editor.selectionStart).split('\n').length - 1
        : 0
      if (changed || rewrapped || row !== active) {
        active = row
        const numbers = liveLineNumbers(count, start, mode, row)
        const visuals = physicalRows
        gutter.textContent = visuals
          ? numbers.split('\n').map((number, index) => number + '\n'.repeat((visuals[index] ?? 1) - 1)).join('\n')
          : numbers
      }
    }
    syncScroll()
  }
  function paint(): void {
    cancelAnimationFrame(paintFrame)
    if (!highlight || composing) return
    const markup = window.presentationHighlightLiveSource?.(editor.value, getLanguage())
    wrapper!.toggleAttribute('data-live-highlighted', markup !== undefined)
    highlight.innerHTML = markup ?? ''
    syncScroll()
  }
  function sync(): void {
    syncSizeAndNumbers()
    paint()
  }
  if (gutter || auto || wrap) editor.addEventListener('input', syncSizeAndNumbers)
  if (gutter || highlight || marks) editor.addEventListener('scroll', syncScroll, { passive: true })
  if (gutter) {
    if (mode === 'relative' || mode === 'interval') editor.addEventListener('selectionchange', syncSizeAndNumbers)
  }
  if (highlight && window.presentationHighlightLiveSource) {
    editor.addEventListener('input', () => {
      wrapper.removeAttribute('data-live-highlighted')
      if (composing) return
      cancelAnimationFrame(paintFrame)
      paintFrame = requestAnimationFrame(paint)
    })
    editor.addEventListener('compositionstart', () => {
      composing = true
      wrapper.removeAttribute('data-live-highlighted')
    })
    editor.addEventListener('compositionend', () => {
      composing = false
      paint()
    })
  }
  if (wrap) {
    const observer = new ResizeObserver(() => {
      if (editor.isConnected) syncSizeAndNumbers()
      else observer.disconnect()
    })
    observer.observe(editor)
  }
  sync()
  return sync
}
