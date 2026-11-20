type TimerState =
  | { status: 'stopped' }
  | { status: 'paused', elapsed: number }
  | { status: 'running', elapsed: number, since: number }

function readTimer(raw: string | null): TimerState | undefined {
  if (!raw) return
  try {
    const state = JSON.parse(raw)
    if (state?.status === 'stopped') return { status: 'stopped' }
    if (!Number.isSafeInteger(state?.elapsed) || state.elapsed < 0) return
    if (state.status === 'paused') return { status: 'paused', elapsed: state.elapsed }
    if (state.status === 'running' && Number.isSafeInteger(state.since) && state.since >= 0)
      return { status: 'running', elapsed: state.elapsed, since: state.since }
  }
  catch {}
}

function elapsedTime(state: TimerState, now: number): number {
  if (state.status === 'stopped') return 0
  return state.elapsed + (state.status === 'running' ? Math.max(0, now - state.since) : 0)
}

function timeLabel(seconds: number): string {
  const absolute = Math.abs(seconds)
  const hours = Math.floor(absolute / 3600)
  const minutes = Math.floor(absolute / 60) % 60
  const tail = String(absolute % 60).padStart(2, '0')
  const sign = seconds < 0 ? '-' : ''
  return hours ? `${sign}${hours}:${String(minutes).padStart(2, '0')}:${tail}` : `${sign}${minutes}:${tail}`
}

export function setupPresenterTimer(panel: HTMLElement) {
  const timing = panel.querySelector<HTMLElement>('#presenter-timing')!
  const display = timing.querySelector<HTMLElement>('#presenter-time')!
  const toggle = timing.querySelector<HTMLButtonElement>('#presenter-timer-toggle')!
  const reset = timing.querySelector<HTMLButtonElement>('#presenter-reset')!
  const progress = panel.querySelector<HTMLProgressElement>('#presenter-time-progress')!
  const countdown = timing.dataset.timerMode === 'countdown'
  const duration = Number(timing.dataset.timerDuration)
  // Scope persistence to the deck's deployment base, including history routes.
  const key = `ts-presentation-timer:${new URL('.', document.baseURI).pathname}`
  let state: TimerState = saved() ?? { status: 'stopped' }
  let interval: ReturnType<typeof setInterval> | undefined
  let active = false
  progress.max = duration
  display.setAttribute('aria-label', countdown ? 'Time remaining' : 'Elapsed time')

  function saved(): TimerState | undefined {
    try { return readTimer(localStorage.getItem(key)) }
    catch { return undefined }
  }

  function renderTime(): void {
    const elapsed = elapsedTime(state, Date.now())
    const seconds = countdown ? Math.ceil((duration - elapsed) / 1000) : Math.floor(elapsed / 1000)
    const label = timeLabel(seconds)
    if (display.textContent !== label) display.textContent = label
    const pacing = elapsed > duration ? 'overtime' : elapsed >= duration * 0.8 ? 'near-limit' : 'in-budget'
    if (timing.dataset.timerPacing !== pacing) timing.dataset.timerPacing = pacing
    progress.value = Math.min(elapsed, duration)
  }

  function refresh(): void {
    renderTime()
    timing.dataset.timerStatus = state.status
    const action = state.status === 'running' ? 'Pause' : state.status === 'paused' ? 'Resume' : 'Start'
    toggle.textContent = action
    toggle.setAttribute('aria-label', `${action} timer`)
    if (active && !document.hidden && state.status === 'running') interval ??= setInterval(renderTime, 250)
    else if (interval !== undefined) {
      clearInterval(interval)
      interval = undefined
    }
  }

  function commit(next: TimerState): void {
    state = next
    try { localStorage.setItem(key, JSON.stringify(state)) }
    catch {}
    refresh()
  }

  toggle.addEventListener('click', () => {
    state = saved() ?? state
    const now = Date.now()
    const elapsed = elapsedTime(state, now)
    if (state.status === 'running') commit({ status: 'paused', elapsed })
    else commit({ status: 'running', elapsed, since: now })
  })
  reset.addEventListener('click', () => commit({ status: 'stopped' }))
  window.addEventListener('storage', (event) => {
    if (event.key !== key || event.storageArea !== localStorage) return
    state = saved() ?? { status: 'stopped' }
    refresh()
  })
  document.addEventListener('visibilitychange', refresh)

  return {
    setActive(value: boolean): void {
      active = value
      refresh()
    },
  }
}
