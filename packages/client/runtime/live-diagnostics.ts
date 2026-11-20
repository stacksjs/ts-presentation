import { nativeCodeLanguage } from '../../types/src/code-runner.ts'
import type { LiveDiagnostic } from '../../types/src/live-diagnostic.ts'

let editorCount = 0

export function setupLiveDiagnostics(block: HTMLElement, editor: HTMLTextAreaElement, getLanguage: () => string, canCompile: boolean): () => void {
  const list = block.querySelector<HTMLElement>('.live-code-diagnostics')
  const marks = block.querySelector<HTMLElement>('.live-code-marks > div')
  if (!list || !marks) return () => {}
  const markLayer = marks.parentElement!
  const firstLine = Number(editor.parentElement?.dataset.liveStart ?? 1)
  const initial = block.querySelector<HTMLTemplateElement>('[data-live-diagnostics]')
  const authoredDiagnostics: LiveDiagnostic[] = JSON.parse(initial?.content.textContent ?? '[]')
  const authored = editor.value
  const authoredLanguage = getLanguage()
  list.id = 'live-code-diagnostics-' + ++editorCount
  let timer: number | undefined
  let pending: AbortController | undefined
  let composing = false

  const render = (diagnostics: LiveDiagnostic[]): void => {
    if (!diagnostics.length && !list.hasChildNodes()) return
    const source = editor.value
    const items = document.createDocumentFragment()
    const underlines = document.createDocumentFragment()
    const ranges = diagnostics.flatMap(({ range }) => range ? [range] : []).sort((a, b) => a.start - b.start)
    for (const { message, range } of diagnostics) {
      const item = document.createElement('li')
      items.append(item)
      if (!range) {
        item.textContent = message
        continue
      }
      const preceding = source.slice(0, range.start)
      const line = preceding.split('\n').length
      const column = preceding.length - preceding.lastIndexOf('\n')
      const location = document.createElement('button')
      location.type = 'button'
      location.textContent = `Line ${firstLine + line - 1}, column ${column} · ${message}`
      location.addEventListener('click', () => {
        editor.focus({ preventScroll: true })
        editor.setSelectionRange(range.start, range.end)
        const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight)
        const top = (line - 1) * lineHeight
        if (top < editor.scrollTop || top + lineHeight + 20 > editor.scrollTop + editor.clientHeight)
          editor.scrollTop = top
      })
      item.append(location)
    }
    let cursor = 0
    for (const { start, end } of ranges) {
      if (start < cursor) continue
      underlines.append(source.slice(cursor, start))
      const mark = document.createElement('span')
      mark.textContent = source.slice(start, end)
      underlines.append(mark)
      cursor = end
    }
    list.replaceChildren(items)
    marks.replaceChildren(underlines)
    markLayer.hidden = !ranges.length
    if (diagnostics.length) {
      editor.setAttribute('aria-invalid', 'true')
      editor.setAttribute('aria-describedby', list.id)
    }
    else {
      editor.removeAttribute('aria-invalid')
      editor.removeAttribute('aria-describedby')
    }
  }

  function refresh(): void {
    window.clearTimeout(timer)
    pending?.abort()
    pending = undefined
    if (composing) {
      render([])
      return
    }
    const source = editor.value
    const language = getLanguage()
    if (source === authored && language === authoredLanguage) {
      render(authoredDiagnostics)
      return
    }
    render([])
    const native = nativeCodeLanguage(language)
    if (!canCompile || !native) return
    timer = window.setTimeout(async () => {
      if (!editor.isConnected) return
      const controller = pending = new AbortController()
      try {
        const response = await fetch(`./__presentation/compile?language=${native}&check=1`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          body: source,
          signal: controller.signal,
        })
        if (!response.ok) return
        const diagnostics: LiveDiagnostic[] = await response.json()
        if (!controller.signal.aborted && editor.isConnected && editor.value === source && getLanguage() === language)
          render(diagnostics)
      }
      catch {
        // Editing stays available when the dev server or a request is interrupted.
      }
      finally {
        if (pending === controller) pending = undefined
      }
    }, 220)
  }

  if (!editor.readOnly) {
    editor.addEventListener('input', refresh)
    editor.addEventListener('compositionstart', () => {
      composing = true
      refresh()
    })
    editor.addEventListener('compositionend', () => {
      composing = false
      refresh()
    })
  }
  refresh()
  return refresh
}
