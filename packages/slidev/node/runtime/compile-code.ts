const transpilers = {
  js: new Bun.Transpiler({ loader: 'js', target: 'browser' }),
  ts: new Bun.Transpiler({ loader: 'ts', target: 'browser' }),
}

export const maxCodeLength = 32_000

export function compileLiveCode(source: string, language: 'js' | 'ts'): string {
  if (source.length > maxCodeLength) throw new Error('Code sample is too large')
  const transpiler = transpilers[language]
  const scan = transpiler.scan(source)
  if (scan.imports.length || scan.exports.length) throw new Error('Use a self-contained block without module imports or exports')
  return transpiler.transformSync(source)
}
