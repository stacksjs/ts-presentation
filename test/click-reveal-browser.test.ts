import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { parseDeck, renderDeck } from '../packages/slidev/node/runtime/index.ts'

const chrome = await findChrome()
const project = resolve(import.meta.dir, '..')
const deck = `---
clickAnimation: fade down
---

# Named clicks

<div data-token="A" v-click="3">A</div>
<div data-token="B" v-click="2">B</div>
<div data-token="C" v-click="1">C</div>
<div data-token="D" v-click.hide="4">D</div>
<v-click data-token="E" hide><div>E</div></v-click>

---

# Hide steps

<div data-token="A" v-click-hide>A</div>
<div data-token="B" v-click-hide>B</div>
<div data-token="C" v-click>C</div>
<div data-token="D" v-click-hide>D</div>

---

# Nested groups

<v-clicks depth="3" every="2">

- A
  - B
    - C
    - D
  - E
  - F
    - G
    - H
- I

</v-clicks>

<v-clicks>

| Row | Value |
| --- | --- |
| J | 1 |
| K | 2 |

</v-clicks>

---
clickAnimation: custom
---

# Variant presets

<div id="custom" v-click>Custom</div>
<div id="modifiers" v-click.fade.right>Combined</div>
<div id="none" v-click.none>None</div>
<div id="disabled" v-click="false">Disabled</div>

---

# Relative ranges

<span data-token="A" v-click>A</span>
<v-click data-token="B" :at="['+1', '+1']">B</v-click>
<span data-token="C" v-click.hide="[2, 4]">C</span>
<v-click-gap size="1" />
<span data-token="D" v-after>D</span>

---

# Replace content

<div v-click data-token="Intro">Intro</div>

<v-switch>
  <template #1><button data-frame="first">First</button></template>
  <template #2><button data-frame="second">Second</button></template>
  <template #4-6><button data-frame="last">Last</button></template>
</v-switch>

<div v-after data-token="Last cue">Last cue</div>

---

# Share the click schedule

<div v-click data-token="A">A</div>

$$ {hide|1|all}{at:4}
x+y
$$

<div v-click data-token="B">B</div>

~~~ts {hide|1|all}
const a = 1
const b = 2
~~~

---

# SVG annotations

<svg width="160" height="40" viewBox="0 0 160 40"><circle data-token="Marker" v-click cx="20" cy="20" r="10" fill="red"/></svg>
`

// Adapted from Slidev's basic Cypress fixtures for click maps, nested lists, and presets.
test.skipIf(!chrome)('applies click maps, group depth, ranges, and switches in the bundled player', async () => {
  const html = await renderDeck(parseDeck(deck))
  const bundle = await Bun.build({ entrypoints: [resolve(project, 'packages/client/runtime/player.ts')], target: 'browser', format: 'iife', minify: true })
  expect(bundle.success).toBe(true)
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      switch (new URL(request.url).pathname) {
        case '/': return new Response(html, { headers: { 'Content-Type': 'text/html' } })
        case '/presentation.js': return new Response(bundle.outputs[0])
        case '/presentation.css': return new Response(Bun.file(resolve(project, 'packages/client/runtime/player.css')))
        default: return new Response(null, { status: 404 })
      }
    },
  })
  const view = new Bun.WebView({ width: 960, height: 620, backend: { type: 'chrome', path: chrome!, url: false } })
  async function step(slide: number, click: number): Promise<{ tokens: string[], total: number }> {
    return view.evaluate(`(() => {
      const nav = window.presentationNavigation
      nav.go(${slide}, ${click})
      const active = document.querySelector('#stage > article:not([hidden])')
      return {
        tokens: [...active.querySelectorAll('[data-token]:not([data-reveal-hidden])')].map(node => node.dataset.token),
        total: nav.clicksTotal,
      }
    })()`)
  }
  try {
    // Capture mode makes transitions synchronous while preserving real click step navigation.
    await view.navigate(new URL('?capture=1&steps=1', server.url).href)
    expect(await step(1, 0)).toEqual({ tokens: ['D', 'E'], total: 4 })
    expect((await step(1, 1)).tokens).toEqual(['C', 'D'])
    expect((await step(1, 3)).tokens).toEqual(['A', 'B', 'C', 'D'])
    expect((await step(1, 4)).tokens).toEqual(['A', 'B', 'C'])
    expect((await step(2, 1)).tokens).toEqual(['B', 'D'])
    expect((await step(2, 2)).tokens).toEqual(['D'])
    expect((await step(2, 3)).tokens).toEqual(['C', 'D'])
    expect((await step(2, 4)).tokens).toEqual(['C'])

    expect((await step(3, 0)).total).toBe(7)
    const group = async (click: number) => {
      await step(3, click)
      return view.evaluate<string[]>(`[...document.querySelectorAll('#slide-3 .slidev-vclick-target:not([data-reveal-hidden])')]
        .map(node => node.localName === 'li' ? node.firstChild.textContent.trim() : node.cells[0].textContent)`)
    }
    expect(await group(1)).toEqual(['A', 'B'])
    expect(await group(2)).toEqual(['A', 'B', 'C', 'D'])
    expect(await group(4)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
    expect(await group(6)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'])

    expect((await step(4, 0)).total).toBe(3)
    const presets = await view.evaluate<{ inherited: boolean, custom: boolean, overrides: boolean, rgba: string, inert: boolean, none: boolean, disabled: boolean }>(`(() => {
      const first = document.querySelector('#slide-1 [data-token="A"]')
      const custom = document.querySelector('#custom')
      const modifiers = document.querySelector('#modifiers')
      return {
        inherited: first.classList.contains('slidev-vclick-anim-down'),
        custom: custom.classList.contains('slidev-vclick-anim-custom'),
        overrides: modifiers.classList.contains('slidev-vclick-anim-right') && !modifiers.classList.contains('slidev-vclick-anim-custom'),
        rgba: getComputedStyle(modifiers).opacity,
        inert: modifiers.inert,
        none: document.querySelector('#none').classList.contains('slidev-vclick-anim-none'),
        disabled: !document.querySelector('#disabled').classList.contains('slidev-vclick-target'),
      }
    })()`)
    expect(presets).toEqual({ inherited: true, custom: true, overrides: true, rgba: '0.5', inert: true, none: true, disabled: true })

    expect(await step(5, 0)).toEqual({ tokens: ['C'], total: 4 })
    expect((await step(5, 2)).tokens).toEqual(['A', 'B'])
    expect((await step(5, 3)).tokens).toEqual(['A'])
    expect((await step(5, 4)).tokens).toEqual(['A', 'C', 'D'])
    expect((await step(5, 1)).tokens).toEqual(['A', 'C'])

    const frame = async (click: number) => {
      await step(6, click)
      return view.evaluate<string[]>(`[...document.querySelectorAll('#slide-6 v-switch > :not([data-switch-hidden]) [data-frame]')].map(node => node.dataset.frame)`)
    }
    expect((await step(6, 0)).total).toBe(6)
    expect(await frame(1)).toEqual([])
    expect(await frame(2)).toEqual(['first'])
    expect(await frame(4)).toEqual(['second'])
    expect(await frame(6)).toEqual(['last'])
    expect(await frame(2)).toEqual(['first'])
    expect(await view.evaluate("document.querySelector('[data-frame=last]').parentElement.hasAttribute('data-switch-print-hidden')")).toBe(false)
    expect(await view.evaluate("document.querySelector('[data-frame=first]').parentElement.hasAttribute('data-switch-print-hidden')")).toBe(true)

    await view.cdp('Emulation.setEmulatedMedia', { media: 'print' })
    expect(await view.evaluate("getComputedStyle(document.querySelector('[data-frame=last]').parentElement).display")).toBe('block')
    expect(await view.evaluate("getComputedStyle(document.querySelector('[data-frame=first]').parentElement).display")).toBe('none')
    await view.cdp('Emulation.setEmulatedMedia', { media: 'screen' })

    expect(await step(8, 0)).toEqual({ tokens: [], total: 1 })
    expect(await step(8, 1)).toEqual({ tokens: ['Marker'], total: 1 })

    expect(await step(7, 2)).toEqual({ tokens: ['A', 'B'], total: 5 })
    expect(await view.evaluate("document.querySelector('#slide-7 [data-code-block]').hasAttribute('data-code-hidden')")).toBe(true)
    await step(7, 3)
    expect(await view.evaluate("document.querySelector('#slide-7 [data-code-block]').hasAttribute('data-code-hidden')")).toBe(false)
    expect(await view.evaluate("document.querySelector('#slide-7 .equation-steps').hasAttribute('data-equation-hidden')")).toBe(true)
    await step(7, 4)
    expect(await view.evaluate("document.querySelector('#slide-7 .equation-steps').hasAttribute('data-equation-hidden')")).toBe(false)
  }
  finally {
    view.close()
    await server.stop(true)
  }
}, 15000)
