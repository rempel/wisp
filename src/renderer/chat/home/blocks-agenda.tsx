// Os blocos da agenda (Fase 94): a agenda de hoje, o calendário do mês, a semana em colunas e o
// próximo compromisso. Leem a agenda do Wisp (a do sistema e as por endereço, Fases 8 e 74) pelo
// período que mostram, e releem de minuto em minuto.
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { HomeEvent } from '../../../shared/ipc'
import { CalendarIcon } from '../icons'
import { ArrowLeftIcon, ArrowRightIcon, ClockIcon } from './icons-home'
import { useHome } from './context'
import { addDays, startOfDay, time, untilText } from './format'
import { BlockHead, Empty } from './ui'
import { openSettingsAt } from '../settings-categories'
import { dateLocale, t } from '../../../shared/i18n'

/** Os compromissos do período: undefined carregando, null com a agenda desligada. */
function useAgenda(from: number, to: number): HomeEvent[] | null | undefined {
  const { now: tick } = useHome()
  const [events, setEvents] = useState<{ key: string; list: HomeEvent[] | null } | null>(null)
  const key = `${from}-${to}`
  useEffect(() => {
    let alive = true
    void window.wisp.home.agenda(from, to).then((list) => {
      if (alive) setEvents({ key, list })
    })
    return () => {
      alive = false
    }
  }, [from, to, key, tick])
  return events?.key === key ? events.list : undefined
}

function AgendaOff(): JSX.Element {
  const { onView } = useHome()
  return (
    <Empty>
      {t('A agenda está desligada.')}{' '}
      <button
        type="button"
        className="link"
        onClick={() => {
          openSettingsAt('integracoes')
          onView('settings')
        }}
      >
        {t('Ligar')}
      </button>
    </Empty>
  )
}

/** As cores dos compromissos, em rodízio pelo título (o mesmo título, a mesma cor). */
const TONES = ['tone-accent', 'tone-violet', 'tone-amber', 'tone-green', 'tone-rose']
function toneOf(title: string): string {
  let hash = 0
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return TONES[Math.abs(hash) % TONES.length]
}

function EventRow({ event, now }: { event: HomeEvent; now: number }): JSX.Element {
  const past = !event.allDay && event.end < now
  const current = !event.allDay && event.start <= now && event.end > now
  const next = !event.allDay && event.start > now && event.start - now < 2 * 60 * 60_000
  return (
    <li className={`event${past ? ' past' : ''}${current || next ? ' soon' : ''}`}>
      <span className="event-time">{event.allDay ? t('dia todo') : time(event.start)}</span>
      <span className={`event-bar ${toneOf(event.title)}`} />
      <span className="event-text">
        <strong>{event.title}</strong>
        <small>
          {current
            ? t('agora, até {time}', { time: time(event.end) })
            : next
              ? untilText(event.start, now)
              : (event.location ?? '')}
        </small>
      </span>
    </li>
  )
}

export function AgendaBlock(): JSX.Element {
  const { now } = useHome()
  const today = startOfDay(now)
  const events = useAgenda(today, addDays(today, 1))
  return (
    <>
      <BlockHead icon={<ClockIcon />} title={t('Agenda de hoje')} />
      {events === null ? (
        <AgendaOff />
      ) : events === undefined ? (
        <Empty>{t('Carregando…')}</Empty>
      ) : events.length ? (
        <ul className="events">
          {events.map((event) => (
            <EventRow key={`${event.start}-${event.title}`} event={event} now={now} />
          ))}
        </ul>
      ) : (
        <Empty>{t('Nada marcado para hoje.')}</Empty>
      )}
    </>
  )
}

/** O calendário do mês: um ponto nos dias com compromisso; o clique mostra o dia embaixo. */
export function CalendarBlock(): JSX.Element {
  const { now } = useHome()
  const [offset, setOffset] = useState(0)
  const today = startOfDay(now)
  const [picked, setPicked] = useState(today)
  const base = new Date(today)
  const first = new Date(base.getFullYear(), base.getMonth() + offset, 1)
  const gridStart = addDays(first.getTime(), -first.getDay())
  const gridEnd = addDays(gridStart, 42)
  const events = useAgenda(gridStart, gridEnd)
  const busy = new Set((events ?? []).map((event) => startOfDay(event.start)))
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  // Só as semanas que têm algum dia do mês.
  const weeks = days[35] && new Date(days[35]).getMonth() !== first.getMonth() ? 35 : 42
  const title = first.toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' })
  const ofPicked = (events ?? []).filter((event) => startOfDay(event.start) === picked)
  return (
    <>
      <BlockHead icon={<CalendarIcon />} title={title.charAt(0).toUpperCase() + title.slice(1)}>
        <button
          type="button"
          className="icon-button small"
          aria-label={t('Mês anterior')}
          onClick={() => setOffset(offset - 1)}
        >
          <ArrowLeftIcon />
        </button>
        <button
          type="button"
          className="icon-button small"
          aria-label={t('Próximo mês')}
          onClick={() => setOffset(offset + 1)}
        >
          <ArrowRightIcon />
        </button>
      </BlockHead>
      <div className="month" role="grid" aria-label={title}>
        {days.slice(0, 7).map((day) => (
          <span key={`h${day}`} className="month-weekday" aria-hidden>
            {new Date(day).toLocaleDateString(dateLocale(), { weekday: 'narrow' })}
          </span>
        ))}
        {days.slice(0, weeks).map((day) => {
          const date = new Date(day)
          const out = date.getMonth() !== first.getMonth()
          return (
            <button
              type="button"
              key={day}
              className={`month-day${out ? ' out' : ''}${day === today ? ' today' : ''}${
                day === picked ? ' picked' : ''
              }${busy.has(day) ? ' busy' : ''}`}
              aria-pressed={day === picked}
              aria-label={date.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long' })}
              onClick={() => setPicked(day)}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
      {events === null ? (
        <AgendaOff />
      ) : (
        <ul className="events compact">
          {ofPicked.slice(0, 3).map((event) => (
            <EventRow key={`${event.start}-${event.title}`} event={event} now={now} />
          ))}
          {events && !ofPicked.length && (
            <li className="block-empty">
              {picked === today ? t('Nada marcado para hoje.') : t('Nada marcado nesse dia.')}
            </li>
          )}
        </ul>
      )}
    </>
  )
}

/** A semana em colunas, de segunda a domingo, com a linha do agora. */
export function WeekBlock(): JSX.Element {
  const { now } = useHome()
  const today = startOfDay(now)
  const monday = addDays(today, -((new Date(today).getDay() + 6) % 7))
  const events = useAgenda(monday, addDays(monday, 7))
  const timed = (events ?? []).filter((event) => !event.allDay)
  const hours = timed.map((event) => new Date(event.start).getHours())
  const from = Math.min(8, ...hours)
  const to = Math.max(20, ...timed.map((event) => new Date(event.end).getHours() + 1))
  const span = (to - from) * 60
  const top = (at: number): number => {
    const date = new Date(at)
    return ((date.getHours() * 60 + date.getMinutes() - from * 60) / span) * 100
  }
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  return (
    <>
      <BlockHead icon={<CalendarIcon />} title={t('Esta semana')} />
      {events === null ? (
        <AgendaOff />
      ) : (
        <div className="week">
          <div className="week-head">
            <span />
            {days.map((day) => {
              const date = new Date(day)
              return (
                <span key={day} className={day === today ? 'today' : ''}>
                  {date.toLocaleDateString(dateLocale(), { weekday: 'short' }).replace('.', '')}
                  <strong>{date.getDate()}</strong>
                </span>
              )
            })}
          </div>
          <div className="week-body">
            <div className="week-hours" aria-hidden>
              {Array.from({ length: Math.floor((to - from) / 2) + 1 }, (_, i) => from + i * 2).map(
                (hour) => (
                  <span key={hour} style={{ top: `${((hour - from) / (to - from)) * 100}%` }}>
                    {hour}h
                  </span>
                )
              )}
            </div>
            {days.map((day) => (
              <div key={day} className="week-col">
                {timed
                  .filter((event) => startOfDay(event.start) === day)
                  .map((event) => (
                    <span
                      key={`${event.start}-${event.title}`}
                      className={`week-event ${toneOf(event.title)}`}
                      style={{
                        top: `${top(event.start)}%`,
                        height: `max(18px, ${top(event.end) - top(event.start)}%)`
                      }}
                      title={`${time(event.start)} ${event.title}`}
                    >
                      {event.title}
                    </span>
                  ))}
                {day === today && <span className="week-now" style={{ top: `${top(now)}%` }} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

/** O próximo compromisso (hoje ou amanhã), com quanto falta, e os seguintes. */
export function NextUpBlock(): JSX.Element {
  const { now } = useHome()
  const today = startOfDay(now)
  const events = useAgenda(today, addDays(today, 2))
  const coming = (events ?? []).filter((event) => !event.allDay && event.end > now)
  const [next, ...rest] = coming
  return (
    <>
      <BlockHead icon={<ClockIcon />} title={t('A seguir')} />
      {events === null ? (
        <AgendaOff />
      ) : next ? (
        <>
          <div className="next-up">
            <span className="pill tone-amber">
              {next.start <= now ? t('agora') : untilText(next.start, now)} · {time(next.start)}
            </span>
            <strong>{next.title}</strong>
            {next.location && <small>{next.location}</small>}
          </div>
          <ul className="events compact">
            {rest.slice(0, 3).map((event) => (
              <EventRow key={`${event.start}-${event.title}`} event={event} now={now} />
            ))}
          </ul>
        </>
      ) : (
        <Empty>{events ? t('Nada até amanhã.') : t('Carregando…')}</Empty>
      )}
    </>
  )
}
