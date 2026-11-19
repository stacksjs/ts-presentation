import { realpath } from 'node:fs/promises'
import type { FrameLink, PowerPointFrame } from './powerpoint.ts'
import type { SlideCanvas } from './canvas.ts'
import { asset } from './assets.ts'
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

export async function captureFrames(options: CaptureOptions, onFrame: (frame: PowerPointFrame, index: number, count: number) => void | Promise<void>): Promise<void> {
  const captureEditable = options.editable ? (await import('./editable/capture.ts')).captureEditable : undefined
  const { width, height } = options.canvas
  const root = await realpath(options.root)
  const preview = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      try {
        const path = decodeURIComponent(new URL(request.url).pathname)
        return asset(root, path === '/' ? '/index.html' : path)
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
    async function capture(): Promise<void> {
      await chrome.navigate('data:text/html,<title>Presentation export</title>')
      await chrome.cdp('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: options.scale, mobile: false,
      })
      await chrome.navigate(new URL(`?capture=1${options.withClicks ? '&steps=1' : ''}`, preview.url).href)
      const clicks = await chrome.evaluate<{ start: number, end: number }[]>(
        "[...document.querySelectorAll('#stage > article')].map(slide => ({ start: Number(slide.dataset.clicksStart), end: Number(slide.dataset.clicks) }))",
      )
      if (!clicks.length || clicks.some(({ start, end }) => !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start)) {
        throw new Error('The browser did not load the presentation player')
      }
      const selected = slideRange(clicks.length, options.range)
      if (!selected.length) throw new Error('Select at least one slide for export')
      const positions = selected.flatMap((slide) => {
        const { start, end } = clicks[slide - 1]
        return options.withClicks ? Array.from({ length: end - start + 1 }, (_, index) => ({ slide, step: start + index })) : [{ slide, step: end }]
      })
      for (const [index, position] of positions.entries()) {
        const metadata = await chrome.evaluate<FrameDetails>(`(async () => {
          location.hash = ${JSON.stringify(`slide-${position.slide}/${position.step}`)}
          window.dispatchEvent(new HashChangeEvent('hashchange'))
          const active = document.querySelector('#stage > article:not([hidden])')
          if (active?.id !== 'slide-${position.slide}') throw new Error('Slide did not become active')
          await document.fonts.ready
          await Promise.all([...active.querySelectorAll('img')].map(image => image.decode()))
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
            const href = internal ? value + (click && /^\\d+$/.test(click) ? '/' + click : '') : link.href
            if ((!internal && !/^(https?:|mailto:|\\/\\/)/i.test(value)) || getComputedStyle(link).visibility !== 'visible') return []
            return [...link.getClientRects()].flatMap(rect => {
              const x = Math.max(bounds.left, rect.left)
              const y = Math.max(bounds.top, rect.top)
              const width = Math.min(bounds.right, rect.right) - x
              const height = Math.min(bounds.bottom, rect.bottom) - y
              return width > 0 && height > 0 ? [{ href, label: link.textContent.trim() || href, x: x - bounds.left, y: y - bounds.top, width, height }] : []
            })
          })
          return { title: active.getAttribute('aria-label') || '', notes, links }
        })()`)
        if (captureEditable) {
          let editable: PowerPointFrame['editable']
          try {
            const { content, warnings } = await captureEditable(chrome, options.canvas, position.slide, position.step, metadata.notes)
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
    }

    await Promise.race([
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
