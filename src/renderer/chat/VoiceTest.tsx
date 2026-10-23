import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { VoiceTestResult } from '../../shared/ipc'
import { t, dateLocale } from '../../shared/i18n'

type Phase = 'idle' | 'recording' | 'transcribing'

/** "3,0", "0,4": uma casa decimal, com vírgula. */
const decimal = (n: number): string =>
  n.toLocaleString(dateLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/**
 * O "Testar voz" das configurações: grava 3 s, transcreve e mostra o que o whisper.cpp entendeu,
 * quão alto o som chegou e quanto demorou. Nada vai para a conversa.
 */
export function VoiceTest(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [level, setLevel] = useState(0)
  const [result, setResult] = useState<VoiceTestResult | null>(null)

  useEffect(() => {
    if (phase === 'idle') return
    const offLevel = window.wisp.voice.onLevel(setLevel)
    const offStatus = window.wisp.voice.onStatus((status) => {
      if (status.source === 'test' || status.state === 'transcribing') {
        setPhase(status.state === 'transcribing' ? 'transcribing' : 'recording')
      }
    })
    return () => {
      offLevel()
      offStatus()
    }
  }, [phase])

  const run = async (): Promise<void> => {
    setResult(null)
    setLevel(0)
    setPhase('recording')
    try {
      setResult(
        (await window.wisp.voice.test()) ?? {
          ok: false,
          text: '',
          error: t('A voz não está disponível agora.')
        }
      )
    } finally {
      setPhase('idle')
    }
  }

  return (
    <div className="voice-test">
      <div className="voice-test-head">
        <button
          type="button"
          className="settings-button"
          disabled={phase !== 'idle'}
          onClick={() => void run()}
        >
          {phase === 'idle'
            ? t('Testar voz')
            : phase === 'recording'
              ? t('Gravando…')
              : t('Entendendo…')}
        </button>
        {phase === 'recording' && (
          <>
            <span className="settings-hint">{t('Fale algo por 3 s')}</span>
            <span className="voice-test-meter" aria-hidden="true">
              <span style={{ width: `${Math.round(level * 100)}%` }} />
            </span>
          </>
        )}
        {phase === 'idle' && !result && (
          <span className="settings-hint">{t('Grava 3 s e mostra o que eu entendi.')}</span>
        )}
      </div>
      {result && (
        <div className={`voice-test-result${result.ok ? '' : ' failed'}`} role="status">
          {result.ok ? (
            <p className="voice-test-text">
              {result.text ? `“${result.text}”` : <em>{t('Nada entendido.')}</em>}
            </p>
          ) : (
            <p className="voice-test-text">{result.error}</p>
          )}
          {result.seconds !== undefined && (
            <p className="settings-hint">
              {decimal(result.seconds)} {t('s gravados, pico de')} {result.peakDb} dB
              {result.ms !== undefined &&
                t(', transcritos em {v1} s', { v1: decimal(result.ms / 1000) })}
            </p>
          )}
          {result.hint && <p className="voice-test-hint">{result.hint}</p>}
        </div>
      )}
    </div>
  )
}
