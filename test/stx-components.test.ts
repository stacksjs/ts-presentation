import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { asset } from '../packages/slidev/node/runtime/assets.ts'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { createDeckCompiler } from '../packages/slidev/node/runtime/loader.ts'

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
test.skipIf(!chrome)('hydrates independent instances of an STX counter in a static build', async () => project(async (root) => {
  const starter = fileURLToPath(new URL('../packages/create-app/index.mjs', import.meta.url))
  const deck = join(root, 'starter')
  const scaffold = Bun.spawn([process.execPath, starter, deck], { stdout: 'ignore', stderr: 'pipe' })
  const [scaffoldExit, scaffoldError] = await Promise.all([scaffold.exited, new Response(scaffold.stderr).text()])
  if (scaffoldExit) throw new Error(scaffoldError)
  const entry = join(deck, 'slides.md')
  expect(await Bun.file(entry).text()).toContain('<Counter :start="1" />')
  await Bun.write(entry, '# Counter\n\n<Counter :start="2" v-click />\n\n<Counter :start="9" />\n\n---\n\n# Next\n\n<Counter :start="4" />')
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
  try {
    await view.navigate(new URL('?capture=1&steps=1', server.url).href)
    const initial = await view.evaluate(`Array.from(document.querySelectorAll('.demo-counter output'), b => b.textContent.trim())`)
    expect(initial).toEqual(['2', '9', '4'])
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
  }
  finally {
    view.close()
    await server.stop(true)
  }
}), 35_000)
