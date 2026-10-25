import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { AgendaItem } from '../../shared/ipc'
import { CalendarIcon } from './icons'
import { dateLocale, t } from '../../shared/i18n'

const CLOCK = new Intl.DateTimeFormat(dateLocale(), { hour: '2-digit', minute: '2-digit' })

/** "hoje às 14:00", "amanhã às 09:30". */
function whenLabel(start: number, now: number): string {
  const day = (ms: number): number => new Date(ms).setHours(0, 0, 0, 0)
  const days = Math.round((day(start) - day(now)) / 86_400_000)
  const prefix =
    days === 0
      ? t('hoje')
      : days === 1
        ? t('amanhã')
        : new Date(start).toLocaleDateString(dateLocale(), { weekday: 'long' })
  return t('{prefix} às {v2}', { prefix, v2: CLOCK.format(start) })
}

/** "em 25 min", "em 2 h", "agora", "termina em 10 min". */
function relativeLabel(event: AgendaItem, now: number): string {
  if (event.start > now) {
    const minutes = Math.ceil((event.start - now) / 60_000)
    if (minutes < 60) return t('em {minutes} min', { minutes })
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest ? t('em {hours} h {rest} min', { hours, rest }) : t('em {hours} h', { hours })
  }
  if (event.end > now) return t('agora, até {v1}', { v1: CLOCK.format(event.end) })
  return t('agora')
}

/** O próximo compromisso da agenda, no painel vazio (a hora relativa anda sozinha). */
export function NextEvent({ event }: { event: AgendaItem }): JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <div className="next-event" aria-label={t('Próximo compromisso')}>
      <CalendarIcon />
      <div>
        <strong>{event.title}</strong>
        <span>
          {event.start > now ? whenLabel(event.start, now) : t('acontecendo')} ·{' '}
          {relativeLabel(event, now)}
          {event.location ? ` · ${event.location}` : ''}
        </span>
      </div>
    </div>
  )
}
