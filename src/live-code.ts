const workerBody = String.raw`
const send = self.postMessage.bind(self)
const format = (value) => {
  if (typeof value === 'string') return value
  if (value instanceof Error) return String(value)
  try {
    return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item + 'n' : item) ?? String(value)
  } catch {
    return String(value)
  }
}
let budget = 16000
function write(values) {
  if (budget <= 0) return
  const text = values.map(format).join(' ').slice(0, budget)
  budget -= text.length + 1
  send({ kind: 'line', text })
}
const logger = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug', 'table'].map(key => [key, (...values) => write(values)]))
self.console = logger
self.onmessage = async ({ data }) => {
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
    const result = await new AsyncFunction('console', data)(logger)
    if (result !== undefined) write([result])
    send({ kind: 'finished' })
  } catch (error) {
    send({ kind: 'error', text: String(error).slice(0, 800) })
  }
}
`

const sandbox = `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<script>
  const workerCode = ${JSON.stringify(workerBody).replaceAll('<', '\\u003c')}
  const notify = message => parent.postMessage(message, '*')
  addEventListener('message', event => {
    if (event.source !== parent || typeof event.data !== 'string') return
    let location
    try {
      location = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }))
      const worker = new Worker(location)
      worker.onmessage = event => notify(event.data)
      worker.onerror = () => notify({ kind: 'error', text: 'The browser worker could not start' })
      worker.postMessage(event.data)
    } catch (error) {
      notify({ kind: 'error', text: String(error) })
    } finally {
      if (location) URL.revokeObjectURL(location)
    }
  }, { once: true })
</script>`

async function execute(program: string, append: (text: string) => void, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false
  const iframe = document.createElement('iframe')
  iframe.hidden = true
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.title = 'Isolated example runtime'
  iframe.srcdoc = sandbox
  return new Promise((resolve) => {
    let budget = 16_000
    function end(success: boolean): void {
      window.clearTimeout(timeout)
      window.removeEventListener('message', receive)
      signal.removeEventListener('abort', abort)
      iframe.remove()
      resolve(success)
    }

    function abort(): void {
      append('Stopped.')
      end(false)
    }

    function receive(event: MessageEvent): void {
      if (event.source !== iframe.contentWindow || event.origin !== 'null' || !event.data || typeof event.data !== 'object') return
      const { kind, text } = event.data as { kind?: string, text?: unknown }
      if (kind === 'line' && typeof text === 'string' && budget > 0) {
        const safe = text.slice(0, budget)
        budget -= safe.length + 1
        append(safe)
      }
      if (kind === 'error' && typeof text === 'string') {
        append(text.slice(0, 800))
        end(false)
      }
      if (kind === 'finished') end(true)
    }

    const timeout = window.setTimeout(() => {
      append('Stopped after 3 seconds.')
      end(false)
    }, 3000)
    window.addEventListener('message', receive)
    signal.addEventListener('abort', abort, { once: true })
    iframe.addEventListener('load', () => iframe.contentWindow?.postMessage(program, '*'), { once: true })
    document.body.append(iframe)
  })
}

export function setupLiveCode(): void {
  const canCompile = document.documentElement.dataset.liveCompile === 'true'
  for (const block of document.querySelectorAll<HTMLElement>('.live-code')) {
    const editor = block.querySelector('textarea')!
    const reset = block.querySelector<HTMLButtonElement>('[data-live-reset]')!
    const run = block.querySelector<HTMLButtonElement>('[data-live-run]')
    const output = block.querySelector<HTMLElement>('.live-output')
    const original = editor.value
    const compiled = block.querySelector<HTMLTemplateElement>('[data-live-program]')?.content.textContent ?? ''
    const error = block.querySelector<HTMLTemplateElement>('[data-live-error]')?.content.textContent
    const switchLanguage = block.querySelector<HTMLButtonElement>('[data-live-convert]')
    const label = block.querySelector<HTMLElement>('.live-code-toolbar > span')
    let language = block.dataset.language === 'ts' ? 'ts' : 'js'
    let active: AbortController | undefined

    if (switchLanguage && !canCompile && !error) {
      switchLanguage.hidden = false
      switchLanguage.addEventListener('click', () => {
        active?.abort()
        language = 'js'
        editor.value = compiled
        editor.setAttribute('aria-label', 'Edit JavaScript example')
        if (label) label.textContent = 'JavaScript'
        switchLanguage.hidden = true
        if (output) output.textContent = ''
        editor.focus()
      })
    }

    reset.addEventListener('click', () => {
      active?.abort()
      language = block.dataset.language === 'ts' ? 'ts' : 'js'
      if (label) label.textContent = language === 'ts' ? 'TypeScript' : 'JavaScript'
      editor.setAttribute('aria-label', `Edit ${label?.textContent ?? 'code'} example`)
      if (switchLanguage) switchLanguage.hidden = canCompile || Boolean(error)
      editor.value = original
      if (output) output.textContent = ''
      editor.focus()
    })
    if (!run || !output) continue
    run.addEventListener('click', async () => {
      if (active) { active.abort(); return }
      const controller = new AbortController()
      active = controller
      run.textContent = 'Stop'
      output.textContent = ''
      const append = (text: string) => { output.textContent += `${text}\n` }
      try {
        let program = editor.value
        if (language === 'ts' && editor.value === original) {
          if (error) throw new Error(error)
          program = compiled
        }
        else if (language === 'ts' && canCompile) {
          const response = await fetch('./__presentation/compile', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: program,
            signal: controller.signal,
          })
          program = await response.text()
          if (!response.ok) throw new Error(program)
        }
        else if (language === 'ts') throw new Error('Use Edit as JavaScript to run edits in the static deck.')
        if (program.length > 64_000) throw new Error('Code sample is too large')
        const success = await execute(program, append, controller.signal)
        if (success && !output.textContent) append('Finished without console output.')
      }
      catch (cause) {
        if (!controller.signal.aborted) append(cause instanceof Error ? cause.message : 'Could not run the example')
      }
      finally {
        active = undefined
        run.textContent = 'Run'
      }
    })
    editor.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        run.click()
      }
    })
  }
}
