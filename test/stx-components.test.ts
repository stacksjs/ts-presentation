import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { asset } from '../packages/slidev/node/runtime/assets.ts'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { createDeckCompiler } from '../packages/slidev/node/runtime/loader.ts'
import { readSlideSource, saveSlideSource } from '../packages/slidev/node/runtime/side-editor-source.ts'

async function project(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'presentation-stx-components-'))
  try { await run(root) }
  finally { await rm(root, { recursive: true, force: true }) }
}

test('renders STX components with bound props, nested Markdown slots, and click reveals', async () => project(async (root) => {
  const entry = join(root, 'slides.md')
  await Promise.all([
    Bun.write(entry, [
      '---', 'badge:', '  title: Confirmed', '---', '', '# Components', '',
      'Inline <StatusBadge :label="frontmatter.badge.title" /> badge.', '',
      '<DocCard heading="&lt;Demo&gt;" :count="3" open v-click="2">',
      '', 'A **Markdown** slot with $x^2$.', '',
      '<DocCard heading="Nested">Inner default<template #footer>Inner *footer*</template></DocCard>',
      '', '<template #footer>', '', 'Outer **footer**', '',
      '```ts', 'const test = "{{ untouched }}"', '```', '',
      '</template>', '', '</DocCard>', '',
      '<status-badge label="Kebab" />', '',
      '`<StatusBadge label="Inline literal" />`', '',
      '~~~md', '<StatusBadge label="Fenced literal" />', '~~~', '',
      '    <StatusBadge label="Indented literal" />', '',
      '<pre><StatusBadge label="Raw literal" /></pre>', '',
      '<!-- <StatusBadge label="Comment literal" /> -->', '',
      'Escaped \\<StatusBadge label="Escaped literal" />',
    ].join('\n')),
    Bun.write(join(root, 'components', 'DocCard.stx'), '<template><section class="doc-card"><h2>{{ props.heading }}</h2><p>{{ props.count }} {{ props.open }}</p><slot /><footer><slot name="footer">Default footer</slot></footer></section></template>'),
    Bun.write(join(root, 'components', 'badges', 'StatusBadge.stx'), '<template><span class="status-badge">{{ props.label }}</span></template><style scoped>.status-badge { color: lime }</style>'),
  ])
  const html = (await createDeckCompiler(entry)()).html
  expect(html).toMatch(/Inline <span[^>]*>Confirmed<\/span>\s+badge/)
  expect(html).toMatch(/<span[^>]*>Kebab<\/span>/)
  expect(html).toContain('<h2>&lt;Demo&gt;</h2><p>3 true</p>')
  expect(html).toContain('<strong>Markdown</strong>')
  expect(html).toContain('<msup>')
  expect(html).toContain('<h2>Nested</h2>')
  expect(html).toContain('Inner default')
  expect(html).toContain('<footer>Inner <em>footer</em></footer>')
  expect(html).toMatch(/<footer><p>Outer <strong>footer<\/strong><\/p>/)
  expect(html).toContain('{{ untouched }}')
  expect(html).toContain('v-click="2"')
  expect(html).toContain('data-v-stx-')
  expect(html.match(/class="status-badge"/g)).toHaveLength(2)
  expect(html).not.toContain('tp-component-')
  expect(html).toContain('&lt;StatusBadge label=&quot;Indented literal&quot; /&gt;')
  expect(html).toContain('<pre><StatusBadge label="Raw literal" /></pre>')
}))

test('projects scoped STX values into named Markdown slots while preserving literal code', async () => project(async (root) => {
  const entry = join(root, 'slides.md')
  await Promise.all([
    Bun.write(entry, [
      '# Scoped slots', '',
      '<ExampleRows first="&lt;strong&gt;One&lt;/strong&gt;" second="Two" :index="2">',
      '<template #row="{ label: caption, index }">', '',
      '**{{ caption }}** is row {{ index + 1 }}. The literal is `{{ caption }}`.', '',
      '<StatusLabel />', '',
      '~~~txt', '{{ index }}', '~~~', '',
      '</template>',
      '<template v-slot:summary=\'row\'>Summary for *{{ row.label }}*</template>',
      '</ExampleRows>',
    ].join('\n')),
    Bun.write(join(root, 'components', 'ExampleRows.stx'), [
      '<template><section>',
      '<div class="first"><slot name="row" :label="props.first" :index="props.index" /></div>',
      '<div class="second"><slot name="row" :label="props.second" :index="props.index" /></div>',
      '<footer><slot name="summary" :label="props.second">Missing summary</slot></footer>',
      '</section></template>',
    ].join('')),
    Bun.write(join(root, 'components', 'StatusLabel.stx'), '<span class="status-label">Ready</span>'),
  ])
  const html = (await createDeckCompiler(entry)()).html
  expect(html).toContain('<strong>&lt;strong&gt;One&lt;/strong&gt;</strong> is row 3.')
  expect(html).toContain('<strong>Two</strong> is row 3.')
  expect(html).toContain('<footer>Summary for <em>Two</em></footer>')
  expect(html.match(/<code>\{\{ caption \}\}<\/code>/g)).toHaveLength(2)
  const examples = [...html.matchAll(/<pre><code class="language-txt">([\s\S]*?)<\/code><\/pre>/g)]
    .map(([, code]) => code.replace(/<\/?span\b[^>]*>/g, '').trim())
  expect(examples).toEqual(['{{ index }}', '{{ index }}'])
  expect(html.match(/<span class="status-label">Ready<\/span>/g)).toHaveLength(2)
  expect(html).not.toContain('tp-component-')
}))

test('renders Comark components through STX with typed props and nested Markdown slots', async () => project(async (root) => {
  const entry = join(root, 'slides.md')
  await Promise.all([
    Bun.write(entry, [
      '---', 'comark: true', 'label: Confirmed', '---', '# Components {.introduction}', '',
      'Status: :badge{:label="frontmatter.label"}.', '',
      '::doc-card{.featured count="placeholder"}',
      '```yaml [props]', 'class: primary', 'count: 42', 'option:', '  name: Bundled', '```',
      '#default', 'Body **Markdown**.', '',
      '  :::doc-card', '  ---', '  option: { name: Nested }', '  count: 2', '  ---',
      '  Nested *content*. :badge{:label="props.option.name"}', '  :::', '',
      '#footer', 'Footer :status-badge[**Styled**].', '::', '',
      '`:status-badge{label="code"}`', '', '    :status-badge{label="indented"}', '',
      '`Example', ':status-badge{label="multiline"}`', '',
      '```md', '::doc-card', '#footer', '::', '```', '',
      '\\:status-badge{label="escaped"}', '', '<pre>:status-badge{label="raw"}</pre>',
      '', '---', 'comark: false', '---', '', '# Disabled {.literal}', ':status-badge{label="literal"}',
    ].join('\n')),
    Bun.write(join(root, 'components', 'DocCard.stx'), '<template><section class="card {{ props.class }}"><h2>{{ props.option.name }} {{ props.count + 1 }}</h2><slot /><footer><slot name="footer" /></footer></section></template>'),
    Bun.write(join(root, 'components', 'StatusBadge.stx'), '<span class="status">{{ props.label }}<slot /></span>'),
    Bun.write(join(root, 'components', 'Badge.stx'), '<span class="status">{{ props.label }}</span>'),
  ])
  const deck = await createDeckCompiler(entry)()
  expect(deck.html).toContain('<title>Components</title>')
  expect(deck.html).toContain('<h1 class="introduction">Components</h1>')
  expect(deck.html).toContain('Status: <span class="status">Confirmed</span>.')
  expect(deck.html).toContain('<section class="card featured primary"><h2>Bundled 43</h2>')
  expect(deck.html).toContain('Body <strong>Markdown</strong>.')
  expect(deck.html).toContain('<h2>Nested 3</h2>')
  expect(deck.html).toContain('Nested <em>content</em>.')
  expect(deck.html).toContain('<span class="status">Nested</span>')
  expect(deck.html).toContain('Footer <span class="status"><strong>Styled</strong></span>.')
  expect(deck.html.match(/class="status"/g)).toHaveLength(3)
  expect(deck.html).toContain('<code>:status-badge{label=&quot;code&quot;}</code>')
  expect(deck.html).toContain('<code>Example :status-badge{label=&quot;multiline&quot;}</code>')
  expect(deck.html).toContain('<pre>:status-badge{label="raw"}</pre>')
  expect(deck.html).toContain('#footer')
  expect(deck.html).toContain('<h1>Disabled {.literal}</h1>')
  expect(deck.html).toContain(':status-badge{label=&quot;literal&quot;}')
  expect(deck.html).not.toContain('<template #footer>')
}))

test('loads and edits imported slides with inherited Comark settings and typed component props', async () => project(async (root) => {
  const entry = join(root, 'slides.md')
  const imported = join(root, 'appendix.md')
  await Promise.all([
    Bun.write(entry, [
      '---', 'comark: true', 'label: Main deck', '---', '# Entry', '',
      '---', 'src: ./include.md', '---', '',
      '---', 'src: ./appendix.md#2', 'comark: false', '---', '',
    ].join('\n')),
    Bun.write(join(root, 'include.md'), '---\nsrc: ./appendix.md#2\n---\n'),
    Bun.write(imported, [
      '# Skip', '', '---', '', '# Imported', '::card{.primary title=initial}', '---',
      'title: From YAML', 'class: secondary', 'items: [one, two]', '---',
      'First :badge{:label="props.items.0"}.', '', '#footer', 'Footer :badge{:label="frontmatter.label"}.', '::', '',
      '---', '', '# Last', '',
    ].join('\n')),
    Bun.write(join(root, 'components', 'Card.stx'), '<section class="{{ props.class }}"><h2>{{ props.title }}</h2><slot /><footer><slot name="footer" /></footer></section>'),
    Bun.write(join(root, 'components', 'Badge.stx'), '<strong>{{ props.label }}</strong>'),
  ])
  const compile = createDeckCompiler(entry, { liveCompile: true })
  const result = await compile()
  expect(result.live?.slides).toHaveLength(3)
  expect(result.live?.slides[1].html).toContain('<section class="primary secondary"><h2>From YAML</h2>')
  expect(result.live?.slides[1].html).toContain('First <strong>one</strong>.')
  expect(result.live?.slides[1].html).toContain('Footer <strong>Main deck</strong>.')
  expect(result.live?.slides[2].html).toContain('::card{.primary title=initial}')
  expect(result.live?.slides[2].html).not.toContain('<h2>From YAML</h2>')
  const references = [...result.writableSlides.values()].filter(slide => slide.path.endsWith('appendix.md'))
  expect(references).toHaveLength(2)
  const file = references.find(slide => slide.inheritedHeadmatter?.comark)!
  expect(file.document.slice(file.start, file.end)).toContain('items: [one, two]')
  const edit = readSlideSource(file)
  const response = await saveSlideSource(result.writableSlides, { ...edit, source: edit.source.replace('From YAML', 'Updated') })
  expect(response.status).toBe(200)
  expect((await compile()).live?.slides[1].html).toContain('<h2>Updated</h2>')
  expect(await Bun.file(imported).text()).toContain('# Last')
}))

test('binds native HTML attributes in scoped Markdown slots', async () => project(async (root) => {
  const entry = join(root, 'slides.md')
  await Promise.all([
    Bun.write(entry, [
      '# Attribute bindings', '',
      '<ExampleRow label="&quot; &lt;One&gt;" :index="2" url="/guide?x=1&amp;y=2">',
      '<template #row="{ label, index, url }">', '',
      `<span class="row-label" title="Slot {{ label }} / {{ index + 1 }}" v-bind:data-label='label + "!"' :aria-label="label"><span>One</span></span>`,
      '<a :href="url">Details</a>',
      '<pre><span title="{{ label }}" :data-tag="index">literal</span></pre>',
      '',
      '`<span :title="label">`', '',
      '</template>',
      '<template #control="{ index }"><input :disabled="index > 1" /></template>',
      '</ExampleRow>',
    ].join('\n')),
    Bun.write(join(root, 'components', 'ExampleRow.stx'), [
      '<template><section>',
      '<slot name="row" :label="props.label" :index="props.index" :url="props.url" />',
      '<slot name="control" :index="props.index" />',
      '</section></template>',
    ].join('')),
  ])
  const html = (await createDeckCompiler(entry)()).html
  expect(html).toContain('class="row-label"')
  expect(html).toContain('title="Slot &quot; &lt;One&gt; / 3"')
  expect(html).toContain('data-label="&quot; &lt;One&gt;!"')
  expect(html).toContain('aria-label="&quot; &lt;One&gt;"')
  expect(html).toContain('><span>One</span></span>')
  expect(html).toContain('href="/guide?x=1&amp;y=2"')
  expect(html).toMatch(/<input\s+disabled[\s=/>]/)
  expect(html).toContain('<pre><span title="{{ label }}" :data-tag="index">literal</span></pre>')
  expect(html).toContain('<code>&lt;span :title=&quot;label&quot;&gt;</code>')
  expect(html).not.toContain('tp-component-')
}))

test('observes theme, addon, and project STX components across creation, edits, and removal', async () => project(async (root) => {
  const entry = join(root, 'slides.md')
  const component = (where: string) => join(root, where, 'components', 'Badge.stx')
  await Promise.all([
    Bun.write(entry, '---\ntheme: ./theme/index.ts\naddons:\n  - ./addon/index.ts\n---\n\n# Example\n\n<Badge />'),
    Bun.write(join(root, 'theme', 'index.ts'), 'export default {name: "theme"}'),
    Bun.write(join(root, 'addon', 'index.ts'), 'export default {name: "addon"}'),
    Bun.write(component('theme'), '<strong>Theme</strong>'),
  ])
  const compile = createDeckCompiler(entry, { liveCompile: true })
  const first = await compile()
  expect(first.live?.slides[0].html).toContain('<strong>Theme</strong>')
  await Bun.write(component('addon'), '<strong>Addon</strong>')
  const second = await compile()
  expect(second.live?.slides[0].html).toContain('<strong>Addon</strong>')
  expect(second.live?.frame).toBe(first.live?.frame)
  await Bun.write(component('.'), '<strong>Project</strong>')
  expect((await compile()).live?.slides[0].html).toContain('<strong>Project</strong>')
  await Bun.write(component('.'), '<strong>Edited</strong>')
  expect((await compile()).live?.slides[0].html).toContain('<strong>Edited</strong>')
  await rm(component('.'))
  expect((await compile()).live?.slides[0].html).toContain('<strong>Addon</strong>')
}))

test('rejects STX component discovery outside the active roots', async () => project(async (root) => {
  const entry = join(root, 'deck', 'slides.md')
  const target = join(root, 'outside.stx')
  await Promise.all([
    Bun.write(entry, '# Example\n\n<Badge />'),
    Bun.write(target, '<span>Outside</span>'),
    Bun.write(join(root, 'deck', 'components', '.keep'), ''),
  ])
  await symlink(target, join(root, 'deck', 'components', 'Badge.stx'))
  await expect(createDeckCompiler(entry)()).rejects.toThrow('STX components must stay inside')
}))

const chrome = await findChrome()
test.skipIf(!chrome)('hydrates independent STX counters and their scoped Markdown slots in a static build', async () => project(async (root) => {
  const starter = fileURLToPath(new URL('../packages/create-app/index.mjs', import.meta.url))
  const deck = join(root, 'starter')
  const scaffold = Bun.spawn([process.execPath, starter, deck], { stdout: 'ignore', stderr: 'pipe' })
  const [scaffoldExit, scaffoldError] = await Promise.all([scaffold.exited, new Response(scaffold.stderr).text()])
  if (scaffoldExit) throw new Error(scaffoldError)
  const entry = join(deck, 'slides.md')
  expect(await Bun.file(entry).text()).toContain('<Counter :start="1" />')
  const counter = join(deck, 'components', 'Counter.stx')
  await Promise.all([
    Bun.write(entry, [
      '# Counter', '',
      '<Counter :start="2" v-click><template #value="{ current }">',
      '<strong :aria-label="current + 1" data-count="Count {{ current }}">{{ current }}</strong>',
      '</template></Counter>', '',
      '<Counter :start="9" />', '', '---', '', '# Next', '',
      '<Counter :start="4" />',
    ].join('\n')),
    Bun.file(counter).text().then(source => Bun.write(counter, source.replace('{{ count }}', '<slot name="value" :current="count()">{{ count }}</slot>'))),
  ])
  const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
  const command = Bun.spawn([process.execPath, cli, 'build', entry], { stdout: 'ignore', stderr: 'pipe', timeout: 20_000 })
  const [exit, stderr] = await Promise.all([command.exited, new Response(command.stderr).text()])
  if (exit) throw new Error(stderr)
  const path = await realpath(join(deck, 'dist'))
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const pathname = new URL(request.url).pathname
      return asset(path, pathname === '/' ? '/index.html' : pathname, request)
    },
  })
  const view = new Bun.WebView({ width: 960, height: 540, backend: { type: 'chrome', path: chrome!, url: false } })
  const slotAttributes = `(() => {
    const slot = document.querySelector('.demo-counter output strong')
    return [slot.getAttribute('data-count'), slot.getAttribute('aria-label')]
  })()`
  try {
    await view.navigate(new URL('?capture=1&steps=1', server.url).href)
    const initial = await view.evaluate(`Array.from(document.querySelectorAll('.demo-counter output'), b => b.textContent.trim())`)
    expect(initial).toEqual(['2', '9', '4'])
    expect(await view.evaluate(slotAttributes)).toEqual(['Count 2', '3'])
    const revealed = await view.evaluate(`(() => {
      const component = document.querySelector('.demo-counter')
      window.presentationNavigation.go(1, 0)
      const hidden = getComputedStyle(component).visibility === 'hidden'
      window.presentationNavigation.go(1, 1)
      const visible = getComputedStyle(component).visibility === 'visible'
      component.querySelector('[aria-label="Increase counter"]').click()
      return [hidden, visible]
    })()`)
    expect(revealed).toEqual([true, true])
    const updated = await view.evaluate(`Array.from(document.querySelectorAll('.demo-counter output'), b => b.textContent.trim())`)
    expect(updated).toEqual(['3', '9', '4'])
    expect(await view.evaluate(`document.querySelector('.demo-counter output strong')?.textContent`)).toBe('3')
    expect(await view.evaluate(slotAttributes)).toEqual(['Count 3', '4'])
  }
  finally {
    view.close()
    await server.stop(true)
  }
}), 35_000)
