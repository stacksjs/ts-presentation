import type { CodeRunnerContext, CodeRunnerOutput, CodeRunnerOutputs, CodeRunnerProviders, CodeRunnersSetup } from '../../types/src/code-runner.ts'

interface BrowserCodeRunners {
  setups: CodeRunnersSetup[]
  highlight: CodeRunnerContext['highlight']
  prepareHighlight: (languages: string[]) => Promise<void>
}

declare global {
  interface Window {
    presentationCodeRunners?: BrowserCodeRunners
  }
}

type NativeRunner = (code: string, language: 'js' | 'ts') => Promise<CodeRunnerOutputs>
interface RunnerContext extends CodeRunnerContext {
  executeNative: NativeRunner
}

const runJavaScript: CodeRunnerProviders[string] = (code, context) => (context as RunnerContext).executeNative(code, 'js')
const runTypeScript: CodeRunnerProviders[string] = (code, context) => (context as RunnerContext).executeNative(code, 'ts')
const builtins: CodeRunnerProviders = Object.assign(Object.create(null), {
  js: runJavaScript,
  javascript: runJavaScript,
  ts: runTypeScript,
  typescript: runTypeScript,
})

let registry: Promise<CodeRunnerProviders> | undefined

async function loadRunners(config: BrowserCodeRunners): Promise<CodeRunnerProviders> {
  const providers: CodeRunnerProviders = Object.assign(Object.create(null), builtins)
  for (const setup of config.setups) Object.assign(providers, await setup(providers))
  return providers
}

export async function customRunner(language: string): Promise<((code: string, options: Record<string, unknown>, signal: AbortSignal, executeNative: NativeRunner) => Promise<CodeRunnerOutputs>) | undefined> {
  const config = window.presentationCodeRunners
  if (!config) return
  const providers = await (registry ??= loadRunners(config))
  if (typeof providers[language] !== 'function' || providers[language] === builtins[language]) return
  const { highlight, prepareHighlight } = config
  return async (source, options, signal, executeNative) => {
    await prepareHighlight([language, 'javascript', 'typescript', 'json'])
    async function run(code: string, lang: string, depth: number): Promise<CodeRunnerOutputs> {
      signal.throwIfAborted()
      if (depth > 16) throw new Error('Code runner calls are nested too deeply')
      if (code.length > 64_000) throw new Error('Code sample is too large')
      const provider = providers[lang]
      if (typeof provider !== 'function') throw new Error(`Runner for language "${lang}" not found.`)
      const context: RunnerContext = {
        options, signal, executeNative,
        highlight,
        async run(code, lang) {
          try { return await run(code, lang, depth + 1) }
          catch (error) {
            signal.throwIfAborted()
            return { error: String(error) }
          }
        },
      }
      return provider(code, context)
    }
    return run(source, language, 0)
  }
}

export async function showRunnerOutput(
  output: HTMLElement,
  result: CodeRunnerOutputs,
  signal: AbortSignal,
): Promise<void> {
  const value = typeof result === 'function' ? result() : 'value' in result ? result.value : result
  const entries: CodeRunnerOutput[] = Array.isArray(value) ? value : [value]
  const config = window.presentationCodeRunners
  const fragment = document.createDocumentFragment()
  let budget = 16_000
  for (const item of entries.flat().slice(0, 400)) {
    if (budget <= 0) break
    if ('element' in item && item.element instanceof HTMLElement) {
      fragment.append(item.element)
      continue
    }
    const line = document.createElement('div')
    if ('html' in item) {
      // Author-owned runner hooks may return trusted HTML.
      line.innerHTML = item.html.slice(0, budget)
      budget -= item.html.length
    }
    else if ('text' in item || 'error' in item) {
      const text = ('text' in item ? item.text : item.error).slice(0, budget)
      budget -= text.length + 1
      if ('text' in item && item.class) line.className = item.class
      if ('text' in item && item.highlightLang && config) {
        await config.prepareHighlight([item.highlightLang])
        line.innerHTML = config.highlight(text, item.highlightLang)
      }
      else line.textContent = text
    }
    fragment.append(line)
  }
  if (!signal.aborted) output.replaceChildren(fragment)
}
