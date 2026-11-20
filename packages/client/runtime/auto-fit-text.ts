const selector = '[data-auto-fit-text]'

declare global {
  interface Window {
    presentationFitText?: (root: ParentNode) => void
  }
}

/** Adapted from Slidev's AutoFitText component (MIT). Measure in slide coordinates. */
export function createAutoFitText(stage: HTMLElement): (root: ParentNode, force?: boolean) => void {
  const widths = new Map<HTMLElement, number>()
  const queued = new Set<HTMLElement>()
  let frame: number | undefined

  function fit(host: HTMLElement, force: boolean): void {
    const width = host.clientWidth
    if (!force && widths.get(host) === width) return
    if (widths.has(host)) widths.set(host, width)
    if (!width) return
    const inner = host.querySelector<HTMLElement>(':scope > .slidev-auto-fit-text-inner')
    if (!inner) return
    const style = getComputedStyle(host)
    const available = width - (Number.parseFloat(style.paddingInlineStart) || 0) - (Number.parseFloat(style.paddingInlineEnd) || 0)
    if (available <= 0) return
    const min = Number(host.dataset.fitMin)
    const max = Number(host.dataset.fitMax)
    if (!(min > 0 && max >= min)) return
    const size = (value: number) => { inner.style.fontSize = `${value}px` }
    inner.removeAttribute('data-fit-wrapped')
    size(max)
    if (inner.scrollWidth <= available) return
    size(min)
    if (inner.scrollWidth > available) {
      if (host.hasAttribute('data-fit-multiline')) inner.setAttribute('data-fit-wrapped', '')
      return
    }
    let low = min
    let high = max
    for (let attempt = 0; attempt < 12 && high - low > 0.2; attempt++) {
      const candidate = low + (high - low) / 2
      size(candidate)
      if (inner.scrollWidth <= available) low = candidate
      else high = candidate
    }
    size(low)
  }

  function schedule(host: HTMLElement): void {
    queued.add(host)
    frame ??= requestAnimationFrame(() => {
      frame = undefined
      for (const target of queued) {
        if (stage.contains(target)) fit(target, true)
      }
      queued.clear()
    })
  }

  const resize = new ResizeObserver((entries) => {
    for (const { target } of entries) {
      const host = target as HTMLElement
      if (widths.get(host) !== host.clientWidth) schedule(host)
    }
  })

  function observe(host: HTMLElement): void {
    if (widths.has(host)) return
    widths.set(host, 0)
    resize.observe(host)
  }

  const mutations = new MutationObserver((records) => {
    let removed = false
    for (const record of records) {
      const element = record.target instanceof Element ? record.target : record.target.parentElement
      const host = element?.closest<HTMLElement>(selector)
      if (host) schedule(host)
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue
        if (node.matches(selector)) observe(node)
        for (const nested of node.querySelectorAll<HTMLElement>(selector)) observe(nested)
      }
      removed ||= record.removedNodes.length > 0
    }
    if (removed) {
      for (const host of widths.keys()) {
        if (stage.contains(host)) continue
        resize.unobserve(host)
        widths.delete(host)
        queued.delete(host)
      }
    }
  })
  mutations.observe(stage, { childList: true, subtree: true, characterData: true })
  stage.addEventListener('load', ({ target }) => {
    const host = target instanceof Element && target.closest<HTMLElement>(selector)
    if (host) schedule(host)
  }, true)
  document.fonts?.addEventListener('loadingdone', () => {
    for (const host of widths.keys()) schedule(host)
  })

  for (const host of stage.querySelectorAll<HTMLElement>(selector)) observe(host)

  return (root, force = false) => {
    for (const host of root.querySelectorAll<HTMLElement>(selector)) fit(host, force)
  }
}
