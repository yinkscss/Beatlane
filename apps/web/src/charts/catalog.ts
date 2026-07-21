/** In-repo sample charts (G5–G6). Storage catalog arrives in G12. */

export type SampleChartMeta = {
  id: string
  title: string
  difficulty: 'easy' | 'normal'
  /** Public URL under Vite `public/`. */
  url: string
}

export const SAMPLE_CHARTS: readonly SampleChartMeta[] = [
  {
    id: 'sample-easy',
    title: 'Lane Warmup',
    difficulty: 'easy',
    url: '/charts/sample-easy.json',
  },
  {
    id: 'sample-normal',
    title: 'Pulse Run',
    difficulty: 'normal',
    url: '/charts/sample-normal.json',
  },
] as const

export function sampleChartById(id: string): SampleChartMeta | undefined {
  return SAMPLE_CHARTS.find((c) => c.id === id)
}
