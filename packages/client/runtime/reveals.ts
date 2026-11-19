import type { ClickPosition, ClickSpan } from './clicks.ts'
import { clickSequence, clickSpan, isActive, parseClickPosition } from './clicks.ts'
import type { CodeReveal } from './code-player.ts'
import { codeReveal, showCode } from './code-player.ts'
import type { EquationReveal } from './equation-steps.ts'
import { equationReveal, showEquation } from './equation-steps.ts'

type RevealElement = HTMLElement | SVGElement

interface ElementReveal {
  element: RevealElement
  span: ClickSpan
  hide: boolean
  inert: boolean
}

interface SwitchSlot {
  element: HTMLElement
  start: number
  end: number
}

interface SwitchReveal {
  slots: SwitchSlot[]
  span: ClickSpan
}

type Reveal = ElementReveal | EquationReveal | CodeReveal | SwitchReveal
export interface SlideReveals { reveals: Reveal[], total: number }

interface Directive {
  raw: string | null
  expression: boolean
  hide: boolean
  fallback: string
  animations: string[]
}

function animationNames(raw: unknown): string[] {
  const parts = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,]+/) : []
  return parts.filter((value): value is string => typeof value === 'string' && /^[a-z][\w-]*$/i.test(value))
}

function flag(element: RevealElement, name: string): boolean {
  return element.hasAttribute(name) && element.getAttribute(name) !== 'false'
}

function property(element: RevealElement, name: string): Pick<Directive, 'raw' | 'expression'> {
  const binding = `:${name}`
  return element.hasAttribute(binding)
    ? { raw: element.getAttribute(binding), expression: true }
    : { raw: element.getAttribute(name), expression: false }
}

function directive(element: RevealElement): Directive | undefined {
  const attribute = element.getAttributeNames().find(name => /^v-(?:click(?:-hide)?|after)(?:\.|$)/.test(name))
  const component = /^(?:v-click(?:-hide)?|v-after)$/.exec(element.localName)?.[0]
  if (!attribute && !component && !element.hasAttribute('data-click')) return
  const [name, ...modifiers] = attribute?.split('.') ?? []
  const hide = component === 'v-click-hide' || name === 'v-click-hide' || modifiers.includes('hide')
    || flag(element, 'hide')
  const after = component === 'v-after' || name === 'v-after'
  const fallback = after ? '+0' : '+1'
  const position = element.hasAttribute('data-click')
    ? { raw: element.getAttribute('data-click'), expression: false }
    : attribute && !after ? { raw: element.getAttribute(attribute), expression: true } : property(element, 'at')
  const animations = [...modifiers.filter(name => name !== 'hide'), ...animationNames(element.getAttribute('animation'))]
  if (flag(element, 'fade')) animations.push('fade')
  return { ...position, hide, fallback, animations }
}

interface GroupDirective { position: ClickPosition, hide: boolean, animations: string[] }

function positive(raw: string | null, fallback: number): number {
  if (!raw || !/^\d+$/.test(raw)) return fallback
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

function listItems(root: Element, depth: number): HTMLElement[] {
  const items: HTMLElement[] = []
  for (const item of root.children) {
    if (!(item instanceof HTMLElement) || item.localName !== 'li') continue
    items.push(item)
    if (depth > 1) {
      for (const child of item.children) {
        if (child.matches('ol, ul')) items.push(...listItems(child, depth - 1))
      }
    }
  }
  return items
}

function registerGroup(group: HTMLElement, entries: Map<HTMLElement, GroupDirective>): void {
  const { raw, expression } = property(group, 'at')
  const at = parseClickPosition(raw, '+1', expression)
  if (!at) return
  const children = [...group.children].filter((child): child is HTMLElement => child instanceof HTMLElement)
  const only = children.length === 1 && children[0]
  const depth = positive(group.getAttribute('depth') ?? group.getAttribute(':depth'), 1)
  const every = positive(group.getAttribute('every') ?? group.getAttribute(':every'), 1)
  const special = group.getAttribute('handle-special-elements') !== 'false' && group.getAttribute(':handle-special-elements') !== 'false'
  const targets = special && only && only.matches('ol, ul') ? listItems(only, depth)
    : special && only && only.matches('table') ? [...only.querySelectorAll<HTMLElement>(':scope > tbody > tr')] : children
  const animations = animationNames(group.getAttribute('animation'))
  if (flag(group, 'fade')) animations.push('fade')
  let previous = 0
  targets.forEach((element, index) => {
    const value = at.value + Math.floor(index / every)
    entries.set(element, { position: { value: at.relative ? value - previous : value, relative: at.relative },
      hide: flag(group, 'hide'), animations })
    previous = value
  })
}

interface PendingSlot {
  template: HTMLTemplateElement
  start: number
  explicitEnd?: number
}

const switchSlots = new WeakMap<HTMLElement, SwitchSlot[]>()
const originalInert = new WeakMap<HTMLElement, boolean>()

function prepareSwitch(element: HTMLElement, offset: number): SwitchReveal | undefined {
  const { raw, expression } = property(element, 'at')
  const at = parseClickPosition(raw, '+1', expression)
  if (!at) return
  const mounted = switchSlots.get(element)
  if (mounted) return { slots: mounted, span: clickSequence(at, offset, Math.max(...mounted.map(slot => slot.end)) - 1) }
  const pending: PendingSlot[] = []
  for (const child of element.children) {
    if (!(child instanceof HTMLTemplateElement)) continue
    const key = child.getAttributeNames().find(name => /^#\d+(?:-\d+)?$/.test(name))?.slice(1)
      ?? child.getAttributeNames().find(name => /^v-slot:\d+(?:-\d+)?$/.test(name))?.slice('v-slot:'.length)
    if (!key) continue
    const [start, end] = key.split('-').map(Number)
    if (!Number.isSafeInteger(start) || start < 0 || (end !== undefined && (!Number.isSafeInteger(end) || end <= start))) continue
    pending.push({ template: child, start, explicitEnd: end })
  }
  pending.sort((a, b) => a.start - b.start)
  if (!pending.length) return
  const slots = pending.map(({ template, start, explicitEnd }, index) => {
    const end = explicitEnd ?? pending[index + 1]?.start ?? start + 1
    const wrapper = document.createElement('div')
    wrapper.classList.add('slidev-vclick-target')
    wrapper.dataset.slidevClicksStart = String(start)
    wrapper.dataset.slidevClicksEnd = String(end)
    wrapper.append(template.content)
    template.replaceWith(wrapper)
    return { element: wrapper, start, end }
  })
  switchSlots.set(element, slots)
  return { slots, span: clickSequence(at, offset, Math.max(...slots.map(slot => slot.end)) - 1) }
}

export function collectReveals(article: HTMLElement, preset: unknown, mountSlots?: (container: HTMLElement) => void): SlideReveals {
  const reveals: Reveal[] = []
  let offset = 0
  let total = 0
  const defaults = animationNames(preset)
  const groups = new Map<HTMLElement, GroupDirective>()

  function register(item: Reveal, span: Pick<ClickSpan, 'step' | 'advance'>): void {
    reveals.push(item)
    offset += span.advance
    total = Math.max(total, span.step)
  }

  // Switch templates are inflated in place. Visit their contents after registering the switch.
  function visit(element: Element): void {
    if (element instanceof HTMLTemplateElement) return
    if (element instanceof HTMLElement || element instanceof SVGElement) {
      if (element instanceof HTMLElement && element.hasAttribute('data-code-block')) {
        const reveal = codeReveal(element, offset)
        register(reveal, reveal)
      }
      else if (element instanceof HTMLElement && element.hasAttribute('data-equation-steps')) {
        const reveal = equationReveal(element, offset)
        register(reveal, reveal)
      }
      else if (element.localName === 'v-click-gap') {
        const raw = element.getAttribute('size') ?? element.getAttribute(':size') ?? '1'
        const size = Number(raw)
        const delta = raw.trim() && Number.isSafeInteger(size) ? size : 1
        total = Math.max(total, offset + delta - 1)
        offset += delta
      }
      else {
        const group = element instanceof HTMLElement ? groups.get(element) : undefined
        const data = directive(element)
        const span = data ? clickSpan(data.raw, offset, data.fallback, data.expression)
          : group ? clickSequence(group.position, offset) : undefined
        if (span) {
          const info = data ?? group!
          const animations = info.animations.length ? animationNames(info.animations) : defaults
          element.classList.add('slidev-vclick-target', ...animations.map(name => `slidev-vclick-anim-${name}`))
          element.dataset.slidevClicksStart = String(span.start)
          if (Number.isFinite(span.end)) element.dataset.slidevClicksEnd = String(span.end)
          if (element instanceof HTMLElement && !originalInert.has(element)) originalInert.set(element, element.inert)
          register({ element, span, hide: info.hide, inert: element instanceof HTMLElement && originalInert.get(element) === true }, span)
        }
        if (element instanceof HTMLElement && element.localName === 'v-clicks') registerGroup(element, groups)
        if (element instanceof HTMLElement && element.localName === 'v-switch') {
          const reveal = prepareSwitch(element, offset)
          if (reveal) {
            register(reveal, reveal.span)
            for (const slot of reveal.slots) mountSlots?.(slot.element)
          }
        }
      }
    }
    if (element instanceof HTMLElement && element.hasAttribute('data-code-group')) {
      const before = offset
      let end = before
      for (const panel of element.querySelectorAll(':scope > .code-group-panel')) {
        offset = before
        visit(panel)
        end = Math.max(end, offset)
      }
      offset = end
      return
    }
    for (const child of element.children) visit(child)
  }

  for (const child of article.children) visit(child)
  return { reveals, total }
}

function updateClasses(element: RevealElement, hidden: boolean, current: boolean, prior: boolean): void {
  element.classList.toggle('slidev-vclick-hidden', hidden)
  element.classList.toggle('slidev-vclick-current', current)
  element.classList.toggle('slidev-vclick-prior', prior)
}

export function showReveals(slide: SlideReveals, click: number, animate: boolean, scale: number): void {
  for (const reveal of slide.reveals) {
    if ('frames' in reveal) showCode(reveal, click, animate, scale)
    else if ('lines' in reveal) showEquation(reveal, click)
    else if ('slots' in reveal) {
      const offset = click - reveal.span.start + 1
      for (const slot of reveal.slots) {
        const hidden = !isActive(slot, offset)
        slot.element.toggleAttribute('data-switch-hidden', hidden)
        slot.element.classList.toggle('slidev-vclick-display-none', hidden)
        updateClasses(slot.element, hidden, offset === slot.start, offset >= slot.end)
      }
    }
    else {
      const active = isActive(reveal.span, click)
      const hidden = reveal.hide ? active : !active
      const current = click === reveal.span.start
      reveal.element.toggleAttribute('data-reveal-hidden', hidden)
      reveal.element.classList.toggle('slidev-vclick-hidden-explicitly', hidden && reveal.hide)
      if (reveal.element instanceof HTMLElement) reveal.element.inert = hidden || reveal.inert
      updateClasses(reveal.element, hidden, current, active && !current)
    }
  }
}

export function prepareSwitchPrint(slide: SlideReveals, click: number): void {
  for (const reveal of slide.reveals) {
    if (!('slots' in reveal)) continue
    const offset = click - reveal.span.start + 1
    for (const slot of reveal.slots) slot.element.toggleAttribute('data-switch-print-hidden', !isActive(slot, offset))
  }
}
