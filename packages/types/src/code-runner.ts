export interface CodeRunnerContext {
  /**
   * Options passed to runner via the `runnerOptions` prop.
   */
  options: Record<string, unknown>
  /**
   * Highlight code with the browser syntax highlighter. Unsupported languages return escaped text.
   */
  highlight: (code: string, lang: string, options?: { theme?: string }) => string
  /**
   * Use (other) code runner to run code.
   */
  run: (code: string, lang: string) => Promise<CodeRunnerOutputs>
  signal: AbortSignal
}

export interface CodeRunnerOutputHtml {
  /**
   * The HTML to be rendered.
   *
   * Slidev does NOT sanitize the HTML for you - make sure it's from trusted sources or sanitize it before passing it in
   */
  html: string
}

export interface CodeRunnerOutputDom {
  /**
   * The DOM element to be rendered.
   */
  element: HTMLElement
}

export interface CodeRunnerOutputError {
  /**
   * The error message to be displayed.
   */
  error: string
}

export interface CodeRunnerOutputText {
  /**
   * The text to be displayed.
   */
  text: string
  /**
   * The class to be applied to the text.
   */
  class?: string
  /**
   * The language to be highlighted.
   */
  highlightLang?: string
}

export type CodeRunnerOutputTextArray = CodeRunnerOutputText[]

export type CodeRunnerOutput = CodeRunnerOutputHtml | CodeRunnerOutputError | CodeRunnerOutputText | CodeRunnerOutputTextArray | CodeRunnerOutputDom

type OutputValue = CodeRunnerOutput | CodeRunnerOutput[]
export type CodeRunnerOutputs = OutputValue | (() => OutputValue) | { readonly value: OutputValue }

export type CodeRunner = (code: string, ctx: CodeRunnerContext) => CodeRunnerOutputs | Promise<CodeRunnerOutputs>

export type CodeRunnerProviders = Record<string, CodeRunner>
export type CodeRunnersSetup = (runners: CodeRunnerProviders) => CodeRunnerProviders | void | Promise<CodeRunnerProviders | void>

export function defineCodeRunnersSetup(setup: CodeRunnersSetup): CodeRunnersSetup {
  return setup
}

export function nativeCodeLanguage(language: string): 'js' | 'ts' | undefined {
  if (language === 'ts' || language === 'typescript') return 'ts'
  if (language === 'js' || language === 'javascript') return 'js'
}
