import { expect, it } from 'bun:test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fenced, fixture } from '../../test/code-fixture.ts'
import { parseDeck, renderDeck } from '../runtime/index.ts'
import type { CodeHighlightGrammar } from '../runtime/index.ts'
import { createDeckCompiler } from '../runtime/loader.ts'

const helpers: CodeHighlightGrammar = {
  name: 'stage-helpers',
  scopeName: 'source.stage-helpers',
  patterns: [{ match: '\\b\\d+\\b', name: 'constant.numeric.helper' }],
  repository: { mark: { match: '@pass', name: 'constant.language.helper' } },
}
const stage: CodeHighlightGrammar = {
  name: 'stage-script',
  aliases: ['stage'],
  scopeName: 'source.stage-script',
  patterns: [
    { include: '#directive' },
    { include: 'source.stage-helpers#mark' },
    { include: 'source.stage-helpers' },
    {
      begin: '\\[', end: '\\]', name: 'meta.block.stage',
      patterns: [{ include: '#command' }, { include: '$self' }],
      repository: { command: { match: '\\bfinish\\b', name: 'entity.name.function.stage' } },
    },
    { begin: '"', end: '"', name: 'string.quoted.double.stage' },
  ],
  repository: {
    directive: { patterns: [{ include: '#command' }] },
    command: { match: '(?<!\\w)(stage|finish)\\b', name: 'keyword.control.stage' },
  },
}

it('renders custom grammars, aliases, repository entries and registered scope includes', async () => {
  const input = [
    '# Example',
    fenced('stage [demo.stage] {1|2}{lines:true}', 'stage [finish @pass] 4\nfinish @pass'),
    fenced('stage-script', '"an open string'),
    fenced('stage-script', 'stage 7'),
  ].join('\n\n')
  const deck = parseDeck(input)
  const page = await renderDeck(deck, { setup: { codeHighlight: { langs: [[helpers, stage]] } } })
  expect(page).toContain('<figcaption>demo.stage</figcaption>')
  expect(page).toContain('data-code-ranges="1|2"')
  expect(page).toContain('<span class="tok-keyword">stage</span>')
  expect(page).toContain('<span class="tok-keyword">finish</span>')
  expect(page).toContain('<span class="tok-function">finish</span>')
  expect(page).toContain('<span class="tok-constant">@pass</span>')
  expect(page).toContain('<span class="tok-numeric">4</span>')
  expect(page).toContain('<code class="language-stage-script"><span class="tok-keyword">stage</span><span class="tok-"> </span><span class="tok-numeric">7</span>')
  const unrelated = await renderDeck(deck)
  expect(unrelated).not.toContain('<span class="tok-keyword">stage</span>')
})

it('loads a single grammar for mapped names, observes JSON edits and merges both setup files', () => fixture(async (root, entry) => {
  const setup = join(root, 'setup')
  await mkdir(setup)
  const grammar = join(setup, 'grammar.json')
  await Bun.write(grammar, JSON.stringify({
    name: 'Pipeline Markup',
    scopeName: 'source.pipeline',
    patterns: [{ match: '\\bpipeline\\b', name: 'keyword.control.pipeline' }],
  }))
  await Bun.write(join(setup, 'shiki.ts'), `
    export default () => {
      let requested = false
      return {
        langs: {
          pipeline: async () => {
            if (requested) throw new Error('The loader was called more than once')
            requested = true
            return import('./grammar.json')
          },
          'pipeline-alias': 'pipeline',
          unused: () => { throw new Error('An unused grammar was loaded') },
        },
      }
    }
  `)
  await Bun.write(join(setup, 'code-highlighter.ts'), `
    export default () => ({
      langs: { 'ts-sample': 'typescript' },
      transformers: [{
        pre(node) { node.properties['data-source-lang'] = this.options.lang },
      }],
    })
  `)
  await Bun.write(entry, [
    '# Languages',
    fenced('pipeline-alias', 'pipeline revised'),
    fenced('pipeline', 'pipeline revised'),
    fenced('ts-sample', 'const metric = 1'),
  ].join('\n\n'))
  const compile = createDeckCompiler(entry, { liveCompile: true })
  const before = (await compile()).html
  expect(before.match(/class="tok-keyword">pipeline<\/span>/g)).toHaveLength(2)
  expect(before).toContain('data-source-lang="pipeline-alias"')
  expect(before).toContain('data-source-lang="ts-sample"')
  expect(before).toContain('class="tok-keyword">const</span>')

  const json = await Bun.file(grammar).text()
  await Bun.write(grammar, json.replace('\\\\bpipeline\\\\b', '\\\\brevised\\\\b'))
  const after = (await compile()).html
  expect(after.match(/class="tok-keyword">revised<\/span>/g)).toHaveLength(2)
  expect(after).not.toContain('class="tok-keyword">pipeline</span>')
}))

it('resolves a lazy TextMate scope and bundled repository rules from a custom grammar', async () => {
  const host: CodeHighlightGrammar = {
    name: 'host',
    scopeName: 'source.host',
    patterns: [{ include: 'source.stage-helpers#mark' }, { include: 'source.unavailable' }, { include: 'source.json' }],
  }
  const deck = parseDeck('# Includes\n\n' + fenced('host', '@pass true "statement"'))
  const page = await renderDeck(deck, {
    setup: { codeHighlight: { langs: {
      host,
      'source.stage-helpers': async () => ({ default: [helpers] }),
      unused: () => { throw new Error('An unrelated loader was called') },
    } } },
  })
  expect(page).toContain('<span class="tok-constant">@pass</span>')
  expect(page).toContain('<span class="tok-constant">true</span>')
  expect(page).toContain('<span class="tok-string">&quot;</span>')
})

it('reports aliases that loop and repository cycles without consuming patterns', async () => {
  const deck = parseDeck('# Diagnostics\n\n' + fenced('stage', 'example'))
  await expect(renderDeck(deck, { setup: { codeHighlight: { langs: { stage: 'second', second: 'stage' } } } }))
    .rejects.toThrow('Recursive code language alias "stage"')
  await expect(renderDeck(deck, { setup: { codeHighlight: { langs: [
    { ...stage, patterns: [{ include: '#again' }], repository: { again: { include: '$self' } } },
  ] } } })).rejects.toThrow('has a recursive include without a matching rule')
})
