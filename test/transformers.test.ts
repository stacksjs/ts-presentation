import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDeckCompiler } from '../packages/slidev/node/runtime/loader.ts'
import { SlideMarkdownEdits } from '../packages/slidev/node/runtime/markdown-edits.ts'

test('applies Markdown replacements at committed offsets and keeps insertions on their original side', () => {
  const edits = new SlideMarkdownEdits('a2 b4')
  edits.replaceAll(/(?<letter>[ab])(\d)/g, '$<letter>:$2').commit()
  expect(edits.original).toBe('a:2 b:4')
  edits.prepend('[').append(']').replace(/b:(\d)/, (_match, value) => `B=${value}`)
  expect(edits.toString()).toBe('[a:2 B=4]')
  expect(edits.rollback().original).toBe('a2 b4')
  expect(edits.toString()).toBe('a:2 b:4')
  const boundary = new SlideMarkdownEdits('abc').appendLeft(1, '+').prependRight(1, '-')
  expect(boundary.toString()).toBe('a+-bc')
  expect(boundary.slice(0, 1)).toBe('a+')
  expect(boundary.slice(1, 3)).toBe('-bc')
})

test('loads Slidev-style Markdown and codeblock transformers with ordered hooks and observes imported helpers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'presentation-transformers-'))
  const entry = join(directory, 'slides.md')
  const helpers = new URL('../src/index.ts', import.meta.url).href
  try {
    await Promise.all([
      Bun.write(entry, [
        '---', 'theme: ./theme/index.ts', 'addons: [./addon/index.ts]', '---', '',
        '# Transformed deck', '', '[[[chain]]]', '',
        '~~~~panel card=blue', 'a & <b>', '~~~~', '',
        '> ````snippet label=demo', '> before', '> ````', '',
        '~~~ts {1}', 'const fallback = true', '~~~', '',
        '~~~mermaid', 'flowchart LR', 'A --> B', '~~~', '',
        '---', 'src: ./chapter.md', '---',
      ].join('\n')),
      Bun.write(join(directory, 'chapter.md'), '# Source chapter\n\n[[[chain]]]\n'),
      Bun.write(join(directory, 'theme/index.ts'), 'export default { name: "test-theme" }'),
      Bun.write(join(directory, 'addon/index.ts'), 'export default { name: "test-addon" }'),
      Bun.write(join(directory, 'theme/setup/transformers.ts'), `export default () => ({
        pre: [({s}) => { s.replace('deck-pre', 'deck-pre theme-pre') }],
        postCodeblock: [({s}) => { s.replace('theme-pre', 'theme-pre theme-alias') }],
        codeblocks: [({info, fence, code}) => info === 'panel card=blue'
          ? '<Callout marker="' + fence + '"><strong>Theme renderer</strong></Callout>' : null],
      })`),
      Bun.write(join(directory, 'addon/setup/transformers.ts'), `export default () => ({
        preCodeblock: [false, ({s}) => { s.replace('theme-pre', 'theme-pre addon-alias') }],
        post: [({s}) => { s.replace('theme-alias', 'theme-alias addon-post') }],
      })`),
      Bun.write(join(directory, 'components/Callout.stx'), '<aside data-fence="{{ marker }}">{!! slot !!}</aside>'),
      Bun.write(join(directory, 'setup/text.ts'), 'export const prefix = "deck-pre"'),
      Bun.write(join(directory, 'setup/transformers.ts'), `import { defineTransformersSetup, defineCodeblockTransformer, defineMarkdownTransformer } from ${JSON.stringify(helpers)}
        import { prefix } from './text.ts'
        export default defineTransformersSetup(async () => ({
          pre: [defineMarkdownTransformer(async ({s, slide}) => {
            if (s.original.includes('[[[chain]]]')) {
              s.replace('[[[chain]]]', prefix)
              if (slide.index === 1) s.append('\\n\\nSource: ' + slide.source.filepath.split('/').at(-1) + '/' + slide.source.index)
            }
          })],
          post: [defineMarkdownTransformer(({s, options, slide}) => {
            s.replace('addon-post', 'addon-post deck-post ' + options.mode + '/' + slide.index)
          })],
          codeblocks: [false, defineCodeblockTransformer(async ({info, fence, code, renderHighlighted}) => {
            if (info === 'panel card=blue') return '<p>incorrect precedence</p>'
            if (info !== 'snippet label=demo') return
            const rendered = await renderHighlighted({info: 'ts', code: 'const ' + code.trim() + ' = 1'})
            return '<figure data-custom-fence="' + fence + '">' + rendered + '</figure>'
          })],
        }))`),
    ])
    const compile = createDeckCompiler(entry, { liveCompile: true })
    const first = await compile()
    expect(first.html).toContain('deck-pre theme-pre theme-alias addon-post deck-post dev/0 addon-alias')
    expect(first.html).toContain('Source: chapter.md/0')
    expect(first.html).toContain('<aside data-fence="4"><strong>Theme renderer</strong></aside>')
    expect(first.html).not.toContain('incorrect precedence')
    expect(first.html).toMatch(/<blockquote>\s*<figure data-custom-fence="4"><pre><code class="language-ts">/)
    expect(first.html).toMatch(/class="tok-keyword">const<\/span>/)
    expect(first.html).toContain('data-code-ranges="1"')
    expect(first.html).toContain('class="slide-diagram"')
    expect(first.html).not.toContain('tp-fence-')
    await Bun.write(join(directory, 'setup/text.ts'), 'export const prefix = "changed deck-pre"')
    const updated = await compile()
    expect(updated.html).toContain('changed deck-pre')
    expect(updated.live?.revision).not.toBe(first.live?.revision)
    expect(updated.live?.frame).toBe(first.live?.frame)
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})
