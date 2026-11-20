import { Tokenizer } from 'ts-syntax-highlighter/browser'
import type { Grammar } from 'ts-syntax-highlighter'
import { codeTokenMarkup } from './code-tokens.ts'

declare global {
  interface Window {
    presentationHighlightLiveSource?: (source: string, language: string) => string | undefined
  }
}

const grammars = new Map<string, Grammar>(JSON.parse(document.getElementById('presentation-live-grammars')?.textContent ?? '[]'))
const tokenizers = new Map<string, Tokenizer>()

window.presentationHighlightLiveSource = (source, language) => {
  if (source.length > 32_000) return
  const grammar = grammars.get(language)
  if (!grammar) return
  try {
    let tokenizer = tokenizers.get(language)
    if (!tokenizer) {
      tokenizer = new Tokenizer(grammar)
      tokenizers.set(language, tokenizer)
    }
    const lines = tokenizer.tokenize(source)
    if (lines.map(line => line.tokens.map(token => token.content).join('')).join('\n') === source)
      return codeTokenMarkup(lines).join('\n')
  }
  catch {
    // Keep the native text visible if this browser cannot tokenize the draft.
  }
}
