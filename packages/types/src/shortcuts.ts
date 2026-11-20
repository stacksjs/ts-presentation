export interface NavOperations {
  next(): void
  prev(): void
  nextSlide(): void
  prevSlide(): void
  go(slide: number | string, click?: number): void
  goFirst(): void
  goLast(): void
  toggleDark(): void
  toggleOverview(): void
  toggleDrawing(): void
  escapeOverview(): void
  showGotoDialog(): void
}

export interface ShortcutOptions {
  key: string | readonly string[]
  fn?: (event: KeyboardEvent) => void | boolean | Promise<void>
  autoRepeat?: boolean
  name?: string
}

export type ShortcutsSetup = (nav: NavOperations, base: ShortcutOptions[]) => ShortcutOptions[]

export function defineShortcutsSetup(setup: ShortcutsSetup): ShortcutsSetup {
  return setup
}
