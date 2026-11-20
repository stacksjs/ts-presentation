const origin = 'https://embed.bsky.app'
const frameSelector = 'iframe[data-bluesky-authority][data-bluesky-record]'
const hidden = '[hidden], [data-reveal-hidden], [data-switch-hidden]'
const did = /^did:[a-z]+:[a-zA-Z0-9_:.%-]{1,253}$/

async function resolveHandle(handle: string): Promise<string | undefined> {
  try {
    const endpoint = new URL('https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle')
    endpoint.searchParams.set('handle', handle)
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(4_000) })
    if (!response.ok) return
    const { did: identity } = await response.json() as { did?: unknown }
    if (typeof identity === 'string' && did.test(identity)) return identity
  }
  catch {}
}

export function createBlueskyEmbeds(stage: HTMLElement): (slide: HTMLElement) => void {
  const mounted = new WeakSet<HTMLIFrameElement>()
  const handles = new Map<string, Promise<string | undefined>>()
  let nextId = 0

  function resize(event: MessageEvent): void {
    if (event.origin !== origin) return
    const { id, height } = event.data ?? {}
    if (typeof id !== 'string' || typeof height !== 'number' || !Number.isFinite(height) || height < 1 || height > 2_500) return
    for (const frame of stage.querySelectorAll<HTMLIFrameElement>(frameSelector)) {
      if (frame.dataset.blueskyId !== id || frame.contentWindow !== event.source) continue
      frame.height = String(Math.ceil(height))
      frame.parentElement?.setAttribute('data-embed-ready', '')
      break
    }
  }

  async function mount(frame: HTMLIFrameElement): Promise<void> {
    const authority = frame.dataset.blueskyAuthority!
    let identity: string | undefined = authority
    if (!did.test(authority)) {
      const handle = authority.toLowerCase()
      let pending = handles.get(handle)
      if (!pending) {
        pending = resolveHandle(handle)
        handles.set(handle, pending)
      }
      identity = await pending
      if (!identity) handles.delete(handle)
    }
    if (!identity || !frame.isConnected) return
    const id = String(++nextId)
    const url = new URL(`${origin}/embed/${identity}/app.bsky.feed.post/${encodeURIComponent(frame.dataset.blueskyRecord!)}`)
    url.searchParams.set('id', id)
    url.searchParams.set('colorMode', document.documentElement.classList.contains('dark') ? 'dark' : 'light')
    if (nextId === 1) window.addEventListener('message', resize)
    frame.dataset.blueskyId = id
    frame.src = url.href
    frame.hidden = false
  }

  return (slide) => {
    for (const frame of slide.querySelectorAll<HTMLIFrameElement>(frameSelector)) {
      if (mounted.has(frame) || frame.parentElement?.closest(hidden)) continue
      mounted.add(frame)
      void mount(frame)
    }
  }
}
