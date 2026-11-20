import type { TranspilerOptions } from 'bun'
import type { LiveDiagnostic } from '../../../types/src/live-diagnostic.ts'

// Bun supports disabling macros through this option, but its types only describe macro maps.
const noMacros = false as unknown as NonNullable<TranspilerOptions['macro']>
const transpilers = {
  js: new Bun.Transpiler({ loader: 'js', target: 'browser', macro: noMacros }),
  ts: new Bun.Transpiler({ loader: 'ts', target: 'browser', macro: noMacros }),
}

export const maxCodeLength = 32_000
export const maxModuleLength = 256_000

export type LiveLanguage = 'js' | 'ts'
export interface LiveProgram {
  code: string
  module?: true
}
export type CompileLiveCode = (source: string, language: LiveLanguage) => Promise<LiveProgram>

export function checkLiveCode(source: string, language: LiveLanguage): LiveDiagnostic[] {
  if (source.length > maxCodeLength) return [{ message: 'Code sample is too large' }]
  try {
    transpilers[language].scan(source)
    return []
  }
  catch (error) {
    const errors = error instanceof AggregateError ? error.errors : [error]
    // Bun's parser reports byte offsets, while textarea selection uses UTF-16.
    const bytes = new TextEncoder().encode(source)
    const decoder = new TextDecoder('utf-8', { ignoreBOM: true })
    return errors.slice(0, 10).map((error) => {
      const message = error instanceof Error ? error.message : 'Invalid code'
      if (!(error instanceof BuildMessage) || !error.position) return { message }
      const { offset, length } = error.position
      const start = decoder.decode(bytes.subarray(0, offset)).length
      const end = start + decoder.decode(bytes.subarray(offset, offset + length)).length
      return { message, range: { start, end } }
    })
  }
}

export async function compileLiveCode(
  source: string,
  language: LiveLanguage,
  bundle?: (imports: readonly string[]) => Promise<LiveProgram>,
): Promise<LiveProgram> {
  if (source.length > maxCodeLength) throw new Error('Code sample is too large')
  const transpiler = transpilers[language]
  const scan = transpiler.scan(source)
  if (scan.imports.length || scan.exports.length) {
    if (!bundle) throw new Error('Module examples require a deck source file.')
    return bundle(scan.imports.map(entry => entry.path))
  }
  return { code: transpiler.transformSync(source) }
}
