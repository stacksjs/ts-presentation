import type { SlideMode } from './navigation.ts'

const selector = '[data-render-when], [data-light-or-dark]'
const visibleSelector = '[data-render-when~="visible"]'
type Slot = 'default' | 'fallback' | 'light' | 'dark'

interface Branches {
  slots: Record<Slot, DocumentFragment>
  active?: Slot
}

function readSlots(host: HTMLElement): Branches {
  const slots = {
    default: document.createDocumentFragment(),
    fallback: document.createDocumentFragment(),
    light: document.createDocumentFragment(),
    dark: document.createDocumentFragment(),
  }
  const template = host.querySelector<HTMLTemplateElement>(':scope > template[data-condition-content]')
  for (const node of [...(template?.content ?? host).childNodes]) {
    if (node instanceof HTMLTemplateElement) {
      const slot = node.getAttributeNames().find(name => /^(?:#|v-slot:)(?:default|fallback|light|dark)$/.test(name))
      if (slot) {
        const name = slot.replace(/^(?:#|v-slot:)/, '') as Slot
        const scope = node.getAttribute(slot)?.trim()
        if (host.hasAttribute('data-light-or-dark') && scope) {
          for (const element of node.content.querySelectorAll<HTMLElement>('[v-bind]')) {
            if (element.getAttribute('v-bind') !== scope) continue
            for (const key of host.getAttributeNames()) {
              if (key === 'id' || /^(?:data-light-or-dark$|v-|:)/.test(key) || element.hasAttribute(key)) continue
              element.setAttribute(key, host.getAttribute(key)!)
            }
            element.removeAttribute('v-bind')
          }
        }
        slots[name].append(node.content)
        node.remove()
        continue
      }
    }
    slots.default.append(node)
  }
  template?.remove()
  return { slots }
}

/** Adapted from Slidev's RenderWhen and LightOrDark components (MIT). */
export function createSlideConditions(mode: () => SlideMode, refresh: () => void): {
  update(container: HTMLElement): boolean
  observe(slide: HTMLElement): void
  toggleDark(): void
} {
  const root = document.documentElement
  const schema = root.dataset.colorSchema
  const preferred = matchMedia('(prefers-color-scheme: dark)')
  let override: boolean | undefined
  const dark = () => override ?? (schema === 'auto' ? preferred.matches : schema !== 'light')
  function applyScheme(): void {
    const value = dark()
    root.classList.toggle('dark', value)
    root.classList.toggle('light', !value)
  }
  applyScheme()
  if (schema === 'auto') preferred.addEventListener('change', () => {
    applyScheme()
    refresh()
  })

  const state = new WeakMap<HTMLElement, Branches>()
  const visibility = new WeakMap<HTMLElement, boolean>()
  let observed = new Set<HTMLElement>()
  const observer = new IntersectionObserver((entries) => {
    let changed = false
    for (const entry of entries) {
      const host = entry.target as HTMLElement
      if (!observed.has(host) || (visibility.get(host) ?? true) === entry.isIntersecting) continue
      visibility.set(host, entry.isIntersecting)
      changed = true
    }
    if (changed) refresh()
  })

  function selected(host: HTMLElement): Slot {
    if (host.hasAttribute('data-light-or-dark')) return dark() ? 'dark' : 'light'
    const contexts = host.dataset.renderWhen?.split(/\s+/) ?? []
    if (contexts.includes('visible') && visibility.get(host) === false) return 'fallback'
    const current = mode()
    const matches = contexts.some(context => context === 'visible' || context === current
      || (context === 'main' && (current === 'slide' || current === 'presenter'))
      || (context === 'print' && current === 'export')
      || (context === 'previewNext' && current === 'preview'))
    return matches ? 'default' : 'fallback'
  }

  function update(container: HTMLElement): boolean {
    let changed = false
    for (const host of container.querySelectorAll<HTMLElement>(selector)) {
      if (!container.contains(host)) continue
      let branches = state.get(host)
      if (!branches) {
        branches = readSlots(host)
        state.set(host, branches)
      }
      const next = selected(host)
      if (branches.active === next) continue
      if (branches.active) branches.slots[branches.active].append(...host.childNodes)
      host.append(branches.slots[next])
      branches.active = next
      update(host)
      changed = true
    }
    return changed
  }

  function observe(slide: HTMLElement): void {
    const targets = new Set(slide.querySelectorAll<HTMLElement>(visibleSelector))
    for (const host of observed) if (!targets.has(host)) observer.unobserve(host)
    for (const host of targets) if (!observed.has(host)) observer.observe(host)
    observed = targets
  }

  return {
    update,
    observe,
    toggleDark() {
      override = !dark()
      applyScheme()
      refresh()
    },
  }
}
