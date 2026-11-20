import type { TransitionGroupProps } from '../../types/src/frontmatter.ts'

const reverseNames: Readonly<Record<string, string>> = {
  'slide-left': 'slide-right', 'slide-right': 'slide-left', 'slide-up': 'slide-down', 'slide-down': 'slide-up',
}

function transition(value: unknown, backward: boolean): (TransitionGroupProps & { name: string }) | undefined {
  const settings: TransitionGroupProps = typeof value === 'string' ? { name: value }
    : value && typeof value === 'object' ? value : {}
  if (settings.css === false || typeof settings.name !== 'string') return
  const names = settings.name.split('|', 2).map(name => name.trim())
  const forward = names[0]
  const name = backward ? names[1] ?? (Object.hasOwn(reverseNames, forward) ? reverseNames[forward] : forward) : forward
  if (/^[A-Za-z_][\w-]*$/.test(name) && name !== 'none') return { ...settings, name }
}

function phase(element: HTMLElement, kind: 'enter' | 'leave', settings: TransitionGroupProps & { name: string }, appear: boolean) {
  const entering = kind === 'enter'
  const fallback = `${settings.name}-${kind}`
  const startClass = entering ? (appear ? settings.appearFromClass ?? settings.enterFromClass : settings.enterFromClass) : settings.leaveFromClass
  const activeClass = entering ? (appear ? settings.appearActiveClass ?? settings.enterActiveClass : settings.enterActiveClass) : settings.leaveActiveClass
  const endClass = entering ? (appear ? settings.appearToClass ?? settings.enterToClass : settings.enterToClass) : settings.leaveToClass
  const split = (value: unknown, defaultValue: string) => (typeof value === 'string' ? value : defaultValue).split(/\s+/).filter(Boolean)
  const start = split(startClass, `${fallback}-from`)
  const active = split(activeClass, `${fallback}-active`)
  const end = split(endClass, `${fallback}-to`)
  const previousAnimations = new Set(element.getAnimations?.())
  const originalInert = element.inert
  const classes = new Set<string>()
  function add(names: string[]): void {
    for (const name of names) {
      if (element.classList.contains(name)) continue
      classes.add(name)
      element.classList.add(name)
    }
  }
  add(start)
  add(active)
  element.dataset.slideTransitionRole = kind
  if (!entering) element.inert = true
  let cancelTimer: (() => void) | undefined
  return {
    advance() {
      for (const name of start) {
        if (!active.includes(name) && classes.delete(name)) element.classList.remove(name)
      }
      add(end)
      const duration = typeof settings.duration === 'number' ? settings.duration : settings.duration?.[kind]
      if (duration === 0) return
      if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0)
        return new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, duration)
          cancelTimer = () => { clearTimeout(timer); resolve() }
        })
      const animations = element.getAnimations?.().filter(animation => !previousAnimations.has(animation)
        && animation.effect && Number.isFinite(animation.effect.getComputedTiming().endTime))
      if (animations?.length) return Promise.allSettled(animations.map(animation => animation.finished))
    },
    stop() {
      cancelTimer?.()
      if (!entering) element.hidden = true
      for (const name of classes) element.classList.remove(name)
      delete element.dataset.slideTransitionRole
      if (!entering) element.inert = originalInert
    },
  }
}

interface SlideTransitions {
  flush: () => void
  stop: () => void
  play: (value: unknown, backward: boolean, outgoing: HTMLElement | undefined, incoming: HTMLElement, commit: (retainOutgoing: boolean) => void) => void
}

export function createSlideTransitions(stage: HTMLElement, enabled: boolean): SlideTransitions {
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  let stopCss: (() => void) | undefined
  let view: ViewTransition | undefined
  let updateView: (() => void) | undefined

  function flush(): void {
    if (!updateView) return
    view?.skipTransition()
    updateView()
  }
  function stop(): void {
    flush()
    view?.skipTransition()
    view = undefined
    stopCss?.()
  }
  if (enabled) {
    motion.addEventListener('change', () => { if (motion.matches) stop() })
    window.addEventListener('beforeprint', stop)
  }

  function play(value: unknown, backward: boolean, outgoing: HTMLElement | undefined, incoming: HTMLElement, commit: (retainOutgoing: boolean) => void): void {
    stop()
    const selected = enabled && !motion.matches ? transition(value, backward) : undefined
    if (!selected || (!outgoing && selected.appear !== true)) {
      commit(false)
      return
    }

    if (selected.name === 'view-transition' && typeof document.startViewTransition === 'function') {
      const update = () => {
        if (updateView !== update) return
        updateView = undefined
        commit(false)
      }
      updateView = update
      try {
        const running = view = document.startViewTransition(update)
        const clear = () => { if (view === running) view = undefined }
        void running.ready.catch(() => {})
        void running.updateCallbackDone.catch(() => {})
        void running.finished.then(clear, clear)
        return
      }
      catch { updateView = undefined }
    }

    const settings = selected.name === 'view-transition' ? { ...selected, name: 'fade' } : selected
    stage.dataset.slideTransition = settings.name
    const entering = phase(incoming, 'enter', settings, !outgoing)
    const leaving = outgoing && phase(outgoing, 'leave', settings, false)
    const finish = () => {
      if (stopCss !== finish) return
      entering.stop()
      leaving?.stop()
      delete stage.dataset.slideTransition
      stopCss = undefined
    }
    stopCss = finish
    commit(Boolean(outgoing))
    if (stopCss !== finish) return
    // Establish the starting styles with both slides mounted before swapping
    // the classes that start CSS transitions on the two elements.
    void stage.offsetWidth
    const animations = [entering.advance(), leaving?.advance()].filter(Boolean)
    if (animations.length) void Promise.allSettled(animations).then(finish)
    else finish()
  }

  return { flush, play, stop }
}
