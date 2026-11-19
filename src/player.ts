const stage = document.querySelector<HTMLElement>('#stage')!
const articles = [...document.querySelectorAll<HTMLElement>('.slide')]
const notesPanel = document.querySelector<HTMLElement>('#presenter-notes')!
const notes = [...notesPanel.querySelectorAll<HTMLElement>(':scope > section')]
const goto = document.querySelector<HTMLSelectElement>('#goto')!
const previous = document.querySelector<HTMLButtonElement>('#previous')!
const next = document.querySelector<HTMLButtonElement>('#next')!
const presenter = document.querySelector<HTMLButtonElement>('#presenter')!
const fullscreen = document.querySelector<HTMLButtonElement>('#fullscreen')!

let current = 1
const isPresenter = new URLSearchParams(location.search).has('presenter')
const opener: Window | null = isPresenter ? window.opener : null
const messageOrigin = location.protocol === 'file:' ? '*' : location.origin
let popup: Window | null = null
document.body.classList.add('playing')

function resize(): void {
  const width = Math.max(1, stage.clientWidth - 24)
  const height = Math.max(1, stage.clientHeight - 24)
  stage.style.setProperty('--slide-scale', String(Math.min(width / 960, height / 540)))
}

function show(number: number, writeHistory = true, sync = true): void {
  const selected = Math.max(1, Math.min(articles.length, number))
  if (selected !== current && writeHistory) history.pushState(null, '', `#slide-${selected}`)
  current = selected
  articles.forEach((article, index) => { article.hidden = index !== current - 1 })
  notes.forEach((note, index) => { note.hidden = index !== current - 1 })
  goto.value = String(current)
  previous.disabled = current === 1
  next.disabled = current === articles.length
  if (sync) (opener ?? popup)?.postMessage({ presentationSlide: current }, messageOrigin)
}

function readLocation(): void {
  const res = /^#slide-(\d+)$/.exec(location.hash)
  show(res ? Number(res[1]) : 1, false)
}

function togglePresenter(): void {
  notesPanel.hidden = !notesPanel.hidden
  document.body.classList.toggle('presenting', !notesPanel.hidden)
  presenter.setAttribute('aria-pressed', String(!notesPanel.hidden))
  resize()
}

function openPresenter(): void {
  if (isPresenter) {
    togglePresenter()
    return
  }
  const url = new URL(location.href)
  url.searchParams.set('presenter', '1')
  url.hash = `slide-${current}`
  popup = window.open(url, 'ts-presentation-presenter', 'popup,width=1130,height=750')
  if (!popup) togglePresenter()
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.origin !== (location.protocol === 'file:' ? 'null' : location.origin) || !event.source || event.source !== (opener ?? popup)) return
  const data = event.data as { presentationSlide?: unknown, presenterReady?: unknown } | null
  if (data?.presenterReady === true && popup) {
    popup.postMessage({ presentationSlide: current }, messageOrigin)
  }
  if (typeof data?.presentationSlide === 'number' && Number.isInteger(data.presentationSlide)) {
    show(data.presentationSlide, true, false)
  }
})

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) await document.exitFullscreen()
  else await document.documentElement.requestFullscreen()
}

previous.addEventListener('click', () => show(current - 1))
next.addEventListener('click', () => show(current + 1))
goto.addEventListener('change', () => show(Number(goto.value)))
presenter.addEventListener('click', openPresenter)
fullscreen.addEventListener('click', () => { void toggleFullscreen() })
window.addEventListener('hashchange', readLocation)
window.addEventListener('popstate', readLocation)
new ResizeObserver(resize).observe(stage)

window.addEventListener('keydown', event => {
  if (event.altKey || event.metaKey || event.ctrlKey || event.defaultPrevented) return
  if (event.target instanceof HTMLElement && event.target.closest('button, a, input, select, textarea, [contenteditable]')) return

  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      show(current - 1)
      break
    case ' ':
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
      show(current + 1)
      break
    case 'Home':
      show(1)
      break
    case 'End':
      show(articles.length)
      break
    case 'p':
    case 'P':
      openPresenter()
      break
    case 'f':
    case 'F':
      void toggleFullscreen()
      break
    default:
      return
  }
  event.preventDefault()
})

readLocation()
if (isPresenter) {
  togglePresenter()
  opener?.postMessage({ presenterReady: true }, messageOrigin)
}
resize()
