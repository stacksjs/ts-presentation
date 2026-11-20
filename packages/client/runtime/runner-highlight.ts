import { getTheme, loadedGrammar, Renderer, resolveGrammars, Tokenizer } from 'ts-syntax-highlighter/browser'
import type { CodeRunnerContext } from '../../types/src/code-runner.ts'
import { escapeHtml } from '../../slidev/node/runtime/html.ts'

export async function prepareHighlight(languages: string[]): Promise<void> {
  await resolveGrammars(languages)
}

export const highlight: CodeRunnerContext['highlight'] = (code, language, options) => {
  const grammar = loadedGrammar(language)
  const theme = getTheme(options?.theme ?? 'github-dark') ?? getTheme('github-dark')
  if (!grammar || !theme) return `<pre><code>${escapeHtml(code)}</code></pre>`
  return new Renderer(theme).render(new Tokenizer(grammar).tokenize(code)).html
}
