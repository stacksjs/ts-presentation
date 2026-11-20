import type { ContextMenuContext, ContextMenuItem, ContextMenuSetup } from '../../types/src/context-menu.ts'

declare global {
  interface Window {
    presentationContextMenuSetups?: ContextMenuSetup[]
  }
}

interface ContextMenuOptions {
  stage: HTMLElement
  menu: HTMLElement
  available: () => boolean
  context: (target: Element) => ContextMenuContext
  defaults: () => ContextMenuItem[]
}

const nativeTargets = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-presentation-context-menu="ignore"]'
const inset = 8

export function mountContextMenu({ stage, menu, available, context, defaults }: ContextMenuOptions): void {
  let buttons: HTMLButtonElement[] = []
  let previousFocus: HTMLElement | undefined
  if (!stage.hasAttribute('tabindex')) stage.tabIndex = 0

  function close(restoreFocus = false): void {
    if (menu.hidden) return
    menu.hidden = true
    menu.replaceChildren()
    buttons = []
    if (restoreFocus) (previousFocus?.isConnected ? previousFocus : stage).focus({ preventScroll: true })
    previousFocus = undefined
  }

  function itemsFor(target: Element): ContextMenuItem[] {
    const state = context(target)
    let items = defaults()
    for (const setup of window.presentationContextMenuSetups ?? []) {
      const next = [...items]
      try {
        const updated = setup(next, state) ?? next
        if (Array.isArray(updated)) items = [...updated]
      }
      catch (error) {
        console.error('Could not customize the presentation context menu', error)
      }
    }
    return items
  }

  function open(target: Element, x: number, y: number): boolean {
    if (!available() || target.closest(nativeTargets)) return false
    const contents = document.createDocumentFragment()
    const actions: HTMLButtonElement[] = []
    let separator = false
    for (const item of itemsFor(target)) {
      if (item === 'separator') {
        separator = actions.length > 0
        continue
      }
      if (!item || item.show === false || !item.label || typeof item.action !== 'function') continue
      if (separator) {
        const rule = document.createElement('div')
        rule.setAttribute('role', 'separator')
        contents.append(rule)
        separator = false
      }
      const button = document.createElement('button')
      button.type = 'button'
      button.tabIndex = -1
      button.setAttribute('role', 'menuitem')
      if (item.name) button.dataset.menuItem = item.name
      if (item.disabled) button.setAttribute('aria-disabled', 'true')
      if (item.icon) {
        const icon = document.createElement('span')
        icon.textContent = item.icon
        icon.setAttribute('aria-hidden', 'true')
        button.append(icon)
      }
      if (item.small && item.icon) button.setAttribute('aria-label', item.label)
      else button.append(document.createTextNode(item.label))
      button.addEventListener('click', async () => {
        if (item.disabled) return
        close(true)
        try { await item.action() }
        catch (error) { console.error('Could not run the presentation menu action', error) }
      })
      actions.push(button)
      contents.append(button)
    }
    if (!actions.length) {
      close(true)
      return false
    }
    const focused = document.activeElement
    if (focused instanceof HTMLElement && !menu.contains(focused))
      previousFocus = focused === document.body ? stage : focused
    buttons = actions
    menu.replaceChildren(contents)
    menu.hidden = false
    const viewport = document.documentElement
    const { width, height } = menu.getBoundingClientRect()
    menu.style.left = `${Math.max(inset, Math.min(x, viewport.clientWidth - width - inset))}px`
    menu.style.top = `${Math.max(inset, Math.min(y, viewport.clientHeight - height - inset))}px`
    buttons[0].focus({ preventScroll: true })
    return true
  }

  stage.addEventListener('contextmenu', (event) => {
    if (event.shiftKey || event.defaultPrevented || !(event.target instanceof Element)) return
    if (open(event.target, event.clientX, event.clientY)) event.preventDefault()
  })
  menu.addEventListener('contextmenu', event => { event.preventDefault() })

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.isComposing) return
    const keyboardMenu = event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')
    if (!keyboardMenu || !(event.target instanceof Element)) return
    const target = event.target === document.body ? stage : event.target
    if (!stage.contains(target) && target !== stage) return
    const rect = target.getBoundingClientRect()
    if (open(target, rect.left, rect.bottom)) event.preventDefault()
  })

  menu.addEventListener('keydown', (event) => {
    if (event.isComposing) return
    if (event.key === 'Escape' || event.key === 'Tab') {
      close(true)
      if (event.key === 'Escape') event.preventDefault()
      return
    }
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!event.repeat) buttons[index]?.click()
      return
    }
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : event.key === 'ArrowDown' ? (index + 1) % buttons.length
        : event.key === 'ArrowUp' ? (index + buttons.length - 1) % buttons.length : undefined
    if (target === undefined) return
    event.preventDefault()
    buttons[target]?.focus()
  })

  document.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Node && !menu.contains(event.target)) close()
  })
  document.addEventListener('focusin', (event) => {
    if (event.target instanceof Node && !menu.contains(event.target)) close()
  })
  window.addEventListener('blur', () => close())
  window.addEventListener('resize', () => close())
  window.addEventListener('presentation:slide', () => close())
}
