// Formatos de data e hora usados no main e no chat.

const time = (date: Date): string =>
  date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

const dayMonth = (date: Date): string =>
  date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

/** Quantos dias de calendário separam as duas datas (positivo se `date` vem depois). */
function daysBetween(now: Date, date: Date): number {
  const start = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((start(date) - start(now)) / 86_400_000)
}

/**
 * Quando um limite libera, do jeito que se fala: "às 15:40" hoje, "amanhã às 09:00", "em 12/10
 * às 09:00" depois. `resetsAt` em segundos Unix.
 */
export function formatReset(resetsAt: number, now = new Date()): string {
  const date = new Date(resetsAt * 1000)
  const days = daysBetween(now, date)
  if (days === 0) return `às ${time(date)}`
  if (days === 1) return `amanhã às ${time(date)}`
  return `em ${dayMonth(date)} às ${time(date)}`
}

/** Quando uma conversa aconteceu, para a lista do histórico: "14:32", "ontem", "08/10". */
export function formatWhen(ms: number, now = new Date()): string {
  const date = new Date(ms)
  const days = daysBetween(now, date)
  if (days === 0) return time(date)
  if (days === -1) return 'ontem'
  if (days > -7 && days < 0) {
    return date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  }
  if (date.getFullYear() !== now.getFullYear()) {
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }
  return dayMonth(date)
}

/** Data por extenso curta: "9 de out., 14:32". */
export function formatDate(ms: number): string {
  const date = new Date(ms)
  return `${date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}, ${time(date)}`
}

/** Há quanto tempo: "agora", "há 5 min", "há 2 h", "ontem", "08/10". */
export function formatAgo(ms: number, now = Date.now()): string {
  const minutes = Math.floor((now - ms) / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return formatWhen(ms, new Date(now))
}
