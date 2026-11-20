// Os dias do Início (Fase 96): a chave AAAA-MM-DD de um dia e a sequência de dias seguidos de um
// hábito. Usados no main e na página.

/** AAAA-MM-DD do dia, no fuso do computador. */
export function dayKey(at: number): string {
  const date = new Date(at)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Quantos dias seguidos o hábito foi feito, até hoje (ou até ontem, se hoje ainda não). */
export function streak(days: string[], now = Date.now()): number {
  const set = new Set(days)
  const date = new Date(now)
  if (!set.has(dayKey(date.getTime()))) date.setDate(date.getDate() - 1)
  let count = 0
  while (set.has(dayKey(date.getTime()))) {
    count++
    date.setDate(date.getDate() - 1)
  }
  return count
}
