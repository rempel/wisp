// O batimento nas configurações (Fase 84): ligado, os horários, os dias e o "conferir agora". O
// que ele confere é o CHECKLIST.md, que se edita na tela Memória.
import { useState } from 'react'
import type { JSX } from 'react'
import { Row, Section, Toggle } from './SettingsFields'
import type { Settings } from '../../shared/ipc'
import { dateLocale, t } from '../../shared/i18n'

const WEEKDAYS = Array.from({ length: 7 }, (_, day) =>
  // 2023-01-01 foi um domingo.
  new Date(2023, 0, 1 + day).toLocaleDateString(dateLocale(), { weekday: 'short' }).replace('.', '')
)

export function HeartbeatSection({
  values,
  error,
  save
}: {
  values: Settings
  error?: string
  save: (patch: Partial<Settings>) => Promise<boolean>
}): JSX.Element {
  const [times, setTimes] = useState(values.heartbeatTimes.join(', '))
  const [seen, setSeen] = useState(values.heartbeatTimes.join(', '))
  const [message, setMessage] = useState<string | null>(null)
  const joined = values.heartbeatTimes.join(', ')
  if (joined !== seen) {
    setSeen(joined)
    setTimes(joined)
  }
  const commitTimes = (): void => {
    const list = times
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (/^\d:\d\d$/.test(item) ? `0${item}` : item))
    void save({ heartbeatTimes: [...new Set(list)].sort() })
  }
  const runNow = async (): Promise<void> => {
    const first = values.heartbeatTimes[0]
    if (!first) return
    const result = await window.wisp.settings.runTask(`batimento-${first}`)
    setMessage(
      result.ok
        ? t('Conferindo… sem nada a dizer, só o diário fica sabendo.')
        : (result.message ?? t('Não deu para conferir agora.'))
    )
  }
  return (
    <Section title={t('Batimento')}>
      <p className="settings-hint">
        {t(
          'Nos horários, o Wisp confere o seu checklist (a agenda, o GitHub, os lembretes, o e-mail) no Haiku, numa aba à parte, e só fala se houver algo. O checklist se edita na tela Memória (CHECKLIST.md).'
        )}
      </p>
      <Toggle
        label={t('Ligado')}
        checked={values.heartbeat}
        onChange={(heartbeat) => void save({ heartbeat })}
      />
      <Row
        label={t('Horários')}
        hint={t('HH:MM, separados por vírgula: 08:00, 13:00, 17:00.')}
        error={error}
      >
        <input
          type="text"
          value={times}
          spellCheck={false}
          onChange={(event) => setTimes(event.target.value)}
          onBlur={commitTimes}
        />
      </Row>
      <div className="automation-days" role="group" aria-label={t('Dias do batimento')}>
        {WEEKDAYS.map((label, day) => {
          const on = values.heartbeatDays.includes(day)
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              className={on ? 'on' : ''}
              onClick={() =>
                void save({
                  heartbeatDays: on
                    ? values.heartbeatDays.filter((item) => item !== day)
                    : [...values.heartbeatDays, day].sort()
                })
              }
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className="rewind-actions">
        <button
          type="button"
          className="settings-button"
          disabled={!values.heartbeat || !values.heartbeatTimes.length}
          onClick={() => void runNow()}
        >
          {t('Conferir agora')}
        </button>
      </div>
      {message && (
        <p className="settings-hint" role="status">
          {message}
        </p>
      )}
    </Section>
  )
}
