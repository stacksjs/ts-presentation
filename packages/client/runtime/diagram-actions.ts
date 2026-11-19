function invoke(target: Element): void {
  const name = target.getAttribute('data-gantt-callback') ?? ''
  if (name.length > 120) return
  const path = name.split('.')
  if (path.some(key => !/^[a-z_$][\w$]*$/i.test(key) || ['constructor', 'prototype', '__proto__'].includes(key))) return

  let receiver: unknown = window
  for (const key of path.slice(0, -1)) {
    if (receiver === null || (typeof receiver !== 'object' && typeof receiver !== 'function')) return
    receiver = Object.getOwnPropertyDescriptor(receiver, key)?.value
  }
  if (receiver === null || (typeof receiver !== 'object' && typeof receiver !== 'function')) return
  const handler = Object.getOwnPropertyDescriptor(receiver, path.at(-1)!)?.value
  if (typeof handler !== 'function') return
  let args: unknown
  try { args = JSON.parse(target.getAttribute('data-gantt-args') ?? '[]') }
  catch { return }
  if (!Array.isArray(args) || args.length > 32 || args.some(arg => typeof arg !== 'string' || arg.length > 1024)) return
  Reflect.apply(handler, receiver, args)
}

export function setupDiagramActions(stage: HTMLElement): void {
  stage.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const target = event.target instanceof Element ? event.target.closest('[data-diagram-kind="gantt"] [data-gantt-callback]') : null
    if (target) invoke(target)
  })
  stage.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return
    const target = event.target instanceof Element ? event.target.closest('[data-diagram-kind="gantt"] [role="button"][data-gantt-callback]') : null
    if (!target) return
    event.preventDefault()
    invoke(target)
  })
}
