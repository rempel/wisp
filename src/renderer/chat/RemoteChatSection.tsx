// Conversar pelo celular na rede local (Fase 54), nas configurações: ligar (com o aviso de que é
// sem criptografia, numa rede sua), o QR com o código de uso único e esquecer os celulares.
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { QrCode } from './QrCode'
import type { RemoteChatState } from '../../shared/ipc'
import { t } from '../../shared/i18n'

export function RemoteChatSection({
  enabled,
  onToggle
}: {
  enabled: boolean
  onToggle: (on: boolean) => void
}): JSX.Element {
  const [state, setState] = useState<RemoteChatState | null>(null)
  useEffect(() => {
    let alive = true
    const read = (): void => {
      void window.wisp.remoteChat.state().then((next) => alive && setState(next))
    }
    read()
    // O código do QR vence em 10 minutos: a tela relê de minuto em minuto.
    const timer = window.setInterval(read, 60_000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [enabled])

  return (
    <div className="remote-chat">
      <label className="settings-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onToggle(event.target.checked)}
        />
        {t('Conversar pelo celular, na rede local')}
      </label>
      <small className="settings-hint">
        {t(
          'Uma página no celular com o que o painel tem: as conversas, o modelo e o modo, os cards de permissão, fotos, o histórico e conversas novas. Só na rede da sua casa (Wi-Fi ou cabo), sem criptografia: ligue só numa rede sua, porque um celular pareado aprova o que o Claude pede.'
        )}
      </small>
      {enabled && state?.error && (
        <small className="settings-error" role="alert">
          {state.error}
        </small>
      )}
      {enabled && state?.link && (
        <div className="remote-chat-pair">
          <QrCode text={state.link} />
          <div>
            <p className="settings-hint">
              {t(
                'Aponte a câmera do celular para o QR (ou abra o endereço no navegador dele). O código vale uma vez, por 10 minutos.'
              )}
            </p>
            <code className="remote-chat-link">{state.link.replace(/#.*/, '')}</code>
            <p className="settings-hint">
              {state.devices === 1
                ? t('1 celular pareado.')
                : t('{count} celulares pareados.', { count: state.devices })}
            </p>
            {state.devices > 0 && (
              <button
                type="button"
                className="settings-button"
                onClick={() => void window.wisp.remoteChat.forget().then(setState)}
              >
                {t('Esquecer os celulares')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
