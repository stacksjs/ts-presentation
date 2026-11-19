const videoSelector = 'video[data-presentation-video]'
const youtubeSelector = 'iframe[data-presentation-youtube]'
const hidden = '[hidden], [data-reveal-hidden], [data-switch-hidden]'

declare global {
  interface Window {
    presentationMediaReady?: (copy?: HTMLElement) => Promise<void>
  }
}

function seek(video: HTMLVideoElement, time: number): void {
  if (!Number.isFinite(time)) return
  video.currentTime = Number.isFinite(video.duration) ? Math.min(time, video.duration) : time
}

async function waitForMedia(ready: () => boolean, deadline: number, failed: () => boolean = () => false): Promise<boolean> {
  while (!ready()) {
    if (failed() || performance.now() >= deadline) return false
    await new Promise<void>(resolve => setTimeout(resolve, 30))
  }
  return true
}

interface Still {
  video?: HTMLVideoElement
  poster?: string
}

async function prepareStill(video: HTMLVideoElement): Promise<Still> {
  video.controls = false
  const poster = video.dataset.videoPrintPoster ?? video.poster
  const timestamp = video.dataset.videoPrintTime
  const deadline = performance.now() + 3_000
  if ((timestamp || !poster) && (video.hasAttribute('src') || video.querySelector('source[src]'))) {
    video.removeAttribute('poster')
    if (video.readyState === 0 && !video.error) {
      video.preload = 'auto'
      video.load()
    }
    const failed = () => !!video.error
    if (await waitForMedia(() => video.readyState >= 1, deadline, failed)) {
      const time = timestamp === 'last' ? Math.max(0, video.duration - 0.001) : Number(timestamp ?? video.dataset.videoTime ?? 0)
      seek(video, time)
      if (await waitForMedia(() => video.readyState >= 2 && !video.seeking, deadline, failed)) return { video, poster }
    }
  }
  if (poster) {
    video.poster = poster
    const image = new Image()
    image.src = poster
    await waitForMedia(() => image.complete, deadline)
  }
  return { poster }
}

function stillImage({ video, poster }: Still): string | undefined {
  if (!video) return poster
  try {
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) return poster
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  }
  catch {
    // Remote videos without CORS can play while their decoded pixels are unavailable to canvas.
    return poster
  }
}

export function createSlideMedia(interactive: boolean): {
  show: (slide: HTMLElement) => void
  ready: (copy?: HTMLElement) => Promise<void>
} {
  let current: HTMLElement | undefined
  let activeVideos = new Set<HTMLVideoElement>()
  let activeEmbeds = new Set<HTMLIFrameElement>()
  const initialized = new WeakSet<HTMLVideoElement>()
  const played = new WeakSet<HTMLVideoElement>()
  const stills = new WeakMap<HTMLVideoElement, ReturnType<typeof prepareStill>>()
  const snapshots = new WeakMap<HTMLVideoElement, string>()
  function still(video: HTMLVideoElement): ReturnType<typeof prepareStill> {
    const cached = stills.get(video)
    if (cached) return cached
    const prepared = prepareStill(video)
    stills.set(video, prepared)
    return prepared
  }

  function show(slide: HTMLElement): void {
    const visibleVideos = new Set([...slide.querySelectorAll<HTMLVideoElement>(videoSelector)].filter(video => !video.closest(hidden)))
    if (!interactive) {
      current = slide
      for (const video of visibleVideos) void still(video)
      return
    }
    for (const video of activeVideos) {
      if (visibleVideos.has(video)) continue
      video.pause()
      if (video.dataset.videoReset === 'click') seek(video, Number(video.dataset.videoTime ?? 0))
    }
    if (current && current !== slide) {
      for (const video of current.querySelectorAll<HTMLVideoElement>(videoSelector)) {
        if (initialized.has(video) && video.dataset.videoReset === 'slide') seek(video, Number(video.dataset.videoTime ?? 0))
      }
    }
    for (const video of visibleVideos) {
      if (activeVideos.has(video)) continue
      if (!initialized.has(video)) {
        initialized.add(video)
        video.addEventListener('play', () => played.add(video), { once: true })
        if (video.dataset.videoTime) seek(video, Number(video.dataset.videoTime))
      }
      const autoplay = video.dataset.videoAutoplay
      if (autoplay === 'true' || (autoplay === 'once' && !played.has(video))) void video.play().catch(() => {})
    }
    const visibleEmbeds = new Set([...slide.querySelectorAll<HTMLIFrameElement>(youtubeSelector)].filter(frame => !frame.parentElement?.closest(hidden)))
    for (const frame of activeEmbeds) {
      if (visibleEmbeds.has(frame)) continue
      frame.hidden = true
      frame.removeAttribute('src')
    }
    for (const frame of visibleEmbeds) {
      if (activeEmbeds.has(frame)) continue
      frame.src = frame.dataset.presentationYoutube!
      frame.hidden = false
    }
    current = slide
    activeVideos = visibleVideos
    activeEmbeds = visibleEmbeds
  }

  async function ready(copy?: HTMLElement): Promise<void> {
    if (interactive || !current) return
    const copies = copy?.querySelectorAll<HTMLVideoElement>(videoSelector)
    await Promise.all([...current.querySelectorAll<HTMLVideoElement>(videoSelector)].map(async (video, index) => {
      if (video.closest(hidden)) return
      const prepared = await still(video)
      const target = copies?.[index]
      if (!target) return
      let src = snapshots.get(video)
      if (!src) {
        src = stillImage(prepared)
        if (src) snapshots.set(video, src)
      }
      if (!src) return
      const image = document.createElement('img')
      for (const name of target.getAttributeNames()) {
        if (!['src', 'poster', 'preload', 'controls'].includes(name)) image.setAttribute(name, target.getAttribute(name)!)
      }
      image.alt = target.getAttribute('aria-label') ?? ''
      image.src = src
      target.replaceWith(image)
    }))
  }

  return { show, ready }
}
