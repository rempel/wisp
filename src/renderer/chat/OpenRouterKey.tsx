import { useState } from 'react'
import type { JSX } from 'react'
import type { OpenRouterKeyResult } from '../../shared/ipc'
import { t } from '../../shared/i18n'

/** A chave da OpenRouter: fica no chaveiro do sistema, nunca no config.json. */
export function OpenRouterKey({ present }: { present: boolean | null }): JSX.Element {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const run = async (action: () => Promise<OpenRouterKeyResult>, done: string): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await action()
      if (result.ok) {
        setDraft('')
        setMessage({
          ok: true,
          text: result.note ?? (result.label ? `${done} (${result.label}).` : `${done}.`)
        })
      } else {
        setMessage({ ok: false, text: result.message })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`settings-row${message && !message.ok ? ' invalid' : ''}`}>
      <span className="settings-label">{t('Chave')}</span>
      <div className="openrouter-key">
        <input
          type="password"
          value={draft}
          placeholder={present ? t('•••••••• guardada') : 'sk-or-…'}
          autoComplete="off"
          spellCheck={false}
          aria-label={t('Chave da OpenRouter')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && draft.trim()) {
              void run(() => window.wisp.openrouter.setKey(draft), 'Chave conferida e guardada')
            }
          }}
        />
        <button
          type="button"
          className="settings-button"
          disabled={busy || !draft.trim()}
          onClick={() =>
            void run(() => window.wisp.openrouter.setKey(draft), 'Chave conferida e guardada')
          }
        >
          {t('Guardar')}
        </button>
        {present && (
          <button
            type="button"
            className="settings-button"
            disabled={busy}
            onClick={() => void run(() => window.wisp.openrouter.clearKey(), 'Chave apagada')}
          >
            {t('Apagar')}
          </button>
        )}
      </div>
      <small className="settings-hint">
        {present === null
          ? t('Não consegui consultar o chaveiro do sistema (Secret Service).')
          : present
            ? t(
                'Guardada no chaveiro do sistema. Nunca vai para o config.json nem para o registro.'
              )
            : t(
                'Crie uma em openrouter.ai/keys. Ela fica no chaveiro do sistema, nunca no config.json.'
              )}
      </small>
      {message && (
        <small className={message.ok ? 'settings-hint' : 'settings-error'} role="status">
          {message.text}
        </small>
      )}
    </div>
  )
}
