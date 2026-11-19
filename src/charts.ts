import type { FlowchartDiagramOptions, GanttChartOptions, GitGraphOptions, JourneyChartOptions, PieChartOptions, RelationshipChartOptions, SequenceChartOptions, TimelineChartOptions } from 'ts-charts/diagrams'
import { flowchartDiagram, ganttChart, gitGraphChart, journeyChart, pieChart, relationshipChart, sequenceChart, timelineChart } from 'ts-charts/diagrams'
import { optionsForSvg } from './diagram-svg.ts'

type Chart =
  | ({ type: 'flowchart' | 'state' } & FlowchartDiagramOptions)
  | ({ type: 'gantt' } & GanttChartOptions)
  | ({ type: 'gitgraph' } & GitGraphOptions)
  | ({ type: 'journey' } & JourneyChartOptions)
  | ({ type: 'pie' } & PieChartOptions)
  | ({ type: 'class' | 'er' } & RelationshipChartOptions)
  | ({ type: 'sequence' } & SequenceChartOptions)
  | ({ type: 'timeline' } & TimelineChartOptions)

function chartSvg(chart: Chart): string | undefined {
  switch (chart.type) {
    case 'flowchart':
    case 'state': return flowchartDiagram({ ...chart, kind: chart.type })
    case 'gantt': return ganttChart(chart)
    case 'gitgraph': return gitGraphChart(chart)
    case 'journey': return journeyChart(chart)
    case 'pie': return pieChart(chart)
    case 'class':
    case 'er': return relationshipChart({ ...chart, kind: chart.type })
    case 'sequence': return sequenceChart(chart)
    case 'timeline': return timelineChart(chart)
  }
}

/** Render a typed ts-charts diagram from an authored YAML fence. */
export function renderChart(source: string, idPrefix: string): string | undefined {
  if (source.length > 30_000) return
  try {
    const parsed: unknown = Bun.YAML.parse(source)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
    const chart = { ...parsed, idPrefix } as Chart & Record<string, unknown>
    const svg = chartSvg(chart)
    return svg && optionsForSvg(svg, chart)
  }
  catch {
    // Keep the source visible when YAML or chart data is invalid.
    return
  }
}
