import { realpath } from 'node:fs/promises'
import type { FrameLink, PowerPointFrame } from './powerpoint.ts'
import type { SlideCanvas } from '../../../types/src/canvas.ts'
import type { SlideRoute } from '../../../client/runtime/navigation.ts'
import { deckPath } from '../../../client/runtime/routing.ts'
import { asset } from './assets.ts'
import { dataPicture, maxOriginalPictureBytes, originalPicture } from './editable/pictures.ts'
import type { OriginalPicture } from './editable/pictures.ts'
import type { ExportColorScheme, ExportWaitUntil } from './export-options.ts'
import { addPdfOutline, pdfBookmarks } from './pdf-outline.ts'
import { slideRange } from './selection.ts'

interface BrowserOptions {
  root: string
  executable: string
  scale: number
  canvas: SlideCanvas
  timeout?: number
  wait?: number
  waitUntil?: ExportWaitUntil
  colorScheme?: ExportColorScheme
  base?: string
}

export interface CaptureOptions extends BrowserOptions {
  withClicks: boolean
  range?: string
  editable?: boolean
  omitBackground?: boolean
}

interface FrameDetails {
  title: string
  notes: string
  links: FrameLink[]
}

async function prepareImages(root: Element, visibleOnly = false): Promise<void> {
  const images = [...root.querySelectorAll('img')].filter((image) => {
    if (!visibleOnly) return true
    if (image.closest('[hidden], [data-switch-hidden]')) return false
    return getComputedStyle(image).visibility === 'visible' && image.getClientRects().length > 0
  })
  await Promise.allSettled(images.map((image) => {
    image.loading = 'eager'
    return image.decode()
  }))
}

async function prepareFonts(root: Element): Promise<void> {
  // Layout starts the font requests for this frame. Waiting for individual
  // faces avoids tying an early capture to the document's unrelated load event.
  for (;;) {
    root.getBoundingClientRect()
    const loading = [...document.fonts].filter(face => face.status === 'loading')
    if (!loading.length) return
    await Promise.allSettled(loading.map(face => face.loaded))
  }
}

async function waitForFrame(root: Element, wait: number): Promise<void> {
  const waiting = new Map<Element, string>()
  for (const host of root.querySelectorAll('[data-waitfor]')) {
    const selector = host.getAttribute('data-waitfor')?.trim()
    if (selector && !host.closest('[hidden], [data-reveal-hidden], [data-switch-hidden]')
      && getComputedStyle(host).visibility === 'visible'
      && (host.getClientRects().length || getComputedStyle(host).display === 'contents')) {
      waiting.set(host, selector)
    }
  }
  while (waiting.size) {
    for (const [host, selector] of waiting) {
      if (!root.contains(host)) {
        waiting.delete(host)
        continue
      }
      let targets: NodeListOf<Element>
      try { targets = host.querySelectorAll(selector) }
      catch { throw new Error(`Invalid export readiness selector: ${selector}`) }
      if ([...targets].some(target => {
        if (getComputedStyle(target).visibility !== 'visible') return false
        const rect = target.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })) waiting.delete(host)
    }
    if (waiting.size) await new Promise<void>(resolve => setTimeout(resolve, 25))
  }
  if (wait) await new Promise<void>(resolve => setTimeout(resolve, wait))
}

type PictureReader = (source: string) => Promise<OriginalPicture | undefined>

function pictureReader(root: string, origin: string, base: string): PictureReader {
  const previous = new Map<string, Promise<OriginalPicture | undefined>>()
  async function read(source: string): Promise<OriginalPicture | undefined> {
    if (source.startsWith('data:')) return dataPicture(source)
    const url = URL.parse(source)
    if (url?.origin !== origin) return
    try {
      const path = deckPath(url.pathname, base)
      if (!path) return
      const response = await asset(root, decodeURIComponent(path))
      if (!response.ok || Number(response.headers.get('Content-Length')) > maxOriginalPictureBytes) return
      return originalPicture(await response.bytes())
    }
    catch { return undefined }
  }
  return source => {
    const cached = previous.get(source)
    if (cached) return cached
    const result = read(source)
    previous.set(source, result)
    return result
  }
}

async function navigateForCapture(browser: Bun.WebView, url: string, waitUntil: ExportWaitUntil = 'load'): Promise<void> {
  if (waitUntil === 'load') {
    await browser.navigate(url)
    return
  }
  await browser.cdp('Page.enable')
  await browser.cdp('Page.setLifecycleEventsEnabled', { enabled: true })
  const eventName = { none: 'init', domcontentloaded: 'DOMContentLoaded', networkidle: 'networkIdle' }[waitUntil]
  const ready = Promise.withResolvers<void>()
  const completed = new Set<string>()
  let loaderId: string | undefined
  function track(event: Event): void {
    const { data } = event as MessageEvent<{ name: string, loaderId: string }>
    if (data.name !== eventName) return
    completed.add(data.loaderId)
    if (data.loaderId === loaderId) ready.resolve()
  }
  browser.addEventListener('Page.lifecycleEvent', track)
  try {
    const result = await browser.cdp<{ errorText?: string, loaderId?: string }>('Page.navigate', { url })
    if (result.errorText || !result.loaderId) throw new Error(result.errorText || 'Could not navigate to the export page')
    loaderId = result.loaderId
    if (!completed.has(loaderId)) await ready.promise
  }
  finally { browser.removeEventListener('Page.lifecycleEvent', track) }
  // The early navigation mode still needs the deck player before it can
  // select a slide. It can proceed while unrelated resources keep loading.
  if (waitUntil === 'none') await browser.evaluate(`(async () => {
    while (!window.presentationNavigation) await new Promise(resolve => setTimeout(resolve, 10))
  })()`)
}

async function withExportBrowser<T>(options: BrowserOptions, run: (browser: Bun.WebView, readOriginal: PictureReader) => Promise<T>): Promise<T> {
  const { width, height } = options.canvas
  const base = options.base ?? '/'
  const root = await realpath(options.root)
  const preview = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      try {
        const path = deckPath(new URL(request.url).pathname, base)
        if (!path) return new Response('Not found', { status: 404 })
        return asset(root, path === '/' ? '/index.html' : decodeURIComponent(path), request)
      }
      catch {
        return new Response('Invalid URL', { status: 400 })
      }
    },
  })

  let view: Bun.WebView | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const chrome = new Bun.WebView({
      width,
      height,
      backend: { type: 'chrome', path: options.executable, url: false },
    })
    view = chrome
    async function capture(): Promise<T> {
      await chrome.navigate('data:text/html,<title>Presentation export</title>')
      await chrome.cdp('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: options.scale, mobile: false,
      })
      const page = new URL(`${base}?capture=1&steps=1`, preview.url)
      if (options.colorScheme) {
        await chrome.cdp('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: options.colorScheme }],
        })
        page.searchParams.set('capture-color', options.colorScheme)
      }
      await navigateForCapture(chrome, page.href, options.waitUntil)
      return run(chrome, pictureReader(root, preview.url.origin, base))
    }
    const duration = options.timeout ?? 120_000
    if (!duration) return await capture()
    return await Promise.race([
      capture(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Presentation export did not finish within ${duration}ms`)), duration)
      }),
    ])
  }
  finally {
    if (timeout !== undefined) clearTimeout(timeout)
    view?.close()
    await preview.stop(true)
  }
}

interface Position { slide: number, step: number }

async function exportPositions(browser: Bun.WebView, options: CaptureOptions): Promise<Position[]> {
  const clicks = await browser.evaluate<{ start: number, end: number }[]>(
    "[...document.querySelectorAll('#stage > article')].map(slide => ({ start: Number(slide.dataset.clicksStart), end: Number(slide.dataset.clicks) }))",
  )
  if (!clicks.length || clicks.some(({ start, end }) => !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start)) {
    throw new Error('The browser did not load the presentation player')
  }
  const selected = slideRange(clicks.length, options.range)
  if (!selected.length) throw new Error('Select at least one slide for export')
  return selected.flatMap((slide) => {
    const { start, end } = clicks[slide - 1]
    return options.withClicks ? Array.from({ length: end - start + 1 }, (_, index) => ({ slide, step: start + index })) : [{ slide, step: end }]
  })
}

export async function captureFrames(options: CaptureOptions, onFrame: (frame: PowerPointFrame, index: number, count: number) => void | Promise<void>): Promise<void> {
  const captureEditable = options.editable ? (await import('./editable/capture.ts')).captureEditable : undefined
  await withExportBrowser(options, async (chrome, readOriginal) => {
    if (options.omitBackground)
      await chrome.evaluate("document.documentElement.style.setProperty('--presentation-capture-background', 'transparent')")
    const positions = await exportPositions(chrome, options)
    for (const [index, position] of positions.entries()) {
      const metadata = await chrome.evaluate<FrameDetails>(`(async () => {
        location.hash = ${JSON.stringify(`slide-${position.slide}/${position.step}`)}
        window.dispatchEvent(new HashChangeEvent('hashchange'))
        const active = document.querySelector('#stage > article:not([hidden])')
        if (active?.id !== 'slide-${position.slide}') throw new Error('Slide did not become active')
        await window.presentationMediaReady?.()
        await (${waitForFrame.toString()})(active, ${options.wait ?? 0})
        await (${prepareFonts.toString()})(active)
        await (${prepareImages.toString()})(active, true)
        window.presentationFitText?.(active)
        const note = document.querySelector('#presenter-notes > section[data-has-notes]:not([hidden])')
        const noteSteps = note?.querySelectorAll('[data-note-step]${options.withClicks ? ':not([hidden])' : ''}') ?? []
        const notes = [...noteSteps].map(part => [...part.children].map(node => {
          const copy = node.cloneNode(true)
          copy.querySelectorAll('annotation').forEach(annotation => annotation.remove())
          return copy.textContent.trim()
        }).join('\\n')).filter(Boolean).join('\\n\\n')
        const bounds = active.getBoundingClientRect()
        const links = [...active.querySelectorAll('a[href]')].flatMap(link => {
          const value = link.getAttribute('href').trim()
          const click = link.getAttribute('data-slide-click')
          const internal = /^#slide-[1-9]\\d*$/.test(value) && link.hasAttribute('data-slide-link')
          if ((!internal && !/^(https?:|mailto:|\\/\\/)/i.test(value)) || getComputedStyle(link).visibility !== 'visible'
            || link.closest('[inert], [hidden], [data-reveal-hidden], [data-switch-hidden]')) return []
          const href = internal ? value + (click && /^\\d+$/.test(click) ? '/' + click : '') : URL.parse(value, document.baseURI)?.href
          if (!href) return []
          const inArtwork = !!link.closest('math, .katex, svg')
          return [...link.getClientRects()].flatMap(rect => {
            const x = Math.max(bounds.left, rect.left)
            const y = Math.max(bounds.top, rect.top)
            const width = Math.min(bounds.right, rect.right) - x
            const height = Math.min(bounds.bottom, rect.bottom) - y
            return width > 0 && height > 0 ? [{ href, label: link.textContent.trim() || href, x: x - bounds.left, y: y - bounds.top, width, height, inArtwork }] : []
          })
        })
        return { title: active.getAttribute('aria-label') || '', notes, links }
      })()`)
      if (captureEditable) {
        let editable: PowerPointFrame['editable']
        try {
          const { content, warnings } = await captureEditable(chrome, options.canvas, position.slide, position.step, metadata.notes, readOriginal)
          for (const warning of warnings) console.warn(`Slide ${position.slide}, step ${position.step}: ${warning}`)
          editable = content
        }
        catch (error) {
          console.warn(`Slide ${position.slide}, step ${position.step}: ${error instanceof Error ? error.message : 'could not measure editable content'}`)
        }
        if (editable) {
          await onFrame({ ...metadata, position: { slide: position.slide, click: position.step }, editable }, index, positions.length)
          continue
        }
        console.warn(`Slide ${position.slide}, step ${position.step}: using a slide image`)
      }
      // Editable artwork capture can reset the browser's background override.
      if (options.omitBackground)
        await chrome.cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
      const image = new Uint8Array(await (await chrome.screenshot()).arrayBuffer())
      await onFrame({ ...metadata, position: { slide: position.slide, click: position.step }, image }, index, positions.length)
    }
  })
}

/** Print a snapshot of each requested reveal as a vector PDF page. */
export async function capturePdf(options: CaptureOptions & { withToc?: boolean }): Promise<Uint8Array<ArrayBuffer>> {
  return withExportBrowser(options, async (chrome) => {
    const positions = await exportPositions(chrome, options)
    const bookmarks = options.withToc
      ? pdfBookmarks(await chrome.evaluate<SlideRoute[]>("JSON.parse(document.getElementById('presentation-navigation').textContent)"), positions)
      : []
    await chrome.evaluate(`(async (positions, wait) => {
      const stage = document.getElementById('stage')
      const pages = document.createDocumentFragment()
      const ready = ${waitForFrame.toString()}
      const destinations = new Map()
      for (const { slide, step } of positions) {
        const id = 'presentation-print-' + slide + '-' + step
        if (!destinations.has(String(slide))) destinations.set(String(slide), id)
        destinations.set(slide + '/' + step, id)
      }
      for (const { slide, step } of positions) {
        window.presentationNavigation.go(slide, step)
        const active = stage.querySelector('article:not([hidden])')
        if (active?.id !== 'slide-' + slide) throw new Error('Slide did not become active')
        await ready(active, wait)
        const page = active.cloneNode(true)
        await window.presentationMediaReady?.(page)
        const anchor = document.createElement('span')
        anchor.id = destinations.get(slide + '/' + step)
        anchor.className = 'print-destination'
        anchor.setAttribute('aria-hidden', 'true')
        // An out-of-flow anchor inside the page can be assigned to a later
        // PDF page by Chromium. Keep the marker in flow at the page boundary.
        pages.append(anchor, page)
      }
      const printUrl = new URL(location.href)
      printUrl.hash = ''
      // Chromium compares PDF link destinations against the document's base URL.
      // Give subpath builds the same base as the document being printed.
      document.querySelector('base[href]')?.setAttribute('href', printUrl.href)
      for (const link of pages.querySelectorAll('a[data-slide-link]')) {
        const target = link.dataset.slideLink
        const id = destinations.get(target + '/' + link.dataset.slideClick) ?? destinations.get(target)
        if (id) link.setAttribute('href', '#' + id)
        else link.removeAttribute('href')
      }
      stage.replaceChildren(pages)
      document.body.classList.add('printing-frames')
      await (${prepareFonts.toString()})(stage)
      await (${prepareImages.toString()})(stage)
      window.presentationFitText?.(stage)
    })(${JSON.stringify(positions)}, ${options.wait ?? 0})`)
    return addPdfOutline(await printPdf(chrome), bookmarks, positions.length)
  })
}

async function printPdf(chrome: Bun.WebView): Promise<Buffer<ArrayBuffer>> {
  const result = await chrome.cdp('Page.printToPDF', { printBackground: true, preferCSSPageSize: true }) as { data?: string }
  if (!result.data) throw new Error('Chrome PDF export returned no pages')
  return Buffer.from(result.data, 'base64')
}

const notePrintCss = `
  @page { size: A4; margin: 15mm 16mm 10mm; }
  html, body.printing-notes { width: auto; height: auto; min-height: 0; overflow: visible; }
  body.printing-notes { display: block; margin: 0; background: #fff; color: #161616; font: 11pt/1.55 system-ui, sans-serif; }
  .printing-notes main > h1 { margin: 0 0 18pt; font-size: 27pt; }
  .printing-notes section { margin: 0 0 14pt; padding: 0 0 12pt; break-inside: avoid-page; }
  .printing-notes section + section { border-top: 1px solid #ddd; padding-top: 12pt; }
  .printing-notes section > h2 { margin: 0 0 6pt; font-size: 14pt; break-after: avoid-page; }
  .printing-notes [data-note-step] p { margin: 0 0 6pt; }
  .printing-notes :is(img, table, pre) { max-width: 100%; }
  .printing-notes pre { white-space: pre-wrap; }
`

/** Print the full presenter notes for each selected slide that has notes. */
export async function captureNotesPdf(options: BrowserOptions & { range?: string }): Promise<Uint8Array<ArrayBuffer>> {
  return withExportBrowser(options, async (chrome) => {
    const total = await chrome.evaluate<number>("document.querySelectorAll('#stage > article').length")
    const selected = slideRange(total, options.range)
    await chrome.evaluate(`(async (selected, css) => {
      const slides = [...document.querySelectorAll('#stage > article')]
      const notes = [...document.querySelectorAll('#presenter-notes > section')]
      const title = document.title
      const pages = document.createElement('main')
      const heading = document.createElement('h1')
      heading.textContent = title
      pages.append(heading)
      for (const number of selected) {
        const note = notes[number - 1]
        if (!note?.hasAttribute('data-has-notes')) continue
        const entry = note.cloneNode(true)
        entry.removeAttribute('hidden')
        for (const step of entry.querySelectorAll(':scope > [data-note-step]')) step.removeAttribute('hidden')
        const label = document.createElement('h2')
        label.textContent = number + '/' + slides.length + ' ' + slides[number - 1].getAttribute('aria-label')
        entry.prepend(label)
        pages.append(entry)
      }
      document.title = 'Notes - ' + title
      document.body.className = 'printing-notes'
      document.body.replaceChildren(pages)
      const styles = document.createElement('style')
      styles.textContent = css
      document.head.append(styles)
      await (${waitForFrame.toString()})(pages, ${options.wait ?? 0})
      await (${prepareFonts.toString()})(pages)
      await (${prepareImages.toString()})(pages)
      window.presentationFitText?.(pages)
    })(${JSON.stringify(selected)}, ${JSON.stringify(notePrintCss)})`)
    return printPdf(chrome)
  })
}
