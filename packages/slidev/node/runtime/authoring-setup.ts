import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { MathMacros } from './math.ts'

// Setup names and helper signatures follow Slidev's packages/types/src/setups (MIT).
export interface KatexOptions {
  macros?: MathMacros
  errorColor?: string
  throwOnError?: boolean
  leqno?: boolean
}

export type MermaidOptions = Readonly<Record<string, unknown>>
export type MermaidRenderer = (code: string, options: MermaidOptions) => string | Promise<string>
export type KatexSetup = () => KatexOptions | void | Promise<KatexOptions | void>
export type MermaidSetup = () => MermaidOptions | void | Promise<MermaidOptions | void>
export type MermaidRendererSetup = () => MermaidRenderer | void | Promise<MermaidRenderer | void>

export interface AuthoringSetup {
  katex?: KatexOptions
  mermaid?: MermaidOptions
  diagramRenderer?: MermaidRenderer
}

export function defineKatexSetup(setup: KatexSetup): KatexSetup { return setup }
export function defineMermaidSetup(setup: MermaidSetup): MermaidSetup { return setup }
export function defineMermaidRendererSetup(setup: MermaidRendererSetup): MermaidRendererSetup { return setup }

export async function loadAuthoringSetup(root: string, observe: (path: string) => Promise<string>): Promise<AuthoringSetup> {
  async function read<T>(name: string): Promise<T | undefined> {
    const path = join(root, 'setup', `${name}.ts`)
    if (!await Bun.file(path).exists()) return
    await observe(path)
    const { default: setup } = await import(pathToFileURL(path).href)
    if (typeof setup !== 'function') throw new Error(`setup/${name}.ts must export a setup function`)
    return await setup() as T | undefined
  }
  const [katex, mermaid, diagramRenderer] = await Promise.all([
    read<KatexOptions>('katex'),
    read<MermaidOptions>('mermaid'),
    read<MermaidRenderer>('mermaid-renderer'),
  ])
  if (diagramRenderer !== undefined && typeof diagramRenderer !== 'function') throw new Error('setup/mermaid-renderer.ts must return a renderer function')
  return { katex, mermaid, diagramRenderer }
}
