// Adapted from the SlidevVideo and Youtube component examples (MIT).
import { expect, test } from 'bun:test'
import { asset } from '../packages/slidev/node/runtime/assets.ts'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { parseDeck, renderDeck } from '../packages/slidev/node/runtime/index.ts'

const deck = [
  '# Media',
  '',
  `<SlidevVideo id="walkthrough" v-click="1" :autoplay="'once'" :timestamp="0.4" autoreset="click" :print-timestamp="'last'" playsinline controls muted width="320">`,
  '  <source src="/media.webm" type="video/webm" />',
  '  Video playback is unavailable.',
  '</SlidevVideo>',
  '',
  `<SlidevVideo id="poster" :src="'/media.webm'" printPoster="/poster.svg" :controls="false" width="160" height="120" />`,
  '',
  '<Youtube id="luoMHjh-XcQ?start=42" v-click="1" :width="480" height="270" title="Recorded demo" />',
  '',
  '<Youtube id="example.com" />',
  '',
  '---',
  '',
  '# End',
].join('\n')

const fixtures = new URL('./fixtures', import.meta.url).pathname

test('serves the requested byte range for local video seeking', async () => {
  const bytes = await Bun.file(`${fixtures}/media.webm`).bytes()
  const get = (range: string) => asset(fixtures, '/media.webm', new Request('http://localhost/media.webm', { headers: { range } }))
  const part = await get('bytes=4-10')
  expect(part.status).toBe(206)
  expect(part.headers.get('content-range')).toBe(`bytes 4-10/${bytes.length}`)
  expect(await part.bytes()).toEqual(bytes.slice(4, 11))
  expect(await (await get('bytes=-8')).bytes()).toEqual(bytes.slice(-8))
  expect((await get(`bytes=${bytes.length}-`)).status).toBe(416)
})

test('compiles media components, source slots, and explicit static bindings', async () => {
  const html = await renderDeck(parseDeck(deck))
  expect(html).toContain('data-video-autoplay="once"')
  expect(html).toContain('data-video-reset="click"')
  expect(html).toContain('data-video-time="0.4"')
  expect(html).toContain('data-video-print-time="last"')
  expect(html).toContain('data-video-print-poster="/poster.svg"')
  expect(html).toContain('<source src="/media.webm" type="video/webm" />')
  expect(html).toMatch(/<video id="poster"[^>]* src="\/media\.webm"[^>]*><\/video>/)
  expect(html).toContain('data-presentation-youtube="https://www.youtube.com/embed/luoMHjh-XcQ?start=42" title="Recorded demo" width="480" height="270"')
  expect(html).toContain('href="https://www.youtube.com/watch?v=luoMHjh-XcQ&amp;t=42s"')
  expect(html).toContain('<span class="slidev-youtube">Video unavailable</span>')
  expect(html).not.toContain('<SlidevVideo')
})

const chrome = await findChrome()
test.skipIf(!chrome)('plays once at the reveal, resets on rewind, and captures the requested final video frame', async () => {
  const html = await renderDeck(parseDeck(deck))
  const player = await Bun.build({
    entrypoints: [new URL('../packages/client/runtime/player.ts', import.meta.url).pathname],
    target: 'browser',
    format: 'iife',
  })
  expect(player.success).toBe(true)
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      switch (new URL(request.url).pathname) {
        case '/': return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        case '/presentation.js': return new Response(player.outputs[0])
        case '/presentation.css': return new Response(Bun.file(new URL('../packages/client/runtime/player.css', import.meta.url)))
        case '/media.webm': return asset(fixtures, '/media.webm', request)
        case '/poster.svg': return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><rect width="64" height="48" fill="green"/></svg>', { headers: { 'Content-Type': 'image/svg+xml' } })
        default: return new Response(null, { status: 404 })
      }
    },
  })
  const view = new Bun.WebView({ width: 960, height: 620, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await view.navigate('data:text/html,<title>Media test</title>')
    await view.cdp('Network.enable', {})
    await view.cdp('Network.setBlockedURLs', { urls: ['*youtube.com/*'] })
    await view.navigate(new URL('?presenter=1', server.url).href)
    expect(await view.evaluate(`[
      document.querySelector('#walkthrough').paused,
      document.querySelector('#walkthrough').hasAttribute('data-reveal-hidden'),
      document.querySelector('[data-presentation-youtube]').hasAttribute('src'),
    ]`)).toEqual([true, true, false])
    expect(await view.evaluate(`(async () => {
      const video = document.querySelector('#walkthrough')
      const frame = document.querySelector('[data-presentation-youtube]')
      const playing = new Promise((resolve, reject) => {
        video.addEventListener('playing', resolve, { once: true })
        setTimeout(() => reject(new Error('Video did not play at the reveal')), 2500)
      })
      window.presentationNavigation.go(1, 1)
      await playing
      const startedAtTimestamp = video.currentTime >= 0.38
      const embedded = !frame.hidden && frame.src.endsWith('luoMHjh-XcQ?start=42')
      video.currentTime = 1.2
      window.presentationNavigation.go(1, 0)
      const reset = video.paused && Math.abs(video.currentTime - 0.4) < 0.02
      const unloaded = frame.hidden && !frame.hasAttribute('src')
      window.presentationNavigation.go(1, 1)
      const playedOnce = video.paused
      window.presentationNavigation.go(2, 0)
      return [startedAtTimestamp, embedded, reset, unloaded, playedOnce, video.paused]
    })()`)).toEqual([true, true, true, true, true, true])

    await view.navigate(new URL('?capture=1&steps=1#slide-1/1', server.url).href)
    expect(await view.evaluate(`(async () => {
      const active = document.querySelector('#slide-1')
      const copy = active.cloneNode(true)
      await window.presentationMediaReady(copy)
      const still = copy.querySelector('img#walkthrough')
      if (!still) {
        const video = active.querySelector('#walkthrough')
        throw new Error(JSON.stringify({ time: video.currentTime, ready: video.readyState, duration: video.duration, error: video.error?.message, markup: video.outerHTML, hash: location.hash }))
      }
      await still.decode()
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      ctx.drawImage(still, 0, 0)
      const [red, , blue] = ctx.getImageData(4, 4, 1, 1).data
      const video = active.querySelector('#walkthrough')
      return [
        video.paused, !video.controls, video.currentTime > 1.8,
        red < 30 && blue > 220,
        copy.querySelector('img#poster').getAttribute('src'),
        !active.querySelector('[data-presentation-youtube]').hasAttribute('src'),
      ]
    })()`)).toEqual([true, true, true, true, '/poster.svg', true])
  }
  finally {
    view.close()
    server.stop(true)
  }
}, 45_000)
