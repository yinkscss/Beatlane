import { parseChart, type Chart } from '@/charts/schema'

const cache = new Map<string, Chart>()

/** Fetch + validate a chart JSON from `public/charts` (or any URL). */
export async function loadChart(url: string): Promise<Chart> {
  const hit = cache.get(url)
  if (hit) return hit

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Chart fetch failed: ${url} (${res.status})`)
  const raw: unknown = await res.json()
  const chart = parseChart(raw)
  cache.set(url, chart)
  return chart
}

export function clearChartCache(): void {
  cache.clear()
}
