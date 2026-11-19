import type { SlidevConfig } from './config.ts'

export interface FrontmatterDocument {
  contents: unknown
  toJSON: () => unknown
  toString: () => string
}

export type FrontmatterStyle = 'frontmatter' | 'yaml'

export interface SlideInfoBase {
  revision: string
  frontmatter: Record<string, any>
  content: string
  frontmatterRaw?: string
  note?: string
  title?: string
  level?: number
  /**
   * Image URLs extracted from the slide content (frontmatter, Markdown, components, CSS).
   * Populated at parse time to survive build-mode content stripping.
   */
  images?: string[]
}

export interface SourceSlideInfo extends SlideInfoBase {
  /**
   * The filepath of the markdown file
   */
  filepath: string
  /**
   * The index of the slide in the markdown file
   */
  index: number
  /**
   * The range of the slide in the markdown file
   */
  start: number
  contentStart: number
  end: number
  raw: string
  /**
   * Raw content before being processed by preparsers (if any)
   */
  contentRaw: string
  /**
   * Slides imported by this slide.
   */
  imports?: SourceSlideInfo[]
  frontmatterDoc?: FrontmatterDocument
  frontmatterStyle?: FrontmatterStyle
}

export interface SlideInfo extends SlideInfoBase {
  /**
   * The index of the slide in the presentation
   */
  index: number
  /**
   * The importers of this slide. `[]` if this slide is the entry markdown file
   */
  importChain?: SourceSlideInfo[]
  /**
   * The source slide where the content is from
   */
  source: SourceSlideInfo
  noteHTML?: string
}

/**
 * Editable fields for a slide
 */
export type SlidePatch = Partial<Pick<SlideInfoBase, 'content' | 'note' | 'frontmatterRaw'>> & {
  skipHmr?: boolean
  /**
   * The frontmatter patch (only the changed fields)
   * `null` to remove a field
   */
  frontmatter?: Record<string, any>
}

/**
 * Metadata for "slidev" field in themes' package.json
 */
export interface SlidevThemeMeta {
  defaults?: Partial<SlidevConfig>
  colorSchema?: 'dark' | 'light' | 'both'
  highlighter?: 'shiki'
}

export type SlidevThemeConfig = Record<string, string | number>

export interface SlidevDetectedFeatures {
  katex: boolean
  /**
   * `false` or referenced module specifiers
   */
  monaco: false | {
    types: string[]
    deps: string[]
  }
  tweet: boolean
  bluesky: boolean
  mermaid: boolean
}

export interface SlidevMarkdown {
  filepath: string
  raw: string
  /**
   * All slides in this markdown file
   */
  slides: SourceSlideInfo[]
  errors?: { row: number, message: string }[]
}

export interface SlidevData {
  /**
   * Slides that should be rendered (disabled slides excluded)
   */
  slides: SlideInfo[]
  entry: SlidevMarkdown
  config: SlidevConfig
  headmatter: Record<string, unknown>
  features: SlidevDetectedFeatures
  themeMeta?: SlidevThemeMeta
  markdownFiles: Record<string, SlidevMarkdown>
  /**
   * From watched files to indexes of slides that must be reloaded regardless of the loaded content
   */
  watchFiles: Record<string, Set<number>>
}

export interface SlidevPreparserExtension {
  name?: string
  transformRawLines?: (lines: string[]) => Promise<void> | void
  transformSlide?: (content: string, frontmatter: any) => Promise<string | undefined>
  transformNote?: (note: string | undefined, frontmatter: any) => Promise<string | undefined>
}

export type PreparserExtensionLoader = (roots: string[], headmatter: Record<string, unknown>, filepath: string, mode?: string) => Promise<SlidevPreparserExtension[]>

export type RenderContext = 'none' | 'slide' | 'overview' | 'presenter' | 'previewNext'
export type { SlideRoute } from '../../client/runtime/navigation.ts'
