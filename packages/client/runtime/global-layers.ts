const trackedContent = [
  '.slidev-vclick-target', 'v-switch', 'v-clicks', '[data-render-when]', '[data-light-or-dark]',
  '[data-code-block]', '[data-code-group]', '[data-equation-steps]', '[data-presentation-drag]',
  '[data-zoom]', 'details', 'video', 'audio',
].join(',')

function move(parent: Element, node: Element, before: ChildNode | null): void {
  if (typeof parent.moveBefore === 'function') parent.moveBefore(node, before)
  else parent.insertBefore(node, before)
}

export function carryGlobalLayers(previous: HTMLElement, next: HTMLElement): void {
  if (!previous.hasAttribute('data-presentation-layers') || !next.hasAttribute('data-presentation-layers')) return
  for (const name of ['global-bottom', 'global-top']) {
    const selector = `:scope > [data-presentation-layer="${name}"][data-global-layer]`
    const existing = previous.querySelector<HTMLElement>(selector)
    const incoming = next.querySelector<HTMLElement>(selector)
    if (!existing || !incoming || existing.dataset.globalLayer !== incoming.dataset.globalLayer) continue
    if (existing.querySelector(trackedContent) || incoming.querySelector(trackedContent)) continue
    // Keep an equivalent layer in the inactive article for printing the whole deck.
    const before = existing.nextSibling
    move(next, existing, incoming)
    move(previous, incoming, before)
  }
}
