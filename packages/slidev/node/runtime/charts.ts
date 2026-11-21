import type { FlowchartDiagramOptions, GanttChartOptions, GitGraphOptions, JourneyChartOptions, PieChartOptions, QuadrantChartOptions, RelationshipChartOptions, SankeyChartOptions, SequenceChartOptions, TimelineChartOptions, XYChartOptions } from 'ts-charts/diagrams'
import { flowchartDiagram, ganttChart, gitGraphChart, journeyChart, pieChart, quadrantChart, relationshipChart, sankeyChart, sequenceChart, timelineChart, xyChart } from 'ts-charts/diagrams'
import { optionsForSvg } from './diagram-svg.ts'
import { treemapSvg } from './treemap.ts'

type Chart =
  | ({ type: 'flowchart' | 'state' } & FlowchartDiagramOptions)
  | ({ type: 'gantt' } & GanttChartOptions)
  | ({ type: 'gitgraph' } & GitGraphOptions)
  | ({ type: 'journey' } & JourneyChartOptions)
  | ({ type: 'pie' } & PieChartOptions)
  | ({ type: 'quadrant' } & QuadrantChartOptions)
  | ({ type: 'class' | 'er' } & RelationshipChartOptions)
  | ({ type: 'sequence' } & SequenceChartOptions)
  | ({ type: 'timeline' } & TimelineChartOptions)
  | ({ type: 'xy' } & XYChartOptions)
  | ({ type: 'sankey' } & SankeyChartOptions)
  | { type: 'treemap', nodes: unknown }

function chartSvg(chart: Chart & Record<string, unknown>): string | undefined {
  switch (chart.type) {
    case 'flowchart':
    case 'state': return flowchartDiagram({ ...chart, kind: chart.type })
    case 'gantt': return ganttChart(chart)
    case 'gitgraph': return gitGraphChart(chart)
    case 'journey': return journeyChart(chart)
    case 'pie': return pieChart(chart)
    case 'quadrant': return quadrantChart(chart)
    case 'class':
    case 'er': return relationshipChart({ ...chart, kind: chart.type })
    case 'sequence': return sequenceChart(chart)
    case 'timeline': return timelineChart(chart)
    case 'xy': return xyChart(chart)
    case 'sankey': return sankeyChart(chart)
    case 'treemap': return treemapSvg(chart)
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
