export interface PresentationRoute {
  /** A static path relative to the deck's deployment base. */
  path: string
  /** A file URL for an STX page, typically constructed from import.meta.url. */
  component: URL
  title?: string
}

export type RoutesSetup = (routes: PresentationRoute[]) => readonly PresentationRoute[] | void | Promise<readonly PresentationRoute[] | void>

export function defineRoutesSetup(setup: RoutesSetup): RoutesSetup { return setup }
