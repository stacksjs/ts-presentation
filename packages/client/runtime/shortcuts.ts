import type { ShortcutOptions, ShortcutsSetup } from '../../types/src/shortcuts.ts'

declare global {
  interface Window {
    presentationShortcutSetups?: ShortcutsSetup[]
  }
}

const keyAliases: Readonly<Record<string, string>> = {
  ' ': 'space',
  'spacebar': 'space',
  'left': 'arrowleft',
  'right': 'arrowright',
  'up': 'arrowup',
  'down': 'arrowdown',
  'esc': 'escape',
  'return': 'enter',
  'ctrl': 'control',
  'cmd': 'meta',
  'option': 'alt',
}

function normalizeKey(key: string): string {
  const lower = key.toLowerCase()
  return Object.hasOwn(keyAliases, lower) ? keyAliases[lower] : lower
}

function binding(keys: string): string {
  if (keys.length === 1) return normalizeKey(keys)
  const parts = keys.split(/[+_]/).map(key => normalizeKey(key.trim()))
  return parts.sort().join('+')
}

function eventBinding(event: KeyboardEvent, key: string): string {
  const parts = [normalizeKey(key)]
  if (event.altKey) parts.push('alt')
  if (event.ctrlKey) parts.push('control')
  if (event.metaKey) parts.push('meta')
  if (event.shiftKey) parts.push('shift')
  return [...new Set(parts)].sort().join('+')
}

export function registerShortcuts(shortcuts: ShortcutOptions[], available: () => boolean): void {
  const bindings = new Map<string, ShortcutOptions>()
  for (const shortcut of shortcuts) {
    for (const key of typeof shortcut.key === 'string' ? [shortcut.key] : shortcut.key)
      bindings.set(binding(key), shortcut)
  }
  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.isComposing || !available()) return
    const target = event.composedPath()[0]
    if (target instanceof Element) {
      if (target.closest('input, select, textarea, [contenteditable]')) return
      if ((event.key === ' ' || event.key === 'Enter') && target.closest('button, a, summary, [role=button]')) return
    }
    let shortcut = bindings.get(eventBinding(event, event.key))
    if (!shortcut && (event.altKey || event.ctrlKey || event.metaKey)) {
      // Option and other modifiers can change the character reported by event.key.
      const physicalKey = /^(?:Key|Digit)([A-Z0-9])$/.exec(event.code)?.[1]
      if (physicalKey) shortcut = bindings.get(eventBinding(event, physicalKey))
    }
    if (!shortcut?.fn) return
    if (event.repeat && !shortcut.autoRepeat) {
      event.preventDefault()
      return
    }
    if (shortcut.fn(event) !== false) event.preventDefault()
  })
}
