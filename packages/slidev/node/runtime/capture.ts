import { realpath } from 'node:fs/promises'
import type { FrameLink, PowerPointFrame } from './powerpoint.ts'
import type { SlideCanvas } from '../../../types/src/canvas.ts'
import { asset } from './assets.ts'
import { dataPicture, maxOriginalPictureBytes, originalPicture } from './editable/pictures.ts'
import type { OriginalPicture } from './editable/pictures.ts'
import { slideRange } from './selection.ts'

interface CaptureOptions {
  root: string
  executable: string
  scale: number
  withClicks: boolean
  range?: string
  canvas: SlideCanvas
  editable?: boolean
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

type PictureReader = (source: string) => Promise<OriginalPicture | undefined>

function pictureReader(root: string, origin: string): PictureReader {
  const previous = new Map<string, Promise<OriginalPicture | undefined>>()
  async function read(source: string): Promise<OriginalPicture | undefined> {
    if (source.startsWith('data:')) return dataPicture(source)
    const url = URL.parse(source)
    if (url?.origin !== origin) return
    try {
      const response = await asset(root, decodeURIComponent(url.pathname))
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

async function withExportBrowser<T>(options: CaptureOptions, run: (browser: Bun.WebView, readOriginal: PictureReader) => Promise<T>): Promise<T> {
  const { width, height } = options.canvas
  const root = await realpath(options.root)
  const preview = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      try {
        const path = decodeURIComponent(new URL(request.url).pathname)
        return asset(root, path === '/' ? '/index.html' : path, request)
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
      await chrome.navigate(new URL('?capture=1&steps=1', preview.url).href)
      return run(chrome, pictureReader(root, preview.url.origin))
    }
    return await Promise.race([
      capture(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Slide capture did not finish within 120 seconds')), 120_000)
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
    const positions = await exportPositions(chrome, options)
    for (const [index, position] of positions.entries()) {
      const metadata = await chrome.evaluate<FrameDetails>(`(async () => {
        location.hash = ${JSON.stringify(`slide-${position.slide}/${position.step}`)}
        window.dispatchEvent(new HashChangeEvent('hashchange'))
        const active = document.querySelector('#stage > article:not([hidden])')
        if (active?.id !== 'slide-${position.slide}') throw new Error('Slide did not become active')
        await window.presentationMediaReady?.()
        await document.fonts.ready
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
      const image = new Uint8Array(await (await chrome.screenshot()).arrayBuffer())
      await onFrame({ ...metadata, position: { slide: position.slide, click: position.step }, image }, index, positions.length)
    }
  })
}

/** Print a snapshot of each requested reveal as a vector PDF page. */
export async function capturePdf(options: CaptureOptions): Promise<Uint8Array<ArrayBuffer>> {
  return withExportBrowser(options, async (chrome) => {
    const positions = await exportPositions(chrome, options)
    await chrome.evaluate(`(async (positions) => {
      const stage = document.getElementById('stage')
      const pages = document.createDocumentFragment()
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
        const page = active.cloneNode(true)
        await window.presentationMediaReady?.(page)
        const anchor = document.createElement('span')
        anchor.id = destinations.get(slide + '/' + step)
        anchor.className = 'print-destination'
        anchor.setAttribute('aria-hidden', 'true')
        page.prepend(anchor)
        for (const link of page.querySelectorAll('a[data-slide-link]')) {
          const target = link.dataset.slideLink
          const id = destinations.get(target + '/' + link.dataset.slideClick) ?? destinations.get(target)
          if (id) link.hash = id
          else link.removeAttribute('href')
        }
        pages.append(page)
      }
      stage.replaceChildren(pages)
      document.body.classList.add('printing-frames')
      await document.fonts.ready
      await (${prepareImages.toString()})(stage)
      window.presentationFitText?.(stage)
    })(${JSON.stringify(positions)})`)
    const result = await chrome.cdp('Page.printToPDF', { printBackground: true, preferCSSPageSize: true }) as { data?: string }
    if (!result.data) throw new Error('Chrome PDF export returned no pages')
    return Buffer.from(result.data, 'base64')
  })
}
