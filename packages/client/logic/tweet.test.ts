import { describe, expect, it } from 'bun:test'
import { findChrome } from '../../slidev/node/runtime/chrome.ts'
import { resolveTweetId } from './tweet.ts'

const chrome = await findChrome()

describe('resolveTweetId', () => {
  it('keeps the existing id input', () => {
    expect(resolveTweetId(123, undefined)).toBe('123')
    expect(resolveTweetId(' 456 ', undefined)).toBe('456')
  })

  it('prefers id when both inputs are present', () => {
    expect(resolveTweetId('123', 'https://x.com/slidevjs/status/456')).toBe('123')
  })

  it.each([
    'https://x.com/slidevjs/status/123',
    'https://www.x.com/slidevjs/status/123?s=20',
    'https://twitter.com/slidevjs/status/123',
    'https://mobile.twitter.com/slidevjs/status/123/photo/1',
    'https://x.com/i/web/status/123',
  ])('extracts an id from %s', (url) => {
    expect(resolveTweetId(undefined, url)).toBe('123')
  })

  it.each([
    'https://example.com/slidevjs/status/123',
    'https://x.com.example.com/slidevjs/status/123',
    'https://x.com/slidevjs/status/not-a-number',
    'javascript:alert(1)',
    'not a URL',
  ])('rejects an unsupported source URL: %s', (url) => {
    expect(resolveTweetId(undefined, url)).toBeUndefined()
  })
})

it('renders a sandboxed widget with a post link and preserves fenced examples', async () => {
  const { parseDeck, renderDeck } = await import('../../slidev/node/runtime/index.ts')
  const source = [
    '---', 'colorSchema: light', '---', '', '# Social example', '',
    '<Tweet :id="123" url="https://x.com/demo/status/456" scale="0.8" cards="hidden" conversation="all" />',
    '', '~~~html', '<Tweet id="999" />', '~~~',
  ].join('\n')
  const html = await renderDeck(parseDeck(source))
  expect(html.match(/data-presentation-tweet/g)).toHaveLength(1)
  expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"')
  expect(html).toContain('style="zoom:0.8"')
  expect(html).toContain('https://x.com/i/web/status/123')
  expect(html).toContain('theme=light')
  expect(html).toContain('hideThread=false')
  expect(html).toContain('hideCard=true')
  expect(html).toContain('https://platform.twitter.com/embed/Tweet.html')
  expect(html).not.toContain('/status/456')
})

it.skipIf(!chrome)('resizes an isolated Tweet frame through the browser player', async () => {
  const { parseDeck, renderDeck } = await import('../../slidev/node/runtime/index.ts')
  const html = (await renderDeck(parseDeck('# Widget\n\n<Tweet id="123" />')))
    .replace(/src="https:\/\/platform\.twitter\.com\/embed\/Tweet\.html[^"]*"/, 'src="about:blank"')
  const bundle = await Bun.build({ entrypoints: [new URL('../runtime/player.ts', import.meta.url).pathname], target: 'browser' })
  if (!bundle.success) throw new AggregateError(bundle.logs, 'Could not build the player')
  const script = await bundle.outputs[0].text()
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      return new URL(request.url).pathname === '/presentation.js'
        ? new Response(script, { headers: { 'Content-Type': 'text/javascript' } })
        : new Response(html, { headers: { 'Content-Type': 'text/html' } })
    },
  })
  const browser = new Bun.WebView({ width: 1060, height: 675, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await browser.navigate(server.url.href)
    const height = await browser.evaluate(`(() => {
      const iframe = document.querySelector('iframe[data-presentation-tweet]')
      const resize = (origin, id) => window.dispatchEvent(new MessageEvent('message', {
        origin, source: iframe.contentWindow,
        data: { 'twttr.embed': { method: 'twttr.private.resize', params: [{ height: 140, data: { tweet_id: id } }] } },
      }))
      resize('https://example.com', '123')
      resize('https://platform.twitter.com', '999')
      const ignored = iframe.height
      resize('https://platform.twitter.com', '123')
      return { ignored, accepted: iframe.height }
    })()`)
    expect(height).toEqual({ ignored: '80', accepted: '140' })
  }
  finally {
    browser.close()
    await server.stop(true)
  }
}, 15_000)
