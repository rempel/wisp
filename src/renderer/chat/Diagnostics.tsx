import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import type {
  DiagnosticAction,
  DiagnosticCheck,
  DiagnosticsSnapshot,
  DiagnosticStatus
} from '../../shared/ipc'
import { Avatar } from './icons'
import { Markdown } from './Markdown'
import { t } from '../../shared/i18n'

// O diagnóstico e os primeiros passos (Fase 20): as mesmas conferências, numa lista (para
// conferir a qualquer hora e copiar o relatório para uma issue) ou uma de cada vez, na primeira
// vez que o Wisp abre.

const STATUS_TEXT: Record<DiagnosticStatus, string> = {
  ok: t('Tudo certo'),
  warn: t('Atenção'),
  error: t('Falta'),
  off: t('Desligado')
}

const STATUS_ICON: Record<DiagnosticStatus, string> = { ok: '✓', warn: '!', error: '✕', off: '–' }

const ACTION_LABEL: Record<DiagnosticAction, string> = {
  terminal: t('Abrir um terminal'),
  demo: t('Ligar a demonstração'),
  settings: t('Abrir as configurações'),
  release: t('Ver a versão nova'),
  update: t('Atualizar'),
  restart: t('Reiniciar o Wisp')
}

/** As conferências de agora; `run` confere de novo. */
function useChecks(): {
  snapshot: DiagnosticsSnapshot | null
  running: boolean
  run: () => Promise<void>
} {
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null)
  const [running, setRunning] = useState(true)
  const run = useCallback(async (): Promise<void> => {
    setRunning(true)
    try {
      setSnapshot(await window.wisp.diagnostics.run())
    } finally {
      setRunning(false)
    }
  }, [])
  // A primeira conferência, ao abrir a tela.
  useEffect(() => {
    let alive = true
    void window.wisp.diagnostics.run().then((value) => {
      if (!alive) return
      setSnapshot(value)
      setRunning(false)
    })
    return () => {
      alive = false
    }
  }, [])
  return { snapshot, running, run }
}

/** O selo de uma conferência. */
function StatusBadge({ status }: { status: DiagnosticStatus }): JSX.Element {
  return (
    <span className={`diag-badge diag-${status}`}>
      <span aria-hidden>{STATUS_ICON[status]}</span> {STATUS_TEXT[status]}
    </span>
  )
}

/** O que fazer e o botão de uma conferência. */
function CheckBody({
  check,
  onSettings,
  onDone
}: {
  check: DiagnosticCheck
  onSettings: () => void
  onDone: () => void
}): JSX.Element {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const act = async (action: DiagnosticAction): Promise<void> => {
    if (action === 'settings') return onSettings()
    setBusy(true)
    if (action === 'update')
      setMessage({ ok: true, text: t('Baixando e conferindo a assinatura…') })
    const result = await window.wisp.diagnostics.action(action)
    setBusy(false)
    setMessage(
      result.ok
        ? result.message
          ? { ok: true, text: result.message }
          : null
        : { ok: false, text: result.message }
    )
    onDone()
  }
  return (
    <>
      <div className="diag-detail">
        <Markdown text={check.detail} />
      </div>
      {check.fix && check.status !== 'ok' && (
        <div className="diag-fix">
          <Markdown text={check.fix} />
        </div>
      )}
      {check.action && check.status !== 'ok' && (
        <button
          type="button"
          className="settings-button diag-action"
          disabled={busy}
          onClick={() => void act(check.action!)}
        >
          {ACTION_LABEL[check.action]}
        </button>
      )}
      {message && (
        <small className={message.ok ? 'settings-hint' : 'settings-error'} role="status">
          <Markdown text={message.text} />
        </small>
      )}
    </>
  )
}

/** A tela de diagnóstico: todas as conferências, o relatório e a issue. */
export function DiagnosticsView({ onSettings }: { onSettings: () => void }): JSX.Element {
  const { snapshot, running, run } = useChecks()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <div className="settings diagnostics">
      <div className="settings-scroll">
        <p className="settings-hint diag-intro">
          {t(
            'O que o Wisp precisa e o que está ligado. O relatório leva só versões, o desktop e o resultado de cada conferência: nenhum caminho, comando, nome ou conversa.'
          )}
        </p>
        {!snapshot ? (
          <p className="settings-hint">{t('Conferindo…')}</p>
        ) : (
          <ul className="diag-list">
            {snapshot.checks.map((check) => (
              <li
                key={check.id}
                className={`diag-item diag-item-${check.status}`}
                data-check={check.id}
              >
                <div className="diag-head">
                  <strong>{check.title}</strong>
                  <StatusBadge status={check.status} />
                </div>
                <CheckBody check={check} onSettings={onSettings} onDone={() => void run()} />
              </li>
            ))}
          </ul>
        )}
        <div className="diag-buttons">
          <button
            type="button"
            className="settings-button"
            disabled={running}
            onClick={() => void run()}
          >
            {running ? t('Conferindo…') : t('Conferir de novo')}
          </button>
          <button
            type="button"
            className="settings-button diag-copy"
            disabled={!snapshot}
            onClick={() => {
              window.wisp.diagnostics.copy()
              setCopied(true)
            }}
          >
            {copied ? t('Copiado') : t('Copiar o relatório')}
          </button>
          <button
            type="button"
            className="settings-button"
            disabled={!snapshot}
            onClick={() => window.wisp.diagnostics.issue()}
          >
            {t('Abrir uma issue')}
          </button>
        </div>
        {snapshot && (
          <details className="diag-report">
            <summary>{t('O que vai no relatório')}</summary>
            <pre>{snapshot.report}</pre>
          </details>
        )}
      </div>
    </div>
  )
}

/** Os passos, na ordem: o essencial primeiro, o opcional depois. */
const STEPS: DiagnosticCheck['id'][] = ['claude', 'login', 'shortcut', 'tray', 'keyring', 'voice']

/** Os primeiros passos: uma conferência por vez, com o que fazer em cada uma. */
export function WelcomeView({
  onDone,
  onSettings
}: {
  onDone: () => void
  onSettings: () => void
}): JSX.Element {
  const { snapshot, running, run } = useChecks()
  const [step, setStep] = useState(0)
  const checks = STEPS.map((id) => snapshot?.checks.find((check) => check.id === id)).filter(
    (check): check is DiagnosticCheck => check !== undefined
  )
  // A apresentação, os passos e o fim.
  const total = checks.length + 2
  const last = step === total - 1
  const current = step > 0 && !last ? checks[step - 1] : null
  const missing = snapshot?.checks.find((check) => check.id === 'claude')?.status === 'error'

  const finish = (): void => {
    window.wisp.diagnostics.welcomeDone()
    onDone()
  }

  return (
    <div className="settings welcome">
      <div className="settings-scroll">
        <div
          className="welcome-progress"
          aria-label={t('Passo {v1} de {total}', { v1: step + 1, total })}
        >
          {Array.from({ length: total }, (_, index) => (
            <span key={index} className={index <= step ? 'done' : ''} />
          ))}
        </div>
        {step === 0 && (
          <div className="welcome-step welcome-hello">
            <Avatar size={72} />
            <h2>{t('Oi! Eu sou o Wisp.')}</h2>
            <p>
              {t(
                'Um assistente de mesa que conversa com você e faz coisas no computador, sempre pedindo licença antes. Quem pensa por trás de mim é o Claude Code, com a sua assinatura.'
              )}
            </p>
            <p>{t('Vou conferir umas coisas, uma de cada vez. Leva um minuto.')}</p>
          </div>
        )}
        {current && (
          <div className={`welcome-step diag-item-${current.status}`} data-check={current.id}>
            <div className="diag-head">
              <h2>
                {current.title}
                {current.optional && <span className="welcome-optional"> {t('(opcional)')}</span>}
              </h2>
              <StatusBadge status={current.status} />
            </div>
            <CheckBody check={current} onSettings={onSettings} onDone={() => void run()} />
            {current.status !== 'ok' && (
              <button type="button" className="link" disabled={running} onClick={() => void run()}>
                {running ? t('Conferindo…') : t('Conferir de novo')}
              </button>
            )}
          </div>
        )}
        {last && (
          <div className="welcome-step welcome-end">
            <h2>{missing ? t('Quase lá') : t('Tudo pronto')}</h2>
            {missing ? (
              <p>
                {t(
                  'Sem o Claude Code, eu não consigo conversar de verdade. Instale-o (o passo 2 diz como) ou veja como eu funciono no'
                )}{' '}
                <strong>{t('modo demonstração')}</strong>
                {t(', com respostas gravadas.')}
              </p>
            ) : (
              <p>{t('Pode me chamar quando quiser:')}</p>
            )}
            <ul>
              <li>
                <strong>{t('Ctrl+Alt+W')}</strong>{' '}
                {t('(ou um clique em mim) abre e fecha o painel.')}
              </li>
              <li>
                {t('O')} <strong>{t('botão direito em mim')}</strong>{' '}
                {t('tem o menu: o avatar, a ilha, os sons.')}
              </li>
              <li>
                {t(
                  'Nada que muda o computador roda sem um clique seu: cada pedido vira um card com'
                )}{' '}
                <strong>{t('Permitir')}</strong> {t('e')} <strong>{t('Negar')}</strong>.
              </li>
              <li>
                {t('O')} <strong>{t('Diagnóstico')}</strong>
                {t(', nas configurações, confere tudo isto de novo.')}
              </li>
            </ul>
            {missing && (
              <button
                type="button"
                className="settings-button"
                onClick={() => void window.wisp.diagnostics.action('demo').then(finish)}
              >
                {t('Ligar a demonstração')}
              </button>
            )}
          </div>
        )}
        <div className="welcome-nav">
          {step > 0 && (
            <button type="button" className="settings-button" onClick={() => setStep(step - 1)}>
              {t('Voltar')}
            </button>
          )}
          {!last ? (
            <button
              type="button"
              className="settings-button primary welcome-next"
              disabled={!snapshot}
              onClick={() => setStep(step + 1)}
            >
              {step === 0 ? t('Começar') : t('Próximo')}
            </button>
          ) : (
            <button
              type="button"
              className="settings-button primary welcome-finish"
              onClick={finish}
            >
              {t('Concluir')}
            </button>
          )}
          {!last && (
            <button type="button" className="link welcome-skip" onClick={finish}>
              {t('Pular a apresentação')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
