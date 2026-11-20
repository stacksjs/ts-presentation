import { expect, it } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fenced, fixture } from '../../test/code-fixture.ts'
import { parseDeck, renderDeck } from '../runtime/index.ts'
import type { CodeHighlightElement } from '../runtime/index.ts'
import { createDeckCompiler } from '../runtime/loader.ts'

it('uses the configured first-party syntax theme and reloads changed setup files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'presentation-highlighter-'))
  try {
    const directory = join(root, 'setup')
    await mkdir(directory)
    const entry = join(root, 'slides.md')
    const native = join(directory, 'code-highlighter.ts')
    await Bun.write(entry, ['# Colors', '', '```ts', 'const review = 1', '```'].join('\n'))
    await Bun.write(join(directory, 'shiki.ts'), "export default () => ({ theme: 'nord' })")
    const compile = createDeckCompiler(entry, { liveCompile: true })
    const dark = await compile()
    expect(dark.html).toContain('id="presentation-code-theme"')
    expect(dark.html).toContain('--tp-code-background: #2e3440')
    expect(dark.html).toContain('class="tok-keyword">const</span>')

    await Bun.write(native, "export default () => ({ theme: 'github-light' })")
    const light = await compile()
    expect(light.html).toContain('--tp-code-background: #ffffff')
    expect(light.live?.frame).not.toBe(dark.live?.frame)
    await rm(native)
    expect((await compile()).html).toContain('--tp-code-background: #2e3440')
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('runs Slidev-style setup hooks in tier order and keeps transformer state per fence', () => fixture(async (root, entry) => {
  const setup = join(root, 'setup')
  await mkdir(setup)
  await Bun.write(join(setup, 'shiki.ts'), `
    export default () => ({
      theme: 'nord',
      transformers: [{
        preprocess(source) {
          if (this.meta.order !== 'declared-first') throw new Error('Unexpected preprocess order')
          return source.replace('ORIGINAL', 'prepared')
        },
        tokens(rows) {
          if (!this.source.includes('prepared')) throw new Error('Untransformed input in token phase')
          return rows.map(row => row.map(token => {
            if (token.content === 'prepared')
              return { ...token, htmlAttrs: { 'data-prepared': true }, htmlStyle: { color: '#123456' } }
            if (token.content === 'const') return { ...token, fontStyle: -1 }
            return token
          }))
        },
        span(node, line, column, _row, token) {
          if (token.content === 'const') {
            node.properties['data-position'] = line + ':' + column + ':' + token.offset
            node.properties['data-token-color'] = token.color
          }
        },
        line(node, lineNumber) {
          if (lineNumber === 1) this.addClassToHast(node, ['emphasis', 'line'])
        },
        code(node) {
          return { ...node, properties: { ...node.properties, 'data-raw': this.options.meta.__raw } }
        },
        pre(node) {
          node.properties.className = ['highlighted', 'slidev-code']
          node.properties['data-order'] = this.meta.order
        },
        root(root) {
          return { ...root, children: [
            { type: 'element', tagName: 'section', properties: { 'data-outer': true }, children: root.children },
          ] }
        },
        postprocess(html) {
          return html + '<!-- highlighter processed -->'
        },
      }, false, {
        enforce: 'pre',
        preprocess() {
          if (this.meta.order) throw new Error('Transformer state leaked between blocks')
          this.meta.order = 'declared-first'
        },
      }],
    })
  `)
  const native = join(setup, 'code-highlighter.ts')
  await Bun.write(native, `
    export default () => ({ transformers: [{ enforce: 'post', pre(node) {
      this.addClassToHast(node, 'native')
    } }] })
  `)
  await Bun.write(entry, ['# Examples', fenced('ts [review.ts] {2}{lines:true,startLine:7}', 'let a = ORIGINAL\n  const b = "<script>"'), fenced('text', 'ORIGINAL')].join('\n\n'))
  const compile = createDeckCompiler(entry, { liveCompile: true })
  const html = (await compile()).html
  expect(html).toContain('<section data-outer="true"><pre class="slidev-code highlighted native" data-order="declared-first">')
  expect(html).toContain('<code class="language-ts" data-raw="[review.ts] {2}{lines:true,startLine:7}">')
  expect(html).toContain('data-code-ranges="2"')
  expect(html).toContain('<span class="line code-line emphasis" data-code-line="true" data-code-number="7">')
  expect(html).toContain('data-position="2:2:19" data-token-color="#81a1c1"')
  expect(html).toContain('style="color:#81a1c1" data-position="2:2:19"')
  expect(html).toContain('data-prepared="true" style="color:#123456">prepared</span>')
  expect(html).toContain('&quot;&lt;script&gt;&quot;')
  expect(html.match(/<!-- highlighter processed -->/g)).toHaveLength(2)
  expect(html.match(/data-order="declared-first"/g)).toHaveLength(2)
  await rm(native)
  expect((await compile()).html).not.toContain('highlighted native')
}))

it('transforms magic frames and static editor fallback while leaving live examples executable', async () => {
  const source = [
    '# Code',
    '````md magic-move',
    fenced('ts [first.ts] {1}{lines:true}', 'const initial = 1'),
    fenced('ts [second.ts]', 'const changed = 2'),
    '````',
    fenced('ts {live-run}', 'console.log("original source")'),
  ].join('\n')
  const options = {
    setup: { codeHighlight: { transformers: [{
      preprocess(source: string) { return source.replace('original source', 'visible source') },
      pre(node: CodeHighlightElement) { node.properties['data-transform'] = true },
    }] } },
  }
  const live = await renderDeck(parseDeck(source), options)
  expect(live).toContain('data-code-motion="true"')
  expect(live).toContain('<figure hidden class="code-frame"')
  expect(live.match(/<pre class="slidev-code" data-transform="true">/g)).toHaveLength(2)
  expect(live).toContain('data-code-number="1"')
  expect(live).toContain('original source')
  const fallback = await renderDeck(parseDeck('---\nmonaco: false\n---\n' + source), options)
  expect(fallback.match(/<pre class="slidev-code" data-transform="true">/g)).toHaveLength(3)
  expect(fallback).toContain('visible source')
  expect(fallback).not.toContain('original source')
})
