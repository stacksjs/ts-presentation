import { join } from 'node:path'
import { importDeckModule } from './deck-modules.ts'
import type { ObserveDeckFile } from './deck-modules.ts'
import type { MathMacros } from './math.ts'
import type { CodeHighlightTransformer } from './highlight-transformers.ts'
import type { CodeblockTransformer, MarkdownTransformer, TransformersSetupReturn } from '../../../types/src/transform.ts'

// Setup names and helper signatures follow Slidev's packages/types/src/setups (MIT).
export type KatexTrustContext =
  | { command: '\\href' | '\\url' | '\\includegraphics', url: string, protocol: string }
  | { command: '\\htmlClass', class: string }
  | { command: '\\htmlId', id: string }
  | { command: '\\htmlStyle', style: string }
  | { command: '\\htmlData', attributes: Readonly<Record<string, string>> }

export type KatexStrictMode = boolean | 'ignore' | 'warn' | 'error'
export interface KatexStrictToken { text: string }

export interface KatexOptions {
  macros?: MathMacros
  errorColor?: string
  throwOnError?: boolean
  leqno?: boolean
  fleqn?: boolean
  globalGroup?: boolean
  maxExpand?: number
  maxSize?: number
  minRuleThickness?: number
  colorIsTextColor?: boolean
  strict?: KatexStrictMode | ((code: string, message: string, token?: KatexStrictToken) => KatexStrictMode | undefined)
  trust?: boolean | ((context: KatexTrustContext) => boolean)
}

export type MermaidOptions = Readonly<Record<string, unknown>>
export type MermaidRenderer = (code: string, options: MermaidOptions) => string | Promise<string>
export type KatexSetup = () => KatexOptions | void | Promise<KatexOptions | void>
export type MermaidSetup = () => MermaidOptions | void | Promise<MermaidOptions | void>
export type MermaidRendererSetup = () => MermaidRenderer | void | Promise<MermaidRenderer | void>

export interface CodeHighlightOptions {
  theme?: string
  transformers?: readonly (CodeHighlightTransformer | false | null | undefined)[]
}

export type CodeHighlightSetup = () => CodeHighlightOptions | void | Promise<CodeHighlightOptions | void>

export interface AuthoringSetup {
  codeHighlight?: CodeHighlightOptions
  katex?: KatexOptions
  mermaid?: MermaidOptions
  diagramRenderer?: MermaidRenderer
  transformers?: { markdown: readonly MarkdownTransformer[], codeblocks: readonly CodeblockTransformer[] }
}

export function defineCodeHighlightSetup(setup: CodeHighlightSetup): CodeHighlightSetup { return setup }
export function defineShikiSetup(setup: CodeHighlightSetup): CodeHighlightSetup { return setup }
export function defineKatexSetup(setup: KatexSetup): KatexSetup { return setup }
export function defineMermaidSetup(setup: MermaidSetup): MermaidSetup { return setup }
export function defineMermaidRendererSetup(setup: MermaidRendererSetup): MermaidRendererSetup { return setup }

export async function loadAuthoringSetup(root: string, observe: ObserveDeckFile, optional: (path: string) => Promise<string | undefined>, roots: readonly string[] = []): Promise<AuthoringSetup> {
  async function read<T>(root: string, name: string): Promise<T | undefined> {
    const path = join(root, 'setup', `${name}.ts`)
    if (await optional(path) === undefined) return
    const { default: setup } = await importDeckModule<() => T | void | Promise<T | void>>(path, root, observe)
    if (typeof setup !== 'function') throw new Error(`setup/${name}.ts must export a setup function`)
    return await setup() as T | undefined
  }
  const setup: AuthoringSetup = {}
  const transformers: TransformersSetupReturn[] = []
  for (const directory of [...new Set([...roots.filter(value => value !== root), root])]) {
    const [katex, mermaid, diagramRenderer, shiki, nativeHighlight, transform] = await Promise.all([
      read<KatexOptions>(directory, 'katex'),
      read<MermaidOptions>(directory, 'mermaid'),
      read<MermaidRenderer>(directory, 'mermaid-renderer'),
      read<CodeHighlightOptions>(directory, 'shiki'),
      read<CodeHighlightOptions>(directory, 'code-highlighter'),
      read<TransformersSetupReturn>(directory, 'transformers'),
    ])
    if (diagramRenderer !== undefined && typeof diagramRenderer !== 'function') throw new Error('setup/mermaid-renderer.ts must return a renderer function')
    if (katex) setup.katex = { ...setup.katex, ...katex, macros: { ...setup.katex?.macros, ...katex.macros } }
    if (mermaid) setup.mermaid = { ...setup.mermaid, ...mermaid }
    if (diagramRenderer) setup.diagramRenderer = diagramRenderer
    if (shiki || nativeHighlight) {
      for (const config of [shiki, nativeHighlight]) {
        const hooks = config?.transformers
        if (hooks !== undefined && (!Array.isArray(hooks) || hooks.some(hook => hook && (typeof hook !== 'object' || Array.isArray(hook)))))
          throw new Error('Code highlighter setup must provide an array of transformer objects')
      }
      setup.codeHighlight = { ...setup.codeHighlight, ...shiki, ...nativeHighlight,
        transformers: [...setup.codeHighlight?.transformers ?? [], ...shiki?.transformers ?? [], ...nativeHighlight?.transformers ?? []],
      }
    }
    if (transform) {
      for (const key of ['pre', 'preCodeblock', 'postCodeblock', 'post', 'codeblocks'] as const) {
        const entries = transform[key]
        if (entries !== undefined && (!Array.isArray(entries) || entries.some(entry => entry !== false && typeof entry !== 'function')))
          throw new Error(`setup/transformers.ts must provide an array of hooks for ${key}`)
      }
      transformers.push(transform)
    }
  }
  if (transformers.length) {
    const reverse = [...transformers].reverse()
    const markdown = [
      ...reverse.flatMap(transform => transform.pre ?? []),
      ...reverse.flatMap(transform => transform.preCodeblock ?? []),
      ...transformers.flatMap(transform => transform.postCodeblock ?? []),
      ...transformers.flatMap(transform => transform.post ?? []),
    ].filter((hook): hook is MarkdownTransformer => hook !== false)
    const codeblocks = transformers.flatMap(transform => transform.codeblocks ?? []).filter((hook): hook is CodeblockTransformer => hook !== false)
    setup.transformers = { markdown, codeblocks }
  }
  return setup
}
