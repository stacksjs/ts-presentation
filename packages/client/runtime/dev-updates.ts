import type { LiveDeck } from '../../types/src/dev-protocol.ts'

export interface LiveManifest {
  revision: string
  frame: string
  deckCss: string
  revisions: string[]
}

interface LiveUpdates {
  revision: () => string
  refresh: () => Promise<void>
}

export function watchLiveDeck(
  apply: (next: LiveDeck, current: LiveManifest) => boolean,
  changed: () => void,
  report: (issue: string) => void,
): LiveUpdates | undefined {
  const script = document.querySelector('#presentation-live')
  if (!script?.textContent) return
  let current = JSON.parse(script.textContent) as LiveManifest
  let request: Promise<void> | undefined
  let issue = ''
  function status(message: string): void {
    if (message === issue) return
    issue = message
    report(message)
  }
  async function check(): Promise<void> {
    try {
      const result = await fetch(`./__presentation/live?revision=${encodeURIComponent(current.revision)}`, { cache: 'no-store' })
      if (result.status === 204) { status(''); return }
      if (!result.ok) {
        status(result.status === 422 ? await result.text() : 'Live preview is unavailable.')
        return
      }
      const next = await result.json() as LiveDeck
      if (!next.slides.length) return
      status('')
      if (!apply(next, current)) return
      current = { revision: next.revision, frame: next.frame, deckCss: next.deckCss, revisions: next.slides.map(slide => slide.revision) }
      changed()
    }
    catch {
      status('Waiting for the local preview server.')
    }
  }
  const refresh = () => request ??= check().finally(() => { request = undefined })
  async function poll(): Promise<void> {
    if (!document.hidden) await refresh()
    setTimeout(() => { void poll() }, 650)
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh() })
  setTimeout(() => { void poll() }, 650)
  return { revision: () => current.revision, refresh }
}
