// Adapted from Slidev v53.1.0. See licenses/Slidev-MIT.txt.
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'bun:test'
import type { RawSnapshot } from '../packages/slidev/node/runtime/editable/ir.ts'
import { collectSnapshot } from '../packages/slidev/node/runtime/editable/walker.ts'

/**
 * The walker is serialized by Bun WebView and evaluated in a page where this
 * module's scope does not exist, so a free variable becomes a `ReferenceError`
 * inside someone else's browser. The guard has to run the reconstructed
 * function, not compile it: an undeclared identifier resolves at call time, so
 * `new Function(source)` accepts a body full of them. The sandbox global is a
 * Proxy that throws on any identifier outside a browser allowlist.
 *
 * What the walker extracts is not tested here. jsdom has no layout engine, so
 * `getBoundingClientRect` returns zeros and a DOM test would pass with every
 * rect at the origin. The judgement it feeds lives in `normalize.ts`.
 */

/** Globals a browser really provides. Anything else is a leak. */
const BROWSER_GLOBALS = new Set([
  'document',
  'window',
  'getComputedStyle',
  'Array',
  'Boolean',
  'Error',
  'JSON',
  'Map',
  'Math',
  'Number',
  'Object',
  'RegExp',
  'Set',
  'String',
  'Symbol',
  'undefined',
  'NaN',
  'Infinity',
  'globalThis',
])

function measureTextStub(): { width: number } {
  return { width: 100 }
}

/**
 * A canvas whose text measurement changes only for the families named, which is
 * how `isAvailable` tells a font that exists from one that fell through to the
 * base. Everything else keeps the constant width, so it reads as absent.
 */
function installedFonts(...families: string[]) {
  return function (this: { font: string }): { width: number } {
    return {
      width: families.some(f => this.font.includes(`"${f}"`))
        ? 140
        : 100,
    }
  }
}

const RECT = {
  left: 0,
  top: 0,
  width: 100,
  height: 20,
}

/**
 * A slide container with one element and one text node under it.
 *
 * Not decoration: with an empty container list the guard only ever ran the
 * walker's top-level setup, so every free variable inside `walk` and its
 * helpers went unnoticed. `window` was one of them, referenced for `scrollX`
 * and absent from the allowlist, and the suite passed regardless.
 */
function containerStub() {
  const text = { nodeType: 3, textContent: 'hello' }
  const child: any = {
    nodeType: 1,
    tagName: 'DIV',
    id: '',
    childNodes: [text],
    children: [],
    classList: {
      contains: () => false,
    },
    shadowRoot: null,
    parentElement: null,
    setAttribute: () => {},
    getAttribute: () => null,
    getBoundingClientRect: () => RECT,
    getClientRects: () => [RECT],
  }
  const container: any = {
    nodeType: 1,
    tagName: 'DIV',
    id: '003-02',
    childNodes: [child],
    children: [child],
    classList: {
      contains: () => false,
    },
    shadowRoot: null,
    parentElement: null,
    setAttribute: () => {},
    getAttribute: () => null,
    getBoundingClientRect: () => ({ ...RECT, width: 980, height: 552 }),
    getClientRects: () => [RECT],
  }
  child.parentElement = container
  return container
}

/** Just enough DOM for the walker to run to completion. */
function domStub(querySelectorAllResult: unknown[], measureText = measureTextStub) {
  return {
    createElement: () => ({
      getContext: () => ({
        font: '',
        fillStyle: '',
        measureText,
        clearRect: () => {},
        fillRect: () => {},
        getImageData: () => ({
          data: [0, 0, 0, 0],
        }),
      }),
    }),
    querySelectorAll: () => querySelectorAllResult,
    createRange: () => ({
      selectNodeContents: () => {},
      getClientRects: () => [RECT],
      detach: () => {},
    }),
  }
}

interface SandboxOptions {
  measureText?: () => { width: number }
  fontFamily?: string
}

function runInSandbox(source: string, containers: unknown[] = [], options: SandboxOptions = {}): RawSnapshot {
  const base: Record<string, unknown> = {
    document: domStub(containers, options.measureText),
    getComputedStyle: () => ({
      fontFamily: options.fontFamily ?? 'Inter, sans-serif',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      position: 'static',
      backgroundColor: 'rgb(255, 255, 255)',
      listStyleType: 'none',
      content: 'none',
      width: '100px',
      height: '20px',
      left: 'auto',
      top: 'auto',
      right: 'auto',
      bottom: 'auto',
    }),
    Array,
    Boolean,
    Error,
    JSON,
    Map,
    Math,
    Number,
    Object,
    RegExp,
    Set,
    String,
    Symbol,
    globalThis: undefined,
    window: { scrollX: 0, scrollY: 0 },
  }

  const sandbox = new Proxy(base, {
    // Claim every name so V8 resolves lookups here rather than walking out.
    has: () => true,
    get(target, prop) {
      if (typeof prop === 'symbol')
        return (target as any)[prop]
      if (BROWSER_GLOBALS.has(prop))
        return target[prop]
      throw new ReferenceError(
        `walker referenced "${String(prop)}", which will not exist inside page.evaluate`,
      )
    },
  })

  const context = vm.createContext(sandbox)
  const fn = vm.runInContext(`(${source})`, context)
  return fn({ containerSelector: '.print-slide-container', idAttribute: 'data-presentation-export-id', slide: 3, click: 1 }) as RawSnapshot
}

describe('walker self-containedness', () => {
  it('runs to completion using only browser globals', () => {
    expect(() => runInSandbox(collectSnapshot.toString())).not.toThrow()
  })

  it('runs to completion over a real container, not just an empty page', () => {
    // The empty-page case exercises none of `walk`, which is most of the file.
    const snapshot = runInSandbox(collectSnapshot.toString(), [
      containerStub(),
    ]) as any
    expect(snapshot.slides).toHaveLength(1)
    expect(snapshot.slides[0].nodes.length).toBeGreaterThan(0)
  })

  it('fails when a walked node closes over module scope', () => {
    // The same guard as below, but pinned on a path only a container reaches.
    const leaked = collectSnapshot
      .toString()
      // The record built for every ELEMENT, so it is reached only by walking a
      // container. Matched on its first field because the compiled source has
      // two other `const record` declarations, in the style interners, which a
      // page with no pseudo-elements never runs.
      .replace(/\brecord\s*=\s*\{\s*id,/, 'record = { leaked: LEAKED_FROM_WALK, id,')
    expect(() => runInSandbox(leaked, [
      containerStub(),
    ])).toThrow(/LEAKED_FROM_WALK/)
  })

  it('fails when the walker closes over module scope', () => {
    // The mutation this guard exists to catch, pinned so the guard itself
    // cannot silently stop working.
    const leaked = collectSnapshot
      .toString()
      .replace(/\bstyles\s*=\s*\[\]/, 'styles = [LEAKED_FROM_MODULE_SCOPE]')
    expect(() => runInSandbox(leaked)).toThrow(/LEAKED_FROM_MODULE_SCOPE/)
  })

  it('returns the expected snapshot shape', () => {
    const snapshot = runInSandbox(collectSnapshot.toString()) as any
    expect(snapshot).toHaveProperty('slides')
    expect(snapshot).toHaveProperty('styles')
    expect(snapshot).toHaveProperty('fontResolution')
  })

  it('detects a font the theme ships as a webfont, and names it without the suffix', () => {
    // `@fontsource-variable/inter` registers the family as "Inter Variable",
    // so probing the stripped name first asks whether a static "Inter" is
    // installed. On a machine with no such copy, which is the normal case for
    // a webfont, nothing in the stack matched and every run in the deck was
    // written out as a system fallback instead of the theme's own face.
    const snapshot = runInSandbox(collectSnapshot.toString(), [
      containerStub(),
    ], {
      fontFamily: '"Inter Variable", Inter, sans-serif',
      measureText: installedFonts('Inter Variable'),
    }) as any
    expect(snapshot.fontResolution['"Inter Variable", Inter, sans-serif']).toBe('Inter')
  })

  it('still resolves a family installed under its plain name', () => {
    // The Google Fonts path, which registers "Inter" with no suffix. Every
    // Slidev-themed deck takes it, which is why the bug above stayed invisible
    // until a theme shipped its font through `@fontsource`.
    const snapshot = runInSandbox(collectSnapshot.toString(), [
      containerStub(),
    ], {
      fontFamily: 'Inter, sans-serif',
      measureText: installedFonts('Inter'),
    }) as any
    expect(snapshot.fontResolution['Inter, sans-serif']).toBe('Inter')
  })

  it('reports no family when nothing in the stack resolves', () => {
    const snapshot = runInSandbox(collectSnapshot.toString(), [
      containerStub(),
    ], {
      fontFamily: '"Human Sans", sans-serif',
      measureText: installedFonts('Something Else'),
    }) as any
    expect(snapshot.fontResolution['"Human Sans", sans-serif']).toBe('')
  })

  it('carries no bundler-injected identifiers', () => {
    // tsdown and Vite rewrite bodies with helpers such as `__toESM`,
    // `__publicField` or `__name`, none of which exist in the page.
    expect(collectSnapshot.toString().match(/\b__\w+/g)).toBeNull()
  })

  it('does not reference the module registry', () => {
    const source = collectSnapshot.toString()
    for (const forbidden of [
      'require(',
      'import(',
      'exports.',
      'module.exports',
    ])
      expect(source).not.toContain(forbidden)
  })
})

// Build the packaged walker with Bun and inspect the function actually
// delivered to WebView. Bundler-generated closures would break it as well.
let bundledWalker: string
beforeAll(async () => {
  const built = await Bun.build({
    entrypoints: [fileURLToPath(new URL('../packages/slidev/node/runtime/editable/walker.ts', import.meta.url))],
    target: 'bun',
    format: 'esm',
  })
  if (!built.success || !built.outputs[0]) throw new Error('Could not bundle the browser walker')
  const module = await import(`data:text/javascript;base64,${Buffer.from(await built.outputs[0].arrayBuffer()).toString('base64')}`)
  bundledWalker = module.collectSnapshot.toString()
})

/** Block comments only: enough for the bundler's annotations, and it cannot eat a regex literal. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('the built bundle keeps the walker self-contained', () => {
  it('runs to completion using only browser globals', () => {
    expect(() => runInSandbox(bundledWalker, [
      containerStub(),
    ])).not.toThrow()
  })

  it('carries no bundler-injected identifiers', () => {
    // tsdown and Vite rewrite bodies with helpers such as `__toESM`,
    // `__publicField` or `__name`, none of which exist in the page.
    //
    // Block comments are stripped first: the bundler annotates calls with
    // `/* @__PURE__ */`, which never executes and is not a leak.
    expect(withoutComments(bundledWalker).match(/\b__\w+/g)).toBeNull()
  })

  it('does not reference the module registry', () => {
    const source = withoutComments(bundledWalker)
    for (const forbidden of [
      'require(',
      'import(',
      'exports.',
      'module.exports',
    ])
      expect(source).not.toContain(forbidden)
  })

  it('fails when the bundle leaks a helper into the walker', () => {
    // The guard pinned against the mutation it exists to catch, so it cannot
    // quietly stop working the next time the bundler changes.
    const leaked = bundledWalker.replace(/const nodes = \[\]/, 'const nodes = __name([])')
    expect(() => runInSandbox(leaked, [
      containerStub(),
    ])).toThrow(/__name/)
  })
})
