import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { WeekSummaries, WeekSummary } from '../../shared/ipc'
import { t, dateLocale } from '../../shared/i18n'
import { weekImage } from './week-image'

const DAY = new Intl.DateTimeFormat(dateLocale(), { day: '2-digit', month: '2-digit' })

/** "1 h 20 min", "45 min", "—". */
function minutes(total: number): string {
  if (total < 1) return '—'
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? t('{h} h {m} min', { h, m }) : `${h} h`
}

/** A diferença para a semana anterior, pequena, ao lado do número. */
function Delta({ now, before }: { now: number; before: number }): JSX.Element | null {
  if (now === before) return null
  return (
    <small className={now > before ? 'up' : 'down'}>
      {now > before ? `+${now - before}` : `−${before - now}`}
    </small>
  )
}

function Stats({ week, before }: { week: WeekSummary; before: WeekSummary | null }): JSX.Element {
  const list = (items: [string, number][]): string =>
    items.map(([name, count]) => `${name} (${count})`).join(', ')
  return (
    <>
      <div className="week-stats">
        <div>
          <strong>
            {week.conversations}
            {before && <Delta now={week.conversations} before={before.conversations} />}
          </strong>
          <span>{week.conversations === 1 ? t('conversa') : t('conversas')}</span>
        </div>
        <div>
          <strong>{minutes(week.claudeMinutes)}</strong>
          <span>{t('o Claude trabalhando')}</span>
        </div>
        <div>
          <strong>
            <em className="plus">+{week.added}</em> <em className="minus">−{week.removed}</em>
          </strong>
          <span>
            {t('linhas em')} {week.edits} {week.edits === 1 ? t('edição') : t('edições')}
          </span>
        </div>
        <div>
          <strong>
            {week.approved}
            <em className="minus"> / {week.denied}</em>
          </strong>
          <span>{t('aprovadas / negadas')}</span>
        </div>
      </div>
      {week.tools.length > 0 && (
        <p className="week-line">
          {t('Mais usadas:')} {list(week.tools)}
        </p>
      )}
      {week.apps.length > 0 && (
        <p className="week-line">
          {t('Apps abertos:')} {list(week.apps)}
        </p>
      )}
      {week.terminal > 0 && (
        <p className="week-line">
          {t('Terminal:')} {week.terminal} {week.terminal === 1 ? t('mensagem') : t('mensagens')}
          {week.projects.length > 0 && ` em ${list(week.projects)}`}
        </p>
      )}
      {week.reminders > 0 && (
        <p className="week-line">
          {t('Lembretes:')} {week.reminders}
        </p>
      )}
    </>
  )
}

/**
 * O resumo da semana, no topo do histórico: esta semana (até agora, comparada com a anterior) ou
 * a semana passada. Só contagens, guardadas neste computador.
 */
export function WeekCard(): JSX.Element | null {
  const [data, setData] = useState<WeekSummaries | null>(null)
  const [which, setWhich] = useState<'current' | 'previous'>('current')
  const [saved, setSaved] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void window.wisp.summary.get().then((summaries) => alive && setData(summaries))
    return () => {
      alive = false
    }
  }, [])
  if (!data?.enabled) return null
  const week = data[which]
  return (
    <section className="week-card" aria-label={t('Resumo da semana')}>
      <div className="week-head">
        <div className="week-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={which === 'current'}
            className={which === 'current' ? 'active' : ''}
            onClick={() => setWhich('current')}
          >
            {t('Esta semana')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={which === 'previous'}
            className={which === 'previous' ? 'active' : ''}
            onClick={() => setWhich('previous')}
          >
            {t('Semana passada')}
          </button>
        </div>
        <span className="week-range">
          {DAY.format(week.from)} a {DAY.format(week.to - 1)}
        </span>
      </div>
      <Stats week={week} before={which === 'current' ? data.previous : null} />
      <div className="week-share">
        <button
          type="button"
          className="link"
          onClick={() =>
            void weekImage(week)
              .then((png) => window.wisp.summary.saveImage(png))
              .then((result) => {
                if (result)
                  setSaved(
                    result.ok ? t('Salva em {path}.', { path: result.path }) : result.message
                  )
              })
              .catch((err: unknown) => setSaved(String(err)))
          }
        >
          {t('Salvar como imagem')}
        </button>
        {saved && <small className="settings-hint">{saved}</small>}
      </div>
    </section>
  )
}
