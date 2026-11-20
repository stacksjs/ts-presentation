import type { TranspilerOptions } from 'bun'

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
