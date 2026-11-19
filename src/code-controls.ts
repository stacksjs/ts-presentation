interface Group {
  element: HTMLElement
  tabs: HTMLButtonElement[]
  panels: HTMLElement[]
  selected: number
}

export interface CodeTabSelection { group: string, tab: number }
interface CodeTabs {
  select: (group: string, tab: number) => boolean
  selections: () => CodeTabSelection[]
}

export function setupCodeTabs(stage: HTMLElement, onSelect: (selection: CodeTabSelection) => void): CodeTabs {
  const groups = new Map<string, Group>()
  for (const element of stage.querySelectorAll<HTMLElement>('[data-code-group]')) {
    const tabs = [...element.querySelectorAll<HTMLButtonElement>(':scope > [role="tablist"] > [role="tab"]')]
    const panels = [...element.querySelectorAll<HTMLElement>(':scope > .code-group-panel')]
    if (tabs.length > 0 && tabs.length === panels.length) groups.set(element.dataset.codeGroup!, { element, tabs, panels, selected: 0 })
  }

  function select(id: string, tab: number, notify: boolean): boolean {
    const group = groups.get(id)
    if (!group || !Number.isInteger(tab) || !group.tabs[tab] || group.selected === tab) return false
    const { selected, panels, tabs } = group
    panels[selected].hidden = true
    tabs[selected].setAttribute('aria-selected', 'false')
    tabs[selected].tabIndex = -1
    panels[tab].hidden = false
    tabs[tab].setAttribute('aria-selected', 'true')
    tabs[tab].tabIndex = 0
    group.selected = tab
    if (notify) onSelect({ group: id, tab })
    return true
  }

  function find(target: EventTarget | null): { id: string, group: Group, tab: HTMLButtonElement } | undefined {
    const tab = target instanceof Element ? target.closest<HTMLButtonElement>('button[role="tab"]') : null
    const element = tab?.closest<HTMLElement>('[data-code-group]')
    const id = element?.dataset.codeGroup
    const group = id && groups.get(id)
    if (group && group.element === element && tab && group.tabs.includes(tab)) return { id, group, tab }
  }

  stage.addEventListener('click', (event) => {
    const target = find(event.target)
    if (target) select(target.id, target.group.tabs.indexOf(target.tab), true)
  })
  stage.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const target = find(event.target)
    if (!target) return
    const { id, group: { tabs }, tab } = target
    const selected = tabs.indexOf(tab)
    const next = event.key === 'ArrowRight' ? (selected + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (selected + tabs.length - 1) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : undefined
    if (next === undefined) return
    event.preventDefault()
    select(id, next, true)
    tabs[next].focus()
  })

  return {
    select: (id, tab) => select(id, tab, false),
    selections: () => [...groups].flatMap(([group, { selected }]) => selected ? [{ group, tab: selected }] : []),
  }
}

export function codeText(code: HTMLElement): string {
  const lines = code.querySelectorAll<HTMLElement>(':scope > [data-code-line]')
  if (!lines.length) return code.textContent ?? ''
  return [...lines].map((line) => {
    if (line.hasAttribute('data-code-empty')) return ''
    const gutter = line.querySelector(':scope > .code-line-number')?.textContent ?? ''
    return (line.textContent ?? '').slice(gutter.length)
  }).join('\n')
}

async function writeClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  }
  catch {
    // Some browsers restrict async clipboard writes in file or embedded decks.
  }
  const selected = document.activeElement
  const input = document.createElement('textarea')
  input.value = value
  input.style.cssText = 'position:fixed;left:-10000px;top:0'
  input.readOnly = true
  document.body.append(input)
  input.select()
  try { return document.execCommand('copy') }
  catch { return false }
  finally {
    input.remove()
    if (selected instanceof HTMLElement) selected.focus({ preventScroll: true })
  }
}

export function setupCodeCopy(stage: HTMLElement): void {
  const sources = new WeakMap<HTMLButtonElement, () => string>()
  const timers = new WeakMap<HTMLButtonElement, ReturnType<typeof setTimeout>>()
  function install(parent: HTMLElement, source: () => string): void {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'code-copy-action'
    button.textContent = 'Copy'
    button.title = 'Copy code'
    button.setAttribute('aria-live', 'polite')
    parent.append(button)
    sources.set(button, source)
  }
  for (const article of stage.querySelectorAll(':scope > article')) {
    for (const code of article.querySelectorAll<HTMLElement>('pre > code')) {
      if (code.closest('.live-code')) continue
      const disabled = code.closest('[data-code-motion]')
        ? article.hasAttribute('data-magic-copy-disabled')
        : article.hasAttribute('data-code-copy-disabled')
      if (disabled) continue
      const pre = code.parentElement!
      const overlay = document.createElement('span')
      overlay.className = 'code-copy-overlay'
      pre.prepend(overlay)
      install(overlay, () => codeText(code))
    }
    if (article.hasAttribute('data-code-copy-disabled')) continue
    for (const live of article.querySelectorAll('.live-code')) {
      const toolbar = live.querySelector<HTMLElement>('.live-code-toolbar')
      const input = live.querySelector('textarea')
      if (toolbar && input) install(toolbar, () => input.value)
    }
  }
  stage.addEventListener('click', async (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button.code-copy-action') : null
    const source = button && sources.get(button)
    if (!button || !source) return
    const copied = await writeClipboard(source())
    button.textContent = copied ? 'Copied' : 'Copy failed'
    clearTimeout(timers.get(button))
    timers.set(button, setTimeout(() => { button.textContent = 'Copy' }, 1500))
  })
}
