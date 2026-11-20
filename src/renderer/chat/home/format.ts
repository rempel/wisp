// Os textos de tempo do Início: a hora, "amanhã 08:00", "em 58 min", a saudação.
import { dateLocale, t } from '../../../shared/i18n'

export const time = (at: number): string =>
  new Date(at).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })

const sameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString()

/** "17:00" (hoje), "amanhã 08:00" ou "sex 08:00". */
export function when(at: number, now = Date.now()): string {
  const date = new Date(at)
  const today = new Date(now)
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (sameDay(date, today)) return time(at)
  if (sameDay(date, tomorrow)) return `${t('amanhã')} ${time(at)}`
  return `${date.toLocaleDateString(dateLocale(), { weekday: 'short' }).replace('.', '')} ${time(at)}`
}

/** "hoje", "amanhã", "ontem" ou "27 nov" (um prazo, sem a hora se for o dia todo). */
export function dueText(at: number, now = Date.now()): string {
  const date = new Date(at)
  const today = new Date(now)
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0
  const day = sameDay(date, today)
    ? t('hoje')
    : sameDay(date, tomorrow)
      ? t('amanhã')
      : sameDay(date, yesterday)
        ? t('ontem')
        : date.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }).replace('.', '')
  return hasTime ? `${day} ${time(at)}` : day
}

/** "em 58 min", "em 2 h 10 min", "agora". */
export function untilText(at: number, now = Date.now()): string {
  const minutes = Math.round((at - now) / 60_000)
  if (minutes <= 0) return t('agora')
  if (minutes < 60) return t('em {n} min', { n: minutes })
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? t('em {h} h {m} min', { h, m }) : t('em {h} h', { h })
}

/** "58 min", "1 h 10" (o que falta, curto, para o meio dos anéis). */
export function shortLeft(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}

export function greeting(now = new Date()): string {
  const hour = now.getHours()
  return hour < 12 ? t('Bom dia') : hour < 18 ? t('Boa tarde') : t('Boa noite')
}

/** O começo do dia (0h, no fuso local). */
export function startOfDay(at: number): number {
  const date = new Date(at)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Soma dias a um instante, pelo calendário (as mudanças de horário não atrapalham). */
export function addDays(at: number, days: number): number {
  const date = new Date(at)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime()
}
