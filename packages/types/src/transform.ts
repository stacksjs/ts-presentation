import type { PreparserContext, Slide } from '../../parser/src/deck.ts'

type Awaitable<T> = T | Promise<T>
export type MarkdownReplacement = string | Parameters<String['replace']>[1]

/** Offsets refer to the source at the last commit. The compiler commits between hooks. */
export interface MarkdownEdits {
  readonly original: string
  replace(search: string | RegExp, replacement: MarkdownReplacement): this
  replaceAll(search: string | RegExp, replacement: MarkdownReplacement): this
  update(start: number, end: number, content: string): this
  overwrite(start: number, end: number, content: string): this
  remove(start: number, end: number): this
  append(content: string): this
  prepend(content: string): this
  appendLeft(index: number, content: string): this
  prependLeft(index: number, content: string): this
  appendRight(index: number, content: string): this
  prependRight(index: number, content: string): this
  slice(start?: number, end?: number): string
  hasChanged(): boolean
  isEmpty(): boolean
  length(): number
  commit(): this
  rollback(): this
  toString(): string
}

export interface TransformerSlideSource {
  filepath: string
  index: number
  content: string
}

export interface TransformerSlide extends Omit<Slide, 'frontmatter'> {
  index: number
  frontmatter: Record<string, unknown>
  note: string
  source?: TransformerSlideSource
}

export interface TransformerOptions {
  mode: PreparserContext['mode']
  entry?: string
  userRoot?: string
  config: Record<string, unknown>
  data: { headmatter: Record<string, unknown>, slides: readonly TransformerSlide[] }
}

export interface MarkdownTransformContext {
  s: MarkdownEdits
  slide: TransformerSlide
  options: TransformerOptions
}

export type MarkdownTransformer = (context: MarkdownTransformContext) => Awaitable<void>

export interface CodeblockTransformContext {
  info: string
  code: string
  fence: number
  slide: TransformerSlide | null
  options: TransformerOptions
  renderHighlighted: (override?: { info?: string, code?: string }) => Awaitable<string>
}

export type CodeblockTransformer = (context: CodeblockTransformContext) => Awaitable<string | undefined | null>

export interface TransformersSetupReturn {
  pre?: readonly (MarkdownTransformer | false)[]
  preCodeblock?: readonly (MarkdownTransformer | false)[]
  postCodeblock?: readonly (MarkdownTransformer | false)[]
  post?: readonly (MarkdownTransformer | false)[]
  codeblocks?: readonly (CodeblockTransformer | false)[]
}

export type TransformersSetup = () => Awaitable<TransformersSetupReturn | void>

// The setup names and context follow Slidev's MIT-licensed API.
export function defineMarkdownTransformer(transformer: MarkdownTransformer): MarkdownTransformer { return transformer }
export function defineCodeblockTransformer(transformer: CodeblockTransformer): CodeblockTransformer { return transformer }
export function defineTransformersSetup(setup: TransformersSetup): TransformersSetup { return setup }
