import type { CodeRunnerOutput } from '../../types/src/code-runner.ts'
import { nativeCodeLanguage } from '../../types/src/code-runner.ts'
import { customRunner, showRunnerOutput } from './code-runners.ts'

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

type WriteOutput = (text: string, error?: boolean) => void

async function execute(program: string, append: WriteOutput, signal: AbortSignal): Promise<boolean> {
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
        append(text.slice(0, 800), true)
        end(false)
      }
      if (kind === 'finished') end(true)
    }

    const timeout = window.setTimeout(() => {
      append('Stopped after 3 seconds.', true)
      end(false)
    }, 3000)
    window.addEventListener('message', receive)
    signal.addEventListener('abort', abort, { once: true })
    iframe.addEventListener('load', () => iframe.contentWindow?.postMessage(program, '*'), { once: true })
    document.body.append(iframe)
  })
}

const mountedEditors = new WeakSet<HTMLElement>()

export function setupLiveCode(root: ParentNode = document): void {
  const canCompile = document.documentElement.dataset.liveCompile === 'true'
  for (const block of root.querySelectorAll<HTMLElement>('.live-code')) {
    if (mountedEditors.has(block)) continue
    mountedEditors.add(block)
    const editor = block.querySelector('textarea')!
    const reset = block.querySelector<HTMLButtonElement>('[data-live-reset]')!
    const run = block.querySelector<HTMLButtonElement>('[data-live-run]')
    const output = block.querySelector<HTMLElement>('[data-live-result]')
    const authored = editor.value
    let original = authored
    const compiled = block.querySelector<HTMLTemplateElement>('[data-live-program]')?.content.textContent ?? ''
    const error = block.querySelector<HTMLTemplateElement>('[data-live-error]')?.content.textContent
    const switchLanguage = block.querySelector<HTMLButtonElement>('[data-live-convert]')
    const label = block.querySelector<HTMLElement>('.live-code-toolbar > span')
    const save = block.querySelector<HTMLButtonElement>('[data-live-save]')
    const status = block.querySelector('[data-snippet-status]')
    const originalLanguage = block.dataset.language ?? 'js'
    const originalLabel = label?.textContent ?? originalLanguage
    let language = originalLanguage
    let active: AbortController | undefined

    if (save && status) save.addEventListener('click', async () => {
      const source = editor.value
      if (save.disabled || source === original) return
      save.disabled = true
      status.textContent = 'Saving…'
      try {
        const response = await fetch('./__presentation/snippet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: block.dataset.snippetToken, revision: block.dataset.snippetRevision, source }),
        })
        const result = await response.text()
        if (!response.ok) throw new Error(result)
        block.dataset.snippetRevision = result
        original = source
        const print = block.querySelector('.live-code-static code')
        if (print) print.textContent = source
        status.textContent = 'Saved.'
      }
      catch (error) {
        status.textContent = error instanceof Error ? error.message : 'Could not save the snippet.'
      }
      finally {
        save.disabled = false
      }
    })

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
      language = originalLanguage
      if (label) label.textContent = originalLabel
      editor.setAttribute('aria-label', `Edit ${label?.textContent ?? 'code'} example`)
      if (switchLanguage) switchLanguage.hidden = canCompile || Boolean(error)
      editor.value = original
      if (output) output.textContent = ''
      editor.focus()
    })
    if (!run || !output) continue
    const runnerOptions: Record<string, unknown> = JSON.parse(block.dataset.liveOptions ?? '{}')
    run.addEventListener('click', async () => {
      if (active) { active.abort(); return }
      const controller = new AbortController()
      const { signal } = controller
      active = controller
      run.textContent = 'Stop'
      output.textContent = ''
      const append = (text: string) => {
        if (!signal.aborted) output.textContent += `${text}\n`
      }
      const complete = () => {
        if (active !== controller) return
        active = undefined
        run.textContent = 'Run'
      }
      const abort = () => {
        output.textContent += 'Stopped.\n'
        complete()
      }
      signal.addEventListener('abort', abort, { once: true })
      async function runNative(source: string, kind: 'ts' | 'js', write: WriteOutput): Promise<boolean> {
        signal.throwIfAborted()
        let program = source
        if (kind === 'ts' && nativeCodeLanguage(originalLanguage) === 'ts' && source === authored) {
          if (error) throw new Error(error)
          program = compiled
        }
        else if (kind === 'ts' && canCompile) {
          const response = await fetch('./__presentation/compile', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: program,
            signal,
          })
          program = await response.text()
          if (!response.ok) throw new Error(program)
        }
        else if (kind === 'ts') throw new Error('Use Edit as JavaScript to run edits in the static deck.')
        if (program.length > 64_000) throw new Error('Code sample is too large')
        return execute(program, write, signal)
      }
      try {
        const source = editor.value
        const currentLanguage = language
        const custom = await customRunner(currentLanguage)
        signal.throwIfAborted()
        if (custom) {
          const result = await custom(source, runnerOptions, signal, async (source, kind) => {
            const lines: CodeRunnerOutput[] = []
            await runNative(source, kind, (text, error) => { lines.push(error ? { error: text } : { text }) })
            return lines
          })
          if (!signal.aborted) await showRunnerOutput(output, result, signal)
        }
        else {
          const native = nativeCodeLanguage(currentLanguage)
          if (!native) throw new Error(`Runner for language "${currentLanguage}" not found.`)
          const success = await runNative(source, native, append)
          if (success && !output.textContent) append('Finished without console output.')
        }
      }
      catch (cause) {
        if (!signal.aborted) append(cause instanceof Error ? cause.message : 'Could not run the example')
      }
      finally {
        signal.removeEventListener('abort', abort)
        complete()
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
