export function mountInlineMath(root: ParentNode): void {
  for (const row of root.querySelectorAll('math > semantics > mrow:has(> mspace[data-math-break])')) {
    const math = row.parentElement!.parentElement!
    if (row.querySelector('a, [tabindex]')) continue
    const wrapper = document.createElement('span')
    wrapper.className = 'math-inline'
    const visual = document.createDocumentFragment()
    let parts: Element[] = []
    function flush(): void {
      if (!parts.length) return
      const fragment = math.cloneNode(false) as Element
      fragment.removeAttribute('id')
      fragment.setAttribute('aria-hidden', 'true')
      fragment.classList.add('math-inline-fragment')
      const line = row.cloneNode(false) as Element
      line.append(...parts)
      fragment.append(line)
      visual.append(fragment)
      parts = []
    }

    for (const child of [...row.children]) {
      if (child.hasAttribute('data-math-break')) {
        flush()
        visual.append(document.createElement('wbr'))
        child.remove()
      }
      else parts.push(child.cloneNode(true) as Element)
    }
    flush()

    // Expose one complete equation to assistive technology and reserve
    // wrapping and painting for the visual fragments.
    math.replaceWith(wrapper)
    math.classList.add('math-inline-source')
    for (const element of math.querySelectorAll('[id]')) element.removeAttribute('id')
    wrapper.append(math, visual)
  }
}
