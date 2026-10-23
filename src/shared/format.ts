// Formatos de data e hora usados no main e no chat.

import { dateLocale, t } from './i18n'

const time = (date: Date): string =>
  date.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })

const dayMonth = (date: Date): string =>
  date.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit' })

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
  if (days === 0) return t('às {v1}', { v1: time(date) })
  if (days === 1) return t('amanhã às {v1}', { v1: time(date) })
  return t('em {v1} às {v2}', { v1: dayMonth(date), v2: time(date) })
}

/** Quando uma conversa aconteceu, para a lista do histórico: "14:32", "ontem", "08/10". */
export function formatWhen(ms: number, now = new Date()): string {
  const date = new Date(ms)
  const days = daysBetween(now, date)
  if (days === 0) return time(date)
  if (days === -1) return t('ontem')
  if (days > -7 && days < 0) {
    return date.toLocaleDateString(dateLocale(), { weekday: 'short' }).replace('.', '')
  }
  if (date.getFullYear() !== now.getFullYear()) {
    return date.toLocaleDateString(dateLocale(), {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    })
  }
  return dayMonth(date)
}

/** Data por extenso curta: "9 de out., 14:32". */
export function formatDate(ms: number): string {
  const date = new Date(ms)
  return `${date.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })}, ${time(date)}`
}

/** Há quanto tempo: "agora", "há 5 min", "há 2 h", "ontem", "08/10". */
export function formatAgo(ms: number, now = Date.now()): string {
  const minutes = Math.floor((now - ms) / 60_000)
  if (minutes < 1) return t('agora')
  if (minutes < 60) return t('há {minutes} min', { minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('há {hours} h', { hours })
  return formatWhen(ms, new Date(now))
}

/** "US$ 0,0123", "US$ 1,25", "< US$ 0,0001". */
export function formatUsd(usd: number): string {
  if (usd > 0 && usd < 0.0001) return t('< US$ 0,0001')
  const digits = usd < 1 ? 4 : 2
  return t('US$ {v1}', {
    v1: usd.toLocaleString(dateLocale(), {
      minimumFractionDigits: 2,
      maximumFractionDigits: digits
    })
  })
}

/** "12,3 mil", "850", "1,2 mi" tokens. */
export function formatTokens(n: number): string {
  if (n >= 1e6)
    return t('{n} mi', { n: (n / 1e6).toLocaleString(dateLocale(), { maximumFractionDigits: 1 }) })
  if (n >= 1e3)
    return t('{n} mil', { n: (n / 1e3).toLocaleString(dateLocale(), { maximumFractionDigits: 1 }) })
  return String(n)
}

/** "US$ 3 / 15" por milhão de tokens (entrada / saída); "grátis"; "" sem preço. */
export function priceLabel(model: { prompt: number | null; completion: number | null }): string {
  if (model.prompt === null || model.completion === null) return ''
  if (model.prompt === 0 && model.completion === 0) return t('grátis')
  const fmt = (n: number): string =>
    n.toLocaleString(dateLocale(), { maximumFractionDigits: n < 1 ? 3 : 2 })
  return t('US$ {v1} / {v2}', { v1: fmt(model.prompt), v2: fmt(model.completion) })
}
