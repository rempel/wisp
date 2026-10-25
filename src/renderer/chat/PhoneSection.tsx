import { useState } from 'react'
import type { JSX } from 'react'
import type { PhoneResult, PhoneStatus } from '../../shared/ipc'
import { QrCode } from './QrCode'
import { Row, Toggle } from './SettingsFields'
import { t } from '../../shared/i18n'

/** O pareamento com o celular (ntfy): o QR code, o teste e ligar ou desligar. */
export function PhoneSection({ status }: { status: PhoneStatus }): JSX.Element {
  const [server, setServer] = useState(status.server)
  const [token, setToken] = useState('')
  const [link, setLink] = useState<{ link: string; web: string } | null>(null)
  const [busy, setBusy] = useState<'pair' | 'confirm' | 'other' | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const finish = (result: PhoneResult, done?: string): void => {
    if (result.ok) {
      const text = result.message ?? done
      setMessage(text ? { ok: true, text } : null)
    } else {
      setMessage({ ok: false, text: result.message })
    }
  }

  const pair = async (): Promise<void> => {
    setBusy('pair')
    setMessage(null)
    try {
      const result = await window.wisp.phone.pair(server, token)
      if (!result.ok) return setMessage({ ok: false, text: result.message })
      setToken('')
      setLink({ link: result.link, web: result.web })
      setMessage({
        ok: true,
        text: t(
          'Pareamento guardado no chaveiro. Leia o QR code com o app do ntfy e mande o teste.'
        )
      })
    } finally {
      setBusy(null)
    }
  }

  const confirm = async (): Promise<void> => {
    setBusy('confirm')
    setMessage(null)
    try {
      const result = await window.wisp.phone.confirm()
      finish(result)
      if (result.ok) setLink(null)
    } finally {
      setBusy(null)
    }
  }

  const other = async (action: () => Promise<PhoneResult>, done?: string): Promise<void> => {
    setBusy('other')
    setMessage(null)
    try {
      finish(await action(), done)
    } finally {
      setBusy(null)
    }
  }

  const showLink = async (): Promise<void> => {
    const result = await window.wisp.phone.link()
    if (result.ok) setLink({ link: result.link, web: result.web })
    else setMessage({ ok: false, text: result.message })
  }

  const pairing = !status.paired || link !== null
  return (
    <div className="phone-section">
      <Toggle
        label={t('Aprovar pelo celular')}
        hint={
          status.enabled
            ? t('Ligado: os cards que esperam por você vão para o celular.')
            : status.paired
              ? t('Pareado. Para ligar, o Wisp manda um teste e espera o celular confirmar.')
              : t('Desligado. Pareie um celular abaixo.')
        }
        checked={status.enabled}
        onChange={(enabled) => {
          if (!enabled) void other(() => window.wisp.phone.disable(), 'Desligado.')
          else if (status.paired) void confirm()
          else setMessage({ ok: false, text: 'Pareie um celular antes.' })
        }}
      />
      {pairing && !link && (
        <>
          <Row label={t('Servidor do ntfy')} hint={t('O público (https://ntfy.sh) ou um seu.')}>
            <input
              type="text"
              value={server}
              spellCheck={false}
              aria-label={t('Servidor do ntfy')}
              onChange={(event) => setServer(event.target.value)}
            />
          </Row>
          <Row
            label={t('Ficha de acesso')}
            hint={t('Opcional: a de um servidor com login (tk_…). Fica no chaveiro do sistema.')}
          >
            <input
              type="password"
              value={token}
              autoComplete="off"
              spellCheck={false}
              aria-label={t('Ficha de acesso do ntfy')}
              onChange={(event) => setToken(event.target.value)}
            />
          </Row>
          <div className="settings-row">
            <button
              type="button"
              className="settings-button phone-pair"
              disabled={busy !== null || !server.trim()}
              onClick={() => void pair()}
            >
              {t('Parear um celular')}
            </button>
          </div>
        </>
      )}
      {link && (
        <div className="phone-link">
          <QrCode text={link.link} />
          <div className="phone-steps">
            <ol>
              <li>{t('Instale o app do ntfy no celular (Play Store, F-Droid ou App Store).')}</li>
              <li>
                {t(
                  'Leia o QR code com a câmera (ou, no app, toque em + e cole o tópico do link abaixo).'
                )}
              </li>
              <li>{t('Mande o teste e toque em Confirmar na notificação.')}</li>
            </ol>
            <code className="phone-topic">{link.web}</code>
            <div className="phone-buttons">
              {busy === 'confirm' ? (
                <>
                  <span className="settings-hint" role="status">
                    {t('Esperando o celular…')}
                  </span>
                  <button
                    type="button"
                    className="settings-button"
                    onClick={() => window.wisp.phone.cancel()}
                  >
                    {t('Cancelar')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="settings-button phone-test"
                    disabled={busy !== null}
                    onClick={() => void confirm()}
                  >
                    {t('Mandar o teste')}
                  </button>
                  <button
                    type="button"
                    className="settings-button"
                    disabled={busy !== null}
                    onClick={() => setLink(null)}
                  >
                    {t('Fechar')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {status.paired && !link && (
        <div className="settings-row phone-buttons">
          <button
            type="button"
            className="settings-button"
            disabled={busy !== null}
            onClick={() => void showLink()}
          >
            {t('Mostrar o QR code')}
          </button>
          <button
            type="button"
            className="settings-button phone-unpair"
            disabled={busy !== null}
            onClick={() => void other(() => window.wisp.phone.unpair())}
          >
            {t('Desparear')}
          </button>
        </div>
      )}
      {status.paired === null && (
        <small className="settings-hint">
          {t('Não consegui consultar o chaveiro do sistema (Secret Service).')}
        </small>
      )}
      {message && (
        <small
          className={`phone-message ${message.ok ? 'settings-hint' : 'settings-error'}`}
          role="status"
        >
          {message.text}
        </small>
      )}
    </div>
  )
}
