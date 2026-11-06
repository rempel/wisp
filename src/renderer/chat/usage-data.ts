// As contas do painel de uso (Fase 49): somar por projeto, por modelo e por dia.
import { formatUsd } from '../../shared/format'
import type { UsageReport, UsageRow } from '../../shared/ipc'

export const tokensOf = (
  row: Pick<UsageRow, 'input' | 'output' | 'cacheWrite' | 'cacheRead'>
): number => row.input + row.output + row.cacheWrite + row.cacheRead

export const money = (value: number | null): string => (value === null ? '—' : formatUsd(value))

export interface Group {
  name: string
  tokens: number
  output: number
  cost: number | null
}

/** Soma as linhas por um campo (o projeto ou o modelo), da que mais custou para a que menos. */
export function groupBy(rows: UsageRow[], field: 'project' | 'model'): Group[] {
  const groups = new Map<string, Group>()
  for (const row of rows) {
    const group = groups.get(row[field]) ?? { name: row[field], tokens: 0, output: 0, cost: 0 }
    group.tokens += tokensOf(row)
    group.output += row.output
    group.cost = group.cost === null || row.cost === null ? null : group.cost + row.cost
    groups.set(row[field], group)
  }
  return [...groups.values()].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || b.tokens - a.tokens)
}

/** Um valor por dia do período, do mais antigo para o de hoje (os dias sem uso valem zero). */
export function byDay(
  report: UsageReport,
  measure: 'cost' | 'tokens'
): { day: string; value: number }[] {
  const values = new Map<string, number>()
  for (const row of report.rows) {
    const value = measure === 'cost' ? (row.cost ?? 0) : tokensOf(row)
    values.set(row.day, (values.get(row.day) ?? 0) + value)
  }
  const out: { day: string; value: number }[] = []
  const [year, month, date] = report.since.split('-').map(Number)
  for (let i = 0; i < report.days; i++) {
    const d = new Date(year, month - 1, date + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    out.push({ day: key, value: values.get(key) ?? 0 })
  }
  return out
}
