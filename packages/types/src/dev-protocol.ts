import type { SlideRoute } from '../../client/runtime/navigation.ts'

export interface EditorSource {
  token: string
  revision: string
  path: string
  source: string
}

export interface LiveSlide {
  revision: string
  html: string
  css: string
  notes: string
  route: SlideRoute
  sourceToken?: string
  sourceRevision?: string
}

export interface LiveDeck {
  revision: string
  frame: string
  title: string
  deckCss: string
  slides: LiveSlide[]
}
