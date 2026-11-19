import type { EditorSource } from './dev-protocol.ts'

interface EditorOptions {
  slide: () => number
  revision: () => string
  refresh: () => Promise<void>
}

interface SideEditor {
  toggle: () => void
  follow: (refresh?: boolean) => void
  dirty: () => boolean
}

const sourceRequest = (method: 'POST' | 'PUT', body: Record<string, unknown>) => fetch('./__presentation/source', {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

export function setupSideEditor(options: EditorOptions): SideEditor {
  const panel = document.querySelector<HTMLElement>('#side-editor')!
  const toggle = document.querySelector<HTMLButtonElement>('#edit-slide')!
  const editor = panel.querySelector('textarea')!
  const path = panel.querySelector<HTMLElement>('#side-editor-path')!
  const saveButton = panel.querySelector<HTMLButtonElement>('#side-editor-save')!
  const reloadButton = panel.querySelector<HTMLButtonElement>('#side-editor-reload')!
  const closeButton = panel.querySelector<HTMLButtonElement>('#side-editor-close')!
  const status = panel.querySelector<HTMLElement>('#side-editor-status')!
  let loaded: (EditorSource & { slide: number }) | undefined
  let requestId = 0
  let attemptedView: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let saving: Promise<boolean> | undefined
  let conflict = false
  toggle.hidden = false

  const dirty = () => loaded !== undefined && editor.value !== loaded.source
  function message(text: string, error = false): void {
    status.textContent = text
    status.toggleAttribute('data-error', error)
  }
  function buttons(): void {
    saveButton.disabled = !dirty() || conflict || saving !== undefined
    reloadButton.hidden = !conflict
  }

  async function fetchSource(focus: boolean, force = false): Promise<void> {
    if (panel.hidden) return
    const slide = options.slide()
    const deckRevision = options.revision()
    const view = `${slide}:${deckRevision}`
    if (!force && attemptedView === view) return
    attemptedView = view
    const generation = ++requestId
    if (loaded?.slide !== slide || force) {
      editor.disabled = true
      message('Loading source…')
    }
    try {
      const response = await sourceRequest('POST', { slide, deckRevision })
      if (generation !== requestId) return
      if (!response.ok) {
        if (response.status === 409) void options.refresh()
        throw new Error(await response.text())
      }
      const source = await response.json() as EditorSource
      if (generation !== requestId) return
      const sameSlide = loaded?.slide === slide && loaded.token === source.token
      if (sameSlide && !force && dirty()) return
      if (!sameSlide || editor.value !== source.source) editor.value = source.source
      loaded = { ...source, slide }
      conflict = false
      path.textContent = `${source.path} · Slide ${slide}`
      editor.disabled = false
      if (status.textContent !== 'Saved') message('')
      if (focus) editor.focus({ preventScroll: true })
      if (focus || !sameSlide) {
        editor.setSelectionRange(0, 0)
        editor.scrollTop = 0
      }
    }
    catch (error) {
      if (generation !== requestId) return
      if (loaded?.slide !== slide || force) {
        loaded = undefined
        editor.value = ''
        editor.disabled = true
        path.textContent = ''
      }
      message(error instanceof Error ? error.message : 'Could not load this slide source.', true)
    }
    finally { buttons() }
  }

  function queue(): void {
    clearTimeout(timer)
    timer = setTimeout(() => { void save() }, 650)
  }

  function save(): Promise<boolean> {
    clearTimeout(timer)
    if (saving) return saving
    if (!loaded || !dirty() || conflict) return Promise.resolve(!dirty())
    const session = loaded
    const source = editor.value
    saving = (async () => {
      message('Saving…')
      try {
        const response = await sourceRequest('PUT', { source, token: session.token, revision: session.revision })
        if (!response.ok) {
          conflict = response.status === 409 || response.status === 404
          throw new Error(await response.text())
        }
        const { revision } = await response.json() as { revision: string }
        session.revision = revision
        session.source = source
        message('Saved')
        void options.refresh()
        return true
      }
      catch (error) {
        message(error instanceof Error ? error.message : 'Could not save the slide.', true)
        return false
      }
    })().then((ok) => {
      saving = undefined
      buttons()
      if (ok && dirty()) queue()
      return ok
    })
    buttons()
    return saving
  }

  async function follow(refresh = false): Promise<void> {
    if (panel.hidden) return
    if (loaded?.slide === options.slide() && !refresh) return
    if (loaded && dirty()) {
      if (loaded.slide === options.slide()) return
      if (!await save() || dirty()) return
    }
    await fetchSource(false)
  }

  function setOpen(open: boolean): void {
    panel.hidden = !open
    document.body.classList.toggle('editing-deck', open)
    toggle.setAttribute('aria-expanded', String(open))
    const url = new URL(location.href)
    if (open) url.searchParams.set('editor', '1')
    else url.searchParams.delete('editor')
    history.replaceState(null, '', url)
  }

  async function close(): Promise<void> {
    if (dirty() && (!await save() || dirty())) return
    requestId++
    attemptedView = undefined
    setOpen(false)
    toggle.focus()
  }
  function open(): void {
    setOpen(true)
    void fetchSource(true, true)
  }
  function togglePanel(): void {
    if (panel.hidden) open()
    else void close()
  }

  editor.addEventListener('input', () => {
    if (!loaded) return
    message(conflict ? 'Source changed on disk. Your draft is still here.' : dirty() ? 'Unsaved changes' : '')
    buttons()
    if (!conflict) queue()
  })
  panel.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void save()
    }
  })
  window.addEventListener('beforeunload', (event) => {
    if (dirty()) event.preventDefault()
  })
  toggle.addEventListener('click', togglePanel)
  closeButton.addEventListener('click', () => { void close() })
  saveButton.addEventListener('click', () => { void save() })
  reloadButton.addEventListener('click', () => {
    if (dirty() && !window.confirm('Replace your draft with the Markdown on disk?')) return
    void fetchSource(true, true)
  })
  if (new URLSearchParams(location.search).has('editor')) open()
  return { toggle: togglePanel, follow: refresh => { void follow(refresh) }, dirty }
}
