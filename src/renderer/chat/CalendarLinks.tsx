import { useState } from 'react'
import type { JSX } from 'react'
import type { CalendarLinkInfo, CalendarLinkResult } from '../../shared/ipc'
import { t } from '../../shared/i18n'

/**
 * As agendas por endereço (Fase 40): o endereço iCal do Google, do Outlook ou do iCloud. Ele
 * fica no chaveiro do sistema e nunca volta para a página: aqui aparecem só os nomes.
 */
export function CalendarLinks({ links }: { links: CalendarLinkInfo[] }): JSX.Element {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const run = async (action: () => Promise<CalendarLinkResult>, clear: boolean): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await action()
      if (result.ok) {
        if (clear) {
          setUrl('')
          setName('')
        }
        setMessage(result.note ? { ok: true, text: result.note } : null)
      } else {
        setMessage({ ok: false, text: result.message })
      }
    } finally {
      setBusy(false)
    }
  }
  const add = (): void => {
    if (url.trim()) void run(() => window.wisp.calendar.addLink(url, name), true)
  }

  return (
    <div className={`settings-row${message && !message.ok ? ' invalid' : ''}`}>
      <span className="settings-label">{t('Agendas por endereço')}</span>
      {links.length > 0 && (
        <ul className="calendar-links" aria-label={t('Agendas por endereço guardadas')}>
          {links.map((link) => (
            <li key={link.id}>
              <span>{link.name}</span>
              <button
                type="button"
                className="settings-button"
                disabled={busy}
                aria-label={t('Apagar a agenda {name}', { name: link.name })}
                onClick={() => void run(() => window.wisp.calendar.removeLink(link.id), false)}
              >
                {t('Apagar')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="openrouter-key">
        <input
          type="text"
          className="calendar-link-name"
          value={name}
          placeholder={t('Nome (opcional)')}
          maxLength={80}
          aria-label={t('Nome da agenda')}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && add()}
        />
        <input
          type="password"
          value={url}
          placeholder="https://…/basic.ics"
          autoComplete="off"
          spellCheck={false}
          aria-label={t('Endereço iCal da agenda')}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && add()}
        />
        <button
          type="button"
          className="settings-button"
          disabled={busy || !url.trim()}
          onClick={add}
        >
          {t('Guardar')}
        </button>
      </div>
      {message && (
        <small className={message.ok ? 'settings-hint' : 'settings-error'} role="status">
          {message.text}
        </small>
      )}
      <small className="settings-hint">
        {t(
          'O endereço secreto em formato iCal da agenda (no Google: Configurações da agenda → Integrar agenda; no Outlook: Agenda → Compartilhado → Publicar). Ele fica no chaveiro do sistema, nunca no config.json.'
        )}
      </small>
    </div>
  )
}
