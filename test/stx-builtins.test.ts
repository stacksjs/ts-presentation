import { expect, test } from 'bun:test'
import { findChrome } from '../packages/slidev/node/runtime/chrome.ts'
import { parseDeck, renderDeck } from '../src/index.ts'

const direct = 'at://did:plc:432mbsu2xucyvxl6sluohidu/app.bsky.feed.post/3lgwg2vy44s2q'
const byHandle = 'https://bsky.app/profile/sli.dev/post/3la7gcgfwpe2n'

test('renders built-in STX templates from HTML and Comark with bound props and literal examples', async () => {
  const html = await renderDeck(parseDeck([
    '---', 'comark: true', `post: ${direct}`, '---', '', '# Social posts',
    '', '<BlueSky :uri="frontmatter.post" :scale="0.8" v-click />',
    '', `:blue-sky{uri="${byHandle}"}`,
    '', '<BlueSky uri="https://example.com/profile/sli.dev/post/3la7gcgfwpe2n" />',
    '', ':powered-by-slidev', '', 'Credit: <PoweredBySlidev />',
    '', '~~~html', '<BlueSky uri="literal" />', '~~~',
  ].join('\n')))

  expect(html.match(/<iframe data-bluesky-authority=/g)).toHaveLength(2)
  expect(html).toContain('class="slidev-bluesky" style="zoom:0.8" v-click=""')
  expect(html).toContain('data-bluesky-authority="did:plc:432mbsu2xucyvxl6sluohidu" data-bluesky-record="3lgwg2vy44s2q"')
  expect(html).toContain('data-bluesky-authority="sli.dev" data-bluesky-record="3la7gcgfwpe2n"')
  expect(html).toContain(`href="${byHandle}"`)
  expect(html).toContain('Bluesky post unavailable')
  expect(html).toContain('literal')
  expect(html).not.toContain('https://example.com/profile')
  expect(html).not.toContain('<BlueSky')
  expect(html.match(/class="slidev-credit"/g)).toHaveLength(2)
  expect(html).toContain('href="https://sli.dev/"')
  expect(html).not.toContain('tp-component-')
})

const chrome = await findChrome()
test.skipIf(!chrome)('loads Bluesky only on reveal and keeps a post link in capture mode', async () => {
  const html = await renderDeck(parseDeck([
    '---', 'colorSchema: light', '---', '', '# Social posts',
    '', `<BlueSky uri="${direct}" />`,
    '', `<BlueSky uri="${byHandle}" v-click />`,
    '', `<BlueSky uri="at://sli.dev/app.bsky.feed.post/another" v-click="1" />`,
  ].join('\n')))
  const stub = `<script>
    window.handleRequests = [];
    window.requestedEmbedUrls = [];
    window.fetch = async (url) => {
      window.handleRequests.push(String(url));
      return Response.json({ did: 'did:plc:432mbsu2xucyvxl6sluohidu' });
    };
    const src = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
    Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
      ...src,
      set(value) {
        if (String(value).startsWith('https://embed.bsky.app/')) {
          window.requestedEmbedUrls.push(String(value));
          value = 'about:blank';
        }
        src.set.call(this, value);
      },
    });
  </script>`
  const bundle = await Bun.build({ entrypoints: [new URL('../packages/client/runtime/player.ts', import.meta.url).pathname], target: 'browser' })
  if (!bundle.success) throw new AggregateError(bundle.logs, 'Could not build the player')
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch(request) {
      if (new URL(request.url).pathname === '/presentation.js') return new Response(bundle.outputs[0], { headers: { 'Content-Type': 'text/javascript' } })
      return new Response(html.replace('</head>', `${stub}</head>`), { headers: { 'Content-Type': 'text/html' } })
    },
  })
  const browser = new Bun.WebView({ width: 1060, height: 675, backend: { type: 'chrome', path: chrome!, url: false } })
  try {
    await browser.navigate(server.url.href)
    expect(await browser.evaluate('window.requestedEmbedUrls')).toEqual([
      'https://embed.bsky.app/embed/did:plc:432mbsu2xucyvxl6sluohidu/app.bsky.feed.post/3lgwg2vy44s2q?id=1&colorMode=light',
    ])
    expect(await browser.evaluate('window.handleRequests')).toEqual([])
    await browser.press('ArrowRight')
    const afterReveal = await browser.evaluate<{ handles: string[], urls: string[], ignored: string, accepted: string }>(`(async () => {
      for (let i = 0; i < 50 && window.requestedEmbedUrls.length < 3; i++) await new Promise(resolve => setTimeout(resolve, 20));
      const [frame, other] = document.querySelectorAll('iframe[data-bluesky-id]');
      const resize = (origin, source, id, height) => window.dispatchEvent(new MessageEvent('message', { origin, source, data: { id, height } }));
      resize('https://example.com', frame.contentWindow, '1', 320);
      resize('https://embed.bsky.app', other.contentWindow, '1', 320);
      resize('https://embed.bsky.app', frame.contentWindow, '1', 3000);
      const ignored = frame.height;
      resize('https://embed.bsky.app', frame.contentWindow, '1', 319.25);
      return { handles: window.handleRequests, urls: window.requestedEmbedUrls, ignored, accepted: frame.height };
    })()`)
    expect(afterReveal.handles).toEqual(['https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=sli.dev'])
    expect(afterReveal.urls.slice(1)).toEqual([
      'https://embed.bsky.app/embed/did:plc:432mbsu2xucyvxl6sluohidu/app.bsky.feed.post/3la7gcgfwpe2n?id=2&colorMode=light',
      'https://embed.bsky.app/embed/did:plc:432mbsu2xucyvxl6sluohidu/app.bsky.feed.post/another?id=3&colorMode=light',
    ])
    expect(afterReveal.ignored).toBe('1')
    expect(afterReveal.accepted).toBe('320')
    await browser.navigate(new URL('?capture=1#slide-1', server.url).href)
    expect(await browser.evaluate('window.requestedEmbedUrls')).toEqual([])
    expect(await browser.evaluate(`document.querySelector('.slidev-bluesky > a').textContent`)).toBe('View post on Bluesky')
  }
  finally {
    browser.close()
    await server.stop(true)
  }
}, 15_000)
