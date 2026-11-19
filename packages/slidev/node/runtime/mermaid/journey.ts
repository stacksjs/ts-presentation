import { journeyChart } from 'ts-charts/diagrams'
import type { MermaidOptions } from '../authoring-setup.ts'
import { readChronology } from './chronology.ts'

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

export function journey(source: string, marker: string, options: MermaidOptions): string | undefined {
  const chart = readChronology(source, typeof options.title === 'string' ? options.title : '')
  if (!chart || !/^journey$/i.test(chart.header)) return
  const phases = phasesFrom(chart.rows)
  if (!phases?.length) return
  const settings = options.journey as Record<string, unknown> | undefined
  function numeric(key: string): number | undefined {
    const value = settings?.[key]
    return typeof value === 'number' ? value : undefined
  }
  function palette(key: string): string[] | undefined {
    const value = settings?.[key]
    return Array.isArray(value) ? value.map(color => typeof color === 'string' ? color : '') : undefined
  }
  return journeyChart({
    title: chart.title, accessibleTitle: chart.accessibleTitle, description: chart.description, idPrefix: marker,
    phases, cardWidth: numeric('width'), cardHeight: numeric('height'), taskGap: numeric('taskMargin'),
    marginX: numeric('diagramMarginX'), marginY: numeric('diagramMarginY'),
    actorColors: palette('actorColours'), sectionFills: palette('sectionFills'), sectionColors: palette('sectionColours'),
  })
}
