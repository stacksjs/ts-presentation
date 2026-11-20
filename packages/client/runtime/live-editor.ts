export type LiveLineNumberMode = 'on' | 'off' | 'relative' | 'interval'

export function liveLineNumbers(count: number, start: number, mode: LiveLineNumberMode, active = 0): string {
  if (mode === 'off') return ''
  return Array.from({ length: count }, (_, row) => {
    const number = start + row
    if (mode === 'relative' && row !== active) return String(Math.abs(row - active))
    if (mode === 'interval' && row !== active && number % 10 !== 0) return ''
    return String(number)
  }).join('\n')
}

export function setupLiveEditor(block: HTMLElement, editor: HTMLTextAreaElement): () => void {
  const wrapper = block.querySelector<HTMLElement>('.live-code-editor')
  if (!wrapper) return () => {}
  const gutter = wrapper.querySelector<HTMLElement>('[data-live-gutter]')
  const auto = wrapper.dataset.liveHeight === 'auto'
  if (!gutter && !auto) return () => {}
  const mode = wrapper.dataset.liveNumbering as LiveLineNumberMode
  const start = Number(wrapper.dataset.liveStart ?? 1)
  const style = wrapper.style
  let source: string | undefined
  let count = 1
  let active = -1
  function syncScroll(): void {
    if (gutter) gutter.style.transform = 'translateY(' + (-editor.scrollTop) + 'px)'
  }
  function sync(): void {
    const changed = editor.value !== source
    if (changed) {
      source = editor.value
      count = source.split('\n').length
      if (auto) style.setProperty('--live-code-rows', String(count))
      if (gutter) style.setProperty('--live-code-digits', String(String(start + count - 1).length))
    }
    if (gutter) {
      const row = mode === 'relative' || mode === 'interval'
        ? editor.value.slice(0, editor.selectionStart).split('\n').length - 1
        : 0
      if (changed || row !== active) {
        active = row
        gutter.textContent = liveLineNumbers(count, start, mode, row)
      }
    }
    syncScroll()
  }
  editor.addEventListener('input', sync)
  if (gutter) {
    editor.addEventListener('scroll', syncScroll, { passive: true })
    if (mode === 'relative' || mode === 'interval') editor.addEventListener('selectionchange', sync)
  }
  sync()
  return sync
}
