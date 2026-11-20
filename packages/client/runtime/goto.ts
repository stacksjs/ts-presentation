import type { SlideRoute } from './navigation.ts'

function matchScore(label: string, query: string): number {
  if (label === query) return 0
  if (label.startsWith(query)) return 1
  if (label.includes(query)) return 2
  let offset = 0
  for (const letter of query) {
    const index = label.indexOf(letter, offset)
    if (index === -1) return Infinity
    offset = index + letter.length
  }
  return 3
}

function matchSlides(routes: readonly SlideRoute[], query: string): SlideRoute[] {
  const numeric = /^\d+$/.test(query)
  const slideNumber = numeric ? Number(query) : undefined
  const matches: { route: SlideRoute, score: number }[] = []
  for (const route of routes) {
    const score = slideNumber !== undefined
      ? route.no === slideNumber ? 0 : String(route.no).startsWith(query) ? 1 : Infinity
      : Math.min(matchScore(route.title.toLowerCase(), query), matchScore(route.alias?.toLowerCase() ?? '', query))
    if (Number.isFinite(score)) matches.push({ route, score })
  }
  return matches.sort((a, b) => a.score - b.score || a.route.no - b.route.no).map(match => match.route)
}

export function setupGotoDialog(
  dialog: HTMLDialogElement,
  routes: readonly SlideRoute[],
  go: (number: number) => void,
): () => void {
  const form = dialog.querySelector<HTMLFormElement>('#goto-search')!
  const input = form.querySelector('input')!
  const list = dialog.querySelector<HTMLUListElement>('#goto-results')!
  const status = dialog.querySelector<HTMLElement>('#goto-status')!
  let options: HTMLLIElement[] = []
  let selected = -1

  function select(index: number): void {
    options[selected]?.setAttribute('aria-selected', 'false')
    selected = index
    const option = options[index]
    if (option) {
      option.setAttribute('aria-selected', 'true')
      input.setAttribute('aria-activedescendant', option.id)
      option.scrollIntoView({ block: 'nearest' })
    }
    else input.removeAttribute('aria-activedescendant')
  }

  function update(): void {
    const query = input.value.trim().replace(/^[/#]/, '').toLowerCase()
    options = query ? matchSlides(routes, query).map(({ no, title }) => {
      const option = document.createElement('li')
      option.id = `goto-result-${no}`
      option.setAttribute('role', 'option')
      option.setAttribute('aria-selected', 'false')
      option.dataset.slide = String(no)
      const number = document.createElement('span')
      number.textContent = String(no)
      option.append(number, title)
      return option
    }) : []
    list.replaceChildren(...options)
    list.hidden = !options.length
    input.setAttribute('aria-expanded', String(!list.hidden))
    status.textContent = query && list.hidden ? 'No matching slides.' : ''
    selected = -1
    select(options.length ? 0 : -1)
  }

  function close(): void {
    dialog.close()
    // Chromium can retain focus until its next frame when opened from the body.
    const active = document.activeElement
    if (active instanceof HTMLElement && dialog.contains(active)) active.blur()
  }

  function jump(option: HTMLLIElement | undefined): void {
    if (!option) return
    close()
    go(Number(option.dataset.slide))
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    jump(options[selected])
  })
  input.addEventListener('input', update)
  input.addEventListener('keydown', (event) => {
    if (event.isComposing || !options.length) return
    const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (!direction) return
    event.preventDefault()
    select((selected + direction + options.length) % options.length)
  })
  list.addEventListener('click', (event) => {
    if (event.target instanceof Element) jump(event.target.closest<HTMLLIElement>('li') ?? undefined)
  })
  dialog.querySelector('#goto-close')!.addEventListener('click', close)
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    close()
  })
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return
    const { top, bottom, left, right } = dialog.getBoundingClientRect()
    if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) close()
  })

  return () => {
    if (dialog.open) return
    input.value = ''
    update()
    dialog.showModal()
  }
}
