import { path } from 'ts-charts/path'
import type { MermaidOptions } from '../authoring-setup.ts'
import { escapeHtml } from '../html.ts'
import { chronologyColor, chronologyInk, chronologySvg, readChronology, safeColor, wrappedLabel } from './chronology.ts'
import { svgTextLines } from './svg.ts'

interface Task { name: string, score: number, actors: string[] }
interface Phase { name: string, tasks: Task[] }

function phasesFrom(rows: string[]): Phase[] | undefined {
  const phases: Phase[] = [{ name: '', tasks: [] }]
  let taskCount = 0
  for (const row of rows) {
    const section = /^section\s+([^:]+)$/i.exec(row)
    if (section) {
      phases.push({ name: section[1], tasks: [] })
      continue
    }
    const match = /^([^:]+):\s*([1-5])(?:\s*:\s*([^:]+))?$/.exec(row)
    if (!match || ++taskCount > 150) return
    const actors = [...new Set(match[3]?.split(',').map(actor => actor.trim()).filter(Boolean) ?? [])]
    phases.at(-1)!.tasks.push({ name: match[1].trim(), score: Number(match[2]), actors })
  }
  return phases.filter(phase => phase.tasks.length)
}

function pixels(setting: unknown, fallback: number, min: number, max: number): number {
  return typeof setting === 'number' && Number.isFinite(setting) ? Math.max(min, Math.min(max, Math.round(setting))) : fallback
}

function settingColor(list: unknown, index: number): string | undefined {
  return Array.isArray(list) && list.length ? safeColor(list[index % list.length]) : undefined
}

interface LegendItem { color: string, x: number, y: number, lines: string[] }

export function journey(source: string, marker: string, options: MermaidOptions): string | undefined {
  const chart = readChronology(source, typeof options.title === 'string' ? options.title : '')
  if (!chart || !/^journey$/i.test(chart.header)) return
  const phases = phasesFrom(chart.rows)
  if (!phases?.length) return
  const settings = options.journey as Record<string, unknown> | undefined
  const cardWidth = pixels(settings?.width, 154, 100, 360)
  const textLimit = Math.floor((cardWidth - 12) / 8)
  const taskMargin = pixels(settings?.taskMargin, 12, 4, 80)
  const inset = pixels(settings?.diagramMarginX, 18, 10, 80)
  const bottom = pixels(settings?.diagramMarginY, 18, 10, 80)
  const columnWidth = cardWidth + taskMargin
  const tasks = phases.flatMap(phase => phase.tasks)
  const names = [...new Set(tasks.flatMap(task => task.actors))]
  if (names.length > 100) return
  const actorColors = new Map(names.map((name, index) => [name, settingColor(settings?.actorColours, index) ?? chronologyColor(index)]))
  const left = inset + 28
  const width = Math.max(280, left + tasks.length * columnWidth - taskMargin + inset)
  const legend: LegendItem[] = []
  let legendX = left
  let legendY = chart.title ? 43 : 12
  let legendRowHeight = 0
  for (const [name, color] of actorColors) {
    const limit = Math.max(14, Math.min(24, Math.floor((width - left - inset - 25) / 8)))
    const lines = wrappedLabel(name, limit)
    const itemWidth = Math.max(...lines.map(line => line.length)) * 8 + 26
    if (legendX + itemWidth > width - inset && legendX > left) {
      legendX = left
      legendY += legendRowHeight + 6
      legendRowHeight = 0
    }
    const itemHeight = lines.length * 16
    legend.push({ color, x: legendX, y: legendY + itemHeight / 2, lines })
    legendX += itemWidth + 12
    legendRowHeight = Math.max(legendRowHeight, itemHeight)
  }
  const headingsY = legendY + (legend.length ? legendRowHeight + 14 : 0)
  const hasSections = phases.some(phase => phase.name)
  const sectionLines = phases.map(phase => wrappedLabel(phase.name, Math.max(12, phase.tasks.length * textLimit)))
  const titleHeight = hasSections ? Math.max(...sectionLines.map(lines => lines.length * 16 + 12)) : 0
  const cardsY = headingsY + (hasSections ? titleHeight + 8 : 0)
  const actorsPerRow = Math.max(1, Math.floor((cardWidth - 16) / 17))
  const dotRows = Math.max(...tasks.map(task => Math.ceil(task.actors.length / actorsPerRow)))
  const taskLabels = tasks.map(task => wrappedLabel(task.name, textLimit))
  const nameHeight = Math.max(...taskLabels.map(lines => lines.length * 16))
  const boxHeight = Math.max(pixels(settings?.height, 48, 30, 130), nameHeight + dotRows * 17 + 16)
  const scaleTop = cardsY + boxHeight + 26
  const scaleStep = 21
  const scoreY = (score: number) => scaleTop + (5 - score) * scaleStep
  const height = scoreY(1) + bottom + 9
  const plotted = path()
  const cards: string[] = []
  let taskIndex = 0
  const bands = phases.map((phase, index) => {
    const phaseX = left + taskIndex * columnWidth
    const phaseWidth = phase.tasks.length * columnWidth - taskMargin
    const fill = settingColor(settings?.sectionFills, index) ?? chronologyColor(index)
    const ink = settingColor(settings?.sectionColours, index) ?? chronologyInk
    const band = phase.name ? `<g class="diagram-journey-section" style="--chronology-fill:${fill};--chronology-ink:${ink}"><rect x="${phaseX}" y="${headingsY}" width="${phaseWidth}" height="${titleHeight}" rx="6"/>${svgTextLines(sectionLines[index], phaseX + phaseWidth / 2, headingsY + titleHeight / 2)}</g>` : ''
    for (const task of phase.tasks) {
      const x = left + taskIndex * columnWidth
      const center = x + cardWidth / 2
      const y = scoreY(task.score)
      if (taskIndex === 0) plotted.moveTo(center, y)
      else plotted.lineTo(center, y)
      const dots = task.actors.map((actor, index) => {
        const row = Math.floor(index / actorsPerRow)
        const col = index % actorsPerRow
        const count = Math.min(actorsPerRow, task.actors.length - row * actorsPerRow)
        const dotX = center + (col - (count - 1) / 2) * 17
        return `<circle class="diagram-journey-actor" cx="${dotX}" cy="${cardsY + nameHeight + 17 + row * 17}" r="5" fill="${actorColors.get(actor)}"><title>${escapeHtml(actor)}</title></circle>`
      }).join('')
      const accessible = escapeHtml(`${task.name}, ${task.score} out of 5${task.actors.length ? `, ${task.actors.join(', ')}` : ''}`)
      cards.push(`<g class="diagram-journey-task" data-score="${task.score}" style="--chronology-fill:${fill};--chronology-ink:${ink}"><title>${accessible}</title><rect x="${x}" y="${cardsY}" width="${cardWidth}" height="${boxHeight}" rx="6"/>${svgTextLines(taskLabels[taskIndex], center, cardsY + (dotRows ? nameHeight / 2 + 7 : boxHeight / 2))}${dots}<circle class="diagram-journey-score" cx="${center}" cy="${y}" r="6"/></g>`)
      taskIndex++
    }
    return band
  }).join('')
  const guide = [5, 4, 3, 2, 1].map((score) => {
    const y = scoreY(score)
    return svgTextLines([String(score)], inset, y, 'diagram-journey-axis-label') + `<path class="diagram-chronology-guide" d="M${left} ${y}H${width - inset}"/>`
  }).join('')
  const key = legend.map(actor => `<circle class="diagram-journey-actor" cx="${actor.x + 6}" cy="${actor.y}" r="5" fill="${actor.color}"/>${svgTextLines(actor.lines, actor.x + 16, actor.y, '', 'start')}`).join('')
  const body = `<g data-diagram-kind="journey">${guide}${key}${bands}<path class="diagram-journey-trajectory" d="${plotted}"/>${cards.join('')}</g>`
  const safeMarker = /^[\w-]+$/.test(marker) ? marker : 'journey'
  return chronologySvg(chart, safeMarker, 'User journey', width, height, body)
}
