// Adapted from Slidev's title-renderer HMR regression (MIT).
import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findChrome } from '../node/runtime/chrome.ts'

const chrome = await findChrome()

test.skipIf(!chrome)('edits native Markdown and applies body and title changes without a browser reload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tp-live-editor-'))
  const entry = join(root, 'slides.md')
  const first = [
    '---', 'title: HMR Repro', '---', '', '# Hello', '', 'Body text', '',
    '---', 'src: ./chapter.md', '---', '',
  ].join('\n')
  const chapter = join(root, 'chapter.md')
  const second = [
    '---', 'routeAlias: second', '---', '', '# Second', '',
    '<p v-click>More</p>', '', '<!--', 'Presenter notes', '-->',
  ].join('\n')
  await writeFile(entry, first)
  await writeFile(chapter, second)
  const server = Bun.spawn([process.execPath, new URL('../node/runtime/cli.ts', import.meta.url).pathname, 'dev', entry, '--port', '0'], {
    cwd: root, stdout: 'pipe', stderr: 'pipe',
  })
  const view = new Bun.WebView({ width: 1340, height: 820, backend: { type: 'chrome', path: chrome!, url: false } })
  async function waitFor(expression: string): Promise<void> {
    const deadline = Date.now() + 5000
    do {
      if (await view.evaluate(expression)) return
      await Bun.sleep(50)
    } while (Date.now() < deadline)
    throw new Error(`Browser never reported ${expression}`)
  }
  try {
    const start = await server.stdout.getReader().read()
    const origin = new TextDecoder().decode(start.value).match(/https?:\/\/[\w.:]+/)?.[0]
    expect(origin).toBeDefined()
    await view.navigate(origin + '#second/1')
    await view.evaluate(`document.querySelector('#overview-button').click()`)
    const overviewLink = `document.querySelector('#overview iframe').contentDocument?.querySelector('[data-overview-slide="2"]')`
    await waitFor(`!!(${overviewLink})`)
    await view.evaluate(`(() => {
      window.loadedOnce = true
      window.originalTitle = document.querySelector('#goto option[value="2"]')
      window.originalOverviewTitle = ${overviewLink}
      window.originalSlide = document.querySelector('#slide-2')
    })()`)

    await writeFile(entry, first.replace('Body text', 'Body text changed'))
    await waitFor(`document.querySelector('#slide-1').textContent.includes('Body text changed')`)
    await waitFor(`document.querySelector('#overview iframe').contentDocument?.querySelector('#slide-1')?.textContent.includes('Body text changed')`)
    expect(await view.evaluate(`window.loadedOnce &&
      window.originalTitle === document.querySelector('#goto option[value="2"]') &&
      window.originalOverviewTitle === ${overviewLink} &&
      window.originalSlide === document.querySelector('#slide-2')`)).toBe(true)
    expect(await view.evaluate(`location.hash`)).toBe('#second/1')

    await writeFile(chapter, second.replace('# Second', '# Second Renamed'))
    await waitFor(`document.querySelector('#goto option[value="2"]').textContent.includes('Second Renamed')`)
    await waitFor(`(${overviewLink})?.textContent.includes('Second Renamed')`)
    expect(await view.evaluate(`window.loadedOnce && window.originalTitle !== document.querySelector('#goto option[value="2"]')`)).toBe(true)
    expect(await view.evaluate(`window.presentationNavigation.clicks`)).toBe(1)
    expect(await view.evaluate(`(${overviewLink}).textContent`)).toContain('Second Renamed')

    await view.evaluate(`document.querySelector('#overview').close()`)
    await view.evaluate(`document.querySelector('#edit-slide').click()`)
    await waitFor(`document.querySelector('#side-editor textarea').value.includes('# Second Renamed')`)
    expect(await view.evaluate(`document.querySelector('#side-editor-path').textContent`)).toContain('chapter.md')
    await view.evaluate(`(() => {
      const input = document.querySelector('#side-editor textarea')
      input.value = input.value.replace('Second Renamed', 'Saved from the editor').replace('Presenter notes', 'Edited notes')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await waitFor(`document.querySelector('#slide-2 h1').textContent === 'Saved from the editor'`)
    expect(await view.evaluate(`document.querySelector('#presenter-notes section:last-child').textContent`)).toContain('Edited notes')
    expect(await view.evaluate(`window.loadedOnce && !document.querySelector('#side-editor').hidden`)).toBe(true)
    expect(await readFile(chapter, 'utf8')).toContain('# Saved from the editor')
    expect(await readFile(entry, 'utf8')).toBe(first.replace('Body text', 'Body text changed'))

    await writeFile(join(root, 'style.css'), ':root { --live-test-value: updated; }\n')
    await waitFor(`getComputedStyle(document.documentElement).getPropertyValue('--live-test-value').trim() === 'updated'`)
    const entryWithThirdSlide = (await readFile(entry, 'utf8')) + [
      '', '---', '', '# Third', '', '<v-drag>New draggable content</v-drag>', '', '~~~ts', 'const value = 1', '~~~', '',
    ].join('\n')
    await writeFile(entry, entryWithThirdSlide)
    await waitFor(`window.presentationNavigation.total === 3`)
    expect(await view.evaluate(`window.loadedOnce && location.hash === '#second/1'`)).toBe(true)
    expect(await view.evaluate(`document.querySelector('#slide-3 [data-presentation-drag]').tabIndex`)).toBe(0)
    expect(await view.evaluate(`document.querySelector('#slide-3 button.code-copy-action').textContent`)).toBe('Copy')

    const external = (await readFile(chapter, 'utf8')).replace('Edited notes', 'On disk')
    await view.evaluate(`document.querySelector('#side-editor textarea').value += '\\nMy unfinished draft'`)
    await writeFile(chapter, external)
    await view.evaluate(`document.querySelector('#side-editor textarea').dispatchEvent(
      new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))`)
    await waitFor(`!document.querySelector('#side-editor-reload').hidden`)
    expect(await view.evaluate(`document.querySelector('#side-editor textarea').value`)).toContain('My unfinished draft')
    expect(await readFile(chapter, 'utf8')).toBe(external)

    const rejected = await fetch(origin + '/__presentation/source', { method: 'POST', body: '{"slide":2}' })
    expect(rejected.status).toBe(403)
  }
  finally {
    view.close()
    server.kill()
    await server.exited
    await rm(root, { recursive: true, force: true })
  }
}, 45000)
