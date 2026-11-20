// O Início (Fase 89): o seu dia num lugar só, em cartões. A agenda de hoje, as próximas tarefas e
// lembretes, o GitHub, o uso do plano, o batimento e a memória, e as conversas recentes; cada
// cartão leva ao lugar dele.
import { useEffect, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import { formatReset } from '../../shared/format'
import type { ConversationSummary, HomeSnapshot, PlanUsage } from '../../shared/ipc'
import type { ChatView } from './ChatHeader'
import { openSettingsAt } from './settings-categories'
import { dateLocale, t } from '../../shared/i18n'

const time = (at: number): string =>
  new Date(at).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })

/** "hoje 17:00", "amanhã 08:00" ou "sex 08:00". */
function when(at: number): string {
  const date = new Date(at)
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (date.toDateString() === today.toDateString()) return time(at)
  if (date.toDateString() === tomorrow.toDateString()) return `${t('amanhã')} ${time(at)}`
  return `${date.toLocaleDateString(dateLocale(), { weekday: 'short' }).replace('.', '')} ${time(at)}`
}

function greeting(): string {
  const hour = new Date().getHours()
  return hour < 12 ? t('Bom dia') : hour < 18 ? t('Boa tarde') : t('Boa noite')
}

function Card({
  title,
  action,
  onAction,
  wide,
  children
}: {
  title: string
  action?: string
  onAction?: () => void
  wide?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <section className={`home-card${wide ? ' wide' : ''}`} aria-label={title}>
      <header>
        <h3>{title}</h3>
        {action && onAction && (
          <button type="button" className="link" onClick={onAction}>
            {action}
          </button>
        )}
      </header>
      {children}
    </section>
  )
}

function UsageBar({
  label,
  used,
  resetsAt
}: {
  label: string
  used: number
  resetsAt: number | null
}): JSX.Element {
  const percent = Math.round(used * 100)
  return (
    <div className={`home-usage${used >= 0.8 ? ' high' : used >= 0.5 ? ' mid' : ''}`}>
      <div className="home-usage-head">
        <span>{label}</span>
        <strong>{percent}%</strong>
      </div>
      <div
        className="usage-bar"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      {resetsAt !== null && <small>{t('reinicia {when}', { when: formatReset(resetsAt) })}</small>}
    </div>
  )
}

export function HomeView({
  onView,
  usage
}: {
  onView: (view: ChatView) => void
  usage: PlanUsage | null
}): JSX.Element {
  const [home, setHome] = useState<HomeSnapshot | null>(null)
  const [recent, setRecent] = useState<ConversationSummary[]>([])

  useEffect(() => {
    let alive = true
    const load = (): void => {
      void window.wisp.chat.home().then((next) => {
        if (alive) setHome(next)
      })
      void window.wisp.history.list().then((list) => {
        if (alive) setRecent([...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6))
      })
    }
    load()
    // Aberto, ele se atualiza de minuto em minuto.
    const timer = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const today = new Date().toLocaleDateString(dateLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  })
  const githubLines = (home?.github ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)

  return (
    <div className="home">
      <div className="home-hello">
        <h1>{greeting()}</h1>
        <p>{today}</p>
      </div>
      <div className="home-grid">
        <Card title={t('Agenda de hoje')}>
          {home?.events === null ? (
            <p className="home-empty">
              {t('A agenda está desligada (Configurações → Integrações).')}
            </p>
          ) : home?.events.length ? (
            <ul className="home-list">
              {home.events.map((event) => (
                <li key={`${event.start}-${event.title}`}>
                  <span className="home-time">
                    {event.allDay ? t('dia todo') : time(event.start)}
                  </span>
                  <span className="home-text">
                    {event.title}
                    {event.location && <small>{event.location}</small>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="home-empty">{home ? t('Nada marcado para hoje.') : t('Carregando…')}</p>
          )}
        </Card>

        <Card
          title={t('Próximas tarefas e lembretes')}
          action={t('Ver todas')}
          onAction={() => {
            openSettingsAt('assistente')
            onView('settings')
          }}
        >
          {home && (home.tasks.length || home.reminders.length) ? (
            <ul className="home-list">
              {[
                ...home.reminders.map((item) => ({
                  key: `r${item.at}`,
                  at: item.at,
                  text: `⏰ ${item.text}`,
                  sub: ''
                })),
                ...home.tasks.map((item) => ({
                  key: item.id,
                  at: item.at,
                  text: item.name,
                  sub: item.schedule
                }))
              ]
                .sort((a, b) => a.at - b.at)
                .slice(0, 6)
                .map((item) => (
                  <li key={item.key}>
                    <span className="home-time">{when(item.at)}</span>
                    <span className="home-text">
                      {item.text}
                      {item.sub && <small>{item.sub}</small>}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="home-empty">
              {home ? t('Nada agendado. Peça ao Wisp: "toda segunda às 8h…".') : t('Carregando…')}
            </p>
          )}
        </Card>

        <Card title="GitHub">
          {githubLines.length ? (
            <ul className="home-list plain">
              {githubLines.map((line) => (
                <li key={line}>{line.replace(/^[-*]\s*/, '')}</li>
              ))}
            </ul>
          ) : (
            <p className="home-empty">
              {home ? t('Nada do GitHub agora (ou ele está desligado).') : t('Carregando…')}
            </p>
          )}
        </Card>

        <Card title={t('Uso do plano')} action={t('Detalhes')} onAction={() => onView('usage')}>
          {usage && (usage.session || usage.week) ? (
            <>
              {usage.session && (
                <UsageBar
                  label={t('5 horas')}
                  used={usage.session.used}
                  resetsAt={usage.session.resetsAt}
                />
              )}
              {usage.week && (
                <UsageBar
                  label={t('Semana')}
                  used={usage.week.used}
                  resetsAt={usage.week.resetsAt}
                />
              )}
            </>
          ) : (
            <p className="home-empty">{t('O uso aparece depois da primeira resposta do dia.')}</p>
          )}
        </Card>

        <Card title={t('Memória')} action={t('Abrir')} onAction={() => onView('memory')}>
          {home?.heartbeat && <p className="home-heartbeat">💓 {home.heartbeat}</p>}
          {home?.notes.length ? (
            <ul className="home-list plain">
              {home.notes.map((note) => (
                <li key={note.at}>{note.text}</li>
              ))}
            </ul>
          ) : (
            <p className="home-empty">
              {home
                ? t('Nada anotado ainda. Conte algo ao Wisp ("lembra que…").')
                : t('Carregando…')}
            </p>
          )}
        </Card>

        <Card
          title={t('Conversas recentes')}
          action={t('Ver todas')}
          onAction={() => onView('history')}
        >
          {recent.length ? (
            <ul className="home-list">
              {recent.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="home-link"
                    onClick={() => {
                      void window.wisp.history.open(item.id)
                      onView('chat')
                    }}
                  >
                    <span className="home-text">
                      {item.main ? `Wisp · ${item.title}` : item.title}
                    </span>
                    <span className="home-time">{when(item.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="home-empty">{t('As conversas aparecem aqui.')}</p>
          )}
        </Card>
      </div>
    </div>
  )
}
