import type { PresentationNavigation } from '../../client/runtime/navigation.ts'

export interface ContextMenuAction {
  name?: string
  label: string
  action: () => void | Promise<void>
  disabled?: boolean
  show?: boolean
  icon?: string
  small?: boolean
}

export type ContextMenuItem = ContextMenuAction | 'separator'

export interface ContextMenuContext {
  readonly navigation: PresentationNavigation
  readonly target: Element
  readonly isPresenter: boolean
  readonly isFullscreen: boolean
}

export type ContextMenuSetup = (items: ContextMenuItem[], context: ContextMenuContext) => readonly ContextMenuItem[] | void

export function defineContextMenuSetup(setup: ContextMenuSetup): ContextMenuSetup { return setup }
