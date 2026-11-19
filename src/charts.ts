import type { FlowchartDiagramOptions, JourneyChartOptions, TimelineChartOptions } from 'ts-charts/diagrams'
import { flowchartDiagram, journeyChart, timelineChart } from 'ts-charts/diagrams'
import { optionsForSvg } from './diagram-svg.ts'

type Chart =
  | ({ type: 'flowchart' } & FlowchartDiagramOptions)
  | ({ type: 'journey' } & JourneyChartOptions)
  | ({ type: 'timeline' } & TimelineChartOptions)

/** Render a typed ts-charts diagram from an authored YAML fence. */
export function renderChart(source: string, idPrefix: string): string | undefined {
  if (source.length > 30_000) return
  try {
    const parsed: unknown = Bun.YAML.parse(source)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
    const chart = { ...parsed, idPrefix } as Chart & Record<string, unknown>
    const svg = chart.type === 'flowchart' ? flowchartDiagram(chart)
      : chart.type === 'journey' ? journeyChart(chart)
        : chart.type === 'timeline' ? timelineChart(chart) : undefined
    return svg && optionsForSvg(svg, chart)
  }
  catch {
    // Keep the source visible when YAML or chart data is invalid.
    return
  }
}
