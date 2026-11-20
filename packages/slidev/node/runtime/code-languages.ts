import type { Grammar, GrammarPattern } from 'ts-syntax-highlighter'
import { catalog, resolveGrammar } from 'ts-syntax-highlighter/browser'

export interface CodeHighlightGrammarPattern extends Omit<GrammarPattern, 'patterns'> {
  patterns?: readonly CodeHighlightGrammarPattern[]
  repository?: Readonly<Record<string, CodeHighlightGrammarPattern>>
}

export interface CodeHighlightGrammar extends Omit<Grammar, 'patterns' | 'repository'> {
  aliases?: readonly string[]
  patterns: readonly CodeHighlightGrammarPattern[]
  repository?: Readonly<Record<string, CodeHighlightGrammarPattern>>
}

export type CodeHighlightLanguageInput = string | CodeHighlightGrammar
  | readonly CodeHighlightLanguageInput[] | { default: CodeHighlightLanguageInput }
export type CodeHighlightLanguageEntry = CodeHighlightLanguageInput | Promise<CodeHighlightLanguageInput>
  | (() => CodeHighlightLanguageInput | Promise<CodeHighlightLanguageInput>)
export type CodeHighlightLanguages = readonly CodeHighlightLanguageInput[] | Readonly<Record<string, CodeHighlightLanguageEntry>>

const builtinAliases: Readonly<Record<string, string>> = { 'c#': 'csharp', 'c++': 'cpp', 'f#': 'fsharp' }
const languageKey = (name: string) => name.trim().toLowerCase()

function grammarInput(value: unknown): value is CodeHighlightGrammar {
  return !!value && typeof value === 'object' && 'name' in value && typeof value.name === 'string'
    && 'scopeName' in value && typeof value.scopeName === 'string' && !!value.scopeName
    && 'patterns' in value && Array.isArray(value.patterns)
}

function languageInputs(value: unknown, name: string): (string | CodeHighlightGrammar)[] {
  if (typeof value === 'string' || grammarInput(value)) return [value]
  if (Array.isArray(value)) return value.flatMap(entry => languageInputs(entry, name))
  if (value && typeof value === 'object' && 'default' in value) return languageInputs(value.default, name)
  throw new Error(`Invalid code grammar for "${name}". Expected a language name or a TextMate grammar.`)
}

function externalIncludes(patterns: readonly CodeHighlightGrammarPattern[], scopes: Set<string>): void {
  for (const pattern of patterns) {
    const include = pattern.include
    if (include && !/^[#$]/.test(include)) scopes.add(include.split('#', 1)[0])
    if (pattern.patterns) externalIncludes(pattern.patterns, scopes)
    if (pattern.repository) externalIncludes(Object.values(pattern.repository), scopes)
  }
}

// The tokenizer resolves #repository rules natively. Give each imported scope
// its own repository names so that TextMate cross-scope includes stay local.
async function compileGrammar(
  root: CodeHighlightGrammar,
  loadScope: (scope: string) => Promise<CodeHighlightGrammar | undefined>,
): Promise<Grammar> {
  const scopes = new Map([[root.scopeName, '0']])
  const grammars = [root]
  for (const grammar of grammars) {
    const referenced = new Set<string>()
    externalIncludes(grammar.patterns, referenced)
    externalIncludes(Object.values(grammar.repository ?? {}), referenced)
    for (const scope of referenced) {
      if (scopes.has(scope)) continue
      const included = await loadScope(scope)
      if (!included) continue
      const existing = scopes.get(included.scopeName)
      const id = existing ?? String(grammars.length)
      scopes.set(scope, id)
      scopes.set(included.scopeName, id)
      if (existing === undefined) grammars.push(included)
    }
  }

  const key = (id: string, rule?: string) => rule === undefined ? `${id}:root` : `${id}:rule:${rule}`
  const repository: NonNullable<Grammar['repository']> = Object.create(null)
  let localScope = 0
  function normalize(patterns: readonly CodeHighlightGrammarPattern[], id: string, parent?: ReadonlyMap<string, string>): GrammarPattern[] {
    return patterns.flatMap(pattern => {
      let scoped = parent
      if (pattern.repository) {
        const local = new Map(parent)
        const register = Object.entries(pattern.repository)
        const label = `${id}:local:${localScope++}`
        for (const [rule] of register) local.set(rule, key(label, rule))
        for (const [rule, definition] of register)
          repository[local.get(rule)!] = { patterns: normalize([definition], id, local) }
        scoped = local
      }
      if (pattern.include) {
        const include = pattern.include
        let target: string | undefined
        if (include === '$self') target = key(id)
        else if (include === '$base') target = key('0')
        else if (include.startsWith('#')) {
          const rule = include.slice(1)
          target = scoped?.get(rule) ?? key(id, rule)
        }
        else {
          const [scope, rule] = include.split('#', 2)
          const targetScope = scopes.get(scope)
          if (targetScope !== undefined) target = key(targetScope, rule)
        }
        return target ? [{ include: `#${target}` }] : []
      }
      const children = pattern.patterns ? normalize(pattern.patterns, id, scoped) : undefined
      if (!pattern.match && !pattern.begin && children) return children
      return [{ ...pattern, patterns: children }]
    })
  }
  for (const [index, grammar] of grammars.entries()) {
    const id = String(index)
    const patterns = normalize(grammar.patterns, id)
    // Included grammars can carry optimized keywords separately from their
    // TextMate patterns. Feed those keywords to the host as matching rules.
    const keywords = new Map<string, string[]>()
    for (const [word, scope] of Object.entries(grammar.keywords ?? {})) {
      if (!/^[a-zA-Z_][\w]*$/.test(word)) continue
      const words = keywords.get(scope) ?? []
      words.push(word)
      keywords.set(scope, words)
    }
    for (const [scope, words] of keywords) patterns.push({ match: `\\b(${words.join('|')})\\b`, name: scope })
    repository[key(id)] = { patterns }
    for (const [rule, pattern] of Object.entries(grammar.repository ?? {}))
      repository[key(id, rule)] = { patterns: normalize([pattern], id) }
  }
  const visited = new Set<string>()
  const walking = new Set<string>()
  function checkIncludes(name: string): void {
    if (walking.has(name)) throw new Error(`Code grammar "${root.name}" has a recursive include without a matching rule.`)
    if (visited.has(name)) return
    walking.add(name)
    for (const pattern of repository[name]?.patterns ?? []) {
      // A begin/end rule may recurse after consuming its opening delimiter.
      if (pattern.include) checkIncludes(pattern.include.slice(1))
    }
    walking.delete(name)
    visited.add(name)
  }
  for (const name of Object.keys(repository)) checkIncludes(name)
  return { ...root, fastPaths: root.fastPaths ?? false, patterns: repository[key('0')].patterns!, repository }
}

const bundledScopes = new Map(catalog.map(language => [language.scopeName, language.id]))

/** Keep custom language names, resolution and caches local to one compiled deck. */
export function createCodeLanguageResolver(sources: readonly CodeHighlightLanguages[] = []): (language: string) => Promise<Grammar | undefined> {
  const entries = new Map<string, CodeHighlightLanguageEntry>()
  const scopes = new Map<string, CodeHighlightGrammar>()
  const inputs = new Map<CodeHighlightLanguageEntry, Promise<(string | CodeHighlightGrammar)[]>>()
  const compiled = new Map<CodeHighlightGrammar, Promise<Grammar>>()
  const resolved = new Map<string, Promise<Grammar | undefined>>()

  function register(grammar: CodeHighlightGrammar): void {
    scopes.set(grammar.scopeName, grammar)
    for (const name of [grammar.name, ...(grammar.aliases ?? [])]) {
      const id = languageKey(name)
      if (id) entries.set(id, grammar)
    }
  }
  for (const source of sources) {
    if (Array.isArray(source)) {
      for (const value of languageInputs(source, 'langs')) {
        if (typeof value !== 'string') register(value)
      }
    }
    else {
      if (!source || typeof source !== 'object') throw new Error('Code highlighter langs must be an array or a language map')
      for (const [key, entry] of Object.entries(source)) {
        if (typeof entry !== 'function' && typeof entry !== 'string' && !(entry instanceof Promise)) {
          for (const value of languageInputs(entry, key)) {
            if (typeof value !== 'string') register(value)
          }
        }
        entries.set(languageKey(key), entry)
      }
    }
  }

  async function load(entry: CodeHighlightLanguageEntry, name: string): Promise<(string | CodeHighlightGrammar)[]> {
    let pending = inputs.get(entry)
    if (!pending) {
      pending = Promise.resolve().then(async () => {
        const value = typeof entry === 'function' ? await entry() : await entry
        const group = languageInputs(value, name)
        for (const grammar of group) {
          if (typeof grammar !== 'string' && !scopes.has(grammar.scopeName)) scopes.set(grammar.scopeName, grammar)
        }
        return group
      })
      inputs.set(entry, pending)
    }
    return pending
  }

  async function scopeGrammar(scope: string): Promise<CodeHighlightGrammar | undefined> {
    const known = scopes.get(scope)
    if (known) return known
    const key = languageKey(scope)
    const named = entries.get(key) ?? entries.get(key.replace(/^source\./, ''))
    if (named !== undefined) {
      const inputs = await load(named, scope)
      const grammar = inputs.find(entry => typeof entry !== 'string' && entry.scopeName === scope)
      if (typeof grammar === 'object') return grammar
    }
    const builtin = bundledScopes.get(scope)
    if (builtin) return resolveGrammar(builtin)
  }

  async function resolve(language: string, seen = new Set<string>()): Promise<Grammar | undefined> {
    if (seen.has(language)) throw new Error(`Recursive code language alias "${language}".`)
    seen.add(language)
    const entry = entries.get(language)
    if (entry === undefined) return resolveGrammar(builtinAliases[language] ?? language)
    const group = await load(entry, language)
    const value = group.find(entry => typeof entry !== 'string'
      && [entry.name, ...entry.aliases ?? []].some(name => languageKey(name) === language)) ?? group[0]
    if (typeof value === 'string') {
      const target = languageKey(value)
      return target === language ? resolveGrammar(builtinAliases[language] ?? language) : resolve(target, seen)
    }
    if (!value) return
    let pending = compiled.get(value)
    if (!pending) {
      pending = compileGrammar(value, scopeGrammar)
      compiled.set(value, pending)
    }
    return pending
  }
  return (name) => {
    const id = languageKey(name)
    let pending = resolved.get(id)
    if (!pending) {
      pending = resolve(id)
      resolved.set(id, pending)
    }
    return pending
  }
}
