// Os dias anteriores da Wisp (Fase 82): na conversa vazia da aba principal, as conversas dos
// últimos dias, para reabrir (cada uma numa aba sua; a Wisp continua sendo a de hoje).
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { ConversationSummary } from '../../shared/ipc'
import { dateLocale, t } from '../../shared/i18n'

const SHOWN = 7

export function MainDays(): JSX.Element | null {
  const [days, setDays] = useState<ConversationSummary[] | null>(null)

  useEffect(() => {
    let alive = true
    void window.wisp.history.list().then((list) => {
      if (!alive) return
      setDays(
        list
          .filter((item) => item.main && !item.current)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, SHOWN)
      )
    })
    return () => {
      alive = false
    }
  }, [])

  if (!days?.length) return null
  return (
    <nav className="main-days" aria-label={t('Os dias anteriores')}>
      <p>{t('Os dias anteriores:')}</p>
      <ul>
        {days.map((day) => (
          <li key={day.id}>
            <button
              type="button"
              className="link"
              onClick={() => void window.wisp.history.open(day.id)}
            >
              <strong>
                {new Date(day.createdAt).toLocaleDateString(dateLocale(), {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short'
                })}
              </strong>{' '}
              {day.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
