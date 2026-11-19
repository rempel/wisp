// O Telegram nas configurações (Fase 85): a ficha do bot (vai para o chaveiro), o pareamento com
// o seu usuário (um código que você manda ao bot), ligar e desligar e como responder.
import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Row, Section, Toggle } from './SettingsFields'
import type { Settings, TelegramStatus } from '../../shared/ipc'
import { t } from '../../shared/i18n'

const REPLIES: Record<TelegramStatus['voiceReply'], () => string> = {
  text: () => t('Sempre em texto'),
  audio: () => t('Em áudio quando você manda áudio'),
  both: () => t('Em texto e em áudio')
}

export function TelegramSection({
  save
}: {
  save: (patch: Partial<Settings>) => Promise<boolean>
}): JSX.Element {
  const [status, setStatus] = useState<TelegramStatus | null>(null)
  const [token, setToken] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = async (): Promise<TelegramStatus | null> => {
    const next = await window.wisp.telegram.status()
    setStatus(next)
    return next
  }
  useEffect(() => {
    let alive = true
    void window.wisp.telegram.status().then((next) => {
      if (alive) setStatus(next)
    })
    return () => {
      alive = false
    }
  }, [])
  // Esperando você mandar o código ao bot: confere de vez em quando.
  useEffect(() => {
    if (!code) return
    const timer = setInterval(() => {
      void load().then((next) => {
        if (next?.user) setCode(null)
      })
    }, 2000)
    return () => clearInterval(timer)
  }, [code])

  const saveToken = async (): Promise<void> => {
    const result = await window.wisp.telegram.token(token)
    setMessage({ ok: result.ok, text: result.message })
    if (result.ok) setToken('')
    await load()
  }
  const forget = async (): Promise<void> => {
    await window.wisp.telegram.forget()
    setCode(null)
    setMessage(null)
    await load()
  }

  return (
    <Section title="Telegram">
      <p className="settings-hint">
        {t(
          'Fale com o Wisp de qualquer lugar, por um bot seu do Telegram. Crie o bot no @BotFather e cole a ficha dele aqui (ela vai para o chaveiro do sistema). As mensagens passam pelos servidores do Telegram; o Wisp só faz conexões de saída e só atende o seu usuário. Funciona com o computador ligado.'
        )}
      </p>
      {message && (
        <p className={message.ok ? 'settings-hint' : 'settings-error'} role="status">
          {message.text}
        </p>
      )}
      {status && !status.hasToken && (
        <Row label={t('Ficha do bot')} hint={t('O @BotFather a mostra ao criar o bot.')}>
          <div className="telegram-token">
            <input
              type="password"
              value={token}
              autoComplete="off"
              spellCheck={false}
              placeholder="123456789:ABC…"
              onChange={(event) => setToken(event.target.value)}
            />
            <button
              type="button"
              className="settings-button"
              disabled={!token.trim()}
              onClick={() => void saveToken()}
            >
              {t('Guardar')}
            </button>
          </div>
        </Row>
      )}
      {status?.hasToken && (
        <>
          <p className="settings-hint">
            {status.botName ? t('Bot: {name}.', { name: status.botName }) : t('Bot guardado.')}{' '}
            {status.user
              ? t('Pareado com {user}.', { user: status.user })
              : t('Ainda sem o seu usuário.')}
          </p>
          {!status.user &&
            (code ? (
              <p className="telegram-code" role="status">
                {t('Mande este código para o seu bot no Telegram (vale 10 minutos):')}{' '}
                <strong>{code}</strong>
              </p>
            ) : (
              <button
                type="button"
                className="settings-button"
                onClick={() => void window.wisp.telegram.pair().then(setCode)}
              >
                {t('Parear o meu usuário')}
              </button>
            ))}
          {status.user && (
            <>
              <Toggle
                label={t('Ligado')}
                checked={status.enabled}
                onChange={(telegram) => void save({ telegram }).then(() => load())}
              />
              <Row label={t('Respostas')}>
                <select
                  value={status.voiceReply}
                  onChange={(event) =>
                    void save({
                      telegramVoiceReply: event.target.value as TelegramStatus['voiceReply']
                    }).then(() => load())
                  }
                >
                  {(Object.keys(REPLIES) as TelegramStatus['voiceReply'][]).map((key) => (
                    <option key={key} value={key}>
                      {REPLIES[key]()}
                    </option>
                  ))}
                </select>
              </Row>
            </>
          )}
          <div className="rewind-actions">
            <button type="button" className="link" onClick={() => void forget()}>
              {t('Esquecer o bot')}
            </button>
          </div>
        </>
      )}
    </Section>
  )
}
